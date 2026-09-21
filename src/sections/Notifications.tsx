import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Info, 
  AlertTriangle, 
  Zap,
  Inbox,
  CheckCheck,
  RefreshCcw,
  Banknote,
  Play,
  Download,
  Users,
  Film,
  Tv,
  ShoppingBag,
  Truck,
  PackageCheck,
  XCircle,
  Star,
  Loader2,
  ChefHat,
  ExternalLink,
  Megaphone
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
  listenToNotifications, 
  listenToAds,
  markAsRead, 
  markAllAsRead,
  clearNotification, 
  clearAllUserNotifications,
  adminClearAllGlobalNotifications,
  updatePreOrderStatus,
  rateVendorOrder,
  type AppNotification 
} from '../lib/firebase';
import type { AdCampaign } from '../types';
import { recordAdClickLocally } from '../lib/adFrequency';
import { toast } from 'sonner';

import { LoginRequired } from '../components/LoginRequired';

const NotificationCarousel: React.FC<{
  notif: AppNotification;
  adCampaign?: AdCampaign;
  onNotificationClick: (notif: AppNotification, customLink?: string) => void;
}> = ({ notif, adCampaign, onNotificationClick }) => {
  const slides = React.useMemo(() => {
    // 1. Structured carousel slides from notification or live ad campaign
    let rawSlides: any = notif.carouselSlides || adCampaign?.carouselSlides;
    if (typeof rawSlides === 'string') {
      try { rawSlides = JSON.parse(rawSlides); } catch (e) {}
    }
    if (Array.isArray(rawSlides) && rawSlides.length > 0) {
      return rawSlides.map((s: any, idx: number) => ({
        imageUrl: typeof s === 'string' ? s : (s.imageUrl || s.url || s.image || ''),
        title: (typeof s === 'object' && s.title) ? s.title : (notif.title || adCampaign?.title),
        buttonText: (typeof s === 'object' && s.buttonText) ? s.buttonText : (notif.buttonText || adCampaign?.buttonText || 'Open Offer'),
        link: (typeof s === 'object' && s.destinationType === 'in_app') ? (s.inAppPage || s.targetUrl) : (typeof s === 'object' ? (s.targetUrl || notif.link || adCampaign?.targetUrl) : (notif.link || adCampaign?.targetUrl)),
        key: `slide_${idx}`
      })).filter(s => s.imageUrl);
    }

    // 2. Image URLs array from notification or live ad campaign
    let rawImgs: any = notif.imageUrls || adCampaign?.imageUrls || (notif as any).carouselImages || (notif as any).images;
    if (typeof rawImgs === 'string') {
      try { rawImgs = JSON.parse(rawImgs); } catch (e) {
        if (rawImgs.includes(',')) rawImgs = rawImgs.split(',').map((s: string) => s.trim());
      }
    }
    if (Array.isArray(rawImgs) && rawImgs.length > 0) {
      return rawImgs.map((url: any, idx: number) => ({
        imageUrl: typeof url === 'string' ? url : (url.imageUrl || url.url || url.image || ''),
        title: notif.title || adCampaign?.title,
        buttonText: notif.buttonText || adCampaign?.buttonText || 'Open Offer',
        link: notif.link || adCampaign?.targetUrl,
        key: `slide_${idx}`
      })).filter(s => s.imageUrl);
    }

    // 3. Single image fallback
    const singleImg = notif.imageUrl || adCampaign?.imageUrl;
    if (singleImg) {
      return [{
        imageUrl: singleImg,
        title: notif.title || adCampaign?.title,
        buttonText: notif.buttonText || adCampaign?.buttonText || 'Open Offer',
        link: notif.link || adCampaign?.targetUrl,
        key: 'slide_0'
      }];
    }
    return [];
  }, [notif, adCampaign]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto-move moving carousel every 3.0 seconds reliably
  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % slides.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [slides.length]);

  if (slides.length === 0) return null;

  const currentSlide = slides[currentIndex] || slides[0];

  if (slides.length === 1) {
    return (
      <div 
        onClick={(e) => { 
          e.stopPropagation(); 
          onNotificationClick(notif, currentSlide.link); 
        }}
        className="mt-2.5 rounded-xl overflow-hidden border border-white/10 max-h-56 max-w-md cursor-pointer group relative shadow-lg bg-black/40"
      >
        <img 
          src={currentSlide.imageUrl} 
          alt={currentSlide.title || notif.title} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 max-h-52" 
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="px-3 py-1.5 rounded-lg bg-black/80 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg border border-white/20">
            <ExternalLink className="w-3.5 h-3.5" /> {currentSlide.buttonText || 'Open Offer'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="mt-3 rounded-2xl overflow-hidden border border-white/15 bg-[#060913] shadow-xl relative group select-none max-w-lg"
    >
      {/* Top Animated Progress Bar for Auto-Sliding */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-30 overflow-hidden">
        <motion.div
          key={`bar_${currentIndex}`}
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 3.0, ease: "linear" }}
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.8)]"
        />
      </div>

      {/* Moving Carousel Container */}
      <div 
        className="relative h-48 sm:h-56 w-full cursor-pointer overflow-hidden flex items-end"
        onClick={(e) => {
          e.stopPropagation();
          onNotificationClick(notif, currentSlide.link);
        }}
      >
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`slide_${currentIndex}_${currentSlide.imageUrl}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
            className="absolute inset-0 w-full h-full"
          >
            <img 
              src={currentSlide.imageUrl} 
              alt={currentSlide.title || notif.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            />
            {/* Ambient shadow gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/30 pointer-events-none" />
          </motion.div>
        </AnimatePresence>

        {/* Bottom Bar: Title & Action */}
        <div className="relative z-20 w-full p-3 sm:p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {currentSlide.title && (
              <h4 className="text-white font-bold text-xs sm:text-sm truncate drop-shadow">
                {currentSlide.title}
              </h4>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNotificationClick(notif, currentSlide.link);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-indigo-500/25 shrink-0 active:scale-95 transition-all border border-white/20 cursor-pointer"
          >
            <span>{currentSlide.buttonText || 'Open Offer'}</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Multi-Slide Navigation Dots Indicator */}
      {slides.length > 1 && (
        <div className="py-2.5 bg-white/[0.03] border-t border-white/10 flex items-center justify-center gap-1.5 z-20 relative">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              className={`transition-all rounded-full cursor-pointer ${
                currentIndex === idx 
                  ? 'w-6 h-1.5 bg-gradient-to-r from-indigo-500 to-pink-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' 
                  : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/50'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Notifications: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return (
      <LoginRequired 
        title="Stay Informed"
        description="Sign in to view your personal notifications, system updates, and download alerts."
        icon={Bell}
      />
    );
  }
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedNotifForOptions, setSelectedNotifForOptions] = useState<AppNotification | null>(null);
  const [ratingStates, setRatingStates] = useState<Record<string, { rating: number; hoverRating: number; review: string; isSubmitting: boolean }>>({});

  useEffect(() => {
    const unsub = listenToAds((fetched) => {
      setAds(fetched);
    });
    return () => unsub();
  }, []);

  const adsMap = React.useMemo(() => {
    const map = new Map<string, AdCampaign>();
    ads.forEach(a => map.set(a.id, a));
    return map;
  }, [ads]);

  const loadNotifications = () => {
    if (!user?.uid) return () => {};
    
    setIsLoading(true);

    // Safety timeout: stop spinner after 5 seconds no matter what
    const timer = setTimeout(() => setIsLoading(false), 5000);

    const unsubscribe = listenToNotifications(
      user.uid, 
      (notifs) => {
        clearTimeout(timer);
        setNotifications(notifs as AppNotification[]);
        setIsLoading(false);
      },
      (err) => {
        clearTimeout(timer);
        console.error('Notification error:', err);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = loadNotifications();
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [user?.uid]);

  const handleMarkRead = async (id: string) => {
    if (!user?.uid) return;
    await markAsRead(user.uid, id);
  };

  const handleReadAll = async () => {
    if (!user?.uid || notifications.length === 0) return;
    await markAllAsRead(user.uid);
  };

  const handleClear = async (id: string) => {
    if (!user?.uid) return;
    const itemToDelete = notifications.find(n => n.id === id);

    // 1. Instant Optimistic UI removal (0ms perceived lag)
    setNotifications(prev => prev.filter(n => n.id !== id));
    toast.success('Notification removed');

    // 2. Perform deletion
    try {
      await clearNotification(user.uid, id);
    } catch (err) {
      if (itemToDelete) {
        setNotifications(prev => [itemToDelete, ...prev]);
      }
      toast.error('Failed to remove notification');
    }
  };

  const handleClearAll = async () => {
    if (!user?.uid || notifications.length === 0) return;
    const backup = [...notifications];

    // 1. Instant Optimistic UI clear
    setNotifications([]);
    setIsConfirmOpen(false);
    toast.success('All notifications cleared');

    // 2. Perform bulk clear
    try {
      await clearAllUserNotifications(user.uid);
    } catch (err) {
      setNotifications(backup);
      toast.error('Failed to clear notifications');
    }
  };

  const handleAdminGlobalClear = async () => {
    if (!user?.isAdmin) return;
    if (!window.confirm("ADMIN ONLY: Are you sure you want to permanently delete ALL notifications for ALL users across the entire system?")) return;
    
    setNotifications([]);
    setIsConfirmOpen(false);
    toast.info('Wiping all platform notifications...');
    
    try {
      const res = await adminClearAllGlobalNotifications();
      if (res.success) {
        toast.success(`Global wipe complete: ${res.deleted_count ?? 0} notifications deleted across all users.`);
      } else {
        toast.error(res.error || 'Admin wipe failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to wipe global notifications');
    }
  };

  const handleStarClick = (notifId: string, star: number) => {
    setRatingStates(prev => ({
      ...prev,
      [notifId]: {
        rating: star,
        hoverRating: star,
        review: prev[notifId]?.review || '',
        isSubmitting: false
      }
    }));
  };

  const handleStarHover = (notifId: string, star: number) => {
    setRatingStates(prev => ({
      ...prev,
      [notifId]: {
        rating: prev[notifId]?.rating || 0,
        hoverRating: star,
        review: prev[notifId]?.review || '',
        isSubmitting: false
      }
    }));
  };

  const handleSubmitRating = async (notif: AppNotification) => {
    const currentRatingState = ratingStates[notif.id];
    const score = currentRatingState?.rating || 5;
    const review = currentRatingState?.review || '';
    
    if (!notif.vendorId && !notif.orderId) {
      toast.error('Missing vendor information to rate.');
      return;
    }

    setRatingStates(prev => ({
      ...prev,
      [notif.id]: {
        ...prev[notif.id],
        rating: score,
        hoverRating: score,
        review,
        isSubmitting: true
      }
    }));

    try {
      await rateVendorOrder(
        notif.orderId || '',
        notif.vendorId || '',
        score,
        review,
        notif.id,
        user?.uid
      );
      toast.success(`Thank you for rating ${notif.vendorName || 'the vendor'}!`);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, rated: true, rating: score } : n));
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit rating');
    } finally {
      setRatingStates(prev => ({
        ...prev,
        [notif.id]: {
          ...prev[notif.id],
          isSubmitting: false
        }
      }));
    }
  };

  const handleNotificationClick = async (notif: AppNotification, customLink?: string) => {
    if (notif.adId) {
      recordAdClickLocally(notif.adId, 'notification');
    }
    if (!notif.read && user?.uid) {
      await handleMarkRead(notif.id);
    }
    const targetLink = customLink || notif.link;
    if (targetLink) {
      const rawLink = targetLink.trim();
      const cleanTab = rawLink.replace(/^\//, '').toLowerCase();

      const VALID_APP_TABS = new Set([
        'home', 'video', 'music', 'movie', 'series', 'cinema', 'games', 'wallet', 'bulk', 'referral',
        'profile', 'history', 'about', 'privacy', 'terms', 'cookies', 'contact', 'notifications', 'vendor', 'admin'
      ]);

      if (VALID_APP_TABS.has(cleanTab)) {
        window.dispatchEvent(new CustomEvent('navigate', { detail: { view: cleanTab } }));
      } else {
        const externalUrl = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
        window.open(externalUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const getIcon = (notif: AppNotification) => {
    const type = notif.type;
    const title = notif.title || '';

    if (type === 'ad' || type === 'promo' || notif.adId) {
      return <Megaphone className="w-5 h-5 text-indigo-400" />;
    }

    if (type === 'withdrawal_approved' || (type === 'success' && title.toLowerCase().includes('withdrawal'))) {
      return <Banknote className="w-5 h-5 text-emerald-400" />;
    }
    if (type === 'withdrawal_pending' || title.toLowerCase().includes('withdrawal')) {
      return <Banknote className="w-5 h-5 text-amber-400" />;
    }

    switch (type) {
      case 'order_placed':
        return <ShoppingBag className="w-5 h-5 text-amber-400" />;
      case 'order_accepted':
        return <ChefHat className="w-5 h-5 text-blue-400" />;
      case 'order_shipped':
        return <Truck className="w-5 h-5 text-indigo-400" />;
      case 'order_delivered':
        return <PackageCheck className="w-5 h-5 text-emerald-400" />;
      case 'order_cancelled':
        return <XCircle className="w-5 h-5 text-rose-500" />;
      case 'preorder_delivered': 
        return notif.mediaType === 'series' 
          ? <Tv className="w-5 h-5 text-cyan-400" /> 
          : <Film className="w-5 h-5 text-cyan-400" />;
      case 'download': return <Download className="w-5 h-5 text-emerald-400" />;
      case 'update': return <Zap className="w-5 h-5 text-rose-400" />;
      case 'alert': return <AlertTriangle className="w-5 h-5 text-orange-400" />;
      case 'success': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      default: return <Info className="w-5 h-5 text-rose-400" />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-32">
      {/* Interactive Delivery Options Modal */}
      <AnimatePresence>
        {selectedNotifForOptions && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedNotifForOptions(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm glass-card p-8 border-white/10 shadow-2xl text-center space-y-6"
            >
              {selectedNotifForOptions.thumbnailUrl && (
                <div className="w-24 h-32 rounded-2xl overflow-hidden border border-white/10 mx-auto shadow-lg">
                  <img src={selectedNotifForOptions.thumbnailUrl} className="w-full h-full object-cover" alt={selectedNotifForOptions.movieTitle} />
                </div>
              )}
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">🎥 Content Delivered!</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Choose how you want to experience <strong className="text-white">"{selectedNotifForOptions.movieTitle}"</strong>:
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button 
                  onClick={async () => {
                    if (!selectedNotifForOptions.movieUrl) return;
                    sessionStorage.setItem('aura_auto_watch_movie', JSON.stringify({
                      movieId: selectedNotifForOptions.movieId,
                      title: selectedNotifForOptions.movieTitle,
                      movieUrl: selectedNotifForOptions.movieUrl,
                      thumbnail: selectedNotifForOptions.thumbnailUrl,
                      mediaType: selectedNotifForOptions.mediaType,
                      season: selectedNotifForOptions.season,
                      episode: selectedNotifForOptions.episode
                    }));
                    
                    await handleMarkRead(selectedNotifForOptions.id);
                    if (selectedNotifForOptions.preorderId) {
                      await updatePreOrderStatus(selectedNotifForOptions.preorderId, 'watched');
                    }
                    setSelectedNotifForOptions(null);
                    window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'movie' } }));
                  }}
                  className="w-full py-3.5 rounded-xl gradient-bg text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" /> Watch Now
                </button>

                <button 
                  onClick={async () => {
                    if (!selectedNotifForOptions.movieUrl) return;
                    window.open(selectedNotifForOptions.movieUrl, '_blank');
                    
                    await handleMarkRead(selectedNotifForOptions.id);
                    if (selectedNotifForOptions.preorderId) {
                      await updatePreOrderStatus(selectedNotifForOptions.preorderId, 'downloaded');
                    }
                    setSelectedNotifForOptions(null);
                  }}
                  className="w-full py-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-wider hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download Movie
                </button>

                <button 
                  onClick={async () => {
                    if (!selectedNotifForOptions.movieUrl) return;
                    const url = new URL(window.location.origin);
                    url.searchParams.set('tab', 'cinema');
                    url.searchParams.set('create', 'true');
                    url.searchParams.set('movie_id', selectedNotifForOptions.movieId || selectedNotifForOptions.preorderId || '');
                    url.searchParams.set('title', selectedNotifForOptions.movieTitle || '');
                    url.searchParams.set('thumbnail', selectedNotifForOptions.thumbnailUrl || '');
                    url.searchParams.set('movie_url', selectedNotifForOptions.movieUrl || '');
                    if (selectedNotifForOptions.season) url.searchParams.set('season', selectedNotifForOptions.season.toString());
                    if (selectedNotifForOptions.episode) url.searchParams.set('episode', selectedNotifForOptions.episode.toString());
                    
                    await handleMarkRead(selectedNotifForOptions.id);
                    setSelectedNotifForOptions(null);
                    window.location.href = url.toString();
                  }}
                  className="w-full py-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-black uppercase tracking-wider hover:bg-cyan-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4" /> Watch with Friends
                </button>

                <button 
                  onClick={() => setSelectedNotifForOptions(null)}
                  className="w-full py-3 mt-1 rounded-xl text-[10px] font-black uppercase text-muted-foreground hover:text-white transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Modal */}
      <AnimatePresence>
        {isConfirmOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConfirmOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm glass-card p-8 border-white/10 shadow-2xl text-center space-y-6"
            >
              <div className="w-20 h-20 rounded-3xl bg-red-500/20 flex items-center justify-center text-red-500 mx-auto">
                <AlertTriangle className="w-10 h-10" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Wipe Notifications?</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This will permanently delete all messages from your inbox. This action cannot be undone.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsConfirmOpen(false)}
                    className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleClearAll}
                    className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold shadow-lg shadow-red-600/20 hover:bg-red-500 active:scale-95 transition-all cursor-pointer"
                  >
                    Clear My Inbox
                  </button>
                </div>

                {user?.isAdmin && (
                  <button
                    type="button"
                    onClick={handleAdminGlobalClear}
                    className="w-full py-2.5 px-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-black uppercase tracking-wider hover:bg-rose-900/60 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Wipe All Users' Inboxes (Admin)</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
          <Bell className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-4xl font-bold gradient-text">Notifications</h2>
        <p className="text-muted-foreground">Stay updated with the latest improvements and alerts.</p>
        
        {(!isLoading && notifications.length === 0) && (
          <button 
            onClick={() => loadNotifications()}
            className="flex items-center gap-2 mx-auto px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase hover:bg-white/10 transition-all"
          >
            <RefreshCcw className="w-3 h-3" /> Sync Inbox
          </button>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/5 space-y-4 bg-white/[0.01]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold tracking-tight text-foreground">Recent Activity</span>
              {notifications.some(n => !n.read) && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-500 text-[10px] font-black border border-rose-500/20">
                  {notifications.filter(n => !n.read).length} NEW
                </span>
              )}
            </div>
            
            {notifications.length > 0 && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleReadAll}
                  title="Mark all as read"
                  className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/20 transition-all border border-cyan-500/10"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsConfirmOpen(true)}
                  title="Clear all"
                  className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-all border border-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          {notifications.length > 0 && (
            <div className="flex gap-2">
              <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(notifications.filter(n => n.read).length / notifications.length) * 100}%` }}
                  className="h-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                />
              </div>
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none">
                {Math.round((notifications.filter(n => n.read).length / notifications.length) * 100)}% Cleared
              </span>
            </div>
          )}
        </div>

        <div className="divide-y divide-white/5">
          <AnimatePresence initial={false}>
            {isLoading ? (
              <div className="p-20 text-center">
                <motion.div 
                  animate={{ rotate: 360 }} 
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full mx-auto"
                />
              </div>
            ) : notifications.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-20 text-center space-y-4"
              >
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                  <Inbox className="w-8 h-8 text-muted-foreground opacity-20" />
                </div>
                <p className="text-muted-foreground italic">Your inbox is empty</p>
              </motion.div>
            ) : (
              notifications.map((notif) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`p-5 flex items-start gap-4 transition-colors ${notif.read ? 'opacity-60' : 'bg-white/[0.03]'} ${notif.type === 'preorder_delivered' || notif.link ? 'cursor-pointer hover:bg-white/[0.06]' : ''} ${notif.type === 'ad' || notif.type === 'promo' ? 'border-l-2 border-indigo-500 bg-indigo-500/[0.02]' : notif.type === 'preorder_delivered' ? 'border-l-2 border-cyan-500' : ''}`}
                  onClick={() => {
                    if (notif.type === 'preorder_delivered') {
                      setSelectedNotifForOptions(notif);
                    } else if (notif.link) {
                      handleNotificationClick(notif);
                    }
                  }}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/10 ${notif.type === 'ad' || notif.type === 'promo' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 shadow-lg shadow-indigo-500/10' : notif.read ? 'bg-white/5' : 'bg-white/10 shadow-lg'}`}>
                    {getIcon(notif)}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <h3 className={`font-bold text-sm truncate ${notif.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {notif.title}
                        </h3>
                        {(notif.type === 'ad' || notif.type === 'promo' || notif.adId || notif.badgeText) && (
                          <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 font-black text-[9px] uppercase tracking-wider shrink-0 shadow-sm flex items-center gap-1">
                            <Megaphone className="w-2.5 h-2.5" />
                            {notif.badgeText || 'Special Offer'}
                          </span>
                        )}
                        {notif.orderNumber && (
                          <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-white font-mono text-[9px] font-black shrink-0 border border-white/10">
                            #{notif.orderNumber}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 flex-shrink-0">
                        <Clock className="w-3 h-3" />
                        {new Date(notif.timestamp).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {notif.message}
                    </p>

                    {/* Flyer / Moving Carousel / Promotional Banner Image Preview */}
                    {(notif.imageUrl || (notif.imageUrls && notif.imageUrls.length > 0) || (notif.carouselSlides && notif.carouselSlides.length > 0) || (notif.adId && adsMap.get(notif.adId)?.imageUrl)) ? (
                      <NotificationCarousel 
                        notif={notif} 
                        adCampaign={notif.adId ? adsMap.get(notif.adId) : undefined}
                        onNotificationClick={handleNotificationClick} 
                      />
                    ) : notif.link ? (
                      /* Clickable CTA Action Button for text-only link notifications */
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNotificationClick(notif);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-95 transition-all"
                        >
                          <span>{notif.buttonText || 'Open Link'}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : null}

                    {/* Shipped ETA Badge */}
                    {notif.estimatedDeliveryTime && notif.type === 'order_shipped' && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase mt-1">
                        <Truck className="w-3.5 h-3.5" />
                        <span>Estimated Delivery: {notif.estimatedDeliveryTime}</span>
                      </div>
                    )}

                    {/* Interactive Rating Component for Delivered Orders */}
                    {(notif.type === 'order_delivered' || notif.ratingPrompt) && (
                      notif.rated ? (
                        <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center text-amber-400">
                              {[1, 2, 3, 4, 5].map(s => (
                                <Star key={s} className={`w-3.5 h-3.5 ${s <= (notif.rating || 5) ? 'fill-amber-400' : 'text-muted-foreground'}`} />
                              ))}
                            </div>
                            <span className="text-xs font-black uppercase text-emerald-400">
                              Rated {notif.rating || 5}/5 Stars
                            </span>
                          </div>
                          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Rating Recorded</span>
                        </div>
                      ) : (
                        <div className="mt-3 p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                              <Star className="w-3.5 h-3.5 fill-current" /> Rate {notif.vendorName || 'Vendor'}
                            </span>
                            <span className="text-[9px] font-black text-muted-foreground uppercase">
                              {(ratingStates[notif.id]?.rating || 5)} of 5 Stars
                            </span>
                          </div>

                          {/* Star selectors */}
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => {
                              const activeScore = ratingStates[notif.id]?.hoverRating || ratingStates[notif.id]?.rating || 5;
                              const isFilled = star <= activeScore;
                              return (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleStarClick(notif.id, star); }}
                                  onMouseEnter={() => handleStarHover(notif.id, star)}
                                  onMouseLeave={() => handleStarHover(notif.id, ratingStates[notif.id]?.rating || 5)}
                                  className="p-1 hover:scale-125 transition-transform"
                                >
                                  <Star className={`w-5 h-5 ${isFilled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                                </button>
                              );
                            })}
                          </div>

                          {/* Review Input */}
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="Optional feedback about the snacks or delivery..."
                              value={ratingStates[notif.id]?.review || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRatingStates(prev => ({
                                  ...prev,
                                  [notif.id]: {
                                    rating: prev[notif.id]?.rating || 5,
                                    hoverRating: prev[notif.id]?.hoverRating || 5,
                                    review: val,
                                    isSubmitting: false
                                  }
                                }));
                              }}
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-400 font-medium"
                            />
                            <button
                              disabled={ratingStates[notif.id]?.isSubmitting}
                              onClick={(e) => { e.stopPropagation(); handleSubmitRating(notif); }}
                              className="w-full py-2 rounded-lg gradient-bg text-white text-[10px] font-black uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                            >
                              {ratingStates[notif.id]?.isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Star className="w-3.5 h-3.5 fill-current" /> Submit Rating & Update Vendor</>}
                            </button>
                          </div>
                        </div>
                      )
                    )}
                    
                    <div className="flex items-center gap-3 pt-2">
                      {notif.type === 'preorder_delivered' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedNotifForOptions(notif); }}
                          className="flex items-center gap-1.5 text-[10px] font-black uppercase text-cyan-400 hover:brightness-125 transition-all"
                        >
                          <Play className="w-3 h-3" /> Action Options
                        </button>
                      )}
                      {!notif.read && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleMarkRead(notif.id); }}
                          className="flex items-center gap-1.5 text-[10px] font-black uppercase text-rose-400 hover:brightness-125 transition-all"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Mark as read
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleClear(notif.id); }}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase text-red-400 hover:brightness-125 transition-all"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
