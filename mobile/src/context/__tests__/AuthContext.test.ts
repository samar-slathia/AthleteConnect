import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { AuthProvider, AuthContextType } from '../AuthContext';
import * as authApi from '../../services/authApi';
import * as storage from '../../utils/storage';
import { AuthApiError, UserProfile } from '../../services/authApi';

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
    // Run any queued effects
    while (effects.length > 0) {
      const effect = effects.shift()!;
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        cleanups.push(cleanup);
      }
    }
    // Allow any pending microtasks in promises to run
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Re-render to read updated states after async effects run
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

describe('AuthContext', () => {
  let harness: ReturnType<typeof createHookHarness>;

  const mockUser: UserProfile = {
    _id: 'usr_123',
    name: 'Sarah Connor',
    email: 'sarah@example.com',
    role: 'parent',
    isActive: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    harness = createHookHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('initializes with no saved token and resolves isLoading to false', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue(null);
    vi.spyOn(authApi, 'getMe');

    const auth = await harness.render();

    expect(storage.getToken).toHaveBeenCalledTimes(1);
    expect(authApi.getMe).not.toHaveBeenCalled();
    expect(auth.user).toBeNull();
    expect(auth.token).toBeNull();
    expect(auth.isLoading).toBe(false);
    expect(auth.error).toBeNull();
  });

  it('restores user session when valid saved token exists and backend confirms profile', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue('valid_jwt_token');
    vi.spyOn(authApi, 'getMe').mockResolvedValue(mockUser);

    const auth = await harness.render();

    expect(storage.getToken).toHaveBeenCalledTimes(1);
    expect(authApi.getMe).toHaveBeenCalledWith('valid_jwt_token');
    expect(auth.user).toEqual(mockUser);
    expect(auth.token).toBe('valid_jwt_token');
    expect(auth.isLoading).toBe(false);
    expect(auth.error).toBeNull();
  });

  it('removes token when backend confirms session is expired or invalid (HTTP 401)', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue('expired_jwt_token');
    vi.spyOn(authApi, 'getMe').mockRejectedValue(new AuthApiError('Invalid or expired token.', 401));
    const removeSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();

    const auth = await harness.render();

    expect(authApi.getMe).toHaveBeenCalledWith('expired_jwt_token');
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(auth.user).toBeNull();
    expect(auth.token).toBeNull();
    expect(auth.isLoading).toBe(false);
  });

  it('removes token when account is deactivated (HTTP 403)', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue('deactivated_jwt_token');
    vi.spyOn(authApi, 'getMe').mockRejectedValue(new AuthApiError('Account is deactivated.', 403));
    const removeSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();

    const auth = await harness.render();

    expect(authApi.getMe).toHaveBeenCalledWith('deactivated_jwt_token');
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(auth.user).toBeNull();
    expect(auth.token).toBeNull();
    expect(auth.isLoading).toBe(false);
  });

  it('does NOT delete saved token when restoration fails solely due to temporary network disconnect', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue('persisted_token');
    vi.spyOn(authApi, 'getMe').mockRejectedValue(
      new AuthApiError('Unable to connect to AthleteConnect servers.', 0)
    );
    const removeSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();

    const auth = await harness.render();

    expect(authApi.getMe).toHaveBeenCalledWith('persisted_token');
    // Token must NOT be deleted when server is unreachable
    expect(removeSpy).not.toHaveBeenCalled();
    expect(auth.user).toBeNull();
    expect(auth.token).toBeNull();
    expect(auth.isLoading).toBe(false);
    expect(auth.error).toContain('Unable to connect to AthleteConnect servers');
  });

  it('successfully logs in, securely saves token, and updates user state', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue(null);
    const saveSpy = vi.spyOn(storage, 'saveToken').mockResolvedValue();
    vi.spyOn(authApi, 'login').mockResolvedValue({
      token: 'new_login_token',
      user: mockUser,
    });

    await harness.render();
    const auth = harness.getContext();

    await auth.login('sarah@example.com', 'SecurePassword123!');

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'sarah@example.com',
      password: 'SecurePassword123!',
    });
    expect(saveSpy).toHaveBeenCalledWith('new_login_token');

    const updated = harness.getContext();
    expect(updated.user).toEqual(mockUser);
    expect(updated.token).toBe('new_login_token');
    expect(updated.error).toBeNull();
  });

  it('successfully registers, securely saves token, and updates user state', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue(null);
    const saveSpy = vi.spyOn(storage, 'saveToken').mockResolvedValue();
    const coachUser: UserProfile = { ...mockUser, role: 'coach', name: 'Sensei John' };
    vi.spyOn(authApi, 'register').mockResolvedValue({
      token: 'new_register_token',
      user: coachUser,
    });

    await harness.render();
    const auth = harness.getContext();

    await auth.register('Sensei John', 'john@example.com', 'StrongPass123!', 'coach');

    expect(authApi.register).toHaveBeenCalledWith({
      name: 'Sensei John',
      email: 'john@example.com',
      password: 'StrongPass123!',
      role: 'coach',
    });
    expect(saveSpy).toHaveBeenCalledWith('new_register_token');

    const updated = harness.getContext();
    expect(updated.user).toEqual(coachUser);
    expect(updated.token).toBe('new_register_token');
    expect(updated.error).toBeNull();
  });

  it('fails safely without claiming sign-in when secure storage fails after registration', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue(null);
    vi.spyOn(storage, 'saveToken').mockRejectedValue(new Error('SecureStore hardware error'));
    vi.spyOn(authApi, 'register').mockResolvedValue({
      token: 'jwt_from_server',
      user: mockUser,
    });

    await harness.render();
    const auth = harness.getContext();

    await expect(
      auth.register('Sarah Connor', 'sarah@example.com', 'StrongPass123!', 'parent')
    ).rejects.toThrow(/Secure storage error/);

    const updated = harness.getContext();
    // User must NOT be claimed as signed in if storage failed
    expect(updated.user).toBeNull();
    expect(updated.token).toBeNull();
    expect(updated.error).toContain('Secure storage error');
  });

  it('fails safely without claiming sign-in when secure storage fails after login', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue(null);
    vi.spyOn(storage, 'saveToken').mockRejectedValue(new Error('SecureStore failure'));
    vi.spyOn(authApi, 'login').mockResolvedValue({
      token: 'jwt_from_server',
      user: mockUser,
    });

    await harness.render();
    const auth = harness.getContext();

    await expect(auth.login('sarah@example.com', 'Pass12345!')).rejects.toThrow(
      /Secure storage error/
    );

    const updated = harness.getContext();
    expect(updated.user).toBeNull();
    expect(updated.token).toBeNull();
    expect(updated.error).toContain('Secure storage error');
  });

  it('prevents concurrent in-flight authentication submissions', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue(null);
    vi.spyOn(storage, 'saveToken').mockResolvedValue();
    vi.spyOn(authApi, 'login').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ token: 'tok', user: mockUser }), 50))
    );

    await harness.render();
    const auth = harness.getContext();

    const call1 = auth.login('sarah@example.com', 'Pass12345!');
    // Second concurrent call immediately while first is in-flight
    await expect(auth.login('sarah@example.com', 'Pass12345!')).rejects.toThrow(
      'An authentication request is already in progress.'
    );

    await call1;
  });

  it('logout removes saved token and wipes in-memory auth state', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue('active_token');
    vi.spyOn(authApi, 'getMe').mockResolvedValue(mockUser);
    const removeSpy = vi.spyOn(storage, 'removeToken').mockResolvedValue();

    await harness.render();
    const auth = harness.getContext();
    expect(auth.user).toEqual(mockUser);

    await auth.logout();

    expect(removeSpy).toHaveBeenCalledTimes(1);
    const afterLogout = harness.getContext();
    expect(afterLogout.user).toBeNull();
    expect(afterLogout.token).toBeNull();
    expect(afterLogout.error).toBeNull();
  });

  it('clears stale error messages via clearError', async () => {
    vi.spyOn(storage, 'getToken').mockResolvedValue(null);
    vi.spyOn(authApi, 'login').mockRejectedValue(new AuthApiError('Invalid credentials', 401));

    await harness.render();
    const auth = harness.getContext();

    try {
      await auth.login('bad@example.com', 'wrong');
    } catch {
      // Expected
    }

    expect(harness.getContext().error).toBe('Invalid credentials');

    harness.getContext().clearError();
    expect(harness.getContext().error).toBeNull();
  });
});
