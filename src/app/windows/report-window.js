'use strict';

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const logger = require('../core/logger');

const REPORT_FORMATS = {
  html: { name: 'HTML report', extensions: ['html'] },
  md: { name: 'Markdown report', extensions: ['md'] },
};

let reportWindow = null;
// Pristine { html, md } strings held in main so saves never round-trip
// through the renderer (the preview toolbar can't leak into saved files).
let reportContents = null;

ipcMain.handle('open-usage-report', (_event, { html, md } = {}) => {
  if (typeof html !== 'string' || typeof md !== 'string') {
    return { opened: false, error: 'invalid report contents' };
  }
  reportContents = { html, md };
  try {
    if (reportWindow && !reportWindow.isDestroyed()) {
      // Reload re-runs the renderer's get-report-html pull with the fresh contents.
      reportWindow.webContents.reload();
      reportWindow.focus();
    } else {
      createReportWindow();
    }
    return { opened: true };
  } catch (err) {
    logger.warn(`open-usage-report handler failed: ${err.message}`);
    return { opened: false, error: err.message };
  }
});

ipcMain.handle('get-report-html', () => (reportContents ? reportContents.html : null));

ipcMain.handle('save-report', async (_event, format) => {
  const filter = REPORT_FORMATS[format];
  if (!filter || !reportContents) return { saved: false, error: 'no report for format' };
  try {
    const { dialog } = require('electron');
    const defaultPath = path.join(require('os').homedir(), `code-pet-skill-report.${format}`);
    const result = await dialog.showSaveDialog(reportWindow, { defaultPath, filters: [filter] });
    if (result.canceled || !result.filePath) return { saved: false, canceled: true };
    await require('fs/promises').writeFile(result.filePath, reportContents[format], 'utf8');
    return { saved: true, path: result.filePath };
  } catch (err) {
    logger.warn(`save-report handler failed: ${err.message}`);
    return { saved: false, error: err.message };
  }
});

function createReportWindow() {
  reportWindow = new BrowserWindow({
    width: 780,
    height: 820,
    resizable: true,
    // The toolbar and report content are always dark — keep the window shell
    // dark too, regardless of OS theme, to avoid a light flash on load.
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, 'report-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  reportWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'report-preview.html'));

  reportWindow.on('closed', () => {
    reportWindow = null;
    reportContents = null;
  });

  logger.info('Report window created');
  return reportWindow;
}

function closeReportWindow() {
  if (reportWindow && !reportWindow.isDestroyed()) {
    reportWindow.close();
    reportWindow = null;
  }
  reportContents = null;
}

module.exports = { closeReportWindow };
