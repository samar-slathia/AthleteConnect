import { Router } from 'express';
import {
  createBooking,
  getBookings,
  getBookingById,
  acceptBooking,
  rejectBooking,
  cancelBooking,
} from '../controllers/bookingController';
import {
  getBookingMessages,
  sendBookingMessage,
} from '../controllers/chatController';
import { authenticate, requireRole } from '../middleware/auth';

export const bookingRouter = Router();

// Create booking request (Parent or Individual only)
bookingRouter.post('/', authenticate, requireRole('parent', 'individual'), createBooking);

// List bookings (Scoped to authenticated user)
bookingRouter.get('/', authenticate, getBookings);

// Get single booking
bookingRouter.get('/:id', authenticate, getBookingById);

// Accept pending booking request (Assigned coach only)
bookingRouter.patch('/:id/accept', authenticate, requireRole('coach'), acceptBooking);

// Reject pending booking request (Assigned coach only)
bookingRouter.patch('/:id/reject', authenticate, requireRole('coach'), rejectBooking);

// Cancel booking (Customer or Assigned Coach)
bookingRouter.patch('/:id/cancel', authenticate, cancelBooking);

// Booking-linked Chat Messages
bookingRouter.get('/:id/messages', authenticate, getBookingMessages);
bookingRouter.post('/:id/messages', authenticate, sendBookingMessage);
