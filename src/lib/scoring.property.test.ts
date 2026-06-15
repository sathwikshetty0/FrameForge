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
  'PIXEL_ANALYSIS',
  'PNG_METADATA_AI',
  'FILENAME_PATTERN',
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
  it('breakdown always contains all 9 signal types with triggered/deducted/max fields', () => {
    fc.assert(
      fc.property(arbDetectionSignals, (signals) => {
        const result = computeScore(signals);

        // Breakdown must have exactly 9 entries
        expect(result.breakdown).toHaveLength(9);

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

// Feature: pixel-level-detection, Property 10: Extended scoring completeness and deduction

/**
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 *
 * Property 10: Extended scoring completeness and deduction
 * For any set of detection signals (including the new types PIXEL_ANALYSIS,
 * PNG_METADATA_AI, FILENAME_PATTERN), the computeScore function SHALL:
 * (a) produce a breakdown containing all 9 signal types regardless of which are triggered,
 * (b) apply deduction = round(maxDeduction × highestSeverity) for each triggered type
 *     using the correct max deduction values (PIXEL_ANALYSIS: 25, PNG_METADATA_AI: 35,
 *     FILENAME_PATTERN: 30),
 * (c) produce a final score in [0, 100].
 */

const EXTENDED_SIGNAL_TYPES: SignalType[] = [
  'PIXEL_ANALYSIS',
  'PNG_METADATA_AI',
  'FILENAME_PATTERN',
];

/**
 * Arbitrary generator for detection signals restricted to the new extended types.
 */
const arbExtendedSignal: fc.Arbitrary<DetectionSignal> = fc.record({
  type: fc.constantFrom(...EXTENDED_SIGNAL_TYPES),
  severity: fc.double({ min: 0, max: 1, noNaN: true }),
  triggerField: fc.string({ minLength: 1 }),
  description: fc.string({ minLength: 1 }),
});

/**
 * Arbitrary generator for a mix of extended and original signal types.
 */
const arbMixedSignals: fc.Arbitrary<DetectionSignal[]> = fc.array(
  fc.record({
    type: fc.constantFrom(...VALID_SIGNAL_TYPES),
    severity: fc.double({ min: 0, max: 1, noNaN: true }),
    triggerField: fc.string({ minLength: 1 }),
    description: fc.string({ minLength: 1 }),
  }),
  { minLength: 0, maxLength: 20 }
);

describe('Scoring - Property 10: Extended scoring completeness and deduction', () => {
  it('MAX_DEDUCTIONS are correct for new signal types (PIXEL_ANALYSIS=25, PNG_METADATA_AI=35, FILENAME_PATTERN=30)', () => {
    // This is a static assertion but confirms the constants are wired correctly
    expect(MAX_DEDUCTIONS['PIXEL_ANALYSIS']).toBe(25);
    expect(MAX_DEDUCTIONS['PNG_METADATA_AI']).toBe(35);
    expect(MAX_DEDUCTIONS['FILENAME_PATTERN']).toBe(30);
  });

  it('breakdown always contains all 9 signal types including new types, regardless of triggered signals', () => {
    fc.assert(
      fc.property(arbMixedSignals, (signals) => {
        const result = computeScore(signals);

        // Breakdown must contain all 9 signal types
        expect(result.breakdown).toHaveLength(9);

        const breakdownTypes = result.breakdown.map((e) => e.signalType);

        // All three new signal types must appear in breakdown
        expect(breakdownTypes).toContain('PIXEL_ANALYSIS');
        expect(breakdownTypes).toContain('PNG_METADATA_AI');
        expect(breakdownTypes).toContain('FILENAME_PATTERN');

        // All original signal types must also appear
        expect(breakdownTypes).toContain('SOFTWARE_FINGERPRINT');
        expect(breakdownTypes).toContain('MISSING_EXIF');
        expect(breakdownTypes).toContain('TIMESTAMP_INCONSISTENCY');
        expect(breakdownTypes).toContain('FILE_SIZE_ANOMALY');
        expect(breakdownTypes).toContain('COLOR_PROFILE_ABNORMALITY');
        expect(breakdownTypes).toContain('MISSING_GPS');
      }),
      { numRuns: 100 }
    );
  });

  it('new types appear in breakdown as untriggered when no signals of those types are provided', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(
              'SOFTWARE_FINGERPRINT' as SignalType,
              'MISSING_EXIF' as SignalType,
              'TIMESTAMP_INCONSISTENCY' as SignalType,
              'FILE_SIZE_ANOMALY' as SignalType,
              'COLOR_PROFILE_ABNORMALITY' as SignalType,
              'MISSING_GPS' as SignalType
            ),
            severity: fc.double({ min: 0, max: 1, noNaN: true }),
            triggerField: fc.string({ minLength: 1 }),
            description: fc.string({ minLength: 1 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        (signals) => {
          const result = computeScore(signals);

          // The new signal types should still appear in the breakdown
          for (const extType of EXTENDED_SIGNAL_TYPES) {
            const entry = result.breakdown.find((e) => e.signalType === extType);
            expect(entry).toBeDefined();
            expect(entry!.triggered).toBe(false);
            expect(entry!.pointsDeducted).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deduction for each new signal type equals round(MAX_DEDUCTIONS[type] × highestSeverity)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXTENDED_SIGNAL_TYPES),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
          minLength: 1,
          maxLength: 5,
        }),
        (signalType, severities) => {
          const signals: DetectionSignal[] = severities.map((severity) => ({
            type: signalType,
            severity,
            triggerField: 'testField',
            description: 'test signal',
          }));

          const result = computeScore(signals);

          const entry = result.breakdown.find((e) => e.signalType === signalType);
          expect(entry).toBeDefined();
          expect(entry!.triggered).toBe(true);

          const highestSeverity = Math.max(...severities);
          const expectedDeduction = Math.round(MAX_DEDUCTIONS[signalType] * highestSeverity);

          expect(entry!.pointsDeducted).toBe(expectedDeduction);
          expect(entry!.maxDeduction).toBe(MAX_DEDUCTIONS[signalType]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('final score reflects deductions from new signal types and remains in [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.array(arbExtendedSignal, { minLength: 1, maxLength: 10 }),
        (signals) => {
          const result = computeScore(signals);

          // Score must be in [0, 100]
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);

          // Manually compute expected score
          let expectedScore = 100;
          for (const type of VALID_SIGNAL_TYPES) {
            const signalsOfType = signals.filter((s) => s.type === type);
            if (signalsOfType.length > 0) {
              const highestSeverity = Math.max(...signalsOfType.map((s) => s.severity));
              expectedScore -= Math.round(MAX_DEDUCTIONS[type] * highestSeverity);
            }
          }
          expectedScore = Math.max(0, expectedScore);

          expect(result.score).toBe(expectedScore);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('new signal types use the same deduction formula as existing signal types', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SIGNAL_TYPES),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        (signalType, severity) => {
          const signal: DetectionSignal = {
            type: signalType,
            severity,
            triggerField: 'testField',
            description: 'test signal',
          };

          const result = computeScore([signal]);

          const entry = result.breakdown.find((e) => e.signalType === signalType);
          expect(entry).toBeDefined();
          expect(entry!.triggered).toBe(true);

          // All types use the same formula: round(MAX_DEDUCTIONS[type] × severity)
          const expectedDeduction = Math.round(MAX_DEDUCTIONS[signalType] * severity);
          expect(entry!.pointsDeducted).toBe(expectedDeduction);

          // Score is 100 minus the single deduction (clamped)
          const expectedScore = Math.max(0, 100 - expectedDeduction);
          expect(result.score).toBe(expectedScore);
        }
      ),
      { numRuns: 100 }
    );
  });
});
