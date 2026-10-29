import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { CoachProfile } from '../models/CoachProfile';
import { CoachAvailability } from '../models/CoachAvailability';

/**
 * Public/Customer Coach Discovery
 * GET /api/coaches
 * Returns list of active coaches with their public profile fields and availability readiness.
 * Never exposes authentication credentials, emails, or internal hashes.
 */
export async function getPublicCoaches(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    // Find all active coaches
    const coachUsers = await User.find({ role: 'coach', isActive: true }).select('name role createdAt');

    if (!coachUsers || coachUsers.length === 0) {
      return res.status(200).json({ coaches: [] });
    }

    const coachIds = coachUsers.map((c) => c._id);

    // Fetch corresponding profiles
    const profiles = await CoachProfile.find({ userId: { $in: coachIds } });
    const profileMap = new Map<string, any>();
    for (const p of profiles) {
      profileMap.set(p.userId.toString(), p.toJSON ? p.toJSON() : p);
    }

    // Fetch availability indicators
    const availabilities = await CoachAvailability.find({ userId: { $in: coachIds } }).select('userId timezone slots unavailableDates');
    const availabilityMap = new Map<string, any>();
    for (const a of availabilities) {
      availabilityMap.set(a.userId.toString(), a.toJSON ? a.toJSON() : a);
    }

    // Optional query filters
    const disciplineFilter = typeof req.query.discipline === 'string' ? req.query.discipline.trim() : null;
    const locationFilter = typeof req.query.location === 'string' ? req.query.location.trim().toLowerCase() : null;

    const coaches = coachUsers
      .map((coach) => {
        const idStr = coach._id.toString();
        const profile = profileMap.get(idStr) || null;
        const availability = availabilityMap.get(idStr) || null;

        // Apply filters if provided
        if (disciplineFilter && (!profile || !profile.disciplines?.includes(disciplineFilter))) {
          return null;
        }
        if (
          locationFilter &&
          (!profile || !profile.locations?.some((l: string) => l.toLowerCase().includes(locationFilter)))
        ) {
          return null;
        }

        return {
          _id: idStr,
          name: coach.name,
          role: 'coach',
          profile: profile
            ? {
                bio: profile.bio || '',
                disciplines: profile.disciplines || [],
                specialties: profile.specialties || [],
                sessionFormats: profile.sessionFormats || [],
                venueTypes: profile.venueTypes || [],
                hourlyRate: profile.hourlyRate,
                currency: profile.currency || 'INR',
                locations: profile.locations || [],
              }
            : null,
          isConfiguredAvailability: !!(availability && availability.slots && availability.slots.length > 0),
          timezone: availability?.timezone || 'Asia/Kolkata',
        };
      })
      .filter(Boolean);

    return res.status(200).json({ coaches });
  } catch (error) {
    return next(error);
  }
}

/**
 * Get Public Details for a Specific Coach
 * GET /api/coaches/:id
 */
export async function getPublicCoachById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid coach ID format.' });
    }

    const coach = await User.findOne({ _id: id, role: 'coach', isActive: true }).select('name role createdAt');
    if (!coach) {
      return res.status(404).json({ error: 'Coach not found.' });
    }

    const profile = await CoachProfile.findOne({ userId: id });
    const availability = await CoachAvailability.findOne({ userId: id });

    return res.status(200).json({
      coach: {
        _id: coach._id.toString(),
        name: coach.name,
        role: 'coach',
        profile: profile
          ? {
              bio: profile.bio || '',
              disciplines: profile.disciplines || [],
              specialties: profile.specialties || [],
              sessionFormats: profile.sessionFormats || [],
              venueTypes: profile.venueTypes || [],
              hourlyRate: profile.hourlyRate,
              currency: profile.currency || 'INR',
              locations: profile.locations || [],
            }
          : null,
        isConfiguredAvailability: !!(availability && availability.slots && availability.slots.length > 0),
        availability: availability
          ? {
              timezone: availability.timezone,
              slots: availability.slots,
              unavailableDates: availability.unavailableDates,
            }
          : null,
      },
    });
  } catch (error) {
    return next(error);
  }
}
