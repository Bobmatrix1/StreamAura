import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import type { AdCampaign } from '../../types';
import { handleAdClick, recordAdDismissalLocally } from '../../lib/adFrequency';

interface AdBannerRendererProps {
  banners: AdCampaign[];
  carousels: AdCampaign[];
  onNavigate?: (tab: any) => void;
  position?: 'top' | 'bottom';
  currentView?: string;
}

interface CarouselSlide {
  ad: AdCampaign;
  imageUrl: string;
  destinationType?: 'external' | 'in_app' | 'none';
  targetUrl?: string;
  inAppPage?: string;
  buttonText?: string;
  title?: string;
  description?: string;
  slideIndex: number;
  totalSlides: number;
  key: string;
}

export const AdBannerRenderer: React.FC<AdBannerRendererProps> = ({
  banners,
  carousels,
  onNavigate,
  position = 'top',
  currentView
}) => {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const activeBanners = banners.filter(b => 
    !dismissedIds.has(b.id) && 
    (b.bannerPosition || 'top') === position
  );

  const activeCarousels = carousels.filter(c => !dismissedIds.has(c.id));

  // Build flattened slide list supporting multi-image carousel campaigns with per-slide destinations
  const allCarouselSlides: CarouselSlide[] = [];
  activeCarousels.forEach(ad => {
    if (ad.carouselSlides && ad.carouselSlides.length > 0) {
      ad.carouselSlides.forEach((slide, sIdx) => {
        allCarouselSlides.push({
          ad,
          imageUrl: slide.imageUrl,
          destinationType: slide.destinationType || (slide.inAppPage ? 'in_app' : slide.targetUrl ? 'external' : (ad.destinationType || 'external')),
          targetUrl: slide.targetUrl || ad.targetUrl,
          inAppPage: slide.inAppPage || (slide.targetUrl?.startsWith('/') ? slide.targetUrl.replace('/', '') : undefined),
          buttonText: slide.buttonText || ad.buttonText || 'Learn More',
          title: slide.title || ad.title,
          description: ad.description,
          slideIndex: sIdx,
          totalSlides: ad.carouselSlides!.length,
          key: `${ad.id}_slide_${sIdx}`
        });
      });
    } else {
      const images = (ad.imageUrls && ad.imageUrls.length > 0) ? ad.imageUrls : (ad.imageUrl ? [ad.imageUrl] : []);
      images.forEach((imgUrl, sIdx) => {
        allCarouselSlides.push({
          ad,
          imageUrl: imgUrl,
          destinationType: ad.destinationType || (ad.targetUrl?.startsWith('/') ? 'in_app' : 'external'),
          targetUrl: ad.targetUrl,
          inAppPage: ad.targetUrl?.startsWith('/') ? ad.targetUrl.replace('/', '') : undefined,
          buttonText: ad.buttonText || 'Learn More',
          title: ad.title,
          description: ad.description,
          slideIndex: sIdx,
          totalSlides: images.length,
          key: `${ad.id}_slide_${sIdx}`
        });
      });
    }
  });

  // Clamp carousel index if slides length changed
  useEffect(() => {
    if (carouselIndex >= allCarouselSlides.length && allCarouselSlides.length > 0) {
      setCarouselIndex(0);
    }
  }, [allCarouselSlides.length, carouselIndex]);

  // Auto-scroll moving carousel every 3.8 seconds
  useEffect(() => {
    if (allCarouselSlides.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCarouselIndex(prev => (prev + 1) % allCarouselSlides.length);
    }, 3800);

    return () => clearInterval(timer);
  }, [allCarouselSlides.length, isPaused]);

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    recordAdDismissalLocally(id, 'close_button');
    setDismissedIds(prev => new Set([...prev, id]));
  };

  const handleSlideClick = (slide: CarouselSlide) => {
    if (slide.destinationType === 'none') {
      return;
    }

    let customTarget: string | undefined = undefined;
    if (slide.destinationType === 'in_app') {
      customTarget = slide.inAppPage || (slide.targetUrl ? slide.targetUrl.replace(/^\//, '') : undefined);
    } else {
      customTarget = slide.targetUrl;
    }

    handleAdClick(slide.ad, onNavigate, 'carousel', currentView, customTarget);
  };

  const currentSlide = allCarouselSlides[carouselIndex];

  return (
    <div className="w-full space-y-4 my-2">
      {/* 1. Full-Size Moving Carousel Banner (Supports Multi-Image Slides with Per-Slide Destinations) */}
      {position === 'top' && allCarouselSlides.length > 0 && currentSlide && (
        <div 
          className="relative w-full overflow-hidden rounded-2xl md:rounded-3xl border border-white/15 bg-[#060913] shadow-2xl group"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          {/* Fixed Top-Right Dismiss (X) Button: Ultra-clean Glassmorphic Floating Button */}
          <button
            onClick={(e) => handleDismiss(currentSlide.ad.id, e)}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 p-2 sm:p-2.5 rounded-full bg-black/40 hover:bg-white/20 active:scale-90 backdrop-blur-xl border border-white/25 hover:border-white/50 text-white/80 hover:text-white transition-all duration-200 shadow-[0_8px_32px_0_rgba(0,0,0,0.45)] hover:shadow-[0_8px_32px_0_rgba(255,255,255,0.15)] cursor-pointer pointer-events-auto flex items-center justify-center group/btn"
            title="Dismiss ad"
            aria-label="Close ad"
          >
            <X className="w-4 h-4 transition-transform duration-200 group-hover/btn:rotate-90 text-white drop-shadow-sm" />
          </button>

          {/* Full Carousel Banner Container (Full-bleed creative layout) */}
          <div className="relative w-full h-[150px] sm:h-[190px] md:h-[230px] lg:h-[260px] overflow-hidden flex items-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.key}
                initial={{ opacity: 0, scale: 1.03, x: 40 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.98, x: -40 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                onClick={() => handleSlideClick(currentSlide)}
                className="w-full h-full cursor-pointer relative overflow-hidden flex items-end select-none"
              >
                {/* Full-bleed high-res artwork banner image */}
                <img 
                  src={currentSlide.imageUrl} 
                  alt={currentSlide.title || currentSlide.ad.title} 
                  className="absolute inset-0 w-full h-full object-cover object-center" 
                />

                {/* Ambient dark gradient overlay to ensure text and buttons stand out clearly */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-transparent to-black/40 pointer-events-none" />

                {/* Bottom Overlay: Title, Description & CTA Button */}
                <div className="relative z-10 w-full p-4 sm:p-5 sm:pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3 pr-14 sm:pr-16">
                  <div className="space-y-1 max-w-xl">
                    <h3 className="font-extrabold text-base sm:text-xl md:text-2xl text-white drop-shadow-md line-clamp-1">
                      {currentSlide.title || currentSlide.ad.title}
                    </h3>
                    {(currentSlide.description || currentSlide.ad.description) && (
                      <p className="text-xs sm:text-sm text-white/85 line-clamp-1 drop-shadow font-medium">
                        {currentSlide.description || currentSlide.ad.description}
                      </p>
                    )}
                  </div>

                  {currentSlide.destinationType !== 'none' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSlideClick(currentSlide);
                        }}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-indigo-600/40 flex items-center gap-2 active:scale-95 transition-all border border-white/20"
                      >
                        <span>{currentSlide.buttonText || currentSlide.ad.buttonText || "Learn More"}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* 2. Static / Sticky Banner Items */}
      {activeBanners.map(ad => (
        <motion.div
          key={ad.id}
          initial={{ opacity: 0, y: position === 'top' ? -10 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={() => handleAdClick(ad, onNavigate, 'banner', currentView)}
          className="relative w-full rounded-2xl overflow-hidden glass-card p-3 sm:p-4 border border-white/10 hover:border-white/20 transition-all cursor-pointer shadow-lg flex items-center justify-between gap-3 group"
        >
          {/* Visual left pill / thumbnail */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 border border-white/10 flex-shrink-0">
              <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
            </div>

            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Ad
                </span>
                <h4 className="font-bold text-xs sm:text-sm text-white truncate">
                  {ad.title}
                </h4>
              </div>
              {ad.description && (
                <p className="text-[11px] text-white/60 truncate">
                  {ad.description}
                </p>
              )}
            </div>
          </div>

          {/* Right Action & Dismiss */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAdClick(ad, onNavigate, 'banner', currentView);
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1 transition-all active:scale-95 shadow"
            >
              <span>{ad.buttonText || "Open"}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => handleDismiss(ad.id, e)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 hover:border-white/30 text-white/60 hover:text-white transition-all active:scale-95 shadow-sm group/close"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5 transition-transform duration-200 group-hover/close:rotate-90" />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

