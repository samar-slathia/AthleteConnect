import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { BookingMessage, MAX_MESSAGE_LENGTH } from '../src/models/BookingMessage';
import { signToken } from '../src/utils/jwt';

describe('Booking Chat Backend Tests (Phase 2D-2)', () => {
  const customerId = new mongoose.Types.ObjectId();
  const coachId = new mongoose.Types.ObjectId();
  const strangerId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();

  const customerUser = {
    _id: customerId,
    name: 'Ramesh Sharma',
    email: 'ramesh@parent.com',
    role: 'parent',
    isActive: true,
  };

  const coachUser = {
    _id: coachId,
    name: 'Maya Coach',
    email: 'maya@coach.com',
    role: 'coach',
    isActive: true,
  };

  const strangerUser = {
    _id: strangerId,
    name: 'Sneha Trainee',
    email: 'sneha@individual.com',
    role: 'individual',
    isActive: true,
  };

  const customerToken = signToken({
    userId: customerId.toString(),
    email: customerUser.email,
    role: 'parent',
  });

  const coachToken = signToken({
    userId: coachId.toString(),
    email: coachUser.email,
    role: 'coach',
  });

  const strangerToken = signToken({
    userId: strangerId.toString(),
    email: strangerUser.email,
    role: 'individual',
  });

  const mockPendingBooking = {
    _id: bookingId,
    customerId: customerId,
    coachId: coachId,
    sport: 'boxing',
    date: '2026-11-20',
    startTime: '09:00',
    endTime: '10:00',
    status: 'pending',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock User.findById for auth middleware
    vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
      const idStr = id?.toString();
      if (idStr === customerId.toString()) return customerUser as any;
      if (idStr === coachId.toString()) return coachUser as any;
      if (idStr === strangerId.toString()) return strangerUser as any;
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Model Schema Validation Tests
  // ===========================================================================
  describe('BookingMessage Model Schema Validation (In-Memory)', () => {
    it('validates a compliant booking message successfully', () => {
      const msg = new BookingMessage({
        bookingId,
        senderId: customerId,
        senderRole: 'parent',
        senderName: 'Ramesh Sharma',
        text: 'Are you on your way?',
      });

      const err = msg.validateSync();
      expect(err).toBeUndefined();
      expect(msg.text).toBe('Are you on your way?');
      expect(msg.senderRole).toBe('parent');
    });

    it('enforces required fields (bookingId, senderId, senderRole, senderName, text)', () => {
      const msg = new BookingMessage({});
      const err = msg.validateSync();
      expect(err?.errors.bookingId).toBeDefined();
      expect(err?.errors.senderId).toBeDefined();
      expect(err?.errors.senderRole).toBeDefined();
      expect(err?.errors.senderName).toBeDefined();
      expect(err?.errors.text).toBeDefined();
    });

    it('rejects empty or whitespace-only text', () => {
      const emptyMsg = new BookingMessage({
        bookingId,
        senderId: customerId,
        senderRole: 'parent',
        senderName: 'Ramesh Sharma',
        text: '   ',
      });
      const err = emptyMsg.validateSync();
      expect(err?.errors.text).toBeDefined();
    });

    it('enforces maximum text length (1000 characters)', () => {
      const tooLongText = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
      const msg = new BookingMessage({
        bookingId,
        senderId: customerId,
        senderRole: 'parent',
        senderName: 'Ramesh Sharma',
        text: tooLongText,
      });
      const err = msg.validateSync();
      expect(err?.errors.text).toBeDefined();
      expect(err?.errors.text?.message).toContain('cannot exceed 1000 characters');
    });

    it('validates role enum for senderRole', () => {
      const invalidRoleMsg = new BookingMessage({
        bookingId,
        senderId: customerId,
        senderRole: 'invalid_role' as any,
        senderName: 'Ramesh Sharma',
        text: 'Hello coach',
      });
      const err = invalidRoleMsg.validateSync();
      expect(err?.errors.senderRole).toBeDefined();
    });
  });

  // ===========================================================================
  // 2. GET /api/bookings/:id/messages (Retrieval & Chronological Ordering)
  // ===========================================================================
  describe('GET /api/bookings/:id/messages', () => {
    it('retrieves messages in chronological order for authorized customer', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockPendingBooking as any);

      const msg1 = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        senderId: customerId,
        senderRole: 'parent',
        senderName: 'Ramesh Sharma',
        text: 'Are we still on for today?',
        createdAt: new Date('2026-11-20T08:00:00Z'),
      };

      const msg2 = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        senderId: coachId,
        senderRole: 'coach',
        senderName: 'Maya Coach',
        text: 'I’m on my way.',
        createdAt: new Date('2026-11-20T08:05:00Z'),
      };

      vi.spyOn(BookingMessage, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue([msg1, msg2]),
      } as any);

      const res = await request(app)
        .get(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[0].text).toBe('Are we still on for today?');
      expect(res.body.messages[1].text).toBe('I’m on my way.');
      expect(res.body.messages[0].senderRole).toBe('parent');
      expect(res.body.messages[1].senderRole).toBe('coach');
    });

    it('retrieves messages for assigned coach', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockPendingBooking as any);
      vi.spyOn(BookingMessage, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue([]),
      } as any);

      const res = await request(app)
        .get(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([]);
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get(`/api/bookings/${bookingId}/messages`);
      expect(res.status).toBe(401);
    });

    it('rejects invalid booking ID format with 400', async () => {
      const res = await request(app)
        .get('/api/bookings/invalid-id/messages')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid booking ID');
    });

    it('returns 404 when booking is not found', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Booking not found');
    });

    it('rejects non-participant authenticated user with 403', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockPendingBooking as any);

      const res = await request(app)
        .get(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not an authorized participant');
    });
  });

  // ===========================================================================
  // 3. POST /api/bookings/:id/messages (Sending, Validation & Identity Derivation)
  // ===========================================================================
  describe('POST /api/bookings/:id/messages', () => {
    it('customer sends a quick message successfully', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockPendingBooking as any);

      const savedMessage = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        senderId: customerId,
        senderRole: 'parent',
        senderName: 'Ramesh Sharma',
        text: 'Are you on your way?',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(BookingMessage.prototype, 'save').mockResolvedValue(savedMessage as any);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ text: 'Are you on your way?' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.text).toBe('Are you on your way?');
      expect(res.body.message.senderName).toBe('Ramesh Sharma');
      expect(res.body.message.senderRole).toBe('parent');
      expect(res.body.message.senderId).toBe(customerId.toString());
    });

    it('coach sends a quick message successfully', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockPendingBooking as any);

      const savedMessage = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        senderId: coachId,
        senderRole: 'coach',
        senderName: 'Maya Coach',
        text: 'I’ll be there in 10 minutes.',
        createdAt: new Date(),
      };

      vi.spyOn(BookingMessage.prototype, 'save').mockResolvedValue(savedMessage as any);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${coachToken}`)
        .send({ text: 'I’ll be there in 10 minutes.' });

      expect(res.status).toBe(201);
      expect(res.body.message.text).toBe('I’ll be there in 10 minutes.');
      expect(res.body.message.senderRole).toBe('coach');
    });

    it('rejects identity spoofing attempts by ignoring client-submitted sender fields', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockPendingBooking as any);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          text: 'Attempting spoof',
          senderName: 'Imposter Admin',
          senderRole: 'admin',
          senderId: new mongoose.Types.ObjectId().toString(),
        });

      // Strict field whitelist rejects unexpected keys
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unexpected field(s)');
      expect(res.body.error).toContain('senderName');
      expect(res.body.error).toContain('server-controlled');
    });

    it('rejects empty or whitespace-only messages with 400', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockPendingBooking as any);

      const resEmpty = await request(app)
        .post(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ text: '' });

      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.error).toContain('cannot be empty');

      const resSpaces = await request(app)
        .post(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ text: '     ' });

      expect(resSpaces.status).toBe(400);
      expect(resSpaces.body.error).toContain('cannot be empty');
    });

    it('rejects messages exceeding 1000 characters with 400', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockPendingBooking as any);

      const tooLongText = 'a'.repeat(1001);
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ text: tooLongText });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot exceed 1000 characters');
    });

    it('rejects non-participant authenticated user with 403', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockPendingBooking as any);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ text: 'Hello stranger' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not an authorized participant');
    });

    it('permits sending messages across active booking lifecycles: pending, accepted, completed', async () => {
      for (const activeStatus of ['pending', 'accepted', 'completed']) {
        const activeBooking = { ...mockPendingBooking, status: activeStatus };
        vi.spyOn(Booking, 'findById').mockResolvedValue(activeBooking as any);

        const savedMessage = {
          _id: new mongoose.Types.ObjectId(),
          bookingId,
          senderId: customerId,
          senderRole: 'parent',
          senderName: 'Ramesh Sharma',
          text: `Message during ${activeStatus}`,
          createdAt: new Date(),
        };

        vi.spyOn(BookingMessage.prototype, 'save').mockResolvedValue(savedMessage as any);

        const res = await request(app)
          .post(`/api/bookings/${bookingId}/messages`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ text: `Message during ${activeStatus}` });

        expect(res.status).toBe(201);
      }
    });

    it('rejects sending messages for closed/cancelled or rejected bookings with 400', async () => {
      for (const closedStatus of ['rejected', 'cancelled']) {
        const closedBooking = { ...mockPendingBooking, status: closedStatus };
        vi.spyOn(Booking, 'findById').mockResolvedValue(closedBooking as any);

        const res = await request(app)
          .post(`/api/bookings/${bookingId}/messages`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ text: 'Trying to chat on closed booking' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain(`Cannot send messages for a booking with status "${closedStatus}"`);
      }
    });

    it('safely handles internal database errors via error middleware', async () => {
      vi.spyOn(Booking, 'findById').mockRejectedValue(new Error('Database cluster down'));

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ text: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });
});
