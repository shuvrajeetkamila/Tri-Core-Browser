import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import { normalizeAddress } from './url-utils.js';
import { chooseAutomaticMode, detectGraphicsCapabilities, GRAPHICS_MODES, resolveGraphicsMode } from './graphics-controller.js';
import { probeWasmCapability, runWasmBenchmark } from './wasm-benchmark.js';
import { loadGraphicsPreferences, saveGraphicsPreferences as saveGraphicsPreferenceRecord } from './graphics-preferences.js';

const CORE_COUNT = 3;
const browser = window.triCore ?? null;
const grid = document.querySelector('#browser-grid');
const paneElements = [...document.querySelectorAll('[data-pane]')];
const toast = document.querySelector('#toast');
const graphicsDialog = document.querySelector('#graphics-dialog');
const utilityDialog = document.querySelector('#utility-dialog');
const states = Array.from({ length: CORE_COUNT }, () => ({ loading: false, canGoBack: false, canGoForward: false, tabs: [] }));
let activePane = 0;
let focusedPane = null;
let immersiveMode = false;
let focusedPaneBeforeImmersive = null;
let syncNavigation = false;
let toastTimer;
let layoutFrame = 0;
const graphicsPreferences = loadGraphicsPreferences();
let graphicsSelection = graphicsPreferences.selection;
let selectedMode = graphicsPreferences.mode;
let performancePanelCollapsed = graphicsPreferences.panelCollapsed;
let fsrAdapterIndexPreference = graphicsPreferences.fsrAdapterIndex;
let wasmCapability = { detected: typeof WebAssembly === 'object', compatible: false, initialized: false, failed: false };
let wasmResult = null;
let wasmRunning = false;
let graphicsRefreshPending = false;
let graphicsRefreshQueued = false;
let graphicsInfo = null;
let graphicsCapabilities = detectGraphicsCapabilities({ wasm: wasmCapability });
let fsrCaptureRunning = false;
let fsrCaptureJobId = '';
let fsrLastResult = null;
let fsrWebGpuOpening = false;
let utilityKind = 'bookmarks';

if (browser) document.body.classList.add('desktop-mode');

function saveGraphicsPreferences() {
  saveGraphicsPreferenceRecord({
    selection: graphicsSelection,
    mode: selectedMode,
    panelCollapsed: performancePanelCollapsed,
    fsrAdapterIndex: fsrAdapterIndexPreference,
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3400);
}

function getPane(slot) {
  return paneElements[slot];
}

function activeTab(slot = activePane) {
  return states[slot]?.tabs?.find((tab) => tab.active) || null;
}

function setActivePane(slot, focusAddress = false) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= CORE_COUNT) return;
  activePane = slot;
  paneElements.forEach((pane, index) => pane.classList.toggle('is-active', index === slot));
  updateImmersiveLabels();
  updateFsrLabControls();
  if (focusAddress) {
    if (focusedPane !== null && focusedPane !== slot) {
      focusedPane = null;
      grid.removeAttribute('data-focus');
    }
    getPane(slot)?.querySelector('.address-input')?.focus();
    getPane(slot)?.querySelector('.address-input')?.select();
    scheduleLayout();
  }
}

function switchCore(slot, focusAddress = false) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= CORE_COUNT) return;
  if (focusedPane !== null && focusedPane !== slot) {
    focusedPane = slot;
    grid.dataset.focus = String(slot);
  }
  setActivePane(slot);
  if (focusAddress) {
    const input = getPane(slot)?.querySelector('.address-input');
    input?.focus();
    input?.select();
  }
  scheduleLayout();
}

function renderTabs(slot, tabs = []) {
  const container = getPane(slot)?.querySelector('[data-tabs-for]');
  if (!container) return;
  container.replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement('div');
    item.className = `browser-tab${tab.active ? ' is-active' : ''}${tab.loading ? ' is-loading' : ''}`;
    item.setAttribute('role', 'presentation');

    const select = document.createElement('button');
    select.className = 'browser-tab-select';
    select.type = 'button';
    select.setAttribute('role', 'tab');
    select.setAttribute('aria-selected', String(Boolean(tab.active)));
    select.setAttribute('aria-label', `${tab.title || tab.url || 'New tab'}${tab.loading ? ', loading' : ''}`);
    select.title = tab.title || tab.url || 'New tab';
    const indicator = document.createElement('span');
    indicator.className = 'browser-tab-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.className = 'browser-tab-title';
    title.textContent = tab.title || tab.url || 'New tab';
    select.append(indicator, title);
    select.addEventListener('click', () => {
      setActivePane(slot);
      if (browser) browser.selectTab(slot, tab.id);
      else showToast('Tabs are available in the desktop app.');
    });

    const close = document.createElement('button');
    close.className = 'browser-tab-close';
    close.type = 'button';
    close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
    close.title = tabs.length === 1 ? 'A core always keeps one tab open' : 'Close tab';
    close.disabled = tabs.length <= 1;
    close.textContent = '×';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!browser || tabs.length <= 1) return;
      browser.closeTab(slot, tab.id).then((closed) => {
        if (!closed) showToast('That tab could not be closed.');
      });
    });

    item.append(select, close);
    container.append(item);
  }
  const addButton = getPane(slot)?.querySelector('[data-new-tab]');
  if (addButton) addButton.disabled = tabs.length >= 20;
}

function updateState(state) {
  const slot = Number(state?.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot >= CORE_COUNT) return;
  states[slot] = { ...states[slot], ...state };
  const pane = getPane(slot);
  if (!pane) return;

  const label = pane.querySelector('[data-state]');
  const title = pane.querySelector('[data-page-title]');
  const input = pane.querySelector('[data-address]');
  const current = states[slot];
  const pageTitle = String(current.title || '').trim();

  label.textContent = current.error ? 'PAGE ERROR' : current.loading ? 'LOADING' : current.url ? 'CONNECTED' : 'READY';
  label.dataset.kind = current.error ? 'error' : current.loading ? 'loading' : 'ready';
  title.textContent = current.error ? 'Page could not be loaded' : pageTitle || current.url || 'Ready for a new page';
  pane.querySelector('[data-action="back"]').disabled = !current.canGoBack;
  pane.querySelector('[data-action="forward"]').disabled = !current.canGoForward;
  pane.querySelector('[data-action="stop"]').disabled = !current.loading;
  pane.querySelector('[data-action="reload"]').hidden = Boolean(current.loading);
  pane.querySelector('[data-action="stop"]').hidden = !current.loading;
  if (current.url && document.activeElement !== input) input.value = current.url;
  renderTabs(slot, current.tabs || []);
  if (!current.fsrWebGpuTestScene && Array.isArray(graphicsInfo?.fsrWebGpuScenes)) {
    graphicsInfo = { ...graphicsInfo, fsrWebGpuScenes: graphicsInfo.fsrWebGpuScenes.filter((scene) => Number(scene.slot) !== slot) };
  }
  updateFsrWebGpuSceneStatus();
  updateFsrLabControls();
}

function scheduleLayout() {
  if (!browser || layoutFrame) return;
  layoutFrame = window.requestAnimationFrame(() => {
    layoutFrame = 0;
    const overlayOpen = graphicsDialog.open || utilityDialog.open;
    const rectangles = paneElements.map((pane, slot) => {
      const viewport = pane.querySelector('[data-viewport]');
      if (overlayOpen || !viewport || (focusedPane !== null && focusedPane !== slot)) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      const rect = viewport.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      return visible
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : { x: 0, y: 0, width: 0, height: 0 };
    });
    browser.setLayout(rectangles);
  });
}

async function navigate(slot, rawAddress, { fromSync = false } = {}) {
  const input = getPane(slot)?.querySelector('[data-address]');
  const url = normalizeAddress(rawAddress);
  if (!url) {
    input?.focus();
    return;
  }

  setActivePane(slot);
  if (input) input.value = url;

  if (browser) {
    const result = await browser.navigate(slot, url);
    if (result?.ok === false) showToast('That address could not be opened. Try an HTTP or HTTPS page.');
  } else {
    const notice = getPane(slot)?.querySelector('.preview-notice');
    if (notice) {
      notice.replaceChildren();
      const heading = document.createElement('strong');
      heading.textContent = 'Preview mode';
      const message = document.createElement('span');
      message.textContent = `In the desktop app, this opens in Core ${String(slot + 1).padStart(2, '0')}: ${url}`;
      notice.append(heading, message);
      notice.hidden = false;
      window.setTimeout(() => { if (notice.isConnected) notice.hidden = true; }, 4200);
    }
    showToast('Live web pages open in the desktop app. This page is only a UI preview.');
  }

  if (syncNavigation && !fromSync) {
    await Promise.all(Array.from({ length: CORE_COUNT }, (_, target) => target === slot ? null : browser?.navigate(target, url)));
    if (!browser) {
      paneElements.forEach((pane, target) => {
        if (target === slot) return;
        const targetInput = pane.querySelector('[data-address]');
        targetInput.value = url;
        const notice = pane.querySelector('.preview-notice');
        const heading = document.createElement('strong');
        heading.textContent = 'Sync navigation preview';
        const message = document.createElement('span');
        message.textContent = `This address would also open in Core ${String(target + 1).padStart(2, '0')}: ${url}`;
        notice.replaceChildren(heading, message);
        notice.hidden = false;
        window.setTimeout(() => { if (notice.isConnected) notice.hidden = true; }, 4200);
      });
    }
  }
}

async function runAction(slot, action) {
  setActivePane(slot);
  if (browser) {
    const result = await browser.action(slot, action);
    if (result) updateState(result);
  } else {
    showToast(`${action[0].toUpperCase()}${action.slice(1)} controls are available in the desktop app.`);
  }
}

async function openNewTab(slot = activePane, rawUrl = null) {
  if (!browser) {
    showToast('New tabs open in the desktop app.');
    return;
  }
  const url = rawUrl ? normalizeAddress(rawUrl) : undefined;
  const result = await browser.createTab(slot, url);
  if (!result?.ok) showToast(result?.error || 'The new tab could not be created.');
  else setActivePane(slot);
}

function toggleFocus(slot = activePane) {
  if (immersiveMode) return;
  if (focusedPane === slot) {
    focusedPane = null;
    grid.removeAttribute('data-focus');
    showToast('Showing all three cores.');
  } else {
    focusedPane = slot;
    activePane = slot;
    setActivePane(slot);
    grid.dataset.focus = String(slot);
    showToast(`Focusing Core ${String(slot + 1).padStart(2, '0')}.`);
  }
  scheduleLayout();
}

function updateImmersiveLabels() {
  const pane = getPane(activePane);
  const title = pane?.querySelector('.pane-heading h2')?.textContent?.trim() || `Core ${String(activePane + 1).padStart(2, '0')}`;
  const coreLabel = document.querySelector('#immersive-core-label');
  if (coreLabel) coreLabel.textContent = `CORE ${String(activePane + 1).padStart(2, '0')} · ${title.toUpperCase()}`;
  const button = document.querySelector('#immersive-toggle');
  if (button) {
    button.setAttribute('aria-pressed', String(immersiveMode));
    button.setAttribute('aria-label', immersiveMode
      ? `Exit immersive full screen for Core ${activePane + 1}`
      : `Enter immersive full screen for ${title}`);
    button.title = immersiveMode ? 'Exit immersive full screen · F11 also toggles' : 'Expand the active browser core to full screen · F11 also toggles';
  }
}

function setImmersiveMode(enabled) {
  const next = Boolean(enabled);
  const restoreToolbarFocus = !next && document.activeElement?.id === 'immersive-exit';
  if (next === immersiveMode) {
    updateImmersiveLabels();
    return;
  }
  if (next) {
    focusedPaneBeforeImmersive = focusedPane;
    focusedPane = activePane;
    grid.dataset.focus = String(activePane);
    graphicsDialog.close();
    utilityDialog.close();
  } else {
    focusedPane = focusedPaneBeforeImmersive;
    focusedPaneBeforeImmersive = null;
    if (focusedPane === null) grid.removeAttribute('data-focus');
    else grid.dataset.focus = String(focusedPane);
  }
  immersiveMode = next;
  document.documentElement.classList.toggle('is-immersive', immersiveMode);
  document.body.classList.toggle('is-immersive', immersiveMode);
  const exitBar = document.querySelector('#immersive-exitbar');
  if (exitBar) exitBar.hidden = !immersiveMode;
  updateImmersiveLabels();
  scheduleLayout();
  if (restoreToolbarFocus) document.querySelector('#immersive-toggle')?.focus({ preventScroll: true });
}

async function toggleImmersiveFullscreen() {
  if (!browser) {
    showToast('Full-screen gaming view is available in the desktop app.');
    return;
  }
  const requested = !immersiveMode;
  try {
    const result = await browser.setFullscreen(requested, activePane);
    if (!result?.ok) {
      showToast(result?.error || 'The browser window could not change full-screen mode.');
      return;
    }
    setImmersiveMode(Boolean(result.fullScreen));
  } catch (error) {
    showToast(error?.message || 'The browser window could not change full-screen mode.');
  }
}

function handleDesktopShortcut(shortcut) {
  if (!shortcut || typeof shortcut !== 'object') return;
  const slot = Number(shortcut.slot);
  if (shortcut.action === 'focus-address') switchCore(slot, true);
  else if (shortcut.action === 'switch-core') switchCore(Number(shortcut.slot));
  else if (shortcut.action === 'reload') runAction(slot, 'reload');
  else if (shortcut.action === 'reload-all') document.querySelector('#reload-all').click();
  else if (shortcut.action === 'new-tab') openNewTab(slot);
  else if (shortcut.action === 'close-tab') {
    const tab = activeTab(slot);
    if (tab) browser?.closeTab(slot, tab.id);
  }
}

function formatTimestamp(timestamp) {
  const date = new Date(Number(timestamp));
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Date unavailable';
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function createEmptyState(message) {
  return createElement('p', 'empty-state', message);
}

function createBrowserRecord(item, { canRemove = false, canReveal = false } = {}) {
  const entry = createElement('article', 'utility-record');
  const copy = createElement('div', 'utility-record-copy');
  const title = createElement('strong', 'utility-record-title', item.title || item.fileName || item.url || 'Untitled');
  const url = createElement('span', 'utility-record-url', item.url || item.fileName || '');
  const detailsText = item.visitedAt || item.createdAt
    ? formatTimestamp(item.visitedAt || item.createdAt)
    : item.state === 'in-progress'
      ? `${item.totalBytes ? `${Math.round(100 * item.receivedBytes / item.totalBytes)}% · ` : ''}${Math.round(item.receivedBytes / 1024)} KB received`
      : item.error || item.state || '';
  const details = createElement('small', 'utility-record-details', detailsText);
  copy.append(title, url, details);
  const actions = createElement('div', 'utility-record-actions');
  if (item.url && !canReveal) {
    const open = createElement('button', 'utility-small-button', 'Open');
    open.type = 'button';
    open.addEventListener('click', () => {
      utilityDialog.close();
      scheduleLayout();
      navigate(activePane, item.url);
    });
    actions.append(open);
  }
  if (canReveal && item.state === 'completed') {
    const reveal = createElement('button', 'utility-small-button', 'Show file');
    reveal.type = 'button';
    reveal.addEventListener('click', () => browser?.revealDownload(item.id));
    actions.append(reveal);
  }
  if (canRemove) {
    const remove = createElement('button', 'utility-small-button utility-remove-button', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      await browser?.removeBookmark(item.id);
      showUtility('bookmarks');
    });
    actions.append(remove);
  }
  entry.append(copy, actions);
  return entry;
}

async function showUtility(kind) {
  utilityKind = kind;
  const titles = { bookmarks: 'Bookmarks', history: 'History', downloads: 'Downloads', settings: 'Settings', about: 'About' };
  document.querySelector('#utility-title').textContent = titles[kind] || 'Browser';
  const content = document.querySelector('#utility-content');
  content.replaceChildren();
  let data = { bookmarks: [], history: [], settings: { homeUrl: 'https://duckduckgo.com/' } };
  if (browser) {
    try {
      data = await browser.getData() || data;
    } catch {
      showToast('Browser profile data could not be read.');
    }
  }

  if (kind === 'bookmarks') {
    const hint = createElement('p', 'utility-intro', 'Bookmarks are saved in this Windows user profile and are kept between launches.');
    content.append(hint);
    if (!data.bookmarks.length) content.append(createEmptyState('No bookmarks yet. Use the star button to save the active page.'));
    else data.bookmarks.forEach((item) => content.append(createBrowserRecord(item, { canRemove: true })));
  } else if (kind === 'history') {
    const controls = createElement('div', 'utility-toolbar');
    const clear = createElement('button', 'secondary-button', 'Clear history');
    clear.type = 'button';
    clear.disabled = !data.history.length || !browser;
    clear.addEventListener('click', async () => {
      await browser?.clearHistory();
      showUtility('history');
      showToast('Browsing history cleared.');
    });
    controls.append(createElement('span', '', 'Recent pages in this profile'), clear);
    content.append(controls);
    if (!data.history.length) content.append(createEmptyState('No browsing history yet.'));
    else data.history.forEach((item) => content.append(createBrowserRecord(item)));
  } else if (kind === 'downloads') {
    let items = [];
    if (browser) {
      try { items = await browser.getDownloads(); } catch { /* Keep the empty state below. */ }
    }
    content.append(createElement('p', 'utility-intro', 'Files are saved to your Windows Downloads folder. Tri-Core never opens a download automatically.'));
    if (!items.length) content.append(createEmptyState('No downloads in this session.'));
    else items.forEach((item) => content.append(createBrowserRecord(item, { canReveal: true })));
  } else if (kind === 'settings') {
    const form = createElement('form', 'settings-form');
    const label = createElement('label', 'settings-label', 'Home page');
    label.htmlFor = 'home-url-setting';
    const input = document.createElement('input');
    input.id = 'home-url-setting';
    input.className = 'settings-input';
    input.type = 'url';
    input.inputMode = 'url';
    input.value = data.settings?.homeUrl || 'https://duckduckgo.com/';
    input.required = true;
    const save = createElement('button', 'secondary-button', 'Save home page');
    save.type = 'submit';
    form.append(label, input, save);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const result = await browser?.setHome(input.value);
      if (result?.ok) showToast('Home page saved. New tabs and Home buttons will use it.');
      else showToast(result?.error || 'The home page could not be saved.');
    });
    const permissions = createElement('div', 'settings-info-card');
    permissions.append(createElement('strong', '', 'Site permissions'), createElement('p', '', 'Camera, microphone, location, notifications, and other Chromium permission requests are denied by default in this build.'));
    const privacy = createElement('div', 'settings-info-card');
    privacy.append(createElement('strong', '', 'Privacy & storage'), createElement('p', '', 'The three cores use separate persistent cookie/storage partitions. Bookmarks and history are stored locally in browser-data.json.'));
    const version = createElement('p', 'settings-version', `Tri-Core Browser ${document.querySelector('.app-version')?.textContent || ''} · Chromium ${graphicsInfo?.chromiumVersion || 'version available in graphics diagnostics'}`);
    const about = createElement('button', 'secondary-button settings-diagnostics', 'About Tri-Core Browser');
    about.type = 'button';
    about.addEventListener('click', () => showUtility('about'));
    const diagnostics = createElement('button', 'secondary-button settings-diagnostics', 'Open graphics diagnostics');
    diagnostics.type = 'button';
    diagnostics.addEventListener('click', () => {
      utilityDialog.close();
      graphicsDialog.showModal();
      scheduleLayout();
      refreshGraphicsDiagnostics();
    });
    form.append(permissions, privacy, version, about, diagnostics);
    content.append(form);
  } else if (kind === 'about') {
    const aboutCard = createElement('div', 'settings-info-card about-card');
    aboutCard.append(
      createElement('strong', '', 'TRI-CORE BROWSER'),
      createElement('p', '', 'A three-core desktop browser based on Electron’s bundled Chromium runtime. This is an experimental early release.'),
      createElement('p', '', `${document.querySelector('.app-version')?.textContent || 'Version unavailable'} · Electron ${graphicsInfo?.electronVersion || 'runtime version is available in graphics diagnostics'} · Chromium ${graphicsInfo?.chromiumVersion || 'runtime version is available in graphics diagnostics'}`),
      createElement('p', '', 'WebAssembly diagnostic: implemented. NVIDIA DLSS: not integrated. AMD FSR1: a bounded WebGPU game-side integration scene is included; ordinary pages remain Chromium.'),
    );
    const diagnostics = createElement('button', 'secondary-button settings-diagnostics', 'Open graphics diagnostics');
    diagnostics.type = 'button';
    diagnostics.addEventListener('click', () => {
      utilityDialog.close();
      graphicsDialog.showModal();
      scheduleLayout();
      refreshGraphicsDiagnostics();
    });
    content.append(aboutCard, diagnostics);
  }

  if (!utilityDialog.open) utilityDialog.showModal();
  scheduleLayout();
}

function setPerformancePanelExpanded(expanded, { persist = true } = {}) {
  performancePanelCollapsed = !expanded;
  const panel = document.querySelector('#performance-panel');
  const content = document.querySelector('#performance-panel-content');
  const toggle = document.querySelector('#performance-panel-toggle');
  const label = expanded ? 'Collapse performance panel' : 'Expand performance panel';
  panel.classList.toggle('is-collapsed', !expanded);
  content.hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  toggle.querySelector('.sr-only').textContent = label;
  if (persist) saveGraphicsPreferences();
  scheduleLayout();
}

function syncGraphicsPreferenceControls() {
  document.querySelector('#graphics-selection').value = graphicsSelection;
  document.querySelector('#graphics-priority').textContent = 'DLSS → FSR → WASM';
  document.querySelector('#graphics-mode-select').value = selectedMode;
  document.querySelector('#graphics-mode-select').disabled = graphicsSelection === 'auto';
}

function lifecycleStateClass(state) {
  return String(state || 'UNSUPPORTED').toLowerCase().replace(/\s+/g, '-');
}

function featureRuntimeLabel(feature) {
  if (feature.failed) {
    const stage = feature.failureStage ? ` at ${feature.failureStage}` : '';
    const count = feature.processedFrames > 0 ? ` · ${feature.processedFrames} confirmed processed frame(s)` : '';
    return `FAILED${stage} · ${feature.error || 'runtime error'}${count}`;
  }
  if (feature.automaticEligible === false) {
    return `${feature.state} · ${feature.processedFrames || 0} confirmed controlled-scene frame(s) · excluded from automatic ordinary-page rendering`;
  }
  if (feature.unsupported) return 'Not integrated · initialization not attempted · no frame counter';
  if (!feature.initialized) return `${feature.state} · not initialized`;
  return `${feature.state} · ${feature.processedFrames} confirmed frame(s)`;
}

function renderFsrAdapterOptions() {
  const select = document.querySelector('#fsr-adapter-select');
  if (!select) return;
  const adapterInfo = graphicsInfo?.nativeFsrAdapters;
  const adapters = Array.isArray(adapterInfo?.adapters)
    ? adapterInfo.adapters.filter((adapter) => !adapter.softwareAdapter && adapter.fsr1Compatible)
    : [];
  const previousSelection = String(fsrAdapterIndexPreference ?? select.value ?? '');
  select.replaceChildren();
  if (!adapters.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = adapterInfo?.available
      ? 'No FSR-compatible non-software D3D12 adapter detected'
      : 'Native FSR1 helper unavailable';
    select.append(option);
    fsrAdapterIndexPreference = null;
  } else {
    for (const adapter of adapters) {
      const option = document.createElement('option');
      option.value = String(adapter.index);
      option.textContent = `${adapter.name} · ${adapter.vendorId || 'vendor unknown'} · ${adapter.featureLevel || 'D3D12'} / SM ${adapter.shaderModel || 'unknown'}`;
      select.append(option);
    }
    const selected = adapters.find((adapter) => String(adapter.index) === previousSelection) || adapters[0];
    select.value = String(selected.index);
    fsrAdapterIndexPreference = selected.index;
  }
  updateFsrLabControls();
}

function updateFsrLabControls() {
  const openButton = document.querySelector('#fsr-open-test-scene');
  const webGpuOpenButton = document.querySelector('#fsr-open-webgpu-test-scene');
  const runButton = document.querySelector('#fsr-capture-run');
  const cancelButton = document.querySelector('#fsr-capture-cancel');
  const adapterSelect = document.querySelector('#fsr-adapter-select');
  if (!openButton || !webGpuOpenButton || !runButton || !cancelButton || !adapterSelect) return;
  const tab = activeTab(activePane);
  const sceneReady = Boolean(tab?.fsrTestScene && !tab.loading);
  const adapters = Array.isArray(graphicsInfo?.nativeFsrAdapters?.adapters)
    ? graphicsInfo.nativeFsrAdapters.adapters.filter((adapter) => !adapter.softwareAdapter && adapter.fsr1Compatible)
    : [];
  const adapterSelected = adapters.some((adapter) => String(adapter.index) === adapterSelect.value);
  openButton.disabled = !browser || fsrCaptureRunning;
  webGpuOpenButton.disabled = !browser || fsrWebGpuOpening;
  adapterSelect.disabled = fsrCaptureRunning || adapters.length === 0;
  runButton.disabled = !browser || fsrCaptureRunning || !sceneReady || !adapterSelected;
  cancelButton.hidden = !fsrCaptureRunning || !fsrCaptureJobId;
}

function setFsrTestStatus(message, kind = 'info') {
  const status = document.querySelector('#fsr-test-status');
  status.textContent = String(message || '');
  status.dataset.kind = kind;
}

function setFsrLifecycleState(state) {
  const chip = document.querySelector('#fsr-test-state');
  chip.textContent = state;
  chip.dataset.state = lifecycleStateClass(state);
}

function fsrWebGpuLifecycleLabel(scene) {
  if (!scene) return 'NOT RUN';
  if (scene.state === 'unsupported' || scene.unsupported) return 'UNAVAILABLE';
  if (scene.state === 'adapter-failed') return 'ADAPTER INIT FAILED';
  if (scene.state === 'device-failed') return 'DEVICE INIT FAILED';
  if (scene.state === 'shader-failed') return 'SHADER COMPILATION FAILED';
  if (scene.state === 'pipeline-failed') return 'PIPELINE CREATION FAILED';
  if (scene.state === 'resource-failed') return 'RESOURCE INITIALIZATION FAILED';
  if (scene.state === 'device-lost') return 'DEVICE LOST';
  if (scene.failed || scene.state === 'runtime-failed') return 'RUNTIME FAILED';
  if (scene.state === 'processing' || scene.processingFrames) return 'PROCESSING';
  if (scene.state === 'presented' && scene.visibleOutputVerified) return 'VISIBLE OUTPUT VERIFIED';
  if (scene.state === 'presented' || scene.framesCompleted > 0) return 'OUTPUT SUBMITTED';
  if (scene.initialized || scene.state === 'initialized') return 'PIPELINES READY';
  if (scene.state === 'initializing') return 'INITIALIZING';
  return 'DETECTED';
}

function updateFsrWebGpuSceneStatus(snapshots = graphicsInfo?.fsrWebGpuScenes || []) {
  const chip = document.querySelector('#fsr-webgpu-state');
  const status = document.querySelector('#fsr-webgpu-status');
  const metrics = document.querySelector('#fsr-webgpu-metrics');
  if (!chip || !status || !metrics) return;
  const scenes = Array.isArray(snapshots) ? snapshots : [];
  const scene = scenes.find((item) => Number(item.slot) === activePane) || scenes[0] || null;
  if (!scene) {
    chip.textContent = 'NOT RUN';
    chip.dataset.state = 'detected';
    status.textContent = activeTab(activePane)?.fsrWebGpuTestScene
      ? 'WebGPU scene opened. Waiting for its adapter and FSR1 pipeline status…'
      : 'NOT RUN. No WebGPU game render target has been initialized in this session.';
    status.dataset.kind = 'info';
    metrics.textContent = 'Adapter/device, shader, pipeline, and resource states; EASU/RCAS dispatch counts; input/output resolutions; and queue-completion wall timings appear after the controlled scene runs. GPU timestamps are separate and optional. Visible-pixel comparison and physical-GPU validation remain NOT RUN until evidenced.';
    return;
  }

  const state = fsrWebGpuLifecycleLabel(scene);
  chip.textContent = state;
  chip.dataset.state = lifecycleStateClass(state);
  if (scene.failed || scene.state?.endsWith('-failed') || scene.state === 'device-lost') {
    const failureStage = scene.failureStage || scene.stage || scene.state || 'runtime';
    status.textContent = `WebGPU FSR1 ${String(failureStage).replaceAll('-', ' ')} failure: ${scene.error || 'unknown error'}. Normal Chromium rendering remains available.`;
    status.dataset.kind = 'error';
  } else if (scene.unsupported) {
    status.textContent = `WebGPU FSR1 is unavailable in this renderer: ${scene.error || 'WebGPU is not exposed or no adapter is available'}. Normal Chromium rendering remains available.`;
    status.dataset.kind = 'error';
  } else if (scene.state === 'processing' || scene.processingFrames) {
    status.textContent = `FSR1 EASU + RCAS compute dispatch is in progress (${scene.framesCompleted || 0} completed frame(s)). A completed queue is not pixel-level proof that the output is visibly correct; screenshot comparison is reserved for the packaged diagnostic smoke test.`;
    status.dataset.kind = 'working';
  } else if (scene.visibleOutputVerified === true) {
    status.textContent = `The controlled packaged smoke test verified visible-canvas output against diagnostic samples (${scene.framesCompleted || 0} completed frame(s)). This does not establish physical-GPU or arbitrary-page support.`;
    status.dataset.kind = 'pass';
  } else if (scene.state === 'presented' || (scene.framesCompleted || 0) > 0) {
    status.textContent = `EASU + RCAS completed ${scene.framesCompleted || 0} frame(s) and submitted the result for the WebGPU canvas. Pixel-level visible-output verification is not available in this session; do not treat queue completion alone as display proof. This is limited to the bundled game scene.`;
    status.dataset.kind = 'working';
  } else if (scene.initialized) {
    status.textContent = 'Adapter, device, shaders, compute/presentation pipelines, and scene resources are initialized; no processed output frame is confirmed yet.';
    status.dataset.kind = 'working';
  } else if (scene.state === 'initializing') {
    status.textContent = `WebGPU FSR1 initialization is in progress${scene.stage ? ` at ${scene.stage}` : ''}. No processing claim is made yet.`;
    status.dataset.kind = 'working';
  } else {
    status.textContent = 'WebGPU was detected, but adapter/device initialization, EASU/RCAS pipeline creation, and frame processing are not yet established.';
    status.dataset.kind = 'info';
  }

  const adapterInfo = scene.adapter || {};
  const adapterName = [adapterInfo.vendor, adapterInfo.device, adapterInfo.description].filter(Boolean).join(' · ') || 'adapter identity not exposed';
  const adapterType = scene.softwareAdapter === true
    ? 'software adapter · not physical-GPU evidence'
    : scene.softwareAdapter === false
      ? 'adapter marked non-software · physical identity still requires manual review'
      : 'software/physical classification unknown';
  const input = scene.inputWidth && scene.inputHeight ? `${scene.inputWidth}×${scene.inputHeight}` : 'not initialized';
  const output = scene.outputWidth && scene.outputHeight ? `${scene.outputWidth}×${scene.outputHeight}` : 'not initialized';
  const queueWall = Number.isFinite(scene.lastQueueCompletionWallMs)
    ? `last ${scene.lastQueueCompletionWallMs.toFixed(2)} ms · average ${Number(scene.averageQueueCompletionWallMs).toFixed(2)} ms · max ${Number(scene.maxQueueCompletionWallMs).toFixed(2)} ms`
    : 'queue timing not available';
  const shaderState = scene.shaderCompilationStatus || (scene.initialized ? 'compiled' : 'pending');
  const pipelineState = scene.pipelineCreationStatus || (scene.initialized ? 'created' : 'pending');
  const dispatches = `EASU/RCAS dispatches ${scene.easuDispatches || 0}/${scene.rcasDispatches || 0}`;
  const gpuTimestamps = scene.gpuTimestampsAvailable
    ? `${scene.gpuTimestampSamples || 0} GPU timestamp sample(s)`
    : 'GPU timestamps unavailable';
  const visibleProof = scene.visibleOutputVerified === true
    ? 'visible-pixel check passed'
    : 'visible-pixel check not run';
  const stageDetail = scene.failureStage || scene.stage || '';
  const resourceState = scene.resourceInitializationStatus || (scene.initialized ? 'passed' : 'pending');
  metrics.textContent = `${adapterName} · ${adapterType} · WebGPU ${scene.state || 'detected'}${stageDetail ? ` at ${stageDetail}` : ''} · shaders ${shaderState} · pipelines ${pipelineState} · resources ${resourceState} · ${dispatches} · ${input} → ${output} · ${scene.framesCompleted || 0} completed / ${scene.framesSubmitted || 0} submitted · ${queueWall} · ${gpuTimestamps} · ${visibleProof}. Queue timing is performance.now() frame-encoding-to-queue-completion wall time, not a GPU timestamp. Physical-GPU validation: NOT RUN in this session.`;
}

function renderFsrTestResult(result) {
  const root = document.querySelector('#fsr-test-result');
  const frame = result?.frames?.[result.frames.length - 1];
  if (!root || !result?.ok || !frame) return;
  root.hidden = false;
  document.querySelector('#fsr-input-preview').src = result.inputPreview;
  document.querySelector('#fsr-output-preview').src = result.outputPreview;
  document.querySelector('#fsr-test-metrics-title').textContent = `PASS · ${result.frameCount} browser-captured frame(s) processed · ${result.distinctInputFrames} distinct animated input(s)`;
  const adapterType = frame.softwareAdapter ? 'WARP software adapter — not physical-GPU evidence' : `non-software D3D12 adapter (${frame.adapterVendorId}; physical identity still requires review)`;
  const gpuTimes = frame.nativeGpuTimestampsAvailable
    ? `EASU ${Number(frame.easuGpuTimeMs).toFixed(3)} ms + RCAS ${Number(frame.rcasGpuTimeMs).toFixed(3)} ms GPU`
    : 'native GPU timestamps unavailable';
  document.querySelector('#fsr-test-metrics-detail').textContent = `${frame.inputWidth}×${frame.inputHeight} → ${frame.outputWidth}×${frame.outputHeight} · ${adapterType} · capturePage ${frame.capturePageMs.toFixed(2)} ms · native helper ${frame.nativeProcessMs.toFixed(2)} ms · ${gpuTimes} · batch wall ${result.totalRoundTripMs.toFixed(2)} ms. Upscaling changes image dimensions; no performance gain is established.`;
  document.querySelector('#fsr-test-capture-paths').textContent = `Input PNG: ${frame.inputPath} · Processed PNG: ${frame.outputPath} · Bilinear reference PNG: ${frame.referencePath} · Native report: ${frame.reportPath} · Input SHA-256: ${frame.inputSha256}`;
  setFsrTestStatus('FSR1 passed for the controlled WebGL2 capture. The original browser tab was not replaced or modified; regular pages still render in Chromium.', 'pass');
}

async function openFsrWebGpuTestScene() {
  if (!browser) {
    showToast('The WebGPU FSR1 integration scene opens in the Windows desktop app.');
    return;
  }
  const slot = activePane;
  const button = document.querySelector('#fsr-open-webgpu-test-scene');
  fsrWebGpuOpening = true;
  button.textContent = 'Starting WebGPU…';
  setFsrWebGpuStatusMessage(`Opening the bundled WebGPU FSR1 game scene in Core ${slot + 1}…`, 'working');
  updateFsrLabControls();
  try {
    const result = await browser.openFsrWebGpuTestScene(slot);
    if (!result?.ok) throw new Error(result?.error || 'The WebGPU FSR1 scene tab could not be opened.');
    const currentStates = await browser.getStates();
    currentStates.forEach(updateState);

    const deadline = performance.now() + 25_000;
    let snapshots = [];
    let scene = null;
    while (performance.now() < deadline) {
      snapshots = await browser.getFsrWebGpuTestStatus();
      scene = snapshots.find((item) => item.tabId === result.tabId) || null;
      updateFsrWebGpuSceneStatus(snapshots);
      if (scene?.failed || scene?.unsupported) break;
      if (scene?.framesCompleted >= 3) break;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    graphicsInfo = { ...(graphicsInfo || {}), fsrWebGpuScenes: snapshots };
    await refreshGraphicsDiagnostics({ force: true });
    updateFsrWebGpuSceneStatus(graphicsInfo?.fsrWebGpuScenes || snapshots);

    if (scene?.failed || scene?.unsupported) {
      throw new Error(`${scene.stage || scene.state || 'WebGPU'}: ${scene.error || 'The WebGPU FSR1 test is unavailable.'}`);
    }
    if (scene?.visibleOutputVerified === true) {
      setFsrWebGpuStatusMessage(`VISIBLE OUTPUT VERIFIED · The controlled screenshot comparison passed for ${scene.framesCompleted} processed frame(s). This is game-owned WebGPU evidence only; physical-GPU and arbitrary-page support remain unestablished.`, 'pass');
    } else if (scene?.framesCompleted >= 3) {
      setFsrWebGpuStatusMessage(`COMPUTE COMPLETE · ${scene.framesCompleted} frame(s) were processed and submitted to the WebGPU canvas. Visible-pixel comparison is not run in the interactive scene, so this is not a claim that displayed pixels were verified. The packaged smoke test performs that separate diagnostic check.`, 'working');
    } else {
      setFsrWebGpuStatusMessage('Scene opened. Adapter/device initialization, pipeline creation, or frame processing is still pending; check the scene panel and Diagnostics. No fallback or hardware support is inferred.', 'working');
    }
  } catch (error) {
    setFsrWebGpuStatusMessage(error?.message || 'The WebGPU FSR1 test could not be started; ordinary pages remain on Chromium.', 'error');
    showToast(error?.message || 'The WebGPU FSR1 test could not be started.');
  } finally {
    fsrWebGpuOpening = false;
    button.textContent = 'Open WebGPU FSR1 scene in active core';
    updateFsrLabControls();
  }
}

function setFsrWebGpuStatusMessage(message, kind = 'info') {
  const status = document.querySelector('#fsr-webgpu-status');
  if (!status) return;
  status.textContent = String(message || '');
  status.dataset.kind = kind;
}

async function openFsrTestScene() {
  if (!browser) {
    showToast('The WebGL2 diagnostic scene opens in the Windows desktop app.');
    return;
  }
  const slot = activePane;
  const button = document.querySelector('#fsr-open-test-scene');
  button.disabled = true;
  setFsrTestStatus(`Opening the bundled animated WebGL2 scene in Core ${slot + 1}…`, 'working');
  try {
    const result = await browser.openFsrTestScene(slot);
    if (!result?.ok) throw new Error(result?.error || 'The test scene tab could not be opened.');
    const currentStates = await browser.getStates();
    currentStates.forEach(updateState);
    setFsrTestStatus('Test scene opened. Wait for “WebGL2 · animated” in the browser pane, then run the opt-in capture.', 'info');
  } catch (error) {
    setFsrTestStatus(error?.message || 'The test scene could not be opened.', 'error');
    showToast(error?.message || 'The test scene could not be opened.');
  } finally {
    button.disabled = false;
    updateFsrLabControls();
  }
}

async function runFsrCaptureTest() {
  if (!browser || fsrCaptureRunning) return;
  const tab = activeTab(activePane);
  if (!tab?.fsrTestScene || tab.loading) {
    setFsrTestStatus('Open and activate the bundled WebGL2 test-scene tab in the selected core first.', 'error');
    return;
  }
  const adapterIndex = Number(document.querySelector('#fsr-adapter-select').value);
  if (!Number.isInteger(adapterIndex) || adapterIndex < 0) {
    setFsrTestStatus('No compatible non-software D3D12 adapter is available. WARP is software-only and is never substituted for hardware.', 'error');
    return;
  }
  fsrCaptureRunning = true;
  fsrCaptureJobId = '';
  fsrLastResult = null;
  document.querySelector('#fsr-capture-run').textContent = 'Starting…';
  setFsrTestStatus('Starting an explicit three-frame WebContentsView capture; ordinary rendering remains enabled.', 'working');
  updateFsrLabControls();
  try {
    const result = await browser.processFsrTestScene({ slot: activePane, tabId: tab.id, frameCount: 3, adapterIndex });
    if (!result?.ok) throw new Error(result?.error || 'FSR frame processing failed.');
    fsrLastResult = result;
    renderFsrTestResult(result);
    await refreshGraphicsDiagnostics({ force: true });
    renderGraphicsMode(selectedMode);
  } catch (error) {
    const message = error?.message || 'The opt-in FSR test failed; standard Chromium rendering remains active.';
    fsrLastResult = { ok: false, error: message };
    setFsrLifecycleState('FAILED');
    setFsrTestStatus(message, 'error');
    showToast(message);
  } finally {
    fsrCaptureRunning = false;
    fsrCaptureJobId = '';
    document.querySelector('#fsr-capture-run').textContent = 'Capture + process 3 frames';
    updateFsrLabControls();
  }
}

async function cancelFsrCaptureTest() {
  if (!browser || !fsrCaptureJobId) return;
  const cancelled = await browser.cancelFsrTestScene(fsrCaptureJobId);
  if (cancelled) setFsrTestStatus('Cancellation requested. Any already completed captures remain in the diagnostic folder.', 'working');
}

function updateTechnologyCard(id, feature, hardwareLabel = '') {
  const state = feature?.state || 'UNSUPPORTED';
  const cssState = lifecycleStateClass(state);
  const chip = document.querySelector(`#performance-${id}-state`);
  const card = document.querySelector(`[data-technology="${id}"]`);
  chip.textContent = state;
  chip.dataset.state = cssState;
  card.dataset.state = cssState;
  document.querySelector(`#performance-${id}-detail`).textContent = feature?.reason || 'No runtime report is available.';
  if (id === 'wasm') {
    document.querySelector('#performance-wasm-runtime').textContent = feature?.initialized
      ? `INITIALIZED · add(19, 23) = ${wasmCapability.answer ?? 42}`
      : state;
    document.querySelector('#performance-wasm-result').textContent = wasmResult?.passed
      ? `${wasmResult.iterations.toLocaleString()} calls · ${wasmResult.elapsedMs.toFixed(2)} ms CPU/V8`
      : wasmResult?.error ? `FAILED · ${wasmResult.error}` : 'Startup capability check only; throughput test not run';
    return;
  }
  document.querySelector(`#performance-${id}-hardware`).textContent = hardwareLabel;
  document.querySelector(`#performance-${id}-compatibility`).textContent = feature?.hardwareCompatibility || 'NOT TESTED';
  document.querySelector(`#performance-${id}-runtime`).textContent = featureRuntimeLabel(feature || {});
}

function renderPerformancePanel(state) {
  const report = graphicsCapabilities;
  const primary = report?.gpu?.primaryDevice;
  const gpuName = document.querySelector('#performance-gpu-name');
  const gpuDriver = document.querySelector('#performance-gpu-driver');
  if (primary) {
    gpuName.textContent = `${primary.vendor || 'Unknown vendor'} ${primary.name || 'Unknown device'}${primary.active ? ' · Chromium-reported active device' : ''}`;
    gpuDriver.textContent = primary.driverVersion ? `Driver reported by Electron: ${primary.driverVersion}` : 'Driver version not reported by Electron';
  } else {
    gpuName.textContent = report?.gpu?.infoError ? 'GPU details unavailable' : 'No GPU device reported by Electron';
    gpuDriver.textContent = report?.gpu?.infoError || 'Driver version not reported';
  }

  const nvidiaLabel = report?.gpu?.nvidiaDetected
    ? 'NVIDIA GPU reported by Electron; DLSS runtime/compatibility not verified'
    : report?.gpu?.infoError ? 'GPU identification unavailable' : 'No NVIDIA GPU reported by Electron';
  const fsrWebGpuScene = graphicsInfo?.fsrWebGpuScenes?.find((scene) => scene.processingFrames) || graphicsInfo?.fsrWebGpuScenes?.[0];
  const webGpuAdapterInfo = fsrWebGpuScene?.adapter || {};
  const webGpuAdapterName = [webGpuAdapterInfo.vendor, webGpuAdapterInfo.device, webGpuAdapterInfo.description].filter(Boolean).join(' · ');
  const webGpuAdapterClass = fsrWebGpuScene?.softwareAdapter === true
    ? 'software WebGPU adapter'
    : fsrWebGpuScene?.softwareAdapter === false
      ? 'non-software WebGPU adapter; physical identity needs manual review'
      : 'WebGPU adapter not classified';
  const fsrHardwareLabel = fsrWebGpuScene
    ? `${webGpuAdapterName || 'WebGPU adapter identity not exposed'} · ${webGpuAdapterClass}`
    : 'WebGPU FSR1 adapter not initialized; physical-GPU validation NOT RUN';
  updateTechnologyCard('dlss', report?.technologies?.dlss, nvidiaLabel);
  updateTechnologyCard('fsr', report?.technologies?.fsr, fsrHardwareLabel);
  updateTechnologyCard('wasm', report?.technologies?.wasm);

  const apis = report?.apis || {};
  const apiDetails = graphicsInfo?.graphicsApiDetails || {};
  const glDescription = apiDetails.glRenderer || apiDetails.glImplementationParts || 'Chromium renderer details not reported';
  document.querySelector('#performance-api-summary').textContent = `WebGPU: ${apis.webgpu?.status || 'not queried'} · WebGL2: ${apis.webgl2?.status || 'not queried'} · Chromium GL renderer: ${glDescription}`;
  document.querySelector('#performance-native-api-summary').textContent = apis.nativeD3D12 || 'D3D12 helper adapter query not run; Vulkan integration is not present.';
  renderFsrAdapterOptions();

  const activeUpscaler = ['dlss', 'fsr'].map((id) => ({ id, ...report?.technologies?.[id] })).find((feature) => feature.processingFrames);
  const initializedUpscaler = activeUpscaler || ['dlss', 'fsr'].map((id) => ({ id, ...report?.technologies?.[id] })).find((feature) => feature.initialized && !feature.failed);
  const frameSummary = document.querySelector('#performance-frame-summary');
  const gpuTimeSummary = document.querySelector('#performance-gpu-time-summary');
  const previousFsrReport = graphicsInfo?.lastFsrReport;
  if (activeUpscaler) {
    const dimensions = activeUpscaler.inputWidth && activeUpscaler.inputHeight && activeUpscaler.outputWidth && activeUpscaler.outputHeight
      ? ` · ${activeUpscaler.inputWidth}×${activeUpscaler.inputHeight} → ${activeUpscaler.outputWidth}×${activeUpscaler.outputHeight}`
      : '';
    frameSummary.textContent = `${activeUpscaler.id.toUpperCase()} · ${activeUpscaler.processedFrames} confirmed controlled-scene frame(s)${dimensions}`;
    gpuTimeSummary.textContent = activeUpscaler.id === 'fsr' && Number.isFinite(activeUpscaler.queueCompletionWallMs)
      ? `WebGPU frame-encode → queue-completion wall ${activeUpscaler.queueCompletionWallMs.toFixed(2)} ms · average ${Number(activeUpscaler.averageQueueCompletionWallMs).toFixed(2)} ms · not a GPU timestamp`
      : activeUpscaler.gpuTimeMs === null
        ? 'GPU time not reported by the native backend'
        : `GPU ${activeUpscaler.gpuTimeMs.toFixed(3)} ms${activeUpscaler.cpuTimeMs === null ? '' : ` · CPU ${activeUpscaler.cpuTimeMs.toFixed(3)} ms`}`;
  } else if (fsrLastResult?.ok || previousFsrReport) {
    const completedFrames = fsrLastResult?.ok ? fsrLastResult.frameCount : report?.technologies?.fsr?.processedFrames || 1;
    const latest = fsrLastResult?.ok ? fsrLastResult.frames.at(-1) : null;
    const input = latest ? `${latest.inputWidth}×${latest.inputHeight}` : `${previousFsrReport?.input?.width || '?'}×${previousFsrReport?.input?.height || '?'}`;
    const output = latest ? `${latest.outputWidth}×${latest.outputHeight}` : `${previousFsrReport?.output?.width || '?'}×${previousFsrReport?.output?.height || '?'}`;
    frameSummary.textContent = `FSR1 controlled-scene preview · ${completedFrames} captured frame(s) · ${input} → ${output} · not active on ordinary pages`;
    gpuTimeSummary.textContent = latest?.nativeGpuTimestampsAvailable
      ? `Latest EASU ${Number(latest.easuGpuTimeMs).toFixed(3)} ms + RCAS ${Number(latest.rcasGpuTimeMs).toFixed(3)} ms GPU · capture/readback/helper wall time is separate`
      : 'Native GPU timestamps unavailable; preview/readback timings are not game frame time.';
  } else if (initializedUpscaler) {
    frameSummary.textContent = `${initializedUpscaler.id.toUpperCase()} initialized · no live webpage frames confirmed`;
    gpuTimeSummary.textContent = 'No frame timing is reported until a native pass processes a real frame.';
  } else {
    frameSummary.textContent = 'No native upscaler active; no general-page frame counter is available.';
    gpuTimeSummary.textContent = 'No WebGPU FSR1 scene timing has been reported; physical-GPU validation is NOT RUN.';
  }

  const displayNames = {
    wasm: 'WASM runtime · no upscaling',
    dlss: 'NVIDIA DLSS',
    fsr: 'AMD FidelityFX FSR',
    hybrid: 'Hybrid policy',
    standard: 'Standard Chromium',
  };
  const compactMode = document.querySelector('#performance-summary-mode');
  const compactDetail = document.querySelector('#performance-summary-detail');
  const compactDot = document.querySelector('#performance-status-dot');
  const compactState = lifecycleStateClass(state.state);
  compactDot.dataset.state = state.stateClass || compactState;
  if (graphicsSelection === 'auto') {
    compactMode.textContent = `Automatic · ${displayNames[selectedMode]}`;
    compactDetail.textContent = selectedMode === 'wasm'
      ? 'WASM runtime verified; pages still use Chromium. No upscaling.'
      : state.upscalerActive
        ? `${state.state} · ${state.processedFrames} frame(s) confirmed.`
        : `${state.state} · no unverified graphics path is enabled.`;
  } else {
    compactMode.textContent = `Manual · ${displayNames[selectedMode]}`;
    compactDetail.textContent = selectedMode === 'fsr' && state.upscalerActive
      ? 'FSR1 is processing only the bundled WebGPU game scene; ordinary pages remain Chromium.'
      : selectedMode === 'fsr' && state.state !== 'UNSUPPORTED' && state.state !== 'FAILED'
        ? 'FSR1 requires the opt-in bundled WebGPU game scene; no ordinary-page upscaling is claimed.'
        : state.state === 'UNSUPPORTED' || state.state === 'FAILED'
          ? `${state.state} · safe Chromium fallback; no ordinary-page upscaling.`
          : selectedMode === 'wasm'
            ? 'WASM runtime only; it does not upscale images.'
            : `${state.state} · page rendering remains Chromium unless an applicable native page-frame path is verified.`;
  }

  const errorBox = document.querySelector('#performance-error');
  const requestedUpscaler = selectedMode === 'dlss' || selectedMode === 'fsr';
  const reportAnError = state.state === 'FAILED' || (graphicsSelection === 'manual' && requestedUpscaler && state.state === 'UNSUPPORTED');
  errorBox.hidden = !reportAnError;
  errorBox.textContent = reportAnError
    ? `${state.message} This does not affect ordinary browsing.`
    : '';
}

function renderGraphicsMode(mode) {
  const requestedMode = GRAPHICS_MODES.some((item) => item.id === mode) ? mode : 'standard';
  const state = resolveGraphicsMode(requestedMode, { capabilities: graphicsCapabilities, wasmResult });
  selectedMode = state.requestedMode;

  for (const control of document.querySelectorAll('[data-graphics-mode]')) {
    const id = control.dataset.graphicsMode;
    const selected = id === selectedMode;
    control.setAttribute('aria-pressed', String(selected));
    const chip = control.querySelector('[data-mode-status]');
    if (!chip) continue;
    const feature = graphicsCapabilities?.technologies?.[id];
    if (id === 'standard') {
      chip.className = 'mode-state-chip is-active';
      chip.textContent = 'CHROMIUM ACTIVE';
    } else if (id === 'dlss' || id === 'fsr') {
      const lifecycleName = feature?.state || 'UNSUPPORTED';
      const lifecycleClass = lifecycleStateClass(lifecycleName);
      chip.className = `mode-state-chip ${lifecycleName === 'FAILED' ? 'is-blocked' : feature?.unsupported ? 'is-blocked' : feature?.active ? 'is-active' : 'is-warning'}`;
      chip.dataset.state = lifecycleClass;
      chip.textContent = lifecycleName;
    } else if (id === 'wasm') {
      chip.className = `mode-state-chip ${feature?.initialized ? 'is-active' : feature?.failed ? 'is-blocked' : 'is-warning'}`;
      chip.dataset.state = lifecycleStateClass(feature?.state);
      chip.textContent = `${feature?.state || 'DETECTED'} · NO UPSCALING`;
    } else {
      chip.className = 'mode-state-chip is-warning';
      chip.textContent = 'POLICY ONLY · SAFE FALLBACK';
    }
  }

  const displayNames = {
    wasm: 'WebAssembly runtime (not an upscaler)',
    dlss: 'NVIDIA DLSS',
    fsr: 'AMD FidelityFX Super Resolution',
    hybrid: 'Hybrid controller policy',
    standard: 'Standard Chromium rendering',
  };
  const badges = { wasm: 'WASM · NO UPSCALE', dlss: 'DLSS STATUS', fsr: 'FSR STATUS', hybrid: 'HYBRID POLICY', standard: 'STD' };
  document.querySelector('#graphics-mode-badge').textContent = badges[selectedMode];
  document.querySelector('#graphics-mode-live').textContent = `${displayNames[selectedMode]} · ${state.state}`;
  document.querySelector('#mode-report-state').textContent = state.state;
  document.querySelector('#mode-report-state').dataset.kind = state.stateClass;
  document.querySelector('#mode-report-title').textContent = displayNames[selectedMode];
  document.querySelector('#mode-report-message').textContent = state.message;
  document.querySelector('#mode-report-backend').textContent = `Effective renderer: ${state.backend}`;
  document.querySelector('#mode-report-state').className = `mode-report-state state-${state.stateClass}`;
  syncGraphicsPreferenceControls();
  renderPerformancePanel(state);
  return state;
}

function showWasmResult(result) {
  const root = document.querySelector('#wasm-result');
  root.dataset.kind = result.passed ? 'pass' : 'fail';
  root.querySelector('.wasm-result-mark').textContent = result.passed ? '✓' : '!';
  document.querySelector('#wasm-result-title').textContent = result.passed ? 'PASS · WebAssembly module executed' : 'FAIL · WebAssembly module did not pass';
  document.querySelector('#wasm-result-detail').textContent = result.passed
    ? `add(19, 23) = ${result.answer} · ${result.iterations.toLocaleString()} checked calls · ${result.elapsedMs.toFixed(2)} ms · ${result.operationsPerSecond?.toLocaleString() || '—'} calls/s. ${result.scope}.`
    : result.error;
  if (graphicsCapabilities) renderGraphicsMode(selectedMode);
}

async function runWasmDiagnostic() {
  if (wasmRunning) return wasmResult;
  wasmRunning = true;
  const buttons = [document.querySelector('#wasm-run'), document.querySelector('#performance-wasm-run')].filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; button.textContent = 'Running…'; });
  try {
    wasmResult = await runWasmBenchmark();
    showWasmResult(wasmResult);
    return wasmResult;
  } catch (error) {
    wasmResult = { passed: false, error: error?.message || 'WASM test failed.' };
    showWasmResult(wasmResult);
    return wasmResult;
  } finally {
    wasmRunning = false;
    buttons.forEach((button, index) => {
      button.disabled = false;
      button.textContent = index === 0 ? 'Run WASM test' : 'Run WASM test';
    });
  }
}

async function selectGraphicsMode(mode, { manual = true } = {}) {
  if (!GRAPHICS_MODES.some((item) => item.id === mode)) return;
  if (manual) graphicsSelection = 'manual';
  selectedMode = mode;
  if (mode === 'wasm' || mode === 'hybrid') await runWasmDiagnostic();
  saveGraphicsPreferences();
  const state = renderGraphicsMode(mode);
  if (state.state === 'UNSUPPORTED' || state.state === 'FAILED') {
    showToast(`${mode.toUpperCase()} is ${state.state.toLowerCase()}; standard Chromium rendering remains active.`);
  } else if (mode === 'wasm') {
    showToast('WebAssembly test completed. It is not a GPU upscaler; web pages still render through Chromium.');
  }
}

async function queryWebGPU() {
  if (!('gpu' in navigator) || !navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
    return { status: 'not exposed by this Chromium renderer' };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { status: 'API exposed; no compatible adapter returned' };
    let info = {};
    try { info = adapter.info || {}; } catch { /* Browser privacy may hide adapter identity. */ }
    return {
      status: 'adapter available; no upscaler runtime implied',
      vendor: info.vendor || '',
      architecture: info.architecture || '',
      device: info.device || '',
      description: info.description || '',
    };
  } catch (error) {
    return { status: `adapter request failed: ${error?.message || 'unknown error'}` };
  }
}

function queryWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!context) return { status: 'not available in this renderer' };
    const version = context.getParameter(context.VERSION) || 'WebGL 2';
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return { status: `${version}; capability only` };
  } catch (error) {
    return { status: `probe failed: ${error?.message || 'unknown error'}` };
  }
}

function autoSelectIfEnabled() {
  if (graphicsSelection !== 'auto') return;
  selectedMode = chooseAutomaticMode(graphicsCapabilities);
  saveGraphicsPreferences();
}

async function refreshGraphicsDiagnostics({ force = false } = {}) {
  if (graphicsRefreshPending) {
    if (force) graphicsRefreshQueued = true;
    return;
  }
  graphicsRefreshPending = true;
  const summary = document.querySelector('#graphics-capabilities');
  summary.textContent = 'Querying Electron GPU information, Chromium graphics APIs, and WebAssembly…';
  try {
    const nativeInfoPromise = browser?.getGraphicsInfo()
      .catch((error) => ({ gpuInfoError: error?.message || 'GPU information unavailable.' }))
      || Promise.resolve(null);
    const [nativeInfo, webgpu, webgl2, wasm] = await Promise.all([
      nativeInfoPromise,
      queryWebGPU(),
      Promise.resolve(queryWebGL2()),
      probeWasmCapability(),
    ]);
    graphicsInfo = nativeInfo;
    wasmCapability = wasm;
    graphicsCapabilities = detectGraphicsCapabilities({
      gpuDevices: nativeInfo?.gpuDevices || [],
      gpuInfoError: nativeInfo?.gpuInfoError || '',
      featureStatus: nativeInfo?.featureStatus || {},
      webgpu,
      webgl2,
      wasm,
      integration: nativeInfo?.integration || {
        dlss: { implemented: false, reason: 'No Streamline/DLSS native frame processor is compiled into this build.' },
        fsr: { implemented: false, reason: 'No AMD FSR native frame processor is compiled into this build.' },
      },
    });
    autoSelectIfEnabled();
    const devices = nativeInfo?.gpuDevices?.map((device) => `${device.vendor} ${device.name}${device.active ? ' (active)' : ''}`) || [];
    const gpuText = devices.length ? devices.join('; ') : nativeInfo?.gpuInfoError || 'No GPU device details reported';
    const chromium = nativeInfo?.chromiumVersion ? `Chromium ${nativeInfo.chromiumVersion}` : 'Chromium version not available';
    const electron = nativeInfo?.electronVersion ? `Electron ${nativeInfo.electronVersion}` : 'Web preview (not the desktop runtime)';
    const fsrAdapters = nativeInfo?.nativeFsrAdapters?.adapters || [];
    const compatibleFsrAdapters = fsrAdapters.filter((adapter) => !adapter.softwareAdapter && adapter.fsr1Compatible);
    const glRenderer = nativeInfo?.graphicsApiDetails?.glRenderer || nativeInfo?.graphicsApiDetails?.glImplementationParts || 'Chromium renderer API details not reported';
    const fsrStatus = nativeInfo?.nativeFsrAdapters?.available
      ? `${compatibleFsrAdapters.length} compatible non-software D3D12 adapter(s) for the PNG diagnostic only`
      : nativeInfo?.nativeFsrAdapters?.error || 'Native D3D12 screenshot helper not present in this runtime';
    const liveFsrScene = nativeInfo?.fsrWebGpuScenes?.find((scene) => scene.processingFrames) || nativeInfo?.fsrWebGpuScenes?.[0];
    const liveFsrStatus = liveFsrScene?.processingFrames
      ? `WebGPU FSR1 ${liveFsrScene.framesCompleted} frame(s) in the controlled game scene`
      : 'WebGPU FSR1 scene NOT RUN';
    summary.textContent = `${electron} · ${chromium} · GPU: ${gpuText} · Chromium GL: ${glRenderer} · WebGPU: ${webgpu.status} · WebGL2: ${webgl2.status} · ${liveFsrStatus} · D3D12 diagnostic: ${fsrStatus}`;
    const fsrTestSupport = document.querySelector('#fsr-test-state');
    if (fsrTestSupport && !fsrCaptureRunning) {
      fsrTestSupport.textContent = fsrLastResult?.ok ? 'PASS' : fsrLastResult?.ok === false ? 'FAILED' : nativeInfo?.lastFsrReport ? 'PREVIOUS RUN' : 'NOT RUN';
      fsrTestSupport.dataset.state = fsrLastResult?.ok ? 'initialized' : fsrLastResult?.ok === false ? 'failed' : nativeInfo?.lastFsrReport ? 'initialized' : 'detected';
      if (!fsrLastResult && !nativeInfo?.lastFsrReport) {
        setFsrTestStatus('PNG diagnostic NOT RUN. It remains opt-in, separately labeled, and is never used as a live browser upscaler.', 'info');
      }
    }
    updateFsrWebGpuSceneStatus(nativeInfo?.fsrWebGpuScenes || []);
    document.querySelector('#graphics-raw').textContent = JSON.stringify({
      platform: nativeInfo?.platform || navigator.platform,
      architecture: nativeInfo?.architecture || 'browser preview',
      electronVersion: nativeInfo?.electronVersion || '',
      chromiumVersion: nativeInfo?.chromiumVersion || '',
      gpuDevices: nativeInfo?.gpuDevices || [],
      chromiumGraphicsApiDetails: nativeInfo?.graphicsApiDetails || {},
      chromiumGpuFeatureStatus: nativeInfo?.featureStatus || 'Native diagnostics unavailable in web preview',
      nativeD3D12FsrAdapters: nativeInfo?.nativeFsrAdapters || null,
      fsrWebGpuScenes: nativeInfo?.fsrWebGpuScenes || [],
      lastFsrBrowserFrameReport: nativeInfo?.lastFsrReport || null,
      webgpu,
      webgl2,
      wasm,
      lifecycle: graphicsCapabilities,
    }, null, 2);
    renderGraphicsMode(selectedMode);
  } catch (error) {
    wasmCapability = { detected: typeof WebAssembly === 'object', compatible: false, initialized: false, failed: true, error: error?.message || 'Capability query failed.' };
    graphicsCapabilities = detectGraphicsCapabilities({ wasm: wasmCapability, gpuInfoError: error?.message || 'Graphics diagnostics failed.' });
    autoSelectIfEnabled();
    summary.textContent = `Graphics diagnostics failed: ${error?.message || 'unknown error'}. No DLSS/FSR processing path is available.`;
    document.querySelector('#graphics-raw').textContent = JSON.stringify({ error: error?.message || 'Graphics diagnostics failed.', lifecycle: graphicsCapabilities }, null, 2);
    renderGraphicsMode(selectedMode);
  } finally {
    graphicsRefreshPending = false;
    if (graphicsRefreshQueued) {
      graphicsRefreshQueued = false;
      queueMicrotask(() => refreshGraphicsDiagnostics());
    }
  }
}

for (const form of document.querySelectorAll('.address-form')) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    navigate(Number(form.dataset.slot), form.querySelector('input').value);
  });
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => runAction(Number(button.dataset.slot), button.dataset.action));
});

document.querySelectorAll('[data-new-tab]').forEach((button) => {
  button.addEventListener('click', () => openNewTab(Number(button.dataset.newTab)));
});

document.querySelectorAll('[data-pane]').forEach((pane) => {
  pane.addEventListener('pointerdown', () => setActivePane(Number(pane.dataset.pane)));
});

document.querySelectorAll('[data-focus-pane]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFocus(Number(button.dataset.focusPane));
  });
});

document.querySelectorAll('[data-query]').forEach((button) => {
  button.addEventListener('click', () => navigate(Number(button.closest('[data-pane]').dataset.pane), button.dataset.query));
});

document.querySelector('#sync-toggle').addEventListener('click', (event) => {
  syncNavigation = !syncNavigation;
  const button = event.currentTarget;
  button.setAttribute('aria-pressed', String(syncNavigation));
  document.querySelector('#sync-status').textContent = syncNavigation ? 'ON' : 'OFF';
  showToast(syncNavigation ? 'Sync on: submitted addresses open in all three cores.' : 'Sync off: each core navigates independently.');
});

document.querySelector('#reload-all').addEventListener('click', async () => {
  if (!browser) {
    showToast('Reload all is available in the desktop app.');
    return;
  }
  await Promise.all(Array.from({ length: CORE_COUNT }, (_, slot) => browser.action(slot, 'reload')));
});

document.querySelector('#new-tab').addEventListener('click', () => openNewTab(activePane));
document.querySelector('#immersive-toggle').addEventListener('click', toggleImmersiveFullscreen);
document.querySelector('#immersive-exit').addEventListener('click', toggleImmersiveFullscreen);
document.querySelector('#bookmark-current').addEventListener('click', async () => {
  const current = states[activePane];
  if (!browser || !current?.url) {
    showToast('Open a web page in the desktop app before bookmarking it.');
    return;
  }
  const result = await browser.addBookmark({ url: current.url, title: current.title || current.url });
  showToast(result?.ok ? 'Bookmark saved.' : result?.error || 'Bookmark could not be saved.');
});

document.querySelector('#bookmarks-open').addEventListener('click', () => showUtility('bookmarks'));
document.querySelector('#history-open').addEventListener('click', () => showUtility('history'));
document.querySelector('#downloads-open').addEventListener('click', () => showUtility('downloads'));
document.querySelector('#settings-open').addEventListener('click', () => showUtility('settings'));
document.querySelector('#performance-panel-toggle').addEventListener('click', () => {
  setPerformancePanelExpanded(performancePanelCollapsed);
});
document.querySelector('#graphics-selection').addEventListener('change', (event) => {
  graphicsSelection = event.currentTarget.value === 'manual' ? 'manual' : 'auto';
  if (graphicsSelection === 'auto') autoSelectIfEnabled();
  saveGraphicsPreferences();
  renderGraphicsMode(selectedMode);
});
document.querySelector('#graphics-mode-select').addEventListener('change', (event) => {
  selectGraphicsMode(event.currentTarget.value);
});
document.querySelector('#performance-wasm-run').addEventListener('click', runWasmDiagnostic);
document.querySelector('#fsr-open-webgpu-test-scene').addEventListener('click', openFsrWebGpuTestScene);
document.querySelector('#fsr-open-test-scene').addEventListener('click', openFsrTestScene);
document.querySelector('#fsr-capture-run').addEventListener('click', runFsrCaptureTest);
document.querySelector('#fsr-capture-cancel').addEventListener('click', cancelFsrCaptureTest);
document.querySelector('#fsr-adapter-select').addEventListener('change', (event) => {
  const value = Number(event.currentTarget.value);
  fsrAdapterIndexPreference = Number.isInteger(value) && value >= 0 ? value : null;
  saveGraphicsPreferences();
  updateFsrLabControls();
});
document.querySelector('#performance-diagnostics').addEventListener('click', () => {
  graphicsDialog.showModal();
  scheduleLayout();
  refreshGraphicsDiagnostics();
});
document.querySelector('#graphics-toggle').addEventListener('click', () => {
  graphicsDialog.showModal();
  scheduleLayout();
  refreshGraphicsDiagnostics();
});
document.querySelector('#wasm-run').addEventListener('click', runWasmDiagnostic);
document.querySelectorAll('[data-graphics-mode]').forEach((button) => {
  button.addEventListener('click', () => selectGraphicsMode(button.dataset.graphicsMode));
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog')?.close());
});
for (const dialog of [graphicsDialog, utilityDialog]) {
  dialog.addEventListener('close', scheduleLayout);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

document.addEventListener('keydown', (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'l') {
    event.preventDefault();
    switchCore(activePane, true);
  } else if (key === 'r') {
    event.preventDefault();
    if (event.shiftKey) document.querySelector('#reload-all').click();
    else runAction(activePane, 'reload');
  } else if (key === 't') {
    event.preventDefault();
    openNewTab(activePane);
  } else if (key === 'w') {
    const tab = activeTab(activePane);
    if (tab && states[activePane].tabs.length > 1) {
      event.preventDefault();
      browser?.closeTab(activePane, tab.id);
    }
  } else if (/^[1-3]$/.test(key)) {
    event.preventDefault();
    switchCore(Number(key) - 1);
  }
});

window.addEventListener('resize', scheduleLayout, { passive: true });
window.addEventListener('focus', refreshGraphicsDiagnostics);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshGraphicsDiagnostics();
});
if ('ResizeObserver' in window) {
  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(grid);
}

if (browser) {
  browser.onState(updateState);
  browser.onActive((slot) => switchCore(Number(slot)));
  browser.onShortcut(handleDesktopShortcut);
  browser.onFullscreenState((enabled) => setImmersiveMode(Boolean(enabled)));
  browser.onFsrProgress((progress) => {
    if (!fsrCaptureRunning || !progress?.jobId) return;
    if (!fsrCaptureJobId) fsrCaptureJobId = progress.jobId;
    if (progress.jobId !== fsrCaptureJobId) return;
    if (progress.state === 'PROCESSING') {
      setFsrTestStatus(`Captured browser frame ${progress.frameIndex}/${progress.frameCount} (${progress.width}×${progress.height}); starting the separate D3D12 FSR1 helper. The original tab keeps rendering normally.`, 'working');
    } else if (progress.state === 'INITIALIZED') {
      setFsrLifecycleState('INITIALIZED');
      setFsrTestStatus(`The D3D12 FSR1 helper initialized its pipelines for frame ${progress.frameIndex}/${progress.frameCount}; no ordinary page renderer is attached.`, 'working');
    } else if (progress.state === 'NATIVE PROCESSING') {
      setFsrLifecycleState('PROCESSING FRAMES');
      setFsrTestStatus(`D3D12 FSR1 EASU + RCAS is processing browser-captured frame ${progress.frameIndex}/${progress.frameCount}. The original tab keeps rendering normally.`, 'working');
    } else if (progress.state === 'FRAME PROCESSED') {
      setFsrLifecycleState('COMPATIBLE');
      setFsrTestStatus(`FSR1 validated frame ${progress.frameIndex}/${progress.frameCount}: ${progress.inputWidth}×${progress.inputHeight} → ${progress.outputWidth}×${progress.outputHeight} on ${progress.adapter}${progress.softwareAdapter ? ' (WARP software)' : ''}.`, 'working');
    } else if (progress.state === 'FAILED') {
      setFsrLifecycleState('FAILED');
      setFsrTestStatus(progress.error || 'FSR test failed.', 'error');
    } else if (progress.state === 'CANCELLED') {
      setFsrLifecycleState('COMPATIBLE');
      setFsrTestStatus(progress.error || 'FSR test was cancelled.', 'error');
    }
    updateFsrLabControls();
  });
  browser.onDownloads((items) => {
    const button = document.querySelector('#downloads-open');
    const activeCount = items.filter((item) => item.state === 'in-progress').length;
    button.dataset.activeDownloads = String(activeCount);
    button.title = activeCount ? `${activeCount} download${activeCount === 1 ? '' : 's'} in progress` : 'Downloads';
    if (utilityDialog.open && utilityKind === 'downloads') showUtility('downloads');
  });
  browser.onDataChanged((change) => {
    if (utilityDialog.open && (utilityKind === 'history' || utilityKind === 'bookmarks')) showUtility(utilityKind);
    if (change?.kind === 'history') document.querySelector('#history-open').dataset.hasHistory = 'true';
  });
  browser.getStates().then((initialStates) => initialStates.forEach(updateState)).catch((error) => showToast(error?.message || 'Browser state could not be loaded.'));
  browser.getDownloads().then((items) => {
    const activeCount = items.filter((item) => item.state === 'in-progress').length;
    document.querySelector('#downloads-open').dataset.activeDownloads = String(activeCount);
  }).catch(() => {});
  scheduleLayout();
} else {
  document.querySelectorAll('[data-state]').forEach((label) => { label.dataset.kind = 'ready'; });
  document.querySelectorAll('[data-new-tab]').forEach((button) => { button.disabled = true; });
}

setPerformancePanelExpanded(!performancePanelCollapsed, { persist: false });
syncGraphicsPreferenceControls();
renderGraphicsMode(selectedMode);
refreshGraphicsDiagnostics();
