import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminUsers,
  fetchAdminUserDetail,
  updateAdminUserStatus,
  fetchAdminCoaches,
  fetchAdminCoachDetail,
  setStoredSession,
  clearStoredSession,
  ApiError,
} from '../services/api';

describe('Admin Users & Coaches Management API Services (Phase 2)', () => {
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
    setStoredSession('valid.admin.token', {
      name: 'Admin',
      email: 'admin@test.com',
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

  describe('fetchAdminUsers', () => {
    it('constructs query parameters correctly for pagination, search, role, and status', async () => {
      const mockResponse = {
        users: [
          {
            _id: 'u1',
            name: 'Parent Jane',
            email: 'jane@example.com',
            role: 'parent',
            isActive: true,
            createdAt: '2026-10-15T10:00:00Z',
          },
        ],
        pagination: { page: 2, limit: 10, total: 15, totalPages: 2 },
        summary: {
          totalCustomers: 15,
          parentCount: 9,
          individualCount: 6,
          activeCount: 14,
          inactiveCount: 1,
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchAdminUsers({
        page: 2,
        limit: 10,
        search: 'jane',
        role: 'parent',
        status: 'active',
      });

      expect(result.users).toHaveLength(1);
      expect(result.users[0].name).toBe('Parent Jane');
      expect(result.summary.totalCustomers).toBe(15);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users?page=2&limit=10&search=jane&role=parent&status=active',
        expect.objectContaining({
          headers: expect.any(Headers),
        })
      );
    });
  });

  describe('fetchAdminUserDetail', () => {
    it('retrieves user details and booking count for valid ID', async () => {
      const mockDetail = {
        user: {
          _id: 'u_target',
          name: 'Target Customer',
          email: 'target@example.com',
          role: 'individual',
          isActive: true,
          createdAt: '2026-10-20T12:00:00Z',
        },
        bookingCount: 5,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockDetail,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchAdminUserDetail('u_target');
      expect(result.user.name).toBe('Target Customer');
      expect(result.bookingCount).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users/u_target',
        expect.anything()
      );
    });
  });

  describe('updateAdminUserStatus', () => {
    it('sends PATCH request with isActive boolean payload and returns confirmation', async () => {
      const mockUpdated = {
        user: {
          _id: 'u_mod',
          name: 'Deactivated User',
          email: 'deact@example.com',
          role: 'parent',
          isActive: false,
          createdAt: '2026-10-01T00:00:00Z',
        },
        message: 'Account for Deactivated User has been deactivated successfully.',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockUpdated,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await updateAdminUserStatus('u_mod', false);
      expect(result.user.isActive).toBe(false);
      expect(result.message).toContain('deactivated');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users/u_mod/status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
        })
      );
    });

    it('throws ApiError with message when server rejects status modification', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'Action forbidden. Administrator accounts cannot be modified through this interface.',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(updateAdminUserStatus('admin_id', false)).rejects.toThrow(ApiError);
    });
  });

  describe('fetchAdminCoaches', () => {
    it('constructs query for coaches with discipline and status filters', async () => {
      const mockCoaches = {
        coaches: [
          {
            _id: 'c1',
            name: 'Coach Sarah',
            email: 'sarah@coach.com',
            role: 'coach',
            isActive: true,
            createdAt: '2026-09-01T00:00:00Z',
            profile: {
              disciplines: ['boxing'],
              hourlyRate: 1800,
              currency: 'INR',
              locations: ['Central Gym'],
              isPublished: true,
              isComplete: true,
            },
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        summary: { totalCoaches: 5, activeCoaches: 4, inactiveCoaches: 1 },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockCoaches,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchAdminCoaches({
        discipline: 'boxing',
        status: 'active',
      });

      expect(result.coaches).toHaveLength(1);
      expect(result.coaches[0].profile?.disciplines).toContain('boxing');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/coaches?status=active&discipline=boxing',
        expect.anything()
      );
    });
  });

  describe('fetchAdminCoachDetail', () => {
    it('retrieves full coach profile and session stats', async () => {
      const mockDetail = {
        coach: {
          _id: 'c_detail',
          name: 'Coach Jin',
          email: 'jin@coach.test',
          role: 'coach',
          isActive: true,
          createdAt: '2026-08-15T00:00:00Z',
        },
        profile: {
          bio: 'Martial artist',
          disciplines: ['wushu'],
          hourlyRate: 2200,
          currency: 'INR',
          locations: ['Hall A'],
          isPublished: true,
          isComplete: true,
        },
        bookingCount: 8,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockDetail,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchAdminCoachDetail('c_detail');
      expect(result.coach.name).toBe('Coach Jin');
      expect(result.profile?.disciplines).toContain('wushu');
      expect(result.bookingCount).toBe(8);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/coaches/c_detail',
        expect.anything()
      );
    });
  });
});

