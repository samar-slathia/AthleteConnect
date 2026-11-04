import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { CoachProfile } from '../src/models/CoachProfile';
import { CoachAvailability } from '../src/models/CoachAvailability';
import { Booking } from '../src/models/Booking';
import { PaymentTransaction } from '../src/models/PaymentTransaction';
import { signToken } from '../src/utils/jwt';
import {
  generatePackageSchedule,
  getPackageDurationDays,
  addDaysToDateString,
} from '../src/utils/packageSchedule';
import * as razorpayService from '../src/services/razorpayService';

describe('Coaching Packages (Weekly & Monthly) End-to-End Tests', () => {
  const customerId = new mongoose.Types.ObjectId();
  const coachId = new mongoose.Types.ObjectId();
  const customerToken = signToken({
    userId: customerId.toString(),
    email: 'customer@athleteconnect.test',
    role: 'parent',
  });
  const coachToken = signToken({
    userId: coachId.toString(),
    email: 'coach@athleteconnect.test',
    role: 'coach',
  });

  const mockCustomerUser: any = {
    _id: customerId,
    id: customerId.toString(),
    name: 'Parent User',
    email: 'customer@athleteconnect.test',
    role: 'parent',
    isActive: true,
  };

  const mockCoachUser: any = {
    _id: coachId,
    id: coachId.toString(),
    name: 'Coach User',
    email: 'coach@athleteconnect.test',
    role: 'coach',
    isActive: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
      const idStr = id?.toString?.() || String(id);
      if (idStr === customerId.toString()) return mockCustomerUser;
      if (idStr === coachId.toString()) return mockCoachUser;
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Package Schedule Utility Unit Tests
  // ===========================================================================
  describe('packageSchedule Utility Functions', () => {
    it('returns correct package duration days', () => {
      expect(getPackageDurationDays('single')).toBe(1);
      expect(getPackageDurationDays('weekly')).toBe(7);
      expect(getPackageDurationDays('monthly')).toBe(30);
    });

    it('correctly increments calendar date strings with addDaysToDateString', () => {
      expect(addDaysToDateString('2026-03-01', 0)).toBe('2026-03-01');
      expect(addDaysToDateString('2026-03-01', 6)).toBe('2026-03-07');
      expect(addDaysToDateString('2026-03-01', 29)).toBe('2026-03-30');
      expect(addDaysToDateString('2026-02-28', 1)).toBe('2026-03-01');
    });

    it('generates weekly sessions matching coach recurring slots', () => {
      // 2026-03-02 is a Monday
      // 7-day window: Monday 2026-03-02 to Sunday 2026-03-08
      const slots = [
        { dayOfWeek: 'monday', startTime: '10:00', endTime: '12:00', isAvailable: true },
        { dayOfWeek: 'wednesday', startTime: '10:00', endTime: '12:00', isAvailable: true },
        { dayOfWeek: 'friday', startTime: '10:00', endTime: '12:00', isAvailable: true },
      ];

      const result = generatePackageSchedule({
        startDate: '2026-03-02',
        startTime: '10:00',
        endTime: '11:00',
        packageType: 'weekly',
        coachAvailabilitySlots: slots,
        unavailableDates: [],
        existingBookings: [],
      });

      expect(result.sessionDates.length).toBe(3);
      expect(result.sessionDates[0]).toBe('2026-03-02'); // Monday
      expect(result.sessionDates[1]).toBe('2026-03-04'); // Wednesday
      expect(result.sessionDates[2]).toBe('2026-03-06'); // Friday
      expect(result.startDate).toBe('2026-03-02');
      expect(result.endDate).toBe('2026-03-08');
      expect(result.isValid).toBe(true);
      expect(result.isInvalid).toBe(false);
      expect(result.invalidationReason).toBeUndefined();
    });

    it('blackout on a normally scheduled coaching day invalidates the entire package with zero sessions', () => {
      // 2026-03-02 Monday, 2026-03-04 Wednesday, 2026-03-06 Friday
      const slots = [
        { dayOfWeek: 'monday', startTime: '10:00', endTime: '12:00', isAvailable: true },
        { dayOfWeek: 'wednesday', startTime: '10:00', endTime: '12:00', isAvailable: true },
        { dayOfWeek: 'friday', startTime: '10:00', endTime: '12:00', isAvailable: true },
      ];

      const result = generatePackageSchedule({
        startDate: '2026-03-02',
        startTime: '10:00',
        endTime: '11:00',
        packageType: 'weekly',
        coachAvailabilitySlots: slots,
        unavailableDates: ['2026-03-04'], // Wednesday is a blackout date
        existingBookings: [],
      });

      // An invalid package returns zero sessions, not a reduced session count
      expect(result.isValid).toBe(false);
      expect(result.isInvalid).toBe(true);
      expect(result.sessionCount).toBe(0);
      expect(result.sessionDates).toEqual([]);
      expect(result.invalidationReason).toContain('2026-03-04');
      expect(result.invalidationReason).toContain('blackout date');
    });

    it('existing booking conflict on a normally scheduled day invalidates the entire package', () => {
      // 2026-03-02 Monday, 2026-03-04 Wednesday, 2026-03-06 Friday
      const slots = [
        { dayOfWeek: 'monday', startTime: '10:00', endTime: '12:00', isAvailable: true },
        { dayOfWeek: 'wednesday', startTime: '10:00', endTime: '12:00', isAvailable: true },
        { dayOfWeek: 'friday', startTime: '10:00', endTime: '12:00', isAvailable: true },
      ];

      const existingBookings = [
        {
          date: '2026-03-04',
          startMinutes: 630, // 10:30 overlaps with 10:00-11:00
          endMinutes: 690,   // 11:30
        },
      ];

      const result = generatePackageSchedule({
        startDate: '2026-03-02',
        startTime: '10:00',
        endTime: '11:00',
        packageType: 'weekly',
        coachAvailabilitySlots: slots,
        unavailableDates: [],
        existingBookings,
      });

      // Overlap invalidates the entire package rather than silently returning 2 sessions
      expect(result.isValid).toBe(false);
      expect(result.isInvalid).toBe(true);
      expect(result.sessionCount).toBe(0);
      expect(result.sessionDates).toEqual([]);
      expect(result.invalidationReason).toContain('2026-03-04');
    });

    it('non-working weekdays do not invalidate a package', () => {
      // Coach works Mon, Wed, Fri only. Tue, Thu, Sat, Sun are outside working hours.
      const slots = [
        { dayOfWeek: 'monday', startTime: '10:00', endTime: '12:00', isAvailable: true },
        { dayOfWeek: 'wednesday', startTime: '10:00', endTime: '12:00', isAvailable: true },
        { dayOfWeek: 'friday', startTime: '10:00', endTime: '12:00', isAvailable: true },
      ];

      const result = generatePackageSchedule({
        startDate: '2026-03-02', // Monday
        startTime: '10:00',
        endTime: '11:00',
        packageType: 'weekly',
        coachAvailabilitySlots: slots,
        unavailableDates: [],
        existingBookings: [],
      });

      expect(result.isValid).toBe(true);
      expect(result.isInvalid).toBe(false);
      expect(result.invalidationReason).toBeUndefined();
      expect(result.sessionCount).toBe(3);
      expect(result.sessionDates).toEqual(['2026-03-02', '2026-03-04', '2026-03-06']);

      // Skipped non-working days are recorded with 'outside_working_hours'
      const nonWorkingSkips = result.skippedDates.filter((s) => s.reason === 'outside_working_hours');
      expect(nonWorkingSkips.length).toBe(4); // Tue, Thu, Sat, Sun
    });

    it('returns empty sessions array when coach has no matching availability', () => {
      const slots = [
        { dayOfWeek: 'tuesday', startTime: '10:00', endTime: '12:00', isAvailable: true },
      ];

      const result = generatePackageSchedule({
        startDate: '2026-03-02', // Monday
        startTime: '14:00',     // slot is 10:00-12:00, requested is 14:00-15:00
        endTime: '15:00',
        packageType: 'weekly',
        coachAvailabilitySlots: slots,
        unavailableDates: [],
        existingBookings: [],
      });

      expect(result.sessionDates.length).toBe(0);
    });

    it('generates monthly sessions (30-day window) accurately', () => {
      // 2026-03-01 (Sunday) to 2026-03-30 (Monday) = 30 days
      const slots = [
        { dayOfWeek: 'saturday', startTime: '09:00', endTime: '11:00', isAvailable: true },
        { dayOfWeek: 'sunday', startTime: '09:00', endTime: '11:00', isAvailable: true },
      ];

      const result = generatePackageSchedule({
        startDate: '2026-03-01',
        startTime: '09:00',
        endTime: '10:00',
        packageType: 'monthly',
        coachAvailabilitySlots: slots,
        unavailableDates: [],
        existingBookings: [],
      });

      expect(result.sessionDates.length).toBe(9);
      expect(result.startDate).toBe('2026-03-01');
      expect(result.endDate).toBe('2026-03-30');
    });
  });

  // ===========================================================================
  // 2. Package Preview Endpoint Tests
  // ===========================================================================
  describe('GET /api/bookings/package-preview', () => {
    it('returns 400 when coachId is missing', async () => {
      const res = await request(app)
        .get('/api/bookings/package-preview')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('coachId');
    });

    it('returns 400 when invalid packageType is provided', async () => {
      const res = await request(app)
        .get('/api/bookings/package-preview')
        .query({
          coachId: coachId.toString(),
          startDate: '2026-12-01',
          startTime: '10:00',
          endTime: '11:00',
          packageType: 'quarterly',
        })
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid packageType');
    });

    it('returns preview with transparent breakdown and session list for weekly package', async () => {
      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue({
        userId: coachId,
        hourlyRate: 1500,
        disciplines: ['boxing'],
        venueTypes: ['customer_home'],
        isVerified: true,
      } as any);

      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue({
        userId: coachId,
        slots: [
          { dayOfWeek: 'monday', startTime: '10:00', endTime: '12:00', isAvailable: true },
          { dayOfWeek: 'wednesday', startTime: '10:00', endTime: '12:00', isAvailable: true },
          { dayOfWeek: 'friday', startTime: '10:00', endTime: '12:00', isAvailable: true },
        ],
        unavailableDates: [],
      } as any);

      vi.spyOn(Booking, 'find').mockReturnValue({
        select: vi.fn().mockResolvedValue([]),
      } as any);

      const res = await request(app)
        .get('/api/bookings/package-preview')
        .query({
          coachId: coachId.toString(),
          startDate: '2026-12-07', // Monday
          startTime: '10:00',
          endTime: '11:00',
          packageType: 'weekly',
        })
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.preview).toBeDefined();
      expect(res.body.preview.packageType).toBe('weekly');
      expect(res.body.preview.sessionCount).toBe(3);
      expect(res.body.preview.sessionDates).toHaveLength(3);
      expect(res.body.pricing).toBeDefined();
      expect(res.body.pricing.perSessionFee).toBe(1500);
      expect(res.body.pricing.sessionCount).toBe(3);
      expect(res.body.pricing.baseSessionFee).toBe(4500);
      expect(res.body.pricing.platformCommission).toBe(900); // 20% of 4500
      expect(res.body.pricing.coachAllocation).toBe(3600);    // 80% of 4500
      expect(res.body.pricing.totalCustomerPayable).toBe(4500);
    });
  });

  // ===========================================================================
  // 3. Package Booking Creation Tests
  // ===========================================================================
  describe('POST /api/bookings with Package Options', () => {
    it('creates a weekly package with multiple sessions linked by packageGroupId', async () => {
      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue({
        userId: coachId,
        hourlyRate: 1000,
        disciplines: ['boxing'],
        venueTypes: ['customer_home'],
        isVerified: true,
      } as any);

      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue({
        userId: coachId,
        slots: [
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '11:00', isAvailable: true },
          { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '11:00', isAvailable: true },
        ],
        unavailableDates: [],
      } as any);

      vi.spyOn(Booking, 'find').mockReturnValue({
        select: vi.fn().mockResolvedValue([]),
      } as any);

      const savedBookings: any[] = [];
      vi.spyOn(Booking.prototype, 'save').mockImplementation(async function (this: any) {
        if (!this._id) this._id = new mongoose.Types.ObjectId();
        savedBookings.push(this);
        return this;
      });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          coachId: coachId.toString(),
          sport: 'boxing',
          date: '2026-12-07', // Monday
          startTime: '09:00',
          endTime: '10:00',
          venueType: 'customer_home',
          trainingAddress: '123 Training Street, Bangalore',
          customerPhone: '+919876543210',
          packageType: 'weekly',
        });

      expect(res.status).toBe(201);
      expect(res.body.booking.packageType).toBe('weekly');
      expect(res.body.booking.packageGroupId).toBeDefined();
      expect(res.body.booking.packageSessionCount).toBe(2); // Monday + Tuesday in 7 days
      expect(res.body.package).toBeDefined();
      expect(res.body.package.sessionCount).toBe(2);
      expect(res.body.package.pricing.baseSessionFee).toBe(2000); // 1000 * 2 sessions
      expect(savedBookings.length).toBe(2);
      expect(savedBookings[0].packageSessionIndex).toBe(1);
      expect(savedBookings[1].packageSessionIndex).toBe(2);
      expect(savedBookings[0].packageGroupId.toString()).toBe(savedBookings[1].packageGroupId.toString());
    });

    it('rejects package creation with 409 and creates no partial bookings when schedule has blackout/conflict', async () => {
      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue({
        userId: coachId,
        hourlyRate: 1000,
        disciplines: ['boxing'],
        venueTypes: ['customer_home'],
        isVerified: true,
      } as any);

      // Coach has availability on Saturdays, but Saturday is in unavailableDates
      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue({
        userId: coachId,
        slots: [
          { dayOfWeek: 'saturday', startTime: '09:00', endTime: '11:00', isAvailable: true },
        ],
        unavailableDates: ['2026-12-12'], // Saturday Dec 12
      } as any);

      vi.spyOn(Booking, 'find').mockReturnValue({
        select: vi.fn().mockResolvedValue([]),
      } as any);

      const savedBookings: any[] = [];
      vi.spyOn(Booking.prototype, 'save').mockImplementation(async function (this: any) {
        savedBookings.push(this);
        return this;
      });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          coachId: coachId.toString(),
          sport: 'boxing',
          date: '2026-12-07', // Monday Dec 7
          startTime: '09:00',
          endTime: '10:00',
          venueType: 'customer_home',
          trainingAddress: '123 Training Street, Bangalore',
          customerPhone: '+919876543210',
          packageType: 'weekly',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SCHEDULE_CONFLICT');
      expect(res.body.error).toContain('blackout date');
      expect(savedBookings.length).toBe(0); // Zero partial booking documents created
    });

    it('rejects package creation with 400 when coach has genuinely zero working sessions in window', async () => {
      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue({
        userId: coachId,
        hourlyRate: 1000,
        disciplines: ['boxing'],
        venueTypes: ['customer_home'],
        isVerified: true,
      } as any);

      // Coach only has availability on Sundays, but window has no matching slots
      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue({
        userId: coachId,
        slots: [
          { dayOfWeek: 'sunday', startTime: '15:00', endTime: '17:00', isAvailable: true },
        ],
        unavailableDates: [],
      } as any);

      vi.spyOn(Booking, 'find').mockReturnValue({
        select: vi.fn().mockResolvedValue([]),
      } as any);

      const savedBookings: any[] = [];
      vi.spyOn(Booking.prototype, 'save').mockImplementation(async function (this: any) {
        savedBookings.push(this);
        return this;
      });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          coachId: coachId.toString(),
          sport: 'boxing',
          date: '2026-12-07', // Monday Dec 7
          startTime: '09:00', // slot is 15:00-17:00 on Sunday, requested is 09:00-10:00
          endTime: '10:00',
          venueType: 'customer_home',
          trainingAddress: '123 Training Street, Bangalore',
          customerPhone: '+919876543210',
          packageType: 'weekly',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No available coaching sessions found');
      expect(savedBookings.length).toBe(0); // Zero partial booking documents created
    });
  });

  // ===========================================================================
  // 4. Atomic Package Acceptance Tests
  // ===========================================================================
  describe('PATCH /api/bookings/:id/accept for Packages', () => {
    it('accepts all sessions of a package atomically when coach accepts', async () => {
      const packageGroupId = new mongoose.Types.ObjectId();
      const bookingId1 = new mongoose.Types.ObjectId();
      const bookingId2 = new mongoose.Types.ObjectId();

      const mockBooking1: any = {
        _id: bookingId1,
        coachId: { _id: coachId, name: 'Coach User' },
        customerId: { _id: customerId, name: 'Parent User' },
        status: 'pending',
        date: '2026-12-07',
        startTime: '09:00',
        endTime: '10:00',
        startMinutes: 540,
        endMinutes: 600,
        durationMinutes: 60,
        venueType: 'customer_home',
        trainingAddress: '123 Street',
        customerPhone: '+919876543210',
        sport: 'boxing',
        packageGroupId,
        packageType: 'weekly',
        packageSessionIndex: 1,
        packageSessionCount: 2,
        save: vi.fn().mockResolvedValue(true),
      };

      const mockBooking2: any = {
        _id: bookingId2,
        coachId: { _id: coachId, name: 'Coach User' },
        customerId: { _id: customerId, name: 'Parent User' },
        status: 'pending',
        date: '2026-12-08',
        startTime: '09:00',
        endTime: '10:00',
        startMinutes: 540,
        endMinutes: 600,
        durationMinutes: 60,
        venueType: 'customer_home',
        trainingAddress: '123 Street',
        customerPhone: '+919876543210',
        sport: 'boxing',
        packageGroupId,
        packageType: 'weekly',
        packageSessionIndex: 2,
        packageSessionCount: 2,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Booking, 'findById').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (cb: any) => cb(mockBooking1),
      } as any);

      vi.spyOn(Booking, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue([mockBooking1, mockBooking2]),
        select: vi.fn().mockResolvedValue([]),
        then: (cb: any) => cb([mockBooking1, mockBooking2]),
      } as any);

      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue({
        userId: coachId,
        slots: [
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00', isAvailable: true },
          { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '12:00', isAvailable: true },
        ],
        unavailableDates: [],
      } as any);

      // No conflicting bookings
      vi.spyOn(Booking, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId1}/accept`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.booking.status).toBe('accepted');
      expect(mockBooking1.status).toBe('accepted');
      expect(mockBooking2.status).toBe('accepted');
      expect(mockBooking1.paymentDueAt).toBeDefined();
      expect(mockBooking2.paymentDueAt).toBeDefined();
    });

    it('rejects acceptance atomically if any session in package conflicts with an accepted booking', async () => {
      const packageGroupId = new mongoose.Types.ObjectId();
      const bookingId1 = new mongoose.Types.ObjectId();
      const bookingId2 = new mongoose.Types.ObjectId();

      const mockBooking1: any = {
        _id: bookingId1,
        coachId: { _id: coachId, name: 'Coach User' },
        customerId: { _id: customerId, name: 'Parent User' },
        status: 'pending',
        date: '2026-12-07',
        startTime: '09:00',
        endTime: '10:00',
        startMinutes: 540,
        endMinutes: 600,
        durationMinutes: 60,
        venueType: 'customer_home',
        trainingAddress: '123 Street',
        customerPhone: '+919876543210',
        sport: 'boxing',
        packageGroupId,
        packageType: 'weekly',
        packageSessionIndex: 1,
        packageSessionCount: 2,
        save: vi.fn().mockResolvedValue(true),
      };

      const mockBooking2: any = {
        _id: bookingId2,
        coachId: { _id: coachId, name: 'Coach User' },
        customerId: { _id: customerId, name: 'Parent User' },
        status: 'pending',
        date: '2026-12-08',
        startTime: '09:00',
        endTime: '10:00',
        startMinutes: 540,
        endMinutes: 600,
        durationMinutes: 60,
        venueType: 'customer_home',
        trainingAddress: '123 Street',
        customerPhone: '+919876543210',
        sport: 'boxing',
        packageGroupId,
        packageType: 'weekly',
        packageSessionIndex: 2,
        packageSessionCount: 2,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Booking, 'findById').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (cb: any) => cb(mockBooking1),
      } as any);

      vi.spyOn(Booking, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue([mockBooking1, mockBooking2]),
        select: vi.fn().mockResolvedValue([]),
        then: (cb: any) => cb([mockBooking1, mockBooking2]),
      } as any);

      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue({
        userId: coachId,
        slots: [
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00', isAvailable: true },
          { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '12:00', isAvailable: true },
        ],
        unavailableDates: [],
      } as any);

      // Session 2 conflicts with another booking on 2026-12-08
      vi.spyOn(Booking, 'findOne').mockImplementation(async (query: any) => {
        if (query.date === '2026-12-08') {
          return { _id: new mongoose.Types.ObjectId(), startTime: '09:00', endTime: '10:00' } as any;
        }
        return null;
      });

      const res = await request(app)
        .patch(`/api/bookings/${bookingId1}/accept`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Cannot accept package. Overlaps with an already accepted session on 2026-12-08');
      // Verify all-or-nothing rollback: neither booking accepted
      expect(mockBooking1.status).toBe('pending');
      expect(mockBooking2.status).toBe('pending');
    });
  });

  // ===========================================================================
  // 5. Payment Order Creation & Webhook Verification for Packages
  // ===========================================================================
  describe('Package Payment Order & Webhook Verification', () => {
    it('creates a single Razorpay order for all sessions of a package with breakdown', async () => {
      const packageGroupId = new mongoose.Types.ObjectId();
      const bookingId = new mongoose.Types.ObjectId();

      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        packageGroupId,
        packageType: 'weekly',
        packageSessionCount: 3,
        packageTotalAmount: 3000,
        hourlyRateSnapshot: 1000,
        durationMinutes: 60,
        save: vi.fn().mockResolvedValue(true),
      };

      const packageBookings = [
        { ...mockBooking, packageSessionIndex: 1 },
        { ...mockBooking, packageSessionIndex: 2 },
        { ...mockBooking, packageSessionIndex: 3 },
      ];

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(Booking, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue(packageBookings),
      } as any);

      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      vi.spyOn(razorpayService, 'createRazorpayOrder').mockResolvedValue({
        id: 'order_pkg_999',
        entity: 'order',
        amount: 300000,
        amount_paid: 0,
        amount_due: 300000,
        currency: 'INR',
        receipt: 'pkg_12345678',
        status: 'created',
        attempts: 0,
        notes: {},
        created_at: Math.floor(Date.now() / 1000),
      } as any);

      vi.spyOn(PaymentTransaction.prototype, 'save').mockResolvedValue(true as any);
      vi.spyOn(Booking, 'updateMany').mockResolvedValue({ matchedCount: 3 } as any);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(201);
      expect(res.body.orderId).toBe('order_pkg_999');
      expect(res.body.amount).toBe(3000);
      expect(res.body.amountInPaise).toBe(300000);
      expect(res.body.packageType).toBe('weekly');
      expect(res.body.sessionCount).toBe(3);
      expect(res.body.breakdown).toEqual({
        coachingFee: 3000,
        sessionCount: 3,
        perSessionFee: 1000,
        taxAmount: 0,
        taxRatePercentage: 0,
        taxLabel: 'Taxes & Levies (0% Sandbox Mode)',
        totalPayable: 3000,
      });
    });
  });
});
