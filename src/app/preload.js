'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantDog', {
  onPetEvent: (callback) => {
    ipcRenderer.on('pet-event', (_event, data) => callback(data));
  },
  onPetRemove: (callback) => {
    ipcRenderer.on('pet-remove', (_event, data) => callback(data));
  },
  onPetInit: (callback) => {
    ipcRenderer.on('pet-init', (_event, data) => callback(data));
  },
  signalReady: () => ipcRenderer.send('renderer-ready'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  openSettings: () => ipcRenderer.send('open-settings'),
  focusTerminal: (project) => ipcRenderer.send('focus-terminal', project),
});
