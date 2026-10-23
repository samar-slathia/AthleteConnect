import { Request, Response, NextFunction } from 'express';
import { safeVerifyToken } from '../utils/jwt';
import { User, UserRole } from '../models/User';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Authentication middleware that validates Bearer JWT tokens.
 * Verifies token signature, checks account existence, checks active status,
 * and attaches the current persisted role to prevent stale-token privilege retention.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Missing or malformed Bearer token.',
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Token is empty.',
    });
  }

  const verifyResult = safeVerifyToken(token);
  if (!verifyResult.valid) {
    return res.status(401).json({
      error: verifyResult.isExpired
        ? 'Token has expired. Please log in again.'
        : 'Invalid or malformed authentication token.',
    });
  }

  try {
    const user = await User.findById(verifyResult.payload.userId);
    if (!user) {
      return res.status(401).json({
        error: 'User account no longer exists.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        error: 'Account has been deactivated. Please contact support.',
      });
    }

    // Attach verified user with CURRENT database role to prevent stale token elevation
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      isActive: user.isActive,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Reusable Role-Based Access Control (RBAC) authorization middleware.
 * Returns HTTP 403 Forbidden if the authenticated user's role is not in allowedRoles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access forbidden. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }

    return next();
  };
}
