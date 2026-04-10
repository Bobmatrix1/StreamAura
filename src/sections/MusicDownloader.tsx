/**
 * Music Downloader Component
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
  Check,
  Loader2,
  Volume2,
  ChevronDown,
  ExternalLink
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import { API_BASE_URL } from '../api/mediaApi';
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

  const handleFetch = async () => {
    if (!url.trim()) return;
    setIsMatching(true);
    try {
      const info = await getMediaInfo(url);
      if (info) setCurrentPreview(info);
    } finally {
      setIsMatching(false);
    }
  };

  const handleClear = () => {
    setUrl('');
    setCurrentPreview(null);
    setSelectedQuality(null);
    setIsPlaying(false);
    setIsMatching(false);
    setPreviewProgress(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
  };

  const togglePreview = () => {
    if (!audioRef.current || !currentPreview) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsAudioLoading(true);
      const streamUrl = currentPreview.qualities[0]?.url;
      if (streamUrl) {
        audioRef.current.src = streamUrl;
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setIsAudioLoading(false);
            showError('Preview unavailable.');
          });
      }
    }
  };

  const handleDownload = async () => {
    if (!currentPreview || !selectedQuality) return;
    setIsDownloading(true);
    try {
      const safeTitle = currentPreview.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      await downloadWithProgress(currentPreview.url, selectedQuality.quality, `${safeTitle}.mp3`);
      showSuccess('Download complete!');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-lg">
          <Music className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-4xl font-bold gradient-text">Music Downloader</h2>
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
        <button
          onClick={handleFetch}
          disabled={!url.trim() || isLoadingPreview || isMatching}
          className="px-8 py-4 bg-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"
        >
          {isLoadingPreview || isMatching ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Fetch</span>}
        </button>
      </div>

      <AnimatePresence>
        {currentPreview && currentPreview.mediaType === 'music' && !isLoadingPreview && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="glass-card p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="relative w-full md:w-40 aspect-square rounded-xl overflow-hidden bg-black/50">
                  {currentPreview.thumbnail && <img src={currentPreview.thumbnail} className="w-full h-full object-cover" />}
                  <button onClick={togglePreview} className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-all">
                    <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
                      {isAudioLoading ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white fill-current ml-1" />}
                    </div>
                  </button>
                  <audio ref={audioRef} onPlaying={() => setIsAudioLoading(false)} onEnded={() => setIsPlaying(false)} />
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="text-xl font-bold line-clamp-2">{currentPreview.title}</h3>
                    <p className="text-orange-400 text-xs font-black uppercase tracking-widest">{currentPreview.platform}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-muted-foreground flex items-center gap-2">
                      <User size={14} /> {currentPreview.author}
                    </div>
                    <a href={currentPreview.url} target="_blank" className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-orange-400 flex items-center gap-2">
                      <ExternalLink size={14} /> View Original
                    </a>
                  </div>
                  {(isPlaying || previewProgress > 0) && (
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div animate={{ width: `${previewProgress}%` }} className="h-full bg-orange-500" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => setIsQualityDropdownOpen(!isQualityDropdownOpen)} className="w-full p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
                <span className="font-bold text-sm">{selectedQuality ? selectedQuality.quality : 'Select Quality'}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isQualityDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              <button 
                onClick={handleDownload} 
                disabled={!selectedQuality || isDownloading}
                className="bg-gradient-to-r from-orange-600 to-pink-600 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg disabled:opacity-50"
              >
                {isDownloading ? `Downloading ${currentDownloadProgress}%` : 'Start Download'}
              </button>
            </div>

            {isQualityDropdownOpen && (
              <div className="glass-card p-2 space-y-1">
                {currentPreview.qualities.map((q) => (
                  <button key={q.url} onClick={() => { setSelectedQuality(q as AudioQuality); setIsQualityDropdownOpen(false); }} className="w-full p-3 text-left hover:bg-white/5 rounded-lg text-xs font-bold flex justify-between">
                    <span>{q.quality}</span>
                    <span className="opacity-50">{q.size}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MusicDownloader;
