import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Custom error handler for rate limit violations to ensure standard JSON error structure.
 */
function rateLimitHandler(
  _req: Request,
  res: Response,
  _next: unknown,
  options: Options
): void {
  const errorMessage =
    typeof options.message === 'string'
      ? options.message
      : (options.message as { error?: string })?.error ||
        'Too many requests from this IP address. Please try again later.';

  res.status(options.statusCode).json({
    error: errorMessage,
  });
}

/**
 * Factory for creating scoped login rate limiters.
 *
 * Architecture & Storage:
 * Uses express-rate-limit with the default in-memory MemoryStore.
 * - This provides per-process/per-instance protection against brute-force and credential-stuffing attacks.
 * - Note on Multi-Instance Deployments: If the backend is horizontally scaled across multiple stateless
 *   server instances behind a round-robin load balancer, a distributed shared store (e.g., Redis via
 *   rate-limit-redis) should be configured so limits are synchronized across all nodes.
 */
export function createLoginRateLimiter(customOptions: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15-minute window
    limit: 10, // Default limit per window
    standardHeaders: 'draft-7', // Return RateLimit-* headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
    legacyHeaders: false, // Disable X-RateLimit-* legacy headers
    statusCode: 429,
    handler: rateLimitHandler,
    // By default, only count attempts against the login endpoint
    skipSuccessfulRequests: false,
    ...customOptions,
  });
}

/**
 * Customer & Coach Login Rate Limiter
 * Applied to: POST /api/auth/login
 * Standard limit: 15 attempts per 15 minutes per IP address.
 */
export const customerLoginLimiter = createLoginRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  message: {
    error: 'Too many login attempts from this IP address. Please try again after 15 minutes.',
  },
});

/**
 * Administrative Portal Login Rate Limiter
 * Applied to: POST /api/admin/login
 * Standard limit: 10 attempts per 15 minutes per IP address.
 * Kept completely isolated from customer login tracking.
 */
export const adminLoginLimiter = createLoginRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: {
    error: 'Too many administrator login attempts from this IP address. Access temporarily throttled. Please try again after 15 minutes.',
  },
});
