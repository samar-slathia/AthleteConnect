import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  UserProfile,
  CustomerRole,
  register as apiRegister,
  login as apiLogin,
  getMe as apiGetMe,
  AuthApiError,
} from '../services/authApi';
import { saveToken, getToken, removeToken } from '../utils/storage';

export type { UserProfile, CustomerRole };

export interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;
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

  // Guards against concurrent authentication requests and unmounted state updates
  const isSubmittingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;

    async function restoreSession() {
      try {
        const storedToken = await getToken();
        if (!storedToken) {
          if (isMountedRef.current) {
            setUser(null);
            setToken(null);
            setIsLoading(false);
            setIsInitializing(false);
          }
          return;
        }

        // Validate session with the backend
        try {
          const profile = await apiGetMe(storedToken);
          if (isMountedRef.current) {
            setUser(profile);
            setToken(storedToken);
            setError(null);
          }
        } catch (apiErr) {
          if (apiErr instanceof AuthApiError) {
            // Status 401 (invalid/expired) or 403 (account deactivated)
            if (apiErr.statusCode === 401 || apiErr.statusCode === 403) {
              try {
                await removeToken();
              } catch {
                // Fail silently on storage removal
              }
              if (isMountedRef.current) {
                setUser(null);
                setToken(null);
                setError(null);
              }
            } else {
              // Network disconnect (status 0) or server issue (5xx):
              // Do NOT delete the stored token so user can authenticate once connectivity returns
              if (isMountedRef.current) {
                setUser(null);
                setToken(null);
                setError(apiErr.message || 'Unable to connect to server. Please check your connection.');
              }
            }
          } else {
            // Unexpected error during validation
            if (isMountedRef.current) {
              setUser(null);
              setToken(null);
              setError('Unable to restore session.');
            }
          }
        }
      } catch {
        if (isMountedRef.current) {
          setUser(null);
          setToken(null);
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
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiLogin({ email, password });

      // Persist the token to encrypted storage
      try {
        await saveToken(response.token);
      } catch {
        // Storage failure: Do not silently switch to insecure storage and do not claim sign-in
        const storageErrMsg = 'Secure storage error: Unable to safely save session on this device.';
        if (isMountedRef.current) {
          setUser(null);
          setToken(null);
          setError(storageErrMsg);
        }
        throw new Error(storageErrMsg);
      }

      // Update state only after backend confirmation and secure persistence succeed
      if (isMountedRef.current) {
        setToken(response.token);
        setUser(response.user);
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
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiRegister({ name, email, password, role });

        // Persist the token to encrypted storage
        try {
          await saveToken(response.token);
        } catch {
          // Storage failure: Do not switch to insecure storage and do not claim sign-in
          const storageErrMsg = 'Secure storage error: Unable to safely save session on this device.';
          if (isMountedRef.current) {
            setUser(null);
            setToken(null);
            setError(storageErrMsg);
          }
          throw new Error(storageErrMsg);
        }

        // Update state only after backend confirmation and secure persistence succeed
        if (isMountedRef.current) {
          setToken(response.token);
          setUser(response.user);
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
    try {
      await removeToken();
    } catch {
      // Even if removal fails, clear memory state completely
    } finally {
      if (isMountedRef.current) {
        setToken(null);
        setUser(null);
        setError(null);
        setIsLoading(false);
      }
    }
  }, []);

  const contextValue: AuthContextType = {
    user,
    token,
    isLoading,
    isInitializing,
    error,
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
