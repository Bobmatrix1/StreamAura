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
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
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
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
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
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

// --- NOTIFICATION TYPES ---
export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  type: 'update' | 'alert' | 'general';
}

// --- NOTIFICATION ACTIONS ---

export const requestNotificationPermission = async (userId: string) => {
  if (!messaging) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: 'BPxPQyw6UvHCTItO8iXpUN-HcK09nLlss1XQqg9IG2FBjHQu1yX02VkAqSHb9WJXKgEPdm5jN715TLglfCIaH54'
      });
      if (token) {
        await updateDoc(doc(db, 'users', userId), {
          fcmToken: token,
          notificationsEnabled: true
        });
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Permission error:', error);
    return false;
  }
};

export const updateAppBadge = (count: number) => {
  if ('setAppBadge' in navigator) {
    if (count > 0) (navigator as any).setAppBadge(count);
    else (navigator as any).clearAppBadge();
  }
};

export const sendGlobalNotification = async (title: string, message: string) => {
  try {
    const response = await fetch('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message })
    });
    return response.ok;
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
};

export const listenToNotifications = (userId: string, callback: (notifs: AppNotification[]) => void) => {
  const q = query(
    collection(db, 'users', userId, 'notifications'),
    orderBy('timestamp', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snapshot) => {
    const notifs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toMillis() || Date.now()
    })) as AppNotification[];
    callback(notifs);
    
    const unreadCount = notifs.filter(n => !n.read).length;
    updateAppBadge(unreadCount);
  });
};

export const markAsRead = async (userId: string, notifId: string) => {
  await updateDoc(doc(db, 'users', userId, 'notifications', notifId), { read: true });
};

export const markAllAsRead = async (userId: string) => {
  const q = query(collection(db, 'users', userId, 'notifications'), where('read', '==', false));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
};

export const clearNotification = async (userId: string, notifId: string) => {
  await deleteDoc(doc(db, 'users', userId, 'notifications', notifId));
};

export const clearAllUserNotifications = async (userId: string) => {
  const q = collection(db, 'users', userId, 'notifications');
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
};

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      const userData: User = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        isAdmin: false,
        createdAt: Date.now()
      };
      await setDoc(userDocRef, userData);
      return userData;
    }
    
    return userDoc.data() as User;
  } catch (error) {
    console.error('Google Sign In error:', error);
    throw new Error('Failed to sign in with Google');
  }
};

export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<User> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    await updateProfile(user, { displayName });
    const userData: User = {
      uid: user.uid,
      email: user.email,
      displayName: displayName,
      photoURL: null,
      isAdmin: false,
      createdAt: Date.now()
    };
    await setDoc(doc(db, 'users', user.uid), userData);
    return userData;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to sign up');
  }
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) return userDoc.data() as User;
    const userData: User = {
      uid: user.uid, email: user.email, displayName: user.displayName,
      photoURL: user.photoURL, isAdmin: false, createdAt: Date.now()
    };
    await setDoc(doc(db, 'users', user.uid), userData);
    return userData;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to sign in');
  }
};

export const logOut = async (): Promise<void> => {
  await signOut(auth);
};

export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const userData = await getUserData(firebaseUser.uid);
      callback(userData);
    } else {
      callback(null);
    }
  });
};

export const resetPassword = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(auth, email);
};

export const getUserData = async (uid: string, createIfMissing = false): Promise<User | null> => {
  const userDocRef = doc(db, 'users', uid);
  try {
    let userDoc = await getDoc(userDocRef);
    if (!userDoc.exists() && !createIfMissing) userDoc = await getDocFromServer(userDocRef);
    if (userDoc.exists()) return userDoc.data() as User;
    return null;
  } catch (err) {
    return null;
  }
};

export const toggleAdminStatus = async (uid: string, isAdmin: boolean): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), { isAdmin });
};

export const deleteUserAccount = async (uid: string): Promise<void> => {
  await deleteDoc(doc(db, 'users', uid));
};

export const getAllUsers = async (): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'), limit(500));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email,
        displayName: data.displayName,
        photoURL: data.photoURL,
        isAdmin: data.isAdmin || false,
        createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
        lastDevice: data.lastDevice || 'Unknown'
      } as any;
    });
  } catch (error) {
    return [];
  }
};

export const saveDownloadHistory = async (userId: string, userEmail: string | null, userDisplayName: string | null, historyItem: any): Promise<void> => {
  try {
    const historyRef = collection(db, 'downloads');
    await addDoc(historyRef, {
      ...historyItem,
      userId,
      userEmail,
      userDisplayName,
      downloadedAt: Date.now()
    });
  } catch (error) {}
};

export const getGlobalHistory = async (limitCount = 100): Promise<GlobalHistoryItem[]> => {
  try {
    const historyRef = collection(db, 'downloads');
    const q = query(historyRef, orderBy('downloadedAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as GlobalHistoryItem);
  } catch (error) {
    return [];
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
      country, device, timestamp: serverTimestamp(),
      hour: now.getHours(), platform: navigator.platform
    });
  } catch (error) {}
};

export const clearAllTraffic = async (): Promise<void> => {
  const visitsRef = collection(db, 'visits');
  const snapshot = await getDocs(query(visitsRef, limit(500)));
  const batch = writeBatch(db);
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
};

export const logFeatureUsage = async (feature: string, userId?: string): Promise<void> => {
  try {
    const featureRef = collection(db, 'feature_usage');
    await addDoc(featureRef, {
      feature, userId: userId || 'anonymous', timestamp: serverTimestamp()
    });
  } catch (error) {}
};

export const logSearch = async (queryText: string, type: 'movie' | 'video' | 'music', userId?: string): Promise<void> => {
  try {
    const searchRef = collection(db, 'searches');
    await addDoc(searchRef, {
      query: queryText, type, userId: userId || 'anonymous', timestamp: serverTimestamp()
    });
  } catch (error) {}
};

export const logMediaInteraction = async (
  item: { id: string; title: string; mediaType: string; platform: string }, 
  action: 'watch' | 'download',
  userId?: string
): Promise<void> => {
  try {
    const interactionRef = collection(db, 'interactions');
    await addDoc(interactionRef, {
      ...item, action, userId: userId || 'anonymous', timestamp: serverTimestamp()
    });
  } catch (error) {}
};

export const updateUserPresence = async (uid: string, device?: string): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const now = Date.now();
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      const lastActive = data.lastActive?.toMillis?.() || data.lastActive || now;
      let totalTime = data.totalTimeMinutes || 0;
      
      const diffMs = now - lastActive;
      if (diffMs < 10 * 60 * 1000 && diffMs > 0) {
        totalTime += Math.round(diffMs / (60 * 1000));
      }

      await updateDoc(userDocRef, { 
        lastActive: serverTimestamp(),
        totalTimeMinutes: totalTime,
        lastDevice: device || data.lastDevice || 'Unknown'
      });
    } else {
      await setDoc(userDocRef, {
        lastActive: serverTimestamp(),
        totalTimeMinutes: 0,
        createdAt: now,
        lastDevice: device || 'Unknown'
      }, { merge: true });
    }
  } catch (error) {}
};

export interface SystemStats {
  totalUsers: number;
  totalVisits: number;
  onlineNow: number;
  dailyActiveUsers: number;
  topCountries: { country: string; count: number }[];
  topUsers: { email: string; name: string; visits: number; timeSpent: number; recentActivity: any[] }[];
  featureUsage: { feature: string; count: number }[];
  topSearches: { query: string; count: number }[];
  topMovies: { title: string; watches: number; downloads: number }[];
  peakHours: { hour: number; display: string; count: number }[];
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
    
    // FETCH IN PARALLEL with reduced limits for speed
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const onlineQuery = query(usersRef, where('lastActive', '>=', Timestamp.fromDate(thirtyMinsAgo)));
    const dailyQuery = query(usersRef, where('lastActive', '>=', Timestamp.fromDate(twentyFourHoursAgo)));

    const [
      usersCount, visitsCount, onlineSnapshot, dailySnapshot,
      visitsSnapshot, usersSnapshot, featuresSnapshot, searchesSnapshot,
      interactionsSnapshot, historySnapshot
    ] = await Promise.all([
      getCountFromServer(usersRef),
      getCountFromServer(visitsRef),
      getDocs(onlineQuery), // Changed to getDocs for 100% reliability
      getCountFromServer(dailyQuery),
      getDocs(query(visitsRef, orderBy('timestamp', 'desc'), limit(200))),
      getDocs(query(usersRef, orderBy('totalTimeMinutes', 'desc'), limit(20))),
      getDocs(query(featuresRef, orderBy('timestamp', 'desc'), limit(200))),
      getDocs(query(searchesRef, orderBy('timestamp', 'desc'), limit(200))),
      getDocs(query(interactionsRef, orderBy('timestamp', 'desc'), limit(200))),
      getDocs(query(historyRef, orderBy('downloadedAt', 'desc'), limit(200)))
    ]);

    // 1. Countries & Peak Hours
    const countryMap: Record<string, number> = {};
    const hoursMap: Record<number, number> = {};
    visitsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const hour = data.hour !== undefined ? data.hour : (data.timestamp?.toDate()?.getHours() || 0);
      countryMap[data.country || 'Unknown'] = (countryMap[data.country || 'Unknown'] || 0) + 1;
      hoursMap[hour] = (hoursMap[hour] || 0) + 1;
    });
    
    const peakHours = Object.entries(hoursMap).map(([hour, count]) => {
      const h = parseInt(hour);
      const ampm = h >= 12 ? 'PM' : 'AM';
      return { hour: h, display: `${h % 12 || 12}:00 ${ampm}`, count };
    }).sort((a, b) => b.count - a.count).slice(0, 6);

    // 2. Top Users
    const topUsers = usersSnapshot.docs.map(doc => {
      const data = doc.data();
      const uid = doc.id;
      const userInteractions = interactionsSnapshot.docs.filter(d => d.data().userId === uid).map(d => ({ title: d.data().title, action: d.data().action }));
      const userHistory = historySnapshot.docs.filter(d => d.data().userId === uid).map(d => ({ title: d.data().title, platform: d.data().platform }));
      return {
        email: data.email || 'Unknown', name: data.displayName || 'Anonymous',
        timeSpent: data.totalTimeMinutes || 0, recentActivity: [...userInteractions, ...userHistory].slice(0, 5)
      };
    }).filter(u => u.timeSpent > 0);

    // 3. Feature Usage
    const featureMap: Record<string, number> = {};
    featuresSnapshot.docs.forEach(doc => {
      const f = doc.data().feature;
      if (f) featureMap[f] = (featureMap[f] || 0) + 1;
    });

    // 4. Searches & Media (Min 10 threshold)
    const searchMap: Record<string, number> = {};
    searchesSnapshot.docs.forEach(doc => {
      const q = doc.data().query?.toLowerCase().trim();
      if (q) searchMap[q] = (searchMap[q] || 0) + 1;
    });

    const movieMap: Record<string, { watches: number; downloads: number }> = {};
    interactionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.title && (data.mediaType === 'movie' || data.mediaType === 'series')) {
        if (!movieMap[data.title]) movieMap[data.title] = { watches: 0, downloads: 0 };
        if (data.action === 'watch') movieMap[data.title].watches += 1;
        if (data.action === 'download') movieMap[data.title].downloads += 1;
      }
    });

    const platformMap: Record<string, number> = {};
    historySnapshot.docs.forEach(doc => {
      const p = doc.data().platform;
      if (p && p !== 'MovieBox') platformMap[p] = (platformMap[p] || 0) + 1;
    });

    return {
      totalUsers: usersCount.data().count, totalVisits: visitsCount.data().count,
      onlineNow: onlineSnapshot.size, dailyActiveUsers: dailySnapshot.data().count,
      topCountries: Object.entries(countryMap).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      topUsers, featureUsage: Object.entries(featureMap).map(([feature, count]) => ({ feature, count })).sort((a, b) => b.count - a.count),
      topSearches: Object.entries(searchMap).filter(([_, count]) => count >= 10).map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      topMovies: Object.entries(movieMap).filter(([_, s]) => (s.watches + s.downloads) >= 10).map(([title, s]) => ({ title, ...s })).sort((a, b) => (b.watches + b.downloads) - (a.watches + a.downloads)).slice(0, 10),
      peakHours, topPlatforms: Object.entries(platformMap).map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count).slice(0, 8)
    };
  } catch (error) {
    throw new Error('Failed to fetch system statistics');
  }
};

export const clearUserHistory = async (userId: string): Promise<void> => {
  const historyRef = collection(db, 'downloads');
  const snapshot = await getDocs(query(historyRef, where('userId', '==', userId)));
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
};

export const clearAllHistory = async (): Promise<void> => {
  const historyRef = collection(db, 'downloads');
  const snapshot = await getDocs(query(historyRef, limit(500)));
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
};

export default app;
