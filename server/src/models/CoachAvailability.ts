import mongoose, { Document, Schema, Model } from 'mongoose';

export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const MIN_SLOT_DURATION_MINUTES = 30;
export const MAX_SLOTS_PER_DAY = 4;
export const MAX_TOTAL_SLOTS = 28;
export const MAX_UNAVAILABLE_DATES = 30;

export const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export interface IAvailabilitySlot {
  dayOfWeek: DayOfWeek;
  startTime: string; // 24-hour "HH:mm" format (e.g. "09:00")
  endTime: string;   // 24-hour "HH:mm" format (e.g. "12:00")
}

export interface ICoachAvailability {
  userId: mongoose.Types.ObjectId;
  timezone: string;
  slots: IAvailabilitySlot[];
  unavailableDates: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICoachAvailabilityDocument extends ICoachAvailability, Document {}

/**
 * Converts a 24-hour "HH:mm" time string into minutes from midnight.
 */
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map((part) => parseInt(part, 10));
  return hours * 60 + minutes;
}

/**
 * Validates whether a given timezone string is a valid IANA timezone identifier.
 * Uses native runtime Intl support without requiring heavy external dependencies.
 */
export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a string is a real calendar date in YYYY-MM-DD format,
 * accounting for months with 30/31 days and leap years for February.
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

export interface SlotValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates recurring availability slots:
 * - Must be an array.
 * - Maximum 28 total slots across the week.
 * - Each slot must have valid dayOfWeek, startTime, and endTime in 24-hour format.
 * - endTime must be strictly after startTime within the same calendar day.
 * - Minimum slot duration is 30 minutes.
 * - No more than 4 slots per day.
 * - No overlapping slots on the same day (adjacent boundary-meeting slots are allowed).
 */
export function validateSlots(slots: unknown): SlotValidationResult {
  if (!Array.isArray(slots)) {
    return { valid: false, error: 'slots must be an array.' };
  }

  if (slots.length > MAX_TOTAL_SLOTS) {
    return {
      valid: false,
      error: `Total slots cannot exceed ${MAX_TOTAL_SLOTS} across the week.`,
    };
  }

  const slotsByDay: Record<DayOfWeek, { start: number; end: number; orig: IAvailabilitySlot }[]> = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot || typeof slot !== 'object') {
      return { valid: false, error: `Slot at index ${i} must be an object.` };
    }

    if (!DAYS_OF_WEEK.includes(slot.dayOfWeek)) {
      return {
        valid: false,
        error: `Invalid dayOfWeek "${slot.dayOfWeek}". Allowed values are: ${DAYS_OF_WEEK.join(', ')}.`,
      };
    }

    if (typeof slot.startTime !== 'string' || !TIME_REGEX.test(slot.startTime.trim())) {
      return {
        valid: false,
        error: `Invalid startTime "${slot.startTime}". Must be a valid 24-hour time in HH:mm format.`,
      };
    }

    if (typeof slot.endTime !== 'string' || !TIME_REGEX.test(slot.endTime.trim())) {
      return {
        valid: false,
        error: `Invalid endTime "${slot.endTime}". Must be a valid 24-hour time in HH:mm format.`,
      };
    }

    const startMinutes = timeToMinutes(slot.startTime.trim());
    const endMinutes = timeToMinutes(slot.endTime.trim());

    if (endMinutes <= startMinutes) {
      return {
        valid: false,
        error: `Slot end time (${slot.endTime}) must be strictly after start time (${slot.startTime}) within the same day. Cross-midnight slots are not permitted.`,
      };
    }

    const duration = endMinutes - startMinutes;
    if (duration < MIN_SLOT_DURATION_MINUTES) {
      return {
        valid: false,
        error: `Slot duration (${duration} minutes) must be at least ${MIN_SLOT_DURATION_MINUTES} minutes (${slot.startTime}–${slot.endTime}).`,
      };
    }

    slotsByDay[slot.dayOfWeek as DayOfWeek].push({
      start: startMinutes,
      end: endMinutes,
      orig: {
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime.trim(),
        endTime: slot.endTime.trim(),
      },
    });
  }

  // Validate per-day slot counts and check for overlaps
  for (const day of DAYS_OF_WEEK) {
    const daySlots = slotsByDay[day];
    if (daySlots.length > MAX_SLOTS_PER_DAY) {
      return {
        valid: false,
        error: `Cannot exceed ${MAX_SLOTS_PER_DAY} slots on ${day}. Received ${daySlots.length} slots.`,
      };
    }

    // Sort by start time to reliably detect overlaps even if incoming order is unsorted
    daySlots.sort((a, b) => a.start - b.start);

    for (let j = 0; j < daySlots.length - 1; j++) {
      const current = daySlots[j];
      const next = daySlots[j + 1];

      // Overlap condition: current ends strictly after next starts.
      // Note: adjacent slots where current.end === next.start (e.g. 09:00-12:00 and 12:00-15:00) ARE permitted.
      if (current.end > next.start) {
        return {
          valid: false,
          error: `Overlapping slots detected for ${day}: ${current.orig.startTime}–${current.orig.endTime} conflicts with ${next.orig.startTime}–${next.orig.endTime}.`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validates unavailable blackout dates:
 * - Must be an array of strings.
 * - Maximum 30 dates.
 * - Each must be a real calendar date in YYYY-MM-DD format.
 * - No duplicates allowed.
 */
export function validateUnavailableDates(dates: unknown): { valid: boolean; error?: string } {
  if (dates === undefined || dates === null) {
    return { valid: true };
  }

  if (!Array.isArray(dates)) {
    return { valid: false, error: 'unavailableDates must be an array.' };
  }

  if (dates.length > MAX_UNAVAILABLE_DATES) {
    return {
      valid: false,
      error: `unavailableDates cannot exceed ${MAX_UNAVAILABLE_DATES} dates.`,
    };
  }

  const seenDates = new Set<string>();

  for (let i = 0; i < dates.length; i++) {
    const dateItem = dates[i];
    if (typeof dateItem !== 'string') {
      return {
        valid: false,
        error: `unavailableDates item at index ${i} must be a string.`,
      };
    }

    const trimmed = dateItem.trim();
    if (!isValidCalendarDate(trimmed)) {
      return {
        valid: false,
        error: `Invalid calendar date "${trimmed}". Must be a real calendar date in YYYY-MM-DD format.`,
      };
    }

    if (seenDates.has(trimmed)) {
      return {
        valid: false,
        error: `Duplicate unavailable date detected: "${trimmed}".`,
      };
    }

    seenDates.add(trimmed);
  }

  return { valid: true };
}

const AvailabilitySlotSchema = new Schema<IAvailabilitySlot>(
  {
    dayOfWeek: {
      type: String,
      required: [true, 'dayOfWeek is required.'],
      enum: {
        values: DAYS_OF_WEEK,
        message: 'Invalid dayOfWeek "{VALUE}".',
      },
    },
    startTime: {
      type: String,
      required: [true, 'startTime is required.'],
      match: [TIME_REGEX, 'startTime must be in 24-hour HH:mm format.'],
    },
    endTime: {
      type: String,
      required: [true, 'endTime is required.'],
      match: [TIME_REGEX, 'endTime must be in 24-hour HH:mm format.'],
    },
  },
  { _id: false }
);

const CoachAvailabilitySchema = new Schema<ICoachAvailabilityDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required.'],
      unique: true,
      immutable: true,
      index: true,
    },
    timezone: {
      type: String,
      default: DEFAULT_TIMEZONE,
      required: [true, 'timezone is required.'],
      validate: {
        validator: isValidTimezone,
        message: 'Invalid IANA timezone identifier "{VALUE}".',
      },
    },
    slots: {
      type: [AvailabilitySlotSchema],
      default: [],
      validate: [
        {
          validator: (v: IAvailabilitySlot[]) => validateSlots(v).valid,
          message: (props: any) => validateSlots(props.value).error || 'Invalid slots configuration.',
        },
      ],
    },
    unavailableDates: {
      type: [String],
      default: [],
      validate: [
        {
          validator: (v: string[]) => validateUnavailableDates(v).valid,
          message: (props: any) =>
            validateUnavailableDates(props.value).error || 'Invalid unavailableDates configuration.',
        },
      ],
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

export const CoachAvailability: Model<ICoachAvailabilityDocument> =
  (mongoose.models.CoachAvailability as Model<ICoachAvailabilityDocument>) ||
  mongoose.model<ICoachAvailabilityDocument>('CoachAvailability', CoachAvailabilitySchema);
