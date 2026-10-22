import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, 
  X, 
  Share, 
  PlusSquare, 
  ShieldCheck, 
  Zap, 
  CheckCircle2, 
  Flame, 
  Copy, 
  Check, 
  Smartphone, 
  Laptop, 
  ExternalLink,
  MoreVertical
} from 'lucide-react';

import { useIsAppInstalled, checkIsAppInstalled } from '../hooks/useAppInstalled';

/**
 * Global trigger to open the StreamAura App Install modal from anywhere in the application.
 */
export const triggerInstallPWA = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open_install_pwa'));
  }
};

const InstallPWA: React.FC = () => {
  const isInstalled = useIsAppInstalled();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      return (window as any).__AURA_DEFERRED_PROMPT__ || null;
    }
    return null;
  });
  
  const [showFloatingBanner, setShowFloatingBanner] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('android');
  const [isStandalone, setIsStandalone] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  const isAppActiveOrInstalled = isStandalone || isInstalled;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect standalone mode
    const standaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://') ||
      checkIsAppInstalled();
    
    setIsStandalone(standaloneMode);

    // Detect device platform
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /android/.test(ua);

    if (isIOS) {
      setPlatform('ios');
    } else if (isAndroid) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    // Detect in-app webviews (Instagram, Facebook, Twitter, WhatsApp, TikTok, etc.)
    const isWebview = /(fban|fbav|instagram|twitter|tiktok|whatsapp|line|micromessenger|snapchat)/i.test(ua);
    setIsInAppBrowser(isWebview);

    // Capture prompt if already present globally
    if ((window as any).__AURA_DEFERRED_PROMPT__) {
      setDeferredPrompt((window as any).__AURA_DEFERRED_PROMPT__);
    }

    // Event listener for native beforeinstallprompt
    const onBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      (window as any).__AURA_DEFERRED_PROMPT__ = e;
      setDeferredPrompt(e);
      // Only show banner if app is not standalone or already installed
      if (!standaloneMode && !checkIsAppInstalled()) {
        setShowFloatingBanner(true);
      }
    };

    // Global custom triggers
    const onPromptReady = () => {
      if ((window as any).__AURA_DEFERRED_PROMPT__) {
        setDeferredPrompt((window as any).__AURA_DEFERRED_PROMPT__);
      }
    };

    const onAppInstalled = () => {
      setIsStandalone(true);
      setShowFloatingBanner(false);
      setShowInstallModal(false);
      (window as any).__AURA_DEFERRED_PROMPT__ = null;
      try {
        localStorage.setItem('aura_app_installed', 'true');
        window.dispatchEvent(new CustomEvent('aura_app_installed_status_changed', { detail: { isInstalled: true } }));
      } catch {}
    };

    const onOpenManual = () => {
      setShowInstallModal(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('aura_pwa_prompt_ready', onPromptReady);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('aura_pwa_installed', onAppInstalled);
    window.addEventListener('open_install_pwa', onOpenManual);

    // Auto-show floating banner logic (non-intrusive)
    if (!standaloneMode && !checkIsAppInstalled()) {
      const dismissedAt = localStorage.getItem('aura_pwa_dismissed');
      let shouldAutoShow = true;
      if (dismissedAt) {
        const hoursSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60);
        if (hoursSince < 12) {
          shouldAutoShow = false; // Graceful 12h snooze for auto-banner, manual button remains active
        }
      }

      if (shouldAutoShow) {
        const timer = setTimeout(() => {
          setShowFloatingBanner(true);
        }, 3500);
        return () => {
          clearTimeout(timer);
          window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
          window.removeEventListener('aura_pwa_prompt_ready', onPromptReady);
          window.removeEventListener('appinstalled', onAppInstalled);
          window.removeEventListener('aura_pwa_installed', onAppInstalled);
          window.removeEventListener('open_install_pwa', onOpenManual);
        };
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('aura_pwa_prompt_ready', onPromptReady);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('aura_pwa_installed', onAppInstalled);
      window.removeEventListener('open_install_pwa', onOpenManual);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          (window as any).__AURA_DEFERRED_PROMPT__ = null;
          setShowFloatingBanner(false);
          setShowInstallModal(false);
          setIsStandalone(true);
          try {
            localStorage.setItem('aura_app_installed', 'true');
            window.dispatchEvent(new CustomEvent('aura_pwa_installed'));
            window.dispatchEvent(new CustomEvent('aura_app_installed_status_changed', { detail: { isInstalled: true } }));
          } catch {}
        }
      } catch (err) {
        console.warn('Install prompt error:', err);
        setShowInstallModal(true);
      }
    } else {
      // If native prompt isn't directly dispatchable (e.g. iOS or manual browser), open guided modal
      setShowInstallModal(true);
    }
  };

  const dismissFloatingBanner = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowFloatingBanner(false);
    try {
      localStorage.setItem('aura_pwa_dismissed', Date.now().toString());
    } catch {}
  };

  const copyAppUrl = () => {
    try {
      navigator.clipboard.writeText(window.location.origin);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {}
  };

  return (
    <>
      {/* 1. NON-INTRUSIVE FLOATING BOTTOM BANNER (No screen-blocking backdrop) */}
      <AnimatePresence>
        {!isAppActiveOrInstalled && showFloatingBanner && !showInstallModal && (
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[200] max-w-sm pointer-events-auto"
          >
            <div className="glass-card p-4 rounded-3xl bg-zinc-950/95 border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl relative overflow-hidden group">
              {/* Animated Glow */}
              <div className="absolute -top-16 -right-16 w-32 h-32 bg-primary/25 rounded-full blur-[60px] pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-indigo-500/20 rounded-full blur-[60px] pointer-events-none" />

              <button
                onClick={dismissFloatingBanner}
                aria-label="Dismiss banner"
                className="absolute top-2.5 right-2.5 p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all z-20"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 pr-6">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-1.5 shadow-xl relative shrink-0">
                  <img src="/logo.png" alt="StreamAura" className="w-full h-full object-contain" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-zinc-950 flex items-center justify-center shadow">
                    <ShieldCheck className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-black text-white text-sm uppercase tracking-tight">StreamAura App</h4>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">Free</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 line-clamp-1">Fast fullscreen cinema & high-speed streaming</p>
                </div>
              </div>

              <div className="mt-3.5 flex items-center gap-2">
                <button
                  onClick={handleInstallClick}
                  className="flex-1 h-9 rounded-xl bg-gradient-to-r from-primary to-indigo-600 text-white text-[11px] font-black uppercase tracking-wider shadow-md hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download App</span>
                </button>
                <button
                  onClick={dismissFloatingBanner}
                  className="px-3 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-[11px] font-bold transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. COMPREHENSIVE INTERACTIVE INSTALL MODAL */}
      <AnimatePresence>
        {showInstallModal && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInstallModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md glass-card rounded-3xl bg-zinc-950/95 border border-white/15 p-6 shadow-2xl overflow-hidden z-10"
            >
              {/* Glow Accent */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[90px] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/15 rounded-full blur-[90px] pointer-events-none" />

              <button
                onClick={() => setShowInstallModal(false)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all z-20"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="text-center mb-5">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-2.5 mx-auto mb-3 shadow-2xl relative">
                  <img src="/logo.png" alt="StreamAura" className="w-full h-full object-contain" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-zinc-950 flex items-center justify-center shadow">
                    <ShieldCheck className="w-3 h-3 text-white" />
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest mb-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  <span>Official StreamAura App</span>
                </div>

                <h3 className="text-xl font-black text-white uppercase tracking-tight">
                  {isAppActiveOrInstalled ? 'App Already Installed' : 'Install StreamAura App'}
                </h3>
                <p className="text-xs text-zinc-400 font-medium mt-1">
                  {isAppActiveOrInstalled 
                    ? 'StreamAura is already installed on this device. You can launch it directly anytime!'
                    : 'Download the app for instant fullscreen streaming, high-speed downloads, and instant updates.'}
                </p>
              </div>

              {/* In-App Browser Warning (e.g. opened in Instagram, WhatsApp, Facebook) */}
              {isInAppBrowser && !isAppActiveOrInstalled && (
                <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <ExternalLink className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>In-App Browser Detected</span>
                  </div>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Social apps (like Instagram or WhatsApp) block direct app installs. Tap the menu at the top-right and choose <span className="font-bold underline text-white">Open in Chrome / Safari</span> for full 1-tap install.
                  </p>
                  <button
                    onClick={copyAppUrl}
                    className="w-full py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Link Copied! Open in Browser' : 'Copy Website Link'}</span>
                  </button>
                </div>
              )}

              {/* Already Installed State */}
              {isAppActiveOrInstalled ? (
                <div className="space-y-4 my-4">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-center space-y-1">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-1" />
                    <p className="text-xs font-black text-white uppercase tracking-wider">You're All Set!</p>
                    <p className="text-[11px] text-emerald-200/80">StreamAura is already installed on your device. You can launch it directly from your home screen or app drawer anytime.</p>
                  </div>
                  <button
                    onClick={() => setShowInstallModal(false)}
                    className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-black uppercase tracking-wider transition-all"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Option 1: Native Prompt (Chrome, Edge, Samsung Internet) */}
                  {deferredPrompt ? (
                    <div className="space-y-3">
                      <button
                        onClick={handleInstallClick}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary via-indigo-600 to-primary text-white text-xs font-black uppercase tracking-[0.15em] shadow-xl shadow-primary/30 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group animate-pulse"
                      >
                        <Download className="w-4 h-4 group-hover:animate-bounce" />
                        <span>Install App Now</span>
                      </button>
                      <p className="text-center text-[10px] text-zinc-500 font-medium">
                        Instant install • No Google Play or App Store needed
                      </p>
                    </div>
                  ) : (
                    /* Option 2: Step-by-Step Guided Instructions */
                    <div className="space-y-3">
                      {platform === 'ios' ? (
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-xs">
                          <p className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                            <Smartphone className="w-4 h-4 text-primary" />
                            <span>Quick 2-Step Install on iOS (Safari):</span>
                          </p>
                          <div className="flex items-start gap-3 text-zinc-300">
                            <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 font-black text-[10px]">1</div>
                            <div className="space-y-0.5">
                              <p className="text-[11px] font-semibold text-white">Tap the <span className="inline-flex items-center text-blue-400 font-black"><Share className="w-3.5 h-3.5 inline mx-1" /> Share</span> button</p>
                              <p className="text-[10px] text-zinc-400">Found at the bottom of Safari's toolbar</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3 text-zinc-300">
                            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-black text-[10px]">2</div>
                            <div className="space-y-0.5">
                              <p className="text-[11px] font-semibold text-white">Tap <span className="inline-flex items-center text-emerald-400 font-black"><PlusSquare className="w-3.5 h-3.5 inline mx-1" /> Add to Home Screen</span></p>
                              <p className="text-[10px] text-zinc-400">Scroll down slightly in the share menu and tap Add</p>
                            </div>
                          </div>
                        </div>
                      ) : platform === 'android' ? (
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-xs">
                          <p className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                            <Smartphone className="w-4 h-4 text-emerald-400" />
                            <span>Quick Install on Android:</span>
                          </p>
                          <div className="flex items-start gap-3 text-zinc-300">
                            <div className="w-6 h-6 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0 font-black text-[10px]">1</div>
                            <div className="space-y-0.5">
                              <p className="text-[11px] font-semibold text-white">Tap the browser menu <MoreVertical className="w-3.5 h-3.5 inline text-primary" /></p>
                              <p className="text-[10px] text-zinc-400">Tap the three vertical dots at the top-right</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3 text-zinc-300">
                            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-black text-[10px]">2</div>
                            <div className="space-y-0.5">
                              <p className="text-[11px] font-semibold text-white">Select <span className="text-emerald-400 font-black">Install app</span> or <span className="text-emerald-400 font-black">Add to Home screen</span></p>
                              <p className="text-[10px] text-zinc-400">StreamAura will appear on your phone home screen</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-xs">
                          <p className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                            <Laptop className="w-4 h-4 text-indigo-400" />
                            <span>Install on Computer (Desktop App):</span>
                          </p>
                          <p className="text-[11px] text-zinc-300">
                            Look for the <Download className="w-3.5 h-3.5 inline text-primary mx-1" /> install icon in the address bar (next to the bookmark star), or open browser menu ⋮ and click <span className="font-bold text-white">"Install StreamAura"</span>.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* App Benefits */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10 text-[10px] font-semibold text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3 h-3 text-amber-400 fill-current" />
                      <span>Instant Fast Loading</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>100% Free & Verified</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3 text-blue-400" />
                      <span>No App Store Needed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-3 h-3 text-rose-400 fill-rose-400/20" />
                      <span>Ultra HD Streaming</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default InstallPWA;
