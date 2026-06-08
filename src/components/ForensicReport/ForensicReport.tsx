import { useState } from 'react';
import {
  PipelineState,
  MetadataResult,
  ScoringResult,
  DetectionSignal,
  ScoringBreakdownEntry,
  MetadataField,
} from '../../lib/types';
import { ScanningAnimation } from '../ScanningAnimation/ScanningAnimation';
import { VerdictGauge } from '../VerdictGauge/VerdictGauge';
import './ForensicReport.css';

export interface ForensicReportProps {
  state: PipelineState;
  metadata: MetadataResult | null;
  result: ScoringResult | null;
  thumbnail: string | null;
}

/** Human-readable labels for metadata field keys */
const FIELD_LABELS: Record<keyof MetadataResult, string> = {
  cameraMake: 'Camera Make',
  cameraModel: 'Camera Model',
  lensMake: 'Lens Make',
  lensModel: 'Lens Model',
  focalLength: 'Focal Length',
  dateTimeOriginal: 'Date/Time Original',
  modifyDate: 'Modify Date',
  gpsLatitude: 'GPS Latitude',
  gpsLongitude: 'GPS Longitude',
  gpsAltitude: 'GPS Altitude',
  fNumber: 'F-Number',
  iso: 'ISO',
  exposureTime: 'Exposure Time',
  software: 'Software',
  imageWidth: 'Image Width',
  imageHeight: 'Image Height',
  bitDepth: 'Bit Depth',
  colorProfile: 'Color Profile',
};

/** Unit suffixes for numeric metadata fields */
const FIELD_UNITS: Partial<Record<keyof MetadataResult, string>> = {
  focalLength: 'mm',
  gpsLatitude: '°',
  gpsLongitude: '°',
  gpsAltitude: 'm',
  imageWidth: 'px',
  imageHeight: 'px',
  bitDepth: 'bits',
  exposureTime: 's',
};

/** Human-readable signal type labels */
const SIGNAL_TYPE_LABELS: Record<string, string> = {
  SOFTWARE_FINGERPRINT: 'Software Fingerprint',
  MISSING_EXIF: 'Missing EXIF',
  TIMESTAMP_INCONSISTENCY: 'Timestamp Inconsistency',
  FILE_SIZE_ANOMALY: 'File Size Anomaly',
  COLOR_PROFILE_ABNORMALITY: 'Color Profile Abnormality',
  MISSING_GPS: 'Missing GPS',
};

/**
 * Determines the color class for a metadata field based on its status
 * and whether it is a trigger field for any detection signal.
 */
export function getFieldColor(
  fieldKey: string,
  field: MetadataField<unknown>,
  signals: DetectionSignal[]
): 'green' | 'amber' | 'red' {
  if (field.status === 'absent' || field.status === 'corrupt') {
    return 'red';
  }
  const isTrigger = signals.some((s) => s.triggerField === fieldKey);
  if (isTrigger) {
    return 'amber';
  }
  return 'green';
}

/**
 * Formats a metadata field value for display.
 */
function formatFieldValue(
  key: keyof MetadataResult,
  field: MetadataField<unknown>
): string {
  if (field.status === 'absent') return 'MISSING';
  if (field.status === 'corrupt') return 'CORRUPT';
  if (field.value === null) return 'MISSING';

  const unit = FIELD_UNITS[key] || '';

  if (field.value instanceof Date) {
    return field.value.toISOString();
  }
  if (typeof field.value === 'number') {
    return `${field.value}${unit ? ' ' + unit : ''}`;
  }
  return String(field.value);
}

/** Collapsible section component */
function CollapsibleSection({
  title,
  defaultExpanded = true,
  children,
}: {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="forensic-section" data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <button
        className="forensic-section-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span>{title}</span>
        <span
          className={`forensic-section-chevron${expanded ? '' : ' forensic-section-chevron--collapsed'}`}
        >
          ▼
        </span>
      </button>
      {expanded && (
        <div className="forensic-section-content">{children}</div>
      )}
    </div>
  );
}

/** Renders all 18 metadata fields with color coding and staggered animation */
function MetadataFields({
  metadata,
  signals,
}: {
  metadata: MetadataResult;
  signals: DetectionSignal[];
}) {
  const fieldKeys = Object.keys(FIELD_LABELS) as (keyof MetadataResult)[];

  return (
    <div className="metadata-fields" data-testid="metadata-fields">
      {fieldKeys.map((key, index) => {
        const field = metadata[key] as MetadataField<unknown>;
        const color = getFieldColor(key, field, signals);
        // Stagger delay: 80-120ms range, using 100ms as middle ground
        const delay = index * 100;

        return (
          <div
            key={key}
            className={`metadata-field metadata-field--${color}`}
            style={{ animationDelay: `${delay}ms` }}
            data-testid={`field-${key}`}
            data-color={color}
          >
            <span className="metadata-field-name">{FIELD_LABELS[key]}</span>
            <span className="metadata-field-value">
              {formatFieldValue(key, field)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Renders the list of triggered detection signals */
function DetectionSignals({ signals }: { signals: DetectionSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="no-signals" data-testid="no-signals">
        No detection signals triggered — all clear.
      </div>
    );
  }

  return (
    <div className="detection-signals" data-testid="detection-signals">
      {signals.map((signal, index) => {
        const delay = index * 100;
        return (
          <div
            key={`${signal.type}-${signal.triggerField}-${index}`}
            className="detection-signal"
            style={{ animationDelay: `${delay}ms` }}
            data-testid={`signal-${signal.type}`}
          >
            <div className="detection-signal-header">
              <span className="detection-signal-type">
                {SIGNAL_TYPE_LABELS[signal.type] || signal.type}
              </span>
              <span className="detection-signal-severity">
                severity: {(signal.severity * 100).toFixed(0)}%
              </span>
            </div>
            <div className="detection-signal-description">
              {signal.description}
            </div>
            <div className="detection-signal-trigger">
              Trigger: {signal.triggerField}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Renders the scoring breakdown table */
function ScoringBreakdown({
  breakdown,
}: {
  breakdown: ScoringBreakdownEntry[];
}) {
  return (
    <div className="scoring-breakdown" data-testid="scoring-breakdown">
      {breakdown.map((entry, index) => {
        const delay = index * 100;
        return (
          <div
            key={entry.signalType}
            className="scoring-entry"
            style={{ animationDelay: `${delay}ms` }}
            data-testid={`breakdown-${entry.signalType}`}
          >
            <span className="scoring-entry-type">
              {SIGNAL_TYPE_LABELS[entry.signalType] || entry.signalType}
            </span>
            <span
              className={`scoring-entry-deduction ${
                entry.triggered
                  ? 'scoring-entry-deduction--triggered'
                  : 'scoring-entry-deduction--clear'
              }`}
            >
              {entry.triggered
                ? `-${entry.pointsDeducted} (max -${entry.maxDeduction})`
                : `0 (max -${entry.maxDeduction})`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * ForensicReport renders the full forensic analysis output with three
 * collapsible sections: Raw Metadata, AI Detection Signals, and Verdict.
 *
 * - IDLE/LOADING: shows a placeholder
 * - SCANNING: shows ScanningAnimation
 * - COMPLETE: shows staggered field-by-field reveal with color coding
 */
export function ForensicReport({
  state,
  metadata,
  result,
  thumbnail,
}: ForensicReportProps) {
  if (state === 'SCANNING') {
    return (
      <div className="forensic-report" data-testid="forensic-report">
        <ScanningAnimation
          thumbnail={thumbnail}
          isScanning={true}
        />
      </div>
    );
  }

  if (state === 'COMPLETE' && metadata && result) {
    return (
      <div className="forensic-report" data-testid="forensic-report">
        <CollapsibleSection title="Raw Metadata">
          <MetadataFields metadata={metadata} signals={result.signals} />
        </CollapsibleSection>

        <CollapsibleSection title="AI Detection Signals">
          <DetectionSignals signals={result.signals} />
        </CollapsibleSection>

        <CollapsibleSection title="Verdict">
          <div className="verdict-section">
            <VerdictGauge score={result.score} verdict={result.verdict} />
            <ScoringBreakdown breakdown={result.breakdown} />
          </div>
        </CollapsibleSection>
      </div>
    );
  }

  // IDLE, LOADING, or ERROR without data
  return (
    <div className="forensic-report forensic-report-placeholder" data-testid="forensic-report">
      <span>Awaiting image for analysis...</span>
    </div>
  );
}

export default ForensicReport;
