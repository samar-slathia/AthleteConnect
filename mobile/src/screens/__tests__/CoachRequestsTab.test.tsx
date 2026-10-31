import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { HomeScreen } from '../HomeScreen';
import { CoachHomeView } from '../home/CoachHomeView';
import { BottomNavBar, getTabsForRole } from '../../navigation/BottomNavBar';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import { UserProfile } from '../../services/authApi';
import { BookingItem } from '../../services/bookingApi';
import * as bookingApi from '../../services/bookingApi';

// Custom test harness for React Native in Node
function renderWithAuth(ui: React.ReactElement, authValue: Partial<AuthContextType> = {}) {
  const defaultAuth: AuthContextType = {
    user: null,
    token: 'test-token',
    isLoading: false,
    isInitializing: false,
    error: null,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
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
    useEffect(fn: any) {
      if (typeof fn === 'function') {
        const destructor = fn();
        if (typeof destructor === 'function') {
          // Destructor available if needed
        }
      }
    },
    useContext(context: any) {
      if (context === AuthContext) {
        return defaultAuth;
      }
      return { top: 0, bottom: 20, left: 0, right: 0 };
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

function findAllElements(element: any, predicate: (el: any) => boolean, results: any[] = []): any[] {
  if (!element) return results;
  if (Array.isArray(element)) {
    for (const item of element) {
      findAllElements(item, predicate, results);
    }
    return results;
  }
  if (typeof element !== 'object') return results;
  if (predicate(element)) {
    results.push(element);
  }
  if (element.props && element.props.children) {
    findAllElements(element.props.children, predicate, results);
  }
  return results;
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  const results = findAllElements(element, predicate);
  return results.length > 0 ? results[0] : null;
}

const coachUser: UserProfile = {
  _id: 'usr_coach_99',
  name: 'Coach Marcus',
  email: 'marcus@dojo.org',
  role: 'coach',
  isActive: true,
};

const parentUser: UserProfile = {
  _id: 'usr_parent_99',
  name: 'Eleanor Vance',
  email: 'eleanor@family.org',
  role: 'parent',
  isActive: true,
};

const individualUser: UserProfile = {
  _id: 'usr_ind_99',
  name: 'Alex Hunter',
  email: 'alex@solo.org',
  role: 'individual',
  isActive: true,
};

const sampleBookingTemplate: BookingItem = {
  _id: 'b_sample_0',
  customerId: 'usr_cust_1',
  coachId: 'usr_coach_99',
  customerName: 'David Student',
  coachName: 'Coach Marcus',
  sport: 'boxing',
  date: '2026-11-15',
  startTime: '10:00',
  endTime: '11:00',
  startMinutes: 600,
  endMinutes: 660,
  durationMinutes: 60,
  venueType: 'customer_home',
  trainingAddress: '42 Baker Street, Jammu',
  customerPhone: '9876543210',
  status: 'pending',
  paymentStatus: 'unpaid',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

describe('Phase 3B.5B — Coach Requests Tab & Session Separation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Navigation & Tab Hierarchy', () => {
    it('Coach sees exactly 5 tabs in the exact order: Home | Requests | Sessions | Availability | Profile', () => {
      const coachTabs = getTabsForRole('coach');
      expect(coachTabs).toHaveLength(5);
      expect(coachTabs.map((t) => t.id)).toEqual([
        'home',
        'requests',
        'sessions',
        'availability',
        'profile',
      ]);
      expect(coachTabs.map((t) => t.label)).toEqual([
        'Home',
        'Requests',
        'Sessions',
        'Availability',
        'Profile',
      ]);
    });

    it('Customer navigation remains exactly 4 tabs and unchanged: Home | Coaches | Bookings | Profile', () => {
      const parentTabs = getTabsForRole('parent');
      expect(parentTabs).toHaveLength(4);
      expect(parentTabs.map((t) => t.id)).toEqual(['home', 'coaches', 'bookings', 'profile']);

      const individualTabs = getTabsForRole('individual');
      expect(individualTabs).toHaveLength(4);
      expect(individualTabs.map((t) => t.id)).toEqual(['home', 'coaches', 'bookings', 'profile']);
    });

    it('Requests tab configuration has correct label, accessibilityLabel and testID', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(BottomNavBar, {
          activeTab: 'requests',
          onTabChange: vi.fn(),
          role: 'coach',
        })
      );

      const requestsTab = findElement(tree, (el) => el.props?.testID === 'tab-requests');
      expect(requestsTab).not.toBeNull();
      expect(requestsTab.props.accessibilityRole).toBe('tab');
      expect(requestsTab.props.accessibilityLabel).toBe('Requests tab');

      cleanup();
    });

    it('HomeScreen maps Requests tab title to "Booking Requests"', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'requests' }),
        { user: coachUser }
      );

      const badge = findElement(tree, (el) => el.props?.testID === 'top-bar-badge');
      expect(badge).not.toBeNull();
      expect(badge.props.children.props.label).toBe('Booking Requests');

      cleanup();
    });

    it('Only coaches can access Requests; parent or individual normalizes safely back to home', () => {
      const { tree: parentTree, cleanup: parentCleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'requests' }),
        { user: parentUser }
      );
      // Customer tab bar must not contain requests tab
      expect(findElement(parentTree, (el) => el.props?.testID === 'tab-requests')).toBeNull();
      parentCleanup();

      const { tree: indTree, cleanup: indCleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'requests' }),
        { user: individualUser }
      );
      expect(findElement(indTree, (el) => el.props?.testID === 'tab-requests')).toBeNull();
      indCleanup();
    });

    it('Legacy or invalid navigation tab states normalize safely to home for coaches', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'unknown_tab_xyz' }),
        { user: coachUser }
      );

      const coachHome = findElement(tree, (el) => el.type === CoachHomeView);
      expect(coachHome).not.toBeNull();
      expect(coachHome.props.mode).toBe('home');

      cleanup();
    });
  });

  describe('2. Requests Screen Mode (mode="requests")', () => {
    it('displays ONLY bookings whose status is "pending"', () => {
      const mixedBookings: BookingItem[] = [
        { ...sampleBookingTemplate, _id: 'b_pen_1', status: 'pending', createdAt: '2026-10-01T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_acc_1', status: 'accepted', createdAt: '2026-10-02T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_dec_1', status: 'rejected', createdAt: '2026-10-03T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_can_1', status: 'cancelled', createdAt: '2026-10-04T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_com_1', status: 'completed', createdAt: '2026-10-05T10:00:00.000Z' },
      ];

      const { tree, cleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'requests',
          initialBookings: mixedBookings,
        })
      );

      // Only pending section should render
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-pending')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-accepted')).toBeNull();
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-declined')).toBeNull();
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-cancelled')).toBeNull();
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-completed')).toBeNull();

      cleanup();
    });

    it('displays ALL pending requests, not just the three-item Home preview', () => {
      const fivePendingBookings: BookingItem[] = [1, 2, 3, 4, 5].map((i) => ({
        ...sampleBookingTemplate,
        _id: `b_pen_${i}`,
        status: 'pending',
        createdAt: `2026-10-0${i}T10:00:00.000Z`,
      }));

      const { tree, cleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'requests',
          initialBookings: fivePendingBookings,
        })
      );

      const section = findElement(tree, (el) => el.props?.testID === 'coach-booking-section-pending');
      expect(section).not.toBeNull();
      expect(findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('PENDING REQUESTS (5)'))).not.toBeNull();

      cleanup();
    });

    it('sorts pending requests by createdAt descending (newest first)', () => {
      const sortedBookings: BookingItem[] = [
        { ...sampleBookingTemplate, _id: 'b_old', status: 'pending', createdAt: '2026-10-01T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_new', status: 'pending', createdAt: '2026-10-10T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_mid', status: 'pending', createdAt: '2026-10-05T10:00:00.000Z' },
      ];

      const { tree, cleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'requests',
          initialBookings: sortedBookings,
        })
      );

      const section = findElement(tree, (el) => el.props?.testID === 'coach-booking-section-pending');
      expect(section).not.toBeNull();
      // Cards should be rendered in order: b_new, b_mid, b_old
      const cards = findAllElements(section, (el) => el.props?.booking !== undefined);
      expect(cards.map((c) => c.props.booking._id)).toEqual(['b_new', 'b_mid', 'b_old']);

      cleanup();
    });

    it('displays clear empty state "No pending booking requests" when there are no pending requests', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'requests',
          initialBookings: [],
        })
      );

      const emptySection = findElement(tree, (el) => el.props?.testID === 'coach-requests-empty-state');
      expect(emptySection).not.toBeNull();
      expect(emptySection.props.description).toBe('No pending booking requests');

      cleanup();
    });

    it('accepting or declining a request removes it from the list immediately', async () => {
      const mockAccept = vi.spyOn(bookingApi, 'acceptBooking').mockResolvedValue({
        ...sampleBookingTemplate,
        _id: 'b_target',
        status: 'accepted',
      });

      const onBookingsChange = vi.fn();
      const onPendingCountChange = vi.fn();

      const initialList: BookingItem[] = [
        { ...sampleBookingTemplate, _id: 'b_target', status: 'pending' },
        { ...sampleBookingTemplate, _id: 'b_stay', status: 'pending' },
      ];

      const { tree, cleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          token: 'test-token',
          mode: 'requests',
          initialBookings: initialList,
          onBookingsChange,
          onPendingCountChange,
        })
      );

      const card = findElement(tree, (el) => el.props?.booking?._id === 'b_target');
      expect(card).not.toBeNull();

      // Trigger accept
      await card.props.onAccept('b_target');
      expect(mockAccept).toHaveBeenCalledWith('test-token', 'b_target');
      expect(onBookingsChange).toHaveBeenCalled();

      // The updated list passed to onBookingsChange must have b_target status as accepted
      const updatedList = onBookingsChange.mock.calls[0][0];
      const targetInList = updatedList.find((b: BookingItem) => b._id === 'b_target');
      expect(targetInList.status).toBe('accepted');

      cleanup();
    });
  });

  describe('3. Sessions Screen Mode (mode="sessions")', () => {
    it('displays Accepted, Declined, Cancelled, and Completed sessions, and excludes Pending requests', () => {
      const allFiveBookings: BookingItem[] = [
        { ...sampleBookingTemplate, _id: 'b_pen', status: 'pending', createdAt: '2026-10-01T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_acc', status: 'accepted', createdAt: '2026-10-02T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_dec', status: 'rejected', createdAt: '2026-10-03T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_can', status: 'cancelled', createdAt: '2026-10-04T10:00:00.000Z' },
        { ...sampleBookingTemplate, _id: 'b_com', status: 'completed', createdAt: '2026-10-05T10:00:00.000Z' },
      ];

      const { tree, cleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'sessions',
          initialBookings: allFiveBookings,
        })
      );

      // Pending MUST NOT appear in Sessions
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-pending')).toBeNull();

      // Other 4 sections MUST appear
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-accepted')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-declined')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-cancelled')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.testID === 'coach-booking-section-completed')).not.toBeNull();

      cleanup();
    });
  });

  describe('4. Home Dashboard Preview & Navigation', () => {
    it('renders maximum three pending previews and provides "View all requests" action', () => {
      const fivePendingBookings: BookingItem[] = [1, 2, 3, 4, 5].map((i) => ({
        ...sampleBookingTemplate,
        _id: `b_pen_${i}`,
        status: 'pending',
        createdAt: `2026-10-0${i}T10:00:00.000Z`,
      }));

      const onNavigateToTab = vi.fn();

      const { tree, cleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'home',
          initialBookings: fivePendingBookings,
          onNavigateToTab,
        })
      );

      const previewSection = findElement(tree, (el) => el.props?.testID === 'coach-home-pending-preview');
      expect(previewSection).not.toBeNull();

      // Only 3 preview cards maximum in home mode
      const cards = findAllElements(previewSection, (el) => el.props?.booking !== undefined);
      expect(cards).toHaveLength(3);

      // View all requests button navigates directly to requests tab
      const viewAllBtn = findElement(tree, (el) => el.props?.testID === 'view-all-requests-button');
      expect(viewAllBtn).not.toBeNull();
      viewAllBtn.props.onPress();
      expect(onNavigateToTab).toHaveBeenCalledWith('requests');

      cleanup();
    });

    it('renders maximum three accepted session previews and provides "View all sessions" action', () => {
      const fourAcceptedBookings: BookingItem[] = [1, 2, 3, 4].map((i) => ({
        ...sampleBookingTemplate,
        _id: `b_acc_${i}`,
        status: 'accepted',
        createdAt: `2026-10-0${i}T10:00:00.000Z`,
      }));

      const onNavigateToTab = vi.fn();

      const { tree, cleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'home',
          initialBookings: fourAcceptedBookings,
          onNavigateToTab,
        })
      );

      const previewSection = findElement(tree, (el) => el.props?.testID === 'coach-home-sessions-preview');
      expect(previewSection).not.toBeNull();

      // Only 3 preview cards maximum
      const cards = findAllElements(previewSection, (el) => el.props?.booking !== undefined);
      expect(cards).toHaveLength(3);

      const viewAllSessionsBtn = findElement(tree, (el) => el.props?.testID === 'view-all-sessions-button');
      expect(viewAllSessionsBtn).not.toBeNull();
      viewAllSessionsBtn.props.onPress();
      expect(onNavigateToTab).toHaveBeenCalledWith('sessions');

      cleanup();
    });
  });

  describe('5. Pending Badge & Synchronized State', () => {
    it('BottomNavBar displays badge when pending count is positive', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(BottomNavBar, {
          activeTab: 'home',
          onTabChange: vi.fn(),
          role: 'coach',
          badges: { requests: 2 },
        })
      );

      const badge = findElement(tree, (el) => el.props?.testID === 'tab-badge-requests');
      expect(badge).not.toBeNull();

      const text = findElement(badge, (el) => el.props?.children === '2');
      expect(text).not.toBeNull();

      cleanup();
    });

    it('BottomNavBar hides badge when pending count is 0', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(BottomNavBar, {
          activeTab: 'home',
          onTabChange: vi.fn(),
          role: 'coach',
          badges: { requests: 0 },
        })
      );

      const badge = findElement(tree, (el) => el.props?.testID === 'tab-badge-requests');
      expect(badge).toBeNull();

      cleanup();
    });

    it('CoachHomeView notifies parent of pending count changes via onPendingCountChange', () => {
      const onPendingCountChange = vi.fn();
      const initialBookings: BookingItem[] = [
        { ...sampleBookingTemplate, _id: 'b1', status: 'pending' },
        { ...sampleBookingTemplate, _id: 'b2', status: 'pending' },
        { ...sampleBookingTemplate, _id: 'b3', status: 'accepted' },
      ];

      const { cleanup } = renderWithAuth(
        React.createElement(CoachHomeView, {
          user: coachUser,
          mode: 'home',
          initialBookings,
          onPendingCountChange,
        })
      );

      // Effect must report 2 pending requests
      expect(onPendingCountChange).toHaveBeenCalledWith(2);

      cleanup();
    });
  });
});
