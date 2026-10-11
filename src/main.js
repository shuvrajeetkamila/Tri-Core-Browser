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
let syncNavigation = false;
let toastTimer;
let layoutFrame = 0;
const graphicsPreferences = loadGraphicsPreferences();
let graphicsSelection = graphicsPreferences.selection;
let graphicsPriority = graphicsPreferences.priority;
let selectedMode = graphicsPreferences.mode;
let performancePanelCollapsed = graphicsPreferences.panelCollapsed;
let wasmCapability = { detected: typeof WebAssembly === 'object', compatible: false, initialized: false, failed: false };
let wasmResult = null;
let wasmRunning = false;
let graphicsRefreshPending = false;
let graphicsInfo = null;
let graphicsCapabilities = detectGraphicsCapabilities({ wasm: wasmCapability });
let utilityKind = 'bookmarks';

if (browser) document.body.classList.add('desktop-mode');

function saveGraphicsPreferences() {
  saveGraphicsPreferenceRecord({
    selection: graphicsSelection,
    priority: graphicsPriority,
    mode: selectedMode,
    panelCollapsed: performancePanelCollapsed,
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
  if (focusedPane === slot) {
    focusedPane = null;
    grid.removeAttribute('data-focus');
    document.querySelector('#focus-toggle').setAttribute('aria-label', 'Focus the active core');
    document.querySelector('#focus-toggle').title = 'Focus active core';
    showToast('Showing all three cores.');
  } else {
    focusedPane = slot;
    activePane = slot;
    setActivePane(slot);
    grid.dataset.focus = String(slot);
    document.querySelector('#focus-toggle').setAttribute('aria-label', 'Show all three cores');
    document.querySelector('#focus-toggle').title = 'Show all cores';
    showToast(`Focusing Core ${String(slot + 1).padStart(2, '0')}.`);
  }
  scheduleLayout();
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
      createElement('p', '', 'WebAssembly diagnostic: implemented. NVIDIA DLSS: not integrated. AMD FSR: not integrated.'),
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
  document.querySelector('#graphics-priority').value = graphicsPriority;
  document.querySelector('#graphics-priority').disabled = graphicsSelection !== 'auto';
  document.querySelector('#graphics-mode-select').value = selectedMode;
  document.querySelector('#graphics-mode-select').disabled = graphicsSelection === 'auto';
}

function lifecycleStateClass(state) {
  return String(state || 'UNSUPPORTED').toLowerCase().replace(/\s+/g, '-');
}

function featureRuntimeLabel(feature) {
  if (feature.failed) {
    const count = feature.initialized ? ` · ${feature.processedFrames} confirmed frame(s)` : '';
    return `FAILED · ${feature.error || 'runtime error'}${count}`;
  }
  if (feature.unsupported) return 'Not integrated · initialization not attempted · no frame counter';
  if (!feature.initialized) return `${feature.state} · not initialized`;
  return `${feature.state} · ${feature.processedFrames} confirmed frame(s)`;
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
    gpuName.textContent = `${primary.vendor || 'Unknown vendor'} ${primary.name || 'Unknown device'}${primary.active ? ' · Chromium active device' : ''}`;
    gpuDriver.textContent = primary.driverVersion ? `Driver reported by Electron: ${primary.driverVersion}` : 'Driver version not reported by Electron';
  } else {
    gpuName.textContent = report?.gpu?.infoError ? 'GPU details unavailable' : 'No GPU device reported by Electron';
    gpuDriver.textContent = report?.gpu?.infoError || 'Driver version not reported';
  }

  const nvidiaLabel = report?.gpu?.nvidiaDetected
    ? 'NVIDIA GPU detected; DLSS feature compatibility not tested'
    : report?.gpu?.infoError ? 'GPU identification unavailable' : 'No NVIDIA GPU reported';
  const amdLabel = report?.gpu?.amdDetected
    ? 'AMD GPU detected; FSR feature compatibility not tested'
    : report?.gpu?.infoError ? 'GPU identification unavailable' : 'No AMD GPU reported';
  updateTechnologyCard('dlss', report?.technologies?.dlss, nvidiaLabel);
  updateTechnologyCard('fsr', report?.technologies?.fsr, amdLabel);
  updateTechnologyCard('wasm', report?.technologies?.wasm);

  const apis = report?.apis || {};
  document.querySelector('#performance-api-summary').textContent = `WebGPU: ${apis.webgpu?.status || 'not queried'} · WebGL2: ${apis.webgl2?.status || 'not queried'}`;
  document.querySelector('#performance-native-api-summary').textContent = 'D3D12/Vulkan are not directly probed; no native upscaler runtime is integrated.';

  const upscaler = ['dlss', 'fsr'].map((id) => ({ id, ...report?.technologies?.[id] })).find((feature) => feature.processingFrames);
  const initializedUpscaler = upscaler || ['dlss', 'fsr'].map((id) => ({ id, ...report?.technologies?.[id] })).find((feature) => feature.initialized && !feature.failed);
  const frameSummary = document.querySelector('#performance-frame-summary');
  const gpuTimeSummary = document.querySelector('#performance-gpu-time-summary');
  if (upscaler) {
    const dimensions = upscaler.inputWidth && upscaler.inputHeight && upscaler.outputWidth && upscaler.outputHeight
      ? ` · ${upscaler.inputWidth}×${upscaler.inputHeight} → ${upscaler.outputWidth}×${upscaler.outputHeight}`
      : '';
    frameSummary.textContent = `${upscaler.id.toUpperCase()} · ${upscaler.processedFrames} confirmed frame(s)${dimensions}`;
    gpuTimeSummary.textContent = upscaler.gpuTimeMs === null
      ? 'GPU time not reported by the native backend'
      : `GPU ${upscaler.gpuTimeMs.toFixed(3)} ms${upscaler.cpuTimeMs === null ? '' : ` · CPU ${upscaler.cpuTimeMs.toFixed(3)} ms`}`;
  } else if (initializedUpscaler) {
    frameSummary.textContent = `${initializedUpscaler.id.toUpperCase()} initialized · no processed frames confirmed`;
    gpuTimeSummary.textContent = 'No frame timing is reported until a native pass processes a real frame.';
  } else {
    frameSummary.textContent = 'No native upscaler active; no frame counter is available.';
    gpuTimeSummary.textContent = 'GPU timings unavailable · no upscaler frames have been processed.';
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
    compactDetail.textContent = state.state === 'UNSUPPORTED' || state.state === 'FAILED'
      ? `${state.state} · safe Chromium fallback; no upscaling.`
      : selectedMode === 'wasm'
        ? 'WASM runtime only; it does not upscale images.'
        : `${state.state} · page rendering remains Chromium unless native frame evidence appears.`;
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
  selectedMode = chooseAutomaticMode(graphicsCapabilities, graphicsPriority);
  saveGraphicsPreferences();
}

async function refreshGraphicsDiagnostics() {
  if (graphicsRefreshPending) return;
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
    summary.textContent = `${electron} · ${chromium} · GPU: ${gpuText} · WebGPU: ${webgpu.status} · WebGL2: ${webgl2.status} · DLSS/FSR: no native processing path.`;
    document.querySelector('#graphics-raw').textContent = JSON.stringify({
      platform: nativeInfo?.platform || navigator.platform,
      architecture: nativeInfo?.architecture || 'browser preview',
      electronVersion: nativeInfo?.electronVersion || '',
      chromiumVersion: nativeInfo?.chromiumVersion || '',
      gpuDevices: nativeInfo?.gpuDevices || [],
      chromiumGpuFeatureStatus: nativeInfo?.featureStatus || 'Native diagnostics unavailable in web preview',
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
document.querySelector('#focus-toggle').addEventListener('click', () => toggleFocus(activePane));
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
document.querySelector('#graphics-priority').addEventListener('change', (event) => {
  graphicsPriority = event.currentTarget.value === 'fsr-first' ? 'fsr-first' : 'dlss-first';
  autoSelectIfEnabled();
  saveGraphicsPreferences();
  renderGraphicsMode(selectedMode);
});
document.querySelector('#graphics-mode-select').addEventListener('change', (event) => {
  selectGraphicsMode(event.currentTarget.value);
});
document.querySelector('#performance-wasm-run').addEventListener('click', runWasmDiagnostic);
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
