/**
 * Video Downloader Component
 * 
 * Main video download interface with URL input, preview, and quality selection.
 * Features auto-detect on paste, glassmorphism design, and smooth animations.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link2, 
  X, 
  Download, 
  Play, 
  User,
  Check,
  Loader2,
  ExternalLink,
  Video as VideoIcon,
  ChevronDown
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import type { VideoQuality } from '../types';

const VideoDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isQualityDropdownOpen, setIsQualityDropdownOpen] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
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

  // Handle paste event for auto-detect
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && (pastedText.includes('http') || pastedText.includes('www'))) {
      setUrl(pastedText);
      
      const info = await getMediaInfo(pastedText);
      if (info) {
        setCurrentPreview(info);
        showSuccess('Video detected! Select a quality to download.');
      }
    }
  }, [getMediaInfo, setCurrentPreview, showSuccess]);

  const handleFetch = async () => {
    if (!url.trim()) {
      showError('Please enter a video URL');
      return;
    }

    const info = await getMediaInfo(url);
    if (info) {
      setCurrentPreview(info);
    }
  };

  const handleClear = () => {
    setUrl('');
    setCurrentPreview(null);
    setSelectedQuality(null);
    setIsPlayingPreview(false);
    setIsVideoLoading(false);
    setIsQualityDropdownOpen(false);
    inputRef.current?.focus();
  };

  const handleQualitySelect = (quality: VideoQuality) => {
    setSelectedQuality(quality);
    setIsQualityDropdownOpen(false);
  };

  const handlePlayPreview = () => {
    setIsPlayingPreview(true);
    setIsVideoLoading(true);
  };

  const handleDownload = async () => {
    if (!currentPreview || !selectedQuality) {
      showError('Please select a quality first');
      return;
    }

    setIsDownloading(true);
    
    try {
      // Clean title for filename
      const safeTitle = currentPreview.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeTitle}.mp4`;
      
      await downloadWithProgress(currentPreview.url, selectedQuality.quality, filename);
      
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
          className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20"
        >
          <VideoIcon className="w-10 h-10 text-white" />
        </motion.div>
        <h2 className="text-4xl font-bold gradient-text">Video Downloader</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Download high-quality videos from TikTok, Instagram, YouTube, and more without watermarks.
        </p>
      </div>

      {/* Input Section */}
      <div className="glass-card p-2 md:p-3 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-muted-foreground group-focus-within:text-blue-500 transition-colors z-10">
            <Link2 className="w-5 h-5" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={handlePaste}
            placeholder="Paste video link here..."
            className="w-full glass-input pl-12 pr-12 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all rounded-xl"
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
          disabled={!url.trim() || isLoadingPreview}
          className="px-8 py-4 glass-button bg-blue-600 text-white font-bold flex items-center justify-center gap-2 min-w-[140px] shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingPreview ? (
            <Loader2 className="w-5 h-5 animate-spin" />
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
        {currentPreview && !isLoadingPreview && (
          <motion.div
            ref={previewRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Video Info Card */}
            <div className="glass-card p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Playable Video Preview */}
                <div className="relative w-full md:w-80 flex-shrink-0">
                  <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-inner flex items-center justify-center">
                    {isPlayingPreview && (currentPreview as any).streamUrl ? (
                      <>
                        {isVideoLoading && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10 backdrop-blur-sm">
                            <Loader2 className="w-10 h-10 text-primary animate-spin mb-2" />
                            <p className="text-xs text-white font-medium">Loading stream...</p>
                          </div>
                        )}
                        <video 
                          ref={videoRef}
                          src={(currentPreview as any).streamUrl} 
                          controls 
                          autoPlay 
                          playsInline
                          crossOrigin="anonymous"
                          onCanPlay={() => setIsVideoLoading(false)}
                          className="w-full h-full object-contain"
                        />
                      </>
                    ) : (
                      <>
                        <img
                          src={currentPreview.thumbnail}
                          alt={currentPreview.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group">
                          <motion.button 
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={handlePlayPreview}
                            className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center hover:bg-white/40 transition-colors shadow-lg"
                          >
                            <Play className="w-8 h-8 text-white fill-current ml-1" />
                          </motion.button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 text-xs font-medium text-white backdrop-blur-sm">
                    {currentPreview.duration}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 space-y-4">
                  <h3 className="text-xl font-semibold leading-tight text-foreground line-clamp-2">
                    {currentPreview.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-muted-foreground">
                      <User className="w-4 h-4" />
                      <span>{currentPreview.author}</span>
                    </div>
                    <a 
                      href={currentPreview.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary hover:bg-primary/20 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>View on {currentPreview.platform}</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Quality Selection Dropdown */}
            <div className="glass-card p-6">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Choose Quality</h4>
              
              <div className="space-y-4">
                <button
                  disabled={isDownloading}
                  onClick={() => setIsQualityDropdownOpen(!isQualityDropdownOpen)}
                  className={`
                    w-full p-4 rounded-xl border flex items-center justify-between transition-all duration-300
                    ${isQualityDropdownOpen ? 'bg-white/10 border-primary/50 ring-2 ring-primary/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}
                    ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <div className="flex items-center gap-3">
                    {selectedQuality ? (
                      <>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedQuality.quality === 'No Watermark' ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/20 text-primary'}`}>
                          {selectedQuality.quality === 'No Watermark' ? <Zap className="w-4 h-4 fill-current" /> : <Download className="w-4 h-4" />}
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-sm">{selectedQuality.quality}</p>
                          <p className="text-xs text-muted-foreground">{selectedQuality.size} • {selectedQuality.format}</p>
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Select a quality to download...</span>
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
                          const isNoWatermark = quality.quality === 'No Watermark';
                          const isSelected = selectedQuality?.quality === quality.quality;
                          
                          return (
                            <button
                              key={quality.quality}
                              onClick={() => handleQualitySelect(quality as VideoQuality)}
                              className={`
                                w-full p-3 rounded-lg flex items-center justify-between transition-all group
                                ${isSelected ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/5 border border-transparent'}
                              `}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isNoWatermark ? 'bg-blue-500/20 text-blue-400 shadow-lg shadow-blue-500/10' : 'bg-white/10 text-muted-foreground'}`}>
                                  {isNoWatermark ? <Zap className="w-4 h-4 fill-current" /> : <VideoIcon className="w-4 h-4" />}
                                </div>
                                <div className="text-left">
                                  <div className="flex items-center gap-2">
                                    <span className={`font-semibold text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                      {quality.quality}
                                    </span>
                                    {isNoWatermark && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/20 uppercase tracking-tighter">
                                        Premium
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{quality.size} • {quality.format}</p>
                                </div>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-primary" />}
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
                  className="glass-card p-6 border-primary/20 bg-primary/5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground">
                          {currentDownloadProgress < 100 ? 'Downloading...' : 'Finalizing...'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          High-speed multi-threaded stream
                        </p>
                      </div>
                    </div>
                    <span className="text-xl font-black text-primary">
                      {currentDownloadProgress}%
                    </span>
                  </div>
                  
                  {/* Progress Bar Container */}
                  <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${currentDownloadProgress}%` }}
                      transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                      className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-[0_0_15px_rgba(139,92,246,0.5)]"
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
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-purple-500/20' 
                    : 'bg-white/5 text-muted-foreground cursor-not-allowed border border-white/5'}
                `}
              >
                <Download className="w-5 h-5" />
                <span className="font-semibold text-lg">
                  Download {selectedQuality?.quality || ''}
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
            <VideoIcon className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Ready to Download</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Paste a video link above and we'll fetch all available qualities for you to choose from.
          </p>
        </motion.div>
      )}
    </div>
  );
};

// Internal icon component for the premium Zap
const Zap: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M4 14.71 14 3l-3 8.29H20L10 21l3-8.29H4Z"/>
  </svg>
);

export default VideoDownloader;
