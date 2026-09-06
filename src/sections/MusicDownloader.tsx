/**
 * Music Downloader Component
 * Comprehensive support for Spotify, YouTube Music, Apple Music, SoundCloud & Audiomack
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link2, 
  X, 
  User, 
  Loader2, 
  ExternalLink, 
  Music as MusicIcon, 
  Square, 
  AlertCircle,
  ClipboardPaste,
  Zap,
  Music2,
  CheckCircle2,
  Download,
  RotateCcw,
  Disc3,
  Volume2
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { logMediaInteraction } from '../lib/firebase';
import { detectPlatform } from '../api/mediaApi';
import type { AudioQuality } from '../types';

// Official Music Platform Vector Logos
const SpotifyLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="12" fill="#1ED760" />
    <path d="M17.485 17.065c-.217.355-.678.468-1.033.251-2.828-1.728-6.388-2.119-10.58-1.161-.406.092-.81-.161-.903-.567-.092-.406.162-.81.568-.903 4.595-1.05 8.528-.607 11.697 1.347.355.217.468.678.251 1.033zm1.388-3.085c-.273.443-.854.584-1.298.312-3.237-1.99-8.171-2.566-11.999-1.403-.5.152-1.028-.135-1.18-.635-.152-.5.135-1.028.635-1.18 4.382-1.33 9.816-.689 13.53 1.598.444.272.585.853.312 1.308zm.118-3.218C15.115 8.47 8.736 8.257 5.084 9.366c-.594.18-1.226-.156-1.406-.75-.18-.595.156-1.226.75-1.407 4.195-1.273 11.238-1.02 15.688 1.621.534.317.708 1.01.391 1.545-.317.534-1.01.708-1.546.388z" fill="#000000" />
  </svg>
);

const YouTubeMusicLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="12" fill="#FF0000" />
    <circle cx="12" cy="12" r="7.5" stroke="#FFFFFF" strokeWidth="1.8" />
    <path d="M10.2 8.4v7.2L15.6 12l-5.4-3.6z" fill="#FFFFFF" />
  </svg>
);

const AppleMusicLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="appleMusicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FA233B" />
        <stop offset="100%" stopColor="#FB5C74" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill="url(#appleMusicGrad)" />
    <path d="M16.5 6.2v8.5c0 1.6-1.2 2.8-2.7 2.8-1.5 0-2.8-1.2-2.8-2.8 0-1.5 1.3-2.8 2.8-2.8.4 0 .8.1 1.2.3V8.8l-5.5 1.2v6c0 1.6-1.2 2.8-2.7 2.8-1.5 0-2.8-1.2-2.8-2.8 0-1.5 1.3-2.8 2.8-2.8.4 0 .8.1 1.2.3v-8L16.5 6.2z" fill="#FFFFFF" />
  </svg>
);

const SoundCloudLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="#FF5500" />
    <path d="M6.5 14.5v-3.5m-2 2.5v-1.5m4 3v-5m2 5.5v-6.5m2 6.5v-7.2c.4-.2.9-.3 1.4-.3 1.8 0 3.3 1.4 3.4 3.2.7.2 1.2.8 1.2 1.6 0 .9-.8 1.7-1.7 1.7H6.5z" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const AudiomackLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="#FFA200" />
    <path d="M5.5 14.8l2.2-5.6 2.2 5.6M14.1 14.8l2.2-5.6 2.2 5.6M11.5 14.8V8.2" stroke="#000000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface SupportedMusicPlatform {
  id: string;
  name: string;
  badge: string;
  accent: string;
  description: string;
  icon: React.ReactNode;
}

const SUPPORTED_PLATFORMS: SupportedMusicPlatform[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    badge: '320kbps MP3',
    accent: 'text-emerald-400',
    description: 'Ultra HD 320kbps MP3 & Official Covers',
    icon: <SpotifyLogo className="w-6 h-6" />
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    badge: 'HQ & Lossless',
    accent: 'text-red-500',
    description: 'High Bitrate Audio, Tracks & Live Sessions',
    icon: <YouTubeMusicLogo className="w-6 h-6" />
  },
  {
    id: 'apple-music',
    name: 'Apple Music',
    badge: 'Ultra HD Audio',
    accent: 'text-pink-400',
    description: 'Studio Quality Audio & High-Res Artwork',
    icon: <AppleMusicLogo className="w-6 h-6" />
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    badge: 'HQ Stream',
    accent: 'text-orange-500',
    description: 'Direct Original MP3 & Remix Streams',
    icon: <SoundCloudLogo className="w-6 h-6" />
  },
  {
    id: 'audiomack',
    name: 'Audiomack',
    badge: 'Fast Audio',
    accent: 'text-amber-400',
    description: 'Direct Mixtape & High Quality Audio',
    icon: <AudiomackLogo className="w-6 h-6" />
  }
];

const MusicDownloader: React.FC = () => {
  const { user, requireAuth } = useAuth();
  const [url, setUrl] = useState('');
  const [selectedQuality, setSelectedQuality] = useState<AudioQuality | null>(null);
  const [isDownloadingLocal, setIsDownloadingLocal] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const activeUrlRef = useRef<string>('');
  
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
      setSelectedQuality(currentPreview.qualities[0] as unknown as AudioQuality);
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

  // Clean up preview on unmount
  useEffect(() => {
    return () => {
      setCurrentPreview(null);
    };
  }, [setCurrentPreview]);

  // Handle paste event for auto-detect
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text').trim();
    if (pastedText && (pastedText.includes('http://') || pastedText.includes('https://') || pastedText.includes('www.'))) {
      setUrl(pastedText);
      activeUrlRef.current = pastedText;
      const info = await getMediaInfo(pastedText);
      if (info && activeUrlRef.current === pastedText) {
        setCurrentPreview(info);
        showSuccess('Track detected successfully!');
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
            showSuccess('Link pasted and track detected!');
          }
        } else {
          showError('No valid music URL found on clipboard');
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
        showError('Please paste a music link first');
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

  const handleQualitySelect = (quality: AudioQuality) => {
    setSelectedQuality(quality);
  };

  const handleDownload = async (targetQuality?: AudioQuality) => {
    requireAuth(async () => {
      const q = targetQuality || selectedQuality;
      if (!currentPreview || !q) {
        showError('Please select an audio quality first');
        return;
      }
      setIsDownloadingLocal(true);
      try {
        const cleanTitle = (currentPreview.title || 'audio_track')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 50)
          .replace(/_+/g, '_');
        const filename = `${cleanTitle}.mp3`;
        const downloadTarget = q.url || currentPreview.url;

        await downloadWithProgress(downloadTarget, q.quality, filename, undefined, {
          id: currentPreview.id,
          title: currentPreview.title,
          thumbnail: currentPreview.thumbnail,
          mediaType: 'music',
          platform: currentPreview.platform
        });
        
        // Log Interaction
        logMediaInteraction(
          { id: currentPreview.id, title: currentPreview.title, mediaType: 'music', platform: currentPreview.platform },
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

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32 scroll-smooth">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 flex items-center justify-center shadow-lg shadow-orange-500/25"
        >
          <MusicIcon className="w-10 h-10 text-white" />
        </motion.div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs font-extrabold text-orange-600 dark:text-orange-400 uppercase tracking-widest">
            <Zap className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
            <span>Studio Quality Music Downloader</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            Spotify, YouTube & Apple Music <span className="gradient-text">Downloader</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto px-4">
            Download ultra-high bitrate MP3s (up to 320kbps) from <strong className="text-foreground">Spotify</strong>, <strong className="text-foreground">YouTube Music</strong>, <strong className="text-foreground">Apple Music</strong>, <strong className="text-foreground">SoundCloud</strong>, and <strong className="text-foreground">Audiomack</strong> with original album artwork.
          </p>
        </div>
      </div>

      {/* Supported Platforms Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3">
        {SUPPORTED_PLATFORMS.map((platform) => {
          const isDetected = detectedPlatform === platform.id || (platform.id === 'youtube-music' && detectedPlatform === 'youtube');
          return (
            <motion.div
              key={platform.id}
              whileHover={{ y: -2 }}
              className={`p-3.5 rounded-2xl border transition-all duration-300 flex flex-col items-center text-center gap-2 glass-card ${
                isDetected 
                  ? 'ring-2 ring-orange-500/80 bg-orange-500/10 border-orange-500/40 shadow-lg shadow-orange-500/15' 
                  : 'hover:border-border/80'
              }`}
            >
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-foreground/5 p-1.5 shadow-sm">
                {platform.icon}
              </div>
              <div className="font-bold text-xs sm:text-sm text-foreground truncate w-full">{platform.name}</div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground border border-border/40 whitespace-nowrap">
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
            <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-orange-500" />
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={handlePaste}
              placeholder="Paste Spotify, Apple Music, YouTube Music, or SoundCloud link..."
              className="w-full glass-input pl-12 pr-20 py-4 rounded-xl outline-none text-foreground placeholder:text-muted-foreground text-sm sm:text-base font-medium transition-all"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {url || currentPreview ? (
                <button 
                  onClick={handleClear} 
                  title="Clear input and dismiss fetched track"
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
              className="flex-1 md:flex-initial px-8 py-4 bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600 hover:from-orange-500 hover:to-rose-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 min-w-[130px] shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoadingPreview ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Fetch Music</span>
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs font-bold text-orange-500 dark:text-orange-400 w-fit animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Detected: {detectedPlatform.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())} Track</span>
          </div>
        )}
      </div>

      {/* Preview Section */}
      <AnimatePresence>
        {currentPreview && (currentPreview.mediaType === 'music' || currentPreview.mediaType === 'video') && !isLoadingPreview && (
          <motion.div
            ref={previewRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="glass-card p-5 sm:p-6 rounded-2xl shadow-xl border border-border/60">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Album Cover Art */}
                <div className="relative w-full md:w-52 flex-shrink-0 flex items-center justify-center">
                  <div className="aspect-square w-48 md:w-full rounded-2xl overflow-hidden bg-black/90 shadow-2xl flex items-center justify-center border border-border/40 relative group">
                    {currentPreview.thumbnail && !imageError ? (
                      <img
                        src={currentPreview.thumbnail}
                        alt={currentPreview.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={() => setImageError(true)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground gap-2">
                        <Disc3 className="w-12 h-12 opacity-40 text-orange-400 animate-spin-slow" />
                        <span className="text-xs font-bold uppercase tracking-wider">{currentPreview.platform} Track</span>
                      </div>
                    )}
                  </div>
                  {currentPreview.duration && (
                    <div className="absolute bottom-2 right-4 md:right-2 px-2.5 py-1 rounded-md bg-black/80 text-[11px] font-extrabold text-white backdrop-blur-md uppercase tracking-tight border border-white/10">
                      {currentPreview.duration}
                    </div>
                  )}
                </div>

                {/* Track Info */}
                <div className="flex-1 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-orange-500 uppercase tracking-wider">
                      <Volume2 className="w-4 h-4" />
                      <span>Audio Track Available</span>
                    </div>

                    <h3 className="text-xl sm:text-2xl font-black text-foreground line-clamp-2 leading-tight">
                      {currentPreview.title}
                    </h3>
                    
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {currentPreview.author && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5 border border-border/40 text-xs font-semibold text-muted-foreground">
                            <User className="w-3.5 h-3.5 text-orange-400" />
                            <span className="truncate max-w-[180px] font-medium text-foreground">{currentPreview.author}</span>
                          </div>
                        )}
                        
                        <a 
                          href={currentPreview.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-xs font-bold text-orange-500 dark:text-orange-400 hover:bg-orange-500/20 transition-all uppercase tracking-wider"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{currentPreview.platform}</span>
                        </a>
                      </div>

                      <button
                        onClick={handleClear}
                        title="Dismiss track and start fresh"
                        className="px-3 py-1.5 rounded-xl bg-foreground/5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 border border-border/40 hover:border-red-500/30 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Clear & Reset</span>
                      </button>
                    </div>
                  </div>

                  {/* Format Pills preview */}
                  <div className="text-xs text-muted-foreground flex items-center gap-2 pt-2 border-t border-border/40">
                    <Zap className="w-3.5 h-3.5 text-orange-400" />
                    <span className="font-semibold">{currentPreview.qualities?.length || 0} Bitrate & Audio Streams Ready</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quality Selection & Download Card */}
            <div className="glass-card p-5 sm:p-6 rounded-2xl shadow-xl space-y-5 border border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-orange-500" />
                  Select Audio Quality & Bitrate
                </span>
                {selectedQuality && (
                  <span className="text-xs font-bold text-orange-500 dark:text-orange-400">
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
                  return (
                    <button
                      key={`${q.url || 'fmt'}-${q.quality || ''}-${idx}`}
                      onClick={() => handleQualitySelect(q as unknown as AudioQuality)}
                      className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-orange-500/15 border-orange-500 text-foreground ring-1 ring-orange-500'
                          : 'bg-foreground/5 border-border/40 hover:bg-foreground/10 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <Music2 className="w-4 h-4 text-orange-400 flex-shrink-0" />
                        <div className="truncate">
                          <div className="text-xs font-bold text-foreground truncate">{q.quality}</div>
                          <div className="text-[10px] text-muted-foreground">{q.format || 'MP3'} • {(q as any).resolution || (q as any).bitrate || 'Audio'}</div>
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
                  className="flex-1 bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600 hover:from-orange-500 hover:to-rose-500 text-white font-black uppercase tracking-widest py-4 px-6 rounded-xl shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-3 transition-all"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Downloading MP3 ({currentDownloadProgress}%)</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download {selectedQuality ? selectedQuality.quality : 'MP3 Audio'}</span>
                    </>
                  )}
                </button>

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
            <MusicIcon className="w-10 h-10 text-muted-foreground opacity-40" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="text-xl font-bold text-foreground">How to Download Music</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Copy any track or song link from <strong className="text-foreground">Spotify</strong>, <strong className="text-foreground">YouTube Music</strong>, <strong className="text-foreground">Apple Music</strong>, <strong className="text-foreground">SoundCloud</strong>, or <strong className="text-foreground">Audiomack</strong> and paste it above to download high-fidelity 320kbps MP3s.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
            <div className="p-3.5 rounded-xl bg-foreground/5 border border-border/40 space-y-1">
              <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-orange-500" />
                <span>1. Copy Track Link</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Share/copy the link of your favorite song or album track.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-foreground/5 border border-border/40 space-y-1">
              <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-500" />
                <span>2. Paste & Extract</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Hit Paste to resolve metadata, album art and audio bitrates.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-foreground/5 border border-border/40 space-y-1">
              <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                <span>3. Download 320k MP3</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Select 320kbps, 256kbps or original audio and save directly.</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Info Notice */}
      <div className="p-4 rounded-2xl bg-foreground/5 border border-border/40 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">High-Speed Music Engine:</strong> Apple Music, Spotify, YouTube Music, SoundCloud, and Audiomack tracks are automatically matched with ultra-high bitrate audio streams and embedded metadata with full cover art.
        </p>
      </div>
    </div>
  );
};

export default MusicDownloader;
