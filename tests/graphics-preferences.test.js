import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRAPHICS_PREFERENCES_STORAGE_KEY,
  loadGraphicsPreferences,
  saveGraphicsPreferences,
} from '../src/graphics-preferences.js';

function createStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, GRAPHICS_PREFERENCES_STORAGE_KEY);
      return value;
    },
    setItem(key, nextValue) {
      assert.equal(key, GRAPHICS_PREFERENCES_STORAGE_KEY);
      value = nextValue;
    },
  };
}

test('graphics and performance-panel preferences have safe defaults without storage', () => {
  assert.deepEqual(loadGraphicsPreferences({ getItem: () => null }), {
    selection: 'auto',
    priority: 'dlss-first',
    mode: 'wasm',
    panelCollapsed: true,
  });
  assert.deepEqual(loadGraphicsPreferences({}), {
    selection: 'auto',
    priority: 'dlss-first',
    mode: 'wasm',
    panelCollapsed: true,
  });
});

test('normalizes invalid saved fields while retaining valid persistent choices', () => {
  const storage = createStorage(JSON.stringify({
    selection: 'manual',
    priority: 'fsr-first',
    mode: 'fsr',
    panelCollapsed: false,
  }));
  assert.deepEqual(loadGraphicsPreferences(storage), {
    selection: 'manual',
    priority: 'fsr-first',
    mode: 'fsr',
    panelCollapsed: false,
  });

  storage.setItem(GRAPHICS_PREFERENCES_STORAGE_KEY, JSON.stringify({
    selection: 'unexpected',
    priority: 'unexpected',
    mode: 'unknown-mode',
    panelCollapsed: 'false',
  }));
  assert.deepEqual(loadGraphicsPreferences(storage), {
    selection: 'auto',
    priority: 'dlss-first',
    mode: 'wasm',
    panelCollapsed: true,
  });
});

test('persists valid policy and collapsed state for the next renderer startup', () => {
  const storage = createStorage();
  assert.equal(saveGraphicsPreferences({
    selection: 'manual',
    priority: 'fsr-first',
    mode: 'standard',
    panelCollapsed: false,
  }, storage), true);
  assert.deepEqual(loadGraphicsPreferences(storage), {
    selection: 'manual',
    priority: 'fsr-first',
    mode: 'standard',
    panelCollapsed: false,
  });
});

test('denied, malformed, or unavailable storage is non-fatal', () => {
  const malformed = createStorage('{broken JSON');
  assert.deepEqual(loadGraphicsPreferences(malformed), {
    selection: 'auto',
    priority: 'dlss-first',
    mode: 'wasm',
    panelCollapsed: true,
  });

  const denied = {
    getItem() { throw new Error('storage denied'); },
    setItem() { throw new Error('storage denied'); },
  };
  assert.equal(loadGraphicsPreferences(denied).panelCollapsed, true);
  assert.equal(saveGraphicsPreferences({ panelCollapsed: false }, denied), false);
});

test('saves normalized values instead of persisting unsupported mode names', () => {
  const storage = createStorage();
  saveGraphicsPreferences({ mode: 'injected-mode', panelCollapsed: false }, storage);
  assert.deepEqual(loadGraphicsPreferences(storage), {
    selection: 'auto',
    priority: 'dlss-first',
    mode: 'wasm',
    panelCollapsed: false,
  });
});
