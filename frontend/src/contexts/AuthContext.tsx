import React, { createContext, useState, useContext, useCallback, ReactNode, useEffect } from 'react';
import { onAuthStateChanged, signOut, getIdToken } from 'firebase/auth';
import { auth } from '../utils/firebase';
import type { User } from '../types';

type AuthState = {
  token: string | null;
  user: User | null;
  loading: boolean;
  suspendedAt: string | null;
};

type AuthContextType = {
  authState: AuthState;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
  getAuthHeaders: () => Record<string, string>;
  getFreshAuthHeaders: () => Promise<Record<string, string>>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    token: null,
    user: null,
    loading: true,
    suspendedAt: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // If the user exists but their email is NOT verified, sign them out immediately
      if (firebaseUser && !firebaseUser.emailVerified) {
        await signOut(auth);
        setAuthState({ token: null, user: null, loading: false, suspendedAt: null });
        return;
      }

      if (firebaseUser) {
        try {
          const token = await getIdToken(firebaseUser);

          // Auto-provision the user in the backend DB and fetch extra claims (like isAdmin)
          const response = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (response.ok) {
            const data = await response.json();
            setAuthState({
              token,
              user: { ...data.user, uid: data.user.id, isAdmin: data.user.isAdmin ?? false, isSuperAdmin: data.user.isSuperAdmin ?? false, isGod: data.user.isGod ?? false },
              loading: false,
              suspendedAt: null,
            });
          } else if (response.status === 403) {
            const data = await response.json();
            await signOut(auth);
            setAuthState({ token: null, user: null, loading: false, suspendedAt: data.suspendedAt || null });
          } else {
            console.error('Failed to auto-provision user in backend');
            setAuthState({ token: null, user: null, loading: false, suspendedAt: null });
          }
        } catch (error) {
          console.error('Error fetching auth token or sinking to backend:', error);
          setAuthState({ token: null, user: null, loading: false, suspendedAt: null });
        }
      } else {
        setAuthState({ token: null, user: null, loading: false, suspendedAt: null });
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      // The onAuthStateChanged listener will automatically update the state to null
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const isAuthenticated = (): boolean => {
    return !!authState.user;
  };

  const getAuthHeaders = (): Record<string, string> => {
    if (authState.token) {
      return { 'Authorization': `Bearer ${authState.token}` };
    }
    return {};
  };

  const getFreshAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const freshToken = await getIdToken(currentUser, true);
      return { 'Authorization': `Bearer ${freshToken}` };
    }
    return {};
  }, []);

  if (authState.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 px-4">
        <h2 className="text-xl font-bold text-center text-white">Loading...</h2>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ authState, logout, isAuthenticated, getAuthHeaders, getFreshAuthHeaders }}>
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
