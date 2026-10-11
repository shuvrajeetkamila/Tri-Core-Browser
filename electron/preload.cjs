'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('triCore', Object.freeze({
  navigate: (slot, url) => ipcRenderer.invoke('browser:navigate', { slot, url }),
  action: (slot, action) => ipcRenderer.invoke('browser:action', { slot, action }),
  createTab: (slot, url) => ipcRenderer.invoke('browser:tab-create', { slot, url }),
  selectTab: (slot, tabId) => ipcRenderer.invoke('browser:tab-select', { slot, tabId }),
  closeTab: (slot, tabId) => ipcRenderer.invoke('browser:tab-close', { slot, tabId }),
  getStates: () => ipcRenderer.invoke('browser:get-states'),
  setLayout: (bounds) => ipcRenderer.send('browser:set-layout', bounds),
  getData: () => ipcRenderer.invoke('browser:get-data'),
  addBookmark: (payload) => ipcRenderer.invoke('browser:add-bookmark', payload),
  removeBookmark: (bookmarkId) => ipcRenderer.invoke('browser:remove-bookmark', bookmarkId),
  clearHistory: () => ipcRenderer.invoke('browser:clear-history'),
  setHome: (url) => ipcRenderer.invoke('browser:set-home', url),
  getDownloads: () => ipcRenderer.invoke('browser:get-downloads'),
  revealDownload: (downloadId) => ipcRenderer.invoke('browser:reveal-download', downloadId),
  getGraphicsInfo: () => ipcRenderer.invoke('browser:graphics-info'),
  onActive: (callback) => subscribe('browser:active', callback),
  onShortcut: (callback) => subscribe('browser:shortcut', callback),
  onState: (callback) => subscribe('browser:state', callback),
  onDownloads: (callback) => subscribe('browser:downloads', callback),
  onDataChanged: (callback) => subscribe('browser:data-changed', callback),
}));
