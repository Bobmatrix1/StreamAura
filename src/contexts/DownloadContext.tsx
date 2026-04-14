/**
 * Download Context
 */

import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { 
  DownloadItem, 
  VideoInfo, 
  MusicInfo, 
  VideoQuality, 
  AudioQuality,
  HistoryItem
} from '@/types';
import { useToast } from './ToastContext';
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
    referer?: string
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

export const DownloadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [history] = useState<HistoryItem[]>([]);
  const [currentPreview, setCurrentPreview] = useState<VideoInfo | MusicInfo | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [currentDownloadProgress, setCurrentDownloadProgress] = useState(0);
  const [isPaused] = useState(false);
  const [activeStage] = useState<string | undefined>();
  
  const { showSuccess, showError } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Fetch media info
   */
  const getMediaInfo = useCallback(async (url: string): Promise<VideoInfo | MusicInfo | null> => {
    setIsLoadingPreview(true);
    try {
      const result = await mediaApi.extractVideoInfo(url);
      if (result.success && result.data) return result.data;
      showError(result.error || 'Mirror not found. Try another link.');
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
    referer?: string
  ): Promise<void> => {
    setActiveDownloads(prev => prev + 1);
    setCurrentDownloadProgress(0);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const baseUrl = API_BASE_URL || window.location.origin;
      const downloadUrl = `${baseUrl}/api/download?url=${encodeURIComponent(url)}&quality=${encodeURIComponent(quality)}&filename=${encodeURIComponent(filename)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
      
      const response = await fetch(downloadUrl, { signal });
      
      if (!response.ok) {
        throw new Error('The download server is currently busy. Please try again in 30 seconds.');
      }

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

      showSuccess('Download complete!');
    } catch (error: any) {
      if (error.name !== 'AbortError') showError(error.message);
    } finally {
      setActiveDownloads(prev => Math.max(0, prev - 1));
      setCurrentDownloadProgress(0);
      abortControllerRef.current = null;
    }
  }, [showSuccess, showError]);

  const addToQueue = useCallback((urls: string[]) => {
    const newItems: DownloadItem[] = urls.map(url => ({
      id: Math.random().toString(36).substring(7),
      url,
      status: 'waiting',
      progress: 0,
      timestamp: Date.now()
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
      if (info) {
        setQueue(prev => prev.map(q => q.id === id ? { 
          ...q, 
          status: 'downloading', 
          mediaInfo: info 
        } : q));

        const selectedQ = quality || info.qualities[0];
        const safeTitle = info.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const ext = info.mediaType === 'music' ? 'mp3' : 'mp4';
        
        await downloadWithProgress(
          selectedQ.url, 
          selectedQ.quality, 
          `${safeTitle}.${ext}`
        );

        setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'completed', progress: 100 } : q));
      } else {
        throw new Error('Failed to fetch info');
      }
    } catch (err) {
      setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'error' } : q));
      showError(`Failed to download: ${item.url}`);
    }
  }, [queue, getMediaInfo, downloadWithProgress, showError]);

  const cancelDownload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      showSuccess('Download cancelled');
    }
  }, [showSuccess]);

  const value = {
    queue, 
    addToQueue, 
    removeFromQueue, 
    clearQueue,
    startDownload, 
    downloadWithProgress, 
    downloadAll: async () => {},
    cancelDownload, 
    pauseDownload: () => {}, 
    getMediaInfo, 
    currentPreview, 
    setCurrentPreview, 
    isLoadingPreview, 
    history, 
    addToHistory: () => {},
    clearHistory: () => {}, 
    removeFromHistory: () => {}, 
    activeDownloads,
    currentDownloadProgress, 
    maxConcurrent: 3, 
    isPaused, 
    activeStage
  };

  return <DownloadContext.Provider value={value as any}>{children}</DownloadContext.Provider>;
};
