import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import type { AdCampaign, AdDismissMethod } from '../../types';
import { handleAdClick, recordAdDismissalLocally } from '../../lib/adFrequency';

interface AdPopupModalProps {
  ad: AdCampaign;
  isOpen: boolean;
  onClose: (method?: AdDismissMethod) => void;
  onNavigate?: (tab: any) => void;
  currentView?: string;
}

export const AdPopupModal: React.FC<AdPopupModalProps> = ({
  ad,
  isOpen,
  onClose,
  onNavigate,
  currentView
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleDismiss = useCallback((method: AdDismissMethod) => {
    recordAdDismissalLocally(ad.id, method);
    onClose(method);
  }, [ad.id, onClose]);

  // Auto-close countdown timer if configured
  useEffect(() => {
    if (!isOpen) {
      setCountdown(null);
      return;
    }

    if (ad.autoCloseSeconds && ad.autoCloseSeconds > 0) {
      setCountdown(ad.autoCloseSeconds);
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            handleDismiss('auto_timer');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isOpen, ad.autoCloseSeconds, handleDismiss]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleDismiss('esc_key');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleDismiss]);

  if (!isOpen) return null;

  const isFlyer = ad.type === 'flyer' || (ad as any).type === 'splash' || (ad as any).type === 'opay_flyer';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleAdClick(ad, onNavigate, isFlyer ? 'flyer' : 'popup', currentView);
    onClose();
  };

  // Determine rounded corner classes
  const getRoundedClass = () => {
    switch (ad.roundedCorners) {
      case 'xl': return 'rounded-xl';
      case '2xl': return 'rounded-2xl';
      case 'full': return 'rounded-[2.5rem]';
      case '3xl':
      default: return 'rounded-3xl';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={() => handleDismiss('backdrop_tap')}
    >
      {/* Dark Glass Backdrop with Smooth Fade */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 bg-black/85 backdrop-blur-md"
      />

      {/* OPay-Style Flyer Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 25 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ 
          type: "spring", 
          damping: 26, 
          stiffness: 340,
          mass: 0.8
        }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[86vw] max-w-[310px] sm:max-w-[340px] md:max-w-[360px] my-auto z-10 flex flex-col items-center"
      >
        {/* Flyer Card Surface */}
        <div 
          onClick={ad.targetUrl ? handleClick : undefined}
          className={`group relative w-full overflow-hidden ${getRoundedClass()} bg-[#0b0f19] border border-white/15 shadow-2xl shadow-black/90 cursor-pointer transition-all hover:border-white/30`}
          style={{
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.95), 0 0 35px rgba(99, 102, 241, 0.15)'
          }}
        >
          {/* Flyer Image Container (100% full content, zero zoom or cropping) */}
          <div className="relative w-full overflow-hidden bg-black/60 flex items-center justify-center min-h-[220px]">
            <img
              src={ad.imageUrl}
              alt={ad.title || "Special Announcement"}
              referrerPolicy="no-referrer"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
              className={`w-full h-auto max-h-[56vh] sm:max-h-[62vh] object-contain block mx-auto transition-transform duration-300 group-hover:scale-[1.01] ${
                imageLoaded ? 'opacity-100' : 'opacity-0 min-h-[220px]'
              }`}
            />

            {/* Shimmer Placeholder while loading */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center">
                <div className="w-9 h-9 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              </div>
            )}

            {/* Subtle overlay gradient on hover */}
            {ad.targetUrl && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            )}
          </div>

          {/* Bottom CTA / Action Banner if target URL or description exists */}
          {(ad.buttonText || ad.description || ad.targetUrl) && (
            <div className="p-3.5 sm:p-4 bg-gradient-to-b from-[#0f172a]/95 to-[#020617]/98 border-t border-white/10 space-y-2">
              {ad.title && (
                <h3 className="font-bold text-white text-xs sm:text-sm leading-snug line-clamp-1 text-center">
                  {ad.title}
                </h3>
              )}

              {ad.description && (
                <p className="text-[11px] text-white/70 line-clamp-2 text-center">
                  {ad.description}
                </p>
              )}

              {ad.targetUrl && (
                <button
                  onClick={handleClick}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{ad.buttonText || "Learn More"}</span>
                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* OPay-Style Bottom Middle Close Button */}
        <div className="flex flex-col items-center justify-center pt-3 sm:pt-4 gap-1.5">
          <button
            onClick={() => handleDismiss('close_button')}
            className="group w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/20 hover:bg-white/30 active:scale-90 border border-white/40 hover:border-white/80 text-white backdrop-blur-md shadow-2xl transition-all duration-200 flex items-center justify-center cursor-pointer hover:scale-105"
            title="Close"
          >
            <X className="w-5 h-5 text-white transition-transform group-hover:rotate-90 duration-200" />
          </button>

          {/* Countdown timer if configured */}
          {countdown !== null && countdown > 0 && (
            <div className="flex items-center justify-center pt-0.5 text-[10px] font-medium">
              <span className="px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 font-bold text-amber-300">
                Closing in {countdown}s
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
