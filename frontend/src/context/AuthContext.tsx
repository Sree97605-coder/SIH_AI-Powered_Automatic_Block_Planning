import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, AuthUser } from '../api/client';
import { getAccessToken, setAccessToken, setUnauthorizedHandler } from '../auth/authStore';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function clearLegacyRoleState(): void {
  sessionStorage.removeItem('role');
  sessionStorage.removeItem('department');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('token');
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    clearLegacyRoleState();
    setUnauthorizedHandler(() => {
      setAccessToken(null);
      setUser(null);
      clearLegacyRoleState();
    });

    const restoreSession = async () => {
      try {
        const restoredUser = await api.getCurrentUser();
        setUser(restoredUser);
      } catch {
        setUser(null);
        setAccessToken(null);
      }
    };

    void restoreSession();
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (username: string, password: string) => {
    const response = await api.login(username, password);
    setUser(response.user);
  };

  const logout = async () => {
    clearLegacyRoleState();
    setAccessToken(null);
    setUser(null);
    try {
      await api.logout();
    } catch {
      // Ignore backend logout failures here so the app still ends the session instantly.
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}