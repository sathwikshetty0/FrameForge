import { useState, useCallback } from 'react';
import { formatReport } from '../../lib/report-formatter';
import { MetadataResult, ScoringResult } from '../../lib/types';

export interface ReportExporterProps {
  metadata: MetadataResult | null;
  result: ScoringResult | null;
  fileName: string | null;
  analysisTimestamp: Date | null;
  isComplete: boolean;
}

/**
 * ReportExporter provides a "Copy to Clipboard" button that formats the
 * forensic analysis results as plain text and copies to the system clipboard.
 * Falls back to a selectable textarea if the Clipboard API is unavailable.
 */
export function ReportExporter({
  metadata,
  result,
  fileName,
  analysisTimestamp,
  isComplete,
}: ReportExporterProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'fallback'>('idle');
  const [fallbackText, setFallbackText] = useState<string>('');

  const hasResults = isComplete && metadata !== null && result !== null;
  const isDisabled = !hasResults;

  const handleCopy = useCallback(async () => {
    if (!metadata || !result || !fileName || !analysisTimestamp) return;

    const text = formatReport(metadata, result, fileName, analysisTimestamp);

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('success');
      setTimeout(() => {
        setCopyStatus('idle');
      }, 3000);
    } catch {
      setFallbackText(text);
      setCopyStatus('fallback');
    }
  }, [metadata, result, fileName, analysisTimestamp]);

  const handleDismissFallback = useCallback(() => {
    setCopyStatus('idle');
    setFallbackText('');
  }, []);

  if (!hasResults) {
    return (
      <div className="report-exporter">
        <button
          className="copy-button copy-button--disabled"
          disabled
          title="Complete analysis required"
          aria-label="Copy to Clipboard (disabled: complete analysis required)"
        >
          Copy to Clipboard
        </button>
      </div>
    );
  }

  return (
    <div className="report-exporter">
      <button
        className="copy-button"
        onClick={handleCopy}
        disabled={isDisabled}
        aria-label="Copy to Clipboard"
      >
        Copy to Clipboard
      </button>

      {copyStatus === 'success' && (
        <span className="copy-confirmation" role="status" aria-live="polite">
          Copied to clipboard!
        </span>
      )}

      {copyStatus === 'fallback' && (
        <div className="copy-fallback">
          <p className="copy-fallback__message">
            Clipboard access unavailable. Select and copy the text below:
          </p>
          <textarea
            className="copy-fallback__textarea"
            readOnly
            value={fallbackText}
            rows={20}
            aria-label="Report text for manual copy"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            className="copy-fallback__dismiss"
            onClick={handleDismissFallback}
            aria-label="Dismiss fallback"
          >
            Dismiss
          </button>
        </div>
      )}

      <style>{`
        .report-exporter {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          align-items: flex-start;
        }

        .copy-button {
          background-color: #f59e0b;
          color: #0f1117;
          border: none;
          padding: 0.5rem 1.25rem;
          font-weight: 600;
          font-size: 0.875rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .copy-button:hover:not(:disabled) {
          background-color: #d97706;
        }

        .copy-button:disabled,
        .copy-button--disabled {
          background-color: #374151;
          color: #6b7280;
          cursor: not-allowed;
          opacity: 0.6;
        }

        .copy-confirmation {
          color: #22c55e;
          font-size: 0.875rem;
          font-weight: 500;
          animation: fadeIn 0.2s ease-in;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .copy-fallback {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .copy-fallback__message {
          color: #f59e0b;
          font-size: 0.875rem;
          margin: 0;
        }

        .copy-fallback__textarea {
          width: 100%;
          background-color: #1a1d27;
          color: #e5e7eb;
          border: 1px solid #374151;
          border-radius: 4px;
          padding: 0.75rem;
          font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
          font-size: 0.75rem;
          resize: vertical;
          line-height: 1.5;
        }

        .copy-fallback__textarea:focus {
          outline: 1px solid #f59e0b;
          border-color: #f59e0b;
        }

        .copy-fallback__dismiss {
          align-self: flex-end;
          background-color: transparent;
          color: #9ca3af;
          border: 1px solid #374151;
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
          border-radius: 4px;
          cursor: pointer;
        }

        .copy-fallback__dismiss:hover {
          color: #e5e7eb;
          border-color: #6b7280;
        }
      `}</style>
    </div>
  );
}
