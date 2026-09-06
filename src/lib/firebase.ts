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
  increment,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import type { User, GlobalHistoryItem, HistoryItem, Vendor, Product, Partner, Order, ProductReview } from '../types';

export type { User, GlobalHistoryItem, HistoryItem, Vendor, Product, Partner, Order, ProductReview };

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

// Robust Firestore initialization to prevent "INTERNAL ASSERTION FAILED: Unexpected state"
let dbInstance: any = null;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager() 
    }),
    experimentalAutoDetectLongPolling: true
  });
} catch (e) {
  dbInstance = getFirestore(app);
}
export const db = dbInstance;

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
  type: 'update' | 'alert' | 'general' | 'preorder_delivered' | 'success' | 'withdrawal_approved' | 'order_update' | 'order_accepted' | 'order_shipped' | 'order_delivered' | 'order_cancelled' | string;
  link?: string;
  orderId?: string;
  orderNumber?: string;
  vendorId?: string;
  vendorName?: string;
  orderStatus?: string;
  estimatedDeliveryTime?: string;
  ratingPrompt?: boolean;
  rated?: boolean;
  rating?: number;
  preorderId?: string;
  movieId?: string;
  movieTitle?: string;
  movieUrl?: string;
  thumbnailUrl?: string;
  mediaType?: 'movie' | 'series';
  season?: string;
  episode?: string;
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
      const rawNotifs = snapshot.docs.map(doc => {
        const data = doc.data();
        let ts = Date.now();
        if (data.timestamp?.toMillis) ts = data.timestamp.toMillis();
        else if (data.timestamp?.seconds) ts = data.timestamp.seconds * 1000;
        else if (data.timestamp instanceof Date) ts = data.timestamp.getTime();
        else if (typeof data.timestamp === 'number') ts = data.timestamp;
        return { id: doc.id, ...data, timestamp: ts };
      }) as AppNotification[];
      
      rawNotifs.sort((a, b) => b.timestamp - a.timestamp);

      // Deduplicate notifications by (orderId + type) or (id)
      const seen = new Set<string>();
      const notifs: AppNotification[] = [];
      for (const n of rawNotifs) {
        const key = n.orderId && n.type ? `${n.orderId}_${n.type}` : n.id;
        if (!seen.has(key)) {
          seen.add(key);
          notifs.push(n);
        }
      }

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
        bonusBalance: increment(100),
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
export const toggleVendorStatus = async (uid: string, isVendor: boolean): Promise<void> => { await updateDoc(doc(db, 'users', uid), { isVendor }); };
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
    
    // Live collections references
    const usersRef = collection(db, 'users');
    const roomsRef = collection(db, 'cinema_rooms');
    const moviesRef = collection(db, 'movies');
    const visitsRef = collection(db, 'visits');
    const searchesRef = collection(db, 'searches');
    const featureRef = collection(db, 'feature_usage');
    const interactionsRef = collection(db, 'interactions');
    const inviteEventsRef = collection(db, 'invite_events');
    const downloadsRef = collection(db, 'downloads');
    
    // Time windows for activity
    const tenMinutesAgo = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
    const twentyFourHoursAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    
    const [
      usersCount, 
      liveRoomsSnap, 
      moviesCount, 
      onlineCount, 
      dailyCount,
      visitsSnap,
      searchesSnap,
      featuresSnap,
      interactionsSnap,
      inviteSnap,
      downloadsCount,
      usersSnap
    ] = await Promise.all([
      getCountFromServer(usersRef),
      getDocs(query(roomsRef, where('status', '==', 'live'))),
      getCountFromServer(moviesRef),
      getCountFromServer(query(usersRef, where('lastActive', '>=', tenMinutesAgo))),
      getCountFromServer(query(usersRef, where('lastActive', '>=', twentyFourHoursAgo))),
      getDocs(visitsRef),
      getDocs(searchesRef),
      getDocs(featureRef),
      getDocs(interactionsRef),
      getDocs(inviteEventsRef),
      getCountFromServer(downloadsRef),
      getDocs(query(usersRef, limit(10)))
    ]);

    const usersCountVal = usersCount.data().count;
    const onlineNowVal = onlineCount.data().count;
    const dailyActiveUsersVal = dailyCount.data().count;

    // 1. Process visits collection for geo / device / peak statistics
    const visitsData = visitsSnap.docs.map(doc => doc.data());
    const totalVisits = visitsData.length;

    const countryCounts: Record<string, number> = {};
    const stateCounts: Record<string, number> = {};
    const deviceCounts: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};

    visitsData.forEach(v => {
      if (v.country) countryCounts[v.country] = (countryCounts[v.country] || 0) + 1;
      if (v.state) stateCounts[v.state] = (stateCounts[v.state] || 0) + 1;
      if (v.device) deviceCounts[v.device] = (deviceCounts[v.device] || 0) + 1;
      if (v.timestamp) {
        let date: Date | null = null;
        if (typeof v.timestamp.toDate === 'function') date = v.timestamp.toDate();
        else if (v.timestamp.seconds) date = new Date(v.timestamp.seconds * 1000);
        else date = new Date(v.timestamp);
        
        if (date && !isNaN(date.getTime())) {
          const hr = date.getHours();
          hourCounts[hr] = (hourCounts[hr] || 0) + 1;
        }
      }
    });

    const topCountries = Object.entries(countryCounts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topStates = Object.entries(stateCounts)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topDevices = Object.entries(deviceCounts)
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const peakHours = Object.entries(hourCounts)
      .map(([hrStr, count]) => {
        const hr = parseInt(hrStr, 10);
        const ampm = hr >= 12 ? 'PM' : 'AM';
        const displayHr = hr % 12 === 0 ? 12 : hr % 12;
        return { hour: hr, display: `${displayHr}:00 ${ampm}`, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // 2. Process page visits from global_counters
    const pages = data.pages || {};
    const pageVisitsRanked = Object.entries(pages).map(([page, s]: any) => ({
      page,
      count: s.count || 0,
      avgTimeSpent: s.count > 0 ? Math.round(s.totalTime / s.count / 1000) : 0
    })).sort((a, b) => b.count - a.count);

    // 3. Process Searches
    const searchCounts: Record<string, number> = {};
    searchesSnap.docs.forEach(doc => {
      const q = doc.data().query;
      if (q) searchCounts[q] = (searchCounts[q] || 0) + 1;
    });
    const topSearches = Object.entries(searchCounts)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 4. Process Feature Usage
    const featureCounts: Record<string, number> = {};
    featuresSnap.docs.forEach(doc => {
      const f = doc.data().feature;
      if (f) featureCounts[f] = (featureCounts[f] || 0) + 1;
    });
    const featureUsage = Object.entries(featureCounts)
      .map(([feature, count]) => ({ feature, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 5. Process Interactions (Top Movies)
    const movieWatches: Record<string, number> = {};
    const movieDownloads: Record<string, number> = {};
    interactionsSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.title) {
        if (d.action === 'watch') movieWatches[d.title] = (movieWatches[d.title] || 0) + 1;
        if (d.action === 'download') movieDownloads[d.title] = (movieDownloads[d.title] || 0) + 1;
      }
    });
    const allMovieTitles = Array.from(new Set([...Object.keys(movieWatches), ...Object.keys(movieDownloads)]));
    const topMovies = allMovieTitles.map(title => ({
      title,
      watches: movieWatches[title] || 0,
      downloads: movieDownloads[title] || 0
    }))
    .sort((a, b) => (b.watches + b.downloads) - (a.watches + a.downloads))
    .slice(0, 5);

    // 6. Process Invite Stats
    let invitesSent = 0;
    let invitesAccepted = 0;
    inviteSnap.docs.forEach(doc => {
      const act = doc.data().action;
      if (act === 'sent') invitesSent++;
      if (act === 'accepted') invitesAccepted++;
    });
    const inviteStats = {
      sent: invitesSent,
      accepted: invitesAccepted,
      rate: invitesSent > 0 ? Math.round((invitesAccepted / invitesSent) * 100) : 0
    };

    // 7. Process Users List
    const topUsers = usersSnap.docs.map(doc => {
      const u = doc.data();
      return {
        email: u.email || 'No email',
        name: u.displayName || u.userName || 'Anonymous',
        visits: u.visitCount || 0,
        timeSpent: u.timeSpent || 0,
        recentActivity: []
      };
    }).sort((a, b) => b.visits - a.visits);

    // 8. User Behavior click/tap counts
    const clicks = data.actions?.click || 0;
    const taps = data.actions?.tap || 0;
    const abandonedActions = data.actions?.room_creation_abandoned || 0;

    // 9. Watch history downloads count
    const watchHistoryCount = downloadsCount.data().count;

    // 10. Room Creations
    const roomCreationStats = { 
      total: data.actions?.create_room || 0, 
      frequency: "Live" 
    };

    // 11. Payments & Purchases
    const paymentsCount = data.payments?.success?.count || 0;
    const paymentsAmount = data.payments?.success?.totalAmount || 0;

    const snackPurchases = { 
      total: paymentsCount, 
      amount: paymentsAmount 
    };

    const paymentStats = { 
      successful: data.payments?.success?.count || 0, 
      failed: data.payments?.failed?.count || 0, 
      rate: ( (data.payments?.success?.count || 0) + (data.payments?.failed?.count || 0) ) > 0 
        ? Math.round((data.payments.success.count / (data.payments.success.count + data.payments.failed.count)) * 100) 
        : 0 
    };

    // Derived top platforms from interactions
    const platformCounts: Record<string, number> = {};
    interactionsSnap.docs.forEach(doc => {
      const p = doc.data().platform;
      if (p) platformCounts[p] = (platformCounts[p] || 0) + 1;
    });
    const topPlatforms = Object.entries(platformCounts)
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalUsers: usersCountVal,
      totalVisits,
      onlineNow: onlineNowVal,
      dailyActiveUsers: dailyActiveUsersVal,
      topCountries,
      topStates,
      topUsers,
      featureUsage,
      topSearches,
      topMovies,
      peakHours,
      topPlatforms,
      topDevices,
      
      // High-Fidelity
      pageVisitsRanked,
      userBehavior: {
        clicks,
        taps,
        abandonedActions
      },
      watchHistoryCount,
      roomCreationStats,
      inviteStats,
      snackPurchases,
      paymentStats,
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

export const fulfillPreOrder = async (
  preorderId: string, 
  userId: string, 
  movieTitle: string, 
  movieUrl: string, 
  thumbnailUrl: string,
  movieId?: string,
  mediaType?: 'movie' | 'series',
  season?: string,
  episode?: string
): Promise<void> => {
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
      type: 'preorder_delivered',
      link: `/?tab=movie&preorder=${preorderId}`,
      preorderId,
      movieId: movieId || '',
      movieTitle,
      movieUrl,
      thumbnailUrl,
      mediaType: mediaType || 'movie',
      season: season || '',
      episode: episode || ''
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

export const deleteCloudflareAsset = async (url: string): Promise<boolean> => {
  if (!url) return false;
  try {
    const token = await auth.currentUser?.getIdToken();
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const res = await fetch(`${API_URL}/api/cinema/delete-asset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ url })
    });
    return res.ok;
  } catch (err) {
    console.warn('Failed to delete asset from Cloudflare:', err);
    return false;
  }
};

export const deleteProduct = async (id: string, imageUrl?: string): Promise<void> => {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  let backendSuccess = false;

  // 1. Attempt backend atomic deletion (handles database + Cloudflare R2 securely)
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_URL}/api/cinema/products/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        backendSuccess = true;
      } else {
        const err = await res.json().catch(() => ({}));
        console.warn('Backend product delete returned status', res.status, err);
      }
    } catch (e) {
      console.warn('Backend product delete request failed, falling back to direct client deletion:', e);
    }
  }

  // 2. Direct client fallback if backend was unavailable
  if (!backendSuccess) {
    let assetUrl = imageUrl;
    if (!assetUrl) {
      try {
        const prodSnap = await getDoc(doc(db, 'products', id));
        if (prodSnap.exists()) {
          assetUrl = prodSnap.data()?.image;
        }
      } catch (err) {
        console.warn('Could not read product doc for asset cleanup:', err);
      }
    }

    if (assetUrl) {
      await deleteCloudflareAsset(assetUrl).catch(e => console.warn('Cloudflare deletion error:', e));
    }

    await deleteDoc(doc(db, 'products', id));
  }
};

export const getPartners = async (): Promise<Partner[]> => {
  const snap = await getDocs(collection(db, 'partners'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Partner));
};

export const addPartner = async (partner: Omit<Partner, 'id'>): Promise<void> => {
  await addDoc(collection(db, 'partners'), partner);
};

export const deletePartner = async (id: string, logoUrl?: string): Promise<void> => {
  let assetUrl = logoUrl;
  if (!assetUrl) {
    try {
      const snap = await getDoc(doc(db, 'partners', id));
      if (snap.exists()) {
        assetUrl = snap.data()?.logo;
      }
    } catch (e) {}
  }
  if (assetUrl) {
    await deleteCloudflareAsset(assetUrl).catch(() => {});
  }
  await deleteDoc(doc(db, 'partners', id));
};

export const generateOrderNumber = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomCode = '';
  for (let i = 0; i < 6; i++) {
    randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ORD-${randomCode}`;
};

export const placeOrder = async (order: Omit<Order, 'id' | 'createdAt' | 'status'> & { orderNumber?: string }): Promise<{ id: string; orderNumber: string }> => {
  const orderNumber = order.orderNumber || generateOrderNumber();
  const docRef = await addDoc(collection(db, 'orders'), { 
    ...order, 
    orderNumber,
    status: 'pending', 
    createdAt: Date.now() 
  });
  return { id: docRef.id, orderNumber };
};

export const updateOrderStatus = async (
  orderId: string, 
  status: 'accepted' | 'shipped' | 'delivered' | 'cancelled',
  estimatedDeliveryTime?: string,
  extra?: { vendorId?: string; userId?: string; orderNumber?: string; vendorName?: string }
): Promise<void> => {
  const orderRef = doc(db, 'orders', orderId);
  const nowMs = Date.now();
  const updateData: any = {
    status,
    [`${status}At`]: nowMs
  };
  if (estimatedDeliveryTime) {
    updateData.estimatedDeliveryTime = estimatedDeliveryTime;
  }
  await updateDoc(orderRef, updateData);

  // Retrieve userId, orderNumber, vendorName if not passed in extra
  let targetUserId = extra?.userId;
  let targetOrderNum = extra?.orderNumber;
  let targetVendorName = extra?.vendorName;
  let targetVendorId = extra?.vendorId;

  if (!targetUserId || !targetOrderNum || !targetVendorName) {
    try {
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        const d = snap.data();
        targetUserId = targetUserId || d.userId;
        targetOrderNum = targetOrderNum || d.orderNumber || orderId.substring(0, 8).toUpperCase();
        targetVendorName = targetVendorName || d.vendorName || 'Vendor';
        targetVendorId = targetVendorId || d.vendorId;
      }
    } catch (e) {
      console.warn('Failed to retrieve order details for notification:', e);
    }
  }

  // 1. Instant Direct In-App Notification creation for customer using deterministic doc ID
  if (targetUserId) {
    try {
      let notifTitle = '';
      let notifMsg = '';
      const notifType = `order_${status}`;
      let ratingPrompt = false;

      if (status === 'accepted') {
        notifTitle = `✅ Order Accepted - #${targetOrderNum}`;
        notifMsg = `Your order #${targetOrderNum} was just accepted by ${targetVendorName} and is being processed!`;
      } else if (status === 'shipped') {
        notifTitle = `🚚 Order Out for Delivery - #${targetOrderNum}`;
        const etaText = estimatedDeliveryTime ? ` and would arrive in ${estimatedDeliveryTime}.` : '.';
        notifMsg = `Your product is out for delivery and on its way${etaText}`;
      } else if (status === 'delivered') {
        notifTitle = `🎉 Order Delivered - #${targetOrderNum}`;
        notifMsg = `Your order #${targetOrderNum} was delivered successfully! Please rate your experience with ${targetVendorName} in app.`;
        ratingPrompt = true;
      } else if (status === 'cancelled') {
        notifTitle = `❌ Order Cancelled - #${targetOrderNum}`;
        notifMsg = `Your order #${targetOrderNum} has been cancelled by ${targetVendorName}.`;
      }

      const notifDocId = `order_${orderId}_${status}`;
      await setDoc(doc(db, 'users', targetUserId, 'notifications', notifDocId), {
        title: notifTitle,
        message: notifMsg,
        timestamp: nowMs,
        read: false,
        type: notifType,
        orderId,
        orderNumber: targetOrderNum,
        vendorId: targetVendorId || '',
        vendorName: targetVendorName || 'Vendor',
        orderStatus: status,
        estimatedDeliveryTime: estimatedDeliveryTime || '',
        ratingPrompt,
        rated: false
      }, { merge: true });
      await updateDoc(doc(db, 'users', targetUserId), { unreadCount: increment(1) }).catch(() => {});
    } catch (notifErr) {
      console.warn('Direct order notification write error:', notifErr);
    }
  }

  // 2. Sync to Backend to update Telegram group message & buttons
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`${API_URL}/api/store/order/status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderId,
        status,
        estimatedDeliveryTime,
        vendorId: targetVendorId,
        userId: targetUserId
      })
    });
  } catch (err) {
    console.warn('Backend order status sync warning:', err);
  }
};

export const listenToProductReviews = (productId: string, callback: (reviews: ProductReview[]) => void) => {
  if (!productId) return () => {};
  const q = query(collection(db, 'products', productId, 'reviews'), limit(50));
  return onSnapshot(q, (snap) => {
    const rawList = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductReview));
    rawList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    // Deduplicate reviews by unique (orderId + userId) or id
    const seen = new Set<string>();
    const list: ProductReview[] = [];
    for (const r of rawList) {
      const key = r.orderId && r.userId ? `${r.orderId}_${r.userId}` : r.id;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(r);
      }
    }
    callback(list);
  }, (err) => console.warn('Product reviews listener warning:', err));
};

export const rateVendorOrder = async (
  orderId: string,
  vendorId: string,
  rating: number,
  review?: string,
  notifId?: string,
  userId?: string
): Promise<void> => {
  const uid = userId || auth.currentUser?.uid;
  const nowMs = Date.now();
  let userName = auth.currentUser?.displayName || 'Customer';
  let orderItems: any[] = [];
  let resolvedVendorId = vendorId;

  const revDocId = `review_${orderId}_${uid || 'anon'}`;

  // 1. Direct Firestore updates (Immediate, reliable, and offline-resilient)
  try {
    let wasAlreadyRated = false;
    if (orderId) {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        const oData = snap.data();
        wasAlreadyRated = !!oData.rated;
        userName = oData.userName || oData.customerName || userName;
        orderItems = oData.items || [];
        resolvedVendorId = oData.vendorId || resolvedVendorId;
      }
      await setDoc(orderRef, {
        rated: true,
        rating,
        review: review || '',
        ratedAt: nowMs
      }, { merge: true });
    }

    if (uid && notifId) {
      await setDoc(doc(db, 'users', uid, 'notifications', notifId), {
        rated: true,
        rating
      }, { merge: true });
    }

    // Save review document to root reviews using deterministic ID
    const reviewData: any = {
      id: revDocId,
      orderId,
      vendorId: resolvedVendorId,
      userId: uid || '',
      userName,
      rating,
      review: review || '',
      createdAt: nowMs
    };

    await setDoc(doc(db, 'reviews', revDocId), reviewData, { merge: true }).catch(() => {});

    // Save review to each product & update product average rating
    for (const item of orderItems) {
      const pId = item.productId || item.id;
      if (pId) {
        try {
          const pRef = doc(db, 'products', pId);
          await setDoc(doc(pRef, 'reviews', revDocId), reviewData, { merge: true });
          
          if (!wasAlreadyRated) {
            const pSnap = await getDoc(pRef);
            if (pSnap.exists()) {
              const pData = pSnap.data();
              const curCount = Number(pData.reviewCount || pData.ratingCount || 0);
              const curPoints = Number(pData.totalRatingPoints || (pData.rating ? pData.rating * curCount : 0));
              const newCount = curCount + 1;
              const newPoints = curPoints + rating;
              const avg = Math.round((newPoints / newCount) * 10) / 10;
              await setDoc(pRef, {
                rating: avg,
                reviewCount: newCount,
                ratingCount: newCount,
                totalRatingPoints: newPoints,
                updatedAt: nowMs
              }, { merge: true });
            }
          }
        } catch (pe) {
          console.warn('Failed to record review on product:', pe);
        }
      }
    }

    // Update vendor rating
    if (resolvedVendorId && !wasAlreadyRated) {
      try {
        const vRef = doc(db, 'vendors', resolvedVendorId);
        const vSnap = await getDoc(vRef);
        const vData = vSnap.exists() ? vSnap.data() : {};
        const curCount = Number(vData.ratingCount || vData.reviewCount || 0);
        const curPoints = Number(vData.totalRatingPoints || (vData.rating ? vData.rating * curCount : 0));
        const newCount = curCount + 1;
        const newPoints = curPoints + rating;
        const avg = Math.round((newPoints / newCount) * 10) / 10;
        await setDoc(vRef, {
          rating: avg,
          ratingCount: newCount,
          reviewCount: newCount,
          totalRatingPoints: newPoints
        }, { merge: true });
      } catch (ve) {
        console.warn('Failed to update vendor rating in Firestore:', ve);
      }
    }
  } catch (directErr) {
    console.warn('Direct Firestore rate error:', directErr);
  }

  // 2. Call backend API for synchronization
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`${API_URL}/api/store/rate-vendor`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderId,
        vendorId: resolvedVendorId,
        userId: uid,
        rating,
        review: review || '',
        notificationId: notifId
      })
    });
  } catch (e) {
    console.warn('Backend rate API sync skipped:', e);
  }
};

export const addUserNotification = async (
  userId: string,
  notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>
): Promise<void> => {
  try {
    const notifRef = collection(db, 'users', userId, 'notifications');
    await addDoc(notifRef, {
      ...notification,
      timestamp: Date.now(),
      read: false
    });
    await updateDoc(doc(db, 'users', userId), { unreadCount: increment(1) });
  } catch (error) {
    console.warn('Failed to add user notification:', error);
  }
};

export const uploadFile = async (
  file: File, 
  _path: string, 
  bucketType: 'assets' | 'movies' = 'assets',
  onProgress?: (percent: number) => void
): Promise<string> => {
  if (!auth.currentUser) throw new Error("Must be logged in to upload files.");
  const token = await auth.currentUser.getIdToken();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for high speed

  // --- OPTION A: Small files (< 5MB) use single-shot upload ---
  if (file.size <= CHUNK_SIZE) {
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

    if (!uploadResponse.ok) throw new Error('Failed to upload file');
    if (onProgress) onProgress(100);
    return public_url;
  }

  // --- OPTION B: Large files (> 5MB) use Multipart Upload for speed ---
  try {
    // 1. Initiate
    const initResp = await fetch(`${API_URL}/api/cinema/multipart/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ file_name: file.name, content_type: file.type, bucket_type: bucketType })
    });
    const { upload_id, key, public_url } = await initResp.json();

    // 2. Chunking logic
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    const parts: { ETag: string, PartNumber: number }[] = [];
    
    // We upload in parallel batches of 3 for extreme speed without crashing the browser
    for (let i = 0; i < totalParts; i += 3) {
      const batch = [];
      for (let j = 0; j < 3 && (i + j) < totalParts; j++) {
        const partNumber = i + j + 1;
        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(partNumber * CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        
        batch.push((async () => {
          // Get presigned URL for this part
          const signResp = await fetch(`${API_URL}/api/cinema/multipart/presign-part`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ upload_id, key, part_number: partNumber, bucket_type: bucketType })
          });
          const { upload_url } = await signResp.json();

          // Upload the chunk
          const uploadResp = await fetch(upload_url, {
            method: 'PUT',
            body: chunk
          });
          
          if (!uploadResp.ok) throw new Error(`Part ${partNumber} failed`);
          const etag = uploadResp.headers.get('ETag');
          if (!etag) throw new Error(`Part ${partNumber} missing ETag`);
          
          parts.push({ ETag: etag.replace(/\"/g, ''), PartNumber: partNumber });
          
          if (onProgress) {
            const uploadedSoFar = parts.length;
            onProgress(Math.round((uploadedSoFar / totalParts) * 100));
          }
        })());
      }
      await Promise.all(batch);
    }

    // 3. Complete
    const completeResp = await fetch(`${API_URL}/api/cinema/multipart/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ 
        upload_id, 
        key, 
        parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
        bucket_type: bucketType 
      })
    });

    if (!completeResp.ok) throw new Error('Failed to join movie parts');
    return public_url;

  } catch (err: any) {
    console.error("High-speed upload failed:", err);
    throw new Error(err.message || "Parallel upload failed");
  }
};

export const deleteVendor = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'vendors', id));
};

export default app;
