/**
 * Download Context
 */

import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode, useEffect } from 'react';
import type { 
  DownloadItem, 
  VideoInfo, 
  MusicInfo, 
  VideoQuality, 
  AudioQuality,
  HistoryItem
} from '@/types';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { saveDownloadHistory, logMediaInteraction, getUserHistory } from '@/lib/firebase';
import mediaApi, { API_BASE_URL } from '@/api/mediaApi';

interface DownloadContextType {
  queue: DownloadItem[];
  addToQueue: (urls: string[]) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  startDownload: (id: string, quality?: VideoQuality | AudioQuality) => Promise<void>;
  downloadWithProgress: (
    url: string, 
    quality: string, 
    filename: string, 
    referer?: string,
    metadata?: { id: string; title: string; thumbnail: string; mediaType: string; platform: string }
  ) => Promise<void>;
  downloadAll: () => Promise<void>;
  cancelDownload: () => void;
  pauseDownload: () => void;
  getMediaInfo: (url: string) => Promise<VideoInfo | MusicInfo | null>;
  currentPreview: VideoInfo | MusicInfo | null;
  setCurrentPreview: (info: VideoInfo | MusicInfo | null) => void;
  isLoadingPreview: boolean;
  history: HistoryItem[];
  addToHistory: (item: HistoryItem) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;
  activeDownloads: number;
  currentDownloadProgress: number;
  maxConcurrent: number;
  isPaused: boolean;
  activeStage?: string;
}

export const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const useDownload = (): DownloadContextType => {
  const context = useContext(DownloadContext);
  if (!context) throw new Error('useDownload must be used within a DownloadProvider');
  return context;
};

const HISTORY_KEY = 'media-downloader-history';
const MAX_HISTORY_ITEMS = 50;

export const DownloadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [currentPreview, setCurrentPreview] = useState<VideoInfo | MusicInfo | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [currentDownloadProgress, setCurrentDownloadProgress] = useState(0);
  const [isPaused] = useState(false);
  const [activeStage] = useState<string | undefined>();
  
  const { showSuccess, showError } = useToast();
  const { user } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. Sync local history to localStorage
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  // 2. Fetch history from Firestore when user logs in
  useEffect(() => {
    if (user?.uid) {
      const fetchHistory = async () => {
        const firestoreHistory = await getUserHistory(user.uid);
        if (firestoreHistory.length > 0) {
          setHistory(firestoreHistory);
        }
      };
      fetchHistory();
    }
  }, [user?.uid]);

  const addToHistory = useCallback((item: HistoryItem) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.id !== item.id);
      return [item, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    });
  }, []);

  const removeFromHistory = useCallback((id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  /**
   * Fetch media info
   */
  const getMediaInfo = useCallback(async (url: string): Promise<VideoInfo | MusicInfo | null> => {
    setIsLoadingPreview(true);
    try {
      const result = await mediaApi.extractVideoInfo(url);
      if (result.success && result.data) return result.data;
      showError(result.error || 'Mirror not found.');
      return null;
    } catch (error) {
      showError('Backend server is busy. Please try again.');
      return null;
    } finally {
      setIsLoadingPreview(false);
    }
  }, [showError]);

  /**
   * Download with Progress
   */
  const downloadWithProgress = useCallback(async (
    url: string, 
    quality: string,
    filename: string,
    referer?: string,
    metadata?: { id: string; title: string; thumbnail: string; mediaType: string; platform: string }
  ): Promise<void> => {
    setActiveDownloads(prev => prev + 1);
    setCurrentDownloadProgress(0);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const baseUrl = API_BASE_URL || window.location.origin;
      if (!url) throw new Error('Download URL is missing.');

      const downloadUrl = `${baseUrl}/api/download?url=${encodeURIComponent(url)}&quality=${encodeURIComponent(quality)}&filename=${encodeURIComponent(filename)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
      
      const response = await fetch(downloadUrl, { signal });
      if (!response.ok) throw new Error('The download server is currently busy. Please try again in 30 seconds.');

      const reader = response.body?.getReader();
      const contentLength = +(response.headers.get('Content-Length') ?? 0);
      if (!reader) throw new Error('Failed to initialize stream');

      let receivedLength = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        if (contentLength) {
          setCurrentDownloadProgress(Math.round((receivedLength / contentLength) * 100));
        }
      }

      const blob = new Blob(chunks, { type: filename.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4' });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      // Save to History after success
      const finalMetadata = metadata || (currentPreview ? {
        id: currentPreview.id,
        title: currentPreview.title,
        thumbnail: currentPreview.thumbnail,
        mediaType: currentPreview.mediaType,
        platform: currentPreview.platform,
        url: currentPreview.url
      } : null);

      if (finalMetadata) {
        const historyItem: HistoryItem = {
          id: finalMetadata.id + Date.now(),
          url: (finalMetadata as any).url || url,
          title: finalMetadata.title,
          thumbnail: finalMetadata.thumbnail,
          mediaType: finalMetadata.mediaType as any,
          downloadedAt: Date.now(),
          platform: finalMetadata.platform
        };
        addToHistory(historyItem);
        
        if (user?.uid) {
          await saveDownloadHistory(user.uid, user.email, user.displayName, historyItem);
          await logMediaInteraction(
            { id: finalMetadata.id, title: finalMetadata.title, mediaType: finalMetadata.mediaType, platform: finalMetadata.platform },
            'download',
            user.uid
          );
        }
      }

      showSuccess('Download complete!');
    } catch (error: any) {
      if (error.name !== 'AbortError') showError(error.message);
    } finally {
      setActiveDownloads(prev => Math.max(0, prev - 1));
      setCurrentDownloadProgress(0);
      abortControllerRef.current = null;
    }
  }, [showSuccess, showError, currentPreview, user, addToHistory]);

  const addToQueue = useCallback((urls: string[]) => {
    const newItems: DownloadItem[] = urls.map(url => ({
      id: Math.random().toString(36).substring(7),
      url,
      status: 'waiting',
      progress: 0,
      createdAt: Date.now()
    }));
    setQueue(prev => [...prev, ...newItems]);
    showSuccess(`Added ${urls.length} links to queue`);
  }, [showSuccess]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const startDownload = useCallback(async (id: string, quality?: VideoQuality | AudioQuality) => {
    const item = queue.find(q => q.id === id);
    if (!item) return;

    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'processing' } : q));

    try {
      const info = await getMediaInfo(item.url);
      if (!info || !info.qualities || info.qualities.length === 0) {
        throw new Error('No working mirrors found');
      }

      const selectedQ = quality || info.qualities[0];
      const safeTitle = info.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const ext = info.mediaType === 'music' ? 'mp3' : 'mp4';
      
      setQueue(prev => prev.map(q => q.id === id ? { 
        ...q, 
        status: 'downloading', 
        mediaInfo: info,
        selectedQuality: selectedQ
      } : q));

      await downloadWithProgress(
        selectedQ.url, 
        selectedQ.quality, 
        `${safeTitle}.${ext}`,
        undefined,
        {
          id: info.id,
          title: info.title,
          thumbnail: info.thumbnail,
          mediaType: info.mediaType,
          platform: info.platform
        }
      );

      setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'completed', progress: 100 } : q));
    } catch (err: any) {
      setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'error', error: err.message } : q));
      showError(`Queue Error: ${err.message}`);
    }
  }, [queue, getMediaInfo, downloadWithProgress, showError]);

  const cancelDownload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      showSuccess('Download cancelled');
    }
  }, [showSuccess]);

  const value = {
    queue, addToQueue, removeFromQueue, clearQueue,
    startDownload, downloadWithProgress, downloadAll: async () => {},
    cancelDownload, pauseDownload: () => {}, getMediaInfo, currentPreview, 
    setCurrentPreview, isLoadingPreview, history, addToHistory,
    clearHistory, removeFromHistory, activeDownloads,
    currentDownloadProgress, maxConcurrent: 3, isPaused, activeStage
  };

  return <DownloadContext.Provider value={value as any}>{children}</DownloadContext.Provider>;
};
