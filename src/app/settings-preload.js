'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codePetSettings', {
  close: () => ipcRenderer.send('close-settings'),
  dismissProject: () => ipcRenderer.send('dismiss-project'),
  getPetCatalog: () => ipcRenderer.sendSync('get-pet-catalog'),
  getCurrentPetType: () => ipcRenderer.sendSync('get-current-pet-type'),
  getProjectPath: () => ipcRenderer.sendSync('get-settings-project'),
  setPetType: (petType) => ipcRenderer.send('set-pet-type', petType),
  // Sound
  getSoundEnabled: () => ipcRenderer.sendSync('get-sound-enabled'),
  setSoundEnabledForState: (state, enabled) => ipcRenderer.send('set-sound-enabled-for-state', { state, enabled }),
  // Marketplace
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  getMarketplaceCatalog: () => ipcRenderer.invoke('get-marketplace-catalog'),
  purchasePet: (petId) => ipcRenderer.invoke('purchase-pet', petId),
});
