import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { validateFile } from '../../utils/validation';
import type { UploadError } from '../../lib/types';

export interface UploadZoneProps {
  onFileAccepted: (file: File) => void;
  onError: (error: UploadError) => void;
  isProcessing: boolean;
}

/**
 * UploadZone component handles drag-and-drop and click-to-open file upload.
 * Validates format/size, verifies image decodability, displays thumbnail on success,
 * and shows error messages on failure.
 */
export function UploadZone({ onFileAccepted, onError, isProcessing }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (isProcessing) return;

      // Clear previous state
      setError(null);
      setThumbnail(null);

      // Validate format and size
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError.message);
        onError(validationError);
        return;
      }

      // Verify image decodability
      const blobUrl = URL.createObjectURL(file);
      try {
        await verifyImageDecode(blobUrl);
      } catch {
        URL.revokeObjectURL(blobUrl);
        const corruptError: UploadError = {
          type: 'CORRUPT_IMAGE',
          message: 'File could not be decoded as a valid image.',
        };
        setError(corruptError.message);
        onError(corruptError);
        return;
      }

      // File is valid — display thumbnail and notify parent
      setThumbnail(blobUrl);
      onFileAccepted(file);
    },
    [isProcessing, onFileAccepted, onError]
  );

  const verifyImageDecode = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = src;
    });
  };

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isProcessing) {
        setIsDragOver(true);
      }
    },
    [isProcessing]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isProcessing) {
        setIsDragOver(true);
      }
    },
    [isProcessing]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    },
    []
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (isProcessing) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [isProcessing, handleFile]
  );

  const handleClick = useCallback(() => {
    if (isProcessing) return;
    fileInputRef.current?.click();
  }, [isProcessing]);

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [handleFile]
  );

  return (
    <div
      data-testid="upload-zone"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      style={{
        ...styles.container,
        ...(isDragOver ? styles.dragOver : {}),
        ...(isProcessing ? styles.disabled : {}),
        cursor: isProcessing ? 'not-allowed' : 'pointer',
      }}
      role="button"
      tabIndex={isProcessing ? -1 : 0}
      aria-label="Upload image for forensic analysis"
      aria-disabled={isProcessing}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic,.heif,.webp"
        onChange={handleFileInputChange}
        style={styles.hiddenInput}
        data-testid="file-input"
        disabled={isProcessing}
      />

      {thumbnail && (
        <div style={styles.thumbnailContainer} data-testid="thumbnail-preview">
          <img src={thumbnail} alt="Uploaded image preview" style={styles.thumbnail} />
        </div>
      )}

      {!thumbnail && !error && (
        <div style={styles.content}>
          <div style={styles.icon}>⬆</div>
          <p style={styles.primaryText}>
            {isDragOver
              ? 'Drop image here'
              : 'Drag & drop an image or click to browse'}
          </p>
          <p style={styles.secondaryText}>
            Supported: JPG, PNG, HEIC, WebP · Max 50 MB
          </p>
        </div>
      )}

      {error && (
        <div style={styles.errorContainer} data-testid="upload-error">
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {isProcessing && (
        <div style={styles.processingOverlay} data-testid="processing-overlay">
          <p style={styles.processingText}>Processing...</p>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '240px',
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: '#3a3f4b',
    borderRadius: '8px',
    backgroundColor: '#1a1d24',
    padding: '24px',
    transition: 'border-color 0.2s ease, background-color 0.2s ease',
    userSelect: 'none',
  },
  dragOver: {
    borderColor: '#f59e0b',
    borderStyle: 'solid',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  disabled: {
    opacity: 0.6,
    pointerEvents: 'none' as const,
  },
  hiddenInput: {
    display: 'none',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  icon: {
    fontSize: '32px',
    marginBottom: '8px',
    opacity: 0.7,
  },
  primaryText: {
    color: '#e2e8f0',
    fontSize: '16px',
    fontWeight: 500,
    margin: 0,
  },
  secondaryText: {
    color: '#64748b',
    fontSize: '13px',
    margin: 0,
  },
  thumbnailContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxHeight: '200px',
    overflow: 'hidden',
  },
  thumbnail: {
    maxWidth: '100%',
    maxHeight: '200px',
    objectFit: 'contain' as const,
    borderRadius: '4px',
  },
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '14px',
    fontWeight: 500,
    margin: 0,
    textAlign: 'center' as const,
  },
  processingOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 17, 23, 0.8)',
    borderRadius: '8px',
  },
  processingText: {
    color: '#f59e0b',
    fontSize: '14px',
    fontWeight: 600,
    margin: 0,
  },
};

export default UploadZone;
