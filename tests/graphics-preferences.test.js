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
    mode: 'wasm',
    panelCollapsed: true,
    fsrAdapterIndex: null,
  });
  assert.deepEqual(loadGraphicsPreferences({}), {
    selection: 'auto',
    mode: 'wasm',
    panelCollapsed: true,
    fsrAdapterIndex: null,
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
    mode: 'fsr',
    panelCollapsed: false,
    fsrAdapterIndex: null,
  });

  storage.setItem(GRAPHICS_PREFERENCES_STORAGE_KEY, JSON.stringify({
    selection: 'unexpected',
    priority: 'unexpected',
    mode: 'unknown-mode',
    panelCollapsed: 'false',
  }));
  assert.deepEqual(loadGraphicsPreferences(storage), {
    selection: 'auto',
    mode: 'wasm',
    panelCollapsed: true,
    fsrAdapterIndex: null,
  });
});

test('persists valid policy and collapsed state for the next renderer startup', () => {
  const storage = createStorage();
  assert.equal(saveGraphicsPreferences({
    selection: 'manual',
    priority: 'fsr-first',
    mode: 'standard',
    panelCollapsed: false,
    fsrAdapterIndex: 2,
  }, storage), true);
  assert.deepEqual(loadGraphicsPreferences(storage), {
    selection: 'manual',
    mode: 'standard',
    panelCollapsed: false,
    fsrAdapterIndex: 2,
  });
});

test('denied, malformed, or unavailable storage is non-fatal', () => {
  const malformed = createStorage('{broken JSON');
  assert.deepEqual(loadGraphicsPreferences(malformed), {
    selection: 'auto',
    mode: 'wasm',
    panelCollapsed: true,
    fsrAdapterIndex: null,
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
    mode: 'wasm',
    panelCollapsed: false,
    fsrAdapterIndex: null,
  });
});
