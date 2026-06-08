// Feature: frameforge-verify, Property 11: Score range invariant
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeScore } from './scoring';
import { DetectionSignal, SignalType, MAX_DEDUCTIONS } from './types';

/**
 * Validates: Requirements 4.1, 4.2
 *
 * Property 11: Score range invariant
 * For any set of detection signals, the computeScore function SHALL produce
 * an integer score in the range [0, 100] inclusive.
 */

const VALID_SIGNAL_TYPES: SignalType[] = [
  'SOFTWARE_FINGERPRINT',
  'MISSING_EXIF',
  'TIMESTAMP_INCONSISTENCY',
  'FILE_SIZE_ANOMALY',
  'COLOR_PROFILE_ABNORMALITY',
  'MISSING_GPS',
];

/**
 * Arbitrary generator for a single DetectionSignal with:
 * - Random type from the 6 valid types
 * - Random severity in [0, 1]
 * - Random triggerField string
 * - Random description string
 */
const arbDetectionSignal: fc.Arbitrary<DetectionSignal> = fc.record({
  type: fc.constantFrom(...VALID_SIGNAL_TYPES),
  severity: fc.double({ min: 0, max: 1, noNaN: true }),
  triggerField: fc.string({ minLength: 1 }),
  description: fc.string({ minLength: 1 }),
});

/**
 * Arbitrary generator for an array of DetectionSignals (0 to 20 signals).
 */
const arbDetectionSignals: fc.Arbitrary<DetectionSignal[]> = fc.array(
  arbDetectionSignal,
  { minLength: 0, maxLength: 20 }
);

describe('Scoring - Property 11: Score range invariant', () => {
  it('computeScore always returns an integer score in [0, 100]', () => {
    fc.assert(
      fc.property(arbDetectionSignals, (signals) => {
        const result = computeScore(signals);

        // Score must be an integer
        expect(Number.isInteger(result.score)).toBe(true);

        // Score must be >= 0
        expect(result.score).toBeGreaterThanOrEqual(0);

        // Score must be <= 100
        expect(result.score).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: frameforge-verify, Property 13: Same-type signal deduplication

/**
 * Validates: Requirements 4.4
 *
 * Property 13: Same-type signal deduplication
 * For any set of signals containing multiple signals of the same type,
 * the scoring function SHALL apply the deduction for that type only once,
 * using the highest severity instance.
 */

describe('Scoring - Property 13: Same-type signal deduplication', () => {
  it('only one deduction is applied per type using the highest severity', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SIGNAL_TYPES),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
          minLength: 2,
          maxLength: 10,
        }),
        (signalType, severities) => {
          // Create multiple signals of the same type with varying severities
          const signals: DetectionSignal[] = severities.map((severity) => ({
            type: signalType,
            severity,
            triggerField: 'testField',
            description: 'test signal',
          }));

          const result = computeScore(signals);

          // Find the breakdown entry for this signal type
          const entry = result.breakdown.find(
            (b) => b.signalType === signalType
          );
          expect(entry).toBeDefined();
          expect(entry!.triggered).toBe(true);

          // The deduction should be based on the highest severity only
          const highestSeverity = Math.max(...severities);
          const expectedDeduction = Math.round(
            MAX_DEDUCTIONS[signalType] * highestSeverity
          );

          expect(entry!.pointsDeducted).toBe(expectedDeduction);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: frameforge-verify, Property 15: Scoring breakdown completeness

/**
 * Validates: Requirements 4.8
 *
 * Property 15: Scoring breakdown completeness
 * For any scoring result, the breakdown SHALL list all 6 signal types with their
 * triggered status, points deducted, and maximum possible deduction — regardless
 * of whether any signals of that type were triggered.
 */

describe('Scoring - Property 15: Scoring breakdown completeness', () => {
  it('breakdown always contains all 6 signal types with triggered/deducted/max fields', () => {
    fc.assert(
      fc.property(arbDetectionSignals, (signals) => {
        const result = computeScore(signals);

        // Breakdown must have exactly 6 entries
        expect(result.breakdown).toHaveLength(6);

        // Extract signal types from the breakdown
        const breakdownTypes = result.breakdown.map((entry) => entry.signalType);

        // All 6 signal types must be represented
        for (const signalType of VALID_SIGNAL_TYPES) {
          expect(breakdownTypes).toContain(signalType);
        }

        // Each entry must have the required fields with correct types/constraints
        for (const entry of result.breakdown) {
          // signalType must be one of the 6 valid types
          expect(VALID_SIGNAL_TYPES).toContain(entry.signalType);

          // triggered must be a boolean
          expect(typeof entry.triggered).toBe('boolean');

          // pointsDeducted must be a number >= 0
          expect(typeof entry.pointsDeducted).toBe('number');
          expect(entry.pointsDeducted).toBeGreaterThanOrEqual(0);

          // maxDeduction must be a number > 0
          expect(typeof entry.maxDeduction).toBe('number');
          expect(entry.maxDeduction).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: frameforge-verify, Property 12: Per-signal deduction capping

/**
 * Validates: Requirements 4.3
 *
 * Property 12: Per-signal deduction capping
 * For any signal with severity ≤ 1.0, the deduction applied for that signal's type
 * SHALL NOT exceed the defined maximum deduction for that type.
 */

describe('Scoring - Property 12: Per-signal deduction capping', () => {
  it('deduction for each signal type never exceeds its defined maximum', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom(...VALID_SIGNAL_TYPES),
          severity: fc.double({ min: 0, max: 1, noNaN: true }),
          triggerField: fc.string({ minLength: 1 }),
          description: fc.string({ minLength: 1 }),
        }),
        (signal: DetectionSignal) => {
          const result = computeScore([signal]);

          const entry = result.breakdown.find(
            (b) => b.signalType === signal.type
          );

          // The entry for this signal type must exist
          expect(entry).toBeDefined();

          // Points deducted must not exceed the max deduction for this type
          expect(entry!.pointsDeducted).toBeLessThanOrEqual(
            MAX_DEDUCTIONS[signal.type]
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: frameforge-verify, Property 14: Verdict mapping

/**
 * Validates: Requirements 4.5, 4.6, 4.7
 *
 * Property 14: Verdict mapping
 * For any authenticity score, the verdict SHALL be:
 * - GENUINE when score >= 70
 * - SUSPICIOUS when 40 <= score <= 69
 * - LIKELY SYNTHETIC when score < 40
 */
describe('Scoring - Property 14: Verdict mapping', () => {
  it('verdict is GENUINE iff score >= 70, SUSPICIOUS iff 40-69, LIKELY SYNTHETIC iff < 40', () => {
    fc.assert(
      fc.property(arbDetectionSignals, (signals) => {
        const result = computeScore(signals);
        const { score, verdict } = result;

        if (score >= 70) {
          expect(verdict).toBe('GENUINE');
        } else if (score >= 40) {
          expect(verdict).toBe('SUSPICIOUS');
        } else {
          expect(verdict).toBe('LIKELY SYNTHETIC');
        }
      }),
      { numRuns: 100 }
    );
  });
});
