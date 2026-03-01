'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codePet', {
  onPetEvent: (callback) => {
    ipcRenderer.on('pet-event', (_event, data) => callback(data));
  },
  onPetRemove: (callback) => {
    ipcRenderer.on('pet-remove', (_event, data) => callback(data));
  },
  onPetInit: (callback) => {
    ipcRenderer.on('pet-init', (_event, data) => callback(data));
  },
  onPetCatalog: (callback) => {
    ipcRenderer.on('pet-catalog', (_event, data) => callback(data));
  },
  onPetTypeChanged: (callback) => {
    ipcRenderer.on('pet-type-changed', (_event, data) => callback(data));
  },
  onPremiumSprites: (callback) => {
    ipcRenderer.on('premium-sprites', (_event, data) => callback(data));
  },
  onSoundSettingChanged: (callback) => {
    ipcRenderer.on('sound-setting-changed', (_event, data) => callback(data));
  },
  signalReady: () => ipcRenderer.send('renderer-ready'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  openSettings: (project) => ipcRenderer.send('open-settings', project),
  focusTerminal: (project) => ipcRenderer.send('focus-terminal', project),
});
