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
let getToolUsageFn = null;
let getToolEventsFn = null;
let getAllUsageEventsFn = null;
let getSessionsForProjectFn = null;
let currentSettingsSessionKey = null;
let currentSettingsProjectPath = null;
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

ipcMain.on('open-settings', (_event, sessionKey) => {
  currentSettingsSessionKey = sessionKey || null;
  if (sessionKey) {
    const PetRegistry = require('./pet-registry');
    currentSettingsProjectPath = PetRegistry.parseSessionKey(sessionKey).projectPath;
  } else {
    currentSettingsProjectPath = null;
  }
  createSettingsWindow();
});

ipcMain.on('focus-terminal', (_event, sessionKey) => {
  if (!getClaudePidFn) {
    logger.warn('focus-terminal: no PID lookup function set');
    return;
  }
  const pid = getClaudePidFn(sessionKey);
  if (pid) {
    const PetRegistry = require('./pet-registry');
    const { projectPath } = PetRegistry.parseSessionKey(sessionKey);
    const projectDirName = projectPath ? path.basename(projectPath) : null;
    const storedTty = getTtyFn ? getTtyFn(sessionKey) : null;
    focusTerminal(pid, projectDirName, projectPath, storedTty);
  } else {
    logger.info(`focus-terminal: no claudePid for session ${sessionKey}`);
  }
});

ipcMain.on('close-settings', () => {
  closeSettingsWindow();
});

ipcMain.on('dismiss-project', () => {
  if (currentSettingsSessionKey && dispatchEventFn) {
    const projectName = currentSettingsProjectPath ? path.basename(currentSettingsProjectPath) : 'unknown';
    dispatchEventFn(currentSettingsSessionKey, currentSettingsProjectPath, projectName, 'dismiss');
    logger.info(`Dismissed pet for session: ${currentSettingsSessionKey}`);
  }
  closeSettingsWindow();
});

ipcMain.on('get-pet-catalog', (event) => {
  event.returnValue = catalogFn ? catalogFn() : [];
});

ipcMain.on('get-current-pet-type', (event) => {
  const settingsStore = require('./settings-store');
  event.returnValue = currentSettingsProjectPath
    ? settingsStore.getPetTypeForProject(currentSettingsProjectPath)
    : settingsStore.getDefaultPetType();
});

ipcMain.on('get-settings-project', (event) => {
  event.returnValue = currentSettingsSessionKey;
});

ipcMain.on('get-tool-usage', (event) => {
  if (getToolUsageFn && currentSettingsSessionKey) {
    event.returnValue = getToolUsageFn(currentSettingsSessionKey);
  } else {
    event.returnValue = { mcp: {}, skills: {} };
  }
});

ipcMain.on('get-tool-events', (event) => {
  if (getToolEventsFn && currentSettingsSessionKey) {
    event.returnValue = getToolEventsFn(currentSettingsSessionKey);
  } else {
    event.returnValue = [];
  }
});

ipcMain.handle('get-all-usage-events', async () => {
  if (!getAllUsageEventsFn) return [];
  try {
    return await getAllUsageEventsFn();
  } catch (err) {
    logger.warn(`get-all-usage-events handler failed: ${err.message}`);
    return [];
  }
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

ipcMain.on('get-version', (event) => {
  const pkg = require('../../package.json');
  event.returnValue = pkg.version;
});

ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) {
    const { shell } = require('electron');
    shell.openExternal(url);
  }
});

ipcMain.on('set-pet-type', (_event, petType) => {
  const settingsStore = require('./settings-store');
  if (currentSettingsProjectPath) {
    settingsStore.setPetTypeForProject(currentSettingsProjectPath, petType);
    if (setPetTypeForProjectFn) {
      setPetTypeForProjectFn(currentSettingsProjectPath, petType);
    }
    // Send pet-type-changed to ALL sessions for this project
    if (getSessionsForProjectFn) {
      const sessions = getSessionsForProjectFn(currentSettingsProjectPath);
      for (const sk of sessions) {
        sendToRenderer('pet-type-changed', { project: sk, petType });
      }
    } else {
      sendToRenderer('pet-type-changed', { project: currentSettingsSessionKey, petType });
    }
  } else {
    settingsStore.setDefaultPetType(petType);
  }
  logger.info(`Pet type changed to "${petType}" for ${currentSettingsProjectPath || 'default'}`);
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

  // Download newly owned pets into the shared pets folder
  for (const petId of result.ownedPets) {
    if (premiumStoreRef.isDownloaded(petId)) continue;
    try {
      const productId = licenseApiRef.getProductIdForPet ? licenseApiRef.getProductIdForPet(petId) : null;
      await premiumStoreRef.download(petId, key, licenseApiRef, productId);
      logger.info(`Downloaded premium pet "${petId}" after activation`);
    } catch (err) {
      logger.warn(`Failed to download premium pet "${petId}": ${err.message}`);
    }
  }

  // Re-scan the catalog so new pets appear in the selector
  if (catalogObjRef) {
    catalogObjRef.rescan();
    if (catalogFn) {
      sendToRenderer('pet-catalog', catalogFn());
    }
  }

  return result;
});

ipcMain.handle('purchase-pet', async (_event, arg) => {
  if (!licenseApiRef) {
    return { success: false, error: 'License system not initialized' };
  }

  const { petId, buyerEmail } = typeof arg === 'object' && arg !== null ? arg : { petId: arg };

  try {
    const result = await licenseApiRef.purchase(petId, buyerEmail);

    if (result.paymentUrl) {
      // Paid pet: open PayPal in browser
      const { shell } = require('electron');
      shell.openExternal(result.paymentUrl);
      logger.info(`Opened payment URL for "${petId}"`);
      return {
        success: true,
        paymentPending: true,
        paymentToken: result.paymentToken,
        purchaseId: result.purchaseId,
        licenseKey: null,
      };
    }

    // Free pet or mock: license key returned directly
    logger.info(`Purchase completed for "${petId}": key=${result.licenseKey}`);
    return result;
  } catch (err) {
    logger.warn(`Purchase failed for "${petId}": ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('poll-payment-status', async (_event, token) => {
  if (!licenseApiRef || !licenseApiRef.checkPaymentStatus) {
    return { completed: false, error: 'Not supported' };
  }
  return licenseApiRef.checkPaymentStatus(token);
});

ipcMain.on('get-buyer-email', (event) => {
  const settingsStore = require('./settings-store');
  event.returnValue = settingsStore.getBuyerEmail();
});

ipcMain.handle('set-buyer-email', async (_event, email) => {
  const settingsStore = require('./settings-store');
  return settingsStore.setBuyerEmail(email);
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
  } else if (process.platform === 'linux') {
    overlayWindow.setVisibleOnAllWorkspaces(true);
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

function setToolUsageFn(fn) {
  getToolUsageFn = fn;
}

function setToolEventsFn(fn) {
  getToolEventsFn = fn;
}

function setAllUsageEventsFn(fn) {
  getAllUsageEventsFn = fn;
}

function setSessionsForProjectFn(fn) {
  getSessionsForProjectFn = fn;
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
  const settingsWidth = 480;
  const settingsHeight = 680;

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
  setToolUsageFn,
  setToolEventsFn,
  setAllUsageEventsFn,
  setSessionsForProjectFn,
  closeSettingsWindow,
};
