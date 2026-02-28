
import React, { createContext, useState, useContext, ReactNode } from 'react';
import type { User } from '../types';

type AuthState = {
  token: string | null;
  user: User | null;
};

type AuthContextType = {
  authState: AuthState;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock a logged-in admin user for preview purposes
const MOCK_ADMIN_USER: User = {
    uid: 'mock-admin-user-123',
    email: 'admin@preview.dev',
    isAdmin: true,
};

const MOCK_AUTH_STATE: AuthState = {
    token: 'mock-auth-token',
    user: MOCK_ADMIN_USER,
};


export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // The auth state is now hardcoded for the preview environment.
  const [authState] = useState<AuthState>(MOCK_AUTH_STATE);

  // These functions no longer need to do anything in a mocked environment.
  const login = () => {};
  const logout = () => {
    // A simple page reload is enough to reset the state in the preview.
    window.location.reload();
  };

  const isAuthenticated = (): boolean => {
    // Always return true to bypass the login screen.
    return !!authState.token;
  };

  return (
    <AuthContext.Provider value={{ authState, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
