import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { AuthProvider, AuthContextType } from '../../context/AuthContext';
import * as authApi from '../../services/authApi';
import * as storage from '../../utils/storage';
import { AuthApiError, UserProfile } from '../../services/authApi';
import { notifyAuthFailure, clearAuthFailureListeners } from '../../services/authEvents';
import * as coachApi from '../../services/coachApi';
import * as availabilityApi from '../../services/availabilityApi';
import * as profilePhotoService from '../../services/profilePhotoService';
import { AppState } from 'react-native';
import { ConnectivityBanner } from '../../components/ConnectivityBanner';

// Lightweight dispatcher harness for React hook testing
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
    AuthProvider({ children: null });
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
    cleanups.forEach((c) => typeof c === 'function' && c());
    internals.H = originalDispatcher;
  };

  return { render, getContext, cleanup };
}

const mockProfile: UserProfile = {
  _id: 'coach-123',
  name: 'Coach Jane',
  email: 'coach.jane@example.com',
  role: 'coach',
  isActive: true,
};

describe('GAP-1: Automatic Connectivity Monitoring', () => {
  let harness: ReturnType<typeof createHookHarness>;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearAuthFailureListeners();
    (AppState as any)._resetListeners?.();
    harness = createHookHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('initial offline startup restores cached profile with unreachable status', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue('token-valid-abc');
    vi.spyOn(storage, 'getUserProfile').mockResolvedValue(mockProfile);
    vi.spyOn(authApi, 'getMe').mockRejectedValue(new AuthApiError('Network request failed', 0));
    vi.spyOn(authApi, 'probeBackendHealth').mockResolvedValue({ reachable: false });

    const context = await harness.render();

    expect(context.user).toEqual(mockProfile);
    expect(context.token).toBe('token-valid-abc');
    expect(context.backendReachability).toBe('unreachable');
    expect(context.sessionValidationState).toBe('unvalidated');
    expect(context.isUsingCachedProfile).toBe(true);
  });

  it('probeBackendHealth correctly distinguishes HTTP 500/503 from transport failures', async () => {
    // 503 response means server responded -> reachable
    const fetch503 = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Service Unavailable' }),
    });
    global.fetch = fetch503 as any;

    const health503 = await authApi.probeBackendHealth();
    expect(health503.reachable).toBe(true);
    expect(health503.status).toBe(503);

    // Network timeout / DNS rejection -> unreachable
    const fetchOffline = vi.fn().mockRejectedValue(new Error('Failed to connect'));
    global.fetch = fetchOffline as any;

    const healthOffline = await authApi.probeBackendHealth();
    expect(healthOffline.reachable).toBe(false);
  });

  it('foreground revalidation triggers immediately on AppState active transition', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue('token-valid');
    vi.spyOn(storage, 'getUserProfile').mockResolvedValue(mockProfile);
    const getMeSpy = vi.spyOn(authApi, 'getMe').mockResolvedValue(mockProfile);
    const probeSpy = vi.spyOn(authApi, 'probeBackendHealth').mockResolvedValue({ reachable: true, status: 200 });

    await harness.render();
    expect(getMeSpy).toHaveBeenCalledTimes(1);

    // Simulate returning to app from background after debounced delay
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20000);
    (AppState as any)._simulateStateChange('active');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(probeSpy).toHaveBeenCalled();
  });
});

describe('GAP-2: Complete Protected API Coverage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAuthFailureListeners();
  });

  it('401 from coach profile endpoint dispatches auth failure with original token', async () => {
    const notifySpy = vi.fn();
    const authEvents = await import('../../services/authEvents');
    authEvents.onAuthFailure(notifySpy);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Authentication required. Token expired.' }),
    } as any);

    await expect(coachApi.getCoachProfile('coach-token-123')).rejects.toThrow();

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'unauthorized',
        statusCode: 401,
        token: 'coach-token-123',
      })
    );
  });

  it('401 from availability endpoint dispatches auth failure with original token', async () => {
    const notifySpy = vi.fn();
    const authEvents = await import('../../services/authEvents');
    authEvents.onAuthFailure(notifySpy);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Token expired.' }),
    } as any);

    await expect(availabilityApi.getCoachAvailability('avail-token-456')).rejects.toThrow();

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'unauthorized',
        statusCode: 401,
        token: 'avail-token-456',
      })
    );
  });

  it('401 from photo endpoint dispatches auth failure with original token', async () => {
    const notifySpy = vi.fn();
    const authEvents = await import('../../services/authEvents');
    authEvents.onAuthFailure(notifySpy);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Invalid token.' }),
    } as any);

    await expect(
      profilePhotoService.deleteProfilePhotoFromCloud('photo-token-789')
    ).rejects.toThrow();

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'unauthorized',
        statusCode: 401,
        token: 'photo-token-789',
      })
    );
  });

  it('generic 403 Forbidden does NOT dispatch auth failure (preserves session)', async () => {
    const notifySpy = vi.fn();
    const authEvents = await import('../../services/authEvents');
    authEvents.onAuthFailure(notifySpy);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Access forbidden. Required role: coach.' }),
    } as any);

    await expect(coachApi.getCoachProfile('user-token')).rejects.toThrow();

    // Generic role permission 403 must NOT trigger logout
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('explicit ACCOUNT_DEACTIVATED 403 dispatches account_deactivated failure', async () => {
    const notifySpy = vi.fn();
    const authEvents = await import('../../services/authEvents');
    authEvents.onAuthFailure(notifySpy);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      json: async () => ({
        code: 'ACCOUNT_DEACTIVATED',
        error: 'Account has been deactivated. Please contact support.',
      }),
    } as any);

    await expect(coachApi.getCoachProfile('deactivated-token')).rejects.toThrow();

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'account_deactivated',
        statusCode: 403,
        token: 'deactivated-token',
      })
    );
  });

  it('public login and registration 401 errors do NOT dispatch global auth failure', async () => {
    const notifySpy = vi.fn();
    const authEvents = await import('../../services/authEvents');
    authEvents.onAuthFailure(notifySpy);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Invalid email or password.' }),
    } as any);

    await expect(
      authApi.login({ email: 'test@example.com', password: 'wrongpassword' })
    ).rejects.toThrow();

    expect(notifySpy).not.toHaveBeenCalled();
  });
});

describe('GAP-3: Stale-Token Protection & Single-Flight Logout', () => {
  let harness: ReturnType<typeof createHookHarness>;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearAuthFailureListeners();
    (AppState as any)._resetListeners?.();
    harness = createHookHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('Token A failure does NOT log out a user currently authenticated with Token B', async () => {
    const removeTokenSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();
    vi.spyOn(storage, 'getToken').mockResolvedValue('token-B-current');
    vi.spyOn(authApi, 'getMe').mockResolvedValue(mockProfile);

    const context = await harness.render();
    expect(context.token).toBe('token-B-current');

    // Fire failure from a delayed request that used old Token A
    notifyAuthFailure({
      reason: 'unauthorized',
      statusCode: 401,
      message: 'Old session expired',
      token: 'token-A-old',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const currentContext = harness.getContext();

    // Active session Token B is safely preserved!
    expect(removeTokenSpy).not.toHaveBeenCalled();
    expect(currentContext.token).toBe('token-B-current');
    expect(currentContext.user).toEqual(mockProfile);
    expect(currentContext.sessionValidationState).toBe('validated');
  });

  it('missing associated token cannot invalidate an active authenticated session', async () => {
    const removeTokenSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();
    vi.spyOn(storage, 'getToken').mockResolvedValue('token-active');
    vi.spyOn(authApi, 'getMe').mockResolvedValue(mockProfile);

    const context = await harness.render();
    expect(context.token).toBe('token-active');

    // Event with undefined token
    notifyAuthFailure({
      reason: 'unauthorized',
      statusCode: 401,
      message: 'Anonymous failure',
      token: undefined,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const currentContext = harness.getContext();

    expect(removeTokenSpy).not.toHaveBeenCalled();
    expect(currentContext.token).toBe('token-active');
  });

  it('matching associated token successfully invalidates session and clears storage', async () => {
    const removeTokenSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();
    const removeProfileSpy = vi.spyOn(storage, 'removeUserProfile').mockResolvedValue();
    vi.spyOn(storage, 'getToken').mockResolvedValue('token-active');
    vi.spyOn(authApi, 'getMe').mockResolvedValue(mockProfile);

    const context = await harness.render();
    expect(context.token).toBe('token-active');

    notifyAuthFailure({
      reason: 'unauthorized',
      statusCode: 401,
      message: 'Session expired. Please log in again.',
      token: 'token-active',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const currentContext = harness.getContext();

    expect(removeTokenSpy).toHaveBeenCalled();
    expect(removeProfileSpy).toHaveBeenCalled();
    expect(currentContext.token).toBeNull();
    expect(currentContext.user).toBeNull();
    expect(currentContext.sessionValidationState).toBe('invalid');
  });

  it('multiple concurrent 401s execute single-flight logout without redundant storage writes', async () => {
    const removeTokenSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();
    vi.spyOn(storage, 'getToken').mockResolvedValue('token-concurrent');
    vi.spyOn(authApi, 'getMe').mockResolvedValue(mockProfile);

    await harness.render();

    // Dispatch three simultaneous 401s with the same token
    notifyAuthFailure({ reason: 'unauthorized', statusCode: 401, message: 'Expired', token: 'token-concurrent' });
    notifyAuthFailure({ reason: 'unauthorized', statusCode: 401, message: 'Expired', token: 'token-concurrent' });
    notifyAuthFailure({ reason: 'unauthorized', statusCode: 401, message: 'Expired', token: 'token-concurrent' });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Single-flight guard serializes execution so storage removal runs only once
    expect(removeTokenSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectivityBanner Rendering Rules', () => {
  function renderBannerWithAuth(authValue: Partial<AuthContextType>) {
    const fullAuth: AuthContextType = {
      user: mockProfile,
      token: 'mock-token',
      isLoading: false,
      isInitializing: false,
      error: null,
      backendReachability: 'reachable',
      sessionValidationState: 'validated',
      isUsingCachedProfile: false,
      revalidateSession: vi.fn().mockResolvedValue(undefined),
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

    internals.H = {
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
        return fn;
      },
      useEffect() {},
      useContext() {
        return fullAuth;
      },
    };

    try {
      return ConnectivityBanner({});
    } finally {
      internals.H = originalDispatcher;
    }
  }

  it('renders null when backend is reachable and session is validated', () => {
    const element = renderBannerWithAuth({
      backendReachability: 'reachable',
      sessionValidationState: 'validated',
      isUsingCachedProfile: false,
    });
    expect(element).toBeNull();
  });

  it('renders offline alert when backend is unreachable', () => {
    const element = renderBannerWithAuth({
      backendReachability: 'unreachable',
      sessionValidationState: 'unvalidated',
      isUsingCachedProfile: true,
    }) as React.ReactElement<any>;

    expect(element).not.toBeNull();
    expect(element.props.testID).toBe('connectivity-banner');
  });

  it('renders degraded server alert when backend returns 503 with cached profile', () => {
    const element = renderBannerWithAuth({
      backendReachability: 'reachable',
      sessionValidationState: 'unvalidated',
      isUsingCachedProfile: true,
    }) as React.ReactElement<any>;

    expect(element).not.toBeNull();
    expect(element.props.testID).toBe('connectivity-banner');
  });
});
