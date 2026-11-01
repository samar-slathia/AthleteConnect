import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminSettings,
  updateAdminSettings,
  fetchAdminAuditLogs,
  fetchAdminSystemHealth,
  setStoredSession,
  clearStoredSession,
  ApiError,
} from '../services/api';

describe('Admin Settings & Governance API Services (Phase 5)', () => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock);
    localStorage.clear();
    setStoredSession('mock.admin.jwt.token', {
      name: 'Platform Administrator',
      email: 'admin@athleteconnect.test',
      role: 'admin',
      isActive: true,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearStoredSession();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('fetchAdminSettings', () => {
    it('calls GET /api/admin/settings with Bearer authorization and parses payload', async () => {
      const mockSettingsResponse = {
        settings: {
          platformName: 'AthleteConnect',
          supportEmail: 'support@athleteconnect.com',
          supportPhone: '+1-800-555-0199',
          supportedDisciplines: ['boxing', 'wushu', 'kickboxing'],
          cancellationWindowHours: 24,
          maxAdvanceBookingDays: 30,
          defaultSessionDurationMinutes: 60,
          maintenanceMode: false,
          maintenanceNotice: '',
        },
        platformInfo: {
          name: 'AthleteConnect',
          environment: 'development',
          apiVersion: '1.0.0',
          backendStatus: 'connected',
          databaseStatus: 'connected',
          serverUptimeSeconds: 120,
        },
        features: {
          customerRegistration: { status: 'Available', label: 'Customer Registration' },
          paymentIntegration: { status: 'Planned', label: 'Payment Integration' },
        },
        timestamp: new Date().toISOString(),
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockSettingsResponse,
      });
      vi.stubGlobal('fetch', fetchSpy);

      const data = await fetchAdminSettings();

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/admin/settings',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Headers),
        })
      );
      const passedHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
      expect(passedHeaders.get('Authorization')).toBe('Bearer mock.admin.jwt.token');
      expect(data.settings.platformName).toBe('AthleteConnect');
      expect(data.features.paymentIntegration.status).toBe('Planned');
    });

    it('handles HTTP error responses by throwing ApiError', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Access forbidden. Administrator account required.' }),
        })
      );

      await expect(fetchAdminSettings()).rejects.toThrow(ApiError);
    });
  });

  describe('updateAdminSettings', () => {
    it('calls PATCH /api/admin/settings with JSON payload and returns updated configuration', async () => {
      const patchData = {
        supportEmail: 'newsupport@athleteconnect.test',
        cancellationWindowHours: 48,
        maintenanceMode: true,
        maintenanceNotice: 'Platform routine maintenance in progress.',
      };

      const mockUpdatedResponse = {
        settings: {
          platformName: 'AthleteConnect',
          supportEmail: 'newsupport@athleteconnect.test',
          supportPhone: '+1-800-555-0199',
          supportedDisciplines: ['boxing', 'wushu', 'kickboxing'],
          cancellationWindowHours: 48,
          maxAdvanceBookingDays: 30,
          defaultSessionDurationMinutes: 60,
          maintenanceMode: true,
          maintenanceNotice: 'Platform routine maintenance in progress.',
        },
        message: 'Platform configuration updated successfully.',
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockUpdatedResponse,
      });
      vi.stubGlobal('fetch', fetchSpy);

      const res = await updateAdminSettings(patchData);

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/admin/settings',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.any(Headers),
          body: JSON.stringify(patchData),
        })
      );
      const passedHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
      expect(passedHeaders.get('Authorization')).toBe('Bearer mock.admin.jwt.token');
      expect(res.settings.supportEmail).toBe('newsupport@athleteconnect.test');
      expect(res.settings.cancellationWindowHours).toBe(48);
      expect(res.settings.maintenanceMode).toBe(true);
      expect(res.message).toContain('updated successfully');
    });
  });

  describe('fetchAdminAuditLogs', () => {
    it('constructs correct query parameters for category, outcome, search, and pagination', async () => {
      const mockAuditResponse = {
        logs: [
          {
            _id: 'audit-log-1',
            eventType: 'SETTINGS_UPDATE',
            action: 'Updated Platform Settings',
            category: 'SETTINGS',
            adminEmail: 'admin@athleteconnect.test',
            targetType: 'PlatformSettings',
            details: { modifiedFields: ['cancellationWindowHours'] },
            outcome: 'SUCCESS',
            createdAt: '2026-11-01T12:00:00Z',
          },
        ],
        pagination: {
          page: 2,
          limit: 15,
          total: 25,
          totalPages: 2,
        },
        categories: ['AUTH', 'USER_MANAGEMENT', 'SETTINGS', 'SECURITY'],
        timestamp: new Date().toISOString(),
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockAuditResponse,
      });
      vi.stubGlobal('fetch', fetchSpy);

      const data = await fetchAdminAuditLogs({
        page: 2,
        limit: 15,
        category: 'SETTINGS',
        outcome: 'SUCCESS',
        search: 'cancellation',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/audit-logs?page=2&limit=15&category=SETTINGS&outcome=SUCCESS&search=cancellation'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Headers),
        })
      );
      const passedHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
      expect(passedHeaders.get('Authorization')).toBe('Bearer mock.admin.jwt.token');
      expect(data.logs).toHaveLength(1);
      expect(data.pagination.total).toBe(25);
    });
  });

  describe('fetchAdminSystemHealth', () => {
    it('calls GET /api/admin/health and returns safe health indicators', async () => {
      const mockHealth = {
        status: 'healthy',
        database: {
          status: 'connected',
          readyState: 1,
          pingLatencyMs: 4,
        },
        server: {
          uptimeSeconds: 3600,
          environment: 'development',
          memoryHeapUsedMB: 45.2,
          memoryHeapTotalMB: 80.5,
        },
        apis: {
          coreApi: 'operational',
          adminApi: 'operational',
        },
        timestamp: new Date().toISOString(),
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockHealth,
      });
      vi.stubGlobal('fetch', fetchSpy);

      const health = await fetchAdminSystemHealth();

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/admin/health',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Headers),
        })
      );
      const passedHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
      expect(passedHeaders.get('Authorization')).toBe('Bearer mock.admin.jwt.token');
      expect(health.status).toBe('healthy');
      expect(health.database.status).toBe('connected');
      expect(health.apis.coreApi).toBe('operational');
    });
  });
});
