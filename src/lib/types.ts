// Core TypeScript interfaces and types for FrameForge Verify

/**
 * Represents a single metadata field extracted from EXIF data.
 * Each field tracks its value and extraction status.
 */
export interface MetadataField<T> {
  value: T | null;
  status: 'present' | 'absent' | 'corrupt';
}

/**
 * Complete metadata extraction result containing all fields
 * parsed from the image EXIF data.
 */
export interface MetadataResult {
  cameraMake: MetadataField<string>;
  cameraModel: MetadataField<string>;
  lensMake: MetadataField<string>;
  lensModel: MetadataField<string>;
  focalLength: MetadataField<number>;
  dateTimeOriginal: MetadataField<Date>;
  modifyDate: MetadataField<Date>;
  gpsLatitude: MetadataField<number>;
  gpsLongitude: MetadataField<number>;
  gpsAltitude: MetadataField<number>;
  fNumber: MetadataField<number>;
  iso: MetadataField<number>;
  exposureTime: MetadataField<number>;
  software: MetadataField<string>;
  imageWidth: MetadataField<number>;
  imageHeight: MetadataField<number>;
  bitDepth: MetadataField<number>;
  colorProfile: MetadataField<string>;
}

/**
 * A detection signal produced by the Detection Engine
 * when a suspicious indicator is found in the metadata.
 */
export interface DetectionSignal {
  type: SignalType;
  severity: number; // 0.0 to 1.0
  triggerField: string; // metadata field name that triggered it
  description: string;
}

/**
 * Types of detection signals the engine can produce.
 */
export type SignalType =
  | 'SOFTWARE_FINGERPRINT'
  | 'MISSING_EXIF'
  | 'TIMESTAMP_INCONSISTENCY'
  | 'FILE_SIZE_ANOMALY'
  | 'COLOR_PROFILE_ABNORMALITY'
  | 'MISSING_GPS';

/**
 * Complete scoring result including score, verdict,
 * triggered signals, and per-type breakdown.
 */
export interface ScoringResult {
  score: number; // 0–100 integer
  verdict: Verdict;
  source: ImageSource;
  signals: DetectionSignal[];
  breakdown: ScoringBreakdownEntry[];
}

/**
 * Identified source/origin of the image based on analysis.
 */
export interface ImageSource {
  type: 'camera' | 'ai_generated' | 'edited' | 'unknown';
  label: string; // e.g., "Canon EOS R5", "DALL-E", "Unknown origin"
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Entry in the scoring breakdown showing deduction details
 * for each signal type.
 */
export interface ScoringBreakdownEntry {
  signalType: SignalType;
  triggered: boolean;
  pointsDeducted: number;
  maxDeduction: number;
}

/**
 * Final verdict based on the authenticity score.
 */
export type Verdict = 'GENUINE' | 'SUSPICIOUS' | 'LIKELY SYNTHETIC';

/**
 * Pipeline processing state.
 */
export type PipelineState = 'IDLE' | 'LOADING' | 'SCANNING' | 'COMPLETE' | 'ERROR';

/**
 * Application-level state tracking the full analysis pipeline.
 */
export interface AppState {
  pipeline: PipelineState;
  file: File | null;
  thumbnail: string | null;
  metadata: MetadataResult | null;
  result: ScoringResult | null;
  error: AppError | null;
  scanStartTime: number | null;
}

/**
 * Application error with phase information for contextual messaging.
 */
export type AppError = {
  phase: 'upload' | 'parse' | 'detect' | 'library';
  message: string;
};

/**
 * Upload validation error with specific error type.
 */
export type UploadError = {
  type: 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE' | 'CORRUPT_IMAGE';
  message: string;
};

// --- Constants ---

/**
 * Supported MIME types for image upload.
 */
export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
] as const;

/**
 * Supported file extensions for image upload.
 */
export const SUPPORTED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.heic',
  '.heif',
  '.webp',
] as const;

/**
 * Maximum file size in bytes (50 MB).
 */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Maximum point deductions per signal type.
 * Weights are aggressive enough that a typical AI image (missing EXIF,
 * software fingerprint, no GPS, missing timestamps) scores well below 40.
 */
export const MAX_DEDUCTIONS: Record<SignalType, number> = {
  SOFTWARE_FINGERPRINT: 40,
  MISSING_EXIF: 30,
  TIMESTAMP_INCONSISTENCY: 20,
  FILE_SIZE_ANOMALY: 20,
  COLOR_PROFILE_ABNORMALITY: 15,
  MISSING_GPS: 10,
};

/**
 * Keywords used to identify AI/synthetic generation software
 * in the EXIF Software field (matched case-insensitively).
 */
export const AI_SOFTWARE_KEYWORDS = [
  'dall-e',
  'midjourney',
  'stable diffusion',
  'photoshop',
  'adobe firefly',
  'leonardo',
  'runway',
];
