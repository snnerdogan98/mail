// Sayfaya (uygulamaya) masaüstü girişini açan küçük köprü
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mailDesktop', {
  version: process.versions.electron,
  getToken: () => ipcRenderer.invoke('auth:get'),
  login: (scopes, hint) => ipcRenderer.invoke('auth:login', scopes, hint),
  logout: () => ipcRenderer.invoke('auth:logout')
});
