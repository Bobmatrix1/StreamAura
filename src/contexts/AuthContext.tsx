import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { 
  signUpWithEmail, 
  signInWithEmail, 
  signInWithGoogle, 
  logOut, 
  onAuthChange,
  resetPassword as firebaseResetPassword,
  db
} from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import Login from '../sections/Login';
import Signup from '../sections/Signup';

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
  requireAuth: (callback: () => void, initialView?: 'login' | 'signup') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<{ isOpen: boolean, action?: () => void }>({ isOpen: false });
  const [showLogin, setShowLogin] = useState(true);

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

  /**
   * Converts Firebase Auth error codes into user-friendly messages
   */
  const mapAuthError = (err: any): string => {
    let code = err?.code || '';
    const message = err?.message || '';

    // Extract code from message if missing (common in some Firebase environments)
    if (!code && message.includes('auth/')) {
      const match = message.match(/auth\/[a-z0-9-]+/i);
      if (match) code = match[0];
    }
    
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
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
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact support.';
      case 'auth/requires-recent-login':
        return 'Please sign in again to perform this sensitive action.';
      default:
        // Final fallback for unexpected errors
        if (message.includes('credential') || message.includes('password') || message.includes('user')) {
          return 'Invalid email or password. Please check your details and try again.';
        }
        return 'An unexpected error occurred. Please check your details and try again.';
    }
  };

  const signUp = async (email: string, password: string, displayName: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const newUser = await signUpWithEmail(email, password, displayName);
      setUser(newUser);
    } catch (err: any) {
      const friendlyMsg = mapAuthError(err);
      setError(friendlyMsg);
      throw new Error(friendlyMsg);
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
      const friendlyMsg = mapAuthError(err);
      setError(friendlyMsg);
      throw new Error(friendlyMsg);
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
      const friendlyMsg = mapAuthError(err);
      setError(friendlyMsg);
      throw new Error(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    try {
      setError(null);
      await firebaseResetPassword(email);
    } catch (err: any) {
      const friendlyMsg = mapAuthError(err);
      setError(friendlyMsg);
      throw new Error(friendlyMsg);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setUser(null); // Clear locally first for immediate UI update
      await logOut();
    } catch (err: any) {
      setError(err.message || 'Failed to logout');
      throw err;
    }
  };

  const requireAuth = (callback: () => void, initialView: 'login' | 'signup' = 'login') => {
    if (user) {
      callback();
    } else {
      setShowLogin(initialView === 'login');
      setAuthModal({ isOpen: true, action: callback });
    }
  };

  useEffect(() => {
    if (user && authModal.isOpen) {
      setAuthModal({ isOpen: false });
      if (authModal.action) authModal.action();
    }
  }, [user]);

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
    clearError,
    requireAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      
      {/* Auth Modal Overlay */}
      {authModal.isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md">
            <div className="glass-card border-white/10 overflow-hidden shadow-2xl">
              {showLogin ? (
                <Login 
                  onToggleView={() => setShowLogin(false)} 
                  onBack={() => setAuthModal({ isOpen: false })}
                  isModal 
                />
              ) : (
                <Signup 
                  onToggleView={() => setShowLogin(true)} 
                  onBack={() => setAuthModal({ isOpen: false })}
                  isModal 
                />
              )}
            </div>
            
            <p className="mt-4 text-center text-[10px] text-white/40 font-black uppercase tracking-widest">
              Signin Required to access this feature
            </p>
          </div>
        </div>
      )}
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
