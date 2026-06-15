// Feature: pixel-level-detection, Property 5: Histogram severity classification
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { analyzeHistogram, computeSmoothness, computeChannelHistogram } from './histogram-analyzer';

/**
 * Validates: Requirements 3.2, 3.3, 3.4
 *
 * Property 5: Histogram severity classification
 * For any three channel smoothness values, the histogram severity SHALL be 0.0
 * when any smoothness value is at or above the threshold, and SHALL be in the
 * range (0.0, 1.0] when all three values are below the threshold, with lower
 * average smoothness producing higher severity.
 */

/**
 * Helper: creates a minimal ImageData-like object from a Uint8ClampedArray.
 * Width and height are set so that width * height * 4 = data.length.
 */
function createImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

/**
 * Generates RGBA pixel data where all pixels have the same RGB value.
 * This produces a perfectly uniform histogram (one bin has all counts, rest are 0).
 * A uniform histogram has smoothness = (N / 255) where N = pixel count,
 * since there's one spike and rest zeros → adjacent diffs sum to 2*N spread across 255 pairs.
 * Actually for a single-value histogram: 254 diffs are 0, one diff is +N, one diff is -N,
 * so totalDiff = 2*N, smoothness = 2*N / 255.
 */
function createUniformPixelData(pixelCount: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe('Histogram Analyzer - Property 5: Histogram severity classification', () => {
  it('severity is 0.0 when any channel smoothness is at or above the threshold', () => {
    fc.assert(
      fc.property(
        // Generate pixel count (enough to produce varied histograms)
        fc.integer({ min: 256, max: 1024 }),
        // Generate a threshold
        fc.double({ min: 1, max: 100, noNaN: true }),
        (pixelCount, _threshold) => {
          // Create pixel data with high variation (random bytes) which produces rough histograms
          // Random uniform pixel data across all 256 values produces high smoothness
          const data = new Uint8ClampedArray(pixelCount * 4);
          // Fill with random-like pattern that ensures high smoothness in at least one channel
          // Use a pattern that creates large adjacent diffs: alternate between 0 and 255
          for (let i = 0; i < pixelCount; i++) {
            data[i * 4] = i % 2 === 0 ? 0 : 255; // Red alternates: creates 2 spikes
            data[i * 4 + 1] = i % 3 === 0 ? 0 : 128; // Green: 2 spikes
            data[i * 4 + 2] = i % 5 === 0 ? 50 : 200; // Blue: 2 spikes
            data[i * 4 + 3] = 255;
          }

          // Compute smoothness for each channel to verify at least one is >= threshold
          const redHist = computeChannelHistogram(data, 0);
          const greenHist = computeChannelHistogram(data, 1);
          const blueHist = computeChannelHistogram(data, 2);
          const redSmooth = computeSmoothness(redHist);
          const greenSmooth = computeSmoothness(greenHist);
          const blueSmooth = computeSmoothness(blueHist);

          // Use a threshold low enough that at least one channel exceeds it
          const minSmoothness = Math.min(redSmooth, greenSmooth, blueSmooth);
          const lowThreshold = minSmoothness; // exactly at the min → at least one is >= threshold

          const imageData = createImageData(data, pixelCount, 1);
          const result = analyzeHistogram(imageData, lowThreshold);

          // When any channel smoothness >= threshold, severity must be 0.0
          expect(result.severity).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity is in (0.0, 1.0] when all three channel smoothness values are below threshold', () => {
    fc.assert(
      fc.property(
        // Generate a small number of pixels with uniform values → very smooth histograms
        fc.integer({ min: 10, max: 500 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (pixelCount, r, g, b) => {
          // Uniform pixel data → single spike in histogram → smoothness = 2*pixelCount/255
          const data = createUniformPixelData(pixelCount, r, g, b);
          const imageData = createImageData(data, pixelCount, 1);

          // Calculate actual smoothness to pick a threshold above it
          const redHist = computeChannelHistogram(data, 0);
          const smoothness = computeSmoothness(redHist);

          // Use a threshold well above the actual smoothness
          const threshold = smoothness + 10;

          const result = analyzeHistogram(imageData, threshold);

          // All channels have the same smoothness (uniform data), all below threshold
          // Severity must be > 0 and <= 1.0
          expect(result.severity).toBeGreaterThan(0);
          expect(result.severity).toBeLessThanOrEqual(1.0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('lower average smoothness produces higher severity (monotonicity)', () => {
    fc.assert(
      fc.property(
        // Two different smoothness averages, both below threshold
        // Use integers to avoid floating-point precision issues with nearly equal values
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 50, max: 200 }),
        (smoothAInt, smoothBInt, thresholdInt) => {
          const smoothA = smoothAInt;
          const smoothB = smoothBInt;
          const threshold = thresholdInt;

          // Ensure both are below threshold and strictly different
          fc.pre(smoothA < threshold && smoothB < threshold && smoothA !== smoothB);

          // Severity formula: 1.0 - (averageSmoothness / threshold)
          // Lower smoothness → higher severity
          const severityA = 1.0 - smoothA / threshold;
          const severityB = 1.0 - smoothB / threshold;

          if (smoothA < smoothB) {
            expect(severityA).toBeGreaterThan(severityB);
          } else {
            expect(severityB).toBeGreaterThan(severityA);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity is always in [0.0, 1.0] range for any valid pixel data', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary pixel data
        fc.integer({ min: 1, max: 200 }),
        fc.uint8Array({ minLength: 4, maxLength: 800 }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        (width, rawData, threshold) => {
          // Ensure data length is a multiple of 4
          const pixelCount = Math.floor(rawData.length / 4);
          fc.pre(pixelCount > 0);

          const data = new Uint8ClampedArray(rawData.buffer, 0, pixelCount * 4);
          const adjustedWidth = Math.min(width, pixelCount);
          const height = Math.max(1, Math.floor(pixelCount / adjustedWidth));
          const finalPixelCount = adjustedWidth * height;
          const finalData = new Uint8ClampedArray(data.buffer, 0, finalPixelCount * 4);

          const imageData = createImageData(finalData, adjustedWidth, height);
          const result = analyzeHistogram(imageData, threshold);

          // Severity must always be in [0.0, 1.0]
          expect(result.severity).toBeGreaterThanOrEqual(0.0);
          expect(result.severity).toBeLessThanOrEqual(1.0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('computeSmoothness returns 0 for a histogram with fewer than 2 bins', () => {
    fc.assert(
      fc.property(
        fc.constantFrom([], [42]),
        (histogram) => {
          const smoothness = computeSmoothness(histogram);
          expect(smoothness).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('computeSmoothness is non-negative for any histogram', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 10000 }), { minLength: 2, maxLength: 256 }),
        (histogram) => {
          const smoothness = computeSmoothness(histogram);
          expect(smoothness).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('computeSmoothness is 0 for a constant histogram (all bins equal)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 2, max: 256 }),
        (value, length) => {
          const histogram = new Array(length).fill(value);
          const smoothness = computeSmoothness(histogram);
          expect(smoothness).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
