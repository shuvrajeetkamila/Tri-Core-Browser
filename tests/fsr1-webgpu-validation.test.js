import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  analyzeRgbaStages,
  bitmapToRgba,
  compareVisibleCanvasSamples,
} = require('../electron/fsr1-webgpu-validation.cjs');

const pixelOffset = (x, y, width) => (y * width + x) * 4;

function makeSyntheticStages() {
  const inputWidth = 3;
  const inputHeight = 3;
  const outputWidth = 6;
  const outputHeight = 6;
  const input = new Uint8Array(inputWidth * inputHeight * 4);
  for (let y = 0; y < inputHeight; y += 1) {
    for (let x = 0; x < inputWidth; x += 1) {
      const offset = pixelOffset(x, y, inputWidth);
      input[offset] = (x * 91 + y * 17) % 256;
      input[offset + 1] = (x * 23 + y * 83) % 256;
      input[offset + 2] = (x * 47 + y * 31) % 256;
      input[offset + 3] = 255;
    }
  }

  const easu = new Uint8Array(outputWidth * outputHeight * 4);
  for (let y = 0; y < outputHeight; y += 1) {
    const sourceY = (y + 0.5) * (inputHeight / outputHeight) - 0.5;
    const y0Unclamped = Math.floor(sourceY);
    const y0 = Math.max(0, Math.min(inputHeight - 1, y0Unclamped));
    const y1 = Math.max(0, Math.min(inputHeight - 1, y0Unclamped + 1));
    const fy = sourceY - y0Unclamped;
    for (let x = 0; x < outputWidth; x += 1) {
      const sourceX = (x + 0.5) * (inputWidth / outputWidth) - 0.5;
      const x0Unclamped = Math.floor(sourceX);
      const x0 = Math.max(0, Math.min(inputWidth - 1, x0Unclamped));
      const x1 = Math.max(0, Math.min(inputWidth - 1, x0Unclamped + 1));
      const fx = sourceX - x0Unclamped;
      const offset = pixelOffset(x, y, outputWidth);
      for (let channel = 0; channel < 3; channel += 1) {
        const topLeft = input[pixelOffset(x0, y0, inputWidth) + channel];
        const topRight = input[pixelOffset(x1, y0, inputWidth) + channel];
        const bottomLeft = input[pixelOffset(x0, y1, inputWidth) + channel];
        const bottomRight = input[pixelOffset(x1, y1, inputWidth) + channel];
        const top = topLeft * (1 - fx) + topRight * fx;
        const bottom = bottomLeft * (1 - fx) + bottomRight * fx;
        const bilinear = top * (1 - fy) + bottom * fy;
        const sharpened = bilinear + ((x + y + channel) % 2 ? 9 : -9);
        easu[offset + channel] = Math.max(0, Math.min(255, Math.round(sharpened)));
      }
      easu[offset + 3] = 255;
    }
  }

  const output = new Uint8Array(easu);
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const offset = pixelOffset(x, y, outputWidth);
      output[offset + ((x + y) % 3)] = Math.max(0, Math.min(255, output[offset + ((x + y) % 3)] + (x % 2 ? 5 : -5)));
    }
  }
  return { input, inputWidth, inputHeight, easu, easuWidth: outputWidth, easuHeight: outputHeight, output, outputWidth, outputHeight };
}

test('NativeImage BGRA conversion is explicit and does not mutate the input bitmap', () => {
  const bitmap = Buffer.from([30, 20, 10, 255, 3, 2, 1, 128]);
  const original = Buffer.from(bitmap);
  const rgba = bitmapToRgba(bitmap, 2, 1);
  assert.deepEqual([...rgba], [10, 20, 30, 255, 1, 2, 3, 128]);
  assert.deepEqual(bitmap, original);
  assert.deepEqual([...bitmapToRgba(Buffer.from([1, 2, 3, 255]), 1, 1, 'rgba')], [1, 2, 3, 255]);
  assert.throws(() => bitmapToRgba(Buffer.from([1, 2, 3]), 1, 1), /do not match/);
  assert.throws(() => bitmapToRgba(Buffer.from([1, 2, 3, 4]), 1, 1, 'argb'), /bgra or rgba/);
});

test('diagnostic stage comparison detects lower-resolution input, EASU change, RCAS change, and output detail', () => {
  const report = analyzeRgbaStages(makeSyntheticStages());
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.checks, {
    dimensionsUpscaled: true,
    inputHasDetail: true,
    easuContributes: true,
    rcasContributes: true,
    outputHasDetail: true,
  });
  assert.ok(report.numerical.comparedOutputPixels > 0);
  assert.ok(report.numerical.easuVsBilinearMeanAbsoluteErrorNormalized > 0);
  assert.ok(report.numerical.rcasVsEasuMeanAbsoluteErrorNormalized > 0);
  assert.match(report.reference, /not an AMD shader conformance oracle/);
  assert.equal(report.comparisonResolution.includes('post-processing'), true);
});

test('diagnostic stage comparison rejects identical flat stages and malformed dimensions', () => {
  const width = 2;
  const height = 2;
  const flat = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < flat.length; offset += 4) flat.set([64, 64, 64, 255], offset);
  const report = analyzeRgbaStages({
    input: flat,
    inputWidth: width,
    inputHeight: height,
    easu: flat,
    easuWidth: width,
    easuHeight: height,
    output: flat,
    outputWidth: width,
    outputHeight: height,
  });
  assert.equal(report.status, 'FAIL');
  assert.equal(report.checks.dimensionsUpscaled, false);
  assert.equal(report.checks.inputHasDetail, false);
  assert.throws(() => analyzeRgbaStages({ input: new Uint8Array(3), inputWidth: 1, inputHeight: 1 }), /exactly/);
});

test('visible-canvas check maps capture scale and BGRA screenshot samples to RCAS RGBA pixels', () => {
  const viewWidth = 4;
  const viewHeight = 4;
  const screenshotWidth = 8;
  const screenshotHeight = 8;
  const screenshot = new Uint8Array(screenshotWidth * screenshotHeight * 4);
  const fractions = [0.15, 0.35, 0.65, 0.85];
  const expectedSamples = [];
  for (const yFraction of fractions) {
    for (const xFraction of fractions) {
      const rgba = [
        Math.round(20 + 180 * xFraction),
        Math.round(15 + 190 * yFraction),
        Math.round(12 + 110 * ((xFraction + yFraction) / 2)),
        255,
      ];
      const x = Math.floor(xFraction * viewWidth * 2);
      const y = Math.floor(yFraction * viewHeight * 2);
      const offset = pixelOffset(x, y, screenshotWidth);
      screenshot.set([rgba[2], rgba[1], rgba[0], rgba[3]], offset);
      expectedSamples.push({ xFraction, yFraction, rgba });
    }
  }

  const report = compareVisibleCanvasSamples({
    screenshot,
    screenshotWidth,
    screenshotHeight,
    viewWidth,
    viewHeight,
    canvasRect: { x: 0, y: 0, width: viewWidth, height: viewHeight },
    expectedSamples,
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.sampleCount, expectedSamples.length);
  assert.equal(report.meanAbsoluteErrorNormalized, 0);
  assert.equal(report.luminanceCorrelation, 1);
  assert.deepEqual(report.scaleFromViewToCapture, { x: 2, y: 2 });

  const failed = compareVisibleCanvasSamples({
    screenshot,
    screenshotWidth,
    screenshotHeight,
    viewWidth,
    viewHeight,
    canvasRect: { x: 0, y: 0, width: viewWidth, height: viewHeight },
    expectedSamples: expectedSamples.slice(0, 4),
  });
  assert.equal(failed.status, 'FAIL', 'fewer than twelve matched samples cannot be accepted');
});
