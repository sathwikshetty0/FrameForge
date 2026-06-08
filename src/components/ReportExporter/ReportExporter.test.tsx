import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReportExporter, ReportExporterProps } from './ReportExporter';
import { MetadataResult, ScoringResult } from '../../lib/types';

function makeMetadata(): MetadataResult {
  return {
    cameraMake: { value: 'Canon', status: 'present' },
    cameraModel: { value: 'EOS R5', status: 'present' },
    lensMake: { value: 'Canon', status: 'present' },
    lensModel: { value: 'RF 24-70mm', status: 'present' },
    focalLength: { value: 35, status: 'present' },
    dateTimeOriginal: { value: new Date('2024-01-15T10:30:00Z'), status: 'present' },
    modifyDate: { value: new Date('2024-01-15T10:30:00Z'), status: 'present' },
    gpsLatitude: { value: 51.507351, status: 'present' },
    gpsLongitude: { value: -0.127758, status: 'present' },
    gpsAltitude: { value: 15.5, status: 'present' },
    fNumber: { value: 2.8, status: 'present' },
    iso: { value: 400, status: 'present' },
    exposureTime: { value: 0.004, status: 'present' },
    software: { value: null, status: 'absent' },
    imageWidth: { value: 4000, status: 'present' },
    imageHeight: { value: 3000, status: 'present' },
    bitDepth: { value: 8, status: 'present' },
    colorProfile: { value: 'sRGB', status: 'present' },
  };
}

function makeResult(): ScoringResult {
  return {
    score: 85,
    verdict: 'GENUINE',
    signals: [],
    breakdown: [
      { signalType: 'SOFTWARE_FINGERPRINT', triggered: false, pointsDeducted: 0, maxDeduction: 30 },
      { signalType: 'MISSING_EXIF', triggered: false, pointsDeducted: 0, maxDeduction: 25 },
      { signalType: 'TIMESTAMP_INCONSISTENCY', triggered: false, pointsDeducted: 0, maxDeduction: 15 },
      { signalType: 'FILE_SIZE_ANOMALY', triggered: false, pointsDeducted: 0, maxDeduction: 15 },
      { signalType: 'COLOR_PROFILE_ABNORMALITY', triggered: false, pointsDeducted: 0, maxDeduction: 10 },
      { signalType: 'MISSING_GPS', triggered: false, pointsDeducted: 0, maxDeduction: 5 },
    ],
  };
}

function defaultProps(overrides?: Partial<ReportExporterProps>): ReportExporterProps {
  return {
    metadata: makeMetadata(),
    result: makeResult(),
    fileName: 'dashcam_001.jpg',
    analysisTimestamp: new Date('2024-06-01T12:00:00Z'),
    isComplete: true,
    ...overrides,
  };
}

describe('ReportExporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a visible "Copy to Clipboard" button when results are available', () => {
    render(<ReportExporter {...defaultProps()} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('disables the button when isComplete is false', () => {
    render(<ReportExporter {...defaultProps({ isComplete: false })} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });
    expect(button).toBeDisabled();
  });

  it('disables the button when metadata is null', () => {
    render(<ReportExporter {...defaultProps({ metadata: null })} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });
    expect(button).toBeDisabled();
  });

  it('disables the button when result is null', () => {
    render(<ReportExporter {...defaultProps({ result: null })} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });
    expect(button).toBeDisabled();
  });

  it('shows tooltip "Complete analysis required" when disabled', () => {
    render(<ReportExporter {...defaultProps({ isComplete: false })} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });
    expect(button).toHaveAttribute('title', 'Complete analysis required');
  });

  it('calls navigator.clipboard.writeText with formatted report on click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<ReportExporter {...defaultProps()} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const calledText = writeTextMock.mock.calls[0][0];
    expect(calledText).toContain('=== FRAMEFORGE VERIFY - FORENSIC REPORT ===');
    expect(calledText).toContain('dashcam_001.jpg');
    expect(calledText).toContain('Authenticity Score: 85/100');
    expect(calledText).toContain('Verdict: GENUINE');
  });

  it('shows success confirmation for 3 seconds then dismisses', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<ReportExporter {...defaultProps()} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Copied to clipboard!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('Copied to clipboard!')).not.toBeInTheDocument();
  });

  it('falls back to selectable textarea on clipboard API failure', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<ReportExporter {...defaultProps()} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const textarea = screen.getByRole('textbox', { name: /report text for manual copy/i });
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toContain('=== FRAMEFORGE VERIFY - FORENSIC REPORT ===');
  });

  it('textarea is read-only in fallback mode', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<ReportExporter {...defaultProps()} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const textarea = screen.getByRole('textbox', { name: /report text for manual copy/i });
    expect(textarea).toHaveAttribute('readonly');
  });

  it('dismiss button clears the fallback textarea', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<ReportExporter {...defaultProps()} />);
    const button = screen.getByRole('button', { name: /copy to clipboard/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const dismissButton = screen.getByRole('button', { name: /dismiss fallback/i });
    fireEvent.click(dismissButton);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
