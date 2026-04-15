/**
 * Video Downloader Component
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
  ChevronDown,
  Square,
  AlertCircle
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { logMediaInteraction } from '../lib/firebase';
import type { VideoQuality } from '../types';

const VideoDownloader: React.FC = () => {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality | null>(null);
  const [isDownloadingLocal, setIsDownloadingLocal] = useState(false);
  const [isQualityDropdownOpen, setIsQualityDropdownOpen] = useState(false);
  
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
        showSuccess('Video detected!');
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
    setIsQualityDropdownOpen(false);
    setIsDownloadingLocal(false);
    inputRef.current?.focus();
  };

  const handleQualitySelect = (quality: VideoQuality) => {
    setSelectedQuality(quality);
    setIsQualityDropdownOpen(false);
  };

  const handleDownload = async () => {
    if (!currentPreview || !selectedQuality) {
      showError('Please select a quality first');
      return;
    }
    setIsDownloadingLocal(true);
    try {
      const safeTitle = currentPreview.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeTitle}.mp4`;
      await downloadWithProgress(currentPreview.url, selectedQuality.quality, filename);
      
      // Log Interaction
      logMediaInteraction(
        { id: currentPreview.id, title: currentPreview.title, mediaType: 'video', platform: currentPreview.platform },
        'download',
        user?.uid
      );

      setIsDownloadingLocal(false);
      handleClear();
    } catch (error) {
      setIsDownloadingLocal(false);
    }
  };

  const handleCancel = () => {
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
          className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20"
        >
          <VideoIcon className="w-10 h-10 text-white" />
        </motion.div>
        <h2 className="text-4xl font-bold gradient-text">Video Downloader</h2>
        <p className="text-muted-foreground max-w-md mx-auto px-4">
          Download high-quality videos from TikTok, Instagram, YouTube, and more without watermarks.
        </p>
      </div>

      {/* Input Section */}
      <div className="glass-card p-3 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 group">
          <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={handlePaste}
            placeholder="Paste video link here..."
            className="w-full glass-input pl-12 pr-12 py-4 rounded-xl outline-none"
          />
          {url && <button onClick={handleClear} className="absolute right-4 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-muted-foreground" /></button>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleFetch}
            disabled={!url.trim() || isLoadingPreview || isDownloading}
            className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 min-w-[120px]"
          >
            {isLoadingPreview ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Fetch</span>}
          </button>
          {(isLoadingPreview || isDownloading) && (
            <button onClick={handleCancel} className="px-4 py-4 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-all">
              <Square size={20} fill="currentColor" />
            </button>
          )}
        </div>
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
            <div className="glass-card p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="relative w-full md:w-80 flex-shrink-0">
                  <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-inner flex items-center justify-center">
                    {currentPreview.thumbnail && (
                      <img
                        src={currentPreview.thumbnail}
                        alt={currentPreview.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 text-[10px] font-bold text-white backdrop-blur-sm uppercase tracking-tighter">
                    {currentPreview.duration}
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <h3 className="text-xl font-bold line-clamp-2">{currentPreview.title}</h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      <User className="w-4 h-4" />
                      <span>{currentPreview.author}</span>
                    </div>
                    <a 
                      href={currentPreview.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 hover:bg-blue-500/20 transition-all uppercase tracking-widest"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>{currentPreview.platform}</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-4">
                <button
                  disabled={isDownloading}
                  onClick={() => setIsQualityDropdownOpen(!isQualityDropdownOpen)}
                  className="w-full p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors"
                >
                  <span className="font-bold text-sm">{selectedQuality ? selectedQuality.quality : 'Select Resolution'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isQualityDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isQualityDropdownOpen && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {currentPreview.qualities.map((q) => (
                      <button key={q.url} onClick={() => { handleQualitySelect(q as VideoQuality); }} className="w-full p-3 text-left hover:bg-white/5 rounded-lg text-xs font-bold flex justify-between">
                        <span>{q.quality}</span>
                        <span className="opacity-50">{q.size}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={handleDownload} 
                  disabled={!selectedQuality || isDownloading}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg disabled:opacity-50"
                >
                  {isDownloading ? (
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{currentDownloadProgress}%</span>
                    </div>
                  ) : 'Start Download'}
                </button>
                {isDownloading && (
                  <button onClick={handleCancel} className="py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                    <Square size={10} fill="currentColor" /> Cancel Download
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!currentPreview && !isLoadingPreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-white/5 flex items-center justify-center border border-white/5">
            <VideoIcon className="w-12 h-12 text-muted-foreground opacity-30" />
          </div>
          <h3 className="text-xl font-bold mb-2">Ready to Download</h3>
          <p className="text-muted-foreground max-w-md mx-auto px-4">
            Paste a video link above and we'll fetch all available qualities for you to choose from.
          </p>
        </motion.div>
      )}

      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-relaxed font-bold uppercase tracking-tight">
          Note: If a direct link is blocked, we automatically find a high-quality mirror to ensure your download finishes.
        </p>
      </div>
    </div>
  );
};

export default VideoDownloader;
