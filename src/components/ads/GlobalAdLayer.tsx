import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { AdCampaign, ViewType } from '../../types';
import { listenToAds } from '../../lib/firebase';
import { canShowAd, recordAdImpressionLocally } from '../../lib/adFrequency';
import { AdPopupModal } from './AdPopupModal';
import { AdBannerRenderer } from './AdBannerRenderer';

interface GlobalAdLayerProps {
  currentView: ViewType;
  onNavigate?: (tab: any) => void;
}

export const GlobalAdLayer: React.FC<GlobalAdLayerProps> = ({
  currentView,
  onNavigate
}) => {
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [activePopup, setActivePopup] = useState<AdCampaign | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  
  // Track popups shown on the current view visit to avoid infinite re-trigger loops
  const shownOnCurrentViewRef = useRef<Set<string>>(new Set());
  const currentViewRef = useRef<ViewType>(currentView);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPopupOpenRef = useRef<boolean>(false);
  isPopupOpenRef.current = isPopupOpen;

  // Track if we are on initial app entry / launch vs subsequent page navigations
  const isAppLaunchRef = useRef<boolean>(true);
  const launchFlyerCheckedRef = useRef<boolean>(false);

  // Clear per-view shown set when user switches pages and mark that app launch phase has passed
  useEffect(() => {
    if (currentViewRef.current !== currentView) {
      currentViewRef.current = currentView;
      shownOnCurrentViewRef.current.clear();
      isAppLaunchRef.current = false;
    }
  }, [currentView]);

  // Subscribe to real-time ads
  useEffect(() => {
    const unsubscribe = listenToAds((fetchedAds) => {
      setAds(fetchedAds.filter(a => a.active !== false));
    });
    return () => unsubscribe();
  }, []);

  // Allow manual test triggers from Ads Manager
  useEffect(() => {
    const handleTestAd = (e: any) => {
      const testCampaign = e.detail?.ad as AdCampaign;
      if (testCampaign) {
        setActivePopup(testCampaign);
        setIsPopupOpen(true);
      }
    };
    window.addEventListener('test-ad-popup', handleTestAd);
    return () => window.removeEventListener('test-ad-popup', handleTestAd);
  }, []);

  // Evaluate modal ads (OPay Flyer on App Launch OR Targeted Smart Popup on Page Views)
  useEffect(() => {
    if (ads.length === 0) {
      return;
    }

    // If an ad popup is currently open, do not interrupt
    if (isPopupOpenRef.current) {
      return;
    }

    // Suppress popups on admin/vendor screens unless targeted
    if (currentView === 'admin' || currentView === 'vendor') {
      return;
    }

    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }

    // 1. App Launch: Check for OPay App-Launch Flyer ONLY on initial app open
    if (isAppLaunchRef.current && !launchFlyerCheckedRef.current) {
      const flyerCandidate = ads.find(ad => 
        (ad.type === 'flyer' || (ad as any).type === 'splash' || (ad as any).type === 'opay_flyer') && 
        canShowAd(ad, currentView, { isAppLaunch: true })
      );

      if (flyerCandidate) {
        launchFlyerCheckedRef.current = true;
        const configuredDelay = (flyerCandidate.displayDelaySeconds || 0) * 1000;
        const delayMs = Math.max(300, configuredDelay);

        delayTimerRef.current = setTimeout(() => {
          setActivePopup(flyerCandidate);
          setIsPopupOpen(true);
          shownOnCurrentViewRef.current.add(flyerCandidate.id);
          recordAdImpressionLocally(flyerCandidate.id, 'flyer');
        }, delayMs);
        return;
      }
    }

    // 2. In-App Navigation: Check for Targeted Smart Popup Ads on targeted page visits
    const popupAds = ads.filter(ad => 
      (ad.type === 'popup' || (!ad.type && (ad as any).type !== 'flyer')) && 
      canShowAd(ad, currentView, { isAppLaunch: false })
    );

    if (popupAds.length > 0) {
      // Find candidate popup that hasn't been shown on this view visit yet
      const candidate = popupAds.find(p => !shownOnCurrentViewRef.current.has(p.id));

      if (candidate) {
        const configuredDelay = (candidate.displayDelaySeconds || 0) * 1000;
        const delayMs = Math.max(300, configuredDelay);

        delayTimerRef.current = setTimeout(() => {
          setActivePopup(candidate);
          setIsPopupOpen(true);
          shownOnCurrentViewRef.current.add(candidate.id);
          recordAdImpressionLocally(candidate.id, 'popup');
        }, delayMs);
      }
    }

    return () => {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
    };
  }, [currentView, ads]);

  const handleClosePopup = () => {
    setIsPopupOpen(false);
    setTimeout(() => {
      setActivePopup(null);
    }, 350);
  };

  // Filter banner & carousel ads for current view
  const eligibleBanners = ads.filter(ad => ad.type === 'banner' && canShowAd(ad, currentView));
  const eligibleCarousels = ads.filter(ad => ad.type === 'carousel' && canShowAd(ad, currentView));

  // Record impression for banners and carousels when mounted on view
  useEffect(() => {
    eligibleBanners.forEach(ad => {
      recordAdImpressionLocally(ad.id, 'banner');
    });
    eligibleCarousels.forEach(ad => {
      recordAdImpressionLocally(ad.id, 'carousel');
    });
  }, [currentView, eligibleBanners.length, eligibleCarousels.length]);

  return (
    <>
      {/* 1. Global OPay Flyer Popup Modal */}
      <AnimatePresence>
        {isPopupOpen && activePopup && (
          <AdPopupModal
            ad={activePopup}
            isOpen={isPopupOpen}
            onClose={handleClosePopup}
            onNavigate={onNavigate}
            currentView={currentView}
          />
        )}
      </AnimatePresence>

      {/* 2. Top Banners & Carousels */}
      {(eligibleBanners.some(b => (b.bannerPosition || 'top') === 'top') || eligibleCarousels.length > 0) && (
        <AdBannerRenderer
          banners={eligibleBanners}
          carousels={eligibleCarousels}
          onNavigate={onNavigate}
          position="top"
          currentView={currentView}
        />
      )}

      {/* 3. Bottom Sticky Banners */}
      {eligibleBanners.some(b => b.bannerPosition === 'bottom') && (
        <div className="fixed bottom-16 sm:bottom-4 inset-x-4 sm:inset-x-8 max-w-5xl mx-auto z-40 pointer-events-auto">
          <AdBannerRenderer
            banners={eligibleBanners}
            carousels={[]}
            onNavigate={onNavigate}
            position="bottom"
            currentView={currentView}
          />
        </div>
      )}
    </>
  );
};
