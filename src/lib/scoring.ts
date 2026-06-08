import {
  DetectionSignal,
  SignalType,
  ScoringResult,
  ScoringBreakdownEntry,
  Verdict,
  MAX_DEDUCTIONS,
} from './types';

/**
 * All signal types in the system, used to ensure the breakdown
 * always contains all 6 types regardless of trigger status.
 */
const ALL_SIGNAL_TYPES: SignalType[] = [
  'SOFTWARE_FINGERPRINT',
  'MISSING_EXIF',
  'TIMESTAMP_INCONSISTENCY',
  'FILE_SIZE_ANOMALY',
  'COLOR_PROFILE_ABNORMALITY',
  'MISSING_GPS',
];

/**
 * Maps a numeric score to its corresponding verdict category.
 * - score >= 70 → GENUINE
 * - 40 <= score <= 69 → SUSPICIOUS
 * - score < 40 → LIKELY SYNTHETIC
 */
function mapScoreToVerdict(score: number): Verdict {
  if (score >= 70) return 'GENUINE';
  if (score >= 40) return 'SUSPICIOUS';
  return 'LIKELY SYNTHETIC';
}

/**
 * Computes the authenticity score from a set of detection signals.
 *
 * Algorithm:
 * 1. Start from base score of 100
 * 2. For each signal type, find all signals of that type
 * 3. Deduplicate by taking only the highest severity signal per type
 * 4. Deduction = round(MAX_DEDUCTIONS[type] × highest_severity)
 * 5. Subtract deduction from score
 * 6. Clamp final score to [0, 100]
 * 7. Map score to verdict
 * 8. Produce breakdown with all 6 signal types
 *
 * @param signals - Array of detection signals produced by the Detection Engine
 * @returns ScoringResult with score, verdict, signals, and breakdown
 */
export function computeScore(signals: DetectionSignal[]): ScoringResult {
  let score = 100;
  const breakdown: ScoringBreakdownEntry[] = [];

  for (const signalType of ALL_SIGNAL_TYPES) {
    const signalsOfType = signals.filter((s) => s.type === signalType);
    const maxDeduction = MAX_DEDUCTIONS[signalType];

    if (signalsOfType.length > 0) {
      const highestSeverity = Math.max(
        ...signalsOfType.map((s) => s.severity)
      );
      const deduction = Math.round(maxDeduction * highestSeverity);
      score -= deduction;

      breakdown.push({
        signalType,
        triggered: true,
        pointsDeducted: deduction,
        maxDeduction,
      });
    } else {
      breakdown.push({
        signalType,
        triggered: false,
        pointsDeducted: 0,
        maxDeduction,
      });
    }
  }

  // Clamp score to [0, 100]
  score = Math.max(0, score);

  const verdict = mapScoreToVerdict(score);

  return {
    score,
    verdict,
    signals,
    breakdown,
  };
}
