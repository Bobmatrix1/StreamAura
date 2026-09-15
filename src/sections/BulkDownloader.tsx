/**
 * Pro Bulk Downloader Component
 * Advanced multi-link batch downloader supporting YouTube, TikTok, Spotify, Apple Music,
 * Instagram, Facebook, Twitter/X, SoundCloud & Audiomack.
 */

import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Play, 
  Square, 
  X, 
  Link2, 
  List, 
  Loader2, 
  ClipboardPaste, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Film, 
  Music, 
  Zap, 
  Download, 
  Copy, 
  RotateCcw, 
  Layers 
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useIsMobile } from '../hooks/use-mobile';
import { logMediaInteraction } from '../lib/firebase';
import { detectPlatform, extractVideoInfo } from '../api/mediaApi';
import { LoginRequired } from '../components/LoginRequired';
import type { VideoQuality, AudioQuality, Platform, VideoInfo, MusicInfo } from '../types';

// ==========================================
// Authentic Vector Platform SVG Logos
// ==========================================
const YouTubeLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.377.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000" />
    <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FFFFFF" />
  </svg>
);

const TikTokLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="#010101" />
    <path d="M16.5 6.8c-.8 0-1.6-.4-2-.9-.2-.3-.3-.7-.4-1.2h-2.1v10.4c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9 1.3-2.9 2.9-2.9c.3 0 .6.05.9.15v-2.3c-.3-.05-.6-.08-.9-.08-2.8 0-5.1 2.3-5.1 5.1s2.3 5.1 5.1 5.1 5.1-2.3 5.1-5.1v-5.2c1 .7 2.2 1.1 3.4 1.1V8c-.4 0-.8-.4-1.2-1.2z" fill="#25F4EE" />
    <path d="M16.8 6.5c-.8 0-1.6-.4-2-.9-.2-.3-.3-.7-.4-1.2h-1.8v10.4c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9 1.3-2.9 2.9-2.9c.3 0 .6.05.9.15v-2.3c-.3-.05-.6-.08-.9-.08-2.8 0-5.1 2.3-5.1 5.1s2.3 5.1 5.1 5.1 5.1-2.3 5.1-5.1v-5.2c1 .7 2.2 1.1 3.4 1.1V7.7c-.4 0-.8-.4-1.2-1.2z" fill="#FE2C55" />
    <path d="M16.65 6.65c-.8 0-1.6-.4-2-.9-.2-.3-.3-.7-.4-1.2h-1.95v10.4c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9 1.3-2.9 2.9-2.9c.3 0 .6.05.9.15v-2.3c-.3-.05-.6-.08-.9-.08-2.8 0-5.1 2.3-5.1 5.1s2.3 5.1 5.1 5.1 5.1-2.3 5.1-5.1v-5.2c1 .7 2.2 1.1 3.4 1.1V7.85c-.4 0-.8-.4-1.2-1.2z" fill="#FFFFFF" />
  </svg>
);

const SpotifyLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="12" fill="#1ED760" />
    <path d="M17.485 17.065c-.217.355-.678.468-1.033.251-2.828-1.728-6.388-2.119-10.58-1.161-.406.092-.81-.161-.903-.567-.092-.406.162-.81.568-.903 4.595-1.05 8.528-.607 11.697 1.347.355.217.468.678.251 1.033zm1.388-3.085c-.273.443-.854.584-1.298.312-3.237-1.99-8.171-2.566-11.999-1.403-.5.152-1.028-.135-1.18-.635-.152-.5.135-1.028.635-1.18 4.382-1.33 9.816-.689 13.53 1.598.444.272.585.853.312 1.308zm.118-3.218C15.115 8.47 8.736 8.257 5.084 9.366c-.594.18-1.226-.156-1.406-.75-.18-.595.156-1.226.75-1.407 4.195-1.273 11.238-1.02 15.688 1.621.534.317.708 1.01.391 1.545-.317.534-1.01.708-1.546.388z" fill="#000000" />
  </svg>
);

const AppleMusicLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="url(#bulk-am-grad)" />
    <path d="M16.5 6.5v8.2c0 1.5-1.2 2.8-2.8 2.8s-2.8-1.2-2.8-2.8 1.2-2.8 2.8-2.8c.4 0 .8.1 1.1.3v-4.2l-5.5 1.2v6.7c0 1.5-1.2 2.8-2.8 2.8S3.7 17.5 3.7 16s1.2-2.8 2.8-2.8c.4 0 .8.1 1.1.3V8.8c0-.6.4-1.1 1-1.2l6.5-1.4c.7-.2 1.4.3 1.4 1.1z" fill="#FFFFFF" />
    <defs>
      <linearGradient id="bulk-am-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FA243C" />
        <stop offset="1" stopColor="#FD5B78" />
      </linearGradient>
    </defs>
  </svg>
);

const InstagramLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="url(#bulk-ig-grad)" />
    <path d="M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2zm5-8a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z" fill="#FFFFFF" />
    <path d="M17.3 4H6.7A2.7 2.7 0 0 0 4 6.7v10.6A2.7 2.7 0 0 0 6.7 20h10.6a2.7 2.7 0 0 0 2.7-2.7V6.7A2.7 2.7 0 0 0 17.3 4zm1 13.3a1 1 0 0 1-1 1H6.7a1 1 0 0 1-1-1V6.7a1 1 0 0 1 1-1h10.6a1 1 0 0 1 1 1v10.6z" fill="#FFFFFF" />
    <defs>
      <linearGradient id="bulk-ig-grad" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FED373" />
        <stop offset="0.25" stopColor="#F15245" />
        <stop offset="0.6" stopColor="#D92E7F" />
        <stop offset="1" stopColor="#833AB4" />
      </linearGradient>
    </defs>
  </svg>
);

const FacebookLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="12" fill="#1877F2" />
    <path d="M13.5 12h2.2l.35-2.6H13.5V7.7c0-.75.21-1.27 1.3-1.27h1.4V4.1c-.24-.03-1.07-.1-2.04-.1-2.02 0-3.4 1.23-3.4 3.5V9.4H8.5V12h2.26v6.9a12.05 12.05 0 0 0 2.74 0V12z" fill="#FFFFFF" />
  </svg>
);

const TwitterXLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="#000000" />
    <path d="M17.2 5.5h2.15l-4.7 5.37L20.2 18.5h-4.34l-3.4-4.44-3.89 4.44H6.42l5.03-5.75L6.05 5.5h4.45l3.07 4.06zm-.76 11.71h1.19L9.61 6.74H8.33z" fill="#FFFFFF" />
  </svg>
);

const SoundCloudLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="#FF5500" />
    <path d="M6 13.5v3M8 11.5v5M10 10v6.5M12 9v7.5M14 8.5v8M16 8.5a3 3 0 0 1 3 3 2.5 2.5 0 0 1-.5 4.9H16" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const AudiomackLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="#FFA200" />
    <path d="M5.5 14.8l2.2-5.6 2.2 5.6M14.1 14.8l2.2-5.6 2.2 5.6M11.5 14.8V8.2" stroke="#000000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const getPlatformIcon = (platform: string, className = "w-4 h-4") => {
  const p = platform.toLowerCase();
  if (p.includes('youtube-music') || p.includes('youtube music')) return <YouTubeLogo className={className} />;
  if (p.includes('youtube') || p.includes('youtu')) return <YouTubeLogo className={className} />;
  if (p.includes('tiktok') || p.includes('tikwm')) return <TikTokLogo className={className} />;
  if (p.includes('spotify')) return <SpotifyLogo className={className} />;
  if (p.includes('apple')) return <AppleMusicLogo className={className} />;
  if (p.includes('instagram') || p.includes('instagr')) return <InstagramLogo className={className} />;
  if (p.includes('facebook') || p.includes('fb')) return <FacebookLogo className={className} />;
  if (p.includes('twitter') || p.includes('x.com')) return <TwitterXLogo className={className} />;
  if (p.includes('soundcloud')) return <SoundCloudLogo className={className} />;
  if (p.includes('audiomack')) return <AudiomackLogo className={className} />;
  return <Link2 className={className} />;
};

const getPlatformBadgeColor = (platform: string) => {
  const p = platform.toLowerCase();
  if (p.includes('youtube-music') || p.includes('youtube music')) return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (p.includes('youtube')) return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (p.includes('tiktok')) return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
  if (p.includes('spotify')) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (p.includes('apple')) return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  if (p.includes('instagram')) return 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30';
  if (p.includes('facebook')) return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (p.includes('twitter')) return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
  if (p.includes('soundcloud')) return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
  if (p.includes('audiomack')) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-white/10 text-white/70 border-white/15';
};

// Queue item detailed state
interface EnhancedQueueItem {
  id: string;
  url: string;
  platform: Platform;
  status: 'waiting' | 'extracting' | 'ready' | 'downloading' | 'completed' | 'error';
  progress: number;
  info?: VideoInfo | MusicInfo;
  selectedQuality?: VideoQuality | AudioQuality;
  targetFormat: 'best-video' | 'mp3-audio' | 'fast';
  error?: string;
}

type GlobalFormatPreset = 'best-video' | 'mp3-audio' | 'fast';

const BulkDownloader: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return (
      <LoginRequired 
        title="Power Bulk Downloading"
        description="Sign in to use the Bulk Downloader. Process multiple links simultaneously across YouTube, TikTok, Spotify, Apple Music & more."
        icon={List}
      />
    );
  }

  const [inputUrls, setInputUrls] = useState('');
  const [items, setItems] = useState<EnhancedQueueItem[]>([]);
  const [globalPreset, setGlobalPreset] = useState<GlobalFormatPreset>('best-video');
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'waiting' | 'downloading' | 'completed' | 'error'>('all');
  
  const isCancelledRef = useRef(false);
  const isMobile = useIsMobile();
  const { downloadWithProgress } = useDownload();
  const { showError, showSuccess, showInfo } = useToast();

  // Parse typed / pasted links in real time
  const parsedDetectedUrls = useMemo(() => {
    if (!inputUrls.trim()) return [];
    return inputUrls
      .split(/[\n\s,]+/)
      .map(u => u.trim())
      .filter(u => u.startsWith('http://') || u.startsWith('https://'));
  }, [inputUrls]);

  // Detected platforms breakdown
  const detectedPlatformsBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    parsedDetectedUrls.forEach(url => {
      const p = detectPlatform(url);
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [parsedDetectedUrls]);

  // Queue Statistics
  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter(i => i.status === 'completed').length;
    const downloading = items.filter(i => i.status === 'downloading' || i.status === 'extracting').length;
    const waiting = items.filter(i => i.status === 'waiting' || i.status === 'ready').length;
    const error = items.filter(i => i.status === 'error').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, downloading, waiting, error, percent };
  }, [items]);

  // Filtered Items for Display
  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    if (activeFilter === 'waiting') return items.filter(i => i.status === 'waiting' || i.status === 'ready');
    if (activeFilter === 'downloading') return items.filter(i => i.status === 'downloading' || i.status === 'extracting');
    if (activeFilter === 'completed') return items.filter(i => i.status === 'completed');
    if (activeFilter === 'error') return items.filter(i => i.status === 'error');
    return items;
  }, [items, activeFilter]);

  // Paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      if (!navigator.clipboard) {
        showError('Clipboard API not available in your browser');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        showError('Clipboard is empty');
        return;
      }
      setInputUrls(prev => prev ? `${prev}\n${text}` : text);
      showSuccess('Pasted from clipboard');
    } catch {
      showError('Failed to read from clipboard. Please paste manually.');
    }
  };

  // Add URLs to Queue
  const handleAddUrls = () => {
    if (parsedDetectedUrls.length === 0) {
      showError('Please paste at least one valid URL starting with http/https');
      return;
    }

    const existingUrls = new Set(items.map(i => i.url.toLowerCase()));
    const newItems: EnhancedQueueItem[] = [];

    parsedDetectedUrls.forEach(url => {
      if (!existingUrls.has(url.toLowerCase())) {
        existingUrls.add(url.toLowerCase());
        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          url,
          platform: detectPlatform(url),
          status: 'waiting',
          progress: 0,
          targetFormat: globalPreset
        });
      }
    });

    if (newItems.length === 0) {
      showInfo('All entered links are already in the queue');
      return;
    }

    setItems(prev => [...prev, ...newItems]);
    setInputUrls('');
    showSuccess(`Added ${newItems.length} link${newItems.length > 1 ? 's' : ''} to queue`);
  };

  // Extract metadata for a single item
  const extractItemMetadata = async (item: EnhancedQueueItem): Promise<VideoInfo | MusicInfo | null> => {
    try {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'extracting', error: undefined } : i));
      const res = await extractVideoInfo(item.url);
      if (res.success && res.data && res.data.qualities && res.data.qualities.length > 0) {
        const info = res.data;
        
        // Auto-select quality according to preset
        let selectedQ = info.qualities[0];
        if (item.targetFormat === 'mp3-audio') {
          const audioQ = info.qualities.find(q => q.format === 'MP3' || ('resolution' in q && (q as any).resolution === 'Audio')) || info.qualities[info.qualities.length - 1];
          if (audioQ) selectedQ = audioQ;
        }

        setItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          status: 'ready',
          info,
          selectedQuality: selectedQ
        } : i));
        return info;
      } else {
        const err = res.error || 'Failed to extract media information';
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err } : i));
        return null;
      }
    } catch (e: any) {
      const err = e.message || 'Network error during extraction';
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err } : i));
      return null;
    }
  };

  // Batch Extract All Metadata
  const handleExtractAll = async () => {
    const unextracted = items.filter(i => i.status === 'waiting' || (i.status === 'error' && !i.info));
    if (unextracted.length === 0) {
      showInfo('All items already have metadata extracted');
      return;
    }

    showInfo(`Extracting metadata for ${unextracted.length} items...`);
    for (const item of unextracted) {
      if (isCancelledRef.current) break;
      await extractItemMetadata(item);
    }
    showSuccess('Metadata extraction finished');
  };

  // Download Single Item
  const processDownloadItem = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    try {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: 'extracting', progress: 10 } : i));
      
      let info = item.info;
      if (!info) {
        info = await extractItemMetadata(item) || undefined;
      }
      if (!info || !info.qualities || info.qualities.length === 0) {
        throw new Error(item.error || 'No downloadable streams found');
      }

      // Determine quality
      let selectedQ = item.selectedQuality;
      if (!selectedQ) {
        if (item.targetFormat === 'mp3-audio') {
          selectedQ = info.qualities.find(q => q.format === 'MP3' || ('resolution' in q && (q as any).resolution === 'Audio')) || info.qualities[info.qualities.length - 1];
        } else {
          selectedQ = info.qualities[0];
        }
      }
      if (!selectedQ) selectedQ = info.qualities[0];

      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        status: 'downloading',
        progress: 35,
        selectedQuality: selectedQ
      } : i));

      const safeTitle = (info.title || 'media').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const ext = selectedQ.format?.toLowerCase() === 'mp3' || info.mediaType === 'music' ? 'mp3' : 'mp4';
      const filename = `${safeTitle.substring(0, 50)}.${ext}`;

      await downloadWithProgress(
        selectedQ.url,
        selectedQ.quality,
        filename,
        undefined,
        {
          id: info.id || item.id,
          title: info.title || 'Bulk Download',
          thumbnail: info.thumbnail || '',
          mediaType: info.mediaType || 'video',
          platform: info.platform || 'Direct'
        }
      );

      // Log interaction to Firebase
      logMediaInteraction(
        { id: info.id, title: info.title, mediaType: info.mediaType, platform: info.platform },
        'download',
        user?.uid
      );

      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        status: 'completed',
        progress: 100
      } : i));

      showSuccess(`Downloaded: ${info.title.substring(0, 35)}...`);
    } catch (err: any) {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        status: 'error',
        error: err.message || 'Download failed'
      } : i));
      showError(`Error downloading item: ${err.message || 'Failed'}`);
    }
  };

  // Start All Queue Processing
  const handleStartAll = async () => {
    const pending = items.filter(i => i.status === 'waiting' || i.status === 'ready' || i.status === 'error');
    if (pending.length === 0) {
      showInfo('No pending items to download');
      return;
    }

    isCancelledRef.current = false;
    setIsProcessingQueue(true);
    showInfo(`Starting batch download of ${pending.length} items...`);

    for (const item of pending) {
      if (isCancelledRef.current) {
        showInfo('Batch queue stopped');
        break;
      }
      await processDownloadItem(item.id);
    }

    setIsProcessingQueue(false);
  };

  // Cancel / Stop All
  const handleStopAll = () => {
    isCancelledRef.current = true;
    setIsProcessingQueue(false);
    showInfo('Queue processing stopped');
  };

  // Clear completed items
  const handleClearCompleted = () => {
    setItems(prev => prev.filter(i => i.status !== 'completed'));
    showSuccess('Cleared completed items');
  };

  // Clear all items
  const handleClearAll = () => {
    handleStopAll();
    setItems([]);
    showSuccess('Queue cleared');
  };

  // Remove single item
  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // Retry single item
  const handleRetryItem = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'waiting', progress: 0, error: undefined } : i));
    processDownloadItem(id);
  };

  // Toggle item format between Best Video and MP3
  const handleToggleItemFormat = (id: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const nextFormat = i.targetFormat === 'best-video' ? 'mp3-audio' : 'best-video';
      let nextQ = i.selectedQuality;
      if (i.info && i.info.qualities) {
        if (nextFormat === 'mp3-audio') {
          nextQ = i.info.qualities.find(q => q.format === 'MP3' || ('resolution' in q && (q as any).resolution === 'Audio')) || i.info.qualities[i.info.qualities.length - 1];
        } else {
          nextQ = i.info.qualities[0];
        }
      }
      return {
        ...i,
        targetFormat: nextFormat,
        selectedQuality: nextQ
      };
    }));
  };

  // Copy all direct stream links to clipboard
  const handleCopyAllLinks = () => {
    const urls = items
      .map(i => i.selectedQuality?.url || i.info?.qualities?.[0]?.url || i.url)
      .join('\n');
    if (!urls) {
      showError('No stream links available to copy');
      return;
    }
    navigator.clipboard.writeText(urls);
    showSuccess('Copied stream URLs to clipboard');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-32 px-3 sm:px-6">
      
      {/* ========================================== */}
      {/* Header Banner */}
      {/* ========================================== */}
      <div className="text-center space-y-4 pt-4">
        <h1 className="text-3xl sm:text-5xl font-black gradient-text tracking-tight">
          Bulk Media Downloader
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto">
          Paste multiple music or video links from YouTube, TikTok, Spotify, Apple Music, Instagram, Facebook & X to batch download high-speed streams simultaneously.
        </p>

        {/* Supported Platform Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {[
            { name: 'YouTube', icon: <YouTubeLogo className="w-4 h-4" /> },
            { name: 'TikTok', icon: <TikTokLogo className="w-4 h-4" /> },
            { name: 'Spotify', icon: <SpotifyLogo className="w-4 h-4" /> },
            { name: 'Apple Music', icon: <AppleMusicLogo className="w-4 h-4" /> },
            { name: 'Instagram', icon: <InstagramLogo className="w-4 h-4" /> },
            { name: 'Facebook', icon: <FacebookLogo className="w-4 h-4" /> },
            { name: 'X / Twitter', icon: <TwitterXLogo className="w-4 h-4" /> },
            { name: 'SoundCloud', icon: <SoundCloudLogo className="w-4 h-4" /> },
            { name: 'Audiomack', icon: <AudiomackLogo className="w-4 h-4" /> },
          ].map((plat) => (
            <div 
              key={plat.name}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/80 backdrop-blur-md hover:border-white/25 transition-all"
            >
              {plat.icon}
              <span className="font-medium">{plat.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================== */}
      {/* Input & Configuration Card */}
      {/* ========================================== */}
      <div className="glass-card p-5 sm:p-7 space-y-5 rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden">
        
        {/* Top toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Link2 className="w-4 h-4 text-indigo-400" />
            <span>Paste Multiple Links</span>
            {parsedDetectedUrls.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-black text-[11px]">
                {parsedDetectedUrls.length} Detected
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePasteClipboard}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/90 flex items-center gap-1.5 transition-all active:scale-95"
              title="Paste from clipboard"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-indigo-400" />
              <span>Paste Clipboard</span>
            </button>

            {inputUrls && (
              <button
                onClick={() => setInputUrls('')}
                className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                title="Clear text"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Text Area */}
        <div className="relative">
          <textarea
            value={inputUrls}
            onChange={(e) => setInputUrls(e.target.value)}
            placeholder={
              isMobile 
                ? "Paste links line-by-line (YouTube, TikTok, Spotify, Apple Music, Reels...)" 
                : "Paste multiple media links here (one per line, comma, or space separated):\nhttps://www.tiktok.com/@user/video/...\nhttps://open.spotify.com/track/...\nhttps://music.apple.com/us/song/...\nhttps://www.youtube.com/watch?v=..."
            }
            className="w-full glass-input min-h-[140px] sm:min-h-[160px] p-4 text-xs sm:text-sm focus:outline-none rounded-xl resize-y font-mono leading-relaxed border border-white/10 focus:border-indigo-500/50 transition-all placeholder:text-muted-foreground/60"
          />
        </div>

        {/* Live Detected Platforms Pill Row */}
        {Object.keys(detectedPlatformsBreakdown).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground font-semibold">Detected in text:</span>
            {Object.entries(detectedPlatformsBreakdown).map(([plat, count]) => (
              <div 
                key={plat} 
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${getPlatformBadgeColor(plat)}`}
              >
                {getPlatformIcon(plat, "w-3.5 h-3.5")}
                <span className="capitalize">{plat.replace('-', ' ')}</span>
                <span className="opacity-75 font-normal">×{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Format Preset & Add Button Bar */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-white/10">
          
          {/* Format Selector Pills */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold hidden md:inline">Download As:</span>
            <div className="flex items-center p-1 bg-black/40 rounded-xl border border-white/10 w-full sm:w-auto">
              <button
                onClick={() => setGlobalPreset('best-video')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  globalPreset === 'best-video'
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Best Video (HD)</span>
              </button>

              <button
                onClick={() => setGlobalPreset('mp3-audio')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  globalPreset === 'mp3-audio'
                    ? 'bg-rose-600 text-white shadow-lg'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>MP3 Audio</span>
              </button>

              <button
                onClick={() => setGlobalPreset('fast')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  globalPreset === 'fast'
                    ? 'bg-emerald-600 text-white shadow-lg'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Fast Stream</span>
              </button>
            </div>
          </div>

          {/* Add To Queue Action */}
          <button
            onClick={handleAddUrls}
            disabled={parsedDetectedUrls.length === 0}
            className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add {parsedDetectedUrls.length > 0 ? `${parsedDetectedUrls.length} Links` : 'to Queue'}</span>
          </button>
        </div>
      </div>

      {/* ========================================== */}
      {/* Queue Section & Master Progress */}
      {/* ========================================== */}
      {items.length > 0 && (
        <div className="space-y-4">
          
          {/* Queue Master Header */}
          <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Progress summary */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <List className="w-5 h-5 text-indigo-400" />
                  <span>Download Queue</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs text-white/90 font-bold">
                    {items.length}
                  </span>
                </h3>

                {stats.downloading > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Processing {stats.downloading} active</span>
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="w-48 sm:w-64 h-2 rounded-full bg-white/10 overflow-hidden relative">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="text-xs font-bold text-muted-foreground">
                  {stats.completed}/{stats.total} ({stats.percent}%)
                </span>
              </div>
            </div>

            {/* Master Queue Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {isProcessingQueue ? (
                <button
                  onClick={handleStopAll}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all active:scale-95"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop Queue</span>
                </button>
              ) : (
                <button
                  onClick={handleStartAll}
                  disabled={stats.waiting === 0 && stats.error === 0}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-40"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Download All ({stats.waiting + stats.error})</span>
                </button>
              )}

              <button
                onClick={handleExtractAll}
                disabled={isProcessingQueue || items.every(i => i.status !== 'waiting')}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 active:scale-95"
                title="Fetch metadata for all items"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Extract Info</span>
              </button>

              <button
                onClick={handleCopyAllLinks}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                title="Copy all direct download links"
              >
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Copy URLs</span>
              </button>

              {stats.completed > 0 && (
                <button
                  onClick={handleClearCompleted}
                  className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-semibold text-xs transition-all"
                  title="Remove completed items"
                >
                  Clear Done
                </button>
              )}

              <button
                onClick={handleClearAll}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-white/70 hover:text-red-400 font-semibold text-xs transition-all"
                title="Clear all queue"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'all', label: `All (${items.length})` },
              { id: 'waiting', label: `Waiting (${stats.waiting})` },
              { id: 'downloading', label: `Active (${stats.downloading})` },
              { id: 'completed', label: `Completed (${stats.completed})` },
              { id: 'error', label: `Failed (${stats.error})` },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                  activeFilter === f.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-white/5 text-muted-foreground hover:text-white border border-white/5'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Queue Items List */}
          <div className="space-y-3">
            <AnimatePresence>
              {filteredItems.map((item, idx) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`glass-card p-4 rounded-xl border relative overflow-hidden transition-all ${
                    item.status === 'downloading'
                      ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/10 bg-indigo-500/5'
                      : item.status === 'completed'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : item.status === 'error'
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  
                  {/* Item Content Row */}
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                    
                    {/* Thumbnail / Platform Icon */}
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-black/50 border border-white/10 flex-shrink-0 relative flex items-center justify-center">
                      {item.info?.thumbnail ? (
                        <img 
                          src={item.info.thumbnail} 
                          alt="Thumbnail" 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to platform icon on broken images
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="p-2">
                          {getPlatformIcon(item.platform, "w-6 h-6")}
                        </div>
                      )}

                      {/* Small platform badge indicator */}
                      <div className="absolute bottom-1 right-1 p-0.5 rounded-full bg-black/80 backdrop-blur-md">
                        {getPlatformIcon(item.platform, "w-3 h-3")}
                      </div>
                    </div>

                    {/* Metadata column */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${getPlatformBadgeColor(item.platform)}`}>
                          {item.platform}
                        </span>

                        <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>

                        {item.info?.duration && (
                          <span className="text-[11px] text-muted-foreground font-medium">
                            • {item.info.duration}
                          </span>
                        )}
                      </div>

                      {/* Title / URL */}
                      <h4 className="font-bold text-sm text-white truncate" title={item.info?.title || item.url}>
                        {item.info?.title || item.url}
                      </h4>

                      {/* Author / Channel & Target Format */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {item.info?.author && (
                          <span className="text-white/70 truncate max-w-[160px]">
                            {item.info.author}
                          </span>
                        )}

                        {/* Format toggle button */}
                        <button
                          onClick={() => handleToggleItemFormat(item.id)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-colors ${
                            item.targetFormat === 'mp3-audio'
                              ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
                          }`}
                          title="Click to toggle format between Video and MP3"
                        >
                          {item.targetFormat === 'mp3-audio' ? <Music className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                          <span>{item.targetFormat === 'mp3-audio' ? 'MP3 Audio' : 'HD Video (MP4)'}</span>
                        </button>
                      </div>

                      {/* Error message if any */}
                      {item.error && (
                        <p className="text-xs text-red-400 font-medium flex items-center gap-1 pt-0.5">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{item.error}</span>
                        </p>
                      )}
                    </div>

                    {/* Status & Action Buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      
                      {/* Status indicator */}
                      {item.status === 'extracting' && (
                        <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-bold">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="hidden sm:inline">Extracting...</span>
                        </div>
                      )}

                      {item.status === 'downloading' && (
                        <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-bold">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="hidden sm:inline">Downloading...</span>
                        </div>
                      )}

                      {item.status === 'completed' && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold px-2 py-1 rounded-lg bg-emerald-500/10">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Done</span>
                        </div>
                      )}

                      {/* Download / Retry action */}
                      {item.status === 'error' ? (
                        <button
                          onClick={() => handleRetryItem(item.id)}
                          className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-xs flex items-center gap-1 transition-all active:scale-95"
                          title="Retry download"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Retry</span>
                        </button>
                      ) : (item.status === 'waiting' || item.status === 'ready') ? (
                        <button
                          onClick={() => processDownloadItem(item.id)}
                          className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition-all active:scale-95"
                          title="Download this item"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Download</span>
                        </button>
                      ) : null}

                      {/* Remove Button */}
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Remove from queue"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Individual Download Progress Bar (When active) */}
                  {(item.status === 'downloading' || item.status === 'extracting') && (
                    <div className="mt-3 pt-2 border-t border-white/5">
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden relative">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
                          initial={{ width: '15%' }}
                          animate={{ width: item.status === 'downloading' ? '75%' : '35%' }}
                          transition={{ duration: 1.5, repeat: Infinity, repeatType: 'reverse' }}
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Empty State when queue is 0 */}
      {items.length === 0 && (
        <div className="glass-card p-10 text-center rounded-2xl border border-white/10 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">Queue is currently empty</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Paste video or music links into the box above to build your download batch. All supported platforms are automatically recognized.
          </p>
        </div>
      )}

    </div>
  );
};

export default BulkDownloader;
