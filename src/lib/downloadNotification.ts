/**
 * Download Notification Manager
 * 
 * Handles real-time system notifications in the phone/desktop notification drawer
 * during media downloads and creates in-app notification records.
 * Uses consistent notification tagging, renotify: false, and strict rate-limiting
 * to ensure that only ONE notification card updates smoothly in the user's notification tray.
 */

import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

// Keep track of the last notification update time and progress per download to prevent spam
const lastUpdateTime: Record<string, number> = {};
const lastProgressValue: Record<string, number> = {};

/**
 * Render visual progress bar string for notification drawer (e.g. [██████░░░░] 60%)
 */
function renderProgressBar(percent: number): string {
  const totalBars = 10;
  const filledBars = Math.min(totalBars, Math.max(0, Math.round((percent / 100) * totalBars)));
  const emptyBars = totalBars - filledBars;
  return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
}

/**
 * Request notification permission safely if not already granted
 */
export async function requestDownloadNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Show or update a system notification via Service Worker (preferred for mobile) or Notification API
 * Uses the exact same tag and renotify: false so it updates in-place without creating new entries
 */
async function sendSystemNotification(
  tag: string,
  title: string,
  options: NotificationOptions & { renotify?: boolean; silent?: boolean }
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    // 1. ServiceWorkerRegistration (Crucial on mobile/Android to replace in-place)
    if ('serviceWorker' in navigator) {
      let registration: ServiceWorkerRegistration | undefined;
      try {
        registration = await navigator.serviceWorker.getRegistration();
      } catch {}

      if (!registration) {
        try {
          registration = await navigator.serviceWorker.ready;
        } catch {}
      }

      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, {
          ...options,
          tag,
          renotify: options.renotify ?? false,
          silent: options.silent ?? true,
        } as any);
        return;
      }
    }

    // 2. Desktop Window Notification fallback
    try {
      new Notification(title, {
        ...options,
        tag,
        renotify: options.renotify ?? false,
        silent: options.silent ?? true,
      } as any);
    } catch (winErr) {
      console.debug('Window Notification fallback error:', winErr);
    }
  } catch (err) {
    console.debug('System notification error:', err);
  }
}

/**
 * Show initial notification when download begins
 */
export async function showDownloadStartingNotification(
  downloadId: string,
  title: string,
  thumbnail?: string
) {
  await requestDownloadNotificationPermission();
  lastUpdateTime[downloadId] = Date.now();
  lastProgressValue[downloadId] = 0;

  const bar = renderProgressBar(0);
  await sendSystemNotification(`aura-download-${downloadId}`, 'StreamAura Downloader', {
    body: `📥 Downloading: "${title}"\n[${bar}] 0%`,
    icon: thumbnail || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    silent: true,
    renotify: false,
    tag: `aura-download-${downloadId}`,
    data: { url: '/history', type: 'download' }
  } as any);
}

/**
 * Update notification with live progress
 * Throttled to at most once every 1.2 seconds (or >= 15% change or 100%)
 * with renotify: false so Android NEVER creates a new notification item in the drawer
 */
export async function updateDownloadProgressNotification(
  downloadId: string,
  title: string,
  progress: number,
  thumbnail?: string
) {
  const now = Date.now();
  const lastTime = lastUpdateTime[downloadId] || 0;
  const lastProg = lastProgressValue[downloadId] || 0;

  // Strict rate-limiting: Only update if at least 1.2s passed or progress jumped by >= 15% (or 100%)
  const timeDiff = now - lastTime;
  const progDiff = Math.abs(progress - lastProg);

  if (timeDiff < 1200 && progDiff < 15 && progress < 100) {
    return;
  }

  lastUpdateTime[downloadId] = now;
  lastProgressValue[downloadId] = progress;

  const bar = renderProgressBar(progress);
  await sendSystemNotification(`aura-download-${downloadId}`, 'StreamAura Downloader', {
    body: `📥 Downloading: "${title}"\n[${bar}] ${progress}%`,
    icon: thumbnail || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    silent: true,
    renotify: false,
    tag: `aura-download-${downloadId}`,
    data: { url: '/history', type: 'download' }
  } as any);
}

/**
 * Show notification when download finishes successfully
 * Replaces the progress notification with a completion notice and chime
 */
export async function showDownloadCompleteNotification(
  downloadId: string,
  title: string,
  thumbnail?: string
) {
  delete lastUpdateTime[downloadId];
  delete lastProgressValue[downloadId];

  await sendSystemNotification(`aura-download-${downloadId}`, 'StreamAura Downloader', {
    body: `✅ Download Complete: "${title}" • Tap to view in Library`,
    icon: thumbnail || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    silent: false,
    renotify: true,
    tag: `aura-download-${downloadId}`,
    data: { url: '/history', type: 'download' }
  } as any);
}

/**
 * Show notification when download fails
 * Replaces the progress notification with a failure notice
 */
export async function showDownloadFailedNotification(
  downloadId: string,
  title: string,
  thumbnail?: string
) {
  delete lastUpdateTime[downloadId];
  delete lastProgressValue[downloadId];

  await sendSystemNotification(`aura-download-${downloadId}`, 'StreamAura Downloader', {
    body: `❌ Download Failed: "${title}"`,
    icon: thumbnail || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    silent: false,
    renotify: true,
    tag: `aura-download-${downloadId}`,
    data: { url: '/history', type: 'download' }
  } as any);
}

/**
 * Record an In-App notification in Firestore and trigger local in-app alert
 */
export async function createInAppDownloadNotification(
  userId: string | undefined,
  title: string,
  thumbnail?: string,
  mediaType: string = 'video'
) {
  if (userId) {
    try {
      await addDoc(collection(db, 'users', userId, 'notifications'), {
        title: 'Download Complete',
        message: `Your ${mediaType === 'music' ? 'audio' : 'video'} "${title}" is ready!`,
        imageUrl: thumbnail || null,
        link: '/history',
        type: 'download',
        badgeText: 'Complete',
        read: false,
        timestamp: Date.now()
      });
    } catch (err) {
      console.warn('Failed to save in-app notification to Firestore:', err);
    }
  }

  // Dispatch custom in-app event so header badge & notification listeners update immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aura_in_app_notification', {
      detail: {
        title: 'Download Complete',
        message: `"${title}" has finished downloading.`,
        type: 'download',
        link: '/history'
      }
    }));
  }
}
