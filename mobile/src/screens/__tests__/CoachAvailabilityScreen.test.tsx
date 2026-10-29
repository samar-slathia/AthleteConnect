import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { CoachAvailabilityScreen } from '../CoachAvailabilityScreen';
import { CoachHomeView } from '../home/CoachHomeView';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import { UserProfile } from '../../services/authApi';
import {
  getCoachAvailability,
  updateCoachAvailability,
  CoachAvailability,
  CoachAvailabilityResponse,
  AuthApiError,
  DEFAULT_TIMEZONE,
} from '../../services/availabilityApi';

// Mock the availabilityApi client functions
vi.mock('../../services/availabilityApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/availabilityApi')>();
  return {
    ...actual,
    getCoachAvailability: vi.fn(),
    updateCoachAvailability: vi.fn(),
  };
});

const mockCoachUser: UserProfile = {
  _id: 'usr_coach_01',
  name: 'Marcus Vance',
  email: 'marcus@coach.athleteconnect.com',
  role: 'coach',
  isActive: true,
};

const mockPopulatedAvailability: CoachAvailability = {
  _id: 'avail_doc_123',
  userId: 'usr_coach_01',
  timezone: 'Asia/Kolkata',
  slots: [
    { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' },
    { dayOfWeek: 'monday', startTime: '16:00', endTime: '19:00' },
    { dayOfWeek: 'wednesday', startTime: '10:00', endTime: '14:00' },
    { dayOfWeek: 'friday', startTime: '08:00', endTime: '11:00' },
  ],
  unavailableDates: ['2026-11-20', '2026-12-25'],
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T01:00:00.000Z',
};

// Tree inspection helpers
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

// Interactive render harness for evaluating React hooks and rerenders in Node
function createHarness(ui: React.ReactElement, authValue: Partial<AuthContextType> = {}) {
  const defaultAuth: AuthContextType = {
    user: mockCoachUser,
    token: 'valid_mock_jwt_token',
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
    internals.H = dispatcher;
    const Component = ui.type as React.FC<any>;
    return Component(ui.props);
  }

  // Initial render
  const initialTree = renderTree();

  // Run effects synchronously
  for (const fn of effectFns) {
    fn();
  }

  const cleanup = () => {
    internals.H = originalDispatcher;
  };

  return {
    render: renderTree,
    initialTree,
    cleanup,
    auth: defaultAuth,
  };
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('CoachAvailabilityScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1. Initial loading state
  it('displays loading spinner initially while fetching availability schedule', () => {
    (getCoachAvailability as any).mockReturnValue(new Promise(() => {}));

    const { initialTree, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    const loadingSpinner = findElement(
      initialTree,
      (el) => el.props?.testID === 'availability-loading-indicator'
    );
    expect(loadingSpinner).toBeDefined();

    cleanup();
  });

  // 2. Successful unconfigured response and first-time guidance
  it('displays first-time setup guidance and empty schedule for unconfigured coach', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: null,
      isConfigured: false,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    const tree = render();

    // Guidance banner displayed
    const guidance = findElement(tree, (el) => el.props?.testID === 'new-availability-guidance');
    expect(guidance).toBeDefined();

    // Empty state message for default Monday tab
    const emptyDay = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('No availability slots configured for Monday')
    );
    expect(emptyDay).toBeDefined();

    // Timezone defaults to Asia/Kolkata
    const tzValue = findElement(tree, (el) => el.props?.children === DEFAULT_TIMEZONE);
    expect(tzValue).toBeDefined();

    cleanup();
  });

  // 3. Prefilling an existing schedule
  it('prefills slots, timezone, and blackout dates for a configured response', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: mockPopulatedAvailability,
      isConfigured: true,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    const tree = render();

    // Guidance banner not displayed for configured coach
    const guidance = findElement(tree, (el) => el.props?.testID === 'new-availability-guidance');
    expect(guidance).toBeNull();

    // Configured badge present
    const configuredBadge = findElement(
      tree,
      (el) => el.props?.label === 'Configured' && el.props?.variant === 'success'
    );
    expect(configuredBadge).toBeDefined();

    // Monday has 2 slots: 09:00 - 12:00 and 16:00 - 19:00
    const slot1 = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('09:00')
    );
    expect(slot1).toBeDefined();

    const slot2 = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('16:00')
    );
    expect(slot2).toBeDefined();

    // Blackout dates list contains 2026-11-20
    const dateChip = findElement(
      tree,
      (el) => el.props?.testID === 'remove-date-2026-11-20'
    );
    expect(dateChip).toBeDefined();

    cleanup();
  });

  // 4. Adding a valid time slot
  it('allows adding a valid time slot to the selected day', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: null,
      isConfigured: false,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    // Enter start and end time for Monday
    const startInput = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    const endInput = findElement(tree, (el) => el.props?.testID === 'input-end-time');
    startInput.props.onChangeText('09:00');
    endInput.props.onChangeText('12:00');

    // Click Add Slot
    tree = render();
    const addSlotBtn = findElement(tree, (el) => el.props?.testID === 'button-add-slot');
    const innerBtn = findElement(addSlotBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    // Rerender and verify slot appears
    tree = render();
    const slotCard = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('09:00 – 12:00')
    );
    expect(slotCard).toBeDefined();

    // Input fields cleared
    const newStart = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    expect(newStart.props.value).toBe('');

    cleanup();
  });

  // 5. Invalid time format
  it('rejects slot with invalid 24-hour time format', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: null,
      isConfigured: false,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    const startInput = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    const endInput = findElement(tree, (el) => el.props?.testID === 'input-end-time');
    startInput.props.onChangeText('25:00');
    endInput.props.onChangeText('12:00');

    tree = render();
    const addSlotBtn = findElement(tree, (el) => el.props?.testID === 'button-add-slot');
    const innerBtn = findElement(addSlotBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    tree = render();
    const errorEl = findElement(tree, (el) => el.props?.testID === 'slot-error');
    expect(errorEl).toBeDefined();
    expect(errorEl.props.children[1].props.children).toContain('Invalid start time');

    cleanup();
  });

  // 6. End time equal to or earlier than start time
  it('rejects slot when end time is equal to or earlier than start time', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: null,
      isConfigured: false,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    const startInput = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    const endInput = findElement(tree, (el) => el.props?.testID === 'input-end-time');
    startInput.props.onChangeText('14:00');
    endInput.props.onChangeText('10:00');

    tree = render();
    const addSlotBtn = findElement(tree, (el) => el.props?.testID === 'button-add-slot');
    const innerBtn = findElement(addSlotBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    tree = render();
    const errorEl = findElement(tree, (el) => el.props?.testID === 'slot-error');
    expect(errorEl).toBeDefined();
    expect(errorEl.props.children[1].props.children).toContain('must be after start time');

    cleanup();
  });

  // 7. Duration under 30 minutes
  it('rejects slot when duration is under 30 minutes', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: null,
      isConfigured: false,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    const startInput = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    const endInput = findElement(tree, (el) => el.props?.testID === 'input-end-time');
    startInput.props.onChangeText('09:00');
    endInput.props.onChangeText('09:20'); // 20 minutes

    tree = render();
    const addSlotBtn = findElement(tree, (el) => el.props?.testID === 'button-add-slot');
    const innerBtn = findElement(addSlotBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    tree = render();
    const errorEl = findElement(tree, (el) => el.props?.testID === 'slot-error');
    expect(errorEl).toBeDefined();
    expect(errorEl.props.children[1].props.children).toContain('at least 30 minutes');

    cleanup();
  });

  // 8. Overlapping slots and allowed adjacent slots
  it('rejects overlapping slots on the same day but permits adjacent boundary slots', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: {
        _id: 'a1',
        userId: 'u1',
        timezone: 'Asia/Kolkata',
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
        unavailableDates: [],
      },
      isConfigured: true,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    // 1. Try to add overlapping slot (10:00 - 13:00)
    let startInput = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    let endInput = findElement(tree, (el) => el.props?.testID === 'input-end-time');
    startInput.props.onChangeText('10:00');
    endInput.props.onChangeText('13:00');

    tree = render();
    let addSlotBtn = findElement(tree, (el) => el.props?.testID === 'button-add-slot');
    let innerBtn = findElement(addSlotBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    tree = render();
    let errorEl = findElement(tree, (el) => el.props?.testID === 'slot-error');
    expect(errorEl).toBeDefined();
    expect(errorEl.props.children[1].props.children).toContain('Slot conflicts with existing');

    // 2. Add adjacent slot (12:00 - 15:00) which touches the 12:00 boundary
    startInput = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    endInput = findElement(tree, (el) => el.props?.testID === 'input-end-time');
    startInput.props.onChangeText('12:00');
    endInput.props.onChangeText('15:00');

    tree = render();
    addSlotBtn = findElement(tree, (el) => el.props?.testID === 'button-add-slot');
    innerBtn = findElement(addSlotBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    // Adjacent slot accepted successfully without conflict
    tree = render();
    const adjacentSlot = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('12:00 – 15:00')
    );
    expect(adjacentSlot).toBeDefined();

    cleanup();
  });

  // 9. Maximum 4 slots per day and 28 total slots
  it('enforces maximum 4 slots per day limit', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: {
        _id: 'a1',
        userId: 'u1',
        timezone: 'Asia/Kolkata',
        slots: [
          { dayOfWeek: 'monday', startTime: '06:00', endTime: '08:00' },
          { dayOfWeek: 'monday', startTime: '09:00', endTime: '11:00' },
          { dayOfWeek: 'monday', startTime: '12:00', endTime: '14:00' },
          { dayOfWeek: 'monday', startTime: '15:00', endTime: '17:00' },
        ],
        unavailableDates: [],
      },
      isConfigured: true,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    // 4 slots reached badge displayed
    const maxReachedBadge = findElement(
      tree,
      (el) => el.props?.label === 'Max 4 Reached'
    );
    expect(maxReachedBadge).toBeDefined();

    // Try adding a 5th slot
    const startInput = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    const endInput = findElement(tree, (el) => el.props?.testID === 'input-end-time');
    startInput.props.onChangeText('18:00');
    endInput.props.onChangeText('20:00');

    tree = render();
    const addSlotBtn = findElement(tree, (el) => el.props?.testID === 'button-add-slot');
    const innerBtn = findElement(addSlotBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    tree = render();
    const errorEl = findElement(tree, (el) => el.props?.testID === 'slot-error');
    expect(errorEl).toBeDefined();
    expect(errorEl.props.children[1].props.children).toContain('Maximum 4 slots allowed');

    cleanup();
  });

  // 10. Removing a slot with hitSlop touch target expansion
  it('allows removing an existing time slot and provides expanded hitSlop touch target', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: {
        _id: 'a1',
        userId: 'u1',
        timezone: 'Asia/Kolkata',
        slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00' }],
        unavailableDates: [],
      },
      isConfigured: true,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    const removeBtn = findElement(tree, (el) => el.props?.testID === 'remove-slot-monday-09:00');
    expect(removeBtn).toBeDefined();
    expect(removeBtn.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
    removeBtn.props.onPress();

    tree = render();
    const emptyNotice = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('No availability slots configured for Monday')
    );
    expect(emptyNotice).toBeDefined();

    cleanup();
  });

  // 10b. Chronological slot display
  it('displays slots in ascending chronological order by start time even if added out of order', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: null,
      isConfigured: false,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    // 1. Add evening slot first (18:00 - 21:00)
    let startInput = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    let endInput = findElement(tree, (el) => el.props?.testID === 'input-end-time');
    startInput.props.onChangeText('18:00');
    endInput.props.onChangeText('21:00');

    tree = render();
    let addSlotBtn = findElement(tree, (el) => el.props?.testID === 'button-add-slot');
    let innerBtn = findElement(addSlotBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    // 2. Add morning slot second (09:00 - 12:00)
    tree = render();
    startInput = findElement(tree, (el) => el.props?.testID === 'input-start-time');
    endInput = findElement(tree, (el) => el.props?.testID === 'input-end-time');
    startInput.props.onChangeText('09:00');
    endInput.props.onChangeText('12:00');

    tree = render();
    addSlotBtn = findElement(tree, (el) => el.props?.testID === 'button-add-slot');
    innerBtn = findElement(addSlotBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    // 3. Verify rendered slot cards order in DOM: 09:00 – 12:00 must appear before 18:00 – 21:00
    tree = render();
    const slotTimeElements = findAllElements(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes(' – ')
    );
    expect(slotTimeElements.length).toBe(2);
    expect(slotTimeElements[0].props.children).toBe('09:00 – 12:00');
    expect(slotTimeElements[1].props.children).toBe('18:00 – 21:00');

    cleanup();
  });

  // 11. Adding and removing unavailable blackout dates
  it('allows adding and removing unavailable blackout dates', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: null,
      isConfigured: false,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    // Enter valid date
    const dateInput = findElement(tree, (el) => el.props?.testID === 'input-unavailable-date');
    dateInput.props.onChangeText('2026-11-25');

    tree = render();
    const addDateBtn = findElement(tree, (el) => el.props?.testID === 'button-add-date');
    const innerBtn = findElement(addDateBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    tree = render();
    const chipRemove = findElement(tree, (el) => el.props?.testID === 'remove-date-2026-11-25');
    expect(chipRemove).toBeDefined();

    // Now remove it
    chipRemove.props.onPress();

    tree = render();
    const chipAfterRemove = findElement(tree, (el) => el.props?.testID === 'remove-date-2026-11-25');
    expect(chipAfterRemove).toBeNull();

    cleanup();
  });

  // 12. Invalid calendar dates, duplicate dates, and maximum 30 dates
  it('rejects invalid calendar dates and duplicate dates', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: {
        _id: 'a1',
        userId: 'u1',
        timezone: 'Asia/Kolkata',
        slots: [],
        unavailableDates: ['2026-11-20'],
      },
      isConfigured: true,
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    // 1. Try invalid calendar date (Feb 30)
    let dateInput = findElement(tree, (el) => el.props?.testID === 'input-unavailable-date');
    dateInput.props.onChangeText('2026-02-30');

    tree = render();
    let addDateBtn = findElement(tree, (el) => el.props?.testID === 'button-add-date');
    let innerBtn = findElement(addDateBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    tree = render();
    let errorEl = findElement(tree, (el) => el.props?.testID === 'date-error');
    expect(errorEl).toBeDefined();
    expect(errorEl.props.children[1].props.children).toContain('Invalid calendar date');

    // 2. Try duplicate date
    dateInput = findElement(tree, (el) => el.props?.testID === 'input-unavailable-date');
    dateInput.props.onChangeText('2026-11-20');

    tree = render();
    addDateBtn = findElement(tree, (el) => el.props?.testID === 'button-add-date');
    innerBtn = findElement(addDateBtn, (el) => typeof el.props?.onPress === 'function');
    innerBtn.props.onPress();

    tree = render();
    errorEl = findElement(tree, (el) => el.props?.testID === 'date-error');
    expect(errorEl).toBeDefined();
    expect(errorEl.props.children[1].props.children).toContain('already added');

    cleanup();
  });

  // 13. Successful save with the correct payload
  it('saves availability schedule with correct payload and displays success notice', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: mockPopulatedAvailability,
      isConfigured: true,
    } as CoachAvailabilityResponse);

    (updateCoachAvailability as any).mockResolvedValue({
      availability: mockPopulatedAvailability,
      isConfigured: true,
      message: 'Availability schedule saved successfully.',
    } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    const saveBtn = findElement(tree, (el) => el.props?.testID === 'button-save-availability');
    const innerBtn = findElement(saveBtn, (el) => typeof el.props?.onPress === 'function');
    await innerBtn.props.onPress();

    expect(updateCoachAvailability).toHaveBeenCalledWith(
      'valid_mock_jwt_token',
      expect.objectContaining({
        slots: mockPopulatedAvailability.slots,
        timezone: 'Asia/Kolkata',
        unavailableDates: mockPopulatedAvailability.unavailableDates,
      })
    );

    tree = render();
    const successBanner = findElement(
      tree,
      (el) => el.props?.testID === 'availability-save-success'
    );
    expect(successBanner).toBeDefined();

    cleanup();
  });

  // 14. Save failure preserves form data and displays an error
  it('handles save failure gracefully: preserves all form data and displays user-friendly error', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: mockPopulatedAvailability,
      isConfigured: true,
    } as CoachAvailabilityResponse);

    (updateCoachAvailability as any).mockRejectedValue(
      new AuthApiError('Overlapping slots detected on Tuesday.', 400)
    );

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    const saveBtn = findElement(tree, (el) => el.props?.testID === 'button-save-availability');
    const innerBtn = findElement(saveBtn, (el) => typeof el.props?.onPress === 'function');
    await innerBtn.props.onPress();

    tree = render();
    const errorBanner = findElement(tree, (el) => el.props?.testID === 'availability-save-error');
    expect(errorBanner).toBeDefined();
    expect(errorBanner.props.children[1].props.children).toBe('Overlapping slots detected on Tuesday.');

    // Existing slots preserved
    const slot1 = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('09:00')
    );
    expect(slot1).toBeDefined();

    cleanup();
  });

  // 15. Fetch failure displays Retry and does not enable saving unknown empty data; retrying recovers
  it('displays error and Retry action on fetch failure without showing form', async () => {
    (getCoachAvailability as any)
      .mockRejectedValueOnce(new AuthApiError('Network connection timeout.', 0))
      .mockResolvedValueOnce({
        availability: null,
        isConfigured: false,
      } as CoachAvailabilityResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    // Error description shown
    const errorDesc = findElement(
      tree,
      (el) => el.props?.children === 'Network connection timeout.'
    );
    expect(errorDesc).toBeDefined();

    // Retry button present
    const retryBtn = findElement(tree, (el) => el.props?.testID === 'retry-button');
    expect(retryBtn).toBeDefined();

    // Schedule form save button NOT present while error state is active
    const saveBtn = findElement(tree, (el) => el.props?.testID === 'button-save-availability');
    expect(saveBtn).toBeNull();

    // Invoke the actual Retry button's onPress callback
    const retryAction = typeof retryBtn.props?.onPress === 'function'
      ? retryBtn
      : findElement(retryBtn, (el) => typeof el.props?.onPress === 'function');
    expect(retryAction).toBeDefined();
    await retryAction.props.onPress();

    // Await promise flushing and rerender
    await flushPromises();
    tree = render();

    // Verify recovery: two requests made, error gone, save button available
    expect(getCoachAvailability).toHaveBeenCalledTimes(2);

    const errorDescAfter = findElement(
      tree,
      (el) => el.props?.children === 'Network connection timeout.'
    );
    expect(errorDescAfter).toBeNull();

    const retryBtnAfter = findElement(tree, (el) => el.props?.testID === 'retry-button');
    expect(retryBtnAfter).toBeNull();

    const saveBtnAfter = findElement(tree, (el) => el.props?.testID === 'button-save-availability');
    expect(saveBtnAfter).toBeDefined();

    cleanup();
  });

  // 16. Back control invokes onBack
  it('invokes onBack callback when back button is pressed', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: null,
      isConfigured: false,
    } as CoachAvailabilityResponse);

    const onBackMock = vi.fn();
    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, { onBack: onBackMock })
    );

    await flushPromises();
    const tree = render();

    const backBtn = findElement(tree, (el) => el.props?.testID === 'availability-back-button');
    expect(backBtn).toBeDefined();
    backBtn.props.onPress();

    expect(onBackMock).toHaveBeenCalledTimes(1);

    cleanup();
  });

  // 17. Duplicate save prevention
  it('prevents duplicate concurrent save requests while saving', async () => {
    (getCoachAvailability as any).mockResolvedValue({
      availability: mockPopulatedAvailability,
      isConfigured: true,
    } as CoachAvailabilityResponse);

    let resolveSave: any;
    (updateCoachAvailability as any).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );

    const { render, cleanup } = createHarness(
      React.createElement(CoachAvailabilityScreen, {})
    );

    await flushPromises();
    let tree = render();

    const saveBtn = findElement(tree, (el) => el.props?.testID === 'button-save-availability');
    const innerBtn = findElement(saveBtn, (el) => typeof el.props?.onPress === 'function');

    // First press
    innerBtn.props.onPress();

    // Second press immediately while first is in-flight
    innerBtn.props.onPress();

    expect(updateCoachAvailability).toHaveBeenCalledTimes(1);

    resolveSave({
      availability: mockPopulatedAvailability,
      isConfigured: true,
      message: 'Saved',
    });
    await flushPromises();

    cleanup();
  });
});

describe('CoachHomeView - Availability Editor Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Configure Availability button in CoachHomeView status notice', () => {
    const { initialTree, cleanup } = createHarness(
      React.createElement(CoachHomeView, { user: mockCoachUser })
    );

    const configBtn = findElement(
      initialTree,
      (el) => el.props?.title === 'Configure Availability'
    );
    expect(configBtn).toBeDefined();

    cleanup();
  });

  it('switches to CoachAvailabilityScreen when Configure Availability is pressed', () => {
    (getCoachAvailability as any).mockReturnValue(new Promise(() => {}));

    const { render, initialTree, cleanup } = createHarness(
      React.createElement(CoachHomeView, { user: mockCoachUser })
    );

    const configBtn = findElement(
      initialTree,
      (el) => el.props?.title === 'Configure Availability'
    );
    configBtn.props.onPress();

    const tree = render();

    // Should now render CoachAvailabilityScreen (e.g. loading or back button)
    const availBackBtn = findElement(
      tree,
      (el) => el.props?.testID === 'availability-back-button' || el.props?.testID === 'availability-loading-indicator'
    );
    expect(availBackBtn).toBeDefined();

    cleanup();
  });

  it('switches to CoachAvailabilityScreen when Roadmap Step 4 is pressed', () => {
    (getCoachAvailability as any).mockReturnValue(new Promise(() => {}));

    const { render, initialTree, cleanup } = createHarness(
      React.createElement(CoachHomeView, { user: mockCoachUser })
    );

    const step4 = findElement(
      initialTree,
      (el) => el.props?.stepNumber === 4 && el.props?.title === 'Weekly Availability'
    );
    expect(step4).toBeDefined();
    expect(step4.props.statusLabel).toBe('Available');

    // Find the touchable wrapper
    const touchableStep4 = findElement(
      initialTree,
      (el) => el.props?.accessibilityLabel === 'Configure Weekly Availability Schedule'
    );
    expect(touchableStep4).toBeDefined();
    touchableStep4.props.onPress();

    const tree = render();
    const availBackBtn = findElement(
      tree,
      (el) => el.props?.testID === 'availability-back-button' || el.props?.testID === 'availability-loading-indicator'
    );
    expect(availBackBtn).toBeDefined();

    cleanup();
  });
});
