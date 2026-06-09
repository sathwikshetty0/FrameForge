// Feature: frameforge-verify, Property 18: Report display fidelity
// **Validates: Requirements 9.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatReport } from './report-formatter';
import { MetadataResult, MetadataField, ScoringResult, SignalType } from './types';

/**
 * Arbitrary for a MetadataField with status 'present' holding a non-empty string.
 */
function arbPresentStringField(): fc.Arbitrary<MetadataField<string>> {
  return fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0).map(value => ({
    value,
    status: 'present' as const,
  }));
}

/**
 * Arbitrary for a MetadataField with status 'present' holding a number.
 */
function arbPresentNumberField(): fc.Arbitrary<MetadataField<number>> {
  return fc.double({ min: -90000, max: 90000, noNaN: true, noDefaultInfinity: true }).map(value => ({
    value,
    status: 'present' as const,
  }));
}

/**
 * Arbitrary for a MetadataField with status 'present' holding a Date.
 */
function arbPresentDateField(): fc.Arbitrary<MetadataField<Date>> {
  return fc.date({ min: new Date('1970-01-01T00:00:00Z'), max: new Date('2099-12-31T23:59:59Z') }).map(value => ({
    value,
    status: 'present' as const,
  }));
}

/**
 * Arbitrary for a MetadataField with status 'absent'.
 */
function arbAbsentField<T>(): fc.Arbitrary<MetadataField<T>> {
  return fc.constant({ value: null, status: 'absent' as const });
}

/**
 * Arbitrary for a MetadataField with status 'corrupt'.
 */
function arbCorruptField<T>(): fc.Arbitrary<MetadataField<T>> {
  return fc.constant({ value: null, status: 'corrupt' as const });
}

/**
 * Arbitrary for a string MetadataField that can be present, absent, or corrupt.
 */
function arbStringField(): fc.Arbitrary<MetadataField<string>> {
  return fc.oneof(
    { weight: 5, arbitrary: arbPresentStringField() },
    { weight: 2, arbitrary: arbAbsentField<string>() },
    { weight: 2, arbitrary: arbCorruptField<string>() }
  );
}

/**
 * Arbitrary for a number MetadataField that can be present, absent, or corrupt.
 */
function arbNumberField(): fc.Arbitrary<MetadataField<number>> {
  return fc.oneof(
    { weight: 5, arbitrary: arbPresentNumberField() },
    { weight: 2, arbitrary: arbAbsentField<number>() },
    { weight: 2, arbitrary: arbCorruptField<number>() }
  );
}

/**
 * Arbitrary for a date MetadataField that can be present, absent, or corrupt.
 */
function arbDateField(): fc.Arbitrary<MetadataField<Date>> {
  return fc.oneof(
    { weight: 5, arbitrary: arbPresentDateField() },
    { weight: 2, arbitrary: arbAbsentField<Date>() },
    { weight: 2, arbitrary: arbCorruptField<Date>() }
  );
}

/**
 * Arbitrary for a complete MetadataResult.
 */
function arbMetadataResult(): fc.Arbitrary<MetadataResult> {
  return fc.record({
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
}

/**
 * Minimal valid ScoringResult for report formatting purposes.
 */
function arbScoringResult(): fc.Arbitrary<ScoringResult> {
  const allSignalTypes: SignalType[] = [
    'SOFTWARE_FINGERPRINT',
    'MISSING_EXIF',
    'TIMESTAMP_INCONSISTENCY',
    'FILE_SIZE_ANOMALY',
    'COLOR_PROFILE_ABNORMALITY',
    'MISSING_GPS',
  ];

  return fc.record({
    score: fc.integer({ min: 0, max: 100 }),
    verdict: fc.constantFrom('GENUINE' as const, 'SUSPICIOUS' as const, 'LIKELY SYNTHETIC' as const),
    source: fc.record({
      type: fc.constantFrom('camera' as const, 'ai_generated' as const, 'edited' as const, 'unknown' as const),
      label: fc.string({ minLength: 1, maxLength: 50 }),
      confidence: fc.constantFrom('high' as const, 'medium' as const, 'low' as const),
    }),
    signals: fc.constant([]),
    breakdown: fc.constant(
      allSignalTypes.map(signalType => ({
        signalType,
        triggered: false,
        pointsDeducted: 0,
        maxDeduction: 40,
      }))
    ),
  });
}

describe('Property 18: Report display fidelity', () => {
  it('string fields with present status are displayed verbatim (no truncation or transformation)', () => {
    fc.assert(
      fc.property(
        arbPresentStringField(),
        arbPresentStringField(),
        arbPresentStringField(),
        arbPresentStringField(),
        arbPresentStringField(),
        arbScoringResult(),
        (cameraMake, cameraModel, lensMake, lensModel, software, scoringResult) => {
          const metadata: MetadataResult = {
            cameraMake,
            cameraModel,
            lensMake,
            lensModel,
            focalLength: { value: 50, status: 'present' },
            dateTimeOriginal: { value: new Date('2024-01-01T12:00:00Z'), status: 'present' },
            modifyDate: { value: new Date('2024-01-01T12:00:00Z'), status: 'present' },
            gpsLatitude: { value: 40.123456, status: 'present' },
            gpsLongitude: { value: -74.123456, status: 'present' },
            gpsAltitude: { value: 100.5, status: 'present' },
            fNumber: { value: 2.8, status: 'present' },
            iso: { value: 400, status: 'present' },
            exposureTime: { value: 0.01, status: 'present' },
            software,
            imageWidth: { value: 1920, status: 'present' },
            imageHeight: { value: 1080, status: 'present' },
            bitDepth: { value: 8, status: 'present' },
            colorProfile: { value: 'sRGB', status: 'present' },
          };

          const output = formatReport(metadata, scoringResult, 'test.jpg', new Date());

          // String fields must appear verbatim in the output
          expect(output).toContain(cameraMake.value!);
          expect(output).toContain(cameraModel.value!);
          expect(output).toContain(lensMake.value!);
          expect(output).toContain(lensModel.value!);
          expect(output).toContain(software.value!);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('number fields with present status are displayed with their unit suffix', () => {
    fc.assert(
      fc.property(
        arbPresentNumberField(),
        arbPresentNumberField(),
        arbPresentNumberField(),
        arbPresentNumberField(),
        arbPresentNumberField(),
        arbScoringResult(),
        (focalLength, gpsAltitude, exposureTime, imageWidth, imageHeight, scoringResult) => {
          const metadata: MetadataResult = {
            cameraMake: { value: 'Nikon', status: 'present' },
            cameraModel: { value: 'D850', status: 'present' },
            lensMake: { value: 'Nikon', status: 'present' },
            lensModel: { value: '50mm', status: 'present' },
            focalLength: focalLength,
            dateTimeOriginal: { value: new Date('2024-01-01T12:00:00Z'), status: 'present' },
            modifyDate: { value: new Date('2024-01-01T12:00:00Z'), status: 'present' },
            gpsLatitude: { value: 40.123456, status: 'present' },
            gpsLongitude: { value: -74.123456, status: 'present' },
            gpsAltitude: gpsAltitude,
            fNumber: { value: 2.8, status: 'present' },
            iso: { value: 400, status: 'present' },
            exposureTime: exposureTime,
            software: { value: 'TestSoft', status: 'present' },
            imageWidth: imageWidth,
            imageHeight: imageHeight,
            bitDepth: { value: 8, status: 'present' },
            colorProfile: { value: 'sRGB', status: 'present' },
          };

          const output = formatReport(metadata, scoringResult, 'test.jpg', new Date());

          // Number fields should appear with their unit suffix
          expect(output).toContain(`${focalLength.value}mm`);
          expect(output).toContain(`${gpsAltitude.value}m`);
          expect(output).toContain(`${exposureTime.value}s`);
          expect(output).toContain(`${imageWidth.value}px`);
          expect(output).toContain(`${imageHeight.value}px`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('date fields with present status are displayed in ISO 8601 format', () => {
    fc.assert(
      fc.property(
        arbPresentDateField(),
        arbPresentDateField(),
        arbScoringResult(),
        (dateTimeOriginal, modifyDate, scoringResult) => {
          const metadata: MetadataResult = {
            cameraMake: { value: 'Canon', status: 'present' },
            cameraModel: { value: 'EOS R5', status: 'present' },
            lensMake: { value: 'Canon', status: 'present' },
            lensModel: { value: 'RF 50mm', status: 'present' },
            focalLength: { value: 50, status: 'present' },
            dateTimeOriginal,
            modifyDate,
            gpsLatitude: { value: 40.123456, status: 'present' },
            gpsLongitude: { value: -74.123456, status: 'present' },
            gpsAltitude: { value: 100.5, status: 'present' },
            fNumber: { value: 2.8, status: 'present' },
            iso: { value: 400, status: 'present' },
            exposureTime: { value: 0.01, status: 'present' },
            software: { value: 'TestSoft', status: 'present' },
            imageWidth: { value: 1920, status: 'present' },
            imageHeight: { value: 1080, status: 'present' },
            bitDepth: { value: 8, status: 'present' },
            colorProfile: { value: 'sRGB', status: 'present' },
          };

          const output = formatReport(metadata, scoringResult, 'test.jpg', new Date());

          // Date fields must appear as ISO 8601 strings
          expect(output).toContain(dateTimeOriginal.value!.toISOString());
          expect(output).toContain(modifyDate.value!.toISOString());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('absent fields are displayed as "MISSING"', () => {
    fc.assert(
      fc.property(
        arbScoringResult(),
        (scoringResult) => {
          const metadata: MetadataResult = {
            cameraMake: { value: null, status: 'absent' },
            cameraModel: { value: null, status: 'absent' },
            lensMake: { value: null, status: 'absent' },
            lensModel: { value: null, status: 'absent' },
            focalLength: { value: null, status: 'absent' },
            dateTimeOriginal: { value: null, status: 'absent' },
            modifyDate: { value: null, status: 'absent' },
            gpsLatitude: { value: null, status: 'absent' },
            gpsLongitude: { value: null, status: 'absent' },
            gpsAltitude: { value: null, status: 'absent' },
            fNumber: { value: null, status: 'absent' },
            iso: { value: null, status: 'absent' },
            exposureTime: { value: null, status: 'absent' },
            software: { value: null, status: 'absent' },
            imageWidth: { value: null, status: 'absent' },
            imageHeight: { value: null, status: 'absent' },
            bitDepth: { value: null, status: 'absent' },
            colorProfile: { value: null, status: 'absent' },
          };

          const output = formatReport(metadata, scoringResult, 'test.jpg', new Date());

          // Extract only the METADATA section to count MISSING occurrences
          const metadataSection = output.split('--- METADATA ---')[1]?.split('--- DETECTION')[0] || '';

          // Each absent field line should contain "MISSING"
          const metadataLines = metadataSection.trim().split('\n').filter(l => l.trim().length > 0);
          for (const line of metadataLines) {
            expect(line).toContain('MISSING');
          }
          // There should be exactly 18 metadata field lines, all showing MISSING
          expect(metadataLines.length).toBe(18);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('corrupt fields are displayed as "CORRUPT"', () => {
    fc.assert(
      fc.property(
        arbScoringResult(),
        (scoringResult) => {
          const metadata: MetadataResult = {
            cameraMake: { value: null, status: 'corrupt' },
            cameraModel: { value: null, status: 'corrupt' },
            lensMake: { value: null, status: 'corrupt' },
            lensModel: { value: null, status: 'corrupt' },
            focalLength: { value: null, status: 'corrupt' },
            dateTimeOriginal: { value: null, status: 'corrupt' },
            modifyDate: { value: null, status: 'corrupt' },
            gpsLatitude: { value: null, status: 'corrupt' },
            gpsLongitude: { value: null, status: 'corrupt' },
            gpsAltitude: { value: null, status: 'corrupt' },
            fNumber: { value: null, status: 'corrupt' },
            iso: { value: null, status: 'corrupt' },
            exposureTime: { value: null, status: 'corrupt' },
            software: { value: null, status: 'corrupt' },
            imageWidth: { value: null, status: 'corrupt' },
            imageHeight: { value: null, status: 'corrupt' },
            bitDepth: { value: null, status: 'corrupt' },
            colorProfile: { value: null, status: 'corrupt' },
          };

          const output = formatReport(metadata, scoringResult, 'test.jpg', new Date());

          // Count occurrences of "CORRUPT" — should be one per corrupt field (18 fields)
          const corruptCount = (output.match(/CORRUPT/g) || []).length;
          expect(corruptCount).toBe(18);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('mixed fields with arbitrary statuses display correctly with no truncation or unpermitted transformation', () => {
    fc.assert(
      fc.property(
        arbMetadataResult(),
        arbScoringResult(),
        (metadata, scoringResult) => {
          const output = formatReport(metadata, scoringResult, 'test.jpg', new Date());

          // Verify each string field
          const stringFields: (keyof MetadataResult)[] = [
            'cameraMake', 'cameraModel', 'lensMake', 'lensModel', 'software', 'colorProfile',
          ];
          for (const fieldName of stringFields) {
            const field = metadata[fieldName] as MetadataField<string>;
            if (field.status === 'absent') {
              expect(output).toContain('MISSING');
            } else if (field.status === 'corrupt') {
              expect(output).toContain('CORRUPT');
            } else if (field.value !== null) {
              expect(output).toContain(field.value);
            }
          }

          // Verify date fields are ISO 8601
          const dateFields: (keyof MetadataResult)[] = ['dateTimeOriginal', 'modifyDate'];
          for (const fieldName of dateFields) {
            const field = metadata[fieldName] as MetadataField<Date>;
            if (field.status === 'present' && field.value !== null) {
              expect(output).toContain(field.value.toISOString());
            } else if (field.status === 'absent') {
              expect(output).toContain('MISSING');
            } else if (field.status === 'corrupt') {
              expect(output).toContain('CORRUPT');
            }
          }

          // Verify number fields contain the number value
          const numberFieldsWithUnits: Array<{ name: keyof MetadataResult; unit: string }> = [
            { name: 'focalLength', unit: 'mm' },
            { name: 'gpsAltitude', unit: 'm' },
            { name: 'exposureTime', unit: 's' },
            { name: 'imageWidth', unit: 'px' },
            { name: 'imageHeight', unit: 'px' },
          ];
          for (const { name, unit } of numberFieldsWithUnits) {
            const field = metadata[name] as MetadataField<number>;
            if (field.status === 'present' && field.value !== null) {
              expect(output).toContain(`${field.value}${unit}`);
            } else if (field.status === 'absent') {
              expect(output).toContain('MISSING');
            } else if (field.status === 'corrupt') {
              expect(output).toContain('CORRUPT');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
