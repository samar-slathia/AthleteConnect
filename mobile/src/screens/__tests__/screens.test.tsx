import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { RegisterScreen } from '../RegisterScreen';
import { LoginScreen } from '../LoginScreen';
import { HomeScreen } from '../HomeScreen';
import { UserProfileView } from '../profile/UserProfileView';
import { BottomNavBar } from '../../navigation/BottomNavBar';
import { ParentHomeView } from '../home/ParentHomeView';
import { IndividualHomeView } from '../home/IndividualHomeView';
import { CoachHomeView } from '../home/CoachHomeView';
import { CustomerBookingCard } from '../home/components/CustomerBookingCard';
import { BookingRequestModal } from '../home/components/BookingRequestModal';
import { CoachBookingCard } from '../home/components/CoachBookingCard';
import { BookingChatModal } from '../home/components/BookingChatModal';
import {
  BookingItem,
  BookingMessageItem,
  CoachDiscoveryItem,
  getPublicCoaches,
  createBooking,
  getCustomerBookings,
  cancelBooking,
  getCoachBookings,
  acceptBooking,
  rejectBooking,
  getBookingMessages,
  sendBookingMessage,
  getKolkataTomorrowDateString,
  getKolkataDateString,
} from '../../services/bookingApi';
import {
  CUSTOMER_QUICK_MESSAGES,
  COACH_QUICK_MESSAGES,
  getQuickMessagesForRole,
} from '../../data/quickMessages';
import { Linking } from 'react-native';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import { UserProfile } from '../../services/authApi';
import { RoleId } from '../../data/roles';
import { detectDeviceLocation } from '../../services/locationService';

vi.mock('../../services/locationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/locationService')>();
  return {
    ...actual,
    detectDeviceLocation: vi.fn(async (options?: any) => {
      if (options?.onCoordinates) {
        options.onCoordinates({ latitude: 12.9716, longitude: 77.5946 });
      }
      const addressComponents = {
        streetNumber: '12',
        street: '12th Main',
        district: 'Indiranagar',
        city: 'Bangalore',
        formattedAddress: '12 12th Main, Indiranagar, Bangalore',
      };
      if (options?.onAddressResolved) {
        options.onAddressResolved(addressComponents);
      }
      return {
        success: true,
        coordinates: { latitude: 12.9716, longitude: 77.5946 },
        suggestedAddress: '12 12th Main, Indiranagar, Bangalore',
        addressComponents,
      };
    }),
  };
});

vi.mock('../../services/bookingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bookingApi')>();
  return {
    ...actual,
    getPublicCoaches: vi.fn(),
    createBooking: vi.fn(),
    getCustomerBookings: vi.fn(),
    cancelBooking: vi.fn(),
    getCoachBookings: vi.fn(),
    acceptBooking: vi.fn(),
    rejectBooking: vi.fn(),
    getBookingMessages: vi.fn(),
    sendBookingMessage: vi.fn(),
  };
});

// Hook harness for evaluating functional components with useState and useContext in Node
function renderWithAuth(ui: React.ReactElement, authValue: Partial<AuthContextType> = {}) {
  const defaultAuth: AuthContextType = {
    user: null,
    token: null,
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
    useEffect() {
      // No-op for screen render test
    },
    useContext(context: any) {
      if (context === AuthContext) {
        return defaultAuth;
      }
      return null;
    },
  };

  internals.H = dispatcher;
  hookIdx = 0;

  // Render component function directly
  const Component = ui.type as React.FC<any>;
  const tree = Component(ui.props);

  const cleanup = () => {
    internals.H = originalDispatcher;
  };

  return { tree, auth: defaultAuth, cleanup };
}

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

describe('RegisterScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders role card for valid customer role: parent', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(RegisterScreen, { initialRole: 'parent' })
    );

    const titleEl = findElement(tree, (el) => el.props?.children === 'Parent / Guardian');
    expect(titleEl).toBeDefined();

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Create Account');
    expect(submitBtn).toBeDefined();
    expect(submitBtn.props.disabled).toBe(false);

    cleanup();
  });

  it('renders role card for valid customer role: coach', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(RegisterScreen, { initialRole: 'coach' })
    );

    const titleEl = findElement(tree, (el) => el.props?.children === 'Player / Coach');
    expect(titleEl).toBeDefined();

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Create Account');
    expect(submitBtn).toBeDefined();
    expect(submitBtn.props.disabled).toBe(false);

    cleanup();
  });

  it('disables submit button and shows error when given invalid role (e.g. admin)', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(RegisterScreen, { initialRole: 'admin' as RoleId })
    );

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Create Account');
    expect(submitBtn).toBeDefined();
    expect(submitBtn.props.disabled).toBe(true);

    cleanup();
  });

  it('displays auth error message when AuthContext contains an error', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(RegisterScreen, { initialRole: 'parent' }),
      { error: 'An account with this email address already exists.' }
    );

    const errorEl = findElement(
      tree,
      (el) => el.props?.children === 'An account with this email address already exists.'
    );
    expect(errorEl).toBeDefined();

    cleanup();
  });
});

describe('LoginScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders email and password inputs and submit button', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(LoginScreen, {}));

    const inputs = findAllElements(
      tree,
      (el) => el.type?.displayName === 'TextInput' || el.props?.accessibilityLabel?.includes('input')
    );
    expect(inputs).toHaveLength(2);

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Sign In');
    expect(submitBtn).toBeDefined();
    expect(submitBtn.props.loading).toBe(false);

    cleanup();
  });

  it('disables submit button and shows loading indicator when auth is loading', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(LoginScreen, {}), {
      isLoading: true,
    });

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Sign In');
    expect(submitBtn).toBeDefined();
    expect(submitBtn.props.loading).toBe(true);
    expect(submitBtn.props.disabled).toBe(true);

    cleanup();
  });

  it('displays error message from AuthContext (e.g. invalid credentials)', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(LoginScreen, {}), {
      error: 'Invalid email or password.',
    });

    const errorEl = findElement(
      tree,
      (el) => el.props?.children === 'Invalid email or password.'
    );
    expect(errorEl).toBeDefined();

    cleanup();
  });

  it('regression: displays retryable error message on network failure (HTTP 0) and stops spinner', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(LoginScreen, {}), {
      error: 'Unable to connect to AthleteConnect servers. Please check your connection and try again.',
      isLoading: false,
    });

    const errorEl = findElement(
      tree,
      (el) =>
        el.props?.children ===
        'Unable to connect to AthleteConnect servers. Please check your connection and try again.'
    );
    expect(errorEl).toBeDefined();

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Sign In');
    expect(submitBtn.props.loading).toBe(false);
    expect(submitBtn.props.disabled).toBe(false);

    cleanup();
  });

  it('regression: displays error message on server error (HTTP 500) and keeps submit button retryable', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(LoginScreen, {}), {
      error: 'AthleteConnect service is currently unavailable. Please try again later.',
      isLoading: false,
    });

    const errorEl = findElement(
      tree,
      (el) =>
        el.props?.children ===
        'AthleteConnect service is currently unavailable. Please try again later.'
    );
    expect(errorEl).toBeDefined();

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Sign In');
    expect(submitBtn.props.loading).toBe(false);
    expect(submitBtn.props.disabled).toBe(false);

    cleanup();
  });

  it('regression: blocks duplicate submissions while login request is in flight', () => {
    const loginMock = vi.fn().mockResolvedValue(undefined);
    const { tree, cleanup } = renderWithAuth(React.createElement(LoginScreen, {}), {
      login: loginMock,
      isLoading: true,
    });

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Sign In');
    expect(submitBtn.props.loading).toBe(true);
    expect(submitBtn.props.disabled).toBe(true);

    submitBtn.props.onPress();
    expect(loginMock).not.toHaveBeenCalled();

    cleanup();
  });
});

describe('HomeScreen', () => {
  const coachUser: UserProfile = {
    _id: 'usr_coach_1',
    name: 'Sensei Maya',
    email: 'maya@dojo.com',
    role: 'coach',
    isActive: true,
  };

  const parentUser: UserProfile = {
    _id: 'usr_parent_1',
    name: 'Sarah Connor',
    email: 'sarah@family.com',
    role: 'parent',
    isActive: true,
  };

  const individualUser: UserProfile = {
    _id: 'usr_ind_1',
    name: 'Alex Rivera',
    email: 'alex@training.com',
    role: 'individual',
    isActive: true,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders user profile with name, email, role badge, and "Your Account" header', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(UserProfileView, { user: coachUser }),
      {
        user: coachUser,
      }
    );

    const nameEl = findElement(tree, (el) => el.props?.children === 'Sensei Maya');
    expect(nameEl).toBeDefined();

    const emailEl = findElement(tree, (el) => el.props?.children === 'maya@dojo.com');
    expect(emailEl).toBeDefined();

    const roleEl = findElement(tree, (el) => el.props?.children === 'Player / Coach');
    expect(roleEl).toBeDefined();

    const activeEl = findElement(tree, (el) => el.props?.children === 'Active');
    expect(activeEl).toBeDefined();

    // Replaced misleading "Verified Profile" with honest "Your Account"
    const accountSection = findElement(tree, (el) => el.props?.children === 'Your Account');
    expect(accountSection).toBeDefined();

    const oldVerifiedSection = findElement(tree, (el) => el.props?.children === 'Verified Profile');
    expect(oldVerifiedSection).toBeNull();

    const signOutBtn = findElement(tree, (el) => el.props?.title === 'Sign Out');
    expect(signOutBtn).toBeDefined();

    cleanup();
  });

  it('delegates to ParentHomeView when user role is parent without leaking other views', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
      user: parentUser,
    });

    const parentView = findElement(tree, (el) => el.type === ParentHomeView);
    expect(parentView).toBeDefined();

    const indView = findElement(tree, (el) => el.type === IndividualHomeView);
    expect(indView).toBeNull();

    const coachView = findElement(tree, (el) => el.type === CoachHomeView);
    expect(coachView).toBeNull();

    cleanup();
  });

  it('delegates to IndividualHomeView when user role is individual without leaking other views', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
      user: individualUser,
    });

    const indView = findElement(tree, (el) => el.type === IndividualHomeView);
    expect(indView).toBeDefined();

    const parentView = findElement(tree, (el) => el.type === ParentHomeView);
    expect(parentView).toBeNull();

    const coachView = findElement(tree, (el) => el.type === CoachHomeView);
    expect(coachView).toBeNull();

    cleanup();
  });

  it('delegates to CoachHomeView when user role is coach without leaking other views', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
      user: coachUser,
    });

    const coachView = findElement(tree, (el) => el.type === CoachHomeView);
    expect(coachView).toBeDefined();

    const parentView = findElement(tree, (el) => el.type === ParentHomeView);
    expect(parentView).toBeNull();

    const indView = findElement(tree, (el) => el.type === IndividualHomeView);
    expect(indView).toBeNull();

    cleanup();
  });

  it('delegates to UserProfileView when on profile tab', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(HomeScreen, { initialTab: 'profile' }),
      {
        user: coachUser,
      }
    );

    const profileView = findElement(tree, (el) => el.type === UserProfileView);
    expect(profileView).not.toBeNull();

    cleanup();
  });

  it('renders persistent BottomNavBar for authenticated user', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
      user: coachUser,
    });

    const bottomNav = findElement(tree, (el) => el.type === BottomNavBar);
    expect(bottomNav).not.toBeNull();

    cleanup();
  });

  it('triggers logout when Sign Out button is pressed', async () => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    const { tree, cleanup } = renderWithAuth(
      React.createElement(UserProfileView, { user: coachUser, onLogout: logoutMock }),
      {
        user: coachUser,
        logout: logoutMock,
      }
    );

    const signOutBtn = findElement(tree, (el) => el.props?.title === 'Sign Out');
    expect(signOutBtn).not.toBeNull();

    await signOutBtn.props.onPress();
    expect(logoutMock).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('renders fallback empty state when no user is authenticated', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
      user: null,
    });

    const emptyEl = findElement(
      tree,
      (el) => el.props?.children === 'No authenticated session found.'
    );
    expect(emptyEl).toBeDefined();

    cleanup();
  });
});

describe('ParentHomeView', () => {
  const parentUser: UserProfile = {
    _id: 'usr_parent_1',
    name: 'Sarah Connor',
    email: 'sarah@family.com',
    role: 'parent',
    isActive: true,
  };

  it('renders youth sports hub welcome and child profile in-development card', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(ParentHomeView, { user: parentUser })
    );

    const titleEl = findElement(tree, (el) => el.props?.children === 'Youth Sports & Family Hub');
    expect(titleEl).toBeDefined();

    const childProfileHeading = findElement(
      tree,
      (el) => el.props?.children === 'Child Profiles Coming Soon'
    );
    expect(childProfileHeading).toBeDefined();

    const devBadge = findElement(tree, (el) => el.props?.label === 'In Development');
    expect(devBadge).toBeDefined();

    cleanup();
  });

  it('renders educational discipline cards for Boxing, Wushu, Kickboxing with youth focus', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(ParentHomeView, { user: parentUser })
    );

    const boxingCard = findElement(
      tree,
      (el) => el.props?.title === 'Boxing' && el.props?.audienceFocus === 'Youth Fundamentals'
    );
    expect(boxingCard).toBeDefined();

    const wushuCard = findElement(
      tree,
      (el) => el.props?.title === 'Wushu' && el.props?.audienceFocus === 'Forms & Flexibility'
    );
    expect(wushuCard).toBeDefined();

    const kickboxingCard = findElement(
      tree,
      (el) => el.props?.title === 'Kickboxing' && el.props?.audienceFocus === 'Agility & Fitness'
    );
    expect(kickboxingCard).toBeDefined();

    cleanup();
  });

  it('renders honest empty state for youth scheduled sessions without fake bookings or claims', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(ParentHomeView, { user: parentUser })
    );

    const emptySessions = findElement(
      tree,
      (el) => el.props?.title === 'No Youth Sessions Scheduled'
    );
    expect(emptySessions).toBeDefined();

    // Verify no fake coach names or misleading verification claims are present
    const fakeCoachEl = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('Elena Vance')
    );
    expect(fakeCoachEl).toBeNull();

    cleanup();
  });
});

describe('IndividualHomeView', () => {
  const individualUser: UserProfile = {
    _id: 'usr_ind_1',
    name: 'Alex Rivera',
    email: 'alex@training.com',
    role: 'individual',
    isActive: true,
  };

  it('renders personal training hub welcome and adult discipline cards', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(IndividualHomeView, { user: individualUser })
    );

    const titleEl = findElement(tree, (el) => el.props?.children === 'Personal Training Hub');
    expect(titleEl).toBeDefined();

    const boxingCard = findElement(
      tree,
      (el) => el.props?.title === 'Boxing' && el.props?.audienceFocus === 'Striking & Defense'
    );
    expect(boxingCard).toBeDefined();

    const wushuCard = findElement(
      tree,
      (el) => el.props?.title === 'Wushu' && el.props?.audienceFocus === 'Contemporary & Traditional'
    );
    expect(wushuCard).toBeDefined();

    const kickboxingCard = findElement(
      tree,
      (el) => el.props?.title === 'Kickboxing' && el.props?.audienceFocus === 'Combos & Power'
    );
    expect(kickboxingCard).toBeDefined();

    cleanup();
  });

  it('labels live coach discovery as in development and avoids mock search actions', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(IndividualHomeView, { user: individualUser })
    );

    const discoveryStep = findElement(
      tree,
      (el) => el.props?.title === 'Live Coach Discovery' && el.props?.statusLabel === 'In Development'
    );
    expect(discoveryStep).toBeDefined();

    // Verify empty state for sessions is present
    const emptySessions = findElement(
      tree,
      (el) => el.props?.title === 'No Scheduled Sessions'
    );
    expect(emptySessions).toBeDefined();

    cleanup();
  });
});

describe('CoachHomeView', () => {
  const coachUser: UserProfile = {
    _id: 'usr_coach_1',
    name: 'Sensei Maya',
    email: 'maya@dojo.com',
    role: 'coach',
    isActive: true,
  };

  it('renders Coach Studio header and development notice', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachHomeView, { user: coachUser })
    );

    const studioHeading = findElement(tree, (el) => el.props?.children === 'Coach Studio');
    expect(studioHeading).toBeDefined();

    const devNotice = findElement(
      tree,
      (el) => el.props?.children === 'Coach Tools Under Development'
    );
    expect(devNotice).toBeDefined();

    cleanup();
  });

  it('renders 4-step setup roadmap with clearly qualified status labels', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachHomeView, { user: coachUser })
    );

    const step1 = findElement(
      tree,
      (el) => el.props?.stepNumber === 1 && el.props?.title === 'Profile Details & Coaching Bio'
    );
    expect(step1).toBeDefined();

    const step2 = findElement(
      tree,
      (el) => el.props?.stepNumber === 2 && el.props?.title === 'Disciplines & Specialties'
    );
    expect(step2).toBeDefined();

    const step3 = findElement(
      tree,
      (el) => el.props?.stepNumber === 3 && el.props?.title === 'Pricing & Session Formats'
    );
    expect(step3).toBeDefined();

    const step4 = findElement(
      tree,
      (el) => el.props?.stepNumber === 4 && el.props?.title === 'Weekly Availability'
    );
    expect(step4).toBeDefined();

    cleanup();
  });

  it('renders honest empty state for trainee requests without claiming verified credentials', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachHomeView, { user: coachUser })
    );

    const emptyRequests = findElement(
      tree,
      (el) => el.props?.title === 'No Active Trainee Requests'
    );
    expect(emptyRequests).toBeDefined();

    // Does not present false verification status
    const fakeVerifiedBadge = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('Verified Coach')
    );
    expect(fakeVerifiedBadge).toBeNull();

    cleanup();
  });
});

// Interactive harness for Customer Booking Flow tests
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

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

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
      sessionFormats: ['1-on-1'],
      venueTypes: ['coach_home', 'customer_home'],
      hourlyRate: 50,
      currency: 'INR',
      locations: ['Indiranagar'],
    },
  },
  {
    _id: 'coach_002',
    name: 'Master Kenji',
    role: 'coach',
    isConfiguredAvailability: false,
    timezone: 'Asia/Kolkata',
    profile: {
      bio: 'Wushu forms specialist without configured availability.',
      disciplines: ['wushu'],
      specialties: ['Taolu Forms'],
      sessionFormats: ['1-on-1'],
      venueTypes: ['ground'],
      hourlyRate: 60,
      currency: 'INR',
      locations: ['Koramangala'],
    },
  },
];

const mockPendingBooking: BookingItem = {
  _id: 'bk_001',
  customerId: 'usr_parent_1',
  coachId: 'coach_001',
  coachName: 'Sensei Maya',
  sport: 'boxing',
  date: '2028-11-15',
  startTime: '10:00',
  endTime: '11:00',
  startMinutes: 600,
  endMinutes: 660,
  durationMinutes: 60,
  venueType: 'coach_home',
  trainingAddress: '123 Dojo Way',
  customerPhone: '+1234567890',
  status: 'pending',
  paymentStatus: 'unpaid',
  createdAt: '2026-10-27T00:00:00.000Z',
};

const mockAcceptedBooking: BookingItem = {
  _id: 'bk_002',
  customerId: 'usr_parent_1',
  coachId: 'coach_002',
  coachName: 'Master Kenji',
  sport: 'wushu',
  date: '2028-11-20',
  startTime: '14:00',
  endTime: '15:30',
  startMinutes: 840,
  endMinutes: 930,
  durationMinutes: 90,
  venueType: 'ground',
  trainingAddress: 'City Stadium Ground 2',
  customerPhone: '+1234567890',
  status: 'accepted',
  paymentStatus: 'unpaid',
  createdAt: '2026-10-27T01:00:00.000Z',
};

const mockCompletedBooking: BookingItem = {
  _id: 'bk_003',
  customerId: 'usr_parent_1',
  coachId: 'coach_001',
  coachName: 'Sensei Maya',
  sport: 'kickboxing',
  date: '2028-10-20',
  startTime: '09:00',
  endTime: '10:00',
  startMinutes: 540,
  endMinutes: 600,
  durationMinutes: 60,
  venueType: 'customer_home',
  trainingAddress: '456 Home St',
  customerPhone: '+1234567890',
  status: 'completed',
  paymentStatus: 'unpaid',
  createdAt: '2026-10-15T00:00:00.000Z',
};

describe('CustomerBookingCard', () => {
  it('renders booking details including coach, sport, date, time, venue, and status', () => {
    const tree = CustomerBookingCard({ booking: mockPendingBooking });

    const coachName = findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('Sensei Maya'));
    expect(coachName).toBeDefined();

    const sportBadge = findElement(tree, (el) => el.props?.children === 'BOXING');
    expect(sportBadge).toBeDefined();

    const dateText = findElement(tree, (el) => el.props?.children === '2028-11-15');
    expect(dateText).toBeDefined();

    const addressText = findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('123 Dojo Way'));
    expect(addressText).toBeDefined();

    const statusBadge = findElement(tree, (el) => el.props?.label === 'Pending Coach' && el.props?.variant === 'warning');
    expect(statusBadge).toBeDefined();
  });

  it('renders Cancel Booking button for pending and accepted statuses and handles click', () => {
    const handleCancel = vi.fn();
    const tree = CustomerBookingCard({ booking: mockPendingBooking, onCancel: handleCancel });

    const cancelBtn = findElement(tree, (el) => el.props?.testID === 'button-cancel-bk_001');
    expect(cancelBtn).toBeDefined();

    cancelBtn.props.onPress();
    expect(handleCancel).toHaveBeenCalledWith('bk_001');
  });

  it('displays cancelling loading state when isCancelling is true', () => {
    const tree = CustomerBookingCard({ booking: mockPendingBooking, onCancel: vi.fn(), isCancelling: true });

    const cancelBtn = findElement(tree, (el) => el.props?.testID === 'button-cancel-bk_001');
    expect(cancelBtn).toBeDefined();
    expect(cancelBtn.props.disabled).toBe(true);

    const cancelText = findElement(tree, (el) => el.props?.children === 'Cancelling...');
    expect(cancelText).toBeDefined();
  });

  it('does not display cancel button when booking status is completed or cancelled', () => {
    const tree = CustomerBookingCard({ booking: mockCompletedBooking, onCancel: vi.fn() });

    const cancelBtn = findElement(tree, (el) => el.props?.testID === 'button-cancel-bk_003');
    expect(cancelBtn).toBeNull();
  });

  it('renders Maps button beside Chat action and opens Google Maps with booking coordinates', async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    const bookingWithCoords: BookingItem = {
      ...mockPendingBooking,
      locationCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    };

    const tree = CustomerBookingCard({ booking: bookingWithCoords });
    const mapsBtn = findElement(tree, (el) => el.props?.testID === 'button-maps-bk_001');
    expect(mapsBtn).not.toBeNull();

    await mapsBtn.props.onPress();
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946'
    );
  });

  it('renders Maps button with encoded address when coordinates are absent', async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    const tree = CustomerBookingCard({ booking: mockPendingBooking });
    const mapsBtn = findElement(tree, (el) => el.props?.testID === 'button-maps-bk_001');
    expect(mapsBtn).not.toBeNull();

    await mapsBtn.props.onPress();
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=123%20Dojo%20Way'
    );
  });

  it('omits Maps button if booking has no valid address or coordinates', () => {
    const bookingWithoutLoc: BookingItem = {
      ...mockPendingBooking,
      trainingAddress: '',
      locationCoordinates: undefined,
      coordinates: undefined,
    };
    const tree = CustomerBookingCard({ booking: bookingWithoutLoc });
    const mapsBtn = findElement(tree, (el) => el.props?.testID === 'button-maps-bk_001');
    expect(mapsBtn).toBeNull();
  });
});

describe('BookingRequestModal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders discipline selection before coach selection and prompts user before discipline is chosen', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        onBookingCreated: vi.fn(),
      })
    );

    await flushPromises();
    const tree = render();

    expect(getPublicCoaches).toHaveBeenCalled();

    // Discipline pills rendered
    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    const kickboxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-kickboxing');
    expect(boxingPill).not.toBeNull();
    expect(wushuPill).not.toBeNull();
    expect(kickboxingPill).not.toBeNull();

    // Coach chips are not displayed before a discipline is chosen
    const coach1Chip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    const coach2Chip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_002');
    expect(coach1Chip).toBeNull();
    expect(coach2Chip).toBeNull();

    // Helpful prompt is displayed
    const prompt = findElement(tree, (el) => el.props?.testID === 'coaches-prompt');
    expect(prompt).not.toBeNull();

    cleanup();
  });

  it('displays only coaches offering Boxing when Boxing is selected', async () => {
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

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();

    // Sensei Maya offers boxing; Master Kenji does not
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_002')).toBeNull();

    cleanup();
  });

  it('displays only coaches offering Wushu when Wushu is selected', async () => {
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

    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    wushuPill.props.onPress();
    tree = render();

    // Master Kenji offers wushu; Sensei Maya does not
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_002')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001')).toBeNull();

    cleanup();
  });

  it('displays only coaches offering Kickboxing when Kickboxing is selected', async () => {
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

    const kickboxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-kickboxing');
    kickboxingPill.props.onPress();
    tree = render();

    // Sensei Maya offers kickboxing; Master Kenji does not
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_002')).toBeNull();

    cleanup();
  });

  it('displays a multi-discipline coach under each applicable discipline', async () => {
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

    // 1. Boxing: Sensei Maya appears
    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001')).not.toBeNull();

    // 2. Kickboxing: Sensei Maya appears
    const kickboxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-kickboxing');
    kickboxingPill.props.onPress();
    tree = render();
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001')).not.toBeNull();

    // 3. Wushu: Sensei Maya does NOT appear
    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    wushuPill.props.onPress();
    tree = render();
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001')).toBeNull();

    cleanup();
  });

  it('clears previously selected coach when changing discipline', async () => {
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

    // Select Boxing and select Coach 1
    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();

    const coach1Chip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coach1Chip.props.onPress();
    tree = render();

    // Change discipline to Wushu
    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    wushuPill.props.onPress();
    tree = render();

    // Coach 1 chip is gone; Coach 2 chip is rendered
    expect(findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001')).toBeNull();
    const coach2Chip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_002');
    expect(coach2Chip).not.toBeNull();

    cleanup();
  });

  it('displays helpful empty state when no coaches offer the chosen discipline', async () => {
    // Only Coach 1 (boxing, kickboxing), no coach offering wushu
    (getPublicCoaches as any).mockResolvedValue([mockCoachesList[0]]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    wushuPill.props.onPress();
    tree = render();

    const emptyNotice = findElement(tree, (el) => el.props?.testID === 'empty-coaches-notice');
    expect(emptyNotice).not.toBeNull();
    expect(findElement(emptyNotice, (el) => typeof el.props?.children === 'string' && el.props.children.includes('Wushu'))).not.toBeNull();

    cleanup();
  });

  it('displays error and allows retry when coach discovery fails', async () => {
    (getPublicCoaches as any).mockRejectedValueOnce(new Error('Network connection failed'));

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    // Error message displayed with retry button
    const errorText = findElement(tree, (el) => el.props?.testID === 'error-coaches-load');
    const retryBtn = findElement(tree, (el) => el.props?.testID === 'button-retry-coaches');
    expect(errorText).not.toBeNull();
    expect(retryBtn).not.toBeNull();

    // Mock successful recovery and press retry
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    retryBtn.props.onPress();
    await flushPromises();
    tree = render();

    // Error cleared and prompt/discipline selection active
    expect(findElement(tree, (el) => el.props?.testID === 'error-coaches-load')).toBeNull();

    cleanup();
  });

  it('blocks submission when discipline or matching coach is missing', async () => {
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

    // 1. Submit without selecting discipline
    let submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();

    let errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('sport discipline'))).not.toBeNull();

    // 2. Select discipline but do not select coach
    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();

    submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();

    errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('select a coach'))).not.toBeNull();

    cleanup();
  });

  it('initializes default booking date to tomorrow in Asia/Kolkata', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        onBookingCreated: vi.fn(),
      })
    );

    await flushPromises();
    const tree = render();

    const dateInput = findElement(tree, (el) => el.props?.testID === 'input-booking-date');
    expect(dateInput).not.toBeNull();
    expect(dateInput.props.value).toBe(getKolkataTomorrowDateString());

    cleanup();
  });

  it('validates invalid date format, past date, and invalid time ordering', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        onBookingCreated: vi.fn(),
      })
    );

    await flushPromises();
    let tree = render();

    // Select discipline (Boxing) and coach (coach_001) first
    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coach1Chip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coach1Chip.props.onPress();
    tree = render();

    // 1. Invalid date test
    let dateInput = findElement(tree, (el) => el.props?.testID === 'input-booking-date');
    dateInput.props.onChangeText('invalid-date');
    tree = render();
    let submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();
    let errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('YYYY-MM-DD'))).not.toBeNull();

    // 1b. Impossible calendar date test (e.g. 2026-02-31)
    dateInput = findElement(tree, (el) => el.props?.testID === 'input-booking-date');
    dateInput.props.onChangeText('2026-02-31');
    tree = render();
    submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();
    errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('YYYY-MM-DD'))).not.toBeNull();

    // 1c. Past date test
    dateInput = findElement(tree, (el) => el.props?.testID === 'input-booking-date');
    dateInput.props.onChangeText('2020-01-01');
    tree = render();
    submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();
    errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('past'))).not.toBeNull();

    // 2. Start time >= End time test
    dateInput = findElement(tree, (el) => el.props?.testID === 'input-booking-date');
    let startInput = findElement(tree, (el) => el.props?.testID === 'input-booking-start');
    let endInput = findElement(tree, (el) => el.props?.testID === 'input-booking-end');
    dateInput.props.onChangeText('2028-11-20');
    startInput.props.onChangeText('14:00');
    endInput.props.onChangeText('13:00');
    tree = render();
    submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();
    errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('earlier than end time'))).not.toBeNull();

    // 3. Minimum duration check (15m is too short)
    startInput = findElement(tree, (el) => el.props?.testID === 'input-booking-start');
    endInput = findElement(tree, (el) => el.props?.testID === 'input-booking-end');
    startInput.props.onChangeText('10:00');
    endInput.props.onChangeText('10:15');
    tree = render();
    submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();
    errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('at least 30 minutes'))).not.toBeNull();

    // 4. Maximum duration check (>240m is too long)
    startInput = findElement(tree, (el) => el.props?.testID === 'input-booking-start');
    endInput = findElement(tree, (el) => el.props?.testID === 'input-booking-end');
    startInput.props.onChangeText('09:00');
    endInput.props.onChangeText('14:00');
    tree = render();
    submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();
    errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('cannot exceed 4 hours'))).not.toBeNull();

    // 5. Missing address check (Customer Home venue requires trainee address)
    const customerHomePill = findElement(tree, (el) => el.props?.testID === 'venue-pill-customer_home');
    customerHomePill.props.onPress();
    tree = render();
    startInput = findElement(tree, (el) => el.props?.testID === 'input-booking-start');
    endInput = findElement(tree, (el) => el.props?.testID === 'input-booking-end');
    let addressInput = findElement(tree, (el) => el.props?.testID === 'input-booking-address');
    startInput.props.onChangeText('10:00');
    endInput.props.onChangeText('11:00');
    addressInput.props.onChangeText('');
    tree = render();
    submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();
    errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('training address'))).not.toBeNull();

    // 6. Invalid phone check
    addressInput = findElement(tree, (el) => el.props?.testID === 'input-booking-address');
    let phoneInput = findElement(tree, (el) => el.props?.testID === 'input-booking-phone');
    addressInput.props.onChangeText('123 Gym Road');
    phoneInput.props.onChangeText('abc');
    tree = render();
    submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();
    errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('valid'))).not.toBeNull();

    cleanup();
  });

  it('submits valid booking payload strictly respecting backend contract and invokes callback', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    const createdBookingResponse: BookingItem = {
      ...mockPendingBooking,
      _id: 'bk_created_999',
    };
    (createBooking as any).mockResolvedValue(createdBookingResponse);

    const handleCreated = vi.fn();
    const handleClose = vi.fn();

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: handleClose,
        token: 'auth_jwt_token',
        onBookingCreated: handleCreated,
      })
    );

    await flushPromises();
    let tree = render();

    // Select Boxing discipline and coach_001 first
    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coach1Chip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coach1Chip.props.onPress();
    tree = render();

    const dateInput = findElement(tree, (el) => el.props?.testID === 'input-booking-date');
    const startInput = findElement(tree, (el) => el.props?.testID === 'input-booking-start');
    const endInput = findElement(tree, (el) => el.props?.testID === 'input-booking-end');
    const addressInput = findElement(tree, (el) => el.props?.testID === 'input-booking-address');
    const phoneInput = findElement(tree, (el) => el.props?.testID === 'input-booking-phone');

    dateInput.props.onChangeText('2028-11-25');
    startInput.props.onChangeText('10:00');
    endInput.props.onChangeText('11:30');
    addressInput.props.onChangeText('Indiranagar Boxing Studio, 12th Main Road');
    phoneInput.props.onChangeText('+919876543210');

    tree = render();
    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');

    await submitBtn.props.onPress();
    await flushPromises();

    // Verify createBooking was called with strictly permitted backend fields
    expect(createBooking).toHaveBeenCalledWith('auth_jwt_token', {
      coachId: 'coach_001',
      sport: 'boxing',
      date: '2028-11-25',
      startTime: '10:00',
      endTime: '11:30',
      venueType: 'coach_home',
      trainingAddress: 'Indiranagar Boxing Studio, 12th Main Road',
      customerPhone: '+919876543210',
    });

    // Verify callback was called
    expect(handleCreated).toHaveBeenCalledWith(createdBookingResponse);
    expect(handleClose).toHaveBeenCalled();

    cleanup();
  });

  it('prevents duplicate submissions and displays recoverable error on API failure', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    let resolveBooking: any;
    const pendingPromise = new Promise((resolve, reject) => {
      resolveBooking = reject;
    });
    (createBooking as any).mockReturnValue(pendingPromise);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'auth_jwt_token',
        onBookingCreated: vi.fn(),
      })
    );

    await flushPromises();
    let tree = render();

    // Select Boxing and Coach 1 first
    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coach1Chip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coach1Chip.props.onPress();
    tree = render();

    const dateInput = findElement(tree, (el) => el.props?.testID === 'input-booking-date');
    const startInput = findElement(tree, (el) => el.props?.testID === 'input-booking-start');
    const endInput = findElement(tree, (el) => el.props?.testID === 'input-booking-end');
    const addressInput = findElement(tree, (el) => el.props?.testID === 'input-booking-address');
    const phoneInput = findElement(tree, (el) => el.props?.testID === 'input-booking-phone');

    dateInput.props.onChangeText('2028-11-25');
    startInput.props.onChangeText('10:00');
    endInput.props.onChangeText('11:00');
    addressInput.props.onChangeText('Studio 1 Main Road');
    phoneInput.props.onChangeText('+919876543210');

    tree = render();
    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');

    // Trigger submit
    const submitPromise = submitBtn.props.onPress();
    tree = render();

    // Verify duplicate submission prevention: submit button disabled and loading while submitting
    const inFlightBtn = findElement(tree, (el) => el.props?.title === 'Submitting Request...');
    expect(inFlightBtn).not.toBeNull();
    expect(inFlightBtn.props.disabled).toBe(true);
    expect(inFlightBtn.props.loading).toBe(true);

    // Reject the backend call
    resolveBooking(new Error('Coach is fully booked on this date'));
    await submitPromise;
    await flushPromises();
    tree = render();

    // Error banner displayed and submit button re-enabled for retry
    const errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children === 'Coach is fully booked on this date')).not.toBeNull();

    const retryBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    expect(retryBtn).not.toBeNull();
    expect(retryBtn.props.disabled).toBe(false);

    cleanup();
  });

  it('allows booking coach without configured weekly availability schedule', async () => {
    // Coach 2 has no configured availability schedule
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    (createBooking as any).mockResolvedValue(mockAcceptedBooking);

    const handleCreated = vi.fn();

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'auth_jwt_token',
        onBookingCreated: handleCreated,
      })
    );

    await flushPromises();
    let tree = render();

    // Select Wushu discipline first, then select coach 2 (Master Kenji, who offers wushu)
    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    wushuPill.props.onPress();
    tree = render();

    const coach2Chip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_002');
    coach2Chip.props.onPress();
    tree = render();

    const dateInput = findElement(tree, (el) => el.props?.testID === 'input-booking-date');
    const startInput = findElement(tree, (el) => el.props?.testID === 'input-booking-start');
    const endInput = findElement(tree, (el) => el.props?.testID === 'input-booking-end');
    const addressInput = findElement(tree, (el) => el.props?.testID === 'input-booking-address');
    const phoneInput = findElement(tree, (el) => el.props?.testID === 'input-booking-phone');

    dateInput.props.onChangeText('2028-11-20');
    startInput.props.onChangeText('14:00');
    endInput.props.onChangeText('15:30');
    addressInput.props.onChangeText('City Stadium Ground 2');
    phoneInput.props.onChangeText('+1234567890');

    tree = render();
    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');

    await submitBtn.props.onPress();
    await flushPromises();

    expect(createBooking).toHaveBeenCalledWith('auth_jwt_token', expect.objectContaining({
      coachId: 'coach_002',
      sport: 'wushu',
    }));
    expect(handleCreated).toHaveBeenCalled();

    cleanup();
  });

  it('Coach Studio venue: uses coach configured studio location and does not request trainee home address', async () => {
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

    // Select Boxing discipline and coach_001
    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coach1Chip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coach1Chip.props.onPress();
    tree = render();

    // Coach Studio is default venue ('coach_home')
    const studioDisplay = findElement(tree, (el) => el.props?.testID === 'coach-studio-location-display');
    expect(studioDisplay).not.toBeNull();
    expect(findElement(studioDisplay, (el) => typeof el.props?.children === 'string' && el.props.children.includes('Indiranagar'))).not.toBeNull();

    // Trainee home address fields should NOT be shown
    expect(findElement(tree, (el) => el.props?.testID === 'input-home-house')).toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'input-home-street')).toBeNull();

    // Location summary preview shows studio address
    const summary = findElement(tree, (el) => el.props?.testID === 'location-summary-preview');
    expect(summary).not.toBeNull();
    const summaryAddress = findElement(tree, (el) => el.props?.testID === 'location-summary-address');
    expect(summaryAddress.props?.children).toBe('Indiranagar');

    cleanup();
  });

  it('Coach Studio venue: shows fallback warning notice when coach has no studio location configured', async () => {
    const coachWithoutLocation: CoachDiscoveryItem = {
      ...mockCoachesList[0],
      _id: 'coach_no_loc',
      profile: {
        ...mockCoachesList[0].profile!,
        locations: [],
      },
    };
    (getPublicCoaches as any).mockResolvedValue([coachWithoutLocation]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_no_loc');
    coachChip.props.onPress();
    tree = render();

    // Fallback notice rendered
    const warningNotice = findElement(tree, (el) => el.props?.testID === 'coach-studio-missing-notice');
    expect(warningNotice).not.toBeNull();

    cleanup();
  });

  it('Coach Studio venue: multiple configured locations displays selector, blocks unselected submission, and updates on choice', async () => {
    const multiLocationCoach: CoachDiscoveryItem = {
      ...mockCoachesList[0],
      _id: 'coach_multi_loc',
      profile: {
        ...mockCoachesList[0].profile!,
        locations: ['Indiranagar Studio', 'Whitefield Studio', 'Koramangala Center'],
      },
    };
    (getPublicCoaches as any).mockResolvedValue([multiLocationCoach]);
    (createBooking as any).mockResolvedValue(mockPendingBooking);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_multi_loc');
    coachChip.props.onPress();
    tree = render();

    // 1. Selector is displayed with 3 options
    const selector = findElement(tree, (el) => el.props?.testID === 'coach-studio-location-selector');
    expect(selector).not.toBeNull();
    const opt0 = findElement(tree, (el) => el.props?.testID === 'coach-location-option-0');
    const opt1 = findElement(tree, (el) => el.props?.testID === 'coach-location-option-1');
    const opt2 = findElement(tree, (el) => el.props?.testID === 'coach-location-option-2');
    expect(opt0).not.toBeNull();
    expect(opt1).not.toBeNull();
    expect(opt2).not.toBeNull();

    // 2. Neither is silently selected, prompt is displayed
    const prompt = findElement(tree, (el) => el.props?.testID === 'prompt-select-coach-location');
    expect(prompt).not.toBeNull();

    // 3. Submitting without choosing an option triggers validation error
    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();

    let errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('configured studio locations'))).not.toBeNull();

    // 4. Tap option 1 (Whitefield Studio)
    opt1.props.onPress();
    tree = render();

    // Display card appears with Whitefield Studio
    const studioDisplay = findElement(tree, (el) => el.props?.testID === 'coach-studio-location-display');
    expect(studioDisplay).not.toBeNull();
    expect(findElement(studioDisplay, (el) => typeof el.props?.children === 'string' && el.props.children.includes('Whitefield Studio'))).not.toBeNull();

    // Location summary preview updates to Whitefield Studio
    const summaryAddress = findElement(tree, (el) => el.props?.testID === 'location-summary-address');
    expect(summaryAddress.props?.children).toBe('Whitefield Studio');

    cleanup();
  });

  it('Sports Ground venue: zero configured grounds shows missing notice and requires manual address', async () => {
    const coachNoGround: CoachDiscoveryItem = {
      ...mockCoachesList[1],
      _id: 'coach_no_ground',
      profile: {
        ...mockCoachesList[1].profile!,
        venueTypes: ['ground'],
        locations: [],
      },
    };
    (getPublicCoaches as any).mockResolvedValue([coachNoGround]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    wushuPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_no_ground');
    coachChip.props.onPress();
    tree = render();

    // Missing ground notice is displayed
    const missingNotice = findElement(tree, (el) => el.props?.testID === 'coach-ground-missing-notice');
    expect(missingNotice).not.toBeNull();

    cleanup();
  });

  it('Sports Ground venue: single configured ground uses it automatically', async () => {
    const singleGroundCoach: CoachDiscoveryItem = {
      ...mockCoachesList[1],
      _id: 'coach_single_ground',
      profile: {
        ...mockCoachesList[1].profile!,
        venueTypes: ['ground'],
        locations: ['Kanteerava Outdoor Stadium'],
      },
    };
    (getPublicCoaches as any).mockResolvedValue([singleGroundCoach]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    wushuPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_single_ground');
    coachChip.props.onPress();
    tree = render();

    // Auto-selected single ground display
    const groundDisplay = findElement(tree, (el) => el.props?.testID === 'coach-ground-location-display');
    expect(groundDisplay).not.toBeNull();
    expect(findElement(groundDisplay, (el) => typeof el.props?.children === 'string' && el.props.children.includes('Kanteerava Outdoor Stadium'))).not.toBeNull();

    // Summary preview
    const summaryAddress = findElement(tree, (el) => el.props?.testID === 'location-summary-address');
    expect(summaryAddress.props?.children).toBe('Kanteerava Outdoor Stadium');

    cleanup();
  });

  it('Sports Ground venue: multiple configured grounds displays selector and updates on choice', async () => {
    const multiGroundCoach: CoachDiscoveryItem = {
      ...mockCoachesList[1],
      _id: 'coach_multi_ground',
      profile: {
        ...mockCoachesList[1].profile!,
        venueTypes: ['ground'],
        locations: ['Kanteerava Stadium Ground', 'Bangalore Football Stadium'],
      },
    };
    (getPublicCoaches as any).mockResolvedValue([multiGroundCoach]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const wushuPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-wushu');
    wushuPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_multi_ground');
    coachChip.props.onPress();
    tree = render();

    // Selector is rendered with 2 ground options
    const selector = findElement(tree, (el) => el.props?.testID === 'coach-ground-location-selector');
    expect(selector).not.toBeNull();
    const opt0 = findElement(tree, (el) => el.props?.testID === 'coach-ground-option-0');
    const opt1 = findElement(tree, (el) => el.props?.testID === 'coach-ground-option-1');
    expect(opt0).not.toBeNull();
    expect(opt1).not.toBeNull();

    // Submitting without choice triggers form error
    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    tree = render();

    let errorBanner = findElement(tree, (el) => el.props?.testID === 'booking-form-error');
    expect(errorBanner).not.toBeNull();
    expect(findElement(errorBanner, (el) => typeof el.props?.children === 'string' && el.props.children.includes('configured ground locations'))).not.toBeNull();

    // Select option 0
    opt0.props.onPress();
    tree = render();

    const groundDisplay = findElement(tree, (el) => el.props?.testID === 'coach-ground-location-display');
    expect(groundDisplay).not.toBeNull();
    expect(findElement(groundDisplay, (el) => typeof el.props?.children === 'string' && el.props.children.includes('Kanteerava Stadium Ground'))).not.toBeNull();

    cleanup();
  });

  it('Trainee Home venue: renders structured address fields and updates preview', async () => {
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

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coachChip.props.onPress();
    tree = render();

    // Select Trainee Home venue
    const customerHomePill = findElement(tree, (el) => el.props?.testID === 'venue-pill-customer_home');
    customerHomePill.props.onPress();
    tree = render();

    // Verify structured fields and Detect My Location button are present
    expect(findElement(tree, (el) => el.props?.testID === 'button-detect-location')).not.toBeNull();
    const houseInput = findElement(tree, (el) => el.props?.testID === 'input-home-house');
    const streetInput = findElement(tree, (el) => el.props?.testID === 'input-home-street');
    const areaInput = findElement(tree, (el) => el.props?.testID === 'input-home-area');
    const landmarkInput = findElement(tree, (el) => el.props?.testID === 'input-home-landmark');

    expect(houseInput).not.toBeNull();
    expect(streetInput).not.toBeNull();
    expect(areaInput).not.toBeNull();
    expect(landmarkInput).not.toBeNull();

    // Type structured address
    houseInput.props.onChangeText('Flat 302, Galaxy Apt');
    streetInput.props.onChangeText('4th Cross');
    areaInput.props.onChangeText('Indiranagar');
    landmarkInput.props.onChangeText('Near Metro');
    tree = render();

    // Location summary preview is updated with combined address
    const summaryAddress = findElement(tree, (el) => el.props?.testID === 'location-summary-address');
    expect(summaryAddress.props?.children).toBe('Flat 302, Galaxy Apt, 4th Cross, Indiranagar, Near Metro');

    cleanup();
  });

  it('Trainee Home venue: Detect My Location button queries GPS and attaches coordinates', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    const mockAddressComponents = {
      streetNumber: '12',
      street: '12th Main',
      district: 'Indiranagar',
      city: 'Bangalore',
      formattedAddress: '12 12th Main, Indiranagar, Bangalore',
    };
    (detectDeviceLocation as any).mockImplementationOnce(async (options: any) => {
      if (options?.onCoordinates) {
        options.onCoordinates({ latitude: 12.9716, longitude: 77.5946 });
      }
      if (options?.onAddressResolved) {
        options.onAddressResolved(mockAddressComponents);
      }
      return {
        success: true,
        coordinates: { latitude: 12.9716, longitude: 77.5946 },
        suggestedAddress: '12 12th Main, Indiranagar, Bangalore',
        addressComponents: mockAddressComponents,
      };
    });

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coachChip.props.onPress();
    tree = render();

    const customerHomePill = findElement(tree, (el) => el.props?.testID === 'venue-pill-customer_home');
    customerHomePill.props.onPress();
    tree = render();

    // Customer sees clear address-sharing notice before submission
    const privacyNotice = findElement(tree, (el) => el.props?.testID === 'trainee-home-address-notice');
    expect(privacyNotice).not.toBeNull();
    expect(
      findElement(
        privacyNotice,
        (el) => typeof el.props?.children === 'string' && el.props.children.includes('shared with the assigned coach')
      )
    ).not.toBeNull();

    const detectBtn = findElement(tree, (el) => el.props?.testID === 'button-detect-location');
    await detectBtn.props.onPress();
    await flushPromises();
    tree = render();

    // Coordinates indicator badge appears
    const coordsEl = findElement(tree, (el) => el.props?.testID === 'location-detected-coordinates');
    expect(coordsEl).not.toBeNull();
    expect(findElement(coordsEl, (el) => typeof el.props?.children === 'string' && el.props.children.includes('GPS attached'))).not.toBeNull();

    // Detected address verification card appears with label and readable address
    const detectedAddressCard = findElement(tree, (el) => el.props?.testID === 'location-detected-address-card');
    expect(detectedAddressCard).not.toBeNull();
    const detectedAddressText = findElement(tree, (el) => el.props?.testID === 'location-detected-address-text');
    expect(detectedAddressText).not.toBeNull();
    expect(detectedAddressText.props.children).toBe('12 12th Main, Indiranagar, Bangalore');

    // Structured fields are populated from detected components
    const houseInput = findElement(tree, (el) => el.props?.testID === 'input-home-house');
    expect(houseInput.props.value).toBe('12');
    const streetInput = findElement(tree, (el) => el.props?.testID === 'input-home-street');
    expect(streetInput.props.value).toBe('12th Main');
    const areaInput = findElement(tree, (el) => el.props?.testID === 'input-home-area');
    expect(areaInput.props.value).toContain('Indiranagar');

    // Summary coords preview
    const summaryCoords = findElement(tree, (el) => el.props?.testID === 'summary-coordinates-preview');
    expect(summaryCoords).not.toBeNull();

    // User can edit the address before booking
    houseInput.props.onChangeText('Apt 5C');
    tree = render();
    const houseInputAfterEdit = findElement(tree, (el) => el.props?.testID === 'input-home-house');
    expect(houseInputAfterEdit.props.value).toBe('Apt 5C');

    cleanup();
  });

  it('Trainee Home venue: location detection failure renders non-blocking error and allows manual entry', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    (detectDeviceLocation as any).mockResolvedValueOnce({
      success: false,
      error: 'Location permission was denied. You can enter your address manually.',
    });

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coachChip.props.onPress();
    tree = render();

    const customerHomePill = findElement(tree, (el) => el.props?.testID === 'venue-pill-customer_home');
    customerHomePill.props.onPress();
    tree = render();

    const detectBtn = findElement(tree, (el) => el.props?.testID === 'button-detect-location');
    await detectBtn.props.onPress();
    await flushPromises();
    tree = render();

    const errorEl = findElement(tree, (el) => el.props?.testID === 'location-detection-error');
    expect(errorEl).not.toBeNull();
    expect(findElement(errorEl, (el) => typeof el.props?.children === 'string' && el.props.children.includes('denied'))).not.toBeNull();

    cleanup();
  });

  it('Trainee Home venue: reverse geocoding delay does not keep spinner active; coordinates appear immediately', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    let resolveDetection: any;
    (detectDeviceLocation as any).mockImplementationOnce((options: any) => {
      // Coordinates arrive immediately via callback
      if (options?.onCoordinates) {
        options.onCoordinates({ latitude: 12.9716, longitude: 77.5946 });
      }
      // But the reverse geocode / outer promise is still pending
      return new Promise((resolve) => {
        resolveDetection = resolve;
      });
    });

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coachChip.props.onPress();
    tree = render();

    const customerHomePill = findElement(tree, (el) => el.props?.testID === 'venue-pill-customer_home');
    customerHomePill.props.onPress();
    tree = render();

    const detectBtn = findElement(tree, (el) => el.props?.testID === 'button-detect-location');
    const detectPromise = detectBtn.props.onPress();
    await flushPromises();
    tree = render();

    // Spinner stopped and coordinates attached EVEN THOUGH reverse geocode has not resolved yet!
    const spinnerEl = findElement(tree, (el) => el.props?.testID === 'location-detecting-indicator');
    expect(spinnerEl).toBeNull();

    const coordsEl = findElement(tree, (el) => el.props?.testID === 'location-detected-coordinates');
    expect(coordsEl).not.toBeNull();

    // Now complete the detection promise
    resolveDetection({
      success: true,
      coordinates: { latitude: 12.9716, longitude: 77.5946 },
      suggestedAddress: '12th Main, Indiranagar, Bangalore',
    });
    await detectPromise;
    await flushPromises();
    tree = render();

    // Still attached and no error
    expect(findElement(tree, (el) => el.props?.testID === 'location-detected-coordinates')).not.toBeNull();

    cleanup();
  });

  it('Trainee Home venue: loading state always returns to false after detection failure or exception', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    (detectDeviceLocation as any).mockRejectedValueOnce(new Error('Unexpected hardware crash'));

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coachChip.props.onPress();
    tree = render();

    const customerHomePill = findElement(tree, (el) => el.props?.testID === 'venue-pill-customer_home');
    customerHomePill.props.onPress();
    tree = render();

    const detectBtn = findElement(tree, (el) => el.props?.testID === 'button-detect-location');
    await detectBtn.props.onPress();
    await flushPromises();
    tree = render();

    // Spinner is NOT active
    expect(findElement(tree, (el) => el.props?.testID === 'location-detecting-indicator')).toBeNull();
    // Error banner is shown
    const errorEl = findElement(tree, (el) => el.props?.testID === 'location-detection-error');
    expect(errorEl).not.toBeNull();
    expect(findElement(errorEl, (el) => typeof el.props?.children === 'string' && el.props.children.includes('hardware crash'))).not.toBeNull();

    cleanup();
  });

  it('Trainee Home venue: manual address entry remains usable after detection fails and booking succeeds', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);
    (createBooking as any).mockResolvedValue(mockPendingBooking);
    (detectDeviceLocation as any).mockResolvedValueOnce({
      success: false,
      error: 'Location request timed out. Please enter your address manually.',
    });

    const handleCreated = vi.fn();
    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
        onBookingCreated: handleCreated,
      })
    );

    await flushPromises();
    let tree = render();

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coachChip.props.onPress();
    tree = render();

    const customerHomePill = findElement(tree, (el) => el.props?.testID === 'venue-pill-customer_home');
    customerHomePill.props.onPress();
    tree = render();

    // Attempt location detection (fails with timeout)
    const detectBtn = findElement(tree, (el) => el.props?.testID === 'button-detect-location');
    await detectBtn.props.onPress();
    await flushPromises();
    tree = render();

    // Error banner shown
    expect(findElement(tree, (el) => el.props?.testID === 'location-detection-error')).not.toBeNull();

    // Manual entry is fully usable
    const houseInput = findElement(tree, (el) => el.props?.testID === 'input-home-house');
    const streetInput = findElement(tree, (el) => el.props?.testID === 'input-home-street');
    const areaInput = findElement(tree, (el) => el.props?.testID === 'input-home-area');
    const dateInput = findElement(tree, (el) => el.props?.testID === 'input-booking-date');
    const startInput = findElement(tree, (el) => el.props?.testID === 'input-booking-start');
    const endInput = findElement(tree, (el) => el.props?.testID === 'input-booking-end');
    const phoneInput = findElement(tree, (el) => el.props?.testID === 'input-booking-phone');

    houseInput.props.onChangeText('Villa 42');
    streetInput.props.onChangeText('Green Palm Grove');
    areaInput.props.onChangeText('Whitefield');
    dateInput.props.onChangeText('2028-11-25');
    startInput.props.onChangeText('14:00');
    endInput.props.onChangeText('15:00');
    phoneInput.props.onChangeText('+919876543210');
    tree = render();

    const submitBtn = findElement(tree, (el) => el.props?.title === 'Submit Booking Request');
    await submitBtn.props.onPress();
    await flushPromises();

    // Booking succeeds without GPS coordinates!
    expect(createBooking).toHaveBeenCalledWith(
      'test_token',
      expect.objectContaining({
        venueType: 'customer_home',
        trainingAddress: 'Villa 42, Green Palm Grove, Whitefield',
      })
    );
    expect(handleCreated).toHaveBeenCalled();

    cleanup();
  });

  it('Trainee Home venue: late GPS result cannot overwrite an edited manual address or newer selection', async () => {
    (getPublicCoaches as any).mockResolvedValue(mockCoachesList);

    let resolveSlowDetection: any;
    (detectDeviceLocation as any).mockImplementationOnce(() => {
      return new Promise((resolve) => {
        resolveSlowDetection = resolve;
      });
    });

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingRequestModal, {
        visible: true,
        onClose: vi.fn(),
        token: 'test_token',
      })
    );

    await flushPromises();
    let tree = render();

    const boxingPill = findElement(tree, (el) => el.props?.testID === 'sport-pill-boxing');
    boxingPill.props.onPress();
    tree = render();
    const coachChip = findElement(tree, (el) => el.props?.testID === 'coach-chip-coach_001');
    coachChip.props.onPress();
    tree = render();

    const customerHomePill = findElement(tree, (el) => el.props?.testID === 'venue-pill-customer_home');
    customerHomePill.props.onPress();
    tree = render();

    // 1. User starts location detection (takes very long)
    const detectBtn = findElement(tree, (el) => el.props?.testID === 'button-detect-location');
    const detectPromise = detectBtn.props.onPress();
    tree = render();

    // 2. While waiting, user manually enters their address
    const houseInput = findElement(tree, (el) => el.props?.testID === 'input-home-house');
    const streetInput = findElement(tree, (el) => el.props?.testID === 'input-home-street');
    const areaInput = findElement(tree, (el) => el.props?.testID === 'input-home-area');
    houseInput.props.onChangeText('Apt 99');
    streetInput.props.onChangeText('Sunset Blvd');
    areaInput.props.onChangeText('Koramangala');
    tree = render();

    // 3. Late GPS result resolves now
    resolveSlowDetection({
      success: true,
      coordinates: { latitude: 12.9716, longitude: 77.5946 },
      suggestedAddress: 'Old Stale Address, Indiranagar',
    });
    await detectPromise;
    await flushPromises();
    tree = render();

    // User-entered area 'Koramangala' MUST NOT be overwritten by 'Old Stale Address, Indiranagar'
    const areaInputAfter = findElement(tree, (el) => el.props?.testID === 'input-home-area');
    expect(areaInputAfter.props.value).toBe('Koramangala');

    const summaryAddress = findElement(tree, (el) => el.props?.testID === 'location-summary-address');
    expect(summaryAddress.props.children).toContain('Koramangala');
    expect(summaryAddress.props.children).not.toContain('Old Stale Address');

    cleanup();
  });
});

describe('ParentHomeView & IndividualHomeView Booking Flow Integration', () => {
  const parentUser: UserProfile = {
    _id: 'usr_parent_1',
    name: 'Sarah Connor',
    email: 'sarah@family.com',
    role: 'parent',
    isActive: true,
  };

  const individualUser: UserProfile = {
    _id: 'usr_ind_1',
    name: 'Alex Rivera',
    email: 'alex@training.com',
    role: 'individual',
    isActive: true,
  };

  it('ParentHomeView renders customer bookings list and Book Session button', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(ParentHomeView, {
        user: parentUser,
        initialBookings: [mockPendingBooking, mockAcceptedBooking],
      })
    );

    // Bookings are rendered
    const booking1 = findElement(tree, (el) => el.type === CustomerBookingCard && el.props?.booking?._id === 'bk_001');
    const booking2 = findElement(tree, (el) => el.type === CustomerBookingCard && el.props?.booking?._id === 'bk_002');
    expect(booking1).not.toBeNull();
    expect(booking2).not.toBeNull();

    // Honest empty state is NOT displayed when bookings exist
    const emptySessions = findElement(
      tree,
      (el) => el.props?.title === 'No Youth Sessions Scheduled'
    );
    expect(emptySessions).toBeNull();

    cleanup();
  });

  it('ParentHomeView preserves honest empty state when no bookings exist', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(ParentHomeView, {
        user: parentUser,
        initialBookings: [],
      })
    );

    const emptySessions = findElement(
      tree,
      (el) => el.props?.title === 'No Youth Sessions Scheduled'
    );
    expect(emptySessions).not.toBeNull();

    const bookBtn = findElement(tree, (el) => el.props?.title === 'Request a Youth Session');
    expect(bookBtn).not.toBeNull();

    cleanup();
  });

  it('IndividualHomeView renders customer bookings list and Book Session button', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(IndividualHomeView, {
        user: individualUser,
        initialBookings: [mockPendingBooking, mockAcceptedBooking],
      })
    );

    const booking1 = findElement(tree, (el) => el.type === CustomerBookingCard && el.props?.booking?._id === 'bk_001');
    const booking2 = findElement(tree, (el) => el.type === CustomerBookingCard && el.props?.booking?._id === 'bk_002');
    expect(booking1).not.toBeNull();
    expect(booking2).not.toBeNull();

    const emptySessions = findElement(
      tree,
      (el) => el.props?.title === 'No Scheduled Sessions'
    );
    expect(emptySessions).toBeNull();

    cleanup();
  });

  it('IndividualHomeView preserves honest empty state when no bookings exist', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(IndividualHomeView, {
        user: individualUser,
        initialBookings: [],
      })
    );

    const emptySessions = findElement(
      tree,
      (el) => el.props?.title === 'No Scheduled Sessions'
    );
    expect(emptySessions).not.toBeNull();

    const bookBtn = findElement(tree, (el) => el.props?.title === 'Request a Training Session');
    expect(bookBtn).not.toBeNull();

    cleanup();
  });

  it('invokes cancelBooking API when customer cancels booking from ParentHomeView', async () => {
    (cancelBooking as any).mockResolvedValue({ message: 'Booking cancelled' });
    (getCustomerBookings as any).mockResolvedValue({ bookings: [] });

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(ParentHomeView, {
        user: parentUser,
        token: 'auth_jwt_token',
        initialBookings: [mockPendingBooking],
      })
    );

    let tree = render();
    const cardEl = findElement(tree, (el) => el.type === CustomerBookingCard && el.props?.booking?._id === 'bk_001');
    expect(cardEl).not.toBeNull();

    await cardEl.props.onCancel('bk_001');
    await flushPromises();

    expect(cancelBooking).toHaveBeenCalledWith('auth_jwt_token', 'bk_001');

    cleanup();
  });
});

describe('CoachBookingCard', () => {
  const mockCoachPendingBooking: BookingItem = {
    _id: 'bk_c_pending',
    customerId: 'usr_parent_1',
    coachId: 'coach_001',
    customerName: 'Sarah Connor',
    coachName: 'Sensei Maya',
    sport: 'boxing',
    date: '2028-11-20',
    startTime: '10:00',
    endTime: '11:00',
    startMinutes: 600,
    endMinutes: 660,
    durationMinutes: 60,
    venueType: 'coach_home',
    status: 'pending',
    paymentStatus: 'unpaid',
    createdAt: '2026-10-27T10:00:00.000Z',
  };

  const mockCoachAcceptedBooking: BookingItem = {
    _id: 'bk_c_accepted',
    customerId: 'usr_ind_1',
    coachId: 'coach_001',
    customerName: 'Alex Rivera',
    coachName: 'Sensei Maya',
    sport: 'kickboxing',
    date: '2028-11-21',
    startTime: '14:00',
    endTime: '15:30',
    startMinutes: 840,
    endMinutes: 930,
    durationMinutes: 90,
    venueType: 'customer_home',
    trainingAddress: '789 Indiranagar 100ft Road',
    customerPhone: '+919876543210',
    status: 'accepted',
    paymentStatus: 'unpaid',
    createdAt: '2026-10-27T11:00:00.000Z',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders trainee name, sport, date, time, and venue correctly', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachBookingCard, { booking: mockCoachPendingBooking })
    );

    const traineeName = findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('Sarah Connor'));
    expect(traineeName).toBeDefined();

    const sportBadge = findElement(tree, (el) => el.props?.children === 'BOXING');
    expect(sportBadge).toBeDefined();

    const dateText = findElement(tree, (el) => el.props?.children === '2028-11-20');
    expect(dateText).toBeDefined();

    const timeText = findElement(tree, (el) => typeof el.props?.children === 'string' && el.props.children.includes('10:00 – 11:00'));
    expect(timeText).toBeDefined();

    const venueText = findElement(tree, (el) => el.props?.children === 'Coach Home / Studio');
    expect(venueText).toBeDefined();

    const statusBadge = findElement(tree, (el) => el.props?.label === 'Pending Response' && el.props?.variant === 'lime');
    expect(statusBadge).toBeDefined();

    cleanup();
  });

  it('renders side-by-side Accept and Reject buttons for pending requests and handles taps', () => {
    const handleAccept = vi.fn();
    const handleReject = vi.fn();
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachBookingCard, {
        booking: mockCoachPendingBooking,
        onAccept: handleAccept,
        onReject: handleReject,
      })
    );

    const acceptBtn = findElement(tree, (el) => el.props?.testID === 'button-accept-bk_c_pending');
    const rejectBtn = findElement(tree, (el) => el.props?.testID === 'button-reject-bk_c_pending');
    expect(acceptBtn).not.toBeNull();
    expect(rejectBtn).not.toBeNull();

    acceptBtn.props.onPress();
    expect(handleAccept).toHaveBeenCalledWith('bk_c_pending');

    rejectBtn.props.onPress();
    expect(handleReject).toHaveBeenCalledWith('bk_c_pending');

    cleanup();
  });

  it('disables Accept and Reject buttons when isProcessing is true', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachBookingCard, {
        booking: mockCoachPendingBooking,
        onAccept: vi.fn(),
        onReject: vi.fn(),
        isProcessing: true,
      })
    );

    const acceptBtn = findElement(tree, (el) => el.props?.testID === 'button-accept-bk_c_pending');
    const rejectBtn = findElement(tree, (el) => el.props?.testID === 'button-reject-bk_c_pending');
    expect(acceptBtn.props.disabled).toBe(true);
    expect(rejectBtn.props.disabled).toBe(true);

    cleanup();
  });

  it('COACH DESTINATION VISIBILITY: shows training address for pending requests while strictly hiding customer phone', () => {
    const bookingWithLeakedContact = {
      ...mockCoachPendingBooking,
      trainingAddress: '123 Training St, Indiranagar',
      customerPhone: '+1111111111',
    };
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachBookingCard, { booking: bookingWithLeakedContact })
    );

    const addressEl = findElement(tree, (el) => el.props?.testID === 'training-address-bk_c_pending');
    const phoneEl = findElement(tree, (el) => el.props?.testID === 'contact-phone-section-bk_c_pending');
    expect(addressEl).not.toBeNull();
    expect(addressEl.props?.children).toContain('123 Training St, Indiranagar');
    expect(phoneEl).toBeNull();

    cleanup();
  });

  it('STRICT PRIVACY: displays authorized customer phone, training address, and Call button for accepted requests', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachBookingCard, { booking: mockCoachAcceptedBooking })
    );

    const addressEl = findElement(tree, (el) => el.props?.testID === 'training-address-bk_c_accepted');
    expect(addressEl).not.toBeNull();
    expect(addressEl.props?.children).toContain('789 Indiranagar 100ft Road');

    const phoneSection = findElement(tree, (el) => el.props?.testID === 'contact-phone-section-bk_c_accepted');
    expect(phoneSection).not.toBeNull();

    const callBtn = findElement(tree, (el) => el.props?.testID === 'button-call-bk_c_accepted');
    expect(callBtn).not.toBeNull();

    cleanup();
  });

  it('Call button invokes Linking.openURL with clean tel: URI', async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(CoachBookingCard, {
        booking: mockCoachAcceptedBooking,
      })
    );

    const tree = render();
    const callBtn = findElement(tree, (el) => el.props?.testID === 'button-call-bk_c_accepted');
    expect(callBtn).not.toBeNull();

    await callBtn.props.onPress();
    await flushPromises();

    expect(Linking.canOpenURL).toHaveBeenCalledWith('tel:+919876543210');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+919876543210');

    cleanup();
  });

  it('Call button displays graceful fallback error when dialer is unsupported', async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(CoachBookingCard, {
        booking: mockCoachAcceptedBooking,
      })
    );

    let tree = render();
    const callBtn = findElement(tree, (el) => el.props?.testID === 'button-call-bk_c_accepted');
    expect(callBtn).not.toBeNull();

    await callBtn.props.onPress();
    await flushPromises();

    tree = render();
    const callError = findElement(tree, (el) => el.props?.testID === 'call-error-bk_c_accepted');
    expect(callError).not.toBeNull();
    expect(findElement(callError, (el) => el.props?.children === 'Phone dialer is not supported on this device.')).not.toBeNull();

    cleanup();
  });

  it('COACH DESTINATION VISIBILITY: renders Maps button for pending requests so coach can assess travel distance', async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    const bookingWithCoords = {
      ...mockCoachPendingBooking,
      locationCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    };
    const { render, cleanup } = createInteractiveHarness(
      React.createElement(CoachBookingCard, { booking: bookingWithCoords })
    );

    const tree = render();
    const mapsBtn = findElement(tree, (el) => el.props?.testID === 'button-maps-bk_c_pending');
    expect(mapsBtn).not.toBeNull();

    await mapsBtn.props.onPress();
    await flushPromises();

    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946'
    );

    cleanup();
  });

  it('STRICT PRIVACY: hides destination address and Maps button on rejected and cancelled requests', () => {
    const rejectedBooking = {
      ...mockCoachPendingBooking,
      _id: 'bk_c_rejected',
      status: 'rejected' as const,
      trainingAddress: 'Private Address',
      locationCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    };
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachBookingCard, { booking: rejectedBooking })
    );

    const addressEl = findElement(tree, (el) => el.props?.testID === 'training-address-bk_c_rejected');
    const mapsBtn = findElement(tree, (el) => el.props?.testID === 'button-maps-bk_c_rejected');
    expect(addressEl).toBeNull();
    expect(mapsBtn).toBeNull();

    cleanup();
  });

  it('STRICT PRIVACY: renders Maps button for accepted requests and invokes Google Maps URL', async () => {
    vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    const acceptedWithCoords = {
      ...mockCoachAcceptedBooking,
      locationCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    };
    const { render, cleanup } = createInteractiveHarness(
      React.createElement(CoachBookingCard, { booking: acceptedWithCoords })
    );

    const tree = render();
    const mapsBtn = findElement(tree, (el) => el.props?.testID === 'button-maps-bk_c_accepted');
    expect(mapsBtn).not.toBeNull();

    await mapsBtn.props.onPress();
    await flushPromises();

    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946'
    );

    cleanup();
  });
});

describe('Role-Specific Quick Messages', () => {
  it('CUSTOMER_QUICK_MESSAGES matches exact 8 approved messages from specification', () => {
    expect(CUSTOMER_QUICK_MESSAGES).toEqual([
      'Are you on your way?',
      'Are we still on for today?',
      'I’m on my way.',
      'I’ve arrived.',
      'Can we adjust the timing?',
      'Please share the exact meeting point.',
      'We may be a little late.',
      'Thank you!',
    ]);
  });

  it('COACH_QUICK_MESSAGES matches exact 8 approved messages from specification', () => {
    expect(COACH_QUICK_MESSAGES).toEqual([
      'I’m on my way.',
      'I’ve arrived.',
      'I’ll be there in 10 minutes.',
      'Please confirm the meeting point.',
      'Could you please wait a few minutes?',
      'I’m running a little late.',
      'I’m ready to start.',
      'Thank you!',
    ]);
  });

  it('getQuickMessagesForRole routes correctly by user role', () => {
    expect(getQuickMessagesForRole('coach')).toEqual(COACH_QUICK_MESSAGES);
    expect(getQuickMessagesForRole('parent')).toEqual(CUSTOMER_QUICK_MESSAGES);
    expect(getQuickMessagesForRole('individual')).toEqual(CUSTOMER_QUICK_MESSAGES);
  });
});

describe('BookingChatModal', () => {
  const mockAcceptedBooking: BookingItem = {
    _id: 'bk_chat_001',
    customerId: 'usr_parent_1',
    coachId: 'coach_001',
    customerName: 'Sarah Connor',
    coachName: 'Sensei Maya',
    sport: 'boxing',
    date: '2028-11-20',
    startTime: '10:00',
    endTime: '11:00',
    startMinutes: 600,
    endMinutes: 660,
    durationMinutes: 60,
    venueType: 'coach_home',
    status: 'accepted',
    paymentStatus: 'unpaid',
    createdAt: '2026-10-27T10:00:00.000Z',
  };

  const mockMessagesList: BookingMessageItem[] = [
    {
      _id: 'msg_001',
      bookingId: 'bk_chat_001',
      senderId: 'usr_parent_1',
      senderRole: 'parent',
      senderName: 'Sarah Connor',
      text: 'Are you on your way?',
      createdAt: '2026-10-27T10:15:00.000Z',
    },
    {
      _id: 'msg_002',
      bookingId: 'bk_chat_001',
      senderId: 'coach_001',
      senderRole: 'coach',
      senderName: 'Sensei Maya',
      text: 'I’m on my way.',
      createdAt: '2026-10-27T10:18:00.000Z',
    },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads messages in chronological order and renders message bubbles', async () => {
    (getBookingMessages as any).mockResolvedValue(mockMessagesList);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingChatModal, {
        visible: true,
        onClose: vi.fn(),
        booking: mockAcceptedBooking,
        token: 'auth_token',
        currentUserRole: 'coach',
        currentUserId: 'coach_001',
      })
    );

    await flushPromises();
    const tree = render();

    expect(getBookingMessages).toHaveBeenCalledWith('auth_token', 'bk_chat_001');

    const msg1 = findElement(tree, (el) => el.props?.testID === 'chat-message-msg_001');
    const msg2 = findElement(tree, (el) => el.props?.testID === 'chat-message-msg_002');
    expect(msg1).not.toBeNull();
    expect(msg2).not.toBeNull();

    expect(findElement(msg1, (el) => el.props?.children === 'Are you on your way?')).not.toBeNull();
    expect(findElement(msg2, (el) => el.props?.children === 'I’m on my way.')).not.toBeNull();

    cleanup();
  });

  it('displays empty state when conversation has no messages', async () => {
    (getBookingMessages as any).mockResolvedValue([]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingChatModal, {
        visible: true,
        onClose: vi.fn(),
        booking: mockAcceptedBooking,
        token: 'auth_token',
        currentUserRole: 'coach',
        currentUserId: 'coach_001',
      })
    );

    await flushPromises();
    const tree = render();

    const emptyState = findElement(tree, (el) => el.props?.testID === 'chat-empty-state');
    expect(emptyState).not.toBeNull();

    cleanup();
  });

  it('renders correct role-specific quick message chips for coach and sends via API on tap', async () => {
    (getBookingMessages as any).mockResolvedValue([]);
    const sentMsgResponse: BookingMessageItem = {
      _id: 'msg_chip_sent',
      bookingId: 'bk_chat_001',
      senderId: 'coach_001',
      senderRole: 'coach',
      senderName: 'Sensei Maya',
      text: 'I’m on my way.',
      createdAt: '2026-10-27T10:20:00.000Z',
    };
    (sendBookingMessage as any).mockResolvedValue(sentMsgResponse);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingChatModal, {
        visible: true,
        onClose: vi.fn(),
        booking: mockAcceptedBooking,
        token: 'auth_token',
        currentUserRole: 'coach',
        currentUserId: 'coach_001',
      })
    );

    await flushPromises();
    let tree = render();

    // Verify first coach chip
    const chip0 = findElement(tree, (el) => el.props?.testID === 'quick-msg-chip-0');
    expect(chip0).not.toBeNull();
    expect(findElement(chip0, (el) => el.props?.children === 'I’m on my way.')).not.toBeNull();

    // Tap chip
    await chip0.props.onPress();
    await flushPromises();

    expect(sendBookingMessage).toHaveBeenCalledWith('auth_token', 'bk_chat_001', 'I’m on my way.');

    cleanup();
  });

  it('renders correct role-specific quick message chips for customer', async () => {
    (getBookingMessages as any).mockResolvedValue([]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingChatModal, {
        visible: true,
        onClose: vi.fn(),
        booking: mockAcceptedBooking,
        token: 'auth_token',
        currentUserRole: 'parent',
        currentUserId: 'usr_parent_1',
      })
    );

    await flushPromises();
    const tree = render();

    // Verify first customer chip
    const chip0 = findElement(tree, (el) => el.props?.testID === 'quick-msg-chip-0');
    expect(chip0).not.toBeNull();
    expect(findElement(chip0, (el) => el.props?.children === 'Are you on your way?')).not.toBeNull();

    cleanup();
  });

  it('sends typed message through sendBookingMessage and clears input', async () => {
    (getBookingMessages as any).mockResolvedValue([]);
    const sentMsg: BookingMessageItem = {
      _id: 'msg_typed',
      bookingId: 'bk_chat_001',
      senderId: 'coach_001',
      senderRole: 'coach',
      senderName: 'Sensei Maya',
      text: 'I am arriving at the court now.',
      createdAt: '2026-10-27T10:25:00.000Z',
    };
    (sendBookingMessage as any).mockResolvedValue(sentMsg);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingChatModal, {
        visible: true,
        onClose: vi.fn(),
        booking: mockAcceptedBooking,
        token: 'auth_token',
        currentUserRole: 'coach',
        currentUserId: 'coach_001',
      })
    );

    await flushPromises();
    let tree = render();

    const input = findElement(tree, (el) => el.props?.testID === 'chat-input-text');
    input.props.onChangeText('I am arriving at the court now.');

    tree = render();
    const sendBtn = findElement(tree, (el) => el.props?.testID === 'chat-send-button');
    expect(sendBtn.props.disabled).toBe(false);

    await sendBtn.props.onPress();
    await flushPromises();

    expect(sendBookingMessage).toHaveBeenCalledWith(
      'auth_token',
      'bk_chat_001',
      'I am arriving at the court now.'
    );

    cleanup();
  });

  it('displays closed notice banner when booking is rejected or cancelled', async () => {
    const rejectedBooking = { ...mockAcceptedBooking, status: 'rejected' as const };
    (getBookingMessages as any).mockResolvedValue([]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(BookingChatModal, {
        visible: true,
        onClose: vi.fn(),
        booking: rejectedBooking,
        token: 'auth_token',
        currentUserRole: 'coach',
      })
    );

    await flushPromises();
    const tree = render();

    const closedBanner = findElement(tree, (el) => el.props?.testID === 'chat-closed-banner');
    expect(closedBanner).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'chat-input-text')).toBeNull();

    cleanup();
  });
});

describe('CoachHomeView Request Management', () => {
  const coachUser: UserProfile = {
    _id: 'coach_001',
    name: 'Sensei Maya',
    email: 'maya@coach.com',
    role: 'coach',
    isActive: true,
  };

  const mockCoachPendingBooking: BookingItem = {
    _id: 'bk_coach_p1',
    customerId: 'usr_parent_1',
    coachId: 'coach_001',
    customerName: 'Sarah Connor',
    coachName: 'Sensei Maya',
    sport: 'boxing',
    date: '2028-11-20',
    startTime: '10:00',
    endTime: '11:00',
    startMinutes: 600,
    endMinutes: 660,
    durationMinutes: 60,
    venueType: 'coach_home',
    status: 'pending',
    paymentStatus: 'unpaid',
    createdAt: '2026-10-27T10:00:00.000Z',
  };

  const mockCoachAcceptedBooking: BookingItem = {
    _id: 'bk_coach_a1',
    customerId: 'usr_ind_1',
    coachId: 'coach_001',
    customerName: 'Alex Rivera',
    coachName: 'Sensei Maya',
    sport: 'kickboxing',
    date: '2028-11-21',
    startTime: '14:00',
    endTime: '15:30',
    startMinutes: 840,
    endMinutes: 930,
    durationMinutes: 90,
    venueType: 'customer_home',
    trainingAddress: '789 Indiranagar 100ft Road',
    customerPhone: '+919876543210',
    status: 'accepted',
    paymentStatus: 'unpaid',
    createdAt: '2026-10-27T11:00:00.000Z',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CoachHomeView preserves honest empty state when no trainee requests exist', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachHomeView, {
        user: coachUser,
        initialBookings: [],
      })
    );

    const emptySection = findElement(
      tree,
      (el) => el.props?.title === 'No Active Trainee Requests'
    );
    expect(emptySection).not.toBeNull();

    cleanup();
  });

  it('CoachHomeView renders incoming pending requests and accepted sessions', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(CoachHomeView, {
        user: coachUser,
        initialBookings: [mockCoachPendingBooking, mockCoachAcceptedBooking],
      })
    );

    const pendingSectionHeader = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('PENDING REQUESTS')
    );
    expect(pendingSectionHeader).not.toBeNull();

    const acceptedSectionHeader = findElement(
      tree,
      (el) => typeof el.props?.children === 'string' && el.props.children.includes('ACCEPTED SESSIONS')
    );
    expect(acceptedSectionHeader).not.toBeNull();

    const pendingCard = findElement(tree, (el) => el.type === CoachBookingCard && el.props?.booking?._id === 'bk_coach_p1');
    const acceptedCard = findElement(tree, (el) => el.type === CoachBookingCard && el.props?.booking?._id === 'bk_coach_a1');
    expect(pendingCard).not.toBeNull();
    expect(acceptedCard).not.toBeNull();

    cleanup();
  });

  it('CoachHomeView handles Accept action and updates booking status', async () => {
    (acceptBooking as any).mockResolvedValue({
      ...mockCoachPendingBooking,
      status: 'accepted',
    });
    (getCoachBookings as any).mockResolvedValue([
      { ...mockCoachPendingBooking, status: 'accepted' },
    ]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(CoachHomeView, {
        user: coachUser,
        token: 'coach_jwt_token',
        initialBookings: [mockCoachPendingBooking],
      })
    );

    let tree = render();
    const cardEl = findElement(tree, (el) => el.type === CoachBookingCard && el.props?.booking?._id === 'bk_coach_p1');
    expect(cardEl).not.toBeNull();

    await cardEl.props.onAccept('bk_coach_p1');
    await flushPromises();

    expect(acceptBooking).toHaveBeenCalledWith('coach_jwt_token', 'bk_coach_p1');

    tree = render();
    const feedback = findElement(tree, (el) => el.props?.testID === 'coach-action-feedback');
    expect(feedback).not.toBeNull();
    expect(findElement(feedback, (el) => el.props?.children === 'Booking accepted successfully!')).not.toBeNull();

    cleanup();
  });

  it('CoachHomeView handles Reject action and updates booking status', async () => {
    (rejectBooking as any).mockResolvedValue({
      ...mockCoachPendingBooking,
      status: 'rejected',
    });
    (getCoachBookings as any).mockResolvedValue([
      { ...mockCoachPendingBooking, status: 'rejected' },
    ]);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(CoachHomeView, {
        user: coachUser,
        token: 'coach_jwt_token',
        initialBookings: [mockCoachPendingBooking],
      })
    );

    let tree = render();
    const cardEl = findElement(tree, (el) => el.type === CoachBookingCard && el.props?.booking?._id === 'bk_coach_p1');
    expect(cardEl).not.toBeNull();

    await cardEl.props.onReject('bk_coach_p1');
    await flushPromises();

    expect(rejectBooking).toHaveBeenCalledWith('coach_jwt_token', 'bk_coach_p1', undefined);

    tree = render();
    const feedback = findElement(tree, (el) => el.props?.testID === 'coach-action-feedback');
    expect(feedback).not.toBeNull();
    expect(findElement(feedback, (el) => el.props?.children === 'Booking request declined.')).not.toBeNull();

    cleanup();
  });

  it('CoachHomeView prevents duplicate actions while an action is processing', async () => {
    let resolveAccept: any;
    const pendingPromise = new Promise((resolve) => {
      resolveAccept = resolve;
    });
    (acceptBooking as any).mockReturnValue(pendingPromise);

    const { render, cleanup } = createInteractiveHarness(
      React.createElement(CoachHomeView, {
        user: coachUser,
        token: 'coach_jwt_token',
        initialBookings: [mockCoachPendingBooking],
      })
    );

    let tree = render();
    const cardEl = findElement(tree, (el) => el.type === CoachBookingCard && el.props?.booking?._id === 'bk_coach_p1');

    // Trigger first action
    const actionPromise = cardEl.props.onAccept('bk_coach_p1');
    tree = render();

    const processingCard = findElement(tree, (el) => el.type === CoachBookingCard && el.props?.booking?._id === 'bk_coach_p1');
    expect(processingCard.props.isProcessing).toBe(true);

    // Attempt second action while processing
    await processingCard.props.onAccept('bk_coach_p1');
    expect(acceptBooking).toHaveBeenCalledTimes(1);

    resolveAccept({ ...mockCoachPendingBooking, status: 'accepted' });
    await actionPromise;
    await flushPromises();

    cleanup();
  });
});
