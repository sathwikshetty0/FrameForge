// Feature: frameforge-verify, Property 5: MISSING_EXIF signal threshold
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { analyze } from './detection-engine';
import { MetadataResult, MetadataField } from './types';

/**
 * Validates: Requirements 3.1
 *
 * Property 5: MISSING_EXIF signal threshold
 * For any MetadataResult, the Detection Engine SHALL trigger a MISSING_EXIF signal
 * if and only if fewer than 3 of the 6 core fields (Make, Model, DateTimeOriginal,
 * ExposureTime, FNumber, ISOSpeedRatings) have status 'present'.
 */

/** Helper: create a present MetadataField */
function presentString(value: string): MetadataField<string> {
  return { value, status: 'present' };
}

function presentNumber(value: number): MetadataField<number> {
  return { value, status: 'present' };
}

function presentDate(value: Date): MetadataField<Date> {
  return { value, status: 'present' };
}

/** Helper: create an absent MetadataField */
function absent<T>(): MetadataField<T> {
  return { value: null, status: 'absent' };
}

/**
 * Build a MetadataResult where core fields are selectively present or absent
 * based on a boolean array, and all non-core fields are filled with reasonable
 * defaults (present with valid values) to avoid triggering other signals.
 */
function buildMetadata(corePresent: [boolean, boolean, boolean, boolean, boolean, boolean]): MetadataResult {
  const now = new Date();
  // ModifyDate close to dateTimeOriginal to avoid TIMESTAMP_INCONSISTENCY
  const modifyDate = new Date(now.getTime() + 1000 * 60 * 30); // 30 min later

  return {
    // Core fields - conditionally present/absent
    cameraMake: corePresent[0] ? presentString('Canon') : absent<string>(),
    cameraModel: corePresent[1] ? presentString('EOS R5') : absent<string>(),
    dateTimeOriginal: corePresent[2] ? presentDate(now) : absent<Date>(),
    exposureTime: corePresent[3] ? presentNumber(1 / 250) : absent<number>(),
    fNumber: corePresent[4] ? presentNumber(2.8) : absent<number>(),
    iso: corePresent[5] ? presentNumber(400) : absent<number>(),

    // Non-core fields - all present with reasonable values to avoid other signals
    lensMake: presentString('Canon'),
    lensModel: presentString('RF 50mm f/1.2L'),
    focalLength: presentNumber(50),
    modifyDate: corePresent[2] ? presentDate(modifyDate) : presentDate(now),
    gpsLatitude: presentNumber(37.774929),
    gpsLongitude: presentNumber(-122.419416),
    gpsAltitude: presentNumber(10.5),
    software: presentString('Canon DPP 4.0'), // Not an AI keyword
    imageWidth: presentNumber(4000),
    imageHeight: presentNumber(3000),
    bitDepth: presentNumber(8),
    colorProfile: presentString('sRGB'),
  };
}

/**
 * Arbitrary for a tuple of 6 booleans representing presence/absence
 * of each core field.
 */
const coreFieldPresenceArb = fc.tuple(
  fc.boolean(),
  fc.boolean(),
  fc.boolean(),
  fc.boolean(),
  fc.boolean(),
  fc.boolean()
) as fc.Arbitrary<[boolean, boolean, boolean, boolean, boolean, boolean]>;

describe('Detection Engine - Property 5: MISSING_EXIF signal threshold', () => {
  it('triggers MISSING_EXIF iff fewer than 3 of 6 core fields are present', () => {
    fc.assert(
      fc.property(coreFieldPresenceArb, (corePresent) => {
        const metadata = buildMetadata(corePresent);
        const presentCount = corePresent.filter(Boolean).length;

        // Use a file size that won't trigger FILE_SIZE_ANOMALY
        // 4000 * 3000 * 3 = 36,000,000 expected; use a reasonable actual size
        const fileSize = 4000 * 3000 * 3 * 0.5; // ratio 0.5, within [0.2, 5.0]

        const signals = analyze(metadata, fileSize);
        const missingExifSignals = signals.filter((s) => s.type === 'MISSING_EXIF');

        if (presentCount < 3) {
          // Signal SHOULD be triggered
          expect(missingExifSignals.length).toBe(1);

          // Verify severity matches the formula
          const expectedSeverity = (3 - presentCount) / 3;
          expect(missingExifSignals[0].severity).toBeCloseTo(expectedSeverity, 10);
        } else {
          // Signal SHOULD NOT be triggered
          expect(missingExifSignals.length).toBe(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('severity equals (3 - presentCount) / 3 when triggered', () => {
    fc.assert(
      fc.property(
        coreFieldPresenceArb.filter((cp) => cp.filter(Boolean).length < 3),
        (corePresent) => {
          const metadata = buildMetadata(corePresent);
          const presentCount = corePresent.filter(Boolean).length;
          const fileSize = 4000 * 3000 * 3 * 0.5;

          const signals = analyze(metadata, fileSize);
          const missingExifSignals = signals.filter((s) => s.type === 'MISSING_EXIF');

          expect(missingExifSignals.length).toBe(1);
          const expectedSeverity = (3 - presentCount) / 3;
          expect(missingExifSignals[0].severity).toBeCloseTo(expectedSeverity, 10);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: frameforge-verify, Property 6: SOFTWARE_FINGERPRINT detection
/**
 * Validates: Requirements 3.2
 *
 * Property 6: SOFTWARE_FINGERPRINT detection
 * For any MetadataResult where the Software field is present, the Detection Engine
 * SHALL trigger a SOFTWARE_FINGERPRINT signal if and only if the Software value
 * contains a case-insensitive match against any entry in the AI software keyword list.
 */

const AI_KEYWORDS = [
  'dall-e',
  'midjourney',
  'stable diffusion',
  'photoshop',
  'adobe firefly',
  'leonardo',
  'runway',
];

/**
 * Build a full MetadataResult with a given Software field value.
 * All other fields are set to present/valid values to avoid triggering other signals.
 */
function buildMetadataWithSoftware(softwareValue: string): MetadataResult {
  const now = new Date();
  const modifyDate = new Date(now.getTime() + 1000 * 60 * 30); // 30 min later

  return {
    cameraMake: presentString('Canon'),
    cameraModel: presentString('EOS R5'),
    dateTimeOriginal: presentDate(now),
    exposureTime: presentNumber(1 / 250),
    fNumber: presentNumber(2.8),
    iso: presentNumber(400),
    lensMake: presentString('Canon'),
    lensModel: presentString('RF 50mm f/1.2L'),
    focalLength: presentNumber(50),
    modifyDate: presentDate(modifyDate),
    gpsLatitude: presentNumber(37.774929),
    gpsLongitude: presentNumber(-122.419416),
    gpsAltitude: presentNumber(10.5),
    software: presentString(softwareValue),
    imageWidth: presentNumber(4000),
    imageHeight: presentNumber(3000),
    bitDepth: presentNumber(8),
    colorProfile: presentString('sRGB'),
  };
}

/**
 * Helper: check if a string contains any AI keyword (case-insensitive).
 */
function containsAiKeyword(value: string): boolean {
  const lower = value.toLowerCase();
  return AI_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

/**
 * Arbitrary: generates random strings that do NOT contain any AI keyword.
 * Filters out any generated string that happens to match.
 */
const nonKeywordSoftwareArb = fc
  .stringOf(
    fc.oneof(
      fc.char().filter((c) => /[a-zA-Z0-9 ._\-]/.test(c)),
      fc.constant(' ')
    ),
    { minLength: 1, maxLength: 50 }
  )
  .filter((s) => !containsAiKeyword(s));

/**
 * Arbitrary: generates strings that contain an AI keyword with random casing,
 * optionally surrounded by random prefix/suffix text.
 */
const keywordSoftwareArb = fc
  .tuple(
    fc.integer({ min: 0, max: AI_KEYWORDS.length - 1 }),
    fc.stringOf(fc.char().filter((c) => /[a-zA-Z0-9 ._\-]/.test(c)), {
      minLength: 0,
      maxLength: 20,
    }),
    fc.stringOf(fc.char().filter((c) => /[a-zA-Z0-9 ._\-]/.test(c)), {
      minLength: 0,
      maxLength: 20,
    }),
    fc.boolean() // whether to randomly uppercase each char
  )
  .map(([keywordIdx, prefix, suffix, randomCase]) => {
    const keyword = AI_KEYWORDS[keywordIdx];
    // Apply random case transformation to each character
    const casedKeyword = randomCase
      ? keyword
          .split('')
          .map((ch) => (Math.random() > 0.5 ? ch.toUpperCase() : ch.toLowerCase()))
          .join('')
      : keyword.toUpperCase();
    return `${prefix}${casedKeyword}${suffix}`;
  });

describe('Detection Engine - Property 6: SOFTWARE_FINGERPRINT detection', () => {
  const fileSize = 4000 * 3000 * 3 * 0.5; // ratio 0.5, within [0.2, 5.0]

  it('does NOT trigger SOFTWARE_FINGERPRINT when Software field does not contain any AI keyword', () => {
    fc.assert(
      fc.property(nonKeywordSoftwareArb, (softwareValue) => {
        const metadata = buildMetadataWithSoftware(softwareValue);
        const signals = analyze(metadata, fileSize);
        const softwareSignals = signals.filter((s) => s.type === 'SOFTWARE_FINGERPRINT');

        expect(softwareSignals.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('triggers SOFTWARE_FINGERPRINT with severity 1.0 when Software field contains an AI keyword (case-insensitive)', () => {
    fc.assert(
      fc.property(keywordSoftwareArb, (softwareValue) => {
        const metadata = buildMetadataWithSoftware(softwareValue);
        const signals = analyze(metadata, fileSize);
        const softwareSignals = signals.filter((s) => s.type === 'SOFTWARE_FINGERPRINT');

        expect(softwareSignals.length).toBe(1);
        expect(softwareSignals[0].severity).toBe(1.0);
        expect(softwareSignals[0].triggerField).toBe('software');
      }),
      { numRuns: 100 }
    );
  });
});


// Feature: frameforge-verify, Property 7: TIMESTAMP_INCONSISTENCY detection

/**
 * Validates: Requirements 3.3, 3.4
 *
 * Property 7: TIMESTAMP_INCONSISTENCY detection
 * For any MetadataResult, the Detection Engine SHALL trigger a TIMESTAMP_INCONSISTENCY
 * signal when: (a) both DateTimeOriginal and ModifyDate are present and differ by more
 * than 24 hours, OR (b) either DateTimeOriginal or ModifyDate is absent.
 */

/**
 * Helper to build a MetadataResult with specified timestamp fields,
 * while keeping all other fields set to values that avoid triggering other signals.
 */
function buildTimestampMetadata(
  dateTimeOriginal: MetadataField<Date>,
  modifyDate: MetadataField<Date>
): MetadataResult {
  return {
    // Core fields - enough present to avoid MISSING_EXIF (need ≥3)
    cameraMake: presentString('Garmin'),
    cameraModel: presentString('DashCam 67W'),
    dateTimeOriginal,
    exposureTime: presentNumber(1 / 500),
    fNumber: presentNumber(2.0),
    iso: presentNumber(200),

    // Non-core fields - set to avoid other signals
    lensMake: presentString('Garmin'),
    lensModel: presentString('Wide Angle'),
    focalLength: presentNumber(3.0),
    modifyDate,
    gpsLatitude: presentNumber(40.712776),
    gpsLongitude: presentNumber(-74.005974),
    gpsAltitude: presentNumber(5.0),
    software: presentString('Garmin VIRB Edit'), // Not an AI keyword
    imageWidth: presentNumber(1920),
    imageHeight: presentNumber(1080),
    bitDepth: presentNumber(8),
    colorProfile: presentString('sRGB'),
  };
}

describe('Detection Engine - Property 7: TIMESTAMP_INCONSISTENCY detection', () => {
  it('does NOT trigger when both timestamps present and diff ≤ 24h', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2030-01-01') }),
        fc.integer({ min: 0, max: 24 * 60 * 60 * 1000 }), // 0 to 24h in ms
        (baseDate, offsetMs) => {
          const dateOriginal = presentDate(baseDate);
          const modify = presentDate(new Date(baseDate.getTime() + offsetMs));

          const metadata = buildTimestampMetadata(dateOriginal, modify);
          const fileSize = 1920 * 1080 * 3 * 0.5; // ratio within [0.2, 5.0]

          const signals = analyze(metadata, fileSize);
          const timestampSignals = signals.filter(
            (s) => s.type === 'TIMESTAMP_INCONSISTENCY'
          );

          // Diff ≤ 24h → no signal
          expect(timestampSignals.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('triggers with correct severity when both timestamps present and diff > 24h', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2025-01-01') }),
        // Offset > 24h (86,400,001ms) up to 60 days (5,184,000,000ms)
        fc.integer({ min: 24 * 60 * 60 * 1000 + 1, max: 60 * 24 * 60 * 60 * 1000 }),
        (baseDate, offsetMs) => {
          const dateOriginal = presentDate(baseDate);
          const modify = presentDate(new Date(baseDate.getTime() + offsetMs));

          const metadata = buildTimestampMetadata(dateOriginal, modify);
          const fileSize = 1920 * 1080 * 3 * 0.5;

          const signals = analyze(metadata, fileSize);
          const timestampSignals = signals.filter(
            (s) => s.type === 'TIMESTAMP_INCONSISTENCY'
          );

          // Diff > 24h → signal should trigger
          expect(timestampSignals.length).toBe(1);

          // Verify severity = min(1.0, hoursDiff / 720)
          const diffHours = offsetMs / (1000 * 60 * 60);
          const expectedSeverity = Math.min(1.0, diffHours / 720);
          expect(timestampSignals[0].severity).toBeCloseTo(expectedSeverity, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('triggers with severity 0.5 when DateTimeOriginal is absent', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2030-01-01') }),
        (modDate) => {
          const dateOriginal = absent<Date>();
          const modify = presentDate(modDate);

          const metadata = buildTimestampMetadata(dateOriginal, modify);
          const fileSize = 1920 * 1080 * 3 * 0.5;

          const signals = analyze(metadata, fileSize);
          const timestampSignals = signals.filter(
            (s) => s.type === 'TIMESTAMP_INCONSISTENCY'
          );

          expect(timestampSignals.length).toBe(1);
          expect(timestampSignals[0].severity).toBe(0.5);
          expect(timestampSignals[0].triggerField).toBe('dateTimeOriginal');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('triggers with severity 0.5 when ModifyDate is absent', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2030-01-01') }),
        (origDate) => {
          const dateOriginal = presentDate(origDate);
          const modify = absent<Date>();

          const metadata = buildTimestampMetadata(dateOriginal, modify);
          const fileSize = 1920 * 1080 * 3 * 0.5;

          const signals = analyze(metadata, fileSize);
          const timestampSignals = signals.filter(
            (s) => s.type === 'TIMESTAMP_INCONSISTENCY'
          );

          expect(timestampSignals.length).toBe(1);
          expect(timestampSignals[0].severity).toBe(0.5);
          expect(timestampSignals[0].triggerField).toBe('modifyDate');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: frameforge-verify, Property 9: COLOR_PROFILE_ABNORMALITY detection

/**
 * Validates: Requirements 3.7
 *
 * Property 9: COLOR_PROFILE_ABNORMALITY detection
 * For any MetadataResult, the Detection Engine SHALL trigger a COLOR_PROFILE_ABNORMALITY
 * signal if and only if the color profile is absent OR the bit depth is not 8 or 16.
 * Severity: 0.5 per condition met (max 1.0).
 */

/**
 * Build a MetadataResult for color profile testing.
 * Core fields and other non-core fields are set to valid values
 * to avoid triggering other signals.
 */
function buildColorProfileMetadata(
  colorProfile: MetadataField<string>,
  bitDepth: MetadataField<number>
): MetadataResult {
  const now = new Date();
  const modifyDate = new Date(now.getTime() + 1000 * 60 * 30); // 30 min later

  return {
    // Core fields - all present to avoid MISSING_EXIF
    cameraMake: presentString('Canon'),
    cameraModel: presentString('EOS R5'),
    dateTimeOriginal: presentDate(now),
    exposureTime: presentNumber(1 / 250),
    fNumber: presentNumber(2.8),
    iso: presentNumber(400),

    // Non-core fields with valid values to avoid other signals
    lensMake: presentString('Canon'),
    lensModel: presentString('RF 50mm f/1.2L'),
    focalLength: presentNumber(50),
    modifyDate: presentDate(modifyDate),
    gpsLatitude: presentNumber(37.774929),
    gpsLongitude: presentNumber(-122.419416),
    gpsAltitude: presentNumber(10.5),
    software: presentString('Canon DPP 4.0'), // Not an AI keyword
    imageWidth: presentNumber(4000),
    imageHeight: presentNumber(3000),

    // Fields under test
    bitDepth,
    colorProfile,
  };
}

/**
 * Arbitrary for colorProfile field: either present with a non-empty string, or absent.
 */
const colorProfileFieldArb: fc.Arbitrary<MetadataField<string>> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }).map((s) => presentString(s)),
  fc.constant(absent<string>())
);

/**
 * Arbitrary for bitDepth field: either present with a positive integer, or absent.
 * Includes standard (8, 16) and non-standard values.
 */
const bitDepthFieldArb: fc.Arbitrary<MetadataField<number>> = fc.oneof(
  fc.oneof(fc.constant(8), fc.constant(16), fc.integer({ min: 1, max: 64 })).map((n) =>
    presentNumber(n)
  ),
  fc.constant(absent<number>())
);

describe('Detection Engine - Property 9: COLOR_PROFILE_ABNORMALITY detection', () => {
  it('triggers COLOR_PROFILE_ABNORMALITY iff colorProfile absent OR bitDepth not 8/16', () => {
    fc.assert(
      fc.property(colorProfileFieldArb, bitDepthFieldArb, (colorProfile, bitDepth) => {
        const metadata = buildColorProfileMetadata(colorProfile, bitDepth);

        // Use a file size that won't trigger FILE_SIZE_ANOMALY
        // 4000 * 3000 * 3 = 36,000,000 expected; ratio 0.5 is within [0.2, 5.0]
        const fileSize = 4000 * 3000 * 3 * 0.5;

        const signals = analyze(metadata, fileSize);
        const colorSignals = signals.filter((s) => s.type === 'COLOR_PROFILE_ABNORMALITY');

        const profileAbsent =
          colorProfile.status !== 'present' || colorProfile.value === null;
        const bitDepthAbnormal =
          bitDepth.status !== 'present' ||
          bitDepth.value === null ||
          (bitDepth.value !== 8 && bitDepth.value !== 16);

        const shouldTrigger = profileAbsent || bitDepthAbnormal;

        if (shouldTrigger) {
          expect(colorSignals.length).toBe(1);
        } else {
          expect(colorSignals.length).toBe(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('severity is 1.0 when both conditions met, 0.5 when only one condition met', () => {
    fc.assert(
      fc.property(colorProfileFieldArb, bitDepthFieldArb, (colorProfile, bitDepth) => {
        const metadata = buildColorProfileMetadata(colorProfile, bitDepth);
        const fileSize = 4000 * 3000 * 3 * 0.5;

        const signals = analyze(metadata, fileSize);
        const colorSignals = signals.filter((s) => s.type === 'COLOR_PROFILE_ABNORMALITY');

        const profileAbsent =
          colorProfile.status !== 'present' || colorProfile.value === null;
        const bitDepthAbnormal =
          bitDepth.status !== 'present' ||
          bitDepth.value === null ||
          (bitDepth.value !== 8 && bitDepth.value !== 16);

        const conditionsMet = (profileAbsent ? 1 : 0) + (bitDepthAbnormal ? 1 : 0);

        if (conditionsMet === 0) {
          expect(colorSignals.length).toBe(0);
        } else {
          expect(colorSignals.length).toBe(1);
          const expectedSeverity = Math.min(1.0, conditionsMet * 0.5);
          expect(colorSignals[0].severity).toBeCloseTo(expectedSeverity, 10);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: frameforge-verify, Property 8: FILE_SIZE_ANOMALY detection

/**
 * Validates: Requirements 3.5, 3.6
 *
 * Property 8: FILE_SIZE_ANOMALY detection
 * For any combination of file size and image dimensions (width × height × 3),
 * the Detection Engine SHALL trigger a FILE_SIZE_ANOMALY signal if and only if
 * the ratio of actual file size to expected uncompressed size is less than 0.2
 * or greater than 5.0.
 */

/**
 * Build a MetadataResult with specific imageWidth and imageHeight, all other fields
 * set to reasonable values that won't trigger other signals.
 */
function buildMetadataForFileSize(width: number, height: number): MetadataResult {
  const now = new Date();
  const modifyDate = new Date(now.getTime() + 1000 * 60 * 30); // 30 min later

  return {
    cameraMake: presentString('Canon'),
    cameraModel: presentString('EOS R5'),
    dateTimeOriginal: presentDate(now),
    exposureTime: presentNumber(1 / 250),
    fNumber: presentNumber(2.8),
    iso: presentNumber(400),
    lensMake: presentString('Canon'),
    lensModel: presentString('RF 50mm f/1.2L'),
    focalLength: presentNumber(50),
    modifyDate: presentDate(modifyDate),
    gpsLatitude: presentNumber(37.774929),
    gpsLongitude: presentNumber(-122.419416),
    gpsAltitude: presentNumber(10.5),
    software: presentString('Canon DPP 4.0'),
    imageWidth: presentNumber(width),
    imageHeight: presentNumber(height),
    bitDepth: presentNumber(8),
    colorProfile: presentString('sRGB'),
  };
}

describe('Detection Engine - Property 8: FILE_SIZE_ANOMALY detection', () => {
  it('triggers FILE_SIZE_ANOMALY iff ratio < 0.2 or ratio > 5.0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10000 }), // width
        fc.integer({ min: 100, max: 10000 }), // height
        fc.integer({ min: 1, max: 500_000_000 }), // fileSize (positive integer)
        (width, height, fileSize) => {
          const metadata = buildMetadataForFileSize(width, height);
          const expectedSize = width * height * 3;
          const ratio = fileSize / expectedSize;

          const signals = analyze(metadata, fileSize);
          const fileSizeSignals = signals.filter((s) => s.type === 'FILE_SIZE_ANOMALY');

          if (ratio < 0.2 || ratio > 5.0) {
            // Signal SHOULD be triggered
            expect(fileSizeSignals.length).toBe(1);
            expect(fileSizeSignals[0].type).toBe('FILE_SIZE_ANOMALY');
          } else {
            // Signal SHOULD NOT be triggered
            expect(fileSizeSignals.length).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity equals min(1.0, abs(ratio - 1.0) / 4.0) when triggered', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10000 }), // width
        fc.integer({ min: 100, max: 10000 }), // height
        fc.integer({ min: 1, max: 500_000_000 }), // fileSize (positive integer)
        (width, height, fileSize) => {
          const metadata = buildMetadataForFileSize(width, height);
          const expectedSize = width * height * 3;
          const ratio = fileSize / expectedSize;

          // Only test when signal should trigger
          fc.pre(ratio < 0.2 || ratio > 5.0);

          const signals = analyze(metadata, fileSize);
          const fileSizeSignals = signals.filter((s) => s.type === 'FILE_SIZE_ANOMALY');

          expect(fileSizeSignals.length).toBe(1);

          const expectedSeverity = Math.min(1.0, Math.abs(ratio - 1.0) / 4.0);
          expect(fileSizeSignals[0].severity).toBeCloseTo(expectedSeverity, 5);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: frameforge-verify, Property 10: Signal structure invariant

/**
 * Validates: Requirements 3.9
 *
 * Property 10: Signal structure invariant
 * For any signal produced by the Detection Engine, the signal SHALL contain a valid
 * type (one of the defined SignalType values), a severity weight in the range [0.0, 1.0]
 * inclusive, and a non-empty triggerField string identifying the metadata field that
 * triggered detection.
 */

const VALID_SIGNAL_TYPES = [
  'SOFTWARE_FINGERPRINT',
  'MISSING_EXIF',
  'TIMESTAMP_INCONSISTENCY',
  'FILE_SIZE_ANOMALY',
  'COLOR_PROFILE_ABNORMALITY',
  'MISSING_GPS',
] as const;

/**
 * Arbitrary for a MetadataField with random presence/absence/corruption.
 * For 'present' fields, generates a value of the appropriate type.
 */
function arbStringField(): fc.Arbitrary<MetadataField<string>> {
  return fc.oneof(
    fc.record({ value: fc.string({ minLength: 0, maxLength: 50 }), status: fc.constant('present' as const) }),
    fc.record({ value: fc.constant(null), status: fc.constant('absent' as const) }),
    fc.record({ value: fc.constant(null), status: fc.constant('corrupt' as const) })
  );
}

function arbNumberField(): fc.Arbitrary<MetadataField<number>> {
  return fc.oneof(
    fc.record({ value: fc.double({ min: 0, max: 10000, noNaN: true }), status: fc.constant('present' as const) }),
    fc.record({ value: fc.constant(null), status: fc.constant('absent' as const) }),
    fc.record({ value: fc.constant(null), status: fc.constant('corrupt' as const) })
  );
}

function arbDateField(): fc.Arbitrary<MetadataField<Date>> {
  return fc.oneof(
    fc.record({
      value: fc.date({ min: new Date('1990-01-01'), max: new Date('2030-12-31') }),
      status: fc.constant('present' as const),
    }),
    fc.record({ value: fc.constant(null), status: fc.constant('absent' as const) }),
    fc.record({ value: fc.constant(null), status: fc.constant('corrupt' as const) })
  );
}

/**
 * Arbitrary for a full MetadataResult with all fields randomly generated.
 */
const arbMetadataResult: fc.Arbitrary<MetadataResult> = fc.record({
  cameraMake: arbStringField(),
  cameraModel: arbStringField(),
  lensMake: arbStringField(),
  lensModel: arbStringField(),
  focalLength: arbNumberField(),
  dateTimeOriginal: arbDateField(),
  modifyDate: arbDateField(),
  gpsLatitude: arbNumberField(),
  gpsLongitude: arbNumberField(),
  gpsAltitude: arbNumberField(),
  fNumber: arbNumberField(),
  iso: arbNumberField(),
  exposureTime: arbNumberField(),
  software: arbStringField(),
  imageWidth: arbNumberField(),
  imageHeight: arbNumberField(),
  bitDepth: arbNumberField(),
  colorProfile: arbStringField(),
});

describe('Detection Engine - Property 10: Signal structure invariant', () => {
  it('every signal produced has valid type, severity in [0,1], non-empty triggerField, and non-empty description', () => {
    fc.assert(
      fc.property(
        arbMetadataResult,
        fc.integer({ min: 1, max: 100_000_000 }),
        (metadata, fileSize) => {
          const signals = analyze(metadata, fileSize);

          for (const signal of signals) {
            // Assert type is one of the 6 valid SignalType values
            expect(VALID_SIGNAL_TYPES).toContain(signal.type);

            // Assert severity is in [0.0, 1.0]
            expect(signal.severity).toBeGreaterThanOrEqual(0.0);
            expect(signal.severity).toBeLessThanOrEqual(1.0);

            // Assert triggerField is a non-empty string
            expect(typeof signal.triggerField).toBe('string');
            expect(signal.triggerField.length).toBeGreaterThan(0);

            // Assert description is a non-empty string
            expect(typeof signal.description).toBe('string');
            expect(signal.description.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
