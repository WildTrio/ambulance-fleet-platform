import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load user info or attempt silent refresh on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const response = await api.get('/auth/me/');
          setUser(response.data);
        } catch (error) {
          setUser(null);
        }
      } else {
        try {
          const refreshResponse = await api.post('/auth/refresh/');
          const { access } = refreshResponse.data;
          localStorage.setItem('access_token', access);
          
          const userResponse = await api.get('/auth/me/');
          setUser(userResponse.data);
        } catch (error) {
          setUser(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();

    // Listen to global session expiration events
    const handleSessionExpired = () => {
      localStorage.removeItem('access_token');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
    };

    window.addEventListener('auth_session_expired', handleSessionExpired);
    return () => {
      window.removeEventListener('auth_session_expired', handleSessionExpired);
    };
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login/', { email, password });
      const { access, user: userData } = response.data;
      localStorage.setItem('access_token', access);
      setUser(userData);
      return userData;
    } catch (error) {
      throw error.response?.data || { detail: 'An error occurred during login.' };
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout/');
    } catch (error) {
      // Proceed with local logout even if api call fails
    } finally {
      localStorage.removeItem('access_token');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
    }
  };

  const changePassword = async (oldPassword, newPassword) => {
    try {
      await api.post('/auth/change-password/', {
        old_password: oldPassword,
        new_password: newPassword,
      });
    } catch (error) {
      throw error.response?.data || { detail: 'An error occurred during password change.' };
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
