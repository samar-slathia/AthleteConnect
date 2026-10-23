import { Request, Response, NextFunction } from 'express';
import { User, CUSTOMER_ROLES, CustomerRole } from '../models/User';
import { validatePassword, hashPassword, comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_REGISTER_FIELDS = new Set(['name', 'email', 'password', 'role']);

/**
 * Public User Registration
 * POST /api/auth/register
 * Accepts ONLY customer-facing roles: parent, individual, coach.
 * Rejects admin roles, unexpected parameters, and privileged fields.
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request body. JSON payload expected.',
      });
    }

    // 1. Strict field whitelist: Reject unexpected, privileged, or injected fields
    const receivedKeys = Object.keys(req.body);
    const unexpectedFields = receivedKeys.filter((key) => !ALLOWED_REGISTER_FIELDS.has(key));
    if (unexpectedFields.length > 0) {
      return res.status(400).json({
        error: `Unexpected field(s) in request body: ${unexpectedFields.join(', ')}. Only name, email, password, and role are permitted for public registration.`,
      });
    }

    const { name, email, password, role } = req.body;

    // 2. Validate presence and types
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof role !== 'string'
    ) {
      return res.status(400).json({
        error: 'Missing or invalid fields. name, email, password, and role must be non-empty strings.',
      });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        error: 'Name must be between 2 and 100 characters in length.',
      });
    }

    // 3. Strict Customer Role check (admin is rejected)
    if (!CUSTOMER_ROLES.includes(role as CustomerRole)) {
      return res.status(400).json({
        error: `Invalid role "${role}". Public registration only permits customer roles: ${CUSTOMER_ROLES.join(', ')}.`,
      });
    }

    // 4. Email format check and normalization
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        error: 'Please provide a valid email address.',
      });
    }

    // 5. Password validation (minimum 8 characters, maximum 72 bytes)
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: passwordValidation.error || 'Invalid password.',
      });
    }

    // 6. Application-level collision pre-check
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email address already exists.',
      });
    }

    // 7. Hash password and persist user
    const passwordHash = await hashPassword(password);
    const user = new User({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role,
    });

    await user.save();

    // 8. Sign JWT and respond with sanitized user
    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    return res.status(201).json({
      user: user.toJSON(),
      token,
    });
  } catch (error: any) {
    // Safely handle concurrent race duplicate-key collisions from MongoDB (code 11000)
    if (
      error?.code === 11000 ||
      (error?.name === 'MongoServerError' && error?.code === 11000) ||
      String(error?.message).includes('E11000')
    ) {
      return res.status(409).json({
        error: 'An account with this email address already exists.',
      });
    }
    return next(error);
  }
}

/**
 * User Login
 * POST /api/auth/login
 * Validates credentials, checks account status, returns sanitized user and JWT token.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request body. JSON payload expected.',
      });
    }

    const { email, password } = req.body;

    if (
      !email ||
      !password ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        error: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Lookup user with passwordHash included for verification
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user) {
      // Constant generic message to prevent account enumeration
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    // Check account status
    if (!user.isActive) {
      return res.status(403).json({
        error: 'Account has been deactivated. Please contact support.',
      });
    }

    // Constant-time password comparison
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    // Sign JWT and return sanitized user
    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    return res.status(200).json({
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Current Authenticated User Profile
 * GET /api/auth/me
 * Requires valid Bearer token.
 */
export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        error: 'User profile not found.',
      });
    }

    return res.status(200).json({
      user: user.toJSON(),
    });
  } catch (error) {
    return next(error);
  }
}
