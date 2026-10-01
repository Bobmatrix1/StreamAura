import { auth, db } from './firebase';
import { doc, setDoc, getDoc, increment, serverTimestamp, deleteField } from 'firebase/firestore';
import { API_BASE_URL } from '../api/mediaApi';

const REFERRAL_KEY = 'aura_referral_code';
const COOKIE_NAME = 'aura_referral_code';
const VALID_REF_REGEX = /^[a-zA-Z0-9_\-.]{4,128}$/;

/**
 * Extracts and stores referral code from various deep-link parameter formats.
 */
export const captureReferralFromURL = (): string | null => {
  try {
    const url = new URL(window.location.href);
    // Check search params
    let refCode = 
      url.searchParams.get('ref') || 
      url.searchParams.get('referral') || 
      url.searchParams.get('referralCode') || 
      url.searchParams.get('referrer') || 
      url.searchParams.get('r');

    // Check hash params if not found in search params (e.g., #/?ref=...)
    if (!refCode && window.location.hash) {
      const hash = window.location.hash;
      const qIndex = hash.indexOf('?');
      if (qIndex !== -1) {
        const hashParams = new URLSearchParams(hash.substring(qIndex));
        refCode = 
          hashParams.get('ref') || 
          hashParams.get('referral') || 
          hashParams.get('referralCode') || 
          hashParams.get('referrer') || 
          hashParams.get('r');
      }
    }

    // Check pathname patterns (e.g., /ref/USER_UID or /r/USER_UID)
    if (!refCode) {
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2 && (pathParts[0] === 'ref' || pathParts[0] === 'r')) {
        refCode = pathParts[1];
      }
    }

    if (refCode && typeof refCode === 'string') {
      const cleanCode = refCode.trim();
      if (VALID_REF_REGEX.test(cleanCode)) {
        saveReferralCode(cleanCode);
        return cleanCode;
      }
    }
  } catch (err) {
    console.warn('Error capturing referral code from URL:', err);
  }
  return null;
};

/**
 * Stores referral code in localStorage, sessionStorage, and cookies for maximum resilience.
 */
export const saveReferralCode = (code: string): void => {
  if (!code || typeof code !== 'string') return;
  const cleanCode = code.trim();
  if (!VALID_REF_REGEX.test(cleanCode)) return;
  try {
    localStorage.setItem(REFERRAL_KEY, cleanCode);
  } catch {}
  try {
    sessionStorage.setItem(REFERRAL_KEY, cleanCode);
  } catch {}
  try {
    // 30 days expiration cookie
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(cleanCode)}; max-age=2592000; path=/; SameSite=Lax`;
  } catch {}
};

/**
 * Retrieves the stored referral code across storage layers.
 */
export const getStoredReferralCode = (): string | null => {
  try {
    // 1. Check localStorage
    const local = localStorage.getItem(REFERRAL_KEY);
    if (local && VALID_REF_REGEX.test(local.trim())) return local.trim();

    // 2. Check sessionStorage
    const session = sessionStorage.getItem(REFERRAL_KEY);
    if (session && VALID_REF_REGEX.test(session.trim())) return session.trim();

    // 3. Check Cookie fallback
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + COOKIE_NAME + '=([^;]*)'));
    if (match && match[2]) {
      const decoded = decodeURIComponent(match[2]).trim();
      if (VALID_REF_REGEX.test(decoded)) {
        // Rehydrate localStorage & sessionStorage
        saveReferralCode(decoded);
        return decoded;
      }
    }
  } catch (err) {
    console.warn('Error reading stored referral code:', err);
  }
  return null;
};

/**
 * Clears the stored referral code once registered.
 */
export const clearStoredReferralCode = (): void => {
  try {
    localStorage.removeItem(REFERRAL_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(REFERRAL_KEY);
  } catch {}
  try {
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
  } catch {}
};

/**
 * Calls backend to securely process the referral bonus and notifications,
 * with resilient direct Firestore atomic fallback.
 */
export const processReferralSignup = async (newUserUid: string, referrerUid: string): Promise<boolean> => {
  if (!referrerUid || referrerUid === newUserUid) return false;

  // 1. Try Backend API first
  try {
    const token = await auth.currentUser?.getIdToken();
    const apiUrl = API_BASE_URL || import.meta.env.VITE_API_URL || '';
    
    const response = await fetch(`${apiUrl}/api/games/process-referral`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ referrerUid: referrerUid.trim() })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) return true;
    }
  } catch (err) {
    console.warn('Backend referral processing error, falling back to direct Firestore:', err);
  }

  // 2. Direct Firestore Client Fallback (Atomic Increment)
  try {
    const cleanReferrer = referrerUid.trim();
    const referrerRef = doc(db, 'users', cleanReferrer);
    const newUserRef = doc(db, 'users', newUserUid);

    // Prevent duplicate processing
    const userDoc = await getDoc(newUserRef);
    if (userDoc.exists() && userDoc.data()?.referredByProcessed) {
      return true;
    }

    const nowMs = Date.now();
    await setDoc(referrerRef, {
      referredCount: increment(1),
      bonusBalance: increment(500),
      auraCoins: increment(500),
      auraCoin: deleteField()
    }, { merge: true });

    await setDoc(newUserRef, {
      referredBy: cleanReferrer,
      referredByProcessed: true
    }, { merge: true });

    // Activity ledger for referrer
    const actId = `ref_bonus_${newUserUid.slice(0, 8)}_${Math.floor(nowMs / 1000)}`;
    await setDoc(doc(db, 'game_wallets', cleanReferrer, 'activity', actId), {
      type: 'referral_bonus',
      currency: 'auracoin',
      amount: 500,
      title: 'Referral Reward (500 🪙)',
      desc: 'Earned 500 AuraCoins from a new user referral signup!',
      timestamp: serverTimestamp(),
      created_at: nowMs
    });

    // Notification for referrer
    const notifId = `ref_notif_${newUserUid.slice(0, 8)}_${Math.floor(nowMs / 1000)}`;
    await setDoc(doc(db, 'users', cleanReferrer, 'notifications', notifId), {
      title: 'New Referral Earned! 🎉',
      message: 'A new user joined using your referral link! You earned 500 AuraCoins.',
      type: 'referral_reward',
      read: false,
      timestamp: nowMs,
      link: '/referral'
    });

    return true;
  } catch (firestoreErr) {
    console.warn('Direct Firestore referral fallback error:', firestoreErr);
  }

  return false;
};
