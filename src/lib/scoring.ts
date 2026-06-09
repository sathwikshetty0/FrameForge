import {
  DetectionSignal,
  SignalType,
  ScoringResult,
  ScoringBreakdownEntry,
  Verdict,
  ImageSource,
  MAX_DEDUCTIONS,
  AI_SOFTWARE_KEYWORDS,
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
 * Determines the likely source/origin of the image based on signals and metadata.
 */
function determineSource(signals: DetectionSignal[]): ImageSource {
  // Check for AI software fingerprint
  const softwareSignal = signals.find((s) => s.type === 'SOFTWARE_FINGERPRINT');
  if (softwareSignal) {
    // Extract the matched keyword from the description
    const matchedKeyword = AI_SOFTWARE_KEYWORDS.find((kw) =>
      softwareSignal.description.toLowerCase().includes(kw.toLowerCase())
    );
    const label = matchedKeyword
      ? matchedKeyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'AI Generator';
    return {
      type: 'ai_generated',
      label: `AI Generated (${label})`,
      confidence: 'high',
    };
  }

  // Check if many signals suggest synthetic origin
  const missingExif = signals.find((s) => s.type === 'MISSING_EXIF');
  const missingGps = signals.find((s) => s.type === 'MISSING_GPS');
  const timestampIssue = signals.find((s) => s.type === 'TIMESTAMP_INCONSISTENCY');

  if (missingExif && missingExif.severity >= 0.66 && missingGps) {
    return {
      type: 'ai_generated',
      label: 'Likely AI Generated (no camera metadata)',
      confidence: 'medium',
    };
  }

  // Check for editing software (timestamp issues + some EXIF present)
  if (timestampIssue && timestampIssue.severity > 0.5 && !missingExif) {
    return {
      type: 'edited',
      label: 'Edited/Post-processed image',
      confidence: 'medium',
    };
  }

  // If no significant signals, it's likely from a camera
  if (signals.length === 0) {
    return {
      type: 'camera',
      label: 'Camera/Device capture',
      confidence: 'high',
    };
  }

  // Minor signals but not enough to identify AI
  if (signals.length <= 2 && !missingExif && !softwareSignal) {
    return {
      type: 'camera',
      label: 'Camera/Device capture (minor anomalies)',
      confidence: 'medium',
    };
  }

  return {
    type: 'unknown',
    label: 'Unknown origin',
    confidence: 'low',
  };
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
 * 8. Determine image source
 * 9. Produce breakdown with all 6 signal types
 *
 * @param signals - Array of detection signals produced by the Detection Engine
 * @returns ScoringResult with score, verdict, source, signals, and breakdown
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
  const source = determineSource(signals);

  return {
    score,
    verdict,
    source,
    signals,
    breakdown,
  };
}
