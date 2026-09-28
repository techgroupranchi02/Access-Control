/**
 * Auth Context
 * Manages authentication state, user session, and profile refresh.
 * Authenticates via the Freecomers production API.
 */

import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch {
      localStorage.removeItem('authToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

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

  const switchPersona = useCallback(async () => {
    // Persona switching removed — use proper role assignment instead.
    console.warn('switchPersona is deprecated. Use the admin panel to assign roles.');
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password });
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    setUser(null);
    localStorage.removeItem('authToken');
    window.location.href = '/login';
  }, []);

  const refreshProfile = useCallback(async (festivalId) => {
    try {
      const res = await api.get('/auth/me', {
        headers: festivalId ? { 'X-Festival-Id': festivalId, 'X-Edition-Id': festivalId } : {},
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
    switchPersona,
    refreshProfile,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
