/**
 * Download Notification Manager
 * 
 * Handles real-time system notifications in the phone/desktop notification drawer
 * during media downloads and creates in-app notification records.
 */

import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

// Keep track of the last notification update time to prevent notification spam
const lastUpdateTime: Record<string, number> = {};
const lastProgressValue: Record<string, number> = {};

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
 * Show or update a system notification via Service Worker or Notification API
 */
async function sendSystemNotification(
  tag: string,
  title: string,
  options: NotificationOptions
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.showNotification) {
        await registration.showNotification(title, {
          ...options,
          tag,
        });
        return;
      }
    }

    // Fallback if ServiceWorker is not ready
    new Notification(title, {
      ...options,
      tag,
    });
  } catch (err) {
    console.debug('System notification error:', err);
  }
}

/**
 * Show notification when download starts
 */
export async function showDownloadStartingNotification(
  downloadId: string,
  title: string,
  thumbnail?: string
) {
  await requestDownloadNotificationPermission();
  lastUpdateTime[downloadId] = Date.now();
  lastProgressValue[downloadId] = 0;

  await sendSystemNotification(`aura-download-${downloadId}`, 'StreamAura Downloader', {
    body: `📥 Starting download: "${title}" • 0%`,
    icon: thumbnail || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    silent: true,
    data: { url: '/history', type: 'download' }
  } as any);
}

/**
 * Update notification with live progress (throttled to keep device responsive)
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

  // Throttle updates: at least 500ms apart and at least 4% increase (or 100%)
  if (now - lastTime < 500 && Math.abs(progress - lastProg) < 4 && progress < 100) {
    return;
  }

  lastUpdateTime[downloadId] = now;
  lastProgressValue[downloadId] = progress;

  await sendSystemNotification(`aura-download-${downloadId}`, 'StreamAura Downloader', {
    body: `📥 Downloading: "${title}" • ${progress}%`,
    icon: thumbnail || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    silent: true,
    data: { url: '/history', type: 'download' }
  } as any);
}

/**
 * Show notification when download finishes successfully
 */
export async function showDownloadCompleteNotification(
  downloadId: string,
  title: string,
  thumbnail?: string
) {
  delete lastUpdateTime[downloadId];
  delete lastProgressValue[downloadId];

  await sendSystemNotification(`aura-download-${downloadId}`, 'StreamAura Downloader', {
    body: `✅ Download Complete: "${title}" — Tap to view`,
    icon: thumbnail || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    silent: false,
    data: { url: '/history', type: 'download' }
  } as any);
}

/**
 * Show notification when download fails
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
