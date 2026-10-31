import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { Linking } from 'react-native';
import { ParentHomeView } from '../home/ParentHomeView';
import { IndividualHomeView } from '../home/IndividualHomeView';
import { CoachHomeView } from '../home/CoachHomeView';
import { CustomerBookingCard } from '../home/components/CustomerBookingCard';
import { CoachBookingCard } from '../home/components/CoachBookingCard';
import { BookingItem, cancelBooking, acceptBooking, rejectBooking } from '../../services/bookingApi';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import { UserProfile } from '../../services/authApi';

vi.mock('../../services/bookingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bookingApi')>();
  return {
    ...actual,
    getCustomerBookings: vi.fn(),
    getCoachBookings: vi.fn(),
    cancelBooking: vi.fn(),
    acceptBooking: vi.fn(),
    rejectBooking: vi.fn(),
  };
});

function findAllElements(element: any, predicate: (el: any) => boolean, results: any[] = []): any[] {
  if (!element) return results;
  if (Array.isArray(element)) {
    for (const child of element) {
      findAllElements(child, predicate, results);
    }
    return results;
  }
  if (typeof element !== 'object') return results;
  if (predicate(element)) {
    results.push(element);
  }
  if (element.props && element.props.children) {
    const children = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children];
    for (const child of children) {
      findAllElements(child, predicate, results);
    }
  }
  return results;
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  const results = findAllElements(element, predicate);
  return results.length > 0 ? results[0] : null;
}

function renderWithAuth(ui: React.ReactElement, authValue: Partial<AuthContextType> = {}) {
  const defaultAuth: AuthContextType = {
    user: null,
    token: 'test_auth_token',
    isLoading: false,
    isInitializing: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    ...authValue,
  };

  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const originalDispatcher = internals.H;

  let hooks: any[] = [];
  let hookIdx = 0;

  const dispatcher = {
    useState(initial: any) {
      const idx = hookIdx++;
      if (hooks[idx] === undefined) {
        hooks[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (action: any) => {
        hooks[idx] = typeof action === 'function' ? action(hooks[idx]) : action;
      };
      return [hooks[idx], setState];
    },
    useRef(initial: any) {
      const idx = hookIdx++;
      if (hooks[idx] === undefined) {
        hooks[idx] = { current: initial };
      }
      return hooks[idx];
    },
    useCallback(fn: any) {
      const idx = hookIdx++;
      hooks[idx] = fn;
      return fn;
    },
    useEffect() {},
    useContext(context: any) {
      if (context === AuthContext) {
        return defaultAuth;
      }
      return null;
    },
  };

  internals.H = dispatcher;
  hookIdx = 0;

  const Component = ui.type as React.FC<any>;
  const tree = Component(ui.props);

  const cleanup = () => {
    internals.H = originalDispatcher;
  };

  return { tree, auth: defaultAuth, cleanup };
}

const parentUser: UserProfile = {
  _id: 'usr_p1',
  name: 'Sarah Connor',
  email: 'sarah@athlete.com',
  role: 'parent',
  isActive: true,
};

const individualUser: UserProfile = {
  _id: 'usr_i1',
  name: 'Alex Rivera',
  email: 'alex@athlete.com',
  role: 'individual',
  isActive: true,
};

const coachUser: UserProfile = {
  _id: 'usr_c1',
  name: 'Sensei Maya',
  email: 'maya@coach.com',
  role: 'coach',
  isActive: true,
};

const sampleBookingTemplate: BookingItem = {
  _id: 'bk_sample',
  customerId: 'usr_p1',
  coachId: 'usr_c1',
  customerName: 'Sarah Connor',
  coachName: 'Sensei Maya',
  sport: 'boxing',
  date: '2026-11-20',
  startTime: '09:00',
  endTime: '10:00',
  startMinutes: 540,
  endMinutes: 600,
  durationMinutes: 60,
  venueType: 'customer_home',
  trainingAddress: '123 Training St',
  customerPhone: '+919876543210',
  status: 'pending',
  paymentStatus: 'unpaid',
};

describe('Phase 3B.4B Booking Sections & Attribution Tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // A. SECTION GROUPING TESTS
  // =========================================================================
  describe('A. Section Grouping', () => {
    it('ParentHomeView maps all 5 statuses into distinct sections with correct headers and counts', () => {
      const allFiveBookings: BookingItem[] = [
        { ...sampleBookingTemplate, _id: 'b_pen', status: 'pending', createdAt: '2026-10-01T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_acc', status: 'accepted', createdAt: '2026-10-02T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_dec', status: 'rejected', createdAt: '2026-10-03T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_can', status: 'cancelled', createdAt: '2026-10-04T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_com', status: 'completed', createdAt: '2026-10-05T10:00:00.000Z' },
      ];

      const { tree, cleanup } = renderWithAuth(
        React.createElement(ParentHomeView, {
          user: parentUser,
          mode: 'bookings',
          initialBookings: allFiveBookings,
        })
      );

      const pendingH = findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('PENDING REQUESTS (1)'));
      const acceptedH = findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('ACCEPTED SESSIONS (1)'));
      const declinedH = findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('DECLINED REQUESTS (1)'));
      const cancelledH = findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('CANCELLED BOOKINGS (1)'));
      const completedH = findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('COMPLETED SESSIONS (1)'));

      expect(pendingH).not.toBeNull();
      expect(acceptedH).not.toBeNull();
      expect(declinedH).not.toBeNull();
      expect(cancelledH).not.toBeNull();
      expect(completedH).not.toBeNull();

      cleanup();
    });

    it('IndividualHomeView hides empty sections and only renders populated sections', () => {
      const subsetBookings: BookingItem[] = [
        { ...sampleBookingTemplate, _id: 'b_pen1', status: 'pending', createdAt: '2026-10-01T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_pen2', status: 'pending', createdAt: '2026-10-02T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_com1', status: 'completed', createdAt: '2026-10-03T10:00:00.000Z' },
      ];

      const { tree, cleanup } = renderWithAuth(
        React.createElement(IndividualHomeView, {
          user: individualUser,
          mode: 'bookings',
          initialBookings: subsetBookings,
        })
      );

      expect(findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('PENDING REQUESTS (2)'))).not.toBeNull();
      expect(findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('COMPLETED SESSIONS (1)'))).not.toBeNull();

      // Empty sections must NOT render
      expect(findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('ACCEPTED SESSIONS'))).toBeNull();
      expect(findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('DECLINED REQUESTS'))).toBeNull();
      expect(findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('CANCELLED BOOKINGS'))).toBeNull();

      cleanup();
    });

    it('CoachHomeView renders five distinct sections in mode="all" and excludes pending from mode="sessions"', () => {
      const allFiveCoachBookings: BookingItem[] = [
        { ...sampleBookingTemplate, _id: 'b_c_pen', status: 'pending', createdAt: '2026-10-01T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_c_acc', status: 'accepted', createdAt: '2026-10-02T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_c_dec', status: 'rejected', createdAt: '2026-10-03T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_c_can', status: 'cancelled', createdAt: '2026-10-04T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_c_com', status: 'completed', createdAt: '2026-10-05T10:00:00.000Z' },
      ];

      // In mode="all", all five sections render
      const { tree: allTree, cleanup: allCleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'all',
          initialBookings: allFiveCoachBookings,
        })
      );

      expect(findElement(allTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('PENDING REQUESTS (1)'))).not.toBeNull();
      expect(findElement(allTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('ACCEPTED SESSIONS (1)'))).not.toBeNull();
      expect(findElement(allTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('DECLINED REQUESTS (1)'))).not.toBeNull();
      expect(findElement(allTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('CANCELLED SESSIONS (1)'))).not.toBeNull();
      expect(findElement(allTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('COMPLETED SESSIONS (1)'))).not.toBeNull();
      allCleanup();

      // In mode="sessions", pending requests must NOT appear
      const { tree: sessionsTree, cleanup: sessionsCleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'sessions',
          initialBookings: allFiveCoachBookings,
        })
      );

      expect(findElement(sessionsTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('PENDING REQUESTS'))).toBeNull();
      expect(findElement(sessionsTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('ACCEPTED SESSIONS (1)'))).not.toBeNull();
      expect(findElement(sessionsTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('DECLINED REQUESTS (1)'))).not.toBeNull();
      expect(findElement(sessionsTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('CANCELLED SESSIONS (1)'))).not.toBeNull();
      expect(findElement(sessionsTree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('COMPLETED SESSIONS (1)'))).not.toBeNull();
      sessionsCleanup();
    });

    it('Preserves honest overall empty state when bookings list is empty', () => {
      const { tree: parentTree, cleanup: parentCleanup } = renderWithAuth(
        React.createElement(ParentHomeView, { user: parentUser, mode: 'bookings', initialBookings: [] })
      );
      expect(findElement(parentTree, (el) => el.props?.title === 'No Youth Sessions Scheduled')).not.toBeNull();
      parentCleanup();

      const { tree: coachTree, cleanup: coachCleanup } = renderWithAuth(
        React.createElement(CoachHomeView, { user: coachUser, mode: 'sessions', initialBookings: [] })
      );
      expect(findElement(coachTree, (el) => el.props?.title === 'No Active Trainee Requests')).not.toBeNull();
      coachCleanup();
    });
  });

  // =========================================================================
  // B. ARRIVAL-TIME SORTING TESTS
  // =========================================================================
  describe('B. Arrival-Time Sorting (createdAt descending)', () => {
    it('renders newest booking request first within section regardless of session date or time', () => {
      const unsortedPendingBookings: BookingItem[] = [
        {
          ...sampleBookingTemplate,
          _id: 'bk_old_request_early_session',
          date: '2026-11-01',
          startTime: '08:00',
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        {
          ...sampleBookingTemplate,
          _id: 'bk_new_request_late_session',
          date: '2026-12-01',
          startTime: '18:00',
          createdAt: '2026-10-10T10:00:00.000Z',
        },
      ];

      const { tree, cleanup } = renderWithAuth(
        React.createElement(ParentHomeView, {
          user: parentUser,
          mode: 'bookings',
          initialBookings: unsortedPendingBookings,
        })
      );

      const sectionEl = findElement(tree, (el) => el.props?.testID === 'customer-booking-section-pending');
      expect(sectionEl).not.toBeNull();

      const cards = findAllElements(sectionEl, (el) => el.type === CustomerBookingCard);
      expect(cards).toHaveLength(2);
      // Newest request (bk_new_request_late_session) must be index 0
      expect(cards[0].props.booking._id).toBe('bk_new_request_late_session');
      expect(cards[1].props.booking._id).toBe('bk_old_request_early_session');

      cleanup();
    });

    it('safely handles missing or invalid createdAt without crashing', () => {
      const messyTimestamps: BookingItem[] = [
        { ...sampleBookingTemplate, _id: 'bk_no_date', status: 'accepted', createdAt: undefined },
        { ...sampleBookingTemplate, _id: 'bk_valid_new', status: 'accepted', createdAt: '2026-10-20T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'bk_bad_date', status: 'accepted', createdAt: 'invalid-iso-string' },
      ];

      const { tree, cleanup } = renderWithAuth(
        React.createElement(IndividualHomeView, {
          user: individualUser,
          mode: 'bookings',
          initialBookings: messyTimestamps,
        })
      );

      const sectionEl = findElement(tree, (el) => el.props?.testID === 'customer-booking-section-accepted');
      expect(sectionEl).not.toBeNull();

      const cards = findAllElements(sectionEl, (el) => el.type === CustomerBookingCard);
      expect(cards).toHaveLength(3);
      // The one with valid timestamp comes first
      expect(cards[0].props.booking._id).toBe('bk_valid_new');

      cleanup();
    });
  });

  // =========================================================================
  // C. CANCELLATION ATTRIBUTION TESTS
  // =========================================================================
  describe('C. Cancellation Attribution', () => {
    describe('CustomerBookingCard', () => {
      it('displays "Cancelled by You" when cancelledBy === "customer"', () => {
        const booking: BookingItem = {
          ...sampleBookingTemplate,
          _id: 'bk_c_cust',
          status: 'cancelled',
          cancelledBy: 'customer',
        };

        const tree = CustomerBookingCard({ booking });
        const actorEl = findElement(tree, (el) => el.props?.testID === 'cancellation-actor-bk_c_cust');
        expect(actorEl).not.toBeNull();
        expect(actorEl.props.children).toBe('Cancelled by You');
      });

      it('displays "Cancelled by Coach" when cancelledBy === "coach"', () => {
        const booking: BookingItem = {
          ...sampleBookingTemplate,
          _id: 'bk_c_coach',
          status: 'cancelled',
          cancelledBy: 'coach',
        };

        const tree = CustomerBookingCard({ booking });
        const actorEl = findElement(tree, (el) => el.props?.testID === 'cancellation-actor-bk_c_coach');
        expect(actorEl).not.toBeNull();
        expect(actorEl.props.children).toBe('Cancelled by Coach');
      });

      it('displays "Cancelled" when cancelledBy is missing on legacy booking', () => {
        const booking: BookingItem = {
          ...sampleBookingTemplate,
          _id: 'bk_c_legacy',
          status: 'cancelled',
          cancelledBy: undefined,
        };

        const tree = CustomerBookingCard({ booking });
        const actorEl = findElement(tree, (el) => el.props?.testID === 'cancellation-actor-bk_c_legacy');
        expect(actorEl).not.toBeNull();
        expect(actorEl.props.children).toBe('Cancelled');
      });

      it('displays cancellationReason when available', () => {
        const booking: BookingItem = {
          ...sampleBookingTemplate,
          _id: 'bk_c_reason',
          status: 'cancelled',
          cancelledBy: 'coach',
          cancellationReason: 'Emergency maintenance at dojo',
        };

        const tree = CustomerBookingCard({ booking });
        const reasonEl = findElement(tree, (el) => el.props?.testID === 'cancellation-reason-bk_c_reason');
        expect(reasonEl).not.toBeNull();
        expect(reasonEl.props.children).toContain('Emergency maintenance at dojo');
      });
    });

    describe('CoachBookingCard', () => {
      it('displays "Cancelled by You" when cancelledBy === "coach"', () => {
        const booking: BookingItem = {
          ...sampleBookingTemplate,
          _id: 'bk_coach_by_coach',
          status: 'cancelled',
          cancelledBy: 'coach',
        };

        const { tree, cleanup } = renderWithAuth(React.createElement(CoachBookingCard, { booking }));
        const actorEl = findElement(tree, (el) => el.props?.testID === 'cancellation-actor-bk_coach_by_coach');
        expect(actorEl).not.toBeNull();
        expect(actorEl.props.children).toBe('Cancelled by You');
        cleanup();
      });

      it('displays "Cancelled by Trainee" when cancelledBy === "customer"', () => {
        const booking: BookingItem = {
          ...sampleBookingTemplate,
          _id: 'bk_coach_by_cust',
          status: 'cancelled',
          cancelledBy: 'customer',
        };

        const { tree, cleanup } = renderWithAuth(React.createElement(CoachBookingCard, { booking }));
        const actorEl = findElement(tree, (el) => el.props?.testID === 'cancellation-actor-bk_coach_by_cust');
        expect(actorEl).not.toBeNull();
        expect(actorEl.props.children).toBe('Cancelled by Trainee');
        cleanup();
      });

      it('displays "Cancelled" when cancelledBy is missing on legacy booking for coach', () => {
        const booking: BookingItem = {
          ...sampleBookingTemplate,
          _id: 'bk_coach_legacy',
          status: 'cancelled',
          cancelledBy: undefined,
        };

        const { tree, cleanup } = renderWithAuth(React.createElement(CoachBookingCard, { booking }));
        const actorEl = findElement(tree, (el) => el.props?.testID === 'cancellation-actor-bk_coach_legacy');
        expect(actorEl).not.toBeNull();
        expect(actorEl.props.children).toBe('Cancelled');
        cleanup();
      });

      it('displays cancellationReason when available for coach', () => {
        const booking: BookingItem = {
          ...sampleBookingTemplate,
          _id: 'bk_coach_reason',
          status: 'cancelled',
          cancelledBy: 'customer',
          cancellationReason: 'Flu fever',
        };

        const { tree, cleanup } = renderWithAuth(React.createElement(CoachBookingCard, { booking }));
        const reasonEl = findElement(tree, (el) => el.props?.testID === 'cancellation-reason-bk_coach_reason');
        expect(reasonEl).not.toBeNull();
        expect(reasonEl.props.children).toContain('Flu fever');
        cleanup();
      });
    });
  });

  // =========================================================================
  // D. ACTION & PRIVACY PRESERVATION TESTS
  // =========================================================================
  describe('D. Action Preservation & Privacy', () => {
    it('CustomerBookingCard displays Cancel button only for pending and accepted statuses', () => {
      const pendingTree = CustomerBookingCard({ booking: { ...sampleBookingTemplate, status: 'pending' }, onCancel: vi.fn() });
      expect(findElement(pendingTree, (el) => el.props?.testID === 'button-cancel-bk_sample')).not.toBeNull();

      const acceptedTree = CustomerBookingCard({ booking: { ...sampleBookingTemplate, status: 'accepted' }, onCancel: vi.fn() });
      expect(findElement(acceptedTree, (el) => el.props?.testID === 'button-cancel-bk_sample')).not.toBeNull();

      const rejectedTree = CustomerBookingCard({ booking: { ...sampleBookingTemplate, status: 'rejected' }, onCancel: vi.fn() });
      expect(findElement(rejectedTree, (el) => el.props?.testID === 'button-cancel-bk_sample')).toBeNull();

      const cancelledTree = CustomerBookingCard({ booking: { ...sampleBookingTemplate, status: 'cancelled' }, onCancel: vi.fn() });
      expect(findElement(cancelledTree, (el) => el.props?.testID === 'button-cancel-bk_sample')).toBeNull();

      const completedTree = CustomerBookingCard({ booking: { ...sampleBookingTemplate, status: 'completed' }, onCancel: vi.fn() });
      expect(findElement(completedTree, (el) => el.props?.testID === 'button-cancel-bk_sample')).toBeNull();
    });

    it('CoachBookingCard renders Accept and Reject buttons only for pending requests', () => {
      const { tree: pendingTree, cleanup: c1 } = renderWithAuth(
        React.createElement(CoachBookingCard, {
          booking: { ...sampleBookingTemplate, status: 'pending' },
          onAccept: vi.fn(),
          onReject: vi.fn(),
        })
      );
      expect(findElement(pendingTree, (el) => el.props?.testID === 'button-accept-bk_sample')).not.toBeNull();
      expect(findElement(pendingTree, (el) => el.props?.testID === 'button-reject-bk_sample')).not.toBeNull();
      c1();

      const { tree: acceptedTree, cleanup: c2 } = renderWithAuth(
        React.createElement(CoachBookingCard, {
          booking: { ...sampleBookingTemplate, status: 'accepted' },
          onAccept: vi.fn(),
          onReject: vi.fn(),
        })
      );
      expect(findElement(acceptedTree, (el) => el.props?.testID === 'button-accept-bk_sample')).toBeNull();
      expect(findElement(acceptedTree, (el) => el.props?.testID === 'button-reject-bk_sample')).toBeNull();
      c2();
    });

    it('CoachBookingCard respects privacy: redacts phone and call button on rejected and cancelled requests', () => {
      const rejectedBooking: BookingItem = {
        ...sampleBookingTemplate,
        status: 'rejected',
        customerPhone: '+919876543210',
      };
      const { tree: rejectedTree, cleanup: c1 } = renderWithAuth(
        React.createElement(CoachBookingCard, { booking: rejectedBooking })
      );
      expect(findElement(rejectedTree, (el) => el.props?.testID === 'button-call-bk_sample')).toBeNull();
      c1();

      const cancelledBooking: BookingItem = {
        ...sampleBookingTemplate,
        status: 'cancelled',
        customerPhone: '+919876543210',
      };
      const { tree: cancelledTree, cleanup: c2 } = renderWithAuth(
        React.createElement(CoachBookingCard, { booking: cancelledBooking })
      );
      expect(findElement(cancelledTree, (el) => el.props?.testID === 'button-call-bk_sample')).toBeNull();
      c2();
    });
  });

  // =========================================================================
  // E. LOCATION & MAPS REGRESSION TESTS
  // =========================================================================
  describe('E. Location and Maps Regressions', () => {
    it('Sports Ground destination uses trainingAddress without GPS on CustomerBookingCard and CoachBookingCard', async () => {
      vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
      const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

      const groundBooking: BookingItem = {
        ...sampleBookingTemplate,
        _id: 'bk_ground',
        venueType: 'ground',
        trainingAddress: 'City Stadium, Gate 4',
        locationCoordinates: undefined,
      };

      // Customer Card Maps
      const customerTree = CustomerBookingCard({ booking: groundBooking });
      const customerMapsBtn = findElement(customerTree, (el) => el.props?.testID === 'button-maps-bk_ground');
      expect(customerMapsBtn).not.toBeNull();
      await customerMapsBtn.props.onPress();
      expect(openSpy).toHaveBeenCalledWith(
        'https://www.google.com/maps/dir/?api=1&destination=City%20Stadium%2C%20Gate%204'
      );

      // Coach Card Maps
      openSpy.mockClear();
      const { tree: coachTree, cleanup } = renderWithAuth(
        React.createElement(CoachBookingCard, { booking: groundBooking })
      );
      const coachMapsBtn = findElement(coachTree, (el) => el.props?.testID === 'button-maps-bk_ground');
      expect(coachMapsBtn).not.toBeNull();
      await coachMapsBtn.props.onPress();
      expect(openSpy).toHaveBeenCalledWith(
        'https://www.google.com/maps/dir/?api=1&destination=City%20Stadium%2C%20Gate%204'
      );
      cleanup();
    });

    it('Customer Home venue uses coordinates when available', async () => {
      vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
      const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

      const homeBooking: BookingItem = {
        ...sampleBookingTemplate,
        _id: 'bk_home_coords',
        venueType: 'customer_home',
        locationCoordinates: { latitude: 12.9716, longitude: 77.5946 },
        trainingAddress: 'Home Address',
      };

      const customerTree = CustomerBookingCard({ booking: homeBooking });
      const mapsBtn = findElement(customerTree, (el) => el.props?.testID === 'button-maps-bk_home_coords');
      expect(mapsBtn).not.toBeNull();
      await mapsBtn.props.onPress();

      expect(openSpy).toHaveBeenCalledWith(
        'https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946'
      );
    });
  });
});
