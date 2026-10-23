import { describe, it, expect } from 'vitest';
import {
  validatePassword,
  hashPassword,
  comparePassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_BYTES,
} from '../src/utils/password';

describe('Password Utilities', () => {
  describe('validatePassword', () => {
    it('rejects non-string inputs', () => {
      expect(validatePassword(null).valid).toBe(false);
      expect(validatePassword(undefined).valid).toBe(false);
      expect(validatePassword(12345678).valid).toBe(false);
      expect(validatePassword({}).valid).toBe(false);
    });

    it('rejects passwords shorter than 8 characters', () => {
      const short = 'abc123';
      const result = validatePassword(short);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(`at least ${PASSWORD_MIN_LENGTH} characters`);
    });

    it('accepts passwords with exactly 8 characters', () => {
      const valid = 'Pass1234';
      const result = validatePassword(valid);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts passwords up to 72 bytes', () => {
      const valid72 = 'a'.repeat(72);
      const result = validatePassword(valid72);
      expect(result.valid).toBe(true);
    });

    it('rejects passwords exceeding bcrypt 72-byte limit', () => {
      const tooLongAscii = 'a'.repeat(73);
      const result = validatePassword(tooLongAscii);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(`exceeds the maximum length of ${PASSWORD_MAX_BYTES} bytes`);
    });

    it('correctly calculates multi-byte UTF-8 characters against 72-byte limit', () => {
      // Each emoji or multi-byte character takes 3-4 bytes
      // 20 characters of 4-byte emoji = 80 bytes (> 72 bytes)
      const multiByteExceeding = '🥋'.repeat(20);
      expect(Buffer.byteLength(multiByteExceeding, 'utf8')).toBe(80);

      const result = validatePassword(multiByteExceeding);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(`exceeds the maximum length of ${PASSWORD_MAX_BYTES} bytes`);
    });
  });

  describe('hashPassword', () => {
    it('generates a valid bcrypt hash for a valid password', async () => {
      const plain = 'StrongPass123!';
      const hash = await hashPassword(plain);

      expect(typeof hash).toBe('string');
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
      expect(hash).not.toBe(plain);
    });

    it('generates unique salts (different hashes) for the same password', async () => {
      const plain = 'SamePassword123!';
      const hash1 = await hashPassword(plain);
      const hash2 = await hashPassword(plain);

      expect(hash1).not.toBe(hash2);
    });

    it('throws when attempting to hash an invalid password', async () => {
      await expect(hashPassword('short')).rejects.toThrow(/at least 8 characters/);
      await expect(hashPassword('a'.repeat(73))).rejects.toThrow(/exceeds the maximum length/);
    });
  });

  describe('comparePassword', () => {
    it('returns true for matching password and hash', async () => {
      const plain = 'CorrectHorseBatteryStaple123';
      const hash = await hashPassword(plain);

      const isMatch = await comparePassword(plain, hash);
      expect(isMatch).toBe(true);
    });

    it('returns false for mismatched password', async () => {
      const plain = 'CorrectHorseBatteryStaple123';
      const hash = await hashPassword(plain);

      const isMatch = await comparePassword('WrongPassword123', hash);
      expect(isMatch).toBe(false);
    });

    it('returns false safely for invalid or empty inputs', async () => {
      expect(await comparePassword('', '')).toBe(false);
      expect(await comparePassword('password123', '')).toBe(false);
      expect(await comparePassword('', '$2a$12$...')).toBe(false);
      expect(await comparePassword('password123', 'invalid-hash')).toBe(false);
      expect(await comparePassword('a'.repeat(73), '$2a$12$...')).toBe(false);
    });
  });
});
