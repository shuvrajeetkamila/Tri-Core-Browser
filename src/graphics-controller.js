export const GRAPHICS_MODES = Object.freeze([
  Object.freeze({ id: 'wasm', label: 'WASM MODE', backend: 'Chromium V8 WebAssembly' }),
  Object.freeze({ id: 'dlss', label: 'NVIDIA DLSS MODE', backend: 'NVIDIA Streamline / DLSS' }),
  Object.freeze({ id: 'fsr', label: 'AMD FSR MODE', backend: 'AMD FidelityFX Super Resolution' }),
  Object.freeze({ id: 'hybrid', label: 'HYBRID MODE', backend: 'WASM diagnostic + compatible upscaler' }),
  Object.freeze({ id: 'standard', label: 'STANDARD MODE', backend: 'Chromium renderer' }),
]);

const UNSUPPORTED_RENDER_PATH = 'The packaged Electron/Chromium build does not expose per-frame webpage color, depth, motion vectors, or a native swap-chain to an upscaler. No Streamline/DLSS or FidelityFX/FSR render integration is shipped.';

/**
 * Resolve the requested UI mode to a truthful execution state. A detected GPU
 * never counts as an upscaler integration; only a completed WASM test can mark
 * the controlled WebAssembly path ready.
 */
export function resolveGraphicsMode(mode, { wasmResult = null, gpu = null } = {}) {
  const requestedMode = GRAPHICS_MODES.some((item) => item.id === mode) ? mode : 'standard';
  const gpuName = String(gpu?.name || '').trim();
  const gpuHint = gpuName ? ` Detected graphics device: ${gpuName}.` : '';

  if (requestedMode === 'standard') {
    return Object.freeze({
      requestedMode,
      effectiveMode: 'standard',
      status: 'active',
      backend: 'Chromium renderer (Chromium selects hardware or software compositing)',
      upscaler: null,
      message: 'Standard Chromium rendering is active. No upscaler is being applied.',
    });
  }

  if (requestedMode === 'wasm') {
    if (!wasmResult?.passed) {
      return Object.freeze({
        requestedMode,
        effectiveMode: 'standard',
        status: 'blocked',
        backend: 'Chromium renderer',
        upscaler: null,
        message: 'The controlled WASM diagnostic has not passed. Standard Chromium rendering remains active.',
      });
    }
    return Object.freeze({
      requestedMode,
      effectiveMode: 'standard',
      status: 'active',
      backend: 'Chromium V8 WebAssembly (controlled benchmark)',
      upscaler: null,
      message: `WASM test passed (${wasmResult.iterations.toLocaleString()} calls, ${wasmResult.elapsedMs.toFixed(2)} ms). Websites still render through standard Chromium; this test does not promise a frame-rate increase.`,
    });
  }

  if (requestedMode === 'dlss') {
    return Object.freeze({
      requestedMode,
      effectiveMode: 'standard',
      status: 'blocked',
      backend: 'Chromium renderer fallback',
      upscaler: null,
      message: `DLSS is not integrated and cannot be activated.${gpuHint} A GPU name or installed NVIDIA driver is not evidence that DLSS is running. ${UNSUPPORTED_RENDER_PATH}`,
    });
  }

  if (requestedMode === 'fsr') {
    return Object.freeze({
      requestedMode,
      effectiveMode: 'standard',
      status: 'blocked',
      backend: 'Chromium renderer fallback',
      upscaler: null,
      message: `FSR is not integrated and cannot be activated.${gpuHint} No AMD FidelityFX upscaler or native webpage render bridge is included. ${UNSUPPORTED_RENDER_PATH}`,
    });
  }

  const wasmPassed = Boolean(wasmResult?.passed);
  return Object.freeze({
    requestedMode,
    effectiveMode: 'standard',
    status: wasmPassed ? 'partial' : 'blocked',
    backend: 'Chromium renderer fallback',
    upscaler: null,
    wasmDiagnosticPassed: wasmPassed,
    message: wasmPassed
      ? `Hybrid controller ran the isolated WASM diagnostic successfully, then safely retained standard Chromium rendering. DLSS/FSR are not integrated, so no upscaler is active.${gpuHint}`
      : `Hybrid mode cannot enable an upscaler. Run the controlled WASM diagnostic first; standard Chromium rendering remains active.${gpuHint} ${UNSUPPORTED_RENDER_PATH}`,
  });
}
