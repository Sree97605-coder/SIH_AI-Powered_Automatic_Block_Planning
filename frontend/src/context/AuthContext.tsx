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

function clearLegacyRoleState(): void {
  sessionStorage.removeItem('role');
  sessionStorage.removeItem('department');
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
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (username: string, password: string) => {
    const response = await api.login(username, password);
    // Token stays in memory only: refreshes end the session, avoiding persistent XSS exposure.
    setAccessToken(response.access_token);
    setUser(response.user);
  };

  const logout = () => {
    setAccessToken(null);
    setUser(null);
    clearLegacyRoleState();
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: Boolean(getAccessToken() && user), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}