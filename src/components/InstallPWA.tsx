import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, PlusSquare, ShieldCheck, Zap } from 'lucide-react';

const InstallPWA: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('android');
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
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
      // Wait 2 seconds before showing for better UX
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
  };

  if (isStandalone || !showInstallBanner) return null;

  return (
    <AnimatePresence>
      {showInstallBanner && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center md:items-center md:justify-end pointer-events-none">
          {/* Backdrop (Close on click) */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissBanner}
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto"
          />

          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.95 }}
            className="relative bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-[400px] pointer-events-auto"
          >
            <div className="glass-card p-6 border-white/10 bg-zinc-950/95 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
              {/* Animated Glow Effect */}
              <div className="absolute -top-20 -left-20 w-40 h-40 bg-primary/20 rounded-full blur-[80px] group-hover:bg-primary/30 transition-all duration-700" />
              <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-[80px]" />
              
              <button 
                onClick={dismissBanner}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all z-10"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-5 relative z-10">
                {/* App Logo */}
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center p-2.5 shadow-2xl overflow-hidden relative group-hover:scale-105 transition-transform duration-500">
                      <img src="/logo.png" alt="StreamAura" className="w-full h-full object-contain scale-110" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-4 border-zinc-950 flex items-center justify-center shadow-lg">
                      <ShieldCheck className="w-3 h-3 text-white" />
                  </div>
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-white uppercase tracking-tighter text-lg leading-none">StreamAura</h3>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/5 text-[8px] font-black text-white/40 uppercase tracking-widest">Official</span>
                  </div>
                  <p className="text-xs text-zinc-400 font-medium leading-relaxed mt-1">
                    {platform === 'ios' 
                      ? 'Install the official StreamAura app for an immersive cinema and downloader experience.' 
                      : 'Get the native experience with faster loading and offline streaming capabilities.'}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4 relative z-10">
                {platform === 'ios' ? (
                  <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5 shadow-inner">
                    <div className="flex items-center gap-4 text-[11px] font-bold text-zinc-300">
                      <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                        <Share className="w-4 h-4 text-white" />
                      </div>
                      <span>Tap <span className="text-white">Share</span> in browser menu</span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-bold text-zinc-300">
                      <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                        <PlusSquare className="w-4 h-4 text-white" />
                      </div>
                      <span>Select <span className="text-white font-black">Add to Home Screen</span></span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleInstallClick}
                    className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-indigo-600 text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3 group"
                  >
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    Install Application
                  </button>
                )}
                
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-1.5">
                      <Zap className="w-3 h-3 text-amber-500 fill-current" />
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Lite & Fast</span>
                  </div>
                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">v1.2.0 • Verified</span>
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
