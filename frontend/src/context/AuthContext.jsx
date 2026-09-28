import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('omnibrain_token'));
  const [user, setUser] = useState(() => {
    const cached = localStorage.getItem('omnibrain_user');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      if (token) {
        try {
          const profile = await authApi.getMe();
          setUser(profile);
          localStorage.setItem('omnibrain_user', JSON.stringify(profile));
        } catch (err) {
          console.warn('Session verification failed, resetting token:', err);
          logout();
        }
      }
      setLoading(false);
    };

    verifySession();
  }, [token]);

  const login = async (username, password) => {
    const data = await authApi.login({ username, password });
    const receivedToken = data.access_token;
    const userData = data.user || { username, role: 'user' };

    setToken(receivedToken);
    setUser(userData);
    localStorage.setItem('omnibrain_token', receivedToken);
    localStorage.setItem('omnibrain_user', JSON.stringify(userData));
    return data;
  };

  const register = async (username, password, email, role = 'user') => {
    const data = await authApi.register({ username, password, email, role });
    // After registration, auto-login
    return await login(username, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('omnibrain_token');
    localStorage.removeItem('omnibrain_user');
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        isAuthenticated: !!token,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
