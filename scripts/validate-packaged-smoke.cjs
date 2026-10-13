'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {
  normalizeGpuTestPolicy,
  isUnsafeLaunch,
  isKnownAnswerPass,
  isNoAdapterReport,
  isFsrPass,
  isFsrUnsupported,
  hasPhysicalGpuEvidence,
} = require('../electron/webgpu-smoke-policy.cjs');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(root, name) {
  const filePath = path.join(root, name);
  assert(fs.existsSync(filePath), `Required packaged-smoke report is missing: ${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Packaged-smoke report is not valid JSON (${name}): ${error.message}`);
  }
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

function pngCrc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) crc = PNG_CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngInfo(filePath) {
  assert(fs.existsSync(filePath), `Required PNG evidence is missing: ${filePath}`);
  const bytes = fs.readFileSync(filePath);
  assert(bytes.length >= 57, `PNG evidence is empty or truncated: ${filePath}`);
  assert(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `Evidence is not a PNG: ${filePath}`);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let compressionMethod = -1;
  let filterMethod = -1;
  let interlaceMethod = -1;
  let offset = 8;
  let chunkCount = 0;
  let ended = false;
  let paletteSeen = false;
  const idatParts = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    assert(crcEnd <= bytes.length, `PNG chunk exceeds the file length: ${filePath}`);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    assert(pngCrc32(bytes, offset + 4, dataEnd) === bytes.readUInt32BE(dataEnd), `PNG ${type} chunk CRC is invalid: ${filePath}`);
    if (chunkCount === 0) {
      assert(type === 'IHDR' && length === 13, `PNG does not begin with a valid IHDR: ${filePath}`);
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      compressionMethod = bytes[dataStart + 10];
      filterMethod = bytes[dataStart + 11];
      interlaceMethod = bytes[dataStart + 12];
      assert(width > 0 && height > 0 && width <= 32768 && height <= 32768, `PNG dimensions are invalid or out of bounds: ${filePath}`);
    } else if (type === 'IHDR') {
      throw new Error(`PNG contains a duplicate IHDR: ${filePath}`);
    }
    if (type === 'PLTE') {
      assert(!paletteSeen && length > 0 && length <= 768 && length % 3 === 0, `PNG palette is invalid: ${filePath}`);
      paletteSeen = true;
    }
    if (type === 'IDAT') idatParts.push(bytes.subarray(dataStart, dataEnd));
    offset = crcEnd;
    chunkCount += 1;
    if (type === 'IEND') {
      assert(length === 0, `PNG IEND chunk must be empty: ${filePath}`);
      ended = true;
      break;
    }
  }
  assert(ended && idatParts.some((part) => part.length > 0) && offset === bytes.length,
    `PNG must contain image data and a final IEND chunk with no trailing bytes: ${filePath}`);
  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const validBitDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  assert(Object.hasOwn(channelsByType, colorType) && validBitDepths[colorType].includes(bitDepth),
    `PNG color type / bit depth is invalid: ${filePath}`);
  assert(compressionMethod === 0 && filterMethod === 0 && (interlaceMethod === 0 || interlaceMethod === 1),
    `PNG compression, filter, or interlace method is invalid: ${filePath}`);
  if (colorType === 3) assert(paletteSeen, `Indexed-color PNG is missing its PLTE palette: ${filePath}`);

  const bitsPerPixel = channelsByType[colorType] * bitDepth;
  const passes = interlaceMethod === 0
    ? [{ startX: 0, startY: 0, stepX: 1, stepY: 1 }]
    : [
      { startX: 0, startY: 0, stepX: 8, stepY: 8 },
      { startX: 4, startY: 0, stepX: 8, stepY: 8 },
      { startX: 0, startY: 4, stepX: 4, stepY: 8 },
      { startX: 2, startY: 0, stepX: 4, stepY: 4 },
      { startX: 0, startY: 2, stepX: 2, stepY: 4 },
      { startX: 1, startY: 0, stepX: 2, stepY: 2 },
      { startX: 0, startY: 1, stepX: 1, stepY: 2 },
    ];
  const passSizes = passes.map((pass) => ({
    width: Math.max(0, Math.ceil((width - pass.startX) / pass.stepX)),
    height: Math.max(0, Math.ceil((height - pass.startY) / pass.stepY)),
  })).filter((pass) => pass.width > 0 && pass.height > 0);
  const rowSizes = passSizes.map((pass) => ({
    height: pass.height,
    bytes: Math.ceil((pass.width * bitsPerPixel) / 8),
  }));
  const expectedInflatedBytes = rowSizes.reduce((total, pass) => total + pass.height * (pass.bytes + 1), 0);
  const maxInflatedBytes = 256 * 1024 * 1024;
  assert(expectedInflatedBytes > 0 && expectedInflatedBytes <= maxInflatedBytes,
    `PNG decompressed pixel data is empty or exceeds the validation limit: ${filePath}`);
  let decoded;
  try {
    decoded = zlib.inflateSync(Buffer.concat(idatParts), { maxOutputLength: expectedInflatedBytes + 1 });
  } catch (error) {
    throw new Error(`PNG image data cannot be decompressed: ${filePath} (${error.message})`);
  }
  assert(decoded.length === expectedInflatedBytes, `PNG decompressed image data length does not match its dimensions: ${filePath}`);
  let decodedOffset = 0;
  for (const pass of rowSizes) {
    for (let row = 0; row < pass.height; row += 1) {
      const filter = decoded[decodedOffset];
      assert(filter <= 4, `PNG scanline uses an invalid filter method: ${filePath}`);
      decodedOffset += pass.bytes + 1;
    }
  }
  return { bytes, width, height, bitDepth, colorType, interlaceMethod };
}

function evidenceFilePath(root, rawPath, label) {
  assert(typeof rawPath === 'string' && rawPath.length > 0, `${label} path is missing.`);
  const unresolvedRoot = path.resolve(root);
  const unresolvedPath = path.resolve(rawPath);
  const lexicalRelative = path.relative(unresolvedRoot, unresolvedPath);
  assert(lexicalRelative && lexicalRelative !== '..' && !lexicalRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(lexicalRelative), `${label} path escapes the smoke-output directory.`);
  let resolvedRoot;
  let resolvedPath;
  try {
    resolvedRoot = fs.realpathSync(unresolvedRoot);
    resolvedPath = fs.realpathSync(unresolvedPath);
  } catch (error) {
    throw new Error(`${label} evidence path is missing or inaccessible: ${error.message}`);
  }
  const relative = path.relative(resolvedRoot, resolvedPath);
  assert(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `${label} path escapes the smoke-output directory.`);
  assert(fs.statSync(resolvedPath).isFile(), `${label} evidence path is not a file.`);
  return resolvedPath;
}

function verifyReportedPng(filePath, expected, label) {
  const image = pngInfo(filePath);
  if (expected?.width !== undefined) assert(image.width === Number(expected.width), `${label} PNG width differs from its report.`);
  if (expected?.height !== undefined) assert(image.height === Number(expected.height), `${label} PNG height differs from its report.`);
  if (expected?.sha256) {
    const digest = crypto.createHash('sha256').update(image.bytes).digest('hex');
    assert(digest === String(expected.sha256).toLowerCase(), `${label} PNG SHA-256 differs from its report.`);
  }
  return image;
}

function validateWarpPngEvidence(root) {
  const summary = readJson(root, 'browser-frame-smoke-summary.json');
  assert(summary.status === 'PASS', 'The packaged capturePage→PNG diagnostic did not pass.');
  assert(summary.source === 'Electron WebContents.capturePage() PNG', 'The diagnostic input source is not the actual Electron capturePage PNG.');
  assert(summary.softwareAdapter === true, 'The PNG diagnostic must explicitly identify D3D12 WARP as software.');
  assert(summary.frameCount === 3 && summary.distinctInputFrames === 3 && summary.distinctInputResolutions === 3, 'The diagnostic must validate three changing captured frames at three resolutions.');
  assert(Array.isArray(summary.frames) && summary.frames.length === 3, 'The diagnostic must retain three per-frame reports.');

  const referencePaths = new Set();
  for (const [index, frame] of summary.frames.entries()) {
    const label = `capturePage diagnostic frame ${index + 1}`;
    assert(frame.nativeReport?.status === 'PASS', `${label} native FSR report did not pass.`);
    assert(frame.nativeReport?.processingStatus === 'PASS', `${label} native processing did not complete.`);
    assert(frame.nativeReport?.inputSource === summary.source, `${label} did not originate from the actual capturePage PNG.`);
    assert(frame.nativeReport?.softwareAdapter === true && frame.softwareAdapter === true, `${label} is not explicitly identified as WARP/software.`);
    const inputPath = evidenceFilePath(root, frame.inputPath, `${label} input`);
    const outputPath = evidenceFilePath(root, frame.outputPath, `${label} output`);
    const referencePath = evidenceFilePath(root, frame.referencePath, `${label} reference`);
    const reportPath = evidenceFilePath(root, frame.reportPath, `${label} report`);
    assert(evidenceFilePath(root, frame.nativeReport.bilinearReferencePath, `${label} native reference`) === referencePath, `${label} reference PNG path does not match its native report.`);
    referencePaths.add(referencePath);
    verifyReportedPng(inputPath, { width: frame.inputWidth, height: frame.inputHeight }, `${label} input`);
    verifyReportedPng(outputPath, { width: frame.outputWidth, height: frame.outputHeight }, `${label} FSR output`);
    verifyReportedPng(referencePath, { width: frame.outputWidth, height: frame.outputHeight }, `${label} bilinear reference`);
    assert(fs.existsSync(reportPath), `${label} per-frame native report is missing.`);
    assert(Number(frame.outputWidth) > Number(frame.inputWidth) && Number(frame.outputHeight) > Number(frame.inputHeight), `${label} dimensions are not upscaled.`);
  }
  assert(referencePaths.size === 3, 'Each capturePage frame must have its own distinct bilinear-reference PNG.');
  return summary;
}

function validateVisibleFsrEvidence(root, fsrReport) {
  assert(isFsrPass(fsrReport), 'The bundled WebGPU FSR1 report lacks verified adapter, EASU/RCAS dispatch, motion, or visible-output evidence.');
  assert(fsrReport.api === 'WebGPU' && fsrReport.readbackForProcessing === false, 'The live bundled FSR1 path must be WebGPU and must not use readback for processing.');
  assert(fsrReport.physicalGpuValidation === 'NOT RUN', 'The per-scene report must keep physical-GPU validation distinct from runtime execution.');
  assert(Number(fsrReport.processedFrames) >= 3, 'The bundled scene must have processed at least three frames.');
  assert(Number(fsrReport.input?.width) > 0 && Number(fsrReport.input?.height) > 0, 'The bundled scene input dimensions are missing.');
  assert(Number(fsrReport.output?.width) > Number(fsrReport.input.width) && Number(fsrReport.output?.height) > Number(fsrReport.input.height), 'The bundled scene output dimensions are not larger than its input.');
  assert(fsrReport.timingDefinition?.includes('not a GPU timestamp'), 'WebGPU queue-completion timing must not be represented as a GPU timestamp.');
  const queueTimes = [
    Number(fsrReport.lastQueueCompletionWallMs),
    Number(fsrReport.averageQueueCompletionWallMs),
    Number(fsrReport.maxQueueCompletionWallMs),
  ];
  assert(queueTimes.every((value) => Number.isFinite(value) && value > 0)
    && queueTimes[1] <= queueTimes[2] && queueTimes[0] <= queueTimes[2],
  'WebGPU queue-completion wall-time measurements are missing or inconsistent.');

  const declaredStageDimensions = {
    lowResolutionInput: fsrReport.input,
    easuIntermediate: fsrReport.output,
    rcasOutput: fsrReport.output,
  };
  for (const name of ['lowResolutionInput', 'easuIntermediate', 'rcasOutput']) {
    const capture = fsrReport.imageValidation?.captures?.[name];
    const declared = declaredStageDimensions[name];
    assert(capture?.path, `Post-processing stage capture is missing: ${name}`);
    assert(Number(capture.width) === Number(declared?.width) && Number(capture.height) === Number(declared?.height),
      `${name} capture dimensions differ from the FSR input/output dimensions.`);
    verifyReportedPng(evidenceFilePath(root, capture.path, `${name} stage`), capture, `${name} stage`);
  }
  const generation = fsrReport.stageResults?.outputGeneration;
  if (generation?.input || generation?.output) {
    assert(Number(generation.input?.width) === Number(fsrReport.input.width)
      && Number(generation.input?.height) === Number(fsrReport.input.height), 'Output-generation input dimensions disagree with the FSR report.');
    assert(Number(generation.output?.width) === Number(fsrReport.output.width)
      && Number(generation.output?.height) === Number(fsrReport.output.height), 'Output-generation dimensions disagree with the FSR report.');
  }
  const comparison = fsrReport.imageValidation?.stageComparison;
  const comparisonDimensions = comparison?.dimensions;
  assert(comparisonDimensions && Number(comparisonDimensions.input?.width) === Number(fsrReport.input.width)
    && Number(comparisonDimensions.input?.height) === Number(fsrReport.input.height)
    && Number(comparisonDimensions.easu?.width) === Number(fsrReport.output.width)
    && Number(comparisonDimensions.easu?.height) === Number(fsrReport.output.height)
    && Number(comparisonDimensions.rcas?.width) === Number(fsrReport.output.width)
    && Number(comparisonDimensions.rcas?.height) === Number(fsrReport.output.height),
  'Numerical stage-comparison dimensions disagree with the input/output report.');
  const numerical = comparison.numerical || {};
  const pixelCount = Number(fsrReport.output.width) * Number(fsrReport.output.height);
  assert(Number(numerical.comparedOutputPixels) === pixelCount
    && Number(numerical.comparedRgbChannels) === pixelCount * 3,
  'Numerical stage-comparison sample counts disagree with the output dimensions.');
  for (const name of [
    'easuVsBilinearMeanAbsoluteErrorNormalized',
    'easuChangedPixelFraction',
    'rcasVsEasuMeanAbsoluteErrorNormalized',
    'rcasChangedPixelFraction',
    'inputMeanNeighborDifferenceNormalized',
    'rcasMeanNeighborDifferenceNormalized',
  ]) assert(Number.isFinite(Number(numerical[name])), `Numerical stage-comparison metric is missing or not finite: ${name}.`);
  assert(Number(numerical.easuVsBilinearMeanAbsoluteErrorNormalized) > 0
    && Number(numerical.rcasVsEasuMeanAbsoluteErrorNormalized) > 0
    && Number(numerical.easuChangedPixelFraction) > 0 && Number(numerical.easuChangedPixelFraction) <= 1
    && Number(numerical.rcasChangedPixelFraction) > 0 && Number(numerical.rcasChangedPixelFraction) <= 1
    && Number(numerical.inputMeanNeighborDifferenceNormalized) > 0
    && Number(numerical.rcasMeanNeighborDifferenceNormalized) > 0,
  'Numerical stage-comparison metrics do not prove meaningful input/EASU/RCAS pixel differences.');
  assert(Number.isInteger(Number(numerical.inputDistinctSampledColors)) && Number(numerical.inputDistinctSampledColors) > 2
    && Number.isInteger(Number(numerical.outputDistinctSampledColors)) && Number(numerical.outputDistinctSampledColors) > 2,
  'Numerical stage-comparison colors do not establish meaningful image content.');

  const visibleComparison = fsrReport.imageValidation?.visibleCanvas;
  const visibleSampleCount = Number(visibleComparison?.sampleCount);
  assert(visibleSampleCount >= 12
    && Number.isFinite(Number(visibleComparison?.meanAbsoluteErrorNormalized))
    && Number.isFinite(Number(visibleComparison?.luminanceCorrelation))
    && Number(visibleComparison.meanAbsoluteErrorNormalized) >= 0
    && Number(visibleComparison.meanAbsoluteErrorNormalized) <= 0.45
    && Number(visibleComparison.luminanceCorrelation) >= 0.55
    && Number(visibleComparison.luminanceCorrelation) <= 1
    && Number(visibleComparison.samplesWithin30PercentMeanError) >= Math.ceil(visibleSampleCount * 0.5)
    && Number(visibleComparison.distinctObservedColors) >= Math.min(4, visibleSampleCount),
  'Visible-canvas comparison lacks sufficient matched samples, acceptance-threshold accuracy/correlation, or varied observed pixels.');
  const visibleCapture = fsrReport.visibleOutputCapture;
  assert(visibleCapture?.path, 'Post-processing visible-canvas screenshot evidence is missing.');
  verifyReportedPng(evidenceFilePath(root, visibleCapture.path, 'visible-canvas screenshot'), visibleCapture, 'visible-canvas screenshot');
  assert(visibleCapture.purpose?.includes('never used as FSR input'), 'The visible screenshot must remain evidence-only, not an FSR input.');
}

function validateNoAdapterSkip(computeReport, fsrReport, acceptance) {
  assert(acceptance.status === 'SKIPPED', 'Optional GPU checks may skip only with an explicit SKIPPED acceptance status.');
  assert(acceptance.required === false && acceptance.shouldFail === false && acceptance.capabilityStatus === 'UNSUPPORTED', 'Optional adapter-unavailable result has inconsistent required/failure/capability flags.');
  if (computeReport.status === 'UNSUPPORTED') {
    assert(isNoAdapterReport(computeReport), 'Compute UNSUPPORTED is not supported by safe adapter-discovery evidence.');
  } else {
    assert(isKnownAnswerPass(computeReport), 'A skipped FSR scene still requires an honest, either PASS or no-adapter compute report.');
  }
  assert(isFsrUnsupported(fsrReport), 'FSR SKIPPED does not prove safe API/adapter discovery with zero processing.');
  assert(acceptance.reasonCode === 'NO_COMPATIBLE_ADAPTER' || acceptance.reasonCode === 'FSR_ADAPTER_UNAVAILABLE', 'Optional skip reason is not an adapter-unavailable capability state.');
}

function validateSmokeLog(filePath, acceptanceStatus) {
  assert(typeof filePath === 'string' && filePath.trim().length > 0, 'Packaged smoke log path is required; pass --smoke-log <path>.');
  assert(fs.existsSync(filePath), `Packaged smoke log is missing: ${filePath}`);
  const log = fs.readFileSync(filePath, 'utf8');
  assert(log.trim().length > 0, `Packaged smoke log is empty: ${filePath}`);
  assert(log.includes('[smoke] Browser shell, five mode controls'), 'Packaged browser shell/UI check is not in the app log.');
  assert(log.includes('[smoke] Local HTTP website, JavaScript and WebAssembly add(19,23)=42: PASS'), 'Packaged local HTTP/JavaScript/WebAssembly regression check is not in the app log.');
  assert(log.includes('[smoke] Add, activate and close a tab while retaining the last tab: PASS'), 'Packaged browser-tab lifecycle check is not in the app log.');
  assert(log.includes('[smoke] Active-core immersive fullscreen: PASS') && log.includes('[smoke] Immersive fullscreen exit: PASS'), 'Packaged immersive fullscreen enter/exit checks are missing.');
  assert(log.includes('[smoke] Diagnostic-only WebContentsView WebGL2 capture'), 'Packaged capturePage PNG diagnostic is missing from the app log.');
  assert(!log.includes('[smoke] FAIL at '), 'The app log contains a packaged smoke failure marker.');
  if (acceptanceStatus === 'PASS') {
    assert(log.includes('[smoke] Overall local runtime checks: PASS'), 'A WebGPU PASS is missing the final packaged runtime PASS marker.');
    assert(log.includes('[smoke] Live WebGPU game target'), 'A claimed live WebGPU FSR1 PASS has no corresponding app-log evidence.');
  }
  if (acceptanceStatus === 'SKIPPED') {
    assert(log.includes('GPU-dependent checks explicitly SKIPPED (no compatible adapter)')
      && log.includes('all required GPU-independent checks completed'), 'A GPU skip must explicitly record that required GPU-independent checks completed.');
  }
}

function validate() {
  const policy = normalizeGpuTestPolicy(argument('--policy'));
  assert(policy === 'optional' || policy === 'required', '--policy must be optional or required.');
  const rawRoot = argument('--directory');
  assert(rawRoot, '--directory is required.');
  const root = path.resolve(rawRoot);
  assert(fs.existsSync(root), `Smoke output directory is missing: ${root}`);
  const smokeLog = argument('--smoke-log');
  const packaged = readJson(root, 'packaged-smoke-summary.json');
  const compute = readJson(root, 'webgpu-compute-smoke-summary.json');
  const fsr = readJson(root, 'fsr1-webgpu-summary.json');
  assert(packaged.schemaVersion === 1, `Unsupported packaged-smoke-summary.json schemaVersion: ${packaged.schemaVersion ?? 'missing'}.`);
  assert(packaged.status === 'PASS', `Packaged GPU-independent smoke did not pass (status=${packaged.status}).`);
  assert(packaged.gpuTestPolicy === policy, `Packaged smoke policy mismatch: expected ${policy}, got ${packaged.gpuTestPolicy}.`);
  const checks = packaged.checks || {};
  for (const name of [
    'packagedAppStartup',
    'browserShellAndControls',
    'localHttpJavascriptWebAssembly',
    'browserTabLifecycle',
    'pngCaptureDiagnostic',
  ]) assert(checks[name] === 'PASS', `Required packaged GPU-independent check did not pass: ${name}=${checks[name] || 'missing'}.`);
  assert(checks.immersiveFullscreenEnterExit === 'PASS', 'Packaged fullscreen toggle/layout/restore check did not pass.');
  assert(checks.httpsNavigation === 'PASS' || checks.httpsNavigation === 'BLOCKED', 'HTTPS check must be PASS or explicitly BLOCKED; no certificate bypass is allowed.');
  assert(checks.independentWebGpuCompute === compute.status, 'Packaged status and independent compute report disagree.');
  assert(checks.bundledWebGpuFsr1 === packaged.webGpuAcceptance?.status, 'Packaged status and FSR acceptance report disagree.');
  assert(packaged.physicalGpuValidation === packaged.webGpuAcceptance?.physicalGpuValidation, 'Physical-GPU status is inconsistent across the packaged summary.');
  assert(packaged.webGpuAcceptance?.computeStatus === compute.status && packaged.webGpuAcceptance?.fsrStatus === fsr.status, 'WebGPU acceptance summary does not match the compute/FSR report statuses.');
  assert(packaged.releaseEligible === false || policy === 'required', 'An optional hosted smoke cannot be marked release-eligible.');
  assert(!isUnsafeLaunch(compute), 'GPU smoke used unsafe WebGPU flags, disabled GPU/sandbox, or a blocklist/workaround bypass.');
  assert(compute.physicalGpuValidation === 'NOT RUN', 'Independent compute probe must not claim physical-GPU validation.');
  assert(compute.windowSecurity?.sandbox === true && compute.windowSecurity?.contextIsolation === true
    && compute.windowSecurity?.nodeIntegration === false && compute.windowSecurity?.webSecurity === true,
  'Independent probe did not preserve Electron sandbox/context-isolation/web-security settings.');

  const acceptance = packaged.webGpuAcceptance;
  assert(acceptance && typeof acceptance === 'object', 'Packaged smoke is missing the WebGPU acceptance summary.');
  assert(acceptance.schemaVersion === 1, `Unsupported WebGPU acceptance schemaVersion: ${acceptance.schemaVersion ?? 'missing'}.`);
  if (compute.status === 'PASS') assert(isKnownAnswerPass(compute), 'Known-answer WebGPU probe did not verify an actual 19 + 23 = 42 compute dispatch/readback.');
  else if (compute.status === 'UNSUPPORTED') assert(isNoAdapterReport(compute), 'UNSUPPORTED compute report does not prove safe no-adapter discovery.');
  else throw new Error(`Known-answer compute test must PASS or prove adapter UNSUPPORTED; got ${compute.status}.`);

  const warpPng = validateWarpPngEvidence(root);
  if (acceptance.status === 'PASS') {
    assert(isKnownAnswerPass(compute), 'A WebGPU acceptance PASS requires a complete known-answer compute PASS.');
    validateVisibleFsrEvidence(root, fsr);
    assert(acceptance.computeStatus === 'PASS' && acceptance.fsrStatus === 'PASS', 'WebGPU acceptance PASS does not match both passing test reports.');
    if (policy === 'required') {
      assert(acceptance.required === true && acceptance.shouldFail === false && acceptance.capabilityStatus === 'PASS', 'Required GPU PASS must carry required=true, shouldFail=false, and capabilityStatus=PASS.');
      assert(acceptance.physicalGpuValidation === 'PASS' && packaged.physicalGpuValidation === 'PASS', 'Required GPU PASS must validate the physical GPU separately.');
      assert(packaged.releaseEligible === true, 'Required physical GPU validation did not mark the package release-eligible.');
      assert(hasPhysicalGpuEvidence(compute), 'Known-answer compute did not run on a classified non-software adapter with an active driver.');
      assert(hasPhysicalGpuEvidence(fsr), 'FSR1 did not run on a classified non-software adapter with an active driver.');
    } else {
      assert(acceptance.required === false && acceptance.shouldFail === false && acceptance.capabilityStatus === 'PASS' && acceptance.physicalGpuValidation === 'NOT RUN', 'Optional GPU PASS has inconsistent required/failure/capability/physical-validation flags.');
      assert(packaged.releaseEligible === false, 'Optional hosted smoke cannot mark a release eligible.');
    }
  } else if (acceptance.status === 'SKIPPED') {
    assert(policy === 'optional', 'The required physical-GPU path may not skip.');
    validateNoAdapterSkip(compute, fsr, acceptance);
    assert(packaged.physicalGpuValidation === 'NOT RUN' && packaged.releaseEligible === false, 'A skipped GPU path must remain NOT RUN for physical validation and ineligible for release.');
  } else if (acceptance.status === 'UNSUPPORTED' && policy === 'required') {
    throw new Error(`Required physical-GPU acceptance is UNSUPPORTED (${acceptance.reasonCode || 'unknown reason'}); required jobs may not skip.`);
  } else {
    throw new Error(`WebGPU acceptance did not pass and is not an allowed optional skip: ${acceptance.status}.`);
  }

  validateSmokeLog(smokeLog, acceptance.status);
  return {
    status: 'PASS',
    policy,
    gpuRuntimeStatus: acceptance.status,
    physicalGpuValidation: packaged.physicalGpuValidation,
    releaseEligible: packaged.releaseEligible,
    warpPngDiagnostic: 'PASS (D3D12 WARP software; not physical-GPU evidence)',
    independentCompute: compute.status,
    bundledFsr1: fsr.status,
  };
}

try {
  const result = validate();
  console.log(`[packaged-smoke-validation] ${JSON.stringify(result)}`);
} catch (error) {
  console.error(`[packaged-smoke-validation] FAIL: ${error.message}`);
  process.exitCode = 1;
}
