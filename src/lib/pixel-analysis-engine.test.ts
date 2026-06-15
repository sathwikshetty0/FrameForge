import { describe, it, expect } from 'vitest';
import { combineSignals } from './pixel-analysis-engine';
import { ElaResult, HistogramResult } from './types';

function makeHistogramResult(severity: number): HistogramResult {
  return {
    redHistogram: new Array(256).fill(0),
    greenHistogram: new Array(256).fill(0),
    blueHistogram: new Array(256).fill(0),
    redSmoothness: 10,
    greenSmoothness: 10,
    blueSmoothness: 10,
    severity,
  };
}

function makeElaResult(severity: number, blockStdDev: number = 5.0): ElaResult {
  return {
    meanDifference: 50,
    blockStdDev,
    severity,
    differenceData: new Uint8ClampedArray(16),
    width: 2,
    height: 2,
  };
}

describe('combineSignals', () => {
  it('returns null when both severities are 0', () => {
    const result = combineSignals(makeElaResult(0), makeHistogramResult(0));
    expect(result).toBeNull();
  });

  it('returns null when ELA is null and histogram severity is 0', () => {
    const result = combineSignals(null, makeHistogramResult(0));
    expect(result).toBeNull();
  });

  it('uses max severity between ELA and Histogram', () => {
    const result = combineSignals(makeElaResult(0.3), makeHistogramResult(0.7));
    expect(result).not.toBeNull();
    expect(result!.severity).toBe(0.7);
  });

  it('sets triggerField to ela when ELA severity is higher', () => {
    const result = combineSignals(makeElaResult(0.8), makeHistogramResult(0.3));
    expect(result!.triggerField).toBe('ela');
  });

  it('sets triggerField to histogram when histogram severity is higher', () => {
    const result = combineSignals(makeElaResult(0.2), makeHistogramResult(0.9));
    expect(result!.triggerField).toBe('histogram');
  });

  it('sets triggerField to ela when severities are equal', () => {
    const result = combineSignals(makeElaResult(0.5), makeHistogramResult(0.5));
    expect(result!.triggerField).toBe('ela');
  });

  it('concatenates descriptions from both non-zero sub-analyses with " | "', () => {
    const result = combineSignals(makeElaResult(0.6, 8.5), makeHistogramResult(0.4));
    expect(result!.description).toBe(
      'ELA: uniform error distribution (stddev=8.50) | Histogram: unnaturally smooth color distribution'
    );
  });

  it('includes only ELA description when histogram severity is 0', () => {
    const result = combineSignals(makeElaResult(0.5, 3.2), makeHistogramResult(0));
    expect(result!.description).toBe('ELA: uniform error distribution (stddev=3.20)');
    expect(result!.description).not.toContain('|');
  });

  it('includes only histogram description when ELA severity is 0', () => {
    const result = combineSignals(makeElaResult(0), makeHistogramResult(0.6));
    expect(result!.description).toBe('Histogram: unnaturally smooth color distribution');
    expect(result!.description).not.toContain('|');
  });

  it('handles ELA being null with histogram having severity > 0', () => {
    const result = combineSignals(null, makeHistogramResult(0.8));
    expect(result).not.toBeNull();
    expect(result!.severity).toBe(0.8);
    expect(result!.triggerField).toBe('histogram');
    expect(result!.description).toBe('Histogram: unnaturally smooth color distribution');
  });

  it('always produces type PIXEL_ANALYSIS', () => {
    const result = combineSignals(makeElaResult(0.5), makeHistogramResult(0.5));
    expect(result!.type).toBe('PIXEL_ANALYSIS');
  });
});
