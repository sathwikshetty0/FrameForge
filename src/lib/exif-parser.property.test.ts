import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { parseExif, setExifrModule, resetExifrCache } from './exif-parser';

// Feature: frameforge-verify, Property 4: GPS precision preservation
describe('Property 4: GPS precision preservation', () => {
  /**
   * Validates: Requirements 2.3, 9.3
   *
   * For any GPS coordinate value (latitude, longitude, altitude) extracted by the parser,
   * the output SHALL represent latitude and longitude as decimal degrees with at least
   * 6 decimal places of precision and altitude as meters with at least 1 decimal place
   * of precision. The property verifies that for any GPS coordinate value passed to
   * parseExif (via mocked exifr), the output value is exactly equal to the input value
   * (preserving full floating-point precision).
   */

  beforeEach(() => {
    resetExifrCache();
  });

  it('should preserve GPS latitude precision exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        async (latitude) => {
          setExifrModule({
            parse: async () => ({
              latitude,
            }),
          });

          const result = await parseExif(new ArrayBuffer(8));

          expect(result.gpsLatitude.status).toBe('present');
          expect(result.gpsLatitude.value).toBe(latitude);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve GPS longitude precision exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        async (longitude) => {
          setExifrModule({
            parse: async () => ({
              longitude,
            }),
          });

          const result = await parseExif(new ArrayBuffer(8));

          expect(result.gpsLongitude.status).toBe('present');
          expect(result.gpsLongitude.value).toBe(longitude);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve GPS altitude precision exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
        async (altitude) => {
          setExifrModule({
            parse: async () => ({
              GPSAltitude: altitude,
            }),
          });

          const result = await parseExif(new ArrayBuffer(8));

          expect(result.gpsAltitude.status).toBe('present');
          expect(result.gpsAltitude.value).toBe(altitude);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve all GPS coordinates together with full precision', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
        async (latitude, longitude, altitude) => {
          setExifrModule({
            parse: async () => ({
              latitude,
              longitude,
              GPSAltitude: altitude,
            }),
          });

          const result = await parseExif(new ArrayBuffer(8));

          // All fields should be present
          expect(result.gpsLatitude.status).toBe('present');
          expect(result.gpsLongitude.status).toBe('present');
          expect(result.gpsAltitude.status).toBe('present');

          // Values should be exactly preserved (no precision loss)
          expect(result.gpsLatitude.value).toBe(latitude);
          expect(result.gpsLongitude.value).toBe(longitude);
          expect(result.gpsAltitude.value).toBe(altitude);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: frameforge-verify, Property 2: All fields always present in output
describe('Property 2: All fields always present in output', () => {
  /**
   * Validates: Requirements 2.7, 2.8
   *
   * For any input ArrayBuffer (including those with no EXIF data at all), the parseExif
   * function SHALL return a MetadataResult containing every field defined in the
   * MetadataResult interface, each with a valid status of 'present', 'absent', or
   * 'corrupt' — no field is ever omitted from the result.
   */

  const ALL_METADATA_FIELDS: (keyof import('./types').MetadataResult)[] = [
    'cameraMake',
    'cameraModel',
    'lensMake',
    'lensModel',
    'focalLength',
    'dateTimeOriginal',
    'modifyDate',
    'gpsLatitude',
    'gpsLongitude',
    'gpsAltitude',
    'fNumber',
    'iso',
    'exposureTime',
    'software',
    'imageWidth',
    'imageHeight',
    'bitDepth',
    'colorProfile',
  ];

  const VALID_STATUSES = ['present', 'absent', 'corrupt'] as const;

  beforeEach(() => {
    resetExifrCache();
  });

  it('parseExif always returns all 18 fields with valid status regardless of exifr output', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // null return from exifr
          fc.constant(null),
          // undefined return
          fc.constant(undefined),
          // empty object
          fc.constant({}),
          // arbitrary object with random keys and values
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.double({ noNaN: false }),
              fc.boolean(),
              fc.constant(null),
              fc.constant(undefined),
              fc.array(fc.integer()),
              fc.constant(NaN),
              fc.constant(Infinity),
              fc.constant(-Infinity)
            )
          ),
          // partial objects with some known EXIF keys
          fc.record({
            Make: fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
            Model: fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
            FocalLength: fc.oneof(fc.double(), fc.string(), fc.constant(null), fc.constant(undefined)),
            ISO: fc.oneof(fc.integer(), fc.string(), fc.constant(null), fc.constant(undefined)),
          }, { requiredKeys: [] })
        ),
        async (exifrOutput) => {
          setExifrModule({
            parse: async () => exifrOutput as Record<string, unknown> | null,
          });

          const buffer = new ArrayBuffer(0);
          const result = await parseExif(buffer);

          // Assert all 18 fields are present in the result
          for (const field of ALL_METADATA_FIELDS) {
            expect(result).toHaveProperty(field);
            expect(result[field]).toBeDefined();
            expect(result[field]).not.toBeNull();
            expect(VALID_STATUSES).toContain(result[field].status);
            expect(result[field]).toHaveProperty('value');
            expect(result[field]).toHaveProperty('status');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('parseExif returns all fields even when exifr throws an error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        async (errorMsg) => {
          setExifrModule({
            parse: async () => { throw new Error(errorMsg); },
          });

          const buffer = new ArrayBuffer(0);
          const result = await parseExif(buffer);

          for (const field of ALL_METADATA_FIELDS) {
            expect(result).toHaveProperty(field);
            expect(result[field]).toBeDefined();
            expect(result[field]).not.toBeNull();
            expect(VALID_STATUSES).toContain(result[field].status);
            expect(result[field]).toHaveProperty('value');
            expect(result[field]).toHaveProperty('status');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: frameforge-verify, Property 3: Corrupt fields reported as corrupt
describe('Property 3: Corrupt fields reported as corrupt', () => {
  /**
   * Validates: Requirements 2.9, 9.4
   *
   * For any EXIF field that is present in the input but contains malformed
   * or unreadable data, the parseExif function SHALL report that field with
   * status 'corrupt' rather than omitting the field or substituting a default value.
   */

  beforeEach(() => {
    resetExifrCache();
  });

  // Arbitraries for generating corrupt values for string fields
  const corruptStringValueArb = fc.oneof(
    fc.integer(),
    fc.boolean(),
    fc.constant({}),
    fc.constant([]),
    fc.constant(123.456),
    fc.constant(true),
    fc.constant({ nested: 'object' }),
    fc.constant(['array', 'value'])
  );

  // Arbitraries for generating corrupt values for number fields
  const corruptNumberValueArb = fc.oneof(
    fc.string({ minLength: 1 }),
    fc.constant(NaN),
    fc.constant(Infinity),
    fc.constant(-Infinity),
    fc.constant({}),
    fc.constant([]),
    fc.boolean(),
    fc.constant({ nested: 'object' })
  );

  // Arbitraries for generating corrupt values for date fields
  const corruptDateValueArb = fc.oneof(
    fc.constant(new Date('invalid')),
    fc.constant({}),
    fc.constant([]),
    fc.integer(),
    fc.boolean(),
    fc.constant('not-a-date-at-all-xyz'),
    fc.constant({ nested: 'object' })
  );

  // String field keys as used by exifr output
  const stringFieldKeys = ['Make', 'Model', 'LensMake', 'LensModel', 'Software'] as const;

  // Corresponding MetadataResult field names
  const stringFieldNames: Record<string, string> = {
    Make: 'cameraMake',
    Model: 'cameraModel',
    LensMake: 'lensMake',
    LensModel: 'lensModel',
    Software: 'software',
  };

  // Number field keys as used by exifr output
  const numberFieldKeys = ['FocalLength', 'FNumber', 'ISO', 'ExposureTime', 'BitsPerSample'] as const;

  // Corresponding MetadataResult field names
  const numberFieldNames: Record<string, string> = {
    FocalLength: 'focalLength',
    FNumber: 'fNumber',
    ISO: 'iso',
    ExposureTime: 'exposureTime',
    BitsPerSample: 'bitDepth',
  };

  // Date field keys as used by exifr output
  const dateFieldKeys = ['DateTimeOriginal', 'ModifyDate'] as const;

  // Corresponding MetadataResult field names
  const dateFieldNames: Record<string, string> = {
    DateTimeOriginal: 'dateTimeOriginal',
    ModifyDate: 'modifyDate',
  };

  it('string fields with non-string values are reported as corrupt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...stringFieldKeys),
        corruptStringValueArb,
        async (fieldKey, corruptValue) => {
          const mockOutput: Record<string, unknown> = {
            [fieldKey]: corruptValue,
          };

          setExifrModule({
            parse: async () => mockOutput,
          });

          const result = await parseExif(new ArrayBuffer(8));
          const metadataFieldName = stringFieldNames[fieldKey] as keyof typeof result;
          const field = result[metadataFieldName];

          expect(field.status).toBe('corrupt');
          expect(field.value).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('number fields with non-number or invalid number values are reported as corrupt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...numberFieldKeys),
        corruptNumberValueArb,
        async (fieldKey, corruptValue) => {
          const mockOutput: Record<string, unknown> = {
            [fieldKey]: corruptValue,
          };

          setExifrModule({
            parse: async () => mockOutput,
          });

          const result = await parseExif(new ArrayBuffer(8));
          const metadataFieldName = numberFieldNames[fieldKey] as keyof typeof result;
          const field = result[metadataFieldName];

          expect(field.status).toBe('corrupt');
          expect(field.value).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('date fields with invalid date values are reported as corrupt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...dateFieldKeys),
        corruptDateValueArb,
        async (fieldKey, corruptValue) => {
          const mockOutput: Record<string, unknown> = {
            [fieldKey]: corruptValue,
          };

          setExifrModule({
            parse: async () => mockOutput,
          });

          const result = await parseExif(new ArrayBuffer(8));
          const metadataFieldName = dateFieldNames[fieldKey] as keyof typeof result;
          const field = result[metadataFieldName];

          expect(field.status).toBe('corrupt');
          expect(field.value).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('GPS coordinate fields with non-number or invalid number values are reported as corrupt', async () => {
    const gpsFieldKeys = ['latitude', 'longitude', 'GPSAltitude'] as const;
    const gpsFieldNames: Record<string, string> = {
      latitude: 'gpsLatitude',
      longitude: 'gpsLongitude',
      GPSAltitude: 'gpsAltitude',
    };

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...gpsFieldKeys),
        corruptNumberValueArb,
        async (fieldKey, corruptValue) => {
          const mockOutput: Record<string, unknown> = {
            [fieldKey]: corruptValue,
          };

          setExifrModule({
            parse: async () => mockOutput,
          });

          const result = await parseExif(new ArrayBuffer(8));
          const metadataFieldName = gpsFieldNames[fieldKey] as keyof typeof result;
          const field = result[metadataFieldName];

          expect(field.status).toBe('corrupt');
          expect(field.value).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('image dimension fields with corrupt values (both primary and fallback) are reported as corrupt', async () => {
    const dimensionFields = [
      { primaryKey: 'ImageWidth', fallbackKey: 'ExifImageWidth', metadataField: 'imageWidth' },
      { primaryKey: 'ImageHeight', fallbackKey: 'ExifImageHeight', metadataField: 'imageHeight' },
    ] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...dimensionFields),
        corruptNumberValueArb,
        async (dimensionField, corruptValue) => {
          // Set both primary and fallback to corrupt values so the parser can't fall back
          const mockOutput: Record<string, unknown> = {
            [dimensionField.primaryKey]: corruptValue,
            [dimensionField.fallbackKey]: corruptValue,
          };

          setExifrModule({
            parse: async () => mockOutput,
          });

          const result = await parseExif(new ArrayBuffer(8));
          const field = result[dimensionField.metadataField as keyof typeof result];

          expect(field.status).toBe('corrupt');
          expect(field.value).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ColorSpace field with non-string and non-number values is reported as corrupt', async () => {
    const corruptColorSpaceArb = fc.oneof(
      fc.constant({}),
      fc.constant([]),
      fc.boolean(),
      fc.constant({ nested: 'object' }),
      fc.constant(['array', 'value'])
    );

    await fc.assert(
      fc.asyncProperty(corruptColorSpaceArb, async (corruptValue) => {
        const mockOutput: Record<string, unknown> = {
          ColorSpace: corruptValue,
        };

        setExifrModule({
          parse: async () => mockOutput,
        });

        const result = await parseExif(new ArrayBuffer(8));

        expect(result.colorProfile.status).toBe('corrupt');
        expect(result.colorProfile.value).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
