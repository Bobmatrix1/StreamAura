import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { 
  signUpWithEmail, 
  signInWithEmail, 
  logOut, 
  onAuthChange,
  resetPassword as firebaseResetPassword,
  db
} from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Converts Firebase Auth error codes into user-friendly messages
   */
  const mapAuthError = (err: any): string => {
    const code = err?.code || '';
    
    switch (code) {
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please check your details and try again.';
      case 'auth/user-not-found':
        return 'No account found with this email. Would you like to sign up?';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again or reset your password.';
      case 'auth/email-already-in-use':
        return 'This email is already registered. Try signing in instead.';
      case 'auth/weak-password':
        return 'Your password is too weak. Please use at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/operation-not-allowed':
        return 'Sign-in method is currently disabled.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Your account has been temporarily locked for security. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection and try again.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact support.';
      default:
        return err.message?.includes('Firebase') 
          ? 'An unexpected authentication error occurred. Please try again.' 
          : (err.message || 'Authentication failed');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthChange((updatedUser) => {
      setUser(updatedUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      const newUser = await signUpWithEmail(email, password, displayName);
      setUser(newUser);
    } catch (error: any) {
      throw new Error(mapAuthError(error));
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const existingUser = await signInWithEmail(email, password);
      setUser(existingUser);
    } catch (error: any) {
      throw new Error(mapAuthError(error));
    }
  };

  const signOut = async () => {
    try {
      await logOut();
      setUser(null);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await firebaseResetPassword(email);
    } catch (error: any) {
      throw new Error(mapAuthError(error));
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isAdmin: user?.isAdmin || false,
    signUp,
    signIn,
    signOut,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
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
