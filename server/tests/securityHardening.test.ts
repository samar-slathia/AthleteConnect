import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { hashPassword } from '../src/utils/password';
import { signToken } from '../src/utils/jwt';
import {
  customerLoginLimiter,
  adminLoginLimiter,
  createLoginRateLimiter,
} from '../src/middleware/rateLimiter';

describe('Production Security Hardening (Phase 6.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Helmet HTTP Security Headers', () => {
    it('sets standard security headers on API responses', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-download-options']).toBe('noopen');
      expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");

      // X-Powered-By must be stripped by Helmet
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('disables HSTS in non-production environments to preserve local development and testing', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('configures Strict-Transport-Security header when production mode is simulated', async () => {
      const prodApp = express();
      prodApp.use(
        helmet({
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'none'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              frameAncestors: ["'none'"],
            },
          },
          crossOriginResourcePolicy: { policy: 'cross-origin' },
          hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
          },
        })
      );
      prodApp.get('/test-hsts', (_req, res) => res.json({ ok: true }));

      const res = await request(prodApp).get('/test-hsts');
      expect(res.status).toBe(200);
      expect(res.headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains'
      );
    });
  });

  describe('Rate Limiter Factory & Header Behavior', () => {
    it('returns HTTP 429 and Retry-After header when rate threshold is exceeded', async () => {
      const testApp = express();
      testApp.use(express.json());

      const isolatedLimiter = createLoginRateLimiter({
        windowMs: 60 * 1000,
        limit: 3,
        message: {
          error: 'Rate limit exceeded for test.',
        },
      });

      testApp.post('/test-limit', isolatedLimiter, (_req, res) => {
        res.status(200).json({ ok: true });
      });

      // Requests 1, 2, 3 should succeed
      for (let i = 0; i < 3; i++) {
        const res = await request(testApp).post('/test-limit').send({});
        expect(res.status).toBe(200);
      }

      // Request 4 should be throttled
      const res4 = await request(testApp).post('/test-limit').send({});
      expect(res4.status).toBe(429);
      expect(res4.body.error).toBe('Rate limit exceeded for test.');

      // Verify standard Retry-After and RateLimit headers
      expect(res4.headers['retry-after']).toBeDefined();
      expect(parseInt(res4.headers['retry-after'], 10)).toBeGreaterThan(0);
      expect(
        res4.headers['ratelimit'] ||
        res4.headers['ratelimit-policy'] ||
        res4.headers['ratelimit-remaining']
      ).toBeDefined();
    });

    it('isolates customer login and administrator login tracking', async () => {
      const testApp = express();
      testApp.use(express.json());

      const customCustomerLimiter = createLoginRateLimiter({
        windowMs: 60 * 1000,
        limit: 2,
        message: { error: 'Customer limit hit.' },
      });

      const customAdminLimiter = createLoginRateLimiter({
        windowMs: 60 * 1000,
        limit: 2,
        message: { error: 'Admin limit hit.' },
      });

      testApp.post('/customer-login', customCustomerLimiter, (_req, res) => {
        res.status(200).json({ role: 'customer' });
      });

      testApp.post('/admin-login', customAdminLimiter, (_req, res) => {
        res.status(200).json({ role: 'admin' });
      });

      // Exceed customer limiter
      await request(testApp).post('/customer-login').send({});
      await request(testApp).post('/customer-login').send({});
      const custBlocked = await request(testApp).post('/customer-login').send({});
      expect(custBlocked.status).toBe(429);
      expect(custBlocked.body.error).toBe('Customer limit hit.');

      // Admin endpoint must remain available (isolated limiter instance)
      const adminRes1 = await request(testApp).post('/admin-login').send({});
      expect(adminRes1.status).toBe(200);
      expect(adminRes1.body.role).toBe('admin');
    });

    it('does not rate-limit ordinary authenticated API requests', async () => {
      // General API endpoints like /api/health have no login rate limiting
      for (let i = 0; i < 20; i++) {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
      }
    });
  });

  describe('Integration with Live Application Routes', () => {
    it('allows normal customer login when within threshold', async () => {
      const password = 'ValidCustomerPass123!';
      const passwordHash = await hashPassword(password);
      const mockCustomer = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Jane Customer',
        email: 'jane.unique@athleteconnect.test',
        passwordHash,
        role: 'parent',
        isActive: true,
      });

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockCustomer),
      } as any);

      const res = await request(app).post('/api/auth/login').send({
        email: 'jane.unique@athleteconnect.test',
        password,
      });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.token).toBeDefined();
    });

    it('allows normal administrator login when within threshold', async () => {
      const password = 'ValidAdminPassword123!';
      const passwordHash = await hashPassword(password);
      const mockAdmin = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Master Admin',
        email: 'admin.unique@athleteconnect.test',
        passwordHash,
        role: 'admin',
        isActive: true,
      });

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin),
      } as any);

      const res = await request(app).post('/api/admin/login').send({
        email: 'admin.unique@athleteconnect.test',
        password,
      });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.token).toBeDefined();
    });
  });
});
