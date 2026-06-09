// EXIF Parser module — extracts metadata from image ArrayBuffers using the exifr library (CDN-loaded)
import type { MetadataField, MetadataResult } from './types';

const EXIFR_CDN_URL = 'https://cdn.jsdelivr.net/npm/exifr/dist/full.esm.js';

const EXIFR_OPTIONS = {
  ifd0: true,
  exif: true,
  gps: true,
  interop: false,
  ifd1: false,
  translateValues: true,
  translateKeys: true,
  reviveValues: true,
};

// Cached exifr module reference
let exifrModule: ExifrModule | null = null;

interface ExifrModule {
  parse: (input: ArrayBuffer, options?: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
}

/**
 * Load the exifr library from CDN. Call at app initialization.
 * The module is cached after the first successful load.
 * Exported separately so tests can mock or pre-load.
 */
export async function loadExifr(): Promise<ExifrModule> {
  if (exifrModule) return exifrModule;
  try {
    const mod = await import(/* @vite-ignore */ EXIFR_CDN_URL);
    exifrModule = mod as unknown as ExifrModule;
    return exifrModule;
  } catch (error) {
    throw new Error(
      'EXIF parsing library could not be loaded. Analysis unavailable.'
    );
  }
}

/**
 * Reset the cached exifr module (for testing purposes).
 */
export function resetExifrCache(): void {
  exifrModule = null;
}

/**
 * Inject a mock exifr module (for testing purposes).
 */
export function setExifrModule(mod: ExifrModule): void {
  exifrModule = mod;
}

// --- Field extraction helpers ---

function extractString(raw: Record<string, unknown>, key: string): MetadataField<string> {
  try {
    const value = raw[key];
    if (value === undefined || value === null) {
      return { value: null, status: 'absent' };
    }
    if (typeof value === 'string') {
      return { value, status: 'present' };
    }
    // Present but not a string — corrupt
    return { value: null, status: 'corrupt' };
  } catch {
    return { value: null, status: 'corrupt' };
  }
}

function extractNumber(raw: Record<string, unknown>, key: string): MetadataField<number> {
  try {
    const value = raw[key];
    if (value === undefined || value === null) {
      return { value: null, status: 'absent' };
    }
    if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)) {
      return { value, status: 'present' };
    }
    // Present but not a valid number — corrupt
    return { value: null, status: 'corrupt' };
  } catch {
    return { value: null, status: 'corrupt' };
  }
}

function extractDate(raw: Record<string, unknown>, key: string): MetadataField<Date> {
  try {
    const value = raw[key];
    if (value === undefined || value === null) {
      return { value: null, status: 'absent' };
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { value, status: 'present' };
    }
    // Try to parse string dates
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return { value: parsed, status: 'present' };
      }
    }
    // Present but not a valid date — corrupt
    return { value: null, status: 'corrupt' };
  } catch {
    return { value: null, status: 'corrupt' };
  }
}

function extractGpsCoordinate(raw: Record<string, unknown>, key: string): MetadataField<number> {
  try {
    const value = raw[key];
    if (value === undefined || value === null) {
      return { value: null, status: 'absent' };
    }
    if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)) {
      // GPS coordinates are already decimal degrees from exifr with translateValues: true
      // Preserve precision — store as-is (at least 6 decimal places for lat/lon)
      return { value, status: 'present' };
    }
    // Present but not a valid number — corrupt
    return { value: null, status: 'corrupt' };
  } catch {
    return { value: null, status: 'corrupt' };
  }
}

function extractImageDimension(
  raw: Record<string, unknown>,
  primaryKey: string,
  fallbackKey: string
): MetadataField<number> {
  try {
    // Try primary key first
    const primary = raw[primaryKey];
    if (primary !== undefined && primary !== null) {
      if (typeof primary === 'number' && !Number.isNaN(primary) && Number.isFinite(primary)) {
        return { value: primary, status: 'present' };
      }
      // Primary exists but is invalid — try fallback before declaring corrupt
    }

    // Try fallback key
    const fallback = raw[fallbackKey];
    if (fallback !== undefined && fallback !== null) {
      if (typeof fallback === 'number' && !Number.isNaN(fallback) && Number.isFinite(fallback)) {
        return { value: fallback, status: 'present' };
      }
      // Fallback exists but is invalid
      return { value: null, status: 'corrupt' };
    }

    // If primary was present but invalid and fallback absent
    if (primary !== undefined && primary !== null) {
      return { value: null, status: 'corrupt' };
    }

    return { value: null, status: 'absent' };
  } catch {
    return { value: null, status: 'corrupt' };
  }
}

function extractColorProfile(raw: Record<string, unknown>): MetadataField<string> {
  try {
    const colorSpace = raw['ColorSpace'];
    if (colorSpace !== undefined && colorSpace !== null) {
      if (typeof colorSpace === 'string') {
        return { value: colorSpace, status: 'present' };
      }
      if (typeof colorSpace === 'number') {
        // exifr may translate ColorSpace to a numeric value (1 = sRGB, 65535 = Uncalibrated)
        const mapped = colorSpace === 1 ? 'sRGB' : `ColorSpace(${colorSpace})`;
        return { value: mapped, status: 'present' };
      }
      return { value: null, status: 'corrupt' };
    }
    return { value: null, status: 'absent' };
  } catch {
    return { value: null, status: 'corrupt' };
  }
}

/**
 * Parse result including both structured metadata and raw EXIF data.
 */
export interface ParseExifResult {
  metadata: MetadataResult;
  rawExif: Record<string, unknown>;
}

/**
 * Parse EXIF metadata from an image ArrayBuffer.
 * Returns a complete MetadataResult with all fields populated.
 * Each field is marked as 'present', 'absent', or 'corrupt'.
 */
export async function parseExif(buffer: ArrayBuffer): Promise<MetadataResult> {
  const { metadata } = await parseExifFull(buffer);
  return metadata;
}

/**
 * Parse EXIF metadata and also return the complete raw EXIF data.
 * Use this when you need access to ALL metadata fields, not just the 18 structured ones.
 */
export async function parseExifFull(buffer: ArrayBuffer): Promise<ParseExifResult> {
  const exifr = await loadExifr();

  let raw: Record<string, unknown>;
  try {
    const result = await exifr.parse(buffer, EXIFR_OPTIONS);
    raw = result ?? {};
  } catch {
    raw = {};
  }

  const metadata: MetadataResult = {
    cameraMake: extractString(raw, 'Make'),
    cameraModel: extractString(raw, 'Model'),
    lensMake: extractString(raw, 'LensMake'),
    lensModel: extractString(raw, 'LensModel'),
    focalLength: extractNumber(raw, 'FocalLength'),
    dateTimeOriginal: extractDate(raw, 'DateTimeOriginal'),
    modifyDate: extractDate(raw, 'ModifyDate'),
    gpsLatitude: extractGpsCoordinate(raw, 'latitude'),
    gpsLongitude: extractGpsCoordinate(raw, 'longitude'),
    gpsAltitude: extractGpsCoordinate(raw, 'GPSAltitude'),
    fNumber: extractNumber(raw, 'FNumber'),
    iso: extractNumber(raw, 'ISO'),
    exposureTime: extractNumber(raw, 'ExposureTime'),
    software: extractString(raw, 'Software'),
    imageWidth: extractImageDimension(raw, 'ImageWidth', 'ExifImageWidth'),
    imageHeight: extractImageDimension(raw, 'ImageHeight', 'ExifImageHeight'),
    bitDepth: extractNumber(raw, 'BitsPerSample'),
    colorProfile: extractColorProfile(raw),
  };

  return { metadata, rawExif: raw };
}
