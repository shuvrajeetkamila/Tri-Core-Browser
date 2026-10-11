import { GRAPHICS_MODES } from './graphics-controller.js';

export const GRAPHICS_PREFERENCES_STORAGE_KEY = 'tri-core.graphics-preferences.v1';
const VALID_MODES = new Set(GRAPHICS_MODES.map(({ id }) => id));

function validAdapterIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index <= 1024 ? index : null;
}

function defaults() {
  return { selection: 'auto', mode: 'wasm', panelCollapsed: true, fsrAdapterIndex: null };
}

/** Load and normalize user graphics/panel preferences without requiring storage. */
export function loadGraphicsPreferences(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const saved = JSON.parse(target.getItem(GRAPHICS_PREFERENCES_STORAGE_KEY) || '{}');
    return {
      selection: saved.selection === 'manual' ? 'manual' : 'auto',
      mode: VALID_MODES.has(saved.mode) ? saved.mode : 'wasm',
      panelCollapsed: typeof saved.panelCollapsed === 'boolean' ? saved.panelCollapsed : true,
      fsrAdapterIndex: validAdapterIndex(saved.fsrAdapterIndex),
    };
  } catch {
    return defaults();
  }
}

/** Save preferences best-effort; private browsing/storage denial is non-fatal. */
export function saveGraphicsPreferences(preferences, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const safeMode = VALID_MODES.has(preferences?.mode) ? preferences.mode : 'wasm';
    target.setItem(GRAPHICS_PREFERENCES_STORAGE_KEY, JSON.stringify({
      selection: preferences?.selection === 'manual' ? 'manual' : 'auto',
      mode: safeMode,
      panelCollapsed: typeof preferences?.panelCollapsed === 'boolean' ? preferences.panelCollapsed : true,
      fsrAdapterIndex: validAdapterIndex(preferences?.fsrAdapterIndex),
    }));
    return true;
  } catch {
    return false;
  }
}
