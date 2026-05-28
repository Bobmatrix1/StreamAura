import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './contexts/AuthContext';
import Layout from '@/sections/Layout';
import Home from '@/sections/Home';
import VideoDownloader from '@/sections/VideoDownloader';
import MusicDownloader from '@/sections/MusicDownloader';
import MovieDownloader from '@/sections/MovieDownloader';
import CinemaRoom from '@/sections/CinemaRoom';
import Games from '@/sections/Games';
import Wallet from '@/sections/Wallet';
import Referral from '@/sections/Referral';
import Profile from '@/sections/Profile';
import BulkDownloader from '@/sections/BulkDownloader';
import History from '@/sections/History';
import AdminDashboard from '@/sections/AdminDashboard';
import Notifications from '@/sections/Notifications';
import About from '@/sections/About';
import PrivacyPolicy from '@/sections/PrivacyPolicy';
import ContactUs from '@/sections/ContactUs';
import InstallPWA from '@/components/InstallPWA';
import { logVisit, updateUserPresence, logFeatureUsage, requestNotificationPermission, listenToNotifications, logPageVisit, auth, logUserAction } from '@/lib/firebase';
import { API_BASE_URL } from '@/api/mediaApi';
import type { ViewType } from '@/types';

/**
 * Main App Content Component
 * Handles the main application logic and routing
 */
export const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, isAdmin, user } = useAuth();
  
  const [activeView, setActiveView] = useState<ViewType>('home');
  const [viewStartTime, setViewStartTime] = useState(Date.now());

  // URL Parameter Sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as ViewType;
    const allowedTabs = ['home', 'video', 'music', 'movie', 'cinema', 'games', 'wallet', 'bulk', 'admin', 'notifications', 'history', 'referral', 'profile', 'about', 'privacy', 'contact'];
    
    // Handle Referral Code FIRST so it's captured even if routing changes
    const refCode = params.get('ref');
    if (refCode) {
      localStorage.setItem('aura_referral_code', refCode);
      // Carefully remove just the 'ref' parameter to keep other routing params intact
      params.delete('ref');
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
    }

    if (tab && allowedTabs.includes(tab)) {
      setActiveView(tab);
      // Clear tab from URL so manual refresh resets to Home
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Custom Navigation Event Listener
  useEffect(() => {
    const handleCustomNav = (e: any) => {
      if (e.detail?.view) {
        handleTabChange(e.detail.view as ViewType);
      }
    };
    window.addEventListener('navigate', handleCustomNav);
    return () => window.removeEventListener('navigate', handleCustomNav);
  }, [viewStartTime, activeView]);

  // 1. Track Initial Visit (Geographic & Device Intel)
  useEffect(() => {
    const trackVisit = async () => {
      try {
        let country = 'Unknown';
        let state = 'Unknown';
        let device = 'Desktop';
        
        try {
          const response = await fetch(`${API_BASE_URL}/api/analytics/location`);
          if (response.ok) {
            const data = await response.json();
            country = data.country || 'Unknown';
            state = data.region || 'Unknown';
            device = data.device || 'Desktop';
          }
        } catch (backendErr) {
          if (window.location.hostname === 'localhost') country = 'Localhost';
        }
        
        await logVisit(country, state, device, auth.currentUser?.uid);
      } catch (err) {
        console.warn('Analytics logging skipped');
      }
    };
    
    trackVisit();
    logPageVisit(activeView, auth.currentUser?.uid, 0);
  }, [auth.currentUser?.uid]);

  // 2. Real-time Presence, Badges, and Notifications
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (isAuthenticated && user?.uid) {
      // Sync unread count for browser/mobile icon badge
      const unsubscribeBadge = listenToNotifications(user.uid, (notifs) => {
        const count = notifs.filter(n => !n.read).length;
        if ('setAppBadge' in navigator) {
          if (count > 0) (navigator as any).setAppBadge(count);
          else (navigator as any).clearAppBadge();
        }
      });

      // Presence Sync
      const syncPresence = async () => {
        try {
          const resp = await fetch(`${API_BASE_URL}/api/analytics/location`);
          const data = await resp.json();
          updateUserPresence(user.uid, data.device || 'Desktop');
        } catch (e) {
          updateUserPresence(user.uid);
        }
      };

      syncPresence();
      interval = setInterval(syncPresence, 2 * 60 * 1000);
      
      // Auto-request notification permission
      requestNotificationPermission(user.uid).catch(console.error);

      return () => {
        if (interval) clearInterval(interval);
        unsubscribeBadge();
      };
    }
  }, [isAuthenticated, user?.uid]);

  const handleTabChange = (tab: ViewType) => {
    // 1. Log time spent on previous page
    const timeSpent = Date.now() - viewStartTime;
    logPageVisit(activeView, auth.currentUser?.uid, timeSpent);

    // 2. Switch View
    setActiveView(tab);
    setViewStartTime(Date.now());
    
    // 3. Scroll the main content area to top (since main has overflow-auto)
    setTimeout(() => {
      const mainEl = document.querySelector('main');
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'instant' });
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 50);

    if (isAuthenticated && user?.uid) {
      logFeatureUsage(tab, user.uid);
    }
  };

  // Global Interaction Tracking
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const details = {
        tagName: target.tagName,
        text: target.innerText?.substring(0, 30),
        id: target.id,
        className: target.className
      };
      logUserAction('click', activeView, details, auth.currentUser?.uid);
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [activeView, auth.currentUser?.uid]);

  // Final Unmount Tracking
  useEffect(() => {
    return () => {
      const timeSpent = Date.now() - viewStartTime;
      logPageVisit(activeView, auth.currentUser?.uid, timeSpent);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-[#00040d] flex flex-col items-center justify-center z-[2000] overflow-hidden">
        {/* Performance-Optimized Background Aura */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div 
            animate={{ 
              opacity: [0.1, 0.2, 0.1],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.15)_0%,transparent_70%)]" 
          />
        </div>

        {/* Central Core */}
        <div className="relative flex flex-col items-center">
          <div className="relative w-64 h-64 flex items-center justify-center">
            {/* Pulsing Core Shadow - Using Gradient instead of Blur for Speed */}
            <motion.div
              animate={{ 
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute w-56 h-56 rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.1)_0%,transparent_70%)]"
            />
            
            {/* Geometric Orbit */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border border-white/[0.05] will-change-transform"
            >
              <div className="w-full h-full rounded-full border-t-2 border-primary/20" />
            </motion.div>

            {/* Logo Housing */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative w-32 h-32 rounded-[2.5rem] bg-[#020617] border border-white/10 shadow-2xl flex items-center justify-center p-6 z-50 overflow-hidden"
            >
              <img src="/logo.png" className="w-full h-full object-contain relative z-10 scale-125" alt="Aura" />
            </motion.div>
          </div>

          {/* Typography */}
          <div className="mt-8 text-center px-6">
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl md:text-4xl font-black uppercase tracking-widest md:tracking-[0.4em] text-white ml-[0.1em] md:ml-[0.4em]"
            >
              Stream<span className="text-primary italic">Aura</span>
            </motion.h1>
            
            {/* Optimized Progress Bar - Using scaleX instead of width to prevent lag */}
            <div className="w-32 h-[2px] bg-white/5 mt-4 mx-auto overflow-hidden rounded-full">
              <motion.div 
                animate={{ 
                  scaleX: [0, 1, 0],
                  x: ['-50%', '0%', '50%']
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-full h-full bg-primary origin-left will-change-transform"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout activeTab={activeView} onTabChange={handleTabChange}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeView === 'home' && <Home onNavigate={handleTabChange} />}
            {activeView === 'video' && <VideoDownloader />}
            {activeView === 'music' && <MusicDownloader />}
            {activeView === 'movie' && <MovieDownloader />}
            {activeView === 'cinema' && <CinemaRoom />}
            {activeView === 'games' && <Games />}
            {activeView === 'wallet' && <Wallet />}
            {activeView === 'bulk' && <BulkDownloader />}
            {activeView === 'referral' && <Referral />}
            {activeView === 'profile' && <Profile />}
            {activeView === 'notifications' && <Notifications />}
            {activeView === 'history' && <History />}
            {activeView === 'about' && <About />}
            {activeView === 'privacy' && <PrivacyPolicy />}
            {activeView === 'contact' && <ContactUs />}
            {activeView === 'admin' && isAdmin && <AdminDashboard />}
            {activeView === 'admin' && !isAdmin && <VideoDownloader />}
          </motion.div>
        </AnimatePresence>
      </Layout>
      <InstallPWA />
    </>
  );
};

