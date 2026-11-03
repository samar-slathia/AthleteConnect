import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { CoachBookingCard } from '../home/components/CoachBookingCard';
import { CustomerBookingCard } from '../home/components/CustomerBookingCard';
import { SlideToComplete } from '../home/components/SlideToComplete';
import { BookingItem, startBookingSession, completeBooking } from '../../services/bookingApi';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import { COLORS } from '../../theme/tokens';

vi.mock('../../services/bookingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bookingApi')>();
  return {
    ...actual,
    startBookingSession: vi.fn(),
    completeBooking: vi.fn(),
  };
});

// React Hook dispatcher mock for headless component testing
function renderHookComponent(
  ui: React.ReactElement,
  authValue: Partial<AuthContextType> = {}
) {
  const defaultAuth: AuthContextType = {
    user: {
      _id: 'coach_01',
      name: 'Maya Coach',
      email: 'coach@test.com',
      role: 'coach',
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

function findAllElements(element: any, predicate: (el: any) => boolean, results: any[] = []): any[] {
  if (!element || typeof element !== 'object') return results;
  if (predicate(element)) {
    results.push(element);
  }
  if (typeof element.type === 'function') {
    try {
      const rendered = element.type(element.props);
      findAllElements(rendered, predicate, results);
    } catch {
      // ignore
    }
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
  if (typeof element.type === 'function') {
    try {
      return extractText(element.type(element.props));
    } catch {
      return '';
    }
  }
  if (element.props && element.props.children) {
    return extractText(element.props.children);
  }
  return '';
}

const baseAcceptedBooking: BookingItem = {
  _id: 'booking_201',
  customerId: 'cust_01',
  coachId: 'coach_01',
  coachName: 'Coach Maya',
  customerName: 'Sam Athlete',
  customerPhone: '+91 98765 43210',
  trainingAddress: 'Kanteerava Stadium, Bengaluru',
  sport: 'boxing',
  date: '2026-11-10',
  startTime: '16:00',
  endTime: '17:00',
  startMinutes: 960,
  endMinutes: 1020,
  durationMinutes: 60,
  venueType: 'ground',
  status: 'accepted',
  paymentStatus: 'paid',
  createdAt: '2026-11-01T10:00:00.000Z',
};

describe('Phase 8: Coach Arrival, Live Session Timer & Slide-to-Complete', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Coach Arrival Action & Confirmation Modal', () => {
    it('displays Orange "I\'m at the location" button for accepted bookings without starting timer', () => {
      const onStartMock = vi.fn();
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: baseAcceptedBooking,
          onStartSession: onStartMock,
        })
      );

      const arrivedBtn = findByTestId(initialTree, 'button-arrived-booking_201');
      expect(arrivedBtn).not.toBeNull();
      expect(extractText(arrivedBtn)).toContain("I'm at the location");

      // Verify timer is NOT displayed yet
      const timerBanner = findByTestId(initialTree, 'live-timer-coach-booking_201');
      expect(timerBanner).toBeNull();
      expect(onStartMock).not.toHaveBeenCalled();

      cleanup();
    });

    it('opens arrival confirmation modal when "I\'m at the location" is tapped', () => {
      const onStartMock = vi.fn();
      const { render, initialTree, cleanup } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: baseAcceptedBooking,
          onStartSession: onStartMock,
        })
      );

      const arrivedBtn = findByTestId(initialTree, 'button-arrived-booking_201');
      expect(arrivedBtn).not.toBeNull();

      // Trigger arrival tap
      arrivedBtn.props.onPress();
      const updatedTree = render();

      const modal = findByTestId(updatedTree, 'modal-confirm-arrival-booking_201');
      expect(modal).not.toBeNull();
      expect(modal.props.visible).toBe(true);

      const modalText = extractText(modal);
      expect(modalText).toContain('Confirm Arrival');
      expect(modalText).toContain('Are you at the training location?');
      expect(modalText).toContain('60 minutes');

      cleanup();
    });

    it('cancels arrival confirmation modal without starting session timer', () => {
      const onStartMock = vi.fn();
      const { render, initialTree, cleanup } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: baseAcceptedBooking,
          onStartSession: onStartMock,
        })
      );

      const arrivedBtn = findByTestId(initialTree, 'button-arrived-booking_201');
      arrivedBtn.props.onPress();
      let tree = render();

      const cancelBtn = findByTestId(tree, 'button-cancel-start-booking_201');
      expect(cancelBtn).not.toBeNull();
      cancelBtn.props.onPress();

      tree = render();
      const modal = findByTestId(tree, 'modal-confirm-arrival-booking_201');
      expect(modal.props.visible).toBe(false);
      expect(onStartMock).not.toHaveBeenCalled();

      cleanup();
    });

    it('confirms arrival and calls onStartSession', () => {
      const onStartMock = vi.fn();
      const { render, initialTree, cleanup } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: baseAcceptedBooking,
          onStartSession: onStartMock,
        })
      );

      const arrivedBtn = findByTestId(initialTree, 'button-arrived-booking_201');
      arrivedBtn.props.onPress();
      let tree = render();

      const confirmBtn = findByTestId(tree, 'button-confirm-start-booking_201');
      expect(confirmBtn).not.toBeNull();
      confirmBtn.props.onPress();

      expect(onStartMock).toHaveBeenCalledTimes(1);
      expect(onStartMock).toHaveBeenCalledWith('booking_201');

      cleanup();
    });
  });

  describe('Live Session Timer & Duration Display (In Progress)', () => {
    it('displays live session banner with remaining and elapsed time for in_progress booking', () => {
      const startTime = new Date(Date.now() - 20 * 60 * 1000); // 20m elapsed
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 40m remaining

      const inProgressBooking: BookingItem = {
        ...baseAcceptedBooking,
        status: 'in_progress',
        sessionStartedAt: startTime.toISOString(),
        expectedEndedAt: endTime.toISOString(),
      };

      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: inProgressBooking,
          onComplete: vi.fn(),
        })
      );

      const timerBanner = findByTestId(initialTree, 'live-timer-coach-booking_201');
      expect(timerBanner).not.toBeNull();

      const timeRemaining = findByTestId(initialTree, 'time-remaining-booking_201');
      expect(timeRemaining).not.toBeNull();
      const remainingText = extractText(timeRemaining);
      // ~40:00 remaining
      expect(remainingText).toMatch(/39:\d{2}|40:\d{2}/);

      const timeElapsed = findByTestId(initialTree, 'time-elapsed-booking_201');
      expect(timeElapsed).not.toBeNull();
      const elapsedText = extractText(timeElapsed);
      // ~20:00 elapsed
      expect(elapsedText).toMatch(/19:\d{2}|20:\d{2}/);

      cleanup();
    });

    it('locks slide-to-complete when scheduled session duration has not yet elapsed', () => {
      const startTime = new Date(Date.now() - 10 * 60 * 1000); // 10m elapsed
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 50m remaining

      const inProgressBooking: BookingItem = {
        ...baseAcceptedBooking,
        status: 'in_progress',
        sessionStartedAt: startTime.toISOString(),
        expectedEndedAt: endTime.toISOString(),
      };

      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: inProgressBooking,
          onComplete: vi.fn(),
        })
      );

      const slider = findByTestId(initialTree, 'slide-to-complete-booking_201');
      expect(slider).not.toBeNull();

      // Accessible button fallback should be disabled while timer is locked
      const accessibleBtn = findByTestId(initialTree, 'slide-to-complete-booking_201-accessible-button');
      expect(accessibleBtn).not.toBeNull();
      expect(accessibleBtn.props.disabled).toBe(true);

      const sliderText = extractText(slider);
      expect(sliderText).toContain('LOCKED');
      expect(sliderText).toContain('REMAINING');

      cleanup();
    });

    it('unlocks slide-to-complete when scheduled duration has elapsed', () => {
      const startTime = new Date(Date.now() - 65 * 60 * 1000); // 65m elapsed
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // ended 5m ago

      const inProgressBooking: BookingItem = {
        ...baseAcceptedBooking,
        status: 'in_progress',
        sessionStartedAt: startTime.toISOString(),
        expectedEndedAt: endTime.toISOString(),
      };

      const onCompleteMock = vi.fn();
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(CoachBookingCard, {
          booking: inProgressBooking,
          onComplete: onCompleteMock,
        })
      );

      const slider = findByTestId(initialTree, 'slide-to-complete-booking_201');
      expect(slider).not.toBeNull();

      const sliderText = extractText(slider);
      expect(sliderText).toContain('SLIDE TO COMPLETE');

      // Accessible button fallback is enabled
      const accessibleBtn = findByTestId(initialTree, 'slide-to-complete-booking_201-accessible-button');
      expect(accessibleBtn).not.toBeNull();
      expect(accessibleBtn.props.disabled).toBe(false);

      // Trigger completion via accessible button
      accessibleBtn.props.onPress();
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      expect(onCompleteMock).toHaveBeenCalledWith('booking_201');

      cleanup();
    });
  });

  describe('CustomerBookingCard In-Progress & Completed Experience', () => {
    it('displays "In Progress" badge and live countdown banner for customer when session is active', () => {
      const startTime = new Date(Date.now() - 15 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

      const inProgressBooking: BookingItem = {
        ...baseAcceptedBooking,
        status: 'in_progress',
        sessionStartedAt: startTime.toISOString(),
        expectedEndedAt: endTime.toISOString(),
      };

      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(CustomerBookingCard, {
          booking: inProgressBooking,
          onCancel: vi.fn(),
        })
      );

      // Verify timer banner
      const timerBanner = findByTestId(initialTree, 'live-timer-customer-booking_201');
      expect(timerBanner).not.toBeNull();
      expect(extractText(timerBanner)).toContain('COACH ARRIVED • SESSION IN PROGRESS');

      // Verify customer cannot cancel active session
      const cancelBtn = findByTestId(initialTree, 'button-cancel-booking_201');
      expect(cancelBtn).toBeNull();

      cleanup();
    });

    it('displays completion notice and "Rate Coach" button when booking reaches completed status', () => {
      const completedBooking: BookingItem = {
        ...baseAcceptedBooking,
        status: 'completed',
        completedAt: new Date().toISOString(),
      };

      const onRateMock = vi.fn();
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(CustomerBookingCard, {
          booking: completedBooking,
          onRate: onRateMock,
        })
      );

      const completedNotice = findByTestId(initialTree, 'completed-notice-booking_201');
      expect(completedNotice).not.toBeNull();
      expect(extractText(completedNotice)).toContain('Session completed! Please rate your experience below.');

      const rateBtn = findByTestId(initialTree, 'button-rate-booking_201');
      expect(rateBtn).not.toBeNull();
      expect(extractText(rateBtn)).toContain('Rate Coach');

      rateBtn.props.onPress();
      expect(onRateMock).toHaveBeenCalledTimes(1);
      expect(onRateMock).toHaveBeenCalledWith(completedBooking);

      cleanup();
    });
  });

  describe('SlideToComplete Unit Component Tests', () => {
    it('renders disabled state with custom locked message', () => {
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(SlideToComplete, {
          disabled: true,
          disabledMessage: 'LOCKED (15:00 REMAINING)',
          onComplete: vi.fn(),
        })
      );

      const text = extractText(initialTree);
      expect(text).toContain('LOCKED (15:00 REMAINING)');
      cleanup();
    });

    it('renders active state with "SLIDE TO COMPLETE" prompt', () => {
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(SlideToComplete, {
          disabled: false,
          onComplete: vi.fn(),
        })
      );

      const text = extractText(initialTree);
      expect(text).toContain('SLIDE TO COMPLETE');
      cleanup();
    });

    it('renders completing indicator when isCompleting is true', () => {
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(SlideToComplete, {
          disabled: false,
          isCompleting: true,
          onComplete: vi.fn(),
        })
      );

      const text = extractText(initialTree);
      expect(text).toContain('COMPLETING SESSION...');
      cleanup();
    });

    it('accessible button triggers onComplete callback', () => {
      const onCompleteMock = vi.fn();
      const { initialTree, cleanup } = renderHookComponent(
        React.createElement(SlideToComplete, {
          disabled: false,
          onComplete: onCompleteMock,
          testID: 'test-slider',
        })
      );

      const accessibleBtn = findByTestId(initialTree, 'test-slider-accessible-button');
      expect(accessibleBtn).not.toBeNull();
      accessibleBtn.props.onPress();

      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      cleanup();
    });
  });
});
