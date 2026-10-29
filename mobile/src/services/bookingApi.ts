import { getApiBaseUrl, API_ENDPOINTS } from '../config/api';
import { AuthApiError } from './authApi';
import { CoachDiscipline, VenueType } from './coachApi';
import { isValidCalendarDate } from './availabilityApi';

export type { CoachDiscipline, VenueType };
export { isValidCalendarDate };

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'completed';

export type PaymentStatus = 'unpaid' | 'paid';

export interface CoachDiscoveryProfile {
  bio: string;
  disciplines: CoachDiscipline[];
  specialties: string[];
  sessionFormats: string[];
  venueTypes: VenueType[];
  hourlyRate?: number;
  currency: string;
  locations: string[];
}

export interface CoachDiscoveryItem {
  _id: string;
  name: string;
  role: 'coach';
  profile: CoachDiscoveryProfile | null;
  isConfiguredAvailability: boolean;
  timezone: string;
}

export interface BookingCoordinates {
  latitude: number;
  longitude: number;
}

export interface BookingItem {
  _id: string;
  customerId: string;
  coachId: string;
  customerName?: string;
  coachName?: string;
  sport: CoachDiscipline;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  venueType: VenueType;
  trainingAddress?: string;
  customerPhone?: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  hourlyRateSnapshot?: number;
  rejectionReason?: string;
  cancellationReason?: string;
  cancelledBy?: 'customer' | 'coach';
  locationCoordinates?: BookingCoordinates;
  coordinates?: BookingCoordinates;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateBookingPayload {
  coachId: string;
  sport: CoachDiscipline;
  date: string;
  startTime: string;
  endTime: string;
  venueType: VenueType;
  trainingAddress: string;
  customerPhone: string;
  locationCoordinates?: BookingCoordinates;
  coordinates?: BookingCoordinates;
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
    }
  } catch {
    // Non-JSON or unreadable body, fall back to status code defaults
  }

  switch (response.status) {
    case 400:
      return 'Invalid booking request. Please check your inputs.';
    case 401:
      return 'Authentication required. Please log in again.';
    case 403:
      return 'Access denied. You are not authorized for this booking action.';
    case 404:
      return 'Booking or coach was not found.';
    case 409:
      return 'Schedule conflict. The coach already has an accepted session at this time.';
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

/**
 * Fetch list of public coaches available for booking.
 * GET /api/coaches
 */
export async function getPublicCoaches(params?: {
  discipline?: string;
  location?: string;
}): Promise<CoachDiscoveryItem[]> {
  const baseUrl = getApiBaseUrl();
  const queryParts: string[] = [];
  if (params?.discipline) {
    queryParts.push(`discipline=${encodeURIComponent(params.discipline)}`);
  }
  if (params?.location) {
    queryParts.push(`location=${encodeURIComponent(params.location)}`);
  }
  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const url = `${baseUrl}${API_ENDPOINTS.COACHES}${queryString}`;

  const response = await safeFetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  const data = await response.json();
  return Array.isArray(data.coaches) ? data.coaches : [];
}

/**
 * Create a new booking request.
 * POST /api/bookings
 */
export async function createBooking(
  token: string,
  payload: CreateBookingPayload
): Promise<BookingItem> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.BOOKINGS}`;

  const response = await safeFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  const data = await response.json();
  if (!data.booking) {
    throw new AuthApiError('Invalid response from booking service.', response.status);
  }

  return data.booking;
}

/**
 * Retrieve authenticated customer bookings.
 * GET /api/bookings
 */
export async function getCustomerBookings(
  token: string,
  status?: BookingStatus
): Promise<BookingItem[]> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  const baseUrl = getApiBaseUrl();
  const queryString = status ? `?status=${encodeURIComponent(status)}` : '';
  const url = `${baseUrl}${API_ENDPOINTS.BOOKINGS}${queryString}`;

  const response = await safeFetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  const data = await response.json();
  return Array.isArray(data.bookings) ? data.bookings : [];
}

/**
 * Cancel a booking request.
 * PATCH /api/bookings/:id/cancel
 */
export async function cancelBooking(
  token: string,
  bookingId: string,
  reason?: string
): Promise<BookingItem> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  if (!bookingId || !bookingId.trim()) {
    throw new AuthApiError('Booking ID is required for cancellation.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.BOOKINGS}/${encodeURIComponent(bookingId.trim())}/cancel`;

  const response = await safeFetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify(reason ? { reason: reason.trim() } : {}),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  const data = await response.json();
  if (!data.booking) {
    throw new AuthApiError('Invalid response from booking service.', response.status);
  }

  return data.booking;
}

/**
 * Fetch bookings assigned to the authenticated coach.
 * GET /api/bookings
 */
export async function getCoachBookings(
  token: string,
  status?: BookingStatus
): Promise<BookingItem[]> {
  return getCustomerBookings(token, status);
}

/**
 * Accept a pending booking request (Assigned coach only).
 * PATCH /api/bookings/:id/accept
 */
export async function acceptBooking(
  token: string,
  bookingId: string
): Promise<BookingItem> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  if (!bookingId || !bookingId.trim()) {
    throw new AuthApiError('Booking ID is required to accept.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.BOOKINGS}/${encodeURIComponent(bookingId.trim())}/accept`;

  const response = await safeFetch(url, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  const data = await response.json();
  if (!data.booking) {
    throw new AuthApiError('Invalid response from booking service.', response.status);
  }

  return data.booking;
}

/**
 * Reject a pending booking request (Assigned coach only).
 * PATCH /api/bookings/:id/reject
 */
export async function rejectBooking(
  token: string,
  bookingId: string,
  reason?: string
): Promise<BookingItem> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  if (!bookingId || !bookingId.trim()) {
    throw new AuthApiError('Booking ID is required to reject.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.BOOKINGS}/${encodeURIComponent(bookingId.trim())}/reject`;

  const response = await safeFetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify(reason ? { reason: reason.trim() } : {}),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  const data = await response.json();
  if (!data.booking) {
    throw new AuthApiError('Invalid response from booking service.', response.status);
  }

  return data.booking;
}

export interface BookingMessageItem {
  _id: string;
  bookingId: string;
  senderId: string;
  senderRole: 'parent' | 'individual' | 'coach' | 'admin';
  senderName: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Retrieve messages for a specific booking.
 * GET /api/bookings/:id/messages
 */
export async function getBookingMessages(
  token: string,
  bookingId: string
): Promise<BookingMessageItem[]> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  if (!bookingId || !bookingId.trim()) {
    throw new AuthApiError('Booking ID is required to fetch messages.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.BOOKINGS}/${encodeURIComponent(bookingId.trim())}/messages`;

  const response = await safeFetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  const data = await response.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

/**
 * Send a message within a booking chat.
 * POST /api/bookings/:id/messages
 */
export async function sendBookingMessage(
  token: string,
  bookingId: string,
  text: string
): Promise<BookingMessageItem> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  if (!bookingId || !bookingId.trim()) {
    throw new AuthApiError('Booking ID is required to send a message.', 400);
  }

  const trimmedText = text ? text.trim() : '';
  if (!trimmedText) {
    throw new AuthApiError('Message text cannot be empty.', 400);
  }

  if (trimmedText.length > 1000) {
    throw new AuthApiError('Message text cannot exceed 1000 characters.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.BOOKINGS}/${encodeURIComponent(bookingId.trim())}/messages`;

  const response = await safeFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify({ text: trimmedText }),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  const data = await response.json();
  if (!data.message) {
    throw new AuthApiError('Invalid response from chat service.', response.status);
  }

  return data.message;
}

/**
 * Timezone constants & date calculation helpers for Asia/Kolkata (UTC+05:30).
 */
export const ASIA_KOLKATA_TIMEZONE = 'Asia/Kolkata';
export const ASIA_KOLKATA_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Returns a calendar date string ("YYYY-MM-DD") representing the date in Asia/Kolkata.
 * Accepts an optional reference Date (defaults to now).
 */
export function getKolkataDateString(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ASIA_KOLKATA_TIMEZONE,
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

/**
 * Returns tomorrow's calendar date string ("YYYY-MM-DD") in Asia/Kolkata.
 * Correctly handles month-end and year-end boundaries.
 */
export function getKolkataTomorrowDateString(fromDate: Date = new Date()): string {
  const tomorrow = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
  return getKolkataDateString(tomorrow);
}

