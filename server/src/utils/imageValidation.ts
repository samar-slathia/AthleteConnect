/**
 * Image Magic Bytes Validation Utility
 * Validates actual binary signatures for JPEG, PNG, and WebP images.
 */

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export interface MagicBytesValidationResult {
  valid: boolean;
  detectedMime?: AllowedImageMimeType;
  error?: string;
}

/**
 * Validates that a buffer starts with genuine JPEG, PNG, or WebP magic bytes.
 */
export function validateImageMagicBytes(buffer: Buffer): MagicBytesValidationResult {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return {
      valid: false,
      error: 'File is empty or corrupted (insufficient byte length).',
    };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      valid: true,
      detectedMime: 'image/jpeg',
    };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      valid: true,
      detectedMime: 'image/png',
    };
  }

  // WebP: RIFF (bytes 0-3: 0x52, 0x49, 0x46, 0x46) + WEBP (bytes 8-11: 0x57, 0x45, 0x42, 0x50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return {
      valid: true,
      detectedMime: 'image/webp',
    };
  }

  return {
    valid: false,
    error: 'Unsupported or spoofed image signature. Only genuine JPEG, PNG, and WebP images are permitted.',
  };
}
