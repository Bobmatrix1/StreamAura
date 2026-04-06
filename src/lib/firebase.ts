/**
 * Firebase Configuration
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
  onSnapshot,
  initializeFirestore
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import type { User, GlobalHistoryItem } from '@/types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Force Long Polling to fix ERR_HTTP2_PING_FAILED and stabilize live updates
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});

export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  type: 'update' | 'alert' | 'general';
}

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

export const listenToNotifications = (userId: string, callback: (notifs: AppNotification[]) => void, onError?: (error: any) => void) => {
  if (!userId) return () => {};

  const colRef = collection(db, 'users', userId, 'notifications');
  const q = query(colRef, limit(50));

  return onSnapshot(q, {
    next: (snapshot) => {
      const notifs = snapshot.docs.map(doc => {
        const data = doc.data();
        let ts = Date.now();
        if (data.timestamp?.toMillis) ts = data.timestamp.toMillis();
        else if (data.timestamp instanceof Date) ts = data.timestamp.getTime();
        else if (typeof data.timestamp === 'number') ts = data.timestamp;
        return { id: doc.id, ...data, timestamp: ts };
      }) as AppNotification[];
      
      notifs.sort((a, b) => b.timestamp - a.timestamp);
      callback(notifs);
      updateAppBadge(notifs.filter(n => !n.read).length);
    },
    error: (error) => {
      console.error('[NotificationSystem] Listener error:', error);
      if (onError) onError(error);
    }
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

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      const userData: User = {
        uid: user.uid, email: user.email, displayName: user.displayName,
        photoURL: user.photoURL, isAdmin: false, createdAt: Date.now()
      };
      await setDoc(userDocRef, userData);
      return userData;
    }
    return { ...userDoc.data(), uid: user.uid } as User;
  } catch (error) { throw new Error('Failed to sign in with Google'); }
};

export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<User> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    await updateProfile(user, { displayName });
    const userData: User = {
      uid: user.uid, email: user.email, displayName: displayName,
      photoURL: null, isAdmin: false, createdAt: Date.now()
    };
    await setDoc(doc(db, 'users', user.uid), userData);
    return userData;
  } catch (error: any) { throw new Error(error.message || 'Failed to sign up'); }
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) return { ...userDoc.data(), uid: user.uid } as User;
    const userData: User = {
      uid: user.uid, email: user.email, displayName: user.displayName,
      photoURL: user.photoURL, isAdmin: false, createdAt: Date.now()
    };
    await setDoc(doc(db, 'users', user.uid), userData);
    return userData;
  } catch (error: any) { throw new Error(error.message || 'Failed to sign in'); }
};

export const logOut = async (): Promise<void> => { await signOut(auth); };

export const onAuthChange = (callback: (user: any | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const userData = await getUserData(firebaseUser.uid);
      // GUARANTEE the UID exists even if the Firestore doc is missing
      callback(userData ? { ...userData, uid: firebaseUser.uid } : { 
        uid: firebaseUser.uid, 
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL
      });
    } else callback(null);
  });
};

export const resetPassword = async (email: string): Promise<void> => { await sendPasswordResetEmail(auth, email); };

export const getUserData = async (uid: string, createIfMissing = false): Promise<User | null> => {
  const userDocRef = doc(db, 'users', uid);
  try {
    let userDoc = await getDoc(userDocRef);
    if (!userDoc.exists() && !createIfMissing) userDoc = await getDocFromServer(userDocRef);
    if (userDoc.exists()) return userDoc.data() as User;
    return null;
  } catch (err) { return null; }
};

export const toggleAdminStatus = async (uid: string, isAdmin: boolean): Promise<void> => { await updateDoc(doc(db, 'users', uid), { isAdmin }); };
export const deleteUserAccount = async (uid: string): Promise<void> => { await deleteDoc(doc(db, 'users', uid)); };

export const getAllUsers = async (): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'), limit(500));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as any));
  } catch (error) { return []; }
};

export const saveDownloadHistory = async (userId: string, userEmail: string | null, userDisplayName: string | null, historyItem: any): Promise<void> => {
  try {
    const historyRef = collection(db, 'downloads');
    await addDoc(historyRef, {
      ...historyItem, userId, userEmail, userDisplayName,
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
  } catch (error) { return []; }
};

export const logVisit = async (country: string, device: string = 'Unknown'): Promise<void> => {
  try {
    const visitsRef = collection(db, 'visits');
    await addDoc(visitsRef, {
      country, device, timestamp: serverTimestamp(),
      hour: new Date().getHours(), platform: navigator.platform
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
  if (!uid) return;
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, { 
      lastActive: serverTimestamp(),
      lastDevice: device || 'Unknown'
    });
  } catch (error) {
    try { await setDoc(userDocRef, { lastActive: serverTimestamp(), createdAt: Date.now() }, { merge: true }); }
    catch (e) {}
  }
};

export interface SystemStats {
  totalUsers: number; totalVisits: number; onlineNow: number; dailyActiveUsers: number;
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
    
    // Unified 2-hour window for online users to account for all sync issues
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [usersCount, visitsCount, onlineSnapshot, dailySnapshot, visitsSnapshot, usersSnapshot, featuresSnapshot, searchesSnapshot, interactionsSnapshot, historySnapshot] = await Promise.all([
      getCountFromServer(usersRef),
      getCountFromServer(visitsRef),
      getDocs(query(usersRef, where('lastActive', '>=', Timestamp.fromDate(twoHoursAgo)))),
      getDocs(query(usersRef, where('lastActive', '>=', Timestamp.fromDate(twentyFourHoursAgo)))),
      getDocs(query(visitsRef, orderBy('timestamp', 'desc'), limit(200))),
      getDocs(query(usersRef, orderBy('totalTimeMinutes', 'desc'), limit(20))),
      getDocs(query(featuresRef, orderBy('timestamp', 'desc'), limit(200))),
      getDocs(query(searchesRef, orderBy('timestamp', 'desc'), limit(200))),
      getDocs(query(interactionsRef, orderBy('timestamp', 'desc'), limit(200))),
      getDocs(query(historyRef, orderBy('downloadedAt', 'desc'), limit(200)))
    ]);

    const countryMap: Record<string, number> = {};
    const hoursMap: Record<number, number> = {};
    visitsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const hour = data.hour !== undefined ? data.hour : (data.timestamp?.toDate()?.getHours() || 0);
      countryMap[data.country || 'Unknown'] = (countryMap[data.country || 'Unknown'] || 0) + 1;
      hoursMap[hour] = (hoursMap[hour] || 0) + 1;
    });
    
    return {
      totalUsers: usersCount.data().count, totalVisits: visitsCount.data().count,
      onlineNow: onlineSnapshot.size, dailyActiveUsers: dailySnapshot.size,
      topCountries: Object.entries(countryMap).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      topUsers: usersSnapshot.docs.map(doc => {
        const data = doc.data();
        const uid = doc.id;
        const ui = interactionsSnapshot.docs.filter(d => d.data().userId === uid).map(d => ({ title: d.data().title, action: d.data().action }));
        const uh = historySnapshot.docs.filter(d => d.data().userId === uid).map(d => ({ title: d.data().title, platform: d.data().platform }));
        return { email: data.email || 'Unknown', name: data.displayName || 'Anonymous', timeSpent: data.totalTimeMinutes || 0, recentActivity: [...ui, ...uh].slice(0, 5) };
      }).filter(u => u.timeSpent > 0),
      featureUsage: Object.entries(filteredMap(featuresSnapshot, 'feature')).map(([feature, count]) => ({ feature, count })).sort((a, b) => b.count - a.count),
      topSearches: Object.entries(filteredMap(searchesSnapshot, 'query')).filter(([_, count]) => count >= 10).map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      topMovies: Object.entries(interactionsSnapshot.docs.reduce((acc, d) => {
        const data = d.data();
        if (data.title) {
          if (!acc[data.title]) acc[data.title] = { watches: 0, downloads: 0 };
          if (data.action === 'watch') acc[data.title].watches += 1;
          if (data.action === 'download') acc[data.title].downloads += 1;
        }
        return acc;
      }, {} as any)).filter(([_, s]: any) => (s.watches + s.downloads) >= 10).map(([title, s]: any) => ({ title, ...s })).sort((a, b) => (b.watches + b.downloads) - (a.watches + a.downloads)).slice(0, 10),
      peakHours: Object.entries(hoursMap).map(([hour, count]) => {
        const h = parseInt(hour);
        const ampm = h >= 12 ? 'PM' : 'AM';
        return { hour: h, display: `${h % 12 || 12}:00 ${ampm}`, count };
      }).sort((a, b) => b.count - a.count).slice(0, 6),
      topPlatforms: Object.entries(filteredMap(historySnapshot, 'platform')).filter(([p]) => p !== 'MovieBox').map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count).slice(0, 8)
    };
  } catch (error) { throw new Error('Failed to fetch system statistics'); }
};

function filteredMap(snap: any, key: string) {
  const m: Record<string, number> = {};
  snap.docs.forEach((d: any) => {
    const val = d.data()[key];
    if (val) m[val] = (m[val] || 0) + 1;
  });
  return m;
}

export const clearUserHistory = async (userId: string): Promise<void> => {
  const snapshot = await getDocs(query(collection(db, 'downloads'), where('userId', '==', userId)));
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
};

export const clearAllHistory = async (): Promise<void> => {
  const snapshot = await getDocs(query(collection(db, 'downloads'), limit(500)));
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
};

export default app;
