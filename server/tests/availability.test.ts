import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import {
  CoachAvailability,
  DEFAULT_TIMEZONE,
  DAYS_OF_WEEK,
  MIN_SLOT_DURATION_MINUTES,
  MAX_SLOTS_PER_DAY,
  MAX_TOTAL_SLOTS,
  MAX_UNAVAILABLE_DATES,
  timeToMinutes,
  isValidTimezone,
  isValidCalendarDate,
  validateSlots,
  validateUnavailableDates,
  IAvailabilitySlot,
} from '../src/models/CoachAvailability';
import { signToken } from '../src/utils/jwt';

describe('Coach Availability Backend Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Model Schema & In-Memory Validation Tests
  // ---------------------------------------------------------------------------
  describe('CoachAvailability Model & Helper Validation (In-Memory)', () => {
    const validUserId = new mongoose.Types.ObjectId();

    const validSlots: IAvailabilitySlot[] = [
      { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
      { dayOfWeek: 'monday', startTime: '16:00', endTime: '19:00' },
      { dayOfWeek: 'wednesday', startTime: '10:00', endTime: '14:00' },
      { dayOfWeek: 'saturday', startTime: '08:00', endTime: '11:00' },
    ];

    it('validates a complete, compliant availability document successfully', () => {
      const doc = new CoachAvailability({
        userId: validUserId,
        timezone: 'Asia/Kolkata',
        slots: validSlots,
        unavailableDates: ['2026-11-08', '2026-12-25'],
      });

      const validationError = doc.validateSync();
      expect(validationError).toBeUndefined();
      expect(doc.timezone).toBe('Asia/Kolkata');
      expect(doc.slots).toHaveLength(4);
      expect(doc.unavailableDates).toHaveLength(2);
    });

    it('defaults timezone to Asia/Kolkata when omitted', () => {
      const doc = new CoachAvailability({
        userId: validUserId,
        slots: [],
      });
      expect(doc.timezone).toBe(DEFAULT_TIMEZONE);
    });

    it('allows a deliberately saved empty schedule (slots: [])', () => {
      const doc = new CoachAvailability({
        userId: validUserId,
        slots: [],
        unavailableDates: [],
      });
      expect(doc.validateSync()).toBeUndefined();
    });

    it('enforces required userId', () => {
      const doc = new CoachAvailability({
        slots: validSlots,
      });
      const error = doc.validateSync();
      expect(error?.errors.userId).toBeDefined();
    });

    // Timezone validation tests
    describe('Timezone validation', () => {
      it('accepts valid IANA timezones', () => {
        expect(isValidTimezone('Asia/Kolkata')).toBe(true);
        expect(isValidTimezone('UTC')).toBe(true);
        expect(isValidTimezone('America/New_York')).toBe(true);
        expect(isValidTimezone('Europe/London')).toBe(true);
      });

      it('rejects invalid or blank timezones', () => {
        expect(isValidTimezone('Invalid/Timezone')).toBe(false);
        expect(isValidTimezone('Mars/Olympus')).toBe(false);
        expect(isValidTimezone('')).toBe(false);
        expect(isValidTimezone('   ')).toBe(false);
        expect(isValidTimezone(null as any)).toBe(false);
      });

      it('fails Mongoose validation for invalid timezone', () => {
        const doc = new CoachAvailability({
          userId: validUserId,
          timezone: 'Not_A_Timezone',
          slots: [],
        });
        const error = doc.validateSync();
        expect(error?.errors.timezone).toBeDefined();
      });
    });

    // Time conversions
    describe('timeToMinutes', () => {
      it('converts HH:mm to minutes from midnight', () => {
        expect(timeToMinutes('00:00')).toBe(0);
        expect(timeToMinutes('01:30')).toBe(90);
        expect(timeToMinutes('09:00')).toBe(540);
        expect(timeToMinutes('12:15')).toBe(735);
        expect(timeToMinutes('23:59')).toBe(1439);
      });
    });

    // Slot validation helper tests
    describe('validateSlots', () => {
      it('validates a compliant slots array', () => {
        const result = validateSlots(validSlots);
        expect(result.valid).toBe(true);
      });

      it('rejects non-array slots', () => {
        const result = validateSlots('not-an-array' as any);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be an array');
      });

      it('rejects invalid dayOfWeek', () => {
        const result = validateSlots([
          { dayOfWeek: 'funday' as any, startTime: '09:00', endTime: '12:00' },
        ]);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid dayOfWeek "funday"');
      });

      it('rejects invalid startTime or endTime format', () => {
        const badStart = validateSlots([
          { dayOfWeek: 'monday', startTime: '9:00', endTime: '12:00' },
        ]);
        expect(badStart.valid).toBe(false);
        expect(badStart.error).toContain('Invalid startTime');

        const badEnd = validateSlots([
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:65' },
        ]);
        expect(badEnd.valid).toBe(false);
        expect(badEnd.error).toContain('Invalid endTime');
      });

      it('rejects inverted or equal time ranges (endTime <= startTime)', () => {
        const inverted = validateSlots([
          { dayOfWeek: 'monday', startTime: '14:00', endTime: '12:00' },
        ]);
        expect(inverted.valid).toBe(false);
        expect(inverted.error).toContain('strictly after start time');

        const equal = validateSlots([
          { dayOfWeek: 'monday', startTime: '10:00', endTime: '10:00' },
        ]);
        expect(equal.valid).toBe(false);
        expect(equal.error).toContain('strictly after start time');
      });

      it('rejects intervals shorter than 30 minutes', () => {
        const tooShort = validateSlots([
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '09:25' },
        ]);
        expect(tooShort.valid).toBe(false);
        expect(tooShort.error).toContain('at least 30 minutes');
      });

      it('accepts intervals of exactly 30 minutes', () => {
        const exactly30 = validateSlots([
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '09:30' },
        ]);
        expect(exactly30.valid).toBe(true);
      });

      it('rejects overlapping slots on the same day (sorted input)', () => {
        const overlapping = validateSlots([
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 'monday', startTime: '11:00', endTime: '14:00' },
        ]);
        expect(overlapping.valid).toBe(false);
        expect(overlapping.error).toContain('Overlapping slots detected for monday');
      });

      it('rejects overlapping slots on the same day when input is unsorted', () => {
        const unsortedOverlapping = validateSlots([
          { dayOfWeek: 'tuesday', startTime: '14:00', endTime: '17:00' },
          { dayOfWeek: 'tuesday', startTime: '13:00', endTime: '15:00' },
        ]);
        expect(unsortedOverlapping.valid).toBe(false);
        expect(unsortedOverlapping.error).toContain('Overlapping slots detected for tuesday');
      });

      it('allows adjacent non-overlapping slots meeting at boundary', () => {
        const adjacent = validateSlots([
          { dayOfWeek: 'friday', startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 'friday', startTime: '12:00', endTime: '15:00' },
        ]);
        expect(adjacent.valid).toBe(true);
      });

      it('allows matching times across different days without conflict', () => {
        const differentDays = validateSlots([
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '12:00' },
        ]);
        expect(differentDays.valid).toBe(true);
      });

      it(`enforces maximum ${MAX_SLOTS_PER_DAY} slots per day`, () => {
        const fiveSlotsOnMonday = validateSlots([
          { dayOfWeek: 'monday', startTime: '08:00', endTime: '09:00' },
          { dayOfWeek: 'monday', startTime: '10:00', endTime: '11:00' },
          { dayOfWeek: 'monday', startTime: '12:00', endTime: '13:00' },
          { dayOfWeek: 'monday', startTime: '14:00', endTime: '15:00' },
          { dayOfWeek: 'monday', startTime: '16:00', endTime: '17:00' },
        ]);
        expect(fiveSlotsOnMonday.valid).toBe(false);
        expect(fiveSlotsOnMonday.error).toContain(`Cannot exceed ${MAX_SLOTS_PER_DAY} slots on monday`);
      });

      it(`enforces maximum ${MAX_TOTAL_SLOTS} slots across the entire week`, () => {
        const slots: IAvailabilitySlot[] = [];
        // Create 29 slots (4 per day across 7 days = 28, plus 1 more)
        for (let i = 0; i < 29; i++) {
          const day = DAYS_OF_WEEK[i % 7];
          slots.push({ dayOfWeek: day, startTime: '08:00', endTime: '09:00' });
        }
        const result = validateSlots(slots);
        expect(result.valid).toBe(false);
        expect(result.error).toContain(`Total slots cannot exceed ${MAX_TOTAL_SLOTS}`);
      });
    });

    // Unavailable dates validation tests
    describe('validateUnavailableDates & isValidCalendarDate', () => {
      it('validates real calendar dates correctly', () => {
        expect(isValidCalendarDate('2026-02-28')).toBe(true);
        expect(isValidCalendarDate('2026-04-30')).toBe(true);
        expect(isValidCalendarDate('2026-12-31')).toBe(true);
        expect(isValidCalendarDate('2024-02-29')).toBe(true); // 2024 is leap year
      });

      it('rejects impossible calendar dates', () => {
        expect(isValidCalendarDate('2026-02-29')).toBe(false); // 2026 is not a leap year
        expect(isValidCalendarDate('2026-02-30')).toBe(false);
        expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
        expect(isValidCalendarDate('2026-13-01')).toBe(false); // Month 13
        expect(isValidCalendarDate('2026-00-10')).toBe(false); // Month 0
        expect(isValidCalendarDate('not-a-date')).toBe(false);
      });

      it('accepts valid, non-duplicate unavailable dates list', () => {
        const result = validateUnavailableDates(['2026-11-08', '2026-11-15']);
        expect(result.valid).toBe(true);
      });

      it('rejects duplicate unavailable dates', () => {
        const result = validateUnavailableDates(['2026-11-08', '2026-11-08']);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Duplicate unavailable date detected');
      });

      it(`enforces maximum ${MAX_UNAVAILABLE_DATES} unavailable dates`, () => {
        const thirtyOneDates: string[] = [];
        for (let i = 1; i <= 31; i++) {
          thirtyOneDates.push(`2026-01-${String(i).padStart(2, '0')}`);
        }
        const result = validateUnavailableDates(thirtyOneDates);
        expect(result.valid).toBe(false);
        expect(result.error).toContain(`cannot exceed ${MAX_UNAVAILABLE_DATES} dates`);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. HTTP Integration Tests for GET /api/coach/availability/me
  // ---------------------------------------------------------------------------
  describe('GET /api/coach/availability/me', () => {
    const coachId = new mongoose.Types.ObjectId();
    const mockCoachUser = new User({
      _id: coachId,
      name: 'Coach Maya',
      email: 'maya@coach.athleteconnect.com',
      passwordHash: 'hash',
      role: 'coach',
      isActive: true,
    });

    const validCoachToken = signToken({
      userId: coachId.toString(),
      email: 'maya@coach.athleteconnect.com',
      role: 'coach',
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/coach/availability/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('rejects requests with malformed Bearer tokens with 401', async () => {
      const res = await request(app)
        .get('/api/coach/availability/me')
        .set('Authorization', 'Bearer invalid_token_value');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid or malformed authentication token');
    });

    it('rejects parent role with 403 Forbidden', async () => {
      const parentId = new mongoose.Types.ObjectId();
      const mockParent = new User({
        _id: parentId,
        name: 'Parent User',
        email: 'parent@example.com',
        passwordHash: 'hash',
        role: 'parent',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockParent);

      const parentToken = signToken({
        userId: parentId.toString(),
        email: 'parent@example.com',
        role: 'parent',
      });

      const res = await request(app)
        .get('/api/coach/availability/me')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden. Required role: coach');
    });

    it('rejects individual role with 403 Forbidden', async () => {
      const indId = new mongoose.Types.ObjectId();
      const mockInd = new User({
        _id: indId,
        name: 'Individual User',
        email: 'individual@example.com',
        passwordHash: 'hash',
        role: 'individual',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockInd);

      const indToken = signToken({
        userId: indId.toString(),
        email: 'individual@example.com',
        role: 'individual',
      });

      const res = await request(app)
        .get('/api/coach/availability/me')
        .set('Authorization', `Bearer ${indToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden. Required role: coach');
    });

    it('returns HTTP 200 with { availability: null, isConfigured: false } when coach has no saved record', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCoachUser);
      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        availability: null,
        isConfigured: false,
      });
    });

    it('returns HTTP 200 with saved availability and isConfigured: true when record exists', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCoachUser);

      const existingDoc = new CoachAvailability({
        userId: coachId,
        timezone: 'Asia/Kolkata',
        slots: [
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 'wednesday', startTime: '16:00', endTime: '20:00' },
        ],
        unavailableDates: ['2026-11-08'],
      });

      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue(existingDoc);

      const res = await request(app)
        .get('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isConfigured).toBe(true);
      expect(res.body.availability).toBeDefined();
      expect(res.body.availability.userId).toBe(coachId.toString());
      expect(res.body.availability.timezone).toBe('Asia/Kolkata');
      expect(res.body.availability.slots).toHaveLength(2);
      expect(res.body.availability.unavailableDates).toEqual(['2026-11-08']);
    });

    it('preserves distinction between null record and deliberately saved empty schedule (slots: [])', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCoachUser);

      const emptyDoc = new CoachAvailability({
        userId: coachId,
        timezone: 'Asia/Kolkata',
        slots: [],
        unavailableDates: [],
      });

      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue(emptyDoc);

      const res = await request(app)
        .get('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isConfigured).toBe(true);
      expect(res.body.availability.slots).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. HTTP Integration Tests for PUT /api/coach/availability/me
  // ---------------------------------------------------------------------------
  describe('PUT /api/coach/availability/me', () => {
    const coachId = new mongoose.Types.ObjectId();
    const mockCoachUser = new User({
      _id: coachId,
      name: 'Coach Maya',
      email: 'maya@coach.athleteconnect.com',
      passwordHash: 'hash',
      role: 'coach',
      isActive: true,
    });

    const validCoachToken = signToken({
      userId: coachId.toString(),
      email: 'maya@coach.athleteconnect.com',
      role: 'coach',
    });

    beforeEach(() => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCoachUser);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .send({ slots: [] });
      expect(res.status).toBe(401);
    });

    it('rejects non-object or array request body with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(['invalid-array']);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('JSON object expected');
    });

    it('rejects unknown or server-controlled fields with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          slots: [],
          userId: 'attempted_injected_user_id',
          isConfigured: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unexpected field(s) in request body: userId, isConfigured');
    });

    it('rejects missing slots field with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ timezone: 'Asia/Kolkata' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('slots array is required');
    });

    it('rejects invalid timezone with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          timezone: 'Invalid/NonExistent_Zone',
          slots: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid timezone');
    });

    it('rejects invalid day name with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          slots: [{ dayOfWeek: 'invalid_day', startTime: '09:00', endTime: '12:00' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid dayOfWeek');
    });

    it('rejects invalid time format with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          slots: [{ dayOfWeek: 'monday', startTime: '9:00', endTime: '12:00' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid startTime');
    });

    it('rejects inverted time ranges with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          slots: [{ dayOfWeek: 'monday', startTime: '15:00', endTime: '13:00' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('strictly after start time');
    });

    it('rejects slots shorter than 30 minutes with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          slots: [{ dayOfWeek: 'monday', startTime: '10:00', endTime: '10:20' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 30 minutes');
    });

    it('rejects overlapping slots on the same day with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          slots: [
            { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
            { dayOfWeek: 'monday', startTime: '11:00', endTime: '14:00' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Overlapping slots detected for monday');
    });

    it('rejects invalid calendar dates in unavailableDates with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          slots: [],
          unavailableDates: ['2026-02-29'], // Non-leap year
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid calendar date "2026-02-29"');
    });

    it('rejects duplicate dates in unavailableDates with 400', async () => {
      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          slots: [],
          unavailableDates: ['2026-11-08', '2026-11-08'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Duplicate unavailable date detected');
    });

    it('saves valid schedule and returns HTTP 200 with isConfigured: true', async () => {
      const validPayload = {
        timezone: 'Asia/Kolkata',
        slots: [
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 'monday', startTime: '16:00', endTime: '19:00' },
          { dayOfWeek: 'saturday', startTime: '08:00', endTime: '12:00' },
        ],
        unavailableDates: ['2026-11-08'],
      };

      const savedDoc = new CoachAvailability({
        userId: coachId,
        timezone: 'Asia/Kolkata',
        slots: validPayload.slots,
        unavailableDates: validPayload.unavailableDates,
      });

      const findOneAndUpdateSpy = vi
        .spyOn(CoachAvailability, 'findOneAndUpdate')
        .mockResolvedValue(savedDoc);

      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body.isConfigured).toBe(true);
      expect(res.body.message).toContain('saved successfully');
      expect(res.body.availability.slots).toHaveLength(3);

      // Verify that query was scoped exclusively to req.user.id
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { userId: coachId.toString() },
        expect.objectContaining({
          $set: expect.objectContaining({
            timezone: 'Asia/Kolkata',
          }),
        }),
        expect.anything()
      );
    });

    it('successfully saves deliberately empty schedule with slots: []', async () => {
      const emptyDoc = new CoachAvailability({
        userId: coachId,
        timezone: 'Asia/Kolkata',
        slots: [],
        unavailableDates: [],
      });

      vi.spyOn(CoachAvailability, 'findOneAndUpdate').mockResolvedValue(emptyDoc);

      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ slots: [] });

      expect(res.status).toBe(200);
      expect(res.body.isConfigured).toBe(true);
      expect(res.body.availability.slots).toEqual([]);
    });

    it('handles concurrent first-save duplicate-key error (E11000) gracefully', async () => {
      const validPayload = {
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
      };

      const duplicateKeyError = new Error('E11000 duplicate key error collection') as any;
      duplicateKeyError.code = 11000;

      const savedDoc = new CoachAvailability({
        userId: coachId,
        timezone: 'Asia/Kolkata',
        slots: validPayload.slots,
        unavailableDates: [],
      });

      // First call throws duplicate key race condition; second call updates existing record
      const findOneAndUpdateSpy = vi
        .spyOn(CoachAvailability, 'findOneAndUpdate')
        .mockRejectedValueOnce(duplicateKeyError)
        .mockResolvedValueOnce(savedDoc);

      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body.isConfigured).toBe(true);
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);
    });

    it('omitting unavailableDates does not include it in $set, preserving existing saved dates', async () => {
      const payload = {
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
      };

      const existingSavedDoc = new CoachAvailability({
        userId: coachId,
        timezone: 'Asia/Kolkata',
        slots: payload.slots,
        unavailableDates: ['2026-11-08', '2026-12-25'], // Existing preserved dates
      });

      const findOneAndUpdateSpy = vi
        .spyOn(CoachAvailability, 'findOneAndUpdate')
        .mockResolvedValue(existingSavedDoc);

      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.isConfigured).toBe(true);
      expect(res.body.availability.unavailableDates).toEqual(['2026-11-08', '2026-12-25']);

      // Assert $set does NOT contain unavailableDates
      const updateArg = findOneAndUpdateSpy.mock.calls[0][1] as any;
      expect(updateArg.$set).toHaveProperty('slots');
      expect(updateArg.$set).not.toHaveProperty('unavailableDates');
      expect(updateArg.$set).not.toHaveProperty('timezone');
    });

    it('explicitly sending unavailableDates: [] clears saved dates in $set', async () => {
      const payload = {
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
        unavailableDates: [],
      };

      const clearedDoc = new CoachAvailability({
        userId: coachId,
        timezone: 'Asia/Kolkata',
        slots: payload.slots,
        unavailableDates: [],
      });

      const findOneAndUpdateSpy = vi
        .spyOn(CoachAvailability, 'findOneAndUpdate')
        .mockResolvedValue(clearedDoc);

      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.isConfigured).toBe(true);
      expect(res.body.availability.unavailableDates).toEqual([]);

      // Assert $set explicitly sets unavailableDates: []
      const updateArg = findOneAndUpdateSpy.mock.calls[0][1] as any;
      expect(updateArg.$set).toHaveProperty('unavailableDates', []);
    });

    it('receives expected defaults in $setOnInsert on a first-time save without optional fields', async () => {
      const payload = {
        slots: [{ dayOfWeek: 'tuesday', startTime: '10:00', endTime: '14:00' }],
      };

      const newDoc = new CoachAvailability({
        userId: coachId,
        timezone: DEFAULT_TIMEZONE,
        slots: payload.slots,
        unavailableDates: [],
      });

      const findOneAndUpdateSpy = vi
        .spyOn(CoachAvailability, 'findOneAndUpdate')
        .mockResolvedValue(newDoc);

      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.isConfigured).toBe(true);

      const updateArg = findOneAndUpdateSpy.mock.calls[0][1] as any;
      expect(updateArg.$setOnInsert).toEqual({
        userId: coachId.toString(),
        timezone: DEFAULT_TIMEZONE,
        unavailableDates: [],
      });
    });

    it('duplicate-key recovery path preserves existing dates when field is omitted', async () => {
      const payload = {
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
      };

      const duplicateKeyError = new Error('E11000 duplicate key error') as any;
      duplicateKeyError.code = 11000;

      const savedDocWithDates = new CoachAvailability({
        userId: coachId,
        timezone: 'Asia/Kolkata',
        slots: payload.slots,
        unavailableDates: ['2026-11-08'],
      });

      const findOneAndUpdateSpy = vi
        .spyOn(CoachAvailability, 'findOneAndUpdate')
        .mockRejectedValueOnce(duplicateKeyError)
        .mockResolvedValueOnce(savedDocWithDates);

      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.isConfigured).toBe(true);
      expect(res.body.availability.unavailableDates).toEqual(['2026-11-08']);

      // Verify second call (the recovery call) did NOT include unavailableDates in $set
      const retryCallArg = findOneAndUpdateSpy.mock.calls[1][1] as any;
      expect(retryCallArg.$set).not.toHaveProperty('unavailableDates');
      expect(retryCallArg.$set).not.toHaveProperty('timezone');
      expect(retryCallArg.$set).toHaveProperty('slots');
    });

    it('failed recovery never returns a false success (returns 500 when document is null)', async () => {
      const payload = {
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
      };

      const duplicateKeyError = new Error('E11000 duplicate key error') as any;
      duplicateKeyError.code = 11000;

      // Mock first call throws duplicate key, second call returns null
      vi.spyOn(CoachAvailability, 'findOneAndUpdate')
        .mockRejectedValueOnce(duplicateKeyError)
        .mockResolvedValueOnce(null);

      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(payload);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to persist coach availability schedule');
      expect(res.body.isConfigured).toBeUndefined();
    });

    it('failed recovery never returns a false success (propagates database error when retry rejects)', async () => {
      const payload = {
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
      };

      const duplicateKeyError = new Error('E11000 duplicate key error') as any;
      duplicateKeyError.code = 11000;

      const retryError = new Error('Database connection dropped during retry');

      vi.spyOn(CoachAvailability, 'findOneAndUpdate')
        .mockRejectedValueOnce(duplicateKeyError)
        .mockRejectedValueOnce(retryError);

      const res = await request(app)
        .put('/api/coach/availability/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(payload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
      expect(res.body.isConfigured).toBeUndefined();
    });
  });
});
