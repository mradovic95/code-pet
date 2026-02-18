'use strict';

const { app } = require('electron');
const { createOverlayWindow } = require('./window-manager');
const { startServer, stopServer } = require('./event-server');
const { writePid, removePid } = require('./process-manager');
const logger = require('./logger');

// Linux transparency support
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.commandLine.appendSwitch('disable-gpu');
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn('Another instance is already running, quitting');
  app.quit();
} else {
  app.on('ready', async () => {
    logger.info('App ready, starting up...');

    writePid(process.pid);

    try {
      await startServer();
    } catch (err) {
      logger.error(`Failed to start event server: ${err.message}`);
      app.quit();
      return;
    }

    createOverlayWindow();
    logger.info('Code Pet is running');
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', async () => {
    logger.info('Shutting down...');
    await stopServer();
    removePid();
  });
}
