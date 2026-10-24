import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCoachProfile,
  updateCoachProfile,
  CoachProfile,
  CoachProfileResponse,
  UpdateCoachProfileInput,
  AuthApiError,
} from '../coachApi';

describe('CoachApi Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockPopulatedProfile: CoachProfile = {
    _id: 'coach_profile_123',
    userId: 'user_coach_789',
    bio: 'Certified martial arts instructor with 10 years experience.',
    disciplines: ['boxing', 'kickboxing'],
    specialties: ['Footwork', 'Endurance'],
    sessionFormats: ['one_on_one', 'small_group'],
    venueTypes: ['coach_home', 'ground'],
    hourlyRate: 1500,
    currency: 'INR',
    locations: ['Bandra West, Mumbai', 'Khar, Mumbai'],
    isPublished: true,
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T01:00:00.000Z',
  };

  describe('getCoachProfile', () => {
    it('rejects immediately when token is empty or whitespace without network call', async () => {
      global.fetch = vi.fn();

      await expect(getCoachProfile('')).rejects.toThrow(
        'Authentication required. Missing token.'
      );
      await expect(getCoachProfile('   ')).rejects.toThrow(
        'Authentication required. Missing token.'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('uses correct endpoint, GET method, and Bearer authorization header', async () => {
      const mockResponse: CoachProfileResponse = {
        profile: mockPopulatedProfile,
        isComplete: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      const result = await getCoachProfile('valid_coach_jwt_token');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/api/coach/profile/me');
      expect(options.method).toBe('GET');
      expect(options.headers['Authorization']).toBe('Bearer valid_coach_jwt_token');
      expect(options.headers['Accept']).toBe('application/json');
      expect(result).toEqual(mockResponse);
    });

    it('parses a populated profile correctly with all fields and isComplete: true', async () => {
      const mockResponse: CoachProfileResponse = {
        profile: mockPopulatedProfile,
        isComplete: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      const response = await getCoachProfile('valid_token');

      expect(response.profile).not.toBeNull();
      expect(response.profile?._id).toBe('coach_profile_123');
      expect(response.profile?.userId).toBe('user_coach_789');
      expect(response.profile?.bio).toBe('Certified martial arts instructor with 10 years experience.');
      expect(response.profile?.disciplines).toEqual(['boxing', 'kickboxing']);
      expect(response.profile?.specialties).toEqual(['Footwork', 'Endurance']);
      expect(response.profile?.sessionFormats).toEqual(['one_on_one', 'small_group']);
      expect(response.profile?.venueTypes).toEqual(['coach_home', 'ground']);
      expect(response.profile?.hourlyRate).toBe(1500);
      expect(response.profile?.currency).toBe('INR');
      expect(response.profile?.locations).toEqual(['Bandra West, Mumbai', 'Khar, Mumbai']);
      expect(response.profile?.isPublished).toBe(true);
      expect(response.isComplete).toBe(true);
    });

    it('handles a null profile when coach has not yet saved a profile', async () => {
      const mockResponse: CoachProfileResponse = {
        profile: null,
        isComplete: false,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      const response = await getCoachProfile('valid_token');

      expect(response.profile).toBeNull();
      expect(response.isComplete).toBe(false);
    });
  });

  describe('updateCoachProfile', () => {
    it('rejects immediately when token is empty or whitespace without network call', async () => {
      global.fetch = vi.fn();

      await expect(
        updateCoachProfile('', { bio: 'Test bio' })
      ).rejects.toThrow('Authentication required. Missing token.');
      await expect(
        updateCoachProfile('   ', { bio: 'Test bio' })
      ).rejects.toThrow('Authentication required. Missing token.');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects when input is not an object', async () => {
      global.fetch = vi.fn();

      await expect(
        updateCoachProfile('valid_token', null as any)
      ).rejects.toThrow('Invalid profile update data. Expected an object.');
      await expect(
        updateCoachProfile('valid_token', [] as any)
      ).rejects.toThrow('Invalid profile update data. Expected an object.');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('uses correct endpoint, PUT method, headers, and full JSON payload', async () => {
      const input: UpdateCoachProfileInput = {
        bio: 'Dedicated wushu master and trainer.',
        disciplines: ['wushu'],
        specialties: ['Forms', 'Taolu'],
        sessionFormats: ['one_on_one'],
        venueTypes: ['ground'],
        hourlyRate: 2000,
        locations: ['Andheri Sports Complex'],
      };

      const mockResponse: CoachProfileResponse = {
        profile: {
          ...mockPopulatedProfile,
          ...input,
          disciplines: ['wushu'],
          specialties: ['Forms', 'Taolu'],
          sessionFormats: ['one_on_one'],
          venueTypes: ['ground'],
          hourlyRate: 2000,
          locations: ['Andheri Sports Complex'],
        },
        isComplete: true,
        message: 'Coach profile saved successfully.',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      const result = await updateCoachProfile('valid_coach_jwt_token', input);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/api/coach/profile/me');
      expect(options.method).toBe('PUT');
      expect(options.headers['Authorization']).toBe('Bearer valid_coach_jwt_token');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Accept']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual(input);
      expect(result).toEqual(mockResponse);
    });

    it('supports partial updates without injecting defaults or omitted fields', async () => {
      const partialInput: UpdateCoachProfileInput = {
        bio: 'Just updating my bio.',
      };

      const mockResponse: CoachProfileResponse = {
        profile: {
          ...mockPopulatedProfile,
          bio: 'Just updating my bio.',
        },
        isComplete: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      await updateCoachProfile('valid_token', partialInput);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [, options] = (global.fetch as any).mock.calls[0];
      const parsedBody = JSON.parse(options.body);

      // Only supplied fields must be present in serialized payload
      expect(parsedBody).toEqual({ bio: 'Just updating my bio.' });
      expect(parsedBody.disciplines).toBeUndefined();
      expect(parsedBody.specialties).toBeUndefined();
      expect(parsedBody.sessionFormats).toBeUndefined();
      expect(parsedBody.venueTypes).toBeUndefined();
      expect(parsedBody.hourlyRate).toBeUndefined();
      expect(parsedBody.locations).toBeUndefined();
    });

    it('strictly filters out server-controlled or injected fields from the request payload', async () => {
      const maliciousInput = {
        bio: 'Legitimate bio update',
        hourlyRate: 1200,
        userId: 'attacker_controlled_id',
        currency: 'USD',
        isPublished: true,
        isVerified: true,
        adminNotes: 'elevated',
      } as unknown as UpdateCoachProfileInput;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: mockPopulatedProfile,
          isComplete: true,
        }),
      });

      await updateCoachProfile('valid_token', maliciousInput);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [, options] = (global.fetch as any).mock.calls[0];
      const parsedBody = JSON.parse(options.body);

      expect(parsedBody).toEqual({
        bio: 'Legitimate bio update',
        hourlyRate: 1200,
      });
      expect(parsedBody.userId).toBeUndefined();
      expect(parsedBody.currency).toBeUndefined();
      expect(parsedBody.isPublished).toBeUndefined();
      expect(parsedBody.isVerified).toBeUndefined();
      expect(parsedBody.adminNotes).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('surfaces backend 400 validation error message correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'Hourly rate must be between ₹100 and ₹20000.',
        }),
      });

      await expect(
        updateCoachProfile('token', { hourlyRate: 50 })
      ).rejects.toThrow('Hourly rate must be between ₹100 and ₹20000.');

      try {
        await updateCoachProfile('token', { hourlyRate: 50 });
      } catch (err) {
        expect(err).toBeInstanceOf(AuthApiError);
        expect((err as AuthApiError).statusCode).toBe(400);
      }
    });

    it('surfaces backend 401 authentication error message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'Token has expired. Please log in again.',
        }),
      });

      await expect(getCoachProfile('expired_token')).rejects.toThrow(
        'Token has expired. Please log in again.'
      );
    });

    it('falls back to standard message on non-JSON 403 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: async () => {
          throw new Error('Not JSON');
        },
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Access denied. Coach privileges required.'
      );
    });

    it('falls back to standard message on non-JSON 500 server error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'text/html' }),
        json: async () => {
          throw new Error('Internal Server Error HTML');
        },
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Server error. Please try again later.'
      );
    });

    it('surfaces network failures with clear connectivity error message', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unable to connect to AthleteConnect servers. Please check your internet connection.'
      );

      await expect(
        updateCoachProfile('token', { bio: 'Bio' })
      ).rejects.toThrow(
        'Unable to connect to AthleteConnect servers. Please check your internet connection.'
      );
    });

    it('safely handles malformed JSON in HTTP 200 response without returning false success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Invalid response from server. Malformed JSON.'
      );
      await expect(
        updateCoachProfile('token', { bio: 'Bio' })
      ).rejects.toThrow('Invalid response from server. Malformed JSON.');
    });

    it('safely rejects unexpected response shapes without returning false success', async () => {
      // Missing isComplete
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ profile: mockPopulatedProfile }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );

      // Profile is not an object or null (e.g., a string)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ profile: 'not_a_profile', isComplete: true }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );

      // Root payload is an array or primitive
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ['unexpected', 'array'],
      });

      await expect(
        updateCoachProfile('token', { bio: 'Bio' })
      ).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

    it('ensures a failed response never appears as a successful save', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Database connection failed' }),
      });

      let returnedResult: CoachProfileResponse | undefined;
      let errorThrown: any;

      try {
        returnedResult = await updateCoachProfile('token', { bio: 'New bio' });
      } catch (err) {
        errorThrown = err;
      }

      expect(returnedResult).toBeUndefined();
      expect(errorThrown).toBeInstanceOf(AuthApiError);
      expect(errorThrown.message).toBe('Database connection failed');
      expect(errorThrown.statusCode).toBe(500);
    });
  });

  describe('Response validation and contract enforcement', () => {
    it('accepts a valid incomplete profile (draft save with isComplete: false and empty collections)', async () => {
      const incompleteProfile: CoachProfile = {
        _id: 'coach_profile_incomplete_1',
        userId: 'user_coach_incomplete_1',
        bio: '',
        disciplines: [],
        specialties: [],
        sessionFormats: [],
        venueTypes: [],
        currency: 'INR',
        locations: [],
        isPublished: false,
        createdAt: '2026-10-25T00:00:00.000Z',
        updatedAt: '2026-10-25T00:00:00.000Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: incompleteProfile,
          isComplete: false,
        }),
      });

      const result = await getCoachProfile('valid_token');
      expect(result.profile).toEqual(incompleteProfile);
      expect(result.isComplete).toBe(false);
    });

    it('rejects profiles with invalid discipline enum values', async () => {
      const invalidProfile = {
        ...mockPopulatedProfile,
        disciplines: ['boxing', 'judo'], // judo is not an allowed discipline
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: invalidProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

    it('rejects profiles with invalid session format enum values', async () => {
      const invalidProfile = {
        ...mockPopulatedProfile,
        sessionFormats: ['large_group'], // not an allowed session format
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: invalidProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

    it('rejects profiles with invalid venue type enum values', async () => {
      const invalidProfile = {
        ...mockPopulatedProfile,
        venueTypes: ['stadium'], // not an allowed venue type
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: invalidProfile,
          isComplete: true,
        }),
      });

      await expect(
        updateCoachProfile('token', { bio: 'Bio' })
      ).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

    it('rejects profiles with incorrectly typed numeric hourlyRate (e.g. string or NaN)', async () => {
      const stringRateProfile = {
        ...mockPopulatedProfile,
        hourlyRate: '1500', // string instead of number
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: stringRateProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );

      const nanRateProfile = {
        ...mockPopulatedProfile,
        hourlyRate: NaN,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: nanRateProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

    it('rejects profiles with incorrectly typed isPublished or currency', async () => {
      const stringPublishedProfile = {
        ...mockPopulatedProfile,
        isPublished: 'true', // string instead of boolean
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: stringPublishedProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );

      const numberCurrencyProfile = {
        ...mockPopulatedProfile,
        currency: 356, // number instead of string
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: numberCurrencyProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

    it('rejects profiles with non-string elements in specialties or locations', async () => {
      const badSpecialtiesProfile = {
        ...mockPopulatedProfile,
        specialties: ['Footwork', 12345], // non-string element
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: badSpecialtiesProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );

      const badLocationsProfile = {
        ...mockPopulatedProfile,
        locations: ['Mumbai', null], // null element
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: badLocationsProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

    it('rejects profiles with non-string bio or timestamp types', async () => {
      const badBioProfile = {
        ...mockPopulatedProfile,
        bio: 9999,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: badBioProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );

      const badTimestampProfile = {
        ...mockPopulatedProfile,
        createdAt: 1729814400000,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: badTimestampProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

    it('rejects malformed populated profiles missing mandatory _id or userId', async () => {
      const missingIdProfile = {
        ...mockPopulatedProfile,
        _id: '',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: missingIdProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );

      const missingUserIdProfile = {
        ...mockPopulatedProfile,
        userId: '   ',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: missingUserIdProfile,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

    it('rejects { profile: null, isComplete: true } with AuthApiError while accepting { profile: null, isComplete: false }', async () => {
      // Valid null profile with isComplete: false
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: null,
          isComplete: false,
        }),
      });

      const validResult = await getCoachProfile('valid_token');
      expect(validResult.profile).toBeNull();
      expect(validResult.isComplete).toBe(false);

      // Inconsistent contract: a null profile must never be reported as complete
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          profile: null,
          isComplete: true,
        }),
      });

      await expect(getCoachProfile('valid_token')).rejects.toThrow(AuthApiError);
      await expect(getCoachProfile('valid_token')).rejects.toThrow(
        'Unexpected response shape received from coach profile service.'
      );
    });

  });
});
