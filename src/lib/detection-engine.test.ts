import { describe, it, expect } from 'vitest';
import { analyze } from './detection-engine';
import { MetadataResult, MetadataField } from './types';

// Helper to create a MetadataField with 'present' status
function present<T>(value: T): MetadataField<T> {
  return { value, status: 'present' };
}

// Helper to create a MetadataField with 'absent' status
function absent<T>(): MetadataField<T> {
  return { value: null, status: 'absent' };
}

// Helper to create a full MetadataResult with all fields present (genuine image)
function createGenuineMetadata(): MetadataResult {
  return {
    cameraMake: present('Canon'),
    cameraModel: present('EOS R5'),
    lensMake: present('Canon'),
    lensModel: present('RF 24-70mm'),
    focalLength: present(50),
    dateTimeOriginal: present(new Date('2024-01-15T10:30:00')),
    modifyDate: present(new Date('2024-01-15T10:31:00')),
    gpsLatitude: present(37.774929),
    gpsLongitude: present(-122.419416),
    gpsAltitude: present(15.5),
    fNumber: present(2.8),
    iso: present(400),
    exposureTime: present(1 / 250),
    software: present('Canon Digital Photo Professional'),
    imageWidth: present(4000),
    imageHeight: present(3000),
    bitDepth: present(8),
    colorProfile: present('sRGB'),
  };
}

describe('Detection Engine - analyze', () => {
  describe('MISSING_EXIF signal', () => {
    it('should not trigger when 3 or more core fields are present', () => {
      const metadata = createGenuineMetadata();
      const signals = analyze(metadata, 5000000);
      const missingExif = signals.filter((s) => s.type === 'MISSING_EXIF');
      expect(missingExif).toHaveLength(0);
    });

    it('should trigger when fewer than 3 core fields are present', () => {
      const metadata = createGenuineMetadata();
      metadata.cameraMake = absent();
      metadata.cameraModel = absent();
      metadata.dateTimeOriginal = absent();
      metadata.exposureTime = absent();
      // Only fNumber and iso remain present (2 of 6)
      const signals = analyze(metadata, 5000000);
      const missingExif = signals.filter((s) => s.type === 'MISSING_EXIF');
      expect(missingExif).toHaveLength(1);
      expect(missingExif[0].severity).toBeCloseTo(1 / 3); // (3-2)/3
    });

    it('should have severity 1.0 when 0 core fields are present', () => {
      const metadata = createGenuineMetadata();
      metadata.cameraMake = absent();
      metadata.cameraModel = absent();
      metadata.dateTimeOriginal = absent();
      metadata.exposureTime = absent();
      metadata.fNumber = absent();
      metadata.iso = absent();
      const signals = analyze(metadata, 5000000);
      const missingExif = signals.filter((s) => s.type === 'MISSING_EXIF');
      expect(missingExif).toHaveLength(1);
      expect(missingExif[0].severity).toBe(1.0);
    });

    it('should have severity 2/3 when only 1 core field is present', () => {
      const metadata = createGenuineMetadata();
      metadata.cameraMake = absent();
      metadata.cameraModel = absent();
      metadata.dateTimeOriginal = absent();
      metadata.exposureTime = absent();
      metadata.fNumber = absent();
      // Only iso present (1 of 6)
      const signals = analyze(metadata, 5000000);
      const missingExif = signals.filter((s) => s.type === 'MISSING_EXIF');
      expect(missingExif).toHaveLength(1);
      expect(missingExif[0].severity).toBeCloseTo(2 / 3);
    });
  });

  describe('SOFTWARE_FINGERPRINT signal', () => {
    it('should not trigger when software is absent', () => {
      const metadata = createGenuineMetadata();
      metadata.software = absent();
      const signals = analyze(metadata, 5000000);
      const sw = signals.filter((s) => s.type === 'SOFTWARE_FINGERPRINT');
      expect(sw).toHaveLength(0);
    });

    it('should not trigger when software does not match any keyword', () => {
      const metadata = createGenuineMetadata();
      metadata.software = present('Canon Digital Photo Professional');
      const signals = analyze(metadata, 5000000);
      const sw = signals.filter((s) => s.type === 'SOFTWARE_FINGERPRINT');
      expect(sw).toHaveLength(0);
    });

    it('should trigger for "DALL-E" (case-insensitive)', () => {
      const metadata = createGenuineMetadata();
      metadata.software = present('Generated with DALL-E 3');
      const signals = analyze(metadata, 5000000);
      const sw = signals.filter((s) => s.type === 'SOFTWARE_FINGERPRINT');
      expect(sw).toHaveLength(1);
      expect(sw[0].severity).toBe(1.0);
    });

    it('should trigger for "stable diffusion" in mixed case', () => {
      const metadata = createGenuineMetadata();
      metadata.software = present('Stable Diffusion XL v1.0');
      const signals = analyze(metadata, 5000000);
      const sw = signals.filter((s) => s.type === 'SOFTWARE_FINGERPRINT');
      expect(sw).toHaveLength(1);
      expect(sw[0].severity).toBe(1.0);
    });

    it('should trigger for "Photoshop"', () => {
      const metadata = createGenuineMetadata();
      metadata.software = present('Adobe Photoshop CC 2024');
      const signals = analyze(metadata, 5000000);
      const sw = signals.filter((s) => s.type === 'SOFTWARE_FINGERPRINT');
      expect(sw).toHaveLength(1);
    });
  });

  describe('TIMESTAMP_INCONSISTENCY signal', () => {
    it('should not trigger when timestamps are within 24 hours', () => {
      const metadata = createGenuineMetadata();
      metadata.dateTimeOriginal = present(new Date('2024-01-15T10:00:00'));
      metadata.modifyDate = present(new Date('2024-01-15T12:00:00'));
      const signals = analyze(metadata, 5000000);
      const ts = signals.filter((s) => s.type === 'TIMESTAMP_INCONSISTENCY');
      expect(ts).toHaveLength(0);
    });

    it('should trigger when timestamps differ by more than 24 hours', () => {
      const metadata = createGenuineMetadata();
      metadata.dateTimeOriginal = present(new Date('2024-01-15T10:00:00'));
      metadata.modifyDate = present(new Date('2024-01-20T10:00:00')); // 5 days later
      const signals = analyze(metadata, 5000000);
      const ts = signals.filter((s) => s.type === 'TIMESTAMP_INCONSISTENCY');
      expect(ts).toHaveLength(1);
      // 120 hours / 720 = 0.1667
      expect(ts[0].severity).toBeCloseTo(120 / 720);
    });

    it('should cap severity at 1.0 for very large differences', () => {
      const metadata = createGenuineMetadata();
      metadata.dateTimeOriginal = present(new Date('2020-01-01T00:00:00'));
      metadata.modifyDate = present(new Date('2024-01-01T00:00:00')); // 4 years
      const signals = analyze(metadata, 5000000);
      const ts = signals.filter((s) => s.type === 'TIMESTAMP_INCONSISTENCY');
      expect(ts).toHaveLength(1);
      expect(ts[0].severity).toBe(1.0);
    });

    it('should trigger with severity 0.5 when dateTimeOriginal is absent', () => {
      const metadata = createGenuineMetadata();
      metadata.dateTimeOriginal = absent();
      const signals = analyze(metadata, 5000000);
      const ts = signals.filter((s) => s.type === 'TIMESTAMP_INCONSISTENCY');
      expect(ts).toHaveLength(1);
      expect(ts[0].severity).toBe(0.5);
      expect(ts[0].triggerField).toBe('dateTimeOriginal');
    });

    it('should trigger with severity 0.5 when modifyDate is absent', () => {
      const metadata = createGenuineMetadata();
      metadata.modifyDate = absent();
      const signals = analyze(metadata, 5000000);
      const ts = signals.filter((s) => s.type === 'TIMESTAMP_INCONSISTENCY');
      expect(ts).toHaveLength(1);
      expect(ts[0].severity).toBe(0.5);
      expect(ts[0].triggerField).toBe('modifyDate');
    });
  });

  describe('FILE_SIZE_ANOMALY signal', () => {
    it('should not trigger when ratio is between 0.2 and 5.0', () => {
      const metadata = createGenuineMetadata();
      metadata.imageWidth = present(4000);
      metadata.imageHeight = present(3000);
      // Expected = 4000*3000*3 = 36,000,000
      // File size of 10,000,000 gives ratio ~0.278 (within range)
      const signals = analyze(metadata, 10000000);
      const fs = signals.filter((s) => s.type === 'FILE_SIZE_ANOMALY');
      expect(fs).toHaveLength(0);
    });

    it('should trigger when ratio < 0.2 (very small file)', () => {
      const metadata = createGenuineMetadata();
      metadata.imageWidth = present(4000);
      metadata.imageHeight = present(3000);
      // Expected = 36,000,000, ratio = 100000/36000000 ≈ 0.003
      const signals = analyze(metadata, 100000);
      const fs = signals.filter((s) => s.type === 'FILE_SIZE_ANOMALY');
      expect(fs).toHaveLength(1);
      expect(fs[0].severity).toBeGreaterThan(0);
      expect(fs[0].severity).toBeLessThanOrEqual(1.0);
    });

    it('should trigger when ratio > 5.0 (very large file)', () => {
      const metadata = createGenuineMetadata();
      metadata.imageWidth = present(4000);
      metadata.imageHeight = present(3000);
      // Expected = 36,000,000, ratio = 200,000,000/36,000,000 ≈ 5.56
      const signals = analyze(metadata, 200000000);
      const fs = signals.filter((s) => s.type === 'FILE_SIZE_ANOMALY');
      expect(fs).toHaveLength(1);
    });

    it('should not trigger when image dimensions are absent', () => {
      const metadata = createGenuineMetadata();
      metadata.imageWidth = absent();
      metadata.imageHeight = absent();
      const signals = analyze(metadata, 5000000);
      const fs = signals.filter((s) => s.type === 'FILE_SIZE_ANOMALY');
      expect(fs).toHaveLength(0);
    });

    it('should compute severity as min(1.0, abs(ratio - 1) / 4)', () => {
      const metadata = createGenuineMetadata();
      metadata.imageWidth = present(1000);
      metadata.imageHeight = present(1000);
      // Expected = 1000*1000*3 = 3,000,000
      // File size = 100,000 → ratio = 0.0333
      // abs(0.0333 - 1) / 4 = 0.9667 / 4 ≈ 0.2417
      const signals = analyze(metadata, 100000);
      const fs = signals.filter((s) => s.type === 'FILE_SIZE_ANOMALY');
      expect(fs).toHaveLength(1);
      expect(fs[0].severity).toBeCloseTo(Math.abs(100000 / 3000000 - 1) / 4);
    });
  });

  describe('COLOR_PROFILE_ABNORMALITY signal', () => {
    it('should not trigger when color profile is present and bit depth is 8', () => {
      const metadata = createGenuineMetadata();
      const signals = analyze(metadata, 5000000);
      const cp = signals.filter((s) => s.type === 'COLOR_PROFILE_ABNORMALITY');
      expect(cp).toHaveLength(0);
    });

    it('should not trigger when color profile is present and bit depth is 16', () => {
      const metadata = createGenuineMetadata();
      metadata.bitDepth = present(16);
      const signals = analyze(metadata, 5000000);
      const cp = signals.filter((s) => s.type === 'COLOR_PROFILE_ABNORMALITY');
      expect(cp).toHaveLength(0);
    });

    it('should trigger with severity 0.5 when only color profile is absent', () => {
      const metadata = createGenuineMetadata();
      metadata.colorProfile = absent();
      const signals = analyze(metadata, 5000000);
      const cp = signals.filter((s) => s.type === 'COLOR_PROFILE_ABNORMALITY');
      expect(cp).toHaveLength(1);
      expect(cp[0].severity).toBe(0.5);
    });

    it('should trigger with severity 0.5 when only bit depth is abnormal', () => {
      const metadata = createGenuineMetadata();
      metadata.bitDepth = present(32);
      const signals = analyze(metadata, 5000000);
      const cp = signals.filter((s) => s.type === 'COLOR_PROFILE_ABNORMALITY');
      expect(cp).toHaveLength(1);
      expect(cp[0].severity).toBe(0.5);
    });

    it('should trigger with severity 1.0 when both conditions met', () => {
      const metadata = createGenuineMetadata();
      metadata.colorProfile = absent();
      metadata.bitDepth = present(32);
      const signals = analyze(metadata, 5000000);
      const cp = signals.filter((s) => s.type === 'COLOR_PROFILE_ABNORMALITY');
      expect(cp).toHaveLength(1);
      expect(cp[0].severity).toBe(1.0);
    });
  });

  describe('MISSING_GPS signal', () => {
    it('should not trigger when both GPS coordinates are present', () => {
      const metadata = createGenuineMetadata();
      const signals = analyze(metadata, 5000000);
      const gps = signals.filter((s) => s.type === 'MISSING_GPS');
      expect(gps).toHaveLength(0);
    });

    it('should trigger when GPS latitude is absent', () => {
      const metadata = createGenuineMetadata();
      metadata.gpsLatitude = absent();
      const signals = analyze(metadata, 5000000);
      const gps = signals.filter((s) => s.type === 'MISSING_GPS');
      expect(gps).toHaveLength(1);
      expect(gps[0].severity).toBe(1.0);
      expect(gps[0].triggerField).toBe('gpsLatitude');
    });

    it('should trigger when GPS longitude is absent', () => {
      const metadata = createGenuineMetadata();
      metadata.gpsLongitude = absent();
      const signals = analyze(metadata, 5000000);
      const gps = signals.filter((s) => s.type === 'MISSING_GPS');
      expect(gps).toHaveLength(1);
      expect(gps[0].severity).toBe(1.0);
      expect(gps[0].triggerField).toBe('gpsLongitude');
    });

    it('should trigger when both GPS coordinates are absent', () => {
      const metadata = createGenuineMetadata();
      metadata.gpsLatitude = absent();
      metadata.gpsLongitude = absent();
      const signals = analyze(metadata, 5000000);
      const gps = signals.filter((s) => s.type === 'MISSING_GPS');
      expect(gps).toHaveLength(1);
      expect(gps[0].severity).toBe(1.0);
    });
  });

  describe('Signal structure', () => {
    it('all signals have valid type, severity in [0,1], and non-empty triggerField', () => {
      const metadata = createGenuineMetadata();
      // Make it trigger everything
      metadata.cameraMake = absent();
      metadata.cameraModel = absent();
      metadata.dateTimeOriginal = absent();
      metadata.exposureTime = absent();
      metadata.fNumber = absent();
      metadata.iso = absent();
      metadata.software = present('DALL-E 3');
      metadata.gpsLatitude = absent();
      metadata.colorProfile = absent();
      metadata.bitDepth = present(32);

      const signals = analyze(metadata, 100); // tiny file for anomaly

      for (const signal of signals) {
        expect(signal.type).toBeTruthy();
        expect(signal.severity).toBeGreaterThanOrEqual(0);
        expect(signal.severity).toBeLessThanOrEqual(1.0);
        expect(signal.triggerField).toBeTruthy();
        expect(signal.description).toBeTruthy();
      }
    });
  });
});
