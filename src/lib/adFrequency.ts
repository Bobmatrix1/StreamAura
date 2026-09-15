import type { AdCampaign, AdFrequency, AdInteractionSource, AdDismissMethod, AdTelemetryDelta } from '../types';
import { flushAdTelemetryBatch } from './firebase';

const VIEW_STORAGE_PREFIX = 'aura_ad_views_';
const SESS_STORAGE_PREFIX = 'aura_ad_sess_';
const CLICK_STORAGE_PREFIX = 'aura_ad_click_';
const DISMISS_STORAGE_PREFIX = 'aura_ad_dismiss_';

const IMPRESSION_COOLDOWN_MS = 15000; // 15s component re-render deduplication
const CLICK_COOLDOWN_MS = 2000; // 2s anti-spam double-tap debounce per ad
const FLUSH_INTERVAL_MS = 2000; // 2s batch flush debounce window for rapid sync
const POST_CLICK_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h post-click suppression for popup ads
const POST_DISMISS_COOLDOWN_MS = 5 * 60 * 1000; // 5m post-dismissal breathing room

/**
 * In-Memory Telemetry Aggregator Buffer.
 * Collects impressions, clicks, dismissals, and attribution in memory
 * and flushes to Firestore in a single atomic batch operation.
 */
let adTelemetryBuffer: Record<string, AdTelemetryDelta> = {};
let flushTimer: any = null;
const impressionCooldowns = new Map<string, number>();
const clickCooldowns = new Map<string, number>();

const getOrCreateDelta = (adId: string): AdTelemetryDelta => {
  if (!adTelemetryBuffer[adId]) {
    adTelemetryBuffer[adId] = {
      impressions: 0,
      clicks: 0,
      closes: 0,
      impressionsBySource: {},
      clicksBySource: {},
      closesByMethod: {}
    };
  }
  return adTelemetryBuffer[adId];
};

/**
 * Triggers the atomic batch flush to Firestore.
 */
export const flushAdTelemetry = async (): Promise<void> => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const pendingAdIds = Object.keys(adTelemetryBuffer);
  if (pendingAdIds.length === 0) return;

  const currentBatch = adTelemetryBuffer;
  adTelemetryBuffer = {}; // Reset immediately to capture new incoming events

  try {
    await flushAdTelemetryBatch(currentBatch);
  } catch (err) {
    console.warn('Background telemetry flush failed:', err);
  }
};

const scheduleBatchFlush = () => {
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushAdTelemetry().catch(() => {});
    }, FLUSH_INTERVAL_MS);
  }
};

// Automatically flush buffered telemetry on visibility change or page unload
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAdTelemetry().catch(() => {});
    }
  });

  window.addEventListener('pagehide', () => {
    flushAdTelemetry().catch(() => {});
  });

  window.addEventListener('beforeunload', () => {
    flushAdTelemetry().catch(() => {});
  });
}

/**
 * Get impression timestamps for a given ad campaign from local storage
 */
export const getAdViews = (adId: string): number[] => {
  try {
    const raw = localStorage.getItem(`${VIEW_STORAGE_PREFIX}${adId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Calculates the dynamic daily budget for an ad configured with weekly capping.
 * Ensures the ad is paced evenly across the full 7-day period so users who visit
 * heavily in the first 2-3 days do NOT exhaust the cap early.
 */
export const getCalculatedDailyPace = (ad: AdCampaign, views: number[], now: number = Date.now()) => {
  const totalWeeklyCap = Math.max(1, ad.maxPerWeek || 7);
  let dailyBudget: number;
  let remainingDays: number = 7;

  if (ad.startDate && ad.endDate && now >= ad.startDate && now <= ad.endDate) {
    remainingDays = Math.max(1, Math.ceil((ad.endDate - now) / (24 * 60 * 60 * 1000)));
    const campaignViews = views.filter(t => t >= ad.startDate! && t <= ad.endDate!);
    const remainingViews = Math.max(0, totalWeeklyCap - campaignViews.length);
    dailyBudget = Math.max(1, Math.ceil(remainingViews / remainingDays));
  } else {
    const idealDailyRate = totalWeeklyCap / 7;
    // Allow a slight 15% flexible ceiling above ideal daily rate
    dailyBudget = Math.max(1, Math.ceil(idealDailyRate * 1.15));
  }

  return { dailyBudget, remainingDays, totalWeeklyCap };
};

export interface CanShowAdOptions {
  isAppLaunch?: boolean;
}

/**
 * Check if an ad is eligible to be shown right now on the active page
 */
export const canShowAd = (
  ad: AdCampaign, 
  currentView: string,
  options: CanShowAdOptions = {}
): boolean => {
  if (!ad || ad.active === false) return false;

  const hasImage = Boolean(
    ad.imageUrl?.trim() || 
    (ad.imageUrls && ad.imageUrls.length > 0 && ad.imageUrls[0]?.trim()) ||
    (ad.carouselSlides && ad.carouselSlides.length > 0 && ad.carouselSlides[0]?.imageUrl?.trim())
  );
  if (!hasImage) return false;

  const isFlyer = ad.type === 'flyer' || (ad as any).type === 'splash' || (ad as any).type === 'opay_flyer';
  const isPopup = ad.type === 'popup' || (!ad.type && !isFlyer);

  // 1. Format-specific trigger context:
  // Flyer (OPay style launch splash) ONLY triggers on initial app entry, NOT on page switches!
  if (isFlyer && options.isAppLaunch === false) {
    return false;
  }

  // Suppress automatic ads on admin management screens unless specifically targeted to admin
  const cur = (currentView || 'home').toLowerCase();
  const rawTargets = Array.isArray(ad.targetPages) ? ad.targetPages : ['all'];
  const targets = rawTargets.length > 0 ? rawTargets : ['all'];
  const targetsAdminSpecifically = targets.includes('admin') || targets.includes('vendor');

  if ((cur === 'admin' || cur === 'vendor') && !targetsAdminSpecifically) {
    return false;
  }

  // 2. Date schedule check
  const now = Date.now();
  if (ad.startDate && now < ad.startDate) return false;
  if (ad.endDate && now > ad.endDate) return false;

  // 3. Page targeting check (Flyer is app-entry global, Popup respects targeted pages)
  if (!isFlyer) {
    const matchesPage = targets.includes('all') || targets.some(t => t.toLowerCase() === cur);
    if (!matchesPage) return false;
  }

  // 4. Post-Click Suppression (Engaged User Protection)
  // If user clicked this ad in this session or recently, prevent re-popping right in their face!
  if (isPopup || isFlyer) {
    try {
      if (sessionStorage.getItem(`${CLICK_STORAGE_PREFIX}${ad.id}`)) {
        return false;
      }
      const lastClickRaw = localStorage.getItem(`${CLICK_STORAGE_PREFIX}${ad.id}`);
      if (lastClickRaw) {
        const lastClickTs = Number(lastClickRaw) || 0;
        const clickCooldown = ad.frequency === 'always' ? 10 * 60 * 1000 : POST_CLICK_COOLDOWN_MS;
        if (now - lastClickTs < clickCooldown) {
          return false;
        }
      }
    } catch {}

    // 5. Post-Dismissal Breathing Room (Don't re-pop immediately when user just closed the flyer)
    try {
      const lastDismissRaw = localStorage.getItem(`${DISMISS_STORAGE_PREFIX}${ad.id}`);
      if (lastDismissRaw) {
        const lastDismissTs = Number(lastDismissRaw) || 0;
        const dismissCooldown = ad.frequency === 'always' ? 45 * 1000 : POST_DISMISS_COOLDOWN_MS;
        if (now - lastDismissTs < dismissCooldown) {
          return false;
        }
      }
    } catch {}
  }

  // 5. Frequency Capping & Even Pacing Check
  const freq: AdFrequency = ad.frequency || 'always';

  if (freq === 'always') {
    if (isPopup) {
      // 45s breathing room between popups across page visits
      const views = getAdViews(ad.id);
      if (views.length > 0) {
        const lastView = Math.max(...views);
        if (now - lastView < 45 * 1000) {
          return false;
        }
      }
    }
    return true;
  }

  if (freq === 'once_per_session') {
    try {
      if (sessionStorage.getItem(`${SESS_STORAGE_PREFIX}${ad.id}`)) {
        return false;
      }
    } catch {}
    return true;
  }

  const views = getAdViews(ad.id);

  if (freq === 'once_ever') {
    return views.length === 0;
  }

  if (freq === 'once_per_day') {
    const last24h = now - 24 * 60 * 60 * 1000;
    const recent = views.filter(t => t > last24h);
    return recent.length === 0;
  }

  if (freq === 'x_per_day') {
    const max = Math.max(1, ad.maxPerDay || 1);
    const last24h = now - 24 * 60 * 60 * 1000;
    const recent = views.filter(t => t > last24h);
    if (recent.length >= max) {
      return false;
    }

    // Intra-day anti-spam spacing: distribute daily cap evenly
    if (isPopup && recent.length > 0) {
      const minSpacingMs = Math.max(60 * 1000, Math.min(30 * 60 * 1000, Math.floor((10 * 3600 * 1000) / max)));
      const lastView = Math.max(...recent);
      if (now - lastView < minSpacingMs) {
        return false;
      }
    }

    return true;
  }

  if (freq === 'x_per_week') {
    const last7d = now - 7 * 24 * 60 * 60 * 1000;
    const views7d = views.filter(t => t > last7d);
    const { dailyBudget, totalWeeklyCap } = getCalculatedDailyPace(ad, views, now);

    // 1. Weekly hard cap check
    if (views7d.length >= totalWeeklyCap) {
      return false;
    }

    // 2. Daily pacing limit (prevents consuming 50 views in 2-3 days)
    const last24h = now - 24 * 60 * 60 * 1000;
    const views24h = views7d.filter(t => t > last24h);

    if (views24h.length >= dailyBudget) {
      return false;
    }

    // 3. Intra-day spacing between consecutive impressions
    if (isPopup && views24h.length > 0) {
      const intraDaySpacingMs = Math.max(90 * 1000, Math.min(25 * 60 * 1000, Math.floor((8 * 3600 * 1000) / dailyBudget)));
      const lastView = Math.max(...views24h);
      if (now - lastView < intraDaySpacingMs) {
        return false;
      }
    }

    return true;
  }

  return true;
};

/**
 * Clear local session & frequency capping records for testing or ad resets
 */
export const clearAdFrequencyCaps = (adId?: string): void => {
  try {
    if (adId) {
      sessionStorage.removeItem(`${SESS_STORAGE_PREFIX}${adId}`);
      sessionStorage.removeItem(`${CLICK_STORAGE_PREFIX}${adId}`);
      localStorage.removeItem(`${VIEW_STORAGE_PREFIX}${adId}`);
      localStorage.removeItem(`${CLICK_STORAGE_PREFIX}${adId}`);
      localStorage.removeItem(`${DISMISS_STORAGE_PREFIX}${adId}`);
    } else {
      // Clear all aura ad storage
      const sessionKeys = Object.keys(sessionStorage).filter(k => 
        k.startsWith(SESS_STORAGE_PREFIX) || k.startsWith(CLICK_STORAGE_PREFIX)
      );
      sessionKeys.forEach(k => sessionStorage.removeItem(k));
      const localKeys = Object.keys(localStorage).filter(k => 
        k.startsWith(VIEW_STORAGE_PREFIX) || k.startsWith(CLICK_STORAGE_PREFIX) || k.startsWith(DISMISS_STORAGE_PREFIX)
      );
      localKeys.forEach(k => localStorage.removeItem(k));
    }
    impressionCooldowns.clear();
    clickCooldowns.clear();
  } catch (e) {
    console.warn('Error clearing ad frequency caps:', e);
  }
};

/**
 * Record an impression for an ad locally and buffer for low-quota Firestore batch sync
 */
export const recordAdImpressionLocally = (adId: string, source: AdInteractionSource = 'popup') => {
  const now = Date.now();

  // 1. Impression Cooldown / Deduplication check (prevents double-counting fast re-renders)
  const cooldownKey = `${adId}_${source}`;
  const lastImpression = impressionCooldowns.get(cooldownKey) || 0;
  if (now - lastImpression < IMPRESSION_COOLDOWN_MS) {
    return;
  }
  impressionCooldowns.set(cooldownKey, now);

  try {
    // 2. Session storage
    sessionStorage.setItem(`${SESS_STORAGE_PREFIX}${adId}`, '1');

    // 3. Local storage timestamps (retain only last 30 days of data)
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const existing = getAdViews(adId).filter(t => t > thirtyDaysAgo);
    existing.push(now);
    localStorage.setItem(`${VIEW_STORAGE_PREFIX}${adId}`, JSON.stringify(existing));
  } catch (err) {
    console.warn('Ad local impression record error:', err);
  }

  // 4. In-Memory Batch Accumulation (Zero immediate single-doc write calls)
  const delta = getOrCreateDelta(adId);
  delta.impressions = (delta.impressions || 0) + 1;
  if (!delta.impressionsBySource) delta.impressionsBySource = {};
  delta.impressionsBySource[source] = (delta.impressionsBySource[source] || 0) + 1;

  scheduleBatchFlush();
};

/**
 * Record an ad dismissal/close event and buffer into telemetry batch
 */
export const recordAdDismissalLocally = (adId: string, method: AdDismissMethod = 'close_button') => {
  try {
    localStorage.setItem(`${DISMISS_STORAGE_PREFIX}${adId}`, String(Date.now()));
  } catch {}

  const delta = getOrCreateDelta(adId);
  delta.closes = (delta.closes || 0) + 1;
  if (!delta.closesByMethod) delta.closesByMethod = {};
  delta.closesByMethod[method] = (delta.closesByMethod[method] || 0) + 1;

  flushAdTelemetry().catch(() => {});
};

/**
 * Record an ad click event and buffer into telemetry batch with anti-spam cooldown protection.
 * Returns true if the click was registered, or false if debounced.
 */
export const recordAdClickLocally = (adId: string, source: AdInteractionSource = 'popup'): boolean => {
  const now = Date.now();
  const cooldownKey = `${adId}_${source}`;
  const lastClick = clickCooldowns.get(cooldownKey) || 0;

  // Debounce rapid double-taps within 2s cooldown window
  if (now - lastClick < CLICK_COOLDOWN_MS) {
    return false;
  }
  clickCooldowns.set(cooldownKey, now);

  const delta = getOrCreateDelta(adId);
  delta.clicks = (delta.clicks || 0) + 1;
  if (!delta.clicksBySource) delta.clicksBySource = {};
  delta.clicksBySource[source] = (delta.clicksBySource[source] || 0) + 1;

  flushAdTelemetry().catch(() => {});
  return true;
};

const VALID_APP_TABS = new Set([
  'home', 'video', 'music', 'movie', 'series', 'cinema', 'games', 'wallet', 'bulk', 'referral',
  'profile', 'history', 'about', 'privacy', 'terms', 'cookies', 'contact', 'notifications', 'vendor', 'admin'
]);

/**
 * Handle ad click execution (opens link or dispatches internal navigation).
 * Applies same-page click suppression and anti-spam debouncing.
 */
export const handleAdClick = (
  ad: AdCampaign, 
  onNavigate?: (tab: any) => void,
  source: AdInteractionSource = 'popup',
  currentView?: string,
  customTargetUrl?: string
): boolean => {
  if (!ad) return false;

  const rawUrl = (customTargetUrl !== undefined ? customTargetUrl : (ad.targetUrl || '')).trim();
  const cleanTab = rawUrl.replace(/^\//, '').toLowerCase();
  const isInternal = VALID_APP_TABS.has(cleanTab);

  // 1. Same-Page Click Suppression:
  // If the target is an in-app page and user is ALREADY on that exact page,
  // do NOT count as a click or re-dispatch navigation.
  if (isInternal && currentView && currentView.toLowerCase() === cleanTab) {
    return false;
  }

  // 2. Buffer click telemetry with anti-spam cooldown protection
  recordAdClickLocally(ad.id, source);

  // 3. Mark user click interaction to suppress re-popping in this session
  try {
    sessionStorage.setItem(`${CLICK_STORAGE_PREFIX}${ad.id}`, '1');
    localStorage.setItem(`${CLICK_STORAGE_PREFIX}${ad.id}`, String(Date.now()));
  } catch {}

  if (!rawUrl) return true;

  // 4. Internal app navigation
  if (isInternal) {
    if (onNavigate) {
      onNavigate(cleanTab);
    } else {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { view: cleanTab } }));
    }
    return true;
  }

  // 5. Otherwise treat as external link (auto-prepend https:// if protocol is omitted)
  const externalUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  
  // Flush pending telemetry before opening external target
  flushAdTelemetry().catch(() => {});

  window.open(externalUrl, '_blank', 'noopener,noreferrer');
  return true;
};

export interface AdCapProgress {
  capType: 'day' | 'week' | 'session' | 'ever' | 'always';
  capLimit: number;
  currentCount: number;
  remaining: number;
  label: string;
  subLabel?: string;
  isCapped: boolean;
  percentage: number;
}

/**
 * Calculates how many times the ad has popped/shown out of its configured cap (per day, week, session, etc.)
 */
export const getAdCapProgress = (ad: AdCampaign): AdCapProgress => {
  if (!ad) {
    return {
      capType: 'always',
      capLimit: Infinity,
      currentCount: 0,
      remaining: Infinity,
      label: 'Always Active',
      isCapped: false,
      percentage: 0
    };
  }

  const now = Date.now();
  const freq: AdFrequency = ad.frequency || 'always';

  if (freq === 'always') {
    return {
      capType: 'always',
      capLimit: Infinity,
      currentCount: ad.impressions || 0,
      remaining: Infinity,
      label: 'Unlimited (Every page visit)',
      subLabel: 'No frequency cap active',
      isCapped: false,
      percentage: 100
    };
  }

  if (freq === 'once_per_session') {
    let inSession = false;
    try {
      inSession = !!sessionStorage.getItem(`${SESS_STORAGE_PREFIX}${ad.id}`);
    } catch {}
    const count = inSession ? 1 : 0;
    return {
      capType: 'session',
      capLimit: 1,
      currentCount: count,
      remaining: Math.max(0, 1 - count),
      label: inSession ? '1 / 1 popped this session' : '0 / 1 popped this session',
      subLabel: inSession ? 'Session cap reached (resets on new session)' : '1 pop remaining this session',
      isCapped: inSession,
      percentage: inSession ? 100 : 0
    };
  }

  const views = getAdViews(ad.id);

  if (freq === 'once_ever') {
    const count = views.length > 0 ? 1 : 0;
    return {
      capType: 'ever',
      capLimit: 1,
      currentCount: count,
      remaining: Math.max(0, 1 - count),
      label: count > 0 ? '1 / 1 popped (Lifetime)' : '0 / 1 popped (Lifetime)',
      subLabel: count > 0 ? 'Lifetime cap reached on this device' : '1 pop remaining',
      isCapped: count >= 1,
      percentage: count > 0 ? 100 : 0
    };
  }

  if (freq === 'once_per_day') {
    const last24h = now - 24 * 60 * 60 * 1000;
    const count = views.filter(t => t > last24h).length;
    const capped = count >= 1;
    return {
      capType: 'day',
      capLimit: 1,
      currentCount: Math.min(1, count),
      remaining: Math.max(0, 1 - count),
      label: `${Math.min(1, count)} / 1 popped today`,
      subLabel: capped ? 'Daily cap reached (24h cooldown active)' : '1 pop remaining today',
      isCapped: capped,
      percentage: capped ? 100 : 0
    };
  }

  if (freq === 'x_per_day') {
    const max = Math.max(1, ad.maxPerDay || 1);
    const last24h = now - 24 * 60 * 60 * 1000;
    const count = views.filter(t => t > last24h).length;
    const capped = count >= max;
    const pct = Math.min(100, Math.round((count / max) * 100));
    return {
      capType: 'day',
      capLimit: max,
      currentCount: count,
      remaining: Math.max(0, max - count),
      label: `${count} / ${max} popped today`,
      subLabel: capped 
        ? `Daily cap reached (${count}/${max} used)` 
        : `${Math.max(0, max - count)} of ${max} pops left today`,
      isCapped: capped,
      percentage: pct
    };
  }

  if (freq === 'x_per_week') {
    const last7d = now - 7 * 24 * 60 * 60 * 1000;
    const views7d = views.filter(t => t > last7d);
    const { dailyBudget, remainingDays, totalWeeklyCap } = getCalculatedDailyPace(ad, views, now);

    const last24h = now - 24 * 60 * 60 * 1000;
    const views24h = views7d.filter(t => t > last24h);
    const isWeeklyCapped = views7d.length >= totalWeeklyCap;
    const isDailyPaceCapped = views24h.length >= dailyBudget;
    const isCapped = isWeeklyCapped || isDailyPaceCapped;
    const pct = Math.min(100, Math.round((views7d.length / totalWeeklyCap) * 100));

    let subLabel = '';
    if (isWeeklyCapped) {
      subLabel = `Weekly cap reached (${views7d.length}/${totalWeeklyCap} used)`;
    } else if (isDailyPaceCapped) {
      subLabel = `Daily pace limit reached (${views24h.length}/${dailyBudget} today). Resets tomorrow to maintain even delivery across ${remainingDays} remaining days.`;
    } else {
      subLabel = `${Math.max(0, dailyBudget - views24h.length)} left today • ${Math.max(0, totalWeeklyCap - views7d.length)} left this week (${remainingDays} days left)`;
    }

    return {
      capType: 'week',
      capLimit: totalWeeklyCap,
      currentCount: views7d.length,
      remaining: Math.max(0, totalWeeklyCap - views7d.length),
      label: `${views7d.length} / ${totalWeeklyCap} this week (${views24h.length}/${dailyBudget} today)`,
      subLabel,
      isCapped,
      percentage: pct
    };
  }

  return {
    capType: 'always',
    capLimit: Infinity,
    currentCount: 0,
    remaining: Infinity,
    label: 'Always',
    isCapped: false,
    percentage: 0
  };
};

