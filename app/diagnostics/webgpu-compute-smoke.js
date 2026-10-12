(() => {
  'use strict';

  const EXPECTED = 42;
  const ATTEMPTS = [
    { path: 'high-performance', options: { powerPreference: 'high-performance' } },
    { path: 'low-power', options: { powerPreference: 'low-power' } },
    { path: 'default', options: {} },
    { path: 'force-fallback', options: { forceFallbackAdapter: true } },
  ];
  const report = {
    schemaVersion: 1,
    test: 'independent-webgpu-known-answer-compute',
    status: 'RUNNING',
    state: 'initializing',
    failureStage: '',
    secureContext: globalThis.isSecureContext === true,
    apiDetected: false,
    adapterRequestPath: '',
    adapterRequestResults: [],
    adapterInfo: null,
    deviceRequested: false,
    shaderCompilationStatus: 'NOT RUN',
    pipelineCreationStatus: 'NOT RUN',
    resourceInitializationStatus: 'NOT RUN',
    dispatches: 0,
    queueCompleted: false,
    expectedResult: EXPECTED,
    readbackResult: null,
    readbackVerified: false,
    elapsedMs: null,
    error: '',
    physicalGpuValidation: 'NOT RUN',
  };

  function cloneReport() {
    return JSON.parse(JSON.stringify(report));
  }

  function setFailure(state, stage, error) {
    report.status = state === 'unsupported' ? 'UNSUPPORTED' : 'FAIL';
    report.state = state;
    report.failureStage = stage;
    report.error = String(error || 'WebGPU known-answer compute probe failed.').slice(0, 1000);
    document.documentElement.dataset.webgpuProbeState = state;
    const status = document.getElementById('probe-status');
    if (status) status.textContent = report.status;
  }

  function adapterInfo(adapter) {
    const info = adapter?.info || {};
    const clean = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160);
    const fallback = typeof adapter?.isFallbackAdapter === 'boolean'
      ? adapter.isFallbackAdapter
      : typeof info.isFallbackAdapter === 'boolean' ? info.isFallbackAdapter : null;
    const details = {
      vendor: clean(info.vendor),
      architecture: clean(info.architecture),
      device: clean(info.device),
      description: clean(info.description),
      isFallbackAdapter: fallback,
    };
    const identity = `${details.vendor} ${details.architecture} ${details.device} ${details.description}`;
    const softwareAdapter = fallback === true || /\bwarp\b|swiftshader|software raster|basic render|llvmpipe/i.test(identity)
      ? true
      : fallback === false || /nvidia|geforce|quadro|amd|radeon|intel|arc/i.test(identity) ? false : null;
    return {
      ...details,
      exposed: Boolean(details.vendor || details.architecture || details.device || details.description || fallback !== null),
      softwareAdapter,
    };
  }

  async function run() {
    const startedAt = performance.now();
    let currentStage = 'webgpu-api-detection';
    let device = null;
    let resultBuffer = null;
    let readbackBuffer = null;
    try {
      report.apiDetected = Boolean(navigator.gpu && typeof navigator.gpu.requestAdapter === 'function');
      if (!report.apiDetected) {
        setFailure('unsupported', 'webgpu-api-detection', 'navigator.gpu.requestAdapter is not exposed by this Electron/Chromium renderer.');
        return;
      }

      report.state = 'adapter-discovery';
      currentStage = 'adapter-discovery';
      let adapter = null;
      for (const attempt of ATTEMPTS) {
        try {
          adapter = await navigator.gpu.requestAdapter(attempt.options);
          report.adapterRequestResults.push({ path: attempt.path, status: adapter ? 'selected' : 'unavailable' });
          if (adapter) {
            report.adapterRequestPath = attempt.path;
            report.adapterInfo = adapterInfo(adapter);
            break;
          }
        } catch (error) {
          report.adapterRequestResults.push({
            path: attempt.path,
            status: 'rejected',
            error: String(error?.message || error || 'adapter request rejected').slice(0, 300),
          });
        }
      }

      if (!adapter) {
        const rejected = report.adapterRequestResults.length > 0
          && report.adapterRequestResults.every((result) => result.status === 'rejected');
        const summary = report.adapterRequestResults
          .map((result) => `${result.path}: ${result.status}${result.error ? ` (${result.error})` : ''}`)
          .join('; ');
        setFailure(
          rejected ? 'adapter-failed' : 'unsupported',
          'adapter-discovery',
          `Independent WebGPU probe received no adapter. ${summary}`,
        );
        return;
      }

      report.state = 'device-request';
      currentStage = 'device-request';
      try {
        device = await adapter.requestDevice();
        report.deviceRequested = true;
      } catch (error) {
        setFailure('failed', 'device-request', `WebGPU adapter was selected, but its device request failed: ${error?.message || String(error)}`);
        return;
      }

      currentStage = 'shader-compilation';
      const shader = device.createShaderModule({
        label: 'independent WebGPU known-answer compute shader',
        code: `
@group(0) @binding(0) var<storage, read_write> answerBuffer: array<u32>;

@compute @workgroup_size(1)
fn main() {
  answerBuffer[0] = 19u + 23u;
}
`,
      });
      const compilation = await shader.getCompilationInfo();
      const compilationErrors = compilation.messages
        .filter((message) => message.type === 'error')
        .map((message) => String(message.message || '').slice(0, 300));
      if (compilationErrors.length) throw new Error(compilationErrors.join('; '));
      report.shaderCompilationStatus = 'passed';

      currentStage = 'pipeline-creation';
      const pipeline = await device.createComputePipelineAsync({
        label: 'independent WebGPU known-answer compute pipeline',
        layout: 'auto',
        compute: { module: shader, entryPoint: 'main' },
      });
      report.pipelineCreationStatus = 'passed';

      currentStage = 'resource-initialization';
      resultBuffer = device.createBuffer({
        label: 'known-answer storage result',
        size: Uint32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      readbackBuffer = device.createBuffer({
        label: 'known-answer verification readback',
        size: Uint32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        label: 'known-answer compute bindings',
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: resultBuffer } }],
      });
      report.resourceInitializationStatus = 'passed';

      currentStage = 'compute-dispatch';
      const encoder = device.createCommandEncoder({ label: 'known-answer compute command encoder' });
      const pass = encoder.beginComputePass({ label: 'known-answer compute pass' });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(1);
      pass.end();
      encoder.copyBufferToBuffer(resultBuffer, 0, readbackBuffer, 0, Uint32Array.BYTES_PER_ELEMENT);
      device.queue.submit([encoder.finish()]);
      report.dispatches = 1;
      currentStage = 'queue-completion';
      await device.queue.onSubmittedWorkDone();
      report.queueCompleted = true;
      currentStage = 'readback-verification';
      await readbackBuffer.mapAsync(GPUMapMode.READ);
      report.readbackResult = new Uint32Array(readbackBuffer.getMappedRange())[0];
      readbackBuffer.unmap();
      report.readbackVerified = report.readbackResult === EXPECTED;
      if (!report.readbackVerified) {
        throw new Error(`Compute readback returned ${report.readbackResult}; expected ${EXPECTED}.`);
      }

      report.status = 'PASS';
      report.state = 'output-verified';
      report.failureStage = '';
      report.error = '';
      report.elapsedMs = Math.max(0, performance.now() - startedAt);
      document.documentElement.dataset.webgpuProbeState = report.state;
      const status = document.getElementById('probe-status');
      if (status) status.textContent = report.status;
    } catch (error) {
      setFailure('failed', currentStage, error?.message || String(error));
    } finally {
      report.elapsedMs = Number.isFinite(report.elapsedMs)
        ? report.elapsedMs
        : Math.max(0, performance.now() - startedAt);
      try { readbackBuffer?.destroy(); } catch { /* Best-effort cleanup after validation. */ }
      try { resultBuffer?.destroy(); } catch { /* Best-effort cleanup after validation. */ }
      try { device?.destroy(); } catch { /* Best-effort cleanup after validation. */ }
      const status = document.getElementById('probe-status');
      if (status) status.textContent = report.status;
    }
  }

  window.triCoreWebGpuComputeSmoke = Object.freeze({ getSnapshot: cloneReport });
  void run();
})();
