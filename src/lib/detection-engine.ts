import {
  MetadataResult,
  DetectionSignal,
  AI_SOFTWARE_KEYWORDS,
} from './types';
import { analyzePixels } from './pixel-analysis-engine';
import { parsePngChunks, detectAiMetadata } from './png-metadata-parser';
import { detectFilenamePattern } from './filename-detector';

/**
 * Evaluates metadata for AI/synthetic indicators and produces detection signals.
 * This is a pure function module with no side effects.
 *
 * @param metadata - The extracted metadata from the image
 * @param fileSize - The actual file size in bytes
 * @param imageData - Optional ImageData for pixel-level analysis (ELA + Histogram)
 * @param fileBuffer - Optional ArrayBuffer for PNG metadata chunk parsing
 * @param filename - Optional filename for AI tool pattern detection
 * @returns An array of triggered DetectionSignal objects
 */
export async function analyze(
  metadata: MetadataResult,
  fileSize: number,
  imageData?: ImageData | null,
  fileBuffer?: ArrayBuffer | null,
  filename?: string
): Promise<DetectionSignal[]> {
  const signals: DetectionSignal[] = [];

  const missingExif = evaluateMissingExif(metadata);
  if (missingExif) signals.push(missingExif);

  const softwareFingerprint = evaluateSoftwareFingerprint(metadata);
  if (softwareFingerprint) signals.push(softwareFingerprint);

  const timestampSignals = evaluateTimestampInconsistency(metadata);
  signals.push(...timestampSignals);

  const fileSizeAnomaly = evaluateFileSizeAnomaly(metadata, fileSize);
  if (fileSizeAnomaly) signals.push(fileSizeAnomaly);

  const colorProfileSignals = evaluateColorProfileAbnormality(metadata);
  if (colorProfileSignals) signals.push(colorProfileSignals);

  const missingGps = evaluateMissingGps(metadata);
  if (missingGps) signals.push(missingGps);

  // Pixel-level analysis (ELA + Histogram)
  if (imageData) {
    const pixelResult = await analyzePixels({ imageData });
    if (pixelResult.signal) {
      signals.push(pixelResult.signal);
    }
  }

  // PNG metadata chunk parsing
  if (fileBuffer) {
    const chunks = parsePngChunks(fileBuffer);
    const pngSignal = detectAiMetadata(chunks);
    if (pngSignal) {
      signals.push(pngSignal);
    }
  }

  // Filename pattern detection
  if (filename) {
    const filenameSignal = detectFilenamePattern(filename);
    if (filenameSignal) {
      signals.push(filenameSignal);
    }
  }

  return signals;
}

/**
 * MISSING_EXIF signal: Count present fields from the 6 core fields.
 * Trigger if fewer than 3 are present.
 * Severity = (3 - presentCount) / 3
 */
function evaluateMissingExif(metadata: MetadataResult): DetectionSignal | null {
  const coreFields = [
    metadata.cameraMake,
    metadata.cameraModel,
    metadata.dateTimeOriginal,
    metadata.exposureTime,
    metadata.fNumber,
    metadata.iso,
  ];

  const presentCount = coreFields.filter((field) => field.status === 'present').length;

  if (presentCount < 3) {
    const severity = (3 - presentCount) / 3;
    return {
      type: 'MISSING_EXIF',
      severity,
      triggerField: 'exifFields',
      description: `Only ${presentCount} of 6 core EXIF fields present (threshold: 3). Missing metadata suggests non-camera origin.`,
    };
  }

  return null;
}

/**
 * SOFTWARE_FINGERPRINT signal: Case-insensitive match of Software field
 * against AI_SOFTWARE_KEYWORDS. Severity 1.0 if matched.
 */
function evaluateSoftwareFingerprint(metadata: MetadataResult): DetectionSignal | null {
  if (metadata.software.status !== 'present' || metadata.software.value === null) {
    return null;
  }

  const softwareValue = metadata.software.value.toLowerCase();
  const matchedKeyword = AI_SOFTWARE_KEYWORDS.find((keyword) =>
    softwareValue.includes(keyword.toLowerCase())
  );

  if (matchedKeyword) {
    return {
      type: 'SOFTWARE_FINGERPRINT',
      severity: 1.0,
      triggerField: 'software',
      description: `Software field "${metadata.software.value}" matches known AI generator keyword "${matchedKeyword}".`,
    };
  }

  return null;
}

/**
 * TIMESTAMP_INCONSISTENCY signal:
 * - If both DateTimeOriginal and ModifyDate are present and differ by >24 hours,
 *   trigger with severity = min(1.0, hoursDiff / 720).
 * - If either timestamp is absent, trigger with severity 0.5.
 */
function evaluateTimestampInconsistency(metadata: MetadataResult): DetectionSignal[] {
  const signals: DetectionSignal[] = [];
  const dateOriginal = metadata.dateTimeOriginal;
  const modifyDate = metadata.modifyDate;

  const originalPresent = dateOriginal.status === 'present' && dateOriginal.value !== null;
  const modifyPresent = modifyDate.status === 'present' && modifyDate.value !== null;

  if (originalPresent && modifyPresent) {
    const diffMs = Math.abs(dateOriginal.value!.getTime() - modifyDate.value!.getTime());
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours > 24) {
      const severity = Math.min(1.0, diffHours / 720);
      signals.push({
        type: 'TIMESTAMP_INCONSISTENCY',
        severity,
        triggerField: 'modifyDate',
        description: `Timestamps differ by ${Math.round(diffHours)} hours. Large discrepancy suggests post-processing or fabrication.`,
      });
    }
  } else if (!originalPresent || !modifyPresent) {
    const missingField = !originalPresent ? 'dateTimeOriginal' : 'modifyDate';
    signals.push({
      type: 'TIMESTAMP_INCONSISTENCY',
      severity: 0.5,
      triggerField: missingField,
      description: `Timestamp field "${missingField}" is absent. Missing timestamps reduce provenance confidence.`,
    });
  }

  return signals;
}

/**
 * FILE_SIZE_ANOMALY signal:
 * Expected size = width × height × 3 (channels) × 1 (bytes per channel for 8-bit).
 * Ratio = fileSize / expectedSize.
 * Trigger if ratio < 0.2 or > 5.0.
 * Severity = min(1.0, abs(ratio - 1.0) / 4.0).
 */
function evaluateFileSizeAnomaly(
  metadata: MetadataResult,
  fileSize: number
): DetectionSignal | null {
  const width = metadata.imageWidth;
  const height = metadata.imageHeight;

  // Cannot evaluate without dimensions
  if (
    width.status !== 'present' ||
    width.value === null ||
    height.status !== 'present' ||
    height.value === null
  ) {
    return null;
  }

  const expectedSize = width.value * height.value * 3; // 3 channels, 1 byte per channel (8-bit)
  if (expectedSize === 0) {
    return null;
  }

  const ratio = fileSize / expectedSize;

  if (ratio < 0.2 || ratio > 5.0) {
    const severity = Math.min(1.0, Math.abs(ratio - 1.0) / 4.0);
    return {
      type: 'FILE_SIZE_ANOMALY',
      severity,
      triggerField: 'fileSize',
      description: `File size ratio ${ratio.toFixed(2)} (actual/expected) is outside normal range [0.2, 5.0]. May indicate synthetic generation or heavy manipulation.`,
    };
  }

  return null;
}

/**
 * COLOR_PROFILE_ABNORMALITY signal:
 * Trigger if color profile is absent OR bit depth is not 8 or 16.
 * Severity: 0.5 per condition met, max 1.0.
 */
function evaluateColorProfileAbnormality(metadata: MetadataResult): DetectionSignal | null {
  let conditionsMet = 0;
  const triggerFields: string[] = [];

  const profileAbsent = metadata.colorProfile.status !== 'present' || metadata.colorProfile.value === null;
  if (profileAbsent) {
    conditionsMet++;
    triggerFields.push('colorProfile');
  }

  const bitDepthAbnormal =
    metadata.bitDepth.status !== 'present' ||
    metadata.bitDepth.value === null ||
    (metadata.bitDepth.value !== 8 && metadata.bitDepth.value !== 16);
  if (bitDepthAbnormal) {
    conditionsMet++;
    triggerFields.push('bitDepth');
  }

  if (conditionsMet > 0) {
    const severity = Math.min(1.0, conditionsMet * 0.5);
    return {
      type: 'COLOR_PROFILE_ABNORMALITY',
      severity,
      triggerField: triggerFields[0],
      description: `Color profile abnormality detected: ${profileAbsent ? 'color profile absent' : ''}${profileAbsent && bitDepthAbnormal ? ', ' : ''}${bitDepthAbnormal ? `bit depth (${metadata.bitDepth.value ?? 'absent'}) is not standard 8 or 16` : ''}.`,
    };
  }

  return null;
}

/**
 * MISSING_GPS signal: If GPS latitude or longitude is absent, trigger.
 * Severity 1.0.
 */
function evaluateMissingGps(metadata: MetadataResult): DetectionSignal | null {
  const latAbsent = metadata.gpsLatitude.status !== 'present' || metadata.gpsLatitude.value === null;
  const lonAbsent = metadata.gpsLongitude.status !== 'present' || metadata.gpsLongitude.value === null;

  if (latAbsent || lonAbsent) {
    const missingField = latAbsent ? 'gpsLatitude' : 'gpsLongitude';
    return {
      type: 'MISSING_GPS',
      severity: 1.0,
      triggerField: missingField,
      description: `GPS ${latAbsent ? 'latitude' : 'longitude'} is absent. Dashcam images typically contain GPS data.`,
    };
  }

  return null;
}
