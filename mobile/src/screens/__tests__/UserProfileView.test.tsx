import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { UserProfileView } from '../profile/UserProfileView';
import { CoachProfileEditScreen } from '../CoachProfileEditScreen';
import { UserProfile } from '../../services/authApi';
import { getCoachProfile, CoachProfileResponse } from '../../services/coachApi';
import { AuthContext, AuthContextType } from '../../context/AuthContext';

vi.mock('../../services/coachApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/coachApi')>();
  return {
    ...actual,
    getCoachProfile: vi.fn(),
  };
});

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
    useEffect() {},
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

describe('UserProfileView Component', () => {
  const parentUser: UserProfile = {
    _id: 'usr_p_1',
    name: 'Sarah Connor',
    email: 'sarah@family.com',
    role: 'parent',
    isActive: true,
  };

  const coachUser: UserProfile = {
    _id: 'usr_c_1',
    name: 'Master Bruce',
    email: 'bruce@dojo.com',
    role: 'coach',
    isActive: true,
  };

  const mockCoachProfile: CoachProfileResponse = {
    isComplete: true,
    profile: {
      _id: 'prof_1',
      userId: 'usr_c_1',
      bio: 'Lifelong martial artist with 15 years experience coaching youth and adults.',
      disciplines: ['boxing', 'kickboxing'],
      specialties: ['Footwork', 'Counter-Punching'],
      sessionFormats: ['one_on_one', 'small_group'],
      venueTypes: ['coach_home', 'ground'],
      hourlyRate: 1500,
      currency: 'INR',
      locations: ['Indiranagar Studio', 'Koramangala Ground'],
      isPublished: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getCoachProfile as any).mockResolvedValue(mockCoachProfile);
  });

  it('renders Parent account details, initials, role badge, and Sign Out action', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(UserProfileView, { user: parentUser }),
      { user: parentUser }
    );

    expect(findElement(tree, (el) => el.props?.testID === 'user-profile-view')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.children === 'Sarah Connor')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.children === 'sarah@family.com')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.children === 'Parent / Guardian')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.children === 'Active')).not.toBeNull();

    // Coach summary section must NOT be rendered for parent
    expect(findElement(tree, (el) => el.props?.testID === 'coach-profile-summary')).toBeNull();

    const signOutBtn = findElement(tree, (el) => el.props?.title === 'Sign Out');
    expect(signOutBtn).not.toBeNull();

    cleanup();
  });

  it('renders Coach account details, coaching profile summary, and Edit Coach Profile button', () => {
    const { tree, cleanup } = renderWithAuth(
      React.createElement(UserProfileView, { user: coachUser }),
      { user: coachUser }
    );

    expect(findElement(tree, (el) => el.props?.testID === 'user-profile-view')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.children === 'Master Bruce')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.children === 'bruce@dojo.com')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.children === 'Player / Coach')).not.toBeNull();

    // Coach summary section must be rendered for coach
    const coachSummary = findElement(tree, (el) => el.props?.testID === 'coach-profile-summary');
    expect(coachSummary).not.toBeNull();

    const editProfileBtn = findElement(tree, (el) => el.props?.testID === 'edit-coach-profile-btn');
    expect(editProfileBtn).not.toBeNull();
    expect(editProfileBtn.props.title).toBe('Edit Coach Profile');

    cleanup();
  });

  it('invokes onLogout callback when Sign Out button is pressed', async () => {
    const onLogoutMock = vi.fn().mockResolvedValue(undefined);
    const { tree, cleanup } = renderWithAuth(
      React.createElement(UserProfileView, { user: parentUser, onLogout: onLogoutMock }),
      { user: parentUser }
    );

    const signOutBtn = findElement(tree, (el) => el.props?.title === 'Sign Out');
    expect(signOutBtn).not.toBeNull();

    await signOutBtn.props.onPress();
    expect(onLogoutMock).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('toggles to CoachProfileEditScreen when Edit Coach Profile button is pressed', () => {
    // Harness with state tracking
    let isEditing = false;
    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const originalDispatcher = internals.H;

    const dispatcher = {
      useState(initial: any) {
        if (typeof initial === 'boolean' && isEditing) {
          return [true, (v: any) => { isEditing = v; }];
        }
        return [initial, (v: any) => { isEditing = v; }];
      },
      useRef(initial: any) { return { current: initial }; },
      useCallback(fn: any) { return fn; },
      useEffect() {},
      useContext() { return { top: 0, bottom: 20 }; },
    };

    internals.H = dispatcher;

    // First render: not editing
    const tree1 = UserProfileView({ user: coachUser });
    const editBtn = findElement(tree1, (el) => el.props?.testID === 'edit-coach-profile-btn');
    expect(editBtn).not.toBeNull();

    // Trigger edit
    editBtn.props.onPress();
    expect(isEditing).toBe(true);

    // Second render: editing mode renders CoachProfileEditScreen
    const tree2 = UserProfileView({ user: coachUser }) as any;
    expect(tree2?.type).toBe(CoachProfileEditScreen);
    expect(tree2?.props?.onBack).toBeDefined();

    internals.H = originalDispatcher;
  });
});
