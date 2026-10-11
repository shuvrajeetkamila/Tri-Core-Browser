'use strict';

const {
  app,
  BrowserWindow,
  WebContentsView,
  Menu,
  ipcMain,
  shell,
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const http = require('node:http');

const CORE_COUNT = 3;
const MAX_TABS_PER_CORE = 20;
const MAX_HISTORY_ENTRIES = 500;
const MAX_DOWNLOAD_ENTRIES = 80;
const DEFAULT_HOME_URL = 'https://duckduckgo.com/';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const coreTabs = Array.from({ length: CORE_COUNT }, () => []);
const activeTabs = Array.from({ length: CORE_COUNT }, () => null);
const layoutBounds = Array.from({ length: CORE_COUNT }, () => ({ x: 0, y: 0, width: 0, height: 0 }));
const configuredSessions = new WeakSet();
const downloads = [];
const downloadById = new Map();
let mainWindow = null;
let homeUrl = DEFAULT_HOME_URL;
let browserDataPath = '';
let browserData = { version: 1, bookmarks: [], history: [], settings: { homeUrl: DEFAULT_HOME_URL } };

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

function isUiSender(event) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event?.sender === mainWindow.webContents);
}

function clampText(value, maxLength = 300) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, maxLength);
}

function normalizedBrowserData(value) {
  const source = value && typeof value === 'object' ? value : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const savedHome = safeWebUrl(settings.homeUrl) || DEFAULT_HOME_URL;
  const bookmarks = Array.isArray(source.bookmarks)
    ? source.bookmarks.filter((item) => item && safeWebUrl(item.url)).slice(0, 1000).map((item) => ({
      id: clampText(item.id, 80) || crypto.randomUUID(),
      title: clampText(item.title || item.url, 300),
      url: safeWebUrl(item.url),
      createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now(),
    }))
    : [];
  const history = Array.isArray(source.history)
    ? source.history.filter((item) => item && safeWebUrl(item.url)).slice(0, MAX_HISTORY_ENTRIES).map((item) => ({
      id: clampText(item.id, 80) || crypto.randomUUID(),
      title: clampText(item.title || item.url, 300),
      url: safeWebUrl(item.url),
      visitedAt: Number.isFinite(Number(item.visitedAt)) ? Number(item.visitedAt) : Date.now(),
    }))
    : [];
  return { version: 1, bookmarks, history, settings: { homeUrl: savedHome } };
}

function loadBrowserData() {
  browserDataPath = path.join(app.getPath('userData'), 'browser-data.json');
  try {
    browserData = normalizedBrowserData(JSON.parse(fs.readFileSync(browserDataPath, 'utf8')));
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('Could not read browser data; using a fresh profile.', error?.message);
    browserData = normalizedBrowserData(null);
  }
  homeUrl = browserData.settings.homeUrl;
}

function persistBrowserData() {
  try {
    fs.mkdirSync(path.dirname(browserDataPath), { recursive: true });
    const temporaryPath = `${browserDataPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(browserData, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, browserDataPath);
    return true;
  } catch (error) {
    console.error('Could not save browser data:', error?.message || error);
    return false;
  }
}

function activeTabFor(slot) {
  return validSlot(slot) >= 0 ? activeTabs[slot] : null;
}

function tabState(tab) {
  if (!tab || !tab.view || tab.view.webContents.isDestroyed()) {
    return { id: '', title: '', url: '', loading: false, canGoBack: false, canGoForward: false, error: '' };
  }
  const contents = tab.view.webContents;
  return {
    id: tab.id,
    title: clampText(contents.getTitle(), 300),
    url: safeWebUrl(contents.getURL()) || '',
    loading: contents.isLoading(),
    canGoBack: contents.canGoBack(),
    canGoForward: contents.canGoForward(),
    error: tab.error,
  };
}

function stateFor(slot) {
  const active = activeTabFor(slot);
  const current = tabState(active);
  return {
    slot,
    ...current,
    tabs: coreTabs[slot].map((tab) => ({ ...tabState(tab), active: tab === active })),
  };
}

function sendState(slot) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('browser:state', stateFor(slot));
}

function sendDownloads() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('browser:downloads', downloads.map(({ id, fileName, url, state, receivedBytes, totalBytes, path: filePath, error }) => ({
    id,
    fileName,
    url,
    state,
    receivedBytes,
    totalBytes,
    path: state === 'completed' ? filePath : '',
    error,
  })));
}

function applyLayoutForCore(slot) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const active = activeTabFor(slot);
  const bounds = layoutBounds[slot] || { x: 0, y: 0, width: 0, height: 0 };
  for (const tab of coreTabs[slot]) {
    if (!tab.view || tab.view.webContents.isDestroyed()) continue;
    tab.view.setBounds(tab === active ? bounds : { x: 0, y: 0, width: 0, height: 0 });
  }
}

function persistHistoryVisit(tab) {
  const state = tabState(tab);
  if (!state.url) return;
  const now = Date.now();
  const mostRecent = browserData.history[0];
  if (mostRecent?.url === state.url && now - mostRecent.visitedAt < 5000) {
    mostRecent.title = state.title || state.url;
    mostRecent.visitedAt = now;
  } else {
    browserData.history.unshift({
      id: crypto.randomUUID(),
      title: state.title || state.url,
      url: state.url,
      visitedAt: now,
    });
  }
  browserData.history = browserData.history.slice(0, MAX_HISTORY_ENTRIES);
  persistBrowserData();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:data-changed', { kind: 'history' });
}

function configureSession(session) {
  if (configuredSessions.has(session)) return;
  configuredSessions.add(session);
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);

  session.on('will-download', (_event, item) => {
    const rawName = String(item.getFilename() || 'download');
    const fileName = rawName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+$/, 'download').slice(0, 180) || 'download';
    const downloadsDirectory = app.getPath('downloads');
    let destination = path.join(downloadsDirectory, fileName);
    let suffix = 1;
    const extension = path.extname(fileName);
    const stem = path.basename(fileName, extension);
    while (fs.existsSync(destination) && suffix < 1000) {
      destination = path.join(downloadsDirectory, `${stem} (${suffix})${extension}`);
      suffix += 1;
    }

    const record = {
      id: crypto.randomUUID(),
      fileName,
      url: safeWebUrl(item.getURL()) || '',
      state: 'in-progress',
      receivedBytes: 0,
      totalBytes: Math.max(0, Number(item.getTotalBytes()) || 0),
      path: destination,
      error: '',
    };
    downloads.unshift(record);
    downloadById.set(record.id, record);
    const expiredDownloads = downloads.splice(MAX_DOWNLOAD_ENTRIES);
    for (const expired of expiredDownloads) downloadById.delete(expired.id);
    sendDownloads();

    // Save into the user's Downloads folder; never launch a downloaded file.
    item.setSavePath(destination);
    item.on('updated', () => {
      record.receivedBytes = Math.max(0, Number(item.getReceivedBytes()) || 0);
      record.totalBytes = Math.max(0, Number(item.getTotalBytes()) || 0);
      sendDownloads();
    });
    item.once('done', (_doneEvent, state) => {
      record.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted';
      record.receivedBytes = Math.max(0, Number(item.getReceivedBytes()) || 0);
      record.totalBytes = Math.max(0, Number(item.getTotalBytes()) || 0);
      if (record.state !== 'completed') record.error = state === 'cancelled' ? 'Download cancelled.' : 'Download interrupted.';
      sendDownloads();
    });
  });
}

function uniqueDownloadPath(downloadId) {
  const record = downloadById.get(String(downloadId));
  if (!record || record.state !== 'completed') return null;
  const downloadsDirectory = path.resolve(app.getPath('downloads'));
  const resolvedPath = path.resolve(record.path);
  const relative = path.relative(downloadsDirectory, resolvedPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolvedPath;
}

function recordHistoryFromTab(tab) {
  if (!tab || tab.view.webContents.isDestroyed()) return;
  persistHistoryVisit(tab);
  sendState(tab.slot);
}

function loadTab(tab, rawUrl) {
  const url = safeWebUrl(rawUrl);
  if (!tab || !url || tab.view.webContents.isDestroyed()) return Promise.resolve(false);
  tab.error = '';
  sendState(tab.slot);
  return tab.view.webContents.loadURL(url).then(() => true).catch((error) => {
    if (!tab.view.webContents.isDestroyed()) {
      tab.error = clampText(error?.message || 'Navigation failed.', 500);
      sendState(tab.slot);
    }
    return false;
  });
}

function setActiveTab(slot, tabId) {
  if (validSlot(slot) < 0) return false;
  const tab = coreTabs[slot].find((candidate) => candidate.id === String(tabId));
  if (!tab) return false;
  activeTabs[slot] = tab;
  applyLayoutForCore(slot);
  sendState(slot);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:active', slot);
  return true;
}

function makeWebContentsView(slot, tab) {
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
  tab.view = view;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.addChildView(view);
  configureSession(view.webContents.session);

  const contents = view.webContents;
  contents.on('focus', () => {
    if (activeTabs[slot] !== tab) setActiveTab(slot, tab.id);
    else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:active', slot);
  });
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const key = String(input.key || '').toLowerCase();
    let shortcut = null;
    if (key === 'l') shortcut = { action: 'focus-address', slot };
    else if (key === 'r') shortcut = { action: input.shift ? 'reload-all' : 'reload', slot };
    else if (key === 't') shortcut = { action: 'new-tab', slot };
    else if (key === 'w') shortcut = { action: 'close-tab', slot, tabId: tab.id };
    else if (/^[1-3]$/.test(key)) shortcut = { action: 'switch-core', slot: Number(key) - 1 };
    if (shortcut && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      mainWindow.webContents.send('browser:shortcut', shortcut);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    const safeUrl = safeWebUrl(url);
    if (safeUrl) {
      createTab(slot, safeUrl);
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
    tab.error = '';
    sendState(slot);
  });
  contents.on('did-stop-loading', () => sendState(slot));
  contents.on('did-finish-load', () => sendState(slot));
  contents.on('did-navigate', () => recordHistoryFromTab(tab));
  contents.on('did-navigate-in-page', () => recordHistoryFromTab(tab));
  contents.on('page-title-updated', () => {
    const recent = browserData.history[0];
    const url = safeWebUrl(contents.getURL());
    if (recent && recent.url === url) {
      recent.title = clampText(contents.getTitle() || url, 300);
      persistBrowserData();
    }
    sendState(slot);
  });
  contents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // Ignore subframes and intentional aborts.
    tab.error = `${clampText(errorDescription || 'Page could not be loaded', 400)} (${errorCode})`;
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
      template.push(
        { type: 'separator' },
        { label: 'Open link in this tab', click: () => loadTab(tab, params.linkURL) },
        { label: 'Open link in new tab', click: () => createTab(slot, params.linkURL) },
      );
    }
    Menu.buildFromTemplate(template).popup({ window: mainWindow || undefined });
  });
  return view;
}

function createTab(slot, rawUrl = homeUrl, { activate = true } = {}) {
  if (validSlot(slot) < 0 || !mainWindow || mainWindow.isDestroyed()) return null;
  if (coreTabs[slot].length >= MAX_TABS_PER_CORE) return null;
  const tab = { id: crypto.randomUUID(), slot, view: null, error: '' };
  makeWebContentsView(slot, tab);
  coreTabs[slot].push(tab);
  if (activate || !activeTabs[slot]) {
    activeTabs[slot] = tab;
    applyLayoutForCore(slot);
  } else {
    tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  const loadPromise = loadTab(tab, rawUrl);
  sendState(slot);
  tab.loadPromise = loadPromise;
  return tab;
}

function closeTab(slot, tabId) {
  if (validSlot(slot) < 0 || coreTabs[slot].length <= 1) return false;
  const index = coreTabs[slot].findIndex((tab) => tab.id === String(tabId));
  if (index < 0) return false;
  const [tab] = coreTabs[slot].splice(index, 1);
  const wasActive = activeTabs[slot] === tab;
  if (wasActive) activeTabs[slot] = coreTabs[slot][Math.min(index, coreTabs[slot].length - 1)] || coreTabs[slot][0];
  try {
    if (tab.view && mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.removeChildView(tab.view);
    if (tab.view && !tab.view.webContents.isDestroyed()) tab.view.webContents.destroy();
  } catch (error) {
    console.warn('Could not close browser tab cleanly:', error?.message);
  }
  applyLayoutForCore(slot);
  sendState(slot);
  return true;
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
      webSecurity: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  for (let slot = 0; slot < CORE_COUNT; slot += 1) createTab(slot, homeUrl, { activate: true });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const allowedDevOrigin = devServerUrl ? new URL(devServerUrl).origin : '';
  const uiFileUrl = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
  const page = devServerUrl
    ? mainWindow.loadURL(devServerUrl)
    : mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  page.catch((error) => console.error('Could not open Tri-Core Browser UI:', error));

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--smoke-test')) mainWindow.show();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = safeWebUrl(url);
    if (safeUrl) shell.openExternal(safeUrl).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      const isAllowedDevelopmentPage = allowedDevOrigin && target.origin === allowedDevOrigin;
      const isAllowedPackagedPage = !allowedDevOrigin && target.protocol === 'file:' && target.href.split('#')[0] === uiFileUrl;
      if (isAllowedDevelopmentPage || isAllowedPackagedPage) return;
    } catch {
      // Malformed or unexpected schemes are blocked below.
    }
    event.preventDefault();
  });
}

function getGPUFeatureStatus() {
  try {
    return app.getGPUFeatureStatus();
  } catch (error) {
    return { error: clampText(error?.message || 'GPU feature status unavailable.', 300) };
  }
}

async function getGraphicsDiagnostics() {
  let gpuInfo = {};
  let gpuInfoError = '';
  try {
    gpuInfo = await app.getGPUInfo('complete');
  } catch (error) {
    gpuInfoError = clampText(error?.message || 'GPU information unavailable.', 300);
  }
  const featureStatus = getGPUFeatureStatus();
  const devices = Array.isArray(gpuInfo?.gpuDevice) ? gpuInfo.gpuDevice : [];
  const gpuDevices = devices.map((device) => ({
    vendorId: clampText(device.vendorId, 40),
    deviceId: clampText(device.deviceId, 40),
    vendor: clampText(device.vendorString || device.vendor || 'Unknown vendor', 120),
    name: clampText(device.deviceString || device.name || 'Unknown device', 160),
    driverVersion: clampText(device.driverVersion || '', 120),
    active: Boolean(device.isActive),
  }));
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron || '',
    chromiumVersion: process.versions.chrome || '',
    platform: process.platform,
    architecture: process.arch,
    gpuDevices,
    gpuInfoError,
    featureStatus,
    integration: {
      wasm: { implemented: true, scope: 'controlled WebAssembly test in Chromium V8; not a webpage frame-rate switch' },
      dlss: { implemented: false, scope: 'not integrated; no Streamline/DLSS native renderer or webpage texture bridge' },
      fsr: { implemented: false, scope: 'not integrated; no FidelityFX/FSR native renderer or webpage texture bridge' },
    },
  };
}

function addBookmark(payload = {}) {
  const url = safeWebUrl(payload.url);
  if (!url) return { ok: false, error: 'Only HTTP and HTTPS pages can be bookmarked.' };
  const title = clampText(payload.title || url, 300) || url;
  const existing = browserData.bookmarks.find((item) => item.url === url);
  if (existing) {
    existing.title = title;
  } else {
    browserData.bookmarks.unshift({ id: crypto.randomUUID(), title, url, createdAt: Date.now() });
    browserData.bookmarks = browserData.bookmarks.slice(0, 1000);
  }
  const saved = persistBrowserData();
  return { ok: saved, data: { bookmarks: browserData.bookmarks } };
}

function getBrowserData() {
  return {
    bookmarks: browserData.bookmarks,
    history: browserData.history,
    settings: browserData.settings,
  };
}

function waitForNavigation(contents, url, timeoutMs = 25_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      contents.removeListener('did-finish-load', onFinished);
      contents.removeListener('did-fail-load', onFailed);
    };
    const settle = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(contents.getURL());
    };
    const onFinished = () => settle(null);
    const onFailed = (_event, code, description, _validatedUrl, isMainFrame) => {
      if (isMainFrame && code !== -3) settle(new Error(`${description || 'Navigation failed'} (${code})`));
    };
    const timer = setTimeout(() => settle(new Error(`Navigation timed out after ${timeoutMs} ms.`)), timeoutMs);
    contents.once('did-finish-load', onFinished);
    contents.on('did-fail-load', onFailed);
    contents.loadURL(url).catch((error) => settle(error));
  });
}

async function runSmokeTest() {
  const startedAt = Date.now();
  let localServer;
  try {
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window did not start.');
    console.log(`[smoke] Runtime versions: Electron ${process.versions.electron}; Chromium ${process.versions.chrome}; Node.js ${process.versions.node}.`);
    const title = await mainWindow.webContents.executeJavaScript('document.title');
    if (title !== 'Tri-Core Browser') throw new Error(`Unexpected UI title: ${title}`);
    const uiControls = await mainWindow.webContents.executeJavaScript(`({
      graphics: Boolean(document.querySelector('#graphics-dialog')),
      wasm: Boolean(document.querySelector('[data-graphics-mode="wasm"]')),
      dlss: Boolean(document.querySelector('[data-graphics-mode="dlss"]')),
      fsr: Boolean(document.querySelector('[data-graphics-mode="fsr"]')),
      hybrid: Boolean(document.querySelector('[data-graphics-mode="hybrid"]')),
      standard: Boolean(document.querySelector('[data-graphics-mode="standard"]')),
      tabs: Boolean(document.querySelector('[data-tabbar="0"]'))
    })`);
    if (Object.values(uiControls).some((value) => !value)) throw new Error(`A required browser control is missing: ${JSON.stringify(uiControls)}`);
    console.log(`[smoke] Browser shell and five mode controls: PASS ${JSON.stringify(uiControls)}`);

    localServer = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><html><head><title>Tri-Core local smoke</title></head><body><h1>Smoke page</h1><script>
        window.smokeJavaScript = 'javascript-ok';
        const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);
        window.smokeWasm = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.add(19, 23);
      </script></body></html>`);
    });
    await new Promise((resolve, reject) => {
      localServer.once('error', reject);
      localServer.listen(0, '127.0.0.1', resolve);
    });
    const address = localServer.address();
    const testUrl = `http://127.0.0.1:${address.port}/`;
    const smokeTab = activeTabFor(0);
    const loadedUrl = await waitForNavigation(smokeTab.view.webContents, testUrl);
    const pageResults = await smokeTab.view.webContents.executeJavaScript(`({
      title: document.title,
      text: document.querySelector('h1')?.textContent,
      javascript: window.smokeJavaScript,
      wasm: window.smokeWasm
    })`);
    if (pageResults.title !== 'Tri-Core local smoke' || pageResults.javascript !== 'javascript-ok' || pageResults.wasm !== 42) {
      throw new Error(`Local site or its WASM test failed: ${JSON.stringify(pageResults)}`);
    }
    console.log(`[smoke] Local HTTP website, JavaScript and WebAssembly add(19,23)=42: PASS (${loadedUrl})`);

    const newTab = createTab(0, testUrl, { activate: true });
    if (!newTab || !(await newTab.loadPromise)) throw new Error('Creating/loading a second browser tab failed.');
    if (stateFor(0).tabs.length !== 2 || stateFor(0).id !== newTab.id) throw new Error('Tab list or active-tab state is incorrect.');
    if (!closeTab(0, newTab.id) || stateFor(0).tabs.length !== 1) throw new Error('Closing the second tab failed.');
    console.log('[smoke] Add, activate and close a tab while retaining the last tab: PASS');

    try {
      const httpsUrl = await waitForNavigation(smokeTab.view.webContents, 'https://example.com/', 20_000);
      if (!httpsUrl.startsWith('https://')) throw new Error('HTTPS navigation did not remain HTTPS.');
      console.log(`[smoke] HTTPS navigation with Chromium certificate validation: PASS (${httpsUrl})`);
    } catch (error) {
      console.log(`[smoke] HTTPS external-network probe: BLOCKED (${clampText(error?.message, 220)}); no certificate bypass was used.`);
    }
    console.log(`[smoke] Overall local runtime checks: PASS (${Date.now() - startedAt} ms)`);
    app.exit(0);
  } catch (error) {
    console.error(`[smoke] FAIL: ${error?.stack || error}`);
    app.exit(1);
  } finally {
    if (localServer) localServer.close();
  }
}

ipcMain.handle('browser:get-states', (event) => {
  if (!isUiSender(event)) return [];
  return Array.from({ length: CORE_COUNT }, (_, slot) => stateFor(slot));
});

ipcMain.handle('browser:navigate', (event, payload = {}) => {
  if (!isUiSender(event)) return { ok: false };
  const slot = validSlot(payload.slot);
  const tab = activeTabFor(slot);
  const url = safeWebUrl(payload.url);
  if (slot < 0 || !tab || !url) return { ok: false };
  loadTab(tab, url);
  return { ok: true, tabId: tab.id };
});

ipcMain.handle('browser:action', (event, payload = {}) => {
  if (!isUiSender(event)) return null;
  const slot = validSlot(payload.slot);
  const tab = activeTabFor(slot);
  if (slot < 0 || !tab || tab.view.webContents.isDestroyed()) return null;
  const contents = tab.view.webContents;
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
    case 'stop':
      contents.stop();
      break;
    case 'home':
      loadTab(tab, homeUrl);
      break;
    default:
      return null;
  }
  return stateFor(slot);
});

ipcMain.handle('browser:tab-create', (event, payload = {}) => {
  if (!isUiSender(event)) return { ok: false, error: 'Untrusted sender.' };
  const slot = validSlot(payload.slot);
  if (slot < 0) return { ok: false, error: 'Invalid browser core.' };
  const url = safeWebUrl(payload.url) || homeUrl;
  const tab = createTab(slot, url);
  if (!tab) return { ok: false, error: `A core can have at most ${MAX_TABS_PER_CORE} tabs.` };
  return { ok: true, tabId: tab.id };
});

ipcMain.handle('browser:tab-select', (event, payload = {}) => {
  if (!isUiSender(event)) return false;
  return setActiveTab(payload.slot, payload.tabId);
});

ipcMain.handle('browser:tab-close', (event, payload = {}) => {
  if (!isUiSender(event)) return false;
  return closeTab(payload.slot, payload.tabId);
});

ipcMain.on('browser:set-layout', (event, bounds) => {
  if (!isUiSender(event) || !Array.isArray(bounds)) return;
  const { width: contentWidth, height: contentHeight } = mainWindow.getContentBounds();
  for (let slot = 0; slot < CORE_COUNT; slot += 1) {
    const rect = bounds[slot];
    if (!rect) continue;
    const values = [rect.x, rect.y, rect.width, rect.height].map(Number);
    if (!values.every(Number.isFinite)) continue;
    const x = Math.max(0, Math.min(Math.round(values[0]), contentWidth));
    const y = Math.max(0, Math.min(Math.round(values[1]), contentHeight));
    const width = Math.max(0, Math.min(Math.round(values[2]), contentWidth - x));
    const height = Math.max(0, Math.min(Math.round(values[3]), contentHeight - y));
    layoutBounds[slot] = { x, y, width, height };
    applyLayoutForCore(slot);
  }
});

ipcMain.handle('browser:get-data', (event) => (isUiSender(event) ? getBrowserData() : null));
ipcMain.handle('browser:add-bookmark', (event, payload = {}) => (isUiSender(event) ? addBookmark(payload) : { ok: false }));
ipcMain.handle('browser:remove-bookmark', (event, bookmarkId) => {
  if (!isUiSender(event)) return false;
  const previousLength = browserData.bookmarks.length;
  browserData.bookmarks = browserData.bookmarks.filter((item) => item.id !== String(bookmarkId));
  if (browserData.bookmarks.length === previousLength) return false;
  return persistBrowserData();
});
ipcMain.handle('browser:clear-history', (event) => {
  if (!isUiSender(event)) return false;
  browserData.history = [];
  return persistBrowserData();
});
ipcMain.handle('browser:set-home', (event, rawUrl) => {
  if (!isUiSender(event)) return { ok: false, error: 'Untrusted sender.' };
  const url = safeWebUrl(rawUrl);
  if (!url) return { ok: false, error: 'The home page must use HTTP or HTTPS.' };
  homeUrl = url;
  browserData.settings.homeUrl = url;
  return { ok: persistBrowserData(), homeUrl };
});
ipcMain.handle('browser:get-downloads', (event) => {
  if (!isUiSender(event)) return [];
  return downloads.map(({ id, fileName, url, state, receivedBytes, totalBytes, path: filePath, error }) => ({
    id,
    fileName,
    url,
    state,
    receivedBytes,
    totalBytes,
    path: state === 'completed' ? filePath : '',
    error,
  }));
});
ipcMain.handle('browser:reveal-download', (event, downloadId) => {
  if (!isUiSender(event)) return false;
  const filePath = uniqueDownloadPath(downloadId);
  if (!filePath) return false;
  shell.showItemInFolder(filePath);
  return true;
});
ipcMain.handle('browser:graphics-info', async (event) => (isUiSender(event) ? getGraphicsDiagnostics() : null));

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
    loadBrowserData();
    createWindow();
    if (process.argv.includes('--smoke-test')) {
      mainWindow.webContents.once('did-finish-load', () => runSmokeTest());
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('render-process-gone', (_goneEvent, details) => {
    console.error('A Chromium renderer process exited unexpectedly:', details?.reason || 'unknown reason');
  });
});
