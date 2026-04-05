import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, PlusSquare, Smartphone, Info } from 'lucide-react';

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
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, we show the banner manually after a short delay since it doesn't support the event
    if (/iphone|ipad|ipod/.test(ua) && !(window.navigator as any).standalone) {
      const timer = setTimeout(() => {
        setShowInstallBanner(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (platform === 'ios') {
      // iOS just shows instructions, handled via state below
      return;
    }

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
    // Removed localStorage.setItem to ensure it shows again on refresh
  };

  if (isStandalone || !showInstallBanner) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-4 right-4 z-[1000] md:left-auto md:right-6 md:w-96"
      >
        <div className="glass-card p-5 border-white/10 bg-slate-900/90 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
          {/* Background Decor */}
          <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[50px] opacity-20 ${platform === 'ios' ? 'bg-purple-500' : 'bg-cyan-500'}`} />
          
          <button 
            onClick={dismissBanner}
            className="absolute top-3 right-3 text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
              platform === 'ios' ? 'bg-gradient-to-br from-purple-500 to-indigo-600' : 'bg-gradient-to-br from-cyan-500 to-blue-600'
            }`}>
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            
            <div className="flex-1 space-y-1">
              <h3 className="font-bold text-white leading-tight">Install StreamAura</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {platform === 'ios' 
                  ? 'Add to Home Screen for the full app experience and offline access.' 
                  : 'Get our fast & lightweight app on your home screen for instant access.'}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {platform === 'ios' ? (
              <div className="space-y-3 bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 text-[11px] text-slate-300">
                  <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center">
                    <Share className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span>1. Tap the <strong>Share</strong> button in your browser menu</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-300">
                  <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center">
                    <PlusSquare className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span>2. Scroll down and tap <strong>Add to Home Screen</strong></span>
                </div>
              </div>
            ) : (
              <button
                onClick={handleInstallClick}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Install Now
              </button>
            )}
            
            <p className="text-[10px] text-center text-slate-500 uppercase tracking-widest font-medium">
              Free • Secure • 2MB
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default InstallPWA;
