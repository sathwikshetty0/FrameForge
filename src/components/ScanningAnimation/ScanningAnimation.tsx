import { useEffect, useRef, useState } from 'react';
import './ScanningAnimation.css';

export interface ScanningAnimationProps {
  thumbnail: string | null;
  isScanning: boolean;
  error?: string | null;
}

/**
 * Minimum display time in ms before the scanning animation can transition
 * to the COMPLETE state. Ensures the animation is perceivable even when
 * processing completes quickly.
 */
const MIN_DISPLAY_TIME_MS = 500;

/**
 * ScanningAnimation renders a forensic scan-line animation over an image
 * thumbnail during the SCANNING pipeline state.
 *
 * - Displays "SCANNING..." with a pulsing opacity animation
 * - Animates a horizontal amber scan-line sweeping top-to-bottom (1 sweep / 1.5s)
 * - Enforces a minimum 500ms display time before allowing transition
 * - Stops animations and shows error text on error state
 */
export function ScanningAnimation({
  thumbnail,
  isScanning,
  error,
}: ScanningAnimationProps) {
  const [showAnimation, setShowAnimation] = useState(false);
  const scanStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isScanning && !error) {
      scanStartRef.current = Date.now();
      setShowAnimation(true);
    }
  }, [isScanning, error]);

  useEffect(() => {
    if (!isScanning && showAnimation) {
      // Enforce minimum display time before hiding
      const elapsed = scanStartRef.current
        ? Date.now() - scanStartRef.current
        : MIN_DISPLAY_TIME_MS;
      const remaining = Math.max(0, MIN_DISPLAY_TIME_MS - elapsed);

      if (remaining > 0) {
        const timer = setTimeout(() => {
          setShowAnimation(false);
        }, remaining);
        return () => clearTimeout(timer);
      } else {
        setShowAnimation(false);
      }
    }
  }, [isScanning, showAnimation]);

  // Error state: stop animations and display error
  if (error) {
    return (
      <div className="scanning-container" data-testid="scanning-animation">
        {thumbnail && (
          <div className="scanning-thumbnail-wrapper">
            <img src={thumbnail} alt="Uploaded image" />
          </div>
        )}
        <div className="scanning-error" data-testid="scanning-error">
          {error}
        </div>
      </div>
    );
  }

  // Not scanning and animation has completed its minimum display time
  if (!showAnimation && !isScanning) {
    return null;
  }

  return (
    <div className="scanning-container" data-testid="scanning-animation">
      {thumbnail && (
        <div className="scanning-thumbnail-wrapper">
          <img src={thumbnail} alt="Uploaded image" />
          <div className="scan-line" data-testid="scan-line" />
        </div>
      )}
      <span className="scanning-label" data-testid="scanning-label">
        SCANNING...
      </span>
    </div>
  );
}

export default ScanningAnimation;
