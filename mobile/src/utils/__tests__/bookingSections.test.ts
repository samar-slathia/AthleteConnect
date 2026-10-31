import { describe, it, expect } from 'vitest';
import {
  compareBookingsByCreatedAtDesc,
  getSectionKeyForStatus,
  groupBookingsForCustomer,
  groupBookingsForCoach,
} from '../bookingSections';
import { BookingItem } from '../../services/bookingApi';

const baseBooking: BookingItem = {
  _id: 'bk_base',
  customerId: 'c1',
  coachId: 'co1',
  sport: 'boxing',
  date: '2026-11-20',
  startTime: '09:00',
  endTime: '10:00',
  startMinutes: 540,
  endMinutes: 600,
  durationMinutes: 60,
  venueType: 'customer_home',
  status: 'pending',
  paymentStatus: 'unpaid',
};

describe('bookingSections Utility', () => {
  describe('compareBookingsByCreatedAtDesc', () => {
    it('sorts newer createdAt before older createdAt', () => {
      const older: BookingItem = {
        ...baseBooking,
        _id: 'bk_1',
        createdAt: '2026-10-01T10:00:00.000Z',
      };
      const newer: BookingItem = {
        ...baseBooking,
        _id: 'bk_2',
        createdAt: '2026-10-02T10:00:00.000Z',
      };

      const sorted = [older, newer].sort(compareBookingsByCreatedAtDesc);
      expect(sorted[0]._id).toBe('bk_2');
      expect(sorted[1]._id).toBe('bk_1');
    });

    it('ignores session date and start time when sorting by arrival time', () => {
      const requestedEarlierSessionLater: BookingItem = {
        ...baseBooking,
        _id: 'bk_early_session',
        date: '2026-11-01',
        startTime: '08:00',
        createdAt: '2026-10-01T10:00:00.000Z',
      };
      const requestedLaterSessionEarlier: BookingItem = {
        ...baseBooking,
        _id: 'bk_late_session',
        date: '2026-12-01',
        startTime: '18:00',
        createdAt: '2026-10-05T10:00:00.000Z',
      };

      const sorted = [requestedEarlierSessionLater, requestedLaterSessionEarlier].sort(
        compareBookingsByCreatedAtDesc
      );
      // Newest createdAt appears first, regardless of session date
      expect(sorted[0]._id).toBe('bk_late_session');
      expect(sorted[1]._id).toBe('bk_early_session');
    });

    it('uses _id descending as deterministic tie-breaker when createdAt is identical', () => {
      const a: BookingItem = {
        ...baseBooking,
        _id: 'bk_aaa',
        createdAt: '2026-10-01T10:00:00.000Z',
      };
      const b: BookingItem = {
        ...baseBooking,
        _id: 'bk_zzz',
        createdAt: '2026-10-01T10:00:00.000Z',
      };

      const sorted = [a, b].sort(compareBookingsByCreatedAtDesc);
      expect(sorted[0]._id).toBe('bk_zzz');
      expect(sorted[1]._id).toBe('bk_aaa');
    });

    it('handles missing or invalid createdAt without crashing and treats them as older', () => {
      const withValid: BookingItem = {
        ...baseBooking,
        _id: 'bk_valid',
        createdAt: '2026-10-01T10:00:00.000Z',
      };
      const withUndefined: BookingItem = {
        ...baseBooking,
        _id: 'bk_undef',
        createdAt: undefined,
      };
      const withInvalid: BookingItem = {
        ...baseBooking,
        _id: 'bk_invalid',
        createdAt: 'not-a-date',
      };

      const sorted = [withUndefined, withInvalid, withValid].sort(compareBookingsByCreatedAtDesc);
      expect(sorted[0]._id).toBe('bk_valid');
      // The remaining two use tie-breaker
      expect(sorted[1]._id).toBe('bk_undef');
      expect(sorted[2]._id).toBe('bk_invalid');
    });

    it('does not mutate the original array when sorting copies', () => {
      const arr = [
        { ...baseBooking, _id: 'bk_1', createdAt: '2026-10-01T10:00:00.000Z' },
        { ...baseBooking, _id: 'bk_2', createdAt: '2026-10-02T10:00:00.000Z' },
      ];
      const copy = [...arr].sort(compareBookingsByCreatedAtDesc);
      expect(arr[0]._id).toBe('bk_1');
      expect(copy[0]._id).toBe('bk_2');
    });
  });

  describe('getSectionKeyForStatus', () => {
    it('maps all five statuses correctly', () => {
      expect(getSectionKeyForStatus('pending')).toBe('pending');
      expect(getSectionKeyForStatus('accepted')).toBe('accepted');
      expect(getSectionKeyForStatus('rejected')).toBe('declined');
      expect(getSectionKeyForStatus('cancelled')).toBe('cancelled');
      expect(getSectionKeyForStatus('completed')).toBe('completed');
    });

    it('returns null for unknown status', () => {
      expect(getSectionKeyForStatus('unknown')).toBeNull();
    });
  });

  describe('groupBookingsForCustomer', () => {
    it('groups bookings into 5 sections with customer titles and hides empty sections by default', () => {
      const bookings: BookingItem[] = [
        { ...baseBooking, _id: 'b1', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
        { ...baseBooking, _id: 'b2', status: 'accepted', createdAt: '2026-10-02T00:00:00.000Z' },
        { ...baseBooking, _id: 'b3', status: 'rejected', createdAt: '2026-10-03T00:00:00.000Z' },
        { ...baseBooking, _id: 'b4', status: 'cancelled', createdAt: '2026-10-04T00:00:00.000Z' },
        { ...baseBooking, _id: 'b5', status: 'completed', createdAt: '2026-10-05T00:00:00.000Z' },
      ];

      const sections = groupBookingsForCustomer(bookings);
      expect(sections).toHaveLength(5);

      expect(sections[0].key).toBe('pending');
      expect(sections[0].title).toBe('Pending Requests');

      expect(sections[1].key).toBe('accepted');
      expect(sections[1].title).toBe('Accepted Sessions');

      expect(sections[2].key).toBe('declined');
      expect(sections[2].title).toBe('Declined Requests');

      expect(sections[3].key).toBe('cancelled');
      expect(sections[3].title).toBe('Cancelled Bookings');

      expect(sections[4].key).toBe('completed');
      expect(sections[4].title).toBe('Completed Sessions');
    });

    it('hides empty sections when hideEmpty is true', () => {
      const bookings: BookingItem[] = [
        { ...baseBooking, _id: 'b1', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
        { ...baseBooking, _id: 'b4', status: 'cancelled', createdAt: '2026-10-04T00:00:00.000Z' },
      ];

      const sections = groupBookingsForCustomer(bookings);
      expect(sections).toHaveLength(2);
      expect(sections[0].key).toBe('pending');
      expect(sections[1].key).toBe('cancelled');
    });

    it('returns empty array when input bookings is empty', () => {
      const sections = groupBookingsForCustomer([]);
      expect(sections).toEqual([]);
    });

    it('sorts bookings within each section by createdAt descending', () => {
      const bookings: BookingItem[] = [
        { ...baseBooking, _id: 'b_old', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
        { ...baseBooking, _id: 'b_new', status: 'pending', createdAt: '2026-10-10T00:00:00.000Z' },
        { ...baseBooking, _id: 'b_mid', status: 'pending', createdAt: '2026-10-05T00:00:00.000Z' },
      ];

      const sections = groupBookingsForCustomer(bookings);
      expect(sections).toHaveLength(1);
      expect(sections[0].data.map((b) => b._id)).toEqual(['b_new', 'b_mid', 'b_old']);
    });
  });

  describe('groupBookingsForCoach', () => {
    it('uses coach-specific title for Cancelled Sessions', () => {
      const bookings: BookingItem[] = [
        { ...baseBooking, _id: 'b_c', status: 'cancelled', createdAt: '2026-10-04T00:00:00.000Z' },
      ];

      const sections = groupBookingsForCoach(bookings);
      expect(sections).toHaveLength(1);
      expect(sections[0].key).toBe('cancelled');
      expect(sections[0].title).toBe('Cancelled Sessions');
    });
  });
});
