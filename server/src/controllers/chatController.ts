import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Booking } from '../models/Booking';
import { BookingMessage, MAX_MESSAGE_LENGTH, MIN_MESSAGE_LENGTH } from '../models/BookingMessage';

const ALLOWED_SEND_FIELDS = new Set(['text']);

/**
 * Retrieve messages for a specific booking in chronological order.
 * GET /api/bookings/:id/messages
 * Access restricted strictly to authorized booking participants (customer or assigned coach).
 */
export async function getBookingMessages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const customerIdStr = (booking.customerId?._id || booking.customerId).toString();
    const coachIdStr = (booking.coachId?._id || booking.coachId).toString();

    const isCustomer = req.user.id === customerIdStr;
    const isCoach = req.user.id === coachIdStr;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isCoach && !isAdmin) {
      return res.status(403).json({
        error: 'Access forbidden. You are not an authorized participant in this booking.',
      });
    }

    const messages = await BookingMessage.find({ bookingId: booking._id }).sort({ createdAt: 1 });

    return res.status(200).json({
      messages: messages.map((m) => (m.toJSON ? m.toJSON() : m)),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Send and persist a new text message for a booking.
 * POST /api/bookings/:id/messages
 * Validates text content and derives sender identity exclusively from trusted server-side auth.
 */
export async function sendBookingMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const customerIdStr = (booking.customerId?._id || booking.customerId).toString();
    const coachIdStr = (booking.coachId?._id || booking.coachId).toString();

    const isCustomer = req.user.id === customerIdStr;
    const isCoach = req.user.id === coachIdStr;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isCoach && !isAdmin) {
      return res.status(403).json({
        error: 'Access forbidden. You are not an authorized participant in this booking.',
      });
    }

    // Lifecycle check: prevent posting new messages to closed/cancelled/rejected bookings
    if (['rejected', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({
        error: `Cannot send messages for a booking with status "${booking.status}". Conversation is closed for cancelled or rejected bookings.`,
      });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid request body. JSON object expected.' });
    }

    // 1. Strict whitelist validation: prevent mass assignment and identity spoofing
    const receivedKeys = Object.keys(req.body);
    const unexpected = receivedKeys.filter((k) => !ALLOWED_SEND_FIELDS.has(k));
    if (unexpected.length > 0) {
      return res.status(400).json({
        error: `Unexpected field(s) in request body: ${unexpected.join(', ')}. Sender identity and metadata are server-controlled.`,
      });
    }

    const { text } = req.body;

    // 2. Validate message text content
    if (typeof text !== 'string') {
      return res.status(400).json({
        error: 'Message text is required and must be a string.',
      });
    }

    const trimmedText = text.trim();
    if (trimmedText.length < MIN_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: 'Message text cannot be empty or whitespace-only.',
      });
    }

    if (trimmedText.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `Message text cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
      });
    }

    // 3. Derive sender identity exclusively from trusted server-side authenticated session
    const message = new BookingMessage({
      bookingId: booking._id,
      senderId: new mongoose.Types.ObjectId(req.user.id),
      senderRole: req.user.role,
      senderName: req.user.name,
      text: trimmedText,
    });

    await message.save();

    return res.status(201).json({
      message: message.toJSON(),
    });
  } catch (error) {
    return next(error);
  }
}
