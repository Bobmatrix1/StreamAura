/**
 * Video Downloader Component
 * Comprehensive support for TikTok (No Watermark), Instagram (Reels/Posts), Facebook (Watch/Reels), YouTube & Twitter
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link2, 
  X, 
  User, 
  Loader2, 
  ExternalLink, 
  Video as VideoIcon, 
  Square, 
  AlertCircle,
  ClipboardPaste,
  Zap,
  Music2,
  CheckCircle2,
  Download,
  RotateCcw
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { logMediaInteraction } from '../lib/firebase';
import { detectPlatform } from '../api/mediaApi';
import type { VideoQuality } from '../types';

// Real Official Social Media Logos
const YouTubeLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.377.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000" />
    <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FFFFFF" />
  </svg>
);

const TikTokLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="#010101" />
    <path d="M16.5 6.8c-.8 0-1.6-.4-2-.9-.2-.3-.3-.7-.4-1.2h-2.1v10.4c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9 1.3-2.9 2.9-2.9c.3 0 .6.05.9.15v-2.3c-.3-.05-.6-.08-.9-.08-2.8 0-5.1 2.3-5.1 5.1s2.3 5.1 5.1 5.1 5.1-2.3 5.1-5.1v-5.2c1 .7 2.2 1.1 3.4 1.1V8c-.4 0-.8-.4-1.2-1.2z" fill="#25F4EE" />
    <path d="M16.8 6.5c-.8 0-1.6-.4-2-.9-.2-.3-.3-.7-.4-1.2h-1.8v10.4c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9 1.3-2.9 2.9-2.9c.3 0 .6.05.9.15v-2.3c-.3-.05-.6-.08-.9-.08-2.8 0-5.1 2.3-5.1 5.1s2.3 5.1 5.1 5.1 5.1-2.3 5.1-5.1v-5.2c1 .7 2.2 1.1 3.4 1.1V7.7c-.4 0-.8-.4-1.2-1.2z" fill="#FE2C55" />
    <path d="M16.65 6.65c-.8 0-1.6-.4-2-.9-.2-.3-.3-.7-.4-1.2h-1.95v10.4c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9 1.3-2.9 2.9-2.9c.3 0 .6.05.9.15v-2.3c-.3-.05-.6-.08-.9-.08-2.8 0-5.1 2.3-5.1 5.1s2.3 5.1 5.1 5.1 5.1-2.3 5.1-5.1v-5.2c1 .7 2.2 1.1 3.4 1.1V7.85c-.4 0-.8-.4-1.2-1.2z" fill="#FFFFFF" />
  </svg>
);

const InstagramLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ig-grad-real" x1="100%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="#833ab4" />
        <stop offset="50%" stopColor="#fd1d1d" />
        <stop offset="100%" stopColor="#fcb045" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill="url(#ig-grad-real)" />
    <rect x="5.5" y="5.5" width="13" height="13" rx="3.5" stroke="#FFFFFF" strokeWidth="1.6" fill="none" />
    <circle cx="12" cy="12" r="3.2" stroke="#FFFFFF" strokeWidth="1.6" fill="none" />
    <circle cx="15.8" cy="8.2" r="0.9" fill="#FFFFFF" />
  </svg>
);

const FacebookLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="12" fill="#1877F2" />
    <path d="M13.5 12h2.2l.35-2.6H13.5V7.7c0-.75.21-1.27 1.3-1.27h1.4V4.1c-.24-.03-1.07-.1-2.04-.1-2.02 0-3.4 1.23-3.4 3.5V9.4H8.5V12h2.26v6.9a12.05 12.05 0 0 0 2.74 0V12z" fill="#FFFFFF" />
  </svg>
);

const TwitterXLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="#000000" />
    <path d="M17.2 5.5h2.15l-4.7 5.37L20.2 18.5h-4.34l-3.4-4.44-3.89 4.44H6.42l5.03-5.75L6.05 5.5h4.45l3.07 4.06zm-.76 11.71h1.19L9.61 6.74H8.33z" fill="#FFFFFF" />
  </svg>
);

interface SupportedPlatform {
  id: string;
  name: string;
  badge: string;
  accent: string;
  description: string;
  icon: React.ReactNode;
}

const SUPPORTED_PLATFORMS: SupportedPlatform[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    badge: '4K, 1080p & MP3',
    accent: 'text-red-500',
    description: '4K Ultra-HD, 1080p, Shorts & MP3 audio',
    icon: <YouTubeLogo className="w-6 h-6" />
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    badge: 'No Watermark',
    accent: 'text-cyan-400',
    description: 'HD Video without watermark + MP3 audio',
    icon: <TikTokLogo className="w-6 h-6" />
  },
  {
    id: 'instagram',
    name: 'Instagram',
    badge: 'Reels, Posts & Stories',
    accent: 'text-pink-400',
    description: '1080p Reels, Videos, Stories & Posts',
    icon: <InstagramLogo className="w-6 h-6" />
  },
  {
    id: 'facebook',
    name: 'Facebook',
    badge: 'Watch, Reels & Stories',
    accent: 'text-blue-400',
    description: 'HD & SD Watch videos, public reels & stories',
    icon: <FacebookLogo className="w-6 h-6" />
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    badge: 'HD Video',
    accent: 'text-sky-400',
    description: 'High bitrate video clips & media',
    icon: <TwitterXLogo className="w-6 h-6" />
  }
];

const VideoDownloader: React.FC = () => {
  const { user, requireAuth } = useAuth();
  const [url, setUrl] = useState('');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality | null>(null);
  const [isDownloadingLocal, setIsDownloadingLocal] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  
  const { 
    getMediaInfo, 
    currentPreview, 
    setCurrentPreview, 
    isLoadingPreview, 
    downloadWithProgress,
    currentDownloadProgress,
    cancelDownload,
    activeDownloads
  } = useDownload();
  const { showSuccess, showError } = useToast();

  const isDownloading = activeDownloads > 0 || isDownloadingLocal;
  const detectedPlatform = detectPlatform(url);

  // Auto select best quality when preview changes
  useEffect(() => {
    if (currentPreview && currentPreview.qualities && currentPreview.qualities.length > 0) {
      setImageError(false);
      setSelectedQuality(currentPreview.qualities[0] as VideoQuality);
    } else {
      setSelectedQuality(null);
    }
  }, [currentPreview]);

  // Scroll to preview when it appears
  useEffect(() => {
    if (currentPreview && !isLoadingPreview) {
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }, [currentPreview, isLoadingPreview]);

  // Clean up preview on unmount so navigating away starts fresh
  useEffect(() => {
    return () => {
      setCurrentPreview(null);
    };
  }, [setCurrentPreview]);

  const activeUrlRef = useRef<string>('');

  // Handle paste event for auto-detect
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text').trim();
    if (pastedText && (pastedText.includes('http://') || pastedText.includes('https://') || pastedText.includes('www.'))) {
      setUrl(pastedText);
      activeUrlRef.current = pastedText;
      const info = await getMediaInfo(pastedText);
      if (info && activeUrlRef.current === pastedText) {
        setCurrentPreview(info);
        showSuccess('Video detected successfully!');
      }
    }
  }, [getMediaInfo, setCurrentPreview, showSuccess]);

  // One-click clipboard paste button
  const handleClipboardPaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = (await navigator.clipboard.readText()).trim();
        if (text && (text.includes('http://') || text.includes('https://') || text.includes('www.'))) {
          setUrl(text);
          activeUrlRef.current = text;
          const info = await getMediaInfo(text);
          if (info && activeUrlRef.current === text) {
            setCurrentPreview(info);
            showSuccess('Link pasted and video detected!');
          }
        } else {
          showError('No valid video URL found on clipboard');
        }
      } else {
        showError('Clipboard access is not permitted in this browser');
      }
    } catch (err) {
      showError('Unable to access clipboard. Please paste manually into the input box.');
    }
  };

  const handleFetch = async () => {
    requireAuth(async () => {
      const targetUrl = url.trim();
      if (!targetUrl) {
        showError('Please paste a video URL first');
        return;
      }
      activeUrlRef.current = targetUrl;
      const info = await getMediaInfo(targetUrl);
      if (info && activeUrlRef.current === targetUrl) {
        setCurrentPreview(info);
      }
    });
  };

  const handleClear = () => {
    activeUrlRef.current = '';
    cancelDownload();
    setUrl('');
    setCurrentPreview(null);
    setSelectedQuality(null);
    setIsDownloadingLocal(false);
    setImageError(false);
    inputRef.current?.focus();
  };

  const handleQualitySelect = (quality: VideoQuality) => {
    setSelectedQuality(quality);
  };

  const handleDownload = async (targetQuality?: VideoQuality) => {
    requireAuth(async () => {
      const q = targetQuality || selectedQuality;
      if (!currentPreview || !q) {
        showError('Please select a video quality first');
        return;
      }
      setIsDownloadingLocal(true);
      try {
        const isAudio = q.format.toLowerCase() === 'mp3' || q.resolution === 'Audio';
        const ext = isAudio ? 'mp3' : 'mp4';
        const cleanTitle = (currentPreview.title || 'video')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 50)
          .replace(/_+/g, '_');
        const filename = `${cleanTitle}.${ext}`;
        
        // Pass specific quality URL or fallback to main preview URL
        const downloadTarget = q.url || currentPreview.url;

        await downloadWithProgress(downloadTarget, q.quality, filename, undefined, {
          id: currentPreview.id,
          title: currentPreview.title,
          thumbnail: currentPreview.thumbnail,
          mediaType: isAudio ? 'music' : 'video',
          platform: currentPreview.platform
        });
        
        // Log Interaction
        logMediaInteraction(
          { id: currentPreview.id, title: currentPreview.title, mediaType: isAudio ? 'music' : 'video', platform: currentPreview.platform },
          'download',
          user?.uid
        );

        setIsDownloadingLocal(false);
      } catch (error) {
        setIsDownloadingLocal(false);
      }
    });
  };

  const handleCancel = () => {
    activeUrlRef.current = '';
    cancelDownload();
    setIsDownloadingLocal(false);
  };

  // Find audio format if available
  const audioFormat = currentPreview?.qualities?.find(q => 
    q.format.toUpperCase() === 'MP3' || (q as any).resolution === 'Audio' || q.quality.toLowerCase().includes('audio')
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32 scroll-smooth">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25"
        >
          <VideoIcon className="w-10 h-10 text-white" />
        </motion.div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
            <Zap className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
            <span>Fast Social Video Downloader</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            YouTube, TikTok, Instagram & Facebook <span className="gradient-text">Downloader</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto px-4">
            Download high-definition videos from <strong className="text-foreground">YouTube</strong> (4K, 1080p & Shorts), <strong className="text-foreground">TikTok</strong> (No Watermark), <strong className="text-foreground">Instagram</strong> (Reels, Posts & Stories), <strong className="text-foreground">Facebook</strong> (Watch, Reels & Stories), and <strong className="text-foreground">X / Twitter</strong> with zero quality loss.
          </p>
        </div>
      </div>

      {/* Supported Platforms Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {SUPPORTED_PLATFORMS.map((platform) => {
          const isDetected = detectedPlatform === platform.id;
          return (
            <motion.div
              key={platform.id}
              whileHover={{ y: -2 }}
              className={`p-3.5 rounded-2xl border transition-all duration-300 flex flex-col items-center text-center gap-2 glass-card ${
                isDetected 
                  ? 'ring-2 ring-blue-500/80 bg-blue-500/10 border-blue-500/40 shadow-lg shadow-blue-500/15' 
                  : 'hover:border-border/80'
              }`}
            >
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-foreground/5 p-1.5 shadow-sm">
                {platform.icon}
              </div>
              <div className="font-bold text-xs sm:text-sm text-foreground">{platform.name}</div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground border border-border/40">
                {platform.badge}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Input Section */}
      <div className="glass-card p-3 sm:p-4 rounded-2xl shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 group">
            <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-blue-500" />
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={handlePaste}
              placeholder="Paste YouTube, TikTok, Instagram, Facebook, or Twitter link..."
              className="w-full glass-input pl-12 pr-20 py-4 rounded-xl outline-none text-foreground placeholder:text-muted-foreground text-sm sm:text-base font-medium transition-all"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {url || currentPreview ? (
                <button 
                  onClick={handleClear} 
                  title="Clear input and dismiss fetched video"
                  className="px-2.5 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 border border-border/40 text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClipboardPaste}
                  title="Paste from clipboard"
                  className="px-2.5 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 border border-border/40 text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-all"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Paste</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleFetch}
              disabled={!url.trim() || isLoadingPreview || isDownloading}
              className="flex-1 md:flex-initial px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 min-w-[130px] shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoadingPreview ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Fetch Video</span>
                </>
              )}
            </button>

            {(isLoadingPreview || isDownloading) && (
              <button 
                onClick={handleCancel} 
                title="Cancel download"
                className="px-4 py-4 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 border border-red-500/30 transition-all flex items-center justify-center"
              >
                <Square size={18} fill="currentColor" />
              </button>
            )}
          </div>
        </div>

        {/* Live Detected Platform Pill */}
        {detectedPlatform !== 'unknown' && url.trim() && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-500 dark:text-blue-400 w-fit animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Detected: {detectedPlatform.charAt(0).toUpperCase() + detectedPlatform.slice(1)} Link</span>
          </div>
        )}
      </div>

      {/* Preview Section */}
      <AnimatePresence>
        {currentPreview && currentPreview.mediaType === 'video' && !isLoadingPreview && (
          <motion.div
            ref={previewRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="glass-card p-5 sm:p-6 rounded-2xl shadow-xl border border-border/60">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Video Thumbnail */}
                <div className="relative w-full md:w-80 flex-shrink-0">
                  <div className="aspect-video rounded-xl overflow-hidden bg-black/90 shadow-inner flex items-center justify-center border border-border/40 relative group">
                    {currentPreview.thumbnail && !imageError ? (
                      <img
                        src={currentPreview.thumbnail}
                        alt={currentPreview.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={() => setImageError(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground gap-2">
                        <VideoIcon className="w-10 h-10 opacity-40 text-blue-400" />
                        <span className="text-xs font-bold uppercase tracking-wider">{currentPreview.platform} Video</span>
                      </div>
                    )}
                  </div>
                  {currentPreview.duration && (
                    <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-md bg-black/80 text-[11px] font-extrabold text-white backdrop-blur-md uppercase tracking-tight border border-white/10">
                      {currentPreview.duration}
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div className="flex-1 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h3 className="text-lg sm:text-xl font-bold text-foreground line-clamp-2 leading-snug">
                      {currentPreview.title}
                    </h3>
                    
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {currentPreview.author && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5 border border-border/40 text-xs font-semibold text-muted-foreground">
                            <User className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[150px]">{currentPreview.author}</span>
                          </div>
                        )}
                        
                        <a 
                          href={currentPreview.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-500 dark:text-blue-400 hover:bg-blue-500/20 transition-all uppercase tracking-wider"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{currentPreview.platform}</span>
                        </a>
                      </div>

                      <button
                        onClick={handleClear}
                        title="Dismiss video and start fresh"
                        className="px-3 py-1.5 rounded-xl bg-foreground/5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 border border-border/40 hover:border-red-500/30 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Clear & Reset</span>
                      </button>
                    </div>
                  </div>

                  {/* Format Pills preview */}
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="font-semibold">{currentPreview.qualities?.length || 0} Download Options Ready</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quality Selection & Download Card */}
            <div className="glass-card p-5 sm:p-6 rounded-2xl shadow-xl space-y-5 border border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Available Formats & Resolutions
                </span>
                {selectedQuality && (
                  <span className="text-xs font-bold text-blue-500 dark:text-blue-400">
                    Selected: {selectedQuality.quality} ({selectedQuality.size})
                  </span>
                )}
              </div>

              {/* Qualities Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {currentPreview.qualities.map((q, idx) => {
                  const isSelected = selectedQuality 
                    ? (selectedQuality.url === q.url && selectedQuality.quality === q.quality)
                    : idx === 0;
                  const isAudio = q.format.toUpperCase() === 'MP3' || (q as any).resolution === 'Audio';
                  return (
                    <button
                      key={`${q.url || 'fmt'}-${q.quality || ''}-${idx}`}
                      onClick={() => handleQualitySelect(q as VideoQuality)}
                      className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-blue-500/15 border-blue-500 text-foreground ring-1 ring-blue-500'
                          : 'bg-foreground/5 border-border/40 hover:bg-foreground/10 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        {isAudio ? (
                          <Music2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                        ) : (
                          <VideoIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        )}
                        <div className="truncate">
                          <div className="text-xs font-bold text-foreground truncate">{q.quality}</div>
                          <div className="text-[10px] text-muted-foreground">{q.format} • {(q as any).resolution || (q as any).bitrate || 'Standard'}</div>
                        </div>
                      </div>
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-foreground/10 flex-shrink-0 text-foreground">
                        {q.size}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button 
                  onClick={() => handleDownload()} 
                  disabled={!selectedQuality || isDownloading}
                  className="flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black uppercase tracking-widest py-4 px-6 rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-3 transition-all"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Downloading ({currentDownloadProgress}%)</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      <span>Download {selectedQuality ? selectedQuality.quality : 'Video'}</span>
                    </>
                  )}
                </button>

                {/* Quick MP3 Audio Download if available */}
                {audioFormat && selectedQuality?.url !== audioFormat.url && (
                  <button
                    onClick={() => handleDownload(audioFormat as VideoQuality)}
                    disabled={isDownloading}
                    className="px-5 py-4 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-500 dark:text-purple-400 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                  >
                    <Music2 className="w-4 h-4" />
                    <span>Download MP3</span>
                  </button>
                )}

                {isDownloading && (
                  <button 
                    onClick={handleCancel} 
                    className="py-4 px-5 rounded-xl bg-red-500/10 text-red-500 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20 text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <Square size={12} fill="currentColor" /> Cancel
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State / Feature Highlights */}
      {!currentPreview && !isLoadingPreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12 px-4 space-y-6"
        >
          <div className="w-20 h-20 mx-auto rounded-3xl bg-foreground/5 flex items-center justify-center border border-border/40 shadow-inner">
            <VideoIcon className="w-10 h-10 text-muted-foreground opacity-40" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="text-xl font-bold text-foreground">How to Download</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Copy any video or audio link from <strong className="text-foreground">YouTube</strong>, <strong className="text-foreground">TikTok</strong>, <strong className="text-foreground">Instagram</strong>, <strong className="text-foreground">Facebook</strong>, or <strong className="text-foreground">Twitter</strong> and paste it above to download in full HD/4K without watermarks.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
            <div className="p-3.5 rounded-xl bg-foreground/5 border border-border/40 space-y-1">
              <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                <span>1. Copy Link</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Share/copy the link of your favorite reel, video, or post.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-foreground/5 border border-border/40 space-y-1">
              <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>2. Paste & Detect</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Hit Paste and we automatically extract all available qualities.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-foreground/5 border border-border/40 space-y-1">
              <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />
                <span>3. Download HD / MP3</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Select resolution or audio and save directly to your device.</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Info Notice */}
      <div className="p-4 rounded-2xl bg-foreground/5 border border-border/40 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">High-Speed Cloud Engine:</strong> All YouTube, TikTok, Instagram Reels, and Facebook downloads are processed with dedicated high-speed extraction engines to ensure lightning speed and watermarks are stripped automatically.
        </p>
      </div>
    </div>
  );
};

export default VideoDownloader;

