import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User, CUSTOMER_ROLES } from '../src/models/User';
import { hashPassword } from '../src/utils/password';
import { signToken } from '../src/utils/jwt';
import { authenticate, requireRole } from '../src/middleware/auth';

describe('Authentication & Authorization API (Isolated Tests)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('successfully registers each allowed customer role (parent, individual, coach)', async () => {
      for (const role of CUSTOMER_ROLES) {
        vi.spyOn(User, 'findOne').mockResolvedValue(null);
        vi.spyOn(User.prototype, 'save').mockImplementation(async function (this: any) {
          this._id = new mongoose.Types.ObjectId();
          return this;
        });

        const payload = {
          name: `Test ${role}`,
          email: `${role}.new@example.com`,
          password: 'Password123!',
          role,
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(payload);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('token');
        expect(response.body.user.role).toBe(role);
        expect(response.body.user.email).toBe(payload.email.toLowerCase());
        expect(response.body.user.passwordHash).toBeUndefined();
        expect(typeof response.body.token).toBe('string');
      }
    });

    it('rejects attempts to register with privileged admin role', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Hacker Admin',
          email: 'admin.attempt@example.com',
          password: 'Password123!',
          role: 'admin',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Public registration only permits customer roles');
    });

    it('rejects unexpected and privileged fields in registration payload', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'Password123!',
          role: 'individual',
          isAdmin: true,
          isActive: false,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Unexpected field(s) in request body: isAdmin, isActive');
    });

    it('rejects passwords shorter than 8 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'short',
          role: 'individual',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('at least 8 characters long');
    });

    it('rejects passwords exceeding bcrypt 72-byte ceiling', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'a'.repeat(73),
          role: 'individual',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('exceeds the maximum length of 72 bytes');
    });

    it('rejects invalid or missing name boundaries', async () => {
      const responseTooShort = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'A',
          email: 'jane@example.com',
          password: 'Password123!',
          role: 'individual',
        });

      expect(responseTooShort.status).toBe(400);
      expect(responseTooShort.body.error).toContain('Name must be between 2 and 100 characters');

      const responseMissing = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'jane@example.com',
          password: 'Password123!',
          role: 'individual',
        });

      expect(responseMissing.status).toBe(400);
    });

    it('rejects malformed email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'invalid-email-string',
          password: 'Password123!',
          role: 'individual',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('valid email address');
    });

    it('returns 409 Conflict when email already exists during application pre-check', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(
        new User({
          name: 'Existing User',
          email: 'existing@example.com',
          passwordHash: 'hash',
          role: 'parent',
        })
      );

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Duplicate Attempt',
          email: 'existing@example.com',
          password: 'Password123!',
          role: 'parent',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('An account with this email address already exists.');
    });

    it('returns 409 Conflict safely when MongoDB throws an E11000 duplicate key race error', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      vi.spyOn(User.prototype, 'save').mockImplementation(async () => {
        const mongoError = new Error('E11000 duplicate key error collection: test.users index: email_1');
        (mongoError as any).code = 11000;
        throw mongoError;
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Race Duplicate',
          email: 'race@example.com',
          password: 'Password123!',
          role: 'parent',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('An account with this email address already exists.');
    });
  });

  describe('POST /api/auth/login', () => {
    it('authenticates valid credentials and returns user and token', async () => {
      const plainPassword = 'CorrectPassword123!';
      const hash = await hashPassword(plainPassword);

      const mockUser = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Login User',
        email: 'login.user@example.com',
        passwordHash: hash,
        role: 'coach',
        isActive: true,
      });

      // Chain select('+passwordHash')
      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'LOGIN.USER@EXAMPLE.COM',
          password: plainPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe('login.user@example.com');
      expect(response.body.user.role).toBe('coach');
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('returns 401 for wrong password with generic error message', async () => {
      const hash = await hashPassword('ActualPassword123!');
      const mockUser = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Login User',
        email: 'user@example.com',
        passwordHash: hash,
        role: 'individual',
        isActive: true,
      });

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid email or password.');
    });

    it('returns 401 when email is not found', async () => {
      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      } as any);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'notfound@example.com',
          password: 'AnyPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid email or password.');
    });

    it('refuses authentication for inactive / deactivated accounts (403)', async () => {
      const hash = await hashPassword('CorrectPassword123!');
      const mockUser = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Banned User',
        email: 'banned@example.com',
        passwordHash: hash,
        role: 'individual',
        isActive: false,
      });

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'banned@example.com',
          password: 'CorrectPassword123!',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('deactivated');
    });

    it('returns 400 when email or password is missing', async () => {
      const res1 = await request(app).post('/api/auth/login').send({ email: 'user@example.com' });
      expect(res1.status).toBe(400);

      const res2 = await request(app).post('/api/auth/login').send({ password: 'pass' });
      expect(res2.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns sanitized profile for authenticated user with valid token', async () => {
      const userId = new mongoose.Types.ObjectId();
      const mockUser = new User({
        _id: userId,
        name: 'Active Trainee',
        email: 'trainee@example.com',
        passwordHash: 'secret-hash',
        role: 'individual',
        isActive: true,
      });

      vi.spyOn(User, 'findById').mockResolvedValue(mockUser);

      const token = signToken({
        userId: userId.toString(),
        email: 'trainee@example.com',
        role: 'individual',
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.name).toBe('Active Trainee');
      expect(response.body.user.email).toBe('trainee@example.com');
      expect(response.body.user.role).toBe('individual');
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('rejects requests without Authorization header (401)', async () => {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Authentication required');
    });

    it('rejects requests with malformed Authorization header (401)', async () => {
      const response1 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Basic 123456');
      expect(response1.status).toBe(401);

      const response2 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ');
      expect(response2.status).toBe(401);
    });

    it('rejects requests with tampered token (401)', async () => {
      const token = signToken({
        userId: '60d5ecb8b5c0c22d88c99999',
        email: 'tampered@example.com',
        role: 'parent',
      });

      const tampered = token.slice(0, -6) + 'xxxxxx';

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tampered}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid or malformed authentication token');
    });

    it('rejects requests with expired token (401)', async () => {
      const expiredToken = signToken(
        {
          userId: '60d5ecb8b5c0c22d88c99999',
          email: 'expired@example.com',
          role: 'parent',
        },
        { expiresIn: -10 }
      );

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Token has expired');
    });

    it('rejects requests when user record no longer exists in database (401)', async () => {
      const userId = new mongoose.Types.ObjectId();
      vi.spyOn(User, 'findById').mockResolvedValue(null);

      const token = signToken({
        userId: userId.toString(),
        email: 'deleted@example.com',
        role: 'parent',
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('no longer exists');
    });

    it('rejects requests when user record is marked inactive (403)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const mockInactiveUser = new User({
        _id: userId,
        name: 'Deactivated User',
        email: 'deactivated@example.com',
        passwordHash: 'hash',
        role: 'parent',
        isActive: false,
      });

      vi.spyOn(User, 'findById').mockResolvedValue(mockInactiveUser);

      const token = signToken({
        userId: userId.toString(),
        email: 'deactivated@example.com',
        role: 'parent',
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('deactivated');
    });
  });

  describe('Authorization Middleware: requireRole', () => {
    const testApp = express();
    testApp.use(express.json());

    // Protected route restricted strictly to coach
    testApp.get('/test-coach-only', authenticate, requireRole('coach'), (_req: Request, res: Response) => {
      res.status(200).json({ success: true, message: 'Welcome Coach' });
    });

    it('allows access to users with the permitted role', async () => {
      const userId = new mongoose.Types.ObjectId();
      const mockCoach = new User({
        _id: userId,
        name: 'Coach Sensei',
        email: 'sensei@example.com',
        passwordHash: 'hash',
        role: 'coach',
        isActive: true,
      });

      vi.spyOn(User, 'findById').mockResolvedValue(mockCoach);

      const token = signToken({
        userId: userId.toString(),
        email: 'sensei@example.com',
        role: 'coach',
      });

      const response = await request(testApp)
        .get('/test-coach-only')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Welcome Coach');
    });

    it('denies access (403 Forbidden) to users without the permitted role', async () => {
      const userId = new mongoose.Types.ObjectId();
      const mockParent = new User({
        _id: userId,
        name: 'Parent User',
        email: 'parent@example.com',
        passwordHash: 'hash',
        role: 'parent',
        isActive: true,
      });

      vi.spyOn(User, 'findById').mockResolvedValue(mockParent);

      const token = signToken({
        userId: userId.toString(),
        email: 'parent@example.com',
        role: 'parent',
      });

      const response = await request(testApp)
        .get('/test-coach-only')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Access forbidden. Required role: coach');
    });

    it('prevents stale token privilege escalation using persisted database role', async () => {
      const userId = new mongoose.Types.ObjectId();
      // Database has user as 'individual', but the token claims 'coach'
      const mockDowngradedUser = new User({
        _id: userId,
        name: 'Downgraded User',
        email: 'downgraded@example.com',
        passwordHash: 'hash',
        role: 'individual',
        isActive: true,
      });

      vi.spyOn(User, 'findById').mockResolvedValue(mockDowngradedUser);

      // Stale token asserting role: 'coach'
      const staleToken = signToken({
        userId: userId.toString(),
        email: 'downgraded@example.com',
        role: 'coach',
      });

      const response = await request(testApp)
        .get('/test-coach-only')
        .set('Authorization', `Bearer ${staleToken}`);

      // Middleware checks database persisted role ('individual'), rejecting stale elevation
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Access forbidden');
    });
  });
});
