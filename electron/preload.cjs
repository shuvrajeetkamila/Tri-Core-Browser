'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('triCore', Object.freeze({
  navigate: (slot, url) => ipcRenderer.invoke('browser:navigate', { slot, url }),
  action: (slot, action) => ipcRenderer.invoke('browser:action', { slot, action }),
  getStates: () => ipcRenderer.invoke('browser:get-states'),
  setLayout: (bounds) => ipcRenderer.send('browser:set-layout', bounds),
  onActive: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, slot) => callback(slot);
    ipcRenderer.on('browser:active', listener);
    return () => ipcRenderer.removeListener('browser:active', listener);
  },
  onShortcut: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, shortcut) => callback(shortcut);
    ipcRenderer.on('browser:shortcut', listener);
    return () => ipcRenderer.removeListener('browser:shortcut', listener);
  },
  onState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('browser:state', listener);
    return () => ipcRenderer.removeListener('browser:state', listener);
  },
}));
