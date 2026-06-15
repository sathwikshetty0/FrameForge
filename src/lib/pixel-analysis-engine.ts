import { DetectionSignal, ElaResult, HistogramResult } from './types';
import { analyzeEla } from './ela-analyzer';
import { analyzeHistogram } from './histogram-analyzer';

export interface PixelAnalysisInput {
  /** The original image as ImageData (from canvas getImageData) */
  imageData: ImageData;
}

export interface PixelAnalysisResult {
  ela: ElaResult | null;
  histogram: HistogramResult;
  signal: DetectionSignal | null;
}

/**
 * Combines ELA and Histogram results into a single DetectionSignal.
 * Uses max severity between the two sub-analyses.
 * Returns null if neither analysis produced a severity > 0.
 */
export function combineSignals(
  ela: ElaResult | null,
  histogram: HistogramResult
): DetectionSignal | null {
  const elaSeverity = ela?.severity ?? 0;
  const histSeverity = histogram.severity;

  if (elaSeverity === 0 && histSeverity === 0) return null;

  const maxSeverity = Math.max(elaSeverity, histSeverity);
  const triggerField = elaSeverity >= histSeverity ? 'ela' : 'histogram';

  const descriptions: string[] = [];
  if (ela && ela.severity > 0) {
    descriptions.push(`ELA: uniform error distribution (stddev=${ela.blockStdDev.toFixed(2)})`);
  }
  if (histogram.severity > 0) {
    descriptions.push(`Histogram: unnaturally smooth color distribution`);
  }

  return {
    type: 'PIXEL_ANALYSIS',
    severity: maxSeverity,
    triggerField,
    description: descriptions.join(' | '),
  };
}

/**
 * Runs both ELA and Histogram analysis, produces combined PIXEL_ANALYSIS signal.
 *
 * @param input - Image pixel data
 * @returns Combined result with optional signal
 */
export async function analyzePixels(input: PixelAnalysisInput): Promise<PixelAnalysisResult> {
  const ela = await analyzeEla(input.imageData);
  const histogram = analyzeHistogram(input.imageData);
  const signal = combineSignals(ela, histogram);

  return { ela, histogram, signal };
}
