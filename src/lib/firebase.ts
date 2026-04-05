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
    const now = new Date();
    await addDoc(visitsRef, {
      country,
      device,
      timestamp: serverTimestamp(),
      hour: now.getHours(), // For peak time analysis
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

export const logFeatureUsage = async (feature: string, userId?: string): Promise<void> => {
  try {
    const featureRef = collection(db, 'feature_usage');
    await addDoc(featureRef, {
      feature,
      userId: userId || 'anonymous',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging feature usage:', error);
  }
};

export const logSearch = async (queryText: string, type: 'movie' | 'video' | 'music', userId?: string): Promise<void> => {
  try {
    const searchRef = collection(db, 'searches');
    await addDoc(searchRef, {
      query: queryText,
      type,
      userId: userId || 'anonymous',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging search:', error);
  }
};

export const logMediaInteraction = async (
  item: { id: string; title: string; mediaType: string; platform: string }, 
  action: 'watch' | 'download',
  userId?: string
): Promise<void> => {
  try {
    const interactionRef = collection(db, 'interactions');
    await addDoc(interactionRef, {
      ...item,
      action,
      userId: userId || 'anonymous',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging interaction:', error);
  }
};

export const updateUserPresence = async (uid: string, device?: string): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const now = Date.now();
    const userDoc = await getDoc(userDocRef);
    
    let totalTime = 0;
    let lastActive = now;
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      totalTime = data.totalTimeMinutes || 0;
      lastActive = data.lastActive?.toMillis?.() || now;
      
      // If last active was less than 10 mins ago, count the difference as session time
      const diffMs = now - lastActive;
      if (diffMs < 10 * 60 * 1000) {
        totalTime += Math.round(diffMs / (60 * 1000));
      }
    }

    const updateData: any = { 
      lastActive: serverTimestamp(),
      totalTimeMinutes: totalTime
    };
    
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
  topUsers: { email: string; name: string; visits: number; timeSpent: number }[];
  featureUsage: { feature: string; count: number }[];
  topSearches: { query: string; count: number }[];
  topMovies: { title: string; watches: number; downloads: number }[];
  peakHours: { hour: number; count: number }[];
  topPlatforms: { platform: string; count: number }[];
}

export const getStatsSummary = async (): Promise<SystemStats> => {
  try {
    const usersRef = collection(db, 'users');
    const visitsRef = collection(db, 'visits');
    const featuresRef = collection(db, 'feature_usage');
    const searchesRef = collection(db, 'searches');
    const interactionsRef = collection(db, 'interactions');
    const historyRef = collection(db, 'downloads');
    
    // FETCH IN PARALLEL for speed
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineQuery = query(usersRef, where('lastActive', '>=', Timestamp.fromDate(fiveMinsAgo)));
    const recentVisitsQuery = query(visitsRef, orderBy('timestamp', 'desc'), limit(1000));
    
    // Fetch users for top users analysis
    const allUsersQuery = query(usersRef, orderBy('totalTimeMinutes', 'desc'), limit(20));

    const [
      usersCount, 
      visitsCount, 
      onlineSnapshot, 
      visitsSnapshot,
      usersSnapshot,
      featuresSnapshot,
      searchesSnapshot,
      interactionsSnapshot,
      historySnapshot
    ] = await Promise.all([
      getCountFromServer(usersRef),
      getCountFromServer(visitsRef),
      getCountFromServer(onlineQuery),
      getDocs(recentVisitsQuery),
      getDocs(allUsersQuery),
      getDocs(query(featuresRef, orderBy('timestamp', 'desc'), limit(1000))),
      getDocs(query(searchesRef, where('type', '==', 'movie'), orderBy('timestamp', 'desc'), limit(500))),
      getDocs(query(interactionsRef, orderBy('timestamp', 'desc'), limit(1000))),
      getDocs(query(historyRef, orderBy('downloadedAt', 'desc'), limit(1000)))
    ]);

    // 1. Top Countries & Peak Hours (12h format)
    const countryMap: Record<string, number> = {};
    const hoursMap: Record<number, number> = {};
    visitsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const country = data.country || 'Unknown';
      const hour = data.hour !== undefined ? data.hour : (data.timestamp?.toDate()?.getHours() || 0);
      countryMap[country] = (countryMap[country] || 0) + 1;
      hoursMap[hour] = (hoursMap[hour] || 0) + 1;
    });
    
    const topCountries = Object.entries(countryMap)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
      
    const peakHours = Object.entries(hoursMap)
      .map(([hour, count]) => {
        const h = parseInt(hour);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayHour = h % 12 || 12;
        return { hour: h, display: `${displayHour}:00 ${ampm}`, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 2. Top Users with Activity Details
    const topUsers = usersSnapshot.docs.map(doc => {
      const data = doc.data();
      const uid = doc.id;
      
      // Filter interactions for this specific user
      const userInteractions = interactionsSnapshot.docs
        .filter(d => d.data().userId === uid)
        .map(d => ({ title: d.data().title, action: d.data().action }));
        
      const userHistory = historySnapshot.docs
        .filter(d => d.data().userId === uid)
        .map(d => ({ title: d.data().title, platform: d.data().platform }));

      return {
        uid,
        email: data.email || 'Unknown',
        name: data.displayName || 'Anonymous',
        timeSpent: data.totalTimeMinutes || 0,
        recentActivity: [...userInteractions, ...userHistory].slice(0, 5)
      };
    }).filter(u => u.timeSpent > 0);

    // 3. Feature Usage
    const featureMap: Record<string, number> = {};
    featuresSnapshot.docs.forEach(doc => {
      const feature = doc.data().feature;
      if (feature) featureMap[feature] = (featureMap[feature] || 0) + 1;
    });
    const featureUsage = Object.entries(featureMap)
      .map(([feature, count]) => ({ feature, count }))
      .sort((a, b) => b.count - a.count);

    // 4. Top Searches (Threshold: 10)
    const searchMap: Record<string, number> = {};
    searchesSnapshot.docs.forEach(doc => {
      const q = doc.data().query?.toLowerCase().trim();
      if (q) searchMap[q] = (searchMap[q] || 0) + 1;
    });
    const topSearches = Object.entries(searchMap)
      .filter(([_, count]) => count >= 10) // THRESHOLD
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 5. Top Movies (Threshold: 10 total interactions)
    const movieMap: Record<string, { watches: number; downloads: number }> = {};
    interactionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const title = data.title;
      if (title && data.mediaType === 'movie') {
        if (!movieMap[title]) movieMap[title] = { watches: 0, downloads: 0 };
        if (data.action === 'watch') movieMap[title].watches += 1;
        if (data.action === 'download') movieMap[title].downloads += 1;
      }
    });
    
    const topMovies = Object.entries(movieMap)
      .filter(([_, stats]) => (stats.watches + stats.downloads) >= 10) // THRESHOLD
      .map(([title, stats]) => ({ title, ...stats }))
      .sort((a, b) => (b.watches + b.downloads) - (a.watches + a.downloads))
      .slice(0, 10);

    // 6. Top Platforms (From Video/Music History)
    const platformMap: Record<string, number> = {};
    historySnapshot.docs.forEach(doc => {
      const p = doc.data().platform;
      if (p && p !== 'MovieBox') { // Exclude MovieBox for converter stats
        platformMap[p] = (platformMap[p] || 0) + 1;
      }
    });
    const topPlatforms = Object.entries(platformMap)
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      totalUsers: usersCount.data().count,
      totalVisits: visitsCount.data().count,
      onlineNow: onlineSnapshot.data().count,
      topCountries,
      topUsers,
      featureUsage,
      topSearches,
      topMovies,
      peakHours,
      topPlatforms
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
