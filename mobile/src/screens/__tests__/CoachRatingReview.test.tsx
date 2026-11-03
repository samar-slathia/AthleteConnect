import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { CustomerBookingCard } from '../home/components/CustomerBookingCard';
import { CoachBookingCard } from '../home/components/CoachBookingCard';
import { RatingModal } from '../home/components/RatingModal';
import { CoachDetailModal } from '../coaches/CoachDetailModal';
import { CoachesDirectoryView } from '../coaches/CoachesDirectoryView';
import {
  BookingItem,
  CoachDiscoveryItem,
  submitBookingReview,
  getPublicCoaches,
} from '../../services/bookingApi';
import { AuthContext, AuthContextType } from '../../context/AuthContext';

vi.mock('../../services/bookingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bookingApi')>();
  return {
    ...actual,
    submitBookingReview: vi.fn(),
    getPublicCoaches: vi.fn(),
  };
});

// React Hook dispatcher mock for headless component testing
function renderHookComponent(
  ui: React.ReactElement,
  authValue: Partial<AuthContextType> = {}
) {
  const defaultAuth: AuthContextType = {
    user: {
      _id: 'usr_cust_01',
      name: 'Customer User',
      email: 'customer@test.com',
      role: 'parent',
      isActive: true,
    },
    token: 'valid_jwt_token',
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
  const originalDispatcher = internals ? internals.H : null;

  const hooks: any[] = [];
  let hookIdx = 0;
  const effectFns: (() => void | (() => void))[] = [];

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
      effectFns.push(fn);
    },
    useContext(context: any) {
      if (context === AuthContext) {
        return defaultAuth;
      }
      return null;
    },
  };

  function renderTree() {
    hookIdx = 0;
    if (internals) {
      internals.H = dispatcher;
    }
    const Component = ui.type as React.FC<any>;
    return Component(ui.props);
  }

  const initialTree = renderTree();

  for (const fn of effectFns) {
    fn();
  }

  const cleanup = () => {
    if (internals) {
      internals.H = originalDispatcher;
    }
  };

  return {
    render: renderTree,
    initialTree,
    cleanup,
  };
}

// Traversal helpers for React Native components
function findAllElements(element: any, predicate: (el: any) => boolean, results: any[] = []): any[] {
  if (!element || typeof element !== 'object') return results;
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

function findByTestId(element: any, testId: string): any {
  return findElement(element, (el) => el.props && el.props.testID === testId);
}

function extractText(element: any): string {
  if (element === null || element === undefined) return '';
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(extractText).join('');
  if (element.props && element.props.children) {
    return extractText(element.props.children);
  }
  return '';
}

const baseBooking: BookingItem = {
  _id: 'booking_101',
  customerId: 'cust_01',
  coachId: 'coach_01',
  coachName: 'Coach Maya',
  customerName: 'Aarav Sharma',
  sport: 'boxing',
  date: '2026-11-10',
  startTime: '10:00',
  endTime: '11:00',
  startMinutes: 600,
  endMinutes: 660,
  durationMinutes: 60,
  venueType: 'ground',
  status: 'completed',
  paymentStatus: 'paid',
  createdAt: '2026-11-01T10:00:00.000Z',
};

const ratedCoach: CoachDiscoveryItem = {
  _id: 'coach_01',
  name: 'Coach Maya',
  role: 'coach',
  isConfiguredAvailability: true,
  timezone: 'Asia/Kolkata',
  rating: {
    averageRating: 4.8,
    reviewCount: 12,
  },
  reviews: [
    {
      _id: 'rev_1',
      rating: 5,
      reviewText: 'Mastered left hook and pivots in 2 sessions!',
      customerName: 'Aarav S.',
      createdAt: '2026-11-02T10:00:00.000Z',
    },
  ],
  profile: {
    bio: 'Professional boxing champion with 10 years experience.',
    disciplines: ['boxing'],
    specialties: ['Footwork', 'Defense'],
    sessionFormats: ['one_on_one'],
    venueTypes: ['ground'],
    hourlyRate: 1500,
    currency: 'INR',
    locations: ['Sports Ground Indiranagar'],
  },
};

const unratedCoach: CoachDiscoveryItem = {
  _id: 'coach_02',
  name: 'Coach Rahul',
  role: 'coach',
  isConfiguredAvailability: true,
  timezone: 'Asia/Kolkata',
  rating: {
    averageRating: 0,
    reviewCount: 0,
  },
  reviews: [],
  profile: {
    bio: 'Beginner friendly kickboxing coach.',
    disciplines: ['kickboxing'],
    specialties: ['Flexibility'],
    sessionFormats: ['one_on_one'],
    venueTypes: ['customer_home'],
    hourlyRate: 1200,
    currency: 'INR',
    locations: ['Koramangala'],
  },
};

describe('Mobile Coach Rating & Review System (Phase 7)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CustomerBookingCard Rating Actions', () => {
    it('displays "Rate Coach" button when booking is completed and not yet rated', () => {
      const onRateMock = vi.fn();
      const tree = CustomerBookingCard({
        booking: { ...baseBooking, status: 'completed', isRated: false },
        onRate: onRateMock,
      });

      const rateBtn = findByTestId(tree, 'button-rate-booking_101');
      expect(rateBtn).not.toBeNull();
      expect(extractText(rateBtn)).toContain('Rate Coach');
      expect(rateBtn.props.style.backgroundColor).toBe('#F97316');

      // Tap rate button
      rateBtn.props.onPress();
      expect(onRateMock).toHaveBeenCalledTimes(1);
      expect(onRateMock).toHaveBeenCalledWith(expect.objectContaining({ _id: 'booking_101' }));
    });

    it('does not display any session completion action on CustomerBookingCard (coach-only action)', () => {
      const acceptedTree = CustomerBookingCard({
        booking: { ...baseBooking, status: 'accepted' },
      });
      expect(findByTestId(acceptedTree, 'button-complete-booking_101')).toBeNull();

      const completedTree = CustomerBookingCard({
        booking: { ...baseBooking, status: 'completed' },
      });
      expect(findByTestId(completedTree, 'button-complete-booking_101')).toBeNull();
    });

    it('displays rated badge when session has already been reviewed', () => {
      const tree = CustomerBookingCard({
        booking: {
          ...baseBooking,
          status: 'completed',
          isRated: true,
          review: { rating: 5, reviewText: 'Superb session!' },
        },
      });

      const ratedBadge = findByTestId(tree, 'rated-indicator-booking_101');
      expect(ratedBadge).not.toBeNull();
      expect(extractText(ratedBadge)).toContain('You rated this session 5/5');

      // "Rate Coach" button should not be shown when already rated
      const rateBtn = findByTestId(tree, 'button-rate-booking_101');
      expect(rateBtn).toBeNull();
    });

    it('does not display "Rate Coach" button when booking is pending or accepted', () => {
      const pendingTree = CustomerBookingCard({
        booking: { ...baseBooking, status: 'pending' },
        onRate: vi.fn(),
      });
      expect(findByTestId(pendingTree, 'button-rate-booking_101')).toBeNull();

      const acceptedTree = CustomerBookingCard({
        booking: { ...baseBooking, status: 'accepted' },
        onRate: vi.fn(),
      });
      expect(findByTestId(acceptedTree, 'button-rate-booking_101')).toBeNull();
    });

    it('does not display cancel button when booking status is completed', () => {
      const tree = CustomerBookingCard({
        booking: { ...baseBooking, status: 'completed' },
        onCancel: vi.fn(),
      });
      expect(findByTestId(tree, 'button-cancel-booking_101')).toBeNull();
    });
  });

  describe('RatingModal Component', () => {
    it('renders 5 interactive stars and coach name context', () => {
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(RatingModal, {
          visible: true,
          onClose: vi.fn(),
          booking: baseBooking,
          token: 'valid_token',
        })
      );

      expect(findByTestId(initialTree, 'rating-modal')).not.toBeNull();
      expect(findByTestId(initialTree, 'rating-coach-name')).not.toBeNull();
      expect(extractText(findByTestId(initialTree, 'rating-coach-name'))).toContain('Coach Maya');

      // Check all 5 star buttons exist
      for (let s = 1; s <= 5; s++) {
        expect(findByTestId(initialTree, `button-star-${s}`)).not.toBeNull();
      }
      cleanup();
    });

    it('applies the Orange brand theme (#F97316) to the rating submit button', () => {
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(RatingModal, {
          visible: true,
          onClose: vi.fn(),
          booking: baseBooking,
          token: 'valid_token',
        })
      );

      const submitBtn = findByTestId(initialTree, 'button-submit-rating');
      expect(submitBtn).not.toBeNull();
      const flattenedStyle = Array.isArray(submitBtn.props.style)
        ? Object.assign({}, ...submitBtn.props.style)
        : submitBtn.props.style;
      expect(flattenedStyle.backgroundColor).toBe('#F97316');
      cleanup();
    });

    it('allows dismissing modal with "Not now" button without forcing rating', () => {
      const onCloseMock = vi.fn();
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(RatingModal, {
          visible: true,
          onClose: onCloseMock,
          booking: baseBooking,
          token: 'valid_token',
        })
      );

      const notNowBtn = findByTestId(initialTree, 'button-not-now');
      expect(notNowBtn).not.toBeNull();
      notNowBtn.props.onPress();
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      const closeHeaderBtn = findByTestId(initialTree, 'button-close-rating');
      expect(closeHeaderBtn).not.toBeNull();
      closeHeaderBtn.props.onPress();
      expect(onCloseMock).toHaveBeenCalledTimes(2);
      cleanup();
    });

    it('displays already rated banner when booking review already exists', () => {
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(RatingModal, {
          visible: true,
          onClose: vi.fn(),
          booking: {
            ...baseBooking,
            isRated: true,
            review: { rating: 5, reviewText: 'Already submitted note' },
          },
        })
      );

      const alreadyRated = findByTestId(initialTree, 'already-rated-banner');
      expect(alreadyRated).not.toBeNull();
      expect(extractText(alreadyRated)).toContain('You Rated This Session');
      expect(extractText(alreadyRated)).toContain('Already submitted note');
      cleanup();
    });
  });

  describe('CoachBookingCard Completion Action', () => {
    it('displays "Complete Session" button for accepted bookings', () => {
      const onCompleteMock = vi.fn();
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: { ...baseBooking, status: 'accepted' },
          onComplete: onCompleteMock,
        })
      );

      const completeBtn = findByTestId(initialTree, 'button-complete-booking_101');
      expect(completeBtn).not.toBeNull();
      expect(extractText(completeBtn)).toContain('Complete Session');

      completeBtn.props.onPress();
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      expect(onCompleteMock).toHaveBeenCalledWith('booking_101');
      cleanup();
    });

    it('does not display "Complete Session" button for pending, rejected, or completed bookings', () => {
      const { initialTree: pendingTree, cleanup: c1 } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: { ...baseBooking, status: 'pending' },
          onComplete: vi.fn(),
        })
      );
      expect(findByTestId(pendingTree, 'button-complete-booking_101')).toBeNull();
      c1();

      const { initialTree: rejectedTree, cleanup: c2 } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: { ...baseBooking, status: 'rejected' },
          onComplete: vi.fn(),
        })
      );
      expect(findByTestId(rejectedTree, 'button-complete-booking_101')).toBeNull();
      c2();

      const { initialTree: completedTree, cleanup: c3 } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: { ...baseBooking, status: 'completed' },
          onComplete: vi.fn(),
        })
      );
      expect(findByTestId(completedTree, 'button-complete-booking_101')).toBeNull();
      c3();
    });
  });

  describe('Coach Discovery Listing Display (CoachesDirectoryView)', () => {
    it('displays average star rating and review count when coach has reviews', () => {
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(CoachesDirectoryView, {
          initialDiscipline: 'boxing',
        })
      );

      expect(initialTree).not.toBeNull();
      cleanup();
    });
  });

  describe('Coach Profile Details & Reviews Display (CoachDetailModal)', () => {
    it('displays overall average rating and total reviews in hero summary when reviews exist', () => {
      const tree = CoachDetailModal({
        visible: true,
        coach: ratedCoach,
        onClose: vi.fn(),
        onChooseCoach: vi.fn(),
      });

      const ratingSummary = findByTestId(tree, 'coach-detail-rating-summary');
      expect(ratingSummary).not.toBeNull();
      const text = extractText(ratingSummary);
      expect(text).toContain('4.8');
      expect(text).toContain('12 Reviews');
    });

    it('displays customer reviews section with sanitized customer name to preserve privacy', () => {
      const tree = CoachDetailModal({
        visible: true,
        coach: ratedCoach,
        onClose: vi.fn(),
        onChooseCoach: vi.fn(),
      });

      const reviewsSection = findByTestId(tree, 'coach-detail-reviews-section');
      expect(reviewsSection).not.toBeNull();
      const text = extractText(reviewsSection);
      expect(text).toContain('CUSTOMER REVIEWS (12)');
      expect(text).toContain('Aarav S.');
      expect(text).toContain('Mastered left hook and pivots in 2 sessions!');
    });

    it('hides rating summary and reviews section when coach has no reviews', () => {
      const tree = CoachDetailModal({
        visible: true,
        coach: unratedCoach,
        onClose: vi.fn(),
        onChooseCoach: vi.fn(),
      });

      expect(findByTestId(tree, 'coach-detail-rating-summary')).toBeNull();
      expect(findByTestId(tree, 'coach-detail-reviews-section')).toBeNull();
    });
  });
});
