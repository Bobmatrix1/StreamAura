import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import Layout from '@/sections/Layout';
import Login from '@/sections/Login';
import Signup from '@/sections/Signup';
import VideoDownloader from '@/sections/VideoDownloader';
import MusicDownloader from '@/sections/MusicDownloader';
import MovieDownloader from '@/sections/MovieDownloader';
import BulkDownloader from '@/sections/BulkDownloader';
import History from '@/sections/History';
import AdminDashboard from '@/sections/AdminDashboard';
import Notifications from '@/sections/Notifications';
import About from '@/sections/About';
import PrivacyPolicy from '@/sections/PrivacyPolicy';
import ContactUs from '@/sections/ContactUs';
import InstallPWA from '@/components/InstallPWA';
import { logVisit, updateUserPresence, logFeatureUsage, requestNotificationPermission } from '@/lib/firebase';
import { API_BASE_URL } from '@/api/mediaApi';
import type { ViewType } from '@/types';

/**
 * Main App Content Component
 * Handles the main application logic and routing
 */
export const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, isAdmin, user } = useAuth();
  
  const [showLogin, setShowLogin] = useState(true);
  const [activeView, setActiveView] = useState<ViewType>('video');

  // Track visits and presence
  useEffect(() => {
    const trackVisit = async () => {
      try {
        let country = 'Unknown';
        let device = 'Desktop';
        
        try {
          const response = await fetch(`${API_BASE_URL}/api/analytics/country`);
          if (response.ok) {
            const data = await response.json();
            country = data.country || 'Unknown';
            device = data.device || 'Desktop';
          }
        } catch (backendErr) {
          if (window.location.hostname === 'localhost') country = 'Localhost';
        }
        
        await logVisit(country, device);
      } catch (err) {
        console.warn('Analytics logging skipped');
      }
    };
    
    trackVisit();

    let interval: ReturnType<typeof setInterval>;
    if (isAuthenticated && user?.uid) {
      // Auto-request notification permission
      requestNotificationPermission(user.uid).catch(console.error);

      const syncPresence = async () => {
        try {
          const resp = await fetch(`${API_BASE_URL}/api/analytics/country`);
          const data = await resp.json();
          updateUserPresence(user.uid, data.device || 'Desktop');
        } catch (e) {
          updateUserPresence(user.uid);
        }
      };

      syncPresence();
      interval = setInterval(syncPresence, 2 * 60 * 1000);
      
      // Request notification permission
      requestNotificationPermission(user.uid);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, user?.uid]);

  const toggleAuthView = () => setShowLogin(!showLogin);

  const handleTabChange = (tab: ViewType) => {
    setActiveView(tab);
    if (isAuthenticated && user?.uid) {
      logFeatureUsage(tab, user.uid);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-[100] overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px] animate-pulse delay-700" />

        <div className="relative flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ 
              opacity: [0.4, 0.8, 0.4],
              scale: [1, 1.2, 1],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute w-40 h-40 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-2xl"
          />

          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute w-32 h-32 rounded-full border-2 border-dashed border-blue-500/30"
          />

          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute w-24 h-24 rounded-full border border-purple-500/20"
          />

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative w-24 h-24 rounded-3xl overflow-hidden flex items-center justify-center shadow-2xl border border-white/10 bg-white/5"
          >
            <motion.div
              animate={{ 
                y: [0, -5, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-full h-full p-4 flex items-center justify-center"
            >
              <img src="/logo.png" alt="StreamAura" className="w-full h-full object-contain scale-125" />
            </motion.div>
            
            <motion.div
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
              className="absolute top-2 right-2 text-yellow-400"
            >
              <Zap className="w-4 h-4 fill-current" />
            </motion.div>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-xl font-bold tracking-tight gradient-text">StreamAura</span>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                />
              ))}
            </div>
          </div>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.2em] font-medium opacity-60">
            Download Anything. Feel the Aura.
          </p>
        </motion.div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AnimatePresence mode="wait">
        {showLogin ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="min-h-screen flex items-center justify-center p-4 bg-background"
          >
            <Login onToggleView={toggleAuthView} />
          </motion.div>
        ) : (
          <motion.div
            key="signup"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="min-h-screen flex items-center justify-center p-4 bg-background"
          >
            <Signup onToggleView={toggleAuthView} />
          </motion.div>
        )}
      </AnimatePresence>
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
            {activeView === 'video' && <VideoDownloader />}
            {activeView === 'music' && <MusicDownloader />}
            {activeView === 'movie' && <MovieDownloader />}
            {activeView === 'bulk' && <BulkDownloader />}
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
