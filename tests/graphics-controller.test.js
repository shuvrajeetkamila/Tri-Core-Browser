import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS_MODES, resolveGraphicsMode } from '../src/graphics-controller.js';

const passedWasm = { passed: true, iterations: 10_000, elapsedMs: 4.25 };

test('exposes exactly the five requested, distinct modes', () => {
  assert.deepEqual(GRAPHICS_MODES.map(({ id }) => id), ['wasm', 'dlss', 'fsr', 'hybrid', 'standard']);
});

test('standard selects the actual Chromium renderer without claiming an upscaler', () => {
  const state = resolveGraphicsMode('standard');
  assert.equal(state.status, 'active');
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.upscaler, null);
  assert.match(state.backend, /Chromium/);
});

test('WASM mode is active only after its controlled runtime test passes', () => {
  assert.equal(resolveGraphicsMode('wasm').status, 'blocked');
  const state = resolveGraphicsMode('wasm', { wasmResult: passedWasm });
  assert.equal(state.status, 'active');
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.upscaler, null);
  assert.match(state.message, /does not promise a frame-rate increase/);
});

test('an NVIDIA GPU does not make an unimplemented DLSS integration operational', () => {
  const state = resolveGraphicsMode('dlss', { gpu: { name: 'NVIDIA GeForce RTX test device' } });
  assert.equal(state.status, 'blocked');
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.upscaler, null);
  assert.match(state.message, /not integrated/);
  assert.match(state.message, /not evidence that DLSS is running/);
});

test('FSR remains blocked and safely falls back instead of simulating activation', () => {
  const state = resolveGraphicsMode('fsr', { gpu: { name: 'AMD Radeon test device' } });
  assert.equal(state.status, 'blocked');
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.upscaler, null);
  assert.match(state.message, /not integrated/);
  assert.match(state.message, /native webpage render bridge/);
});

test('hybrid reports a partial diagnostic and never stacks unavailable upscalers', () => {
  const state = resolveGraphicsMode('hybrid', { wasmResult: passedWasm, gpu: { name: 'Test GPU' } });
  assert.equal(state.status, 'partial');
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.wasmDiagnosticPassed, true);
  assert.equal(state.upscaler, null);
  assert.match(state.message, /no upscaler is active/);
});
