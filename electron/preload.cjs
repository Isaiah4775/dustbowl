const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dustbowlLive', {
  start: () => ipcRenderer.invoke('live:start'),
  stop: () => ipcRenderer.invoke('live:stop'),
  status: () => ipcRenderer.invoke('live:status'),
  onOpenPanel: (callback) => {
    ipcRenderer.on('live:panel', () => callback());
  },
});
