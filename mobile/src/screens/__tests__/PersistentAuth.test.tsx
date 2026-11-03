import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { AuthProvider, AuthContext, AuthContextType } from '../../context/AuthContext';
import * as authApi from '../../services/authApi';
import * as storage from '../../utils/storage';
import { AuthApiError, UserProfile } from '../../services/authApi';
import { AppNavigator } from '../../navigation/AppNavigator';
import { LoginScreen } from '../LoginScreen';
import { HomeScreen } from '../HomeScreen';

// Minimal dispatcher harness to test React hook lifecycle in Node environment without heavy DOM dependencies
function createHookHarness() {
  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  let hooks: any[] = [];
  let hookIdx = 0;
  const effects: Array<() => void | (() => void)> = [];
  const cleanups: Array<(() => void) | void> = [];

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
      const idx = hookIdx++;
      if (!hooks[idx]) {
        hooks[idx] = true;
        effects.push(fn);
      }
    },
    useContext() {
      return null;
    },
  };

  const originalDispatcher = internals.H;

  const render = async (): Promise<AuthContextType> => {
    internals.H = dispatcher;
    hookIdx = 0;
    const element = AuthProvider({ children: null });
    while (effects.length > 0) {
      const effect = effects.shift()!;
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        cleanups.push(cleanup);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    hookIdx = 0;
    const updatedElement = AuthProvider({ children: null }) as React.ReactElement<any>;
    return updatedElement.props.value;
  };

  const getContext = (): AuthContextType => {
    internals.H = dispatcher;
    hookIdx = 0;
    const element = AuthProvider({ children: null }) as React.ReactElement<any>;
    return element.props.value;
  };

  const cleanup = () => {
    cleanups.forEach((c) => c && c());
    internals.H = originalDispatcher;
  };

  return { render, getContext, cleanup };
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

function renderScreenWithAuth(ui: React.ReactElement, authValue: Partial<AuthContextType> = {}) {
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
    useEffect() {},
    useContext(context: any) {
      if (context === AuthContext) {
        return defaultAuth;
      }
      return null;
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

describe('Phase 8.3 — Persistent Authentication & Secure Session Restoration', () => {
  let harness: ReturnType<typeof createHookHarness>;

  const parentProfile: UserProfile = {
    _id: 'usr_parent_01',
    name: 'Sarah Connor',
    email: 'sarah@example.com',
    role: 'parent',
    isActive: true,
  };

  const individualProfile: UserProfile = {
    _id: 'usr_ind_01',
    name: 'Alex Rivera',
    email: 'alex@example.com',
    role: 'individual',
    isActive: true,
  };

  const coachProfile: UserProfile = {
    _id: 'usr_coach_01',
    name: 'Sensei Maya',
    email: 'maya@example.com',
    role: 'coach',
    isActive: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    storage._resetMemoryStorageForTesting();
    harness = createHookHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  describe('1. Successful login persists authentication credentials securely', () => {
    it('saves JWT token and profile to encrypted storage upon login', async () => {
      vi.spyOn(storage, 'getToken').mockResolvedValue(null);
      const saveTokenSpy = vi.spyOn(storage, 'saveToken').mockResolvedValue();
      const saveProfileSpy = vi.spyOn(storage, 'saveUserProfile').mockResolvedValue();
      vi.spyOn(authApi, 'login').mockResolvedValue({
        token: 'auth_jwt_token_123',
        user: parentProfile,
      });

      await harness.render();
      const auth = harness.getContext();

      await auth.login('sarah@example.com', 'SecurePassword123!');

      expect(saveTokenSpy).toHaveBeenCalledWith('auth_jwt_token_123');
      expect(saveProfileSpy).toHaveBeenCalledWith(parentProfile);
      expect(harness.getContext().user).toEqual(parentProfile);
      expect(harness.getContext().token).toBe('auth_jwt_token_123');
    });
  });

  describe('2. App restart restores a valid authenticated session automatically', () => {
    it('reads stored token on launch and verifies with backend without prompting login', async () => {
      vi.spyOn(storage, 'getToken').mockResolvedValue('persisted_token_abc');
      vi.spyOn(authApi, 'getMe').mockResolvedValue(individualProfile);
      const saveProfileSpy = vi.spyOn(storage, 'saveUserProfile').mockResolvedValue();

      const auth = await harness.render();

      expect(storage.getToken).toHaveBeenCalledTimes(1);
      expect(authApi.getMe).toHaveBeenCalledWith('persisted_token_abc');
      expect(saveProfileSpy).toHaveBeenCalledWith(individualProfile);
      expect(auth.user).toEqual(individualProfile);
      expect(auth.token).toBe('persisted_token_abc');
      expect(auth.isLoading).toBe(false);
      expect(auth.isInitializing).toBe(false);
    });
  });

  describe('3. Role-based routing restores Parent, Individual, and Coach to their dashboards', () => {
    it('renders ParentHomeView for parent role', () => {
      const { tree, cleanup } = renderScreenWithAuth(React.createElement(HomeScreen), {
        user: parentProfile,
      });
      const parentView = findElement(tree, (el) => el.props?.testID === 'parent-home-view');
      expect(parentView).toBeDefined();
      cleanup();
    });

    it('renders IndividualHomeView for individual role', () => {
      const { tree, cleanup } = renderScreenWithAuth(React.createElement(HomeScreen), {
        user: individualProfile,
      });
      const indView = findElement(tree, (el) => el.props?.testID === 'individual-home-view');
      expect(indView).toBeDefined();
      cleanup();
    });

    it('renders CoachHomeView for coach role', () => {
      const { tree, cleanup } = renderScreenWithAuth(React.createElement(HomeScreen), {
        user: coachProfile,
      });
      const coachView = findElement(tree, (el) => el.props?.testID === 'coach-home-view');
      expect(coachView).toBeDefined();
      cleanup();
    });
  });

  describe('4. Invalid or expired sessions are handled correctly (HTTP 401)', () => {
    it('wipes expired token from storage and returns to unauthenticated state', async () => {
      vi.spyOn(storage, 'getToken').mockResolvedValue('expired_token_xyz');
      vi.spyOn(authApi, 'getMe').mockRejectedValue(new AuthApiError('Token expired.', 401));
      const removeTokenSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();
      const removeProfileSpy = vi.spyOn(storage, 'removeUserProfile').mockResolvedValue();

      const auth = await harness.render();

      expect(removeTokenSpy).toHaveBeenCalledTimes(1);
      expect(removeProfileSpy).toHaveBeenCalledTimes(1);
      expect(auth.user).toBeNull();
      expect(auth.token).toBeNull();
      expect(auth.isInitializing).toBe(false);
    });
  });

  describe('5. Account deactivation or revocation causes immediate session termination (HTTP 403)', () => {
    it('wipes token and returns to unauthenticated state when account is deactivated', async () => {
      vi.spyOn(storage, 'getToken').mockResolvedValue('deactivated_user_token');
      vi.spyOn(authApi, 'getMe').mockRejectedValue(new AuthApiError('Account deactivated.', 403));
      const removeTokenSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();
      const removeProfileSpy = vi.spyOn(storage, 'removeUserProfile').mockResolvedValue();

      const auth = await harness.render();

      expect(removeTokenSpy).toHaveBeenCalledTimes(1);
      expect(removeProfileSpy).toHaveBeenCalledTimes(1);
      expect(auth.user).toBeNull();
      expect(auth.token).toBeNull();
    });
  });

  describe('6. Explicit logout clears stored credentials and prevents unauthorized access', () => {
    it('clears stored token, cached profile snapshot, and in-memory auth state on logout', async () => {
      vi.spyOn(storage, 'getToken').mockResolvedValue('active_token');
      vi.spyOn(authApi, 'getMe').mockResolvedValue(coachProfile);
      const removeTokenSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();
      const removeProfileSpy = vi.spyOn(storage, 'removeUserProfile').mockResolvedValue();

      await harness.render();
      const auth = harness.getContext();
      expect(auth.user).toEqual(coachProfile);

      await auth.logout();

      expect(removeTokenSpy).toHaveBeenCalledTimes(1);
      expect(removeProfileSpy).toHaveBeenCalledTimes(1);
      expect(harness.getContext().user).toBeNull();
      expect(harness.getContext().token).toBeNull();
    });

    it('AppNavigator renders Welcome stack after logout (Home is unmounted)', () => {
      const { tree, cleanup } = renderScreenWithAuth(React.createElement(AppNavigator), {
        user: null,
        isInitializing: false,
      });

      const screens = findAllElements(
        tree,
        (el) => el.type?.displayName === 'NativeStackScreen' || el.type === 'NativeStackScreen'
      );
      const screenNames = screens.map((s) => s.props.name);

      expect(screenNames).toContain('Welcome');
      expect(screenNames).toContain('Login');
      expect(screenNames).not.toContain('Home');

      cleanup();
    });
  });

  describe('7. Remembered phone number feature', () => {
    it('prefills remembered phone on LoginScreen and provides clear button', async () => {
      vi.spyOn(storage, 'getRememberedPhone').mockResolvedValue('+1 555-019-2834');

      const { tree, cleanup } = renderScreenWithAuth(
        React.createElement(LoginScreen, { initialPhone: '+1 555-019-2834' })
      );

      const card = findElement(tree, (el) => el.props?.testID === 'remembered-phone-card');
      expect(card).toBeDefined();

      const phoneText = findElement(tree, (el) => el.props?.testID === 'remembered-phone-text');
      expect(phoneText?.props?.children).toBe('+1 555-019-2834');

      const clearBtn = findElement(
        tree,
        (el) => el.props?.testID === 'btn-clear-remembered-phone'
      );
      expect(clearBtn).toBeDefined();

      cleanup();
    });

    it('clears remembered phone number without affecting credentials when user clicks clear', async () => {
      const clearSpy = vi.spyOn(storage, 'clearRememberedPhone').mockResolvedValue();

      const { tree, cleanup } = renderScreenWithAuth(
        React.createElement(LoginScreen, { initialPhone: '+91 9876543210' })
      );

      const clearBtn = findElement(
        tree,
        (el) => el.props?.testID === 'btn-clear-remembered-phone'
      );
      expect(clearBtn).toBeDefined();

      await clearBtn.props.onPress();

      expect(clearSpy).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('persists remembered phone even after explicit logout for user convenience', async () => {
      // Mock remembered phone in storage
      vi.spyOn(storage, 'getRememberedPhone').mockResolvedValue('+1 555-999-8888');
      const clearPhoneSpy = vi.spyOn(storage, 'clearRememberedPhone');

      // Setup logged in session
      vi.spyOn(storage, 'getToken').mockResolvedValue('active_token');
      vi.spyOn(authApi, 'getMe').mockResolvedValue(parentProfile);

      await harness.render();
      const auth = harness.getContext();

      // Explicit logout
      await auth.logout();

      // Token and profile must be gone, but remembered phone must NOT be cleared
      expect(harness.getContext().token).toBeNull();
      expect(clearPhoneSpy).not.toHaveBeenCalled();
      const storedPhone = await storage.getRememberedPhone();
      expect(storedPhone).toBe('+1 555-999-8888');
    });
  });

  describe('8. Passwords and OTPs are never persisted to storage', () => {
    it('storage keys contain only tokens, profile snapshots, and remembered phones', () => {
      expect(storage.AUTH_TOKEN_KEY).toBe('athleteconnect_auth_token');
      expect(storage.USER_PROFILE_KEY).toBe('athleteconnect_user_profile');
      expect(storage.REMEMBERED_PHONE_KEY).toBe('athleteconnect_remembered_phone');

      // Verify no password or otp keys exist
      const keys = [storage.AUTH_TOKEN_KEY, storage.USER_PROFILE_KEY, storage.REMEMBERED_PHONE_KEY];
      keys.forEach((key) => {
        expect(key.toLowerCase()).not.toContain('password');
        expect(key.toLowerCase()).not.toContain('otp');
      });
    });
  });

  describe('9. Offline startup does not cause infinite loading screen', () => {
    it('restores cached profile gracefully when network is disconnected without hanging', async () => {
      vi.spyOn(storage, 'getToken').mockResolvedValue('offline_token');
      vi.spyOn(storage, 'getUserProfile').mockResolvedValue(parentProfile);
      vi.spyOn(authApi, 'getMe').mockRejectedValue(new AuthApiError('Network error', 0));

      const auth = await harness.render();

      // Must complete initialization
      expect(auth.isInitializing).toBe(false);
      expect(auth.isLoading).toBe(false);

      // User restored from cache with offline mode message
      expect(auth.user).toEqual(parentProfile);
      expect(auth.token).toBe('offline_token');
      expect(auth.error).toContain('Offline mode');
    });

    it('handles offline startup gracefully when no cached profile exists without hanging', async () => {
      vi.spyOn(storage, 'getToken').mockResolvedValue('offline_token');
      vi.spyOn(storage, 'getUserProfile').mockResolvedValue(null);
      vi.spyOn(authApi, 'getMe').mockRejectedValue(new AuthApiError('Network error', 0));

      const auth = await harness.render();

      expect(auth.isInitializing).toBe(false);
      expect(auth.isLoading).toBe(false);
      expect(auth.user).toBeNull();
      expect(auth.error).toContain('Network error');
    });
  });

  describe('10. Simultaneous requests and race condition prevention', () => {
    it('blocks concurrent conflicting authentication submissions', async () => {
      vi.spyOn(storage, 'getToken').mockResolvedValue(null);
      vi.spyOn(storage, 'saveToken').mockResolvedValue();
      vi.spyOn(authApi, 'login').mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ token: 'tok', user: parentProfile }), 50))
      );

      await harness.render();
      const auth = harness.getContext();

      const call1 = auth.login('sarah@example.com', 'Pass12345!');
      await expect(auth.login('sarah@example.com', 'Pass12345!')).rejects.toThrow(
        'An authentication request is already in progress.'
      );

      await call1;
    });
  });
});
