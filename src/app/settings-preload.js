'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codePetSettings', {
  close: () => ipcRenderer.send('close-settings'),
  dismissProject: () => ipcRenderer.send('dismiss-project'),
});
