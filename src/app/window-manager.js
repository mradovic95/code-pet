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

ipcMain.on('set-ignore-mouse-events', (_event, ignore) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (ignore) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  }
});

ipcMain.on('open-settings', () => {
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
    logger.info(`Queued event (renderer not ready): ${channel} → ${JSON.stringify(data)}`);
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

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const overlayBounds = overlayWindow ? overlayWindow.getBounds() : null;
  const settingsWidth = 320;
  const settingsHeight = 400;

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
  closeSettingsWindow,
};
