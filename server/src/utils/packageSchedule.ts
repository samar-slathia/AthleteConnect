import { PackageType } from '../models/Booking';
import { IAvailabilitySlot, getCivilDayOfWeek, isIntervalInsideSlots } from '../models/CoachAvailability';

export interface SkippedDateInfo {
  date: string;
  reason: 'outside_working_hours' | 'blackout_date' | 'slot_conflict';
  message: string;
}

export interface PackageScheduleResult {
  packageType: PackageType;
  startDate: string;
  endDate: string;
  totalDaysInWindow: number;
  sessionDates: string[];
  sessionCount: number;
  skippedDates: SkippedDateInfo[];
  isValid: boolean;
  isInvalid: boolean;
  invalidationReason?: string;
}

/**
 * Pure UTC calendar arithmetic to add days to a YYYY-MM-DD date string
 * without suffering from daylight saving time or local timezone offset drift.
 */
export function addDaysToDateString(dateStr: string, daysToAdd: number): string {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Returns the calendar window duration in days for each package tier:
 * - single: 1 day
 * - weekly: 7 days
 * - monthly: 30 days
 */
export function getPackageDurationDays(packageType: PackageType): number {
  switch (packageType) {
    case 'weekly':
      return 7;
    case 'monthly':
      return 30;
    case 'single':
    default:
      return 1;
  }
}

/**
 * Generates valid package session dates across the package duration window.
 *
 * Rules:
 * 1. Iterates from startDate through startDate + (durationDays - 1).
 * 2. Matches each date's civil day of week against the coach's recurring weekly availability slots.
 * 3. Filters out coach blackout dates (unavailableDates).
 * 4. Filters out existing accepted or in_progress bookings on the coach's calendar for overlapping hours.
 * 5. Returns all valid session dates, total count, start/end dates, and list of skipped dates with reasons.
 */
export function generatePackageSchedule(params: {
  startDate: string;
  packageType: PackageType;
  startTime: string;
  endTime: string;
  coachAvailabilitySlots: IAvailabilitySlot[];
  unavailableDates?: string[];
  existingBookings?: Array<{ date: string; startMinutes: number; endMinutes: number }>;
}): PackageScheduleResult {
  const {
    startDate,
    packageType,
    startTime,
    endTime,
    coachAvailabilitySlots = [],
    unavailableDates = [],
    existingBookings = [],
  } = params;

  const totalDays = getPackageDurationDays(packageType);
  const endDate = addDaysToDateString(startDate, totalDays - 1);

  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  const validSessionDates: string[] = [];
  const skippedDates: SkippedDateInfo[] = [];
  let invalidationReason: string | undefined = undefined;

  for (let i = 0; i < totalDays; i++) {
    const currentDate = addDaysToDateString(startDate, i);
    const dayOfWeek = getCivilDayOfWeek(currentDate);

    // 1. Check if coach availability has working interval covering startMinutes to endMinutes
    const fitsInSlot = isIntervalInsideSlots(
      coachAvailabilitySlots,
      dayOfWeek,
      startMinutes,
      endMinutes
    );
    if (!fitsInSlot) {
      skippedDates.push({
        date: currentDate,
        reason: 'outside_working_hours',
        message: `Outside coach configured working hours on ${dayOfWeek} (${currentDate}).`,
      });
      continue;
    }

    // 2. Normally scheduled coaching day - check blackout date
    if (unavailableDates.includes(currentDate)) {
      skippedDates.push({
        date: currentDate,
        reason: 'blackout_date',
        message: `Coach has marked ${currentDate} as an unavailable date.`,
      });
      if (!invalidationReason) {
        invalidationReason = `Coach is unavailable on ${currentDate} (blackout date).`;
      }
      continue;
    }

    // 3. Normally scheduled coaching day - check conflicting existing bookings
    const hasConflict = existingBookings.some(
      (b) => b.date === currentDate && b.startMinutes < endMinutes && b.endMinutes > startMinutes
    );
    if (hasConflict) {
      skippedDates.push({
        date: currentDate,
        reason: 'slot_conflict',
        message: `Overlaps with an already booked session on ${currentDate}.`,
      });
      if (!invalidationReason) {
        invalidationReason = `Overlaps with an already booked session on ${currentDate}.`;
      }
      continue;
    }

    validSessionDates.push(currentDate);
  }

  const isInvalid = Boolean(invalidationReason);
  const sessionDates = isInvalid ? [] : validSessionDates;
  const sessionCount = sessionDates.length;
  const isValid = !isInvalid && sessionCount > 0;

  return {
    packageType,
    startDate,
    endDate,
    totalDaysInWindow: totalDays,
    sessionDates,
    sessionCount,
    skippedDates,
    isValid,
    isInvalid,
    invalidationReason,
  };
}
