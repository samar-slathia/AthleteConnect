import React, { useState, useEffect, useCallback } from 'react';
import type { AdminUser } from '../services/api';
import {
  adminLogin as apiAdminLogin,
  fetchAdminMe,
  getStoredToken,
  getStoredUser,
  clearStoredSession,
  setUnauthorizedHandler,
} from '../services/api';
import { AuthContext } from './authContextDef';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(getStoredUser);
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(() => {
    clearStoredSession();
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    setError(null);
  }, []);

  // Register automatic logout callback on 401 responses
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  // Verify stored session on app load
  useEffect(() => {
    let isMounted = true;

    async function verifyExistingSession() {
      const storedToken = getStoredToken();
      if (!storedToken) {
        if (isMounted) {
          setIsLoading(false);
          setIsAuthenticated(false);
        }
        return;
      }

      try {
        const response = await fetchAdminMe();
        if (isMounted) {
          if (response.user && response.user.role === 'admin') {
            setUser(response.user);
            setToken(storedToken);
            setIsAuthenticated(true);
          } else {
            logout();
          }
        }
      } catch {
        if (isMounted) {
          // Token expired or server rejected admin role
          logout();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    verifyExistingSession();

    return () => {
      isMounted = false;
    };
  }, [logout]);

  const login = async (email: string, password: string): Promise<void> => {
    setError(null);
    try {
      const response = await apiAdminLogin(email, password);
      setUser(response.user);
      setToken(response.token);
      setIsAuthenticated(true);
    } catch (err: any) {
      const message = err.message || 'Authentication failed. Please verify your credentials.';
      setError(message);
      throw err;
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        error,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
