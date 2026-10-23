import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signToken,
  verifyToken,
  safeVerifyToken,
  AuthTokenPayload,
  JWT_ALGORITHM,
} from '../src/utils/jwt';

describe('JWT Utilities', () => {
  const testSecret = 'athleteconnect_secure_unit_test_jwt_secret_32_chars';
  const testPayload: AuthTokenPayload = {
    userId: '60d5ecb8b5c0c22d88c99999',
    email: 'athlete@example.com',
    role: 'parent',
  };

  describe('signToken and verifyToken', () => {
    it('signs and verifies a valid token successfully', () => {
      const token = signToken(testPayload, { secret: testSecret });
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const decoded = verifyToken(token, { secret: testSecret });
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
      expect(typeof decoded.iat).toBe('number');
      expect(typeof decoded.exp).toBe('number');
    });

    it('signs tokens using explicit HS256 algorithm in header', () => {
      const token = signToken(testPayload, { secret: testSecret });
      const decodedHeader = jwt.decode(token, { complete: true });

      expect(decodedHeader?.header.alg).toBe(JWT_ALGORITHM);
      expect(decodedHeader?.header.alg).toBe('HS256');
    });

    it('rejects a token signed with an invalid or different secret', () => {
      const token = signToken(testPayload, { secret: testSecret });
      const wrongSecret = 'another_very_secret_key_with_at_least_32_characters';

      expect(() => verifyToken(token, { secret: wrongSecret })).toThrow(/invalid signature/);
    });

    it('rejects tampered token payloads', () => {
      const token = signToken(testPayload, { secret: testSecret });
      const parts = token.split('.');

      // Alter the payload part (middle segment)
      const tamperedPayload = Buffer.from(
        JSON.stringify({ ...testPayload, role: 'admin' })
      ).toString('base64url');

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      expect(() => verifyToken(tamperedToken, { secret: testSecret })).toThrow();
    });

    it('rejects expired tokens', () => {
      // Create a token expired in the past (-10 seconds)
      const expiredToken = jwt.sign(
        { userId: testPayload.userId, email: testPayload.email, role: testPayload.role },
        testSecret,
        { algorithm: 'HS256', expiresIn: -10 }
      );

      expect(() => verifyToken(expiredToken, { secret: testSecret })).toThrow(
        jwt.TokenExpiredError
      );
    });
  });

  describe('safeVerifyToken', () => {
    it('returns { valid: true, payload } for valid tokens', () => {
      const token = signToken(testPayload, { secret: testSecret });
      const result = safeVerifyToken(token, { secret: testSecret });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.userId).toBe(testPayload.userId);
        expect(result.payload.role).toBe('parent');
      }
    });

    it('returns { valid: false, isExpired: true } for expired tokens without throwing', () => {
      const expiredToken = jwt.sign(
        { userId: testPayload.userId, email: testPayload.email, role: testPayload.role },
        testSecret,
        { algorithm: 'HS256', expiresIn: -5 }
      );

      const result = safeVerifyToken(expiredToken, { secret: testSecret });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.isExpired).toBe(true);
        expect(result.error).toContain('expired');
      }
    });

    it('returns { valid: false, isExpired: false } for tampered or invalid tokens without throwing', () => {
      const result = safeVerifyToken('invalid.token.string', { secret: testSecret });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.isExpired).toBe(false);
        expect(result.error).toContain('Invalid token');
      }
    });

    it('handles empty or non-string inputs safely', () => {
      const result = safeVerifyToken('' as any);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.isExpired).toBe(false);
      }
    });
  });
});
