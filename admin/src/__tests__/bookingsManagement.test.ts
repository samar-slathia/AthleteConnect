import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminBookings,
  fetchAdminBookingDetail,
  setStoredSession,
  clearStoredSession,
  ApiError,
} from '../services/api';

describe('Admin Bookings Management API Services (Phase 3)', () => {
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
    setStoredSession('valid.admin.jwt.token', {
      name: 'Admin',
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

  describe('fetchAdminBookings', () => {
    it('constructs correct query parameters for pagination, search, status, sport, and date range', async () => {
      const mockResponse = {
        bookings: [
          {
            _id: 'b123',
            sport: 'boxing',
            date: '2026-11-20',
            startTime: '10:00',
            endTime: '11:00',
            durationMinutes: 60,
            venueType: 'coach_home',
            status: 'accepted',
            paymentStatus: 'paid',
            createdAt: '2026-11-01T10:00:00Z',
            updatedAt: '2026-11-01T12:00:00Z',
            customer: {
              id: 'c1',
              name: 'John Doe',
              email: 'john@example.com',
              role: 'parent',
              isActive: true,
            },
            coach: {
              id: 'ch1',
              name: 'Coach Marcus',
              email: 'marcus@coach.test',
              isActive: true,
            },
          },
        ],
        pagination: {
          page: 2,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
        summary: {
          total: 50,
          pending: 10,
          accepted: 25,
          completed: 10,
          cancelled: 3,
          declined: 2,
        },
        filteredCount: 1,
      };

      let capturedUrl = '';
      let capturedHeaders: any = {};
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, opts: any) => {
          capturedUrl = url;
          capturedHeaders = opts.headers;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve(mockResponse),
          });
        })
      );

      const result = await fetchAdminBookings({
        page: 2,
        limit: 10,
        search: 'Marcus',
        status: 'accepted',
        sport: 'boxing',
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      });

      expect(capturedUrl).toContain('/api/admin/bookings');
      expect(capturedUrl).toContain('page=2');
      expect(capturedUrl).toContain('limit=10');
      expect(capturedUrl).toContain('search=Marcus');
      expect(capturedUrl).toContain('status=accepted');
      expect(capturedUrl).toContain('sport=boxing');
      expect(capturedUrl).toContain('fromDate=2026-11-01');
      expect(capturedUrl).toContain('toDate=2026-11-30');
      expect(capturedHeaders.get('Authorization')).toBe('Bearer valid.admin.jwt.token');

      expect(result.bookings).toHaveLength(1);
      expect(result.summary.total).toBe(50);
      expect(result.summary.accepted).toBe(25);
    });

    it('throws ApiError with server error message on failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 400,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ error: 'Invalid status parameter.' }),
          })
        )
      );

      await expect(
        fetchAdminBookings({ status: 'invalid_status' })
      ).rejects.toThrow(ApiError);
    });
  });

  describe('fetchAdminBookingDetail', () => {
    it('requests specific booking ID and returns complete operational session details', async () => {
      const mockDetail = {
        booking: {
          _id: '672000000000000000000001',
          sport: 'kickboxing',
          date: '2026-11-25',
          startTime: '15:00',
          endTime: '16:00',
          startMinutes: 900,
          endMinutes: 960,
          durationMinutes: 60,
          venueType: 'ground',
          trainingAddress: 'Sector 5 Stadium, Ground B',
          status: 'cancelled',
          paymentStatus: 'unpaid',
          cancellationReason: 'Bad weather and rain.',
          cancelledBy: 'coach',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-01T14:30:00Z',
          customer: {
            id: 'c10',
            name: 'Priya Sharma',
            email: 'priya@example.com',
            role: 'individual',
            isActive: true,
            customerPhone: '+919876543210',
          },
          coach: {
            id: 'ch10',
            name: 'Coach Elena',
            email: 'elena@coach.test',
            isActive: true,
            profile: {
              disciplines: ['kickboxing', 'boxing'],
              hourlyRate: 1500,
              bio: 'Certified Kickboxing Instructor',
            },
          },
        },
      };

      let capturedUrl = '';
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          capturedUrl = url;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve(mockDetail),
          });
        })
      );

      const result = await fetchAdminBookingDetail('672000000000000000000001');

      expect(capturedUrl).toContain('/api/admin/bookings/672000000000000000000001');
      expect(result.booking._id).toBe('672000000000000000000001');
      expect(result.booking.sport).toBe('kickboxing');
      expect(result.booking.status).toBe('cancelled');
      expect(result.booking.cancelledBy).toBe('coach');
      expect(result.booking.cancellationReason).toBe('Bad weather and rain.');
      expect(result.booking.customer?.customerPhone).toBe('+919876543210');
      expect(result.booking.coach?.profile?.bio).toContain('Certified Kickboxing');
    });

    it('throws ApiError when booking is not found (404)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 404,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ error: 'Booking not found.' }),
          })
        )
      );

      await expect(
        fetchAdminBookingDetail('672000000000000000000099')
      ).rejects.toThrow(ApiError);
    });
  });
});
