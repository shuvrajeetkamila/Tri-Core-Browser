'use strict';

const path = require('node:path');

const MAX_FSR_CAPTURE_FRAMES = 5;
const MAX_CAPTURE_SLOT = 2;
const EXPECTED_INPUT_SOURCE = 'Electron WebContents.capturePage() PNG';
const FSR_TECHNOLOGY = 'AMD FidelityFX FSR 1.0.2 EASU + RCAS';
const MAX_INPUT_DIMENSION = 4096;
const MAX_INPUT_PIXELS = 2_097_152;

function normalizeCaptureRequest(payload = {}) {
  const slot = Number(payload.slot);
  const frameCount = Number(payload.frameCount ?? 3);
  const tabId = typeof payload.tabId === 'string' ? payload.tabId.trim() : '';
  const rawAdapterIndex = payload.adapterIndex;
  const adapterIndex = rawAdapterIndex === undefined || rawAdapterIndex === null || rawAdapterIndex === ''
    ? null
    : Number(rawAdapterIndex);

  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_CAPTURE_SLOT) return { ok: false, error: 'Invalid browser core.' };
  if (!tabId || tabId.length > 100) return { ok: false, error: 'The requested test-scene tab is invalid.' };
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > MAX_FSR_CAPTURE_FRAMES) {
    return { ok: false, error: `Choose between 1 and ${MAX_FSR_CAPTURE_FRAMES} frames per opt-in test run.` };
  }
  if (adapterIndex !== null && (!Number.isInteger(adapterIndex) || adapterIndex < 0 || adapterIndex > 1024)) {
    return { ok: false, error: 'The selected D3D12 adapter index is invalid.' };
  }
  return { ok: true, slot, tabId, frameCount, adapterIndex };
}

function validateCaptureDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return { ok: false, error: 'Electron capturePage() returned invalid image dimensions.' };
  }
  if (width > MAX_INPUT_DIMENSION || height > MAX_INPUT_DIMENSION || width * height > MAX_INPUT_PIXELS) {
    return { ok: false, error: `Captured frame exceeds the FSR1 safety limit (${MAX_INPUT_DIMENSION} pixels per side and ${MAX_INPUT_PIXELS.toLocaleString()} total pixels).` };
  }
  return { ok: true, width, height };
}

function validateCaptureContext({
  requestedSlot,
  requestedTabId,
  activeSlot,
  activeTabId,
  approvedScene,
  currentUrl,
  expectedUrl,
  loading,
  viewVisible,
  windowVisible,
} = {}) {
  if (requestedSlot !== activeSlot || !requestedTabId || requestedTabId !== activeTabId) {
    return { ok: false, error: 'Capture is allowed only from the active browser tab in the requested core.' };
  }
  if (approvedScene !== true || !expectedUrl || currentUrl !== expectedUrl) {
    return { ok: false, error: 'Only TRI-CORE’s bundled WebGL2 test scene can enter the FSR capture path.' };
  }
  if (loading) return { ok: false, error: 'Wait for the controlled WebGL2 test scene to finish loading.' };
  if (!viewVisible || !windowVisible) return { ok: false, error: 'The test-scene browser view must be visible before capture.' };
  return { ok: true };
}

function buildNativeFsrArguments({ inputPath, outputPath, reportPath, adapterIndex = null, useWarp = false } = {}) {
  if (![inputPath, outputPath, reportPath].every((value) => typeof value === 'string' && value.length > 0)) {
    throw new TypeError('Native FSR processing requires input, output, and report paths.');
  }
  if (useWarp && adapterIndex !== null) throw new TypeError('WARP and a hardware adapter selection cannot be combined.');
  const args = useWarp ? ['--warp'] : ['--hardware'];
  if (!useWarp && adapterIndex !== null) args.push('--adapter-index', String(adapterIndex));
  args.push('--input-png', inputPath, '--output-png', outputPath, '--report-json', reportPath);
  return args;
}

function buildBilinearReferencePath(outputPath) {
  if (typeof outputPath !== 'string' || outputPath.length === 0) {
    throw new TypeError('A processed output path is required to name its bilinear reference.');
  }
  const outputName = path.basename(outputPath, path.extname(outputPath));
  if (!outputName) throw new TypeError('The processed output path must include a file name.');
  return path.join(path.dirname(outputPath), `${outputName}-bilinear-reference.png`);
}

function validateNativeFsrReport(report, expectedInput = {}) {
  if (!report || typeof report !== 'object') return { ok: false, error: 'The native FSR helper did not produce a readable JSON report.' };
  if (report.status !== 'PASS' || report.initializationStatus !== 'PASS' || report.processingStatus !== 'PASS') {
    return { ok: false, error: 'The native FSR initialization or frame-processing status did not pass.' };
  }
  if (report.technology !== FSR_TECHNOLOGY || report.api !== 'Direct3D 12') {
    return { ok: false, error: 'The native report does not identify the expected AMD FSR1 D3D12 pipeline.' };
  }
  if (report.inputSource !== EXPECTED_INPUT_SOURCE || !String(report.browserGraphicsPath || '').includes('capturePage PNG')) {
    return { ok: false, error: 'The native report does not prove that its input came from Electron capturePage().' };
  }
  if (report.processedFrames !== 1 || typeof report.softwareAdapter !== 'boolean') {
    return { ok: false, error: 'The native report is missing a single-frame count or software/hardware adapter classification.' };
  }
  if (typeof report.bilinearReferencePath !== 'string' || !report.bilinearReferencePath) {
    return { ok: false, error: 'The native report is missing the CPU bilinear-reference capture path.' };
  }
  if (expectedInput.referencePath
      && path.resolve(report.bilinearReferencePath) !== path.resolve(expectedInput.referencePath)) {
    return { ok: false, error: 'The native report bilinear-reference path does not match this captured frame.' };
  }
  const inputWidth = Number(report.input?.width);
  const inputHeight = Number(report.input?.height);
  const outputWidth = Number(report.output?.width);
  const outputHeight = Number(report.output?.height);
  if (![inputWidth, inputHeight, outputWidth, outputHeight].every(Number.isSafeInteger)
      || inputWidth <= 0 || inputHeight <= 0 || outputWidth !== inputWidth * 2 || outputHeight !== inputHeight * 2) {
    return { ok: false, error: 'The native report has invalid input/output dimensions or did not produce an exact 2× image.' };
  }
  if (expectedInput.width && inputWidth !== expectedInput.width) return { ok: false, error: 'The native report input width does not match the captured browser frame.' };
  if (expectedInput.height && inputHeight !== expectedInput.height) return { ok: false, error: 'The native report input height does not match the captured browser frame.' };
  if (!report.fsr1RequiredFeaturesSupported || !Number.isFinite(report.checksum) || report.checksum <= 0) {
    return { ok: false, error: 'The native report did not confirm required D3D12 features and non-empty output validation.' };
  }
  return { ok: true, inputWidth, inputHeight, outputWidth, outputHeight };
}

module.exports = {
  EXPECTED_INPUT_SOURCE,
  FSR_TECHNOLOGY,
  MAX_FSR_CAPTURE_FRAMES,
  buildBilinearReferencePath,
  buildNativeFsrArguments,
  normalizeCaptureRequest,
  validateCaptureContext,
  validateCaptureDimensions,
  validateNativeFsrReport,
};
