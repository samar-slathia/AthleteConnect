import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { CoachProfile } from '../src/models/CoachProfile';
import { CoachAvailability } from '../src/models/CoachAvailability';
import {
  Booking,
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
  validateBookingTimes,
  validateCustomerPhone,
  doIntervalsOverlap,
  serializeBookingForUser,
  getKolkataDateString,
  isValidCalendarDate,
} from '../src/models/Booking';
import { signToken } from '../src/utils/jwt';

describe('Booking Core Backend Tests (Phase 2D-1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Model Schema & Helper In-Memory Unit Tests
  // ===========================================================================
  describe('Booking Helpers & Model Schema Validation (In-Memory)', () => {
    const parentId = new mongoose.Types.ObjectId();
    const coachId = new mongoose.Types.ObjectId();

    describe('validateBookingTimes', () => {
      it('validates a standard 1-hour session successfully', () => {
        const res = validateBookingTimes('09:00', '10:00');
        expect(res.valid).toBe(true);
        expect(res.startMinutes).toBe(540);
        expect(res.endMinutes).toBe(600);
        expect(res.durationMinutes).toBe(60);
      });

      it('validates a minimum duration 30-minute session', () => {
        const res = validateBookingTimes('14:30', '15:00');
        expect(res.valid).toBe(true);
        expect(res.durationMinutes).toBe(30);
      });

      it('validates a maximum duration 4-hour session', () => {
        const res = validateBookingTimes('08:00', '12:00');
        expect(res.valid).toBe(true);
        expect(res.durationMinutes).toBe(240);
      });

      it('rejects invalid 24-hour time format', () => {
        expect(validateBookingTimes('25:00', '10:00').valid).toBe(false);
        expect(validateBookingTimes('09:65', '10:00').valid).toBe(false);
        expect(validateBookingTimes('9:00', '10:00').valid).toBe(false);
        expect(validateBookingTimes('09:00', 'invalid').valid).toBe(false);
      });

      it('rejects startTime equal to or later than endTime', () => {
        const equalRes = validateBookingTimes('10:00', '10:00');
        expect(equalRes.valid).toBe(false);
        expect(equalRes.error).toContain('must be strictly earlier');

        const laterRes = validateBookingTimes('11:00', '10:00');
        expect(laterRes.valid).toBe(false);
        expect(laterRes.error).toContain('must be strictly earlier');
      });

      it('rejects sessions shorter than 30 minutes', () => {
        const res = validateBookingTimes('09:00', '09:20');
        expect(res.valid).toBe(false);
        expect(res.error).toContain('must be at least 30 minutes');
      });

      it('rejects sessions longer than 240 minutes (4 hours)', () => {
        const res = validateBookingTimes('08:00', '13:00');
        expect(res.valid).toBe(false);
        expect(res.error).toContain('cannot exceed 240 minutes');
      });
    });

    describe('validateCustomerPhone', () => {
      it('accepts standard 10-digit Indian phone numbers', () => {
        expect(validateCustomerPhone('9876543210').valid).toBe(true);
      });

      it('accepts international E.164 formatted phone numbers', () => {
        expect(validateCustomerPhone('+919876543210').valid).toBe(true);
        expect(validateCustomerPhone('+14155552671').valid).toBe(true);
      });

      it('rejects numbers that are too short or contain non-digits', () => {
        expect(validateCustomerPhone('12345').valid).toBe(false);
        expect(validateCustomerPhone('98765abcde').valid).toBe(false);
        expect(validateCustomerPhone('').valid).toBe(false);
      });
    });

    describe('doIntervalsOverlap', () => {
      it('detects overlapping sessions', () => {
        // 09:00-11:00 (540-660) and 10:00-12:00 (600-720)
        expect(doIntervalsOverlap(540, 660, 600, 720)).toBe(true);
        // Contained interval
        expect(doIntervalsOverlap(540, 720, 600, 660)).toBe(true);
      });

      it('permits adjacent boundary sessions (no overlap)', () => {
        // 09:00-10:00 (540-600) and 10:00-11:00 (600-660)
        expect(doIntervalsOverlap(540, 600, 600, 660)).toBe(false);
        // 10:00-11:00 (600-660) and 09:00-10:00 (540-600)
        expect(doIntervalsOverlap(600, 660, 540, 600)).toBe(false);
      });

      it('permits disjoint sessions', () => {
        // 09:00-10:00 (540-600) and 14:00-15:00 (840-900)
        expect(doIntervalsOverlap(540, 600, 840, 900)).toBe(false);
      });
    });

    describe('getKolkataDateString (Asia/Kolkata Timezone Calculation)', () => {
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

      it('handles leap year February boundaries accurately in Asia/Kolkata', () => {
        // 2024 is a leap year; 2024-02-28T18:30:00.000Z transitions to 2024-02-29 in Kolkata
        const leapYear = new Date('2024-02-28T18:30:00.000Z');
        expect(getKolkataDateString(leapYear)).toBe('2024-02-29');

        // 2026 is a non-leap year; 2026-02-28T18:30:00.000Z transitions to 2026-03-01 in Kolkata
        const nonLeapYear = new Date('2026-02-28T18:30:00.000Z');
        expect(getKolkataDateString(nonLeapYear)).toBe('2026-03-01');
      });
    });

    describe('Booking Mongoose Schema Validation', () => {
      const validBookingData = {
        customerId: parentId,
        coachId: coachId,
        sport: 'boxing',
        date: '2026-11-20',
        startTime: '09:00',
        endTime: '10:00',
        startMinutes: 540,
        endMinutes: 600,
        durationMinutes: 60,
        venueType: 'coach_home',
        trainingAddress: 'Indiranagar Boxing Studio, 12th Main Road, Bangalore',
        customerPhone: '+919876543210',
      };

      it('validates a compliant booking document', () => {
        const doc = new Booking(validBookingData);
        const err = doc.validateSync();
        expect(err).toBeUndefined();
        expect(doc.status).toBe('pending');
        expect(doc.paymentStatus).toBe('unpaid');
      });

      it('enforces required fields', () => {
        const doc = new Booking({});
        const err = doc.validateSync();
        expect(err?.errors.customerId).toBeDefined();
        expect(err?.errors.coachId).toBeDefined();
        expect(err?.errors.sport).toBeDefined();
        expect(err?.errors.date).toBeDefined();
        expect(err?.errors.startTime).toBeDefined();
        expect(err?.errors.endTime).toBeDefined();
        expect(err?.errors.venueType).toBeDefined();
        expect(err?.errors.trainingAddress).toBeDefined();
        expect(err?.errors.customerPhone).toBeDefined();
      });

      it('enforces sport and venueType enums', () => {
        const doc = new Booking({
          ...validBookingData,
          sport: 'karate',
          venueType: 'invalid_venue',
        });
        const err = doc.validateSync();
        expect(err?.errors.sport).toBeDefined();
        expect(err?.errors.venueType).toBeDefined();
      });

      it('enforces address length boundaries', () => {
        const shortDoc = new Booking({ ...validBookingData, trainingAddress: '123' });
        expect(shortDoc.validateSync()?.errors.trainingAddress).toBeDefined();

        const longDoc = new Booking({ ...validBookingData, trainingAddress: 'a'.repeat(201) });
        expect(longDoc.validateSync()?.errors.trainingAddress).toBeDefined();
      });

      it('keeps paymentStatus separate from status', () => {
        const doc = new Booking({
          ...validBookingData,
          status: 'completed',
          paymentStatus: 'unpaid',
        });
        expect(doc.validateSync()).toBeUndefined();
        expect(doc.status).toBe('completed');
        expect(doc.paymentStatus).toBe('unpaid');
      });
    });

    describe('serializeBookingForUser Privacy Redaction', () => {
      const sampleBooking = {
        _id: new mongoose.Types.ObjectId(),
        customerId: parentId,
        coachId: coachId,
        sport: 'boxing',
        date: '2026-11-20',
        startTime: '09:00',
        endTime: '10:00',
        startMinutes: 540,
        endMinutes: 600,
        durationMinutes: 60,
        venueType: 'coach_home',
        trainingAddress: 'Private Address 123, Bangalore',
        customerPhone: '+919876543210',
        status: 'pending',
        paymentStatus: 'unpaid',
      };

      it('returns full contact details to the customer', () => {
        const serialized = serializeBookingForUser(
          sampleBooking,
          parentId.toString(),
          'parent'
        );
        expect(serialized).toBeDefined();
        expect(serialized?.customerPhone).toBe('+919876543210');
        expect(serialized?.trainingAddress).toBe('Private Address 123, Bangalore');
      });

      it('REDACTS customerPhone from coach when status is pending, but EXPOSES destination address for travel evaluation', () => {
        const serialized = serializeBookingForUser(
          sampleBooking,
          coachId.toString(),
          'coach'
        );
        expect(serialized).toBeDefined();
        expect(serialized?.customerPhone).toBeUndefined();
        expect(serialized?.trainingAddress).toBe('Private Address 123, Bangalore');
        expect(serialized?.sport).toBe('boxing');
        expect(serialized?.date).toBe('2026-11-20');
        expect(serialized?.startTime).toBe('09:00');
      });

      it('REDACTS customerPhone and trainingAddress from coach when status is rejected', () => {
        const rejectedBooking = { ...sampleBooking, status: 'rejected' };
        const serialized = serializeBookingForUser(
          rejectedBooking,
          coachId.toString(),
          'coach'
        );
        expect(serialized).toBeDefined();
        expect(serialized?.customerPhone).toBeUndefined();
        expect(serialized?.trainingAddress).toBeUndefined();
      });

      it('REDACTS customerPhone and trainingAddress from coach when status is cancelled', () => {
        const cancelledBooking = { ...sampleBooking, status: 'cancelled' };
        const serialized = serializeBookingForUser(
          cancelledBooking,
          coachId.toString(),
          'coach'
        );
        expect(serialized).toBeDefined();
        expect(serialized?.customerPhone).toBeUndefined();
        expect(serialized?.trainingAddress).toBeUndefined();
      });

      it('EXPOSES customerPhone and trainingAddress to coach once status is accepted', () => {
        const acceptedBooking = { ...sampleBooking, status: 'accepted' };
        const serialized = serializeBookingForUser(
          acceptedBooking,
          coachId.toString(),
          'coach'
        );
        expect(serialized).toBeDefined();
        expect(serialized?.customerPhone).toBe('+919876543210');
        expect(serialized?.trainingAddress).toBe('Private Address 123, Bangalore');
      });

      it('returns null (access denied) for unauthorized third-party user', () => {
        const strangerId = new mongoose.Types.ObjectId().toString();
        const serialized = serializeBookingForUser(
          sampleBooking,
          strangerId,
          'individual'
        );
        expect(serialized).toBeNull();
      });
    });
  });

  // ===========================================================================
  // 2. Booking Endpoints Integration Tests (Supertest)
  // ===========================================================================
  describe('Booking Endpoints API Tests', () => {
    const parentId = new mongoose.Types.ObjectId();
    const individualId = new mongoose.Types.ObjectId();
    const coachId = new mongoose.Types.ObjectId();
    const otherCoachId = new mongoose.Types.ObjectId();
    const strangerId = new mongoose.Types.ObjectId();

    const parentUser = {
      _id: parentId,
      name: 'Ramesh Sharma',
      email: 'ramesh@parent.com',
      role: 'parent',
      isActive: true,
    };

    const individualUser = {
      _id: individualId,
      name: 'Alex Rivera',
      email: 'alex@individual.com',
      role: 'individual',
      isActive: true,
    };

    const coachUser = {
      _id: coachId,
      name: 'Maya Coach',
      email: 'maya@coach.com',
      role: 'coach',
      isActive: true,
    };

    const otherCoachUser = {
      _id: otherCoachId,
      name: 'Elena Coach',
      email: 'elena@coach.com',
      role: 'coach',
      isActive: true,
    };

    const strangerUser = {
      _id: strangerId,
      name: 'Stranger User',
      email: 'stranger@individual.com',
      role: 'individual',
      isActive: true,
    };

    const parentToken = signToken({
      userId: parentId.toString(),
      email: parentUser.email,
      role: 'parent',
    });

    const individualToken = signToken({
      userId: individualId.toString(),
      email: individualUser.email,
      role: 'individual',
    });

    const coachToken = signToken({
      userId: coachId.toString(),
      email: coachUser.email,
      role: 'coach',
    });

    const otherCoachToken = signToken({
      userId: otherCoachId.toString(),
      email: otherCoachUser.email,
      role: 'coach',
    });

    const strangerToken = signToken({
      userId: strangerId.toString(),
      email: strangerUser.email,
      role: 'individual',
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const validFutureDate = tomorrow.toISOString().split('T')[0];

    const validPayload = {
      coachId: coachId.toString(),
      sport: 'boxing',
      date: validFutureDate,
      startTime: '09:00',
      endTime: '10:00',
      venueType: 'coach_home',
      trainingAddress: '123 Main Road, Indiranagar, Bangalore',
      customerPhone: '+919876543210',
    };

    beforeEach(() => {
      // Mock User.findById for auth middleware
      vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
        const idStr = id?.toString();
        if (idStr === parentId.toString()) return parentUser as any;
        if (idStr === individualId.toString()) return individualUser as any;
        if (idStr === coachId.toString()) return coachUser as any;
        if (idStr === otherCoachId.toString()) return otherCoachUser as any;
        if (idStr === strangerId.toString()) return strangerUser as any;
        return null;
      });
    });

    // -------------------------------------------------------------------------
    // POST /api/bookings
    // -------------------------------------------------------------------------
    describe('POST /api/bookings', () => {
      it('allows parent to create a booking request successfully', async () => {
        vi.spyOn(CoachProfile, 'findOne').mockResolvedValue({
          userId: coachId,
          disciplines: ['boxing', 'kickboxing'],
          venueTypes: ['coach_home', 'ground'],
          hourlyRate: 1500,
        } as any);

        vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue(null);

        const savedBooking = {
          _id: new mongoose.Types.ObjectId(),
          customerId: parentId,
          coachId: coachId,
          sport: 'boxing',
          date: validFutureDate,
          startTime: '09:00',
          endTime: '10:00',
          startMinutes: 540,
          endMinutes: 600,
          durationMinutes: 60,
          venueType: 'coach_home',
          trainingAddress: validPayload.trainingAddress,
          customerPhone: validPayload.customerPhone,
          status: 'pending',
          paymentStatus: 'unpaid',
          hourlyRateSnapshot: 1500,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        vi.spyOn(Booking.prototype, 'save').mockResolvedValue(savedBooking as any);

        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send(validPayload);

        expect(res.status).toBe(201);
        expect(res.body.booking).toBeDefined();
        expect(res.body.booking.status).toBe('pending');
        expect(res.body.booking.paymentStatus).toBe('unpaid');
        expect(res.body.booking.customerPhone).toBe(validPayload.customerPhone);
        expect(res.body.booking.hourlyRateSnapshot).toBe(1500);
      });

      it('allows individual to create a booking request successfully', async () => {
        vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(null);
        vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue(null);

        const savedBooking = {
          _id: new mongoose.Types.ObjectId(),
          customerId: individualId,
          coachId: coachId,
          ...validPayload,
          startMinutes: 540,
          endMinutes: 600,
          durationMinutes: 60,
          status: 'pending',
          paymentStatus: 'unpaid',
        };

        vi.spyOn(Booking.prototype, 'save').mockResolvedValue(savedBooking as any);

        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${individualToken}`)
          .send(validPayload);

        expect(res.status).toBe(201);
        expect(res.body.booking.status).toBe('pending');
      });

      it('rejects unauthenticated request with 401', async () => {
        const res = await request(app).post('/api/bookings').send(validPayload);
        expect(res.status).toBe(401);
      });

      it('rejects coach role from creating a booking request with 403', async () => {
        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${coachToken}`)
          .send(validPayload);

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Access forbidden');
      });

      it('rejects when booking request target coach is not found with 404', async () => {
        const unknownCoachId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send({ ...validPayload, coachId: unknownCoachId });

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('Coach not found');
      });

      it('rejects unexpected or injected fields (e.g. status) with 400', async () => {
        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send({ ...validPayload, status: 'accepted' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Unexpected field(s)');
      });

      it('rejects date in the past with 400', async () => {
        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send({ ...validPayload, date: '2020-01-01' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('past');
      });

      it('rejects a date that is yesterday in Asia/Kolkata even if it matches UTC today', async () => {
        // Freeze time at 2026-10-30T01:00:00.000Z.
        // In UTC, the date is 2026-10-30.
        // In Asia/Kolkata (+5:30), the time is 06:30 on 2026-10-30.
        // 2026-10-29 is strictly yesterday in Asia/Kolkata.
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-30T01:00:00.000Z'));

        try {
          const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${parentToken}`)
            .send({ ...validPayload, date: '2026-10-29' });

          expect(res.status).toBe(400);
          expect(res.body.error).toContain('past');
        } finally {
          vi.useRealTimers();
        }
      });

      it('accepts today in Asia/Kolkata', async () => {
        // Freeze time at 2026-10-29T20:00:00.000Z.
        // In UTC, date is 2026-10-29.
        // In Asia/Kolkata (+5:30), time is 01:30 on 2026-10-30 (today in Kolkata is 2026-10-30).
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-29T20:00:00.000Z'));

        try {
          vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(null);
          vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue(null);
          vi.spyOn(Booking.prototype, 'save').mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
            customerId: parentId,
            coachId: coachId,
            ...validPayload,
            date: '2026-10-30',
            status: 'pending',
            paymentStatus: 'unpaid',
          } as any);

          const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${parentToken}`)
            .send({ ...validPayload, date: '2026-10-30' });

          expect(res.status).toBe(201);
          expect(res.body.booking.date).toBe('2026-10-30');
        } finally {
          vi.useRealTimers();
        }
      });

      it('accepts a valid future date', async () => {
        vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(null);
        vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue(null);
        vi.spyOn(Booking.prototype, 'save').mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          customerId: parentId,
          coachId: coachId,
          ...validPayload,
          date: '2028-12-15',
          status: 'pending',
          paymentStatus: 'unpaid',
        } as any);

        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send({ ...validPayload, date: '2028-12-15' });

        expect(res.status).toBe(201);
        expect(res.body.booking.date).toBe('2028-12-15');
      });

      it('rejects invalid date strings with 400', async () => {
        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send({ ...validPayload, date: 'not-a-valid-date' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid date');
      });

      it('rejects impossible calendar dates (e.g. 2026-02-31) with 400', async () => {
        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send({ ...validPayload, date: '2026-02-31' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid date');
      });

      it('rejects booking when coach availability has blackout date with 400', async () => {
        vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(null);
        vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue({
          userId: coachId,
          unavailableDates: [validFutureDate],
        } as any);

        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send(validPayload);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('unavailable');
      });
    });

    // -------------------------------------------------------------------------
    // GET /api/bookings
    // -------------------------------------------------------------------------
    describe('GET /api/bookings', () => {
      it('returns bookings for customer with contact details visible', async () => {
        const mockBookings = [
          {
            _id: new mongoose.Types.ObjectId(),
            customerId: { _id: parentId, name: 'Ramesh' },
            coachId: { _id: coachId, name: 'Maya' },
            sport: 'boxing',
            date: validFutureDate,
            startTime: '09:00',
            endTime: '10:00',
            startMinutes: 540,
            endMinutes: 600,
            durationMinutes: 60,
            venueType: 'coach_home',
            trainingAddress: 'Customer Private Address',
            customerPhone: '+919876543210',
            status: 'pending',
            paymentStatus: 'unpaid',
          },
        ];

        vi.spyOn(Booking, 'find').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockResolvedValue(mockBookings),
        } as any);

        const res = await request(app)
          .get('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`);

        expect(res.status).toBe(200);
        expect(res.body.bookings).toHaveLength(1);
        expect(res.body.bookings[0].customerPhone).toBe('+919876543210');
        expect(res.body.bookings[0].trainingAddress).toBe('Customer Private Address');
      });

      it('returns incoming bookings for coach with PENDING contact details REDACTED', async () => {
        const mockBookings = [
          {
            _id: new mongoose.Types.ObjectId(),
            customerId: { _id: parentId, name: 'Ramesh' },
            coachId: { _id: coachId, name: 'Maya' },
            sport: 'boxing',
            date: validFutureDate,
            startTime: '09:00',
            endTime: '10:00',
            startMinutes: 540,
            endMinutes: 600,
            durationMinutes: 60,
            venueType: 'coach_home',
            trainingAddress: 'Secret Address',
            customerPhone: '+919876543210',
            status: 'pending',
            paymentStatus: 'unpaid',
          },
        ];

        vi.spyOn(Booking, 'find').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockResolvedValue(mockBookings),
        } as any);

        const res = await request(app)
          .get('/api/bookings')
          .set('Authorization', `Bearer ${coachToken}`);

        expect(res.status).toBe(200);
        // Privacy: Phone is redacted while pending, but destination address is visible for travel evaluation!
        expect(res.body.bookings[0].customerPhone).toBeUndefined();
        expect(res.body.bookings[0].trainingAddress).toBe('Secret Address');
        expect(res.body.bookings[0].status).toBe('pending');
      });
    });

    // -------------------------------------------------------------------------
    // GET /api/bookings/:id
    // -------------------------------------------------------------------------
    describe('GET /api/bookings/:id', () => {
      it('returns booking to participant and rejects stranger with 403', async () => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking = {
          _id: bookingId,
          customerId: { _id: parentId, name: 'Ramesh' },
          coachId: { _id: coachId, name: 'Maya' },
          sport: 'boxing',
          date: validFutureDate,
          startTime: '09:00',
          endTime: '10:00',
          startMinutes: 540,
          endMinutes: 600,
          durationMinutes: 60,
          venueType: 'coach_home',
          trainingAddress: 'My Address',
          customerPhone: '+919876543210',
          status: 'pending',
          paymentStatus: 'unpaid',
        };

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          then: (cb: any) => cb(mockBooking),
        } as any);

        // Authorized parent
        const resParent = await request(app)
          .get(`/api/bookings/${bookingId}`)
          .set('Authorization', `Bearer ${parentToken}`);
        expect(resParent.status).toBe(200);

        // Unauthorized stranger
        const resStranger = await request(app)
          .get(`/api/bookings/${bookingId}`)
          .set('Authorization', `Bearer ${strangerToken}`);
        expect(resStranger.status).toBe(403);
      });
    });

    // -------------------------------------------------------------------------
    // PATCH /api/bookings/:id/accept (Conflict Prevention & Privacy Unlocking)
    // -------------------------------------------------------------------------
    describe('PATCH /api/bookings/:id/accept', () => {
      it('assigned coach accepts pending booking and unlocks customer contact info', async () => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking: any = {
          _id: bookingId,
          customerId: { _id: parentId, name: 'Ramesh' },
          coachId: { _id: coachId, name: 'Maya' },
          sport: 'boxing',
          date: validFutureDate,
          startTime: '09:00',
          endTime: '10:00',
          startMinutes: 540,
          endMinutes: 600,
          durationMinutes: 60,
          venueType: 'coach_home',
          trainingAddress: 'Unlocked Address 123',
          customerPhone: '+919876543210',
          status: 'pending',
          paymentStatus: 'unpaid',
          save: vi.fn().mockResolvedValue(true),
        };

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          then: (cb: any) => cb(mockBooking),
        } as any);

        // No conflicting accepted bookings
        vi.spyOn(Booking, 'findOne').mockResolvedValue(null);

        const res = await request(app)
          .patch(`/api/bookings/${bookingId}/accept`)
          .set('Authorization', `Bearer ${coachToken}`);

        expect(res.status).toBe(200);
        expect(res.body.booking.status).toBe('accepted');
        // Contact details are now exposed after acceptance
        expect(res.body.booking.customerPhone).toBe('+919876543210');
        expect(res.body.booking.trainingAddress).toBe('Unlocked Address 123');
      });

      it('prevents overlapping accepted booking and rejects with 409 Conflict', async () => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking: any = {
          _id: bookingId,
          customerId: { _id: parentId, name: 'Ramesh' },
          coachId: { _id: coachId, name: 'Maya' },
          sport: 'boxing',
          date: validFutureDate,
          startTime: '09:30',
          endTime: '10:30',
          startMinutes: 570,
          endMinutes: 630,
          durationMinutes: 60,
          venueType: 'coach_home',
          trainingAddress: 'Any Address',
          customerPhone: '+919876543210',
          status: 'pending',
          save: vi.fn(),
        };

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          then: (cb: any) => cb(mockBooking),
        } as any);

        // An existing accepted booking overlaps (09:00–10:00 overlaps 09:30–10:30)
        vi.spyOn(Booking, 'findOne').mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          startTime: '09:00',
          endTime: '10:00',
        } as any);

        const res = await request(app)
          .patch(`/api/bookings/${bookingId}/accept`)
          .set('Authorization', `Bearer ${coachToken}`);

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('Overlaps with an already accepted session (09:00–10:00)');
      });

      it('permits adjacent boundary accepted sessions without conflict', async () => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking: any = {
          _id: bookingId,
          customerId: { _id: parentId, name: 'Ramesh' },
          coachId: { _id: coachId, name: 'Maya' },
          sport: 'boxing',
          date: validFutureDate,
          startTime: '10:00',
          endTime: '11:00',
          startMinutes: 600,
          endMinutes: 660,
          durationMinutes: 60,
          venueType: 'coach_home',
          trainingAddress: 'Any Address',
          customerPhone: '+919876543210',
          status: 'pending',
          save: vi.fn().mockResolvedValue(true),
        };

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          then: (cb: any) => cb(mockBooking),
        } as any);

        // findOne query for startMinutes < 660 && endMinutes > 600 returns null for 09:00-10:00 (end 600 is not > 600)
        vi.spyOn(Booking, 'findOne').mockResolvedValue(null);

        const res = await request(app)
          .patch(`/api/bookings/${bookingId}/accept`)
          .set('Authorization', `Bearer ${coachToken}`);

        expect(res.status).toBe(200);
        expect(res.body.booking.status).toBe('accepted');
      });

      it('rejects when non-assigned coach attempts accept with 403', async () => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking = {
          _id: bookingId,
          customerId: { _id: parentId, name: 'Ramesh' },
          coachId: { _id: coachId, name: 'Maya' },
          status: 'pending',
        };

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          then: (cb: any) => cb(mockBooking),
        } as any);

        const res = await request(app)
          .patch(`/api/bookings/${bookingId}/accept`)
          .set('Authorization', `Bearer ${otherCoachToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('not the assigned coach');
      });
    });

    // -------------------------------------------------------------------------
    // PATCH /api/bookings/:id/reject
    // -------------------------------------------------------------------------
    describe('PATCH /api/bookings/:id/reject', () => {
      it('assigned coach rejects pending booking with optional reason', async () => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking: any = {
          _id: bookingId,
          customerId: { _id: parentId, name: 'Ramesh' },
          coachId: { _id: coachId, name: 'Maya' },
          sport: 'boxing',
          date: validFutureDate,
          startTime: '09:00',
          endTime: '10:00',
          startMinutes: 540,
          endMinutes: 600,
          durationMinutes: 60,
          venueType: 'coach_home',
          trainingAddress: 'Private Address',
          customerPhone: '+919876543210',
          status: 'pending',
          save: vi.fn().mockResolvedValue(true),
        };

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          then: (cb: any) => cb(mockBooking),
        } as any);

        const res = await request(app)
          .patch(`/api/bookings/${bookingId}/reject`)
          .set('Authorization', `Bearer ${coachToken}`)
          .send({ reason: 'Fully booked on this day.' });

        expect(res.status).toBe(200);
        expect(res.body.booking.status).toBe('rejected');
        expect(res.body.booking.rejectionReason).toBe('Fully booked on this day.');
        // Contact details remain redacted
        expect(res.body.booking.customerPhone).toBeUndefined();
      });
    });

    // -------------------------------------------------------------------------
    // PATCH /api/bookings/:id/cancel
    // -------------------------------------------------------------------------
    describe('PATCH /api/bookings/:id/cancel', () => {
      it('customer cancels pending booking successfully', async () => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking: any = {
          _id: bookingId,
          customerId: { _id: parentId, name: 'Ramesh' },
          coachId: { _id: coachId, name: 'Maya' },
          status: 'pending',
          paymentStatus: 'unpaid',
          save: vi.fn().mockResolvedValue(true),
        };

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          then: (cb: any) => cb(mockBooking),
        } as any);

        const res = await request(app)
          .patch(`/api/bookings/${bookingId}/cancel`)
          .set('Authorization', `Bearer ${parentToken}`)
          .send({ reason: 'Schedule conflict' });

        expect(res.status).toBe(200);
        expect(res.body.booking.status).toBe('cancelled');
        expect(res.body.booking.cancelledBy).toBe('customer');
        expect(res.body.booking.paymentStatus).toBe('unpaid');
      });

      it('rejects cancellation when booking is already rejected or completed with 400', async () => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking: any = {
          _id: bookingId,
          customerId: { _id: parentId, name: 'Ramesh' },
          coachId: { _id: coachId, name: 'Maya' },
          status: 'rejected',
        };

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          then: (cb: any) => cb(mockBooking),
        } as any);

        const res = await request(app)
          .patch(`/api/bookings/${bookingId}/cancel`)
          .set('Authorization', `Bearer ${parentToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Cannot cancel');
      });
    });

    // -------------------------------------------------------------------------
    // GET /api/coaches (Coach Discovery)
    // -------------------------------------------------------------------------
    describe('GET /api/coaches', () => {
      it('returns public list of active coaches without exposing credentials', async () => {
        vi.spyOn(User, 'find').mockReturnValue({
          select: vi.fn().mockResolvedValue([coachUser]),
        } as any);

        vi.spyOn(CoachProfile, 'find').mockResolvedValue([
          {
            userId: coachId,
            bio: 'Certified national boxing trainer.',
            disciplines: ['boxing'],
            specialties: ['Footwork'],
            sessionFormats: ['one_on_one'],
            venueTypes: ['coach_home'],
            hourlyRate: 1200,
            currency: 'INR',
            locations: ['Indiranagar'],
          },
        ] as any);

        vi.spyOn(CoachAvailability, 'find').mockReturnValue({
          select: vi.fn().mockResolvedValue([
            {
              userId: coachId,
              timezone: 'Asia/Kolkata',
              slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
            },
          ]),
        } as any);

        const res = await request(app).get('/api/coaches');

        expect(res.status).toBe(200);
        expect(res.body.coaches).toHaveLength(1);
        const coach = res.body.coaches[0];
        expect(coach.name).toBe('Maya Coach');
        expect(coach.profile.hourlyRate).toBe(1200);
        expect(coach.isConfiguredAvailability).toBe(true);
        // Security check: Never expose password or internal secrets
        expect(coach.passwordHash).toBeUndefined();
        expect(coach.email).toBeUndefined();
      });
    });

    describe('Location Coordinates & Privacy Authorization', () => {
      it('accepts and persists valid coordinates on booking creation', async () => {
        vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(null);
        vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue(null);

        const createdBookingMock = {
          _id: new mongoose.Types.ObjectId(),
          customerId: parentId,
          coachId: coachId,
          ...validPayload,
          locationCoordinates: { latitude: 12.9716, longitude: 77.5946 },
          status: 'pending',
          paymentStatus: 'unpaid',
          save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(Booking.prototype, 'save').mockImplementation(async function (this: any) {
          Object.assign(this, createdBookingMock);
          return this;
        });

        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send({
            ...validPayload,
            coordinates: { latitude: 12.9716, longitude: 77.5946 },
          });

        expect(res.status).toBe(201);
        expect(res.body.booking.locationCoordinates).toEqual({
          latitude: 12.9716,
          longitude: 77.5946,
        });
      });

      it('rejects invalid coordinates (latitude out of range)', async () => {
        const res = await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${parentToken}`)
          .send({
            ...validPayload,
            coordinates: { latitude: 95.0, longitude: 77.5946 },
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid coordinates');
      });

      it('strictly redacts customer address and coordinates from coach on pending bookings', async () => {
        const mockDoc = {
          _id: new mongoose.Types.ObjectId(),
          customerId: parentId,
          coachId: coachId,
          sport: 'boxing',
          date: '2028-11-20',
          startTime: '10:00',
          endTime: '11:00',
          startMinutes: 600,
          endMinutes: 660,
          durationMinutes: 60,
          venueType: 'customer_home',
          trainingAddress: '123 Private Home Street',
          customerPhone: '+919876543210',
          locationCoordinates: { latitude: 12.9716, longitude: 77.5946 },
          status: 'pending',
          paymentStatus: 'unpaid',
        };

        // Serialize for coach: pending booking exposes destination address & coordinates for distance evaluation, but redacts customerPhone
        const serialized = serializeBookingForUser(mockDoc, coachId.toString(), 'coach');
        expect(serialized).not.toBeNull();
        expect(serialized?.trainingAddress).toBe('123 Private Home Street');
        expect(serialized?.locationCoordinates).toEqual({ latitude: 12.9716, longitude: 77.5946 });
        expect(serialized?.coordinates).toEqual({ latitude: 12.9716, longitude: 77.5946 });
        expect(serialized?.customerPhone).toBeUndefined();

        // Serialize for coach when rejected: all private fields redacted
        const rejectedSerialized = serializeBookingForUser({ ...mockDoc, status: 'rejected' }, coachId.toString(), 'coach');
        expect(rejectedSerialized?.trainingAddress).toBeUndefined();
        expect(rejectedSerialized?.locationCoordinates).toBeUndefined();
        expect(rejectedSerialized?.coordinates).toBeUndefined();
        expect(rejectedSerialized?.customerPhone).toBeUndefined();

        // Serialize for coach when cancelled: all private fields redacted
        const cancelledSerialized = serializeBookingForUser({ ...mockDoc, status: 'cancelled' }, coachId.toString(), 'coach');
        expect(cancelledSerialized?.trainingAddress).toBeUndefined();
        expect(cancelledSerialized?.locationCoordinates).toBeUndefined();
        expect(cancelledSerialized?.coordinates).toBeUndefined();
        expect(cancelledSerialized?.customerPhone).toBeUndefined();

        // Unrelated coach is denied access
        const strangerId = new mongoose.Types.ObjectId().toString();
        const strangerSerialized = serializeBookingForUser(mockDoc, strangerId, 'coach');
        expect(strangerSerialized).toBeNull();

        // Serialize for customer
        const customerSerialized = serializeBookingForUser(mockDoc, parentId.toString(), 'parent');
        expect(customerSerialized?.trainingAddress).toBe('123 Private Home Street');
        expect(customerSerialized?.customerPhone).toBe('+919876543210');
        expect(customerSerialized?.locationCoordinates).toEqual({ latitude: 12.9716, longitude: 77.5946 });
      });

      it('exposes customer address and coordinates to assigned coach once accepted', async () => {
        const mockDoc = {
          _id: new mongoose.Types.ObjectId(),
          customerId: parentId,
          coachId: coachId,
          sport: 'boxing',
          date: '2028-11-20',
          startTime: '10:00',
          endTime: '11:00',
          startMinutes: 600,
          endMinutes: 660,
          durationMinutes: 60,
          venueType: 'customer_home',
          trainingAddress: '123 Private Home Street',
          customerPhone: '+919876543210',
          locationCoordinates: { latitude: 12.9716, longitude: 77.5946 },
          status: 'accepted',
          paymentStatus: 'unpaid',
        };

        const serialized = serializeBookingForUser(mockDoc, coachId.toString(), 'coach');
        expect(serialized).not.toBeNull();
        expect(serialized?.trainingAddress).toBe('123 Private Home Street');
        expect(serialized?.customerPhone).toBe('+919876543210');
        expect(serialized?.locationCoordinates).toEqual({ latitude: 12.9716, longitude: 77.5946 });
        expect(serialized?.coordinates).toEqual({ latitude: 12.9716, longitude: 77.5946 });
      });

      it('preserves backward compatibility for bookings without coordinates', async () => {
        const mockDoc = {
          _id: new mongoose.Types.ObjectId(),
          customerId: parentId,
          coachId: coachId,
          sport: 'boxing',
          date: '2028-11-20',
          startTime: '10:00',
          endTime: '11:00',
          startMinutes: 600,
          endMinutes: 660,
          durationMinutes: 60,
          venueType: 'coach_home',
          trainingAddress: 'Studio Main Road',
          customerPhone: '+919876543210',
          status: 'accepted',
          paymentStatus: 'unpaid',
        };

        const serialized = serializeBookingForUser(mockDoc, parentId.toString(), 'parent');
        expect(serialized).not.toBeNull();
        expect(serialized?.locationCoordinates).toBeUndefined();
        expect(serialized?.coordinates).toBeUndefined();
        expect(serialized?.trainingAddress).toBe('Studio Main Road');
      });
    });
  });
});
