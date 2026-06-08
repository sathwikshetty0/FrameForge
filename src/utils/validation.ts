import {
  SUPPORTED_MIME_TYPES,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  type UploadError,
} from '../lib/types';

/**
 * Validates a file for upload eligibility.
 * Checks MIME type, file extension, and file size in that order.
 *
 * @param file - The File object to validate
 * @returns An UploadError if validation fails, or null if the file is valid
 */
export function validateFile(file: File): UploadError | null {
  // 1. Extract extension from file.name (lowercase, with dot prefix)
  const lastDotIndex = file.name.lastIndexOf('.');
  const extension = lastDotIndex !== -1
    ? file.name.slice(lastDotIndex).toLowerCase()
    : '';

  // 2. Check if file.type is in SUPPORTED_MIME_TYPES
  if (!SUPPORTED_MIME_TYPES.includes(file.type as typeof SUPPORTED_MIME_TYPES[number])) {
    return {
      type: 'UNSUPPORTED_FORMAT',
      message: 'Unsupported format. Please upload JPG, PNG, HEIC, or WebP.',
    };
  }

  // 3. Check if extension is in SUPPORTED_EXTENSIONS
  if (!SUPPORTED_EXTENSIONS.includes(extension as typeof SUPPORTED_EXTENSIONS[number])) {
    return {
      type: 'UNSUPPORTED_FORMAT',
      message: 'Unsupported format. Please upload JPG, PNG, HEIC, or WebP.',
    };
  }

  // 4. Check if file.size <= MAX_FILE_SIZE_BYTES
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      type: 'FILE_TOO_LARGE',
      message: 'File exceeds 50 MB limit.',
    };
  }

  // 5. All checks pass
  return null;
}
