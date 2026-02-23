'use strict';

const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const logger = require('./logger');

let overlayWindow = null;
let rendererReady = false;
let eventQueue = [];

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

module.exports = { createOverlayWindow, getWindow, sendToRenderer, isRendererReady };
