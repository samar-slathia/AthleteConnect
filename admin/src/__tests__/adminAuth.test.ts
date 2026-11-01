import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  adminLogin,
  fetchAdminMe,
  fetchAdminOverview,
  getStoredToken,
  getStoredUser,
  setStoredSession,
  clearStoredSession,
  setUnauthorizedHandler,
  ApiError,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from '../services/api';
import type { AdminUser } from '../services/api';

describe('Admin Authentication & Session Management (Frontend Services)', () => {
  // Mock localStorage for node environment
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
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Session Storage Utilities', () => {
    it('stores and retrieves admin session safely', () => {
      const mockUser: AdminUser = {
        id: 'admin_123',
        name: 'Lead Admin',
        email: 'admin@athleteconnect.test',
        role: 'admin',
        isActive: true,
      };
      const token = 'mock.jwt.token';

      setStoredSession(token, mockUser);
      expect(getStoredToken()).toBe(token);
      expect(getStoredUser()).toEqual(mockUser);
    });

    it('clears stored session on logout', () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, 'stale_token');
      localStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify({ name: 'Admin', role: 'admin' })
      );

      clearStoredSession();
      expect(getStoredToken()).toBeNull();
      expect(getStoredUser()).toBeNull();
    });
  });

  describe('adminLogin API Service', () => {
    it('persists session when login succeeds with role === admin', async () => {
      const mockAdmin: AdminUser = {
        id: 'admin_456',
        name: 'Operations Director',
        email: 'ops@athleteconnect.test',
        role: 'admin',
        isActive: true,
      };
      const mockToken = 'valid.admin.jwt';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            user: mockAdmin,
            token: mockToken,
          }),
        })
      );

      const result = await adminLogin('ops@athleteconnect.test', 'CorrectPass123!');
      expect(result.token).toBe(mockToken);
      expect(result.user.role).toBe('admin');
      expect(getStoredToken()).toBe(mockToken);
      expect(getStoredUser()).toEqual(mockAdmin);
    });

    it('rejects authentication and does not store session if user role is not admin', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            user: {
              id: 'parent_123',
              name: 'Parent User',
              email: 'parent@athleteconnect.test',
              role: 'parent',
              isActive: true,
            },
            token: 'customer.jwt.token',
          }),
        })
      );

      await expect(
        adminLogin('parent@athleteconnect.test', 'Pass123!')
      ).rejects.toThrow('Access forbidden');
      expect(getStoredToken()).toBeNull();
    });

    it('throws ApiError with server error message when credentials are wrong', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'Invalid email or password.',
          }),
        })
      );

      await expect(
        adminLogin('admin@athleteconnect.test', 'WrongPassword!')
      ).rejects.toThrow('Invalid email or password.');
      expect(getStoredToken()).toBeNull();
    });

    it('invokes unauthorized handler when server responds with 401', async () => {
      const unauthorizedSpy = vi.fn();
      setUnauthorizedHandler(unauthorizedSpy);
      localStorage.setItem(TOKEN_STORAGE_KEY, 'expired_token');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'Token has expired. Please log in again.',
          }),
        })
      );

      await expect(fetchAdminMe()).rejects.toThrow();
      expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
      expect(getStoredToken()).toBeNull();
    });
  });

  describe('fetchAdminOverview API Service', () => {
    it('sends Bearer token header and returns structured metrics', async () => {
      const token = 'active_admin_token';
      setStoredSession(token, {
        name: 'Admin',
        email: 'a@a.com',
        role: 'admin',
        isActive: true,
      });

      const mockOverview = {
        metrics: {
          users: {
            total: 25,
            parents: 12,
            individuals: 8,
            customersJoined: 20,
            coaches: 4,
            coachesJoined: 4,
            activeCoaches: 3,
            admins: 1,
          },
          bookings: {
            total: 10,
            pending: 3,
            accepted: 4,
            completed: 2,
            cancelled: 1,
            declined: 0,
            cancelledAndDeclined: 1,
          },
        },
        recentBookings: [],
        recentCoaches: [],
        timestamp: '2026-11-01T12:00:00.000Z',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockOverview,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchAdminOverview();
      expect(result.metrics.users.total).toBe(25);
      expect(result.metrics.users.customersJoined).toBe(20);
      expect(result.metrics.users.coachesJoined).toBe(4);
      expect(result.metrics.bookings.pending).toBe(3);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/overview',
        expect.objectContaining({
          headers: expect.any(Headers),
        })
      );
    });

    it('handles network error safely and wraps in ApiError with status 0', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network connection failed'))
      );

      await expect(fetchAdminOverview()).rejects.toThrow(ApiError);
      try {
        await fetchAdminOverview();
      } catch (err: any) {
        expect(err.status).toBe(0);
        expect(err.message).toContain('Unable to connect to the AthleteConnect server');
      }
    });
  });
});

