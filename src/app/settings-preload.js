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
  // Usage
  getToolUsage: () => ipcRenderer.sendSync('get-tool-usage'),
  getToolEvents: () => ipcRenderer.sendSync('get-tool-events'),
  getAllUsageEvents: () => ipcRenderer.invoke('get-all-usage-events'),
  getFileActivity: (projectPath) => ipcRenderer.invoke('get-file-activity', projectPath),
  openUsageReport: (contents) => ipcRenderer.invoke('open-usage-report', contents),
  // Marketplace
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  getMarketplaceCatalog: () => ipcRenderer.invoke('get-marketplace-catalog'),
  purchasePet: (petId, buyerEmail) => ipcRenderer.invoke('purchase-pet', { petId, buyerEmail }),
  pollPaymentStatus: (token) => ipcRenderer.invoke('poll-payment-status', token),
  getBuyerEmail: () => ipcRenderer.sendSync('get-buyer-email'),
  setBuyerEmail: (email) => ipcRenderer.invoke('set-buyer-email', email),
  // Animation preview collapse state
  getAnimationPreviewCollapsed: () => ipcRenderer.sendSync('get-animation-preview-collapsed'),
  setAnimationPreviewCollapsed: (value) => ipcRenderer.invoke('set-animation-preview-collapsed', value),
  // About
  getVersion: () => ipcRenderer.sendSync('get-version'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
