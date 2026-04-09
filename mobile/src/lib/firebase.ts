/**
 * Firebase & Google Sign-In Configuration for Mobile
 */

import { initializeApp } from 'firebase/app';
import { 
  initializeAuth,
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential
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
  addDoc,
  writeBatch,
  onSnapshot,
  initializeFirestore
} from 'firebase/firestore';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, GlobalHistoryItem } from '../types';

// Conditionally import GoogleSignin to prevent crashing in Expo Go
let GoogleSignin: any = null;
try {
  const GoogleSigninModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = GoogleSigninModule.GoogleSignin;
} catch (e) {
  console.warn('Google Sign-In native module not found. It will not work in Expo Go.');
}

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_VITE_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_VITE_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

// Fix for Persistence Warning: Use initializeAuth with AsyncStorage
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

// Initialize Google Sign-In safely
if (GoogleSignin) {
  GoogleSignin.configure({
    webClientId: '394951930000-rc8dsf6rlkhr7r531ovdsipgqrnr72lu.apps.googleusercontent.com',
    offlineAccess: true,
  });
}

/**
 * ACTIONS
 */

export const signInGoogle = async (): Promise<User> => {
  if (!GoogleSignin) {
    Alert.alert(
      'Development Build Required', 
      'Google Sign-In requires a custom development build. Please use Email/Password for now.'
    );
    throw new Error('Google Sign-In not available in Expo Go');
  }

  try {
    await GoogleSignin.hasPlayServices();
    const { idToken } = await GoogleSignin.signIn();
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    const user = result.user;
    
    const userData: User = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      isAdmin: false,
      createdAt: Date.now()
    };
    
    await setDoc(doc(db, 'users', user.uid), userData, { merge: true });
    return userData;
  } catch (error: any) {
    throw new Error(error.message || 'Google Sign-In failed');
  }
};

export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<User> => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const user = result.user;
  await updateProfile(user, { displayName });
  const userData: User = {
    uid: user.uid, email: user.email, displayName: displayName,
    photoURL: null, isAdmin: false, createdAt: Date.now()
  };
  await setDoc(doc(db, 'users', user.uid), userData);
  return userData;
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const user = result.user;
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (userDoc.exists()) return { ...userDoc.data(), uid: user.uid } as User;
  return { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL, isAdmin: false, createdAt: Date.now() };
};

export const logOut = async (): Promise<void> => {
  if (GoogleSignin) {
    try { await GoogleSignin.signOut(); } catch (e) {}
  }
  await signOut(auth);
};

export const onAuthChange = (callback: (user: any | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      callback(userDoc.exists() ? { ...userDoc.data(), uid: firebaseUser.uid } : {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL
      });
    } else callback(null);
  });
};

export const resetPassword = async (email: string): Promise<void> => { await sendPasswordResetEmail(auth, email); };

export const getAllUsers = async (): Promise<User[]> => {
  const snapshot = await getDocs(query(collection(db, 'users'), limit(500)));
  return snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as any));
};

export const getGlobalHistory = async (limitCount = 100): Promise<GlobalHistoryItem[]> => {
  const snapshot = await getDocs(query(collection(db, 'downloads'), orderBy('downloadedAt', 'desc'), limit(limitCount)));
  return snapshot.docs.map(doc => doc.data() as GlobalHistoryItem);
};

export const saveDownloadHistory = async (userId: string, userEmail: string | null, userDisplayName: string | null, historyItem: any): Promise<void> => {
  await addDoc(collection(db, 'downloads'), { ...historyItem, userId, userEmail, userDisplayName, downloadedAt: Date.now() });
};

export const listenToNotifications = (userId: string, callback: (notifs: any[]) => void) => {
  return onSnapshot(query(collection(db, 'users', userId, 'notifications'), limit(50)), (snapshot) => {
    const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(notifs);
  });
};

export const markAsRead = async (userId: string, notifId: string) => { await updateDoc(doc(db, 'users', userId, 'notifications', notifId), { read: true }); };
export const markAllAsRead = async (userId: string) => {
  const snapshot = await getDocs(query(collection(db, 'users', userId, 'notifications'), where('read', '==', false)));
  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
};

export const clearNotification = async (userId: string, notifId: string) => { await deleteDoc(doc(db, 'users', userId, 'notifications', notifId)); };
export const clearAllUserNotifications = async (userId: string) => {
  const snapshot = await getDocs(collection(db, 'users', userId, 'notifications'));
  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
};

export default app;
