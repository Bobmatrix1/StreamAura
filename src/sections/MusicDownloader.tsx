/**
 * Music Downloader Component
 * 
 * Main music download interface with URL input, preview, and audio quality selection.
 * Features album art display, audio preview, and glassmorphism design.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link2, 
  X, 
  Download, 
  Play, 
  Pause,
  User,
  Music,
  Disc,
  Check,
  Loader2,
  Volume2,
  ChevronDown,
  ExternalLink
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import type { AudioQuality } from '@/types';

const MusicDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
  const [selectedQuality, setSelectedQuality] = useState<AudioQuality | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [isQualityDropdownOpen, setIsQualityDropdownOpen] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const { 
    getMediaInfo, 
    currentPreview, 
    setCurrentPreview, 
    isLoadingPreview, 
    downloadWithProgress,
    currentDownloadProgress 
  } = useDownload();
  const { showSuccess, showError } = useToast();

  // Scroll to preview when it appears
  useEffect(() => {
    if (currentPreview && !isLoadingPreview) {
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [currentPreview, isLoadingPreview]);

  // Sync progress bar with actual audio playback
  useEffect(() => {
    if (isPlaying && audioRef.current) {
      previewIntervalRef.current = setInterval(() => {
        if (audioRef.current) {
          const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
          setPreviewProgress(isNaN(progress) ? 0 : progress);
        }
      }, 100);
    } else {
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    }
    return () => {
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    };
  }, [isPlaying]);

  // Handle paste event for auto-detect
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && (pastedText.includes('http') || pastedText.includes('www'))) {
      setUrl(pastedText);
      
      const isMusicLink = ['spotify', 'soundcloud', 'audiomack', 'apple'].some(d => pastedText.toLowerCase().includes(d));
      if (isMusicLink) {
        setIsMatching(true);
      }

      const info = await getMediaInfo(pastedText);
      setIsMatching(false);
      
      if (info) {
        setCurrentPreview(info);
        showSuccess(isMusicLink ? 'Song matched successfully!' : 'Music track detected!');
      }
    }
  }, [getMediaInfo, setCurrentPreview, showSuccess]);

  const handleFetch = async () => {
    if (!url.trim()) {
      showError('Please enter a music URL');
      return;
    }

    const isMusicLink = ['spotify', 'soundcloud', 'audiomack', 'apple'].some(d => url.toLowerCase().includes(d));
    if (isMusicLink) {
      setIsMatching(true);
    }

    const info = await getMediaInfo(url);
    setIsMatching(false);
    
    if (info) {
      setCurrentPreview(info);
    }
  };

  const handleClear = () => {
    setUrl('');
    setCurrentPreview(null);
    setSelectedQuality(null);
    setIsPlaying(false);
    setIsMatching(false);
    setIsAudioLoading(false);
    setPreviewProgress(0);
    setIsQualityDropdownOpen(false);
    inputRef.current?.focus();
  };

  const handleQualitySelect = (quality: AudioQuality) => {
    setSelectedQuality(quality);
    setIsQualityDropdownOpen(false);
  };

  const togglePreview = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsAudioLoading(true);
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => showError('Failed to play preview stream.'));
    }
  };

  const handleDownload = async () => {
    if (!currentPreview || !selectedQuality) {
      showError('Please select a quality first');
      return;
    }

    setIsDownloading(true);
    
    try {
      const safeTitle = currentPreview.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeTitle}.mp3`;
      
      const downloadUrl = (currentPreview as any).matchUrl || currentPreview.url;
      await downloadWithProgress(downloadUrl, selectedQuality.quality, filename);
      
      setIsDownloading(false);
      handleClear();
    } catch (error) {
      setIsDownloading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32 scroll-smooth">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-lg shadow-orange-500/20"
        >
          <Music className="w-10 h-10 text-white" />
        </motion.div>
        <h2 className="text-4xl font-bold gradient-text">Music Downloader</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Download tracks from YouTube, SoundCloud, Spotify, and more.
        </p>
      </div>

      {/* Input Section */}
      <div className="glass-card p-2 md:p-3 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-muted-foreground group-focus-within:text-orange-500 transition-colors z-10">
            <Link2 className="w-5 h-5" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={handlePaste}
            placeholder="Paste Spotify or music link here..."
            className="w-full glass-input pl-12 pr-12 py-4 text-base focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all rounded-xl"
          />
          {url && (
            <button
              onClick={handleClear}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleFetch}
          disabled={!url.trim() || isLoadingPreview || isMatching}
          className="px-8 py-4 glass-button bg-orange-600 text-white font-bold flex items-center justify-center gap-2 min-w-[140px] shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingPreview || isMatching ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              {isMatching && <span className="text-xs">Matching...</span>}
            </div>
          ) : (
            <>
              <span>Fetch</span>
              <Download className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>

      {/* Preview Section */}
      <AnimatePresence>
        {currentPreview && currentPreview.mediaType === 'music' && !isLoadingPreview && (
          <motion.div
            ref={previewRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Music Info Card */}
            <div className="glass-card p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Album Art */}
                <div className="relative w-full md:w-40 flex-shrink-0 mx-auto md:mx-0">
                  <div className="aspect-square rounded-xl overflow-hidden bg-black/50 shadow-2xl">
                    {currentPreview.thumbnail ? (
                      <img
                        src={currentPreview.thumbnail}
                        alt={currentPreview.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-white/5">
                        <Music className="w-12 h-12 text-muted-foreground opacity-20" />
                      </div>
                    )}
                  </div>
                  
                  {/* Real Audio Player (Hidden) */}
                  <audio 
                    ref={audioRef}
                    src={(currentPreview as any).streamUrl || null}
                    preload="auto"
                    onPlaying={() => setIsAudioLoading(false)}
                    onWaiting={() => setIsAudioLoading(true)}
                    onCanPlay={() => {
                      setIsAudioLoading(false);
                    }}
                    onEnded={() => setIsPlaying(false)}
                    crossOrigin="anonymous"
                  />

                  {/* Play Button Overlay */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={togglePreview}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity rounded-xl"
                  >
                    <div className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center shadow-lg border border-white/20">
                      {isAudioLoading ? (
                        <Loader2 className="w-7 h-7 text-white animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="w-7 h-7 text-white" />
                      ) : (
                        <Play className="w-7 h-7 text-white fill-current ml-1" />
                      )}
                    </div>
                  </motion.button>
                </div>

                {/* Info */}
                <div className="flex-1 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold leading-tight line-clamp-2">
                      {currentPreview.title}
                    </h3>
                    {currentPreview.platform.includes('Spotify') && (
                      <div className="flex items-center gap-1.5 text-green-400 text-xs font-bold uppercase tracking-tight">
                        <Check className="w-3.5 h-3.5" />
                        Matched from Spotify
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-muted-foreground">
                      <User className="w-4 h-4" />
                      <span>{currentPreview.author || (currentPreview as any).artist || 'Unknown Artist'}</span>
                    </div>
                    <a 
                      href={currentPreview.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-sm text-orange-400 hover:bg-orange-500/20 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>View on {currentPreview.platform}</span>
                    </a>
                  </div>

                  {/* Audio Preview Bar */}
                  {(isPlaying || previewProgress > 0) && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Volume2 className="w-3 h-3" />
                          {isPlaying ? 'Playing Preview...' : 'Paused'}
                        </span>
                        <span>{currentPreview.duration}</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div
                          animate={{ width: `${previewProgress}%` }}
                          className="h-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quality Selection Dropdown */}
            <div className="glass-card p-6">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Choose Audio Quality</h4>
              
              <div className="space-y-4">
                <button
                  disabled={isDownloading}
                  onClick={() => setIsQualityDropdownOpen(!isQualityDropdownOpen)}
                  className={`
                    w-full p-4 rounded-xl border flex items-center justify-between transition-all duration-300
                    ${isQualityDropdownOpen ? 'bg-white/10 border-orange-500/50 ring-2 ring-orange-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}
                    ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <div className="flex items-center gap-3">
                    {selectedQuality ? (
                      <>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-500/20 text-orange-400">
                          <Download className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-sm">{selectedQuality.quality}</p>
                          <p className="text-xs text-muted-foreground">{selectedQuality.size} • {selectedQuality.format}</p>
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Select audio quality...</span>
                    )}
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${isQualityDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isQualityDropdownOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden glass-card border-white/5 bg-white/[0.02] rounded-xl"
                    >
                      <div className="p-2 space-y-1 max-h-80 overflow-y-auto">
                        {currentPreview.qualities.map((quality) => {
                          const isSelected = selectedQuality?.quality === quality.quality;
                          
                          return (
                            <button
                              key={quality.quality}
                              onClick={() => handleQualitySelect(quality as AudioQuality)}
                              className={`
                                w-full p-3 rounded-lg flex items-center justify-between transition-all group
                                ${isSelected ? 'bg-orange-500/20 border border-orange-500/30' : 'hover:bg-white/5 border border-transparent'}
                              `}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-orange-500/20 text-orange-400' : 'bg-white/10 text-muted-foreground'}`}>
                                  <Music className="w-4 h-4" />
                                </div>
                                <div className="text-left">
                                  <span className={`font-semibold text-sm ${isSelected ? 'text-orange-400' : 'text-foreground'}`}>
                                    {quality.quality}
                                  </span>
                                  <p className="text-xs text-muted-foreground">{(quality as any).resolution || ''} • {quality.size}</p>
                                </div>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-orange-400" />}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Progress Section */}
            <AnimatePresence>
              {isDownloading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-card p-6 border-orange-500/20 bg-orange-500/5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground">
                          {currentDownloadProgress < 100 ? 'Extracting Audio...' : 'Finalizing...'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          High-speed MP3 conversion
                        </p>
                      </div>
                    </div>
                    <span className="text-xl font-black text-orange-400">
                      {currentDownloadProgress}%
                    </span>
                  </div>
                  
                  <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${currentDownloadProgress}%` }}
                      transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                      className="h-full bg-gradient-to-r from-orange-500 via-pink-500 to-red-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Download Button */}
            {!isDownloading && (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleDownload}
                disabled={!selectedQuality || isDownloading}
                className={`
                  w-full py-4 rounded-2xl flex items-center justify-center gap-3 transition-all
                  ${selectedQuality 
                    ? 'bg-gradient-to-r from-orange-600 to-pink-600 text-white shadow-lg shadow-orange-500/20' 
                    : 'bg-white/5 text-muted-foreground cursor-not-allowed border border-white/5'}
                `}
              >
                <Download className="w-5 h-5" />
                <span className="font-semibold text-lg">
                  Download {selectedQuality?.quality || ''} MP3
                </span>
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!currentPreview && !isLoadingPreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-white/5 flex items-center justify-center border border-white/5">
            <Music className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Ready to Extract Audio</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Paste a link above and we'll extract the high-quality audio track for you.
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default MusicDownloader;
