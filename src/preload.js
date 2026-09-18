const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudePet', {
  onState: (cb) => ipcRenderer.on('pet:state', (_e, s) => cb(s)),
  onInfo: (cb) => ipcRenderer.on('pet:info', (_e, i) => cb(i)),
  onClickThrough: (cb) => ipcRenderer.on('pet:click-through', (_e, v) => cb(v)),
  onScale: (cb) => ipcRenderer.on('pet:scale', (_e, v) => cb(v)),
  onCharacter: (cb) => ipcRenderer.on('pet:character', (_e, v) => cb(v)),
  onLang: (cb) => ipcRenderer.on('pet:lang', (_e, v) => cb(v)),
  get: () => ipcRenderer.invoke('pet:get'),
  hide: () => ipcRenderer.invoke('pet:hide'),
  menu: () => ipcRenderer.invoke('pet:menu'),
});
