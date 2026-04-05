/**
 * Main Entry Point
 * 
 * Initializes the React application. 
 * NOTE: Service worker disabled to resolve Cache/Interactivity conflicts.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// UNREGISTER Service worker to fix broken Cache issues
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
      console.log('Broken SW Unregistered');
    }
  });
}

// Mount React app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
