'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codePetReport', {
  getReportHtml: () => ipcRenderer.invoke('get-report-html'),
  saveReport: (format) => ipcRenderer.invoke('save-report', format),
});
