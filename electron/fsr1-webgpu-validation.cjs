'use strict';

const RGB_CHANNELS = 3;
const BYTES_PER_PIXEL = 4;
const SAFE_VIEWPORT_SAMPLE_FRACTIONS = Object.freeze([0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84, 0.92]);

function assertDimensions(width, height, label) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new TypeError(`${label} must have positive integer dimensions.`);
  }
}

function assertRgbaBytes(data, width, height, label) {
  assertDimensions(width, height, label);
  if (!(data instanceof Uint8Array) || data.byteLength !== width * height * BYTES_PER_PIXEL) {
    throw new TypeError(`${label} must contain exactly ${width * height * BYTES_PER_PIXEL} RGBA bytes.`);
  }
}

function bitmapToRgba(bitmap, width, height, sourceOrder = 'bgra') {
  assertDimensions(width, height, 'Bitmap');
  if (!(bitmap instanceof Uint8Array) || bitmap.byteLength !== width * height * BYTES_PER_PIXEL) {
    throw new TypeError('Bitmap bytes do not match the requested dimensions.');
  }
  if (sourceOrder !== 'bgra' && sourceOrder !== 'rgba') throw new TypeError('Pixel order must be bgra or rgba.');
  if (sourceOrder === 'rgba') return new Uint8Array(bitmap);
  const rgba = new Uint8Array(bitmap.byteLength);
  for (let offset = 0; offset < bitmap.byteLength; offset += BYTES_PER_PIXEL) {
    rgba[offset] = bitmap[offset + 2];
    rgba[offset + 1] = bitmap[offset + 1];
    rgba[offset + 2] = bitmap[offset];
    rgba[offset + 3] = bitmap[offset + 3];
  }
  return rgba;
}

function clampIndex(value, size) {
  return Math.max(0, Math.min(size - 1, value));
}

function averageEdgeDifference(image, width, height) {
  let sum = 0;
  let comparisons = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = (y * width + x) * BYTES_PER_PIXEL;
      const hasRight = x + 1 < width;
      const hasBottom = y + 1 < height;
      const right = pixel + BYTES_PER_PIXEL;
      const bottom = pixel + width * BYTES_PER_PIXEL;
      for (let channel = 0; channel < RGB_CHANNELS; channel += 1) {
        if (hasRight) {
          sum += Math.abs(image[pixel + channel] - image[right + channel]);
          comparisons += 1;
        }
        if (hasBottom) {
          sum += Math.abs(image[pixel + channel] - image[bottom + channel]);
          comparisons += 1;
        }
      }
    }
  }
  return comparisons ? sum / (comparisons * 255) : 0;
}

function countDistinctSampledColors(image, width, height) {
  const colors = new Set();
  const stepX = Math.max(1, Math.floor(width / 96));
  const stepY = Math.max(1, Math.floor(height / 96));
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const offset = (y * width + x) * BYTES_PER_PIXEL;
      colors.add(`${image[offset]},${image[offset + 1]},${image[offset + 2]}`);
    }
  }
  return colors.size;
}

function analyzeRgbaStages({
  input,
  inputWidth,
  inputHeight,
  easu,
  easuWidth,
  easuHeight,
  output,
  outputWidth,
  outputHeight,
} = {}) {
  assertRgbaBytes(input, inputWidth, inputHeight, 'Low-resolution input');
  assertRgbaBytes(easu, easuWidth, easuHeight, 'EASU intermediate');
  assertRgbaBytes(output, outputWidth, outputHeight, 'RCAS output');
  if (easuWidth !== outputWidth || easuHeight !== outputHeight) {
    throw new TypeError('EASU and RCAS output dimensions must match.');
  }

  let bilinearAbsError = 0;
  let easuChangedPixels = 0;
  let rcasAbsError = 0;
  let rcasChangedPixels = 0;
  const pixelCount = outputWidth * outputHeight;
  const comparedChannels = pixelCount * RGB_CHANNELS;

  for (let y = 0; y < outputHeight; y += 1) {
    const sourceY = (y + 0.5) * (inputHeight / outputHeight) - 0.5;
    const sourceY0Unclamped = Math.floor(sourceY);
    const sourceY0 = clampIndex(sourceY0Unclamped, inputHeight);
    const sourceY1 = clampIndex(sourceY0Unclamped + 1, inputHeight);
    const fractionY = sourceY - sourceY0Unclamped;
    for (let x = 0; x < outputWidth; x += 1) {
      const sourceX = (x + 0.5) * (inputWidth / outputWidth) - 0.5;
      const sourceX0Unclamped = Math.floor(sourceX);
      const sourceX0 = clampIndex(sourceX0Unclamped, inputWidth);
      const sourceX1 = clampIndex(sourceX0Unclamped + 1, inputWidth);
      const fractionX = sourceX - sourceX0Unclamped;
      const topLeft = (sourceY0 * inputWidth + sourceX0) * BYTES_PER_PIXEL;
      const topRight = (sourceY0 * inputWidth + sourceX1) * BYTES_PER_PIXEL;
      const bottomLeft = (sourceY1 * inputWidth + sourceX0) * BYTES_PER_PIXEL;
      const bottomRight = (sourceY1 * inputWidth + sourceX1) * BYTES_PER_PIXEL;
      const pixel = (y * outputWidth + x) * BYTES_PER_PIXEL;
      let easuPixelChanged = false;
      let rcasPixelChanged = false;

      for (let channel = 0; channel < RGB_CHANNELS; channel += 1) {
        const top = input[topLeft + channel] * (1 - fractionX) + input[topRight + channel] * fractionX;
        const bottom = input[bottomLeft + channel] * (1 - fractionX) + input[bottomRight + channel] * fractionX;
        const bilinear = top * (1 - fractionY) + bottom * fractionY;
        const easuError = Math.abs(easu[pixel + channel] - bilinear);
        const rcasError = Math.abs(output[pixel + channel] - easu[pixel + channel]);
        bilinearAbsError += easuError;
        rcasAbsError += rcasError;
        if (easuError > 1) easuPixelChanged = true;
        if (rcasError > 1) rcasPixelChanged = true;
      }
      if (easuPixelChanged) easuChangedPixels += 1;
      if (rcasPixelChanged) rcasChangedPixels += 1;
    }
  }

  const inputEdgeMean = averageEdgeDifference(input, inputWidth, inputHeight);
  const easuEdgeMean = averageEdgeDifference(easu, easuWidth, easuHeight);
  const outputEdgeMean = averageEdgeDifference(output, outputWidth, outputHeight);
  const easuVsBilinearMae = bilinearAbsError / (comparedChannels * 255);
  const rcasVsEasuMae = rcasAbsError / (comparedChannels * 255);
  const dimensionsUpscaled = outputWidth > inputWidth && outputHeight > inputHeight;
  const inputHasDetail = inputEdgeMean > 0.0001 && countDistinctSampledColors(input, inputWidth, inputHeight) > 2;
  const easuContributes = easuChangedPixels > 0 && easuVsBilinearMae > 0.00001;
  const rcasContributes = rcasChangedPixels > 0 && rcasVsEasuMae > 0.000001;
  const outputHasDetail = outputEdgeMean > 0.0001 && countDistinctSampledColors(output, outputWidth, outputHeight) > 2;
  const checks = {
    dimensionsUpscaled,
    inputHasDetail,
    easuContributes,
    rcasContributes,
    outputHasDetail,
  };

  return {
    status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    reference: 'Simple clamped bilinear upscale of the captured low-resolution RGBA target; this is a comparison baseline, not an AMD shader conformance oracle.',
    comparisonResolution: 'Exact diagnostic PNG pixels returned from the frozen WebGPU textures; main-process CPU analysis is post-processing validation only.',
    dimensions: {
      input: { width: inputWidth, height: inputHeight },
      easu: { width: easuWidth, height: easuHeight },
      rcas: { width: outputWidth, height: outputHeight },
    },
    checks,
    numerical: {
      comparedOutputPixels: pixelCount,
      comparedRgbChannels: comparedChannels,
      easuVsBilinearMeanAbsoluteErrorNormalized: easuVsBilinearMae,
      easuChangedPixelsVsBilinear: easuChangedPixels,
      easuChangedPixelFraction: easuChangedPixels / pixelCount,
      rcasVsEasuMeanAbsoluteErrorNormalized: rcasVsEasuMae,
      rcasChangedPixelsVsEasu: rcasChangedPixels,
      rcasChangedPixelFraction: rcasChangedPixels / pixelCount,
      inputMeanNeighborDifferenceNormalized: inputEdgeMean,
      easuMeanNeighborDifferenceNormalized: easuEdgeMean,
      rcasMeanNeighborDifferenceNormalized: outputEdgeMean,
      inputDistinctSampledColors: countDistinctSampledColors(input, inputWidth, inputHeight),
      outputDistinctSampledColors: countDistinctSampledColors(output, outputWidth, outputHeight),
    },
  };
}

function luminance(rgba) {
  return 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2];
}

function pearsonCorrelation(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const centeredLeft = left[index] - meanLeft;
    const centeredRight = right[index] - meanRight;
    covariance += centeredLeft * centeredRight;
    varianceLeft += centeredLeft * centeredLeft;
    varianceRight += centeredRight * centeredRight;
  }
  if (varianceLeft === 0 || varianceRight === 0) return null;
  return covariance / Math.sqrt(varianceLeft * varianceRight);
}

function compareVisibleCanvasSamples({
  screenshot,
  screenshotWidth,
  screenshotHeight,
  viewWidth,
  viewHeight,
  canvasRect,
  expectedSamples,
} = {}) {
  assertRgbaBytes(screenshot, screenshotWidth, screenshotHeight, 'Visible WebContentsView capture');
  if (![viewWidth, viewHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new TypeError('WebContentsView dimensions must be positive.');
  }
  if (!canvasRect || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(canvasRect[key]))
      || canvasRect.width <= 0 || canvasRect.height <= 0) {
    throw new TypeError('Visible WebGPU canvas bounds are invalid.');
  }
  if (!Array.isArray(expectedSamples)) throw new TypeError('Expected WebGPU output samples must be an array.');

  const scaleX = screenshotWidth / viewWidth;
  const scaleY = screenshotHeight / viewHeight;
  const details = [];
  let totalAbsError = 0;
  let channelCount = 0;
  let closeSamples = 0;
  const expectedLuminance = [];
  const observedLuminance = [];
  const observedColors = new Set();

  for (const sample of expectedSamples) {
    if (!Number.isFinite(sample?.xFraction) || !Number.isFinite(sample?.yFraction)
        || !Array.isArray(sample?.rgba) || sample.rgba.length < 3) continue;
    const screenX = Math.max(0, Math.min(screenshotWidth - 1, Math.floor((canvasRect.x + sample.xFraction * canvasRect.width) * scaleX)));
    const screenY = Math.max(0, Math.min(screenshotHeight - 1, Math.floor((canvasRect.y + sample.yFraction * canvasRect.height) * scaleY)));
    const offset = (screenY * screenshotWidth + screenX) * BYTES_PER_PIXEL;
    // Electron NativeImage.toBitmap() supplies BGRA bytes; this is an explicit
    // after-the-fact comparison, never an input to the GPU processing path.
    const observed = [screenshot[offset + 2], screenshot[offset + 1], screenshot[offset], screenshot[offset + 3]];
    const expected = sample.rgba;
    let sampleError = 0;
    for (let channel = 0; channel < RGB_CHANNELS; channel += 1) {
      const error = Math.abs(observed[channel] - expected[channel]);
      sampleError += error;
      totalAbsError += error;
      channelCount += 1;
    }
    const meanSampleError = sampleError / (RGB_CHANNELS * 255);
    if (meanSampleError <= 0.30) closeSamples += 1;
    expectedLuminance.push(luminance(expected));
    observedLuminance.push(luminance(observed));
    observedColors.add(`${observed[0]},${observed[1]},${observed[2]}`);
    details.push({ xFraction: sample.xFraction, yFraction: sample.yFraction, screenshotX: screenX, screenshotY: screenY, meanAbsoluteErrorNormalized: meanSampleError });
  }

  const meanAbsoluteErrorNormalized = channelCount ? totalAbsError / (channelCount * 255) : null;
  const correlation = pearsonCorrelation(expectedLuminance, observedLuminance);
  const passed = details.length >= 12
    && meanAbsoluteErrorNormalized !== null
    && meanAbsoluteErrorNormalized <= 0.45
    && correlation !== null
    && correlation >= 0.55
    && closeSamples >= Math.ceil(details.length * 0.5)
    && observedColors.size >= Math.min(4, details.length);
  return {
    status: passed ? 'PASS' : 'FAIL',
    method: 'Sampled screenshot pixels from the frozen WebGPU canvas are compared with the corresponding RCAS texture samples; screenshots are evidence only.',
    sampleCount: details.length,
    meanAbsoluteErrorNormalized,
    luminanceCorrelation: correlation,
    samplesWithin30PercentMeanError: closeSamples,
    distinctObservedColors: observedColors.size,
    scaleFromViewToCapture: { x: scaleX, y: scaleY },
    sampleDetails: details,
  };
}

module.exports = {
  SAFE_VIEWPORT_SAMPLE_FRACTIONS,
  analyzeRgbaStages,
  bitmapToRgba,
  compareVisibleCanvasSamples,
};
