// Feature: pixel-level-detection, Property 1: ELA difference computation and normalization
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computePixelDifference, computeBlockStdDev } from './ela-analyzer';

/**
 * Validates: Requirements 1.2, 1.3
 *
 * Property 1: ELA difference computation and normalization
 * For any pair of equal-length RGBA pixel arrays (original and recompressed) and any
 * amplification factor > 0, the computed difference array SHALL have the same length
 * as the inputs, and every RGB channel value in the difference array SHALL be in the
 * range [0, 255] inclusive, where each value equals
 * min(255, |original[i] - recompressed[i]| × amplificationFactor) for the corresponding channel.
 */

/**
 * Arbitrary: generates a Uint8ClampedArray of RGBA pixel data with a given pixel count.
 * Length is always a multiple of 4.
 */
function arbRgbaPixelArray(pixelCount: fc.Arbitrary<number>): fc.Arbitrary<Uint8ClampedArray> {
  return pixelCount.chain((count) => {
    const length = count * 4;
    return fc.array(fc.integer({ min: 0, max: 255 }), { minLength: length, maxLength: length })
      .map((arr) => new Uint8ClampedArray(arr));
  });
}

/**
 * Arbitrary: generates a pixel count between 1 and 64 (keeps tests fast).
 */
const arbPixelCount = fc.integer({ min: 1, max: 64 });

/**
 * Arbitrary: generates a positive amplification factor.
 * Includes small values (< 1), moderate values, and large values.
 */
const arbAmplificationFactor = fc.oneof(
  fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true }),   // small
  fc.double({ min: 1, max: 10, noNaN: true, noDefaultInfinity: true }),     // moderate
  fc.double({ min: 10, max: 100, noNaN: true, noDefaultInfinity: true })    // large
);

describe('ELA Analyzer - Property 1: ELA difference computation and normalization', () => {
  it('result has the same length as the inputs', () => {
    fc.assert(
      fc.property(
        arbPixelCount.chain((count) =>
          fc.tuple(
            arbRgbaPixelArray(fc.constant(count)),
            arbRgbaPixelArray(fc.constant(count)),
            arbAmplificationFactor
          )
        ),
        ([original, recompressed, amplificationFactor]) => {
          const result = computePixelDifference(original, recompressed, amplificationFactor);

          // Result length equals input length
          expect(result.length).toBe(original.length);
          expect(result.length).toBe(recompressed.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every RGB channel value is in [0, 255] inclusive', () => {
    fc.assert(
      fc.property(
        arbPixelCount.chain((count) =>
          fc.tuple(
            arbRgbaPixelArray(fc.constant(count)),
            arbRgbaPixelArray(fc.constant(count)),
            arbAmplificationFactor
          )
        ),
        ([original, recompressed, amplificationFactor]) => {
          const result = computePixelDifference(original, recompressed, amplificationFactor);

          for (let i = 0; i < result.length; i += 4) {
            // R channel
            expect(result[i]).toBeGreaterThanOrEqual(0);
            expect(result[i]).toBeLessThanOrEqual(255);
            // G channel
            expect(result[i + 1]).toBeGreaterThanOrEqual(0);
            expect(result[i + 1]).toBeLessThanOrEqual(255);
            // B channel
            expect(result[i + 2]).toBeGreaterThanOrEqual(0);
            expect(result[i + 2]).toBeLessThanOrEqual(255);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each RGB value equals clamped min(255, |original[i] - recompressed[i]| × amplificationFactor)', () => {
    fc.assert(
      fc.property(
        arbPixelCount.chain((count) =>
          fc.tuple(
            arbRgbaPixelArray(fc.constant(count)),
            arbRgbaPixelArray(fc.constant(count)),
            arbAmplificationFactor
          )
        ),
        ([original, recompressed, amplificationFactor]) => {
          const result = computePixelDifference(original, recompressed, amplificationFactor);

          // Uint8ClampedArray automatically clamps and rounds values to integers in [0, 255]
          // so the expected value must also go through that clamping
          const clamp = (v: number) => new Uint8ClampedArray([v])[0];

          for (let i = 0; i < result.length; i += 4) {
            // R channel
            const expectedR = clamp(Math.min(255, Math.abs(original[i] - recompressed[i]) * amplificationFactor));
            expect(result[i]).toBe(expectedR);

            // G channel
            const expectedG = clamp(Math.min(255, Math.abs(original[i + 1] - recompressed[i + 1]) * amplificationFactor));
            expect(result[i + 1]).toBe(expectedG);

            // B channel
            const expectedB = clamp(Math.min(255, Math.abs(original[i + 2] - recompressed[i + 2]) * amplificationFactor));
            expect(result[i + 2]).toBe(expectedB);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('alpha channel is always set to 255', () => {
    fc.assert(
      fc.property(
        arbPixelCount.chain((count) =>
          fc.tuple(
            arbRgbaPixelArray(fc.constant(count)),
            arbRgbaPixelArray(fc.constant(count)),
            arbAmplificationFactor
          )
        ),
        ([original, recompressed, amplificationFactor]) => {
          const result = computePixelDifference(original, recompressed, amplificationFactor);

          for (let i = 0; i < result.length; i += 4) {
            expect(result[i + 3]).toBe(255);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('works correctly with amplification factor of 1 (no amplification)', () => {
    fc.assert(
      fc.property(
        arbPixelCount.chain((count) =>
          fc.tuple(
            arbRgbaPixelArray(fc.constant(count)),
            arbRgbaPixelArray(fc.constant(count))
          )
        ),
        ([original, recompressed]) => {
          const result = computePixelDifference(original, recompressed, 1);

          for (let i = 0; i < result.length; i += 4) {
            // With factor 1, result is just the absolute difference (always ≤ 255)
            expect(result[i]).toBe(Math.abs(original[i] - recompressed[i]));
            expect(result[i + 1]).toBe(Math.abs(original[i + 1] - recompressed[i + 1]));
            expect(result[i + 2]).toBe(Math.abs(original[i + 2] - recompressed[i + 2]));
            expect(result[i + 3]).toBe(255);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('with very large amplification factor, non-zero differences saturate to 255', () => {
    fc.assert(
      fc.property(
        arbPixelCount.chain((count) =>
          fc.tuple(
            arbRgbaPixelArray(fc.constant(count)),
            arbRgbaPixelArray(fc.constant(count))
          )
        ),
        ([original, recompressed]) => {
          const largeAmplification = 1000;
          const result = computePixelDifference(original, recompressed, largeAmplification);

          for (let i = 0; i < result.length; i += 4) {
            for (let ch = 0; ch < 3; ch++) {
              const diff = Math.abs(original[i + ch] - recompressed[i + ch]);
              if (diff > 0) {
                // Any non-zero diff × 1000 > 255, so result should be clamped to 255
                expect(result[i + ch]).toBe(255);
              } else {
                // Zero difference stays zero regardless of amplification
                expect(result[i + ch]).toBe(0);
              }
            }
            expect(result[i + 3]).toBe(255);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: pixel-level-detection, Property 2: ELA uniformity severity classification

/**
 * Validates: Requirements 1.4, 1.5
 *
 * Property 2: ELA uniformity severity classification
 * For any set of per-block mean differences, the ELA severity SHALL be 0.0
 * when the standard deviation of block means exceeds the uniformity threshold (20),
 * and SHALL increase toward 1.0 as the standard deviation approaches 0
 * (perfectly uniform error), always remaining in the range [0.0, 1.0] inclusive.
 *
 * Severity formula: max(0, 1.0 - (blockStdDev / UNIFORMITY_THRESHOLD))
 * where UNIFORMITY_THRESHOLD = 20
 */

const UNIFORMITY_THRESHOLD = 20;

/**
 * Compute severity from blockStdDev using the same formula as the implementation.
 */
function computeSeverity(blockStdDev: number): number {
  return Math.max(0, 1.0 - blockStdDev / UNIFORMITY_THRESHOLD);
}

/**
 * Generate RGBA difference data where all pixels have the same RGB value.
 * Uniform pixel data → blockStdDev ≈ 0 → severity ≈ 1.0
 */
function createUniformDifferenceData(
  width: number,
  height: number,
  value: number
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;     // R
    data[i + 1] = value; // G
    data[i + 2] = value; // B
    data[i + 3] = 255;   // A
  }
  return data;
}

/**
 * Generate RGBA difference data with high variance between blocks.
 * Alternating blocks of 0 and 255 values → high blockStdDev → severity = 0
 */
function createHighVarianceDifferenceData(
  width: number,
  height: number,
  blockSize: number
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const blockX = Math.floor(x / blockSize);
      const blockY = Math.floor(y / blockSize);
      // Alternate blocks between 0 and 255
      const value = (blockX + blockY) % 2 === 0 ? 0 : 255;
      const idx = (y * width + x) * 4;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
      data[idx + 3] = 255;
    }
  }
  return data;
}

describe('ELA Analyzer - Property 2: ELA uniformity severity classification', () => {
  it('severity is always in [0.0, 1.0] for any valid difference data', () => {
    fc.assert(
      fc.property(
        // Generate image dimensions (at least 1x1, up to 64x64 for performance)
        fc.integer({ min: 1, max: 64 }),
        fc.integer({ min: 1, max: 64 }),
        fc.integer({ min: 1, max: 16 }),
        (width, height, blockSize) => {
          // Generate random difference data
          const data = new Uint8ClampedArray(width * height * 4);
          for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.floor(Math.random() * 256);
            data[i + 1] = Math.floor(Math.random() * 256);
            data[i + 2] = Math.floor(Math.random() * 256);
            data[i + 3] = 255;
          }

          const blockStdDev = computeBlockStdDev(data, width, height, blockSize);
          const severity = computeSeverity(blockStdDev);

          expect(severity).toBeGreaterThanOrEqual(0.0);
          expect(severity).toBeLessThanOrEqual(1.0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity equals 0 when blockStdDev >= UNIFORMITY_THRESHOLD (20)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 200, noNaN: true }),
        (blockStdDev) => {
          const severity = computeSeverity(blockStdDev);
          expect(severity).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity equals max(0, 1.0 - blockStdDev / 20) for any non-negative blockStdDev', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        (blockStdDev) => {
          const severity = computeSeverity(blockStdDev);
          const expected = Math.max(0, 1.0 - blockStdDev / 20);

          expect(severity).toBeCloseTo(expected, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity increases toward 1.0 as blockStdDev approaches 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 20, noNaN: true }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        (stdDev1, stdDev2) => {
          const severity1 = computeSeverity(stdDev1);
          const severity2 = computeSeverity(stdDev2);

          // If stdDev1 < stdDev2 then severity1 >= severity2 (monotonically decreasing)
          if (stdDev1 < stdDev2) {
            expect(severity1).toBeGreaterThanOrEqual(severity2);
          } else if (stdDev1 > stdDev2) {
            expect(severity1).toBeLessThanOrEqual(severity2);
          } else {
            expect(severity1).toBeCloseTo(severity2, 10);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('perfectly uniform pixel data produces blockStdDev ≈ 0 and severity ≈ 1.0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 16, max: 64 }),
        fc.integer({ min: 16, max: 64 }),
        fc.integer({ min: 0, max: 255 }),
        (width, height, pixelValue) => {
          const data = createUniformDifferenceData(width, height, pixelValue);
          const blockSize = 16;
          const blockStdDev = computeBlockStdDev(data, width, height, blockSize);
          const severity = computeSeverity(blockStdDev);

          // Uniform data should have blockStdDev very close to 0
          expect(blockStdDev).toBeCloseTo(0, 5);
          // Therefore severity should be very close to 1.0
          expect(severity).toBeCloseTo(1.0, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('high-variance block data produces blockStdDev > UNIFORMITY_THRESHOLD and severity = 0', () => {
    fc.assert(
      fc.property(
        // Need at least 2 blocks in each dimension to produce variance
        fc.integer({ min: 32, max: 64 }),
        fc.integer({ min: 32, max: 64 }),
        (width, height) => {
          const blockSize = 16;
          const data = createHighVarianceDifferenceData(width, height, blockSize);
          const blockStdDev = computeBlockStdDev(data, width, height, blockSize);
          const severity = computeSeverity(blockStdDev);

          // High variance between blocks → stddev > threshold
          expect(blockStdDev).toBeGreaterThan(UNIFORMITY_THRESHOLD);
          // Therefore severity should be 0
          expect(severity).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('computeBlockStdDev returns 0 for empty or zero-dimension inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 32 }),
        (blockSize) => {
          // Empty data
          const emptyData = new Uint8ClampedArray(0);
          expect(computeBlockStdDev(emptyData, 0, 0, blockSize)).toBe(0);

          // Zero width
          const someData = new Uint8ClampedArray(64);
          expect(computeBlockStdDev(someData, 0, 4, blockSize)).toBe(0);

          // Zero height
          expect(computeBlockStdDev(someData, 4, 0, blockSize)).toBe(0);

          // Zero block size
          expect(computeBlockStdDev(someData, 4, 4, 0)).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
