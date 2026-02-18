'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantDog', {
  onEvent: (callback) => {
    ipcRenderer.on('dog-event', (_event, eventName) => {
      callback(eventName);
    });
  },
});
