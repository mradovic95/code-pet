'use strict';

const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const logger = require('./logger');
const { focusTerminal } = require('./terminal-focus');

const PET_SLOT_HEIGHT = 100; // px per pet: 64 sprite + 16 label + 20 padding
const PET_WINDOW_WIDTH = 120; // wider than 96 to fit labels
const WINDOW_MARGIN = 16;
const MAX_VISIBLE_PETS = 8;

let overlayWindow = null;
let settingsWindow = null;
let rendererReady = false;
let eventQueue = [];
// Will be set by event-server after it initializes
let getProjectsSnapshotFn = null;
let getClaudePidFn = null;
let getTtyFn = null;
let dispatchEventFn = null;
let catalogFn = null;
let setPetTypeForProjectFn = null;
let currentSettingsProject = null;
// Marketplace references
let licenseManagerRef = null;
let premiumStoreRef = null;
let marketplaceCatalogRef = null;
let licenseApiRef = null;
let catalogObjRef = null; // The PetCatalog instance for re-scanning

ipcMain.on('set-ignore-mouse-events', (_event, ignore) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (ignore) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  }
});

ipcMain.on('open-settings', (_event, project) => {
  currentSettingsProject = project || null;
  createSettingsWindow();
});

ipcMain.on('focus-terminal', (_event, project) => {
  if (!getClaudePidFn) {
    logger.warn('focus-terminal: no PID lookup function set');
    return;
  }
  const pid = getClaudePidFn(project);
  if (pid) {
    const projectDirName = project ? path.basename(project) : null;
    const storedTty = getTtyFn ? getTtyFn(project) : null;
    focusTerminal(pid, projectDirName, project, storedTty);
  } else {
    logger.info(`focus-terminal: no claudePid for project ${project}`);
  }
});

ipcMain.on('close-settings', () => {
  closeSettingsWindow();
});

ipcMain.on('dismiss-project', () => {
  if (currentSettingsProject && dispatchEventFn) {
    const projectName = path.basename(currentSettingsProject);
    dispatchEventFn(currentSettingsProject, projectName, 'falling_asleep');
    logger.info(`Dismissed pet for project: ${currentSettingsProject}`);
  }
  closeSettingsWindow();
});

ipcMain.on('get-pet-catalog', (event) => {
  event.returnValue = catalogFn ? catalogFn() : [];
});

ipcMain.on('get-current-pet-type', (event) => {
  const settingsStore = require('./settings-store');
  event.returnValue = currentSettingsProject
    ? settingsStore.getPetTypeForProject(currentSettingsProject)
    : settingsStore.getDefaultPetType();
});

ipcMain.on('get-settings-project', (event) => {
  event.returnValue = currentSettingsProject;
});

ipcMain.on('get-sound-enabled', (event) => {
  const settingsStore = require('./settings-store');
  event.returnValue = settingsStore.getSoundEnabled();
});

ipcMain.on('set-sound-enabled-for-state', (_event, { state, enabled }) => {
  const settingsStore = require('./settings-store');
  settingsStore.setSoundEnabledForState(state, enabled);
  sendToRenderer('sound-setting-changed', { settings: settingsStore.getSoundEnabled() });
  logger.info(`Sound for ${state}: ${enabled ? 'enabled' : 'disabled'}`);
});

ipcMain.on('set-pet-type', (_event, petType) => {
  const settingsStore = require('./settings-store');
  if (currentSettingsProject) {
    settingsStore.setPetTypeForProject(currentSettingsProject, petType);
    if (setPetTypeForProjectFn) {
      setPetTypeForProjectFn(currentSettingsProject, petType);
    }
    sendToRenderer('pet-type-changed', { project: currentSettingsProject, petType });
  } else {
    settingsStore.setDefaultPetType(petType);
  }
  logger.info(`Pet type changed to "${petType}" for ${currentSettingsProject || 'default'}`);
});

// --- Marketplace IPC handlers ---

ipcMain.handle('get-marketplace-catalog', async () => {
  if (!marketplaceCatalogRef) return [];
  try {
    return await marketplaceCatalogRef.getCatalog();
  } catch (err) {
    logger.warn(`Failed to get marketplace catalog: ${err.message}`);
    return [];
  }
});

ipcMain.handle('get-license-status', async () => {
  if (!licenseManagerRef) return { hasLicense: false, ownedPets: [] };
  return licenseManagerRef.getStatus();
});

ipcMain.handle('activate-license', async (_event, key) => {
  if (!licenseManagerRef || !premiumStoreRef) {
    return { success: false, error: 'License system not initialized' };
  }

  const result = await licenseManagerRef.activate(key);
  if (!result.success) return result;

  // Download sprites for newly owned pets
  const PetCatalog = require('./pet-catalog');
  for (const petId of result.ownedPets) {
    if (!premiumStoreRef.isDownloaded(petId)) {
      try {
        await premiumStoreRef.download(petId, key);
        logger.info(`Downloaded premium pet "${petId}" after activation`);
      } catch (err) {
        logger.warn(`Failed to download premium pet "${petId}": ${err.message}`);
      }
    }

    // Load and send sprites to renderer
    const sprites = premiumStoreRef.loadSprites(petId, key);
    if (sprites) {
      sendToRenderer('premium-sprites', { petId, sprites });
    }
  }

  // Re-scan premium pets so the catalog picks up the new pet
  if (catalogObjRef && premiumStoreRef) {
    catalogObjRef.scanPremium(premiumStoreRef.getPremiumDir());
    // Update renderer catalog
    if (catalogFn) {
      sendToRenderer('pet-catalog', catalogFn());
    }
  }

  return result;
});

ipcMain.handle('purchase-pet', async (_event, petId) => {
  if (!licenseApiRef) {
    return { success: false, error: 'License system not initialized' };
  }

  try {
    const result = await licenseApiRef.purchase(petId);
    logger.info(`Mock purchase completed for "${petId}": key=${result.licenseKey}`);
    return result;
  } catch (err) {
    logger.warn(`Purchase failed for "${petId}": ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-premium-sprites', async (_event, petId) => {
  if (!premiumStoreRef || !licenseManagerRef) return null;

  const key = licenseManagerRef.getLicenseKey();
  if (!key || !premiumStoreRef.isDownloaded(petId)) return null;

  return premiumStoreRef.loadSprites(petId, key);
});

ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  logger.info('Renderer signaled ready');
  // Flush queued events
  for (const { channel, data } of eventQueue) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(channel, data);
      logger.info(`Flushed queued event: ${channel} → ${JSON.stringify(data)}`);
    }
  }
  eventQueue = [];
  // Send pet catalog before project snapshot
  if (catalogFn) {
    overlayWindow.webContents.send('pet-catalog', catalogFn());
    logger.info('Sent pet-catalog to renderer');
  }
  // Send sound setting
  const settingsStore = require('./settings-store');
  overlayWindow.webContents.send('sound-setting-changed', { settings: settingsStore.getSoundEnabled() });
  // Send current project snapshot for renderer reload recovery
  if (getProjectsSnapshotFn) {
    const snapshot = getProjectsSnapshotFn();
    if (Object.keys(snapshot).length > 0) {
      overlayWindow.webContents.send('pet-init', snapshot);
      logger.info(`Sent pet-init with ${Object.keys(snapshot).length} projects`);
    }
  }
});

function createOverlayWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  overlayWindow = new BrowserWindow({
    width: PET_WINDOW_WIDTH,
    height: PET_SLOT_HEIGHT,
    x: workArea.x + workArea.width - PET_WINDOW_WIDTH - WINDOW_MARGIN,
    y: workArea.y + workArea.height - PET_SLOT_HEIGHT - WINDOW_MARGIN,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (process.platform === 'darwin') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Keep always on top with highest level
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    logger.info('Overlay window shown');
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    rendererReady = false;
    eventQueue = [];
  });

  logger.info(`Overlay window created at (${workArea.x + workArea.width - PET_WINDOW_WIDTH - WINDOW_MARGIN}, ${workArea.y + workArea.height - PET_SLOT_HEIGHT - WINDOW_MARGIN})`);

  return overlayWindow;
}

function resizeForPetCount(count) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const visible = Math.min(count, MAX_VISIBLE_PETS);
  const newHeight = PET_SLOT_HEIGHT * Math.max(visible, 1);
  const { workArea } = screen.getPrimaryDisplay();
  overlayWindow.setBounds({
    x: workArea.x + workArea.width - PET_WINDOW_WIDTH - WINDOW_MARGIN,
    y: workArea.y + workArea.height - newHeight - WINDOW_MARGIN,
    width: PET_WINDOW_WIDTH,
    height: newHeight,
  });
  logger.info(`Resized overlay for ${count} pets (${PET_WINDOW_WIDTH}x${newHeight})`);
}

function sendToRenderer(channel, data) {
  if (rendererReady && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, data);
  } else {
    eventQueue.push({ channel, data });
    logger.info(`Queued event (renderer not ready): ${channel} → ${JSON.stringify(data).slice(0, 200)}`);
  }
}

function isRendererReady() {
  return rendererReady;
}

function setProjectsSnapshotFn(fn) {
  getProjectsSnapshotFn = fn;
}

function setClaudePidFn(fn) {
  getClaudePidFn = fn;
}

function setTtyFn(fn) {
  getTtyFn = fn;
}

function setDispatchEventFn(fn) {
  dispatchEventFn = fn;
}

function setCatalogFn(fn) {
  catalogFn = fn;
}

function setUpdatePetTypeFn(fn) {
  setPetTypeForProjectFn = fn;
}

function setCatalogObj(obj) {
  catalogObjRef = obj;
}

function setLicenseManagerFn(lm) {
  licenseManagerRef = lm;
}

function setPremiumStoreFn(ps) {
  premiumStoreRef = ps;
}

function setMarketplaceCatalogFn(mc) {
  marketplaceCatalogRef = mc;
}

function setLicenseApiFn(api) {
  licenseApiRef = api;
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const overlayBounds = overlayWindow ? overlayWindow.getBounds() : null;
  const settingsWidth = 320;
  const settingsHeight = 520;

  let x, y;
  if (overlayBounds) {
    x = overlayBounds.x - settingsWidth - 16;
    y = overlayBounds.y + overlayBounds.height - settingsHeight;
  } else {
    const { workArea } = screen.getPrimaryDisplay();
    x = workArea.x + workArea.width - settingsWidth - 128;
    y = workArea.y + workArea.height - settingsHeight - 16;
  }

  settingsWindow = new BrowserWindow({
    width: settingsWidth,
    height: settingsHeight,
    x,
    y,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: true,
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.setAlwaysOnTop(true, 'floating');

  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  logger.info('Settings window created');
  return settingsWindow;
}

function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
    settingsWindow = null;
  }
}

module.exports = {
  createOverlayWindow,
  sendToRenderer,
  isRendererReady,
  resizeForPetCount,
  setProjectsSnapshotFn,
  setClaudePidFn,
  setTtyFn,
  setDispatchEventFn,
  setCatalogFn,
  setUpdatePetTypeFn,
  setCatalogObj,
  setLicenseManagerFn,
  setPremiumStoreFn,
  setMarketplaceCatalogFn,
  setLicenseApiFn,
  closeSettingsWindow,
};
