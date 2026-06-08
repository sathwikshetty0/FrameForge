import { describe, it, expect } from 'vitest';
import { formatReport } from './report-formatter';
import { MetadataResult, ScoringResult, DetectionSignal } from './types';

/**
 * Helper to create a complete MetadataResult with all fields absent.
 */
function makeAbsentMetadata(): MetadataResult {
  return {
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
}

/**
 * Helper to create a complete MetadataResult with all fields present.
 */
function makePresentMetadata(): MetadataResult {
  return {
    cameraMake: { value: 'Canon', status: 'present' },
    cameraModel: { value: 'EOS R5', status: 'present' },
    lensMake: { value: 'Canon', status: 'present' },
    lensModel: { value: 'RF 50mm F1.2L', status: 'present' },
    focalLength: { value: 50, status: 'present' },
    dateTimeOriginal: { value: new Date('2024-01-15T10:30:00Z'), status: 'present' },
    modifyDate: { value: new Date('2024-01-15T10:35:00Z'), status: 'present' },
    gpsLatitude: { value: 40.712776, status: 'present' },
    gpsLongitude: { value: -74.005974, status: 'present' },
    gpsAltitude: { value: 10.5, status: 'present' },
    fNumber: { value: 1.2, status: 'present' },
    iso: { value: 100, status: 'present' },
    exposureTime: { value: 0.004, status: 'present' },
    software: { value: 'Adobe Lightroom', status: 'present' },
    imageWidth: { value: 8192, status: 'present' },
    imageHeight: { value: 5464, status: 'present' },
    bitDepth: { value: 8, status: 'present' },
    colorProfile: { value: 'sRGB', status: 'present' },
  };
}

function makeGenuineResult(): ScoringResult {
  return {
    score: 95,
    verdict: 'GENUINE',
    signals: [],
    breakdown: [
      { signalType: 'SOFTWARE_FINGERPRINT', triggered: false, pointsDeducted: 0, maxDeduction: 30 },
      { signalType: 'MISSING_EXIF', triggered: false, pointsDeducted: 0, maxDeduction: 25 },
      { signalType: 'TIMESTAMP_INCONSISTENCY', triggered: false, pointsDeducted: 0, maxDeduction: 15 },
      { signalType: 'FILE_SIZE_ANOMALY', triggered: false, pointsDeducted: 0, maxDeduction: 15 },
      { signalType: 'COLOR_PROFILE_ABNORMALITY', triggered: false, pointsDeducted: 0, maxDeduction: 10 },
      { signalType: 'MISSING_GPS', triggered: false, pointsDeducted: 0, maxDeduction: 5 },
    ],
  };
}

describe('formatReport', () => {
  const analysisTimestamp = new Date('2024-06-01T14:30:00.000Z');
  const fileName = 'dashcam_001.jpg';

  it('should include the header section with file name and ISO 8601 timestamp', () => {
    const metadata = makeAbsentMetadata();
    const result = makeGenuineResult();

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    expect(report).toContain('=== FRAMEFORGE VERIFY - FORENSIC REPORT ===');
    expect(report).toContain('File: dashcam_001.jpg');
    expect(report).toContain('Analyzed: 2024-06-01T14:30:00.000Z');
  });

  it('should display MISSING for absent fields', () => {
    const metadata = makeAbsentMetadata();
    const result = makeGenuineResult();

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    expect(report).toContain('Camera Make: MISSING');
    expect(report).toContain('Camera Model: MISSING');
    expect(report).toContain('Lens Make: MISSING');
    expect(report).toContain('Lens Model: MISSING');
    expect(report).toContain('Focal Length: MISSING');
    expect(report).toContain('Date Time Original: MISSING');
    expect(report).toContain('Modify Date: MISSING');
    expect(report).toContain('GPS Latitude: MISSING');
    expect(report).toContain('GPS Longitude: MISSING');
    expect(report).toContain('GPS Altitude: MISSING');
    expect(report).toContain('F-Number: MISSING');
    expect(report).toContain('ISO: MISSING');
    expect(report).toContain('Exposure Time: MISSING');
    expect(report).toContain('Software: MISSING');
    expect(report).toContain('Image Width: MISSING');
    expect(report).toContain('Image Height: MISSING');
    expect(report).toContain('Bit Depth: MISSING');
    expect(report).toContain('Color Profile: MISSING');
  });

  it('should display CORRUPT for corrupt fields', () => {
    const metadata = makeAbsentMetadata();
    metadata.cameraMake = { value: null, status: 'corrupt' };
    metadata.focalLength = { value: null, status: 'corrupt' };
    metadata.dateTimeOriginal = { value: null, status: 'corrupt' };
    const result = makeGenuineResult();

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    expect(report).toContain('Camera Make: CORRUPT');
    expect(report).toContain('Focal Length: CORRUPT');
    expect(report).toContain('Date Time Original: CORRUPT');
  });

  it('should display exact values with correct units for present fields', () => {
    const metadata = makePresentMetadata();
    const result = makeGenuineResult();

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    expect(report).toContain('Camera Make: Canon');
    expect(report).toContain('Camera Model: EOS R5');
    expect(report).toContain('Lens Make: Canon');
    expect(report).toContain('Lens Model: RF 50mm F1.2L');
    expect(report).toContain('Focal Length: 50mm');
    expect(report).toContain('Date Time Original: 2024-01-15T10:30:00.000Z');
    expect(report).toContain('Modify Date: 2024-01-15T10:35:00.000Z');
    expect(report).toContain('GPS Latitude: 40.712776°');
    expect(report).toContain('GPS Longitude: -74.005974°');
    expect(report).toContain('GPS Altitude: 10.5m');
    expect(report).toContain('F-Number: f/1.2');
    expect(report).toContain('ISO: 100');
    expect(report).toContain('Exposure Time: 0.004s');
    expect(report).toContain('Software: Adobe Lightroom');
    expect(report).toContain('Image Width: 8192px');
    expect(report).toContain('Image Height: 5464px');
    expect(report).toContain('Bit Depth: 8 bits');
    expect(report).toContain('Color Profile: sRGB');
  });

  it('should include the detection signals section with TRIGGERED and CLEAR statuses', () => {
    const metadata = makePresentMetadata();
    const signals: DetectionSignal[] = [
      {
        type: 'SOFTWARE_FINGERPRINT',
        severity: 1.0,
        triggerField: 'software',
        description: 'Known AI software detected: Stable Diffusion',
      },
    ];
    const result: ScoringResult = {
      score: 70,
      verdict: 'GENUINE',
      signals,
      breakdown: [
        { signalType: 'SOFTWARE_FINGERPRINT', triggered: true, pointsDeducted: 30, maxDeduction: 30 },
        { signalType: 'MISSING_EXIF', triggered: false, pointsDeducted: 0, maxDeduction: 25 },
        { signalType: 'TIMESTAMP_INCONSISTENCY', triggered: false, pointsDeducted: 0, maxDeduction: 15 },
        { signalType: 'FILE_SIZE_ANOMALY', triggered: false, pointsDeducted: 0, maxDeduction: 15 },
        { signalType: 'COLOR_PROFILE_ABNORMALITY', triggered: false, pointsDeducted: 0, maxDeduction: 10 },
        { signalType: 'MISSING_GPS', triggered: false, pointsDeducted: 0, maxDeduction: 5 },
      ],
    };

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    expect(report).toContain('--- DETECTION SIGNALS ---');
    expect(report).toContain('[TRIGGERED] SOFTWARE_FINGERPRINT: Known AI software detected: Stable Diffusion');
    expect(report).toContain('[CLEAR] MISSING_EXIF');
    expect(report).toContain('[CLEAR] TIMESTAMP_INCONSISTENCY');
    expect(report).toContain('[CLEAR] FILE_SIZE_ANOMALY');
    expect(report).toContain('[CLEAR] COLOR_PROFILE_ABNORMALITY');
    expect(report).toContain('[CLEAR] MISSING_GPS');
  });

  it('should include the scoring breakdown section with deductions and max values', () => {
    const metadata = makePresentMetadata();
    const result: ScoringResult = {
      score: 55,
      verdict: 'SUSPICIOUS',
      signals: [
        { type: 'SOFTWARE_FINGERPRINT', severity: 1.0, triggerField: 'software', description: 'Match' },
        { type: 'MISSING_GPS', severity: 1.0, triggerField: 'gpsLatitude', description: 'No GPS' },
      ],
      breakdown: [
        { signalType: 'SOFTWARE_FINGERPRINT', triggered: true, pointsDeducted: 30, maxDeduction: 30 },
        { signalType: 'MISSING_EXIF', triggered: false, pointsDeducted: 0, maxDeduction: 25 },
        { signalType: 'TIMESTAMP_INCONSISTENCY', triggered: true, pointsDeducted: 10, maxDeduction: 15 },
        { signalType: 'FILE_SIZE_ANOMALY', triggered: false, pointsDeducted: 0, maxDeduction: 15 },
        { signalType: 'COLOR_PROFILE_ABNORMALITY', triggered: false, pointsDeducted: 0, maxDeduction: 10 },
        { signalType: 'MISSING_GPS', triggered: true, pointsDeducted: 5, maxDeduction: 5 },
      ],
    };

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    expect(report).toContain('--- SCORING BREAKDOWN ---');
    expect(report).toContain('Software Fingerprint: -30 (max -30)');
    expect(report).toContain('Missing EXIF: -0 (max -25)');
    expect(report).toContain('Timestamp Inconsistency: -10 (max -15)');
    expect(report).toContain('File Size Anomaly: -0 (max -15)');
    expect(report).toContain('Color Profile Abnormality: -0 (max -10)');
    expect(report).toContain('Missing GPS: -5 (max -5)');
  });

  it('should include the verdict section with score and verdict', () => {
    const metadata = makeAbsentMetadata();
    const result: ScoringResult = {
      score: 25,
      verdict: 'LIKELY SYNTHETIC',
      signals: [],
      breakdown: [
        { signalType: 'SOFTWARE_FINGERPRINT', triggered: true, pointsDeducted: 30, maxDeduction: 30 },
        { signalType: 'MISSING_EXIF', triggered: true, pointsDeducted: 25, maxDeduction: 25 },
        { signalType: 'TIMESTAMP_INCONSISTENCY', triggered: true, pointsDeducted: 15, maxDeduction: 15 },
        { signalType: 'FILE_SIZE_ANOMALY', triggered: false, pointsDeducted: 0, maxDeduction: 15 },
        { signalType: 'COLOR_PROFILE_ABNORMALITY', triggered: false, pointsDeducted: 0, maxDeduction: 10 },
        { signalType: 'MISSING_GPS', triggered: true, pointsDeducted: 5, maxDeduction: 5 },
      ],
    };

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    expect(report).toContain('--- VERDICT ---');
    expect(report).toContain('Authenticity Score: 25/100');
    expect(report).toContain('Verdict: LIKELY SYNTHETIC');
    expect(report).toContain('========================================');
  });

  it('should format dates as ISO 8601 strings', () => {
    const metadata = makeAbsentMetadata();
    metadata.dateTimeOriginal = { value: new Date('2023-12-25T08:00:00Z'), status: 'present' };
    metadata.modifyDate = { value: new Date('2024-01-01T00:00:00Z'), status: 'present' };
    const result = makeGenuineResult();

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    expect(report).toContain('Date Time Original: 2023-12-25T08:00:00.000Z');
    expect(report).toContain('Modify Date: 2024-01-01T00:00:00.000Z');
  });

  it('should format numeric fields with correct units', () => {
    const metadata = makeAbsentMetadata();
    metadata.focalLength = { value: 35, status: 'present' };
    metadata.gpsLatitude = { value: 51.507351, status: 'present' };
    metadata.gpsLongitude = { value: -0.127758, status: 'present' };
    metadata.gpsAltitude = { value: 25.3, status: 'present' };
    metadata.fNumber = { value: 2.8, status: 'present' };
    metadata.iso = { value: 400, status: 'present' };
    metadata.exposureTime = { value: 0.0125, status: 'present' };
    metadata.imageWidth = { value: 4000, status: 'present' };
    metadata.imageHeight = { value: 3000, status: 'present' };
    metadata.bitDepth = { value: 16, status: 'present' };
    const result = makeGenuineResult();

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    expect(report).toContain('Focal Length: 35mm');
    expect(report).toContain('GPS Latitude: 51.507351°');
    expect(report).toContain('GPS Longitude: -0.127758°');
    expect(report).toContain('GPS Altitude: 25.3m');
    expect(report).toContain('F-Number: f/2.8');
    expect(report).toContain('ISO: 400');
    expect(report).toContain('Exposure Time: 0.0125s');
    expect(report).toContain('Image Width: 4000px');
    expect(report).toContain('Image Height: 3000px');
    expect(report).toContain('Bit Depth: 16 bits');
  });

  it('should contain all required sections in order', () => {
    const metadata = makePresentMetadata();
    const result = makeGenuineResult();

    const report = formatReport(metadata, result, fileName, analysisTimestamp);

    const headerIdx = report.indexOf('=== FRAMEFORGE VERIFY - FORENSIC REPORT ===');
    const metadataIdx = report.indexOf('--- METADATA ---');
    const signalsIdx = report.indexOf('--- DETECTION SIGNALS ---');
    const breakdownIdx = report.indexOf('--- SCORING BREAKDOWN ---');
    const verdictIdx = report.indexOf('--- VERDICT ---');

    expect(headerIdx).toBeLessThan(metadataIdx);
    expect(metadataIdx).toBeLessThan(signalsIdx);
    expect(signalsIdx).toBeLessThan(breakdownIdx);
    expect(breakdownIdx).toBeLessThan(verdictIdx);
  });
});
