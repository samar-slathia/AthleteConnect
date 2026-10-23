import jwt, { Algorithm } from 'jsonwebtoken';
import { config } from '../config/env';

export type UserRole = 'parent' | 'individual' | 'coach' | 'admin';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export const JWT_ALGORITHM: Algorithm = 'HS256';

export interface SignTokenOptions {
  secret?: string;
  expiresIn?: string | number;
}

export interface VerifyTokenOptions {
  secret?: string;
}

export type SafeVerifyResult =
  | { valid: true; payload: AuthTokenPayload }
  | { valid: false; error: string; isExpired: boolean };

/**
 * Signs an authentication payload into a compact JWT token.
 * Explicitly locks algorithm to HS256 to eliminate algorithm-confusion attacks.
 */
export function signToken(payload: AuthTokenPayload, options?: SignTokenOptions): string {
  const secret = options?.secret || config.JWT_SECRET;
  const expiresIn = options?.expiresIn || config.JWT_EXPIRES_IN;

  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    },
    secret,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    }
  );
}

/**
 * Verifies a JWT token signature and decodes the claims.
 * Enforces algorithm allowlist ['HS256'].
 * Throws on invalid or expired token.
 */
export function verifyToken(token: string, options?: VerifyTokenOptions): AuthTokenPayload {
  const secret = options?.secret || config.JWT_SECRET;

  const decoded = jwt.verify(token, secret, {
    algorithms: [JWT_ALGORITHM],
  }) as jwt.JwtPayload;

  if (
    typeof decoded !== 'object' ||
    !decoded.userId ||
    !decoded.email ||
    !decoded.role
  ) {
    throw new Error('Invalid token claims structure.');
  }

  return {
    userId: String(decoded.userId),
    email: String(decoded.email),
    role: decoded.role as UserRole,
    iat: decoded.iat,
    exp: decoded.exp,
  };
}

/**
 * Safely verifies a JWT token and returns a typed result without throwing.
 */
export function safeVerifyToken(token: string, options?: VerifyTokenOptions): SafeVerifyResult {
  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      error: 'Token must be a non-empty string.',
      isExpired: false,
    };
  }

  try {
    const payload = verifyToken(token, options);
    return { valid: true, payload };
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      return {
        valid: false,
        error: 'Token has expired.',
        isExpired: true,
      };
    }

    if (err instanceof jwt.JsonWebTokenError) {
      return {
        valid: false,
        error: `Invalid token: ${err.message}`,
        isExpired: false,
      };
    }

    const message = err instanceof Error ? err.message : 'Token verification failed.';
    return {
      valid: false,
      error: message,
      isExpired: false,
    };
  }
}
