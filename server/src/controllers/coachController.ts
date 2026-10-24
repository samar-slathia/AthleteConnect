import { Request, Response, NextFunction } from 'express';
import {
  CoachProfile,
  COACH_DISCIPLINES,
  SESSION_FORMATS,
  VENUE_TYPES,
  MIN_HOURLY_RATE,
  MAX_HOURLY_RATE,
  MAX_BIO_LENGTH,
  MAX_DISCIPLINES_COUNT,
  MAX_SPECIALTIES_COUNT,
  MAX_SPECIALTY_LENGTH,
  MAX_SESSION_FORMATS_COUNT,
  MAX_VENUE_TYPES_COUNT,
  MAX_LOCATIONS_COUNT,
  MAX_LOCATION_LENGTH,
  DEFAULT_CURRENCY,
  calculateProfileCompleteness,
  CoachDiscipline,
  SessionFormat,
  VenueType,
} from '../models/CoachProfile';

const ALLOWED_UPDATE_FIELDS = new Set([
  'bio',
  'disciplines',
  'specialties',
  'sessionFormats',
  'venueTypes',
  'hourlyRate',
  'locations',
]);

/**
 * Fetch Authenticated Coach Profile
 * GET /api/coach/profile/me
 */
export async function getProfileMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const profile = await CoachProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(200).json({
        profile: null,
        isComplete: false,
      });
    }

    return res.status(200).json({
      profile: profile.toJSON(),
      isComplete: calculateProfileCompleteness(profile),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Create or Update Authenticated Coach Profile
 * PUT /api/coach/profile/me
 */
export async function updateProfileMe(
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
        error: `Unexpected field(s) in request body: ${unexpectedFields.join(', ')}. Server-controlled properties (such as userId, isPublished, currency, or verification fields) cannot be modified.`,
      });
    }

    const {
      bio,
      disciplines,
      specialties,
      sessionFormats,
      venueTypes,
      hourlyRate,
      locations,
    } = req.body;

    // 2. Validate bio (optional string up to MAX_BIO_LENGTH)
    if (bio !== undefined && bio !== null) {
      if (typeof bio !== 'string') {
        return res.status(400).json({ error: 'bio must be a string.' });
      }
      if (bio.trim().length > MAX_BIO_LENGTH) {
        return res.status(400).json({
          error: `Bio cannot exceed ${MAX_BIO_LENGTH} characters.`,
        });
      }
    }

    // 3. Validate disciplines (optional array of COACH_DISCIPLINES, unique, max 3)
    if (disciplines !== undefined && disciplines !== null) {
      if (!Array.isArray(disciplines)) {
        return res.status(400).json({ error: 'disciplines must be an array.' });
      }
      if (disciplines.length > MAX_DISCIPLINES_COUNT) {
        return res.status(400).json({
          error: `Disciplines cannot exceed ${MAX_DISCIPLINES_COUNT} items.`,
        });
      }
      for (const disc of disciplines) {
        if (typeof disc !== 'string' || !COACH_DISCIPLINES.includes(disc as CoachDiscipline)) {
          return res.status(400).json({
            error: `Invalid discipline "${disc}". Allowed disciplines are: ${COACH_DISCIPLINES.join(', ')}.`,
          });
        }
      }
      if (new Set(disciplines).size !== disciplines.length) {
        return res.status(400).json({ error: 'Duplicate disciplines are not permitted.' });
      }
    }

    // 4. Validate specialties (optional array of strings, unique, max 5, max 40 chars each)
    if (specialties !== undefined && specialties !== null) {
      if (!Array.isArray(specialties)) {
        return res.status(400).json({ error: 'specialties must be an array.' });
      }
      if (specialties.length > MAX_SPECIALTIES_COUNT) {
        return res.status(400).json({
          error: `Specialties cannot exceed ${MAX_SPECIALTIES_COUNT} items.`,
        });
      }
      const seenSpecialties = new Set<string>();
      for (const spec of specialties) {
        if (typeof spec !== 'string') {
          return res.status(400).json({ error: 'Each specialty must be a string.' });
        }
        const trimmed = spec.trim();
        if (trimmed.length > MAX_SPECIALTY_LENGTH) {
          return res.status(400).json({
            error: `Specialty "${trimmed}" cannot exceed ${MAX_SPECIALTY_LENGTH} characters.`,
          });
        }
        const lower = trimmed.toLowerCase();
        if (seenSpecialties.has(lower)) {
          return res.status(400).json({ error: 'Duplicate specialties are not permitted.' });
        }
        seenSpecialties.add(lower);
      }
    }

    // 5. Validate sessionFormats (optional array of SESSION_FORMATS, unique, max 2)
    if (sessionFormats !== undefined && sessionFormats !== null) {
      if (!Array.isArray(sessionFormats)) {
        return res.status(400).json({ error: 'sessionFormats must be an array.' });
      }
      if (sessionFormats.length > MAX_SESSION_FORMATS_COUNT) {
        return res.status(400).json({
          error: `Session formats cannot exceed ${MAX_SESSION_FORMATS_COUNT} items.`,
        });
      }
      for (const fmt of sessionFormats) {
        if (typeof fmt !== 'string' || !SESSION_FORMATS.includes(fmt as SessionFormat)) {
          return res.status(400).json({
            error: `Invalid session format "${fmt}". Allowed formats are: ${SESSION_FORMATS.join(', ')}.`,
          });
        }
      }
      if (new Set(sessionFormats).size !== sessionFormats.length) {
        return res.status(400).json({ error: 'Duplicate session formats are not permitted.' });
      }
    }

    // 6. Validate venueTypes (optional array of VENUE_TYPES, unique, max 3)
    if (venueTypes !== undefined && venueTypes !== null) {
      if (!Array.isArray(venueTypes)) {
        return res.status(400).json({ error: 'venueTypes must be an array.' });
      }
      if (venueTypes.length > MAX_VENUE_TYPES_COUNT) {
        return res.status(400).json({
          error: `Venue types cannot exceed ${MAX_VENUE_TYPES_COUNT} items.`,
        });
      }
      for (const vType of venueTypes) {
        if (typeof vType !== 'string' || !VENUE_TYPES.includes(vType as VenueType)) {
          return res.status(400).json({
            error: `Invalid venue type "${vType}". Allowed venue types are: ${VENUE_TYPES.join(', ')}.`,
          });
        }
      }
      if (new Set(venueTypes).size !== venueTypes.length) {
        return res.status(400).json({ error: 'Duplicate venue types are not permitted.' });
      }
    }

    // 7. Validate hourlyRate (optional number between MIN_HOURLY_RATE and MAX_HOURLY_RATE, max 2 decimals)
    if (hourlyRate !== undefined && hourlyRate !== null) {
      if (typeof hourlyRate !== 'number' || isNaN(hourlyRate) || !isFinite(hourlyRate)) {
        return res.status(400).json({ error: 'hourlyRate must be a valid number.' });
      }
      if (hourlyRate < MIN_HOURLY_RATE || hourlyRate > MAX_HOURLY_RATE) {
        return res.status(400).json({
          error: `Hourly rate must be between ₹${MIN_HOURLY_RATE} and ₹${MAX_HOURLY_RATE}.`,
        });
      }
      if (Number(hourlyRate.toFixed(2)) !== hourlyRate) {
        return res.status(400).json({
          error: 'Hourly rate can have at most two decimal places.',
        });
      }
    }

    // 8. Validate locations (optional array of strings, unique, max 5, max 100 chars each)
    if (locations !== undefined && locations !== null) {
      if (!Array.isArray(locations)) {
        return res.status(400).json({ error: 'locations must be an array.' });
      }
      if (locations.length > MAX_LOCATIONS_COUNT) {
        return res.status(400).json({
          error: `Locations cannot exceed ${MAX_LOCATIONS_COUNT} items.`,
        });
      }
      const seenLocations = new Set<string>();
      for (const loc of locations) {
        if (typeof loc !== 'string') {
          return res.status(400).json({ error: 'Each location must be a string.' });
        }
        const trimmed = loc.trim();
        if (trimmed.length > MAX_LOCATION_LENGTH) {
          return res.status(400).json({
            error: `Location "${trimmed}" cannot exceed ${MAX_LOCATION_LENGTH} characters.`,
          });
        }
        const lower = trimmed.toLowerCase();
        if (seenLocations.has(lower)) {
          return res.status(400).json({ error: 'Duplicate locations are not permitted.' });
        }
        seenLocations.add(lower);
      }
    }

    // 9. Load existing profile or initialize new one bound exclusively to authenticated req.user.id
    let profile = await CoachProfile.findOne({ userId: req.user.id });
    if (!profile) {
      profile = new CoachProfile({
        userId: req.user.id,
        currency: DEFAULT_CURRENCY,
        isPublished: false,
      });
    }

    // 10. Apply partial updates (omitted fields remain unchanged; explicitly passed empty values clear)
    if (bio !== undefined) {
      profile.bio = bio === null ? '' : bio.trim();
    }
    if (disciplines !== undefined) {
      profile.disciplines = disciplines === null ? [] : disciplines;
    }
    if (specialties !== undefined) {
      profile.specialties =
        specialties === null
          ? []
          : specialties.map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    }
    if (sessionFormats !== undefined) {
      profile.sessionFormats = sessionFormats === null ? [] : sessionFormats;
    }
    if (venueTypes !== undefined) {
      profile.venueTypes = venueTypes === null ? [] : venueTypes;
    }
    if (hourlyRate !== undefined) {
      profile.hourlyRate = hourlyRate === null ? undefined : hourlyRate;
    }
    if (locations !== undefined) {
      profile.locations =
        locations === null
          ? []
          : locations.map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    }

    await profile.save();

    const isComplete = calculateProfileCompleteness(profile);

    return res.status(200).json({
      profile: profile.toJSON(),
      isComplete,
      message: 'Coach profile saved successfully.',
    });
  } catch (error) {
    return next(error);
  }
}
