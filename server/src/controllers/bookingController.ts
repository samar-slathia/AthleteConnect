import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  Booking,
  BOOKING_STATUSES,
  COACH_DISCIPLINES,
  VENUE_TYPES,
  ACTIVE_VENUE_TYPES,
  MAX_REASON_LENGTH,
  validateBookingTimes,
  validateCustomerPhone,
  serializeBookingForUser,
  getKolkataDateString,
  isValidCalendarDate,
} from '../models/Booking';
import { User } from '../models/User';
import { CoachProfile } from '../models/CoachProfile';
import { CoachAvailability } from '../models/CoachAvailability';
import { withCoachScheduleLock } from '../utils/scheduleLock';

const ALLOWED_CREATE_FIELDS = new Set([
  'coachId',
  'sport',
  'date',
  'startTime',
  'endTime',
  'venueType',
  'trainingAddress',
  'customerPhone',
  'locationCoordinates',
  'coordinates',
]);

/**
 * Create a new booking request.
 * POST /api/bookings
 * Allowed roles: 'parent', 'individual'.
 */
export async function createBooking(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!['parent', 'individual'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access forbidden. Only parents or individual trainees can create booking requests.',
      });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid request body. JSON object expected.' });
    }

    // 1. Strict whitelist validation: Reject unexpected or injected fields
    const receivedKeys = Object.keys(req.body);
    const unexpected = receivedKeys.filter((k) => !ALLOWED_CREATE_FIELDS.has(k));
    if (unexpected.length > 0) {
      return res.status(400).json({
        error: `Unexpected field(s) in request body: ${unexpected.join(', ')}. Server-controlled properties cannot be specified.`,
      });
    }

    const {
      coachId,
      sport,
      date,
      startTime,
      endTime,
      venueType,
      trainingAddress,
      customerPhone,
    } = req.body;

    // 2. Validate coachId
    if (!coachId || typeof coachId !== 'string' || !mongoose.Types.ObjectId.isValid(coachId.trim())) {
      return res.status(400).json({ error: 'Invalid or missing coachId. Must be a valid 24-character hexadecimal ObjectId.' });
    }
    const cleanCoachId = coachId.trim();

    // Prevent booking oneself
    if (cleanCoachId === req.user.id) {
      return res.status(400).json({ error: 'You cannot submit a booking request to yourself.' });
    }

    // Verify coach existence and role
    const coachUser = await User.findById(cleanCoachId);
    if (!coachUser || !coachUser.isActive || coachUser.role !== 'coach') {
      return res.status(404).json({ error: 'Coach not found or account is inactive.' });
    }

    // 3. Validate sport
    if (!sport || typeof sport !== 'string' || !COACH_DISCIPLINES.includes(sport.trim() as any)) {
      return res.status(400).json({
        error: `Invalid sport "${sport}". Allowed sports are: ${COACH_DISCIPLINES.join(', ')}.`,
      });
    }
    const cleanSport = sport.trim() as any;

    // 4. Validate venueType
    if (venueType === 'coach_home') {
      return res.status(400).json({
        error: "Coach's Home is not an available training venue. Sessions may only take place at Customer's Home or a designated Sports Ground.",
      });
    }
    if (!venueType || typeof venueType !== 'string' || !ACTIVE_VENUE_TYPES.includes(venueType.trim() as any)) {
      return res.status(400).json({
        error: `Invalid venueType "${venueType}". Allowed venue types are: ${ACTIVE_VENUE_TYPES.join(', ')}.`,
      });
    }
    const cleanVenueType = venueType.trim() as any;

    // 5. Validate date
    if (typeof date !== 'string' || !date.trim()) {
      return res.status(400).json({ error: 'Date is required and must be in YYYY-MM-DD format.' });
    }
    const cleanDate = date.trim();
    if (!isValidCalendarDate(cleanDate)) {
      return res.status(400).json({
        error: `Invalid date "${cleanDate}". Must be a valid calendar date in YYYY-MM-DD format.`,
      });
    }
    const todayStr = getKolkataDateString();
    if (cleanDate < todayStr) {
      return res.status(400).json({ error: `Cannot request a session for a date in the past (${cleanDate}).` });
    }

    // 6. Validate times & duration
    const timeValidation = validateBookingTimes(startTime, endTime);
    if (!timeValidation.valid) {
      return res.status(400).json({ error: timeValidation.error });
    }

    // 7. Validate training address
    if (
      typeof trainingAddress !== 'string' ||
      trainingAddress.trim().length < 5 ||
      trainingAddress.trim().length > 200
    ) {
      return res.status(400).json({
        error: 'Training address must be a string between 5 and 200 characters in length.',
      });
    }
    const cleanAddress = trainingAddress.trim();

    // 8. Validate customer contact phone
    const phoneValidation = validateCustomerPhone(customerPhone);
    if (!phoneValidation.valid) {
      return res.status(400).json({ error: phoneValidation.error });
    }
    const cleanPhone = customerPhone.trim();

    // 8b. Validate optional location coordinates if provided
    const rawCoords = req.body.locationCoordinates || req.body.coordinates;
    let cleanCoordinates: { latitude: number; longitude: number } | undefined = undefined;
    if (rawCoords !== undefined && rawCoords !== null) {
      if (typeof rawCoords !== 'object' || Array.isArray(rawCoords)) {
        return res.status(400).json({ error: 'Location coordinates must be an object with latitude and longitude numbers.' });
      }
      const { latitude, longitude } = rawCoords;
      if (
        typeof latitude !== 'number' ||
        isNaN(latitude) ||
        !isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        typeof longitude !== 'number' ||
        isNaN(longitude) ||
        !isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({
          error: 'Invalid coordinates. Latitude must be between -90 and 90, and longitude between -180 and 180.',
        });
      }
      cleanCoordinates = { latitude, longitude };
    }

    // Customer GPS coordinates are never attached to a Sports Ground session
    if (cleanVenueType === 'ground') {
      cleanCoordinates = undefined;
    }

    // 9. Coach Profile check & hourly rate snapshot
    const coachProfile = await CoachProfile.findOne({ userId: cleanCoachId });
    if (coachProfile) {
      if (coachProfile.disciplines && coachProfile.disciplines.length > 0 && !coachProfile.disciplines.includes(cleanSport)) {
        return res.status(400).json({
          error: `Coach ${coachUser.name} does not offer "${cleanSport}". Offered disciplines: ${coachProfile.disciplines.join(', ')}.`,
        });
      }
      if (coachProfile.venueTypes && coachProfile.venueTypes.length > 0 && !coachProfile.venueTypes.includes(cleanVenueType)) {
        return res.status(400).json({
          error: `Coach ${coachUser.name} does not support venue type "${cleanVenueType}".`,
        });
      }
    }

    // 10. Optional Coach Availability check (only check blackout dates if availability is configured)
    const coachAvailability = await CoachAvailability.findOne({ userId: cleanCoachId });
    if (coachAvailability && Array.isArray(coachAvailability.unavailableDates)) {
      if (coachAvailability.unavailableDates.includes(cleanDate)) {
        return res.status(400).json({
          error: `Coach ${coachUser.name} is unavailable on ${cleanDate} (blackout date).`,
        });
      }
    }

    // 11. Persist new booking with pending status
    const booking = new Booking({
      customerId: new mongoose.Types.ObjectId(req.user.id),
      coachId: new mongoose.Types.ObjectId(cleanCoachId),
      sport: cleanSport,
      date: cleanDate,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      startMinutes: timeValidation.startMinutes,
      endMinutes: timeValidation.endMinutes,
      durationMinutes: timeValidation.durationMinutes,
      venueType: cleanVenueType,
      trainingAddress: cleanAddress,
      customerPhone: cleanPhone,
      status: 'pending',
      paymentStatus: 'unpaid',
      hourlyRateSnapshot: coachProfile?.hourlyRate,
      locationCoordinates: cleanCoordinates,
    });

    await booking.save();

    const serialized = serializeBookingForUser(booking, req.user.id, req.user.role, {
      customerName: req.user.name,
      coachName: coachUser.name,
    });

    return res.status(201).json({
      booking: serialized,
      message: 'Booking request submitted successfully.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * List bookings scoped to authenticated user.
 * GET /api/bookings
 * Filters by customerId for parents/individuals, or coachId for coaches.
 */
export async function getBookings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const filter: Record<string, any> = {};

    if (['parent', 'individual'].includes(req.user.role)) {
      filter.customerId = req.user.id;
    } else if (req.user.role === 'coach') {
      filter.coachId = req.user.id;
    }

    // Optional status query filter
    const statusQuery = req.query.status;
    if (typeof statusQuery === 'string' && BOOKING_STATUSES.includes(statusQuery as any)) {
      filter.status = statusQuery;
    }

    const bookings = await Booking.find(filter)
      .populate('customerId', 'name')
      .populate('coachId', 'name')
      .sort({ createdAt: -1, _id: -1 });

    const serializedBookings = bookings
      .map((b) => serializeBookingForUser(b, req.user!.id, req.user!.role))
      .filter(Boolean);

    return res.status(200).json({
      bookings: serializedBookings,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Get a specific booking by ID.
 * GET /api/bookings/:id
 */
export async function getBookingById(
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

    const booking = await Booking.findById(id)
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const serialized = serializeBookingForUser(booking, req.user.id, req.user.role);
    if (!serialized) {
      return res.status(403).json({ error: 'Access forbidden. You are not a participant in this booking.' });
    }

    return res.status(200).json({ booking: serialized });
  } catch (error) {
    return next(error);
  }
}

/**
 * Accept a pending booking request (Assigned coach only).
 * PATCH /api/bookings/:id/accept
 * Prevents overlapping accepted bookings using concurrency-safe schedule lock.
 */
export async function acceptBooking(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'Access forbidden. Only coaches can accept booking requests.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(id)
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const coachIdStr = (booking.coachId?._id || booking.coachId).toString();
    if (coachIdStr !== req.user.id) {
      return res.status(403).json({ error: 'Access forbidden. You are not the assigned coach for this booking.' });
    }

    if (booking.status === 'accepted') {
      return res.status(400).json({ error: 'Booking is already accepted.' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot accept booking with status "${booking.status}". Only pending requests can be accepted.`,
      });
    }

    // Execute conflict check and state transition inside mutual exclusion lock
    let conflictError: string | null = null;

    await withCoachScheduleLock(coachIdStr, booking.date, async () => {
      // Re-check booking in case of concurrent status mutation
      const freshBooking = await Booking.findById(booking._id);
      if (!freshBooking || freshBooking.status !== 'pending') {
        conflictError = 'Booking state changed concurrently. Request is no longer pending.';
        return;
      }

      // Query for conflicting accepted bookings on the same calendar date
      const conflictingBooking = await Booking.findOne({
        coachId: booking.coachId,
        date: booking.date,
        status: 'accepted',
        _id: { $ne: booking._id },
        startMinutes: { $lt: booking.endMinutes },
        endMinutes: { $gt: booking.startMinutes },
      });

      if (conflictingBooking) {
        conflictError = `Cannot accept booking. Overlaps with an already accepted session (${conflictingBooking.startTime}–${conflictingBooking.endTime}).`;
        return;
      }

      freshBooking.status = 'accepted';
      await freshBooking.save();
      booking.status = 'accepted';
    });

    if (conflictError) {
      return res.status(409).json({ error: conflictError });
    }

    const serialized = serializeBookingForUser(booking, req.user.id, req.user.role);

    return res.status(200).json({
      booking: serialized,
      message: 'Booking accepted successfully.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Reject a pending booking request (Assigned coach only).
 * PATCH /api/bookings/:id/reject
 */
export async function rejectBooking(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'Access forbidden. Only coaches can reject booking requests.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(id)
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const coachIdStr = (booking.coachId?._id || booking.coachId).toString();
    if (coachIdStr !== req.user.id) {
      return res.status(403).json({ error: 'Access forbidden. You are not the assigned coach for this booking.' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot reject booking with status "${booking.status}". Only pending requests can be rejected.`,
      });
    }

    const { reason } = req.body || {};
    if (reason !== undefined) {
      if (typeof reason !== 'string' || reason.trim().length > MAX_REASON_LENGTH) {
        return res.status(400).json({
          error: `Rejection reason must be a string up to ${MAX_REASON_LENGTH} characters.`,
        });
      }
      booking.rejectionReason = reason.trim();
    }

    booking.status = 'rejected';
    await booking.save();

    const serialized = serializeBookingForUser(booking, req.user.id, req.user.role);

    return res.status(200).json({
      booking: serialized,
      message: 'Booking request rejected.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cancel a booking request (Customer or Coach).
 * PATCH /api/bookings/:id/cancel
 * Permitted only if status is 'pending' or 'accepted'.
 */
export async function cancelBooking(
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

    const booking = await Booking.findById(id)
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const customerIdStr = (booking.customerId?._id || booking.customerId).toString();
    const coachIdStr = (booking.coachId?._id || booking.coachId).toString();

    const isCustomer = req.user.id === customerIdStr;
    const isCoach = req.user.id === coachIdStr;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isCoach && !isAdmin) {
      return res.status(403).json({ error: 'Access forbidden. You are not authorized to cancel this booking.' });
    }

    if (!['pending', 'accepted'].includes(booking.status)) {
      return res.status(400).json({
        error: `Cannot cancel booking with status "${booking.status}". Only pending or accepted bookings can be cancelled.`,
      });
    }

    const { reason } = req.body || {};
    if (reason !== undefined) {
      if (typeof reason !== 'string' || reason.trim().length > MAX_REASON_LENGTH) {
        return res.status(400).json({
          error: `Cancellation reason must be a string up to ${MAX_REASON_LENGTH} characters.`,
        });
      }
      booking.cancellationReason = reason.trim();
    }

    booking.status = 'cancelled';
    booking.cancelledBy = isCustomer ? 'customer' : 'coach';
    // Payment status is preserved independently
    await booking.save();

    const serialized = serializeBookingForUser(booking, req.user.id, req.user.role);

    return res.status(200).json({
      booking: serialized,
      message: 'Booking cancelled successfully.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Starts a coaching session upon coach arrival (Assigned coach only).
 * PATCH /api/bookings/:id/start
 * Permitted only if status is 'accepted' (idempotent if already 'in_progress').
 * Only the assigned coach can start the coaching session.
 * Uses atomic conditional updates to prevent race conditions under concurrent requests.
 */
export async function startBookingSession(
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

    const booking = await Booking.findById(id)
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const coachIdStr = (booking.coachId?._id || booking.coachId).toString();
    const isAssignedCoach = req.user.role === 'coach' && req.user.id === coachIdStr;

    if (!isAssignedCoach) {
      return res.status(403).json({
        error: 'Access forbidden. Only the assigned coach can start this coaching session.',
      });
    }

    // Idempotent: If session is already in_progress, return existing session timestamps
    if (booking.status === 'in_progress') {
      const serialized = serializeBookingForUser(booking, req.user.id, req.user.role);
      return res.status(200).json({
        booking: serialized,
        message: 'Session is already in progress.',
      });
    }

    if (booking.status === 'completed') {
      return res.status(400).json({ error: 'Cannot start session: booking is already completed.' });
    }

    if (booking.status !== 'accepted') {
      return res.status(400).json({
        error: `Cannot start session for booking with status "${booking.status}". Only accepted bookings can be started.`,
      });
    }

    // Validate persisted duration explicitly: must be valid integer within 30-240 minutes
    const rawDuration = booking.durationMinutes;
    const durationMinutes = Number(rawDuration);
    if (
      rawDuration === undefined ||
      rawDuration === null ||
      typeof rawDuration === 'boolean' ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < MIN_BOOKING_DURATION_MINUTES ||
      durationMinutes > MAX_BOOKING_DURATION_MINUTES
    ) {
      return res.status(400).json({
        error: `Invalid booking duration (${rawDuration}). Persisted session duration must be an integer between ${MIN_BOOKING_DURATION_MINUTES} and ${MAX_BOOKING_DURATION_MINUTES} minutes.`,
      });
    }

    const now = new Date();
    const durationMs = durationMinutes * 60 * 1000;
    const expectedEnd = new Date(now.getTime() + durationMs);

    // Atomic conditional update: strictly match status 'accepted'
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        coachId: booking.coachId?._id || booking.coachId,
        status: 'accepted',
      },
      {
        $set: {
          status: 'in_progress',
          sessionStartedAt: now,
          expectedEndedAt: expectedEnd,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!updatedBooking) {
      // Failed atomic update: check latest state to handle concurrent start
      const current = await Booking.findById(id)
        .populate('customerId', 'name')
        .populate('coachId', 'name');

      if (current && current.status === 'in_progress') {
        const serialized = serializeBookingForUser(current, req.user.id, req.user.role);
        return res.status(200).json({
          booking: serialized,
          message: 'Session is already in progress.',
        });
      }

      if (current && current.status === 'completed') {
        return res.status(400).json({ error: 'Cannot start session: booking is already completed.' });
      }

      return res.status(400).json({
        error: `Cannot start session for booking with status "${current?.status || 'unknown'}". Only accepted bookings can be started.`,
      });
    }

    const serialized = serializeBookingForUser(updatedBooking, req.user.id, req.user.role);

    return res.status(200).json({
      booking: serialized,
      message: 'Coach arrival confirmed. Session started successfully.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Mark a coaching session as completed (Assigned coach only).
 * PATCH /api/bookings/:id/complete
 * Permitted only if status is strictly 'in_progress' and expectedEndedAt has elapsed.
 * Uses atomic conditional update to enforce timing and state transitions atomically.
 */
export async function completeBooking(
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

    const booking = await Booking.findById(id)
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const coachIdStr = (booking.coachId?._id || booking.coachId).toString();
    const isAssignedCoach = req.user.role === 'coach' && req.user.id === coachIdStr;

    if (!isAssignedCoach) {
      return res.status(403).json({
        error: 'Access forbidden. Only the assigned coach can mark this booking as completed.',
      });
    }

    if (booking.status === 'completed') {
      return res.status(400).json({ error: 'Booking is already completed.' });
    }

    // Strict lifecycle: Only in_progress sessions can be completed
    if (booking.status !== 'in_progress') {
      return res.status(400).json({
        error: `Cannot complete booking with status "${booking.status}". Only in-progress sessions can be completed.`,
      });
    }

    if (!booking.expectedEndedAt) {
      return res.status(400).json({
        error: 'Cannot complete session: session has not been properly started with an expected end time.',
      });
    }

    const nowMs = Date.now();
    const serverNow = new Date(nowMs);
    const expectedEndMs = new Date(booking.expectedEndedAt).getTime();

    // Strict timing: zero early-tolerance. Must be now >= expectedEndedAt
    if (nowMs < expectedEndMs) {
      const remainingSeconds = Math.ceil((expectedEndMs - nowMs) / 1000);
      return res.status(400).json({
        error: `Cannot complete session before the booked duration has elapsed. Session is in progress (${remainingSeconds}s remaining).`,
        remainingSeconds,
        expectedEndedAt: booking.expectedEndedAt,
      });
    }

    // Atomic conditional update: strictly match in_progress status and expectedEndedAt <= serverNow
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        coachId: booking.coachId?._id || booking.coachId,
        status: 'in_progress',
        expectedEndedAt: { $lte: serverNow },
      },
      {
        $set: {
          status: 'completed',
          completedAt: serverNow,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!updatedBooking) {
      // Failed atomic update: check latest document state
      const current = await Booking.findById(id)
        .populate('customerId', 'name')
        .populate('coachId', 'name');

      if (current && current.status === 'completed') {
        return res.status(400).json({ error: 'Booking is already completed.' });
      }

      if (current && current.status === 'in_progress') {
        const currentNowMs = Date.now();
        const currentEndMs = current.expectedEndedAt ? new Date(current.expectedEndedAt).getTime() : 0;
        if (currentNowMs < currentEndMs) {
          const remainingSeconds = Math.ceil((currentEndMs - currentNowMs) / 1000);
          return res.status(400).json({
            error: `Cannot complete session before the booked duration has elapsed. Session is in progress (${remainingSeconds}s remaining).`,
            remainingSeconds,
            expectedEndedAt: current.expectedEndedAt,
          });
        }
      }

      return res.status(400).json({
        error: `Cannot complete booking with status "${current?.status || 'unknown'}". Only in-progress sessions can be completed.`,
      });
    }

    const serialized = serializeBookingForUser(updatedBooking, req.user.id, req.user.role);
    if (serialized) {
      serialized.isRated = false;
      serialized.review = null;
    }

    return res.status(200).json({
      booking: serialized,
      message: 'Session completed successfully.',
    });
  } catch (error) {
    return next(error);
  }
}
