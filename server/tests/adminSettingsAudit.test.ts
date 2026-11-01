import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { PlatformSettings, DEFAULT_PLATFORM_SETTINGS } from '../src/models/PlatformSettings';
import { AuditLog } from '../src/models/AuditLog';
import { signToken } from '../src/utils/jwt';

describe('Admin Phase 5: Platform Settings & Governance API', () => {
  const adminId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();

  const mockAdmin = new User({
    _id: adminId,
    name: 'Platform Administrator',
    email: 'admin@athleteconnect.test',
    role: 'admin',
    isActive: true,
  });

  const mockCustomer = new User({
    _id: customerId,
    name: 'Customer User',
    email: 'customer@athleteconnect.test',
    role: 'parent',
    isActive: true,
  });

  const adminToken = signToken({
    userId: adminId.toString(),
    email: 'admin@athleteconnect.test',
    role: 'admin',
  });

  const customerToken = signToken({
    userId: customerId.toString(),
    email: 'customer@athleteconnect.test',
    role: 'parent',
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/admin/settings', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const res = await request(app).get('/api/admin/settings');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('rejects non-admin role with HTTP 403', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCustomer);

      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden');
    });

    it('returns platform settings, platform info, and verified feature statuses', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const mockSettingsDoc = new PlatformSettings({
        ...DEFAULT_PLATFORM_SETTINGS,
        platformName: 'AthleteConnect Elite',
        cancellationWindowHours: 48,
      });

      vi.spyOn(PlatformSettings, 'findOne').mockResolvedValue(mockSettingsDoc as any);

      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.settings).toBeDefined();
      expect(res.body.settings.platformName).toBe('AthleteConnect Elite');
      expect(res.body.settings.cancellationWindowHours).toBe(48);
      expect(res.body.settings.supportedDisciplines).toEqual(['boxing', 'wushu', 'kickboxing']);

      // Platform Info verification
      expect(res.body.platformInfo).toBeDefined();
      expect(res.body.platformInfo.name).toBe('AthleteConnect Elite');
      expect(res.body.platformInfo.apiVersion).toBe('1.0.0');

      // Feature Status verification
      expect(res.body.features.customerRegistration.status).toBe('Available');
      expect(res.body.features.coachRegistration.status).toBe('Available');
      expect(res.body.features.coachDiscovery.status).toBe('Available');
      expect(res.body.features.trainingBookings.status).toBe('Available');
      expect(res.body.features.reporting.status).toBe('Available');
      expect(res.body.features.paymentIntegration.status).toBe('Planned');
      expect(res.body.features.paymentIntegration.description).toContain('Stripe');
    });

    it('auto-provisions default settings document if none exists yet', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);
      vi.spyOn(PlatformSettings, 'findOne').mockResolvedValue(null);

      const createdDoc = new PlatformSettings(DEFAULT_PLATFORM_SETTINGS);
      vi.spyOn(PlatformSettings, 'create').mockResolvedValue(createdDoc as any);

      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(PlatformSettings.create).toHaveBeenCalledWith(DEFAULT_PLATFORM_SETTINGS);
      expect(res.body.settings.platformName).toBe('AthleteConnect');
    });
  });

  describe('PATCH /api/admin/settings', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const res = await request(app).patch('/api/admin/settings').send({ platformName: 'New' });
      expect(res.status).toBe(401);
    });

    it('rejects non-admin role with HTTP 403', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCustomer);

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ platformName: 'New' });

      expect(res.status).toBe(403);
    });

    it('rejects empty payload with HTTP 400', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least one configuration field');
    });

    it('strictly rejects privileged or unknown fields with HTTP 400', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const dangerousPayloads = [
        { JWT_SECRET: 'evil_override_attempt_1234567890' },
        { MONGODB_URI: 'mongodb://attacker.com/db' },
        { role: 'superadmin' },
        { password: 'hackedPassword' },
        { isAdmin: true },
      ];

      for (const payload of dangerousPayloads) {
        const res = await request(app)
          .patch('/api/admin/settings')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Unknown or disallowed configuration field');
      }
    });

    it('validates supported sports disciplines strictly', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ supportedDisciplines: ['cricket', 'soccer'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('allowed sports');
    });

    it('validates cancellation window hours boundary strictly', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const res1 = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cancellationWindowHours: 0 });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cancellationWindowHours: 200 });
      expect(res2.status).toBe(400);
    });

    it('accepts valid configuration update, persists changes, and writes an audit event', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const existingDoc = new PlatformSettings({
        ...DEFAULT_PLATFORM_SETTINGS,
      });
      vi.spyOn(PlatformSettings, 'findOne').mockResolvedValue(existingDoc as any);
      const saveSpy = vi.spyOn(existingDoc, 'save').mockResolvedValue(existingDoc as any);
      const auditSpy = vi.spyOn(AuditLog, 'recordEvent').mockResolvedValue(null as any);

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supportEmail: 'ops@athleteconnect.test',
          cancellationWindowHours: 48,
          maintenanceMode: true,
          maintenanceNotice: 'Scheduled routine system update.',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('updated successfully');
      expect(res.body.settings.supportEmail).toBe('ops@athleteconnect.test');
      expect(res.body.settings.cancellationWindowHours).toBe(48);
      expect(res.body.settings.maintenanceMode).toBe(true);
      expect(res.body.settings.maintenanceNotice).toBe('Scheduled routine system update.');

      expect(saveSpy).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'SETTINGS_UPDATE',
          category: 'SETTINGS',
          action: 'Updated Platform Settings',
          outcome: 'SUCCESS',
          details: expect.objectContaining({
            modifiedFields: expect.arrayContaining([
              'supportEmail',
              'cancellationWindowHours',
              'maintenanceMode',
              'maintenanceNotice',
            ]),
          }),
        })
      );
    });
  });

  describe('GET /api/admin/audit-logs', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const res = await request(app).get('/api/admin/audit-logs');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin role with HTTP 403', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCustomer);

      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('returns paginated audit logs with search and category filters', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const mockLogs = [
        {
          _id: new mongoose.Types.ObjectId(),
          eventType: 'SETTINGS_UPDATE',
          action: 'Updated Platform Settings',
          category: 'SETTINGS',
          adminId,
          adminEmail: 'admin@athleteconnect.test',
          adminName: 'Platform Administrator',
          targetType: 'PlatformSettings',
          targetId: 'settings-1',
          details: { modifiedFields: ['cancellationWindowHours'] },
          outcome: 'SUCCESS',
          ipAddress: '127.0.0.1',
          createdAt: new Date('2026-11-01T10:00:00Z'),
        },
        {
          _id: new mongoose.Types.ObjectId(),
          eventType: 'USER_STATUS_CHANGE',
          action: 'Deactivated Customer Account',
          category: 'USER_MANAGEMENT',
          adminId,
          adminEmail: 'admin@athleteconnect.test',
          adminName: 'Platform Administrator',
          targetType: 'User',
          targetId: customerId.toString(),
          details: { targetEmail: 'baduser@example.com' },
          outcome: 'SUCCESS',
          ipAddress: '127.0.0.1',
          createdAt: new Date('2026-11-01T09:00:00Z'),
        },
      ];

      vi.spyOn(AuditLog, 'find').mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockLogs),
      } as any);

      vi.spyOn(AuditLog, 'countDocuments').mockResolvedValue(2);

      const res = await request(app)
        .get('/api/admin/audit-logs?category=SETTINGS&page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(2);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
      expect(res.body.categories).toContain('SETTINGS');
      expect(res.body.categories).toContain('USER_MANAGEMENT');
    });

    it('confirms audit records are immutable by verifying no DELETE or PATCH endpoint exists', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const logId = new mongoose.Types.ObjectId().toString();

      // Attempt DELETE on audit logs
      const deleteRes = await request(app)
        .delete(`/api/admin/audit-logs/${logId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(404);

      // Attempt PATCH on audit logs
      const patchRes = await request(app)
        .patch(`/api/admin/audit-logs/${logId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ outcome: 'FAILURE' });
      expect(patchRes.status).toBe(404);
    });
  });

  describe('GET /api/admin/health', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const res = await request(app).get('/api/admin/health');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin role with HTTP 403', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCustomer);

      const res = await request(app)
        .get('/api/admin/health')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('returns sanitized health status and does not leak credentials or infrastructure secrets', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const res = await request(app)
        .get('/api/admin/health')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
      expect(res.body.database).toBeDefined();
      expect(res.body.database.status).toBeDefined();
      expect(res.body.server).toBeDefined();
      expect(res.body.server.environment).toBeDefined();
      expect(res.body.server.memoryHeapUsedMB).toBeGreaterThan(0);
      expect(res.body.apis.coreApi).toBe('operational');
      expect(res.body.apis.adminApi).toBe('operational');

      // CRITICAL: Ensure NO credentials or secrets leak
      const responseText = JSON.stringify(res.body);
      expect(responseText).not.toContain('mongodb://');
      expect(responseText).not.toContain('JWT_SECRET');
      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('secret');
    });
  });
});

