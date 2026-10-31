import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { BookingRequestModal } from '../BookingRequestModal';
import {
  BookingItem,
  CoachDiscoveryItem,
  getPublicCoaches,
  createBooking,
  getKolkataTomorrowDateString,
} from '../../../../services/bookingApi';
import { AuthContext, AuthContextType } from '../../../../context/AuthContext';

vi.mock('../../../../services/locationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/locationService')>();
  return {
    ...actual,
    detectDeviceLocation: vi.fn(async () => ({
      success: true,
      coordinates: { latitude: 12.9716, longitude: 77.5946 },
      suggestedAddress: '12 12th Main, Indiranagar, Bangalore',
      addressComponents: {
        streetNumber: '12',
        street: '12th Main',
        district: 'Indiranagar',
        city: 'Bangalore',
        formattedAddress: '12 12th Main, Indiranagar, Bangalore',
      },
    })),
  };
});

vi.mock('../../../../services/bookingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/bookingApi')>();
  return {
    ...actual,
    getPublicCoaches: vi.fn(),
    createBooking: vi.fn(),
  };
});

const mockCoachesList: CoachDiscoveryItem[] = [
  {
    _id: 'coach_001',
    name: 'Sensei Maya',
    role: 'coach',
    isConfiguredAvailability: true,
    timezone: 'Asia/Kolkata',
    profile: {
      bio: 'Professional striking coach.',
      disciplines: ['boxing', 'kickboxing'],
      specialties: ['Focus Mitts'],
      sessionFormats: ['one_on_one'],
      venueTypes: ['customer_home', 'ground'],
      hourlyRate: 1500,
      currency: 'INR',
      locations: ['Indiranagar Ground'],
    },
  },
  {
    _id: 'coach_002',
    name: 'Master Kenji',
    role: 'coach',
    isConfiguredAvailability: false,
    timezone: 'Asia/Kolkata',
    profile: {
      bio: 'Wushu forms specialist.',
      disciplines: ['wushu'],
      specialties: ['Taolu Forms'],
      sessionFormats: ['one_on_one'],
      venueTypes: ['customer_home', 'ground'],
      hourlyRate: 1200,
      currency: 'INR',
      locations: ['City Stadium Ground'],
    },
  },
];

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

  const initialTree = renderTree();

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

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('BookingRequestModal — Initial Coach Preselection (Phase 3B.1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly preselects initial coach and discipline when both are supplied', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialSport: 'boxing',
        initialCoachId: 'coach_001',
      })
    );

    await flushPromises();
    const tree = render();

    // Verify Boxing is selected
    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    expect(boxingPill).not.toBeNull();

    // Sensei Maya chip is rendered and marked selected
    const mayaChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    expect(mayaChip).not.toBeNull();
    expect(mayaChip.props.accessibilityState?.selected).toBe(true);

    // No error banner
    const errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).toBeNull();

    cleanup();
  });

  it('preselects the requested valid discipline when a coach offers multiple disciplines', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialSport: 'kickboxing',
        initialCoachId: 'coach_001',
      })
    );

    await flushPromises();
    const tree = render();

    // Sensei Maya offers both boxing and kickboxing; kickboxing is preselected
    const kickboxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-kickboxing');
    expect(kickboxingPill).not.toBeNull();

    const mayaChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    expect(mayaChip).not.toBeNull();
    expect(mayaChip.props.accessibilityState?.selected).toBe(true);

    const errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).toBeNull();

    cleanup();
  });

  it('auto-determines a valid discipline offered by the coach when initialSport is not supplied', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialCoachId: 'coach_002', // Master Kenji offers only wushu
      })
    );

    await flushPromises();
    const tree = render();

    // Wushu is auto-selected based on Kenji's profile
    const kenjiChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_002');
    expect(kenjiChip).not.toBeNull();
    expect(kenjiChip.props.accessibilityState?.selected).toBe(true);

    const errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).toBeNull();

    cleanup();
  });

  it('keeps coach preselection intact when coach list arrives asynchronously', async () => {
    let resolveCoachesPromise: (coaches: CoachDiscoveryItem[]) => void;
    const delayedPromise = new Promise<CoachDiscoveryItem[]>((resolve) => {
      resolveCoachesPromise = resolve;
    });
    (getPublicCoaches as any).mockReturnValue(delayedPromise);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialSport: 'boxing',
        initialCoachId: 'coach_001',
      })
    );

    // Initial state before resolution shows loading indicator
    let tree = render();
    expect(findElement(tree, (el) => el.props?.testID === 'loading-coaches')).not.toBeNull();

    // Resolve coach list asynchronously
    resolveCoachesPromise!(mockCoachesList);
    await flushPromises();

    // After async arrival, coach is preselected and loading indicator is gone
    tree = render();
    expect(findElement(tree, (el) => el.props?.testID === 'loading-coaches')).toBeNull();
    const mayaChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    expect(mayaChip).not.toBeNull();
    expect(mayaChip.props.accessibilityState?.selected).toBe(true);

    cleanup();
  });

  it('does not select another coach when given an unknown or invalid coach ID', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialSport: 'boxing',
        initialCoachId: 'coach_unknown_999',
      })
    );

    await flushPromises();
    const tree = render();

    // Shows safe error banner
    const errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(
      findElement(
        errorBanner,
        (el) => typeof el.props?.children === 'string' && el.props.children.includes('could not be found')
      )
    ).not.toBeNull();

    // Maya is NOT selected even though she offers boxing
    const mayaChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    expect(mayaChip).not.toBeNull();
    expect(mayaChip.props.accessibilityState?.selected).toBe(false);

    cleanup();
  });

  it('safely rejects preselection when requested coach does not offer the requested discipline', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialSport: 'boxing', // Master Kenji only offers wushu
        initialCoachId: 'coach_002',
      })
    );

    await flushPromises();
    const tree = render();

    // Error banner displayed
    const errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(
      findElement(
        errorBanner,
        (el) => typeof el.props?.children === 'string' && el.props.children.includes('does not offer the chosen discipline')
      )
    ).not.toBeNull();

    // Maya offers boxing, but must NOT be silently selected in place of Kenji
    const mayaChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    expect(mayaChip).not.toBeNull();
    expect(mayaChip.props.accessibilityState?.selected).toBe(false);

    cleanup();
  });

  it('clears preselected coach when customer manually changes discipline', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialSport: 'boxing',
        initialCoachId: 'coach_001',
      })
    );

    await flushPromises();
    let tree = render();

    // Verify Maya is initially selected for Boxing
    let mayaChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    expect(mayaChip.props.accessibilityState?.selected).toBe(true);

    // Customer manually switches discipline to Wushu
    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    wushuPill.props.onPress();
    tree = render();

    // Maya is removed from visible list; Kenji is rendered and is NOT selected
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001')).toBeNull();
    const kenjiChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_002');
    expect(kenjiChip).not.toBeNull();
    expect(kenjiChip.props.accessibilityState?.selected).toBe(false);

    cleanup();
  });

  it('completes booking submission with preselected coach and standard form fields', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    const mockCreatedBooking: BookingItem = {
      _id: 'bk_created_123',
      customerId: 'usr_cust_01',
      coachId: 'coach_001',
      sport: 'boxing',
      date: getKolkataTomorrowDateString(),
      startTime: '09:00',
      endTime: '10:00',
      startMinutes: 540,
      endMinutes: 600,
      durationMinutes: 60,
      venueType: 'coach_home',
      trainingAddress: 'Indiranagar Studio',
      customerPhone: '+919876543210',
      status: 'pending',
      paymentStatus: 'unpaid',
    };
    (createBooking as any).mockResolvedValue(mockCreatedBooking);

    const onBookingCreated = vi.fn();

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialSport: 'boxing',
        initialCoachId: 'coach_001',
        onBookingCreated,
      })
    );

    await flushPromises();
    let tree = render();

    // Fill address and phone number
    const addressInput = findElement(tree, (el) => el.props?.testID === 'input-booking-address');
    addressInput.props.onChangeText('123 12th Main Road, Indiranagar');
    const phoneInput = findElement(tree, (el) => el.props?.testID === 'input-booking-phone');
    phoneInput.props.onChangeText('+919876543210');
    tree = render();

    // Submit booking request
    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();

    expect(createBooking).toHaveBeenCalledWith('test_token', {
      coachId: 'coach_001',
      sport: 'boxing',
      date: getKolkataTomorrowDateString(),
      startTime: '09:00',
      endTime: '10:00',
      venueType: 'customer_home',
      trainingAddress: '123 12th Main Road, Indiranagar',
      customerPhone: '+919876543210',
    });
    expect(onBookingCreated).toHaveBeenCalledWith(mockCreatedBooking);

    cleanup();
  });
});

describe('BookingRequestModal — Phase 3C Training Venue Rules', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers only Customer's Home and Sports Ground; Coach's Home never appears", async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    const tree = render();

    // Coach's Home must NEVER appear in the venue options
    expect(findElement(tree, (el) => el.props?.testID === 'venue-pill-coach_home')).toBeNull();

    // Customer's Home and Sports Ground are the only offered venues
    const customerHomePill = findElement(tree, (el) => el.props?.testID === 'venue-pill-customer_home');
    const groundPill = findElement(tree, (el) => el.props?.testID === 'venue-pill-ground');
    expect(customerHomePill).not.toBeNull();
    expect(groundPill).not.toBeNull();

    // Default venue is customer_home
    expect(findElement(tree, (el) => el.props?.testID === 'trainee-home-address-notice')).not.toBeNull();

    cleanup();
  });

  it("Customer's Home displays Detect My Location and supports GPS detection as well as manual entry", async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    // Detect My Location button is present
    const detectBtn = findElement(tree, (el) => el.props?.testID === 'button-detect-location');
    expect(detectBtn).not.toBeNull();

    // Trigger detect location
    await detectBtn.props.onPress();
    await flushPromises();
    tree = render();

    // GPS attached badge is rendered with coordinates
    const gpsBadge = findElement(tree, (el) => el.props?.testID === 'location-detected-coordinates');
    expect(gpsBadge).not.toBeNull();

    // Structured fields are populated
    const houseInput = findElement(tree, (el) => el.props?.testID === 'input-home-house');
    expect(houseInput.props?.value).toBe('12');

    // Manual address entry is also supported
    houseInput.props.onChangeText('Apt 402');
    tree = render();
    const updatedHouse = findElement(tree, (el) => el.props?.testID === 'input-home-house');
    expect(updatedHouse.props?.value).toBe('Apt 402');

    cleanup();
  });

  it('Sports Ground NEVER renders Detect My Location button, GPS indicator, or GPS badge', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    // Switch to Sports Ground
    const groundPill = findElement(tree, (el) => el.props?.testID === 'venue-pill-ground');
    groundPill.props.onPress();
    tree = render();

    // NEVER render Detect My Location button under Sports Ground
    expect(findElement(tree, (el) => el.props?.testID === 'button-detect-location')).toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'location-detecting-indicator')).toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'location-detected-coordinates')).toBeNull();

    // Sports Ground notice banner is rendered
    expect(findElement(tree, (el) => el.props?.testID === 'sports-ground-notice')).not.toBeNull();

    cleanup();
  });

  it('Sports Ground automatically selects a single coach-designated ground', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialCoachId: 'coach_002', // Coach Kenji has single location: 'City Stadium Ground'
      })
    );

    await flushPromises();
    let tree = render();

    // Select Sports Ground
    const groundPill = findElement(tree, (el) => el.props?.testID === 'venue-pill-ground');
    groundPill.props.onPress();
    tree = render();

    // Automatically displays single coach ground
    const groundDisplay = findElement(tree, (el) => el.props?.testID === 'coach-ground-location-display');
    expect(groundDisplay).not.toBeNull();
    expect(
      findElement(groundDisplay, (el) => typeof el.props?.children === 'string' && el.props.children.includes('City Stadium Ground'))
    ).not.toBeNull();

    cleanup();
  });

  it('Sports Ground allows choosing between multiple coach-designated grounds', async () => {
    const multiGroundCoach: CoachDiscoveryItem = {
      ...mockCoachesList[0],
      _id: 'coach_multi_ground',
      profile: {
        ...mockCoachesList[0].profile!,
        locations: ['Kanteerava Outdoor Stadium, Gate 3', 'Koramangala Football Ground'],
      },
    };
    (getPublicCoaches as any).mockResolvedValue([multiGroundCoach]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialCoachId: 'coach_multi_ground',
      })
    );

    await flushPromises();
    let tree = render();

    // Select Sports Ground
    const groundPill = findElement(tree, (el) => el.props?.testID === 'venue-pill-ground');
    groundPill.props.onPress();
    tree = render();

    // Selector is rendered with multiple options
    const selector = findElement(tree, (el) => el.props?.testID === 'coach-ground-location-selector');
    expect(selector).not.toBeNull();
    const opt0 = findElement(tree, (el) => el.props?.testID === 'coach-ground-option-0');
    const opt1 = findElement(tree, (el) => el.props?.testID === 'coach-ground-option-1');
    expect(opt0).not.toBeNull();
    expect(opt1).not.toBeNull();

    // Select option 1
    opt1.props.onPress();
    tree = render();

    const groundDisplay = findElement(tree, (el) => el.props?.testID === 'coach-ground-location-display');
    expect(groundDisplay).not.toBeNull();
    expect(
      findElement(groundDisplay, (el) => typeof el.props?.children === 'string' && el.props.children.includes('Koramangala Football Ground'))
    ).not.toBeNull();

    cleanup();
  });

  it('Sports Ground displays missing notice and requires manual address when coach has no grounds configured', async () => {
    const noGroundCoach: CoachDiscoveryItem = {
      ...mockCoachesList[0],
      _id: 'coach_no_ground',
      profile: {
        ...mockCoachesList[0].profile!,
        locations: [],
      },
    };
    (getPublicCoaches as any).mockResolvedValue([noGroundCoach]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialCoachId: 'coach_no_ground',
      })
    );

    await flushPromises();
    let tree = render();

    // Switch to Sports Ground
    const groundPill = findElement(tree, (el) => el.props?.testID === 'venue-pill-ground');
    groundPill.props.onPress();
    tree = render();

    // Warning notice rendered
    expect(findElement(tree, (el) => el.props?.testID === 'coach-ground-missing-notice')).not.toBeNull();

    // Submitting without entering address triggers validation error
    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();

    const errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(
      findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('sports ground or facility training address'))
    ).not.toBeNull();

    cleanup();
  });

  it('Sports Ground booking payload NEVER attaches customer GPS coordinates', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    (createBooking as any).mockResolvedValue({ _id: 'bk_ground_01' });

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        initialCoachId: 'coach_002', // Kenji has 'City Stadium Ground'
      })
    );

    await flushPromises();
    let tree = render();

    // 1. First trigger location detect on Customer's Home
    const detectBtn = findElement(tree, (el) => el.props?.testID === 'button-detect-location');
    await detectBtn.props.onPress();
    await flushPromises();
    tree = render();

    // 2. Switch to Sports Ground
    const groundPill = findElement(tree, (el) => el.props?.testID === 'venue-pill-ground');
    groundPill.props.onPress();
    tree = render();

    // 3. Fill phone number
    const phoneInput = findElement(tree, (el) => el.props?.testID === 'input-booking-phone');
    phoneInput.props.onChangeText('+919876543210');
    tree = render();

    // 4. Submit
    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();

    // Verify createBooking was called WITHOUT coordinates or locationCoordinates
    expect(createBooking).toHaveBeenCalledWith('test_token', {
      coachId: 'coach_002',
      sport: 'wushu',
      date: getKolkataTomorrowDateString(),
      startTime: '09:00',
      endTime: '10:00',
      venueType: 'ground',
      trainingAddress: 'City Stadium Ground',
      customerPhone: '+919876543210',
    });

    cleanup();
  });
});
