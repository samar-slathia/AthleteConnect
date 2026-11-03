import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import {
  UserProfile,
  CustomerRole,
  register as apiRegister,
  login as apiLogin,
  getMe as apiGetMe,
  probeBackendHealth,
  AuthApiError,
} from '../services/authApi';
import {
  saveToken,
  getToken,
  removeToken,
  saveUserProfile,
  getUserProfile,
  removeUserProfile,
} from '../utils/storage';
import { onAuthFailure } from '../services/authEvents';

export type { UserProfile, CustomerRole };

export type BackendReachability = 'reachable' | 'unreachable' | 'checking';
export type SessionValidationState = 'validated' | 'unvalidated' | 'invalid';

export interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;
  backendReachability?: BackendReachability;
  sessionValidationState?: SessionValidationState;
  isUsingCachedProfile?: boolean;
  revalidateSession?: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: CustomerRole) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [backendReachability, setBackendReachability] = useState<BackendReachability>('checking');
  const [sessionValidationState, setSessionValidationState] = useState<SessionValidationState>('unvalidated');
  const [isUsingCachedProfile, setIsUsingCachedProfile] = useState<boolean>(false);

  // Guards against concurrent authentication requests and unmounted state updates
  const isSubmittingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const tokenRef = useRef<string | null>(null);
  const sessionValidationStateRef = useRef<SessionValidationState>('unvalidated');
  const backendReachabilityRef = useRef<BackendReachability>('checking');
  const appStateRef = useRef<string>(AppState.currentState || 'active');
  const isProbingRef = useRef<boolean>(false);
  const isLoggingOutRef = useRef<boolean>(false);
  const lastRevalidationTimeRef = useRef<number>(0);
  const probeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    sessionValidationStateRef.current = sessionValidationState;
  }, [sessionValidationState]);

  useEffect(() => {
    backendReachabilityRef.current = backendReachability;
  }, [backendReachability]);

  // Centralized authentication failure handler (GAP-3: Stale-token safe, single-flight)
  useEffect(() => {
    const unsubscribe = onAuthFailure(async (event) => {
      if (!isMountedRef.current) return;

      // Stale-token protection: Ignore failure if it belongs to a superseded token
      if (event.token && tokenRef.current && event.token !== tokenRef.current) {
        return;
      }

      // Do not allow an event with missing token to invalidate an unrelated active session
      if (!event.token && tokenRef.current) {
        return;
      }

      // Single-flight logout serialization to prevent parallel 401 races
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;

      try {
        await removeToken();
        await removeUserProfile();
      } catch {
        // Ignore storage removal errors
      }

      if (isMountedRef.current) {
        setUser(null);
        setToken(null);
        tokenRef.current = null;
        setSessionValidationState('invalid');
        setIsUsingCachedProfile(false);
        setError(event.message);
      }

      isLoggingOutRef.current = false;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const revalidateSession = useCallback(async (): Promise<void> => {
    const currentToken = tokenRef.current || (await getToken());
    if (!currentToken) {
      if (isMountedRef.current) {
        setBackendReachability('reachable');
        setSessionValidationState('unvalidated');
        setIsUsingCachedProfile(false);
      }
      return;
    }

    if (isMountedRef.current) {
      setBackendReachability('checking');
    }

    try {
      const profile = await apiGetMe(currentToken);
      try {
        await saveUserProfile(profile);
      } catch {
        // Non-fatal if snapshot save fails
      }

      if (isMountedRef.current) {
        setUser(profile);
        setToken(currentToken);
        tokenRef.current = currentToken;
        setBackendReachability('reachable');
        setSessionValidationState('validated');
        setIsUsingCachedProfile(false);
        setError(null);
      }
    } catch (apiErr) {
      if (!isMountedRef.current) return;

      if (apiErr instanceof AuthApiError) {
        if (
          apiErr.statusCode === 401 ||
          (apiErr.statusCode === 403 && apiErr.message.toLowerCase().includes('deactivated'))
        ) {
          try {
            await removeToken();
            await removeUserProfile();
          } catch {
            // Ignore storage errors
          }
          if (isMountedRef.current) {
            setUser(null);
            setToken(null);
            tokenRef.current = null;
            setBackendReachability('reachable');
            setSessionValidationState('invalid');
            setIsUsingCachedProfile(false);
            setError(
              apiErr.statusCode === 403
                ? 'Your account has been deactivated. Please contact support.'
                : 'Session expired. Please log in again.'
            );
          }
        } else if (apiErr.statusCode === 0) {
          // Transport offline
          if (isMountedRef.current) {
            setBackendReachability('unreachable');
            setSessionValidationState('unvalidated');
            setIsUsingCachedProfile(true);
          }
        } else {
          // Server 5xx: Backend is reachable, but validation failed
          if (isMountedRef.current) {
            setBackendReachability('reachable');
            setSessionValidationState('unvalidated');
            setIsUsingCachedProfile(true);
          }
        }
      } else {
        if (isMountedRef.current) {
          setBackendReachability('unreachable');
          setSessionValidationState('unvalidated');
          setIsUsingCachedProfile(true);
        }
      }
    }
  }, []);

  // GAP-1: Foreground health probe and dynamic scheduler
  const scheduleHealthProbe = useCallback(() => {
    if (probeTimerRef.current) {
      clearTimeout(probeTimerRef.current);
      probeTimerRef.current = null;
    }

    if (!isMountedRef.current || appStateRef.current !== 'active') {
      return;
    }

    // 15 seconds if offline or session unvalidated; 60 seconds if online and validated
    const delayMs =
      backendReachabilityRef.current === 'unreachable' ||
      sessionValidationStateRef.current !== 'validated'
        ? 15000
        : 60000;

    probeTimerRef.current = setTimeout(async () => {
      if (!isMountedRef.current || appStateRef.current !== 'active') return;
      await runHealthProbe();
    }, delayMs);
  }, []);

  const runHealthProbe = useCallback(async (): Promise<void> => {
    if (isProbingRef.current || !isMountedRef.current || appStateRef.current !== 'active') {
      return;
    }

    isProbingRef.current = true;
    try {
      const health = await probeBackendHealth();
      if (!isMountedRef.current || appStateRef.current !== 'active') return;

      if (health.reachable) {
        if (backendReachabilityRef.current !== 'reachable') {
          setBackendReachability('reachable');
        }
        // Automatic recovery: If returning online with an unvalidated session, revalidate live
        if (tokenRef.current && sessionValidationStateRef.current !== 'validated') {
          await revalidateSession();
        }
      } else {
        if (backendReachabilityRef.current !== 'unreachable') {
          setBackendReachability('unreachable');
        }
      }
    } finally {
      isProbingRef.current = false;
      scheduleHealthProbe();
    }
  }, [revalidateSession, scheduleHealthProbe]);

  // Start health probe scheduler and clean up on unmount
  useEffect(() => {
    scheduleHealthProbe();
    return () => {
      if (probeTimerRef.current) {
        clearTimeout(probeTimerRef.current);
        probeTimerRef.current = null;
      }
    };
  }, [backendReachability, sessionValidationState, scheduleHealthProbe]);

  // AppState listener: immediate probe on foreground; suspend timers on background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appStateRef.current = nextAppState;
      if (nextAppState === 'active') {
        const now = Date.now();
        if (now - lastRevalidationTimeRef.current > 15000) {
          lastRevalidationTimeRef.current = now;
          runHealthProbe();
        } else {
          scheduleHealthProbe();
        }
      } else {
        // Suspend background timers to protect device battery
        if (probeTimerRef.current) {
          clearTimeout(probeTimerRef.current);
          probeTimerRef.current = null;
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [runHealthProbe, scheduleHealthProbe]);

  useEffect(() => {
    isMountedRef.current = true;

    async function restoreSession() {
      try {
        const storedToken = await getToken();
        if (!storedToken) {
          if (isMountedRef.current) {
            setUser(null);
            setToken(null);
            tokenRef.current = null;
            setBackendReachability('reachable');
            setSessionValidationState('unvalidated');
            setIsUsingCachedProfile(false);
            setIsLoading(false);
            setIsInitializing(false);
          }
          return;
        }

        tokenRef.current = storedToken;

        // Try reading cached profile snapshot first for instant dashboard rendering
        let cachedProfile: UserProfile | null = null;
        try {
          cachedProfile = await getUserProfile();
        } catch {
          // Ignore read error
        }

        if (cachedProfile && isMountedRef.current) {
          setUser(cachedProfile);
          setToken(storedToken);
          setIsUsingCachedProfile(true);
        }

        // Live backend validation
        try {
          const profile = await apiGetMe(storedToken);
          try {
            await saveUserProfile(profile);
          } catch {
            // Non-fatal if secure profile snapshot write fails
          }
          if (isMountedRef.current) {
            setUser(profile);
            setToken(storedToken);
            setBackendReachability('reachable');
            setSessionValidationState('validated');
            setIsUsingCachedProfile(false);
            setError(null);
          }
        } catch (apiErr) {
          if (apiErr instanceof AuthApiError) {
            // Status 401 (invalid/expired) or 403 (account deactivated)
            if (
              apiErr.statusCode === 401 ||
              (apiErr.statusCode === 403 && apiErr.message.toLowerCase().includes('deactivated'))
            ) {
              try {
                await removeToken();
                await removeUserProfile();
              } catch {
                // Fail silently on storage removal
              }
              if (isMountedRef.current) {
                setUser(null);
                setToken(null);
                tokenRef.current = null;
                setBackendReachability('reachable');
                setSessionValidationState('invalid');
                setIsUsingCachedProfile(false);
                setError(
                  apiErr.statusCode === 403
                    ? 'Your account has been deactivated. Please contact support.'
                    : 'Session expired. Please log in again.'
                );
              }
            } else if (apiErr.statusCode === 0) {
              // Network transport disconnect (status 0):
              // Do NOT delete the stored token so user can authenticate once connectivity returns.
              if (isMountedRef.current) {
                if (cachedProfile) {
                  setUser(cachedProfile);
                  setToken(storedToken);
                  setBackendReachability('unreachable');
                  setSessionValidationState('unvalidated');
                  setIsUsingCachedProfile(true);
                  setError('Offline mode: Using cached session. Check network connection.');
                } else {
                  setUser(null);
                  setToken(null);
                  tokenRef.current = null;
                  setBackendReachability('unreachable');
                  setSessionValidationState('unvalidated');
                  setIsUsingCachedProfile(false);
                  setError(apiErr.message || 'Unable to connect to server. Please check your connection.');
                }
              }
            } else {
              // HTTP 5xx: Backend is reachable, but validation failed
              if (isMountedRef.current) {
                if (cachedProfile) {
                  setUser(cachedProfile);
                  setToken(storedToken);
                  setBackendReachability('reachable');
                  setSessionValidationState('unvalidated');
                  setIsUsingCachedProfile(true);
                  setError('Server temporarily unavailable. Using cached session.');
                } else {
                  setUser(null);
                  setToken(null);
                  tokenRef.current = null;
                  setBackendReachability('reachable');
                  setSessionValidationState('unvalidated');
                  setIsUsingCachedProfile(false);
                  setError(apiErr.message || 'Server error. Please try again later.');
                }
              }
            }
          } else {
            // Unexpected error during validation
            if (isMountedRef.current) {
              setUser(null);
              setToken(null);
              tokenRef.current = null;
              setBackendReachability('unreachable');
              setSessionValidationState('unvalidated');
              setIsUsingCachedProfile(false);
              setError('Unable to restore session.');
            }
          }
        }
      } catch {
        if (isMountedRef.current) {
          setUser(null);
          setToken(null);
          tokenRef.current = null;
          setBackendReachability('reachable');
          setSessionValidationState('unvalidated');
          setIsUsingCachedProfile(false);
          setError('Failed to read stored authentication data.');
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsInitializing(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMountedRef.current = false;
      if (probeTimerRef.current) {
        clearTimeout(probeTimerRef.current);
        probeTimerRef.current = null;
      }
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    if (isSubmittingRef.current) {
      throw new Error('An authentication request is already in progress.');
    }

    isSubmittingRef.current = true;
    isLoggingOutRef.current = false;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiLogin({ email, password });

      // Persist the token and profile snapshot to encrypted storage
      try {
        await saveToken(response.token);
        try {
          await saveUserProfile(response.user);
        } catch {
          // Non-fatal if cached profile write fails
        }
      } catch {
        // Storage failure: Do not silently switch to insecure storage and do not claim sign-in
        const storageErrMsg = 'Secure storage error: Unable to safely save session on this device.';
        if (isMountedRef.current) {
          setUser(null);
          setToken(null);
          tokenRef.current = null;
          setError(storageErrMsg);
        }
        throw new Error(storageErrMsg);
      }

      // Update state only after backend confirmation and secure persistence succeed
      if (isMountedRef.current) {
        setToken(response.token);
        tokenRef.current = response.token;
        setUser(response.user);
        setBackendReachability('reachable');
        setSessionValidationState('validated');
        setIsUsingCachedProfile(false);
        setError(null);
      }
    } catch (err) {
      const userMessage = err instanceof Error ? err.message : 'Login failed. Please try again.';
      if (isMountedRef.current) {
        setError(userMessage);
      }
      throw err;
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string, role: CustomerRole): Promise<void> => {
      if (isSubmittingRef.current) {
        throw new Error('An authentication request is already in progress.');
      }

      isSubmittingRef.current = true;
      isLoggingOutRef.current = false;
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiRegister({ name, email, password, role });

        // Persist the token and profile snapshot to encrypted storage
        try {
          await saveToken(response.token);
          try {
            await saveUserProfile(response.user);
          } catch {
            // Non-fatal if cached profile write fails
          }
        } catch {
          // Storage failure: Do not switch to insecure storage and do not claim sign-in
          const storageErrMsg = 'Secure storage error: Unable to safely save session on this device.';
          if (isMountedRef.current) {
            setUser(null);
            setToken(null);
            tokenRef.current = null;
            setError(storageErrMsg);
          }
          throw new Error(storageErrMsg);
        }

        // Update state only after backend confirmation and secure persistence succeed
        if (isMountedRef.current) {
          setToken(response.token);
          tokenRef.current = response.token;
          setUser(response.user);
          setBackendReachability('reachable');
          setSessionValidationState('validated');
          setIsUsingCachedProfile(false);
          setError(null);
        }
      } catch (err) {
        const userMessage = err instanceof Error ? err.message : 'Registration failed. Please try again.';
        if (isMountedRef.current) {
          setError(userMessage);
        }
        throw err;
      } finally {
        isSubmittingRef.current = false;
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    isLoggingOutRef.current = true;
    try {
      await removeToken();
      await removeUserProfile();
    } catch {
      // Even if removal fails, clear memory state completely
    } finally {
      if (isMountedRef.current) {
        setToken(null);
        tokenRef.current = null;
        setUser(null);
        setSessionValidationState('unvalidated');
        setIsUsingCachedProfile(false);
        setError(null);
        setIsLoading(false);
      }
      isLoggingOutRef.current = false;
    }
  }, []);

  const contextValue: AuthContextType = {
    user,
    token,
    isLoading,
    isInitializing,
    error,
    backendReachability,
    sessionValidationState,
    isUsingCachedProfile,
    revalidateSession,
    login,
    register,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
