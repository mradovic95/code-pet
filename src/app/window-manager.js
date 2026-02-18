'use strict';

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const logger = require('./logger');

let overlayWindow = null;

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
  });

  logger.info(`Overlay window created at (${workArea.x + workArea.width - 96 - 16}, ${workArea.y + workArea.height - 96 - 16})`);

  return overlayWindow;
}

function getWindow() {
  return overlayWindow;
}

module.exports = { createOverlayWindow, getWindow };
