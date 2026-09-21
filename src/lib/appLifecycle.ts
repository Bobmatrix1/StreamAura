/**
 * StreamAura App Lifecycle & Session State Management
 * 
 * Prevents unwanted page reloads, keeps media sessions alive,
 * manages WakeLock (preventing screen dimming during cinema / downloads),
 * and provides safe, user-approved Service Worker update flows.
 */

declare global {
  interface Window {
    __AURA_CINEMA_ACTIVE__?: boolean;
    __AURA_ACTIVE_ROOM_ID__?: string;
    __AURA_DOWNLOADING__?: boolean;
    __AURA_GAME_ACTIVE__?: boolean;
    __AURA_UPDATING__?: boolean;
    __AURA_PENDING_SW_WORKER__?: ServiceWorker | null;
  }
}

// Active wake lock requestors
const activeWakeLockReasons = new Set<string>();
let wakeLockSentinel: any = null;

/**
 * Returns true if the user is in an active session where an unrequested
 * reload or update would disrupt their experience (cinema, download, game).
 */
export function isAppBusy(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.__AURA_CINEMA_ACTIVE__ ||
    window.__AURA_DOWNLOADING__ ||
    window.__AURA_GAME_ACTIVE__
  );
}

/**
 * Mark Cinema Room as active / inactive
 */
export function setCinemaActive(roomId: string | null) {
  if (typeof window === 'undefined') return;
  if (roomId) {
    window.__AURA_CINEMA_ACTIVE__ = true;
    window.__AURA_ACTIVE_ROOM_ID__ = roomId;
    sessionStorage.setItem('aura_active_cinema_room_id', roomId);
    acquireWakeLock('cinema');
  } else {
    window.__AURA_CINEMA_ACTIVE__ = false;
    delete window.__AURA_ACTIVE_ROOM_ID__;
    sessionStorage.removeItem('aura_active_cinema_room_id');
    releaseWakeLock('cinema');
  }
}

/**
 * Mark Download as active / inactive
 */
export function setDownloadingActive(active: boolean) {
  if (typeof window === 'undefined') return;
  window.__AURA_DOWNLOADING__ = active;
  if (active) {
    acquireWakeLock('download');
  } else {
    releaseWakeLock('download');
  }
}

/**
 * Mark Game as active / inactive
 */
export function setGameActive(gameId: string | null) {
  if (typeof window === 'undefined') return;
  if (gameId) {
    window.__AURA_GAME_ACTIVE__ = true;
    sessionStorage.setItem('aura_active_game_id', gameId);
  } else {
    window.__AURA_GAME_ACTIVE__ = false;
    sessionStorage.removeItem('aura_active_game_id');
  }
}

/**
 * Request screen wake lock so phone doesn't sleep / lock during cinema or download
 */
export async function acquireWakeLock(reason: string) {
  if (typeof window === 'undefined') return;
  activeWakeLockReasons.add(reason);

  if ('wakeLock' in navigator && !wakeLockSentinel) {
    try {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    } catch (err) {
      // Wake Lock might fail due to battery saver or background tab
      console.debug('Wake Lock request skipped:', err);
    }
  }
}

/**
 * Release wake lock for a specific reason
 */
export function releaseWakeLock(reason: string) {
  if (typeof window === 'undefined') return;
  activeWakeLockReasons.delete(reason);

  if (activeWakeLockReasons.size === 0 && wakeLockSentinel) {
    try {
      wakeLockSentinel.release().catch(() => {});
    } catch {}
    wakeLockSentinel = null;
  }
}

// Auto re-acquire wake lock when tab becomes visible again
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeWakeLockReasons.size > 0 && !wakeLockSentinel) {
      if ('wakeLock' in navigator) {
        (navigator as any).wakeLock.request('screen')
          .then((sentinel: any) => {
            wakeLockSentinel = sentinel;
            sentinel.addEventListener('release', () => {
              wakeLockSentinel = null;
            });
          })
          .catch(() => {});
      }
    }
  });
}

/**
 * Safe App Update Trigger
 * Called when a new version is detected and user chooses to apply it
 */
export function triggerAppUpdate() {
  if (typeof window === 'undefined') return;
  window.__AURA_UPDATING__ = true;

  const worker = window.__AURA_PENDING_SW_WORKER__;
  if (worker) {
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (e) {
      console.warn('Could not post SKIP_WAITING to SW', e);
    }
  }

  // Small delay to allow SW to activate, then reload cleanly
  setTimeout(() => {
    window.location.reload();
  }, 150);
}
