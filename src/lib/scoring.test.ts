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
    // 100 - round(30 * 1.0) = 70
    expect(result.score).toBe(70);
    expect(result.verdict).toBe('GENUINE');
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
    // 100 - round(25 * 0.8) = 100 - 20 = 80
    expect(result.score).toBe(80);
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
    // 100 - 30 - 25 - 15 - 15 - 10 - 5 = 0
    expect(result.score).toBe(0);
    expect(result.verdict).toBe('LIKELY SYNTHETIC');
  });

  it('maps score correctly to SUSPICIOUS verdict', () => {
    const signals: DetectionSignal[] = [
      { type: 'SOFTWARE_FINGERPRINT', severity: 1.0, triggerField: 'software', description: 'AI' },
      { type: 'MISSING_GPS', severity: 1.0, triggerField: 'gpsLatitude', description: 'No GPS' },
    ];
    const result = computeScore(signals);
    // 100 - 30 - 5 = 65
    expect(result.score).toBe(65);
    expect(result.verdict).toBe('SUSPICIOUS');
  });

  it('maps score correctly to LIKELY SYNTHETIC verdict', () => {
    const signals: DetectionSignal[] = [
      { type: 'SOFTWARE_FINGERPRINT', severity: 1.0, triggerField: 'software', description: 'AI' },
      { type: 'MISSING_EXIF', severity: 1.0, triggerField: 'cameraMake', description: 'Missing' },
      { type: 'TIMESTAMP_INCONSISTENCY', severity: 1.0, triggerField: 'dateTimeOriginal', description: 'Inconsistent' },
    ];
    const result = computeScore(signals);
    // 100 - 30 - 25 - 15 = 30
    expect(result.score).toBe(30);
    expect(result.verdict).toBe('LIKELY SYNTHETIC');
  });

  it('produces breakdown with all 6 signal types', () => {
    const result = computeScore([]);
    expect(result.breakdown).toHaveLength(6);

    const types = result.breakdown.map((b) => b.signalType);
    expect(types).toContain('SOFTWARE_FINGERPRINT');
    expect(types).toContain('MISSING_EXIF');
    expect(types).toContain('TIMESTAMP_INCONSISTENCY');
    expect(types).toContain('FILE_SIZE_ANOMALY');
    expect(types).toContain('COLOR_PROFILE_ABNORMALITY');
    expect(types).toContain('MISSING_GPS');
  });

  it('marks non-triggered types as triggered=false with pointsDeducted=0', () => {
    const signals: DetectionSignal[] = [
      { type: 'SOFTWARE_FINGERPRINT', severity: 0.5, triggerField: 'software', description: 'AI' },
    ];
    const result = computeScore(signals);

    const softwareEntry = result.breakdown.find((b) => b.signalType === 'SOFTWARE_FINGERPRINT')!;
    expect(softwareEntry.triggered).toBe(true);
    expect(softwareEntry.pointsDeducted).toBe(15); // round(30 * 0.5)

    const gpsEntry = result.breakdown.find((b) => b.signalType === 'MISSING_GPS')!;
    expect(gpsEntry.triggered).toBe(false);
    expect(gpsEntry.pointsDeducted).toBe(0);
    expect(gpsEntry.maxDeduction).toBe(5);
  });

  it('includes maxDeduction in each breakdown entry', () => {
    const result = computeScore([]);
    const expected: Record<string, number> = {
      SOFTWARE_FINGERPRINT: 30,
      MISSING_EXIF: 25,
      TIMESTAMP_INCONSISTENCY: 15,
      FILE_SIZE_ANOMALY: 15,
      COLOR_PROFILE_ABNORMALITY: 10,
      MISSING_GPS: 5,
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
    // 100 - round(25 * 0.33) = 100 - round(8.25) = 100 - 8 = 92
    expect(result.score).toBe(92);
  });
});
