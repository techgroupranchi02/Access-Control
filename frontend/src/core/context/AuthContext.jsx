/**
 * Auth Context
 * Manages authentication state: user, login, logout, register.
 * Session managed via HttpOnly cookies (set by backend).
 */

import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Check if user is already authenticated on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.token) {
      localStorage.setItem('authToken', res.data.token);
    }
    setUser(res.data.user);
    return res.data;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password });
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Continue logout even if API fails
    }
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentFestivalId');
    window.location.href = '/login';
  }, []);

  const refreshProfile = useCallback(async (festivalId) => {
    try {
      const res = await api.get('/auth/me', {
        headers: festivalId ? { 'X-Festival-Id': festivalId } : {},
      });
      setUser(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, []);

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    refreshProfile,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
