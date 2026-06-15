import { ElaResult } from './types';

/** Default amplification factor for ELA difference values */
const DEFAULT_AMPLIFICATION_FACTOR = 10;

/** Default block size for block-based standard deviation */
const DEFAULT_BLOCK_SIZE = 16;

/** Threshold for uniformity-based severity calculation */
const UNIFORMITY_THRESHOLD = 20;

/**
 * Computes per-pixel absolute difference between two pixel arrays.
 * Each pixel has 4 channels (RGBA); only RGB are compared.
 * Differences are amplified and clamped to [0, 255].
 * Alpha channel is set to 255 (fully opaque) for heatmap rendering.
 *
 * @param original - Original image RGBA pixel data
 * @param recompressed - Re-compressed image RGBA pixel data
 * @param amplificationFactor - Multiplier for difference values
 * @returns Uint8ClampedArray with amplified differences (RGBA format)
 */
export function computePixelDifference(
  original: Uint8ClampedArray,
  recompressed: Uint8ClampedArray,
  amplificationFactor: number
): Uint8ClampedArray {
  const length = Math.min(original.length, recompressed.length);
  const result = new Uint8ClampedArray(length);

  for (let i = 0; i < length; i += 4) {
    // R, G, B channels: compute |original - recompressed| * amplificationFactor, clamped to 255
    result[i] = Math.min(255, Math.abs(original[i] - recompressed[i]) * amplificationFactor);
    result[i + 1] = Math.min(255, Math.abs(original[i + 1] - recompressed[i + 1]) * amplificationFactor);
    result[i + 2] = Math.min(255, Math.abs(original[i + 2] - recompressed[i + 2]) * amplificationFactor);
    // Alpha channel: set to 255 for fully opaque heatmap rendering
    result[i + 3] = 255;
  }

  return result;
}

/**
 * Calculates the mean of all RGB channel values in a difference array.
 * Only considers R, G, B channels (skips alpha at every 4th byte).
 *
 * @param differenceData - RGBA difference pixel data
 * @returns Mean difference value across all RGB pixels (0–255 scale)
 */
export function computeMeanDifference(differenceData: Uint8ClampedArray): number {
  if (differenceData.length === 0) return 0;

  let sum = 0;
  let count = 0;

  for (let i = 0; i < differenceData.length; i += 4) {
    sum += differenceData[i];       // R
    sum += differenceData[i + 1];   // G
    sum += differenceData[i + 2];   // B
    count += 3;
  }

  return count === 0 ? 0 : sum / count;
}

/**
 * Computes standard deviation of per-block mean differences.
 * Divides the image into blockSize×blockSize blocks and computes
 * the mean difference for each block, then returns the standard
 * deviation of those block means.
 *
 * @param differenceData - RGBA difference pixel data
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param blockSize - Block size in pixels (e.g. 16)
 * @returns Standard deviation of per-block mean differences
 */
export function computeBlockStdDev(
  differenceData: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number
): number {
  if (differenceData.length === 0 || width === 0 || height === 0 || blockSize === 0) {
    return 0;
  }

  const blocksX = Math.ceil(width / blockSize);
  const blocksY = Math.ceil(height / blockSize);
  const blockMeans: number[] = [];

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let blockSum = 0;
      let blockCount = 0;

      const startY = by * blockSize;
      const startX = bx * blockSize;
      const endY = Math.min(startY + blockSize, height);
      const endX = Math.min(startX + blockSize, width);

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const pixelIndex = (y * width + x) * 4;
          blockSum += differenceData[pixelIndex];       // R
          blockSum += differenceData[pixelIndex + 1];   // G
          blockSum += differenceData[pixelIndex + 2];   // B
          blockCount += 3;
        }
      }

      if (blockCount > 0) {
        blockMeans.push(blockSum / blockCount);
      }
    }
  }

  if (blockMeans.length === 0) return 0;

  // Compute standard deviation of block means
  const overallMean = blockMeans.reduce((a, b) => a + b, 0) / blockMeans.length;
  const variance =
    blockMeans.reduce((sum, val) => sum + (val - overallMean) ** 2, 0) / blockMeans.length;

  return Math.sqrt(variance);
}

/**
 * Performs Error Level Analysis on the provided ImageData.
 * Uses Canvas API for JPEG re-compression at quality 0.6.
 *
 * Returns null if Canvas 2D context is unavailable or any Canvas operation fails.
 *
 * NOTE: This function is async because loading the re-compressed JPEG data URL
 * back into an image element requires an asynchronous onload callback.
 *
 * @param imageData - The original image pixel data from canvas.getImageData()
 * @param amplificationFactor - Multiplier for difference values (default: 10)
 * @param blockSize - Pixel block size for variance calculation (default: 16)
 * @returns Promise resolving to ElaResult or null if Canvas operations fail
 */
export async function analyzeEla(
  imageData: ImageData,
  amplificationFactor: number = DEFAULT_AMPLIFICATION_FACTOR,
  blockSize: number = DEFAULT_BLOCK_SIZE
): Promise<ElaResult | null> {
  try {
    const { width, height } = imageData;

    // Step 1: Draw original ImageData onto a temporary canvas
    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = width;
    originalCanvas.height = height;
    const originalCtx = originalCanvas.getContext('2d');
    if (!originalCtx) return null;

    originalCtx.putImageData(imageData, 0, 0);

    // Step 2: Export canvas as JPEG quality 0.6
    const jpegDataUrl = originalCanvas.toDataURL('image/jpeg', 0.6);
    if (!jpegDataUrl || jpegDataUrl === 'data:,') return null;

    // Step 3: Load the JPEG data URL into an Image, draw onto another canvas, extract ImageData
    const recompressedImageData = await loadImageDataFromDataUrl(jpegDataUrl, width, height);
    if (!recompressedImageData) return null;

    // Step 4: Compute per-pixel differences
    const differenceData = computePixelDifference(
      imageData.data,
      recompressedImageData.data,
      amplificationFactor
    );

    // Step 5: Calculate mean difference
    const meanDifference = computeMeanDifference(differenceData);

    // Step 6: Calculate block standard deviation
    const blockStdDev = computeBlockStdDev(differenceData, width, height, blockSize);

    // Step 7: Calculate severity based on uniformity
    // Lower blockStdDev means more uniform error → higher severity (more AI-like)
    const severity = Math.max(0, 1.0 - blockStdDev / UNIFORMITY_THRESHOLD);

    return {
      meanDifference,
      blockStdDev,
      severity,
      differenceData,
      width,
      height,
    };
  } catch {
    // Graceful failure: return null if any Canvas operation fails
    return null;
  }
}

/**
 * Loads a data URL as an Image, draws it to a canvas, and extracts ImageData.
 * Returns null if loading fails.
 */
function loadImageDataFromDataUrl(
  dataUrl: string,
  width: number,
  height: number
): Promise<ImageData | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(ctx.getImageData(0, 0, width, height));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}
