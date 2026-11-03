import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Review } from '../src/models/Review';
import { signToken } from '../src/utils/jwt';

describe('Phase 8.2: Atomic Session Lifecycle & Strict Completion Enforcement', () => {
  const customerId = new mongoose.Types.ObjectId();
  const coachId = new mongoose.Types.ObjectId();
  const otherCoachId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();

  const customerUser = {
    _id: customerId,
    name: 'Jane Customer',
    email: 'customer@test.com',
    role: 'parent',
    isActive: true,
  };

  const coachUser = {
    _id: coachId,
    name: 'Maya Coach',
    email: 'coach@test.com',
    role: 'coach',
    isActive: true,
  };

  const otherCoachUser = {
    _id: otherCoachId,
    name: 'Other Coach',
    email: 'othercoach@test.com',
    role: 'coach',
    isActive: true,
  };

  const adminUser = {
    _id: adminId,
    name: 'Admin User',
    email: 'admin@test.com',
    role: 'admin',
    isActive: true,
  };

  const customerToken = signToken({
    userId: customerId.toString(),
    email: 'customer@test.com',
    role: 'parent',
  });

  const coachToken = signToken({
    userId: coachId.toString(),
    email: 'coach@test.com',
    role: 'coach',
  });

  const otherCoachToken = signToken({
    userId: otherCoachId.toString(),
    email: 'othercoach@test.com',
    role: 'coach',
  });

  const adminToken = signToken({
    userId: adminId.toString(),
    email: 'admin@test.com',
    role: 'admin',
  });

  function mockBookingFindById(result: any) {
    const query: any = {
      populate: vi.fn().mockImplementation(() => query),
      exec: vi.fn().mockResolvedValue(result),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(result).catch(reject),
    };
    return vi.spyOn(Booking, 'findById').mockReturnValue(query);
  }

  function mockBookingFindOneAndUpdate(result: any) {
    const query: any = {
      populate: vi.fn().mockImplementation(() => query),
      exec: vi.fn().mockResolvedValue(result),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(result).catch(reject),
    };
    return vi.spyOn(Booking, 'findOneAndUpdate').mockReturnValue(query);
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
      const idStr = id?.toString();
      if (idStr === customerId.toString()) return customerUser as any;
      if (idStr === coachId.toString()) return coachUser as any;
      if (idStr === otherCoachId.toString()) return otherCoachUser as any;
      if (idStr === adminId.toString()) return adminUser as any;
      return null;
    });
  });

  describe('PHASE B: Strict Completion Timing & Boundary Enforcement', () => {
    it('rejects completion 1 millisecond before expectedEnd with HTTP 400', async () => {
      const expectedEnd = new Date(Date.now() + 5000); // 5 seconds in future
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
        durationMinutes: 60,
        sessionStartedAt: new Date(Date.now() - 3595000),
        expectedEndedAt: expectedEnd,
      };
      mockBookingFindById(mockBooking);

      // Spy on Date.now to simulate arriving exactly 1 ms before expectedEnd
      vi.spyOn(Date, 'now').mockReturnValue(expectedEnd.getTime() - 1);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot complete session before the booked duration has elapsed/i);
      expect(res.body.remainingSeconds).toBe(1);
    });

    it('rejects completion 1500 milliseconds before expectedEnd (verifying no 2s grace window remains)', async () => {
      const expectedEnd = new Date(Date.now() + 1500); // 1.5 seconds in future
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
        durationMinutes: 60,
        sessionStartedAt: new Date(Date.now() - 3598500),
        expectedEndedAt: expectedEnd,
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot complete session before the booked duration has elapsed/i);
    });

    it('allows completion exactly at expectedEnd (now >= expectedEndedAt)', async () => {
      const expectedEnd = new Date(Date.now() - 10);
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
        durationMinutes: 60,
        sessionStartedAt: new Date(Date.now() - 3600010),
        expectedEndedAt: expectedEnd,
        toObject: () => ({
          _id: bookingId,
          customerId,
          coachId,
          status: 'completed',
          completedAt: new Date(),
        }),
      };
      mockBookingFindById(mockBooking);
      mockBookingFindOneAndUpdate(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Session completed successfully/i);
    });

    it('allows completion after expectedEnd has elapsed', async () => {
      const pastEnd = new Date(Date.now() - 60000); // completed 1 minute ago
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
        durationMinutes: 60,
        sessionStartedAt: new Date(Date.now() - 3660000),
        expectedEndedAt: pastEnd,
        toObject: () => ({
          _id: bookingId,
          customerId,
          coachId,
          status: 'completed',
          completedAt: new Date(),
        }),
      };
      mockBookingFindById(mockBooking);
      mockBookingFindOneAndUpdate(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Session completed successfully/i);
    });
  });

  describe('PHASE C: Strict Lifecycle Enforcement', () => {
    it('strictly rejects completing an accepted booking without in_progress arrival step with HTTP 400', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        durationMinutes: 60,
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Only in-progress sessions can be completed/i);
    });

    it('rejects completing a pending booking with HTTP 400', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'pending',
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Only in-progress sessions can be completed/i);
    });

    it('rejects completing a rejected booking with HTTP 400', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'rejected',
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Only in-progress sessions can be completed/i);
    });

    it('rejects completing a cancelled booking with HTTP 400', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'cancelled',
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Only in-progress sessions can be completed/i);
    });

    it('rejects completing a session that is already completed with HTTP 400', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Booking is already completed/i);
    });

    it('rejects customer from completing an in-progress session with HTTP 403', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects administrator from completing an in-progress session with HTTP 403', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects unassigned coach from completing an in-progress session with HTTP 403', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
        expectedEndedAt: new Date(Date.now() - 5000),
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${otherCoachToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only the assigned coach can mark this booking as completed/i);
    });

    it('rejects starting a booking that is already completed with HTTP 400', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
        durationMinutes: 60,
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/start`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/booking is already completed/i);
    });
  });

  describe('PHASE D: Atomic Session Start & Idempotency', () => {
    it('starts session via atomic findOneAndUpdate matching status accepted', async () => {
      const mockAccepted = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        durationMinutes: 60,
      };
      const mockStarted: any = {
        ...mockAccepted,
        status: 'in_progress',
        sessionStartedAt: new Date(),
        expectedEndedAt: new Date(Date.now() + 60 * 60 * 1000),
        toObject: () => ({
          _id: bookingId,
          customerId,
          coachId,
          status: 'in_progress',
          durationMinutes: 60,
          sessionStartedAt: new Date(),
          expectedEndedAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
      };

      mockBookingFindById(mockAccepted);
      const findOneAndUpdateSpy = mockBookingFindOneAndUpdate(mockStarted);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/start`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Coach arrival confirmed\. Session started successfully/i);
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(1);
      const queryFilter = findOneAndUpdateSpy.mock.calls[0][0];
      expect(queryFilter.status).toBe('accepted');
    });

    it('returns existing session timestamps when already in_progress (sequential idempotency)', async () => {
      const existingStart = new Date(Date.now() - 15 * 60 * 1000);
      const existingEnd = new Date(existingStart.getTime() + 60 * 60 * 1000);

      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
        durationMinutes: 60,
        sessionStartedAt: existingStart,
        expectedEndedAt: existingEnd,
        toObject: () => ({
          _id: bookingId,
          customerId,
          coachId,
          status: 'in_progress',
          durationMinutes: 60,
          sessionStartedAt: existingStart,
          expectedEndedAt: existingEnd,
        }),
      };
      mockBookingFindById(mockBooking);
      const findOneAndUpdateSpy = mockBookingFindOneAndUpdate(null);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/start`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Session is already in progress/i);
      // findOneAndUpdate was not called because early idempotency guard caught it
      expect(findOneAndUpdateSpy).not.toHaveBeenCalled();
    });

    it('handles concurrent race condition: atomic update fails, safely returns winning session timestamps', async () => {
      const mockAccepted = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        durationMinutes: 60,
      };
      const winningStart = new Date(Date.now() - 1000);
      const winningEnd = new Date(winningStart.getTime() + 60 * 60 * 1000);
      const concurrentWinner = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
        durationMinutes: 60,
        sessionStartedAt: winningStart,
        expectedEndedAt: winningEnd,
      };

      // First findById sees accepted, but findOneAndUpdate returns null because concurrent request raced
      let findByIdCount = 0;
      const findByIdQuery: any = {
        populate: vi.fn().mockImplementation(() => findByIdQuery),
        then: (resolve: any) => {
          findByIdCount++;
          return Promise.resolve(findByIdCount === 1 ? mockAccepted : concurrentWinner).then(resolve);
        },
      };
      vi.spyOn(Booking, 'findById').mockReturnValue(findByIdQuery);
      mockBookingFindOneAndUpdate(null); // atomic update returns null (lost race)

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/start`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Session is already in progress/i);
      expect(res.body.booking.sessionStartedAt).toBe(winningStart.toISOString());
    });
  });

  describe('PHASE E: Atomic Session Completion & Concurrency', () => {
    it('completes session via atomic findOneAndUpdate matching status in_progress and expectedEndedAt <= now', async () => {
      const pastEnd = new Date(Date.now() - 1000);
      const mockInProgress = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
        durationMinutes: 60,
        sessionStartedAt: new Date(Date.now() - 3601000),
        expectedEndedAt: pastEnd,
      };
      const mockCompleted: any = {
        ...mockInProgress,
        status: 'completed',
        completedAt: new Date(),
        toObject: () => ({
          _id: bookingId,
          customerId,
          coachId,
          status: 'completed',
          completedAt: new Date(),
        }),
      };

      mockBookingFindById(mockInProgress);
      const findOneAndUpdateSpy = mockBookingFindOneAndUpdate(mockCompleted);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Session completed successfully/i);
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(1);
      const queryFilter = findOneAndUpdateSpy.mock.calls[0][0];
      expect(queryFilter.status).toBe('in_progress');
      expect(queryFilter.expectedEndedAt).toBeDefined();
    });

    it('handles concurrent completion race: second atomic update returns null, returns 400 already completed', async () => {
      const pastEnd = new Date(Date.now() - 5000);
      const mockInProgress = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
        durationMinutes: 60,
        expectedEndedAt: pastEnd,
      };
      const alreadyCompleted = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
        completedAt: new Date(Date.now() - 1000),
      };

      let findByIdCount = 0;
      const findByIdQuery: any = {
        populate: vi.fn().mockImplementation(() => findByIdQuery),
        then: (resolve: any) => {
          findByIdCount++;
          return Promise.resolve(findByIdCount === 1 ? mockInProgress : alreadyCompleted).then(resolve);
        },
      };
      vi.spyOn(Booking, 'findById').mockReturnValue(findByIdQuery);
      mockBookingFindOneAndUpdate(null); // atomic update lost race

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Booking is already completed/i);
    });
  });

  describe('PHASE F: Stored Session Duration Validation', () => {
    it.each([
      ['zero duration', 0],
      ['negative duration', -60],
      ['non-integer float duration', 60.5],
      ['duration below minimum 30m', 20],
      ['duration above maximum 240m', 300],
      ['null duration', null],
      ['undefined duration', undefined],
      ['boolean duration', true],
      ['string duration', 'sixty'],
    ])('rejects starting session with invalid persisted duration: %s', async (_, invalidDuration) => {
      const corruptedBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        durationMinutes: invalidDuration,
      };
      mockBookingFindById(corruptedBooking);
      const findOneAndUpdateSpy = mockBookingFindOneAndUpdate(null);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/start`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid booking duration/i);
      expect(findOneAndUpdateSpy).not.toHaveBeenCalled();
    });

    it('ignores client-supplied duration in request body and strictly uses persisted duration', async () => {
      const mockAccepted = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        durationMinutes: 90, // persisted is 90 mins
      };
      const mockStarted: any = {
        ...mockAccepted,
        status: 'in_progress',
        sessionStartedAt: new Date(),
        expectedEndedAt: new Date(Date.now() + 90 * 60 * 1000),
        toObject: () => ({
          _id: bookingId,
          customerId,
          coachId,
          status: 'in_progress',
          durationMinutes: 90,
          sessionStartedAt: new Date(),
          expectedEndedAt: new Date(Date.now() + 90 * 60 * 1000),
        }),
      };
      mockBookingFindById(mockAccepted);
      const findOneAndUpdateSpy = mockBookingFindOneAndUpdate(mockStarted);

      const before = Date.now();
      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/start`)
        .set('Authorization', `Bearer ${coachToken}`)
        .send({ durationMinutes: 30 }); // client attempts to override with 30 mins

      expect(res.status).toBe(200);
      const updatePayload = findOneAndUpdateSpy.mock.calls[0][1].$set;
      const expectedEndMs = new Date(updatePayload.expectedEndedAt).getTime();
      const sessionStartMs = new Date(updatePayload.sessionStartedAt).getTime();
      // Difference MUST be exactly 90 minutes (5,400,000 ms), not 30 minutes
      expect(expectedEndMs - sessionStartMs).toBe(90 * 60 * 1000);
    });
  });

  describe('Customer Review Availability Transition', () => {
    it('customer cannot review session while in_progress, but can review immediately upon completion', async () => {
      const inProgressBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'in_progress',
      };
      mockBookingFindById(inProgressBooking);

      const inProgressRes = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5 });

      expect(inProgressRes.status).toBe(400);
      expect(inProgressRes.body.error).toMatch(/Rating is only available for completed sessions/i);

      // Transitioned to completed
      const completedBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };
      mockBookingFindById(completedBooking);
      vi.spyOn(Review, 'findOne').mockResolvedValue(null);
      vi.spyOn(Review, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        customerId,
        coachId,
        rating: 5,
        reviewText: 'Great coach!',
        createdAt: new Date(),
      } as any);

      const completedRes = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, reviewText: 'Great coach!' });

      expect(completedRes.status).toBe(201);
      expect(completedRes.body.review.rating).toBe(5);
    });
  });
});
