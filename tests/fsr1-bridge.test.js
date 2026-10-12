import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nativeFsrSource = fs.readFileSync(new URL('../native/fsr1-poc/Fsr1Poc.cpp', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const {
  EXPECTED_INPUT_SOURCE,
  FSR_TECHNOLOGY,
  isFileUrlForPath,
  buildBilinearReferencePath,
  buildNativeFsrArguments,
  normalizeCaptureRequest,
  validateCaptureContext,
  validateCaptureDimensions,
  validateNativeFsrReport,
} = require('../electron/fsr1-bridge.cjs');

test('capture request is bounded to valid cores, active tab IDs, 1–5 frames, and a numeric adapter index', () => {
  assert.deepEqual(normalizeCaptureRequest({ slot: 0, tabId: 'test-tab', frameCount: 3, adapterIndex: 2 }), {
    ok: true, slot: 0, tabId: 'test-tab', frameCount: 3, adapterIndex: 2,
  });
  assert.deepEqual(normalizeCaptureRequest({ slot: 1, tabId: 'test-tab' }), {
    ok: true, slot: 1, tabId: 'test-tab', frameCount: 3, adapterIndex: null,
  });
  assert.equal(normalizeCaptureRequest({ slot: 3, tabId: 'test-tab' }).ok, false);
  assert.equal(normalizeCaptureRequest({ slot: 0, tabId: '', frameCount: 1 }).ok, false);
  assert.equal(normalizeCaptureRequest({ slot: 0, tabId: 'test-tab', frameCount: 0 }).ok, false);
  assert.equal(normalizeCaptureRequest({ slot: 0, tabId: 'test-tab', frameCount: 6 }).ok, false);
  assert.equal(normalizeCaptureRequest({ slot: 0, tabId: 'test-tab', adapterIndex: -1 }).ok, false);
  assert.equal(normalizeCaptureRequest({ slot: 0, tabId: 'test-tab', adapterIndex: '0; --warp' }).ok, false);
});

test('capture dimensions are bounded before native helper startup or capture-file persistence', () => {
  assert.deepEqual(validateCaptureDimensions(1920, 1080), { ok: true, width: 1920, height: 1080 });
  assert.equal(validateCaptureDimensions(4097, 1).ok, false);
  assert.equal(validateCaptureDimensions(2048, 1025).ok, false);
  assert.equal(validateCaptureDimensions(0, 10).ok, false);
  assert.equal(validateCaptureDimensions(10, Number.NaN).ok, false);
});

test('capture is restricted to the visible active app-owned WebGL2 test scene', () => {
  const valid = {
    requestedSlot: 0,
    requestedTabId: 'scene-tab',
    activeSlot: 0,
    activeTabId: 'scene-tab',
    approvedScene: true,
    currentUrl: 'file:///app/diagnostics/fsr1-browser-game.html',
    expectedUrl: 'file:///app/diagnostics/fsr1-browser-game.html',
    loading: false,
    viewVisible: true,
    windowVisible: true,
  };
  assert.deepEqual(validateCaptureContext(valid), { ok: true });
  assert.equal(validateCaptureContext({ ...valid, approvedScene: false }).ok, false);
  assert.equal(validateCaptureContext({ ...valid, currentUrl: 'https://example.com/' }).ok, false);
  assert.equal(validateCaptureContext({ ...valid, viewVisible: false }).ok, false);
  assert.equal(validateCaptureContext({ ...valid, windowVisible: false }).ok, false);
  assert.equal(validateCaptureContext({ ...valid, loading: true }).ok, false);
  assert.equal(validateCaptureContext({ ...valid, activeTabId: 'other-tab' }).ok, false);
});

test('bundled FSR scene URL check normalizes file URLs but rejects other paths and protocols', () => {
  const scenePath = path.resolve('app/diagnostics/fsr1-browser-game.html');
  const sceneUrl = pathToFileURL(scenePath).href;
  assert.equal(isFileUrlForPath(sceneUrl, scenePath), true);
  assert.equal(isFileUrlForPath(`${sceneUrl}#frame`, scenePath), true);
  assert.equal(isFileUrlForPath(`${sceneUrl}?external=1`, scenePath), false);
  assert.equal(isFileUrlForPath(sceneUrl.replace('fsr1-browser-game.html', 'other.html'), scenePath), false);
  assert.equal(isFileUrlForPath('https://example.com/fsr1-browser-game.html', scenePath), false);
  assert.equal(isFileUrlForPath(sceneUrl, ''), false);
});

test('WARP and Microsoft Basic Render Driver are excluded from physical-adapter classification', () => {
  assert.match(nativeFsrSource, /bool IsSoftwareAdapter\(const DXGI_ADAPTER_DESC1& description\)/);
  assert.match(nativeFsrSource, /description\.Flags & DXGI_ADAPTER_FLAG_SOFTWARE/);
  assert.match(nativeFsrSource, /description\.VendorId == 0x1414 && description\.DeviceId == 0x008c/);
  assert.match(nativeFsrSource, /basic render driver/);
  assert.match(nativeFsrSource, /if \(IsSoftwareAdapter\(description\)\) continue/);
  assert.ok(mainSource.includes(String.raw`const softwareIdentity = /\bwarp\b|basic render driver/i.test(name)`));
  assert.match(mainSource, /softwareAdapter: adapter\.softwareAdapter === true \|\| softwareIdentity/);
});

test('native helper uses a fixed argument vector and never invokes a command shell', () => {
  const args = buildNativeFsrArguments({
    inputPath: 'C:\\captures\\frame 01.png',
    outputPath: 'C:\\captures\\processed.png',
    reportPath: 'C:\\captures\\report.json',
    adapterIndex: 1,
  });
  assert.deepEqual(args, [
    '--hardware', '--adapter-index', '1',
    '--input-png', 'C:\\captures\\frame 01.png',
    '--output-png', 'C:\\captures\\processed.png',
    '--report-json', 'C:\\captures\\report.json',
  ]);
  assert.deepEqual(buildNativeFsrArguments({
    inputPath: 'frame.png', outputPath: 'out.png', reportPath: 'report.json', useWarp: true,
  }).slice(0, 1), ['--warp']);
  assert.throws(() => buildNativeFsrArguments({ inputPath: 'frame.png' }), /requires input, output, and report paths/);
  assert.throws(() => buildNativeFsrArguments({
    inputPath: 'frame.png', outputPath: 'out.png', reportPath: 'report.json', useWarp: true, adapterIndex: 0,
  }), /cannot be combined/);
});

test('each browser output frame maps to its own bilinear-reference capture path', () => {
  const frameOnePath = path.join('captures', 'frame-001-fsr1-easu-rcas.png');
  const frameTwoPath = path.join('captures', 'frame-002-fsr1-easu-rcas.png');
  assert.equal(
    buildBilinearReferencePath(frameOnePath),
    path.join('captures', 'frame-001-fsr1-easu-rcas-bilinear-reference.png'),
  );
  assert.notEqual(
    buildBilinearReferencePath(frameOnePath),
    buildBilinearReferencePath(frameTwoPath),
  );
  assert.throws(() => buildBilinearReferencePath(''), /output path is required/);
});

test('processed frame must be reported as a real capturePage image entering FSR and returning at 2×', () => {
  const report = {
    status: 'PASS',
    technology: FSR_TECHNOLOGY,
    api: 'Direct3D 12',
    inputSource: EXPECTED_INPUT_SOURCE,
    browserGraphicsPath: 'Chromium WebContentsView -> Electron capturePage PNG CPU readback -> app-owned D3D12 upload',
    initializationStatus: 'PASS',
    processingStatus: 'PASS',
    processedFrames: 1,
    softwareAdapter: true,
    fsr1RequiredFeaturesSupported: true,
    input: { width: 480, height: 600 },
    output: { width: 960, height: 1200 },
    bilinearReferencePath: '/captures/frame-001-bilinear-reference.png',
    checksum: 123456,
  };
  assert.deepEqual(validateNativeFsrReport(report, {
    width: 480,
    height: 600,
    referencePath: '/captures/frame-001-bilinear-reference.png',
  }), {
    ok: true, inputWidth: 480, inputHeight: 600, outputWidth: 960, outputHeight: 1200,
  });
  assert.equal(validateNativeFsrReport({ ...report, inputSource: 'synthetic native texture' }).ok, false);
  assert.equal(validateNativeFsrReport({ ...report, processingStatus: 'FAILED' }).ok, false);
  assert.equal(validateNativeFsrReport({ ...report, processedFrames: 0 }).ok, false);
  assert.equal(validateNativeFsrReport({ ...report, output: { width: 481, height: 1200 } }).ok, false);
  assert.equal(validateNativeFsrReport({ ...report, fsr1RequiredFeaturesSupported: false }).ok, false);
  assert.equal(validateNativeFsrReport({ ...report, bilinearReferencePath: '/captures/wrong-frame-reference.png' }, {
    referencePath: '/captures/frame-001-bilinear-reference.png',
  }).ok, false);
});
