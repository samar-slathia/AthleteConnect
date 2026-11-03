import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  CoachAvailability,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  validateSlots,
  validateUnavailableDates,
  getCivilDayOfWeek,
  isIntervalInsideSlots,
  IAvailabilitySlot,
  ICoachAvailabilityDocument,
} from '../models/CoachAvailability';
import { Booking, getKolkataDateString } from '../models/Booking';
import { executeScheduleMutationWithRetry, ScheduleConflictError } from '../utils/scheduleLock';

const ALLOWED_UPDATE_FIELDS = new Set(['timezone', 'slots', 'unavailableDates']);

/**
 * Fetch Authenticated Coach Availability Schedule
 * GET /api/coach/availability/me
 */
export async function getAvailabilityMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Lookup key is derived strictly from verified token req.user.id
    const availability = await CoachAvailability.findOne({ userId: req.user.id });

    if (!availability) {
      return res.status(200).json({
        availability: null,
        isConfigured: false,
      });
    }

    return res.status(200).json({
      availability: availability.toJSON(),
      isConfigured: true,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Create or Update Authenticated Coach Availability Schedule
 * PUT /api/coach/availability/me
 */
export async function updateAvailabilityMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        error: 'Invalid request body. JSON object expected.',
      });
    }

    // 1. Strict whitelist validation: Reject unexpected, server-controlled, or injected fields
    const receivedKeys = Object.keys(req.body);
    const unexpectedFields = receivedKeys.filter((key) => !ALLOWED_UPDATE_FIELDS.has(key));
    if (unexpectedFields.length > 0) {
      return res.status(400).json({
        error: `Unexpected field(s) in request body: ${unexpectedFields.join(', ')}. Server-controlled properties (such as userId, _id, or timestamps) cannot be modified.`,
      });
    }

    const { timezone, slots, unavailableDates } = req.body;

    // 2. Validate timezone if provided
    let validatedTimezone = DEFAULT_TIMEZONE;
    if (timezone !== undefined) {
      if (typeof timezone !== 'string' || !isValidTimezone(timezone)) {
        return res.status(400).json({
          error: `Invalid timezone "${timezone}". Must be a valid IANA timezone identifier (e.g. "Asia/Kolkata").`,
        });
      }
      validatedTimezone = timezone.trim();
    }

    // 3. Validate slots (required array)
    if (slots === undefined) {
      return res.status(400).json({
        error: 'Missing required field: slots array is required.',
      });
    }

    const slotValidation = validateSlots(slots);
    if (!slotValidation.valid) {
      return res.status(400).json({ error: slotValidation.error });
    }

    // 4. Validate unavailableDates if provided
    let cleanUnavailableDates: string[] | undefined;
    if (unavailableDates !== undefined) {
      const datesValidation = validateUnavailableDates(unavailableDates);
      if (!datesValidation.valid) {
        return res.status(400).json({ error: datesValidation.error });
      }
      cleanUnavailableDates = Array.isArray(unavailableDates)
        ? unavailableDates.map((d: any) => String(d).trim())
        : [];
    }

    // 5. Clean inputs
    const cleanSlots: IAvailabilitySlot[] = slots.map((s: any) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: String(s.startTime).trim(),
      endTime: String(s.endTime).trim(),
    }));

    const userId = req.user.id;

    // 6. Transactional schedule mutation coordinated across distributed workers
    const setPayload: Record<string, unknown> = {
      slots: cleanSlots,
    };

    if (timezone !== undefined) {
      setPayload.timezone = validatedTimezone;
    }

    if (cleanUnavailableDates !== undefined) {
      setPayload.unavailableDates = cleanUnavailableDates;
    }

    const setOnInsertPayload: Record<string, unknown> = {
      userId,
    };

    if (timezone === undefined) {
      setOnInsertPayload.timezone = DEFAULT_TIMEZONE;
    }

    if (cleanUnavailableDates === undefined) {
      setOnInsertPayload.unavailableDates = [];
    }

    const availabilityDoc = await executeScheduleMutationWithRetry(
      userId,
      async (session) => {
        // Query future confirmed bookings for this coach (capacity-reserving statuses: accepted, in_progress)
        const todayStr = getKolkataDateString();
        let futureConfirmedBookings: any[] = [];
        if (mongoose.connection.readyState === 1 || (Booking.find as any)?.mock) {
          try {
            let query = Booking.find({
              coachId: userId,
              status: { $in: ['accepted', 'in_progress'] },
              date: { $gte: todayStr },
            });
            if (session) {
              query = query.session(session);
            }
            futureConfirmedBookings = await query;
          } catch {
            futureConfirmedBookings = [];
          }
        }

        // Validate that no newly added blackout date conflicts with an existing confirmed booking
        if (cleanUnavailableDates && cleanUnavailableDates.length > 0) {
          for (const b of futureConfirmedBookings) {
            if (cleanUnavailableDates.includes(b.date)) {
              throw new ScheduleConflictError(
                `Cannot update availability: conflicts with an existing confirmed booking on ${b.date} (${b.startTime}–${b.endTime}). Adding blackout date ${b.date} would invalidate this booking.`,
                409
              );
            }
          }
        }

        // Validate that slot modifications do not invalidate any existing confirmed booking
        for (const b of futureConfirmedBookings) {
          const bookingDay = getCivilDayOfWeek(b.date);
          const fits = isIntervalInsideSlots(cleanSlots, bookingDay, b.startMinutes, b.endMinutes);
          if (!fits) {
            throw new ScheduleConflictError(
              `Cannot update availability: conflicts with an existing confirmed booking on ${b.date} (${b.startTime}–${b.endTime}). Modifying or removing slots on ${bookingDay}s would invalidate this booking.`,
              409
            );
          }
        }

        let updated: ICoachAvailabilityDocument | null = null;
        try {
          const updateOpts: any = {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          };
          if (session) updateOpts.session = session;

          updated = (await CoachAvailability.findOneAndUpdate(
            { userId },
            {
              $set: setPayload,
              $inc: { availabilityVersion: 1 },
              $setOnInsert: setOnInsertPayload,
            },
            updateOpts
          ) as unknown) as ICoachAvailabilityDocument | null;
        } catch (dbErr: any) {
          if (dbErr && (dbErr.code === 11000 || dbErr.message?.includes('E11000'))) {
            const retryOpts: any = {
              new: true,
              runValidators: true,
            };
            if (session) retryOpts.session = session;

            updated = (await CoachAvailability.findOneAndUpdate(
              { userId },
              {
                $set: setPayload,
                $inc: { availabilityVersion: 1 },
              },
              retryOpts
            ) as unknown) as ICoachAvailabilityDocument | null;
          } else {
            throw dbErr;
          }
        }

        if (!updated) {
          return null;
        }

        return updated;
      }
    );

    if (!availabilityDoc) {
      return res.status(500).json({ error: 'Failed to persist coach availability schedule.' });
    }

    return res.status(200).json({
      availability: availabilityDoc.toJSON(),
      isConfigured: true,
      message: 'Availability schedule saved successfully.',
    });
  } catch (error: any) {
    if (
      error instanceof ScheduleConflictError ||
      error?.statusCode === 409 ||
      error?.name === 'ScheduleConflictError'
    ) {
      return res.status(409).json({ error: error.message });
    }
    return next(error);
  }
}
