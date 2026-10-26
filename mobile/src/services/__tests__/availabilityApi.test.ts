import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCoachAvailability,
  updateCoachAvailability,
  CoachAvailability,
  CoachAvailabilityResponse,
  UpdateCoachAvailabilityInput,
  isValidCoachAvailabilityResponse,
  isValidSlot,
  areValidSlots,
  areValidUnavailableDates,
  isValidCalendarDate,
  timeToMinutes,
  AuthApiError,
  DAYS_OF_WEEK,
  DEFAULT_TIMEZONE,
  MIN_SLOT_DURATION_MINUTES,
  MAX_SLOTS_PER_DAY,
  MAX_TOTAL_SLOTS,
  MAX_UNAVAILABLE_DATES,
} from '../availabilityApi';

describe('AvailabilityApi Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockConfiguredAvailability: CoachAvailability = {
    _id: 'avail_doc_001',
    userId: 'user_coach_123',
    timezone: 'Asia/Kolkata',
    slots: [
      { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
      { dayOfWeek: 'monday', startTime: '16:00', endTime: '19:00' },
      { dayOfWeek: 'wednesday', startTime: '10:00', endTime: '14:00' },
      { dayOfWeek: 'saturday', startTime: '08:00', endTime: '11:00' },
    ],
    unavailableDates: ['2026-11-08', '2026-12-25'],
    createdAt: '2026-10-26T10:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
  };

  // ---------------------------------------------------------------------------
  // 1. getCoachAvailability Tests
  // ---------------------------------------------------------------------------
  describe('getCoachAvailability', () => {
    it('rejects immediately when token is empty or whitespace without network call', async () => {
      global.fetch = vi.fn();

      await expect(getCoachAvailability('')).rejects.toThrow(
        'Authentication required. Missing token.'
      );
      await expect(getCoachAvailability('   ')).rejects.toThrow(
        'Authentication required. Missing token.'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends GET request to correct endpoint with Bearer authorization and Accept headers', async () => {
      const mockResponse: CoachAvailabilityResponse = {
        availability: mockConfiguredAvailability,
        isConfigured: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      const result = await getCoachAvailability('test_coach_token');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/api/coach/availability/me');
      expect(options.method).toBe('GET');
      expect(options.headers['Authorization']).toBe('Bearer test_coach_token');
      expect(options.headers['Accept']).toBe('application/json');
      expect(result).toEqual(mockResponse);
    });

    it('parses a valid unconfigured response (availability: null, isConfigured: false)', async () => {
      const mockUnconfigured: CoachAvailabilityResponse = {
        availability: null,
        isConfigured: false,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockUnconfigured,
      });

      const result = await getCoachAvailability('test_coach_token');

      expect(result.availability).toBeNull();
      expect(result.isConfigured).toBe(false);
    });

    it('parses a valid configured schedule with all slots, timezone, and blackout dates', async () => {
      const mockResponse: CoachAvailabilityResponse = {
        availability: mockConfiguredAvailability,
        isConfigured: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      const result = await getCoachAvailability('test_coach_token');

      expect(result.isConfigured).toBe(true);
      expect(result.availability).not.toBeNull();
      expect(result.availability?._id).toBe('avail_doc_001');
      expect(result.availability?.userId).toBe('user_coach_123');
      expect(result.availability?.timezone).toBe('Asia/Kolkata');
      expect(result.availability?.slots).toHaveLength(4);
      expect(result.availability?.slots[0]).toEqual({
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '12:00',
      });
      expect(result.availability?.unavailableDates).toEqual(['2026-11-08', '2026-12-25']);
      expect(result.availability?.createdAt).toBe('2026-10-26T10:00:00.000Z');
      expect(result.availability?.updatedAt).toBe('2026-10-26T12:00:00.000Z');
    });

    it('parses a deliberately empty schedule (slots: []) with isConfigured: true', async () => {
      const mockEmptyConfigured: CoachAvailabilityResponse = {
        availability: {
          _id: 'avail_empty',
          userId: 'user_coach_123',
          timezone: 'Asia/Kolkata',
          slots: [],
          unavailableDates: [],
        },
        isConfigured: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockEmptyConfigured,
      });

      const result = await getCoachAvailability('test_coach_token');

      expect(result.isConfigured).toBe(true);
      expect(result.availability?.slots).toEqual([]);
      expect(result.availability?.unavailableDates).toEqual([]);
    });

    it('throws AuthApiError with status code 401 on authentication failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Authentication required. Token is empty.' }),
      });

      await expect(getCoachAvailability('expired_or_invalid_token')).rejects.toThrow(
        'Authentication required. Token is empty.'
      );
    });

    it('throws AuthApiError with status code 403 when access is denied (non-coach role)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Access forbidden. Required role: coach.' }),
      });

      await expect(getCoachAvailability('parent_or_individual_token')).rejects.toThrow(
        'Access forbidden. Required role: coach.'
      );
    });

    it('handles network disconnects with AuthApiError code 0', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

      await expect(getCoachAvailability('token')).rejects.toThrow(
        'Unable to connect to AthleteConnect servers. Please check your internet connection.'
      );
    });

    it('rejects malformed non-JSON responses with AuthApiError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        },
      });

      await expect(getCoachAvailability('token')).rejects.toThrow(
        'Invalid response from server. Malformed JSON.'
      );
    });

    it('rejects unexpected response envelopes that violate schema', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ randomField: 12345 }),
      });

      await expect(getCoachAvailability('token')).rejects.toThrow(
        'Unexpected response shape received from coach availability service.'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. updateCoachAvailability Tests
  // ---------------------------------------------------------------------------
  describe('updateCoachAvailability', () => {
    const validUpdateInput: UpdateCoachAvailabilityInput = {
      timezone: 'Asia/Kolkata',
      slots: [
        { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
        { dayOfWeek: 'friday', startTime: '14:00', endTime: '18:00' },
      ],
      unavailableDates: ['2026-11-08'],
    };

    it('rejects immediately when token is empty or whitespace without network call', async () => {
      global.fetch = vi.fn();

      await expect(updateCoachAvailability('', validUpdateInput)).rejects.toThrow(
        'Authentication required. Missing token.'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects when input is not an object or slots is not an array without network call', async () => {
      global.fetch = vi.fn();

      await expect(
        updateCoachAvailability('token', null as any)
      ).rejects.toThrow('Invalid availability update data. Expected an object.');

      await expect(
        updateCoachAvailability('token', [] as any)
      ).rejects.toThrow('Invalid availability update data. Expected an object.');

      await expect(
        updateCoachAvailability('token', { timezone: 'Asia/Kolkata' } as any)
      ).rejects.toThrow('Invalid availability update data. slots array is required.');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends PUT to correct endpoint with Bearer auth, Content-Type, and Accept headers', async () => {
      const mockSavedResponse: CoachAvailabilityResponse = {
        availability: mockConfiguredAvailability,
        isConfigured: true,
        message: 'Availability schedule saved successfully.',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockSavedResponse,
      });

      const result = await updateCoachAvailability('valid_coach_token', validUpdateInput);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/api/coach/availability/me');
      expect(options.method).toBe('PUT');
      expect(options.headers['Authorization']).toBe('Bearer valid_coach_token');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Accept']).toBe('application/json');
      expect(result).toEqual(mockSavedResponse);
    });

    it('serializes all permitted fields when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          availability: mockConfiguredAvailability,
          isConfigured: true,
        }),
      });

      await updateCoachAvailability('token', validUpdateInput);

      const [, options] = (global.fetch as any).mock.calls[0];
      const parsedBody = JSON.parse(options.body);

      expect(parsedBody).toEqual({
        slots: validUpdateInput.slots,
        timezone: 'Asia/Kolkata',
        unavailableDates: ['2026-11-08'],
      });
    });

    it('omits timezone and unavailableDates when not specified in input', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          availability: mockConfiguredAvailability,
          isConfigured: true,
        }),
      });

      const minimalInput: UpdateCoachAvailabilityInput = {
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
      };

      await updateCoachAvailability('token', minimalInput);

      const [, options] = (global.fetch as any).mock.calls[0];
      const parsedBody = JSON.parse(options.body);

      expect(parsedBody).toHaveProperty('slots');
      expect(parsedBody).not.toHaveProperty('timezone');
      expect(parsedBody).not.toHaveProperty('unavailableDates');
    });

    it('preserves ability to explicitly send unavailableDates: [] to clear blackout dates', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          availability: {
            ...mockConfiguredAvailability,
            unavailableDates: [],
          },
          isConfigured: true,
        }),
      });

      const clearDatesInput: UpdateCoachAvailabilityInput = {
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
        unavailableDates: [],
      };

      await updateCoachAvailability('token', clearDatesInput);

      const [, options] = (global.fetch as any).mock.calls[0];
      const parsedBody = JSON.parse(options.body);

      expect(parsedBody).toHaveProperty('unavailableDates');
      expect(parsedBody.unavailableDates).toEqual([]);
    });

    it('strictly filters out injected server-controlled properties from request payload', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          availability: mockConfiguredAvailability,
          isConfigured: true,
        }),
      });

      const maliciousOrPollutedInput: any = {
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
        userId: 'attacker_specified_user_id',
        _id: 'injected_document_id',
        isConfigured: true,
        createdAt: '1970-01-01',
        updatedAt: '1970-01-01',
        injectedRole: 'admin',
      };

      await updateCoachAvailability('token', maliciousOrPollutedInput);

      const [, options] = (global.fetch as any).mock.calls[0];
      const parsedBody = JSON.parse(options.body);

      expect(parsedBody.userId).toBeUndefined();
      expect(parsedBody._id).toBeUndefined();
      expect(parsedBody.isConfigured).toBeUndefined();
      expect(parsedBody.createdAt).toBeUndefined();
      expect(parsedBody.updatedAt).toBeUndefined();
      expect(parsedBody.injectedRole).toBeUndefined();
      expect(Object.keys(parsedBody)).toEqual(['slots']);
    });

    it('handles backend 400 validation error responses cleanly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'Overlapping slots detected for monday: 09:00–12:00 conflicts with 11:00–14:00.',
        }),
      });

      await expect(updateCoachAvailability('token', validUpdateInput)).rejects.toThrow(
        'Overlapping slots detected for monday: 09:00–12:00 conflicts with 11:00–14:00.'
      );
    });

    it('handles backend centralized structured error responses { success: false, error: { message } }', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid timezone identifier "Mars/Olympus".',
          },
        }),
      });

      await expect(updateCoachAvailability('token', validUpdateInput)).rejects.toThrow(
        'Invalid timezone identifier "Mars/Olympus".'
      );
    });

    it('handles network failures during update with AuthApiError code 0', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'));

      await expect(updateCoachAvailability('token', validUpdateInput)).rejects.toThrow(
        'Unable to connect to AthleteConnect servers. Please check your internet connection.'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Response Validator (isValidCoachAvailabilityResponse) Deep Edge Cases
  // ---------------------------------------------------------------------------
  describe('isValidCoachAvailabilityResponse', () => {
    it('accepts valid unconfigured response', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: null,
          isConfigured: false,
        })
      ).toBe(true);
    });

    it('accepts valid configured response with full details', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: mockConfiguredAvailability,
          isConfigured: true,
          message: 'Saved',
        })
      ).toBe(true);
    });

    it('rejects inconsistent availability: null with isConfigured: true', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: null,
          isConfigured: true,
        })
      ).toBe(false);
    });

    it('rejects inconsistent populated availability with isConfigured: false', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: mockConfiguredAvailability,
          isConfigured: false,
        })
      ).toBe(false);
    });

    it('rejects non-object responses (null, undefined, arrays, primitives)', () => {
      expect(isValidCoachAvailabilityResponse(null)).toBe(false);
      expect(isValidCoachAvailabilityResponse(undefined)).toBe(false);
      expect(isValidCoachAvailabilityResponse([])).toBe(false);
      expect(isValidCoachAvailabilityResponse('string')).toBe(false);
      expect(isValidCoachAvailabilityResponse(12345)).toBe(false);
    });

    it('rejects non-boolean isConfigured', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: null,
          isConfigured: 'false' as any,
        })
      ).toBe(false);
    });

    it('rejects non-string message when message is present', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: null,
          isConfigured: false,
          message: 12345 as any,
        })
      ).toBe(false);
    });

    it('rejects missing or empty _id or userId', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: { ...mockConfiguredAvailability, _id: '' },
          isConfigured: true,
        })
      ).toBe(false);

      expect(
        isValidCoachAvailabilityResponse({
          availability: { ...mockConfiguredAvailability, userId: '   ' },
          isConfigured: true,
        })
      ).toBe(false);
    });

    it('rejects invalid IANA timezone', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: { ...mockConfiguredAvailability, timezone: 'Invalid/Not_A_Timezone' },
          isConfigured: true,
        })
      ).toBe(false);
    });

    it('rejects invalid dayOfWeek in slots array', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: {
            ...mockConfiguredAvailability,
            slots: [{ dayOfWeek: 'funday' as any, startTime: '09:00', endTime: '12:00' }],
          },
          isConfigured: true,
        })
      ).toBe(false);
    });

    it('rejects invalid time string format in slots array', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: {
            ...mockConfiguredAvailability,
            slots: [{ dayOfWeek: 'monday', startTime: '9:00', endTime: '12:00' }],
          },
          isConfigured: true,
        })
      ).toBe(false);

      expect(
        isValidCoachAvailabilityResponse({
          availability: {
            ...mockConfiguredAvailability,
            slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '25:00' }],
          },
          isConfigured: true,
        })
      ).toBe(false);
    });

    it('rejects non-string array for unavailableDates', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: {
            ...mockConfiguredAvailability,
            unavailableDates: [123 as any],
          },
          isConfigured: true,
        })
      ).toBe(false);

      expect(
        isValidCoachAvailabilityResponse({
          availability: {
            ...mockConfiguredAvailability,
            unavailableDates: 'not-an-array' as any,
          },
          isConfigured: true,
        })
      ).toBe(false);
    });

    it('rejects non-string timestamp values when present', () => {
      expect(
        isValidCoachAvailabilityResponse({
          availability: {
            ...mockConfiguredAvailability,
            createdAt: 12345 as any,
          },
          isConfigured: true,
        })
      ).toBe(false);

      expect(
        isValidCoachAvailabilityResponse({
          availability: {
            ...mockConfiguredAvailability,
            updatedAt: false as any,
          },
          isConfigured: true,
        })
      ).toBe(false);
    });

    // -------------------------------------------------------------------------
    // Semantic Slot Rules Tests
    // -------------------------------------------------------------------------
    describe('Semantic slot validation rules', () => {
      it('rejects slots where endTime is equal to or earlier than startTime', () => {
        // Equal times
        expect(
          isValidSlot({ dayOfWeek: 'monday', startTime: '10:00', endTime: '10:00' })
        ).toBe(false);

        // Inverted times
        expect(
          isValidSlot({ dayOfWeek: 'monday', startTime: '15:00', endTime: '12:00' })
        ).toBe(false);

        // Entire response must be rejected
        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              slots: [{ dayOfWeek: 'monday', startTime: '15:00', endTime: '12:00' }],
            },
            isConfigured: true,
          })
        ).toBe(false);
      });

      it('rejects slots with duration shorter than 30 minutes', () => {
        // 25 minutes
        expect(
          isValidSlot({ dayOfWeek: 'monday', startTime: '09:00', endTime: '09:25' })
        ).toBe(false);

        // 10 minutes
        expect(
          isValidSlot({ dayOfWeek: 'monday', startTime: '10:00', endTime: '10:10' })
        ).toBe(false);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '09:20' }],
            },
            isConfigured: true,
          })
        ).toBe(false);
      });

      it('accepts slots of exactly 30 minutes duration', () => {
        expect(
          isValidSlot({ dayOfWeek: 'monday', startTime: '09:00', endTime: '09:30' })
        ).toBe(true);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '09:30' }],
            },
            isConfigured: true,
          })
        ).toBe(true);
      });

      it('rejects overlapping slots on the same weekday (sorted input)', () => {
        const overlappingSlots = [
          { dayOfWeek: 'monday' as const, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 'monday' as const, startTime: '11:00', endTime: '14:00' },
        ];

        expect(areValidSlots(overlappingSlots)).toBe(false);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              slots: overlappingSlots,
            },
            isConfigured: true,
          })
        ).toBe(false);
      });

      it('rejects overlapping slots on the same weekday when input is unsorted', () => {
        const unsortedOverlapping = [
          { dayOfWeek: 'tuesday' as const, startTime: '14:00', endTime: '17:00' },
          { dayOfWeek: 'tuesday' as const, startTime: '13:00', endTime: '15:00' },
        ];

        expect(areValidSlots(unsortedOverlapping)).toBe(false);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              slots: unsortedOverlapping,
            },
            isConfigured: true,
          })
        ).toBe(false);
      });

      it('accepts adjacent boundary-meeting slots on the same weekday', () => {
        const adjacentSlots = [
          { dayOfWeek: 'friday' as const, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 'friday' as const, startTime: '12:00', endTime: '15:00' },
        ];

        expect(areValidSlots(adjacentSlots)).toBe(true);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              slots: adjacentSlots,
            },
            isConfigured: true,
          })
        ).toBe(true);
      });

      it('accepts identical time intervals on different days without conflict', () => {
        const multiDaySlots = [
          { dayOfWeek: 'monday' as const, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 'tuesday' as const, startTime: '09:00', endTime: '12:00' },
        ];

        expect(areValidSlots(multiDaySlots)).toBe(true);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              slots: multiDaySlots,
            },
            isConfigured: true,
          })
        ).toBe(true);
      });

      it(`rejects more than ${MAX_SLOTS_PER_DAY} slots on the same day`, () => {
        const fiveSlotsOnMonday = [
          { dayOfWeek: 'monday' as const, startTime: '08:00', endTime: '09:00' },
          { dayOfWeek: 'monday' as const, startTime: '10:00', endTime: '11:00' },
          { dayOfWeek: 'monday' as const, startTime: '12:00', endTime: '13:00' },
          { dayOfWeek: 'monday' as const, startTime: '14:00', endTime: '15:00' },
          { dayOfWeek: 'monday' as const, startTime: '16:00', endTime: '17:00' },
        ];

        expect(areValidSlots(fiveSlotsOnMonday)).toBe(false);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              slots: fiveSlotsOnMonday,
            },
            isConfigured: true,
          })
        ).toBe(false);
      });

      it(`rejects more than ${MAX_TOTAL_SLOTS} slots across the entire week`, () => {
        const tooManySlots: any[] = [];
        for (let i = 0; i < 29; i++) {
          const day = DAYS_OF_WEEK[i % 7];
          tooManySlots.push({ dayOfWeek: day, startTime: '08:00', endTime: '09:00' });
        }

        expect(areValidSlots(tooManySlots)).toBe(false);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              slots: tooManySlots,
            },
            isConfigured: true,
          })
        ).toBe(false);
      });
    });

    // -------------------------------------------------------------------------
    // Semantic Unavailable Dates Rules Tests
    // -------------------------------------------------------------------------
    describe('Semantic unavailable dates validation rules', () => {
      it('validates real calendar dates correctly', () => {
        expect(isValidCalendarDate('2026-02-28')).toBe(true);
        expect(isValidCalendarDate('2026-04-30')).toBe(true);
        expect(isValidCalendarDate('2024-02-29')).toBe(true); // Leap year
      });

      it('validates four-digit years between 0001 and 0099 without Date.UTC offset rejection', () => {
        expect(isValidCalendarDate('0001-01-01')).toBe(true);
        expect(isValidCalendarDate('0099-12-31')).toBe(true);
        expect(isValidCalendarDate('0024-02-29')).toBe(true); // Leap year in year 24
        expect(isValidCalendarDate('0025-02-29')).toBe(false); // Non-leap year

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              unavailableDates: ['0001-01-01', '0099-12-31'],
            },
            isConfigured: true,
          })
        ).toBe(true);
      });

      it('rejects impossible calendar dates', () => {
        expect(isValidCalendarDate('2026-02-29')).toBe(false); // 2026 is not leap year
        expect(isValidCalendarDate('2026-02-30')).toBe(false);
        expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
        expect(isValidCalendarDate('2026-13-01')).toBe(false); // Invalid month
        expect(isValidCalendarDate('invalid-format')).toBe(false);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              unavailableDates: ['2026-02-29'],
            },
            isConfigured: true,
          })
        ).toBe(false);
      });

      it('rejects duplicate unavailable dates', () => {
        expect(areValidUnavailableDates(['2026-11-08', '2026-11-08'])).toBe(false);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              unavailableDates: ['2026-11-08', '2026-11-08'],
            },
            isConfigured: true,
          })
        ).toBe(false);
      });

      it(`rejects more than ${MAX_UNAVAILABLE_DATES} unavailable dates`, () => {
        const thirtyOneDates: string[] = [];
        for (let i = 1; i <= 31; i++) {
          thirtyOneDates.push(`2026-01-${String(i).padStart(2, '0')}`);
        }

        expect(areValidUnavailableDates(thirtyOneDates)).toBe(false);

        expect(
          isValidCoachAvailabilityResponse({
            availability: {
              ...mockConfiguredAvailability,
              unavailableDates: thirtyOneDates,
            },
            isConfigured: true,
          })
        ).toBe(false);
      });
    });

    // -------------------------------------------------------------------------
    // Integration Failure Handling with Semantic Violations
    // -------------------------------------------------------------------------
    describe('Integration failure handling on semantic rule violations', () => {
      it('throws AuthApiError when getCoachAvailability receives overlapping slots from server', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            availability: {
              ...mockConfiguredAvailability,
              slots: [
                { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
                { dayOfWeek: 'monday', startTime: '11:00', endTime: '14:00' },
              ],
            },
            isConfigured: true,
          }),
        });

        await expect(getCoachAvailability('token')).rejects.toThrow(
          'Unexpected response shape received from coach availability service.'
        );
      });

      it('throws AuthApiError when getCoachAvailability receives inverted slot times from server', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            availability: {
              ...mockConfiguredAvailability,
              slots: [{ dayOfWeek: 'monday', startTime: '14:00', endTime: '10:00' }],
            },
            isConfigured: true,
          }),
        });

        await expect(getCoachAvailability('token')).rejects.toThrow(
          'Unexpected response shape received from coach availability service.'
        );
      });

      it('throws AuthApiError when getCoachAvailability receives non-existent calendar date from server', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            availability: {
              ...mockConfiguredAvailability,
              unavailableDates: ['2026-04-31'],
            },
            isConfigured: true,
          }),
        });

        await expect(getCoachAvailability('token')).rejects.toThrow(
          'Unexpected response shape received from coach availability service.'
        );
      });

      it('throws AuthApiError when updateCoachAvailability response violates semantic slot duration', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            availability: {
              ...mockConfiguredAvailability,
              slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '09:15' }],
            },
            isConfigured: true,
          }),
        });

        await expect(
          updateCoachAvailability('token', {
            slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
          })
        ).rejects.toThrow('Unexpected response shape received from coach availability service.');
      });
    });
  });
});
