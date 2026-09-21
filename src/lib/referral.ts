import { auth } from './firebase';

const REFERRAL_KEY = 'aura_referral_code';
const COOKIE_NAME = 'aura_referral_code';

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
      if (cleanCode.length >= 4) {
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
    if (local && local.trim()) return local.trim();

    // 2. Check sessionStorage
    const session = sessionStorage.getItem(REFERRAL_KEY);
    if (session && session.trim()) return session.trim();

    // 3. Check Cookie fallback
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + COOKIE_NAME + '=([^;]*)'));
    if (match && match[2]) {
      const decoded = decodeURIComponent(match[2]).trim();
      if (decoded) {
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
 * Calls backend to securely process the referral bonus and notifications.
 */
export const processReferralSignup = async (newUserUid: string, referrerUid: string): Promise<boolean> => {
  if (!referrerUid || referrerUid === newUserUid) return false;

  try {
    const token = await auth.currentUser?.getIdToken();
    const apiUrl = import.meta.env.VITE_API_URL || '';
    
    const response = await fetch(`${apiUrl}/api/games/process-referral`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ referrerUid })
    });

    if (response.ok) {
      const result = await response.json();
      return result.success ?? true;
    }
  } catch (err) {
    console.warn('Backend referral processing error:', err);
  }
  return false;
};
