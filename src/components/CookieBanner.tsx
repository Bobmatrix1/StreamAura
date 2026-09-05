import React, { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';
import { Button } from './ui/button';
import type { ViewType } from '@/types';

interface CookieBannerProps {
  onNavigate?: (tab: ViewType) => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onNavigate }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('streamaura_cookie_consent');
    if (!consent) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('streamaura_cookie_consent', 'accepted_all');
    setIsVisible(false);
  };

  const handleEssentialOnly = () => {
    localStorage.setItem('streamaura_cookie_consent', 'essential_only');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="bg-background/90 dark:bg-[#0c0d14]/95 backdrop-blur-xl border border-white/15 rounded-2xl p-3 sm:py-2.5 sm:px-3.5 shadow-2xl shadow-black/80 flex items-center gap-3">
        {/* Cookie Icon */}
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
          <Cookie className="w-4 h-4" />
        </div>

        {/* Text & Policy Link */}
        <div className="flex-1 min-w-0 text-[11px] sm:text-xs text-muted-foreground leading-snug">
          <span>We use cookies to enhance your experience. </span>
          {onNavigate && (
            <button
              onClick={() => {
                onNavigate('cookies');
                setIsVisible(false);
              }}
              className="text-primary hover:underline font-semibold inline"
            >
              Policy
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            onClick={handleAcceptAll}
            className="h-7 px-3 rounded-lg text-[11px] font-bold bg-primary hover:bg-primary/80 text-white shadow-sm"
          >
            Accept
          </Button>
          <button
            onClick={handleEssentialOnly}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
            title="Essential only"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieBanner;
