import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import { normalizeAddress } from './url-utils.js';

const CORE_COUNT = 3;
const HOME_URL = 'https://duckduckgo.com/';
const browser = window.triCore ?? null;
const grid = document.querySelector('#browser-grid');
const paneElements = [...document.querySelectorAll('[data-pane]')];
const toast = document.querySelector('#toast');
const states = Array.from({ length: CORE_COUNT }, () => ({ loading: false, canGoBack: false, canGoForward: false }));
let activePane = 0;
let focusedPane = null;
let syncNavigation = false;
let toastTimer;
let layoutFrame = 0;

if (browser) document.body.classList.add('desktop-mode');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3100);
}

function getPane(slot) {
  return paneElements[slot];
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

function handleDesktopShortcut(shortcut) {
  if (!shortcut || typeof shortcut !== 'object') return;
  const slot = Number(shortcut.slot);
  if (shortcut.action === 'focus-address') switchCore(slot, true);
  else if (shortcut.action === 'switch-core') switchCore(slot);
  else if (shortcut.action === 'reload') runAction(slot, 'reload');
  else if (shortcut.action === 'reload-all') document.querySelector('#reload-all').click();
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
  if (current.url && document.activeElement !== input) input.value = current.url;
}

function scheduleLayout() {
  if (!browser || layoutFrame) return;
  layoutFrame = window.requestAnimationFrame(() => {
    layoutFrame = 0;
    const rectangles = paneElements.map((pane, slot) => {
      const viewport = pane.querySelector('[data-viewport]');
      if (!viewport || (focusedPane !== null && focusedPane !== slot)) {
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
    if (result?.ok === false) showToast('That address could not be opened. Try an http or https page.');
  } else {
    const notice = getPane(slot)?.querySelector('.preview-notice');
    if (notice) {
      notice.innerHTML = `<strong>Preview mode</strong>In the desktop app, this opens in Core ${String(slot + 1).padStart(2, '0')}: <span></span>`;
      notice.querySelector('span').textContent = url;
      notice.hidden = false;
      window.setTimeout(() => { if (notice.isConnected) notice.hidden = true; }, 4200);
    }
    showToast('Live web pages open in the desktop app. This is a UI preview.');
  }

  if (syncNavigation) {
    await Promise.all(Array.from({ length: CORE_COUNT }, (_, target) => target === slot ? null : browser?.navigate(target, url)));
    if (!browser) {
      paneElements.forEach((pane, target) => {
        if (target !== slot) {
          const targetInput = pane.querySelector('[data-address]');
          targetInput.value = url;
          const notice = pane.querySelector('.preview-notice');
          notice.innerHTML = `<strong>Sync navigation preview</strong>This address would also open in Core ${String(target + 1).padStart(2, '0')}: <span></span>`;
          notice.querySelector('span').textContent = url;
          notice.hidden = false;
          window.setTimeout(() => { if (notice.isConnected) notice.hidden = true; }, 4200);
        }
      });
    }
  }
}

async function runAction(slot, action) {
  setActivePane(slot);
  if (browser) {
    const result = await browser.action(slot, action);
    if (result) updateState(result);
  } else if (action === 'reload') {
    showToast('Reload controls are available in the desktop app.');
  } else if (action === 'back' || action === 'forward') {
    showToast('Navigation history is available in the desktop app.');
  }
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

document.querySelectorAll('.address-form').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const slot = Number(form.dataset.slot);
    navigate(slot, form.querySelector('input').value);
  });
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => runAction(Number(button.dataset.slot), button.dataset.action));
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

document.querySelector('#focus-toggle').addEventListener('click', () => toggleFocus(activePane));

// Familiar browser shortcuts: Ctrl/Cmd+L, Ctrl/Cmd+1..3, and Ctrl/Cmd+R.
document.addEventListener('keydown', (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'l') {
    event.preventDefault();
    switchCore(activePane, true);
  } else if (key === 'r') {
    event.preventDefault();
    if (event.shiftKey) {
      document.querySelector('#reload-all').click();
    } else {
      runAction(activePane, 'reload');
    }
  } else if (/^[1-3]$/.test(key)) {
    event.preventDefault();
    switchCore(Number(key) - 1);
  }
});

window.addEventListener('resize', scheduleLayout, { passive: true });
if ('ResizeObserver' in window) {
  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(grid);
} else {
  window.addEventListener('resize', scheduleLayout, { passive: true });
}

if (browser) {
  browser.onState(updateState);
  browser.onActive((slot) => switchCore(Number(slot)));
  browser.onShortcut(handleDesktopShortcut);
  browser.getStates().then((initialStates) => initialStates.forEach(updateState));
  scheduleLayout();
} else {
  document.querySelectorAll('[data-state]').forEach((label) => { label.dataset.kind = 'ready'; });
}
