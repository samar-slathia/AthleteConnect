import bcrypt from 'bcryptjs';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const BCRYPT_SALT_ROUNDS = 12;

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates password format against length and bcrypt byte limits.
 * Bcrypt truncates inputs silently at 72 bytes, so input validation must reject
 * any password that exceeds 72 UTF-8 bytes to prevent truncation vulnerabilities.
 */
export function validatePassword(password: unknown): PasswordValidationResult {
  if (typeof password !== 'string') {
    return {
      valid: false,
      error: 'Password must be a string.',
    };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
    };
  }

  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength > PASSWORD_MAX_BYTES) {
    return {
      valid: false,
      error: `Password exceeds the maximum length of ${PASSWORD_MAX_BYTES} bytes.`,
    };
  }

  return { valid: true };
}

/**
 * Hashes a plaintext password using bcryptjs with a secure work factor.
 * Throws an Error if the password fails validation.
 */
export async function hashPassword(password: string): Promise<string> {
  const validation = validatePassword(password);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid password.');
  }

  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash in constant time.
 * Returns false safely if inputs are malformed or invalid rather than throwing.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof hash !== 'string') {
    return false;
  }

  if (password.length === 0 || hash.length === 0) {
    return false;
  }

  // Reject passwords that exceed bcrypt's 72-byte limit immediately
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
