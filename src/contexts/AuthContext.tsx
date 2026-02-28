import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import type { User } from '../types';

type AuthState = {
  token: string | null;
  user: User | null;
};

type AuthContextType = {
  authState: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: () => boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ token: null, user: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const token = localStorage.getItem('afm_auth_token');
      const userString = localStorage.getItem('afm_auth_user');
      if (token && userString) {
        setAuthState({ token, user: JSON.parse(userString) });
      }
    } catch (error) {
        console.error("Failed to parse auth data from localStorage", error);
        localStorage.removeItem('afm_auth_token');
        localStorage.removeItem('afm_auth_user');
    }
    setIsLoading(false);
  }, []);

  const login = (email: string, password: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Mocked login logic with a small delay
      setTimeout(() => {
        if ((email.toLowerCase() === 'admin@preview.dev' || email.toLowerCase() === 'user@preview.dev') && password === 'password') {
          const isAdmin = email.toLowerCase() === 'admin@preview.dev';
          const user: User = {
            uid: isAdmin ? 'mock-admin-user-123' : 'mock-user-456',
            email: email.toLowerCase(),
            isAdmin: isAdmin,
          };
          const token = 'mock-auth-token-for-' + user.uid;
          
          localStorage.setItem('afm_auth_token', token);
          localStorage.setItem('afm_auth_user', JSON.stringify(user));
          setAuthState({ token, user });
          resolve();
        } else {
          reject(new Error('Invalid email or password.'));
        }
      }, 500);
    });
  };

  const logout = () => {
    localStorage.removeItem('afm_auth_token');
    localStorage.removeItem('afm_auth_user');
    setAuthState({ token: null, user: null });
  };

  const isAuthenticated = (): boolean => {
    return !!authState.token;
  };

  if (isLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        </div>
    );
  }

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
