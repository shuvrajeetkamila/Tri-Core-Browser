import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeGpuTestPolicy,
  isKnownAnswerPass,
  isNoAdapterReport,
  isFsrPass,
  isFsrUnsupported,
  hasPhysicalGpuEvidence,
  classifyWebGpuSmoke,
} = require('../electron/webgpu-smoke-policy.cjs');

function passingComputeProbe() {
  return {
    status: 'PASS',
    state: 'output-verified',
    secureContext: true,
    apiDetected: true,
    deviceRequested: true,
    shaderCompilationStatus: 'passed',
    pipelineCreationStatus: 'passed',
    resourceInitializationStatus: 'passed',
    dispatches: 1,
    queueCompleted: true,
    expectedResult: 42,
    readbackResult: 42,
    readbackVerified: true,
    adapterInfo: {
      vendor: 'Example GPU Vendor',
      architecture: 'test',
      device: 'Example GPU',
      description: 'physical adapter',
      exposed: true,
      softwareAdapter: false,
    },
    graphicsEnvironment: {
      chromiumGpuDevices: [{ active: true, vendor: 'Example GPU Vendor', name: 'Example GPU', driverVersion: '1.2.3' }],
    },
    physicalGpuValidation: 'NOT RUN',
    launchDiagnostics: { gpuRelatedSwitches: {} },
  };
}

function passingFsrReport() {
  return {
    status: 'PASS',
    api: 'WebGPU',
    readbackForProcessing: false,
    physicalGpuValidation: 'NOT RUN',
    processedFrames: 3,
    input: { width: 64, height: 48 },
    output: { width: 128, height: 96 },
    lifecycle: {
      adapterDetected: true,
      shaderCompilationStatus: 'passed',
      pipelineCreationStatus: 'passed',
      resourceInitializationStatus: 'passed',
      easuComputePipelineInitialized: true,
      rcasComputePipelineInitialized: true,
      presentationPipelineInitialized: true,
      outputSubmittedToVisibleCanvas: true,
      visibleCanvasScreenshotCompared: true,
      visibleOutputVerified: true,
    },
    dispatch: { easuDispatches: 3, rcasDispatches: 3 },
    imageValidation: {
      status: 'PASS',
      readbackFeedsProcessing: false,
      motion: { changed: true },
      stageComparison: {
        status: 'PASS',
        checks: {
          dimensionsUpscaled: true,
          inputHasDetail: true,
          easuContributes: true,
          rcasContributes: true,
          outputHasDetail: true,
        },
      },
      visibleCanvas: { status: 'PASS' },
    },
    adapter: { vendor: 'Example GPU Vendor', architecture: 'test', device: 'Example GPU', description: 'physical adapter' },
    adapterInfoAvailable: true,
    softwareAdapter: false,
    graphicsEnvironment: {
      chromiumGpuDevices: [{ active: true, vendor: 'Example GPU Vendor', name: 'Example GPU', driverVersion: '1.2.3' }],
    },
  };
}

function unsupportedComputeProbe(overrides = {}) {
  return {
    status: 'UNSUPPORTED',
    state: 'unsupported',
    failureStage: 'adapter-discovery',
    secureContext: true,
    apiDetected: true,
    adapterRequestResults: [
      { path: 'high-performance', status: 'unavailable' },
      { path: 'low-power', status: 'unavailable' },
      { path: 'default', status: 'unavailable' },
      { path: 'force-fallback', status: 'unavailable' },
    ],
    deviceRequested: false,
    shaderCompilationStatus: 'NOT RUN',
    pipelineCreationStatus: 'NOT RUN',
    resourceInitializationStatus: 'NOT RUN',
    dispatches: 0,
    queueCompleted: false,
    expectedResult: 42,
    readbackResult: null,
    readbackVerified: false,
    physicalGpuValidation: 'NOT RUN',
    launchDiagnostics: { gpuRelatedSwitches: {} },
    ...overrides,
  };
}

function unsupportedFsrReport(overrides = {}) {
  return {
    status: 'SKIPPED',
    capabilityStatus: 'UNSUPPORTED',
    failureStage: 'adapter-discovery',
    apiDetected: true,
    adapterRequestResults: [
      { path: 'high-performance', status: 'unavailable' },
      { path: 'low-power', status: 'unavailable' },
      { path: 'default', status: 'unavailable' },
      { path: 'force-fallback', status: 'unavailable' },
    ],
    physicalGpuValidation: 'NOT RUN',
    processedFrames: 0,
    dispatch: { easuDispatches: 0, rcasDispatches: 0 },
    lifecycle: {
      state: 'unsupported',
      adapterDetected: false,
      shaderCompilationStatus: 'NOT RUN',
      pipelineCreationStatus: 'NOT RUN',
      resourceInitializationStatus: 'NOT RUN',
      easuComputePipelineInitialized: false,
      rcasComputePipelineInitialized: false,
      presentationPipelineInitialized: false,
      outputSubmittedToVisibleCanvas: false,
      visibleCanvasScreenshotCompared: false,
      visibleOutputVerified: false,
      framesCompleted: 0,
    },
    ...overrides,
  };
}

test('GPU test policy accepts only explicit off, optional, and required modes', () => {
  assert.equal(normalizeGpuTestPolicy('optional'), 'optional');
  assert.equal(normalizeGpuTestPolicy(' REQUIRED '), 'required');
  assert.equal(normalizeGpuTestPolicy('off'), 'off');
  assert.equal(normalizeGpuTestPolicy('true'), 'off');
  assert.equal(normalizeGpuTestPolicy(undefined), 'off');
});

test('known-answer PASS requires an actual safe dispatch and readback of 42', () => {
  const report = passingComputeProbe();
  assert.equal(isKnownAnswerPass(report), true);
  for (const mutate of [
    (value) => { value.readbackResult = 41; },
    (value) => { value.dispatches = 0; },
    (value) => { value.queueCompleted = false; },
    (value) => { value.shaderCompilationStatus = 'failed'; },
    (value) => { value.launchDiagnostics.gpuRelatedSwitches['enable-unsafe-webgpu'] = '(present)'; },
  ]) {
    const invalid = structuredClone(report);
    mutate(invalid);
    assert.equal(isKnownAnswerPass(invalid), false);
  }
});

test('no-adapter unsupported is distinct from device/runtime failures', () => {
  assert.equal(isNoAdapterReport(unsupportedComputeProbe()), true);
  assert.equal(isNoAdapterReport(unsupportedComputeProbe({ state: 'failed', status: 'FAIL' })), false);
  assert.equal(isNoAdapterReport(unsupportedComputeProbe({ deviceRequested: true })), false);
  assert.equal(isNoAdapterReport(unsupportedComputeProbe({ failureStage: 'device-request' })), false);
  assert.equal(isNoAdapterReport(unsupportedComputeProbe({ adapterRequestResults: [{ path: 'default', status: 'selected' }] })), false);
  assert.equal(isNoAdapterReport(unsupportedComputeProbe({ adapterRequestResults: [{ path: 'default', status: 'rejected' }] })), false);
  assert.equal(isNoAdapterReport(unsupportedComputeProbe({
    failureStage: 'webgpu-api-detection', apiDetected: false, adapterRequestResults: [],
  })), true);
  assert.equal(isNoAdapterReport(unsupportedComputeProbe({
    launchDiagnostics: { gpuRelatedSwitches: { 'enable-unsafe-webgpu': '(present)' } },
  })), false);
});

test('optional policy marks only a verified no-compatible-adapter condition SKIPPED', () => {
  const result = classifyWebGpuSmoke({
    policy: 'optional',
    computeProbe: unsupportedComputeProbe(),
    fsrReport: unsupportedFsrReport(),
  });
  assert.equal(result.status, 'SKIPPED');
  assert.equal(result.capabilityStatus, 'UNSUPPORTED');
  assert.equal(result.required, false);
  assert.equal(result.shouldFail, false);
  assert.equal(result.physicalGpuValidation, 'NOT RUN');
  assert.equal(result.reasonCode, 'NO_COMPATIBLE_ADAPTER');
});

test('required policy reports adapter absence as UNSUPPORTED and fails the job', () => {
  const result = classifyWebGpuSmoke({
    policy: 'required',
    computeProbe: unsupportedComputeProbe(),
    fsrReport: unsupportedFsrReport({ status: 'UNSUPPORTED' }),
  });
  assert.equal(result.status, 'UNSUPPORTED');
  assert.equal(result.shouldFail, true);
  assert.equal(result.required, true);
  assert.equal(result.physicalGpuValidation, 'NOT RUN');
});

test('selected adapter followed by a real compute failure never becomes a skip', () => {
  const failedCompute = {
    ...passingComputeProbe(),
    status: 'FAIL',
    state: 'failed',
    failureStage: 'device-request',
    deviceRequested: false,
    readbackVerified: false,
  };
  const result = classifyWebGpuSmoke({ policy: 'optional', computeProbe: failedCompute, fsrReport: unsupportedFsrReport() });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.shouldFail, true);
  assert.equal(result.reasonCode, 'COMPUTE_DID_NOT_PASS');
});

test('adapter request rejections, missing reports, and missing FSR execution fail instead of skipping', () => {
  const allRejected = unsupportedComputeProbe({
    state: 'adapter-failed',
    status: 'FAIL',
    adapterRequestResults: [{ path: 'default', status: 'rejected', error: 'driver failure' }],
  });
  const rejectedResult = classifyWebGpuSmoke({ policy: 'optional', computeProbe: allRejected, fsrReport: unsupportedFsrReport() });
  assert.equal(rejectedResult.status, 'FAIL');
  assert.equal(rejectedResult.shouldFail, true);

  const missingCompute = classifyWebGpuSmoke({ policy: 'optional', fsrReport: unsupportedFsrReport() });
  assert.equal(missingCompute.status, 'FAIL');
  assert.equal(missingCompute.reasonCode, 'COMPUTE_REPORT_MISSING');

  const missingFsr = classifyWebGpuSmoke({ policy: 'optional', computeProbe: passingComputeProbe() });
  assert.equal(missingFsr.status, 'FAIL');
  assert.equal(missingFsr.reasonCode, 'FSR_REPORT_MISSING');
});

test('FSR PASS requires dispatch, motion, stage comparisons, and visible-canvas evidence', () => {
  const report = passingFsrReport();
  assert.equal(isFsrPass(report), true);
  const invalid = structuredClone(report);
  invalid.lifecycle.visibleOutputVerified = false;
  assert.equal(isFsrPass(invalid), false);
  const noMotion = structuredClone(report);
  noMotion.imageValidation.motion.changed = false;
  assert.equal(isFsrPass(noMotion), false);
});

test('optional software-backed FSR evidence may pass as runtime evidence but is not physical-GPU validation', () => {
  const report = passingFsrReport();
  report.softwareAdapter = true;
  report.adapter = { vendor: 'Software', architecture: '', device: 'WARP', description: 'Microsoft WARP' };
  report.graphicsEnvironment.chromiumGpuDevices = [{ active: true, vendor: 'Microsoft', name: 'WARP', driverVersion: 'test' }];
  const result = classifyWebGpuSmoke({ policy: 'optional', computeProbe: passingComputeProbe(), fsrReport: report });
  assert.equal(result.status, 'PASS');
  assert.equal(result.physicalGpuValidation, 'NOT RUN');
  assert.equal(hasPhysicalGpuEvidence(report), false);
});

test('required mode accepts physical GPU evidence only with non-software adapter identity and active driver', () => {
  const fsr = passingFsrReport();
  assert.equal(hasPhysicalGpuEvidence(fsr), true);
  const result = classifyWebGpuSmoke({ policy: 'required', computeProbe: passingComputeProbe(), fsrReport: fsr });
  assert.equal(result.status, 'PASS');
  assert.equal(result.physicalGpuValidation, 'PASS');
  assert.equal(result.shouldFail, false);

  const software = structuredClone(fsr);
  software.softwareAdapter = true;
  assert.equal(hasPhysicalGpuEvidence(software), false);
  const softwareResult = classifyWebGpuSmoke({ policy: 'required', computeProbe: passingComputeProbe(), fsrReport: software });
  assert.equal(softwareResult.status, 'UNSUPPORTED');
  assert.equal(softwareResult.reasonCode, 'PHYSICAL_GPU_NOT_VERIFIED');
  assert.equal(softwareResult.shouldFail, true);

  const noDriver = structuredClone(fsr);
  noDriver.graphicsEnvironment.chromiumGpuDevices[0].driverVersion = '';
  assert.equal(hasPhysicalGpuEvidence(noDriver), false);
  const unknownDriver = structuredClone(fsr);
  unknownDriver.graphicsEnvironment.chromiumGpuDevices[0].driverVersion = 'Unknown';
  assert.equal(hasPhysicalGpuEvidence(unknownDriver), false);
  const unknownIdentity = structuredClone(fsr);
  unknownIdentity.adapter = { vendor: 'Unknown vendor', architecture: 'Unknown architecture', device: 'Unknown device', description: '' };
  assert.equal(hasPhysicalGpuEvidence(unknownIdentity), false);

  const softwareCompute = passingComputeProbe();
  softwareCompute.adapterInfo.softwareAdapter = true;
  const computeResult = classifyWebGpuSmoke({ policy: 'required', computeProbe: softwareCompute, fsrReport: fsr });
  assert.equal(computeResult.status, 'UNSUPPORTED');
  assert.equal(computeResult.reasonCode, 'PHYSICAL_GPU_NOT_VERIFIED');
});

test('any FSR runtime, pipeline, or output failure fails optional and required policies', () => {
  const failedFsr = { ...passingFsrReport(), status: 'FAIL', imageValidation: { status: 'FAIL' } };
  for (const policy of ['optional', 'required']) {
    const result = classifyWebGpuSmoke({ policy, computeProbe: passingComputeProbe(), fsrReport: failedFsr });
    assert.equal(result.status, 'FAIL');
    assert.equal(result.shouldFail, true);
    assert.equal(result.reasonCode, 'FSR_ACCEPTANCE_FAILED');
  }
});

test('off policy is explicitly NOT RUN and never claims a GPU pass', () => {
  const result = classifyWebGpuSmoke({ policy: 'off', computeProbe: passingComputeProbe(), fsrReport: passingFsrReport() });
  assert.equal(result.status, 'NOT RUN');
  assert.equal(result.required, false);
  assert.equal(result.shouldFail, false);
  assert.equal(result.physicalGpuValidation, 'NOT RUN');
});
