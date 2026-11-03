import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { CoachProfile } from '../src/models/CoachProfile';
import { CoachAvailability } from '../src/models/CoachAvailability';
import { Review } from '../src/models/Review';
import { signToken } from '../src/utils/jwt';
import { sanitizeReviewerName } from '../src/controllers/reviewController';

describe('Coach Rating & Review System (Phase 7)', () => {
  const customerId = new mongoose.Types.ObjectId();
  const otherCustomerId = new mongoose.Types.ObjectId();
  const coachId = new mongoose.Types.ObjectId();
  const otherCoachId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();

  const customerUser = {
    _id: customerId,
    name: 'Jane Customer',
    email: 'customer@test.com',
    role: 'parent',
    isActive: true,
  };

  const otherCustomerUser = {
    _id: otherCustomerId,
    name: 'Other Customer',
    email: 'other@test.com',
    role: 'individual',
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

  const otherCustomerToken = signToken({
    userId: otherCustomerId.toString(),
    email: 'other@test.com',
    role: 'individual',
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

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
      const idStr = id?.toString();
      if (idStr === customerId.toString()) return customerUser as any;
      if (idStr === otherCustomerId.toString()) return otherCustomerUser as any;
      if (idStr === coachId.toString()) return coachUser as any;
      if (idStr === otherCoachId.toString()) return otherCoachUser as any;
      if (idStr === adminId.toString()) return adminUser as any;
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Review Model & Sanitizer Unit Tests', () => {
    it('sanitizes reviewer full names to protect customer privacy', () => {
      expect(sanitizeReviewerName('Ramesh Sharma')).toBe('Ramesh S.');
      expect(sanitizeReviewerName('Priya Patel')).toBe('Priya P.');
      expect(sanitizeReviewerName('Amit')).toBe('Amit');
      expect(sanitizeReviewerName('')).toBe('Verified Athlete');
      expect(sanitizeReviewerName(undefined)).toBe('Verified Athlete');
      expect(sanitizeReviewerName('Sunita Devi Yadav')).toBe('Sunita Y.');
    });
  });

  describe('POST /api/bookings/:id/review (Rating Submission)', () => {
    it('successfully submits a valid 5-star rating with optional review text for a completed booking', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);
      vi.spyOn(Review, 'findOne').mockResolvedValue(null);
      const createdReviewDoc = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        customerId,
        coachId,
        rating: 5,
        reviewText: 'Outstanding coach! Highly recommended.',
        createdAt: new Date(),
      };
      vi.spyOn(Review, 'create').mockResolvedValue(createdReviewDoc as any);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          rating: 5,
          reviewText: 'Outstanding coach! Highly recommended.',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('submitted successfully');
      expect(res.body.review.rating).toBe(5);
      expect(res.body.review.reviewText).toBe('Outstanding coach! Highly recommended.');
      expect(res.body.review.coachId).toBe(coachId.toString());
    });

    it('successfully submits a rating without review text', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);
      vi.spyOn(Review, 'findOne').mockResolvedValue(null);
      vi.spyOn(Review, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        customerId,
        coachId,
        rating: 4,
        createdAt: new Date(),
      } as any);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 4 });

      expect(res.status).toBe(201);
      expect(res.body.review.rating).toBe(4);
      expect(res.body.review.reviewText).toBeUndefined();
    });

    it('rejects unauthenticated requests with HTTP 401', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .send({ rating: 5 });

      expect(res.status).toBe(401);
    });

    it('rejects review submission from coaches with HTTP 403', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${coachToken}`)
        .send({ rating: 5 });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden');
    });

    it('rejects review submission for non-existent booking with HTTP 404', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      vi.spyOn(Booking, 'findById').mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Booking not found.');
    });

    it('rejects review submission if customer does not own the booking with HTTP 403', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking = {
        _id: bookingId,
        customerId, // Owned by customerId
        coachId,
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);

      // Attempted by otherCustomerId
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .send({ rating: 5 });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('You can only rate coaches for your own bookings');
    });

    it.each(['pending', 'accepted', 'rejected', 'cancelled'])(
      'rejects rating when booking status is "%s" with HTTP 400',
      async (incompleteStatus) => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking = {
          _id: bookingId,
          customerId,
          coachId,
          status: incompleteStatus,
        };

        vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);

        const res = await request(app)
          .post(`/api/bookings/${bookingId}/review`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ rating: 5 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Rating is only available for completed sessions');
      }
    );

    it.each([0, 6, -1, 3.5, 'five', null])(
      'rejects invalid star value "%s" with HTTP 400',
      async (invalidRating) => {
        const bookingId = new mongoose.Types.ObjectId();
        const mockBooking = {
          _id: bookingId,
          customerId,
          coachId,
          status: 'completed',
        };

        vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);

        const res = await request(app)
          .post(`/api/bookings/${bookingId}/review`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ rating: invalidRating });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Rating must be an integer between 1 and 5|Rating is required/);
      }
    );

    it('rejects review text exceeding 500 characters with HTTP 400', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);

      const longText = 'A'.repeat(501);
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, reviewText: longText });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot exceed 500 characters');
    });

    it('enforces one review per booking and rejects duplicate submission with HTTP 409', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);
      vi.spyOn(Review, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        rating: 5,
      } as any);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 4 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already been reviewed');
    });

    it('handles database race condition duplicate error (E11000) with HTTP 409', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);
      vi.spyOn(Review, 'findOne').mockResolvedValue(null);
      const duplicateError: any = new Error('E11000 duplicate key error');
      duplicateError.code = 11000;
      vi.spyOn(Review, 'create').mockRejectedValue(duplicateError);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already been reviewed');
    });
  });

  describe('GET /api/bookings/:id/review (Review Status)', () => {
    it('returns isRated: true and review data when booking has been reviewed', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);
      vi.spyOn(Review, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        rating: 5,
        reviewText: 'Great coach!',
        createdAt: new Date(),
      } as any);

      const res = await request(app)
        .get(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isRated).toBe(true);
      expect(res.body.review.rating).toBe(5);
    });

    it('returns isRated: false when booking has not been reviewed', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);
      vi.spyOn(Review, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isRated).toBe(false);
      expect(res.body.review).toBeNull();
    });

    it('rejects access from non-participant with HTTP 403', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking as any);

      const res = await request(app)
        .get(`/api/bookings/${bookingId}/review`)
        .set('Authorization', `Bearer ${otherCustomerToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/bookings/:id/complete (Session Completion)', () => {
    it('successfully transitions an in-progress session with elapsed duration to completed by assigned coach', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const pastEndedAt = new Date(Date.now() - 60000);
      const mockBooking: any = {
        _id: bookingId,
        customerId: { _id: customerId, name: 'Trainee' },
        coachId: { _id: coachId, name: 'Coach Maya' },
        status: 'in_progress',
        expectedEndedAt: pastEndedAt,
        sessionStartedAt: new Date(Date.now() - 3660000),
        toObject: () => ({
          _id: bookingId,
          customerId,
          coachId,
          status: 'completed',
          date: '2026-11-15',
          startTime: '10:00',
          endTime: '11:00',
          sport: 'boxing',
          venueType: 'customer_home',
          sessionStartedAt: new Date(Date.now() - 3660000),
          expectedEndedAt: pastEndedAt,
          completedAt: new Date(),
        }),
      };

      vi.spyOn(Booking, 'findById').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (cb: any) => cb(mockBooking),
      } as any);

      vi.spyOn(Booking, 'findOneAndUpdate').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (cb: any) => cb(mockBooking),
      } as any);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('completed successfully');
    });

    it('rejects completing a session that is already completed with HTTP 400', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking: any = {
        _id: bookingId,
        customerId: { _id: customerId },
        coachId: { _id: coachId },
        status: 'completed',
      };

      vi.spyOn(Booking, 'findById').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (cb: any) => cb(mockBooking),
      } as any);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Booking is already completed.');
    });

    it('rejects completing a session that is pending or accepted with HTTP 400 (strict lifecycle)', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking: any = {
        _id: bookingId,
        customerId: { _id: customerId },
        coachId: { _id: coachId },
        status: 'pending',
      };

      vi.spyOn(Booking, 'findById').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (cb: any) => cb(mockBooking),
      } as any);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Only in-progress sessions can be completed');
    });

    it('rejects session completion attempts by customers (including booking owner) with HTTP 403', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking: any = {
        _id: bookingId,
        customerId: { _id: customerId },
        coachId: { _id: coachId },
        status: 'accepted',
      };

      vi.spyOn(Booking, 'findById').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (cb: any) => cb(mockBooking),
      } as any);

      // Even the customer who owns the booking cannot mark it completed
      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden');
    });

    it('rejects session completion attempts by another coach (not assigned) with HTTP 403', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking: any = {
        _id: bookingId,
        customerId: { _id: customerId },
        coachId: { _id: coachId },
        status: 'accepted',
      };

      vi.spyOn(Booking, 'findById').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (cb: any) => cb(mockBooking),
      } as any);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${otherCoachToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Only the assigned coach can mark this booking as completed');
    });

    it('rejects session completion attempts by platform administrators with HTTP 403 (strict coach-only policy)', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const mockBooking: any = {
        _id: bookingId,
        customerId: { _id: customerId },
        coachId: { _id: coachId },
        status: 'accepted',
      };

      vi.spyOn(Booking, 'findById').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (cb: any) => cb(mockBooking),
      } as any);

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden');
    });

    it('rejects unauthenticated session completion requests with HTTP 401', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/complete`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/coaches & /api/coaches/:id (Aggregate Ratings Display)', () => {
    it('accurately calculates and returns average star rating and review count in coach discovery', async () => {
      const activeCoach = {
        _id: coachId,
        name: 'Master Coach',
        role: 'coach',
        isActive: true,
      };

      vi.spyOn(User, 'find').mockReturnValue({
        select: vi.fn().mockResolvedValue([activeCoach]),
      } as any);

      vi.spyOn(CoachProfile, 'find').mockResolvedValue([
        {
          userId: coachId,
          disciplines: ['boxing'],
          bio: 'Expert coach',
        },
      ] as any);

      vi.spyOn(CoachAvailability, 'find').mockReturnValue({
        select: vi.fn().mockResolvedValue([]),
      } as any);

      // Simulate reviews aggregation: (5 + 4) / 2 = 4.5
      vi.spyOn(Review, 'aggregate').mockResolvedValue([
        {
          _id: coachId,
          averageRating: 4.5,
          reviewCount: 2,
        },
      ]);

      const res = await request(app).get('/api/coaches');

      expect(res.status).toBe(200);
      expect(res.body.coaches).toHaveLength(1);
      expect(res.body.coaches[0].rating).toEqual({
        averageRating: 4.5,
        reviewCount: 2,
      });
    });

    it('handles coaches with no reviews cleanly with 0 average rating and 0 count', async () => {
      const activeCoach = {
        _id: coachId,
        name: 'New Coach',
        role: 'coach',
        isActive: true,
      };

      vi.spyOn(User, 'find').mockReturnValue({
        select: vi.fn().mockResolvedValue([activeCoach]),
      } as any);

      vi.spyOn(CoachProfile, 'find').mockResolvedValue([] as any);
      vi.spyOn(CoachAvailability, 'find').mockReturnValue({
        select: vi.fn().mockResolvedValue([]),
      } as any);
      vi.spyOn(Review, 'aggregate').mockResolvedValue([]);

      const res = await request(app).get('/api/coaches');

      expect(res.status).toBe(200);
      expect(res.body.coaches[0].rating).toEqual({
        averageRating: 0,
        reviewCount: 0,
      });
    });

    it('returns sanitized customer reviews and aggregate rating on GET /api/coaches/:id', async () => {
      const activeCoach = {
        _id: coachId,
        name: 'Master Coach',
        role: 'coach',
        isActive: true,
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(activeCoach),
      } as any);

      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(null);
      vi.spyOn(CoachAvailability, 'findOne').mockResolvedValue(null);

      vi.spyOn(Review, 'aggregate').mockResolvedValue([
        {
          _id: coachId,
          averageRating: 4.8,
          reviewCount: 5,
        },
      ]);

      const mockReviewDocs = [
        {
          _id: new mongoose.Types.ObjectId(),
          rating: 5,
          reviewText: 'Great experience!',
          customerId: { name: 'Siddharth Rao' },
          createdAt: new Date('2026-10-10'),
        },
      ];

      vi.spyOn(Review, 'find').mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockResolvedValue(mockReviewDocs),
      } as any);

      const res = await request(app).get(`/api/coaches/${coachId}`);

      expect(res.status).toBe(200);
      expect(res.body.coach.rating).toEqual({
        averageRating: 4.8,
        reviewCount: 5,
      });
      expect(res.body.coach.reviews).toHaveLength(1);
      // Privacy check: "Siddharth Rao" must be sanitized to "Siddharth R."
      expect(res.body.coach.reviews[0].customerName).toBe('Siddharth R.');
      expect(res.body.coach.reviews[0].reviewText).toBe('Great experience!');
    });
  });

  describe('GET /api/coaches/:id/reviews (Public Reviews Endpoint)', () => {
    it('returns sanitized reviews and accurate stats for an active coach', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue({
        _id: coachId,
        role: 'coach',
        isActive: true,
      } as any);

      vi.spyOn(Review, 'aggregate').mockResolvedValue([
        {
          _id: coachId,
          averageRating: 5.0,
          reviewCount: 1,
        },
      ]);

      vi.spyOn(Review, 'find').mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockResolvedValue([
          {
            _id: new mongoose.Types.ObjectId(),
            rating: 5,
            reviewText: 'Helped me master high kicks!',
            customerId: { name: 'Kavita Singh' },
            createdAt: new Date(),
          },
        ]),
      } as any);

      const res = await request(app).get(`/api/coaches/${coachId}/reviews`);

      expect(res.status).toBe(200);
      expect(res.body.rating.averageRating).toBe(5);
      expect(res.body.rating.reviewCount).toBe(1);
      expect(res.body.reviews[0].customerName).toBe('Kavita S.');
    });

    it('returns 404 when coach is not found or inactive', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      const res = await request(app).get(`/api/coaches/${coachId}/reviews`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Coach not found.');
    });
  });
});
