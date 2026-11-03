import { BookingItem } from '../services/bookingApi';

export type BookingSectionKey = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';

export interface BookingSection {
  key: BookingSectionKey;
  title: string;
  data: BookingItem[];
}

export const CUSTOMER_SECTION_TITLES: Record<BookingSectionKey, string> = {
  pending: 'Pending Requests',
  accepted: 'Accepted Sessions',
  declined: 'Declined Requests',
  cancelled: 'Cancelled Bookings',
  completed: 'Completed Sessions',
};

export const COACH_SECTION_TITLES: Record<BookingSectionKey, string> = {
  pending: 'Pending Requests',
  accepted: 'Accepted Sessions',
  declined: 'Declined Requests',
  cancelled: 'Cancelled Sessions',
  completed: 'Completed Sessions',
};

export const SECTION_ORDER: BookingSectionKey[] = [
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'completed',
];

/**
 * Deterministic comparator: createdAt descending, with _id descending fallback.
 * Missing or invalid timestamps are treated safely as oldest.
 */
export function compareBookingsByCreatedAtDesc(a: BookingItem, b: BookingItem): number {
  const timeA = a.createdAt ? new Date(a.createdAt).getTime() : NaN;
  const timeB = b.createdAt ? new Date(b.createdAt).getTime() : NaN;

  const validA = !isNaN(timeA);
  const validB = !isNaN(timeB);

  if (validA && validB) {
    if (timeB !== timeA) {
      return timeB - timeA;
    }
  } else if (validA && !validB) {
    return -1; // a has valid createdAt, so a is newer than missing/invalid b
  } else if (!validA && validB) {
    return 1; // b has valid createdAt, so b is newer than missing/invalid a
  }

  // Deterministic fallback for equal or missing timestamps: _id descending
  const idA = a._id || '';
  const idB = b._id || '';
  return idB.localeCompare(idA);
}

/**
 * Maps a booking status to the corresponding section key.
 * Status 'rejected' maps to 'declined'.
 */
export function getSectionKeyForStatus(status: string): BookingSectionKey | null {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'accepted':
    case 'in_progress':
      return 'accepted';
    case 'rejected':
      return 'declined';
    case 'cancelled':
      return 'cancelled';
    case 'completed':
      return 'completed';
    default:
      return null;
  }
}

/**
 * Groups and sorts bookings into 5 sections for a given role (customer or coach).
 * Only sections containing at least one booking are returned when hideEmpty is true.
 * Does not mutate the input array.
 */
export function groupBookings(
  bookings: BookingItem[],
  titles: Record<BookingSectionKey, string>,
  hideEmpty = true
): BookingSection[] {
  const map: Record<BookingSectionKey, BookingItem[]> = {
    pending: [],
    accepted: [],
    declined: [],
    cancelled: [],
    completed: [],
  };

  for (const booking of bookings) {
    const key = getSectionKeyForStatus(booking.status);
    if (key && map[key]) {
      map[key].push(booking);
    }
  }

  const sections: BookingSection[] = SECTION_ORDER.map((key) => {
    const sortedData = [...map[key]].sort(compareBookingsByCreatedAtDesc);
    return {
      key,
      title: titles[key],
      data: sortedData,
    };
  });

  return hideEmpty ? sections.filter((s) => s.data.length > 0) : sections;
}

export function groupBookingsForCustomer(
  bookings: BookingItem[],
  hideEmpty = true
): BookingSection[] {
  return groupBookings(bookings, CUSTOMER_SECTION_TITLES, hideEmpty);
}

export function groupBookingsForCoach(
  bookings: BookingItem[],
  hideEmpty = true
): BookingSection[] {
  return groupBookings(bookings, COACH_SECTION_TITLES, hideEmpty);
}
