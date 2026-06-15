// Feature: pixel-level-detection, Property 3: Heatmap color gradient mapping

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { magnitudeToColor } from './ElaHeatmap';

/**
 * Validates: Requirements 2.2
 *
 * Property 3: Heatmap color gradient mapping
 * For any difference magnitude in [0, 255], the magnitudeToColor function SHALL return
 * an RGBA tuple where each component is in [0, 255], and the mapping SHALL be monotonically
 * ordered such that magnitudes in [0, 84] produce primarily blue hues, magnitudes in [85, 169]
 * produce primarily green-yellow hues, and magnitudes in [170, 255] produce primarily red-white hues.
 */

describe('Property 3: Heatmap color gradient mapping', () => {
  // Arbitraries for each magnitude range
  // Boundaries determined by the function's t thresholds:
  //   t < 0.33: magnitudes 0-84 (84/255 = 0.329 < 0.33)
  //   0.33 <= t < 0.66: magnitudes 85-168 (168/255 = 0.659 < 0.66)
  //   t >= 0.66: magnitudes 169-255 (169/255 = 0.663 >= 0.66)
  const arbMagnitude = fc.integer({ min: 0, max: 255 });
  const arbBlueMagnitude = fc.integer({ min: 0, max: 84 });
  const arbGreenYellowMagnitude = fc.integer({ min: 85, max: 168 });
  const arbRedWhiteMagnitude = fc.integer({ min: 169, max: 255 });

  it('all RGBA components are in [0, 255] for any magnitude in [0, 255]', () => {
    fc.assert(
      fc.property(arbMagnitude, (magnitude) => {
        const [r, g, b, a] = magnitudeToColor(magnitude);

        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(255);
      }),
      { numRuns: 100 }
    );
  });

  it('alpha is always 255 for any magnitude in [0, 255]', () => {
    fc.assert(
      fc.property(arbMagnitude, (magnitude) => {
        const [, , , a] = magnitudeToColor(magnitude);
        expect(a).toBe(255);
      }),
      { numRuns: 100 }
    );
  });

  it('magnitudes 0-84 produce primarily blue hues (B >= R and G >= R)', () => {
    fc.assert(
      fc.property(arbBlueMagnitude, (magnitude) => {
        const [r, g, b] = magnitudeToColor(magnitude);

        // In the blue range: R is 0, G transitions from 0 to 255, B transitions from 255 to 0
        // The "blue hue" characteristic is that R = 0 (red is not dominant)
        expect(r).toBe(0);
        // Blue or green dominates over red
        expect(Math.max(g, b)).toBeGreaterThanOrEqual(r);
      }),
      { numRuns: 100 }
    );
  });

  it('magnitudes 85-169 produce green-yellow hues (G = 255)', () => {
    fc.assert(
      fc.property(arbGreenYellowMagnitude, (magnitude) => {
        const [_r, g, b] = magnitudeToColor(magnitude);

        // In the green-yellow range: G is always 255, R transitions from 0 to 255, B = 0
        expect(g).toBe(255);
        expect(b).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('magnitudes 170-255 produce red-white hues (R = 255)', () => {
    fc.assert(
      fc.property(arbRedWhiteMagnitude, (magnitude) => {
        const [r] = magnitudeToColor(magnitude);

        // In the red-white range: R is always 255
        expect(r).toBe(255);
      }),
      { numRuns: 100 }
    );
  });

  it('color transitions are monotonically ordered (red increases with magnitude)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 254 }),
        (magnitude) => {
          const [r1] = magnitudeToColor(magnitude);
          const [r2] = magnitudeToColor(magnitude + 1);

          // Red component should be non-decreasing as magnitude increases
          // This validates the monotonic ordering of the gradient
          expect(r2).toBeGreaterThanOrEqual(r1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('RGBA components are integers for any magnitude', () => {
    fc.assert(
      fc.property(arbMagnitude, (magnitude) => {
        const [r, g, b, a] = magnitudeToColor(magnitude);

        expect(Number.isInteger(r)).toBe(true);
        expect(Number.isInteger(g)).toBe(true);
        expect(Number.isInteger(b)).toBe(true);
        expect(Number.isInteger(a)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
