import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanningAnimation } from './ScanningAnimation';

describe('ScanningAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "SCANNING..." label when isScanning is true', () => {
    render(
      <ScanningAnimation thumbnail={null} isScanning={true} />
    );
    expect(screen.getByTestId('scanning-label')).toHaveTextContent('SCANNING...');
  });

  it('displays scan-line overlay on thumbnail when scanning', () => {
    render(
      <ScanningAnimation
        thumbnail="data:image/png;base64,fakedata"
        isScanning={true}
      />
    );
    expect(screen.getByTestId('scan-line')).toBeInTheDocument();
    expect(screen.getByAltText('Uploaded image')).toBeInTheDocument();
  });

  it('renders nothing when not scanning and no error', () => {
    const { container } = render(
      <ScanningAnimation thumbnail={null} isScanning={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows error message and stops animation on error state', () => {
    render(
      <ScanningAnimation
        thumbnail="data:image/png;base64,fakedata"
        isScanning={false}
        error="Metadata extraction failed."
      />
    );
    expect(screen.getByTestId('scanning-error')).toHaveTextContent(
      'Metadata extraction failed.'
    );
    expect(screen.queryByTestId('scan-line')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scanning-label')).not.toBeInTheDocument();
  });

  it('enforces minimum 500ms display time before transition', () => {
    const { rerender } = render(
      <ScanningAnimation thumbnail={null} isScanning={true} />
    );

    // Scanning started, label should be visible
    expect(screen.getByTestId('scanning-label')).toBeInTheDocument();

    // Simulate processing completing very quickly (after 100ms)
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender(
      <ScanningAnimation thumbnail={null} isScanning={false} />
    );

    // Animation should still be visible due to minimum display time
    expect(screen.getByTestId('scanning-label')).toBeInTheDocument();

    // Advance past the remaining 400ms
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Now animation should be gone
    expect(screen.queryByTestId('scanning-label')).not.toBeInTheDocument();
  });

  it('hides immediately when min display time already elapsed', () => {
    const { rerender } = render(
      <ScanningAnimation thumbnail={null} isScanning={true} />
    );

    // Advance past minimum display time
    act(() => {
      vi.advanceTimersByTime(600);
    });

    rerender(
      <ScanningAnimation thumbnail={null} isScanning={false} />
    );

    // Should hide immediately since 600ms > 500ms minimum
    expect(screen.queryByTestId('scanning-label')).not.toBeInTheDocument();
  });

  it('shows thumbnail with scan-line when thumbnail is provided', () => {
    render(
      <ScanningAnimation
        thumbnail="data:image/jpeg;base64,testimage"
        isScanning={true}
      />
    );

    const img = screen.getByAltText('Uploaded image');
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,testimage');
    expect(screen.getByTestId('scan-line')).toBeInTheDocument();
  });

  it('shows scanning label without thumbnail when thumbnail is null', () => {
    render(
      <ScanningAnimation thumbnail={null} isScanning={true} />
    );

    expect(screen.getByTestId('scanning-label')).toBeInTheDocument();
    expect(screen.queryByAltText('Uploaded image')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scan-line')).not.toBeInTheDocument();
  });

  it('displays error with thumbnail visible but no scan-line', () => {
    render(
      <ScanningAnimation
        thumbnail="data:image/png;base64,img"
        isScanning={false}
        error="Analysis error. Please try again."
      />
    );

    expect(screen.getByAltText('Uploaded image')).toBeInTheDocument();
    expect(screen.getByTestId('scanning-error')).toHaveTextContent(
      'Analysis error. Please try again.'
    );
    expect(screen.queryByTestId('scan-line')).not.toBeInTheDocument();
  });
});
