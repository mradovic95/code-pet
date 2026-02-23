'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantDog', {
  onEvent: (callback) => {
    ipcRenderer.on('dog-event', (_event, eventName) => {
      callback(eventName);
    });
  },
  signalReady: () => ipcRenderer.send('renderer-ready'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  openSettings: () => ipcRenderer.send('open-settings'),
});
