import { describe, it, expect } from 'vitest';
import { validateFile } from './validation';
import { MAX_FILE_SIZE_BYTES } from '../lib/types';

function createMockFile(name: string, size: number, type: string): File {
  // Create a minimal blob and override size via Object.defineProperty
  const content = new Uint8Array(0);
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'size', { value: size, writable: false });
  return file;
}

describe('validateFile', () => {
  describe('valid files', () => {
    it('accepts a valid JPEG file', () => {
      const file = createMockFile('photo.jpg', 1024, 'image/jpeg');
      expect(validateFile(file)).toBeNull();
    });

    it('accepts a valid JPEG with .jpeg extension', () => {
      const file = createMockFile('photo.jpeg', 1024, 'image/jpeg');
      expect(validateFile(file)).toBeNull();
    });

    it('accepts a valid PNG file', () => {
      const file = createMockFile('image.png', 2048, 'image/png');
      expect(validateFile(file)).toBeNull();
    });

    it('accepts a valid HEIC file', () => {
      const file = createMockFile('image.heic', 5000, 'image/heic');
      expect(validateFile(file)).toBeNull();
    });

    it('accepts a valid HEIF file', () => {
      const file = createMockFile('image.heif', 5000, 'image/heic');
      expect(validateFile(file)).toBeNull();
    });

    it('accepts a valid WebP file', () => {
      const file = createMockFile('image.webp', 3000, 'image/webp');
      expect(validateFile(file)).toBeNull();
    });

    it('accepts a file exactly at 50 MB', () => {
      const file = createMockFile('large.jpg', MAX_FILE_SIZE_BYTES, 'image/jpeg');
      expect(validateFile(file)).toBeNull();
    });
  });

  describe('MIME type validation', () => {
    it('rejects a file with unsupported MIME type', () => {
      const file = createMockFile('document.pdf', 1024, 'application/pdf');
      const error = validateFile(file);
      expect(error).not.toBeNull();
      expect(error!.type).toBe('UNSUPPORTED_FORMAT');
      expect(error!.message).toBe('Unsupported format. Please upload JPG, PNG, HEIC, or WebP.');
    });

    it('rejects a GIF file', () => {
      const file = createMockFile('animation.gif', 1024, 'image/gif');
      const error = validateFile(file);
      expect(error).not.toBeNull();
      expect(error!.type).toBe('UNSUPPORTED_FORMAT');
    });

    it('rejects a TIFF file', () => {
      const file = createMockFile('scan.tiff', 1024, 'image/tiff');
      const error = validateFile(file);
      expect(error).not.toBeNull();
      expect(error!.type).toBe('UNSUPPORTED_FORMAT');
    });

    it('rejects a file with empty MIME type', () => {
      const file = createMockFile('photo.jpg', 1024, '');
      const error = validateFile(file);
      expect(error).not.toBeNull();
      expect(error!.type).toBe('UNSUPPORTED_FORMAT');
    });
  });

  describe('extension validation', () => {
    it('rejects a file with valid MIME but unsupported extension', () => {
      const file = createMockFile('image.bmp', 1024, 'image/jpeg');
      const error = validateFile(file);
      expect(error).not.toBeNull();
      expect(error!.type).toBe('UNSUPPORTED_FORMAT');
    });

    it('rejects a file with no extension', () => {
      const file = createMockFile('noextension', 1024, 'image/jpeg');
      const error = validateFile(file);
      expect(error).not.toBeNull();
      expect(error!.type).toBe('UNSUPPORTED_FORMAT');
    });

    it('handles case-insensitive extensions', () => {
      const file = createMockFile('photo.JPG', 1024, 'image/jpeg');
      expect(validateFile(file)).toBeNull();
    });

    it('handles mixed case extensions', () => {
      const file = createMockFile('photo.Png', 2048, 'image/png');
      expect(validateFile(file)).toBeNull();
    });
  });

  describe('file size validation', () => {
    it('rejects a file exceeding 50 MB', () => {
      const file = createMockFile('huge.jpg', MAX_FILE_SIZE_BYTES + 1, 'image/jpeg');
      const error = validateFile(file);
      expect(error).not.toBeNull();
      expect(error!.type).toBe('FILE_TOO_LARGE');
      expect(error!.message).toBe('File exceeds 50 MB limit.');
    });
  });

  describe('validation order', () => {
    it('checks MIME type before extension', () => {
      // Bad MIME type AND bad extension — should report format error from MIME check
      const file = createMockFile('doc.pdf', 1024, 'application/pdf');
      const error = validateFile(file);
      expect(error!.type).toBe('UNSUPPORTED_FORMAT');
    });

    it('checks extension before file size', () => {
      // Valid MIME, bad extension, oversized — should report format error from extension check
      const file = createMockFile('image.bmp', MAX_FILE_SIZE_BYTES + 1, 'image/jpeg');
      const error = validateFile(file);
      expect(error!.type).toBe('UNSUPPORTED_FORMAT');
    });

    it('checks file size last', () => {
      // Valid MIME, valid extension, oversized — should report size error
      const file = createMockFile('photo.jpg', MAX_FILE_SIZE_BYTES + 1, 'image/jpeg');
      const error = validateFile(file);
      expect(error!.type).toBe('FILE_TOO_LARGE');
    });
  });
});
