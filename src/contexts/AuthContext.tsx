/**
 * Authentication Context
 * 
 * Provides authentication state and methods to all components in the app.
 * Uses Firebase Auth for authentication and Firestore for user data.
 */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '@/types';
import { 
  signUpWithEmail, 
  signInWithEmail, 
  signInWithGoogle, 
  logOut, 
  onAuthChange,
  resetPassword as firebaseResetPassword
} from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to auth state changes on mount
  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setUser(user);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const clearError = () => setError(null);

  const signUp = async (email: string, password: string, displayName: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const newUser = await signUpWithEmail(email, password, displayName);
      setUser(newUser);
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const loggedInUser = await signInWithEmail(email, password);
      setUser(loggedInUser);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signInGoogle = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const googleUser = await signInWithGoogle();
      setUser(googleUser);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      await firebaseResetPassword(email);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      await logOut();
    } catch (err: any) {
      setError(err.message || 'Failed to log out');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isAdmin: user?.isAdmin || false,
    signUp,
    signIn,
    signInGoogle,
    resetPassword,
    logout,
    error,
    clearError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
