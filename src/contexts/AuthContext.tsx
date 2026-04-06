import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '@/types';
import { 
  signUpWithEmail, 
  signInWithEmail, 
  signInWithGoogle, 
  logOut, 
  onAuthChange,
  resetPassword as firebaseResetPassword,
  db
} from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use a more robust auth state observer
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        // ENSURE USER DOCUMENT EXISTS (Crucial for Notifications/Admin)
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const syncData: any = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Anonymous',
            isAdmin: firebaseUser.isAdmin || false,
            lastActive: serverTimestamp(),
            createdAt: firebaseUser.createdAt || Date.now()
          };
          if (firebaseUser.photoURL) syncData.photoURL = firebaseUser.photoURL;
          
          await setDoc(userRef, syncData, { merge: true });
        } catch (e) {
          console.error("Profile sync failed", e);
        }
        setUser(firebaseUser);
      } else {
        setUser(null);
      }
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
      if (googleUser) setUser(googleUser);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    try {
      setError(null);
      await firebaseResetPassword(email);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await logOut();
      setUser(null);
    } catch (err: any) {
      setError(err.message || 'Failed to logout');
      throw err;
    }
  };

  const value = {
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
