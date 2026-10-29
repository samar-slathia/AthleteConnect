import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AppNavigator } from '../AppNavigator';
import { HomeScreen } from '../../screens/HomeScreen';
import { BottomNavBar } from '../BottomNavBar';
import { ParentHomeView } from '../../screens/home/ParentHomeView';
import { IndividualHomeView } from '../../screens/home/IndividualHomeView';
import { CoachHomeView } from '../../screens/home/CoachHomeView';
import { UserProfileView } from '../../screens/profile/UserProfileView';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import { UserProfile } from '../../services/authApi';

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

describe('Phase 3 Role-Specific Navigation & Persistent Bottom Bar', () => {
  const parentUser: UserProfile = {
    _id: 'usr_parent_1',
    name: 'Eleanor Vance',
    email: 'eleanor@family.org',
    role: 'parent',
    isActive: true,
  };

  const individualUser: UserProfile = {
    _id: 'usr_ind_1',
    name: 'Marcus Brody',
    email: 'marcus@fitness.org',
    role: 'individual',
    isActive: true,
  };

  const coachUser: UserProfile = {
    _id: 'usr_coach_1',
    name: 'Coach Kenji',
    email: 'kenji@dojo.org',
    role: 'coach',
    isActive: true,
  };

  describe('Unauthenticated Navigation Constraint', () => {
    it('unauthenticated users never receive or see the bottom navigation bar', () => {
      const { tree, cleanup } = renderWithAuth(React.createElement(AppNavigator), {
        user: null,
      });

      const bottomNav = findElement(tree, (el) => el.type === BottomNavBar || el.props?.testID === 'bottom-nav-bar');
      expect(bottomNav).toBeNull();

      cleanup();
    });
  });

  describe('Parent/Guardian Tab Flow', () => {
    it('renders persistent BottomNavBar with role="parent"', () => {
      const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
        user: parentUser,
      });

      const bottomNav = findElement(tree, (el) => el.type === BottomNavBar);
      expect(bottomNav).not.toBeNull();
      expect(bottomNav.props.role).toBe('parent');

      cleanup();
    });

    it('Home tab renders ParentHomeView in mode="home"', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'home' }),
        { user: parentUser }
      );

      const parentHome = findElement(tree, (el) => el.type === ParentHomeView);
      expect(parentHome).not.toBeNull();
      expect(parentHome.props.mode).toBe('home');

      cleanup();
    });

    it('Discover tab renders ParentHomeView in mode="discover"', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'discover' }),
        { user: parentUser }
      );

      const parentDiscover = findElement(tree, (el) => el.type === ParentHomeView);
      expect(parentDiscover).not.toBeNull();
      expect(parentDiscover.props.mode).toBe('discover');

      cleanup();
    });

    it('Bookings tab renders ParentHomeView in mode="bookings"', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'bookings' }),
        { user: parentUser }
      );

      const parentBookings = findElement(tree, (el) => el.type === ParentHomeView);
      expect(parentBookings).not.toBeNull();
      expect(parentBookings.props.mode).toBe('bookings');

      cleanup();
    });

    it('Profile tab renders UserProfileView', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'profile' }),
        { user: parentUser }
      );

      const profileView = findElement(tree, (el) => el.type === UserProfileView);
      expect(profileView).not.toBeNull();
      expect(profileView.props.user.role).toBe('parent');

      cleanup();
    });

    it('normalizes unauthorized coach tab back to home for parent', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'sessions' }),
        { user: parentUser }
      );

      // Must fall back to home tab for parent
      const parentHome = findElement(tree, (el) => el.type === ParentHomeView);
      expect(parentHome).not.toBeNull();
      expect(parentHome.props.mode).toBe('home');

      cleanup();
    });
  });

  describe('Individual Customer Tab Flow', () => {
    it('renders persistent BottomNavBar with role="individual"', () => {
      const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
        user: individualUser,
      });

      const bottomNav = findElement(tree, (el) => el.type === BottomNavBar);
      expect(bottomNav).not.toBeNull();
      expect(bottomNav.props.role).toBe('individual');

      cleanup();
    });

    it('Home tab renders IndividualHomeView in mode="home"', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'home' }),
        { user: individualUser }
      );

      const indHome = findElement(tree, (el) => el.type === IndividualHomeView);
      expect(indHome).not.toBeNull();
      expect(indHome.props.mode).toBe('home');

      cleanup();
    });

    it('Discover tab renders IndividualHomeView in mode="discover"', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'discover' }),
        { user: individualUser }
      );

      const indDiscover = findElement(tree, (el) => el.type === IndividualHomeView);
      expect(indDiscover).not.toBeNull();
      expect(indDiscover.props.mode).toBe('discover');

      cleanup();
    });

    it('Bookings tab renders IndividualHomeView in mode="bookings"', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'bookings' }),
        { user: individualUser }
      );

      const indBookings = findElement(tree, (el) => el.type === IndividualHomeView);
      expect(indBookings).not.toBeNull();
      expect(indBookings.props.mode).toBe('bookings');

      cleanup();
    });

    it('Profile tab renders UserProfileView', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'profile' }),
        { user: individualUser }
      );

      const profileView = findElement(tree, (el) => el.type === UserProfileView);
      expect(profileView).not.toBeNull();
      expect(profileView.props.user.role).toBe('individual');

      cleanup();
    });

    it('normalizes unauthorized coach tab back to home for individual', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'availability' }),
        { user: individualUser }
      );

      // Must fall back to home tab for individual
      const indHome = findElement(tree, (el) => el.type === IndividualHomeView);
      expect(indHome).not.toBeNull();
      expect(indHome.props.mode).toBe('home');

      cleanup();
    });
  });

  describe('Coach Tab Flow', () => {
    it('renders persistent BottomNavBar with role="coach"', () => {
      const { tree, cleanup } = renderWithAuth(React.createElement(HomeScreen), {
        user: coachUser,
      });

      const bottomNav = findElement(tree, (el) => el.type === BottomNavBar);
      expect(bottomNav).not.toBeNull();
      expect(bottomNav.props.role).toBe('coach');

      cleanup();
    });

    it('Home tab renders CoachHomeView in mode="home"', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'home' }),
        { user: coachUser }
      );

      const coachHome = findElement(tree, (el) => el.type === CoachHomeView);
      expect(coachHome).not.toBeNull();
      expect(coachHome.props.mode).toBe('home');

      cleanup();
    });

    it('Sessions tab renders CoachHomeView in mode="sessions"', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'sessions' }),
        { user: coachUser }
      );

      const coachSessions = findElement(tree, (el) => el.type === CoachHomeView);
      expect(coachSessions).not.toBeNull();
      expect(coachSessions.props.mode).toBe('sessions');

      cleanup();
    });

    it('Availability tab renders coach-availability-tab-view container', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'availability' }),
        { user: coachUser }
      );

      const availContainer = findElement(
        tree,
        (el) => el.props?.testID === 'coach-availability-tab-view'
      );
      expect(availContainer).not.toBeNull();

      cleanup();
    });

    it('Profile tab renders UserProfileView for coach', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'profile' }),
        { user: coachUser }
      );

      const profileView = findElement(tree, (el) => el.type === UserProfileView);
      expect(profileView).not.toBeNull();
      expect(profileView.props.user.role).toBe('coach');

      cleanup();
    });

    it('normalizes unauthorized customer tab back to home for coach', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(HomeScreen, { initialTab: 'discover' }),
        { user: coachUser }
      );

      // Must fall back to home tab for coach
      const coachHome = findElement(tree, (el) => el.type === CoachHomeView);
      expect(coachHome).not.toBeNull();
      expect(coachHome.props.mode).toBe('home');

      cleanup();
    });
  });
});
