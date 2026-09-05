import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, PlusSquare, ShieldCheck, Zap, CheckCircle2 } from 'lucide-react';

const InstallPWA: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('android');
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed or standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }

    // Check localStorage if user recently dismissed
    const dismissedAt = localStorage.getItem('aura_pwa_dismissed');
    if (dismissedAt) {
      const daysSinceDismiss = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismiss < 2) {
        return; // Don't prompt again if dismissed within 2 days
      }
    }

    // Detect platform
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
    } else if (/android/.test(ua)) {
      setPlatform('android');
    }

    // Listen for Android/Chrome install prompt
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Wait 2 seconds before showing for smoother initial render
      setTimeout(() => setShowInstallBanner(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, we show the banner manually after a short delay
    if (/iphone|ipad|ipod/.test(ua) && !(window.navigator as any).standalone) {
      const timer = setTimeout(() => {
        setShowInstallBanner(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (platform === 'ios') return;
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    }
  };

  const dismissBanner = () => {
    setShowInstallBanner(false);
    try {
      localStorage.setItem('aura_pwa_dismissed', Date.now().toString());
    } catch {}
  };

  if (isStandalone || !showInstallBanner) return null;

  return (
    <AnimatePresence>
      {showInstallBanner && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center sm:justify-end p-3 sm:p-4 md:p-6 pointer-events-none pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {/* Backdrop (Close on click) */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissBanner}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
          />

          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-[390px] mx-auto sm:mx-0 pointer-events-auto z-10"
          >
            <div className="glass-card p-4 sm:p-5 border-white/15 bg-zinc-950/95 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] relative overflow-hidden rounded-3xl group">
              {/* Animated Glow Effect */}
              <div className="absolute -top-20 -left-20 w-40 h-40 bg-primary/20 rounded-full blur-[80px] pointer-events-none" />
              <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
              
              <button 
                onClick={dismissBanner}
                aria-label="Dismiss install banner"
                className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all z-20"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3.5 sm:gap-4 relative z-10 pr-6">
                {/* App Logo */}
                <div className="relative shrink-0">
                  <div className="w-[52px] h-[52px] sm:w-[60px] sm:h-[60px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-2 shadow-xl overflow-hidden relative">
                    <img src="/logo.png" alt="StreamAura" className="w-full h-full object-contain" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-zinc-950 flex items-center justify-center shadow-md">
                    <ShieldCheck className="w-3 h-3 text-white" />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-black text-white uppercase tracking-tight text-base sm:text-lg leading-tight">StreamAura</h3>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/10 shrink-0" />
                  </div>
                  <p className="text-[11px] sm:text-xs text-zinc-400 font-medium leading-relaxed line-clamp-2">
                    {platform === 'ios' 
                      ? 'Install StreamAura on your home screen for fast fullscreen streaming.' 
                      : 'Install native app for instant loading, fullscreen cinema, and offline streaming.'}
                  </p>
                </div>
              </div>

              <div className="mt-4 sm:mt-5 space-y-3 relative z-10">
                {platform === 'ios' ? (
                  <div className="space-y-2 bg-white/5 p-3 rounded-2xl border border-white/5 shadow-inner">
                    <div className="flex items-center gap-3 text-[11px] font-bold text-zinc-300">
                      <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center border border-white/10 shrink-0">
                        <Share className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span>1. Tap <span className="text-white font-black">Share</span> in Safari menu</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-bold text-zinc-300">
                      <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center border border-white/10 shrink-0">
                        <PlusSquare className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span>2. Select <span className="text-white font-black">Add to Home Screen</span></span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleInstallClick}
                    className="w-full h-11 sm:h-12 rounded-xl bg-gradient-to-r from-primary to-indigo-600 text-white text-[11px] sm:text-xs font-black uppercase tracking-[0.15em] shadow-lg shadow-primary/25 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                  >
                    <Download className="w-4 h-4 group-hover:animate-bounce" />
                    Install App
                  </button>
                )}
                
                <div className="flex items-center justify-between px-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-amber-500 fill-current" />
                    <span>Lite & Fast</span>
                  </div>
                  <span className="text-zinc-600">v1.2.0 • Verified PWA</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default InstallPWA;
