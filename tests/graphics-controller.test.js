import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRAPHICS_MODES,
  GRAPHICS_STATES,
  chooseAutomaticMode,
  detectGraphicsCapabilities,
  resolveGraphicsMode,
} from '../src/graphics-controller.js';

const verifiedWasm = { detected: true, compatible: true, initialized: true };

function makeReport(overrides = {}) {
  return detectGraphicsCapabilities({
    gpuDevices: [],
    wasm: verifiedWasm,
    integration: {
      dlss: { implemented: false },
      fsr: { implemented: false },
    },
    ...overrides,
  });
}

test('exposes distinct WASM, DLSS, FSR, hybrid-policy, and standard choices', () => {
  assert.deepEqual(GRAPHICS_MODES.map(({ id }) => id), ['wasm', 'dlss', 'fsr', 'hybrid', 'standard']);
});

test('defines every required lifecycle state explicitly', () => {
  assert.deepEqual(GRAPHICS_STATES, [
    'NOT DETECTED', 'DETECTED', 'COMPATIBLE', 'INITIALIZED', 'ACTIVE', 'PROCESSING FRAMES', 'FAILED', 'UNSUPPORTED',
  ]);
});

test('detects GPU vendor/model/driver without treating identity as feature support', () => {
  const report = makeReport({
    gpuDevices: [{ vendorId: '0x10de', vendor: 'NVIDIA', name: 'GeForce RTX example', driverVersion: 'test-driver', active: true }],
  });
  assert.equal(report.gpu.nvidiaDetected, true);
  assert.equal(report.gpu.primaryDevice.driverVersion, 'test-driver');
  assert.equal(report.technologies.dlss.detected, true);
  assert.equal(report.technologies.dlss.hardwareCompatibility, 'NOT TESTED');
  assert.equal(report.technologies.dlss.state, 'UNSUPPORTED');
  assert.equal(report.technologies.dlss.initialized, false);
  assert.equal(report.technologies.dlss.active, false);
  assert.equal(report.technologies.dlss.processedFrames, 0);
});

test('default automatic choice is the verified WASM runtime, never an upscaler by GPU label', () => {
  const report = makeReport({
    gpuDevices: [{ vendorId: 4318, vendor: 'NVIDIA', name: 'GeForce RTX example', active: true }],
  });
  assert.equal(report.gpu.nvidiaDetected, true);
  assert.equal(chooseAutomaticMode(report), 'wasm');
  const state = resolveGraphicsMode('wasm', { capabilities: report });
  assert.equal(state.status, 'initialized');
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.upscalerActive, false);
  assert.equal(state.processingFrames, false);
  assert.match(state.message, /not an image upscaler/);
});

test('automatic selection honors priority only for initialized compatible native backends', () => {
  const report = makeReport({
    gpuDevices: [
      { vendorId: '0x10de', vendor: 'NVIDIA', name: 'NVIDIA test GPU', active: true },
      { vendorId: '0x1002', vendor: 'AMD', name: 'AMD test GPU', active: false },
    ],
    integration: {
      dlss: { implemented: true, compatible: true, initialized: false },
      fsr: { implemented: true, compatible: true, initialized: true, backend: 'native test fixture' },
    },
  });
  assert.equal(chooseAutomaticMode(report, 'dlss-first'), 'fsr');
  assert.equal(chooseAutomaticMode(report, 'fsr-first'), 'fsr');
  assert.equal(report.technologies.dlss.state, 'COMPATIBLE');
  assert.equal(report.technologies.fsr.state, 'INITIALIZED');
});

test('failed or unimplemented FSR request falls back without claiming frames or scaling', () => {
  const report = makeReport({
    gpuDevices: [{ vendorId: '0x1002', vendor: 'AMD', name: 'Radeon test device', active: true }],
  });
  const state = resolveGraphicsMode('fsr', { capabilities: report });
  assert.equal(state.state, 'UNSUPPORTED');
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.upscalerActive, false);
  assert.equal(state.processingFrames, false);
  assert.equal(state.processedFrames, 0);
  assert.match(state.message, /not integrated/);
  assert.match(state.message, /WASM remains an independent runtime/);
});

test('runtime error is FAILED and takes precedence over initialized/active flags', () => {
  const report = makeReport({
    gpuDevices: [{ vendorId: '0x1002', vendor: 'AMD', name: 'Radeon test device', active: true }],
    integration: {
      fsr: { implemented: true, compatible: true, initialized: true, active: true, failed: true, error: 'device removed' },
    },
  });
  assert.equal(report.technologies.fsr.state, 'FAILED');
  assert.equal(report.technologies.fsr.active, false);
  assert.equal(chooseAutomaticMode(report), 'wasm');
});

test('ACTIVE and PROCESSING FRAMES require initialized compatible runtime evidence', () => {
  const initialized = makeReport({
    gpuDevices: [{ vendorId: '0x1002', vendor: 'AMD', name: 'Radeon test device' }],
    integration: { fsr: { implemented: true, compatible: true, initialized: true } },
  });
  assert.equal(initialized.technologies.fsr.state, 'INITIALIZED');
  assert.equal(initialized.technologies.fsr.active, false);

  const processing = makeReport({
    gpuDevices: [{ vendorId: '0x1002', vendor: 'AMD', name: 'Radeon test device' }],
    integration: { fsr: { implemented: true, compatible: true, initialized: true, active: true, processingFrames: true, processedFrames: 7 } },
  });
  assert.equal(processing.technologies.fsr.state, 'PROCESSING FRAMES');
  assert.equal(processing.technologies.fsr.active, true);
  assert.equal(processing.technologies.fsr.processingFrames, true);
  assert.equal(processing.technologies.fsr.processedFrames, 7);
});

test('a completed one-shot frame counter is historical evidence, not an active stream or auto-eligible mode', () => {
  const report = makeReport({
    integration: { fsr: { implemented: true, detected: true, compatible: true, initialized: false, processedFrames: 3, automaticEligible: false } },
  });
  const feature = report.technologies.fsr;
  assert.equal(feature.state, 'COMPATIBLE');
  assert.equal(feature.processedFrames, 3);
  assert.equal(feature.active, false);
  assert.equal(feature.processingFrames, false);
  assert.equal(chooseAutomaticMode(report), 'wasm');
  const state = resolveGraphicsMode('fsr', { capabilities: report });
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.upscalerActive, false);
  assert.equal(state.processingFrames, false);
});

test('standard mode means Chromium page rendering and no upscaler', () => {
  const state = resolveGraphicsMode('standard');
  assert.equal(state.status, 'active');
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.upscalerActive, false);
  assert.equal(state.processedFrames, 0);
  assert.match(state.backend, /Chromium renderer/);
});

test('hybrid policy never reports WASM or a vendor label as image upscaling', () => {
  const state = resolveGraphicsMode('hybrid', {
    capabilities: makeReport({ gpuDevices: [{ vendorId: '0x10de', vendor: 'NVIDIA', name: 'Test GPU' }] }),
    wasmResult: { passed: true },
  });
  assert.equal(state.status, 'partial');
  assert.equal(state.effectiveMode, 'standard');
  assert.equal(state.upscalerActive, false);
  assert.equal(state.processingFrames, false);
  assert.match(state.message, /WASM is not an image upscaler/);
});
