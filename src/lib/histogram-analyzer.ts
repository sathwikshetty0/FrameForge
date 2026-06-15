import { HistogramResult } from './types';

/**
 * Computes a 256-bin frequency histogram for a single color channel.
 * @param pixelData - RGBA pixel data
 * @param channelOffset - 0 for Red, 1 for Green, 2 for Blue
 * @returns 256-element array where index = pixel value, value = frequency count
 */
export function computeChannelHistogram(
  pixelData: Uint8ClampedArray,
  channelOffset: number
): number[] {
  const histogram = new Array<number>(256).fill(0);

  for (let i = channelOffset; i < pixelData.length; i += 4) {
    histogram[pixelData[i]]++;
  }

  return histogram;
}

/**
 * Calculates smoothness metric: average absolute difference between adjacent bins.
 * Lower values indicate unnaturally smooth/uniform distributions.
 */
export function computeSmoothness(histogram: number[]): number {
  if (histogram.length < 2) return 0;

  let totalDiff = 0;
  for (let i = 0; i < histogram.length - 1; i++) {
    totalDiff += Math.abs(histogram[i + 1] - histogram[i]);
  }

  return totalDiff / (histogram.length - 1);
}

/**
 * Computes RGB histograms and smoothness metrics from pixel data.
 *
 * @param imageData - The image pixel data (RGBA Uint8ClampedArray)
 * @param smoothnessThreshold - Threshold below which distribution is "too smooth" (default: 50)
 * @returns HistogramResult with per-channel histograms and severity
 */
export function analyzeHistogram(
  imageData: ImageData,
  smoothnessThreshold: number = 50
): HistogramResult {
  const pixelData = imageData.data;

  // Handle edge case: zero-length pixel data
  if (pixelData.length === 0) {
    return {
      redHistogram: new Array<number>(256).fill(0),
      greenHistogram: new Array<number>(256).fill(0),
      blueHistogram: new Array<number>(256).fill(0),
      redSmoothness: 0,
      greenSmoothness: 0,
      blueSmoothness: 0,
      severity: 0,
    };
  }

  const redHistogram = computeChannelHistogram(pixelData, 0);
  const greenHistogram = computeChannelHistogram(pixelData, 1);
  const blueHistogram = computeChannelHistogram(pixelData, 2);

  const redSmoothness = computeSmoothness(redHistogram);
  const greenSmoothness = computeSmoothness(greenHistogram);
  const blueSmoothness = computeSmoothness(blueHistogram);

  let severity = 0;

  if (
    redSmoothness < smoothnessThreshold &&
    greenSmoothness < smoothnessThreshold &&
    blueSmoothness < smoothnessThreshold
  ) {
    const averageSmoothness = (redSmoothness + greenSmoothness + blueSmoothness) / 3;
    severity = 1.0 - averageSmoothness / smoothnessThreshold;
  }

  return {
    redHistogram,
    greenHistogram,
    blueHistogram,
    redSmoothness,
    greenSmoothness,
    blueSmoothness,
    severity,
  };
}
