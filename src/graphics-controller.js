export const GRAPHICS_MODES = Object.freeze([
  Object.freeze({ id: 'wasm', label: 'WASM RUNTIME', backend: 'Chromium V8 WebAssembly' }),
  Object.freeze({ id: 'dlss', label: 'NVIDIA DLSS', backend: 'NVIDIA Streamline / DLSS' }),
  Object.freeze({ id: 'fsr', label: 'AMD FSR', backend: 'AMD FidelityFX Super Resolution 1' }),
  Object.freeze({ id: 'hybrid', label: 'HYBRID CONTROLLER', backend: 'WASM diagnostic + compatible upscaler' }),
  Object.freeze({ id: 'standard', label: 'STANDARD CHROMIUM', backend: 'Chromium renderer' }),
]);

export const GRAPHICS_STATES = Object.freeze([
  'NOT DETECTED',
  'DETECTED',
  'COMPATIBLE',
  'INITIALIZED',
  'ACTIVE',
  'PROCESSING FRAMES',
  'FAILED',
  'UNSUPPORTED',
]);

const AUTOMATIC_PRIORITY = Object.freeze(['dlss', 'fsr', 'wasm']);

const MODE_IDS = new Set(GRAPHICS_MODES.map(({ id }) => id));
const STANDARD_FALLBACK = 'Standard Chromium rendering remains active; no upscaler is applied.';

function vendorIdAsHex(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value).toString(16).padStart(4, '0');
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (/^0x[0-9a-f]+$/.test(raw)) return Number.parseInt(raw.slice(2), 16).toString(16).padStart(4, '0');
  if (/^[0-9]+$/.test(raw)) return Number.parseInt(raw, 10).toString(16).padStart(4, '0');
  if (/^[0-9a-f]+$/.test(raw)) return Number.parseInt(raw, 16).toString(16).padStart(4, '0');
  return '';
}

function hasVendorDevice(devices, expectedId, vendorPattern) {
  return devices.some((device) => {
    const vendorId = vendorIdAsHex(device?.vendorId);
    const description = `${device?.vendor ?? ''} ${device?.name ?? ''}`.toLowerCase();
    return vendorId === expectedId || vendorPattern.test(description);
  });
}

function lifecycle(evidence = {}) {
  const detected = Boolean(evidence.detected);
  const compatible = evidence.compatible === true;
  const initialized = evidence.initialized === true;
  const failed = evidence.failed === true || Boolean(evidence.error);
  const unsupported = evidence.unsupported === true;
  const processedFrames = Number.isSafeInteger(evidence.processedFrames) && evidence.processedFrames >= 0
    ? evidence.processedFrames
    : 0;
  const gpuTimeMs = Number.isFinite(evidence.gpuTimeMs) && evidence.gpuTimeMs >= 0 ? evidence.gpuTimeMs : null;
  const cpuTimeMs = Number.isFinite(evidence.cpuTimeMs) && evidence.cpuTimeMs >= 0 ? evidence.cpuTimeMs : null;
  const queueCompletionWallMs = Number.isFinite(evidence.queueCompletionWallMs) && evidence.queueCompletionWallMs >= 0 ? evidence.queueCompletionWallMs : null;
  const averageQueueCompletionWallMs = Number.isFinite(evidence.averageQueueCompletionWallMs) && evidence.averageQueueCompletionWallMs >= 0 ? evidence.averageQueueCompletionWallMs : null;
  const maxQueueCompletionWallMs = Number.isFinite(evidence.maxQueueCompletionWallMs) && evidence.maxQueueCompletionWallMs >= 0 ? evidence.maxQueueCompletionWallMs : null;
  const inputWidth = Number.isSafeInteger(evidence.inputWidth) && evidence.inputWidth > 0 ? evidence.inputWidth : null;
  const inputHeight = Number.isSafeInteger(evidence.inputHeight) && evidence.inputHeight > 0 ? evidence.inputHeight : null;
  const outputWidth = Number.isSafeInteger(evidence.outputWidth) && evidence.outputWidth > 0 ? evidence.outputWidth : null;
  const outputHeight = Number.isSafeInteger(evidence.outputHeight) && evidence.outputHeight > 0 ? evidence.outputHeight : null;
  const integrationCanRun = compatible && initialized && !failed && !unsupported;
  const active = integrationCanRun && evidence.active === true;
  const processingFrames = active && evidence.processingFrames === true;

  let state = 'NOT DETECTED';
  if (failed) state = 'FAILED';
  else if (unsupported) state = 'UNSUPPORTED';
  else if (processingFrames) state = 'PROCESSING FRAMES';
  else if (active) state = 'ACTIVE';
  else if (initialized) state = 'INITIALIZED';
  else if (compatible) state = 'COMPATIBLE';
  else if (detected) state = 'DETECTED';

  return Object.freeze({
    detected,
    compatible,
    initialized,
    active,
    processingFrames,
    processedFrames,
    gpuTimeMs,
    cpuTimeMs,
    queueCompletionWallMs,
    averageQueueCompletionWallMs,
    maxQueueCompletionWallMs,
    inputWidth,
    inputHeight,
    outputWidth,
    outputHeight,
    failed,
    unsupported,
    deviceLost: evidence.deviceLost === true,
    failureStage: String(evidence.failureStage || ''),
    state,
    error: String(evidence.error ?? ''),
  });
}

function createUnavailableUpscaler(id, gpuDetected, integration = {}) {
  const implemented = integration?.implemented === true;
  const feature = lifecycle({
    detected: integration?.detected === true || gpuDetected,
    compatible: integration?.compatible === true,
    initialized: integration?.initialized === true,
    active: integration?.active === true,
    processingFrames: integration?.processingFrames === true,
    processedFrames: integration?.processedFrames,
    gpuTimeMs: integration?.gpuTimeMs,
    cpuTimeMs: integration?.cpuTimeMs,
    queueCompletionWallMs: integration?.queueCompletionWallMs,
    averageQueueCompletionWallMs: integration?.averageQueueCompletionWallMs,
    maxQueueCompletionWallMs: integration?.maxQueueCompletionWallMs,
    inputWidth: integration?.inputWidth,
    inputHeight: integration?.inputHeight,
    outputWidth: integration?.outputWidth,
    outputHeight: integration?.outputHeight,
    failed: integration?.failed === true,
    deviceLost: integration?.deviceLost === true,
    failureStage: integration?.failureStage,
    error: integration?.error,
    unsupported: integration?.unsupported === true || !implemented,
  });
  const hardwareCompatibility = integration?.hardwareCompatibility || (implemented ? 'NOT VERIFIED' : 'NOT TESTED');
  const reason = integration?.reason || (implemented
    ? 'Runtime-specific compatibility must be proven by the native backend.'
    : `${id === 'dlss' ? 'Streamline/DLSS' : 'FidelityFX/FSR'} is not integrated in this browser build.`);

  return Object.freeze({
    ...feature,
    hardwareDetected: gpuDetected,
    hardwareCompatibility,
    automaticEligible: integration?.automaticEligible !== false,
    scope: String(integration?.scope || ''),
    reason,
    backend: integration?.backend || 'No native frame-processing backend',
  });
}

/**
 * Build a report from observations returned by Electron/Chromium and the local
 * renderer. GPU identity is kept separate from feature compatibility: a vendor
 * label can never activate an upscaler.
 */
export function detectGraphicsCapabilities({
  gpuDevices = [],
  gpuInfoError = '',
  featureStatus = {},
  webgpu = {},
  webgl2 = {},
  wasm = {},
  integration = {},
} = {}) {
  const devices = Array.isArray(gpuDevices) ? gpuDevices : [];
  const primaryDevice = devices.find((device) => device?.active) || devices[0] || null;
  const nvidiaDetected = hasVendorDevice(devices, '10de', /\bnvidia\b/i);
  const amdDetected = hasVendorDevice(devices, '1002', /\bamd\b|advanced micro devices|\bati\b/i);
  const wasmLifecycle = lifecycle({
    detected: wasm.detected === true,
    compatible: wasm.compatible === true,
    initialized: wasm.initialized === true,
    failed: wasm.failed === true,
    error: wasm.error,
    processedFrames: 0,
    unsupported: wasm.unsupported === true,
  });

  return Object.freeze({
    gpu: Object.freeze({
      state: devices.length ? 'DETECTED' : gpuInfoError ? 'FAILED' : 'NOT DETECTED',
      devices: Object.freeze(devices.map((device) => Object.freeze({ ...device }))),
      primaryDevice: primaryDevice ? Object.freeze({ ...primaryDevice }) : null,
      nvidiaDetected,
      amdDetected,
      infoError: String(gpuInfoError || ''),
    }),
    apis: Object.freeze({
      webgpu: Object.freeze({ ...webgpu }),
      webgl2: Object.freeze({ ...webgl2 }),
      chromium: Object.freeze({ ...featureStatus }),
      nativeD3D12: String(integration?.fsr?.adapterApiStatus || 'NOT PROBED: no native D3D12 adapter report was returned.'),
      nativeVulkan: 'NOT PROBED: no native Vulkan upscaler integration is compiled into this build.',
    }),
    technologies: Object.freeze({
      dlss: createUnavailableUpscaler('dlss', nvidiaDetected, integration.dlss),
      fsr: createUnavailableUpscaler('fsr', amdDetected, integration.fsr),
      wasm: Object.freeze({
        ...wasmLifecycle,
        reason: wasmLifecycle.failed
          ? wasmLifecycle.error || 'The Chromium WebAssembly capability probe failed.'
          : wasmLifecycle.initialized
            ? 'A small module compiled and add(19, 23) returned 42. WASM is available; this is not image upscaling.'
            : 'WebAssembly capability has not been verified in this renderer.',
        backend: 'Chromium V8 WebAssembly; page rendering remains Chromium',
      }),
    }),
  });
}

function isInitializedCompatible(feature) {
  return Boolean(feature && feature.compatible && feature.initialized && !feature.failed && !feature.unsupported);
}

function isUsable(feature) {
  return isInitializedCompatible(feature) && feature.automaticEligible !== false;
}

/** Return the first initialized, compatible implementation in fixed DLSS → FSR → WASM order. */
export function chooseAutomaticMode(capabilities) {
  const technologies = capabilities?.technologies || {};
  for (const id of AUTOMATIC_PRIORITY) {
    const feature = technologies[id];
    if (isUsable(feature)) return id;
  }
  return 'standard';
}

function stateClass(state) {
  return String(state || 'UNSUPPORTED').toLowerCase().replace(/\s+/g, '-');
}

/**
 * Resolve a user request without conflating mode selection with image scaling.
 * `effectiveMode` describes the rendering/backend fallback; `selectedMode` is
 * only the requested label. An upscaler is active only with runtime evidence.
 */
export function resolveGraphicsMode(mode, { capabilities = null, wasmResult = null, gpu = null } = {}) {
  const requestedMode = MODE_IDS.has(mode) ? mode : 'standard';
  const technologies = capabilities?.technologies || {};
  const wasm = technologies.wasm || lifecycle({
    detected: typeof WebAssembly === 'object',
    compatible: Boolean(wasmResult?.passed),
    initialized: Boolean(wasmResult?.passed),
    failed: wasmResult?.passed === false,
    error: wasmResult?.error,
  });
  const feature = technologies[requestedMode];
  const deviceName = String(gpu?.name || capabilities?.gpu?.primaryDevice?.name || '').trim();
  const gpuSuffix = deviceName ? ` Detected GPU: ${deviceName}.` : '';

  if (requestedMode === 'standard') {
    return Object.freeze({
      requestedMode,
      selectedMode: requestedMode,
      effectiveMode: 'standard',
      status: 'active',
      state: 'ACTIVE',
      stateClass: 'active',
      backend: 'Chromium renderer (normal page rendering; no upscaler)',
      upscalerActive: false,
      processingFrames: false,
      processedFrames: 0,
      message: STANDARD_FALLBACK,
    });
  }

  if (requestedMode === 'wasm') {
    const failed = wasm.failed || wasmResult?.passed === false;
    const ready = wasm.compatible && wasm.initialized && !failed;
    const state = failed ? 'FAILED' : ready ? 'INITIALIZED' : wasm.detected ? 'DETECTED' : 'UNSUPPORTED';
    return Object.freeze({
      requestedMode,
      selectedMode: requestedMode,
      effectiveMode: 'standard',
      status: stateClass(state),
      state,
      stateClass: stateClass(state),
      backend: 'Chromium V8 WebAssembly capability only; page renderer is still Chromium',
      upscalerActive: false,
      processingFrames: false,
      processedFrames: 0,
      message: failed
        ? `The WebAssembly test failed: ${wasm.error || wasmResult?.error || 'unknown error'}. ${STANDARD_FALLBACK}`
        : ready
          ? 'WebAssembly compiled and executed successfully. WASM is not an image upscaler; website frames remain on standard Chromium.'
          : 'WebAssembly capability is not yet verified in this renderer. Website frames remain on standard Chromium.',
    });
  }

  if (requestedMode === 'dlss' || requestedMode === 'fsr') {
    const selectedFeature = feature || createUnavailableUpscaler(requestedMode, false);
    if (selectedFeature.failed) {
      return Object.freeze({
        requestedMode,
        selectedMode: requestedMode,
        effectiveMode: 'standard',
        status: 'failed',
        state: 'FAILED',
        stateClass: 'failed',
        backend: wasm.compatible && wasm.initialized
          ? 'WASM diagnostic is available separately; Chromium still renders the page'
          : 'Chromium renderer fallback; no upscaler',
        upscalerActive: false,
        processingFrames: false,
        processedFrames: selectedFeature.processedFrames || 0,
        message: `${requestedMode.toUpperCase()}${selectedFeature.failureStage ? ` failed during ${selectedFeature.failureStage}` : ' initialization/processing failed'}: ${selectedFeature.error || selectedFeature.reason}. Falling back safely; ${STANDARD_FALLBACK}`,
      });
    }
    // A manually selected, initialized integration can be active in its
    // explicitly bounded scene even when it is intentionally excluded from
    // automatic selection for ordinary browser tabs.
    if (!isInitializedCompatible(selectedFeature)) {
      const state = selectedFeature.state || 'UNSUPPORTED';
      return Object.freeze({
        requestedMode,
        selectedMode: requestedMode,
        effectiveMode: 'standard',
        status: stateClass(state),
        state,
        stateClass: stateClass(state),
        backend: wasm.compatible && wasm.initialized
          ? 'WASM runtime selected as non-upscaling status; standard Chromium page rendering'
          : 'Chromium renderer fallback; no upscaler',
        upscalerActive: false,
        processingFrames: false,
        processedFrames: selectedFeature.processedFrames || 0,
        message: `${selectedFeature.reason || `${requestedMode.toUpperCase()} has no usable native integration.`}${gpuSuffix} ${STANDARD_FALLBACK} WASM remains an independent runtime, not an upscaler.`,
      });
    }
    const state = selectedFeature.state || (selectedFeature.processingFrames ? 'PROCESSING FRAMES' : selectedFeature.active ? 'ACTIVE' : 'INITIALIZED');
    const scopeMessage = selectedFeature.scope ? ` Scope: ${selectedFeature.scope}` : '';
    return Object.freeze({
      requestedMode,
      selectedMode: requestedMode,
      effectiveMode: requestedMode,
      status: stateClass(state),
      state,
      stateClass: stateClass(state),
      backend: selectedFeature.backend,
      upscalerActive: selectedFeature.active === true,
      processingFrames: selectedFeature.processingFrames === true,
      processedFrames: selectedFeature.processedFrames || 0,
      message: selectedFeature.processingFrames
        ? `${requestedMode.toUpperCase()} reports ${selectedFeature.processedFrames.toLocaleString()} processed frame(s).${scopeMessage}`
        : `${requestedMode.toUpperCase()} is initialized, but no processed frame has been confirmed yet.${scopeMessage}`,
    });
  }

  const readyUpscaler = ['dlss', 'fsr'].some((id) => isUsable(technologies[id]));
  const wasmPassed = wasmResult?.passed === true;
  return Object.freeze({
    requestedMode,
    selectedMode: requestedMode,
    effectiveMode: 'standard',
    status: readyUpscaler ? 'initialized' : wasmPassed ? 'partial' : 'unsupported',
    state: readyUpscaler ? 'INITIALIZED' : wasmPassed ? 'COMPATIBLE' : 'UNSUPPORTED',
    stateClass: readyUpscaler ? 'initialized' : wasmPassed ? 'compatible' : 'unsupported',
    backend: readyUpscaler ? 'A compatible upscaler is available, but Chromium page interop is not proven.' : 'WASM diagnostic plus standard Chromium fallback',
    upscalerActive: false,
    processingFrames: false,
    processedFrames: 0,
    message: readyUpscaler
      ? 'A native upscaler runtime is available, but this browser has no verified page-frame bridge; no webpage upscaling is claimed.'
      : wasmPassed
        ? 'The isolated WASM test passed. WASM is not an image upscaler; standard Chromium renders the page and no upscaler is active.'
        : `No upscaler is available. ${STANDARD_FALLBACK}`,
  });
}
