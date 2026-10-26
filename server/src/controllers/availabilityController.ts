import { Request, Response, NextFunction } from 'express';
import {
  CoachAvailability,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  validateSlots,
  validateUnavailableDates,
  IAvailabilitySlot,
  ICoachAvailabilityDocument,
} from '../models/CoachAvailability';

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

    // 6. Safe persistence with atomic upsert scoped exclusively to req.user.id
    let availabilityDoc: ICoachAvailabilityDocument | null = null;

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
      userId: req.user.id,
    };

    if (timezone === undefined) {
      setOnInsertPayload.timezone = DEFAULT_TIMEZONE;
    }

    if (cleanUnavailableDates === undefined) {
      setOnInsertPayload.unavailableDates = [];
    }

    try {
      availabilityDoc = await CoachAvailability.findOneAndUpdate(
        { userId: req.user.id },
        {
          $set: setPayload,
          $setOnInsert: setOnInsertPayload,
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );
    } catch (dbErr: any) {
      // In case of a concurrent first-save race condition (E11000 duplicate key on unique userId index)
      if (dbErr && (dbErr.code === 11000 || dbErr.message?.includes('E11000'))) {
        try {
          availabilityDoc = await CoachAvailability.findOneAndUpdate(
            { userId: req.user.id },
            { $set: setPayload },
            {
              new: true,
              runValidators: true,
            }
          );
        } catch (retryErr) {
          return next(retryErr);
        }
      } else {
        throw dbErr;
      }
    }

    if (!availabilityDoc) {
      return res.status(500).json({ error: 'Failed to persist coach availability schedule.' });
    }

    return res.status(200).json({
      availability: availabilityDoc.toJSON(),
      isConfigured: true,
      message: 'Availability schedule saved successfully.',
    });
  } catch (error) {
    return next(error);
  }
}
