import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadZone } from './UploadZone';

describe('UploadZone', () => {
  const mockOnFileAccepted = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderUploadZone(isProcessing = false) {
    return render(
      <UploadZone
        onFileAccepted={mockOnFileAccepted}
        onError={mockOnError}
        isProcessing={isProcessing}
      />
    );
  }

  function createFile(name: string, size: number, type: string): File {
    const content = new Uint8Array(size);
    return new File([content], name, { type });
  }

  function mockImageDecode(shouldSucceed: boolean) {
    const originalImage = window.Image;
    const MockImageClass = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      set src(value: string) {
        this._src = value;
        if (shouldSucceed) {
          setTimeout(() => this.onload?.(), 0);
        } else {
          setTimeout(() => this.onerror?.(), 0);
        }
      }
      get src() {
        return this._src;
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Image = MockImageClass;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).Image = originalImage;
    };
  }

  it('renders the upload zone with instructional text', () => {
    renderUploadZone();
    expect(screen.getByText(/drag & drop an image or click to browse/i)).toBeInTheDocument();
    expect(screen.getByText(/supported: jpg, png, heic, webp/i)).toBeInTheDocument();
  });

  it('shows highlighted border and text on drag over', () => {
    renderUploadZone();
    const zone = screen.getByTestId('upload-zone');

    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });

    expect(screen.getByText(/drop image here/i)).toBeInTheDocument();
  });

  it('removes highlight on drag leave', () => {
    renderUploadZone();
    const zone = screen.getByTestId('upload-zone');

    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    fireEvent.dragLeave(zone);

    expect(screen.getByText(/drag & drop an image or click to browse/i)).toBeInTheDocument();
  });

  it('opens file picker on click', () => {
    renderUploadZone();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const zone = screen.getByTestId('upload-zone');
    fireEvent.click(zone);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('has accept attribute set to supported formats', () => {
    renderUploadZone();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    expect(input.accept).toBe('.jpg,.jpeg,.png,.heic,.heif,.webp');
  });

  it('shows error for unsupported format', async () => {
    renderUploadZone();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = createFile('test.bmp', 1024, 'image/bmp');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument();
      expect(screen.getByText(/unsupported format/i)).toBeInTheDocument();
    });
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UNSUPPORTED_FORMAT' })
    );
  });

  it('shows error for file too large', async () => {
    renderUploadZone();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    // 51 MB file
    const file = createFile('large.jpg', 51 * 1024 * 1024, 'image/jpeg');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument();
      expect(screen.getByText(/50 mb/i)).toBeInTheDocument();
    });
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FILE_TOO_LARGE' })
    );
  });

  it('shows error for corrupt image (decode failure)', async () => {
    const restore = mockImageDecode(false);

    const mockCreateObjectURL = vi.fn(() => 'blob:test-url');
    const mockRevokeObjectURL = vi.fn();
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;

    renderUploadZone();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = createFile('corrupt.jpg', 1024, 'image/jpeg');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument();
      expect(screen.getByText(/could not be decoded/i)).toBeInTheDocument();
    });
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CORRUPT_IMAGE' })
    );

    restore();
  });

  it('displays thumbnail on valid file acceptance', async () => {
    const restore = mockImageDecode(true);

    const mockCreateObjectURL = vi.fn(() => 'blob:valid-image-url');
    URL.createObjectURL = mockCreateObjectURL;

    renderUploadZone();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = createFile('photo.jpg', 1024, 'image/jpeg');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('thumbnail-preview')).toBeInTheDocument();
    });
    expect(mockOnFileAccepted).toHaveBeenCalledWith(file);

    restore();
  });

  it('disables interaction when isProcessing is true', () => {
    renderUploadZone(true);
    const zone = screen.getByTestId('upload-zone');
    const input = screen.getByTestId('file-input') as HTMLInputElement;

    expect(zone).toHaveAttribute('aria-disabled', 'true');
    expect(input).toBeDisabled();
    expect(screen.getByTestId('processing-overlay')).toBeInTheDocument();
  });

  it('does not trigger file picker click when processing', () => {
    renderUploadZone(true);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const zone = screen.getByTestId('upload-zone');
    fireEvent.click(zone);

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('does not accept dropped files when processing', () => {
    renderUploadZone(true);
    const zone = screen.getByTestId('upload-zone');
    const file = createFile('photo.jpg', 1024, 'image/jpeg');

    fireEvent.drop(zone, {
      dataTransfer: { files: [file] },
    });

    expect(mockOnFileAccepted).not.toHaveBeenCalled();
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it('handles file drop with valid file', async () => {
    const restore = mockImageDecode(true);

    const mockCreateObjectURL = vi.fn(() => 'blob:drop-image-url');
    URL.createObjectURL = mockCreateObjectURL;

    renderUploadZone();
    const zone = screen.getByTestId('upload-zone');
    const file = createFile('photo.png', 2048, 'image/png');

    fireEvent.drop(zone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('thumbnail-preview')).toBeInTheDocument();
    });
    expect(mockOnFileAccepted).toHaveBeenCalledWith(file);

    restore();
  });
});
