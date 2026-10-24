import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { RegisterScreen } from '../RegisterScreen';
import { LoginScreen } from '../LoginScreen';
import { HomeScreen } from '../HomeScreen';
import { ParentHomeView } from '../home/ParentHomeView';
import { IndividualHomeView } from '../home/IndividualHomeView';
import { CoachHomeView } from '../home/CoachHomeView';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import { UserProfile } from '../../services/authApi';
import { RoleId } from '../../data/roles';

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
    const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
      user: coachUser,
    });

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

  it('triggers logout when Sign Out button is pressed', async () => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
      user: coachUser,
      logout: logoutMock,
    });

    const signOutBtn = findElement(tree, (el) => el.props?.title === 'Sign Out');
    expect(signOutBtn).toBeDefined();

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
      (el) => el.props?.stepNumber === 4 && el.props?.title === 'Availability & Locations'
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
