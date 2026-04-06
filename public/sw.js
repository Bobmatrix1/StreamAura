/**
 * StreamAura Service Worker - High Stability v2
 */

const CACHE_NAME = 'streamaura-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. STRICT BYPASS: Let the browser handle these directly
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith('http') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.hostname.includes('googleapis') ||
    url.pathname.startsWith('/api') ||
    url.port === '1578' ||
    url.href.includes('hot-update')
  ) {
    return; // SW ignores this event completely
  }

  // 2. Handle App Assets
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) return cachedResponse;

      try {
        const networkResponse = await fetch(event.request);
        
        // Cache valid local assets
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        
        return networkResponse;
      } catch (error) {
        // Only show offline page for actual website page loads
        if (event.request.mode === 'navigate') {
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) return offlinePage;
        }
        // Let the browser handle the network error for images/scripts
        throw error;
      }
    })()
  );
});

// --- PUSH NOTIFICATIONS ---

self.addEventListener('push', (event) => {
  let data = { title: 'StreamAura', message: 'New update available' };
  try {
    data = event.data ? event.data.json() : data;
  } catch (e) {
    data.message = event.data ? event.data.text() : data.message;
  }

  if (data.unreadCount !== undefined && 'setAppBadge' in navigator) {
    const count = parseInt(data.unreadCount);
    if (count > 0) navigator.setAppBadge(count);
    else navigator.clearAppBadge();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.message,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'broadcast',
      data: { url: data.url || '/notifications' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data.url || '/notifications';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === targetUrl && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
