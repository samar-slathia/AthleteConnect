import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { Readable, Writable } from 'stream';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { comparePassword, hashPassword } from '../src/utils/password';
import { signToken } from '../src/utils/jwt';
import {
  provisionAdminAccount,
  promptText,
  promptHidden,
} from '../src/scripts/createAdmin';

describe('Admin Provisioning & Security Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('provisionAdminAccount Unit Tests', () => {
    it('creates an admin account with role="admin" and isActive=true', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      let savedDoc: any = null;
      vi.spyOn(User.prototype, 'save').mockImplementation(async function (this: any) {
        this._id = new mongoose.Types.ObjectId();
        savedDoc = this;
        return this;
      });

      const result = await provisionAdminAccount({
        name: 'Super Admin',
        email: 'superadmin@athleteconnect.test',
        password: 'SecureAdminPassword123!',
      });

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('superadmin@athleteconnect.test');
      expect(result.user.name).toBe('Super Admin');
      expect(result.user.role).toBe('admin');
      expect(result.user.isActive).toBe(true);

      // Verify that result does NOT expose password or passwordHash
      expect((result.user as any).password).toBeUndefined();
      expect((result.user as any).passwordHash).toBeUndefined();

      // Verify stored document has hashed password that matches
      expect(savedDoc).not.toBeNull();
      expect(savedDoc.passwordHash).toBeDefined();
      expect(savedDoc.passwordHash).not.toBe('SecureAdminPassword123!');
      const matches = await comparePassword('SecureAdminPassword123!', savedDoc.passwordHash);
      expect(matches).toBe(true);
    });

    it('defaults name to "Platform Administrator" if name is not provided or empty', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      let savedDoc: any = null;
      vi.spyOn(User.prototype, 'save').mockImplementation(async function (this: any) {
        this._id = new mongoose.Types.ObjectId();
        savedDoc = this;
        return this;
      });

      const result = await provisionAdminAccount({
        email: 'defaultname.admin@athleteconnect.test',
        password: 'ValidPassword123!',
      });

      expect(result.user.name).toBe('Platform Administrator');
      expect(savedDoc.name).toBe('Platform Administrator');
    });

    it('strictly prevents duplicate email when an admin account already exists', async () => {
      const existingAdmin = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Existing Admin',
        email: 'admin.exists@athleteconnect.test',
        passwordHash: 'somehash',
        role: 'admin',
        isActive: true,
      });

      vi.spyOn(User, 'findOne').mockResolvedValue(existingAdmin);
      const saveSpy = vi.spyOn(User.prototype, 'save');

      await expect(
        provisionAdminAccount({
          email: 'admin.exists@athleteconnect.test',
          password: 'Password123!',
        })
      ).rejects.toThrow(/already exists/i);

      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('strictly prevents duplicate email or promotion when a customer (parent/coach) already exists', async () => {
      const existingCoach = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Coach Sarah',
        email: 'sarah.coach@athleteconnect.test',
        passwordHash: 'somehash',
        role: 'coach',
        isActive: true,
      });

      vi.spyOn(User, 'findOne').mockResolvedValue(existingCoach);
      const saveSpy = vi.spyOn(User.prototype, 'save');

      await expect(
        provisionAdminAccount({
          email: 'sarah.coach@athleteconnect.test',
          password: 'Password123!',
        })
      ).rejects.toThrow(/already exists \(role: coach\)/i);

      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('rejects invalid or missing email addresses', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      await expect(
        provisionAdminAccount({
          email: '',
          password: 'Password123!',
        })
      ).rejects.toThrow(/email is required/i);

      await expect(
        provisionAdminAccount({
          email: 'not-an-email',
          password: 'Password123!',
        })
      ).rejects.toThrow(/valid email address/i);
    });

    it('rejects passwords that fail application validation (< 8 chars or > 72 bytes)', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      // Short password (< 8 chars)
      await expect(
        provisionAdminAccount({
          email: 'admin.short@athleteconnect.test',
          password: 'short',
        })
      ).rejects.toThrow(/at least 8 characters/i);

      // Huge password (> 72 bytes)
      const longPassword = 'a'.repeat(73);
      await expect(
        provisionAdminAccount({
          email: 'admin.long@athleteconnect.test',
          password: longPassword,
        })
      ).rejects.toThrow(/maximum length of 72 bytes/i);
    });
  });

  describe('Integration with /api/admin/login and Admin Middleware', () => {
    it('allows newly provisioned admin account to log in and access protected admin endpoints', async () => {
      const adminPassword = 'AdminSecretPassword99!';
      const realHash = await hashPassword(adminPassword);
      const adminId = new mongoose.Types.ObjectId();

      const createdAdmin = new User({
        _id: adminId,
        name: 'Provisioned Admin',
        email: 'newadmin@athleteconnect.test',
        passwordHash: realHash,
        role: 'admin',
        isActive: true,
      });

      // Mock User.findOne for login
      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(createdAdmin),
      } as any);

      // 1. Login with the provisioned credentials
      const loginRes = await request(app)
        .post('/api/admin/login')
        .send({
          email: 'newadmin@athleteconnect.test',
          password: adminPassword,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body).toHaveProperty('token');
      expect(loginRes.body.user.role).toBe('admin');
      expect(loginRes.body.user.email).toBe('newadmin@athleteconnect.test');

      const adminToken = loginRes.body.token;

      // 2. Use token to access protected /api/admin/me
      vi.spyOn(User, 'findById').mockResolvedValue(createdAdmin as any);

      const meRes = await request(app)
        .get('/api/admin/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('newadmin@athleteconnect.test');
      expect(meRes.body.user.role).toBe('admin');
    });

    it('rejects customer/coach login attempts on /api/admin/login with HTTP 403', async () => {
      const coachPassword = 'CoachPassword123!';
      const coachHash = await hashPassword(coachPassword);

      const coachUser = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Test Coach',
        email: 'coach@athleteconnect.test',
        passwordHash: coachHash,
        role: 'coach',
        isActive: true,
      });

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(coachUser),
      } as any);

      const res = await request(app)
        .post('/api/admin/login')
        .send({
          email: 'coach@athleteconnect.test',
          password: coachPassword,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden. Administrator account required.');
    });

    it('rejects customer/coach tokens when accessing protected admin endpoints with HTTP 403', async () => {
      const parentUser = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Parent User',
        email: 'parent@athleteconnect.test',
        role: 'parent',
        isActive: true,
      });

      const parentToken = signToken({
        userId: parentUser._id.toString(),
        email: parentUser.email,
        role: 'parent',
      });

      vi.spyOn(User, 'findById').mockResolvedValue(parentUser as any);

      const res = await request(app)
        .get('/api/admin/me')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden. Required role: admin.');
    });
  });

  describe('CLI Input Helpers (promptHidden & promptText)', () => {
    it('promptText reads and trims line from stream', async () => {
      const mockRl = {
        question: vi.fn((q, cb) => cb('   Admin Name   ')),
        close: vi.fn(),
      } as any;

      const answer = await promptText('Enter name: ', mockRl);
      expect(answer).toBe('Admin Name');
    });

    it('promptHidden reads line cleanly in non-TTY mode without echoing', async () => {
      const inStream = new Readable({
        read() {
          this.push('HiddenPassword123!\n');
          this.push(null);
        },
      });

      let output = '';
      const outStream = new Writable({
        write(chunk, encoding, callback) {
          output += chunk.toString();
          callback();
        },
      });

      const pass = await promptHidden('Password: ', inStream, outStream);
      expect(pass).toBe('HiddenPassword123!');
      expect(output).toContain('Password: ');
      // Verify that output does NOT leak the password back out
      expect(output).not.toContain('HiddenPassword123!');
    });
  });
});
