/**
 * Firebase Configuration
 * 
 * This file contains the Firebase configuration and initializes Firebase services.
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  type User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  getDocFromServer,
  collection,
  query,
  where,
  getDocs,
  getDocsFromServer,
  serverTimestamp,
  deleteDoc,
  updateDoc,
  orderBy,
  limit,
  getCountFromServer,
  addDoc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import type { User, GlobalHistoryItem } from '@/types';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Google Analytics disabled to prevent network timeouts/errors
export const analytics = null;

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

/**
 * Helper to handle Firebase errors with better messages
 */
const handleAuthError = (error: any): never => {
  console.error('Firebase Auth Error:', error);
  if (error.code === 'auth/network-request-failed' || error.message?.includes('503')) {
    throw new Error('Google Auth servers are temporarily unavailable. Please wait a minute and try again.');
  }
  if (error.code === 'auth/user-not-found' || error.message?.includes('not registered')) {
    throw new Error('This email address is not registered in our system.');
  }
  if (error.code === 'auth/popup-closed-by-user') {
    throw new Error('Sign-in window was closed. Please try again.');
  }
  throw error;
};

/**
 * Convert Firebase user to our User type
 */
const convertToUser = async (firebaseUser: FirebaseUser, createIfMissing = true): Promise<User | null> => {
  const userDocRef = doc(db, 'users', firebaseUser.uid);
  let userDoc;
  
  try {
    userDoc = await getDoc(userDocRef);
    if (!userDoc.exists() && !createIfMissing) {
      userDoc = await getDocFromServer(userDocRef);
    }
  } catch (err) {
    try {
      userDoc = await getDocFromServer(userDocRef);
    } catch (serverErr) {
      return null;
    }
  }
  
  let isAdmin = false;
  let createdAt = Date.now();
  let lastDevice = 'Unknown';
  
  if (userDoc.exists()) {
    const userData = userDoc.data();
    isAdmin = userData.isAdmin || false;
    createdAt = userData.createdAt?.toMillis?.() || Date.now();
    lastDevice = userData.lastDevice || 'Unknown';
  } else {
    if (!createIfMissing) return null;
    await setDoc(userDocRef, {
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      isAdmin: false,
      createdAt: serverTimestamp(),
      lastDevice: 'Desktop'
    });
  }
  
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    isAdmin,
    createdAt,
    lastDevice
  } as any;
};

/**
 * Authentication Functions
 */

export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<User> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName });
    const user = await convertToUser(userCredential.user);
    if (!user) throw new Error('Failed to create user profile');
    return user;
  } catch (error) {
    return handleAuthError(error);
  }
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = await convertToUser(userCredential.user);
    if (!user) throw new Error('User profile not found');
    return user;
  } catch (error) {
    return handleAuthError(error);
  }
};

export const signInWithGoogle = async (): Promise<User> => {
  try {
    const userCredential = await signInWithPopup(auth, googleProvider);
    const user = await convertToUser(userCredential.user, false);
    if (!user) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        await signOut(auth);
        try { await currentUser.delete(); } catch (e) {}
      }
      throw new Error('Account not found. Please sign up first.');
    }
    return user;
  } catch (error) {
    return handleAuthError(error);
  }
};

export const logOut = async (): Promise<void> => {
  await signOut(auth);
};

export const resetPassword = async (email: string): Promise<void> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocsFromServer(q);
    if (querySnapshot.empty) {
      throw new Error('This email address is not registered in our system.');
    }
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    return handleAuthError(error);
  }
};

export const getCurrentUser = (): Promise<User | null> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      unsubscribe();
      if (firebaseUser) {
        const user = await convertToUser(firebaseUser, false);
        resolve(user);
      } else {
        resolve(null);
      }
    });
  });
};

export const checkIsAdmin = async (uid: string): Promise<boolean> => {
  const userDocRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userDocRef);
  return userDoc.exists() ? userDoc.data().isAdmin || false : false;
};

export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  return onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      const user = await convertToUser(firebaseUser, false);
      callback(user);
    } else {
      callback(null);
    }
  });
};

/**
 * Admin Functions
 */

export const getAllUsers = async (): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email || null,
        displayName: data.displayName || null,
        photoURL: data.photoURL || null,
        isAdmin: data.isAdmin || false,
        createdAt: data.createdAt?.toMillis?.() || Date.now(),
        lastDevice: data.lastDevice || 'Unknown'
      };
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    throw new Error('Failed to fetch users');
  }
};

export const toggleAdminStatus = async (userId: string, status: boolean): Promise<void> => {
  try {
    console.log(`[Firebase] Updating isAdmin to ${status} for ${userId}`);
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { isAdmin: status });
  } catch (error: any) {
    console.error('Error updating admin status:', error);
    if (error.code === 'permission-denied') {
      throw new Error('Permission Denied: Your account does not have permission to modify users. Check your Firestore rules.');
    }
    throw new Error(error.message || 'Failed to update admin status');
  }
};

export const deleteUserAccount = async (userId: string): Promise<void> => {
  try {
    console.log(`[Firebase] Deleting user account ${userId}`);
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
  } catch (error: any) {
    console.error('Error deleting user:', error);
    if (error.code === 'permission-denied') {
      throw new Error('Permission Denied: You do not have permission to delete users.');
    }
    throw new Error(error.message || 'Failed to delete user account');
  }
};

/**
 * Global History Functions
 */

export const saveDownloadHistory = async (item: GlobalHistoryItem): Promise<void> => {
  try {
    const historyDocRef = doc(db, 'downloads', item.id);
    await setDoc(historyDocRef, item);
  } catch (error) {
    console.error('Error saving global history:', error);
  }
};

export const getGlobalHistory = async (limitCount = 100): Promise<GlobalHistoryItem[]> => {
  try {
    const historyRef = collection(db, 'downloads');
    const q = query(historyRef, orderBy('downloadedAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as GlobalHistoryItem);
  } catch (error) {
    console.error('Error fetching global history:', error);
    throw new Error('Failed to fetch global history');
  }
};

/**
 * Analytics & Presence Functions
 */

export const logVisit = async (country: string, device: string = 'Unknown'): Promise<void> => {
  try {
    const visitsRef = collection(db, 'visits');
    await addDoc(visitsRef, {
      country,
      device,
      timestamp: serverTimestamp(),
      platform: navigator.platform
    });
  } catch (error) {
    console.error('Error logging visit:', error);
  }
};

export const clearAllTraffic = async (): Promise<void> => {
  try {
    const visitsRef = collection(db, 'visits');
    const snapshot = await getDocs(visitsRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  } catch (error) {
    console.error('Error clearing traffic:', error);
    throw new Error('Failed to clear traffic data');
  }
};

export const updateUserPresence = async (uid: string, device?: string): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const updateData: any = { lastActive: serverTimestamp() };
    if (device && device !== 'Unknown') {
      updateData.lastDevice = device;
    }
    await updateDoc(userDocRef, updateData);
  } catch (error) {
    // Fail silently
  }
};

export interface SystemStats {
  totalUsers: number;
  totalVisits: number;
  onlineNow: number;
  topCountries: { country: string; count: number }[];
}

export const getStatsSummary = async (): Promise<SystemStats> => {
  try {
    const usersRef = collection(db, 'users');
    const visitsRef = collection(db, 'visits');
    
    // FETCH IN PARALLEL for speed
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineQuery = query(usersRef, where('lastActive', '>=', Timestamp.fromDate(fiveMinsAgo)));
    const countryQuery = query(visitsRef, orderBy('timestamp', 'desc'), limit(500));

    const [usersCount, visitsCount, onlineSnapshot, countrySnapshot] = await Promise.all([
      getCountFromServer(usersRef),
      getCountFromServer(visitsRef),
      getCountFromServer(onlineQuery),
      getDocs(countryQuery)
    ]);

    const countryMap: Record<string, number> = {};
    countrySnapshot.docs.forEach(doc => {
      const country = doc.data().country || 'Unknown';
      countryMap[country] = (countryMap[country] || 0) + 1;
    });
    
    const topCountries = Object.entries(countryMap)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalUsers: usersCount.data().count,
      totalVisits: visitsCount.data().count,
      onlineNow: onlineSnapshot.data().count,
      topCountries
    };
  } catch (error) {
    console.error('Error fetching stats:', error);
    throw new Error('Failed to fetch system statistics');
  }
};

export const clearUserHistory = async (userId: string): Promise<void> => {
  try {
    const historyRef = collection(db, 'downloads');
    const q = query(historyRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  } catch (error) {
    console.error('Error clearing user history:', error);
    throw new Error('Failed to clear user history');
  }
};

export const clearAllHistory = async (): Promise<void> => {
  try {
    const historyRef = collection(db, 'downloads');
    const snapshot = await getDocs(historyRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  } catch (error) {
    console.error('Error clearing global history:', error);
    throw new Error('Failed to clear global history');
  }
};

export default app;
