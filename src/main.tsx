/**
 * Main Entry Point
 * 
 * Initializes the React application. 
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { isAppBusy } from './lib/appLifecycle';

import { HelmetProvider } from 'react-helmet-async';

// Register Service Worker for PWA and Notifications with graceful, non-disruptive update handling
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('SW registered:', reg);

        const notifyUpdate = (worker: ServiceWorker) => {
          window.__AURA_PENDING_SW_WORKER__ = worker;
          window.dispatchEvent(new CustomEvent('aura_update_available', { detail: { worker } }));
        };

        // If a worker is already waiting (e.g. from previous background check)
        if (reg.waiting) {
          notifyUpdate(reg.waiting);
        }

        // Listen for new worker installed
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdate(newWorker);
            }
          });
        });

        // Check for updates periodically, but ONLY when page is visible and not busy
        setInterval(() => {
          if (document.visibilityState === 'visible' && !isAppBusy()) {
            reg.update().catch(() => {});
          }
        }, 15 * 60 * 1000);
      })
      .catch(err => console.log('SW registration failed:', err));
  });

  // Only reload if the user approved the update or if the app is confirmed idle
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing && window.__AURA_UPDATING__) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Mount React app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>
);
