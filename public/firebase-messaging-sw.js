// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// This is required for background notifications to work
firebase.initializeApp({
  apiKey: "AIzaSyDQdy9GH6R35wIJfexMw8jWAxqEZ_KIz78",
  authDomain: "universal-media-download-10529.firebaseapp.com",
  projectId: "universal-media-download-10529",
  storageBucket: "universal-media-download-10529.firebasestorage.app",
  messagingSenderId: "394951930000",
  appId: "1:394951930000:web:4094d059b1a4a068be6815"
});

const messaging = firebase.messaging();

// Customize background notification handling here
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: {
      url: payload.data?.url || '/notifications'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
