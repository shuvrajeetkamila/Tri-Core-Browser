'use strict';

const {
  app,
  BrowserWindow,
  WebContentsView,
  Menu,
  ipcMain,
  shell,
  nativeImage,
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const http = require('node:http');
const { execFile } = require('node:child_process');
const {
  EXPECTED_INPUT_SOURCE,
  isFileUrlForPath,
  buildBilinearReferencePath,
  buildNativeFsrArguments,
  normalizeCaptureRequest,
  validateCaptureContext,
  validateCaptureDimensions,
  validateNativeFsrReport,
} = require('./fsr1-bridge.cjs');
const {
  analyzeRgbaStages,
  bitmapToRgba,
  compareVisibleCanvasSamples,
} = require('./fsr1-webgpu-validation.cjs');

const CORE_COUNT = 3;
const MAX_TABS_PER_CORE = 20;
const MAX_HISTORY_ENTRIES = 500;
const MAX_DOWNLOAD_ENTRIES = 80;
const DEFAULT_HOME_URL = 'https://duckduckgo.com/';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const FSR_TEST_SCENE_PATH = path.join(__dirname, '..', 'app', 'diagnostics', 'fsr1-browser-game.html');
const FSR_TEST_SCENE_URL = pathToFileURL(FSR_TEST_SCENE_PATH).href;
const FSR_WEBGPU_TEST_SCENE_PATH = path.join(__dirname, '..', 'app', 'diagnostics', 'fsr1-webgpu.html');
const FSR_WEBGPU_TEST_SCENE_URL = pathToFileURL(FSR_WEBGPU_TEST_SCENE_PATH).href;

function isBundledFsrTestSceneUrl(value) {
  return isFileUrlForPath(String(value || ''), FSR_TEST_SCENE_PATH);
}

function isBundledFsrWebGpuTestSceneUrl(value) {
  return isFileUrlForPath(String(value || ''), FSR_WEBGPU_TEST_SCENE_PATH);
}

const MAX_FSR_PREVIEW_BYTES = 12 * 1024 * 1024;
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
let activeFsrJob = null;
let fsrCaptureRequestPending = false;
let totalFsrProcessedFrames = 0;
let lastFsrFailure = '';
let lastFsrReport = null;

function appendSmokeDiagnostic(message) {
  const logPath = process.env.TRICORE_SMOKE_LOG;
  if (!logPath) return;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${String(message)}\n`, 'utf8');
  } catch {
    // Smoke diagnostics must never change normal browser startup or fallback behavior.
  }
}

function writeSmokeDiagnostic(message, level = 'log') {
  appendSmokeDiagnostic(message);
  if (level === 'error') console.error(message);
  else console.log(message);
}

if (process.argv.includes('--smoke-test')) {
  appendSmokeDiagnostic(`[smoke] Packaged main-process entry loaded; Electron ${process.versions.electron}; Chromium ${process.versions.chrome}; Node.js ${process.versions.node}.`);
  process.on('uncaughtExceptionMonitor', (error) => {
    appendSmokeDiagnostic(`[smoke] Uncaught main-process exception: ${error?.stack || error}`);
  });
}

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
    fsrTestScene: Boolean(tab.isFsrTestScene && isBundledFsrTestSceneUrl(contents.getURL())),
    fsrWebGpuTestScene: Boolean(tab.isFsrWebGpuTestScene && isBundledFsrWebGpuTestSceneUrl(contents.getURL())),
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

function setMainWindowFullscreen(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setFullScreen(Boolean(enabled));
  const fullScreen = mainWindow.isFullScreen();
  if (!mainWindow.webContents.isDestroyed()) mainWindow.webContents.send('browser:fullscreen-state', fullScreen);
  return fullScreen;
}

function handleFullscreenShortcut(event, input) {
  if (input?.type !== 'keyDown' || input.key !== 'F11' || input.isAutoRepeat || input.control || input.meta || input.alt) return false;
  event.preventDefault();
  setMainWindowFullscreen(!mainWindow?.isFullScreen?.());
  return true;
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
  tab.isFsrTestScene = false;
  tab.isFsrWebGpuTestScene = false;
  sendState(tab.slot);
  return tab.view.webContents.loadURL(url).then(() => true).catch((error) => {
    if (!tab.view.webContents.isDestroyed()) {
      tab.error = clampText(error?.message || 'Navigation failed.', 500);
      sendState(tab.slot);
    }
    return false;
  });
}

function loadFsrTestScene(tab) {
  if (!tab || !tab.view || tab.view.webContents.isDestroyed()) return Promise.resolve(false);
  tab.isFsrTestScene = true;
  tab.isFsrWebGpuTestScene = false;
  tab.error = '';
  sendState(tab.slot);
  return tab.view.webContents.loadFile(FSR_TEST_SCENE_PATH).then(() => true).catch((error) => {
    tab.isFsrTestScene = false;
    if (!tab.view.webContents.isDestroyed()) {
      tab.error = clampText(error?.message || 'The local WebGL2 screenshot-diagnostic scene could not be loaded.', 500);
      sendState(tab.slot);
    }
    return false;
  });
}

function loadFsrWebGpuTestScene(tab) {
  if (!tab || !tab.view || tab.view.webContents.isDestroyed()) return Promise.resolve(false);
  tab.isFsrTestScene = false;
  tab.isFsrWebGpuTestScene = true;
  tab.error = '';
  sendState(tab.slot);
  return tab.view.webContents.loadFile(FSR_WEBGPU_TEST_SCENE_PATH).then(() => true).catch((error) => {
    tab.isFsrWebGpuTestScene = false;
    if (!tab.view.webContents.isDestroyed()) {
      tab.error = clampText(error?.message || 'The local WebGPU FSR1 integration scene could not be loaded.', 500);
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
    if (handleFullscreenShortcut(event, input)) return;
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
    const isApprovedDiagnosticNavigation = (tab.isFsrTestScene && isBundledFsrTestSceneUrl(url))
      || (tab.isFsrWebGpuTestScene && isBundledFsrWebGpuTestSceneUrl(url));
    if (!safeWebUrl(url) && !isApprovedDiagnosticNavigation) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    const isApprovedDiagnosticNavigation = (tab.isFsrTestScene && isBundledFsrTestSceneUrl(url))
      || (tab.isFsrWebGpuTestScene && isBundledFsrWebGpuTestSceneUrl(url));
    if (!safeWebUrl(url) && !isApprovedDiagnosticNavigation) event.preventDefault();
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

function createTab(slot, rawUrl = homeUrl, { activate = true, fsrTestScene = false, fsrWebGpuTestScene = false } = {}) {
  if (validSlot(slot) < 0 || !mainWindow || mainWindow.isDestroyed()) return null;
  if (coreTabs[slot].length >= MAX_TABS_PER_CORE) return null;
  const tab = { id: crypto.randomUUID(), slot, view: null, error: '', isFsrTestScene: false, isFsrWebGpuTestScene: false };
  makeWebContentsView(slot, tab);
  coreTabs[slot].push(tab);
  if (activate || !activeTabs[slot]) {
    activeTabs[slot] = tab;
    applyLayoutForCore(slot);
  } else {
    tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  const loadPromise = fsrTestScene
    ? loadFsrTestScene(tab)
    : fsrWebGpuTestScene
      ? loadFsrWebGpuTestScene(tab)
      : loadTab(tab, rawUrl);
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
  const sendFullscreenState = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('browser:fullscreen-state', mainWindow.isFullScreen());
    }
  };
  mainWindow.on('enter-full-screen', sendFullscreenState);
  mainWindow.on('leave-full-screen', sendFullscreenState);
  mainWindow.webContents.on('before-input-event', (event, input) => handleFullscreenShortcut(event, input));
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

function nativeFsrExecutablePath() {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'native', 'fsr1', 'TriCoreFsr1Poc.exe')]
    : [
      path.join(__dirname, '..', 'build', 'fsr1-poc', 'Release', 'TriCoreFsr1Poc.exe'),
      path.join(__dirname, '..', 'build', 'fsr1-poc', 'Debug', 'TriCoreFsr1Poc.exe'),
      path.join(__dirname, '..', 'native', 'fsr1-poc', 'build', 'Release', 'TriCoreFsr1Poc.exe'),
    ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const shader = path.join(path.dirname(candidate), 'amd', 'FSR_Pass.hlsl');
    if (fs.existsSync(shader) && fs.statSync(shader).isFile()) return candidate;
  }
  return '';
}

function runNativeFsrProcess(executable, args, { timeout = 10_000, job = null } = {}) {
  return new Promise((resolve, reject) => {
    let child = null;
    child = execFile(executable, args, {
      windowsHide: true,
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      if (job && job.child === child) {
        job.child = null;
        job.nativeInitialized = false;
        job.nativeProcessing = false;
      }
      if (error) {
        const diagnostic = clampText(stderr || stdout || error.message || 'Native helper failed.', 1000);
        reject(new Error(`Native FSR helper failed (${error.code || error.signal || 'unknown'}): ${diagnostic}`));
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
    if (job) {
      job.child = child;
      job.nativeInitialized = false;
      job.nativeProcessing = false;
      let markerBuffer = '';
      child.stdout?.on('data', (chunk) => {
        if (job.child !== child) return;
        markerBuffer = `${markerBuffer}${chunk.toString('utf8')}`.slice(-256);
        if (!job.nativeInitialized && markerBuffer.includes('FSR1_INITIALIZED')) {
          job.nativeInitialized = true;
          sendFsrProgress({ jobId: job.id, slot: job.slot, frameIndex: job.frameIndex, frameCount: job.frameCount, state: 'INITIALIZED' });
        }
        if (!job.nativeProcessing && markerBuffer.includes('FSR1_PROCESSING')) {
          job.nativeInitialized = true;
          job.nativeProcessing = true;
          sendFsrProgress({ jobId: job.id, slot: job.slot, frameIndex: job.frameIndex, frameCount: job.frameCount, state: 'NATIVE PROCESSING' });
        }
      });
      if (job.cancelled) child.kill();
    }
  });
}

let nativeFsrAdapterCache = null;
let nativeFsrAdapterCacheAt = 0;
let nativeFsrAdapterProbe = null;

async function getNativeFsrAdapters({ refresh = false } = {}) {
  const executable = nativeFsrExecutablePath();
  if (!executable) {
    return { available: false, adapters: [], warpAvailable: false, error: 'The bundled FSR1 helper or licensed AMD shader inputs are not built/packaged for this platform.' };
  }
  if (!refresh && nativeFsrAdapterCache && Date.now() - nativeFsrAdapterCacheAt < 30_000) return nativeFsrAdapterCache;
  if (nativeFsrAdapterProbe) return nativeFsrAdapterProbe;
  nativeFsrAdapterProbe = (async () => {
    try {
      const { stdout } = await runNativeFsrProcess(executable, ['--list-adapters']);
      const report = JSON.parse(stdout.trim());
      if (report?.status !== 'PASS' || !Array.isArray(report.adapters)) throw new Error('Adapter enumeration returned an invalid report.');
      const adapters = report.adapters.filter((adapter) => adapter && Number.isInteger(adapter.index)).map((adapter) => ({
        index: adapter.index,
        name: clampText(adapter.name || 'Unknown D3D12 adapter', 160),
        vendorId: clampText(adapter.vendorId || '', 20),
        deviceId: clampText(adapter.deviceId || '', 20),
        dedicatedVideoMemoryBytes: Math.max(0, Number(adapter.dedicatedVideoMemoryBytes) || 0),
        softwareAdapter: adapter.softwareAdapter === true,
        featureLevel: clampText(adapter.featureLevel || '', 32),
        shaderModel: clampText(adapter.shaderModel || '', 80),
        supports: adapter.support && typeof adapter.support === 'object' ? {
          r8g8b8a8Texture2D: adapter.support.r8g8b8a8Texture2D === true,
          shaderSample: adapter.support.shaderSample === true,
          shaderLoad: adapter.support.shaderLoad === true,
          unorderedAccess: adapter.support.unorderedAccess === true,
          typedUavStore: adapter.support.typedUavStore === true,
        } : {},
        fsr1Compatible: adapter.fsr1Compatible === true,
      }));
      nativeFsrAdapterCache = { available: true, adapters, warpAvailable: report.warpAvailable === true, error: '' };
      nativeFsrAdapterCacheAt = Date.now();
      return nativeFsrAdapterCache;
    } catch (error) {
      nativeFsrAdapterCache = { available: false, adapters: [], warpAvailable: false, error: clampText(error?.message || 'D3D12 adapter enumeration failed.', 500) };
      nativeFsrAdapterCacheAt = Date.now();
      return nativeFsrAdapterCache;
    } finally {
      nativeFsrAdapterProbe = null;
    }
  })();
  return nativeFsrAdapterProbe;
}

function fsrCaptureOutputRoot() {
  if (process.argv.includes('--smoke-test') && process.env.TRICORE_FSR_SMOKE_OUT) {
    return path.resolve(process.env.TRICORE_FSR_SMOKE_OUT);
  }
  return path.join(app.getPath('userData'), 'fsr1-browser-frame-captures');
}

function sendFsrProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('browser:fsr-progress', payload);
  }
}

function isFsrJobCurrent(job) {
  return !job.cancelled && activeFsrJob === job;
}

async function processBrowserFsrFrames(payload, options = {}) {
  if (activeFsrJob || fsrCaptureRequestPending) return { ok: false, error: 'An FSR frame-capture test is already running.' };
  fsrCaptureRequestPending = true;
  try {
    return await processBrowserFsrFramesInternal(payload, options);
  } finally {
    fsrCaptureRequestPending = false;
  }
}

async function processBrowserFsrFramesInternal(payload, { useWarp = false, smokeTest = false } = {}) {
  const normalized = normalizeCaptureRequest(payload);
  if (!normalized.ok) return normalized;
  if (useWarp && !smokeTest) return { ok: false, error: 'WARP software processing is reserved for the packaged regression smoke test.' };
  if (activeFsrJob) return { ok: false, error: 'An FSR frame-capture test is already running.' };

  const adapters = await getNativeFsrAdapters({ refresh: true });
  const executable = nativeFsrExecutablePath();
  if (!executable || !adapters.available) {
    const reason = adapters.error || 'The native FSR1 helper is unavailable.';
    return { ok: false, error: reason };
  }
  let adapterIndex = normalized.adapterIndex;
  if (useWarp) {
    if (!adapters.warpAvailable) return { ok: false, error: 'D3D12 WARP is unavailable for this software-only regression test.' };
  } else {
    const compatibleAdapters = adapters.adapters.filter((adapter) => !adapter.softwareAdapter && adapter.fsr1Compatible);
    if (adapterIndex === null) adapterIndex = compatibleAdapters[0]?.index ?? null;
    const selected = compatibleAdapters.find((adapter) => adapter.index === adapterIndex);
    if (!selected) {
      const reason = compatibleAdapters.length
        ? 'The selected D3D12 adapter is no longer available or does not expose the required FSR1 features.'
        : 'No non-software D3D12 adapter with the required FSR1 features is available. WARP is software-only and is not used as a hardware fallback.';
      return { ok: false, error: reason };
    }
  }

  const slot = normalized.slot;
  const tab = coreTabs[slot].find((candidate) => candidate.id === normalized.tabId) || null;
  const contents = tab?.view?.webContents;
  const getCaptureContext = () => {
    const activeTab = activeTabs[slot];
    const destroyed = !contents || contents.isDestroyed();
    const viewBounds = !destroyed && tab?.view ? tab.view.getBounds() : null;
    const currentUrl = !destroyed ? contents.getURL() : '';
    const exactBundledSceneUrl = isBundledFsrTestSceneUrl(currentUrl);
    const context = validateCaptureContext({
      requestedSlot: slot,
      requestedTabId: normalized.tabId,
      activeSlot: slot,
      activeTabId: activeTab?.id || '',
      approvedScene: Boolean(tab?.isFsrTestScene && exactBundledSceneUrl),
      currentUrl: exactBundledSceneUrl ? FSR_TEST_SCENE_URL : currentUrl.split('#')[0],
      expectedUrl: FSR_TEST_SCENE_URL,
      loading: destroyed || contents.isLoading(),
      viewVisible: Boolean(viewBounds && viewBounds.width > 0 && viewBounds.height > 0),
      windowVisible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()),
    });
    if (!context.ok && smokeTest) {
      appendSmokeDiagnostic(`[smoke] Capture context denied: ${JSON.stringify({
        sceneFlag: Boolean(tab?.isFsrTestScene),
        exactBundledSceneUrl,
        currentUrl,
        expectedUrl: FSR_TEST_SCENE_URL,
        loading: destroyed || contents.isLoading(),
        viewBounds,
        windowVisible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()),
      })}`);
    }
    return context;
  };
  const context = getCaptureContext();
  if (!context.ok) return context;

  let sceneSnapshot;
  try {
    sceneSnapshot = await contents.executeJavaScript('window.triCoreFsrTest && window.triCoreFsrTest.getSnapshot()');
  } catch (error) {
    return { ok: false, error: `The bundled WebGL2 scene did not respond: ${clampText(error?.message, 300)}` };
  }
  if (!sceneSnapshot?.ok || sceneSnapshot.renderer !== 'webgl2' || !Number.isSafeInteger(sceneSnapshot.canvasWidth) || !Number.isSafeInteger(sceneSnapshot.canvasHeight)) {
    return { ok: false, error: 'The active tab is not reporting a working WebGL2 test scene; no frame was captured.' };
  }

  const originalSmokeViewBounds = smokeTest ? tab.view.getBounds() : null;
  const job = {
    id: crypto.randomUUID(), slot, tabId: tab.id, child: null, cancelled: false,
    nativeInitialized: false, nativeProcessing: false, frameIndex: 0, frameCount: normalized.frameCount,
  };
  activeFsrJob = job;
  const runStarted = process.hrtime.bigint();
  const runDirectory = path.join(fsrCaptureOutputRoot(), `${new Date().toISOString().replace(/[:.]/g, '-')}-${job.id}`);
  const results = [];
  let lastInputDataUrl = '';
  let lastOutputDataUrl = '';
  try {
    fs.mkdirSync(runDirectory, { recursive: true });
    for (let index = 0; index < normalized.frameCount; index += 1) {
      if (!isFsrJobCurrent(job)) throw new Error('Capture cancelled.');
      if (smokeTest && originalSmokeViewBounds && index > 0) {
        tab.view.setBounds({
          ...originalSmokeViewBounds,
          width: Math.max(64, originalSmokeViewBounds.width - index * 64),
          height: Math.max(64, originalSmokeViewBounds.height - index * 40),
        });
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      await new Promise((resolve) => setTimeout(resolve, index === 0 ? 120 : 180));
      const beforeCapture = getCaptureContext();
      if (!beforeCapture.ok) throw new Error(beforeCapture.error);
      const captureStarted = process.hrtime.bigint();
      const capturedImage = await contents.capturePage();
      const capturePageMs = Number(process.hrtime.bigint() - captureStarted) / 1e6;
      const afterCapture = getCaptureContext();
      if (!afterCapture.ok) throw new Error(`Capture was discarded because the approved scene is no longer active: ${afterCapture.error}`);
      if (capturedImage.isEmpty()) throw new Error('Electron capturePage() returned an empty image. The view may have been hidden or occluded.');
      const { width, height } = capturedImage.getSize();
      const dimensionCheck = validateCaptureDimensions(width, height);
      if (!dimensionCheck.ok) throw new Error(dimensionCheck.error);
      const inputBytes = capturedImage.toPNG();
      if (!inputBytes.length || inputBytes.length > MAX_FSR_PREVIEW_BYTES) {
        throw new Error('The captured PNG is empty or exceeds the 12 MiB per-frame preview safety limit.');
      }
      const inputPath = path.join(runDirectory, `frame-${String(index + 1).padStart(3, '0')}-webcontents.png`);
      const outputPath = path.join(runDirectory, `frame-${String(index + 1).padStart(3, '0')}-fsr1-easu-rcas.png`);
      const referencePath = buildBilinearReferencePath(outputPath);
      const reportPath = path.join(runDirectory, `frame-${String(index + 1).padStart(3, '0')}-report.json`);
      fs.writeFileSync(inputPath, inputBytes, { mode: 0o600 });
      const inputSha256 = crypto.createHash('sha256').update(inputBytes).digest('hex');
      const frameSceneSnapshot = await contents.executeJavaScript('window.triCoreFsrTest && window.triCoreFsrTest.getSnapshot()');
      if (!frameSceneSnapshot?.ok || frameSceneSnapshot.renderer !== 'webgl2') throw new Error('The test scene lost its WebGL2 context during capture.');
      const beforeNativeProcessing = getCaptureContext();
      if (!beforeNativeProcessing.ok) throw new Error(`Captured frame was not sent to FSR because the approved scene is no longer active: ${beforeNativeProcessing.error}`);

      const nativeArgs = buildNativeFsrArguments({
        inputPath,
        outputPath,
        reportPath,
        adapterIndex: useWarp ? null : adapterIndex,
        useWarp,
      });
      job.frameIndex = index + 1;
      job.nativeInitialized = false;
      job.nativeProcessing = false;
      sendFsrProgress({ jobId: job.id, slot, frameIndex: index + 1, frameCount: normalized.frameCount, state: 'PROCESSING', width, height });
      const nativeStarted = process.hrtime.bigint();
      await runNativeFsrProcess(executable, nativeArgs, { timeout: 60_000, job });
      const nativeProcessMs = Number(process.hrtime.bigint() - nativeStarted) / 1e6;
      if (!isFsrJobCurrent(job)) throw new Error('Capture cancelled.');
      const nativeReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const validation = validateNativeFsrReport(nativeReport, { width, height, referencePath });
      if (!validation.ok) throw new Error(validation.error);
      if (nativeReport.softwareAdapter !== useWarp) throw new Error('The native helper returned an unexpected software/hardware adapter classification.');

      const processedImage = nativeImage.createFromPath(outputPath);
      if (processedImage.isEmpty()) throw new Error('The processed FSR PNG could not be reopened for visual validation.');
      const processedSize = processedImage.getSize();
      if (processedSize.width !== validation.outputWidth || processedSize.height !== validation.outputHeight) {
        throw new Error('The processed FSR PNG dimensions do not match the native validation report.');
      }
      const referenceImage = nativeImage.createFromPath(referencePath);
      if (referenceImage.isEmpty()) throw new Error('The CPU bilinear-reference PNG could not be reopened for visual validation.');
      const referenceSize = referenceImage.getSize();
      if (referenceSize.width !== validation.outputWidth || referenceSize.height !== validation.outputHeight) {
        throw new Error('The bilinear-reference PNG dimensions do not match the 2× output dimensions.');
      }
      const outputBytes = fs.readFileSync(outputPath);
      if (!outputBytes.length || outputBytes.length > MAX_FSR_PREVIEW_BYTES) {
        throw new Error('The processed PNG is empty or exceeds the 12 MiB preview safety limit.');
      }
      const result = {
        frame: index + 1,
        frameNumber: Number(frameSceneSnapshot.frameNumber) || 0,
        sceneCanvasWidth: Number(frameSceneSnapshot.canvasWidth) || 0,
        sceneCanvasHeight: Number(frameSceneSnapshot.canvasHeight) || 0,
        webglRenderer: clampText(frameSceneSnapshot.backend || 'WebGL2 renderer not reported', 180),
        inputWidth: validation.inputWidth,
        inputHeight: validation.inputHeight,
        outputWidth: validation.outputWidth,
        outputHeight: validation.outputHeight,
        inputSha256,
        softwareAdapter: nativeReport.softwareAdapter,
        adapter: clampText(nativeReport.adapter, 180),
        adapterVendorId: clampText(nativeReport.adapterVendorId, 24),
        capturePageMs,
        nativeProcessMs,
        nativeGpuTimestampsAvailable: nativeReport.gpuTimestampsAvailable === true,
        easuGpuTimeMs: Number.isFinite(nativeReport.easuGpuTimeMs) ? nativeReport.easuGpuTimeMs : null,
        rcasGpuTimeMs: Number.isFinite(nativeReport.rcasGpuTimeMs) ? nativeReport.rcasGpuTimeMs : null,
        nativeEndToEndMs: Number.isFinite(nativeReport.nativeEndToEndMs) ? nativeReport.nativeEndToEndMs : null,
        captureToPreviewMs: Number(process.hrtime.bigint() - runStarted) / 1e6,
        checksum: nativeReport.checksum,
        meanAbsoluteDifferenceFromBilinear: nativeReport.meanAbsoluteDifferenceFromBilinear,
        inputPath,
        outputPath,
        referencePath,
        reportPath,
        nativeReport,
      };
      results.push(result);
      totalFsrProcessedFrames += 1;
      lastFsrReport = nativeReport;
      lastFsrFailure = '';
      lastInputDataUrl = `data:image/png;base64,${inputBytes.toString('base64')}`;
      lastOutputDataUrl = `data:image/png;base64,${outputBytes.toString('base64')}`;
      sendFsrProgress({
        jobId: job.id,
        slot,
        frameIndex: index + 1,
        frameCount: normalized.frameCount,
        state: 'FRAME PROCESSED',
        inputWidth: result.inputWidth,
        inputHeight: result.inputHeight,
        outputWidth: result.outputWidth,
        outputHeight: result.outputHeight,
        adapter: result.adapter,
        softwareAdapter: result.softwareAdapter,
      });
    }

    const distinctFrames = new Set(results.map(({ inputSha256 }) => inputSha256)).size;
    const distinctInputResolutions = new Set(results.map(({ inputWidth, inputHeight }) => `${inputWidth}x${inputHeight}`)).size;
    if (smokeTest && (distinctFrames !== normalized.frameCount || distinctInputResolutions !== normalized.frameCount)) {
      throw new Error('The WebGL2 smoke scene did not produce a unique changing frame at every tested input resolution.');
    }
    const totalRoundTripMs = Number(process.hrtime.bigint() - runStarted) / 1e6;
    const replyFrames = results.map(({ nativeReport, ...result }) => ({ ...result, nativeReport }));
    const finalReport = results[results.length - 1]?.nativeReport || null;
    return {
      ok: true,
      jobId: job.id,
      source: EXPECTED_INPUT_SOURCE,
      scope: 'Bundled animated WebGL2 test scene only; screenshot readback, separate D3D12 FSR1 processing, and diagnostic preview. Not zero-copy, real-time, or arbitrary-page upscaling.',
      frameCount: results.length,
      distinctInputFrames: distinctFrames,
      distinctInputResolutions,
      softwareAdapter: useWarp,
      totalRoundTripMs,
      frames: replyFrames,
      finalReport,
      inputPreview: lastInputDataUrl,
      outputPreview: lastOutputDataUrl,
      inputPath: results[results.length - 1]?.inputPath || '',
      outputPath: results[results.length - 1]?.outputPath || '',
      referencePath: results[results.length - 1]?.referencePath || '',
      reportPath: results[results.length - 1]?.reportPath || '',
    };
  } catch (error) {
    const reason = job.cancelled ? 'Capture cancelled by the user.' : clampText(error?.message || 'Browser-frame FSR processing failed.', 700);
    lastFsrFailure = reason;
    sendFsrProgress({ jobId: job.id, slot, frameIndex: results.length, frameCount: normalized.frameCount, state: job.cancelled ? 'CANCELLED' : 'FAILED', error: reason });
    return { ok: false, jobId: job.id, error: reason, partialFrames: results.length, frames: results.map(({ nativeReport, ...result }) => result) };
  } finally {
    if (smokeTest && originalSmokeViewBounds && !contents.isDestroyed()) {
      try { tab.view.setBounds(originalSmokeViewBounds); } catch { /* The smoke WebContentsView may have closed during teardown. */ }
    }
    if (activeFsrJob === job) activeFsrJob = null;
  }
}

function cancelBrowserFsrFrames(jobId) {
  if (!activeFsrJob || activeFsrJob.id !== String(jobId)) return false;
  activeFsrJob.cancelled = true;
  try { activeFsrJob.child?.kill(); } catch { /* A completed child needs no further action. */ }
  return true;
}

function getGPUFeatureStatus() {
  try {
    return app.getGPUFeatureStatus();
  } catch (error) {
    return { error: clampText(error?.message || 'GPU feature status unavailable.', 300) };
  }
}

async function getFsrWebGpuSceneSnapshots() {
  const activeScenes = activeTabs.map((tab, slot) => ({ tab, slot })).filter(({ tab }) => (
    tab?.isFsrWebGpuTestScene
    && tab.view
    && !tab.view.webContents.isDestroyed()
    && isBundledFsrWebGpuTestSceneUrl(tab.view.webContents.getURL())
  ));
  return Promise.all(activeScenes.map(async ({ tab, slot }) => {
    try {
      const snapshot = await tab.view.webContents.executeJavaScript('window.triCoreFsrWebGpuTest && window.triCoreFsrWebGpuTest.getSnapshot()');
      return snapshot && typeof snapshot === 'object'
        ? { ...snapshot, slot, tabId: tab.id }
        : { slot, tabId: tab.id, state: 'not-initialized', detected: false, compatible: false, initialized: false, failed: false, error: 'The bundled WebGPU test page has not published its status.' };
    } catch (error) {
      return { slot, tabId: tab.id, state: 'status-query-failed', failureStage: 'status-query', detected: false, compatible: false, initialized: false, failed: true, error: clampText(error?.message || 'WebGPU test page status query failed.', 300) };
    }
  }));
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
  const graphicsApiDetails = {
    glRenderer: clampText(gpuInfo?.auxAttributes?.glRenderer || gpuInfo?.gl?.renderer || '', 180),
    glVendor: clampText(gpuInfo?.auxAttributes?.glVendor || gpuInfo?.gl?.vendor || '', 160),
    glVersion: clampText(gpuInfo?.auxAttributes?.glVersion || gpuInfo?.gl?.version || '', 180),
    glImplementationParts: clampText(gpuInfo?.auxAttributes?.glImplementationParts || gpuInfo?.gl?.implementationParts || '', 180),
    angle: clampText(gpuInfo?.gl?.angle || '', 180),
    vulkan: clampText(gpuInfo?.vulkan?.version || gpuInfo?.vulkan?.status || '', 120),
  };
  const [nativeFsrAdapters, fsrWebGpuScenes] = await Promise.all([
    getNativeFsrAdapters(),
    getFsrWebGpuSceneSnapshots(),
  ]);
  const compatibleAdapters = nativeFsrAdapters.adapters.filter((adapter) => !adapter.softwareAdapter && adapter.fsr1Compatible);
  const helperExists = Boolean(nativeFsrExecutablePath());
  const fsrWebGpuScene = [...fsrWebGpuScenes].sort((left, right) => Number(right.processingFrames) - Number(left.processingFrames))[0] || null;
  const adapterApiStatus = !helperExists
    ? 'The separate D3D12 screenshot-diagnostic helper is not built or packaged.'
    : !nativeFsrAdapters.available
      ? `D3D12 diagnostic-adapter query failed: ${nativeFsrAdapters.error}`
      : `${nativeFsrAdapters.adapters.length} non-software D3D12 adapter(s) enumerated; ${compatibleAdapters.length} report the helper's FSR1 feature set. This is separate from the WebGPU game integration.`;
  const fsrReason = fsrWebGpuScene?.failed
    ? `The controlled WebGPU FSR1 scene failed during ${fsrWebGpuScene.failureStage || fsrWebGpuScene.state || 'runtime processing'}: ${fsrWebGpuScene.error || 'unknown WebGPU error'}. Standard Chromium rendering remains available.`
    : fsrWebGpuScene?.unsupported
      ? `WebGPU is unavailable for the controlled scene: ${fsrWebGpuScene.error || 'no compatible adapter was returned'}. Standard Chromium rendering remains available.`
      : fsrWebGpuScene?.processingFrames
        ? `The bundled WebGPU scene has completed ${Number(fsrWebGpuScene.framesCompleted) || 0} EASU + RCAS compute-dispatch frame(s) and submitted the output to its visible canvas. This is a game-owned integration example only; ordinary pages are not intercepted.`
        : fsrWebGpuScene?.initialized
          ? 'The EASU/RCAS compute and presentation pipelines are initialized, but no completed output frame is confirmed yet.'
          : 'Open the opt-in bundled WebGPU FSR1 scene to test the game-owned render-target path. Ordinary pages remain on standard Chromium.';
  const adapterDescription = fsrWebGpuScene?.adapter
    ? [fsrWebGpuScene.adapter.vendor, fsrWebGpuScene.adapter.device, fsrWebGpuScene.adapter.description].filter(Boolean).join(' · ')
    : '';
  const webGpuHardwareCompatibility = !fsrWebGpuScene
    ? 'WebGPU FSR1 scene not initialized; physical adapter compatibility NOT RUN.'
    : fsrWebGpuScene.softwareAdapter === true
      ? `${adapterDescription || 'WebGPU adapter identity reported'} · software adapter; not physical-GPU evidence.`
      : fsrWebGpuScene.softwareAdapter === false
        ? `${adapterDescription || 'WebGPU adapter identity reported'} · adapter identified as non-software; physical-GPU validation still requires a manual run.`
        : `${adapterDescription || 'WebGPU adapter initialized; identity not exposed'} · software/physical classification unknown; physical-GPU validation NOT RUN.`;
  const fsrFeature = {
    implemented: fs.existsSync(FSR_WEBGPU_TEST_SCENE_PATH),
    detected: Boolean(fsrWebGpuScene?.detected),
    adapterDetected: fsrWebGpuScene?.adapterDetected === true,
    state: String(fsrWebGpuScene?.state || (fsrWebGpuScene?.detected ? 'detected' : 'not-run')),
    failureStage: clampText(fsrWebGpuScene?.failureStage || '', 80),
    shaderCompilationStatus: String(fsrWebGpuScene?.shaderCompilationStatus || 'NOT RUN'),
    pipelineCreationStatus: String(fsrWebGpuScene?.pipelineCreationStatus || 'NOT RUN'),
    resourceInitializationStatus: String(fsrWebGpuScene?.resourceInitializationStatus || 'NOT RUN'),
    easuDispatches: Number.isSafeInteger(fsrWebGpuScene?.easuDispatches) ? fsrWebGpuScene.easuDispatches : 0,
    rcasDispatches: Number.isSafeInteger(fsrWebGpuScene?.rcasDispatches) ? fsrWebGpuScene.rcasDispatches : 0,
    framesPresented: Number.isSafeInteger(fsrWebGpuScene?.framesPresented) ? fsrWebGpuScene.framesPresented : 0,
    presentedOutput: fsrWebGpuScene?.presentedOutput === true,
    visibleOutputVerified: fsrWebGpuScene?.visibleOutputVerified === true,
    timestampQuerySupported: fsrWebGpuScene?.timestampQuerySupported === true,
    gpuTimestampsAvailable: fsrWebGpuScene?.gpuTimestampsAvailable === true,
    lastEasuGpuTimeMs: Number.isFinite(fsrWebGpuScene?.lastEasuGpuTimeMs) ? fsrWebGpuScene.lastEasuGpuTimeMs : null,
    lastRcasGpuTimeMs: Number.isFinite(fsrWebGpuScene?.lastRcasGpuTimeMs) ? fsrWebGpuScene.lastRcasGpuTimeMs : null,
    compatible: fsrWebGpuScene?.compatible === true,
    initialized: fsrWebGpuScene?.initialized === true,
    active: fsrWebGpuScene?.active === true,
    processingFrames: fsrWebGpuScene?.processingFrames === true,
    processedFrames: Number.isSafeInteger(fsrWebGpuScene?.framesCompleted) ? fsrWebGpuScene.framesCompleted : 0,
    queueCompletionWallMs: Number.isFinite(fsrWebGpuScene?.lastQueueCompletionWallMs) ? fsrWebGpuScene.lastQueueCompletionWallMs : null,
    averageQueueCompletionWallMs: Number.isFinite(fsrWebGpuScene?.averageQueueCompletionWallMs) ? fsrWebGpuScene.averageQueueCompletionWallMs : null,
    maxQueueCompletionWallMs: Number.isFinite(fsrWebGpuScene?.maxQueueCompletionWallMs) ? fsrWebGpuScene.maxQueueCompletionWallMs : null,
    inputWidth: Number.isSafeInteger(fsrWebGpuScene?.inputWidth) ? fsrWebGpuScene.inputWidth : null,
    inputHeight: Number.isSafeInteger(fsrWebGpuScene?.inputHeight) ? fsrWebGpuScene.inputHeight : null,
    outputWidth: Number.isSafeInteger(fsrWebGpuScene?.outputWidth) ? fsrWebGpuScene.outputWidth : null,
    outputHeight: Number.isSafeInteger(fsrWebGpuScene?.outputHeight) ? fsrWebGpuScene.outputHeight : null,
    failed: fsrWebGpuScene?.failed === true,
    deviceLost: fsrWebGpuScene?.deviceLost === true,
    error: clampText(fsrWebGpuScene?.error || '', 500),
    unsupported: fsrWebGpuScene?.unsupported === true,
    automaticEligible: false,
    hardwareCompatibility: webGpuHardwareCompatibility,
    reason: fsrReason,
    backend: 'Controlled WebGPU game color target → AMD FidelityFX FSR1 EASU compute → RCAS compute → visible-canvas presentation; no CPU readback for processing. Explicit post-run validation may copy textures for diagnostics only.',
    scope: 'Opt-in bundled WebGPU game scene only. No arbitrary-page/compositor interception; automatic mode deliberately does not apply this scene-specific integration to ordinary tabs.',
    adapterApiStatus,
    webGpuScenes: fsrWebGpuScenes,
  };
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron || '',
    chromiumVersion: process.versions.chrome || '',
    platform: process.platform,
    architecture: process.arch,
    gpuDevices,
    gpuInfoError,
    graphicsApiDetails,
    featureStatus,
    nativeFsrAdapters,
    fsrWebGpuScenes,
    lastFsrReport: lastFsrReport ? {
      adapter: clampText(lastFsrReport.adapter || '', 180),
      adapterVendorId: clampText(lastFsrReport.adapterVendorId || '', 24),
      softwareAdapter: lastFsrReport.softwareAdapter === true,
      input: lastFsrReport.input,
      output: lastFsrReport.output,
      gpuTimestampsAvailable: lastFsrReport.gpuTimestampsAvailable === true,
      easuGpuTimeMs: Number.isFinite(lastFsrReport.easuGpuTimeMs) ? lastFsrReport.easuGpuTimeMs : null,
      rcasGpuTimeMs: Number.isFinite(lastFsrReport.rcasGpuTimeMs) ? lastFsrReport.rcasGpuTimeMs : null,
      inputCapturePath: clampText(lastFsrReport.inputCapturePath || '', 500),
      processedCapturePath: clampText(lastFsrReport.processedCapturePath || '', 500),
    } : null,
    integration: {
      wasm: { implemented: true, scope: 'controlled WebAssembly test in Chromium V8; not a webpage frame-rate switch' },
      dlss: { implemented: false, detected: false, automaticEligible: false, scope: 'not integrated; no Streamline/DLSS native renderer or webpage texture bridge' },
      fsr: fsrFeature,
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

function compactWebGpuOutputEvidence(validation) {
  if (!validation || typeof validation !== 'object') return null;
  return {
    state: validation.state || '',
    purpose: validation.purpose || '',
    readbackForProcessing: validation.readbackForProcessing,
    diagnosticReadback: validation.diagnosticReadback === true,
    framesSubmittedAtCapture: Number.isSafeInteger(validation.framesSubmittedAtCapture) ? validation.framesSubmittedAtCapture : null,
    framesCompletedAtCapture: Number.isSafeInteger(validation.framesCompletedAtCapture) ? validation.framesCompletedAtCapture : null,
    input: validation.input || null,
    easu: validation.easu || null,
    rcas: validation.rcas || null,
    dispatch: validation.dispatch || null,
    visibleSampleCount: Array.isArray(validation.visibleSamples) ? validation.visibleSamples.length : 0,
  };
}

function collectSmokeArtifactInventory(root, limit = 160) {
  const inventory = [];
  if (!root || !fs.existsSync(root)) return inventory;
  const pending = [{ absolutePath: root, relativePath: '', depth: 0 }];
  while (pending.length && inventory.length < limit) {
    const directory = pending.shift();
    let entries;
    try {
      entries = fs.readdirSync(directory.absolutePath, { withFileTypes: true });
    } catch (error) {
      inventory.push({ path: directory.relativePath || '.', type: 'unreadable-directory', error: clampText(error?.message || error, 300) });
      continue;
    }
    for (const entry of entries) {
      if (inventory.length >= limit) break;
      const relativePath = path.posix.join(directory.relativePath.replaceAll(path.sep, '/'), entry.name);
      const absolutePath = path.join(directory.absolutePath, entry.name);
      if (entry.isSymbolicLink()) {
        inventory.push({ path: relativePath, type: 'symbolic-link-not-followed' });
      } else if (entry.isDirectory()) {
        inventory.push({ path: relativePath, type: 'directory' });
        if (directory.depth < 3) pending.push({ absolutePath, relativePath, depth: directory.depth + 1 });
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(absolutePath);
          const artifact = { path: relativePath, type: 'file', bytes: stat.size };
          if (stat.size <= 64 * 1024 * 1024) {
            artifact.sha256 = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
          } else {
            artifact.sha256 = 'NOT COMPUTED: file exceeds the 64 MiB failure-inventory limit';
          }
          inventory.push(artifact);
        } catch (error) {
          inventory.push({ path: relativePath, type: 'unreadable-file', error: clampText(error?.message || error, 300) });
        }
      }
    }
  }
  if (pending.length || inventory.length >= limit) inventory.push({ truncated: true, maximumEntries: limit });
  return inventory;
}

function saveWebGpuDiagnosticPng(outputPath, dataUrl, label, expectedWidth, expectedHeight) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!match) throw new Error(`${label} post-processing diagnostic is not a base64 PNG data URL.`);
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < 80 || bytes.length > 32 * 1024 * 1024
      || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) {
    throw new Error(`${label} post-processing diagnostic PNG is empty, malformed, or exceeds the 32 MiB safety limit.`);
  }
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw new Error(`${label} diagnostic PNG could not be decoded by Electron.`);
  const dimensions = image.getSize();
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error(`${label} diagnostic image dimensions ${dimensions.width}×${dimensions.height} differ from expected ${expectedWidth}×${expectedHeight}.`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes, { mode: 0o600 });
  return {
    path: outputPath,
    format: 'PNG',
    width: dimensions.width,
    height: dimensions.height,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    purpose: 'Post-processing diagnostic capture only; not used as an FSR input.',
  };
}

async function runSmokeTest() {
  const startedAt = Date.now();
  let localServer;
  let smokeStage = 'startup';
  let webGpuSmokeStarted = false;
  let webGpuSnapshot = null;
  const webGpuEvidence = {
    firstOutputValidation: null,
    outputValidation: null,
    stageAnalysis: null,
    motionCheck: null,
    diagnosticCaptures: null,
    visibleCanvasComparison: null,
    visibleCapturePath: '',
    summaryPath: '',
  };
  try {
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window did not start.');
    if (process.env.TRICORE_REQUIRE_FSR_INTEGRATION_SMOKE === 'PASS') {
      mainWindow.show();
      mainWindow.focus();
    }
    smokeStage = 'browser-shell-and-ui';
    writeSmokeDiagnostic(`[smoke] Runtime versions: Electron ${process.versions.electron}; Chromium ${process.versions.chrome}; Node.js ${process.versions.node}.`);
    const initialGraphicsDiagnostics = await getGraphicsDiagnostics();
    writeSmokeDiagnostic(`[smoke] Electron GPU devices: ${JSON.stringify(initialGraphicsDiagnostics.gpuDevices)}; Chromium graphics implementation details: ${JSON.stringify(initialGraphicsDiagnostics.graphicsApiDetails)}; D3D12 adapters: ${JSON.stringify(initialGraphicsDiagnostics.nativeFsrAdapters)}`);
    const title = await mainWindow.webContents.executeJavaScript('document.title');
    if (title !== 'Tri-Core Browser') throw new Error(`Unexpected UI title: ${title}`);
    const uiControls = await mainWindow.webContents.executeJavaScript(`({
      graphics: Boolean(document.querySelector('#graphics-dialog')),
      wasm: Boolean(document.querySelector('[data-graphics-mode="wasm"]')),
      dlss: Boolean(document.querySelector('[data-graphics-mode="dlss"]')),
      fsr: Boolean(document.querySelector('[data-graphics-mode="fsr"]')),
      fsrWebGpuIntegration: Boolean(document.querySelector('#fsr-open-webgpu-test-scene')),
      fsrPngDiagnostic: Boolean(document.querySelector('#fsr-open-test-scene')),
      hybrid: Boolean(document.querySelector('[data-graphics-mode="hybrid"]')),
      standard: Boolean(document.querySelector('[data-graphics-mode="standard"]')),
      tabs: Boolean(document.querySelector('[data-tabbar="0"]')),
      immersiveToggle: Boolean(document.querySelector('#immersive-toggle')),
      immersiveExit: Boolean(document.querySelector('#immersive-exit'))
    })`);
    if (Object.values(uiControls).some((value) => !value)) throw new Error(`A required browser control is missing: ${JSON.stringify(uiControls)}`);
    writeSmokeDiagnostic(`[smoke] Browser shell, five mode controls, and immersive fullscreen controls: PASS ${JSON.stringify(uiControls)}`);

    if (process.env.TRICORE_REQUIRE_FSR_INTEGRATION_SMOKE === 'PASS') {
      smokeStage = 'immersive-fullscreen-toggle';
      await mainWindow.webContents.executeJavaScript("document.querySelector('#immersive-toggle').click()");
      let immersiveReady = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const uiState = await mainWindow.webContents.executeJavaScript(`({
          immersive: document.body.classList.contains('is-immersive'),
          exitVisible: !document.querySelector('#immersive-exitbar').hidden
            && document.querySelector('#immersive-exit').getClientRects().length > 0,
          appChromeHidden: ['.topbar', '#performance-panel', '.pane-heading', '.pane-tabbar', '.pane-toolbar', '.pane-footer']
            .every((selector) => getComputedStyle(document.querySelector(selector)).display === 'none'),
          exitStripBottom: document.querySelector('#immersive-exitbar').getBoundingClientRect().bottom,
          selectedCore: document.querySelector('#browser-grid').dataset.focus
        })`);
        const bounds = activeTabFor(0)?.view?.getBounds();
        const content = mainWindow.getContentBounds();
        if (mainWindow.isFullScreen() && uiState.immersive && uiState.exitVisible && uiState.appChromeHidden && uiState.selectedCore === '0'
            && bounds?.x <= 4 && bounds?.y >= uiState.exitStripBottom - 1
            && bounds?.width >= content.width * 0.9 && bounds?.height >= content.height - uiState.exitStripBottom - 10) {
          immersiveReady = true;
          break;
        }
      }
      if (!immersiveReady) throw new Error('The immersive button did not expand the active browser core to the fullscreen window while retaining the exit control.');
      writeSmokeDiagnostic('[smoke] Active-core immersive fullscreen: PASS; operating-system fullscreen entered, other browser controls hidden, selected WebContentsView expanded, and accessible exit button retained.');
      await mainWindow.webContents.executeJavaScript("document.querySelector('#immersive-exit').click()");
      let immersiveRestored = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const uiState = await mainWindow.webContents.executeJavaScript(`({
          immersive: document.body.classList.contains('is-immersive'),
          exitHidden: document.querySelector('#immersive-exitbar').hidden,
          focusedCore: document.querySelector('#browser-grid').dataset.focus || '',
          allCoresVisible: [...document.querySelectorAll('.browser-pane')].every((pane) => pane.getClientRects().length > 0),
          browserControlsVisible: getComputedStyle(document.querySelector('.topbar')).display !== 'none'
            && getComputedStyle(document.querySelector('.pane-toolbar')).display !== 'none'
        })`);
        if (!mainWindow.isFullScreen() && !uiState.immersive && uiState.exitHidden && uiState.focusedCore === ''
            && uiState.allCoresVisible && uiState.browserControlsVisible) {
          immersiveRestored = true;
          break;
        }
      }
      if (!immersiveRestored) throw new Error('Exiting immersive fullscreen did not restore the original three-core browser layout.');
      writeSmokeDiagnostic('[smoke] Immersive fullscreen exit: PASS; window restored and all three cores/browser controls returned.');
    }

    smokeStage = 'local-http-javascript-wasm';
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
    writeSmokeDiagnostic(`[smoke] Local HTTP website, JavaScript and WebAssembly add(19,23)=42: PASS (${loadedUrl})`);

    smokeStage = 'browser-tab-regression';
    const newTab = createTab(0, testUrl, { activate: true });
    if (!newTab || !(await newTab.loadPromise)) throw new Error('Creating/loading a second browser tab failed.');
    if (stateFor(0).tabs.length !== 2 || stateFor(0).id !== newTab.id) throw new Error('Tab list or active-tab state is incorrect.');
    if (!closeTab(0, newTab.id) || stateFor(0).tabs.length !== 1) throw new Error('Closing the second tab failed.');
    writeSmokeDiagnostic('[smoke] Add, activate and close a tab while retaining the last tab: PASS');

    try {
      const httpsUrl = await waitForNavigation(smokeTab.view.webContents, 'https://example.com/', 20_000);
      if (!httpsUrl.startsWith('https://')) throw new Error('HTTPS navigation did not remain HTTPS.');
      writeSmokeDiagnostic(`[smoke] HTTPS navigation with Chromium certificate validation: PASS (${httpsUrl})`);
    } catch (error) {
      writeSmokeDiagnostic(`[smoke] HTTPS external-network probe: BLOCKED (${clampText(error?.message, 220)}); no certificate bypass was used.`);
    }

    if (process.env.TRICORE_REQUIRE_FSR_INTEGRATION_SMOKE === 'PASS') {
      smokeStage = 'capturepage-fsr-diagnostic';
      const sceneTab = createTab(0, homeUrl, { activate: true, fsrTestScene: true });
      if (!sceneTab || !(await sceneTab.loadPromise)) throw new Error('The bundled WebGL2 FSR test scene could not be opened in a real WebContentsView.');
      const contentBounds = mainWindow.getContentBounds();
      if (!layoutBounds[0] || layoutBounds[0].width < 64 || layoutBounds[0].height < 64) {
        layoutBounds[0] = { x: 0, y: 0, width: Math.max(320, Math.floor(contentBounds.width / 3)), height: Math.max(240, Math.floor(contentBounds.height * 0.7)) };
        applyLayoutForCore(0);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const sceneSnapshot = await sceneTab.view.webContents.executeJavaScript('window.triCoreFsrTest && window.triCoreFsrTest.getSnapshot()');
      if (!sceneSnapshot?.ok || sceneSnapshot.renderer !== 'webgl2' || sceneSnapshot.canvasWidth < 1 || sceneSnapshot.canvasHeight < 1) {
        throw new Error(`The bundled test scene did not initialize a visible animated WebGL2 canvas: ${JSON.stringify(sceneSnapshot)}`);
      }
      const fsrResult = await processBrowserFsrFrames({ slot: 0, tabId: sceneTab.id, frameCount: 3, adapterIndex: null }, { useWarp: true, smokeTest: true });
      if (!fsrResult.ok || fsrResult.frameCount !== 3 || fsrResult.distinctInputFrames !== 3 || fsrResult.distinctInputResolutions !== 3) {
        throw new Error(`Browser-capture-to-FSR WARP regression failed: ${fsrResult.error || JSON.stringify(fsrResult)}`);
      }
      if (fsrResult.frames.some((frame) => !frame.softwareAdapter || frame.nativeReport?.inputSource !== EXPECTED_INPUT_SOURCE || frame.nativeReport?.processingStatus !== 'PASS')) {
        throw new Error('The end-to-end browser-frame regression did not validate three WARP-processed capturePage PNG frames.');
      }
      const summaryPath = path.join(fsrCaptureOutputRoot(), 'browser-frame-smoke-summary.json');
      fs.writeFileSync(summaryPath, `${JSON.stringify({
        status: 'PASS',
        source: EXPECTED_INPUT_SOURCE,
        scene: sceneSnapshot,
        runtime: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node },
        chromiumGraphicsImplementation: initialGraphicsDiagnostics.graphicsApiDetails,
        chromiumGpuDevices: initialGraphicsDiagnostics.gpuDevices,
        nativeAdapterEnumeration: initialGraphicsDiagnostics.nativeFsrAdapters,
        scope: fsrResult.scope,
        softwareAdapter: fsrResult.softwareAdapter,
        frameCount: fsrResult.frameCount,
        distinctInputFrames: fsrResult.distinctInputFrames,
        distinctInputResolutions: fsrResult.distinctInputResolutions,
        totalRoundTripMs: fsrResult.totalRoundTripMs,
        frames: fsrResult.frames.map((frame) => ({
          frame: frame.frame,
          frameNumber: frame.frameNumber,
          sceneCanvasWidth: frame.sceneCanvasWidth,
          sceneCanvasHeight: frame.sceneCanvasHeight,
          webglRenderer: frame.webglRenderer,
          inputWidth: frame.inputWidth,
          inputHeight: frame.inputHeight,
          outputWidth: frame.outputWidth,
          outputHeight: frame.outputHeight,
          inputSha256: frame.inputSha256,
          adapter: frame.adapter,
          adapterVendorId: frame.adapterVendorId,
          softwareAdapter: frame.softwareAdapter,
          capturePageMs: frame.capturePageMs,
          nativeProcessMs: frame.nativeProcessMs,
          nativeGpuTimestampsAvailable: frame.nativeGpuTimestampsAvailable,
          easuGpuTimeMs: frame.easuGpuTimeMs,
          rcasGpuTimeMs: frame.rcasGpuTimeMs,
          nativeEndToEndMs: frame.nativeEndToEndMs,
          captureToPreviewMs: frame.captureToPreviewMs,
          checksum: frame.checksum,
          meanAbsoluteDifferenceFromBilinear: frame.meanAbsoluteDifferenceFromBilinear,
          inputPath: frame.inputPath,
          outputPath: frame.outputPath,
          referencePath: frame.referencePath,
          reportPath: frame.reportPath,
          nativeReport: frame.nativeReport,
        })),
      }, null, 2)}\n`, { mode: 0o600 });
      writeSmokeDiagnostic(`[smoke] Diagnostic-only WebContentsView WebGL2 capture → capturePage PNG → AMD FSR1 D3D12 helper on WARP → PNG validation: PASS; adapter=${fsrResult.frames[0].adapter} (WARP SOFTWARE); frames=${fsrResult.frameCount}; distinct browser input frames=${fsrResult.distinctInputFrames}; distinct capture resolutions=${fsrResult.distinctInputResolutions}; latest ${fsrResult.frames[2].inputWidth}x${fsrResult.frames[2].inputHeight} -> ${fsrResult.frames[2].outputWidth}x${fsrResult.frames[2].outputHeight}; report=${fsrResult.reportPath}; summary=${summaryPath}`);

      smokeStage = 'webgpu-scene-load';
      webGpuSmokeStarted = true;
      const webGpuSceneTab = createTab(0, homeUrl, { activate: true, fsrWebGpuTestScene: true });
      if (!webGpuSceneTab || !(await webGpuSceneTab.loadPromise)) throw new Error('The bundled WebGPU FSR1 game-integration scene could not be opened in a real WebContentsView.');
      if (!layoutBounds[0] || layoutBounds[0].width < 64 || layoutBounds[0].height < 64) {
        layoutBounds[0] = { x: 0, y: 0, width: Math.max(320, Math.floor(contentBounds.width / 3)), height: Math.max(240, Math.floor(contentBounds.height * 0.7)) };
        applyLayoutForCore(0);
      }
      const webGpuContents = webGpuSceneTab.view.webContents;
      smokeStage = 'webgpu-pipeline-dispatch-validation';
      const webGpuDeadline = Date.now() + 60_000;
      while (Date.now() < webGpuDeadline) {
        webGpuSnapshot = await webGpuContents.executeJavaScript('window.triCoreFsrWebGpuTest && window.triCoreFsrWebGpuTest.getSnapshot()');
        if (webGpuSnapshot?.failed || webGpuSnapshot?.unsupported) {
          throw new Error(`The bundled WebGPU FSR1 scene failed during ${webGpuSnapshot.failureStage || webGpuSnapshot.state}: ${webGpuSnapshot.error || JSON.stringify(webGpuSnapshot)}`);
        }
        if (Number(webGpuSnapshot?.framesCompleted) >= 3) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!webGpuSnapshot || Number(webGpuSnapshot.framesCompleted) < 3 || !webGpuSnapshot.processingFrames) {
        throw new Error(`The WebGPU FSR1 scene did not complete three visible output frames within 60 seconds: ${JSON.stringify(webGpuSnapshot)}`);
      }
      if (!(webGpuSnapshot.inputWidth > 0 && webGpuSnapshot.inputHeight > 0
        && webGpuSnapshot.outputWidth > webGpuSnapshot.inputWidth
        && webGpuSnapshot.outputHeight > webGpuSnapshot.inputHeight)) {
        throw new Error(`The WebGPU FSR1 scene did not report a lower-resolution input and larger visible output: ${JSON.stringify(webGpuSnapshot)}`);
      }
      if (webGpuSnapshot.shaderCompilationStatus !== 'passed'
          || webGpuSnapshot.pipelineCreationStatus !== 'passed'
          || webGpuSnapshot.easuComputePipelineInitialized !== true
          || webGpuSnapshot.rcasComputePipelineInitialized !== true
          || webGpuSnapshot.presentationPipelineInitialized !== true
          || Number(webGpuSnapshot.easuDispatches) < 3
          || Number(webGpuSnapshot.rcasDispatches) < 3) {
        throw new Error(`EASU/RCAS compute shader compilation, pipeline creation, or dispatch evidence is incomplete: ${JSON.stringify(webGpuSnapshot)}`);
      }

      smokeStage = 'webgpu-first-frame-diagnostic-readback';
      const firstFreeze = await webGpuContents.executeJavaScript('window.triCoreFsrWebGpuTest.freezeAtCompletedFrame()');
      if (!firstFreeze?.evidenceFrozen) throw new Error(`The first WebGPU output frame could not be frozen for repeatable validation: ${JSON.stringify(firstFreeze)}`);
      const firstOutputValidation = await webGpuContents.executeJavaScript('window.triCoreFsrWebGpuTest.validateLatestOutput({ includeImages: false })');
      webGpuEvidence.firstOutputValidation = firstOutputValidation;
      if (firstOutputValidation?.state !== 'PASS' || firstOutputValidation.readbackForProcessing !== false) {
        throw new Error(`The first post-processing-only WebGPU output sample failed: ${JSON.stringify(firstOutputValidation)}`);
      }
      if (!await webGpuContents.executeJavaScript('window.triCoreFsrWebGpuTest.resumeFrames()')) {
        throw new Error('The WebGPU game scene could not resume after its first output validation capture.');
      }
      smokeStage = 'webgpu-motion-validation';
      const motionFrameTarget = Number(firstOutputValidation.framesCompletedAtCapture) + 2;
      const motionDeadline = Date.now() + 15_000;
      while (Date.now() < motionDeadline) {
        webGpuSnapshot = await webGpuContents.executeJavaScript('window.triCoreFsrWebGpuTest.getSnapshot()');
        if (webGpuSnapshot?.failed || webGpuSnapshot?.unsupported) {
          throw new Error(`The WebGPU device/runtime failed during motion validation at ${webGpuSnapshot.failureStage || webGpuSnapshot.state}: ${webGpuSnapshot.error || JSON.stringify(webGpuSnapshot)}`);
        }
        if (Number(webGpuSnapshot?.framesCompleted) >= motionFrameTarget) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (Number(webGpuSnapshot?.framesCompleted) < motionFrameTarget) {
        throw new Error(`The WebGPU scene did not render two more frames for motion validation: ${JSON.stringify(webGpuSnapshot)}`);
      }
      const secondFreeze = await webGpuContents.executeJavaScript('window.triCoreFsrWebGpuTest.freezeAtCompletedFrame()');
      if (!secondFreeze?.evidenceFrozen) throw new Error(`The second WebGPU output frame could not be frozen: ${JSON.stringify(secondFreeze)}`);
      const outputValidation = await webGpuContents.executeJavaScript('window.triCoreFsrWebGpuTest.validateLatestOutput({ includeImages: true })');
      webGpuEvidence.outputValidation = outputValidation;
      if (outputValidation?.state !== 'PASS' || outputValidation.readbackForProcessing !== false || outputValidation.diagnosticReadback !== true) {
        throw new Error(`The frozen WebGPU output did not pass its post-processing-only readback validation: ${JSON.stringify(outputValidation)}`);
      }

      smokeStage = 'webgpu-stage-comparison-and-capture';
      const smokeOut = fsrCaptureOutputRoot();
      const diagnosticPngs = outputValidation.diagnosticImages || {};
      const diagnosticCaptures = {
        lowResolutionInput: saveWebGpuDiagnosticPng(
          path.join(smokeOut, 'fsr1-webgpu-low-resolution-input.png'),
          diagnosticPngs.input,
          'Low-resolution game target',
          webGpuSnapshot.inputWidth,
          webGpuSnapshot.inputHeight,
        ),
        easuIntermediate: saveWebGpuDiagnosticPng(
          path.join(smokeOut, 'fsr1-webgpu-easu-intermediate.png'),
          diagnosticPngs.easu,
          'EASU intermediate',
          webGpuSnapshot.outputWidth,
          webGpuSnapshot.outputHeight,
        ),
        rcasOutput: saveWebGpuDiagnosticPng(
          path.join(smokeOut, 'fsr1-webgpu-rcas-output.png'),
          diagnosticPngs.rcas,
          'RCAS output texture',
          webGpuSnapshot.outputWidth,
          webGpuSnapshot.outputHeight,
        ),
      };
      webGpuEvidence.diagnosticCaptures = diagnosticCaptures;
      const inputImage = nativeImage.createFromBuffer(fs.readFileSync(diagnosticCaptures.lowResolutionInput.path));
      const easuImage = nativeImage.createFromBuffer(fs.readFileSync(diagnosticCaptures.easuIntermediate.path));
      const rcasImage = nativeImage.createFromBuffer(fs.readFileSync(diagnosticCaptures.rcasOutput.path));
      const inputSize = inputImage.getSize();
      const easuSize = easuImage.getSize();
      const rcasSize = rcasImage.getSize();
      const stageAnalysis = analyzeRgbaStages({
        input: bitmapToRgba(inputImage.toBitmap({ scaleFactor: 1, colorSpace: 'srgb' }), inputSize.width, inputSize.height),
        inputWidth: inputSize.width,
        inputHeight: inputSize.height,
        easu: bitmapToRgba(easuImage.toBitmap({ scaleFactor: 1, colorSpace: 'srgb' }), easuSize.width, easuSize.height),
        easuWidth: easuSize.width,
        easuHeight: easuSize.height,
        output: bitmapToRgba(rcasImage.toBitmap({ scaleFactor: 1, colorSpace: 'srgb' }), rcasSize.width, rcasSize.height),
        outputWidth: rcasSize.width,
        outputHeight: rcasSize.height,
      });
      webGpuEvidence.stageAnalysis = stageAnalysis;
      const motionCheck = {
        firstFrame: Number(firstOutputValidation.framesCompletedAtCapture),
        secondFrame: Number(outputValidation.framesCompletedAtCapture),
        firstInputFingerprintFNV1a32: firstOutputValidation.input?.fnv1a32 || null,
        secondInputFingerprintFNV1a32: outputValidation.input?.fnv1a32 || null,
        changed: Boolean(firstOutputValidation.input?.fnv1a32)
          && Boolean(outputValidation.input?.fnv1a32)
          && firstOutputValidation.input.fnv1a32 !== outputValidation.input.fnv1a32,
        fingerprintDefinition: 'FNV-1a 32-bit over the low-resolution RGBA WebGPU texture; equality is used only to detect a changed scene frame, not for security.',
      };
      webGpuEvidence.motionCheck = motionCheck;

      const canvasEvidenceInfo = await webGpuContents.executeJavaScript(`(() => {
        const target = document.getElementById('game-canvas');
        if (!target) return null;
        const bounds = target.getBoundingClientRect();
        return {
          canvasRect: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
          canvasWidth: target.width,
          canvasHeight: target.height,
          devicePixelRatio: window.devicePixelRatio || 1,
          pageState: document.documentElement.dataset.fsr1State || '',
        };
      })()`);
      if (!canvasEvidenceInfo || canvasEvidenceInfo.canvasWidth !== webGpuSnapshot.outputWidth
          || canvasEvidenceInfo.canvasHeight !== webGpuSnapshot.outputHeight) {
        throw new Error(`Visible canvas bounds/dimensions do not match the frozen WebGPU FSR1 output: ${JSON.stringify(canvasEvidenceInfo)}`);
      }

      smokeStage = 'webgpu-visible-canvas-capture-comparison';
      // This full-WebContentsView PNG is evidence only and is never an FSR input.
      const visibleCaptureStarted = process.hrtime.bigint();
      const visibleImage = await webGpuContents.capturePage();
      const visibleCapturePageMs = Number(process.hrtime.bigint() - visibleCaptureStarted) / 1e6;
      if (visibleImage.isEmpty()) throw new Error('The post-processing WebGPU output evidence capture was empty.');
      const visibleImageBytes = visibleImage.toPNG();
      if (visibleImageBytes.length < 80 || visibleImageBytes[0] !== 137 || visibleImageBytes[1] !== 80 || visibleImageBytes[2] !== 78 || visibleImageBytes[3] !== 71) {
        throw new Error('The post-processing WebGPU output evidence capture is not a valid PNG.');
      }
      const visibleCapturePath = path.join(smokeOut, 'fsr1-webgpu-visible-output.png');
      webGpuEvidence.visibleCapturePath = visibleCapturePath;
      fs.mkdirSync(path.dirname(visibleCapturePath), { recursive: true });
      fs.writeFileSync(visibleCapturePath, visibleImageBytes, { mode: 0o600 });
      const visibleCaptureSize = visibleImage.getSize();
      const visibleCanvasComparison = compareVisibleCanvasSamples({
        screenshot: visibleImage.toBitmap({ scaleFactor: 1, colorSpace: 'srgb' }),
        screenshotWidth: visibleCaptureSize.width,
        screenshotHeight: visibleCaptureSize.height,
        viewWidth: webGpuSceneTab.view.getBounds().width,
        viewHeight: webGpuSceneTab.view.getBounds().height,
        canvasRect: canvasEvidenceInfo.canvasRect,
        expectedSamples: outputValidation.visibleSamples,
      });
      webGpuEvidence.visibleCanvasComparison = visibleCanvasComparison;
      const presentationConfirmed = visibleCanvasComparison.status === 'PASS'
        && await webGpuContents.executeJavaScript('window.triCoreFsrWebGpuTest.markVisibleOutputVerified()') === true;
      const imageValidationPassed = stageAnalysis.status === 'PASS' && motionCheck.changed && presentationConfirmed;
      smokeStage = 'webgpu-summary-and-assertions';
      const webGpuSummaryPath = path.join(smokeOut, 'fsr1-webgpu-summary.json');
      webGpuEvidence.summaryPath = webGpuSummaryPath;
      const webGpuSummary = {
        status: imageValidationPassed ? 'PASS' : 'FAIL',
        integration: 'live game-side WebGPU game target → FSR1 EASU compute dispatch → RCAS compute dispatch → fullscreen presentation pass → visible canvas',
        api: webGpuSnapshot.api,
        implementation: webGpuSnapshot.implementation,
        scope: webGpuSnapshot.scope,
        physicalGpuValidation: 'NOT RUN',
        readbackForProcessing: false,
        postProcessingReadbackForValidation: true,
        postProcessingReadbackDefinition: outputValidation.purpose,
        screenshotCapture: 'capturePage PNG after processed canvas presentation; evidence only and never used as an FSR input',
        adapter: webGpuSnapshot.adapter,
        adapterInfoAvailable: webGpuSnapshot.adapterInfoAvailable,
        softwareAdapter: webGpuSnapshot.softwareAdapter,
        softwareClassification: webGpuSnapshot.softwareAdapter === true ? 'reported software adapter' : webGpuSnapshot.softwareAdapter === false ? 'reported non-software adapter; physical identity not established' : 'unknown',
        lifecycle: {
          state: webGpuSnapshot.state,
          adapterDetected: webGpuSnapshot.adapterDetected === true,
          shaderCompilationStatus: webGpuSnapshot.shaderCompilationStatus,
          pipelineCreationStatus: webGpuSnapshot.pipelineCreationStatus,
          resourceInitializationStatus: webGpuSnapshot.resourceInitializationStatus,
          easuComputePipelineInitialized: webGpuSnapshot.easuComputePipelineInitialized,
          rcasComputePipelineInitialized: webGpuSnapshot.rcasComputePipelineInitialized,
          presentationPipelineInitialized: webGpuSnapshot.presentationPipelineInitialized,
          outputSubmittedToVisibleCanvas: webGpuSnapshot.presentedOutput,
          visibleCanvasScreenshotCompared: visibleCanvasComparison.status === 'PASS',
          visibleOutputVerified: presentationConfirmed,
        },
        dispatch: {
          workgroupSize: webGpuSnapshot.workgroupSize,
          workgroupsX: webGpuSnapshot.workgroupsX,
          workgroupsY: webGpuSnapshot.workgroupsY,
          easuDispatches: webGpuSnapshot.easuDispatches,
          rcasDispatches: webGpuSnapshot.rcasDispatches,
        },
        input: { width: webGpuSnapshot.inputWidth, height: webGpuSnapshot.inputHeight },
        intermediate: { width: webGpuSnapshot.outputWidth, height: webGpuSnapshot.outputHeight },
        output: { width: webGpuSnapshot.outputWidth, height: webGpuSnapshot.outputHeight },
        renderScale: webGpuSnapshot.renderScale,
        framesSubmitted: webGpuSnapshot.framesSubmitted,
        processedFrames: webGpuSnapshot.framesCompleted,
        framesPresented: webGpuSnapshot.framesPresented,
        timingDefinition: webGpuSnapshot.timingDefinition,
        lastQueueCompletionWallMs: webGpuSnapshot.lastQueueCompletionWallMs,
        averageQueueCompletionWallMs: webGpuSnapshot.averageQueueCompletionWallMs,
        maxQueueCompletionWallMs: webGpuSnapshot.maxQueueCompletionWallMs,
        gpuTimestamps: {
          supported: webGpuSnapshot.timestampQuerySupported,
          available: webGpuSnapshot.gpuTimestampsAvailable,
          samples: webGpuSnapshot.gpuTimestampSamples,
          lastEasuGpuTimeMs: webGpuSnapshot.lastEasuGpuTimeMs,
          lastRcasGpuTimeMs: webGpuSnapshot.lastRcasGpuTimeMs,
          timingDefinition: webGpuSnapshot.gpuTimingDefinition,
          error: webGpuSnapshot.gpuTimestampError,
        },
        imageValidation: {
          status: imageValidationPassed ? 'PASS' : 'FAIL',
          method: 'Freeze two completed game-owned GPU frames, copy textures to MAP_READ buffers solely for diagnostics, compare EASU/RCAS output against each other and a simple CPU bilinear reference, then compare visible-canvas screenshot samples to the frozen RCAS texture.',
          bitmapFormat: 'Electron NativeImage.toBitmap({ scaleFactor: 1, colorSpace: srgb }) is BGRA on the Windows runner; stage PNG bytes are explicitly converted to RGBA and screenshot sample reads reverse BGRA to RGB.',
          diagnosticReadback: true,
          readbackFeedsProcessing: false,
          motion: motionCheck,
          stageComparison: stageAnalysis,
          visibleCanvas: visibleCanvasComparison,
          captures: diagnosticCaptures,
          limitations: 'Numerical comparison uses the scene target and a simple bilinear baseline; it is not a bit-for-bit AMD reference shader conformance test or a quality/performance claim.',
        },
        visibleOutputCapture: {
          path: visibleCapturePath,
          format: 'PNG',
          width: visibleCaptureSize.width,
          height: visibleCaptureSize.height,
          bytes: visibleImageBytes.length,
          capturePageMs: visibleCapturePageMs,
          sha256: crypto.createHash('sha256').update(visibleImageBytes).digest('hex'),
          purpose: 'Post-processing visible WebContentsView screenshot evidence only; never used as FSR input.',
        },
        runtime: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node },
      };
      fs.writeFileSync(webGpuSummaryPath, `${JSON.stringify(webGpuSummary, null, 2)}\n`, { mode: 0o600 });
      writeSmokeDiagnostic(`[smoke] WebGPU shader/pipeline/dispatch evidence: shaders=${webGpuSnapshot.shaderCompilationStatus}; pipelines=${webGpuSnapshot.pipelineCreationStatus}; EASU/RCAS dispatches=${webGpuSnapshot.easuDispatches}/${webGpuSnapshot.rcasDispatches}; workgroups=${webGpuSnapshot.workgroupsX}x${webGpuSnapshot.workgroupsY} at 8x8; frames=${webGpuSnapshot.framesCompleted}; timestamps supported/available/samples=${webGpuSnapshot.timestampQuerySupported}/${webGpuSnapshot.gpuTimestampsAvailable}/${webGpuSnapshot.gpuTimestampSamples}`);
      writeSmokeDiagnostic(`[smoke] WebGPU numerical output comparison: ${JSON.stringify(webGpuSummary.imageValidation)}`);
      writeSmokeDiagnostic(`[smoke] Live WebGPU game target → EASU compute → RCAS compute → visible canvas: ${webGpuSummary.status}; adapter=${JSON.stringify(webGpuSnapshot.adapter)}; API=${webGpuSnapshot.api}; softwareAdapter=${webGpuSnapshot.softwareAdapter}; input=${webGpuSnapshot.inputWidth}x${webGpuSnapshot.inputHeight}; output=${webGpuSnapshot.outputWidth}x${webGpuSnapshot.outputHeight}; visible-pixel comparison=${visibleCanvasComparison.status}; last/avg/max queue-completion wall=${webGpuSnapshot.lastQueueCompletionWallMs}/${webGpuSnapshot.averageQueueCompletionWallMs}/${webGpuSnapshot.maxQueueCompletionWallMs} ms; post-process screenshot=${visibleCapturePath}; physical GPU validation=NOT RUN; summary=${webGpuSummaryPath}`);
      if (!imageValidationPassed) {
        throw new Error(`WebGPU output/motion/visible-canvas numerical validation failed: ${JSON.stringify(webGpuSummary.imageValidation)}`);
      }
    } else {
      writeSmokeDiagnostic('[smoke] Browser-frame capturePage PNG → native D3D12 FSR1 diagnostic: NOT RUN (TRICORE_REQUIRE_FSR_INTEGRATION_SMOKE=PASS was not set).');
      writeSmokeDiagnostic('[smoke] Live WebGPU game-side FSR1 visible-frame integration: NOT RUN (TRICORE_REQUIRE_FSR_INTEGRATION_SMOKE=PASS was not set).');
    }
    smokeStage = 'complete';
    writeSmokeDiagnostic(`[smoke] Overall local runtime checks: PASS (${Date.now() - startedAt} ms)`);
    app.exit(0);
  } catch (error) {
    writeSmokeDiagnostic(`[smoke] FAIL at ${smokeStage}: ${error?.stack || error}`, 'error');
    try {
      const smokeOut = fsrCaptureOutputRoot();
      fs.mkdirSync(smokeOut, { recursive: true });
      const webGpuSummaryPath = path.join(smokeOut, 'fsr1-webgpu-summary.json');
      let existingWebGpuSummary = null;
      if (fs.existsSync(webGpuSummaryPath)) {
        try { existingWebGpuSummary = JSON.parse(fs.readFileSync(webGpuSummaryPath, 'utf8')); } catch { /* The inventory preserves malformed summary bytes and hash. */ }
      }
      const smokeLogPath = process.env.TRICORE_SMOKE_LOG || '';
      let smokeLogStat = null;
      try { if (smokeLogPath) smokeLogStat = fs.statSync(smokeLogPath); } catch { /* Preserve the failure summary if the log was moved or unavailable. */ }
      const failureSummaryPath = path.join(smokeOut, 'packaged-smoke-failure-summary.json');
      const failureSummary = {
        status: 'FAIL',
        failedStage: smokeStage,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        webGpuIntegration: {
          status: !webGpuSmokeStarted ? 'NOT RUN' : existingWebGpuSummary?.status === 'PASS' ? 'PASS RECORDED; A LATER PACKAGED-SMOKE CHECK FAILED' : 'FAIL OR INCOMPLETE',
          physicalGpuValidation: 'NOT RUN',
          readbackForProcessing: false,
          snapshot: webGpuSnapshot,
          firstFrameDiagnostic: compactWebGpuOutputEvidence(webGpuEvidence.firstOutputValidation),
          finalDiagnostic: compactWebGpuOutputEvidence(webGpuEvidence.outputValidation),
          stageComparison: webGpuEvidence.stageAnalysis,
          motionCheck: webGpuEvidence.motionCheck,
          diagnosticCaptures: webGpuEvidence.diagnosticCaptures,
          visibleCanvasComparison: webGpuEvidence.visibleCanvasComparison,
          visibleCapturePath: webGpuEvidence.visibleCapturePath || null,
          summaryPath: webGpuEvidence.summaryPath || (fs.existsSync(webGpuSummaryPath) ? webGpuSummaryPath : null),
          previousSummaryStatus: existingWebGpuSummary?.status || null,
        },
        failure: {
          message: clampText(error?.message || String(error), 2000),
          code: clampText(error?.code || '', 120),
          stack: String(error?.stack || '').slice(0, 12000),
        },
        evidence: {
          outputDirectory: smokeOut,
          smokeLog: {
            path: smokeLogPath || null,
            exists: Boolean(smokeLogStat),
            bytes: smokeLogStat?.size ?? null,
          },
          artifactInventory: collectSmokeArtifactInventory(smokeOut),
          failureSummaryPath,
        },
        physicalGpuValidation: 'NOT RUN',
        runtime: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node },
      };
      fs.writeFileSync(failureSummaryPath, `${JSON.stringify(failureSummary, null, 2)}\n`, { mode: 0o600 });
      appendSmokeDiagnostic(`[smoke] Structured failure summary with partial evidence: ${failureSummaryPath}`);
    } catch (reportError) {
      appendSmokeDiagnostic(`[smoke] Could not write structured packaged-smoke failure summary: ${reportError?.message || reportError}`);
    }
    app.exit(1);
  } finally {
    if (localServer) localServer.close();
  }
}

ipcMain.handle('browser:get-states', (event) => {
  if (!isUiSender(event)) return [];
  return Array.from({ length: CORE_COUNT }, (_, slot) => stateFor(slot));
});

ipcMain.handle('browser:set-fullscreen', (event, payload = {}) => {
  if (!isUiSender(event)) return { ok: false, error: 'Untrusted sender.' };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.enabled !== 'boolean') return { ok: false, error: 'Full-screen state must include a boolean.' };
  const slot = validSlot(payload.slot);
  if (slot < 0) return { ok: false, error: 'An active browser core is required for fullscreen mode.' };
  try {
    const fullScreen = setMainWindowFullscreen(payload.enabled);
    if (payload.enabled) activeTabFor(slot)?.view?.webContents?.focus();
    return { ok: true, fullScreen };
  } catch (error) {
    return { ok: false, error: clampText(error?.message || 'The browser window rejected full-screen mode.', 300) };
  }
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
ipcMain.handle('browser:fsr-open-test-scene', (event, payload = {}) => {
  if (!isUiSender(event)) return { ok: false, error: 'Untrusted sender.' };
  const slot = validSlot(payload.slot);
  if (slot < 0) return { ok: false, error: 'Invalid browser core.' };
  const tab = createTab(slot, homeUrl, { activate: true, fsrTestScene: true });
  if (!tab) return { ok: false, error: `A core can have at most ${MAX_TABS_PER_CORE} tabs.` };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:active', slot);
  return { ok: true, tabId: tab.id };
});
ipcMain.handle('browser:fsr-open-webgpu-test-scene', (event, payload = {}) => {
  if (!isUiSender(event)) return { ok: false, error: 'Untrusted sender.' };
  const slot = validSlot(payload.slot);
  if (slot < 0) return { ok: false, error: 'Invalid browser core.' };
  const tab = createTab(slot, homeUrl, { activate: true, fsrWebGpuTestScene: true });
  if (!tab) return { ok: false, error: `A core can have at most ${MAX_TABS_PER_CORE} tabs.` };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:active', slot);
  return { ok: true, tabId: tab.id };
});
ipcMain.handle('browser:fsr-webgpu-test-status', async (event) => {
  if (!isUiSender(event)) return [];
  return getFsrWebGpuSceneSnapshots();
});
ipcMain.handle('browser:fsr-process-test-scene', async (event, payload = {}) => {
  if (!isUiSender(event)) return { ok: false, error: 'Untrusted sender.' };
  return processBrowserFsrFrames(payload);
});
ipcMain.handle('browser:fsr-cancel-test-scene', (event, jobId) => {
  if (!isUiSender(event)) return false;
  return cancelBrowserFsrFrames(jobId);
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
    appendSmokeDiagnostic('[smoke] Electron app.whenReady resolved.');
    loadBrowserData();
    createWindow();
    if (process.argv.includes('--smoke-test')) {
      mainWindow.webContents.once('did-finish-load', () => {
        appendSmokeDiagnostic('[smoke] Main browser UI did-finish-load; starting smoke checks.');
        runSmokeTest();
      });
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  if (!activeFsrJob) return;
  activeFsrJob.cancelled = true;
  try { activeFsrJob.child?.kill(); } catch { /* The native helper may already have exited. */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('render-process-gone', (_goneEvent, details) => {
    console.error('A Chromium renderer process exited unexpectedly:', details?.reason || 'unknown reason');
  });
});
