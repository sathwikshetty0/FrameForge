import { useRef, useEffect } from 'react';

export interface ElaHeatmapProps {
  /** ELA difference pixel data (RGBA Uint8ClampedArray) */
  differenceData: Uint8ClampedArray;
  /** Source image width */
  width: number;
  /** Source image height */
  height: number;
  /** Maximum display width in pixels (scales proportionally), default 600 */
  maxDisplayWidth?: number;
}

/**
 * Maps a difference magnitude (0–255) to an RGBA color on the heatmap gradient.
 *
 * Gradient: dark blue (0) → green (85) → yellow (170) → red-white (255)
 */
export function magnitudeToColor(magnitude: number): [number, number, number, number] {
  const t = magnitude / 255;

  if (t < 0.33) {
    // Dark blue → Green
    const local = t / 0.33;
    return [0, Math.round(local * 255), Math.round((1 - local) * 255), 255];
  } else if (t < 0.66) {
    // Green → Yellow
    const local = (t - 0.33) / 0.33;
    return [Math.round(local * 255), 255, 0, 255];
  } else {
    // Yellow → Red-white
    const local = (t - 0.66) / 0.34;
    return [255, Math.round((1 - local) * 255), Math.round(local * 255), 255];
  }
}

/**
 * ElaHeatmap renders the ELA difference data as a color-mapped Canvas element.
 * Per-pixel difference magnitudes are mapped through magnitudeToColor to produce
 * a visual heatmap where brighter/redder regions indicate higher error differences.
 */
export function ElaHeatmap({
  differenceData,
  width,
  height,
  maxDisplayWidth = 600,
}: ElaHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create heatmap ImageData
    const heatmapData = new ImageData(width, height);
    for (let i = 0; i < differenceData.length; i += 4) {
      const magnitude = Math.max(differenceData[i], differenceData[i + 1], differenceData[i + 2]);
      const [r, g, b, a] = magnitudeToColor(magnitude);
      heatmapData.data[i] = r;
      heatmapData.data[i + 1] = g;
      heatmapData.data[i + 2] = b;
      heatmapData.data[i + 3] = a;
    }

    ctx.putImageData(heatmapData, 0, 0);
  }, [differenceData, width, height]);

  const scale = Math.min(1, maxDisplayWidth / width);
  const displayWidth = Math.round(width * scale);
  const displayHeight = Math.round(height * scale);

  return (
    <div className="ela-heatmap-container">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: displayWidth, height: displayHeight }}
        aria-label="ELA heatmap visualization"
      />
      <div className="ela-heatmap-legend">
        <span className="legend-label">Low error</span>
        <div className="legend-gradient" />
        <span className="legend-label">High error</span>
      </div>
    </div>
  );
}

export default ElaHeatmap;
