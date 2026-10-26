import { getApiBaseUrl, API_ENDPOINTS } from '../config/api';
import { AuthApiError } from './authApi';

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

/**
 * Converts a 24-hour "HH:mm" time string into minutes from midnight.
 */
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map((part) => parseInt(part, 10));
  return hours * 60 + minutes;
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
  if (year < 100) {
    utcDate.setUTCFullYear(year);
  }
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

export interface AvailabilitySlot {
  dayOfWeek: DayOfWeek;
  startTime: string; // 24-hour "HH:mm" format (e.g. "09:00")
  endTime: string;   // 24-hour "HH:mm" format (e.g. "12:00")
}

export interface CoachAvailability {
  _id: string;
  userId: string;
  timezone: string;
  slots: AvailabilitySlot[];
  unavailableDates: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CoachAvailabilityResponse {
  availability: CoachAvailability | null;
  isConfigured: boolean;
  message?: string;
}

export interface UpdateCoachAvailabilityInput {
  slots: AvailabilitySlot[];
  timezone?: string;
  unavailableDates?: string[];
}

/**
 * Safely extracts user-friendly error message from backend error responses.
 */
async function parseResponseError(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data && typeof data.error === 'string' && data.error.trim()) {
        return data.error;
      }
      if (
        data &&
        typeof data.error === 'object' &&
        typeof data.error.message === 'string' &&
        data.error.message.trim()
      ) {
        return data.error.message;
      }
    }
  } catch {
    // Non-JSON or unreadable body, fall back to status code defaults below
  }

  switch (response.status) {
    case 400:
      return 'Invalid request. Please check your inputs.';
    case 401:
      return 'Authentication required. Please log in again.';
    case 403:
      return 'Access denied. Coach privileges required.';
    case 404:
      return 'Coach availability service endpoint was not found.';
    case 500:
    case 502:
    case 503:
      return 'Server error. Please try again later.';
    default:
      return `Request failed with status ${response.status}.`;
  }
}

/**
 * Robust fetch wrapper that gracefully handles network disconnects and timeouts.
 */
async function safeFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch {
    throw new AuthApiError(
      'Unable to connect to AthleteConnect servers. Please check your internet connection.',
      0
    );
  }
}

const VALID_DAYS: ReadonlySet<string> = new Set(DAYS_OF_WEEK);

/**
 * Validates whether a timezone identifier string is recognized by runtime Intl.
 */
function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an individual slot object against schema and duration rules:
 * - valid dayOfWeek enum
 * - valid 24h startTime and endTime format (HH:mm)
 * - endTime strictly after startTime within the same day
 * - minimum slot duration of 30 minutes
 */
export function isValidSlot(slot: unknown): slot is AvailabilitySlot {
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
    return false;
  }
  const s = slot as Record<string, unknown>;
  if (typeof s.dayOfWeek !== 'string' || !VALID_DAYS.has(s.dayOfWeek)) {
    return false;
  }
  if (typeof s.startTime !== 'string' || !TIME_REGEX.test(s.startTime.trim())) {
    return false;
  }
  if (typeof s.endTime !== 'string' || !TIME_REGEX.test(s.endTime.trim())) {
    return false;
  }

  const startMinutes = timeToMinutes(s.startTime.trim());
  const endMinutes = timeToMinutes(s.endTime.trim());

  if (endMinutes <= startMinutes) {
    return false;
  }

  if (endMinutes - startMinutes < MIN_SLOT_DURATION_MINUTES) {
    return false;
  }

  return true;
}

/**
 * Validates recurring availability slots against schema and semantic constraints:
 * - Must be an array.
 * - Maximum 28 total slots across the week.
 * - Each slot must satisfy individual format and duration rules (isValidSlot).
 * - No more than 4 slots per day.
 * - No overlapping slots on the same day (adjacent slots meeting at boundary are permitted).
 */
export function areValidSlots(slots: unknown): slots is AvailabilitySlot[] {
  if (!Array.isArray(slots) || slots.length > MAX_TOTAL_SLOTS) {
    return false;
  }

  if (!slots.every(isValidSlot)) {
    return false;
  }

  const slotsByDay: Record<DayOfWeek, { start: number; end: number }[]> = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };

  for (const slot of slots) {
    slotsByDay[slot.dayOfWeek].push({
      start: timeToMinutes(slot.startTime.trim()),
      end: timeToMinutes(slot.endTime.trim()),
    });
  }

  for (const day of DAYS_OF_WEEK) {
    const daySlots = slotsByDay[day];

    if (daySlots.length > MAX_SLOTS_PER_DAY) {
      return false;
    }

    // Sort by start time to reliably detect overlaps even if unsorted
    daySlots.sort((a, b) => a.start - b.start);

    for (let i = 0; i < daySlots.length - 1; i++) {
      if (daySlots[i].end > daySlots[i + 1].start) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validates unavailable blackout dates:
 * - Must be an array of strings.
 * - Maximum 30 dates.
 * - Each must be a real calendar date in YYYY-MM-DD format.
 * - No duplicates permitted.
 */
export function areValidUnavailableDates(dates: unknown): dates is string[] {
  if (!Array.isArray(dates) || dates.length > MAX_UNAVAILABLE_DATES) {
    return false;
  }

  const seenDates = new Set<string>();

  for (const d of dates) {
    if (typeof d !== 'string') {
      return false;
    }

    const trimmed = d.trim();
    if (!isValidCalendarDate(trimmed)) {
      return false;
    }

    if (seenDates.has(trimmed)) {
      return false;
    }

    seenDates.add(trimmed);
  }

  return true;
}

/**
 * Validates that response data matches the expected CoachAvailabilityResponse envelope.
 *
 * Requirements:
 * - isConfigured must be a boolean.
 * - availability may be null (for coaches without a saved schedule); when null, isConfigured must be false.
 * - when availability is populated, isConfigured must be true.
 * - Enforces required identifiers, IANA timezone, slot structures, and string array for unavailableDates.
 */
export function isValidCoachAvailabilityResponse(data: unknown): data is CoachAvailabilityResponse {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const record = data as Record<string, unknown>;

  // isConfigured must be a boolean
  if (typeof record.isConfigured !== 'boolean') {
    return false;
  }

  // Optional message envelope field when present must be a string
  if (record.message !== undefined && typeof record.message !== 'string') {
    return false;
  }

  // Unconfigured state: availability is null, isConfigured must be false
  if (record.availability === null) {
    return record.isConfigured === false;
  }

  // Configured state: isConfigured must be true
  if (record.isConfigured !== true) {
    return false;
  }

  if (typeof record.availability !== 'object' || Array.isArray(record.availability)) {
    return false;
  }

  const availability = record.availability as Record<string, unknown>;

  // Required identifiers and valid IANA timezone
  if (typeof availability._id !== 'string' || !availability._id.trim()) {
    return false;
  }
  if (typeof availability.userId !== 'string' || !availability.userId.trim()) {
    return false;
  }
  if (!isValidTimezone(availability.timezone)) {
    return false;
  }

  // slots must be an array of valid AvailabilitySlot items adhering to limits, duration, and overlap constraints
  if (!areValidSlots(availability.slots)) {
    return false;
  }

  // unavailableDates must be an array of valid, unique, real calendar dates within limits
  if (!areValidUnavailableDates(availability.unavailableDates)) {
    return false;
  }

  // Optional timestamp fields when present must be strings
  if (availability.createdAt !== undefined && typeof availability.createdAt !== 'string') {
    return false;
  }

  if (availability.updatedAt !== undefined && typeof availability.updatedAt !== 'string') {
    return false;
  }

  return true;
}

/**
 * Fetch Current Authenticated Coach Availability Schedule
 * GET /api/coach/availability/me
 */
export async function getCoachAvailability(token: string): Promise<CoachAvailabilityResponse> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new AuthApiError('Authentication required. Missing token.', 401);
  }

  const url = `${getApiBaseUrl()}${API_ENDPOINTS.COACH_AVAILABILITY}`;

  const response = await safeFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AuthApiError('Invalid response from server. Malformed JSON.', response.status);
  }

  if (!isValidCoachAvailabilityResponse(data)) {
    throw new AuthApiError(
      'Unexpected response shape received from coach availability service.',
      response.status
    );
  }

  return data;
}

/**
 * Create or Update Authenticated Coach Availability Schedule
 * PUT /api/coach/availability/me
 *
 * NOTE: Only the permitted fields from UpdateCoachAvailabilityInput are serialized.
 * - slots is required.
 * - timezone and unavailableDates are omitted when not supplied, preserving existing saved values on the backend.
 * - Server-controlled properties (userId, _id, timestamps, isConfigured) are strictly excluded from the payload.
 */
export async function updateCoachAvailability(
  token: string,
  input: UpdateCoachAvailabilityInput
): Promise<CoachAvailabilityResponse> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new AuthApiError('Authentication required. Missing token.', 401);
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AuthApiError('Invalid availability update data. Expected an object.', 400);
  }

  if (!Array.isArray(input.slots)) {
    throw new AuthApiError('Invalid availability update data. slots array is required.', 400);
  }

  // Build clean payload with only allowed fields; omit unsupplied optional fields to preserve existing backend data
  const payload: Record<string, unknown> = {
    slots: input.slots,
  };

  if (input.timezone !== undefined) {
    payload.timezone = input.timezone;
  }

  if (input.unavailableDates !== undefined) {
    payload.unavailableDates = input.unavailableDates;
  }

  const url = `${getApiBaseUrl()}${API_ENDPOINTS.COACH_AVAILABILITY}`;

  const response = await safeFetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AuthApiError('Invalid response from server. Malformed JSON.', response.status);
  }

  if (!isValidCoachAvailabilityResponse(data)) {
    throw new AuthApiError(
      'Unexpected response shape received from coach availability service.',
      response.status
    );
  }

  return data;
}

export { AuthApiError };
