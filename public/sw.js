/**
 * Service Worker for StreamAura PWA
 * 
 * Provides offline support, caching, and background push notifications.
 */

const CACHE_NAME = 'media-downloader-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('/offline.html');
      });
    })
  );
});

// --- PUSH NOTIFICATIONS ---

self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    // Handle App Icon Badge
    if (data.unreadCount !== undefined) {
      if ('setAppBadge' in navigator) {
        if (data.unreadCount > 0) {
          (navigator as any).setAppBadge(data.unreadCount);
        } else {
          (navigator as any).clearAppBadge();
        }
      }
    }

    const options = {
      body: data.message || 'New update from StreamAura',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'broadcast',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/notifications'
      },
      actions: [
        { action: 'open', title: 'Read Now' },
        { action: 'close', title: 'Dismiss' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'StreamAura', options)
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action !== 'close') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        if (clientList.length > 0) {
          let client = clientList[0];
          for (let i = 0; i < clientList.length; i++) {
            if (clientList[i].focused) {
              client = clientList[i];
              break;
            }
          }
          return client.focus().then(c => c.navigate(event.notification.data.url));
        }
        return self.clients.openWindow(event.notification.data.url);
      })
    );
  }
});
