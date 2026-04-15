/**
 * Music Downloader Component
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link2, 
  X, 
  User,
  Music,
  Loader2,
  ChevronDown,
  ExternalLink,
  Square,
  AlertCircle
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import type { AudioQuality } from '@/types';

const MusicDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
  const [selectedQuality, setSelectedQuality] = useState<AudioQuality | null>(null);
  const [isDownloadingLocal, setIsDownloadingLocal] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
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
  const { showSuccess } = useToast();

  const isDownloading = activeDownloads > 0 || isDownloadingLocal;

  useEffect(() => {
    if (currentPreview && !isLoadingPreview) {
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [currentPreview, isLoadingPreview]);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setIsMatching(true);
    try {
      const info = await getMediaInfo(url);
      if (info) {
        setCurrentPreview(info);
      }
    } finally {
      setIsMatching(false);
    }
  };

  const handleClear = () => {
    setUrl('');
    setCurrentPreview(null);
    setSelectedQuality(null);
    setIsMatching(false);
    setIsDownloadingLocal(false);
    inputRef.current?.focus();
  };

  const handleDownload = async () => {
    if (!currentPreview || !selectedQuality) return;
    setIsDownloadingLocal(true);
    try {
      const safeTitle = currentPreview.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      await downloadWithProgress(selectedQuality.url, selectedQuality.quality, `${safeTitle}.mp3`);
      showSuccess('Download complete!');
    } catch (error) {
      // Error handled by context
    } finally {
      setIsDownloadingLocal(false);
    }
  };

  const handleCancel = () => {
    cancelDownload();
    setIsDownloadingLocal(false);
    setIsMatching(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-lg">
          <Music className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-4xl font-bold gradient-text uppercase tracking-tighter">music Downloader</h2>
        <p className="text-muted-foreground max-w-md mx-auto px-4">
          Download high-quality songs from spotify, apple music, YouTube music, and more without watermarks.
        </p>
      </div>

      <div className="glass-card p-3 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 group">
          <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste music link here..."
            className="w-full glass-input pl-12 pr-12 py-4 rounded-xl outline-none"
          />
          {url && <button onClick={handleClear} className="absolute right-4 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-muted-foreground" /></button>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleFetch}
            disabled={!url.trim() || isLoadingPreview || isMatching || isDownloadingLocal}
            className="px-8 py-4 bg-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 min-w-[120px]"
          >
            {isLoadingPreview || isMatching ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Fetch</span>}
          </button>
          {(isMatching || isLoadingPreview || isDownloading) && (
            <button onClick={handleCancel} className="px-4 py-4 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-all">
              <Square size={20} fill="currentColor" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {currentPreview && currentPreview.mediaType === 'music' && !isLoadingPreview && (
          <motion.div ref={previewRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="glass-card p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="relative w-full md:w-40 aspect-square rounded-xl overflow-hidden bg-black/50 shadow-2xl flex-shrink-0">
                  {currentPreview.thumbnail && <img src={currentPreview.thumbnail} className="w-full h-full object-cover" />}
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="text-xl font-bold line-clamp-2">{currentPreview.title}</h3>
                    <a 
                      href={currentPreview.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-orange-400 text-xs font-black uppercase tracking-widest flex items-center gap-1 hover:underline w-fit group"
                    >
                      {currentPreview.platform}
                      <ExternalLink size={10} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <User size={12} /> {currentPreview.author || "Unknown Artist"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-4">
                <button onClick={() => setIsQualityDropdownOpen(!isQualityDropdownOpen)} className="w-full p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors">
                  <span className="font-bold text-sm">{selectedQuality ? selectedQuality.quality : 'Select MP3 Quality'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isQualityDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {isQualityDropdownOpen && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="space-y-1 max-h-40 overflow-y-auto overflow-hidden">
                      {currentPreview.qualities.map((q) => (
                        <button key={q.url} onClick={() => { setSelectedQuality(q as AudioQuality); setIsQualityDropdownOpen(false); }} className="w-full p-3 text-left hover:bg-white/10 rounded-lg text-xs font-bold flex justify-between">
                          <span>{q.quality}</span>
                          <span className="opacity-50">{q.size}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={handleDownload} 
                  disabled={!selectedQuality || isDownloadingLocal}
                  className="flex-1 bg-gradient-to-r from-orange-600 to-pink-600 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg disabled:opacity-50"
                >
                  {isDownloadingLocal ? (
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{currentDownloadProgress}%</span>
                    </div>
                  ) : 'Start Download'}
                </button>
                {isDownloadingLocal && (
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
          className="text-center py-20 glass-card bg-white/[0.02] mx-4 md:mx-0"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/5 flex items-center justify-center border border-white/5">
            <Music className="w-8 h-8 text-muted-foreground opacity-30" />
          </div>
          <h3 className="text-xl font-bold mb-2">Ready to Download</h3>
          <p className="text-muted-foreground max-w-md mx-auto px-4">
            Paste a music link above and we'll fetch all available qualities for you to choose from.
          </p>
        </motion.div>
      )}

      <div className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed font-medium uppercase tracking-tighter">
          Note: If a direct link is restricted by the provider, we automatically find a high-quality mirror to ensure your download finishes.
        </p>
      </div>
    </div>
  );
};

export default MusicDownloader;
