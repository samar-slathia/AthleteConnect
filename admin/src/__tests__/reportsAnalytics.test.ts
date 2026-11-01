import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminAnalytics,
  downloadAdminReportCsv,
  setStoredSession,
  clearStoredSession,
  ApiError,
} from '../services/api';

describe('Admin Reports & Analytics API Services (Phase 4)', () => {
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

  describe('fetchAdminAnalytics', () => {
    it('constructs correct query parameters and headers for date range and filters', async () => {
      const mockAnalytics = {
        range: {
          type: 'last30days',
          label: 'Last 30 Days',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        },
        summary: {
          allTime: {
            totalCustomers: 50,
            totalCoaches: 20,
            totalBookings: 60,
            completedBookings: 30,
            pendingBookings: 10,
            cancelledBookings: 15,
            declinedBookings: 5,
          },
          filtered: {
            totalCustomers: 12,
            totalCoaches: 4,
            totalBookings: 25,
            completedBookings: 15,
            pendingBookings: 5,
            cancelledBookings: 3,
            declinedBookings: 2,
          },
        },
        userGrowth: {
          timeline: [
            { date: '2026-10-15', parents: 2, individuals: 3, coaches: 1, total: 6 },
          ],
          totalInPeriod: 16,
        },
        bookingTrends: {
          timeline: [
            { date: '2026-10-15', total: 4, pending: 1, accepted: 1, completed: 2, cancelled: 0, declined: 0 },
          ],
          distribution: {
            total: 25,
            pending: 5,
            accepted: 0,
            completed: 15,
            cancelled: 3,
            declined: 2,
          },
        },
        sportsPopularity: [
          { sport: 'boxing', total: 15, completed: 10, accepted: 2, cancelled: 2, declined: 1, percentage: 60 },
          { sport: 'wushu', total: 10, completed: 5, accepted: 3, cancelled: 1, declined: 1, percentage: 40 },
        ],
        coachActivity: {
          totalRegistered: 20,
          activeCoaches: 18,
          coachesWithBookings: 12,
          topCoaches: [
            {
              coachId: 'c1',
              name: 'Coach Marcus',
              email: 'marcus@coach.test',
              isActive: true,
              totalBookings: 12,
              completedSessions: 8,
              acceptedSessions: 2,
              cancelledSessions: 2,
            },
          ],
        },
        cancellationAnalysis: {
          totalCancelled: 3,
          totalDeclined: 2,
          attribution: { customer: 2, coach: 1, unspecified: 0 },
          reasons: [{ reason: 'Rain and storm', count: 2 }],
          rejectionReasons: [{ reason: 'Fully booked', count: 2 }],
        },
        financialStatus: {
          isAvailable: false,
          notice: 'Financial reporting will become available after verified payment transaction integration.',
        },
        auditTrailStatus: {
          isAvailable: false,
          notice: 'Platform governance and administrative audit logging will be activated in Admin Phase 5.',
        },
        timestamp: '2026-11-01T12:00:00Z',
      };

      let capturedUrl = '';
      let capturedHeaders: any = null;
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, opts: any) => {
          capturedUrl = url;
          capturedHeaders = opts.headers;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve(mockAnalytics),
          });
        })
      );

      const result = await fetchAdminAnalytics({
        range: 'custom',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        sport: 'boxing',
        status: 'completed',
      });

      expect(capturedUrl).toContain('/api/admin/reports/analytics');
      expect(capturedUrl).toContain('range=custom');
      expect(capturedUrl).toContain('startDate=2026-10-01');
      expect(capturedUrl).toContain('endDate=2026-10-31');
      expect(capturedUrl).toContain('sport=boxing');
      expect(capturedUrl).toContain('status=completed');
      expect(capturedHeaders.get('Authorization')).toBe('Bearer valid.admin.jwt.token');

      expect(result.summary.allTime.totalBookings).toBe(60);
      expect(result.summary.filtered.completedBookings).toBe(15);
      expect(result.sportsPopularity).toHaveLength(2);
      expect(result.financialStatus.isAvailable).toBe(false);
      expect(result.financialStatus.notice).toContain('Financial reporting will become available');
    });

    it('throws ApiError on HTTP error response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 400,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ error: 'Invalid range parameter.' }),
          })
        )
      );

      await expect(
        fetchAdminAnalytics({ range: 'invalid_range' })
      ).rejects.toThrow(ApiError);
    });
  });

  describe('downloadAdminReportCsv', () => {
    it('downloads CSV file with Bearer authorization and triggers DOM click download', async () => {
      let capturedUrl = '';
      let capturedHeaders: any = null;

      const mockCsvBlob = new Blob(['"Booking ID","Sport"\n"1","boxing"'], { type: 'text/csv' });

      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, opts: any) => {
          capturedUrl = url;
          capturedHeaders = opts.headers;
          return Promise.resolve({
            ok: true,
            status: 200,
            blob: () => Promise.resolve(mockCsvBlob),
          });
        })
      );

      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      const mockDocument = {
        createElement: vi.fn().mockReturnValue(mockLink),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      };
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-blob');
      const mockRevokeObjectURL = vi.fn();
      const mockWindow = {
        URL: {
          createObjectURL: mockCreateObjectURL,
          revokeObjectURL: mockRevokeObjectURL,
        },
      };

      vi.stubGlobal('document', mockDocument);
      vi.stubGlobal('window', mockWindow);

      await downloadAdminReportCsv('bookings', {
        range: 'last30days',
        sport: 'boxing',
      });

      expect(capturedUrl).toContain('/api/admin/reports/export');
      expect(capturedUrl).toContain('reportType=bookings');
      expect(capturedUrl).toContain('range=last30days');
      expect(capturedUrl).toContain('sport=boxing');
      expect(capturedHeaders['Authorization']).toBe('Bearer valid.admin.jwt.token');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockDocument.body.appendChild).toHaveBeenCalled();
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockDocument.body.removeChild).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/test-blob');
    });

    it('throws ApiError if CSV export endpoint returns an error status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 403,
          })
        )
      );

      await expect(
        downloadAdminReportCsv('users')
      ).rejects.toThrow(ApiError);
    });
  });
});
