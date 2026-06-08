import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Mock the exif-parser module
vi.mock('./lib/exif-parser', () => ({
  loadExifr: vi.fn().mockResolvedValue({}),
  parseExif: vi.fn().mockResolvedValue({
    cameraMake: { value: 'Canon', status: 'present' },
    cameraModel: { value: 'EOS R5', status: 'present' },
    lensMake: { value: null, status: 'absent' },
    lensModel: { value: null, status: 'absent' },
    focalLength: { value: null, status: 'absent' },
    dateTimeOriginal: { value: new Date('2024-01-01'), status: 'present' },
    modifyDate: { value: new Date('2024-01-01'), status: 'present' },
    gpsLatitude: { value: null, status: 'absent' },
    gpsLongitude: { value: null, status: 'absent' },
    gpsAltitude: { value: null, status: 'absent' },
    fNumber: { value: 2.8, status: 'present' },
    iso: { value: 400, status: 'present' },
    exposureTime: { value: 0.001, status: 'present' },
    software: { value: null, status: 'absent' },
    imageWidth: { value: 1920, status: 'present' },
    imageHeight: { value: 1080, status: 'present' },
    bitDepth: { value: 8, status: 'present' },
    colorProfile: { value: 'sRGB', status: 'present' },
  }),
}));

vi.mock('./lib/detection-engine', () => ({
  analyze: vi.fn().mockReturnValue([]),
}));

vi.mock('./lib/scoring', () => ({
  computeScore: vi.fn().mockReturnValue({
    score: 95,
    verdict: 'GENUINE',
    signals: [],
    breakdown: [],
  }),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders in IDLE state initially', () => {
    render(<App />);
    expect(screen.getByText('FrameForge Verify')).toBeDefined();
  });

  it('transitions to ERROR state when CDN library load fails', async () => {
    const { loadExifr } = await import('./lib/exif-parser');
    vi.mocked(loadExifr).mockRejectedValueOnce(new Error('CDN failure'));

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText('EXIF parsing library could not be loaded. Analysis unavailable.')
      ).toBeDefined();
    });
  });

  it('does not show error when library loads successfully', async () => {
    render(<App />);

    // Give time for the effect to run
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
