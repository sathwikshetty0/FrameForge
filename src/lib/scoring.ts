import {
  DetectionSignal,
  SignalType,
  ScoringResult,
  ScoringBreakdownEntry,
  Verdict,
  ImageSource,
  MetadataResult,
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
 * Uses camera make/model when available to identify the device.
 */
function determineSource(signals: DetectionSignal[], metadata?: MetadataResult | null): ImageSource {
  // Check for AI software fingerprint — strongest signal
  const softwareSignal = signals.find((s) => s.type === 'SOFTWARE_FINGERPRINT');
  if (softwareSignal) {
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

  // If camera make or model is present, it's from a camera regardless of other signals
  const hasCameraMake = metadata?.cameraMake?.status === 'present' && metadata.cameraMake.value;
  const hasCameraModel = metadata?.cameraModel?.status === 'present' && metadata.cameraModel.value;

  if (hasCameraMake || hasCameraModel) {
    const makeModel = [
      hasCameraMake ? metadata!.cameraMake.value : null,
      hasCameraModel ? metadata!.cameraModel.value : null,
    ].filter(Boolean).join(' ');

    // Check for editing indicators (timestamp issues but camera metadata present)
    const timestampIssue = signals.find((s) => s.type === 'TIMESTAMP_INCONSISTENCY');
    if (timestampIssue && timestampIssue.severity > 0.5) {
      return {
        type: 'edited',
        label: `${makeModel} (edited/post-processed)`,
        confidence: 'medium',
      };
    }

    return {
      type: 'camera',
      label: makeModel,
      confidence: 'high',
    };
  }

  // No camera metadata at all — check if signals suggest synthetic origin
  const missingExif = signals.find((s) => s.type === 'MISSING_EXIF');
  const missingGps = signals.find((s) => s.type === 'MISSING_GPS');

  if (missingExif && missingExif.severity >= 0.66 && missingGps) {
    return {
      type: 'ai_generated',
      label: 'Likely AI Generated (no camera metadata)',
      confidence: 'medium',
    };
  }

  if (missingExif && missingExif.severity >= 0.33) {
    return {
      type: 'unknown',
      label: 'Unknown origin (limited metadata)',
      confidence: 'low',
    };
  }

  // No significant signals and no camera info
  if (signals.length === 0) {
    return {
      type: 'camera',
      label: 'Camera/Device capture',
      confidence: 'high',
    };
  }

  // Some signals but not enough to conclusively identify
  return {
    type: 'camera',
    label: 'Camera/Device capture (minor anomalies)',
    confidence: 'medium',
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
export function computeScore(signals: DetectionSignal[], metadata?: MetadataResult | null): ScoringResult {
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
  const source = determineSource(signals, metadata);

  return {
    score,
    verdict,
    source,
    signals,
    breakdown,
  };
}
