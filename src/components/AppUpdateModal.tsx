import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  Wrench, 
  Plus, 
  RefreshCw, 
  X, 
  ArrowRight, 
  Layers, 
  ShieldCheck
} from 'lucide-react';
import { triggerAppUpdate } from '@/lib/appLifecycle';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { AppUpdateData, AppUpdateHighlight } from '@/types';

interface AppUpdateModalProps {
  forceOpen?: boolean;
  onClose?: () => void;
  previewData?: Partial<AppUpdateData>;
}

const DEFAULT_HIGHLIGHTS: AppUpdateHighlight[] = [
  {
    id: 'h1',
    type: 'improved',
    title: 'Turbocharged Streaming & Engine Boost',
    description: 'Faster media extraction, smoother video playback, and zero-delay seeking.'
  },
  {
    id: 'h2',
    type: 'added',
    title: 'Smart Referral & Bonus Crediting',
    description: 'Instant invitation routing to sign up with automatic welcome coin bonuses.'
  },
  {
    id: 'h3',
    type: 'fixed',
    title: 'Cinema Room Sync & Store Reliability',
    description: 'Enhanced theater room syncing, seamless refreshment orders, and back navigation.'
  }
];

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({ forceOpen, onClose, previewData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateData, setUpdateData] = useState<AppUpdateData | null>(null);

  // Real-time Firestore sync with admin's latest release notes
  useEffect(() => {
    try {
      const updateRef = doc(db, 'app_updates', 'latest');
      const unsubscribe = onSnapshot(updateRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data() as AppUpdateData;
          setUpdateData(data);

          // If the admin pushed an update with forcePopup and the user hasn't applied or dismissed it in this session
          if (data.forcePopup && data.id) {
            const appliedId = localStorage.getItem('aura_applied_update_id');
            const dismissedSession = sessionStorage.getItem(`aura_update_dismissed_${data.id}`);
            if (appliedId !== data.id && dismissedSession !== 'true') {
              setIsOpen(true);
            }
          }
        }
      }, (err) => {
        console.warn('App updates listener note:', err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('App updates onSnapshot setup note:', e);
    }
  }, []);

  // Control via forceOpen prop (for preview or manual triggers)
  useEffect(() => {
    if (forceOpen !== undefined) {
      setIsOpen(forceOpen);
    }
  }, [forceOpen]);

  // Listen for Service Worker updatefound / installed events
  useEffect(() => {
    const handleUpdateAvailable = () => {
      setIsOpen(true);
    };

    window.addEventListener('aura_update_available', handleUpdateAvailable);
    return () => window.removeEventListener('aura_update_available', handleUpdateAvailable);
  }, []);

  const effectiveData: Partial<AppUpdateData> = previewData || updateData || {};
  const version = effectiveData.version || 'v2.5.0';
  const title = effectiveData.title || 'StreamAura Upgraded!';
  const description = effectiveData.description || 'A new build is available with performance improvements, bug fixes, and new features.';
  const rawHighlights = (effectiveData.highlights && effectiveData.highlights.length > 0)
    ? effectiveData.highlights
    : DEFAULT_HIGHLIGHTS;

  const handleUpdateNow = () => {
    setIsUpdating(true);
    try {
      const updateId = effectiveData.id || `build_${Date.now()}`;
      localStorage.setItem('aura_applied_update_id', updateId);
      triggerAppUpdate();
    } catch (err) {
      console.error('Update trigger error:', err);
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    if (isUpdating) return;
    const updateId = effectiveData.id || 'latest';
    try {
      sessionStorage.setItem(`aura_update_dismissed_${updateId}`, 'true');
    } catch {}
    setIsOpen(false);
    if (onClose) onClose();
  };

  const getBadgeStyle = (type: 'added' | 'fixed' | 'improved') => {
    switch (type) {
      case 'added':
        return {
          icon: <Plus className="w-3 h-3 text-emerald-400" />,
          label: 'ADDED',
          container: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
        };
      case 'fixed':
        return {
          icon: <Wrench className="w-3 h-3 text-amber-400" />,
          label: 'FIXED',
          container: 'bg-amber-500/10 border-amber-500/25 text-amber-400'
        };
      case 'improved':
      default:
        return {
          icon: <Zap className="w-3 h-3 text-cyan-400" />,
          label: 'IMPROVED',
          container: 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400'
        };
    }
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
            <div className="w-[480px] h-[480px] bg-gradient-to-tr from-cyan-500/15 via-primary/15 to-purple-600/15 blur-[120px] rounded-full" />
          </div>

          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 26 }}
            className="relative w-full max-w-lg bg-[#0a0e1a]/95 border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/80 flex flex-col"
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

            <div className="p-6 sm:p-7 space-y-6">
              {/* Header Info */}
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 via-cyan-500/10 to-transparent border border-cyan-400/30 flex items-center justify-center shadow-lg shadow-cyan-500/15">
                    <Layers className="w-7 h-7 text-cyan-400" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-[10px] font-black uppercase tracking-wider shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>UPDATE AVAILABLE • {version}</span>
                  </div>
                  
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {title}
                  </h2>
                  
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    {description}
                  </p>
                </div>
              </div>

              {/* What's New & Fixed Section */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                    What's Added & Fixed
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-cyan-400/70 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                    {rawHighlights.length} Updates
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                  {rawHighlights.map((item, idx) => {
                    const badge = getBadgeStyle(item.type);
                    return (
                      <div 
                        key={item.id || idx} 
                        className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all flex items-start gap-3 group"
                      >
                        <div className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 mt-0.5 ${badge.container}`}>
                          {badge.icon}
                          <span>{badge.label}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white group-hover:text-cyan-200 transition-colors">
                            {item.title}
                          </h4>
                          {item.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Data & Security Assurance */}
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-emerald-400/90">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                <p className="text-[10px] font-semibold tracking-wide">
                  Your active downloads, wallet coins, and cinema rooms remain 100% safe.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleUpdateNow}
                  disabled={isUpdating}
                  className="w-full relative group overflow-hidden rounded-2xl py-3.5 px-6 font-black text-xs sm:text-sm uppercase tracking-wider text-white shadow-xl shadow-cyan-500/20 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-primary to-purple-600 group-hover:opacity-95 transition-opacity" />
                  <div className="relative flex items-center justify-center gap-2">
                    {isUpdating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Applying Update...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 text-white group-hover:rotate-180 transition-transform duration-500" />
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
                    Continue (Update Later)
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
