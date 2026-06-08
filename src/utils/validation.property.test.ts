// Feature: frameforge-verify, Property 19: Format validation
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateFile } from './validation';
import {
  SUPPORTED_MIME_TYPES,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
} from '../lib/types';

/**
 * Validates: Requirements 1.1, 1.5
 *
 * Property 19: Format validation
 * For any file metadata (MIME type and extension pair), the upload validation
 * function SHALL accept the file if and only if the MIME type is one of
 * (image/jpeg, image/png, image/heic, image/webp) AND the extension is one of
 * (.jpg, .jpeg, .png, .heic, .heif, .webp).
 */

// Helper to create a mock File object
function createMockFile(name: string, type: string, size: number): File {
  const blob = new Blob(['x'.repeat(Math.min(size, 100))], { type });
  return new File([blob], name, { type });
}

// Arbitrary for valid MIME types
const validMimeTypeArb = fc.constantFrom(...SUPPORTED_MIME_TYPES);

// Arbitrary for invalid MIME types
const invalidMimeTypeArb = fc.oneof(
  fc.constant('application/pdf'),
  fc.constant('image/gif'),
  fc.constant('image/bmp'),
  fc.constant('image/tiff'),
  fc.constant('video/mp4'),
  fc.constant('text/plain'),
  fc.constant(''),
  fc.stringOf(fc.char(), { minLength: 1, maxLength: 30 }).filter(
    (s) => !(SUPPORTED_MIME_TYPES as readonly string[]).includes(s)
  )
);

// Arbitrary for valid extensions
const validExtensionArb = fc.constantFrom(...SUPPORTED_EXTENSIONS);

// Arbitrary for invalid extensions
const invalidExtensionArb = fc.oneof(
  fc.constant('.gif'),
  fc.constant('.bmp'),
  fc.constant('.tiff'),
  fc.constant('.pdf'),
  fc.constant('.svg'),
  fc.constant('.mp4'),
  fc.constant('.txt'),
  fc.constant(''),
  fc.stringOf(fc.char(), { minLength: 1, maxLength: 10 })
    .map((s) => '.' + s.replace(/\./g, ''))
    .filter((s) => !(SUPPORTED_EXTENSIONS as readonly string[]).includes(s.toLowerCase()))
);

// Valid file size (under 50MB)
const validFileSizeArb = fc.integer({ min: 1, max: MAX_FILE_SIZE_BYTES });

describe('Property 19: Format validation', () => {
  it('accepts files with valid MIME type AND valid extension', () => {
    fc.assert(
      fc.property(
        validMimeTypeArb,
        validExtensionArb,
        validFileSizeArb,
        (mimeType, extension, size) => {
          const fileName = `photo${extension}`;
          const file = createMockFile(fileName, mimeType, size);
          const result = validateFile(file);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects files with invalid MIME type (regardless of extension)', () => {
    fc.assert(
      fc.property(
        invalidMimeTypeArb,
        validExtensionArb,
        validFileSizeArb,
        (mimeType, extension, size) => {
          const fileName = `photo${extension}`;
          const file = createMockFile(fileName, mimeType, size);
          const result = validateFile(file);
          expect(result).not.toBeNull();
          expect(result!.type).toBe('UNSUPPORTED_FORMAT');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects files with invalid extension (regardless of MIME type)', () => {
    fc.assert(
      fc.property(
        validMimeTypeArb,
        invalidExtensionArb,
        validFileSizeArb,
        (mimeType, extension, size) => {
          const fileName = `photo${extension}`;
          const file = createMockFile(fileName, mimeType, size);
          const result = validateFile(file);
          expect(result).not.toBeNull();
          expect(result!.type).toBe('UNSUPPORTED_FORMAT');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects files with both invalid MIME type and invalid extension', () => {
    fc.assert(
      fc.property(
        invalidMimeTypeArb,
        invalidExtensionArb,
        validFileSizeArb,
        (mimeType, extension, size) => {
          const fileName = `photo${extension}`;
          const file = createMockFile(fileName, mimeType, size);
          const result = validateFile(file);
          expect(result).not.toBeNull();
          expect(result!.type).toBe('UNSUPPORTED_FORMAT');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns FILE_TOO_LARGE error when size exceeds limit but format is valid', () => {
    const invalidFileSizeArb = fc.integer({ min: MAX_FILE_SIZE_BYTES + 1, max: MAX_FILE_SIZE_BYTES * 3 });

    fc.assert(
      fc.property(
        validMimeTypeArb,
        validExtensionArb,
        invalidFileSizeArb,
        (mimeType, extension, size) => {
          const fileName = `photo${extension}`;
          const file = createMockFile(fileName, mimeType, size);
          // Override size since Blob won't actually be that large
          Object.defineProperty(file, 'size', { value: size });
          const result = validateFile(file);
          expect(result).not.toBeNull();
          expect(result!.type).toBe('FILE_TOO_LARGE');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('bidirectional: returns null iff MIME is supported AND extension is supported AND size <= MAX', () => {
    // Generate arbitrary MIME + extension + size (mix of valid and invalid)
    const anyMimeArb = fc.oneof(validMimeTypeArb, invalidMimeTypeArb);
    const anyExtensionArb = fc.oneof(validExtensionArb, invalidExtensionArb);
    const anyFileSizeArb = fc.oneof(
      validFileSizeArb,
      fc.integer({ min: MAX_FILE_SIZE_BYTES + 1, max: MAX_FILE_SIZE_BYTES * 3 })
    );

    fc.assert(
      fc.property(
        anyMimeArb,
        anyExtensionArb,
        anyFileSizeArb,
        (mimeType, extension, size) => {
          const fileName = `photo${extension}`;
          const file = createMockFile(fileName, mimeType, size);
          Object.defineProperty(file, 'size', { value: size });
          const result = validateFile(file);

          const mimeValid = (SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
          const extValid = (SUPPORTED_EXTENSIONS as readonly string[]).includes(
            extension.toLowerCase()
          );
          const sizeValid = size <= MAX_FILE_SIZE_BYTES;

          if (mimeValid && extValid && sizeValid) {
            expect(result).toBeNull();
          } else if (!mimeValid || !extValid) {
            expect(result).not.toBeNull();
            expect(result!.type).toBe('UNSUPPORTED_FORMAT');
          } else {
            // format valid but size exceeds limit
            expect(result).not.toBeNull();
            expect(result!.type).toBe('FILE_TOO_LARGE');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
