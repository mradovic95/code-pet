'use strict';

const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const logger = require('./logger');

let overlayWindow = null;
let settingsWindow = null;
let rendererReady = false;
let eventQueue = [];

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

ipcMain.on('close-settings', () => {
  closeSettingsWindow();
});

ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  logger.info('Renderer signaled ready');
  for (const { channel, data } of eventQueue) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(channel, data);
      logger.info(`Flushed queued event: ${channel} → ${data}`);
    }
  }
  eventQueue = [];
});

function createOverlayWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  overlayWindow = new BrowserWindow({
    width: 96,
    height: 96,
    x: workArea.x + workArea.width - 96 - 16,
    y: workArea.y + workArea.height - 96 - 16,
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

  logger.info(`Overlay window created at (${workArea.x + workArea.width - 96 - 16}, ${workArea.y + workArea.height - 96 - 16})`);

  return overlayWindow;
}

function getWindow() {
  return overlayWindow;
}

function sendToRenderer(channel, data) {
  if (rendererReady && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, data);
  } else {
    eventQueue.push({ channel, data });
    logger.info(`Queued event (renderer not ready): ${channel} → ${data}`);
  }
}

function isRendererReady() {
  return rendererReady;
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

module.exports = { createOverlayWindow, getWindow, sendToRenderer, isRendererReady, closeSettingsWindow };
