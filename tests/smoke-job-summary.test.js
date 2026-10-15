import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildSmokeJobSummary,
  renderSmokeJobSummary,
  readReportsFromDirectory,
  main,
} = require('../scripts/write-smoke-job-summary.cjs');
const {
  classifyWebGpuSmoke,
} = require('../electron/webgpu-smoke-policy.cjs');

function passingCompute() {
  return {
    status: 'PASS',
    state: 'output-verified',
    secureContext: true,
    apiDetected: true,
    adapterRequestPath: 'high-performance',
    adapterRequestResults: [{ path: 'high-performance', status: 'selected' }],
    adapterInfo: {
      vendor: 'Test GPU Vendor', architecture: 'test', device: 'Test Adapter',
      description: 'Test WebGPU adapter', exposed: true, softwareAdapter: false,
    },
    deviceRequested: true,
    shaderCompilationStatus: 'passed',
    pipelineCreationStatus: 'passed',
    resourceInitializationStatus: 'passed',
    dispatches: 1,
    queueCompleted: true,
    expectedResult: 42,
    readbackResult: 42,
    readbackVerified: true,
    physicalGpuValidation: 'NOT RUN',
    launchDiagnostics: { gpuRelatedSwitches: {} },
    graphicsEnvironment: {
      chromiumGpuDevices: [{ active: true, vendor: 'Test GPU Vendor', name: 'Test GPU', driverVersion: '1.2.3' }],
    },
    runtime: { electron: '44.7.0', chromium: '152.0.0.0' },
  };
}

function passingFsr() {
  return {
    status: 'PASS',
    api: 'WebGPU',
    apiDetected: true,
    readbackForProcessing: false,
    physicalGpuValidation: 'NOT RUN',
    processedFrames: 3,
    framesSubmitted: 3,
    input: { width: 64, height: 48 },
    output: { width: 128, height: 96 },
    adapterRequestPath: 'high-performance',
    adapterRequestResults: [{ path: 'high-performance', status: 'selected' }],
    adapter: { vendor: 'Test GPU Vendor', architecture: 'test', device: 'Test Adapter', description: 'Test WebGPU adapter' },
    adapterInfoAvailable: true,
    softwareAdapter: false,
    lifecycle: {
      state: 'presented', adapterDetected: true, deviceInitialized: true,
      shaderCompilationStatus: 'passed', pipelineCreationStatus: 'passed', resourceInitializationStatus: 'passed',
      easuComputePipelineInitialized: true, rcasComputePipelineInitialized: true,
      presentationPipelineInitialized: true, outputSubmittedToVisibleCanvas: true,
      visibleCanvasScreenshotCompared: true, visibleOutputVerified: true,
    },
    stageResults: {
      apiDetection: { status: 'PASS' },
      adapterDiscovery: { status: 'PASS' },
      deviceInitialization: { status: 'PASS' },
      easuShaderCompilation: { status: 'PASS' },
      rcasShaderCompilation: { status: 'PASS' },
      easuPipelineCreation: { status: 'PASS' },
      rcasPipelineCreation: { status: 'PASS' },
      easuDispatch: { status: 'PASS', acceptanceStatus: 'PASS', completedDispatches: 3, minimumRequiredDispatches: 3 },
      rcasDispatch: { status: 'PASS', acceptanceStatus: 'PASS', completedDispatches: 3, minimumRequiredDispatches: 3 },
      outputGeneration: { status: 'PASS', framesSubmitted: 3, framesCompleted: 3, input: { width: 64, height: 48 }, output: { width: 128, height: 96 } },
      outputValidation: { status: 'PASS' },
    },
    dispatch: { easuDispatches: 3, rcasDispatches: 3 },
    imageValidation: {
      status: 'PASS', readbackFeedsProcessing: false, motion: { changed: true },
      stageComparison: {
        status: 'PASS',
        checks: { dimensionsUpscaled: true, inputHasDetail: true, easuContributes: true, rcasContributes: true, outputHasDetail: true },
        numerical: {
          easuVsBilinearMeanAbsoluteErrorNormalized: 0.02,
          rcasVsEasuMeanAbsoluteErrorNormalized: 0.01,
          easuChangedPixelFraction: 0.7,
          rcasChangedPixelFraction: 0.5,
          rcasMeanNeighborDifferenceNormalized: 0.03,
        },
      },
      visibleCanvas: { status: 'PASS', meanAbsoluteErrorNormalized: 0.02, luminanceCorrelation: 0.96, sampleCount: 16 },
      captures: {
        lowResolutionInput: { path: '/runner/temp/input.png', width: 64, height: 48, sha256: 'a'.repeat(64) },
        easuIntermediate: { path: '/runner/temp/easu.png', width: 128, height: 96, sha256: 'b'.repeat(64) },
        rcasOutput: { path: '/runner/temp/rcas.png', width: 128, height: 96, sha256: 'c'.repeat(64) },
      },
    },
    visibleOutputCapture: { path: '/runner/temp/visible.png', width: 500, height: 400, sha256: 'd'.repeat(64), purpose: 'Evidence only; never used as FSR input.' },
    graphicsEnvironment: {
      chromiumGpuDevices: [{ active: true, vendor: 'Test GPU Vendor', name: 'Test GPU', vendorId: '0x1234', deviceId: '0x5678', driverVersion: '1.2.3' }],
    },
    lastQueueCompletionWallMs: 4,
    averageQueueCompletionWallMs: 5,
    maxQueueCompletionWallMs: 6,
    gpuTimestamps: { samples: 3, lastEasuGpuTimeMs: 1, lastRcasGpuTimeMs: 2 },
    runtime: { electron: '44.7.0', chromium: '152.0.0.0' },
  };
}

function packagedReport(compute, fsr, policy = 'optional') {
  const webGpuAcceptance = classifyWebGpuSmoke({ policy, computeProbe: compute, fsrReport: fsr });
  return {
    schemaVersion: 1,
    appVersion: '1.0.0',
    status: 'PASS',
    gpuTestPolicy: policy,
    checks: {
      packagedAppStartup: 'PASS',
      browserShellAndControls: 'PASS',
      immersiveFullscreenEnterExit: 'PASS',
      localHttpJavascriptWebAssembly: 'PASS',
      browserTabLifecycle: 'PASS',
      httpsNavigation: 'PASS',
      pngCaptureDiagnostic: 'PASS',
      independentWebGpuCompute: compute.status,
      bundledWebGpuFsr1: webGpuAcceptance.status,
    },
    webGpuAcceptance,
    physicalGpuValidation: webGpuAcceptance.physicalGpuValidation,
    releaseEligible: policy === 'required' && webGpuAcceptance.status === 'PASS',
    runtime: { electron: '44.7.0', chromium: '152.0.0.0' },
  };
}

function unavailableCompute() {
  return {
    status: 'UNSUPPORTED', state: 'unsupported', failureStage: 'adapter-discovery',
    secureContext: true, apiDetected: true,
    adapterRequestResults: ['high-performance', 'low-power', 'default', 'force-fallback'].map((path) => ({ path, status: 'unavailable' })),
    deviceRequested: false, shaderCompilationStatus: 'NOT RUN', pipelineCreationStatus: 'NOT RUN',
    resourceInitializationStatus: 'NOT RUN', dispatches: 0, queueCompleted: false,
    expectedResult: 42, readbackResult: null, readbackVerified: false,
    physicalGpuValidation: 'NOT RUN', launchDiagnostics: { gpuRelatedSwitches: {} },
  };
}

function unavailableFsr(status = 'SKIPPED') {
  return {
    status, capabilityStatus: 'UNSUPPORTED', failureStage: 'adapter-discovery', apiDetected: true,
    adapterRequestResults: ['high-performance', 'low-power', 'default', 'force-fallback'].map((path) => ({ path, status: 'unavailable' })),
    physicalGpuValidation: 'NOT RUN', processedFrames: 0,
    dispatch: { easuDispatches: 0, rcasDispatches: 0 },
    lifecycle: {
      state: 'unsupported', adapterDetected: false, deviceInitialized: false,
      shaderCompilationStatus: 'NOT RUN', pipelineCreationStatus: 'NOT RUN', resourceInitializationStatus: 'NOT RUN',
      easuComputePipelineInitialized: false, rcasComputePipelineInitialized: false,
      presentationPipelineInitialized: false, outputSubmittedToVisibleCanvas: false,
      visibleCanvasScreenshotCompared: false, visibleOutputVerified: false, framesCompleted: 0,
    },
    stageResults: {
      apiDetection: { status: 'PASS' }, adapterDiscovery: { status: 'UNSUPPORTED' },
      deviceInitialization: { status: 'NOT RUN' },
      easuShaderCompilation: { status: 'NOT RUN' }, rcasShaderCompilation: { status: 'NOT RUN' },
      easuPipelineCreation: { status: 'NOT RUN' }, rcasPipelineCreation: { status: 'NOT RUN' },
      easuDispatch: { status: 'NOT RUN', acceptanceStatus: 'NOT RUN', completedDispatches: 0, minimumRequiredDispatches: 3 },
      rcasDispatch: { status: 'NOT RUN', acceptanceStatus: 'NOT RUN', completedDispatches: 0, minimumRequiredDispatches: 3 },
      outputGeneration: { status: 'NOT RUN', framesSubmitted: 0, framesCompleted: 0 },
      outputValidation: { status: 'NOT RUN' },
    },
  };
}

function runSummary(reports, overrides = {}) {
  return buildSmokeJobSummary({
    context: {
      runId: '12345', attempt: '1', repository: 'owner/repo', branch: 'test-branch',
      commit: 'abcdef1234567890', workflow: 'Test workflow', event: 'push', job: 'Windows smoke',
      policy: 'optional', appVersion: '1.0.0', declaredElectronVersion: '44.7.0',
      ...overrides.context,
    },
    outcomes: {
      package: 'success', executableValidation: 'success', smoke: 'success',
      evidenceValidation: overrides.outcomes?.smoke === 'failure' ? 'NOT RUN' : 'PASS',
      candidateArtifact: 'success', diagnosticsArtifact: 'success', m18Artifact: 'skipped',
      distributionBuild: 'skipped', distributionArtifact: 'skipped', ...overrides.outcomes,
    },
    reports,
    reportErrors: overrides.reportErrors || {},
    logTail: overrides.logTail || [],
    artifactNames: { diagnostics: 'TriCoreBrowser-Packaged-Smoke-Diagnostics', ...overrides.artifactNames },
  });
}

test('the job summary records the post-smoke M18 artifact name and upload outcome', () => {
  const compute = unavailableCompute();
  const fsr = unavailableFsr();
  const packaged = packagedReport(compute, fsr);
  const artifactName = 'TriCoreBrowser-Windows-x64-M18-EXE-' + 'a'.repeat(64) + '-BYTES-109000000-ZIP-BYTES-112000000-SHA256-' + 'b'.repeat(64) + '-NODE-v22.22.3-NPM-10.9.8';
  const model = runSummary({ packaged, compute, fsr }, {
    outcomes: { m18Artifact: 'success' },
    artifactNames: { m18: artifactName },
  });
  const row = model.artifacts.find((artifact) => artifact.key === 'm18WindowsDelivery');
  assert.deepEqual(row, { key: 'm18WindowsDelivery', name: artifactName, outcome: 'UPLOADED' });
  const markdown = renderSmokeJobSummary(model);
  assert.ok(markdown.includes(artifactName));
  assert.ok(markdown.includes('`UPLOADED`'));
});

test('all strict assertions are required before an optional packaged WebGPU FSR pass is summarized as PASS', () => {
  const compute = passingCompute();
  const fsr = passingFsr();
  const packaged = packagedReport(compute, fsr);
  const model = runSummary({ packaged, compute, fsr, browserFrame: { status: 'PASS', softwareAdapter: true } });
  const markdown = renderSmokeJobSummary(model);
  assert.equal(model.packageStatus, 'PASS');
  assert.equal(model.gpuAcceptanceStatus, 'PASS');
  assert.equal(model.computeStatus, 'PASS');
  assert.equal(model.fsrStatus, 'PASS');
  assert.equal(model.easuShaderStatus, 'PASS');
  assert.equal(model.rcasShaderStatus, 'PASS');
  assert.equal(model.easuDispatch.acceptanceStatus, 'PASS');
  assert.equal(model.rcasDispatch.acceptanceStatus, 'PASS');
  assert.equal(model.outputValidationStatus, 'PASS');
  assert.equal(model.physicalGpu, 'NOT RUN', 'an optional runtime PASS is not a physical-GPU PASS');
  assert.match(markdown, /Run:\*\*\s+\[#12345\]/);
  assert.match(markdown, /abcdef1234567890/);
  assert.match(markdown, /64×48 → 128×96/);
  assert.match(markdown, /EASU vs bilinear MAE 0\.02/);
  assert.match(markdown, /c{64}/);
  assert.match(markdown, /D3D12 WARP PNG diagnostic \| \*\*PASS \(WARP software only\)\*\*/);
  assert.doesNotMatch(markdown, /physical GPU[^\n]*\*\*PASS\*\*/i);
});

test('JSON report files round-trip into the same statuses, adapter identity, dimensions, and hashes shown in the summary', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-core-summary-json-'));
  try {
    const compute = passingCompute();
    const fsr = passingFsr();
    const packaged = packagedReport(compute, fsr);
    const browserFrame = { status: 'PASS', softwareAdapter: true };
    for (const [name, report] of [
      ['packaged-smoke-summary.json', packaged],
      ['webgpu-compute-smoke-summary.json', compute],
      ['fsr1-webgpu-summary.json', fsr],
      ['browser-frame-smoke-summary.json', browserFrame],
    ]) fs.writeFileSync(path.join(tempRoot, name), `${JSON.stringify(report)}\n`);
    const loaded = readReportsFromDirectory(tempRoot);
    const model = runSummary(loaded.reports, { reportErrors: loaded.errors });
    const markdown = renderSmokeJobSummary(model);
    assert.equal(model.packageStatus, packaged.status);
    assert.equal(model.gpuAcceptanceStatus, packaged.webGpuAcceptance.status);
    assert.equal(model.computeStatus, compute.status);
    assert.equal(model.fsrStatus, fsr.status);
    assert.equal(model.adapter.driverVersion, '1.2.3');
    assert.deepEqual(model.dimensions.input, fsr.input);
    assert.deepEqual(model.dimensions.output, fsr.output);
    assert.equal(model.dimensions.hashes.find((capture) => capture.label === 'rcasOutput').sha256,
      fsr.imageValidation.captures.rcasOutput.sha256);
    assert.match(markdown, /Aggregate WebGPU acceptance \| \*\*PASS\*\*/);
    assert.match(markdown, /D3D12 WARP PNG diagnostic \| \*\*PASS \(WARP software only\)\*\*/);
    assert.match(markdown, /driver 1\.2\.3/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('missing adapter is SKIPPED or UNSUPPORTED, never a GPU PASS', () => {
  const compute = unavailableCompute();
  const fsr = unavailableFsr('SKIPPED');
  const packaged = packagedReport(compute, fsr);
  const model = runSummary({ packaged, compute, fsr });
  const markdown = renderSmokeJobSummary(model);
  assert.equal(model.packageStatus, 'PASS', 'GPU-independent packaged checks may pass');
  assert.equal(model.gpuAcceptanceStatus, 'SKIPPED');
  assert.equal(model.adapterDiscoveryStatus, 'UNSUPPORTED');
  assert.equal(model.deviceStatus, 'NOT RUN');
  assert.equal(model.easuShaderStatus, 'NOT RUN');
  assert.equal(model.rcasShaderStatus, 'NOT RUN');
  assert.equal(model.easuDispatch.status, 'NOT RUN');
  assert.equal(model.rcasDispatch.status, 'NOT RUN');
  assert.equal(model.outputGenerationStatus, 'NOT RUN');
  assert.equal(model.outputValidationStatus, 'NOT RUN');
  assert.equal(model.physicalGpu, 'NOT RUN');
  assert.match(markdown, /Optional GPU-specific status:|GPU runtime:/);
  assert.match(markdown, /no compatible WebGPU adapter|No compatible WebGPU adapter/i);
  assert.doesNotMatch(markdown, /EASU dispatch \| \*\*PASS\*\*/);
  assert.doesNotMatch(markdown, /Physical-GPU confirmation \| \*\*PASS\*\*/);
});

test('required adapter absence remains UNSUPPORTED and fails the required smoke', () => {
  const compute = unavailableCompute();
  const fsr = unavailableFsr('UNSUPPORTED');
  const packaged = packagedReport(compute, fsr, 'required');
  packaged.status = 'FAIL';
  const model = runSummary({ packaged, compute, fsr }, {
    context: { policy: 'required' }, outcomes: { smoke: 'failure' },
  });
  const markdown = renderSmokeJobSummary(model);
  assert.equal(model.packageStatus, 'FAIL');
  assert.equal(model.gpuAcceptanceStatus, 'UNSUPPORTED');
  assert.equal(model.computeStatus, 'UNSUPPORTED');
  assert.equal(model.fsrStatus, 'UNSUPPORTED');
  assert.equal(model.physicalGpu, 'NOT RUN');
  assert.match(markdown, /\*\*UNSUPPORTED\*\*/);
  assert.doesNotMatch(markdown, /EASU dispatch \| \*\*PASS\*\*/);
});

test('required shader or dispatch failure remains FAIL and preserves the underlying reason', () => {
  const compute = passingCompute();
  const fsr = passingFsr();
  fsr.status = 'FAIL';
  fsr.reason = 'RCAS WGSL validation error';
  fsr.failureStage = 'shader-compilation';
  fsr.stageResults.rcasShaderCompilation.status = 'FAIL';
  fsr.stageResults.rcasDispatch = { status: 'NOT RUN', acceptanceStatus: 'NOT RUN', completedDispatches: 0, minimumRequiredDispatches: 3 };
  const packaged = packagedReport(compute, fsr, 'required');
  packaged.status = 'FAIL';
  packaged.webGpuAcceptance = classifyWebGpuSmoke({ policy: 'required', computeProbe: compute, fsrReport: fsr });
  packaged.checks.bundledWebGpuFsr1 = packaged.webGpuAcceptance.status;
  packaged.physicalGpuValidation = 'NOT RUN';
  const failure = { status: 'FAIL', failure: { message: 'RCAS WGSL validation error' }, webGpuIntegration: { status: 'FAIL', stageResults: fsr.stageResults } };
  const model = runSummary({ packaged, compute, fsr, failure }, {
    context: { policy: 'required' }, outcomes: { smoke: 'failure', distributionBuild: 'skipped' },
  });
  const markdown = renderSmokeJobSummary(model);
  assert.equal(model.packageStatus, 'FAIL');
  assert.equal(model.gpuAcceptanceStatus, 'FAIL');
  assert.equal(model.rcasShaderStatus, 'FAIL');
  assert.equal(model.physicalGpu, 'NOT RUN');
  assert.match(markdown, /RCAS WGSL validation error/);
});

test('a smoke crash or missing report yields FAIL/NOT RUN with available log detail, never success', () => {
  const model = runSummary({}, {
    outcomes: { package: 'success', executableValidation: 'success', smoke: 'failure' },
    logTail: ['WebGPU scene failed at device-request: permission denied.'],
  });
  const markdown = renderSmokeJobSummary(model);
  assert.equal(model.packageStatus, 'FAIL');
  assert.equal(model.gpuAcceptanceStatus, 'NOT RUN');
  assert.equal(model.computeStatus, 'NOT RUN');
  assert.equal(model.fsrStatus, 'NOT RUN');
  assert.equal(model.physicalGpu, 'NOT RUN');
  assert.match(model.reason, /packaged smoke report was not produced/i);
  assert.match(markdown, /permission denied/);
  assert.doesNotMatch(markdown, /Overall packaged status:\*\* \*\*PASS\*\*/);
  assert.equal(model.exitCode, 0, 'summary generation succeeds while the original smoke step remains failed');
});

test('a successful smoke step with missing or inconsistent reports fails closed', () => {
  const missing = runSummary({}, { outcomes: { smoke: 'success' } });
  assert.equal(missing.packageStatus, 'FAIL');
  assert.equal(missing.exitCode, 1, 'the reporting step must fail if an allegedly successful smoke has no status report');

  const compute = passingCompute();
  const fsr = passingFsr();
  const packaged = packagedReport(compute, fsr);
  packaged.webGpuAcceptance.computeStatus = 'UNSUPPORTED';
  const inconsistent = runSummary({ packaged, compute, fsr });
  assert.equal(inconsistent.packageStatus, 'FAIL');
  assert.ok(inconsistent.integrityErrors.some((entry) => /computeStatus does not match/i.test(entry)));
  assert.equal(inconsistent.exitCode, 1);

  const unvalidated = runSummary({ packaged, compute, fsr }, { outcomes: { evidenceValidation: 'NOT RUN' } });
  assert.equal(unvalidated.reportValidationStatus, 'NOT RUN');
  assert.equal(unvalidated.packageStatus, 'FAIL');
  assert.equal(unvalidated.exitCode, 1, 'a successful process is not enough when PNG/report validation did not pass');

  const validatorFailure = runSummary({ packaged, compute, fsr }, { outcomes: { evidenceValidation: 'failure' } });
  assert.equal(validatorFailure.reportValidationStatus, 'FAIL');
  assert.equal(validatorFailure.packageStatus, 'FAIL');
  assert.equal(validatorFailure.exitCode, 1);
});

test('summary writer appends on process failure without clearing that failure or dumping environment variables', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-core-summary-'));
  try {
    const evidence = path.join(tempRoot, 'tricore-fsr-integration-smoke');
    fs.mkdirSync(evidence, { recursive: true });
    const summaryPath = path.join(tempRoot, 'step-summary.md');
    fs.writeFileSync(summaryPath, 'Earlier workflow summary\n');
    const logPath = path.join(tempRoot, 'smoke.log');
    fs.writeFileSync(logPath, [
      '[smoke] Failed at adapter-discovery: no adapter',
      'Authorization: Bearer example-secret-token',
      'API_SECRET_DO_NOT_COPY=example-private-value',
      'Credential URL https://alice:example-password@private.invalid/path?token=query-secret',
      'untrusted log fence ``` must remain data',
    ].join('\n') + '\n');
    const exitCode = main({
      RUNNER_TEMP: tempRoot,
      GITHUB_STEP_SUMMARY: summaryPath,
      GITHUB_RUN_ID: '9988',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_REF_NAME: 'branch',
      GITHUB_SHA: '0123456789abcdef',
      GITHUB_WORKFLOW: 'workflow',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_JOB: 'job',
      TRICORE_SMOKE_EVIDENCE_DIR: evidence,
      TRICORE_SMOKE_LOG: logPath,
      TRICORE_GPU_TEST_POLICY: 'optional',
      TRICORE_PACKAGE_OUTCOME: 'success',
      TRICORE_EXECUTABLE_VALIDATION_OUTCOME: 'success',
      TRICORE_SMOKE_OUTCOME: 'failure',
      TRICORE_CANDIDATE_ARTIFACT_OUTCOME: 'success',
      TRICORE_DIAGNOSTICS_ARTIFACT_OUTCOME: 'success',
      TRICORE_DISTRIBUTION_BUILD_OUTCOME: 'skipped',
      TRICORE_DISTRIBUTION_ARTIFACT_OUTCOME: 'skipped',
      API_SECRET_DO_NOT_COPY: 'must-not-appear',
    });
    const output = fs.readFileSync(summaryPath, 'utf8');
    assert.equal(exitCode, 0, 'reporting may finish successfully but cannot convert the earlier failed smoke step into success');
    assert.ok(output.startsWith('Earlier workflow summary'));
    assert.match(output, /Overall packaged status:\*\* \*\*FAIL\*\*/);
    assert.match(output, /GPU runtime:\*\* \*\*NOT RUN\*\*/);
    assert.match(output, /JSON schema \/ report consistency \/ PNG integrity validator \| \*\*NOT RUN\*\*/);
    assert.match(output, /Authorization=\[REDACTED\]/);
    assert.match(output, /API_SECRET_DO_NOT_COPY=\[REDACTED\]/);
    assert.match(output, /`{4}text/, 'untrusted backticks must not close the diagnostic code fence');
    const fencedLog = output.match(/`{4}text\n([\s\S]*?)\n`{4}/);
    assert.ok(fencedLog);
    assert.match(fencedLog[1], /untrusted log fence ``` must remain data/);
    assert.doesNotMatch(output, /example-secret-token|example-private-value|example-password|query-secret|must-not-appear/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('synthetic fixture reports are prominently labeled and can never establish physical hardware evidence', () => {
  const compute = { ...passingCompute(), syntheticFixture: true };
  const fsr = { ...passingFsr(), syntheticFixture: true, physicalGpuValidation: 'PASS' };
  const packaged = { ...packagedReport(compute, fsr, 'required'), syntheticFixture: true, physicalGpuValidation: 'PASS' };
  const model = runSummary({ packaged, compute, fsr }, { context: { policy: 'required' } });
  const markdown = renderSmokeJobSummary(model);
  assert.equal(model.fixture, true);
  assert.equal(model.packageStatus, 'NOT RUN');
  assert.equal(model.gpuAcceptanceStatus, 'NOT RUN');
  assert.equal(model.physicalGpu, 'NOT RUN');
  assert.match(markdown, /SYNTHETIC TEST FIXTURE — NOT HARDWARE EVIDENCE/);
  assert.match(markdown, /No packaged application, GPU, adapter, or physical hardware was exercised/);
});

test('physical-GPU classification requires required policy plus compute and FSR adapter/driver evidence', () => {
  const compute = passingCompute();
  const fsr = passingFsr();
  const packaged = packagedReport(compute, fsr, 'required');
  const model = runSummary({ packaged, compute, fsr }, { context: { policy: 'required' } });
  assert.equal(model.packageStatus, 'PASS');
  assert.equal(model.gpuAcceptanceStatus, 'PASS');
  assert.equal(model.physicalGpu, 'PASS');
  assert.equal(model.adapter.classification, 'Hardware-backed; required adapter and active-driver evidence passed');

  const missingDriver = structuredClone(fsr);
  missingDriver.graphicsEnvironment.chromiumGpuDevices[0].driverVersion = '';
  const invalidAcceptance = classifyWebGpuSmoke({ policy: 'required', computeProbe: compute, fsrReport: missingDriver });
  assert.equal(invalidAcceptance.status, 'UNSUPPORTED');
  assert.equal(invalidAcceptance.physicalGpuValidation, 'NOT RUN');
});
