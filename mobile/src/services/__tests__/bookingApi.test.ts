import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPublicCoaches,
  createBooking,
  getCustomerBookings,
  getCoachBookings,
  cancelBooking,
  acceptBooking,
  rejectBooking,
  getBookingMessages,
  sendBookingMessage,
  CreateBookingPayload,
  getKolkataDateString,
  getKolkataTomorrowDateString,
  isValidCalendarDate,
  ASIA_KOLKATA_TIMEZONE,
} from '../bookingApi';
import { AuthApiError } from '../authApi';

// Mock getApiBaseUrl
vi.mock('../../config/api', () => ({
  getApiBaseUrl: () => 'http://localhost:5000',
  API_ENDPOINTS: {
    COACHES: '/api/coaches',
    BOOKINGS: '/api/bookings',
  },
}));

describe('bookingApi Service Unit Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('getPublicCoaches', () => {
    it('fetches public coaches successfully without params', async () => {
      const mockCoaches = [
        {
          _id: 'coach_123',
          name: 'Maya Coach',
          role: 'coach',
          profile: {
            bio: 'Boxing specialist',
            disciplines: ['boxing'],
            specialties: ['Footwork'],
            sessionFormats: ['one_on_one'],
            venueTypes: ['coach_home'],
            hourlyRate: 1500,
            currency: 'INR',
            locations: ['Indiranagar'],
          },
          isConfiguredAvailability: true,
          timezone: 'Asia/Kolkata',
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ coaches: mockCoaches }),
      });

      const result = await getPublicCoaches();
      expect(result).toEqual(mockCoaches);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/coaches',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('appends discipline and location query params when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ coaches: [] }),
      });

      await getPublicCoaches({ discipline: 'boxing', location: 'Indiranagar' });
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/coaches?discipline=boxing&location=Indiranagar',
        expect.anything()
      );
    });

    it('throws AuthApiError with friendly message on server 500 error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Internal database error' }),
      });

      await expect(getPublicCoaches()).rejects.toThrow(AuthApiError);
      await expect(getPublicCoaches()).rejects.toThrow('Internal database error');
    });

    it('throws AuthApiError on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(getPublicCoaches()).rejects.toThrow(
        'Unable to connect to AthleteConnect servers. Please check your internet connection.'
      );
    });
  });

  describe('createBooking', () => {
    const validPayload: CreateBookingPayload = {
      coachId: 'coach_123',
      sport: 'boxing',
      date: '2026-11-20',
      startTime: '09:00',
      endTime: '10:00',
      venueType: 'coach_home',
      trainingAddress: '12nd Cross, Indiranagar',
      customerPhone: '+919876543210',
    };

    it('submits booking payload with Authorization token header', async () => {
      const mockCreatedBooking = {
        _id: 'bk_1',
        ...validPayload,
        customerId: 'parent_1',
        status: 'pending',
        paymentStatus: 'unpaid',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ booking: mockCreatedBooking }),
      });

      const result = await createBooking('valid_token_xyz', validPayload);
      expect(result).toEqual(mockCreatedBooking);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/bookings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_token_xyz',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(validPayload),
        })
      );
    });

    it('rejects empty token before network call', async () => {
      await expect(createBooking('', validPayload)).rejects.toThrow(
        'Authentication token is required.'
      );
    });

    it('propagates 409 Conflict error from backend', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'Cannot accept booking. Overlaps with an already accepted session.',
        }),
      });

      await expect(createBooking('valid_token', validPayload)).rejects.toThrow(
        'Cannot accept booking. Overlaps with an already accepted session.'
      );
    });

    it('propagates 400 validation error from backend', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Invalid customer phone number.' }),
      });

      await expect(createBooking('valid_token', validPayload)).rejects.toThrow(
        'Invalid customer phone number.'
      );
    });
  });

  describe('getCustomerBookings', () => {
    it('retrieves customer bookings successfully', async () => {
      const mockBookings = [
        {
          _id: 'bk_1',
          sport: 'boxing',
          status: 'pending',
          date: '2026-11-20',
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ bookings: mockBookings }),
      });

      const result = await getCustomerBookings('valid_token');
      expect(result).toEqual(mockBookings);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/bookings',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_token',
          }),
        })
      );
    });

    it('appends status filter when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ bookings: [] }),
      });

      await getCustomerBookings('valid_token', 'accepted');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/bookings?status=accepted',
        expect.anything()
      );
    });

    it('rejects empty token', async () => {
      await expect(getCustomerBookings('')).rejects.toThrow(
        'Authentication token is required.'
      );
    });
  });

  describe('cancelBooking', () => {
    it('cancels booking with reason', async () => {
      const mockCancelled = {
        _id: 'bk_1',
        status: 'cancelled',
        cancellationReason: 'Sick',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ booking: mockCancelled }),
      });

      const result = await cancelBooking('valid_token', 'bk_1', 'Sick');
      expect(result).toEqual(mockCancelled);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/bookings/bk_1/cancel',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ reason: 'Sick' }),
        })
      );
    });

    it('rejects empty booking ID', async () => {
      await expect(cancelBooking('valid_token', '')).rejects.toThrow(
        'Booking ID is required for cancellation.'
      );
    });
  });

  describe('getCoachBookings', () => {
    it('fetches bookings with authorization token', async () => {
      const mockBookings = [
        { _id: 'bk_coach_1', coachId: 'c1', customerId: 'u1', status: 'pending' },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ bookings: mockBookings }),
      });

      const res = await getCoachBookings('valid_token');
      expect(res).toEqual(mockBookings);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/bookings',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_token',
          }),
        })
      );
    });
  });

  describe('acceptBooking', () => {
    it('successfully sends accept request to PATCH /api/bookings/:id/accept', async () => {
      const mockAccepted = {
        _id: 'bk_pending_1',
        status: 'accepted',
        customerPhone: '+919876543210',
        trainingAddress: '123 Main St',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ booking: mockAccepted }),
      });

      const res = await acceptBooking('coach_token', 'bk_pending_1');
      expect(res).toEqual(mockAccepted);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/bookings/bk_pending_1/accept',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer coach_token',
          }),
        })
      );
    });

    it('rejects missing token or bookingId', async () => {
      await expect(acceptBooking('', 'bk_1')).rejects.toThrow('Authentication token is required.');
      await expect(acceptBooking('token', '')).rejects.toThrow('Booking ID is required to accept.');
    });

    it('handles server rejection error (e.g. conflict)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Cannot accept booking. Overlaps with an already accepted session.' }),
      });

      await expect(acceptBooking('token', 'bk_1')).rejects.toThrow(
        'Cannot accept booking. Overlaps with an already accepted session.'
      );
    });
  });

  describe('rejectBooking', () => {
    it('successfully sends reject request with optional reason', async () => {
      const mockRejected = {
        _id: 'bk_pending_1',
        status: 'rejected',
        rejectionReason: 'Schedule conflict',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ booking: mockRejected }),
      });

      const res = await rejectBooking('coach_token', 'bk_pending_1', 'Schedule conflict');
      expect(res).toEqual(mockRejected);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/bookings/bk_pending_1/reject',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer coach_token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ reason: 'Schedule conflict' }),
        })
      );
    });

    it('rejects missing token or bookingId', async () => {
      await expect(rejectBooking('', 'bk_1')).rejects.toThrow('Authentication token is required.');
      await expect(rejectBooking('token', '')).rejects.toThrow('Booking ID is required to reject.');
    });
  });

  describe('getBookingMessages', () => {
    it('retrieves messages in chronological order', async () => {
      const mockMessages = [
        {
          _id: 'msg_1',
          bookingId: 'bk_1',
          senderId: 'u1',
          senderRole: 'parent',
          senderName: 'Sarah',
          text: 'Are you on your way?',
          createdAt: '2026-10-27T10:00:00Z',
        },
        {
          _id: 'msg_2',
          bookingId: 'bk_1',
          senderId: 'c1',
          senderRole: 'coach',
          senderName: 'Maya',
          text: 'I’m on my way.',
          createdAt: '2026-10-27T10:01:00Z',
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ messages: mockMessages }),
      });

      const res = await getBookingMessages('token', 'bk_1');
      expect(res).toEqual(mockMessages);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/bookings/bk_1/messages',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
          }),
        })
      );
    });

    it('throws error when server responds with 403 Forbidden', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Access forbidden. You are not an authorized participant in this booking.' }),
      });

      await expect(getBookingMessages('token', 'bk_1')).rejects.toThrow(
        'Access forbidden. You are not an authorized participant in this booking.'
      );
    });
  });

  describe('sendBookingMessage', () => {
    it('sends message text and returns created message document', async () => {
      const mockCreated = {
        _id: 'msg_new',
        bookingId: 'bk_1',
        senderId: 'u1',
        senderRole: 'individual',
        senderName: 'Alex',
        text: 'I’ve arrived.',
        createdAt: '2026-10-27T10:05:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: mockCreated }),
      });

      const res = await sendBookingMessage('token', 'bk_1', 'I’ve arrived.');
      expect(res).toEqual(mockCreated);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/bookings/bk_1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ text: 'I’ve arrived.' }),
        })
      );
    });

    it('validates empty message or exceeding 1000 characters before sending', async () => {
      await expect(sendBookingMessage('token', 'bk_1', '')).rejects.toThrow(
        'Message text cannot be empty.'
      );
      await expect(sendBookingMessage('token', 'bk_1', '   ')).rejects.toThrow(
        'Message text cannot be empty.'
      );
      await expect(sendBookingMessage('token', 'bk_1', 'a'.repeat(1001))).rejects.toThrow(
        'Message text cannot exceed 1000 characters.'
      );
    });
  });

  describe('Asia/Kolkata Date and Calendar Helpers', () => {
    describe('getKolkataDateString', () => {
      it('calculates the exact calendar date across the UTC / Asia/Kolkata boundary', () => {
        // 2026-10-29T18:29:59.000Z in UTC is 2026-10-29T23:59:59 in Asia/Kolkata (+5:30)
        const beforeMidnight = new Date('2026-10-29T18:29:59.000Z');
        expect(getKolkataDateString(beforeMidnight)).toBe('2026-10-29');

        // 2026-10-29T18:30:00.000Z in UTC is 2026-10-30T00:00:00 in Asia/Kolkata (+5:30)
        const atMidnight = new Date('2026-10-29T18:30:00.000Z');
        expect(getKolkataDateString(atMidnight)).toBe('2026-10-30');
      });

      it('handles month-end transitions accurately in Asia/Kolkata', () => {
        // 2026-10-31T18:30:00.000Z in UTC transitions to 2026-11-01 in Kolkata
        const monthEnd = new Date('2026-10-31T18:30:00.000Z');
        expect(getKolkataDateString(monthEnd)).toBe('2026-11-01');
      });

      it('handles year-end transitions accurately in Asia/Kolkata', () => {
        // 2026-12-31T18:30:00.000Z in UTC transitions to 2027-01-01 in Kolkata
        const yearEnd = new Date('2026-12-31T18:30:00.000Z');
        expect(getKolkataDateString(yearEnd)).toBe('2027-01-01');
      });
    });

    describe('getKolkataTomorrowDateString', () => {
      it('calculates tomorrow for standard dates in Asia/Kolkata', () => {
        const midDay = new Date('2026-06-15T06:30:00.000Z'); // 12:00 in Kolkata
        expect(getKolkataTomorrowDateString(midDay)).toBe('2026-06-16');
      });

      it('calculates tomorrow across month-end boundary', () => {
        const oct31 = new Date('2026-10-31T06:30:00.000Z');
        expect(getKolkataTomorrowDateString(oct31)).toBe('2026-11-01');
      });

      it('calculates tomorrow across year-end boundary', () => {
        const dec31 = new Date('2026-12-31T06:30:00.000Z');
        expect(getKolkataTomorrowDateString(dec31)).toBe('2027-01-01');
      });

      it('calculates tomorrow across leap year February', () => {
        const leapFeb28 = new Date('2024-02-28T06:30:00.000Z');
        expect(getKolkataTomorrowDateString(leapFeb28)).toBe('2024-02-29');

        const nonLeapFeb28 = new Date('2026-02-28T06:30:00.000Z');
        expect(getKolkataTomorrowDateString(nonLeapFeb28)).toBe('2026-03-01');
      });
    });

    describe('isValidCalendarDate', () => {
      it('accepts valid calendar dates', () => {
        expect(isValidCalendarDate('2026-10-30')).toBe(true);
        expect(isValidCalendarDate('2024-02-29')).toBe(true);
      });

      it('rejects impossible dates and invalid formats', () => {
        expect(isValidCalendarDate('2026-02-31')).toBe(false);
        expect(isValidCalendarDate('2026-04-31')).toBe(false);
        expect(isValidCalendarDate('not-a-date')).toBe(false);
        expect(isValidCalendarDate('')).toBe(false);
      });
    });
  });
});

