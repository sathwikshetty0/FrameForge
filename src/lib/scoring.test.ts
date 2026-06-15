import { describe, it, expect } from 'vitest';
import { computeScore } from './scoring';
import { DetectionSignal } from './types';

describe('computeScore', () => {
  it('returns score 100 with GENUINE verdict when no signals', () => {
    const result = computeScore([]);
    expect(result.score).toBe(100);
    expect(result.verdict).toBe('GENUINE');
  });

  it('deducts points based on signal severity and max deduction', () => {
    const signals: DetectionSignal[] = [
      {
        type: 'SOFTWARE_FINGERPRINT',
        severity: 1.0,
        triggerField: 'software',
        description: 'AI software detected',
      },
    ];
    const result = computeScore(signals);
    // 100 - round(40 * 1.0) = 60
    expect(result.score).toBe(60);
    expect(result.verdict).toBe('SUSPICIOUS');
  });

  it('deduplicates same-type signals using highest severity', () => {
    const signals: DetectionSignal[] = [
      {
        type: 'MISSING_EXIF',
        severity: 0.5,
        triggerField: 'cameraMake',
        description: 'Missing field',
      },
      {
        type: 'MISSING_EXIF',
        severity: 0.8,
        triggerField: 'cameraModel',
        description: 'Missing field',
      },
      {
        type: 'MISSING_EXIF',
        severity: 0.3,
        triggerField: 'iso',
        description: 'Missing field',
      },
    ];
    const result = computeScore(signals);
    // 100 - round(30 * 0.8) = 100 - 24 = 76
    expect(result.score).toBe(76);
    expect(result.verdict).toBe('GENUINE');
  });

  it('clamps score to 0 when deductions exceed 100', () => {
    const signals: DetectionSignal[] = [
      { type: 'SOFTWARE_FINGERPRINT', severity: 1.0, triggerField: 'software', description: 'AI' },
      { type: 'MISSING_EXIF', severity: 1.0, triggerField: 'cameraMake', description: 'Missing' },
      { type: 'TIMESTAMP_INCONSISTENCY', severity: 1.0, triggerField: 'dateTimeOriginal', description: 'Inconsistent' },
      { type: 'FILE_SIZE_ANOMALY', severity: 1.0, triggerField: 'imageWidth', description: 'Anomaly' },
      { type: 'COLOR_PROFILE_ABNORMALITY', severity: 1.0, triggerField: 'colorProfile', description: 'Abnormal' },
      { type: 'MISSING_GPS', severity: 1.0, triggerField: 'gpsLatitude', description: 'No GPS' },
    ];
    const result = computeScore(signals);
    // 100 - 40 - 30 - 20 - 20 - 15 - 10 = -35, clamped to 0
    expect(result.score).toBe(0);
    expect(result.verdict).toBe('LIKELY SYNTHETIC');
  });

  it('maps score correctly to SUSPICIOUS verdict', () => {
    const signals: DetectionSignal[] = [
      { type: 'SOFTWARE_FINGERPRINT', severity: 1.0, triggerField: 'software', description: 'AI' },
      { type: 'MISSING_GPS', severity: 1.0, triggerField: 'gpsLatitude', description: 'No GPS' },
    ];
    const result = computeScore(signals);
    // 100 - 40 - 10 = 50
    expect(result.score).toBe(50);
    expect(result.verdict).toBe('SUSPICIOUS');
  });

  it('maps score correctly to LIKELY SYNTHETIC verdict', () => {
    const signals: DetectionSignal[] = [
      { type: 'SOFTWARE_FINGERPRINT', severity: 1.0, triggerField: 'software', description: 'AI' },
      { type: 'MISSING_EXIF', severity: 1.0, triggerField: 'cameraMake', description: 'Missing' },
      { type: 'TIMESTAMP_INCONSISTENCY', severity: 1.0, triggerField: 'dateTimeOriginal', description: 'Inconsistent' },
    ];
    const result = computeScore(signals);
    // 100 - 40 - 30 - 20 = 10
    expect(result.score).toBe(10);
    expect(result.verdict).toBe('LIKELY SYNTHETIC');
  });

  it('produces breakdown with all 9 signal types', () => {
    const result = computeScore([]);
    expect(result.breakdown).toHaveLength(9);

    const types = result.breakdown.map((b) => b.signalType);
    expect(types).toContain('SOFTWARE_FINGERPRINT');
    expect(types).toContain('MISSING_EXIF');
    expect(types).toContain('TIMESTAMP_INCONSISTENCY');
    expect(types).toContain('FILE_SIZE_ANOMALY');
    expect(types).toContain('COLOR_PROFILE_ABNORMALITY');
    expect(types).toContain('MISSING_GPS');
    expect(types).toContain('PIXEL_ANALYSIS');
    expect(types).toContain('PNG_METADATA_AI');
    expect(types).toContain('FILENAME_PATTERN');
  });

  it('marks non-triggered types as triggered=false with pointsDeducted=0', () => {
    const signals: DetectionSignal[] = [
      { type: 'SOFTWARE_FINGERPRINT', severity: 0.5, triggerField: 'software', description: 'AI' },
    ];
    const result = computeScore(signals);

    const softwareEntry = result.breakdown.find((b) => b.signalType === 'SOFTWARE_FINGERPRINT')!;
    expect(softwareEntry.triggered).toBe(true);
    expect(softwareEntry.pointsDeducted).toBe(20); // round(40 * 0.5)

    const gpsEntry = result.breakdown.find((b) => b.signalType === 'MISSING_GPS')!;
    expect(gpsEntry.triggered).toBe(false);
    expect(gpsEntry.pointsDeducted).toBe(0);
    expect(gpsEntry.maxDeduction).toBe(10);
  });

  it('includes maxDeduction in each breakdown entry', () => {
    const result = computeScore([]);
    const expected: Record<string, number> = {
      SOFTWARE_FINGERPRINT: 40,
      MISSING_EXIF: 30,
      TIMESTAMP_INCONSISTENCY: 20,
      FILE_SIZE_ANOMALY: 20,
      COLOR_PROFILE_ABNORMALITY: 15,
      MISSING_GPS: 10,
      PIXEL_ANALYSIS: 25,
      PNG_METADATA_AI: 35,
      FILENAME_PATTERN: 30,
    };
    for (const entry of result.breakdown) {
      expect(entry.maxDeduction).toBe(expected[entry.signalType]);
    }
  });

  it('passes through the original signals array in the result', () => {
    const signals: DetectionSignal[] = [
      { type: 'MISSING_GPS', severity: 1.0, triggerField: 'gpsLatitude', description: 'No GPS' },
    ];
    const result = computeScore(signals);
    expect(result.signals).toBe(signals);
  });

  it('applies partial severity deduction correctly', () => {
    const signals: DetectionSignal[] = [
      { type: 'MISSING_EXIF', severity: 0.33, triggerField: 'cameraMake', description: 'Partial' },
    ];
    const result = computeScore(signals);
    // 100 - round(30 * 0.33) = 100 - round(9.9) = 100 - 10 = 90
    expect(result.score).toBe(90);
  });
});
