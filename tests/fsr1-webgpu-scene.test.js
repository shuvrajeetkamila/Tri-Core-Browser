import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../app/diagnostics/fsr1-webgpu.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app/diagnostics/fsr1-webgpu.css', import.meta.url), 'utf8');
const scene = fs.readFileSync(new URL('../app/diagnostics/fsr1-webgpu.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('bundled WebGPU FSR1 scene is a restrictive local-only page', () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /style-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /id="game-canvas"/);
  assert.match(html, /fsr1-webgpu\.js/);
  assert.match(html, /No readback feeds processing/);
  assert.match(html, /diagnostic copies are post-processing only/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(css, /canvas \{ display: block; width: 100%; height: 100%;/);
});

test('WebGPU adapter discovery safely retries preferences and an explicit software fallback without downgrading feature gates', () => {
  const attempts = ['high-performance', 'low-power', 'default', 'force-fallback'].map((path) => scene.indexOf(`path: '${path}'`));
  assert.ok(attempts.every((index) => index >= 0));
  assert.deepEqual(attempts, [...attempts].sort((a, b) => a - b), 'adapter requests keep deterministic hardware-preference order before the explicit fallback');
  assert.match(scene, /forceFallbackAdapter: true/);
  assert.match(scene, /adapterRequestResults\.push\(\{ path: attempt\.path, status: adapter \? 'selected' : 'unavailable' \}\)/);
  assert.match(scene, /adapterRequestPath,/);
  assert.match(scene, /adapterRequestResults,/);
  assert.match(main, /adapterRequestPath: clampText\(fsrWebGpuScene\?\.adapterRequestPath \|\| '', 40\)/);
  assert.match(main, /adapterRequestPath: webGpuSnapshot\.adapterRequestPath/);
  assert.match(scene, /allRequestsRejected \? 'adapter-failed' : 'unsupported'/);
  assert.match(scene, /if \(!adapter\) \{[\s\S]*?renderFailure\([\s\S]*stage: 'adapter-discovery'/);
  assert.match(scene, /shaderCompilationStatus = 'passed'/, 'successful adapter discovery still must pass shader compilation');
  assert.match(scene, /pipelineCreationStatus = 'passed'/, 'successful adapter discovery still must create real pipelines');
  assert.match(scene, /framesSubmitted \+= 1[\s\S]*?framesCompleted \+= 1/, 'successful adapter discovery still must dispatch and complete real GPU work');
});

test('FSR1 scene consumes an app-owned WebGPU texture and presents RCAS output through its visible canvas', () => {
  assert.match(scene, /navigator\.gpu\.requestAdapter/);
  assert.match(scene, /adapter\.requestDevice\(\)/);
  assert.match(scene, /createTexture\(/);
  assert.match(scene, /controlled WebGPU game render target/);
  assert.match(scene, /AMD FidelityFX FSR1 EASU/);
  assert.match(scene, /AMD FidelityFX FSR1 RCAS/);
  assert.match(scene, /FSR1 output texture for visible canvas presentation/);
  assert.match(scene, /context\.getCurrentTexture\(\)\.createView\(\)/);
  assert.match(scene, /device\.queue\.submit\(/);
  assert.match(scene, /device\.queue\.onSubmittedWorkDone\(\)/);
  assert.match(scene, /FSR1 EASU compute pipeline', \(\) => device\.createComputePipeline\(/);
  assert.match(scene, /FSR1 RCAS compute pipeline', \(\) => device\.createComputePipeline\(/);
  assert.match(scene, /shaderCompilationStatus = 'passed'/);
  assert.match(scene, /pipelineCreationStatus = 'passed'/);
  assert.match(scene, /resourceInitializationStatus = 'passed'/);
  assert.match(scene, /adapterDetected,/);
  const frameLoop = scene.slice(scene.indexOf('async function drawFrame'), scene.indexOf('function getSnapshot'));
  assert.match(frameLoop, /device\.pushErrorScope\('validation'\)/);
  assert.match(frameLoop, /device\.queue\.submit\([\s\S]*?await device\.popErrorScope\(\)[\s\S]*?framesSubmitted \+= 1[\s\S]*?await device\.queue\.onSubmittedWorkDone\(\)[\s\S]*?framesCompleted \+= 1/, 'only validation-clean submissions and completed queue work may increment frame counters');
  assert.equal((scene.match(/easuTap\(color,/g) || []).length, 12, 'EASU pass must use its 12 reconstruction taps');
  assert.match(scene, /let averagedLength = direction\.length \* 0\.5;\s*let accumulatedLength = averagedLength \* averagedLength;/, 'EASU edge strength must use AMD FSR1 length averaging and squaring');
  assert.match(scene, /textureLoad\(sourceTexture/);
  assert.match(scene, /textureLoad\(reconstructedTexture/);
  assert.match(scene, /pixelReadbackForProcessing: false/);
  assert.match(scene, /timestampReadbackForMetrics: timestampQuerySupported/);
  assert.match(scene, /automaticEligible: false/);
  assert.match(scene, /framesSubmitted,/);
  assert.match(scene, /framesCompleted,/);
  assert.match(scene, /queue\.onSubmittedWorkDone resolves; not a GPU timestamp/);
});

test('live WebGPU FSR1 image-processing frame loop does not use screenshot or pixel-readback APIs', () => {
  const frameLoop = scene.slice(scene.indexOf('async function drawFrame'), scene.indexOf('function compactReadbackRows'));
  assert.doesNotMatch(frameLoop, /\.capturePage\s*\(/);
  assert.doesNotMatch(frameLoop, /\.toPNG\s*\(/);
  assert.doesNotMatch(frameLoop, /\.readPixels\s*\(/);
  assert.doesNotMatch(frameLoop, /\.getImageData\s*\(/);
  assert.doesNotMatch(frameLoop, /\.copyExternalImageToTexture\s*\(/);
  assert.doesNotMatch(frameLoop, /\.copyTextureToBuffer\s*\(/);
  assert.doesNotMatch(frameLoop, /\.mapAsync\s*\(/, 'only optional timing and explicit post-processing diagnostics may map readback buffers');
  assert.match(frameLoop, /collectGpuTimestamps\(timestampSlot\)/, 'optional GPU timestamp readback is separate from image-pixel processing');
  assert.match(scene, /no CPU readback/);
});

test('post-processing diagnostic readback is frozen, stage-labeled, and separate from the live processing path', () => {
  assert.match(scene, /COPY_SRC/);
  assert.match(scene, /async function freezeAtCompletedFrame\(\)/);
  assert.match(scene, /async function validateLatestOutput\(/);
  assert.match(scene, /evidenceFrozen \|\| lifecycle !== 'presented'/);
  assert.match(scene, /Post-processing diagnostic copy validation failed/);
  assert.match(scene, /readbackForProcessing: false/);
  assert.match(scene, /pixels never enter EASU, RCAS, or presentation/);
  assert.match(scene, /visibleOutputVerified/);
  assert.match(main, /compareVisibleCanvasSamples\(/);
  assert.match(main, /markVisibleOutputVerified\(\)/);
  assert.match(main, /stageComparison: stageAnalysis/);
  assert.match(main, /visibleCanvas: visibleCanvasComparison/);
  assert.match(main, /collectSmokeArtifactInventory\(smokeOut\)/);
  assert.match(main, /packaged-smoke-failure-summary\.json/);
  assert.match(main, /failedStage: smokeStage/);
});

test('WGSL port retains AMD attribution and scoped status reporting', () => {
  assert.match(scene, /Copyright \(c\) 2021 Advanced Micro Devices, Inc\./);
  assert.match(scene, /Permission is hereby granted, free of charge/);
  assert.match(scene, /a21ffb8f6c13233ba336352bdff293894c706575/);
  assert.match(scene, /Object\.defineProperty\(window, 'triCoreFsrWebGpuTest'/);
  assert.match(scene, /Bundled local WebGPU game integration scene only/);
  assert.match(scene, /softwareAdapter,/);
  assert.match(scene, /timingDefinition:/);
});

test('Electron opens and queries the exact bundled WebGPU scene through narrow sender-validated IPC', () => {
  assert.match(main, /FSR_WEBGPU_TEST_SCENE_PATH = path\.join\(__dirname, '\.\.', 'app', 'diagnostics', 'fsr1-webgpu\.html'\)/);
  assert.match(main, /function isBundledFsrWebGpuTestSceneUrl\(value\)[\s\S]*?isFileUrlForPath\(String\(value \|\| ''\), FSR_WEBGPU_TEST_SCENE_PATH\)/);
  assert.match(main, /tab\.isFsrWebGpuTestScene[\s\S]*?isBundledFsrWebGpuTestSceneUrl\(tab\.view\.webContents\.getURL\(\)\)/);
  assert.match(main, /ipcMain\.handle\('browser:fsr-open-webgpu-test-scene',[\s\S]*?if \(!isUiSender\(event\)\)/);
  assert.match(main, /ipcMain\.handle\('browser:fsr-webgpu-test-status',[\s\S]*?if \(!isUiSender\(event\)\)/);
  assert.match(main, /new WebContentsView\(\{\s*webPreferences:\s*\{[\s\S]*?contextIsolation: true,[\s\S]*?nodeIntegration: false,[\s\S]*?sandbox: true,[\s\S]*?webSecurity: true,/);
  assert.doesNotMatch(main, /--no-sandbox|disable-web-security|ignore-certificate-errors/);
  assert.match(main, /executeJavaScript\('window\.triCoreFsrWebGpuTest && window\.triCoreFsrWebGpuTest\.getSnapshot\(\)'\)/);
  assert.match(preload, /openFsrWebGpuTestScene: \(slot\) => ipcRenderer\.invoke\('browser:fsr-open-webgpu-test-scene'/);
  assert.match(preload, /getFsrWebGpuTestStatus: \(\) => ipcRenderer\.invoke\('browser:fsr-webgpu-test-status'\)/);
  assert.ok(packageJson.build.files.includes('app/diagnostics/**/*'), 'electron-builder must package the local scene and shader source');
});
