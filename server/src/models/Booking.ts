import mongoose, { Document, Schema, Model } from 'mongoose';
import {
  COACH_DISCIPLINES,
  VENUE_TYPES,
  CoachDiscipline,
  VenueType,
} from './CoachProfile';
import { timeToMinutes, isValidCalendarDate, DEFAULT_TIMEZONE } from './CoachAvailability';
import { UserRole } from './User';

export {
  COACH_DISCIPLINES,
  VENUE_TYPES,
  CoachDiscipline,
  VenueType,
  isValidCalendarDate,
  DEFAULT_TIMEZONE,
};

export const BOOKING_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'completed',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ['unpaid', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const MIN_BOOKING_DURATION_MINUTES = 30;
export const MAX_BOOKING_DURATION_MINUTES = 240; // 4 hours maximum session duration
export const MIN_TRAINING_ADDRESS_LENGTH = 5;
export const MAX_TRAINING_ADDRESS_LENGTH = 200;
export const MAX_REASON_LENGTH = 500;

export const PHONE_REGEX = /^\+?[0-9]{10,15}$/;
export const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export interface IBookingCoordinates {
  latitude: number;
  longitude: number;
}

export interface IBooking {
  customerId: mongoose.Types.ObjectId;
  coachId: mongoose.Types.ObjectId;
  sport: CoachDiscipline;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  venueType: VenueType;
  trainingAddress: string;
  customerPhone: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  hourlyRateSnapshot?: number;
  rejectionReason?: string;
  cancellationReason?: string;
  cancelledBy?: 'customer' | 'coach';
  locationCoordinates?: IBookingCoordinates;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IBookingDocument extends IBooking, Document {}

/**
 * Validates start and end time boundaries for a booking:
 * - Must match 24-hour "HH:mm" format.
 * - startTime must be strictly before endTime.
 * - Duration must be between MIN_BOOKING_DURATION_MINUTES and MAX_BOOKING_DURATION_MINUTES.
 */
export function validateBookingTimes(
  startTime: string,
  endTime: string
): {
  valid: boolean;
  error?: string;
  startMinutes?: number;
  endMinutes?: number;
  durationMinutes?: number;
} {
  if (typeof startTime !== 'string' || !TIME_REGEX.test(startTime.trim())) {
    return {
      valid: false,
      error: `Invalid startTime "${startTime}". Must be a valid 24-hour time in "HH:mm" format (00:00–23:59).`,
    };
  }

  if (typeof endTime !== 'string' || !TIME_REGEX.test(endTime.trim())) {
    return {
      valid: false,
      error: `Invalid endTime "${endTime}". Must be a valid 24-hour time in "HH:mm" format (00:00–23:59).`,
    };
  }

  const startMinutes = timeToMinutes(startTime.trim());
  const endMinutes = timeToMinutes(endTime.trim());

  if (startMinutes >= endMinutes) {
    return {
      valid: false,
      error: `Invalid time range: startTime (${startTime}) must be strictly earlier than endTime (${endTime}).`,
    };
  }

  const durationMinutes = endMinutes - startMinutes;
  if (durationMinutes < MIN_BOOKING_DURATION_MINUTES) {
    return {
      valid: false,
      error: `Session duration (${durationMinutes} mins) must be at least ${MIN_BOOKING_DURATION_MINUTES} minutes.`,
    };
  }

  if (durationMinutes > MAX_BOOKING_DURATION_MINUTES) {
    return {
      valid: false,
      error: `Session duration (${durationMinutes} mins) cannot exceed ${MAX_BOOKING_DURATION_MINUTES} minutes (4 hours).`,
    };
  }

  return {
    valid: true,
    startMinutes,
    endMinutes,
    durationMinutes,
  };
}

/**
 * Validates customer contact phone format:
 * - 10 to 15 digits, optional leading '+' symbol.
 */
export function validateCustomerPhone(phone: string): { valid: boolean; error?: string } {
  if (typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
    return {
      valid: false,
      error: 'Invalid customer phone number. Must contain 10 to 15 digits (e.g. "+919876543210" or "9876543210").',
    };
  }
  return { valid: true };
}

/**
 * Checks whether two time intervals on the same day overlap.
 * Adjacent slots touching at boundary (e.g. 09:00-10:00 and 10:00-11:00) DO NOT overlap.
 */
export function doIntervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && endA > startB;
}

/**
 * Asia/Kolkata offset is UTC+05:30 (19,800,000 milliseconds).
 * India does not observe Daylight Saving Time.
 */
export const ASIA_KOLKATA_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Returns the calendar date string in "YYYY-MM-DD" format for Asia/Kolkata.
 * Accepts an optional Date instance (defaults to current system time).
 * Uses Intl.DateTimeFormat with 'Asia/Kolkata' timezone, with fallback
 * to deterministic UTC+05:30 offset calculation.
 */
export function getKolkataDateString(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback if environment lacks timezone data
  }
  const kolkataMs = date.getTime() + ASIA_KOLKATA_OFFSET_MS;
  return new Date(kolkataMs).toISOString().split('T')[0];
}

const BookingSchema = new Schema<IBookingDocument>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer ID is required.'],
      immutable: true,
      index: true,
    },
    coachId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Coach ID is required.'],
      immutable: true,
      index: true,
    },
    sport: {
      type: String,
      required: [true, 'Sport discipline is required.'],
      enum: {
        values: COACH_DISCIPLINES,
        message: 'Invalid sport "{VALUE}". Allowed sports are: boxing, wushu, kickboxing.',
      },
    },
    date: {
      type: String,
      required: [true, 'Session date is required.'],
      validate: {
        validator: (v: string) => isValidCalendarDate(v),
        message: 'Invalid date "{VALUE}". Must be a valid calendar date in YYYY-MM-DD format.',
      },
      index: true,
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required.'],
      match: [TIME_REGEX, 'Start time must be in 24-hour HH:mm format.'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required.'],
      match: [TIME_REGEX, 'End time must be in 24-hour HH:mm format.'],
    },
    startMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 1439,
      index: true,
    },
    endMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 1440,
      index: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: [MIN_BOOKING_DURATION_MINUTES, `Duration must be at least ${MIN_BOOKING_DURATION_MINUTES} minutes.`],
      max: [MAX_BOOKING_DURATION_MINUTES, `Duration cannot exceed ${MAX_BOOKING_DURATION_MINUTES} minutes.`],
    },
    venueType: {
      type: String,
      required: [true, 'Venue type is required.'],
      enum: {
        values: VENUE_TYPES,
        message: 'Invalid venue type "{VALUE}". Allowed venue types are: coach_home, customer_home, ground.',
      },
    },
    trainingAddress: {
      type: String,
      required: [true, 'Training address/location is required.'],
      trim: true,
      minlength: [
        MIN_TRAINING_ADDRESS_LENGTH,
        `Training address must be at least ${MIN_TRAINING_ADDRESS_LENGTH} characters.`,
      ],
      maxlength: [
        MAX_TRAINING_ADDRESS_LENGTH,
        `Training address cannot exceed ${MAX_TRAINING_ADDRESS_LENGTH} characters.`,
      ],
    },
    customerPhone: {
      type: String,
      required: [true, 'Customer phone number is required.'],
      trim: true,
      match: [PHONE_REGEX, 'Please provide a valid 10 to 15 digit contact phone number.'],
    },
    status: {
      type: String,
      enum: {
        values: BOOKING_STATUSES,
        message: 'Invalid booking status "{VALUE}".',
      },
      default: 'pending',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: {
        values: PAYMENT_STATUSES,
        message: 'Invalid payment status "{VALUE}".',
      },
      default: 'unpaid',
      index: true,
    },
    hourlyRateSnapshot: {
      type: Number,
      min: 0,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [MAX_REASON_LENGTH, `Rejection reason cannot exceed ${MAX_REASON_LENGTH} characters.`],
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: [MAX_REASON_LENGTH, `Cancellation reason cannot exceed ${MAX_REASON_LENGTH} characters.`],
    },
    cancelledBy: {
      type: String,
      enum: ['customer', 'coach'],
    },
    locationCoordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
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

// Compound index for fast conflict checking and coach incoming schedule queries
BookingSchema.index({ coachId: 1, date: 1, status: 1 });
// Compound index for customer booking queries
BookingSchema.index({ customerId: 1, status: 1 });

export const Booking: Model<IBookingDocument> =
  (mongoose.models.Booking as Model<IBookingDocument>) ||
  mongoose.model<IBookingDocument>('Booking', BookingSchema);

/**
 * Sanitizes and serializes a booking document for a requesting user.
 *
 * Privacy Rules:
 * 1. Admin: Receives full booking details.
 * 2. Customer (Booking Owner): Receives full booking details (owns contact info).
 * 3. Coach (Assigned Coach):
 *    - If status is 'accepted' or 'completed': Receives full customer phone and training address.
 *    - If status is 'pending', 'rejected', or 'cancelled': customerPhone and trainingAddress are REDACTED.
 * 4. Third-party users: Returns null (unauthorized to view).
 */
export function serializeBookingForUser(
  bookingDoc: any,
  requestingUserId: string,
  requestingUserRole: UserRole,
  populatedNames?: { customerName?: string; coachName?: string }
): Record<string, unknown> | null {
  const b = bookingDoc.toObject ? bookingDoc.toObject() : { ...bookingDoc };
  const customerIdStr = (b.customerId?._id || b.customerId)?.toString();
  const coachIdStr = (b.coachId?._id || b.coachId)?.toString();

  const isCustomer = requestingUserId === customerIdStr;
  const isCoach = requestingUserId === coachIdStr;
  const isAdmin = requestingUserRole === 'admin';

  if (!isCustomer && !isCoach && !isAdmin) {
    return null; // Forbidden / Access Denied
  }

  // Populate names if provided or already in populated object
  const customerName =
    populatedNames?.customerName ||
    (typeof b.customerId === 'object' && b.customerId?.name ? b.customerId.name : undefined);
  const coachName =
    populatedNames?.coachName ||
    (typeof b.coachId === 'object' && b.coachId?.name ? b.coachId.name : undefined);

  const base: Record<string, unknown> = {
    _id: b._id?.toString(),
    customerId: customerIdStr,
    coachId: coachIdStr,
    customerName,
    coachName,
    sport: b.sport,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    startMinutes: b.startMinutes,
    endMinutes: b.endMinutes,
    durationMinutes: b.durationMinutes,
    venueType: b.venueType,
    status: b.status,
    paymentStatus: b.paymentStatus,
    hourlyRateSnapshot: b.hourlyRateSnapshot,
    rejectionReason: b.rejectionReason,
    cancellationReason: b.cancellationReason,
    cancelledBy: b.cancelledBy,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };

  // Contact and location privacy filter
  if (isCustomer || isAdmin) {
    // Customer and Admin can always see contact details and location coordinates
    base.customerPhone = b.customerPhone;
    base.trainingAddress = b.trainingAddress;
    base.locationCoordinates = b.locationCoordinates;
    base.coordinates = b.locationCoordinates;
  } else if (isCoach) {
    // 1. Customer contact phone: strictly authorized ONLY when request is 'accepted' or 'completed'
    if (b.status === 'accepted' || b.status === 'completed') {
      base.customerPhone = b.customerPhone;
    } else {
      base.customerPhone = undefined;
    }

    // 2. Destination address & coordinates: visible for 'pending' (to assess travel distance before accepting),
    //    'accepted', and 'completed'. Strictly REDACTED for 'rejected' and 'cancelled' bookings.
    if (b.status === 'pending' || b.status === 'accepted' || b.status === 'completed') {
      base.trainingAddress = b.trainingAddress;
      base.locationCoordinates = b.locationCoordinates;
      base.coordinates = b.locationCoordinates;
    } else {
      base.trainingAddress = undefined;
      base.locationCoordinates = undefined;
      base.coordinates = undefined;
    }
  }

  return base;
}
