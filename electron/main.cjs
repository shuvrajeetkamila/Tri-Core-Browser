'use strict';

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');

const CORE_COUNT = 3;
const HOME_URL = 'https://duckduckgo.com/';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const coreViews = [];
const coreErrors = Array.from({ length: CORE_COUNT }, () => '');
let mainWindow = null;

app.setName('Tri-Core Browser');

function safeWebUrl(value) {
  try {
    const parsed = new URL(String(value));
    return WEB_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function validSlot(value) {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 0 && slot < CORE_COUNT ? slot : -1;
}

function stateFor(slot) {
  const view = coreViews[slot];
  if (!view || view.webContents.isDestroyed()) {
    return { slot, url: '', title: '', loading: false, canGoBack: false, canGoForward: false, error: '' };
  }
  const contents = view.webContents;
  const url = safeWebUrl(contents.getURL()) || '';
  return {
    slot,
    url,
    title: contents.getTitle() || '',
    loading: contents.isLoading(),
    canGoBack: contents.canGoBack(),
    canGoForward: contents.canGoForward(),
    error: coreErrors[slot],
  };
}

function sendState(slot) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('browser:state', stateFor(slot));
}

function loadInCore(slot, rawUrl) {
  const view = coreViews[slot];
  const url = safeWebUrl(rawUrl);
  if (!view || !url || view.webContents.isDestroyed()) return false;

  coreErrors[slot] = '';
  view.webContents.loadURL(url).catch((error) => {
    if (!view.webContents.isDestroyed()) {
      coreErrors[slot] = error?.message || 'Navigation failed';
      sendState(slot);
    }
  });
  sendState(slot);
  return true;
}

function makeCoreView(slot) {
  const view = new WebContentsView({
    webPreferences: {
      partition: `persist:tri-core-${slot + 1}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      autoplayPolicy: 'document-user-activation-required',
    },
  });
  view.setBackgroundColor('#f7f9fb');
  coreViews[slot] = view;
  coreErrors[slot] = '';

  const contents = view.webContents;
  contents.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:active', slot);
  });
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const key = String(input.key || '').toLowerCase();
    let shortcut = null;
    if (key === 'l') shortcut = { action: 'focus-address', slot };
    else if (key === 'r') shortcut = { action: input.shift ? 'reload-all' : 'reload', slot };
    else if (/^[1-3]$/.test(key)) shortcut = { action: 'switch-core', slot: Number(key) - 1 };
    if (shortcut && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      mainWindow.webContents.send('browser:shortcut', shortcut);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    const safeUrl = safeWebUrl(url);
    if (safeUrl) {
      loadInCore(slot, safeUrl);
    } else if (/^mailto:/i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!safeWebUrl(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!safeWebUrl(url)) event.preventDefault();
  });
  contents.on('did-start-loading', () => {
    coreErrors[slot] = '';
    sendState(slot);
  });
  contents.on('did-stop-loading', () => sendState(slot));
  contents.on('did-finish-load', () => sendState(slot));
  contents.on('did-navigate', () => sendState(slot));
  contents.on('did-navigate-in-page', () => sendState(slot));
  contents.on('page-title-updated', () => sendState(slot));
  contents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // Ignore subframes and intentional aborts.
    coreErrors[slot] = `${errorDescription || 'Page could not be loaded'} (${errorCode})`;
    sendState(slot);
  });
  contents.on('context-menu', (_event, params) => {
    const template = [
      { label: 'Back', enabled: contents.canGoBack(), click: () => contents.goBack() },
      { label: 'Forward', enabled: contents.canGoForward(), click: () => contents.goForward() },
      { label: 'Reload', click: () => contents.reload() },
      { type: 'separator' },
      { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
      { label: 'Select all', role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ];
    if (params.linkURL && safeWebUrl(params.linkURL)) {
      template.push({ type: 'separator' }, { label: 'Open link in this core', click: () => loadInCore(slot, params.linkURL) });
    }
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });

  // Each core has its own persistent storage partition, so sites do not share cookies or local storage.
  const session = contents.session;
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  return view;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1510,
    height: 960,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f6fa',
    autoHideMenuBar: true,
    title: 'Tri-Core Browser',
    icon: path.join(__dirname, '..', 'assets', 'tricore.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  for (let slot = 0; slot < CORE_COUNT; slot += 1) {
    mainWindow.contentView.addChildView(makeCoreView(slot));
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const page = devServerUrl
    ? mainWindow.loadURL(devServerUrl)
    : mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  page.catch((error) => console.error('Could not open Tri-Core Browser UI:', error));

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = safeWebUrl(url);
    if (safeUrl) shell.openExternal(safeUrl).catch(() => {});
    return { action: 'deny' };
  });

  for (let slot = 0; slot < CORE_COUNT; slot += 1) loadInCore(slot, HOME_URL);
}

ipcMain.handle('browser:get-states', (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return [];
  return Array.from({ length: CORE_COUNT }, (_, slot) => stateFor(slot));
});

ipcMain.handle('browser:navigate', (event, payload = {}) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false };
  const slot = validSlot(payload.slot);
  return { ok: slot >= 0 && loadInCore(slot, payload.url) };
});

ipcMain.handle('browser:action', (event, payload = {}) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return null;
  const slot = validSlot(payload.slot);
  if (slot < 0 || !coreViews[slot] || coreViews[slot].webContents.isDestroyed()) return null;

  const contents = coreViews[slot].webContents;
  switch (payload.action) {
    case 'back':
      if (contents.canGoBack()) contents.goBack();
      break;
    case 'forward':
      if (contents.canGoForward()) contents.goForward();
      break;
    case 'reload':
      contents.reload();
      break;
    case 'home':
      loadInCore(slot, HOME_URL);
      break;
    default:
      return null;
  }
  return stateFor(slot);
});

ipcMain.on('browser:set-layout', (event, bounds) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || !Array.isArray(bounds)) return;
  const { width: contentWidth, height: contentHeight } = mainWindow.getContentBounds();

  for (let slot = 0; slot < CORE_COUNT; slot += 1) {
    const rect = bounds[slot];
    if (!rect || !coreViews[slot]) continue;
    const values = [rect.x, rect.y, rect.width, rect.height].map(Number);
    if (!values.every(Number.isFinite)) continue;
    const x = Math.max(0, Math.min(Math.round(values[0]), contentWidth));
    const y = Math.max(0, Math.min(Math.round(values[1]), contentHeight));
    const width = Math.max(0, Math.min(Math.round(values[2]), contentWidth - x));
    const height = Math.max(0, Math.min(Math.round(values[3]), contentHeight - y));
    coreViews[slot].setBounds({ x, y, width, height });
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
