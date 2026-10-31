import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { Linking } from 'react-native';
import { BookingRequestModal } from '../home/components/BookingRequestModal';
import { CustomerBookingCard } from '../home/components/CustomerBookingCard';
import { CoachBookingCard } from '../home/components/CoachBookingCard';
import {
  BookingItem,
  CoachDiscoveryItem,
  getPublicCoaches,
  createBooking,
  getKolkataTomorrowDateString,
} from '../../services/bookingApi';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import { buildGoogleMapsUrl } from '../../services/locationService';

vi.mock('../../services/bookingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bookingApi')>();
  return {
    ...actual,
    getPublicCoaches: vi.fn(),
    createBooking: vi.fn(),
  };
});

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
  };
}

const mockJammuCoach: CoachDiscoveryItem = {
  _id: 'coach_jammu_01',
  name: 'Coach Vikram',
  role: 'coach',
  isConfiguredAvailability: true,
  timezone: 'Asia/Kolkata',
  profile: {
    bio: 'Wushu and combat sports coach based in Jammu.',
    disciplines: ['wushu', 'boxing'],
    specialties: ['Sanda', 'Boxing'],
    sessionFormats: ['one_on_one'],
    venueTypes: ['customer_home', 'ground'],
    hourlyRate: 1500,
    currency: 'INR',
    locations: ['Jammu'],
  },
};

describe('Ground Address & Google Maps Destination Priority', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Coach-configured location "Jammu" does not override a manually entered specific ground address in payload and summary preview', async () => {
    (getPublicCoaches as any).mockResolvedValue([mockJammuCoach]);
    (createBooking as any).mockResolvedValue({
      _id: 'bk_jammu_01',
      coachId: 'coach_jammu_01',
      sport: 'wushu',
      date: getKolkataTomorrowDateString(),
      startTime: '09:00',
      endTime: '10:00',
      durationMinutes: 60,
      venueType: 'ground',
      trainingAddress: 'MA Stadium, Parade Ground Road, Jammu, Jammu and Kashmir, India',
      status: 'pending',
    });

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_jwt_token',
        initialCoachId: 'coach_jammu_01',
        initialSport: 'wushu',
      })
    );

    await flushPromises();
    let tree = render();

    // 1. Switch venue to Sports Ground
    const groundPill = findElement(tree, (el) => el.props?.testID === 'venue-pill-ground');
    expect(groundPill).not.toBeNull();
    groundPill.props.onPress();
    tree = render();

    // Coach configured location "Jammu" is displayed in the facility card
    const coachLocDisplay = findElement(tree, (el) => el.props?.testID === 'coach-ground-location-display');
    expect(coachLocDisplay).not.toBeNull();
    expect(extractText(coachLocDisplay)).toContain('Jammu');

    // 2. Enter specific Ground Name and Address in the optional section
    const groundNameInput = findElement(tree, (el) => el.props?.testID === 'input-ground-name');
    expect(groundNameInput).not.toBeNull();
    groundNameInput.props.onChangeText('MA Stadium');

    const addressInput = findElement(tree, (el) => el.props?.testID === 'input-booking-address');
    expect(addressInput).not.toBeNull();
    addressInput.props.onChangeText('Parade Ground Road, Jammu, Jammu and Kashmir, India');

    const phoneInput = findElement(tree, (el) => el.props?.testID === 'input-booking-phone');
    phoneInput.props.onChangeText('+919876543210');

    tree = render();

    // 3. Verify Location Summary Preview reflects the authoritative manual destination, NOT simply "Jammu"
    const summaryBox = findElement(tree, (el) => el.props?.testID === 'location-summary-address');
    expect(summaryBox).not.toBeNull();
    const summaryText = extractText(summaryBox);
    expect(summaryText).toBe('MA Stadium, Parade Ground Road, Jammu, Jammu and Kashmir, India');
    expect(summaryText).not.toBe('Jammu');

    // 4. Submit booking request
    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    await flushPromises();

    // 5. Verify payload persistence: trainingAddress has the full specific address, coordinates are omitted
    expect(createBooking).toHaveBeenCalledWith('test_jwt_token', expect.objectContaining({
      coachId: 'coach_jammu_01',
      sport: 'wushu',
      venueType: 'ground',
      trainingAddress: 'MA Stadium, Parade Ground Road, Jammu, Jammu and Kashmir, India',
      customerPhone: '+919876543210',
    }));

    // Verify customer GPS coordinates are NEVER sent in a ground booking payload
    const calledPayload = (createBooking as any).mock.calls[0][1];
    expect(calledPayload.coordinates).toBeUndefined();
    expect(calledPayload.locationCoordinates).toBeUndefined();

    cleanup();
  });

  it('Maps uses the coach-designated ground ("Jammu") when no manual override is provided', async () => {
    (getPublicCoaches as any).mockResolvedValue([mockJammuCoach]);
    (createBooking as any).mockResolvedValue({
      _id: 'bk_jammu_02',
      coachId: 'coach_jammu_01',
      sport: 'wushu',
      date: getKolkataTomorrowDateString(),
      startTime: '09:00',
      endTime: '10:00',
      durationMinutes: 60,
      venueType: 'ground',
      trainingAddress: 'Jammu',
      status: 'pending',
    });

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_jwt_token',
        initialCoachId: 'coach_jammu_01',
        initialSport: 'wushu',
      })
    );

    await flushPromises();
    let tree = render();

    // Switch venue to Sports Ground
    const groundPill = findElement(tree, (el) => el.props?.testID === 'venue-pill-ground');
    groundPill.props.onPress();
    tree = render();

    // Customer leaves ground name and address blank, relying on coach's configured "Jammu"
    const phoneInput = findElement(tree, (el) => el.props?.testID === 'input-booking-phone');
    phoneInput.props.onChangeText('+919876543210');
    tree = render();

    const summaryBox = findElement(tree, (el) => el.props?.testID === 'location-summary-address');
    expect(extractText(summaryBox)).toBe('Jammu');

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    await flushPromises();

    expect(createBooking).toHaveBeenCalledWith('test_jwt_token', expect.objectContaining({
      venueType: 'ground',
      trainingAddress: 'Jammu',
    }));

    cleanup();
  });

  it('Customer Maps button opens the exact manual ground address with URL encoding', async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    const groundBooking: BookingItem = {
      _id: 'bk_test_ground_01',
      customerId: 'usr_cust_01',
      coachId: 'coach_jammu_01',
      coachName: 'Coach Vikram',
      sport: 'wushu',
      date: '2026-11-01',
      startTime: '09:00',
      endTime: '10:00',
      startMinutes: 540,
      endMinutes: 600,
      durationMinutes: 60,
      venueType: 'ground',
      trainingAddress: 'MA Stadium, Parade Ground Road, Jammu, Jammu and Kashmir, India',
      status: 'accepted',
      paymentStatus: 'unpaid',
      // Even if accidental coordinates existed on the object, ground must ignore them
      coordinates: { latitude: 32.7266, longitude: 74.857 },
      locationCoordinates: { latitude: 32.7266, longitude: 74.857 },
    };

    const component = React.createElement(CustomerBookingCard, {
      booking: groundBooking,
    });
    const { render, cleanup } = createInteractiveHarness(component);
    const tree = render();

    const mapsBtn = findElement(tree, (el) => el.props?.testID === `button-maps-${groundBooking._id}`);
    expect(mapsBtn).not.toBeNull();

    await mapsBtn.props.onPress();

    // Verify exact Maps URL with encoded parameters
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=MA%20Stadium%2C%20Parade%20Ground%20Road%2C%20Jammu%2C%20Jammu%20and%20Kashmir%2C%20India'
    );

    cleanup();
  });

  it('Coach Maps button opens the exact same manual ground address as customer Maps', async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    const groundBooking: BookingItem = {
      _id: 'bk_test_ground_01',
      customerId: 'usr_cust_01',
      customerName: 'Aarav Sharma',
      coachId: 'coach_jammu_01',
      sport: 'wushu',
      date: '2026-11-01',
      startTime: '09:00',
      endTime: '10:00',
      startMinutes: 540,
      endMinutes: 600,
      durationMinutes: 60,
      venueType: 'ground',
      trainingAddress: 'MA Stadium, Parade Ground Road, Jammu, Jammu and Kashmir, India',
      status: 'accepted',
      paymentStatus: 'unpaid',
      coordinates: { latitude: 32.7266, longitude: 74.857 },
    };

    const component = React.createElement(CoachBookingCard, {
      booking: groundBooking,
    });
    const { render, cleanup } = createInteractiveHarness(component);
    const tree = render();

    const mapsBtn = findElement(tree, (el) => el.props?.testID === `button-maps-${groundBooking._id}`);
    expect(mapsBtn).not.toBeNull();

    await mapsBtn.props.onPress();

    // Coach and Customer use identical authoritative URL
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=MA%20Stadium%2C%20Parade%20Ground%20Road%2C%20Jammu%2C%20Jammu%20and%20Kashmir%2C%20India'
    );

    cleanup();
  });

  it("Customer's Home GPS behavior remains unchanged and prioritizes coordinates", async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    const homeBooking: BookingItem = {
      _id: 'bk_home_01',
      customerId: 'usr_cust_01',
      customerName: 'Aarav Sharma',
      coachId: 'coach_jammu_01',
      sport: 'boxing',
      date: '2026-11-01',
      startTime: '09:00',
      endTime: '10:00',
      startMinutes: 540,
      endMinutes: 600,
      durationMinutes: 60,
      venueType: 'customer_home',
      trainingAddress: '12 12th Main Road, Indiranagar, Bangalore',
      coordinates: { latitude: 12.9716, longitude: 77.5946 },
      status: 'accepted',
      paymentStatus: 'unpaid',
    };

    const component = React.createElement(CoachBookingCard, {
      booking: homeBooking,
    });
    const { render, cleanup } = createInteractiveHarness(component);
    const tree = render();

    const mapsBtn = findElement(tree, (el) => el.props?.testID === `button-maps-${homeBooking._id}`);
    expect(mapsBtn).not.toBeNull();

    await mapsBtn.props.onPress();

    // Customer Home uses GPS coordinates
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946'
    );

    cleanup();
  });

  it("Historical Coach's Home bookings remain readable and navigable via address", async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    const legacyCoachHomeBooking: BookingItem = {
      _id: 'bk_legacy_01',
      customerId: 'usr_cust_01',
      coachId: 'coach_jammu_01',
      coachName: 'Coach Vikram',
      sport: 'boxing',
      date: '2026-10-15',
      startTime: '10:00',
      endTime: '11:00',
      startMinutes: 600,
      endMinutes: 660,
      durationMinutes: 60,
      venueType: 'coach_home' as any,
      trainingAddress: 'Flat 302, Coach Heights, Jammu',
      status: 'completed',
      paymentStatus: 'paid',
    };

    const component = React.createElement(CustomerBookingCard, {
      booking: legacyCoachHomeBooking,
    });
    const { render, cleanup } = createInteractiveHarness(component);
    const tree = render();

    // Venue label displays legacy indicator
    const cardText = extractText(tree);
    expect(cardText).toContain("Coach's Home (Legacy)");
    expect(cardText).toContain('Flat 302, Coach Heights, Jammu');

    const mapsBtn = findElement(tree, (el) => el.props?.testID === `button-maps-${legacyCoachHomeBooking._id}`);
    expect(mapsBtn).not.toBeNull();

    await mapsBtn.props.onPress();

    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=Flat%20302%2C%20Coach%20Heights%2C%20Jammu'
    );

    cleanup();
  });
});
