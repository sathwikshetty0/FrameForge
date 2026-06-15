// Feature: pixel-level-detection, Property 6: PIXEL_ANALYSIS signal composition
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { combineSignals } from './pixel-analysis-engine';
import { ElaResult, HistogramResult } from './types';

/**
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 *
 * Property 6: PIXEL_ANALYSIS signal composition
 * For any ELA result (or null) and Histogram result where at least one has severity > 0,
 * the combineSignals function SHALL produce exactly one signal of type PIXEL_ANALYSIS
 * whose severity equals max(elaSeverity, histogramSeverity), whose triggerField identifies
 * the sub-analysis with higher severity, and whose description contains text from both
 * non-zero sub-analyses separated by a delimiter. When both severities are 0 (or ELA is
 * null with histogram severity 0), no signal SHALL be produced.
 */

/**
 * Arbitrary: generates an ElaResult with a given severity.
 * blockStdDev and other fields are generated with reasonable ranges.
 */
function arbElaResult(severityArb: fc.Arbitrary<number>): fc.Arbitrary<ElaResult> {
  return fc.record({
    meanDifference: fc.double({ min: 0, max: 255, noNaN: true }),
    blockStdDev: fc.double({ min: 0, max: 100, noNaN: true }),
    severity: severityArb,
    differenceData: fc.constant(new Uint8ClampedArray(16)), // minimal placeholder
    width: fc.constant(4),
    height: fc.constant(1),
  });
}

/**
 * Arbitrary: generates a HistogramResult with a given severity.
 */
function arbHistogramResult(severityArb: fc.Arbitrary<number>): fc.Arbitrary<HistogramResult> {
  return fc.record({
    redHistogram: fc.constant(new Array(256).fill(0)),
    greenHistogram: fc.constant(new Array(256).fill(0)),
    blueHistogram: fc.constant(new Array(256).fill(0)),
    redSmoothness: fc.double({ min: 0, max: 1000, noNaN: true }),
    greenSmoothness: fc.double({ min: 0, max: 1000, noNaN: true }),
    blueSmoothness: fc.double({ min: 0, max: 1000, noNaN: true }),
    severity: severityArb,
  });
}

/** Severity in the range (0, 1] - strictly positive */
const positiveSeverityArb = fc.double({ min: 0.001, max: 1.0, noNaN: true });

/** Severity exactly 0 */
const zeroSeverityArb = fc.constant(0);

/** Severity in the range [0, 1] */
const anySeverityArb = fc.double({ min: 0, max: 1.0, noNaN: true });

describe('Pixel Analysis Engine - Property 6: PIXEL_ANALYSIS signal composition', () => {
  it('produces a signal of type PIXEL_ANALYSIS when at least one severity > 0', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // ELA non-null with positive severity, histogram any severity
          fc.tuple(arbElaResult(positiveSeverityArb), arbHistogramResult(anySeverityArb)),
          // ELA any severity, histogram positive severity
          fc.tuple(arbElaResult(anySeverityArb), arbHistogramResult(positiveSeverityArb)),
          // Both positive
          fc.tuple(arbElaResult(positiveSeverityArb), arbHistogramResult(positiveSeverityArb))
        ),
        ([ela, histogram]) => {
          // Pre-condition: at least one severity > 0
          fc.pre(ela.severity > 0 || histogram.severity > 0);

          const signal = combineSignals(ela, histogram);

          expect(signal).not.toBeNull();
          expect(signal!.type).toBe('PIXEL_ANALYSIS');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('signal severity equals max(elaSeverity, histSeverity)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(arbElaResult(positiveSeverityArb), arbHistogramResult(anySeverityArb)),
          fc.tuple(arbElaResult(anySeverityArb), arbHistogramResult(positiveSeverityArb))
        ),
        ([ela, histogram]) => {
          fc.pre(ela.severity > 0 || histogram.severity > 0);

          const signal = combineSignals(ela, histogram);

          expect(signal).not.toBeNull();
          const expectedSeverity = Math.max(ela.severity, histogram.severity);
          expect(signal!.severity).toBeCloseTo(expectedSeverity, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('triggerField is "ela" when elaSeverity >= histSeverity, "histogram" otherwise', () => {
    fc.assert(
      fc.property(
        arbElaResult(anySeverityArb),
        arbHistogramResult(anySeverityArb),
        (ela, histogram) => {
          fc.pre(ela.severity > 0 || histogram.severity > 0);

          const signal = combineSignals(ela, histogram);

          expect(signal).not.toBeNull();
          if (ela.severity >= histogram.severity) {
            expect(signal!.triggerField).toBe('ela');
          } else {
            expect(signal!.triggerField).toBe('histogram');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('description contains text from both non-zero sub-analyses separated by " | "', () => {
    fc.assert(
      fc.property(
        arbElaResult(positiveSeverityArb),
        arbHistogramResult(positiveSeverityArb),
        (ela, histogram) => {
          const signal = combineSignals(ela, histogram);

          expect(signal).not.toBeNull();
          // Both have severity > 0, so description should contain both parts with delimiter
          expect(signal!.description).toContain(' | ');
          expect(signal!.description).toContain('ELA:');
          expect(signal!.description).toContain('Histogram:');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('description contains only ELA text when histogram severity is 0', () => {
    fc.assert(
      fc.property(
        arbElaResult(positiveSeverityArb),
        arbHistogramResult(zeroSeverityArb),
        (ela, histogram) => {
          const signal = combineSignals(ela, histogram);

          expect(signal).not.toBeNull();
          expect(signal!.description).toContain('ELA:');
          expect(signal!.description).not.toContain('Histogram:');
          expect(signal!.description).not.toContain(' | ');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('description contains only Histogram text when ELA severity is 0', () => {
    fc.assert(
      fc.property(
        arbElaResult(zeroSeverityArb),
        arbHistogramResult(positiveSeverityArb),
        (ela, histogram) => {
          const signal = combineSignals(ela, histogram);

          expect(signal).not.toBeNull();
          expect(signal!.description).toContain('Histogram:');
          expect(signal!.description).not.toContain('ELA:');
          expect(signal!.description).not.toContain(' | ');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns null when both severities are 0', () => {
    fc.assert(
      fc.property(
        arbElaResult(zeroSeverityArb),
        arbHistogramResult(zeroSeverityArb),
        (ela, histogram) => {
          const signal = combineSignals(ela, histogram);
          expect(signal).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns null when ELA is null and histogram severity is 0', () => {
    fc.assert(
      fc.property(
        arbHistogramResult(zeroSeverityArb),
        (histogram) => {
          const signal = combineSignals(null, histogram);
          expect(signal).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('produces signal using histogram only when ELA is null and histogram severity > 0', () => {
    fc.assert(
      fc.property(
        arbHistogramResult(positiveSeverityArb),
        (histogram) => {
          const signal = combineSignals(null, histogram);

          expect(signal).not.toBeNull();
          expect(signal!.type).toBe('PIXEL_ANALYSIS');
          expect(signal!.severity).toBeCloseTo(histogram.severity, 10);
          expect(signal!.triggerField).toBe('histogram');
          expect(signal!.description).toContain('Histogram:');
          expect(signal!.description).not.toContain('ELA:');
          expect(signal!.description).not.toContain(' | ');
        }
      ),
      { numRuns: 100 }
    );
  });
});
