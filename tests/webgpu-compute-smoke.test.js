import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../app/diagnostics/webgpu-compute-smoke.html', import.meta.url), 'utf8');
const probe = fs.readFileSync(new URL('../app/diagnostics/webgpu-compute-smoke.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const packageScript = fs.readFileSync(new URL('../scripts/package-windows.ps1', import.meta.url), 'utf8');

async function runProbeInMockedRenderer({ requestAdapter, readbackValue = 42 } = {}) {
  const answerBytes = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
  new Uint32Array(answerBytes)[0] = readbackValue;
  let dispatches = 0;
  const mockDevice = {
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createComputePipelineAsync: async () => ({ getBindGroupLayout: () => ({}) }),
    createBuffer: ({ label }) => ({
      label,
      mapAsync: async () => {},
      getMappedRange: () => answerBytes,
      unmap: () => {},
      destroy: () => {},
    }),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginComputePass: () => ({
        setPipeline: () => {},
        setBindGroup: () => {},
        dispatchWorkgroups: (count) => { dispatches += count; },
        end: () => {},
      }),
      copyBufferToBuffer: () => {},
      finish: () => ({}),
    }),
    queue: { submit: () => {}, onSubmittedWorkDone: async () => {} },
    destroy: () => {},
  };
  const adapter = {
    info: { vendor: 'Mock GPU', architecture: 'test', device: 'mock-0', description: 'Unit-test-only adapter' },
    requestDevice: async () => mockDevice,
  };
  const gpu = { requestAdapter: requestAdapter || (async () => adapter) };
  const status = { textContent: '' };
  const sandbox = {
    isSecureContext: true,
    navigator: { gpu },
    window: {},
    document: { documentElement: { dataset: {} }, getElementById: () => status },
    GPUBufferUsage: { STORAGE: 1, COPY_SRC: 2, MAP_READ: 4, COPY_DST: 8 },
    GPUMapMode: { READ: 1 },
    performance: { now: (() => { let time = 0; return () => ++time; })() },
  };
  vm.runInNewContext(probe, vm.createContext(sandbox));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const snapshot = sandbox.window.triCoreWebGpuComputeSmoke.getSnapshot();
    if (snapshot.status !== 'RUNNING') return snapshot;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return sandbox.window.triCoreWebGpuComputeSmoke.getSnapshot();
}

for (const workflowName of ['build.yml', 'release.yml']) {
  const workflow = fs.readFileSync(new URL(`../.github/workflows/${workflowName}`, import.meta.url), 'utf8');
  test(`${workflowName} invokes shared packaged WebGPU acceptance validation with an explicit policy`, () => {
    assert.match(workflow, /validate-packaged-smoke\.cjs/);
    assert.match(workflow, /--policy (optional|required)/);
    assert.match(workflow, /webgpu-compute-smoke-summary\.json/);
    assert.match(workflow, /packaged-smoke-summary\.json/);
  });
}

test('independent compute page is local-only and retains renderer security', () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /webgpu-compute-smoke\.js/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(probe, /fetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//);
});

test('minimal probe executes real WebGPU compute and verifies readback of 19 + 23 = 42', () => {
  assert.match(probe, /navigator\.gpu\.requestAdapter\(attempt\.options\)/);
  assert.match(probe, /adapter\.requestDevice\(\)/);
  assert.match(probe, /answerBuffer\[0\] = 19u \+ 23u/);
  assert.match(probe, /getCompilationInfo\(\)/);
  assert.match(probe, /createComputePipelineAsync\(/);
  assert.match(probe, /createCommandEncoder\(/);
  assert.match(probe, /dispatchWorkgroups\(1\)/);
  assert.match(probe, /copyBufferToBuffer\(/);
  assert.match(probe, /mapAsync\(GPUMapMode\.READ\)/);
  assert.match(probe, /report\.readbackResult === EXPECTED/);
  assert.match(probe, /physicalGpuValidation: 'NOT RUN'/);
  assert.match(probe, /forceFallbackAdapter: true/);
  assert.doesNotMatch(probe, /enable-unsafe-webgpu|disable-gpu-sandbox|disable-dawn-features/);
});

test('mocked WebGPU API exercises safe retries and verifies known-answer compute/readback state transitions', async () => {
  const requests = [];
  let dispatchedWorkgroups = 0;
  const adapter = {
    info: { vendor: 'Mock GPU', architecture: 'test', device: 'mock-0', description: 'Unit-test-only adapter' },
    requestDevice: async () => ({
      createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
      createComputePipelineAsync: async () => ({ getBindGroupLayout: () => ({}) }),
      createBuffer: ({ label }) => ({
        label,
        mapAsync: async () => {},
        getMappedRange: () => {
          const answer = new ArrayBuffer(4);
          new Uint32Array(answer)[0] = 42;
          return answer;
        },
        unmap: () => {},
        destroy: () => {},
      }),
      createBindGroup: () => ({}),
      createCommandEncoder: () => ({
        beginComputePass: () => ({ setPipeline: () => {}, setBindGroup: () => {}, dispatchWorkgroups: (count) => { dispatchedWorkgroups += count; }, end: () => {} }),
        copyBufferToBuffer: () => {},
        finish: () => ({}),
      }),
      queue: { submit: () => {}, onSubmittedWorkDone: async () => {} },
      destroy: () => {},
    }),
  };
  const report = await runProbeInMockedRenderer({
    requestAdapter: async (options) => {
      requests.push(options);
      return requests.length === 1 ? null : adapter;
    },
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.state, 'output-verified');
  assert.equal(report.adapterRequestPath, 'low-power');
  assert.equal(report.expectedResult, 42);
  assert.equal(report.readbackResult, 42);
  assert.equal(report.readbackVerified, true);
  assert.equal(report.dispatches, 1);
  assert.equal(dispatchedWorkgroups, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].powerPreference, 'high-performance');
  assert.equal(requests[1].powerPreference, 'low-power');
});

test('mocked null adapters are reported as unsupported instead of pretending the compute probe ran', async () => {
  const report = await runProbeInMockedRenderer({ requestAdapter: async () => null });
  assert.equal(report.status, 'UNSUPPORTED');
  assert.equal(report.state, 'unsupported');
  assert.equal(report.failureStage, 'adapter-discovery');
  assert.equal(report.deviceRequested, false);
  assert.equal(report.shaderCompilationStatus, 'NOT RUN');
  assert.equal(report.dispatches, 0);
  assert.equal(report.readbackVerified, false);
  assert.equal(report.adapterRequestResults.length, 4);
});

test('mocked wrong compute output fails readback verification', async () => {
  const report = await runProbeInMockedRenderer({ readbackValue: 41 });
  assert.equal(report.status, 'FAIL');
  assert.equal(report.state, 'failed');
  assert.equal(report.failureStage, 'readback-verification');
  assert.equal(report.readbackResult, 41);
  assert.equal(report.readbackVerified, false);
});

test('packaged smoke runs the independent probe in a hidden sandboxed BrowserWindow and saves structured diagnostics', () => {
  assert.match(main, /WEBGPU_COMPUTE_SMOKE_PATH = path\.join\(__dirname, '\.\.', 'app', 'diagnostics', 'webgpu-compute-smoke\.html'\)/);
  assert.match(main, /new BrowserWindow\(\{[\s\S]*?show: false,[\s\S]*?contextIsolation: true,[\s\S]*?nodeIntegration: false,[\s\S]*?sandbox: true,[\s\S]*?webSecurity: true/);
  assert.match(main, /runIndependentWebGpuComputeSmoke\(initialGraphicsDiagnostics\)/);
  assert.match(main, /webgpu-compute-smoke-summary\.json/);
  assert.match(main, /webgpu-independent-compute-known-answer/);
  assert.match(main, /app\.commandLine\.hasSwitch\(name\)/);
  assert.match(main, /'ignore-gpu-blocklist'/);
  assert.match(main, /'disable-gpu-driver-bug-workarounds'/);
  assert.match(main, /Only allowlisted graphics switches are recorded/);
  assert.match(main, /independentComputeProbePassed/);
  assert.match(main, /if \(!independentComputeProbePassed\)/);
  assert.doesNotMatch(main, /--enable-unsafe-webgpu|--disable-gpu-sandbox|--disable-dawn-features=adapter_blocklist|disable-web-security|ignore-certificate-errors/);
});

test('portable-package script refuses to package without known-answer compute and safe-launch evidence', () => {
  assert.match(packageScript, /webgpu-compute-smoke-summary\.json/);
  assert.match(packageScript, /\$webGpuComputeSummary\.readbackResult -ne 42/);
  assert.match(packageScript, /\$webGpuComputeSummary\.readbackVerified -ne \$true/);
  assert.match(packageScript, /adapter_blocklist/);
  assert.match(packageScript, /ignore-gpu-blocklist/);
  assert.match(packageScript, /disable-gpu-driver-bug-workarounds/);
  assert.match(packageScript, /webGpuComputeSummary\.physicalGpuValidation -ne 'NOT RUN'/);
});
