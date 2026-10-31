import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { CoachesDirectoryView } from '../CoachesDirectoryView';
import { CoachDiscoveryItem, CoachDiscipline } from '../../../services/bookingApi';
import * as bookingApi from '../../../services/bookingApi';
import { AuthContext, AuthContextType } from '../../../context/AuthContext';

// Tree inspection helpers
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
  if (element.props) {
    if (element.props.children) {
      const children = Array.isArray(element.props.children)
        ? element.props.children
        : [element.props.children];
      for (const child of children) {
        findAllElements(child, predicate, results);
      }
    }
    if (element.props.refreshControl) {
      findAllElements(element.props.refreshControl, predicate, results);
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

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

// Interactive render harness for evaluating state and effects in Node
function createInteractiveHarness(
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
  const originalDispatcher = internals.H;

  const hookStates: any[] = [];
  let hookIdx = 0;
  const effects: { fn: any; deps?: any[]; prevDeps?: any[]; cleanup?: any }[] = [];
  let effectIdx = 0;

  const dispatcher = {
    useState(initial: any) {
      const idx = hookIdx++;
      if (hookStates[idx] === undefined) {
        hookStates[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (action: any) => {
        hookStates[idx] = typeof action === 'function' ? action(hookStates[idx]) : action;
      };
      return [hookStates[idx], setState];
    },
    useRef(initial: any) {
      const idx = hookIdx++;
      if (hookStates[idx] === undefined) {
        hookStates[idx] = { current: initial };
      }
      return hookStates[idx];
    },
    useCallback(fn: any, deps?: any[]) {
      const idx = hookIdx++;
      const prev = hookStates[idx];
      if (!prev || !deps) {
        hookStates[idx] = { fn, deps };
        return fn;
      }
      const depsChanged =
        deps.length !== prev.deps.length ||
        deps.some((d: any, i: number) => d !== prev.deps[i]);
      if (depsChanged) {
        hookStates[idx] = { fn, deps };
        return fn;
      }
      return prev.fn;
    },
    useMemo(fn: any, deps?: any[]) {
      return fn();
    },
    useEffect(fn: any, deps?: any[]) {
      const idx = effectIdx++;
      if (!effects[idx]) {
        effects[idx] = { fn, deps };
      } else {
        effects[idx].fn = fn;
        effects[idx].deps = deps;
      }
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
    effectIdx = 0;
    internals.H = dispatcher;
    const Component = ui.type as React.FC<any>;
    return Component(ui.props);
  }

  function runEffects() {
    for (const eff of effects) {
      let shouldRun = false;
      if (!eff.prevDeps || !eff.deps) {
        shouldRun = true;
      } else if (
        eff.deps.length !== eff.prevDeps.length ||
        eff.deps.some((d: any, i: number) => d !== eff.prevDeps![i])
      ) {
        shouldRun = true;
      }
      if (shouldRun) {
        if (eff.cleanup) {
          eff.cleanup();
        }
        eff.cleanup = eff.fn();
        eff.prevDeps = eff.deps ? [...eff.deps] : undefined;
      }
    }
  }

  function act(fn?: () => void) {
    if (fn) fn();
    renderTree();
    runEffects();
    return renderTree();
  }

  // Initial render + run initial effects + initial tree
  const initialTree = act();

  const cleanup = () => {
    internals.H = originalDispatcher;
  };

  return {
    render: renderTree,
    act,
    initialTree,
    cleanup,
  };
}

// Mock Coaches
const mockBoxingCoach: CoachDiscoveryItem = {
  _id: 'coach_box_01',
  name: 'Tyson Singh',
  role: 'coach',
  isConfiguredAvailability: true,
  timezone: 'Asia/Kolkata',
  profile: {
    bio: 'Heavyweight boxing specialist with pad work expertise.',
    disciplines: ['boxing', 'kickboxing'],
    specialties: ['Heavy Bag', 'Counter Punching'],
    sessionFormats: ['one_on_one'],
    venueTypes: ['customer_home', 'ground'],
    hourlyRate: 1800,
    currency: 'INR',
    locations: ['Indiranagar Ground', 'Koramangala Stadium'],
  },
};

const mockWushuCoach: CoachDiscoveryItem = {
  _id: 'coach_wushu_02',
  name: 'Mei Lin',
  role: 'coach',
  isConfiguredAvailability: false,
  timezone: 'Asia/Kolkata',
  profile: {
    bio: 'Traditional Wushu forms and Sanda sparring instructor.',
    disciplines: ['wushu'],
    specialties: ['Taolu', 'Sanda Kick-catches'],
    sessionFormats: ['one_on_one'],
    venueTypes: ['customer_home', 'ground'],
    hourlyRate: 1400,
    currency: 'INR',
    locations: ['Cubbon Park Ground'],
  },
};

const mockKickboxingOnlyCoach: CoachDiscoveryItem = {
  _id: 'coach_kb_03',
  name: 'Alex Rivera',
  role: 'coach',
  isConfiguredAvailability: true,
  timezone: 'Asia/Kolkata',
  profile: {
    bio: 'Dutch kickboxing style with dynamic low kicks.',
    disciplines: ['kickboxing'],
    specialties: ['Dutch Combinations', 'Shin Conditioning'],
    sessionFormats: ['one_on_one'],
    venueTypes: ['customer_home', 'ground'],
    hourlyRate: 1600,
    currency: 'INR',
    locations: ['Whitefield Sports Arena'],
  },
};

describe('CoachesDirectoryView', () => {
  let getPublicCoachesSpy: any;

  beforeEach(() => {
    getPublicCoachesSpy = vi.spyOn(bookingApi, 'getPublicCoaches');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial discipline-selection prompt and does not call API when no discipline is selected', async () => {
    const harness = createInteractiveHarness(<CoachesDirectoryView />);
    const tree = harness.render();

    expect(findByTestId(tree, 'initial-discipline-prompt')).not.toBeNull();
    expect(extractText(findByTestId(tree, 'initial-discipline-prompt'))).toContain(
      'Choose Your Discipline'
    );
    expect(getPublicCoachesSpy).not.toHaveBeenCalled();

    // Verify the three discipline chips are present
    expect(findByTestId(tree, 'sport-chip-boxing')).not.toBeNull();
    expect(findByTestId(tree, 'sport-chip-wushu')).not.toBeNull();
    expect(findByTestId(tree, 'sport-chip-kickboxing')).not.toBeNull();

    harness.cleanup();
  });

  it('fetches Boxing coaches when Boxing chip is selected', async () => {
    getPublicCoachesSpy.mockResolvedValue([mockBoxingCoach]);

    const harness = createInteractiveHarness(<CoachesDirectoryView />);
    let tree = harness.render();

    // Select Boxing
    tree = harness.act(() => {
      findByTestId(tree, 'sport-chip-boxing').props.onPress();
    });

    await flushPromises();
    tree = harness.render();

    expect(getPublicCoachesSpy).toHaveBeenCalledWith({ discipline: 'boxing' });

    // Coach card should be rendered
    const cardEl = findByTestId(tree, `coach-card-${mockBoxingCoach._id}`);
    expect(cardEl).not.toBeNull();
    expect(extractText(cardEl)).toContain('Tyson Singh');
    expect(extractText(cardEl)).toContain('₹1800');

    harness.cleanup();
  });

  it('fetches Wushu coaches when Wushu chip is selected', async () => {
    getPublicCoachesSpy.mockResolvedValue([mockWushuCoach]);

    const harness = createInteractiveHarness(<CoachesDirectoryView />);
    let tree = harness.render();

    tree = harness.act(() => {
      findByTestId(tree, 'sport-chip-wushu').props.onPress();
    });

    await flushPromises();
    tree = harness.render();

    expect(getPublicCoachesSpy).toHaveBeenCalledWith({ discipline: 'wushu' });

    const cardEl = findByTestId(tree, `coach-card-${mockWushuCoach._id}`);
    expect(cardEl).not.toBeNull();
    expect(extractText(cardEl)).toContain('Mei Lin');

    harness.cleanup();
  });

  it('displays multi-discipline coaches under each offered discipline', async () => {
    // mockBoxingCoach offers both ['boxing', 'kickboxing']
    // When Boxing is selected:
    getPublicCoachesSpy.mockResolvedValue([mockBoxingCoach]);
    const harness = createInteractiveHarness(<CoachesDirectoryView />);
    let tree = harness.render();

    tree = harness.act(() => {
      findByTestId(tree, 'sport-chip-boxing').props.onPress();
    });
    await flushPromises();
    tree = harness.render();

    expect(findByTestId(tree, `coach-card-${mockBoxingCoach._id}`)).not.toBeNull();

    // When Kickboxing is selected:
    getPublicCoachesSpy.mockResolvedValue([mockBoxingCoach, mockKickboxingOnlyCoach]);
    tree = harness.act(() => {
      findByTestId(tree, 'sport-chip-kickboxing').props.onPress();
    });
    await flushPromises();
    tree = harness.render();

    expect(findByTestId(tree, `coach-card-${mockBoxingCoach._id}`)).not.toBeNull();
    expect(findByTestId(tree, `coach-card-${mockKickboxingOnlyCoach._id}`)).not.toBeNull();

    harness.cleanup();
  });

  it('renders loading indicator while fetching coaches', async () => {
    let resolvePromise: any;
    getPublicCoachesSpy.mockReturnValue(
      new Promise((res) => {
        resolvePromise = res;
      })
    );

    const harness = createInteractiveHarness(<CoachesDirectoryView />);
    let tree = harness.render();

    // Tap boxing, which triggers loadCoaches setting isLoading=true
    tree = harness.act(() => {
      findByTestId(tree, 'sport-chip-boxing').props.onPress();
    });

    expect(findByTestId(tree, 'loading-coaches-indicator')).not.toBeNull();

    // Resolve promise
    resolvePromise([mockBoxingCoach]);
    await flushPromises();
    tree = harness.render();

    expect(findByTestId(tree, 'loading-coaches-indicator')).toBeNull();
    expect(findByTestId(tree, `coach-card-${mockBoxingCoach._id}`)).not.toBeNull();

    harness.cleanup();
  });

  it('renders empty state when no coaches match the discipline', async () => {
    getPublicCoachesSpy.mockResolvedValue([]);

    const harness = createInteractiveHarness(<CoachesDirectoryView />);
    let tree = harness.render();

    tree = harness.act(() => {
      findByTestId(tree, 'sport-chip-boxing').props.onPress();
    });
    await flushPromises();
    tree = harness.render();

    const emptyEl = findByTestId(tree, 'empty-coaches-state');
    expect(emptyEl).not.toBeNull();
    expect(extractText(emptyEl)).toContain('No Coaches Found');

    harness.cleanup();
  });

  it('renders error state and handles retry button', async () => {
    getPublicCoachesSpy.mockRejectedValue(new Error('Network error connecting to coaches server'));

    const harness = createInteractiveHarness(<CoachesDirectoryView />);
    let tree = harness.render();

    tree = harness.act(() => {
      findByTestId(tree, 'sport-chip-boxing').props.onPress();
    });
    await flushPromises();
    tree = harness.render();

    const errorEl = findByTestId(tree, 'coaches-error-state');
    expect(errorEl).not.toBeNull();
    expect(extractText(errorEl)).toContain('Unable to Load Coaches');
    expect(extractText(errorEl)).toContain('Network error connecting to coaches server');

    // Tap retry with successful response
    getPublicCoachesSpy.mockResolvedValue([mockBoxingCoach]);
    const retryBtn = findByTestId(tree, 'button-retry-coaches');
    expect(retryBtn).not.toBeNull();

    tree = harness.act(() => {
      retryBtn.props.onPress();
    });
    await flushPromises();
    tree = harness.render();

    expect(findByTestId(tree, 'coaches-error-state')).toBeNull();
    expect(findByTestId(tree, `coach-card-${mockBoxingCoach._id}`)).not.toBeNull();

    harness.cleanup();
  });

  it('supports compact location filtering and displays no-matches state', async () => {
    getPublicCoachesSpy.mockResolvedValue([mockBoxingCoach]);

    const harness = createInteractiveHarness(<CoachesDirectoryView initialDiscipline="boxing" />);
    await flushPromises();
    let tree = harness.render();

    // Initially displays Tyson Singh who trains at 'Indiranagar Ground' and 'Koramangala Stadium'
    expect(findByTestId(tree, `coach-card-${mockBoxingCoach._id}`)).not.toBeNull();

    // Type a matching location into search input
    const searchInput = findByTestId(tree, 'input-location-filter');
    expect(searchInput).not.toBeNull();
    tree = harness.act(() => {
      searchInput.props.onChangeText('Indiranagar');
    });

    expect(findByTestId(tree, `coach-card-${mockBoxingCoach._id}`)).not.toBeNull();

    // Type a non-matching location
    tree = harness.act(() => {
      searchInput.props.onChangeText('Malleshwaram');
    });

    expect(findByTestId(tree, `coach-card-${mockBoxingCoach._id}`)).toBeNull();
    const noLocEl = findByTestId(tree, 'no-location-matches');
    expect(noLocEl).not.toBeNull();
    expect(extractText(noLocEl)).toContain('No Matching Locations');

    // Clear location filter
    const clearBtn = findByTestId(tree, 'button-clear-location-filter');
    expect(clearBtn).not.toBeNull();
    tree = harness.act(() => {
      clearBtn.props.onPress();
    });

    expect(findByTestId(tree, `coach-card-${mockBoxingCoach._id}`)).not.toBeNull();

    harness.cleanup();
  });

  it('supports pull-to-refresh on coach list', async () => {
    getPublicCoachesSpy.mockResolvedValue([mockBoxingCoach]);

    const harness = createInteractiveHarness(<CoachesDirectoryView initialDiscipline="boxing" />);
    await flushPromises();
    let tree = harness.render();

    const refreshControl = findElement(tree, (el) => el.props && el.props.refreshing !== undefined);
    expect(refreshControl).not.toBeNull();

    getPublicCoachesSpy.mockClear();
    getPublicCoachesSpy.mockResolvedValue([mockBoxingCoach]);

    // Trigger onRefresh
    tree = harness.act(() => {
      refreshControl.props.onRefresh();
    });
    await flushPromises();

    expect(getPublicCoachesSpy).toHaveBeenCalledWith({ discipline: 'boxing' });

    harness.cleanup();
  });

  it('prevents stale asynchronous responses from overwriting newer selections', async () => {
    let resolveReq1: any;
    let resolveReq2: any;

    getPublicCoachesSpy
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveReq1 = res;
        })
      )
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveReq2 = res;
        })
      );

    const harness = createInteractiveHarness(<CoachesDirectoryView />);
    let tree = harness.render();

    // 1. User taps Boxing (req 1 dispatched)
    tree = harness.act(() => {
      findByTestId(tree, 'sport-chip-boxing').props.onPress();
    });

    // 2. User quickly switches to Wushu (req 2 dispatched)
    tree = harness.act(() => {
      findByTestId(tree, 'sport-chip-wushu').props.onPress();
    });

    // 3. Stale Boxing req 1 resolves AFTER req 2 was dispatched
    resolveReq1([mockBoxingCoach]);
    await flushPromises();
    tree = harness.render();

    // Boxing coach should NOT be displayed because Wushu is the active selection
    expect(findByTestId(tree, `coach-card-${mockBoxingCoach._id}`)).toBeNull();

    // 4. Wushu req 2 resolves
    resolveReq2([mockWushuCoach]);
    await flushPromises();
    tree = harness.render();

    // Wushu coach should now be displayed
    expect(findByTestId(tree, `coach-card-${mockWushuCoach._id}`)).not.toBeNull();

    harness.cleanup();
  });

  it('opens CoachDetailModal when tapping a coach card, and Choose This Coach opens BookingRequestModal', async () => {
    getPublicCoachesSpy.mockResolvedValue([mockBoxingCoach]);

    const onBookingSuccessMock = vi.fn();
    const harness = createInteractiveHarness(
      <CoachesDirectoryView initialDiscipline="boxing" onBookingSuccess={onBookingSuccessMock} />
    );
    await flushPromises();
    let tree = harness.render();

    // 1. Tap the coach card
    const cardEl = findByTestId(tree, `coach-card-${mockBoxingCoach._id}`);
    expect(cardEl).not.toBeNull();

    tree = harness.act(() => {
      cardEl.props.onPress();
    });

    // 2. Verify CoachDetailModal is opened with the coach
    const detailModal = findElement(tree, (el) => el.type?.name === 'CoachDetailModal');
    expect(detailModal).not.toBeNull();
    expect(detailModal.props.visible).toBe(true);
    expect(detailModal.props.coach._id).toBe(mockBoxingCoach._id);
    expect(detailModal.props.selectedDiscipline).toBe('boxing');

    // 3. Trigger Choose This Coach callback from detail modal
    tree = harness.act(() => {
      detailModal.props.onChooseCoach(mockBoxingCoach, 'boxing');
    });

    // 4. Verify detail modal is closed and BookingRequestModal is opened with preselected coach & sport
    const bookingModal = findElement(tree, (el) => el.type?.name === 'BookingRequestModal');
    expect(bookingModal).not.toBeNull();
    expect(bookingModal.props.visible).toBe(true);
    expect(bookingModal.props.initialCoachId).toBe(mockBoxingCoach._id);
    expect(bookingModal.props.initialSport).toBe('boxing');

    harness.cleanup();
  });

  it('uses only real API data and contains no hardcoded demo coaches', async () => {
    getPublicCoachesSpy.mockResolvedValue([]);

    const harness = createInteractiveHarness(<CoachesDirectoryView initialDiscipline="boxing" />);
    await flushPromises();
    const tree = harness.render();

    // Should be strictly empty, never showing demo/fabricated cards
    const allCards = findAllElements(tree, (el) => el.props && String(el.props.testID).startsWith('coach-card-'));
    expect(allCards.length).toBe(0);

    harness.cleanup();
  });
});
