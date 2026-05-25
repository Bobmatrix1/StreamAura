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
  doc, 
  setDoc, 
  getDoc,
  collection,
  query,
  where,
  getDocs,
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
  initializeFirestore,
  increment
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import type { User, GlobalHistoryItem, HistoryItem, Vendor, Product, Partner, Order } from '../types';

export type { User, GlobalHistoryItem, HistoryItem, Vendor, Product, Partner, Order };

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

// Handle foreground messages
if (messaging) {
  onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);
    if (payload.notification) {
      // Create a native browser notification
      new Notification(payload.notification.title || 'New Message', {
        body: payload.notification.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png'
      });
    }
  });
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  type: 'update' | 'alert' | 'general';
  link?: string;
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
      const referralCode = localStorage.getItem('aura_referral_code');
      const userData: User = {
        uid: user.uid, email: user.email, displayName: user.displayName,
        photoURL: user.photoURL, isAdmin: false, createdAt: Date.now(),
        referralBalance: 0, bonusBalance: 0, referredCount: 0, referredBy: referralCode || null
      };
      await setDoc(userDocRef, userData);
      
      // Credit Referrer
      if (referralCode && referralCode !== user.uid) {
        const referrerRef = doc(db, 'users', referralCode);
        await updateDoc(referrerRef, {
          bonusBalance: increment(100),
          referredCount: increment(1)
        });
        localStorage.removeItem('aura_referral_code');
      }
      return userData;
    }
    return { ...userDoc.data(), uid: user.uid } as User;
  } catch (error) { throw error; }
};

export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<User> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    await updateProfile(user, { displayName });
    
    const referralCode = localStorage.getItem('aura_referral_code');
    const userData: User = {
      uid: user.uid, email: user.email, displayName: displayName,
      photoURL: null, isAdmin: false, createdAt: Date.now(),
      referralBalance: 0, referredCount: 0, referredBy: referralCode || null
    };
    await setDoc(doc(db, 'users', user.uid), userData);

    // Credit Referrer
    if (referralCode && referralCode !== user.uid) {
      const referrerRef = doc(db, 'users', referralCode);
      await updateDoc(referrerRef, {
        referralBalance: increment(100),
        referredCount: increment(1)
      });
      localStorage.removeItem('aura_referral_code');
    }

    return userData;
  } catch (error: any) { throw error; }
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) return { ...userDoc.data(), uid: user.uid } as User;
    const userData: User = {
      uid: user.uid, email: user.email, displayName: user.displayName,
      photoURL: user.photoURL, isAdmin: false, createdAt: Date.now(),
      referralBalance: 0, referredCount: 0, referredBy: null
    };
    await setDoc(doc(db, 'users', user.uid), userData);
    return userData;
  } catch (error: any) { throw error; }
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
    if (!userDoc.exists() && !createIfMissing) userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) return userDoc.data() as User;
    return null;
  } catch (err) { return null; }
};

export const toggleAdminStatus = async (uid: string, isAdmin: boolean): Promise<void> => { await updateDoc(doc(db, 'users', uid), { isAdmin }); };
export const deleteUserAccount = async (uid: string): Promise<void> => { await deleteDoc(doc(db, 'users', uid)); };

export interface UserFinancials {
  walletBalance: number;
  totalEarned: number;
  ticketsSold: number;
}

export interface UserActivitySummary {
  roomsCreated: number;
  moviesHosted: string[];
  snacksCount: number;
}

export const getUserDetails = async (uid: string): Promise<{ financials: UserFinancials, activity: UserActivitySummary }> => {
  try {
    // 1. Fetch Wallet Info
    const walletRef = doc(db, 'room_wallets', uid);
    const walletDoc = await getDoc(walletRef);
    const walletData = walletDoc.exists() ? walletDoc.data() : {};
    
    const financials: UserFinancials = {
      walletBalance: walletData.balance || 0,
      totalEarned: walletData.total_earned || 0,
      ticketsSold: walletData.tickets_sold || 0
    };

    // 2. Fetch Rooms Info
    const roomsRef = collection(db, 'cinema_rooms');
    const qRooms = query(roomsRef, where('host_uid', '==', uid));
    const roomsSnapshot = await getDocs(qRooms);
    
    const activity: UserActivitySummary = {
      roomsCreated: roomsSnapshot.size,
      moviesHosted: Array.from(new Set(roomsSnapshot.docs.map(doc => doc.data().movie_title))),
      snacksCount: 0 // Will implement orders check if collection exists
    };

    // 3. Fetch Orders (Snacks)
    try {
      const ordersRef = collection(db, 'orders');
      const qOrders = query(ordersRef, where('customerUid', '==', uid)); // Assuming this field exists
      const ordersSnapshot = await getDocs(qOrders);
      activity.snacksCount = ordersSnapshot.size;
    } catch (e) {}

    return { financials, activity };
  } catch (error) {
    return {
      financials: { walletBalance: 0, totalEarned: 0, ticketsSold: 0 },
      activity: { roomsCreated: 0, moviesHosted: [], snacksCount: 0 }
    };
  }
};

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

export const getUserHistory = async (userId: string, limitCount = 50): Promise<HistoryItem[]> => {
  try {
    const historyRef = collection(db, 'downloads');
    const q = query(
      historyRef, 
      where('userId', '==', userId),
      orderBy('downloadedAt', 'desc'), 
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    } as any));
  } catch (error: any) { 
    if (error?.message?.includes('index')) {
      try {
        const historyRef = collection(db, 'downloads');
        const q = query(historyRef, where('userId', '==', userId), limit(limitCount));
        const snapshot = await getDocs(q);
        const results = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
        return results.sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
      } catch (innerError) { return []; }
    }
    return []; 
  }
};

export const logVisit = async (country: string, state: string = 'Unknown', device: string = 'Unknown', userId?: string): Promise<void> => {
  try {
    const batch = writeBatch(db);
    const visitsRef = doc(collection(db, 'visits'));
    batch.set(visitsRef, {
      country, state, device, timestamp: serverTimestamp(),
      hour: new Date().getHours(), platform: navigator.platform,
      userId: userId || 'anonymous'
    });

    // Atomic Increment for Stats (Reduces Reads later)
    const statsRef = doc(db, 'system_analytics', 'global_counters');
    batch.set(statsRef, { 
      totalVisits: increment(1),
      [`countries.${country}`]: increment(1),
      [`states.${state}`]: increment(1),
      [`devices.${device}`]: increment(1)
    }, { merge: true });

    if (userId && userId !== 'anonymous') {
      const userRef = doc(db, 'users', userId);
      batch.update(userRef, { visitCount: increment(1) });
    }
    await batch.commit();
  } catch (error) {}
};

export const logPageVisit = async (page: string, _userId?: string, timeSpentMs?: number): Promise<void> => {
  if (timeSpentMs && timeSpentMs < 1000) return; // Ignore accidental bounces < 1s
  try {
    const statsRef = doc(db, 'system_analytics', 'global_counters');
    await setDoc(statsRef, { 
      [`pages.${page}.count`]: increment(1),
      [`pages.${page}.totalTime`]: increment(timeSpentMs || 0)
    }, { merge: true });
  } catch (error) {}
};

export const logUserAction = async (action: string, _page: string, _details?: any, _userId?: string): Promise<void> => {
  // Only log high-value actions to save Write costs
  const highValueActions = ['download', 'create_room', 'purchase', 'referral_click', 'room_creation_abandoned'];
  if (!highValueActions.includes(action)) return;

  try {
    const statsRef = doc(db, 'system_analytics', 'global_counters');
    await setDoc(statsRef, { 
      [`actions.${action}`]: increment(1)
    }, { merge: true });
  } catch (error) {}
};

export const logPaymentEvent = async (status: 'success' | 'failed', amount: number, _details: any, _userId?: string): Promise<void> => {
  try {
    const statsRef = doc(db, 'system_analytics', 'global_counters');
    await setDoc(statsRef, { 
      [`payments.${status}.count`]: increment(1),
      [`payments.${status}.totalAmount`]: increment(status === 'success' ? amount : 0)
    }, { merge: true });
  } catch (error) {}
};

export const logInviteEvent = async (action: 'sent' | 'accepted', roomId: string, userId?: string): Promise<void> => {
  try {
    const inviteEventsRef = collection(db, 'invite_events');
    await addDoc(inviteEventsRef, {
      action,
      roomId,
      userId: userId || 'anonymous',
      timestamp: serverTimestamp()
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
    await addDoc(featureRef, { feature, userId: userId || 'anonymous', timestamp: serverTimestamp() });
  } catch (error) {}
};

export const logSearch = async (queryText: string, type: 'movie' | 'video' | 'music' | 'series', userId?: string): Promise<void> => {
  try {
    const searchRef = collection(db, 'searches');
    await addDoc(searchRef, { query: queryText, type, userId: userId || 'anonymous', timestamp: serverTimestamp() });
    if (userId && userId !== 'anonymous') {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { searchCount: increment(1) });
    }
  } catch (error) {}
};

export const logMediaInteraction = async (
  item: { id: string; title: string; mediaType: string; platform: string },
  action: 'watch' | 'download',
  userId?: string
): Promise<void> => {
  try {
    const interactionRef = collection(db, 'interactions');
    await addDoc(interactionRef, { ...item, action, userId: userId || 'anonymous', timestamp: serverTimestamp() });
    if (userId && userId !== 'anonymous') {
      const userRef = doc(db, 'users', userId);
      const updateData: any = {};
      if (action === 'download') updateData.downloadCount = increment(1);
      if (action === 'watch') updateData.watchCount = increment(1);
      await updateDoc(userRef, updateData);
    }
  } catch (error) {}
};

export const updateUserPresence = async (uid: string, device?: string): Promise<void> => {
  if (!uid) return;
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, { 
      lastActive: serverTimestamp(),
      lastDevice: device || 'Unknown',
      totalTimeMinutes: increment(2)
    });
  } catch (error) {
    const userDocRef = doc(db, 'users', uid);
    try { 
      await setDoc(userDocRef, { 
        lastActive: serverTimestamp(), 
        createdAt: Date.now(),
        totalTimeMinutes: 0,
        visitCount: 1
      }, { merge: true }); 
    } catch (e) {}
  }
};

export interface SystemStats {
  totalUsers: number; 
  totalVisits: number; 
  onlineNow: number; 
  dailyActiveUsers: number;
  topCountries: { country: string; count: number }[];
  topStates: { state: string; count: number }[];
  topUsers: { email: string; name: string; visits: number; timeSpent: number; recentActivity: any[] }[];
  featureUsage: { feature: string; count: number }[];
  topSearches: { query: string; count: number }[];
  topMovies: { title: string; watches: number; downloads: number }[];
  peakHours: { hour: number; display: string; count: number }[];
  topPlatforms: { platform: string; count: number }[];
  topDevices: { device: string; count: number }[];
  
  // High-Fidelity Additions
  pageVisitsRanked: { page: string; count: number; avgTimeSpent: number }[];
  userBehavior: { clicks: number; taps: number; abandonedActions: number };
  watchHistoryCount: number;
  roomCreationStats: { total: number; frequency: string }; // frequency e.g. "5/day"
  inviteStats: { sent: number; accepted: number; rate: number };
  snackPurchases: { total: number; amount: number };
  paymentStats: { successful: number; failed: number; rate: number };
  liveSystem: { activeRooms: number; totalMoviesR2: number };
}

export const getStatsSummary = async (): Promise<SystemStats> => {
  try {
    const statsDoc = await getDoc(doc(db, 'system_analytics', 'global_counters'));
    const data = statsDoc.exists() ? statsDoc.data() : {};
    
    // Live counts that still need direct queries (small collections)
    const usersRef = collection(db, 'users');
    const roomsRef = collection(db, 'cinema_rooms');
    const moviesRef = collection(db, 'movies');
    
    // Time windows for activity
    const tenMinutesAgo = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
    const twentyFourHoursAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    
    const [usersCount, liveRoomsSnap, moviesCount, onlineCount, dailyCount] = await Promise.all([
      getCountFromServer(usersRef),
      getDocs(query(roomsRef, where('status', '==', 'live'))),
      getCountFromServer(moviesRef),
      getCountFromServer(query(usersRef, where('lastActive', '>=', tenMinutesAgo))),
      getCountFromServer(query(usersRef, where('lastActive', '>=', twentyFourHoursAgo)))
    ]);

    // Format Page Stats
    const pages = data.pages || {};
    const pageVisitsRanked = Object.entries(pages).map(([page, s]: any) => ({
      page,
      count: s.count || 0,
      avgTimeSpent: s.count > 0 ? Math.round(s.totalTime / s.count / 1000) : 0
    })).sort((a, b) => b.count - a.count);

    // Format Geo Stats
    const countries = data.countries || {};
    const states = data.states || {};
    const devices = data.devices || {};

    const topCountries = Object.entries(countries).map(([country, count]: any) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    const topStates = Object.entries(states).map(([state, count]: any) => ({ state, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    const topDevices = Object.entries(devices).map(([device, count]: any) => ({ device, count })).sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      totalUsers: usersCount.data().count,
      totalVisits: data.totalVisits || 0,
      onlineNow: onlineCount.data().count,
      dailyActiveUsers: dailyCount.data().count,
      topCountries,
      topStates,
      topUsers: [], // Simplified to save costs
      featureUsage: [],
      topSearches: [],
      topMovies: [],
      peakHours: [],
      topPlatforms: [],
      topDevices,
      
      // High-Fidelity
      pageVisitsRanked,
      userBehavior: {
        clicks: data.actions?.click || 0,
        taps: data.actions?.tap || 0,
        abandonedActions: data.actions?.room_creation_abandoned || 0
      },
      watchHistoryCount: data.actions?.watch || 0,
      roomCreationStats: { 
        total: data.actions?.create_room || 0, 
        frequency: "Live" 
      },
      inviteStats: { 
        sent: data.invites?.sent || 0, 
        accepted: data.invites?.accepted || 0, 
        rate: data.invites?.sent > 0 ? Math.round((data.invites.accepted / data.invites.sent) * 100) : 0 
      },
      snackPurchases: { 
        total: data.payments?.success?.count || 0, 
        amount: data.payments?.success?.totalAmount || 0 
      },
      paymentStats: { 
        successful: data.payments?.success?.count || 0, 
        failed: data.payments?.failed?.count || 0, 
        rate: ( (data.payments?.success?.count || 0) + (data.payments?.failed?.count || 0) ) > 0 
          ? Math.round((data.payments.success.count / (data.payments.success.count + data.payments.failed.count)) * 100) 
          : 0 
      },
      liveSystem: { 
        activeRooms: liveRoomsSnap.size, 
        totalMoviesR2: moviesCount.data().count 
      }
    };
  } catch (error) { 
    console.error('Stats Error:', error);
    throw new Error('Failed to fetch system statistics'); 
  }
};

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

// --- MOVIE CLOUD & PRE-ORDER SYSTEM ---

export interface CloudMovie {
  id: string;
  title: string;
  thumbnail: string;
  description: string;
  year: string;
  rating: string;
  streamUrl: string;
  downloadUrl: string;
  mediaType: 'movie' | 'series';
  season?: string;
  episode?: string;
  addedAt: number;
}

export interface PreOrder {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  movieId: string;
  title: string;
  thumbnail: string;
  status: 'pending' | 'available';
  userStatus: 'none' | 'watched' | 'downloaded';
  movieUrl?: string;
  mediaType: 'movie' | 'series';
  season?: string;
  episode?: string;
  requestedAt: number;
  availableAt?: number;
}

export const checkCloudMovie = async (movieId: string, season?: string | number, episode?: string | number): Promise<CloudMovie | null> => {
  try {
    let q = query(collection(db, 'movies'), where('id', '==', movieId));
    if (season !== undefined) q = query(q, where('season', '==', season.toString()));
    if (episode !== undefined) q = query(q, where('episode', '==', episode.toString()));
    
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { ...snap.docs[0].data(), id: snap.docs[0].id } as CloudMovie;
  } catch (error) { return null; }
};

export const getCloudMovie = async (movieId: string): Promise<CloudMovie | null> => {
  const docRef = doc(db, 'movies', movieId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id } as CloudMovie;
};

export const createPreOrder = async (
  userId: string, 
  userEmail: string, 
  userName: string, 
  movie: any,
  season?: string,
  episode?: string
): Promise<void> => {
  try {
    const preorderRef = collection(db, 'preorders');
    
    // Check if EXACT pending pre-order already exists
    let q = query(
      preorderRef, 
      where('userId', '==', userId), 
      where('movieId', '==', movie.id || movie.subjectId),
      where('status', '==', 'pending')
    );
    
    if (season) q = query(q, where('season', '==', season));
    if (episode) q = query(q, where('episode', '==', episode));

    const snap = await getDocs(q);
    if (!snap.empty) {
      throw new Error('You already have a pending request for this specific content.');
    }

    await addDoc(preorderRef, {
      userId, userEmail, userName,
      movieId: movie.id || movie.subjectId,
      title: movie.title || movie.name,
      thumbnail: movie.thumbnail || movie.poster,
      mediaType: movie.mediaType || 'movie',
      season: season || null,
      episode: episode || null,
      status: 'pending', userStatus: 'none', requestedAt: Date.now()
    });
  } catch (error: any) { throw new Error(error.message || 'Failed to create pre-order'); }
};

export const uploadToCloud = async (movieData: CloudMovie): Promise<void> => {
  try {
    await setDoc(doc(db, 'movies', movieData.id), { ...movieData, addedAt: Date.now() });
  } catch (error) { throw new Error('Failed to upload movie'); }
};

export const getPreOrders = async (): Promise<PreOrder[]> => {
  try {
    const q = query(collection(db, 'preorders'), orderBy('requestedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PreOrder));
  } catch (error) { return []; }
};

export const getMyPreOrders = async (userId: string): Promise<PreOrder[]> => {
  try {
    const q = query(collection(db, 'preorders'), where('userId', '==', userId), orderBy('requestedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as PreOrder));
  } catch (error: any) {
    if (error?.message?.includes('index')) {
      const q = query(collection(db, 'preorders'), where('userId', '==', userId));
      const snap = await getDocs(q);
      const results = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as PreOrder));
      return results.sort((a, b) => b.requestedAt - a.requestedAt);
    }
    return [];
  }
};

export const updatePreOrderStatus = async (preOrderId: string, status: 'watched' | 'downloaded'): Promise<void> => {
  await updateDoc(doc(db, 'preorders', preOrderId), { userStatus: status });
};

export const fulfillPreOrder = async (preorderId: string, userId: string, movieTitle: string, movieUrl: string, thumbnailUrl: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'preorders', preorderId), { 
      status: 'available', 
      movieUrl, 
      thumbnail: thumbnailUrl, 
      availableAt: Date.now() 
    });
    
    const notifRef = collection(db, 'users', userId, 'notifications');
    await addDoc(notifRef, {
      title: '🎥 Movie Ready!',
      message: `The movie "${movieTitle}" you pre-ordered is now live! You can watch or download it now.`,
      timestamp: Date.now(),
      read: false,
      type: 'update',
      link: `/?tab=movie&preorder=${preorderId}`
    });
    await updateDoc(doc(db, 'users', userId), { unreadCount: increment(1) });
  } catch (error) { throw new Error('Failed to fulfill pre-order'); }
};

// --- Store, Vendors, Partners ---

export const getVendors = async (): Promise<Vendor[]> => {
  const snap = await getDocs(collection(db, 'vendors'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor));
};

export const updateVendor = async (vendor: Vendor): Promise<void> => {
  await setDoc(doc(db, 'vendors', vendor.id), vendor);
};

export const getProducts = async (): Promise<Product[]> => {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
};

export const addProduct = async (product: Omit<Product, 'id'>): Promise<void> => {
  await addDoc(collection(db, 'products'), { ...product, createdAt: Date.now() });
};

export const updateProduct = async (id: string, product: Partial<Product>): Promise<void> => {
  await updateDoc(doc(db, 'products', id), product);
};

export const deleteProduct = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'products', id));
};

export const getPartners = async (): Promise<Partner[]> => {
  const snap = await getDocs(collection(db, 'partners'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Partner));
};

export const addPartner = async (partner: Omit<Partner, 'id'>): Promise<void> => {
  await addDoc(collection(db, 'partners'), partner);
};

export const deletePartner = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'partners', id));
};

export const placeOrder = async (order: Omit<Order, 'id' | 'createdAt' | 'status'>): Promise<string> => {
  const docRef = await addDoc(collection(db, 'orders'), { ...order, status: 'pending', createdAt: Date.now() });
  return docRef.id;
};

export const uploadFile = async (file: File, _path: string, bucketType: 'assets' | 'movies' = 'assets'): Promise<string> => {
  if (!auth.currentUser) throw new Error("Must be logged in to upload files.");
  const token = await auth.currentUser.getIdToken();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const response = await fetch(`${API_URL}/api/cinema/presigned-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ file_name: file.name, content_type: file.type, bucket_type: bucketType })
  });

  if (!response.ok) throw new Error('Failed to get upload URL');
  const { upload_url, public_url } = await response.json();

  const uploadResponse = await fetch(upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type }
  });

  if (!uploadResponse.ok) throw new Error('Failed to upload file to storage');
  return public_url;
};

export const deleteVendor = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'vendors', id));
};

export default app;
