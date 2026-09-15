import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Megaphone, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  ExternalLink, 
  Check, 
  X, 
  Loader2, 
  Upload, 
  Globe, 
  Clock, 
  MousePointerClick, 
  TrendingUp, 
  Layers,
  Search, 
  ShieldAlert,
  Copy,
  Bell,
  Send,
  Smartphone,
  Link2,
  BarChart3,
  XCircle,
  Activity,
  Sliders,
  Calendar,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Play
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { 
  listenToAds, 
  createAdCampaign, 
  updateAdCampaign, 
  deleteAdCampaign, 
  toggleAdCampaignActive,
  uploadFile,
  broadcastAdNotification
} from '../lib/firebase';
import type { AdCampaign, AdType, AdFrequency, CarouselSlideConfig } from '../types';
import { AdPopupModal } from '../components/ads/AdPopupModal';
import { getAdCapProgress, clearAdFrequencyCaps } from '../lib/adFrequency';

interface FormCarouselSlide {
  id: string;
  imageUrl: string;
  file?: File;
  destinationType: 'external' | 'in_app' | 'none';
  targetUrl: string;
  inAppPage: string;
  buttonText: string;
  title: string;
}

const AVAILABLE_PAGES: { id: string; label: string }[] = [
  { id: 'all', label: 'All Pages (Global)' },
  { id: 'home', label: 'Home Page' },
  { id: 'cinema', label: 'Cinema Room' },
  { id: 'video', label: 'Video Downloader' },
  { id: 'music', label: 'Music Downloader' },
  { id: 'movie', label: 'Movie Downloader' },
  { id: 'games', label: 'Game Room' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'vendor', label: 'Aura Store (Marketplace)' },
  { id: 'bulk', label: 'Bulk Downloader' },
  { id: 'referral', label: 'Refer & Earn' },
  { id: 'profile', label: 'Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'history', label: 'History' },
  { id: 'about', label: 'About & Info' }
];

const IN_APP_DESTINATION_PAGES: { id: string; label: string }[] = [
  { id: 'cinema', label: '🎬 Cinema (Free Movies & Series Streaming)' },
  { id: 'video', label: '🎥 Video Downloader (TikTok, YouTube, IG, Twitter)' },
  { id: 'music', label: '🎵 Music Downloader & Streamer' },
  { id: 'movie', label: '🍿 Movie Downloader' },
  { id: 'games', label: '🎮 Games Hub (Play 250+ Mini Games)' },
  { id: 'wallet', label: '💰 Wallet & Earnings (Balance & Withdrawals)' },
  { id: 'referral', label: '👥 Refer & Earn (Invite Program)' },
  { id: 'vendor', label: '🛍️ Aura Store / Marketplace (Vendors & Products)' },
  { id: 'bulk', label: '📦 Bulk Downloader' },
  { id: 'home', label: '🏠 Home (Explore & Trending)' },
  { id: 'notifications', label: '🔔 Notifications & Alerts' },
  { id: 'profile', label: '👤 User Profile' },
  { id: 'history', label: '📜 Download History' },
  { id: 'about', label: 'ℹ️ About & Info' }
];

const ALL_SPECIFIC_PAGE_IDS = AVAILABLE_PAGES.filter(p => p.id !== 'all').map(p => p.id);

const getFrequencyLabel = (freq: AdFrequency, maxDay?: number, maxWeek?: number): string => {
  switch (freq) {
    case 'always':
      return 'Always (Every visit)';
    case 'once_per_session':
      return 'Once per session';
    case 'once_per_day':
      return 'Once per day';
    case 'x_per_day': {
      const count = maxDay || 1;
      return `${count} ${count === 1 ? 'time' : 'times'} / day`;
    }
    case 'x_per_week': {
      const count = maxWeek || maxDay || 1;
      return `${count} ${count === 1 ? 'time' : 'times'} / week`;
    }
    case 'once_ever':
      return 'Once ever';
    default:
      return String(freq).replace(/_/g, ' ');
  }
};

export const AdsManager: React.FC = () => {
  const { showSuccess, showError, showInfo } = useToast();
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | AdType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal / Form state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewAd, setPreviewAd] = useState<AdCampaign | null>(null);
  const [analyticsAd, setAnalyticsAd] = useState<AdCampaign | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [type, setType] = useState<AdType>('popup');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [destinationType, setDestinationType] = useState<'external' | 'in_app' | 'none'>('external');
  const [selectedInAppPage, setSelectedInAppPage] = useState<string>('cinema');
  const [targetUrl, setTargetUrl] = useState('');
  const [buttonText, setButtonText] = useState('Claim Offer');
  const [description, setDescription] = useState('');
  const [targetPages, setTargetPages] = useState<string[]>(['all']);
  const [frequency, setFrequency] = useState<AdFrequency>('once_per_session');
  const [maxPerDay, setMaxPerDay] = useState<number | string>(1);
  const [maxPerWeek, setMaxPerWeek] = useState<number | string>(3);
  const [displayDelaySeconds, setDisplayDelaySeconds] = useState<number | string>(0);
  const [autoCloseSeconds, setAutoCloseSeconds] = useState<number | string>(0);
  const [roundedCorners, setRoundedCorners] = useState<'3xl' | '2xl' | 'xl' | 'full'>('3xl');
  const [bannerPosition, setBannerPosition] = useState<'top' | 'bottom'>('top');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [endDateStr, setEndDateStr] = useState('');

  // Multi-Image Carousel Slider State with Per-Slide Link & Destination Configuration
  const [carouselSlides, setCarouselSlides] = useState<FormCarouselSlide[]>([]);
  const [newSlideUrl, setNewSlideUrl] = useState('');
  const [newSlideDestType, setNewSlideDestType] = useState<'external' | 'in_app' | 'none'>('external');
  const [newSlideTargetUrl, setNewSlideTargetUrl] = useState('');
  const [newSlideInAppPage, setNewSlideInAppPage] = useState('cinema');
  const [newSlideButtonText, setNewSlideButtonText] = useState('');
  const carouselFileInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hasPermissionWarning, setHasPermissionWarning] = useState(false);
  const [copiedRule, setCopiedRule] = useState(false);

  // Broadcast to Notifications State
  const [broadcastToNotifications, setBroadcastToNotifications] = useState(false);
  const [broadcastingAd, setBroadcastingAd] = useState<AdCampaign | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // In-App Custom Delete Modal State
  const [deletingAd, setDeletingAd] = useState<{ id: string; title: string } | null>(null);

  // Collapsible Campaigns List State (default to collapsed until expanded by admin)
  const [isCampaignsCollapsed, setIsCampaignsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('streamaura_ads_collapsed');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('streamaura_ads_collapsed', String(isCampaignsCollapsed));
    } catch {
      // Ignore storage errors
    }
  }, [isCampaignsCollapsed]);

  // Subscribe to ads
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = listenToAds(
      (fetched) => {
        setAds(fetched);
        setHasPermissionWarning(false);
        setIsLoading(false);
      },
      (error) => {
        if (error?.code === 'permission-denied') {
          setHasPermissionWarning(true);
        }
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const firestoreRuleSnippet = `match /ads/{adId} {
  allow read, list: if true;
  allow create, delete: if isAdmin();
  allow update: if isAdmin() || (
    request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'impressions', 
      'clicks', 
      'closes', 
      'impressionsBySource', 
      'clicksBySource', 
      'closesByMethod', 
      'updatedAt'
    ])
  );
}`;

  const handleCopyRule = () => {
    navigator.clipboard.writeText(firestoreRuleSnippet);
    setCopiedRule(true);
    showSuccess('Copied Firestore rule to clipboard!');
    setTimeout(() => setCopiedRule(false), 3000);
  };

  // Direct Broadcast Ad as Notification to All Users
  const handleBroadcastAd = async (ad: AdCampaign) => {
    setIsBroadcasting(true);
    try {
      showInfo('Broadcasting ad to user notifications...');
      const res = await broadcastAdNotification({
        title: ad.title,
        description: ad.description || `Special Offer on StreamAura: ${ad.title}`,
        imageUrl: ad.imageUrl,
        imageUrls: ad.imageUrls,
        carouselSlides: ad.carouselSlides,
        adType: ad.type,
        endDate: ad.endDate,
        targetUrl: ad.targetUrl,
        buttonText: ad.buttonText || 'Claim Offer',
        id: ad.id
      });
      if (res.success) {
        showSuccess(`Ad broadcasted to ${res.delivered_to ?? 'all'} users!`);
      } else {
        showError(res.error || 'Failed to broadcast ad');
      }
    } catch (err: any) {
      showError(err.message || 'Error broadcasting notification');
    } finally {
      setIsBroadcasting(false);
      setBroadcastingAd(null);
    }
  };

  // Stats calculation
  const totalCampaigns = ads.length;
  const activeCampaigns = ads.filter(a => a.active).length;
  const totalImpressions = ads.reduce((acc, a) => acc + (a.impressions || 0), 0);
  const totalClicks = ads.reduce((acc, a) => acc + (a.clicks || 0), 0);
  const totalCloses = ads.reduce((acc, a) => acc + (a.closes || 0), 0);
  const overallCtr = totalImpressions > 0 
    ? ((totalClicks / totalImpressions) * 100).toFixed(2) 
    : '0.00';
  const overallCloseRate = totalImpressions > 0
    ? ((totalCloses / totalImpressions) * 100).toFixed(2)
    : '0.00';

  // Open Create Form
  const handleOpenCreate = () => {
    setEditingAdId(null);
    setTitle('');
    setType('popup');
    setImageUrl('');
    setImageFile(null);
    setCarouselSlides([]);
    setNewSlideUrl('');
    setNewSlideDestType('external');
    setNewSlideTargetUrl('');
    setNewSlideInAppPage('cinema');
    setNewSlideButtonText('');
    setTargetUrl('');
    setDestinationType('external');
    setSelectedInAppPage('cinema');
    setButtonText('Claim Offer');
    setDescription('');
    setTargetPages(['all']);
    setFrequency('once_per_session');
    setMaxPerDay(1);
    setMaxPerWeek(3);
    setDisplayDelaySeconds(0);
    setAutoCloseSeconds(0);
    setRoundedCorners('3xl');
    setBannerPosition('top');
    setHasExpiry(false);
    setEndDateStr('');
    setBroadcastToNotifications(false);
    setUploadProgress(0);
    setIsEditorOpen(true);
  };

  // Open Edit Form
  const handleOpenEdit = (ad: AdCampaign) => {
    setEditingAdId(ad.id);
    setTitle(ad.title || '');
    setType(ad.type || 'popup');
    setImageUrl(ad.imageUrl || '');
    setImageFile(null);
    
    // Populate carousel slides from ad data
    if (ad.carouselSlides && ad.carouselSlides.length > 0) {
      setCarouselSlides(ad.carouselSlides.map((s, idx) => ({
        id: `slide_${idx}_${Date.now()}`,
        imageUrl: s.imageUrl,
        destinationType: s.destinationType || (s.inAppPage ? 'in_app' : s.targetUrl ? 'external' : 'external'),
        targetUrl: s.targetUrl || '',
        inAppPage: s.inAppPage || (s.targetUrl?.startsWith('/') ? s.targetUrl.replace('/', '') : 'cinema'),
        buttonText: s.buttonText || '',
        title: s.title || ''
      })));
    } else if (ad.imageUrls && ad.imageUrls.length > 0) {
      const raw = (ad.targetUrl || '').trim();
      const clean = raw.replace(/^\//, '').toLowerCase();
      const isAppPage = IN_APP_DESTINATION_PAGES.some(p => p.id === clean);
      const defDest = !raw ? 'none' : isAppPage ? 'in_app' : 'external';
      const defPage = isAppPage ? clean : 'cinema';

      setCarouselSlides(ad.imageUrls.map((url, idx) => ({
        id: `slide_${idx}_${Date.now()}`,
        imageUrl: url,
        destinationType: defDest,
        targetUrl: raw,
        inAppPage: defPage,
        buttonText: ad.buttonText || '',
        title: ''
      })));
    } else if (ad.imageUrl) {
      setCarouselSlides([{
        id: `slide_0_${Date.now()}`,
        imageUrl: ad.imageUrl,
        destinationType: 'external',
        targetUrl: ad.targetUrl || '',
        inAppPage: 'cinema',
        buttonText: ad.buttonText || '',
        title: ''
      }]);
    } else {
      setCarouselSlides([]);
    }

    setNewSlideUrl('');
    setNewSlideDestType('external');
    setNewSlideTargetUrl('');
    setNewSlideInAppPage('cinema');
    setNewSlideButtonText('');

    setTargetUrl(ad.targetUrl || '');

    const raw = (ad.targetUrl || '').trim();
    const clean = raw.replace(/^\//, '').toLowerCase();
    const isAppPage = IN_APP_DESTINATION_PAGES.some(p => p.id === clean);

    if (!raw) {
      setDestinationType('none');
      setSelectedInAppPage('cinema');
    } else if (isAppPage) {
      setDestinationType('in_app');
      setSelectedInAppPage(clean);
    } else {
      setDestinationType('external');
      setSelectedInAppPage('cinema');
    }

    setButtonText(ad.buttonText || 'Claim Offer');
    setDescription(ad.description || '');
    setTargetPages(ad.targetPages || ['all']);
    setFrequency(ad.frequency || 'once_per_session');
    setMaxPerDay(ad.maxPerDay || 1);
    setMaxPerWeek(ad.maxPerWeek || 3);
    setDisplayDelaySeconds(ad.displayDelaySeconds || 0);
    setAutoCloseSeconds(ad.autoCloseSeconds || 0);
    setRoundedCorners(ad.roundedCorners || '3xl');
    setBannerPosition(ad.bannerPosition || 'top');
    setBroadcastToNotifications(false);
    
    if (ad.endDate) {
      setHasExpiry(true);
      const d = new Date(ad.endDate);
      setEndDateStr(d.toISOString().slice(0, 16));
    } else {
      setHasExpiry(false);
      setEndDateStr('');
    }
    setUploadProgress(0);
    setIsEditorOpen(true);
  };

  // Handle Select All Pages
  const handleSelectAllPages = () => {
    setTargetPages(['all']);
  };

  // Handle Deselect All Pages
  const handleDeselectAllPages = () => {
    setTargetPages([]);
  };

  // Handle Target Page Toggle
  const togglePageTarget = (pageId: string) => {
    if (pageId === 'all') {
      if (targetPages.includes('all') || targetPages.length === ALL_SPECIFIC_PAGE_IDS.length) {
        setTargetPages([]);
      } else {
        setTargetPages(['all']);
      }
      return;
    }

    setTargetPages(prev => {
      // If 'all' was active, expand to all specific pages and remove the clicked page
      if (prev.includes('all')) {
        return ALL_SPECIFIC_PAGE_IDS.filter(id => id !== pageId);
      }
      if (prev.includes(pageId)) {
        return prev.filter(p => p !== pageId);
      } else {
        const next = [...prev, pageId];
        if (next.length === ALL_SPECIFIC_PAGE_IDS.length) {
          return ['all'];
        }
        return next;
      }
    });
  };

  // Handle Save Ad Campaign
  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      showError('Campaign title is required');
      return;
    }

    if (type === 'carousel') {
      if (carouselSlides.length === 0 && !newSlideUrl.trim() && !imageUrl.trim() && !imageFile) {
        showError('Please add at least one image slide for the carousel');
        return;
      }
    } else {
      if (!imageUrl.trim() && !imageFile) {
        showError('Please upload an image or provide a valid image URL');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let finalImageUrl = imageUrl.trim();
      let finalCarouselSlides: CarouselSlideConfig[] = [];

      if (type === 'carousel') {
        const slidesToProcess: FormCarouselSlide[] = [...carouselSlides];

        // If user typed a pending URL in the input without pressing Add Slide
        if (newSlideUrl.trim()) {
          slidesToProcess.push({
            id: `slide_pending_${Date.now()}`,
            imageUrl: newSlideUrl.trim(),
            destinationType: newSlideDestType,
            targetUrl: newSlideDestType === 'in_app' ? newSlideInAppPage : newSlideTargetUrl.trim(),
            inAppPage: newSlideInAppPage,
            buttonText: newSlideButtonText.trim(),
            title: ''
          });
        }

        // Process and upload all carousel slides in parallel for maximum speed
        finalCarouselSlides = await Promise.all(
          slidesToProcess.map(async (slide) => {
            let slideImgUrl = slide.imageUrl;
            if (slide.file) {
              slideImgUrl = await uploadFile(slide.file, 'ads/carousel', 'assets');
            }

            let slideTargetUrl = '';
            if (slide.destinationType === 'in_app') {
              slideTargetUrl = slide.inAppPage || 'cinema';
            } else if (slide.destinationType === 'external') {
              slideTargetUrl = (slide.targetUrl || '').trim();
            }

            const slideObj: CarouselSlideConfig = {
              imageUrl: slideImgUrl,
              destinationType: slide.destinationType || 'external',
              targetUrl: slideTargetUrl
            };
            if (slide.destinationType === 'in_app' && slide.inAppPage) {
              slideObj.inAppPage = slide.inAppPage;
            }
            if (slide.buttonText && slide.buttonText.trim()) {
              slideObj.buttonText = slide.buttonText.trim();
            }
            if (slide.title && slide.title.trim()) {
              slideObj.title = slide.title.trim();
            }
            return slideObj;
          })
        );

        finalImageUrl = finalCarouselSlides[0]?.imageUrl || '';
      } else {
        // Upload image file if user picked one
        if (imageFile) {
          showInfo('Uploading & optimizing flyer image...');
          finalImageUrl = await uploadFile(
            imageFile, 
            'ads/flyers', 
            'assets', 
            (progress) => setUploadProgress(progress)
          );
        }
      }

      let parsedEndDate: number | undefined = undefined;
      if (hasExpiry && endDateStr) {
        parsedEndDate = new Date(endDateStr).getTime();
      }

      const targetPagesPayload = targetPages.length > 0 ? targetPages : ['all'];

      const campaignPayload: Omit<AdCampaign, 'id' | 'createdAt' | 'impressions' | 'clicks'> = {
        title: title.trim(),
        type,
        imageUrl: finalImageUrl,
        buttonText: buttonText.trim() || 'Learn More',
        targetPages: targetPagesPayload,
        frequency,
        displayDelaySeconds: displayDelaySeconds === '' ? 0 : Number(displayDelaySeconds),
        autoCloseSeconds: autoCloseSeconds === '' ? 0 : Number(autoCloseSeconds),
        roundedCorners,
        bannerPosition,
        startDate: Date.now(),
        active: true
      };

      if (type === 'carousel' && finalCarouselSlides.length > 0) {
        campaignPayload.carouselSlides = finalCarouselSlides;
        campaignPayload.imageUrls = finalCarouselSlides.map(s => s.imageUrl);
      }

      let finalTargetUrl = '';
      if (destinationType === 'in_app') {
        finalTargetUrl = selectedInAppPage;
      } else if (destinationType === 'external') {
        finalTargetUrl = targetUrl.trim();
      }

      if (finalTargetUrl) campaignPayload.targetUrl = finalTargetUrl;
      if (description.trim()) campaignPayload.description = description.trim();
      if (frequency === 'x_per_day' && maxPerDay !== '') campaignPayload.maxPerDay = Number(maxPerDay);
      if (frequency === 'x_per_week' && maxPerWeek !== '') campaignPayload.maxPerWeek = Number(maxPerWeek);
      if (hasExpiry && parsedEndDate) campaignPayload.endDate = parsedEndDate;

      let savedDocId = editingAdId;
      if (editingAdId) {
        await updateAdCampaign(editingAdId, campaignPayload);
        clearAdFrequencyCaps(editingAdId);
        showSuccess('Ad campaign updated successfully');
      } else {
        savedDocId = await createAdCampaign(campaignPayload);
        if (savedDocId) clearAdFrequencyCaps(savedDocId);
        showSuccess('New ad campaign created & activated');
      }

      if (broadcastToNotifications) {
        // Send notification asynchronously without blocking modal closure
        broadcastAdNotification({
          title: campaignPayload.title,
          description: campaignPayload.description,
          imageUrl: campaignPayload.imageUrl,
          imageUrls: campaignPayload.imageUrls,
          carouselSlides: campaignPayload.carouselSlides,
          adType: campaignPayload.type,
          endDate: campaignPayload.endDate,
          targetUrl: campaignPayload.targetUrl,
          buttonText: campaignPayload.buttonText,
          id: savedDocId || undefined
        }).then(res => {
          if (res.success) {
            showSuccess('Ad notification broadcasted to users!');
          }
        }).catch(err => {
          console.warn('Notification broadcast error:', err);
        });
      }

      setIsEditorOpen(false);
    } catch (err: any) {
      console.error('Save ad campaign error:', err);
      showError(err.message || 'Failed to save campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Active / Paused
  const handleToggleStatus = async (ad: AdCampaign) => {
    try {
      await toggleAdCampaignActive(ad.id, ad.active);
      showSuccess(`Campaign ${ad.active ? 'paused' : 'activated'}`);
    } catch {
      showError('Failed to update campaign status');
    }
  };

  // Filtered campaigns for display
  const filteredAds = ads.filter(ad => {
    const matchesSearch = 
      (ad.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ad.targetUrl || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFormat = formatFilter === 'all' || ad.type === formatFilter;
    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'active' && ad.active) || 
      (statusFilter === 'inactive' && !ad.active);
    return matchesSearch && matchesFormat && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Permission Setup Warning Banner */}
      {hasPermissionWarning && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Firestore Security Rule Required for Ads</h4>
                <p className="text-xs text-amber-300/80 mt-1 max-w-2xl leading-relaxed">
                  To allow users to view live flyer popups & banners, add the <code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-200">/ads/&#123;adId&#125;</code> match rule to your Firebase Console under <strong>Firestore Database → Rules</strong>.
                </p>
              </div>
            </div>
            <button
              onClick={handleCopyRule}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow whitespace-nowrap"
            >
              {copiedRule ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedRule ? 'Rule Copied!' : 'Copy Rule Snippet'}
            </button>
          </div>
        </div>
      )}

      {/* 1. Metric Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="glass-card p-4 rounded-2xl border border-white/10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Total Ads</p>
            <p className="text-xl sm:text-2xl font-black text-white">{totalCampaigns} <span className="text-xs text-emerald-400 font-semibold">({activeCampaigns} live)</span></p>
          </div>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-white/10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Impressions</p>
            <p className="text-xl sm:text-2xl font-black text-white">{totalImpressions.toLocaleString()}</p>
          </div>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-white/10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">
            <MousePointerClick className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Ad Clicks</p>
            <p className="text-xl sm:text-2xl font-black text-purple-400">{totalClicks.toLocaleString()}</p>
          </div>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-white/10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Dismissed</p>
            <p className="text-xl sm:text-2xl font-black text-rose-400">{totalCloses.toLocaleString()}</p>
          </div>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-white/10 flex items-center gap-3 col-span-2 sm:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Avg. CTR</p>
            <p className="text-xl sm:text-2xl font-black text-amber-400">{overallCtr}% <span className="text-[10px] text-muted-foreground font-normal">({overallCloseRate}% close)</span></p>
          </div>
        </div>
      </div>

      {/* 2. Toolbar & Filters */}
      <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Left: Search & Filter Pills */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full glass-input pl-9 pr-3 py-2 text-xs rounded-xl border border-white/10 focus:outline-none"
            />
          </div>

          {/* Format Filter */}
          <div className="flex flex-wrap items-center p-1 bg-black/40 rounded-xl border border-white/10 text-xs font-bold gap-1">
            {(['all', 'flyer', 'popup', 'banner', 'carousel'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => setFormatFilter(fmt)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                  formatFilter === fmt 
                    ? 'bg-indigo-600 text-white shadow' 
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                {fmt === 'all' ? 'All Formats' : fmt === 'flyer' ? '🚀 OPay Flyer' : fmt === 'popup' ? '🎯 In-App Popup' : fmt === 'banner' ? '📢 Banner' : '🎠 Carousel'}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center p-1 bg-black/40 rounded-xl border border-white/10 text-xs font-bold">
            {(['all', 'active', 'inactive'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                  statusFilter === st 
                    ? 'bg-emerald-600 text-white shadow' 
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Reset Impression Cache Button */}
          <button
            onClick={() => {
              clearAdFrequencyCaps();
              showSuccess('Cleared all frequency limits & impression cache on this device!');
            }}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
            title="Reset frequency capping & session limits so you can test ads immediately"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Reset Caps (Test)</span>
          </button>
        </div>

        {/* Right: Create Campaign Button */}
        <button
          onClick={handleOpenCreate}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Ad Campaign</span>
        </button>
      </div>

      {/* 3. Campaign List Grid / Cards (Collapsible Dropdown) */}
      <div className="space-y-3">
        {/* Collapsible Dropdown Header Bar */}
        <div 
          onClick={() => setIsCampaignsCollapsed(!isCampaignsCollapsed)}
          className="flex items-center justify-between p-3.5 px-5 rounded-2xl glass-card border border-white/10 hover:border-white/20 transition-all cursor-pointer select-none group shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-sm">
              <Megaphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Ad Campaigns List</span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold border border-indigo-500/30">
                  {filteredAds.length} {filteredAds.length === 1 ? 'Campaign' : 'Campaigns'}
                </span>
                {activeCampaigns > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 hidden sm:inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{activeCampaigns} Live</span>
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {isCampaignsCollapsed ? 'Click to expand campaign list & controls' : 'Click to collapse and save screen space'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground group-hover:text-white transition-colors">
              {isCampaignsCollapsed ? 'Expand' : 'Collapse'}
            </span>
            <div className={`p-1.5 rounded-lg bg-white/5 group-hover:bg-white/10 text-white/70 group-hover:text-white transition-all transform ${isCampaignsCollapsed ? '' : 'rotate-180'}`}>
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Collapsible Content */}
        <AnimatePresence initial={false}>
          {!isCampaignsCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Loading Campaigns...</p>
                </div>
              ) : filteredAds.length === 0 ? (
                <div className="glass-card p-12 text-center rounded-2xl border border-white/10 space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Megaphone className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-white">No ad campaigns found</h3>
                  <p className="text-muted-foreground text-xs max-w-sm mx-auto">
                    Create an OPay-style flyer popup, sticky banner, or moving carousel to promote offers across StreamAura.
                  </p>
                  <button
                    onClick={handleOpenCreate}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Ad</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAds.map(ad => {
            const ctr = (ad.impressions || 0) > 0 
              ? (((ad.clicks || 0) / ad.impressions) * 100).toFixed(1) 
              : '0.0';
            const closeRate = (ad.impressions || 0) > 0
              ? (((ad.closes || 0) / ad.impressions) * 100).toFixed(1)
              : '0.0';

            return (
              <div 
                key={ad.id}
                className={`glass-card p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 relative overflow-hidden ${
                  ad.active 
                    ? 'border-white/10 hover:border-white/20' 
                    : 'border-white/5 opacity-60 bg-black/40'
                }`}
              >
                <div className="space-y-3.5">
                  {/* Top Header: Type & Status Switch */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                        ad.type === 'flyer'
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                          : ad.type === 'popup'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : ad.type === 'carousel'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}>
                        {ad.type === 'flyer' ? '🚀 OPay Flyer (Launch)' : ad.type === 'popup' ? '🎯 In-App Popup' : ad.type === 'carousel' ? '🎠 Carousel' : '📢 Banner'}
                      </span>

                      <span className="text-[11px] font-bold text-muted-foreground">
                        {getFrequencyLabel(ad.frequency, ad.maxPerDay, ad.maxPerWeek)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleToggleStatus(ad)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase transition-all ${
                        ad.active 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30' 
                          : 'bg-white/10 text-white/40 border border-white/10 hover:bg-white/20'
                      }`}
                    >
                      {ad.active ? '● Live' : '○ Paused'}
                    </button>
                  </div>

                  {/* Flyer Artwork Thumbnail & Title */}
                  <div className="flex items-start gap-3">
                    <div 
                      onClick={() => setPreviewAd(ad)}
                      className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl overflow-hidden bg-black/60 border border-white/10 flex-shrink-0 cursor-pointer group relative shadow-md"
                      title="Click to preview ad"
                    >
                      <img 
                        src={ad.imageUrl} 
                        alt={ad.title} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Eye className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="space-y-1.5 min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-white truncate" title={ad.title}>
                        {ad.title}
                      </h4>

                      {ad.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {ad.description}
                        </p>
                      )}

                      {ad.targetUrl && (
                        <div className="flex items-center gap-1 text-[11px] text-indigo-400 hover:underline truncate">
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{ad.targetUrl}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Target Pages Breakdown */}
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <span className="text-[10px] text-muted-foreground font-semibold">Pages:</span>
                    {ad.targetPages.slice(0, 3).map(p => (
                      <span key={p} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-white/80 font-medium capitalize">
                        {p}
                      </span>
                    ))}
                    {ad.targetPages.length > 3 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] text-white/50">
                        +{ad.targetPages.length - 3}
                      </span>
                    )}
                    {ad.imageUrls && ad.imageUrls.length > 1 && (
                      <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-[10px] text-cyan-300 font-bold ml-auto flex items-center gap-1">
                        <span>🎠</span>
                        <span>{ad.imageUrls.length} Slides</span>
                      </span>
                    )}
                  </div>

                  {/* Schedule & Lifespan Status Box */}
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Flight Duration:</span>
                      </span>
                      <span className="font-bold text-white">
                        {ad.endDate ? (() => {
                          const totalDays = Math.max(1, Math.round((ad.endDate - (ad.startDate || ad.createdAt || Date.now())) / (1000 * 60 * 60 * 24)));
                          const dayLabel = totalDays === 1 ? '1 Day' : `${totalDays} Days`;
                          if (totalDays < 7) return dayLabel;
                          const totalWeeks = (totalDays / 7).toFixed(1);
                          const weekLabel = totalWeeks === '1.0' ? '1.0 wk' : `${totalWeeks} wks`;
                          return `${dayLabel} (${weekLabel})`;
                        })() : (
                          'Always Active (Continuous)'
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Time Remaining:</span>
                      </span>
                      {ad.endDate ? (
                        ad.endDate - Date.now() <= 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 text-[10px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            <span>Expired (Ended)</span>
                          </span>
                        ) : (() => {
                          const diffMs = ad.endDate - Date.now();
                          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                          const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                          const weeks = (diffMs / (1000 * 60 * 60 * 24 * 7)).toFixed(1);
                          
                          let text = '';
                          if (days >= 7) {
                            text = `${days} ${days === 1 ? 'day' : 'days'} left (${weeks} ${weeks === '1.0' ? 'wk' : 'wks'})`;
                          } else if (days > 0) {
                            text = `${days} ${days === 1 ? 'day' : 'days'} ${hours}h left`;
                          } else if (hours > 0) {
                            text = `${hours} ${hours === 1 ? 'hr' : 'hrs'} left`;
                          } else {
                            text = '< 1 hr left';
                          }

                          return (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 text-[10px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>{text}</span>
                            </span>
                          );
                        })()
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30 text-[10px] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <span>Ongoing (No Expiry)</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-white/5">
                      <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Times Shown:</span>
                      </span>
                      <span className="font-bold text-cyan-300 font-mono">
                        {(ad.impressions || 0).toLocaleString()} views
                      </span>
                    </div>

                    {/* Pop / Frequency Cap Progress */}
                    {(() => {
                      const cap = getAdCapProgress(ad);
                      return (
                        <div className="pt-2 border-t border-white/5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground font-semibold flex items-center gap-1.5" title="Frequency capping is per-user. This reflects your own device's status.">
                              <Sliders className="w-3.5 h-3.5 text-purple-400" />
                              <span>Your Device Cap:</span>
                            </span>
                            <span className={`font-bold text-[11px] ${cap.isCapped ? 'text-rose-400' : 'text-purple-300'}`}>
                              {cap.label}
                            </span>
                          </div>
                          {cap.capType !== 'always' && (
                            <div className="space-y-1">
                              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    cap.isCapped 
                                      ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' 
                                      : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                                  }`}
                                  style={{ width: `${Math.min(100, cap.percentage)}%` }}
                                />
                              </div>
                              {cap.subLabel && (
                                <span className="text-[9px] text-muted-foreground block text-right font-medium">
                                  {cap.subLabel} (Per user)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Performance Metrics Bar & Actions */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 text-xs font-mono">
                    <div>
                      <span className="text-[9px] text-muted-foreground block font-sans uppercase">Views</span>
                      <span className="font-bold text-white">{(ad.impressions || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground block font-sans uppercase">Clicks</span>
                      <span className="font-bold text-purple-400">{(ad.clicks || 0).toLocaleString()}</span>
                    </div>
                    <div title={`Dismissal Rate: ${closeRate}%`}>
                      <span className="text-[9px] text-muted-foreground block font-sans uppercase">Closed</span>
                      <span className="font-bold text-rose-400">{(ad.closes || 0).toLocaleString()}</span>
                    </div>
                    <div title={`Click-Through Rate: ${ctr}%`}>
                      <span className="text-[9px] text-muted-foreground block font-sans uppercase">CTR</span>
                      <span className="font-bold text-amber-400">{ctr}%</span>
                    </div>
                  </div>

                  {/* Card Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        clearAdFrequencyCaps(ad.id);
                        window.dispatchEvent(new CustomEvent('test-ad-popup', { detail: { ad } }));
                        showSuccess('Triggering live flyer modal...');
                      }}
                      className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 hover:text-emerald-200 transition-all flex items-center gap-1 text-[10px] font-black uppercase shadow-sm cursor-pointer"
                      title="Test Live Flyer Modal (Clears session cap and launches popup)"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden sm:inline">Test</span>
                    </button>

                    <button
                      onClick={() => setAnalyticsAd(ad)}
                      className="p-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 hover:text-indigo-200 transition-all flex items-center gap-1 text-[10px] font-black uppercase shadow-sm cursor-pointer"
                      title="View In-Depth Analytics & Source Attribution"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="hidden sm:inline">Stats</span>
                    </button>

                    <button
                      onClick={() => setBroadcastingAd(ad)}
                      className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 hover:text-amber-200 transition-all flex items-center gap-1 text-[10px] font-black uppercase shadow-sm"
                      title="Post this Ad to User Inboxes"
                    >
                      <Bell className="w-3.5 h-3.5 text-amber-400" />
                    </button>

                    <button
                      onClick={() => setPreviewAd(ad)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-all"
                      title="Preview this Ad"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleOpenEdit(ad)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-indigo-500/20 border border-white/10 text-white/80 hover:text-indigo-300 transition-all"
                      title="Edit Campaign"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setDeletingAd({ id: ad.id, title: ad.title })}
                      className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 text-white/80 hover:text-red-400 transition-all cursor-pointer"
                      title="Delete Campaign"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  )}
</AnimatePresence>
</div>

      {/* 4. Live Ad Creator / Editor Modal */}
      <AnimatePresence>
        {isEditorOpen && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSubmitting) setIsEditorOpen(false); }}
              className="fixed inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Dialog Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="relative w-full max-w-3xl glass-card p-6 sm:p-8 rounded-3xl border border-white/15 shadow-2xl z-10 my-auto max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingAdId ? 'Edit Ad Campaign' : 'Create New Ad Campaign'}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Configure OPay-style flyer popup, sticky banner, or moving carousel.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditorOpen(false)}
                  disabled={isSubmitting}
                  className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSaveCampaign} className="space-y-6 pt-5">
                
                {/* 1. Format Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Ad Format & Style</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { 
                        id: 'flyer', 
                        title: '🚀 OPay App-Launch Flyer', 
                        desc: 'App Entry Only: Full-screen poster when users open the app. Never interrupts page navigation.' 
                      },
                      { 
                        id: 'popup', 
                        title: '🎯 Smart In-App Popup', 
                        desc: 'Targeted In-App Modal: Shows on chosen pages (Home, Cinema, etc.) with smart 7-day pacing.' 
                      },
                      { 
                        id: 'banner', 
                        title: '📢 Sticky Banner', 
                        desc: 'Clean top/bottom banner with CTA button & quick dismiss.' 
                      },
                      { 
                        id: 'carousel', 
                        title: '🎠 Moving Carousel', 
                        desc: 'Smooth animated auto-rotating carousel slide with per-slide links.' 
                      }
                    ].map(f => (
                      <div
                        key={f.id}
                        onClick={() => setType(f.id as AdType)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          type === f.id
                            ? 'bg-indigo-600/20 border-indigo-500 shadow-md shadow-indigo-500/10'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-white">{f.title}</span>
                          {type === f.id && <Check className="w-4 h-4 text-indigo-400" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground pt-1 leading-snug">
                          {f.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Title & CTA Button Text */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Campaign Title *</label>
                    <input
                      type="text"
                      placeholder="e.g. VIP Cinema Weekend Discount"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      className="w-full glass-input p-3 text-xs rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Button / CTA Text</label>
                    <input
                      type="text"
                      placeholder="e.g. Claim Offer, Watch Now, Learn More"
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      className="w-full glass-input p-3 text-xs rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* 3. Click Destination Action (In-App Page vs External Website vs View Only) */}
                <div className="space-y-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Ad Click Destination / Action</span>
                    </label>
                    <span className="text-[11px] text-white/50">Where should users go when tapping this ad?</span>
                  </div>

                  {/* Destination Mode Selector */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setDestinationType('external')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                        destinationType === 'external'
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 shadow-sm'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">External Link</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestinationType('in_app')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                        destinationType === 'in_app'
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 shadow-sm'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">In-App Page</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestinationType('none')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                        destinationType === 'none'
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 shadow-sm'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">View Only</span>
                    </button>
                  </div>

                  {/* Mode 1: External URL Input */}
                  {destinationType === 'external' && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-semibold text-white/80">Website or Social Media URL</span>
                      <input
                        type="text"
                        placeholder="e.g. https://tiktok.com/@streamaura0 or https://instagram.com/streamaura1"
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                        className="w-full glass-input p-3 text-xs rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span>✨ Opens in a new browser tab. Safe protocol (https://) is automatically added if omitted.</span>
                      </p>
                    </div>
                  )}

                  {/* Mode 2: In-App Destination Page Dropdown */}
                  {destinationType === 'in_app' && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-semibold text-white/80">Select Target In-App Screen</span>
                      <select
                        value={selectedInAppPage}
                        onChange={(e) => {
                          setSelectedInAppPage(e.target.value);
                          setTargetUrl(e.target.value);
                        }}
                        className="w-full glass-input p-3 text-xs rounded-xl border border-white/10 bg-[#0b0f19] text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {IN_APP_DESTINATION_PAGES.map(page => (
                          <option key={page.id} value={page.id} className="bg-[#0b0f19] text-white py-1">
                            {page.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span>✨ When clicked, the app smoothly switches to the selected screen without opening a new tab.</span>
                      </p>
                    </div>
                  )}

                  {/* Mode 3: View Only Notice */}
                  {destinationType === 'none' && (
                    <p className="text-[11px] text-white/50 italic pt-1">
                      ℹ️ This ad will display as a promotional announcement with no click-through navigation.
                    </p>
                  )}
                </div>

                {/* 3. Flyer / Carousel Image Source & Upload */}
                {type === 'carousel' ? (
                  <div className="space-y-4 p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/20">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-cyan-400" />
                        <span>Carousel Slides & Destination Links *</span>
                      </label>
                      <span className="text-[11px] text-cyan-300/70">
                        {carouselSlides.length} {carouselSlides.length === 1 ? 'Slide Configured' : 'Slides Configured'}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Each slide in your carousel can open its own external URL, navigate to an in-app page (e.g. Cinema, Video, Games, Store), or display with custom CTA buttons.
                    </p>

                    {/* Existing / Added Carousel Slide Items */}
                    {carouselSlides.length > 0 && (
                      <div className="space-y-3 pt-1">
                        {carouselSlides.map((slide, idx) => (
                          <div 
                            key={slide.id} 
                            className="p-3.5 rounded-2xl bg-[#080d1a] border border-cyan-500/30 space-y-3 shadow-lg"
                          >
                            {/* Slide Header: Thumbnail + Title + Ordering / Delete Controls */}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-16 h-11 rounded-xl overflow-hidden bg-black/60 border border-white/15 flex-shrink-0 relative shadow">
                                  <img 
                                    src={slide.imageUrl} 
                                    alt={`Slide ${idx + 1}`} 
                                    className="w-full h-full object-cover" 
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-white">Slide {idx + 1}</span>
                                    {idx === 0 && (
                                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                        Cover / First Slide
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-white/50 truncate max-w-[240px]">
                                    {slide.file ? slide.file.name : (slide.imageUrl || 'No image URL')}
                                  </p>
                                </div>
                              </div>

                              {/* Ordering & Remove Buttons */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {idx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCarouselSlides(prev => {
                                        const next = [...prev];
                                        const temp = next[idx - 1];
                                        next[idx - 1] = next[idx];
                                        next[idx] = temp;
                                        return next;
                                      });
                                    }}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-all active:scale-95"
                                    title="Move slide earlier"
                                  >
                                    <ChevronUp className="w-4 h-4" />
                                  </button>
                                )}

                                {idx < carouselSlides.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCarouselSlides(prev => {
                                        const next = [...prev];
                                        const temp = next[idx + 1];
                                        next[idx + 1] = next[idx];
                                        next[idx] = temp;
                                        return next;
                                      });
                                    }}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-all active:scale-95"
                                    title="Move slide later"
                                  >
                                    <ChevronDown className="w-4 h-4" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setCarouselSlides(prev => prev.filter(s => s.id !== slide.id))}
                                  className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition-all active:scale-95 ml-1"
                                  title="Delete slide"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Destination Action Selector for this specific slide */}
                            <div className="space-y-2 pt-2 border-t border-white/10">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                                  <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>When Slide {idx + 1} is Tapped:</span>
                                </label>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCarouselSlides(prev => prev.map((s, i) => i === idx ? { ...s, destinationType: 'external' } : s));
                                  }}
                                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border cursor-pointer ${
                                    slide.destinationType === 'external'
                                      ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300 shadow-sm'
                                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                  }`}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span className="truncate">External URL</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setCarouselSlides(prev => prev.map((s, i) => i === idx ? { ...s, destinationType: 'in_app' } : s));
                                  }}
                                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border cursor-pointer ${
                                    slide.destinationType === 'in_app'
                                      ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300 shadow-sm'
                                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                  }`}
                                >
                                  <Smartphone className="w-3 h-3" />
                                  <span className="truncate">In-App Page</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setCarouselSlides(prev => prev.map((s, i) => i === idx ? { ...s, destinationType: 'none' } : s));
                                  }}
                                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border cursor-pointer ${
                                    slide.destinationType === 'none'
                                      ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300 shadow-sm'
                                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                  }`}
                                >
                                  <Eye className="w-3 h-3" />
                                  <span className="truncate">View Only</span>
                                </button>
                              </div>

                              {/* Destination Inputs for this slide */}
                              {slide.destinationType === 'external' && (
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    placeholder="e.g. https://tiktok.com/@brand or https://stream-promo.com"
                                    value={slide.targetUrl}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCarouselSlides(prev => prev.map((s, i) => i === idx ? { ...s, targetUrl: val } : s));
                                    }}
                                    className="w-full glass-input p-2.5 text-xs rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500"
                                  />
                                </div>
                              )}

                              {slide.destinationType === 'in_app' && (
                                <div className="space-y-1">
                                  <select
                                    value={slide.inAppPage || 'cinema'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCarouselSlides(prev => prev.map((s, i) => i === idx ? { ...s, inAppPage: val, targetUrl: val } : s));
                                    }}
                                    className="w-full glass-input p-2.5 text-xs rounded-xl border border-white/10 bg-[#0b0f19] text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                                  >
                                    {IN_APP_DESTINATION_PAGES.map(page => (
                                      <option key={page.id} value={page.id} className="bg-[#0b0f19] text-white py-1">
                                        {page.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {/* Optional per-slide CTA button text */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                <div className="space-y-1">
                                  <span className="text-[10px] text-white/60">Slide Button Text (Optional)</span>
                                  <input
                                    type="text"
                                    placeholder={buttonText || "e.g. Claim Offer, Watch Now"}
                                    value={slide.buttonText}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCarouselSlides(prev => prev.map((s, i) => i === idx ? { ...s, buttonText: val } : s));
                                    }}
                                    className="w-full glass-input p-2 text-xs rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <span className="text-[10px] text-white/60">Slide Sub-heading (Optional)</span>
                                  <input
                                    type="text"
                                    placeholder="Custom heading for this slide..."
                                    value={slide.title}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCarouselSlides(prev => prev.map((s, i) => i === idx ? { ...s, title: val } : s));
                                    }}
                                    className="w-full glass-input p-2 text-xs rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add New Slide Controls */}
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-cyan-500/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Add New Slide</span>
                        </span>
                      </div>

                      {/* Method 1: Paste Image URL + Add Slide Button */}
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          placeholder="Paste Slide Image URL (https://...)"
                          value={newSlideUrl}
                          onChange={(e) => setNewSlideUrl(e.target.value)}
                          className="w-full glass-input p-2.5 text-xs rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newSlideUrl.trim()) {
                              setCarouselSlides(prev => [
                                ...prev,
                                {
                                  id: `slide_${Date.now()}_${Math.random()}`,
                                  imageUrl: newSlideUrl.trim(),
                                  destinationType: newSlideDestType,
                                  targetUrl: newSlideDestType === 'in_app' ? newSlideInAppPage : newSlideTargetUrl.trim(),
                                  inAppPage: newSlideInAppPage,
                                  buttonText: newSlideButtonText.trim(),
                                  title: ''
                                }
                              ]);
                              setNewSlideUrl('');
                              setNewSlideTargetUrl('');
                              setNewSlideButtonText('');
                            }
                          }}
                          className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-md cursor-pointer flex-shrink-0"
                        >
                          Add Slide
                        </button>
                      </div>

                      <div className="text-center text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        — OR UPLOAD FILES —
                      </div>

                      {/* Method 2: Multi-Select File Uploader */}
                      <div>
                        <input
                          ref={carouselFileInputRef}
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              const filesArr = Array.from(e.target.files);
                              const newItems: FormCarouselSlide[] = filesArr.map((file, idx) => ({
                                id: `slide_${Date.now()}_${idx}`,
                                imageUrl: URL.createObjectURL(file),
                                file,
                                destinationType: destinationType,
                                targetUrl: destinationType === 'in_app' ? selectedInAppPage : targetUrl,
                                inAppPage: selectedInAppPage,
                                buttonText: buttonText,
                                title: ''
                              }));
                              setCarouselSlides(prev => [...prev, ...newItems]);
                            }
                          }}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => carouselFileInputRef.current?.click()}
                          className="w-full p-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-bold text-cyan-300 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm"
                        >
                          <Upload className="w-4 h-4 text-cyan-400" />
                          <span>Upload Images from Device (Multi-Select)</span>
                        </button>
                      </div>
                    </div>

                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="space-y-1 pt-1">
                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-cyan-500" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className="text-[10px] text-cyan-300 font-mono text-right">{uploadProgress}% uploaded</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Flyer Image / Artwork *</span>
                      <span className="text-[11px] text-indigo-400 font-normal">OPay Flyer: 3:4 / 4:5 vertical recommended</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Direct Image URL */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-white/70">Option A: Direct Image URL</span>
                        <input
                          type="url"
                          placeholder="https://.../flyer.png"
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                          className="w-full glass-input p-3 text-xs rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* File Upload Button */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-white/70">Option B: Upload File (PNG/JPG/WebP)</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setImageFile(e.target.files[0]);
                            }
                          }}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/90 flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                          <Upload className="w-4 h-4 text-indigo-400" />
                          <span>{imageFile ? imageFile.name : "Select Image from Device"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Corner Roundness Preset for Popups & Flyers */}
                    {(type === 'popup' || type === 'flyer') && (
                      <div className="pt-1 flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground font-semibold">Corner Curvature:</span>
                        {(['3xl', '2xl', 'xl', 'full'] as const).map(cr => (
                          <button
                            key={cr}
                            type="button"
                            onClick={() => setRoundedCorners(cr)}
                            className={`px-2.5 py-1 rounded-lg font-bold transition-all text-xs ${
                              roundedCorners === cr
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white/5 text-muted-foreground hover:text-white'
                            }`}
                          >
                            {cr === '3xl' ? 'OPay 3xl' : cr}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Banner Page Position Selector for Banners */}
                    {type === 'banner' && (
                      <div className="pt-2 p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/25 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-purple-400" />
                            <span>Banner Page Position *</span>
                          </label>
                          <span className="text-[11px] text-purple-300/80 font-medium">
                            {bannerPosition === 'top' ? '📌 Top of Page (Header)' : '⚓ Bottom of Page (Footer)'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setBannerPosition('top')}
                            className={`p-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                              bannerPosition === 'top'
                                ? 'bg-purple-600/30 border-purple-500 text-purple-200 shadow-md shadow-purple-600/20 ring-1 ring-purple-500/50'
                                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${bannerPosition === 'top' ? 'bg-purple-400 animate-pulse' : 'bg-white/30'}`} />
                            <span>Top of Page (Header)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setBannerPosition('bottom')}
                            className={`p-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                              bannerPosition === 'bottom'
                                ? 'bg-purple-600/30 border-purple-500 text-purple-200 shadow-md shadow-purple-600/20 ring-1 ring-purple-500/50'
                                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${bannerPosition === 'bottom' ? 'bg-pink-400 animate-pulse' : 'bg-white/30'}`} />
                            <span>Bottom of Page (Footer)</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground pt-0.5">
                          {bannerPosition === 'top'
                            ? '✨ Banner will sit prominently at the top header area of target pages.'
                            : '✨ Banner will sit neatly anchored at the bottom footer area of target pages.'}
                        </p>
                      </div>
                    )}

                    {/* Upload progress indicator */}
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="space-y-1 pt-1">
                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className="text-[10px] text-indigo-300 font-mono text-right">{uploadProgress}% uploaded</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Target Pages Multi-Select */}
                {type === 'flyer' ? (
                  <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 space-y-1">
                    <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
                      <Globe className="w-4 h-4 text-indigo-400" />
                      <span>App Entry Target (Automatic)</span>
                    </div>
                    <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                      This OPay-style flyer displays strictly upon <strong>App Launch / Initial Entry</strong>, ensuring it does not pop up or interrupt users while navigating between pages.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Display On Pages</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllPages}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-all cursor-pointer active:scale-95"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAllPages}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white border border-white/10 transition-all cursor-pointer active:scale-95"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_PAGES.map(page => {
                        const isSelected = page.id === 'all'
                          ? (targetPages.includes('all') || targetPages.length === ALL_SPECIFIC_PAGE_IDS.length)
                          : (targetPages.includes('all') || targetPages.includes(page.id));
                        return (
                          <button
                            key={page.id}
                            type="button"
                            onClick={() => togglePageTarget(page.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              isSelected
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                                : 'bg-white/5 text-muted-foreground border-white/5 hover:border-white/20'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-cyan-400" />}
                            <span>{page.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 5. Frequency Capping & Timing Rules */}
                <div className="space-y-3 p-4 rounded-2xl bg-black/40 border border-white/10">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Display Frequency & Timing</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Frequency selector */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-white/70 font-semibold">Frequency Capping</span>
                      <select
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value as AdFrequency)}
                        className="w-full glass-input p-2.5 text-xs rounded-xl border border-white/10 bg-[#0f172a] text-white focus:outline-none"
                      >
                        <option value="always">Always (Every page visit)</option>
                        <option value="once_per_session">Once per session (Until tab closed)</option>
                        <option value="once_per_day">Once per day (24h cooldown)</option>
                        <option value="x_per_day">X times per day (Custom)</option>
                        <option value="x_per_week">X times per week (Custom)</option>
                        <option value="once_ever">Once ever per device/user</option>
                      </select>
                    </div>

                    {/* Custom counts for x_per_day / x_per_week */}
                    {frequency === 'x_per_day' && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-white/70 font-semibold">Max Times Per Day</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={maxPerDay}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMaxPerDay(val === '' ? '' : Math.max(1, parseInt(val) || 1));
                          }}
                          className="w-full glass-input p-2.5 text-xs rounded-xl border border-white/10"
                        />
                        <p className="text-[10px] text-muted-foreground">Spaces impressions smoothly across active hours.</p>
                      </div>
                    )}

                    {frequency === 'x_per_week' && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-white/70 font-semibold">Max Times Per Week</span>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={maxPerWeek}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMaxPerWeek(val === '' ? '' : Math.max(1, parseInt(val) || 1));
                          }}
                          className="w-full glass-input p-2.5 text-xs rounded-xl border border-white/10"
                        />
                        <p className="text-[10px] text-muted-foreground">Auto-paced across all 7 days so users don't exhaust all views in 2–3 days.</p>
                      </div>
                    )}

                    {/* Display delay in seconds */}
                    {(type === 'popup' || type === 'flyer') && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-white/70 font-semibold">Popup Delay (Seconds)</span>
                        <input
                          type="number"
                          min="0"
                          max="60"
                          value={displayDelaySeconds}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDisplayDelaySeconds(val === '' ? '' : Math.max(0, parseInt(val) || 0));
                          }}
                          placeholder="0 = Immediate"
                          className="w-full glass-input p-2.5 text-xs rounded-xl border border-white/10"
                        />
                      </div>
                    )}

                    {/* Auto-close countdown */}
                    {(type === 'popup' || type === 'flyer') && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-white/70 font-semibold">Auto-Close Countdown (Seconds)</span>
                        <input
                          type="number"
                          min="0"
                          max="60"
                          value={autoCloseSeconds}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAutoCloseSeconds(val === '' ? '' : Math.max(0, parseInt(val) || 0));
                          }}
                          placeholder="0 = Manual close only"
                          className="w-full glass-input p-2.5 text-xs rounded-xl border border-white/10"
                        />
                      </div>
                    )}
                  </div>

                  {/* Expiry Schedule Date */}
                  <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-white/80 font-medium">
                      <input
                        type="checkbox"
                        checked={hasExpiry}
                        onChange={(e) => setHasExpiry(e.target.checked)}
                        className="rounded accent-indigo-600"
                      />
                      <span>Set Campaign End Date & Time</span>
                    </label>

                    {hasExpiry && (
                      <input
                        type="datetime-local"
                        value={endDateStr}
                        onChange={(e) => setEndDateStr(e.target.value)}
                        className="glass-input p-2 text-xs rounded-xl border border-white/10 bg-[#0f172a] text-white"
                      />
                    )}
                  </div>
                </div>

                {/* 6. Optional Button Text & Description */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">CTA Button Text</label>
                    <input
                      type="text"
                      placeholder="e.g. Claim Offer, Open Now"
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      className="w-full glass-input p-3 text-xs rounded-xl border border-white/10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Short Description (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Limited time promotion for StreamAura members"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full glass-input p-3 text-xs rounded-xl border border-white/10"
                    />
                  </div>
                </div>

                {/* 7. Broadcast to User Inboxes Option */}
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0 mt-0.5 sm:mt-0">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-bold text-white">Broadcast to Users' Notification Inboxes</h5>
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-[9px] font-black uppercase">Clickable</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Push this ad as a rich interactive notification with flyer preview & direct link to all user inboxes.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={broadcastToNotifications}
                      onChange={(e) => setBroadcastToNotifications(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {/* Submit / Cancel Bar */}
                <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditorOpen(false)}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-white/70 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving Campaign...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{editingAdId ? 'Update Campaign' : 'Publish Campaign'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. Broadcast Ad to Notifications Confirmation Modal */}
      <AnimatePresence>
        {broadcastingAd && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isBroadcasting) setBroadcastingAd(null); }}
              className="fixed inset-0 bg-black/85 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md glass-card p-6 sm:p-7 rounded-3xl border border-white/15 shadow-2xl z-10 text-center space-y-5 bg-[#0b0f19]"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/10">
                <Bell className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Post Ad to Notification Inbox?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This will broadcast <strong className="text-white">"{broadcastingAd.title}"</strong> as a clickable, interactive notification card directly to every user's inbox on StreamAura.
                </p>
              </div>

              {/* Flyer Thumbnail Preview */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3 text-left">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-black/60 shrink-0 border border-white/10">
                  <img src={broadcastingAd.imageUrl} alt={broadcastingAd.title} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-xs text-white truncate">{broadcastingAd.title}</h4>
                  <p className="text-[11px] text-muted-foreground truncate">{broadcastingAd.description || 'Special promotional ad'}</p>
                  {broadcastingAd.targetUrl && (
                    <span className="text-[10px] text-indigo-400 font-mono truncate block mt-0.5">
                      🔗 {broadcastingAd.targetUrl}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={isBroadcasting}
                  onClick={() => setBroadcastingAd(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold hover:bg-white/10 transition-all text-white/80"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isBroadcasting}
                  onClick={() => handleBroadcastAd(broadcastingAd)}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isBroadcasting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Broadcast Now</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. In-Depth Ads Analytics & Channel Attribution Modal */}
      <AnimatePresence>
        {analyticsAd && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAnalyticsAd(null)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="relative w-full max-w-3xl glass-card p-6 sm:p-8 rounded-3xl border border-white/15 shadow-2xl z-10 my-auto max-h-[92vh] overflow-y-auto custom-scrollbar space-y-6"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-black/60 border border-white/10 flex-shrink-0 shadow-lg">
                    <img src={analyticsAd.imageUrl} alt={analyticsAd.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        analyticsAd.active 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                      }`}>
                        {analyticsAd.active ? '● Live' : '○ Paused'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase border border-indigo-500/30">
                        {analyticsAd.type === 'flyer' ? '🚀 OPay Flyer' : analyticsAd.type === 'popup' ? '🎯 Smart Popup' : analyticsAd.type === 'banner' ? '📢 Sticky Banner' : '🎠 Moving Carousel'}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white truncate mt-1">
                      {analyticsAd.title}
                    </h3>
                    {analyticsAd.targetUrl && (
                      <p className="text-xs text-indigo-400 flex items-center gap-1 truncate">
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span>{analyticsAd.targetUrl}</span>
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setAnalyticsAd(null)}
                  className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Dynamic Analytics Calculations */}
              {(() => {
                const totalImp = analyticsAd.impressions || 0;
                const totalCl = analyticsAd.clicks || 0;
                const totalCls = analyticsAd.closes || 0;
                const ctrVal = totalImp > 0 ? ((totalCl / totalImp) * 100).toFixed(2) : '0.00';
                const closeVal = totalImp > 0 ? ((totalCls / totalImp) * 100).toFixed(2) : '0.00';

                const clicksBySrc = analyticsAd.clicksBySource || {};
                const flyerClicks = clicksBySrc.flyer || 0;
                const popupClicks = clicksBySrc.popup || 0;
                const notifClicks = clicksBySrc.notification || 0;
                const bannerClicks = clicksBySrc.banner || 0;
                const carouselClicks = clicksBySrc.carousel || 0;

                const closesByMtd = analyticsAd.closesByMethod || {};
                const xCloses = closesByMtd.close_button || 0;
                const tapOutsideCloses = closesByMtd.backdrop_tap || 0;
                const escCloses = closesByMtd.esc_key || 0;
                const timerCloses = closesByMtd.auto_timer || 0;

                return (
                  <div className="space-y-6">
                    {/* 4 KPI Grid Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* Total Views */}
                      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                        <div className="flex items-center justify-between text-cyan-400">
                          <span className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Total Views</span>
                          <Eye className="w-4 h-4" />
                        </div>
                        <p className="text-xl sm:text-2xl font-black text-white">{totalImp.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">Ad impressions</p>
                      </div>

                      {/* Total Clicks & CTR */}
                      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                        <div className="flex items-center justify-between text-purple-400">
                          <span className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Total Clicks</span>
                          <MousePointerClick className="w-4 h-4" />
                        </div>
                        <p className="text-xl sm:text-2xl font-black text-purple-400">{totalCl.toLocaleString()}</p>
                        <p className="text-[10px] font-semibold text-amber-400">CTR: {ctrVal}%</p>
                      </div>

                      {/* Total Closes */}
                      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                        <div className="flex items-center justify-between text-rose-400">
                          <span className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Dismissals</span>
                          <XCircle className="w-4 h-4" />
                        </div>
                        <p className="text-xl sm:text-2xl font-black text-rose-400">{totalCls.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">Close Rate: {closeVal}%</p>
                      </div>

                      {/* Engagement Ratio */}
                      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                        <div className="flex items-center justify-between text-emerald-400">
                          <span className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Engagement</span>
                          <Activity className="w-4 h-4" />
                        </div>
                        <p className="text-xl sm:text-2xl font-black text-emerald-400">
                          {totalCls > 0 ? (totalCl / totalCls).toFixed(2) : totalCl > 0 ? '1.0' : '0.0'}x
                        </p>
                        <p className="text-[10px] text-muted-foreground">Click-to-Dismiss Ratio</p>
                      </div>
                    </div>

                    {/* Breakdown 1: Clicks by Channel / Source */}
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-white flex items-center gap-2">
                          <MousePointerClick className="w-4 h-4 text-purple-400" />
                          <span>Click Attribution by Source</span>
                        </h4>
                        <span className="text-[11px] font-mono font-bold text-white/70">{totalCl} total clicks</span>
                      </div>

                      <div className="space-y-3">
                        {[
                          { label: 'OPay App-Launch Flyer Clicks', count: flyerClicks, color: 'bg-emerald-500', text: 'text-emerald-400' },
                          { label: 'Smart In-App Popup Clicks', count: popupClicks, color: 'bg-indigo-500', text: 'text-indigo-400' },
                          { label: 'Notification Inbox Clicks (Broadcasts)', count: notifClicks, color: 'bg-amber-500', text: 'text-amber-400' },
                          { label: 'Sticky Top/Bottom Banner Clicks', count: bannerClicks, color: 'bg-purple-500', text: 'text-purple-400' },
                          { label: 'Moving Carousel Slide Clicks', count: carouselClicks, color: 'bg-cyan-500', text: 'text-cyan-400' },
                        ].map((src, i) => {
                          const pct = totalCl > 0 ? Math.round((src.count / totalCl) * 100) : 0;
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-white/80 font-medium">{src.label}</span>
                                <span className="font-mono font-bold text-white">
                                  {src.count.toLocaleString()} <span className={`text-[11px] ${src.text}`}>({pct}%)</span>
                                </span>
                              </div>
                              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${src.color} transition-all duration-500 rounded-full`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Breakdown 2: Dismissal & Exit Methods */}
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-white flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-rose-400" />
                          <span>How Users Closed / Cancelled This Ad</span>
                        </h4>
                        <span className="text-[11px] font-mono font-bold text-white/70">{totalCls} total dismissals</span>
                      </div>

                      <div className="space-y-3">
                        {[
                          { label: 'Clicked Centered (X) Close Button', count: xCloses, color: 'bg-rose-500', text: 'text-rose-400' },
                          { label: 'Tapped Outside Modal Backdrop', count: tapOutsideCloses, color: 'bg-orange-500', text: 'text-orange-400' },
                          { label: 'Pressed ESC Key on Keyboard', count: escCloses, color: 'bg-blue-500', text: 'text-blue-400' },
                          { label: 'Auto-Close Countdown Timer Expired', count: timerCloses, color: 'bg-emerald-500', text: 'text-emerald-400' },
                        ].map((mtd, i) => {
                          const pct = totalCls > 0 ? Math.round((mtd.count / totalCls) * 100) : 0;
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-white/80 font-medium">{mtd.label}</span>
                                <span className="font-mono font-bold text-white">
                                  {mtd.count.toLocaleString()} <span className={`text-[11px] ${mtd.text}`}>({pct}%)</span>
                                </span>
                              </div>
                              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${mtd.color} transition-all duration-500 rounded-full`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Pop & Frequency Cap Progress Breakdown */}
                    {(() => {
                      const cap = getAdCapProgress(analyticsAd);
                      return (
                        <div className="p-5 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-3 text-xs">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-white flex items-center gap-2">
                              <Sliders className="w-4 h-4 text-purple-400" />
                              <span>Pop & Frequency Cap Progress</span>
                            </h4>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                              cap.isCapped 
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' 
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            }`}>
                              {cap.isCapped ? '● Cap Reached' : '● Active & Delivering'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                              <span className="text-[10px] text-muted-foreground block uppercase font-bold">Configured Cap</span>
                              <span className="font-bold text-white text-sm">{getFrequencyLabel(analyticsAd.frequency, analyticsAd.maxPerDay, analyticsAd.maxPerWeek)}</span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                              <span className="text-[10px] text-muted-foreground block uppercase font-bold">This Device Progress</span>
                              <span className="font-bold text-purple-300 text-sm">{cap.label}</span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                              <span className="text-[10px] text-muted-foreground block uppercase font-bold">Global Views</span>
                              <span className="font-bold text-cyan-300 text-sm font-mono">{(analyticsAd.impressions || 0).toLocaleString()}</span>
                            </div>
                          </div>

                          {cap.capType !== 'always' && (
                            <div className="space-y-1.5 pt-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground font-semibold">Cycle Progress ({cap.percentage}%)</span>
                                <span className="text-white/80 font-bold">{cap.subLabel}</span>
                              </div>
                              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    cap.isCapped 
                                      ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]' 
                                      : 'bg-gradient-to-r from-purple-500 via-indigo-500 to-pink-500'
                                  }`}
                                  style={{ width: `${Math.min(100, cap.percentage)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Delivery Rules & Schedule Parameters */}
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3 text-xs">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-white flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-indigo-400" />
                        <span>Delivery & Targeting Configuration</span>
                      </h4>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Frequency Rule</span>
                          <span className="font-bold text-white">{getFrequencyLabel(analyticsAd.frequency, analyticsAd.maxPerDay, analyticsAd.maxPerWeek)}</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Popup Delay</span>
                          <span className="font-bold text-white">{analyticsAd.displayDelaySeconds || 0}s</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Auto-Close Timer</span>
                          <span className="font-bold text-white">
                            {analyticsAd.autoCloseSeconds ? `${analyticsAd.autoCloseSeconds}s` : 'Manual Close Only'}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <span className="text-[10px] text-muted-foreground block uppercase font-bold mb-1.5">Targeted Pages ({analyticsAd.targetPages.length})</span>
                        <div className="flex flex-wrap gap-1.5">
                          {analyticsAd.targetPages.map(p => (
                            <span key={p} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/80 font-medium capitalize text-[11px]">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. In-App Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingAd && (
          <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingAd(null)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="relative w-full max-w-md glass-card p-6 sm:p-7 rounded-3xl border border-rose-500/30 shadow-2xl z-10 bg-[#0c0f1d]/95 text-center space-y-4"
            >
              {/* Warning Icon Badge */}
              <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-500/10">
                <Trash2 className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Delete Ad Campaign?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed px-2">
                  Are you sure you want to permanently delete <span className="font-bold text-white">"{deletingAd.title}"</span>? This action cannot be undone and will remove all impression and click analytics for this campaign.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingAd(null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!deletingAd) return;
                    const targetId = deletingAd.id;
                    const targetTitle = deletingAd.title;
                    const targetAd = ads.find(a => a.id === targetId);

                    // 1. Instant Optimistic UI feedback (0ms perceived latency)
                    setDeletingAd(null);
                    setAds(prev => prev.filter(a => a.id !== targetId));
                    showSuccess(`Campaign "${targetTitle}" deleted`);

                    // 2. Perform deletion in background with error rollback
                    try {
                      await deleteAdCampaign(targetId);
                    } catch (err: any) {
                      if (targetAd) {
                        setAds(prev => [targetAd, ...prev]);
                      }
                      showError(err.message || 'Failed to delete campaign');
                    }
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Campaign</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. Live Modal Preview Popup for Testing */}
      {previewAd && (
        <AdPopupModal
          ad={previewAd}
          isOpen={true}
          onClose={() => setPreviewAd(null)}
        />
      )}
    </div>
  );
};
