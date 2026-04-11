/**
 * Download Context
 * 
 * Manages download queue, history, and media processing.
 * Handles both single and bulk downloads with progress tracking.
 */

import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { 
  DownloadItem, 
  VideoInfo, 
  MusicInfo, 
  VideoQuality, 
  AudioQuality,
  HistoryItem,
  DownloadStatus
} from '@/types';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { saveDownloadHistory } from '@/lib/firebase';
import mediaApi, { API_BASE_URL } from '@/api/mediaApi';

interface DownloadContextType {
  // Queue management
  queue: DownloadItem[];
  addToQueue: (urls: string[]) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  
  // Download actions
  startDownload: (id: string, quality: VideoQuality | AudioQuality) => Promise<void>;
  downloadWithProgress: (
    url: string, 
    quality: string, 
    filename: string, 
    referer?: string, 
    subjectId?: string,
    mediaType?: 'movie' | 'series',
    season?: number,
    episode?: number,
    title?: string,
    thumbnail?: string
  ) => Promise<void>;
  downloadAll: () => Promise<void>;

  cancelDownload: () => void;
  pauseDownload: () => void;
  
  // Media info
  getMediaInfo: (url: string) => Promise<VideoInfo | MusicInfo | null>;
  currentPreview: VideoInfo | MusicInfo | null;
  setCurrentPreview: (info: VideoInfo | MusicInfo | null) => void;
  isLoadingPreview: boolean;
  
  // History
  history: HistoryItem[];
  addToHistory: (item: HistoryItem) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;
  
  // Progress
  activeDownloads: number;
  currentDownloadProgress: number;
  maxConcurrent: number;
  isPaused: boolean;
  activeStage?: string;
}

// Export the context so it can be used if needed, but useDownload is preferred
export const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const useDownload = (): DownloadContextType => {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
};

interface DownloadProviderProps {
  children: ReactNode;
}

const HISTORY_KEY = 'media-downloader-history';
const MAX_HISTORY_ITEMS = 50;
const MAX_CONCURRENT_DOWNLOADS = 5;

export const DownloadProvider: React.FC<DownloadProviderProps> = ({ children }) => {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return [];
        }
      }
    }
    return [];
  });
  const [currentPreview, setCurrentPreview] = useState<VideoInfo | MusicInfo | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [currentDownloadProgress, setCurrentDownloadProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [activeStage, setActiveStage] = useState<string | undefined>();
  
  const { showSuccess, showError } = useToast();
  const { user } = useAuth();
  const downloadQueueRef = useRef<DownloadItem[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);

  // Keep ref in sync for interval closures
  React.useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  React.useEffect(() => {
    downloadQueueRef.current = queue;
  }, [queue]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  }, [history]);

  /**
   * Add item to history
   */
  const addToHistory = useCallback((item: HistoryItem) => {
    setHistory(prev => {
      const newHistory = [item, ...prev].slice(0, MAX_HISTORY_ITEMS);
      return newHistory;
    });

    if (user) {
      saveDownloadHistory(user.uid, user.email, user.displayName, item);
    }
  }, [user]);

  /**
   * Clear history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    showSuccess('History cleared');
  }, [showSuccess]);

  /**
   * Remove item from history
   */
  const removeFromHistory = useCallback((id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  }, []);

  /**
   * Fetch media info from backend using real API
   */
  const getMediaInfo = useCallback(async (url: string): Promise<VideoInfo | MusicInfo | null> => {
    setIsLoadingPreview(true);
    try {
      const result = await mediaApi.extractVideoInfo(url);
      if (result.success && result.data) {
        return result.data;
      } else {
        showError(result.error || 'Failed to fetch media info');
        return null;
      }
    } catch (error) {
      showError('Failed to fetch media info. Please check the URL and try again.');
      return null;
    } finally {
      setIsLoadingPreview(false);
    }
  }, [showError]);

  /**
   * High-speed download with server-side processing and real progress tracking
   */
  const downloadWithProgress = useCallback(async (
    url: string, 
    quality: string,
    filename: string,
    referer?: string,
    subjectId?: string,
    mediaType?: 'movie' | 'series',
    season?: number,
    episode?: number,
    title?: string,
    thumbnail?: string
  ): Promise<void> => {
    setActiveDownloads(prev => prev + 1);
    setCurrentDownloadProgress(0);
    setActiveStage('Initializing...');
    let lastProgress = 0;

    // CASE 1: MovieBox Download (Server-side task)
    const isMovieBox = url.includes('hakunaymatata') || url.includes('aoneroom') || subjectId;
    
    if (isMovieBox) {
      try {
        const startResult = await mediaApi.startMovieDownloadTask(
          url, 
          filename.split('_')[0], 
          quality, 
          subjectId, 
          referer,
          mediaType,
          season,
          episode
        );
        if (!startResult.success || !startResult.data?.task_id) {
          throw new Error(startResult.error || 'Failed to start server-side download');
        }

        const taskId = startResult.data.task_id;
        setActiveTaskId(taskId);

        // Poll for progress
        return new Promise((resolve, reject) => {
          const pollInterval = setInterval(async () => {
            // Safety: Check if user already cancelled this task via UI
            if (activeTaskIdRef.current !== taskId) {
              clearInterval(pollInterval);
              resolve();
              return;
            }

            try {
              const statusResult = await mediaApi.getMovieDownloadStatus(taskId);
              if (!statusResult.success) throw new Error(statusResult.error);

              const { progress, status, error, stage, paused } = statusResult.data;
              if (stage) setActiveStage(stage);
              if (paused !== undefined) setIsPaused(paused);
              
              // Only update if progress is moving forward
              if (progress > lastProgress) {
                lastProgress = progress;
                setCurrentDownloadProgress(progress);
              }

              if (status === 'completed') {
                clearInterval(pollInterval);
                setActiveStage('Saving to device...');
                setCurrentDownloadProgress(0);
                setIsPaused(false);
                
                const fileUrl = mediaApi.getMovieDownloadFileUrl(taskId);
                const fileResponse = await fetch(fileUrl, { signal: abortControllerRef.current?.signal });
                
                if (!fileResponse.ok) throw new Error('Failed to retrieve file from server');
                
                const reader = fileResponse.body?.getReader();
                const contentLength = +(fileResponse.headers.get('Content-Length') ?? 0);
                if (!reader) throw new Error('Failed to start file transfer');

                let received = 0;
                const chunks = [];
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  chunks.push(value);
                  received += value.length;
                  if (contentLength) {
                    setCurrentDownloadProgress(Math.round((received / contentLength) * 100));
                  }
                }

                const blob = new Blob(chunks, { type: 'video/mp4' });
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(blobUrl);
                
                addToHistory({
                  id: Math.random().toString(36).substring(7),
                  url: url,
                  title: title || filename.split('_')[0],
                  thumbnail: thumbnail || '',
                  mediaType: 'movie',
                  downloadedAt: Date.now(),
                  platform: 'MovieBox'
                });

                setActiveTaskId(null);
                setActiveStage(undefined);
                showSuccess('Download complete!');
                setActiveDownloads(prev => Math.max(0, prev - 1));
                resolve();
              } else if (status === 'error') {
                setActiveStage(undefined);
                throw new Error(error || 'Server-side download failed');
              } else if (status === 'cancelled') {
                clearInterval(pollInterval);
                setActiveTaskId(null);
                setActiveStage(undefined);
                setActiveDownloads(prev => Math.max(0, prev - 1));
                resolve();
              }
            } catch (err: any) {
              clearInterval(pollInterval);
              setActiveTaskId(null);
              setActiveStage(undefined);
              setActiveDownloads(prev => Math.max(0, prev - 1));
              showError(err.message || 'Polling failed');
              reject(err);
            }
          }, 2000);
        });
      } catch (err: any) {
        showError(err.message || 'Download task failed');
        setActiveDownloads(prev => Math.max(0, prev - 1));
        setCurrentDownloadProgress(0);
        setActiveStage(undefined);
        setActiveTaskId(null);
        return;
      }
    }

    // CASE 2: General Download (Direct Stream)
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const baseUrl = API_BASE_URL || window.location.origin;
      let downloadUrl = `${baseUrl}/api/download?url=${encodeURIComponent(url)}&quality=${encodeURIComponent(quality)}&filename=${encodeURIComponent(filename)}`;
      if (referer) downloadUrl += `&referer=${encodeURIComponent(referer)}`;
      
      const response = await fetch(downloadUrl, { signal });
      
      const contentType = response.headers.get('Content-Type');
      if (!response.ok || (contentType && contentType.includes('text/html'))) {
        throw new Error('Download server is currently busy. Please try again in a few moments.');
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
          const progress = Math.round((receivedLength / contentLength) * 100);
          if (progress > lastProgress) {
            lastProgress = progress;
            setCurrentDownloadProgress(progress);
          }
        }
      }

      if (receivedLength === 0) throw new Error('Received an empty file');

      const mimeType = filename.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4';
      const blob = new Blob(chunks, { type: mimeType });
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      if (currentPreview) {
        addToHistory({
          id: Math.random().toString(36).substring(7),
          url: currentPreview.url,
          title: currentPreview.title,
          thumbnail: currentPreview.thumbnail,
          mediaType: currentPreview.mediaType,
          downloadedAt: Date.now(),
          platform: currentPreview.platform
        });
      }

      showSuccess('Download complete!');

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Download cancelled by user');
        return;
      }
      console.error('Download error:', error);
      showError(error.message || 'Download failed');
    } finally {
      setActiveDownloads(prev => Math.max(0, prev - 1));
      setCurrentDownloadProgress(0);
      setActiveStage(undefined);
      abortControllerRef.current = null;
    }
  }, [currentPreview, addToHistory, showSuccess, showError]);

  /**
   * Cancel active download
   */
  const cancelDownload = useCallback(async () => {
    if (activeTaskId) {
      const taskIdToCancel = activeTaskId;
      // 1. Immediately update UI state
      setActiveTaskId(null);
      setActiveStage(undefined);
      setCurrentDownloadProgress(0);
      setActiveDownloads(prev => Math.max(0, prev - 1));
      
      // 2. Notify backend
      await mediaApi.cancelMovieDownloadTask(taskIdToCancel);
      showSuccess('Movie download cancelled');
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      showSuccess('Download cancelled');
    }
  }, [activeTaskId, showSuccess]);

  const pauseDownload = useCallback(async () => {
    if (activeTaskId) {
      const result = await mediaApi.pauseMovieDownloadTask(activeTaskId);
      if (result.success && result.data) {
        setIsPaused(result.data.paused);
        showSuccess(result.data.paused ? 'Download paused' : 'Download resumed');
      } else {
        showError('Failed to toggle pause');
      }
    } else {
      showError('Pause is only supported for server-side movie streams');
    }
  }, [activeTaskId, showSuccess, showError]);

  /**
   * Add URLs to download queue
   */
  const addToQueue = useCallback(async (urls: string[]) => {
    const validUrls = urls.filter(url => url.trim());
    const newItems: DownloadItem[] = validUrls.map(url => ({
      id: Math.random().toString(36).substring(2, 9),
      url: url.trim(),
      status: 'processing',
      progress: 0,
      createdAt: Date.now()
    }));

    setQueue(prev => [...prev, ...newItems]);

    for (const item of newItems) {
      const result = await mediaApi.extractVideoInfo(item.url);
      setQueue(prev => prev.map(qItem => {
        if (qItem.id === item.id) {
          if (result.success && result.data) {
            return { ...qItem, mediaInfo: result.data, status: 'waiting' as DownloadStatus };
          } else {
            return { ...qItem, status: 'error' as DownloadStatus, error: result.error };
          }
        }
        return qItem;
      }));
    }
    showSuccess(`Added ${newItems.length} item(s) to queue`);
  }, [showSuccess]);

  /**
   * Remove item from queue
   */
  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  /**
   * Clear entire queue
   */
  const clearQueue = useCallback(() => {
    setQueue([]);
    showSuccess('Queue cleared');
  }, [showSuccess]);

  /**
   * Start downloading a specific item with selected quality
   */
  const startDownload = useCallback(async (
    id: string, 
    quality?: VideoQuality | AudioQuality
  ): Promise<void> => {
    const targetItem = downloadQueueRef.current.find(item => item.id === id);
    if (!targetItem) return;

    const finalQuality = quality || { quality: 'best', format: 'MP4' };
    const isAudio = targetItem.mediaInfo?.mediaType === 'music' || finalQuality.quality.includes('kbps');

    setQueue(prev => prev.map(item => 
      item.id === id 
        ? { ...item, status: 'downloading', selectedQuality: finalQuality as any, progress: 0 }
        : item
    ));

    setActiveDownloads(prev => prev + 1);

    try {
      const safeTitle = targetItem.mediaInfo?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'media';
      const filename = isAudio ? `${safeTitle}.mp3` : `${safeTitle}.mp4`;
      
      const finalUrl = (targetItem.mediaInfo as any)?.matchUrl || targetItem.url;
      
      const baseUrl = API_BASE_URL || window.location.origin;
      const downloadUrl = `${baseUrl}/api/download?url=${encodeURIComponent(finalUrl)}&quality=${encodeURIComponent(finalQuality.quality)}&filename=${encodeURIComponent(filename)}`;
      
      const response = await fetch(downloadUrl);
      
      if (!response.ok) throw new Error('Network response was not ok');

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
          const progress = Math.round((receivedLength / contentLength) * 100);
          setQueue(prev => prev.map(item => 
            item.id === id ? { ...item, progress } : item
          ));
        }
      }

      const blob = new Blob(chunks, { type: isAudio ? 'audio/mpeg' : 'video/mp4' });
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      setQueue(prev => prev.map(item => 
        item.id === id ? { ...item, status: 'completed' as DownloadStatus, progress: 100 } : item
      ));

      if (targetItem.mediaInfo) {
        addToHistory({
          id: targetItem.id,
          url: targetItem.url,
          title: targetItem.mediaInfo.title,
          thumbnail: targetItem.mediaInfo.thumbnail,
          mediaType: targetItem.mediaInfo.mediaType,
          downloadedAt: Date.now(),
          platform: targetItem.mediaInfo.platform
        });
      }
      
      showSuccess('Download complete!');
    } catch (error: any) {
      console.error('Bulk Download Error:', error);
      setQueue(prev => prev.map(item => 
        item.id === id ? { ...item, status: 'error', error: error.message } : item
      ));
      showError('Item failed to download');
    } finally {
      setActiveDownloads(prev => prev - 1);
    }
  }, [showSuccess, showError, addToHistory]);

  /**
   * Download all ready items in queue
   */
  const downloadAll = useCallback(async (): Promise<void> => {
    const readyItems = downloadQueueRef.current.filter(item => item.status === 'ready' && item.selectedQuality);
    if (readyItems.length === 0) {
      showError('No items ready for download');
      return;
    }

    showSuccess(`Starting download of ${readyItems.length} item(s)`);
    for (const item of readyItems) {
      if (item.selectedQuality) {
        await startDownload(item.id, item.selectedQuality);
      }
    }
  }, [startDownload, showSuccess, showError]);

  const value: DownloadContextType = {
    queue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    startDownload,
    downloadWithProgress,
    downloadAll,
    cancelDownload,
    pauseDownload,
    getMediaInfo,
    currentPreview,
    setCurrentPreview,
    isLoadingPreview,
    history,
    addToHistory,
    clearHistory,
    removeFromHistory,
    activeDownloads,
    currentDownloadProgress,
    maxConcurrent: MAX_CONCURRENT_DOWNLOADS,
    isPaused,
    activeStage
  };

  return (
    <DownloadContext.Provider value={value}>
      {children}
    </DownloadContext.Provider>
  );
};
