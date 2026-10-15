/*
 * WGSL adaptation of AMD FidelityFX FSR 1.0.2 EASU and RCAS, derived from
 * GPUOpen-Effects/FidelityFX-FSR, pinned source commit
 * a21ffb8f6c13233ba336352bdff293894c706575. This bounded demonstration
 * runs inside its own WebGPU game render path; it does not intercept other
 * pages or copy browser compositor frames to the CPU. Its processing path
 * uses no CPU readback; post-run capturePage PNGs are evidence only.
 *
 * Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const statusLabel = document.getElementById('renderer-status');
  const frameLabel = document.getElementById('frame-count');
  const resolutionLabel = document.getElementById('resolution-label');
  const errorPanel = document.getElementById('scene-error');
  const statusDot = document.getElementById('status-dot');

  let lifecycle = 'initializing';
  let disposed = false;
  let failure = '';
  let adapterDetected = false;
  let adapterDetails = null;
  let softwareAdapter = null;
  let adapterRequestPath = '';
  let adapterRequestResults = [];
  let device = null;
  let context = null;
  let canvasFormat = '';
  let gamePipeline = null;
  let easuPipeline = null;
  let rcasPipeline = null;
  let presentationPipeline = null;
  let gameUniformBuffer = null;
  let easuUniformBuffer = null;
  let rcasUniformBuffer = null;
  let gameBindGroup = null;
  let easuBindGroup = null;
  let rcasBindGroup = null;
  let presentationBindGroup = null;
  let inputTexture = null;
  let easuTexture = null;
  let processedTexture = null;
  let renderWidth = 0;
  let renderHeight = 0;
  let outputWidth = 0;
  let outputHeight = 0;
  let framesSubmitted = 0;
  let framesCompleted = 0;
  let lastCompletedAt = 0;
  let lastQueueCompletionWallMs = null;
  let totalQueueCompletionWallMs = 0;
  let maxQueueCompletionWallMs = 0;
  let framePending = false;
  let animationHandle = 0;
  let pageStartTime = 0;
  let lastHudUpdate = 0;
  let failureStage = '';
  let shaderCompilationStatus = 'pending';
  let pipelineCreationStatus = 'pending';
  let resourceInitializationStatus = 'pending';
  let easuDispatches = 0;
  let rcasDispatches = 0;
  let easuDispatchAttempted = false;
  let rcasDispatchAttempted = false;
  let easuShaderCompilationStatus = 'NOT RUN';
  let rcasShaderCompilationStatus = 'NOT RUN';
  let easuPipelineCreationStatus = 'NOT RUN';
  let rcasPipelineCreationStatus = 'NOT RUN';
  let visibleOutputVerified = false;
  let evidenceFreezeRequested = false;
  let evidenceFrozen = false;
  let evidenceFreezeResolve = null;
  let timestampQuerySet = null;
  let timestampSlots = [];
  let timestampQuerySupported = false;
  let timestampQueryError = '';
  let gpuTimestampSamples = 0;
  let lastEasuGpuTimeMs = null;
  let lastRcasGpuTimeMs = null;
  let timestampSlotCursor = 0;

  const MAX_DEVICE_PIXEL_RATIO = 2;
  const GAME_RENDER_SCALE = 0.5;
  const RCAS_SHARPNESS_STOPS = 0.2;

  const FULLSCREEN_VERTEX_WGSL = /* wgsl */ `
@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}
`;

  const GAME_FRAGMENT_WGSL = /* wgsl */ `
struct SceneUniforms { values: vec4<f32> };
@group(0) @binding(0) var<uniform> scene: SceneUniforms;

fn lineGrid(p: vec2<f32>, scale: f32, width: f32) -> f32 {
  let scaled = p * scale;
  let cell = abs(fract(scaled) - vec2<f32>(0.5, 0.5));
  let edge = max(fwidth(scaled) * width, vec2<f32>(0.0001, 0.0001));
  let horizontal = smoothstep(0.0, edge.x, cell.x);
  let vertical = smoothstep(0.0, edge.y, cell.y);
  return 1.0 - min(min(horizontal, vertical), 1.0);
}

fn hashCell(cell: vec2<f32>) -> f32 {
  return fract(sin(dot(cell, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

@fragment
fn fsMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let time = scene.values.x;
  let width = max(scene.values.y, 1.0);
  let height = max(scene.values.z, 1.0);
  let uv = position.xy / vec2<f32>(width, height);
  var p = (uv - vec2<f32>(0.5, 0.5)) * vec2<f32>(width / height, 1.0);

  let horizon = smoothstep(-0.45, 0.45, p.y + 0.12 * sin(p.x * 2.4 + time * 0.24));
  var color = mix(vec3<f32>(0.025, 0.052, 0.12), vec3<f32>(0.23, 0.12, 0.39), horizon);
  let grid = lineGrid(vec2<f32>(p.x + time * 0.035, p.y + time * 0.18), 22.0, 0.06);
  color += grid * vec3<f32>(0.03, 0.19, 0.25) * (0.3 + 0.7 * horizon);

  let cell = floor(uv * vec2<f32>(width, height) / 6.0);
  let star = step(0.993, hashCell(cell));
  let twinkle = 0.45 + 0.55 * sin(time * 3.0 + hashCell(cell) * 18.0);
  color += star * twinkle * vec3<f32>(0.55, 0.77, 1.0);

  let shipX = p.x - 0.28 * sin(time * 0.72);
  let shipY = p.y + 0.13 * cos(time * 0.59);
  let angle = 0.26 * sin(time * 0.52);
  let localX = shipX * cos(angle) - shipY * sin(angle);
  let localY = shipX * sin(angle) + shipY * cos(angle);
  let shipEdge = max(abs(localX) * 0.86 + localY * 0.58, -localY) - 0.035;
  let ship = 1.0 - smoothstep(0.0, 0.007, shipEdge);
  color = mix(color, vec3<f32>(0.82, 0.96, 1.0), ship);

  let engineX = p.x - 0.28 * sin(time * 0.72);
  let engineY = p.y + 0.13 * cos(time * 0.59) + 0.055;
  let engine = 1.0 - smoothstep(0.018, 0.055, length(vec2<f32>(engineX, engineY)));
  let pulse = 0.65 + 0.35 * sin(time * 17.0);
  color += engine * pulse * vec3<f32>(0.25, 0.78, 1.0);

  let vignette = 1.0 - 0.34 * smoothstep(0.42, 0.88, length(p));
  color *= vignette;
  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

  // AMD FSR1 EASU: four-tap direction estimation followed by a 12-tap
  // direction-aware reconstruction filter. The source is this page's actual
  // low-resolution WebGPU game color target, not an image read back to CPU.
  const EASU_COMPUTE_WGSL = /* wgsl */ `
struct EasuUniforms { sizes: vec4<f32> };
@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: EasuUniforms;
@group(0) @binding(2) var reconstructedOutput: texture_storage_2d<rgba8unorm, write>;

struct DirectionAccum { direction: vec2<f32>, length: f32 };
struct ColorAccum { color: vec3<f32>, weight: f32 };

fn loadSource(pixel: vec2<i32>) -> vec3<f32> {
  let sourceSize = vec2<i32>(i32(uniforms.sizes.x), i32(uniforms.sizes.y));
  let last = max(sourceSize - vec2<i32>(1, 1), vec2<i32>(0, 0));
  return textureLoad(sourceTexture, clamp(pixel, vec2<i32>(0, 0), last), 0).rgb;
}

fn lumaTimesTwo(color: vec3<f32>) -> f32 {
  return color.r * 0.5 + color.g + color.b * 0.5;
}

fn directionSet(
  initial: DirectionAccum,
  fraction: vec2<f32>,
  lA: f32,
  lB: f32,
  lC: f32,
  lD: f32,
  lE: f32,
  corner: u32
) -> DirectionAccum {
  var weight = 0.0;
  switch corner {
    case 0u: { weight = (1.0 - fraction.x) * (1.0 - fraction.y); }
    case 1u: { weight = fraction.x * (1.0 - fraction.y); }
    case 2u: { weight = (1.0 - fraction.x) * fraction.y; }
    case 3u: { weight = fraction.x * fraction.y; }
    default: { }
  }

  let dc = lD - lC;
  let cb = lC - lB;
  let reciprocalX = 1.0 / max(max(abs(dc), abs(cb)), 0.000001);
  let directionX = lD - lB;
  let lengthX = clamp(abs(directionX) * reciprocalX, 0.0, 1.0);

  let ec = lE - lC;
  let ca = lC - lA;
  let reciprocalY = 1.0 / max(max(abs(ec), abs(ca)), 0.000001);
  let directionY = lE - lA;
  let lengthY = clamp(abs(directionY) * reciprocalY, 0.0, 1.0);

  var result = initial;
  result.direction += vec2<f32>(directionX, directionY) * weight;
  result.length += (lengthX * lengthX + lengthY * lengthY) * weight;
  return result;
}

fn easuTap(
  initial: ColorAccum,
  offset: vec2<f32>,
  direction: vec2<f32>,
  lengthScale: vec2<f32>,
  lobe: f32,
  clip: f32,
  color: vec3<f32>
) -> ColorAccum {
  let rotated = vec2<f32>(
    offset.x * direction.x + offset.y * direction.y,
    offset.x * -direction.y + offset.y * direction.x
  ) * lengthScale;
  let distanceSquared = min(dot(rotated, rotated), clip);
  var sincWeight = 0.4 * distanceSquared - 1.0;
  var windowWeight = lobe * distanceSquared - 1.0;
  sincWeight *= sincWeight;
  windowWeight *= windowWeight;
  sincWeight = 1.5625 * sincWeight - 0.5625;
  let weight = sincWeight * windowWeight;
  return ColorAccum(initial.color + color * weight, initial.weight + weight);
}

@compute
@workgroup_size(8, 8, 1)
fn csMain(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let outputSizeU = vec2<u32>(u32(uniforms.sizes.z), u32(uniforms.sizes.w));
  if (invocation.x >= outputSizeU.x || invocation.y >= outputSizeU.y) { return; }
  let outputPixel = vec2<f32>(invocation.xy);
  let inputSize = uniforms.sizes.xy;
  let outputSize = max(uniforms.sizes.zw, vec2<f32>(1.0, 1.0));
  let scale = inputSize / outputSize;
  let sourcePosition = outputPixel * scale + (0.5 * scale - vec2<f32>(0.5, 0.5));
  let base = vec2<i32>(floor(sourcePosition));
  let fraction = sourcePosition - floor(sourcePosition);

  let b = loadSource(base + vec2<i32>(0, -1));
  let c = loadSource(base + vec2<i32>(1, -1));
  let i = loadSource(base + vec2<i32>(-1, 1));
  let j = loadSource(base + vec2<i32>(0, 1));
  let f = loadSource(base + vec2<i32>(0, 0));
  let e = loadSource(base + vec2<i32>(-1, 0));
  let k = loadSource(base + vec2<i32>(1, 1));
  let l = loadSource(base + vec2<i32>(2, 1));
  let h = loadSource(base + vec2<i32>(2, 0));
  let g = loadSource(base + vec2<i32>(1, 0));
  let o = loadSource(base + vec2<i32>(1, 2));
  let n = loadSource(base + vec2<i32>(0, 2));

  let bL = lumaTimesTwo(b);
  let cL = lumaTimesTwo(c);
  let iL = lumaTimesTwo(i);
  let jL = lumaTimesTwo(j);
  let fL = lumaTimesTwo(f);
  let eL = lumaTimesTwo(e);
  let kL = lumaTimesTwo(k);
  let lL = lumaTimesTwo(l);
  let hL = lumaTimesTwo(h);
  let gL = lumaTimesTwo(g);
  let oL = lumaTimesTwo(o);
  let nL = lumaTimesTwo(n);

  var direction = DirectionAccum(vec2<f32>(0.0, 0.0), 0.0);
  direction = directionSet(direction, fraction, bL, eL, fL, gL, jL, 0u);
  direction = directionSet(direction, fraction, cL, fL, gL, hL, kL, 1u);
  direction = directionSet(direction, fraction, fL, iL, jL, kL, nL, 2u);
  direction = directionSet(direction, fraction, gL, jL, kL, lL, oL, 3u);

  var normalizedDirection = direction.direction;
  let directionLengthSquared = dot(normalizedDirection, normalizedDirection);
  if (directionLengthSquared < 0.000030517578125) {
    normalizedDirection = vec2<f32>(1.0, 0.0);
  } else {
    normalizedDirection *= inverseSqrt(directionLengthSquared);
  }
  let averagedLength = direction.length * 0.5;
  let accumulatedLength = averagedLength * averagedLength;
  let directionStretch = dot(normalizedDirection, normalizedDirection) / max(abs(normalizedDirection.x), abs(normalizedDirection.y));
  let lengthScale = vec2<f32>(
    1.0 + (directionStretch - 1.0) * accumulatedLength,
    1.0 - 0.5 * accumulatedLength
  );
  let lobe = 0.5 + (0.21 - 0.5) * accumulatedLength;
  let clip = 1.0 / max(lobe, 0.000001);

  let minimumColor = min(min(f, g), min(j, k));
  let maximumColor = max(max(f, g), max(j, k));
  var color = ColorAccum(vec3<f32>(0.0, 0.0, 0.0), 0.0);
  color = easuTap(color, vec2<f32>(0.0, -1.0) - fraction, normalizedDirection, lengthScale, lobe, clip, b);
  color = easuTap(color, vec2<f32>(1.0, -1.0) - fraction, normalizedDirection, lengthScale, lobe, clip, c);
  color = easuTap(color, vec2<f32>(-1.0, 1.0) - fraction, normalizedDirection, lengthScale, lobe, clip, i);
  color = easuTap(color, vec2<f32>(0.0, 1.0) - fraction, normalizedDirection, lengthScale, lobe, clip, j);
  color = easuTap(color, vec2<f32>(0.0, 0.0) - fraction, normalizedDirection, lengthScale, lobe, clip, f);
  color = easuTap(color, vec2<f32>(-1.0, 0.0) - fraction, normalizedDirection, lengthScale, lobe, clip, e);
  color = easuTap(color, vec2<f32>(1.0, 1.0) - fraction, normalizedDirection, lengthScale, lobe, clip, k);
  color = easuTap(color, vec2<f32>(2.0, 1.0) - fraction, normalizedDirection, lengthScale, lobe, clip, l);
  color = easuTap(color, vec2<f32>(2.0, 0.0) - fraction, normalizedDirection, lengthScale, lobe, clip, h);
  color = easuTap(color, vec2<f32>(1.0, 0.0) - fraction, normalizedDirection, lengthScale, lobe, clip, g);
  color = easuTap(color, vec2<f32>(1.0, 2.0) - fraction, normalizedDirection, lengthScale, lobe, clip, o);
  color = easuTap(color, vec2<f32>(0.0, 2.0) - fraction, normalizedDirection, lengthScale, lobe, clip, n);

  let reconstructed = clamp(color.color / max(color.weight, 0.000001), minimumColor, maximumColor);
  textureStore(reconstructedOutput, vec2<i32>(invocation.xy), vec4<f32>(reconstructed, 1.0));
}
`;

  // AMD FSR1 RCAS edge-adaptive sharpening, applied after EASU.
  const RCAS_COMPUTE_WGSL = /* wgsl */ `
struct RcasUniforms { values: vec4<f32> };
@group(0) @binding(0) var reconstructedTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: RcasUniforms;
@group(0) @binding(2) var sharpenedOutput: texture_storage_2d<rgba8unorm, write>;

fn loadReconstructed(pixel: vec2<i32>) -> vec3<f32> {
  let dimensions = textureDimensions(reconstructedTexture);
  let last = vec2<i32>(dimensions) - vec2<i32>(1, 1);
  return textureLoad(reconstructedTexture, clamp(pixel, vec2<i32>(0, 0), last), 0).rgb;
}

fn safeReciprocal(value: f32) -> f32 {
  if (abs(value) < 0.000001) { return 0.0; }
  return 1.0 / value;
}

@compute
@workgroup_size(8, 8, 1)
fn csMain(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let dimensions = textureDimensions(reconstructedTexture);
  if (invocation.x >= dimensions.x || invocation.y >= dimensions.y) { return; }
  let pixel = vec2<i32>(invocation.xy);
  let b = loadReconstructed(pixel + vec2<i32>(0, -1));
  let d = loadReconstructed(pixel + vec2<i32>(-1, 0));
  let e = loadReconstructed(pixel);
  let f = loadReconstructed(pixel + vec2<i32>(1, 0));
  let h = loadReconstructed(pixel + vec2<i32>(0, 1));


  let redMinimum = min(min(b.r, d.r), min(f.r, h.r));
  let greenMinimum = min(min(b.g, d.g), min(f.g, h.g));
  let blueMinimum = min(min(b.b, d.b), min(f.b, h.b));
  let redMaximum = max(max(b.r, d.r), max(f.r, h.r));
  let greenMaximum = max(max(b.g, d.g), max(f.g, h.g));
  let blueMaximum = max(max(b.b, d.b), max(f.b, h.b));

  let redHitMinimum = min(redMinimum, e.r) * safeReciprocal(4.0 * redMaximum);
  let greenHitMinimum = min(greenMinimum, e.g) * safeReciprocal(4.0 * greenMaximum);
  let blueHitMinimum = min(blueMinimum, e.b) * safeReciprocal(4.0 * blueMaximum);
  let redHitMaximum = (1.0 - max(redMaximum, e.r)) * safeReciprocal(4.0 * redMinimum - 4.0);
  let greenHitMaximum = (1.0 - max(greenMaximum, e.g)) * safeReciprocal(4.0 * greenMinimum - 4.0);
  let blueHitMaximum = (1.0 - max(blueMaximum, e.b)) * safeReciprocal(4.0 * blueMinimum - 4.0);

  let redLobe = max(-redHitMinimum, redHitMaximum);
  let greenLobe = max(-greenHitMinimum, greenHitMaximum);
  let blueLobe = max(-blueHitMinimum, blueHitMaximum);
  let maximumLobe = max(max(redLobe, greenLobe), blueLobe);
  let lobe = max(-0.1875, min(maximumLobe, 0.0)) * exp2(-uniforms.values.x);
  let reciprocalLobe = 1.0 / (4.0 * lobe + 1.0);
  let sharpened = (lobe * (b + d + f + h) + e) * reciprocalLobe;
  textureStore(sharpenedOutput, pixel, vec4<f32>(clamp(sharpened, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0));
}
`;

  const PRESENT_FRAGMENT_WGSL = /* wgsl */ `
@group(0) @binding(0) var processedTexture: texture_2d<f32>;

@fragment
fn fsMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let dimensions = textureDimensions(processedTexture);
  let last = vec2<i32>(dimensions) - vec2<i32>(1, 1);
  let pixel = clamp(vec2<i32>(floor(position.xy)), vec2<i32>(0, 0), last);
  return textureLoad(processedTexture, pixel, 0);
}
`;

  function updateStatus(label, state) {
    statusLabel.textContent = label;
    statusDot.dataset.state = state;
    document.documentElement.dataset.fsr1Status = state;
  }

  function readAdapterInfo(adapter) {
    let info = null;
    try { info = adapter?.info || null; } catch { return null; }
    if (!info) return null;
    const details = {
      vendor: String(info.vendor || ''),
      architecture: String(info.architecture || ''),
      device: String(info.device || ''),
      description: String(info.description || ''),
      isFallbackAdapter: typeof adapter?.isFallbackAdapter === 'boolean'
        ? adapter.isFallbackAdapter
        : typeof info.isFallbackAdapter === 'boolean' ? info.isFallbackAdapter : null,
    };
    return Object.values(details).some(Boolean) || typeof details.isFallbackAdapter === 'boolean' ? details : null;
  }

  function classifySoftwareAdapter(info) {
    if (!info) return null;
    if (typeof info.isFallbackAdapter === 'boolean') return info.isFallbackAdapter;
    const text = Object.values(info).filter((value) => typeof value === 'string').join(' ').toLowerCase();
    if (/\bwarp\b|swiftshader|software raster|basic render|llvmpipe/.test(text)) return true;
    if (/nvidia|geforce|quadro|amd|radeon|intel|arc/.test(text)) return false;
    return null;
  }

  function annotateFailure(error, state, stage) {
    const result = error instanceof Error ? error : new Error(String(error));
    result.fsr1State = state;
    result.fsr1Stage = stage;
    return result;
  }

  async function compileShader(code, label) {
    try {
      const module = device.createShaderModule({ label, code });
      if (typeof module.getCompilationInfo === 'function') {
        const info = await module.getCompilationInfo();
        const errors = (info.messages || []).filter((message) => message.type === 'error');
        if (errors.length) {
          throw new Error(`${label} WGSL compilation failed: ${errors.map((message) => message.message).join(' | ')}`);
        }
      }
      return module;
    } catch (error) {
      throw annotateFailure(error, 'shader-failed', 'shader-compilation');
    }
  }

  async function compileFsrStageShader(code, label, stage) {
    const setStatus = stage === 'easu'
      ? (status) => { easuShaderCompilationStatus = status; }
      : (status) => { rcasShaderCompilationStatus = status; };
    setStatus('RUNNING');
    try {
      const module = await compileShader(code, label);
      setStatus('PASS');
      return module;
    } catch (error) {
      setStatus('FAIL');
      throw error;
    }
  }

  async function createFsrStagePipeline(label, create, stage) {
    const setStatus = stage === 'easu'
      ? (status) => { easuPipelineCreationStatus = status; }
      : (status) => { rcasPipelineCreationStatus = status; };
    setStatus('RUNNING');
    try {
      const pipeline = await validationError(label, create);
      setStatus('PASS');
      return pipeline;
    } catch (error) {
      setStatus('FAIL');
      throw error;
    }
  }

  async function validationError(label, create, state = 'pipeline-failed', stage = 'pipeline-creation') {
    device.pushErrorScope('validation');
    let value;
    try {
      value = create();
    } catch (error) {
      try { await device.popErrorScope(); } catch { /* Preserve the original creation failure. */ }
      throw annotateFailure(new Error(`${label} creation failed: ${error?.message || String(error)}`), state, stage);
    }
    let error;
    try {
      error = await device.popErrorScope();
    } catch (scopeError) {
      throw annotateFailure(new Error(`${label} validation scope failed: ${scopeError?.message || String(scopeError)}`), state, stage);
    }
    if (error) throw annotateFailure(new Error(`${label} WebGPU validation failed: ${error.message}`), state, stage);
    return value;
  }

  async function configurePipelines() {
    shaderCompilationStatus = 'compiling';
    const vertexModule = await compileShader(FULLSCREEN_VERTEX_WGSL, 'fullscreen vertex');
    const gameModule = await compileShader(GAME_FRAGMENT_WGSL, 'controlled game scene');
    const easuModule = await compileFsrStageShader(EASU_COMPUTE_WGSL, 'AMD FSR1 EASU compute', 'easu');
    const rcasModule = await compileFsrStageShader(RCAS_COMPUTE_WGSL, 'AMD FSR1 RCAS compute', 'rcas');
    const presentationModule = await compileShader(PRESENT_FRAGMENT_WGSL, 'processed output presentation');
    shaderCompilationStatus = 'passed';
    pipelineCreationStatus = 'creating';

    gamePipeline = await validationError('Game render pipeline', () => device.createRenderPipeline({
      label: 'controlled WebGPU game render target',
      layout: 'auto',
      vertex: { module: vertexModule, entryPoint: 'vsMain' },
      fragment: { module: gameModule, entryPoint: 'fsMain', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list' },
    }));
    easuPipeline = await createFsrStagePipeline('FSR1 EASU compute pipeline', () => device.createComputePipeline({
      label: 'AMD FidelityFX FSR1 EASU compute pipeline',
      layout: 'auto',
      compute: { module: easuModule, entryPoint: 'csMain' },
    }), 'easu');
    rcasPipeline = await createFsrStagePipeline('FSR1 RCAS compute pipeline', () => device.createComputePipeline({
      label: 'AMD FidelityFX FSR1 RCAS compute pipeline',
      layout: 'auto',
      compute: { module: rcasModule, entryPoint: 'csMain' },
    }), 'rcas');
    presentationPipeline = await validationError('Visible canvas presentation pipeline', () => device.createRenderPipeline({
      label: 'present processed FSR1 output to visible WebGPU canvas',
      layout: 'auto',
      vertex: { module: vertexModule, entryPoint: 'vsMain' },
      fragment: { module: presentationModule, entryPoint: 'fsMain', targets: [{ format: canvasFormat }] },
      primitive: { topology: 'triangle-list' },
    }));
    pipelineCreationStatus = 'passed';
    resourceInitializationStatus = 'creating';

    try {
      await validationError('FSR1 uniform and scene-resource creation', () => {
        gameUniformBuffer = device.createBuffer({ label: 'game uniforms', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        easuUniformBuffer = device.createBuffer({ label: 'EASU source/output dimensions', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        rcasUniformBuffer = device.createBuffer({ label: 'RCAS sharpness', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(rcasUniformBuffer, 0, new Float32Array([RCAS_SHARPNESS_STOPS, 0, 0, 0]));
        gameBindGroup = device.createBindGroup({
          label: 'game render uniforms',
          layout: gamePipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: gameUniformBuffer } }],
        });
        return true;
      }, 'resource-failed', 'resource-creation');
    } catch (error) {
      throw error;
    }
    resourceInitializationStatus = 'passed';
  }

  async function configureTimestampQueries(adapter) {
    if (!adapter?.features?.has?.('timestamp-query') || !device?.features?.has?.('timestamp-query')) {
      timestampQueryError = 'timestamp-query is not exposed by this WebGPU adapter/device.';
      return;
    }
    let createdSlots = [];
    try {
      device.pushErrorScope('validation');
      timestampQuerySet = device.createQuerySet({ label: 'EASU and RCAS GPU timestamps', type: 'timestamp', count: 4 });
      createdSlots = Array.from({ length: 3 }, (_, index) => ({
        busy: false,
        resolveBuffer: device.createBuffer({
          label: `FSR1 timestamp resolve buffer ${index}`,
          size: 256,
          usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        }),
        readBuffer: device.createBuffer({
          label: `FSR1 timestamp readback buffer ${index}`,
          size: 256,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        }),
      }));
      const validationError = await device.popErrorScope();
      if (validationError) throw new Error(validationError.message);
      timestampSlots = createdSlots;
      timestampQuerySupported = true;
      timestampQueryError = '';
    } catch (error) {
      try { await device.popErrorScope(); } catch { /* The scope may already have been consumed. */ }
      try { timestampQuerySet?.destroy(); } catch { /* Optional timing resource. */ }
      for (const slot of createdSlots) {
        try { slot.resolveBuffer?.destroy(); } catch { /* Optional timing resource. */ }
        try { slot.readBuffer?.destroy(); } catch { /* Optional timing resource. */ }
      }
      timestampQuerySet = null;
      timestampSlots = [];
      timestampQuerySupported = false;
      timestampQueryError = `timestamp-query setup failed: ${error?.message || String(error)}`;
      console.warn('[fsr1-webgpu] optional GPU timestamp query setup failed:', timestampQueryError);
    }
  }

  function takeTimestampSlot() {
    if (!timestampQuerySupported || timestampSlots.length === 0) return null;
    for (let offset = 0; offset < timestampSlots.length; offset += 1) {
      const index = (timestampSlotCursor + offset) % timestampSlots.length;
      const slot = timestampSlots[index];
      if (!slot.busy) {
        slot.busy = true;
        timestampSlotCursor = (index + 1) % timestampSlots.length;
        return slot;
      }
    }
    return null;
  }

  function collectGpuTimestamps(slot) {
    if (!slot) return;
    let mapped = false;
    device.queue.onSubmittedWorkDone()
      .then(() => slot.readBuffer.mapAsync(GPUMapMode.READ))
      .then(() => {
        mapped = true;
        const view = new DataView(slot.readBuffer.getMappedRange());
        const easuStart = view.getBigUint64(0, true);
        const easuEnd = view.getBigUint64(8, true);
        const rcasStart = view.getBigUint64(16, true);
        const rcasEnd = view.getBigUint64(24, true);
        if (easuEnd < easuStart || rcasEnd < rcasStart) throw new Error('The WebGPU timestamp query returned a reversed interval.');
        const easuMs = Number(easuEnd - easuStart) / 1_000_000;
        const rcasMs = Number(rcasEnd - rcasStart) / 1_000_000;
        if (!Number.isFinite(easuMs) || !Number.isFinite(rcasMs)) throw new Error('The WebGPU timestamp query returned a non-finite interval.');
        lastEasuGpuTimeMs = easuMs;
        lastRcasGpuTimeMs = rcasMs;
        gpuTimestampSamples += 1;
      })
      .catch((error) => {
        timestampQueryError = `GPU timestamp readback failed: ${error?.message || String(error)}`;
        timestampQuerySupported = false;
        console.warn('[fsr1-webgpu] optional GPU timestamp collection failed:', timestampQueryError);
      })
      .finally(() => {
        if (mapped) {
          try { slot.readBuffer.unmap(); } catch { /* The device may already be lost. */ }
        }
        slot.busy = false;
      });
  }

  function destroyTargets() {
    for (const texture of [inputTexture, easuTexture, processedTexture]) {
      try { texture?.destroy(); } catch { /* A lost device already released it. */ }
    }
    inputTexture = null;
    easuTexture = null;
    processedTexture = null;
    easuBindGroup = null;
    rcasBindGroup = null;
    presentationBindGroup = null;
    renderWidth = 0;
    renderHeight = 0;
  }

  function resizeOutput() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DEVICE_PIXEL_RATIO);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (width > device.limits.maxTextureDimension2D || height > device.limits.maxTextureDimension2D) {
      throw annotateFailure(
        new Error(`Visible WebGPU output ${width}×${height} exceeds maxTextureDimension2D=${device.limits.maxTextureDimension2D}.`),
        'resource-failed',
        'resize-limit',
      );
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    outputWidth = width;
    outputHeight = height;
    return bounds.width > 0 && bounds.height > 0;
  }

  function ensureTargets() {
    const width = Math.max(1, Math.floor(outputWidth * GAME_RENDER_SCALE));
    const height = Math.max(1, Math.floor(outputHeight * GAME_RENDER_SCALE));
    if (width === renderWidth && height === renderHeight && inputTexture && easuTexture && processedTexture) return;

    destroyTargets();
    renderWidth = width;
    renderHeight = height;
    inputTexture = device.createTexture({
      label: 'low-resolution WebGPU game color target',
      size: { width: renderWidth, height: renderHeight },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    easuTexture = device.createTexture({
      label: 'FSR1 EASU reconstructed intermediate',
      size: { width: outputWidth, height: outputHeight },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    processedTexture = device.createTexture({
      label: 'FSR1 RCAS processed output',
      size: { width: outputWidth, height: outputHeight },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    easuBindGroup = device.createBindGroup({
      label: 'FSR1 EASU source, dimensions, and storage output',
      layout: easuPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: inputTexture.createView() },
        { binding: 1, resource: { buffer: easuUniformBuffer } },
        { binding: 2, resource: easuTexture.createView() },
      ],
    });
    rcasBindGroup = device.createBindGroup({
      label: 'FSR1 RCAS reconstructed input, sharpness, and storage output',
      layout: rcasPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: easuTexture.createView() },
        { binding: 1, resource: { buffer: rcasUniformBuffer } },
        { binding: 2, resource: processedTexture.createView() },
      ],
    });
    presentationBindGroup = device.createBindGroup({
      label: 'FSR1 output texture for visible canvas presentation',
      layout: presentationPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: processedTexture.createView() }],
    });
  }

  function beginRenderPass(encoder, label, view, clearColor) {
    return encoder.beginRenderPass({
      label,
      colorAttachments: [{
        view,
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
  }

  function beginComputePass(encoder, label, timestampSlot = null, beginningIndex = 0) {
    const descriptor = { label };
    if (timestampSlot && timestampQuerySet) {
      descriptor.timestampWrites = {
        querySet: timestampQuerySet,
        beginningOfPassWriteIndex: beginningIndex,
        endOfPassWriteIndex: beginningIndex + 1,
      };
    }
    return encoder.beginComputePass(descriptor);
  }

  function updateHud() {
    frameLabel.textContent = String(framesCompleted);
    resolutionLabel.textContent = `${renderWidth}×${renderHeight} → ${outputWidth}×${outputHeight}`;
  }

  function renderFailure(message, { state = 'runtime-failed', stage = 'frame-processing' } = {}) {
    if (disposed || isTerminalState()) return;
    if (state === 'shader-failed') shaderCompilationStatus = 'failed';
    if (state === 'pipeline-failed') pipelineCreationStatus = 'failed';
    if (state === 'resource-failed') resourceInitializationStatus = 'failed';
    failure = String(message || 'WebGPU FSR1 could not continue.').slice(0, 1200);
    failureStage = stage;
    lifecycle = state;
    const headline = state === 'unsupported'
      ? 'WebGPU FSR1 is unavailable in this renderer.'
      : state === 'adapter-failed'
        ? 'WebGPU adapter initialization failed.'
        : state === 'device-failed'
          ? 'WebGPU device initialization failed.'
          : state === 'shader-failed'
            ? 'FSR1 WGSL shader compilation failed.'
            : state === 'pipeline-failed'
              ? 'FSR1 pipeline creation failed.'
              : state === 'resource-failed'
                ? 'FSR1 resource or canvas initialization failed.'
                : state === 'device-lost'
                  ? 'The WebGPU device was lost.'
                  : 'FSR1 runtime processing failed.';
    errorPanel.textContent = `${headline}\n\nStage: ${stage}\n${failure}\n\nThe bundled test scene stops processing. Other browser tabs continue to use standard Chromium rendering; no screenshot or software fallback is substituted.`;
    errorPanel.hidden = false;
    document.documentElement.dataset.fsr1State = lifecycle;
    updateStatus(`${headline} · standard browser fallback`, state === 'unsupported' ? 'unsupported' : 'failed');
  }

  function isTerminalState(state = lifecycle) {
    return ['unsupported', 'adapter-failed', 'device-failed', 'shader-failed', 'pipeline-failed', 'resource-failed', 'runtime-failed', 'device-lost'].includes(state);
  }

  async function initialize() {
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
      renderFailure('navigator.gpu is not exposed by this Electron/Chromium runtime.', { state: 'unsupported', stage: 'webgpu-api-detection' });
      return;
    }

    updateStatus('Requesting a WebGPU adapter with safe preference fallbacks…', 'working');
    const adapterAttempts = [
      { path: 'high-performance', options: { powerPreference: 'high-performance' } },
      { path: 'low-power', options: { powerPreference: 'low-power' } },
      { path: 'default', options: {} },
      { path: 'force-fallback', options: { forceFallbackAdapter: true } },
    ];
    let adapter;
    for (const attempt of adapterAttempts) {
      try {
        adapter = await navigator.gpu.requestAdapter(attempt.options);
        adapterRequestResults.push({ path: attempt.path, status: adapter ? 'selected' : 'unavailable' });
        if (adapter) {
          adapterRequestPath = attempt.path;
          break;
        }
      } catch (error) {
        adapterRequestResults.push({
          path: attempt.path,
          status: 'rejected',
          error: String(error?.message || error || 'adapter request rejected').slice(0, 240),
        });
      }
    }
    if (!adapter) {
      const allRequestsRejected = adapterRequestResults.length > 0
        && adapterRequestResults.every((result) => result.status === 'rejected');
      const requestSummary = adapterRequestResults
        .map((result) => `${result.path}: ${result.status}${result.error ? ` (${result.error})` : ''}`)
        .join('; ');
      renderFailure(
        `WebGPU did not provide a compatible adapter after high-performance, low-power, default, and explicit fallback requests. ${requestSummary}`,
        { state: allRequestsRejected ? 'adapter-failed' : 'unsupported', stage: 'adapter-discovery' },
      );
      return;
    }
    adapterDetected = true;
    adapterDetails = readAdapterInfo(adapter);
    softwareAdapter = classifySoftwareAdapter(adapterDetails);

    updateStatus('Requesting a WebGPU device…', 'working');
    const timestampFeatureRequested = Boolean(adapter.features?.has?.('timestamp-query'));
    try {
      device = await adapter.requestDevice({ requiredFeatures: timestampFeatureRequested ? ['timestamp-query'] : [] });
    } catch (firstDeviceError) {
      if (!timestampFeatureRequested) {
        renderFailure(`WebGPU device request rejected: ${firstDeviceError?.message || String(firstDeviceError)}`, { state: 'device-failed', stage: 'device-request' });
        return;
      }
      timestampQueryError = `Adapter advertised timestamp-query but the optional feature request failed; retrying without timestamps: ${firstDeviceError?.message || String(firstDeviceError)}`;
      try {
        device = await adapter.requestDevice();
      } catch (error) {
        renderFailure(`WebGPU device request rejected: ${error?.message || String(error)}`, { state: 'device-failed', stage: 'device-request' });
        return;
      }
    }

    device.addEventListener('uncapturederror', (event) => {
      const message = event?.error?.message || 'Uncaptured WebGPU validation or device error.';
      console.error('[fsr1-webgpu] uncaptured device error:', message);
      renderFailure(message, { state: 'runtime-failed', stage: 'uncaptured-webgpu-error' });
    });
    device.lost.then((info) => {
      if (!disposed && !isTerminalState()) {
        renderFailure(`WebGPU device lost (${info?.reason || 'unknown'}): ${info?.message || 'no additional details'}`, {
          state: 'device-lost',
          stage: 'device-loss',
        });
      }
    });

    try {
      await configureTimestampQueries(adapter);
      context = canvas.getContext('webgpu');
      if (!context) throw annotateFailure(new Error('The visible canvas could not create a WebGPU rendering context.'), 'resource-failed', 'canvas-context');
      canvasFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format: canvasFormat, alphaMode: 'opaque', colorSpace: 'srgb' });
    } catch (error) {
      renderFailure(error?.message || String(error), {
        state: error?.fsr1State || 'resource-failed',
        stage: error?.fsr1Stage || 'canvas-configuration',
      });
      return;
    }

    updateStatus('Compiling game, FSR1 EASU/RCAS, and presentation WGSL…', 'working');
    try {
      await configurePipelines();
    } catch (error) {
      renderFailure(error?.message || String(error), {
        state: error?.fsr1State || 'pipeline-failed',
        stage: error?.fsr1Stage || 'pipeline-initialization',
      });
      return;
    }

    lifecycle = 'initialized';
    pageStartTime = performance.now();
    document.documentElement.dataset.fsr1State = lifecycle;
    updateStatus('EASU + RCAS compute pipelines initialized · waiting for the first completed canvas frame', 'ready');
    animationHandle = requestAnimationFrame(drawFrame);
  }

  async function drawFrame(timestamp) {
    if (isTerminalState() || evidenceFrozen || evidenceFreezeRequested) return;
    if (document.hidden) {
      animationHandle = requestAnimationFrame(drawFrame);
      return;
    }
    if (framePending) return;

    framePending = true;
    let validationScopeOpen = false;
    let timestampSlot = null;
    try {
      if (!resizeOutput()) return;
      device.pushErrorScope('validation');
      validationScopeOpen = true;
      try {
        ensureTargets();
      } catch (error) {
        throw annotateFailure(error, 'resource-failed', 'target-resource-creation');
      }
      let resourceValidationError;
      try {
        resourceValidationError = await device.popErrorScope();
        validationScopeOpen = false;
      } catch (error) {
        validationScopeOpen = false;
        throw annotateFailure(new Error(`FSR1 target resource validation scope failed: ${error?.message || String(error)}`), 'resource-failed', 'target-resource-validation');
      }
      if (resourceValidationError) {
        throw annotateFailure(new Error(`FSR1 target resource validation failed: ${resourceValidationError.message}`), 'resource-failed', 'target-resource-validation');
      }
      device.pushErrorScope('validation');
      validationScopeOpen = true;
      const elapsed = (timestamp - pageStartTime) / 1000;
      device.queue.writeBuffer(gameUniformBuffer, 0, new Float32Array([elapsed, renderWidth, renderHeight, 0]));
      device.queue.writeBuffer(easuUniformBuffer, 0, new Float32Array([renderWidth, renderHeight, outputWidth, outputHeight]));

      const frameStart = performance.now();
      timestampSlot = takeTimestampSlot();
      const encoder = device.createCommandEncoder({ label: `FSR1 WebGPU frame ${framesSubmitted + 1}` });

      const gamePass = beginRenderPass(encoder, 'controlled game render', inputTexture.createView(), { r: 0, g: 0, b: 0, a: 1 });
      gamePass.setPipeline(gamePipeline);
      gamePass.setBindGroup(0, gameBindGroup);
      gamePass.draw(3);
      gamePass.end();

      const workgroupsX = Math.ceil(outputWidth / 8);
      const workgroupsY = Math.ceil(outputHeight / 8);
      const easuPass = beginComputePass(encoder, 'AMD FSR1 EASU compute dispatch', timestampSlot, 0);
      easuPass.setPipeline(easuPipeline);
      easuPass.setBindGroup(0, easuBindGroup);
      easuDispatchAttempted = true;
      easuPass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
      easuPass.end();

      const rcasPass = beginComputePass(encoder, 'AMD FSR1 RCAS compute dispatch', timestampSlot, 2);
      rcasPass.setPipeline(rcasPipeline);
      rcasPass.setBindGroup(0, rcasBindGroup);
      rcasDispatchAttempted = true;
      rcasPass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
      rcasPass.end();

      const outputView = context.getCurrentTexture().createView();
      const presentPass = beginRenderPass(encoder, 'present processed RCAS texture to visible WebGPU canvas', outputView, { r: 0, g: 0, b: 0, a: 1 });
      presentPass.setPipeline(presentationPipeline);
      presentPass.setBindGroup(0, presentationBindGroup);
      presentPass.draw(3);
      presentPass.end();

      if (timestampSlot && timestampQuerySet) {
        encoder.resolveQuerySet(timestampQuerySet, 0, 4, timestampSlot.resolveBuffer, 0);
        encoder.copyBufferToBuffer(timestampSlot.resolveBuffer, 0, timestampSlot.readBuffer, 0, 32);
      }

      lifecycle = 'processing';
      document.documentElement.dataset.fsr1State = lifecycle;
      updateStatus('Dispatching EASU + RCAS compute passes and presenting the processed canvas…', 'working');
      device.queue.submit([encoder.finish()]);
      const validationError = await device.popErrorScope();
      validationScopeOpen = false;
      if (validationError) {
        throw annotateFailure(new Error(`FSR1 frame WebGPU validation failed: ${validationError.message}`), 'runtime-failed', 'frame-validation');
      }
      framesSubmitted += 1;
      if (timestampSlot) collectGpuTimestamps(timestampSlot);
      await device.queue.onSubmittedWorkDone();
      if (isTerminalState()) return;

      const completedAt = performance.now();
      lastQueueCompletionWallMs = Math.max(0, completedAt - frameStart);
      totalQueueCompletionWallMs += lastQueueCompletionWallMs;
      maxQueueCompletionWallMs = Math.max(maxQueueCompletionWallMs, lastQueueCompletionWallMs);
      framesCompleted += 1;
      easuDispatches += 1;
      rcasDispatches += 1;
      lastCompletedAt = completedAt;
      lifecycle = 'presented';
      document.documentElement.dataset.fsr1State = lifecycle;
      if (completedAt - lastHudUpdate >= 250) {
        lastHudUpdate = completedAt;
        updateHud();
        const average = totalQueueCompletionWallMs / framesCompleted;
        updateStatus(
          `FSR1 output submitted to the visible WebGPU canvas · ${framesCompleted} completed frame(s) · ${Math.round(lastQueueCompletionWallMs * 100) / 100} ms queue-completion wall time · avg ${Math.round(average * 100) / 100} ms`,
          'active',
        );
      }
    } catch (error) {
      let message = error?.message || String(error);
      if (validationScopeOpen) {
        try {
          const validationError = await device.popErrorScope();
          if (validationError) message = `${message}; WebGPU validation: ${validationError.message}`;
        } catch (scopeError) {
          message = `${message}; WebGPU validation scope could not be read: ${scopeError?.message || String(scopeError)}`;
        }
      }
      renderFailure(message, {
        state: error?.fsr1State || 'runtime-failed',
        stage: error?.fsr1Stage || 'frame-encoding-or-dispatch',
      });
    } finally {
      framePending = false;
      if (evidenceFreezeRequested && !evidenceFrozen && framesCompleted > 0) {
        evidenceFrozen = true;
        const resolve = evidenceFreezeResolve;
        evidenceFreezeResolve = null;
        resolve?.(getSnapshot());
      }
    }
    if (!isTerminalState() && !evidenceFrozen && !evidenceFreezeRequested && (lifecycle === 'presented' || lifecycle === 'initialized')) {
      animationHandle = requestAnimationFrame(drawFrame);
    }
  }

  function compactReadbackRows(mappedBytes, width, height, bytesPerRow) {
    const rowBytes = width * 4;
    const compact = new Uint8Array(rowBytes * height);
    for (let row = 0; row < height; row += 1) {
      compact.set(mappedBytes.subarray(row * bytesPerRow, row * bytesPerRow + rowBytes), row * rowBytes);
    }
    return compact;
  }

  function diagnosticPngDataUrl(pixels, width, height) {
    const diagnosticCanvas = document.createElement('canvas');
    diagnosticCanvas.width = width;
    diagnosticCanvas.height = height;
    const diagnosticContext = diagnosticCanvas.getContext('2d');
    if (!diagnosticContext) throw new Error('A temporary 2D canvas was unavailable for diagnostic PNG generation.');
    const imageData = diagnosticContext.createImageData(width, height);
    imageData.data.set(pixels);
    diagnosticContext.putImageData(imageData, 0, 0);
    return diagnosticCanvas.toDataURL('image/png');
  }

  function pixelFingerprint(pixels) {
    // FNV-1a is only a frame-change fingerprint; it is not a security checksum.
    let hash = 2166136261;
    for (let index = 0; index < pixels.length; index += 1) {
      hash ^= pixels[index];
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  async function validateLatestOutput({ includeImages = false } = {}) {
    if (!evidenceFrozen || lifecycle !== 'presented' || framesCompleted < 1 || !inputTexture || !easuTexture || !processedTexture) {
      throw new Error('Post-processing readback validation requires a frozen, completed WebGPU frame; it is never used as an FSR input.');
    }
    const images = [
      { label: 'low-resolution game color target', texture: inputTexture, width: renderWidth, height: renderHeight },
      { label: 'FSR1 EASU intermediate', texture: easuTexture, width: outputWidth, height: outputHeight },
      { label: 'FSR1 RCAS processed output', texture: processedTexture, width: outputWidth, height: outputHeight },
    ];
    const readbacks = images.map(({ label, width, height }) => {
      const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
      return {
        width,
        height,
        bytesPerRow,
        buffer: device.createBuffer({
          label: `${label} post-processing diagnostic readback`,
          size: bytesPerRow * height,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        }),
      };
    });
    let scopeOpen = false;
    let mapped = [];
    try {
      device.pushErrorScope('validation');
      scopeOpen = true;
      const encoder = device.createCommandEncoder({ label: 'post-processing-only WebGPU FSR1 output validation' });
      images.forEach((image, index) => {
        const readback = readbacks[index];
        encoder.copyTextureToBuffer(
          { texture: image.texture },
          { buffer: readback.buffer, offset: 0, bytesPerRow: readback.bytesPerRow, rowsPerImage: readback.height },
          { width: image.width, height: image.height, depthOrArrayLayers: 1 },
        );
      });
      device.queue.submit([encoder.finish()]);
      const validationError = await device.popErrorScope();
      scopeOpen = false;
      if (validationError) throw new Error(`Post-processing diagnostic copy validation failed: ${validationError.message}`);
      await Promise.all(readbacks.map(({ buffer }) => buffer.mapAsync(GPUMapMode.READ)));
      mapped = readbacks.map(({ buffer, width, height, bytesPerRow }) => compactReadbackRows(
        new Uint8Array(buffer.getMappedRange()), width, height, bytesPerRow,
      ));
    } catch (error) {
      if (scopeOpen) {
        try { await device.popErrorScope(); } catch { /* Preserve the original diagnostic error. */ }
      }
      throw error;
    } finally {
      for (const { buffer } of readbacks) {
        try { if (buffer.mapState === 'mapped') buffer.unmap(); } catch { /* The device may already be lost. */ }
        try { buffer.destroy(); } catch { /* The device may already be lost. */ }
      }
    }

    const sampleFractions = [0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84, 0.92];
    const visibleSamples = [];
    for (const yFraction of [0.10, 0.24, 0.38, 0.52, 0.66, 0.80]) {
      for (const xFraction of sampleFractions) {
        if (xFraction < 0.42 && yFraction > 0.74) continue; // Keep samples outside the in-scene HUD.
        const x = Math.min(outputWidth - 1, Math.floor(xFraction * outputWidth));
        const y = Math.min(outputHeight - 1, Math.floor(yFraction * outputHeight));
        const offset = (y * outputWidth + x) * 4;
        visibleSamples.push({
          xFraction,
          yFraction,
          rgba: [mapped[2][offset], mapped[2][offset + 1], mapped[2][offset + 2], mapped[2][offset + 3]],
        });
      }
    }

    const diagnosticImages = includeImages ? {
      input: diagnosticPngDataUrl(mapped[0], renderWidth, renderHeight),
      easu: diagnosticPngDataUrl(mapped[1], outputWidth, outputHeight),
      rcas: diagnosticPngDataUrl(mapped[2], outputWidth, outputHeight),
    } : null;
    return {
      state: 'PASS',
      purpose: 'Explicit post-processing diagnostic only: copyTextureToBuffer and MAP_READ after a completed frame; these pixels never enter EASU, RCAS, or presentation.',
      readbackForProcessing: false,
      diagnosticReadback: true,
      framesSubmittedAtCapture: framesSubmitted,
      framesCompletedAtCapture: framesCompleted,
      input: { width: renderWidth, height: renderHeight, fnv1a32: pixelFingerprint(mapped[0]) },
      easu: { width: outputWidth, height: outputHeight, fnv1a32: pixelFingerprint(mapped[1]) },
      rcas: { width: outputWidth, height: outputHeight, fnv1a32: pixelFingerprint(mapped[2]) },
      dispatch: { workgroupSize: [8, 8, 1], workgroupsX: Math.ceil(outputWidth / 8), workgroupsY: Math.ceil(outputHeight / 8) },
      visibleSamples,
      diagnosticImages,
    };
  }

  async function freezeAtCompletedFrame() {
    if (evidenceFrozen) return getSnapshot();
    if (isTerminalState()) throw new Error(`Cannot freeze failed WebGPU output: ${failure || lifecycle}`);
    if (framesCompleted < 1) throw new Error('Cannot freeze a WebGPU frame before one frame completed.');
    evidenceFreezeRequested = true;
    if (!framePending) {
      if (animationHandle) cancelAnimationFrame(animationHandle);
      animationHandle = 0;
      evidenceFrozen = true;
      return getSnapshot();
    }
    return new Promise((resolve) => { evidenceFreezeResolve = resolve; });
  }

  function markVisibleOutputVerified() {
    if (!evidenceFrozen || framesCompleted < 1 || isTerminalState()) return false;
    visibleOutputVerified = true;
    return true;
  }

  function resumeFrames() {
    if (isTerminalState()) return false;
    evidenceFreezeRequested = false;
    evidenceFrozen = false;
    evidenceFreezeResolve = null;
    if (!framePending) animationHandle = requestAnimationFrame(drawFrame);
    return true;
  }

  function getStageResults() {
    const apiDetected = Boolean(navigator.gpu && typeof navigator.gpu.requestAdapter === 'function');
    const unavailableOnly = adapterRequestResults.length > 0
      && adapterRequestResults.every((result) => result.status === 'unavailable');
    const anyRejected = adapterRequestResults.some((result) => result.status === 'rejected');
    const adapterDiscoveryStatus = adapterDetected
      ? 'PASS'
      : failureStage === 'webgpu-api-detection'
        ? 'NOT RUN'
        : failureStage === 'adapter-discovery'
          ? unavailableOnly ? 'UNSUPPORTED' : anyRejected ? 'FAIL' : 'NOT RUN'
          : 'NOT RUN';
    const deviceInitializationStatus = device
      ? 'PASS'
      : failureStage === 'device-request' || lifecycle === 'device-failed'
        ? 'FAIL'
        : adapterDetected && !isTerminalState() ? 'RUNNING' : 'NOT RUN';
    const dispatchStage = (completedDispatches, attempted) => ({
      status: completedDispatches > 0
        ? 'PASS'
        : attempted && isTerminalState()
          ? 'FAIL'
          : attempted ? 'RUNNING' : 'NOT RUN',
      acceptanceStatus: completedDispatches >= 3
        ? 'PASS'
        : isTerminalState()
          ? attempted ? 'FAIL' : 'NOT RUN'
          : 'RUNNING',
      completedDispatches,
      minimumRequiredDispatches: 3,
    });
    const outputGenerationStatus = framesCompleted >= 3 && ['presented', 'processing'].includes(lifecycle)
      ? 'PASS'
      : isTerminalState() && (framesSubmitted > 0 || framesCompleted > 0)
        ? 'FAIL'
        : framesSubmitted > 0 || framesCompleted > 0 ? 'RUNNING' : 'NOT RUN';
    return {
      apiDetection: { status: apiDetected ? 'PASS' : 'UNSUPPORTED' },
      adapterDiscovery: {
        status: adapterDiscoveryStatus,
        selectedPreference: adapterRequestPath || null,
        requests: adapterRequestResults,
      },
      deviceInitialization: { status: deviceInitializationStatus },
      easuShaderCompilation: { status: easuShaderCompilationStatus },
      rcasShaderCompilation: { status: rcasShaderCompilationStatus },
      easuPipelineCreation: { status: easuPipelineCreationStatus },
      rcasPipelineCreation: { status: rcasPipelineCreationStatus },
      easuDispatch: dispatchStage(easuDispatches, easuDispatchAttempted),
      rcasDispatch: dispatchStage(rcasDispatches, rcasDispatchAttempted),
      outputGeneration: {
        status: outputGenerationStatus,
        framesSubmitted,
        framesCompleted,
        input: { width: renderWidth, height: renderHeight },
        output: { width: outputWidth, height: outputHeight },
      },
      outputValidation: { status: 'NOT RUN' },
    };
  }

  function getSnapshot() {
    const now = performance.now();
    const recentCompletedFrame = lifecycle === 'presented'
      && framesCompleted > 0
      && now - lastCompletedAt < 1800;
    const processingFrames = !document.hidden && (framePending || recentCompletedFrame);
    return {
      implementation: 'AMD FidelityFX FSR1 1.0.2 EASU + RCAS WGSL adaptation',
      api: 'WebGPU',
      state: lifecycle,
      failureStage,
      detected: adapterDetected || Boolean(device),
      adapterDetected,
      deviceInitialized: Boolean(device),
      stageResults: getStageResults(),
      compatible: ['initialized', 'processing', 'presented'].includes(lifecycle),
      initialized: ['initialized', 'processing', 'presented'].includes(lifecycle),
      shaderCompilationStatus,
      pipelineCreationStatus,
      resourceInitializationStatus,
      easuComputePipelineInitialized: Boolean(easuPipeline),
      rcasComputePipelineInitialized: Boolean(rcasPipeline),
      presentationPipelineInitialized: Boolean(presentationPipeline),
      active: processingFrames,
      processingFrames,
      framesPresented: framesCompleted,
      presentedOutput: framesCompleted > 0 && lifecycle === 'presented',
      visibleOutputVerified,
      failed: isTerminalState() && lifecycle !== 'unsupported',
      unsupported: lifecycle === 'unsupported',
      deviceLost: lifecycle === 'device-lost',
      automaticEligible: false,
      scope: 'Bundled local WebGPU game integration scene only; not arbitrary browser pages.',
      pixelReadbackForProcessing: false,
      timestampReadbackForMetrics: timestampQuerySupported,
      diagnosticReadbackAvailable: true,
      evidenceFrozen,
      adapter: adapterDetails,
      adapterInfoAvailable: Boolean(adapterDetails),
      adapterRequestPath,
      adapterRequestResults,
      softwareAdapter,
      inputWidth: renderWidth,
      inputHeight: renderHeight,
      outputWidth,
      outputHeight,
      renderScale: GAME_RENDER_SCALE,
      workgroupSize: [8, 8, 1],
      workgroupsX: outputWidth ? Math.ceil(outputWidth / 8) : 0,
      workgroupsY: outputHeight ? Math.ceil(outputHeight / 8) : 0,
      framesSubmitted,
      framesCompleted,
      easuDispatches,
      rcasDispatches,
      lastQueueCompletionWallMs,
      averageQueueCompletionWallMs: framesCompleted ? totalQueueCompletionWallMs / framesCompleted : null,
      maxQueueCompletionWallMs: framesCompleted ? maxQueueCompletionWallMs : null,
      timestampQuerySupported,
      gpuTimestampsAvailable: gpuTimestampSamples > 0,
      gpuTimestampSamples,
      lastEasuGpuTimeMs,
      lastRcasGpuTimeMs,
      gpuTimestampError: timestampQueryError,
      timingDefinition: 'Browser performance.now() wall time from frame encoding start until WebGPU queue.onSubmittedWorkDone resolves; not a GPU timestamp.',
      gpuTimingDefinition: 'When the optional WebGPU timestamp-query feature is exposed and successfully requested, EASU/RCAS values are GPU timestamp-query intervals in milliseconds; otherwise unavailable.',
      error: failure,
    };
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    if (animationHandle) cancelAnimationFrame(animationHandle);
    animationHandle = 0;
    try { context?.unconfigure(); } catch { /* Context may already be lost. */ }
    destroyTargets();
    for (const buffer of [gameUniformBuffer, easuUniformBuffer, rcasUniformBuffer]) {
      try { buffer?.destroy(); } catch { /* Device teardown owns remaining resources. */ }
    }
    for (const slot of timestampSlots) {
      try { slot.resolveBuffer?.destroy(); } catch { /* Device teardown owns remaining resources. */ }
      try { slot.readBuffer?.destroy(); } catch { /* Device teardown owns remaining resources. */ }
    }
    try { timestampQuerySet?.destroy(); } catch { /* Device teardown owns remaining resources. */ }
    try { device?.destroy(); } catch { /* The device may already be lost. */ }
  }

  // The main process only queries this fixed, bundled local test page. This
  // narrow local-only surface also supports explicit post-processing validation.
  Object.defineProperty(window, 'triCoreFsrWebGpuTest', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      getSnapshot,
      freezeAtCompletedFrame,
      validateLatestOutput,
      markVisibleOutputVerified,
      resumeFrames,
    }),
  });

  window.addEventListener('pagehide', cleanup, { once: true });
  initialize().catch((error) => {
    renderFailure(error?.message || String(error), {
      state: error?.fsr1State || 'runtime-failed',
      stage: error?.fsr1Stage || 'initialization',
    });
  });
})();
