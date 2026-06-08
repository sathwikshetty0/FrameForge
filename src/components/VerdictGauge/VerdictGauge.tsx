import { Verdict } from '../../lib/types';

export interface VerdictGaugeProps {
  score: number; // 0-100
  verdict: Verdict; // 'GENUINE' | 'SUSPICIOUS' | 'LIKELY SYNTHETIC'
}

const VERDICT_COLORS: Record<Verdict, string> = {
  GENUINE: '#22c55e',
  SUSPICIOUS: '#f59e0b',
  'LIKELY SYNTHETIC': '#ef4444',
};

const BACKGROUND_COLORS: Record<Verdict, string> = {
  GENUINE: '#1a3a2a',
  SUSPICIOUS: '#3a2e1a',
  'LIKELY SYNTHETIC': '#3a1a1a',
};

/**
 * VerdictGauge renders a circular SVG arc gauge displaying the authenticity score
 * and verdict label. The arc fill and color reflect the score and verdict.
 */
export function VerdictGauge({ score, verdict }: VerdictGaugeProps) {
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const fillPercentage = clampedScore / 100;
  const dashOffset = circumference * (1 - fillPercentage);

  const color = VERDICT_COLORS[verdict];
  const bgColor = BACKGROUND_COLORS[verdict];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Authenticity score: ${clampedScore} out of 100. Verdict: ${verdict}`}
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        {/* Filled arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {/* Score number (large, centered) */}
        <text
          x={size / 2}
          y={size / 2 - 8}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize="36"
          fontWeight="bold"
          fontFamily="'JetBrains Mono', 'IBM Plex Mono', monospace"
        >
          {clampedScore}
        </text>
        {/* Verdict label (smaller, below score) */}
        <text
          x={size / 2}
          y={size / 2 + 24}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize="12"
          fontWeight="500"
          fontFamily="'JetBrains Mono', 'IBM Plex Mono', monospace"
        >
          {verdict}
        </text>
      </svg>
    </div>
  );
}
