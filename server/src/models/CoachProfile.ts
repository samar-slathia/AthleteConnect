import mongoose, { Document, Schema, Model } from 'mongoose';

export const COACH_DISCIPLINES = ['boxing', 'wushu', 'kickboxing'] as const;
export const SESSION_FORMATS = ['one_on_one', 'small_group'] as const;
export const VENUE_TYPES = ['coach_home', 'customer_home', 'ground'] as const;

export type CoachDiscipline = (typeof COACH_DISCIPLINES)[number];
export type SessionFormat = (typeof SESSION_FORMATS)[number];
export type VenueType = (typeof VENUE_TYPES)[number];

export const MIN_HOURLY_RATE = 100;
export const MAX_HOURLY_RATE = 20000;
export const MAX_BIO_LENGTH = 1000;
export const MAX_DISCIPLINES_COUNT = 3;
export const MAX_SPECIALTIES_COUNT = 5;
export const MAX_SPECIALTY_LENGTH = 40;
export const MAX_SESSION_FORMATS_COUNT = 2;
export const MAX_VENUE_TYPES_COUNT = 3;
export const MAX_LOCATIONS_COUNT = 5;
export const MAX_LOCATION_LENGTH = 100;
export const DEFAULT_CURRENCY = 'INR';

export interface ICoachProfile {
  userId: mongoose.Types.ObjectId;
  bio?: string;
  disciplines: CoachDiscipline[];
  specialties: string[];
  sessionFormats: SessionFormat[];
  venueTypes: VenueType[];
  hourlyRate?: number;
  currency: string;
  locations: string[];
  isPublished: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICoachProfileDocument extends ICoachProfile, Document {}

/**
 * Calculates whether a coach profile is complete for operational readiness.
 * Completeness requires: non-blank bio, at least 1 discipline, at least 1 session format,
 * at least 1 venue type, a valid hourly rate within range, and at least 1 non-empty location.
 *
 * NOTE: Completeness relates solely to profile data readiness and MUST NEVER imply that
 * a coach's identity or credentials have been independently verified by platform administration.
 */
export function calculateProfileCompleteness(
  profile: Partial<ICoachProfile> | null | undefined
): boolean {
  if (!profile) return false;

  const hasBio = typeof profile.bio === 'string' && profile.bio.trim().length > 0;
  const hasDiscipline = Array.isArray(profile.disciplines) && profile.disciplines.length > 0;
  const hasSessionFormat =
    Array.isArray(profile.sessionFormats) && profile.sessionFormats.length > 0;
  const hasVenueType = Array.isArray(profile.venueTypes) && profile.venueTypes.length > 0;
  const hasHourlyRate =
    typeof profile.hourlyRate === 'number' &&
    !isNaN(profile.hourlyRate) &&
    isFinite(profile.hourlyRate) &&
    profile.hourlyRate >= MIN_HOURLY_RATE &&
    profile.hourlyRate <= MAX_HOURLY_RATE;
  const hasLocation =
    Array.isArray(profile.locations) &&
    profile.locations.some((loc) => typeof loc === 'string' && loc.trim().length > 0);

  return (
    hasBio &&
    hasDiscipline &&
    hasSessionFormat &&
    hasVenueType &&
    hasHourlyRate &&
    hasLocation
  );
}

const CoachProfileSchema = new Schema<ICoachProfileDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required.'],
      unique: true,
      immutable: true,
      index: true,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [MAX_BIO_LENGTH, `Bio cannot exceed ${MAX_BIO_LENGTH} characters.`],
      default: '',
    },
    disciplines: {
      type: [
        {
          type: String,
          enum: {
            values: COACH_DISCIPLINES,
            message:
              'Invalid discipline "{VALUE}". Allowed disciplines are: boxing, wushu, kickboxing.',
          },
        },
      ],
      validate: [
        {
          validator: (v: string[]) => !v || v.length <= MAX_DISCIPLINES_COUNT,
          message: `Disciplines cannot exceed ${MAX_DISCIPLINES_COUNT} items.`,
        },
        {
          validator: (v: string[]) => !v || new Set(v).size === v.length,
          message: 'Duplicate disciplines are not permitted.',
        },
      ],
      default: [],
    },
    specialties: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: [
            MAX_SPECIALTY_LENGTH,
            `Specialty cannot exceed ${MAX_SPECIALTY_LENGTH} characters.`,
          ],
        },
      ],
      validate: [
        {
          validator: (v: string[]) => !v || v.length <= MAX_SPECIALTIES_COUNT,
          message: `Specialties cannot exceed ${MAX_SPECIALTIES_COUNT} items.`,
        },
        {
          validator: (v: string[]) =>
            !v || new Set(v.map((s) => s.trim().toLowerCase())).size === v.length,
          message: 'Duplicate specialties are not permitted.',
        },
      ],
      default: [],
    },
    sessionFormats: {
      type: [
        {
          type: String,
          enum: {
            values: SESSION_FORMATS,
            message:
              'Invalid session format "{VALUE}". Allowed formats are: one_on_one, small_group.',
          },
        },
      ],
      validate: [
        {
          validator: (v: string[]) => !v || v.length <= MAX_SESSION_FORMATS_COUNT,
          message: `Session formats cannot exceed ${MAX_SESSION_FORMATS_COUNT} items.`,
        },
        {
          validator: (v: string[]) => !v || new Set(v).size === v.length,
          message: 'Duplicate session formats are not permitted.',
        },
      ],
      default: [],
    },
    venueTypes: {
      type: [
        {
          type: String,
          enum: {
            values: VENUE_TYPES,
            message:
              'Invalid venue type "{VALUE}". Allowed venue types are: coach_home, customer_home, ground.',
          },
        },
      ],
      validate: [
        {
          validator: (v: string[]) => !v || v.length <= MAX_VENUE_TYPES_COUNT,
          message: `Venue types cannot exceed ${MAX_VENUE_TYPES_COUNT} items.`,
        },
        {
          validator: (v: string[]) => !v || new Set(v).size === v.length,
          message: 'Duplicate venue types are not permitted.',
        },
      ],
      default: [],
    },
    hourlyRate: {
      type: Number,
      min: [MIN_HOURLY_RATE, `Hourly rate must be at least ₹${MIN_HOURLY_RATE}.`],
      max: [MAX_HOURLY_RATE, `Hourly rate cannot exceed ₹${MAX_HOURLY_RATE}.`],
      validate: {
        validator: (v: number | undefined) => {
          if (v === undefined || v === null) return true;
          return Number(v.toFixed(2)) === v;
        },
        message: 'Hourly rate can have at most two decimal places.',
      },
    },
    currency: {
      type: String,
      default: DEFAULT_CURRENCY,
      enum: {
        values: [DEFAULT_CURRENCY],
        message: `Only ${DEFAULT_CURRENCY} currency is supported.`,
      },
      immutable: true,
    },
    locations: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: [
            MAX_LOCATION_LENGTH,
            `Location cannot exceed ${MAX_LOCATION_LENGTH} characters.`,
          ],
        },
      ],
      validate: [
        {
          validator: (v: string[]) => !v || v.length <= MAX_LOCATIONS_COUNT,
          message: `Locations cannot exceed ${MAX_LOCATIONS_COUNT} items.`,
        },
        {
          validator: (v: string[]) =>
            !v || new Set(v.map((l) => l.trim().toLowerCase())).size === v.length,
          message: 'Duplicate locations are not permitted.',
        },
      ],
      default: [],
    },
    isPublished: {
      type: Boolean,
      default: false,
      immutable: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const CoachProfile: Model<ICoachProfileDocument> =
  (mongoose.models.CoachProfile as Model<ICoachProfileDocument>) ||
  mongoose.model<ICoachProfileDocument>('CoachProfile', CoachProfileSchema);
