import {
  MetadataResult,
  MetadataField,
  ScoringResult,
  SignalType,
} from './types';

/**
 * Human-readable labels for each signal type used in the report output.
 */
const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  SOFTWARE_FINGERPRINT: 'Software Fingerprint',
  MISSING_EXIF: 'Missing EXIF',
  TIMESTAMP_INCONSISTENCY: 'Timestamp Inconsistency',
  FILE_SIZE_ANOMALY: 'File Size Anomaly',
  COLOR_PROFILE_ABNORMALITY: 'Color Profile Abnormality',
  MISSING_GPS: 'Missing GPS',
};

/**
 * All signal types in display order.
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
 * Formats a MetadataField value for display in the report.
 * Returns "MISSING" for absent fields, "CORRUPT" for corrupt fields,
 * and the formatted value with appropriate units for present fields.
 */
function formatFieldValue<T>(
  field: MetadataField<T>,
  unit: string,
  formatter?: (value: T) => string
): string {
  if (field.status === 'absent') return 'MISSING';
  if (field.status === 'corrupt') return 'CORRUPT';
  if (field.value === null) return 'MISSING';

  if (formatter) {
    return formatter(field.value);
  }

  if (unit) {
    return `${field.value}${unit}`;
  }

  return String(field.value);
}

/**
 * Formats a Date value as ISO 8601 string.
 */
function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Formats the complete forensic report as a plain-text summary.
 *
 * The report includes sections for:
 * - Header (file name, analysis timestamp)
 * - Metadata (all extracted fields with values or MISSING/CORRUPT)
 * - Detection Signals (each signal type with TRIGGERED or CLEAR status)
 * - Scoring Breakdown (per-signal deductions with max values)
 * - Verdict (final score and category)
 *
 * @param metadata - The extracted metadata result from the EXIF parser
 * @param result - The scoring result from the detection engine
 * @param fileName - The name of the analyzed file
 * @param analysisTimestamp - The date/time when analysis was performed
 * @returns Formatted plain-text report string
 */
export function formatReport(
  metadata: MetadataResult,
  result: ScoringResult,
  fileName: string,
  analysisTimestamp: Date
): string {
  const lines: string[] = [];

  // --- Header ---
  lines.push('=== FRAMEFORGE VERIFY - FORENSIC REPORT ===');
  lines.push(`File: ${fileName}`);
  lines.push(`Analyzed: ${analysisTimestamp.toISOString()}`);
  lines.push('');

  // --- Image Source ---
  lines.push('--- IMAGE SOURCE ---');
  lines.push(`Source: ${result.source.label}`);
  lines.push(`Type: ${result.source.type}`);
  lines.push(`Confidence: ${result.source.confidence}`);
  lines.push('');

  // --- Metadata ---
  lines.push('--- METADATA ---');
  lines.push(`Camera Make: ${formatFieldValue(metadata.cameraMake, '')}`);
  lines.push(`Camera Model: ${formatFieldValue(metadata.cameraModel, '')}`);
  lines.push(`Lens Make: ${formatFieldValue(metadata.lensMake, '')}`);
  lines.push(`Lens Model: ${formatFieldValue(metadata.lensModel, '')}`);
  lines.push(`Focal Length: ${formatFieldValue(metadata.focalLength, 'mm')}`);
  lines.push(
    `Date Time Original: ${formatFieldValue(metadata.dateTimeOriginal, '', (v) => formatDate(v as unknown as Date))}`
  );
  lines.push(
    `Modify Date: ${formatFieldValue(metadata.modifyDate, '', (v) => formatDate(v as unknown as Date))}`
  );
  lines.push(
    `GPS Latitude: ${formatFieldValue(metadata.gpsLatitude, '°')}`
  );
  lines.push(
    `GPS Longitude: ${formatFieldValue(metadata.gpsLongitude, '°')}`
  );
  lines.push(
    `GPS Altitude: ${formatFieldValue(metadata.gpsAltitude, 'm')}`
  );
  lines.push(`F-Number: ${formatFieldValue(metadata.fNumber, '', (v) => `f/${v}`)}`);
  lines.push(`ISO: ${formatFieldValue(metadata.iso, '')}`);
  lines.push(
    `Exposure Time: ${formatFieldValue(metadata.exposureTime, 's')}`
  );
  lines.push(`Software: ${formatFieldValue(metadata.software, '')}`);
  lines.push(
    `Image Width: ${formatFieldValue(metadata.imageWidth, 'px')}`
  );
  lines.push(
    `Image Height: ${formatFieldValue(metadata.imageHeight, 'px')}`
  );
  lines.push(
    `Bit Depth: ${formatFieldValue(metadata.bitDepth, ' bits')}`
  );
  lines.push(`Color Profile: ${formatFieldValue(metadata.colorProfile, '')}`);
  lines.push('');

  // --- Detection Signals ---
  lines.push('--- DETECTION SIGNALS ---');
  for (const signalType of ALL_SIGNAL_TYPES) {
    const triggeredSignals = result.signals.filter(
      (s) => s.type === signalType
    );
    if (triggeredSignals.length > 0) {
      const description = triggeredSignals[0].description;
      lines.push(`[TRIGGERED] ${signalType}: ${description}`);
    } else {
      lines.push(`[CLEAR] ${signalType}`);
    }
  }
  lines.push('');

  // --- Scoring Breakdown ---
  lines.push('--- SCORING BREAKDOWN ---');
  for (const entry of result.breakdown) {
    const label = SIGNAL_TYPE_LABELS[entry.signalType];
    lines.push(
      `${label}: -${entry.pointsDeducted} (max -${entry.maxDeduction})`
    );
  }
  lines.push('');

  // --- Verdict ---
  lines.push('--- VERDICT ---');
  lines.push(`Authenticity Score: ${result.score}/100`);
  lines.push(`Verdict: ${result.verdict}`);
  lines.push('========================================');

  return lines.join('\n');
}
