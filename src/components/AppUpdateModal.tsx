import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Zap, Film, ShieldCheck, ArrowRight, RefreshCw, X, Rocket } from 'lucide-react';
import { triggerAppUpdate } from '@/lib/appLifecycle';

interface AppUpdateModalProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({ forceOpen, onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (forceOpen !== undefined) {
      setIsOpen(forceOpen);
    }
  }, [forceOpen]);

  useEffect(() => {
    const handleUpdateAvailable = () => {
      setIsOpen(true);
    };

    window.addEventListener('aura_update_available', handleUpdateAvailable);
    return () => window.removeEventListener('aura_update_available', handleUpdateAvailable);
  }, []);

  const handleUpdateNow = () => {
    setIsUpdating(true);
    try {
      triggerAppUpdate();
    } catch (err) {
      console.error('Update trigger error:', err);
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    if (isUpdating) return;
    setIsOpen(false);
    if (onClose) onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/85 backdrop-blur-xl font-sans"
          onClick={handleDismiss}
        >
          {/* Subtle Ambient Background Glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
            <div className="w-[500px] h-[500px] bg-gradient-to-tr from-cyan-500/20 via-primary/20 to-purple-600/20 blur-[120px] rounded-full animate-pulse" />
          </div>

          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="relative w-full max-w-lg bg-[#0c101d]/95 border border-cyan-500/30 rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(6,182,212,0.25)] flex flex-col"
          >
            {/* Top Accent Neon Line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400 via-primary to-purple-500" />

            {/* Close Button */}
            {!isUpdating && (
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="p-6 sm:p-8 space-y-6">
              {/* Header Icon & Badges */}
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative">
                  {/* Glowing Animated Rings */}
                  <div className="absolute -inset-2 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-2xl blur-lg opacity-60 animate-pulse" />
                  <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#161c33] to-[#0d1224] border border-cyan-400/40 flex items-center justify-center shadow-xl shadow-cyan-500/20">
                    <Rocket className="w-8 h-8 text-cyan-400 animate-bounce duration-1000" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-cyan-400 border-2 border-[#0c101d] flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-black" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[10px] font-black uppercase tracking-widest mb-1 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    Fresh Update Ready
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Stream<span className="text-primary italic">Aura</span> Upgraded!
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    A fresh build is available with blazing fast speeds, smoother movie trailers, and instant stability upgrades.
                  </p>
                </div>
              </div>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-1 gap-2.5 pt-1">
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center flex-shrink-0 text-cyan-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white">Turbocharged Streaming & Trailers</h4>
                    <p className="text-[11px] text-muted-foreground">Faster loading times, zero-buffer video playback and instant seek.</p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center flex-shrink-0 text-purple-400">
                    <Film className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white">Cinema & Room Sync Boost</h4>
                    <p className="text-[11px] text-muted-foreground">Enhanced multi-user theater syncing and pre-order fulfillment.</p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center flex-shrink-0 text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white">Zero-Loss Session Preservation</h4>
                    <p className="text-[11px] text-muted-foreground">Your wallet balances, active rooms, and preferences stay 100% saved.</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  onClick={handleUpdateNow}
                  disabled={isUpdating}
                  className="w-full relative group overflow-hidden rounded-2xl py-3.5 px-6 font-black text-sm uppercase tracking-wider text-white shadow-xl shadow-cyan-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-primary to-purple-600 group-hover:opacity-90 transition-opacity" />
                  <div className="relative flex items-center justify-center gap-2">
                    {isUpdating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Applying Update...</span>
                      </>
                    ) : (
                      <>
                        <span>Update & Reload Now</span>
                        <ArrowRight className="w-4 h-4 text-cyan-200 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </div>
                </button>

                {!isUpdating && (
                  <button
                    onClick={handleDismiss}
                    className="w-full py-2.5 text-xs font-bold text-muted-foreground hover:text-white transition-colors text-center cursor-pointer"
                  >
                    Continue Watching (Update Later)
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AppUpdateModal;
