import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { classifyWebGpuSmoke } = require('../electron/webgpu-smoke-policy.cjs');
const validatorPath = fileURLToPath(new URL('../scripts/validate-packaged-smoke.cjs', import.meta.url));
const source = 'Electron WebContents.capturePage() PNG';

function writeJson(root, name, value) {
  fs.writeFileSync(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`);
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  const crcData = chunk.subarray(4, 8 + data.length);
  let crc = 0xffffffff;
  for (const byte of crcData) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return chunk;
}

function rewriteFirstPngIdat(filePath, replacement) {
  const bytes = fs.readFileSync(filePath);
  const chunks = [Buffer.from(bytes.subarray(0, 8))];
  let offset = 8;
  let replaced = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const dataEnd = offset + 8 + length;
    const chunkEnd = dataEnd + 4;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') {
      if (!replaced) chunks.push(pngChunk('IDAT', replacement));
      replaced = true;
    } else {
      chunks.push(Buffer.from(bytes.subarray(offset, chunkEnd)));
    }
    offset = chunkEnd;
    if (type === 'IEND') break;
  }
  assert.ok(replaced, 'fixture PNG must contain an IDAT chunk');
  fs.writeFileSync(filePath, Buffer.concat(chunks));
}

function writeTestPng(root, name, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * rowBytes;
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = row + 1 + x * 4;
      raw[pixel] = (x + y + 11) & 0xff;
      raw[pixel + 1] = (2 * x + 17) & 0xff;
      raw[pixel + 2] = (3 * y + 31) & 0xff;
      raw[pixel + 3] = 255;
    }
  }
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, bytes);
  return {
    path: filePath,
    width,
    height,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function physicalDevices() {
  return [{ active: true, vendor: 'Example GPU Vendor', name: 'Example GPU', driverVersion: '1.2.3' }];
}

function passingCompute() {
  return {
    status: 'PASS',
    state: 'output-verified',
    secureContext: true,
    apiDetected: true,
    deviceRequested: true,
    adapterRequestResults: [{ path: 'high-performance', status: 'selected' }],
    adapterInfo: {
      vendor: 'Example GPU Vendor', architecture: 'test', device: 'Example GPU', description: 'physical adapter',
      exposed: true, softwareAdapter: false,
    },
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
    windowSecurity: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
    graphicsEnvironment: { chromiumGpuDevices: physicalDevices() },
  };
}

function passingFsr(root) {
  const captures = {
    lowResolutionInput: writeTestPng(root, 'stage-input.png', 64, 48),
    easuIntermediate: writeTestPng(root, 'stage-easu.png', 128, 96),
    rcasOutput: writeTestPng(root, 'stage-rcas.png', 128, 96),
  };
  const visible = writeTestPng(root, 'visible-output.png', 320, 240);
  return {
    status: 'PASS', api: 'WebGPU', readbackForProcessing: false, physicalGpuValidation: 'NOT RUN',
    processedFrames: 3,
    input: { width: 64, height: 48 }, output: { width: 128, height: 96 },
    timingDefinition: 'queue completion wall time; not a GPU timestamp',
    lastQueueCompletionWallMs: 3.5,
    averageQueueCompletionWallMs: 4.1,
    maxQueueCompletionWallMs: 5.2,
    adapter: { vendor: 'Example GPU Vendor', architecture: 'test', device: 'Example GPU', description: 'physical adapter' },
    adapterInfoAvailable: true, softwareAdapter: false,
    lifecycle: {
      adapterDetected: true, shaderCompilationStatus: 'passed', pipelineCreationStatus: 'passed', resourceInitializationStatus: 'passed',
      easuComputePipelineInitialized: true, rcasComputePipelineInitialized: true, presentationPipelineInitialized: true,
      outputSubmittedToVisibleCanvas: true, visibleCanvasScreenshotCompared: true, visibleOutputVerified: true,
    },
    dispatch: { easuDispatches: 3, rcasDispatches: 3 },
    imageValidation: {
      status: 'PASS', readbackFeedsProcessing: false, motion: { changed: true },
      stageComparison: {
        status: 'PASS', checks: {
          dimensionsUpscaled: true, inputHasDetail: true, easuContributes: true, rcasContributes: true, outputHasDetail: true,
        },
        dimensions: {
          input: { width: 64, height: 48 },
          easu: { width: 128, height: 96 },
          rcas: { width: 128, height: 96 },
        },
        numerical: {
          comparedOutputPixels: 128 * 96,
          comparedRgbChannels: 128 * 96 * 3,
          easuVsBilinearMeanAbsoluteErrorNormalized: 0.02,
          easuChangedPixelsVsBilinear: 8000,
          easuChangedPixelFraction: 8000 / (128 * 96),
          rcasVsEasuMeanAbsoluteErrorNormalized: 0.01,
          rcasChangedPixelsVsEasu: 5000,
          rcasChangedPixelFraction: 5000 / (128 * 96),
          inputMeanNeighborDifferenceNormalized: 0.04,
          rcasMeanNeighborDifferenceNormalized: 0.05,
          inputDistinctSampledColors: 4,
          outputDistinctSampledColors: 6,
        },
      },
      visibleCanvas: {
        status: 'PASS', sampleCount: 16, meanAbsoluteErrorNormalized: 0.02, luminanceCorrelation: 0.97,
        samplesWithin30PercentMeanError: 14, distinctObservedColors: 8,
      }, captures,
    },
    visibleOutputCapture: { ...visible, purpose: 'Post-processing evidence only; never used as FSR input.' },
    graphicsEnvironment: { chromiumGpuDevices: physicalDevices() },
  };
}

function writeWarpEvidence(root) {
  const frames = [];
  for (let index = 0; index < 3; index += 1) {
    const inputWidth = 80 + index * 16;
    const inputHeight = 60 + index * 12;
    const outputWidth = inputWidth * 2;
    const outputHeight = inputHeight * 2;
    const input = writeTestPng(root, `warp-input-${index}.png`, inputWidth, inputHeight);
    const output = writeTestPng(root, `warp-output-${index}.png`, outputWidth, outputHeight);
    const reference = writeTestPng(root, `warp-reference-${index}.png`, outputWidth, outputHeight);
    const reportPath = path.join(root, `warp-frame-${index}.json`);
    writeJson(root, path.basename(reportPath), { status: 'PASS' });
    frames.push({
      inputPath: input.path, outputPath: output.path, referencePath: reference.path, reportPath,
      inputWidth, inputHeight, outputWidth, outputHeight, softwareAdapter: true,
      nativeReport: { status: 'PASS', processingStatus: 'PASS', inputSource: source, softwareAdapter: true, bilinearReferencePath: reference.path },
    });
  }
  writeJson(root, 'browser-frame-smoke-summary.json', {
    status: 'PASS', source, softwareAdapter: true, frameCount: 3, distinctInputFrames: 3, distinctInputResolutions: 3, frames,
  });
}

function unsupportedCompute() {
  return {
    status: 'UNSUPPORTED', state: 'unsupported', failureStage: 'adapter-discovery', secureContext: true, apiDetected: true,
    adapterRequestResults: [
      { path: 'high-performance', status: 'unavailable' },
      { path: 'low-power', status: 'unavailable' },
      { path: 'default', status: 'unavailable' },
      { path: 'force-fallback', status: 'unavailable' },
    ],
    deviceRequested: false, shaderCompilationStatus: 'NOT RUN', pipelineCreationStatus: 'NOT RUN', resourceInitializationStatus: 'NOT RUN',
    dispatches: 0, queueCompleted: false, expectedResult: 42, readbackResult: null, readbackVerified: false,
    physicalGpuValidation: 'NOT RUN', launchDiagnostics: { gpuRelatedSwitches: {} },
    windowSecurity: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  };
}

function unsupportedFsr() {
  return {
    status: 'SKIPPED', capabilityStatus: 'UNSUPPORTED', failureStage: 'adapter-discovery', apiDetected: true,
    adapterRequestResults: [
      { path: 'high-performance', status: 'unavailable' },
      { path: 'low-power', status: 'unavailable' },
      { path: 'default', status: 'unavailable' },
      { path: 'force-fallback', status: 'unavailable' },
    ],
    physicalGpuValidation: 'NOT RUN', processedFrames: 0, dispatch: { easuDispatches: 0, rcasDispatches: 0 },
    lifecycle: {
      state: 'unsupported', adapterDetected: false, shaderCompilationStatus: 'NOT RUN', pipelineCreationStatus: 'NOT RUN', resourceInitializationStatus: 'NOT RUN',
      easuComputePipelineInitialized: false, rcasComputePipelineInitialized: false, presentationPipelineInitialized: false,
      outputSubmittedToVisibleCanvas: false, visibleCanvasScreenshotCompared: false, visibleOutputVerified: false, framesCompleted: 0,
    },
  };
}

function writeCoreReports(root, { policy, compute, fsr, acceptance }) {
  writeWarpEvidence(root);
  writeJson(root, 'webgpu-compute-smoke-summary.json', compute);
  writeJson(root, 'fsr1-webgpu-summary.json', fsr);
  writeJson(root, 'packaged-smoke-summary.json', {
    schemaVersion: 1, status: 'PASS', gpuTestPolicy: policy, failedStage: null,
    checks: {
      packagedAppStartup: 'PASS', browserShellAndControls: 'PASS', immersiveFullscreenEnterExit: 'PASS',
      localHttpJavascriptWebAssembly: 'PASS', browserTabLifecycle: 'PASS', httpsNavigation: 'BLOCKED',
      pngCaptureDiagnostic: 'PASS', independentWebGpuCompute: compute.status, bundledWebGpuFsr1: acceptance.status,
    },
    webGpuAcceptance: acceptance, physicalGpuValidation: acceptance.physicalGpuValidation,
    releaseEligible: policy === 'required' && acceptance.status === 'PASS',
  });
  const logLines = [
    '[smoke] Browser shell, five mode controls: PASS',
    '[smoke] Local HTTP website, JavaScript and WebAssembly add(19,23)=42: PASS',
    '[smoke] Add, activate and close a tab while retaining the last tab: PASS',
    '[smoke] Active-core immersive fullscreen: PASS',
    '[smoke] Immersive fullscreen exit: PASS',
    '[smoke] Diagnostic-only WebContentsView WebGL2 capture: PASS',
  ];
  if (acceptance.status === 'PASS') {
    logLines.push('[smoke] Live WebGPU game target: PASS');
    logLines.push('[smoke] Overall local runtime checks: PASS (synthetic fixture)');
  }
  if (acceptance.status === 'SKIPPED') {
    logLines.push('[smoke] WebGPU GPU-dependent checks explicitly SKIPPED (no compatible adapter); all required GPU-independent checks completed. physicalGpuValidation=NOT RUN; releaseEligible=false.');
  }
  const logPath = path.join(root, 'smoke.log');
  fs.writeFileSync(logPath, `${logLines.join('\n')}\n`);
  return logPath;
}

function validateFixture(policy, fixture) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-core-smoke-fixture-'));
  try {
    const compute = fixture.compute || passingCompute();
    const fsr = fixture.fsr || passingFsr(root);
    if (typeof fixture.mutate === 'function') fixture.mutate({ root, compute, fsr });
    const acceptance = classifyWebGpuSmoke({ policy, computeProbe: compute, fsrReport: fsr });
    const smokeLog = writeCoreReports(root, { policy, compute, fsr, acceptance });
    if (typeof fixture.mutateReports === 'function') fixture.mutateReports({ root, smokeLog });
    const args = [validatorPath, '--policy', policy, '--directory', root];
    if (!fixture.omitSmokeLog) args.push('--smoke-log', smokeLog);
    return spawnSync(process.execPath, args, { encoding: 'utf8' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('packaged evidence validator accepts deterministic optional no-adapter reports only as SKIPPED', () => {
  const result = validateFixture('optional', { compute: unsupportedCompute(), fsr: unsupportedFsr() });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"gpuRuntimeStatus":"SKIPPED"/);
  assert.match(result.stdout, /"physicalGpuValidation":"NOT RUN"/);
});

test('packaged evidence validator rejects an omitted or empty application smoke log', () => {
  const omitted = validateFixture('optional', { omitSmokeLog: true });
  assert.notEqual(omitted.status, 0);
  assert.match(omitted.stderr, /Packaged smoke log path is required/);

  const empty = validateFixture('optional', {
    mutateReports({ smokeLog }) {
      fs.writeFileSync(smokeLog, '');
    },
  });
  assert.notEqual(empty.status, 0);
  assert.match(empty.stderr, /Packaged smoke log is empty/);
});

test('packaged evidence validator rejects stage or screenshot paths outside its smoke-output directory', () => {
  const result = validateFixture('optional', {
    mutate({ root, fsr }) {
      fsr.visibleOutputCapture.path = path.join(root, '..', 'outside-smoke-output.png');
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /visible-canvas screenshot path escapes the smoke-output directory/);
});

test('packaged evidence validator accepts required physical-GPU mocks only with compute and FSR driver evidence', () => {
  const result = validateFixture('required', {});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"physicalGpuValidation":"PASS"/);
  assert.match(result.stdout, /"releaseEligible":true/);
});

test('packaged evidence validator rejects a required no-adapter skip and a fabricated optional PASS', () => {
  const requiredSkip = validateFixture('required', { compute: unsupportedCompute(), fsr: unsupportedFsr() });
  assert.notEqual(requiredSkip.status, 0);
  assert.match(requiredSkip.stderr, /Required physical-GPU acceptance is UNSUPPORTED/);

  const optionalNoPhysical = validateFixture('optional', {});
  assert.equal(optionalNoPhysical.status, 0, optionalNoPhysical.stderr);
  assert.match(optionalNoPhysical.stdout, /"physicalGpuValidation":"NOT RUN"/);
});

test('packaged evidence validator rejects corrupted PNG image data even when chunk CRCs are recomputed', () => {
  const result = validateFixture('optional', {
    mutateReports({ root }) {
      const fsr = JSON.parse(fs.readFileSync(path.join(root, 'fsr1-webgpu-summary.json'), 'utf8'));
      rewriteFirstPngIdat(fsr.imageValidation.captures.rcasOutput.path, Buffer.from('not a valid zlib stream'));
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PNG image data cannot be decompressed/);
});

test('packaged evidence validator requires finite, consistent queue-completion timing evidence', () => {
  const result = validateFixture('optional', {
    mutateReports({ root }) {
      const fsr = JSON.parse(fs.readFileSync(path.join(root, 'fsr1-webgpu-summary.json'), 'utf8'));
      fsr.averageQueueCompletionWallMs = fsr.maxQueueCompletionWallMs + 1;
      writeJson(root, 'fsr1-webgpu-summary.json', fsr);
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /queue-completion wall-time measurements are missing or inconsistent/);
});

test('packaged evidence validator rejects unsupported report schema versions and inconsistent stage dimensions', () => {
  const schemaMismatch = validateFixture('optional', {
    mutateReports({ root }) {
      const packaged = JSON.parse(fs.readFileSync(path.join(root, 'packaged-smoke-summary.json'), 'utf8'));
      packaged.schemaVersion = 77;
      writeJson(root, 'packaged-smoke-summary.json', packaged);
    },
  });
  assert.notEqual(schemaMismatch.status, 0);
  assert.match(schemaMismatch.stderr, /Unsupported packaged-smoke-summary\.json schemaVersion/);

  const dimensionMismatch = validateFixture('optional', {
    mutateReports({ root }) {
      const fsr = JSON.parse(fs.readFileSync(path.join(root, 'fsr1-webgpu-summary.json'), 'utf8'));
      fsr.imageValidation.captures.easuIntermediate.width -= 1;
      writeJson(root, 'fsr1-webgpu-summary.json', fsr);
    },
  });
  assert.notEqual(dimensionMismatch.status, 0);
  assert.match(dimensionMismatch.stderr, /capture dimensions differ from the FSR input\/output dimensions/);
});
