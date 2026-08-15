/**
 * Main Entry Point
 * 
 * Initializes the React application. 
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { HelmetProvider } from 'react-helmet-async';

// Register Service Worker for PWA and Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('SW registered:', reg);
        // Check for updates every 5 minutes
        setInterval(() => {
          reg.update();
        }, 5 * 60 * 1000);
      })
      .catch(err => console.log('SW registration failed:', err));
  });

  // Reload page when service worker changes and takes control (auto-update)
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
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
