/**
 * Download Context for Mobile
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { 
  DownloadItem, 
  VideoInfo, 
  MusicInfo, 
  VideoQuality, 
  AudioQuality,
  HistoryItem,
  DownloadStatus
} from '../types';
import { useAuth } from './AuthContext';
import { saveDownloadHistory } from '../lib/firebase';
import mediaApi, { API_BASE_URL } from '../api/mediaApi';

interface DownloadContextType {
  queue: DownloadItem[];
  addToQueue: (urls: string[]) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
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
const MAX_CONCURRENT_DOWNLOADS = 5;

export const DownloadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentPreview, setCurrentPreview] = useState<VideoInfo | MusicInfo | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [currentDownloadProgress, setCurrentDownloadProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [activeStage, setActiveStage] = useState<string | undefined>();
  
  const { user } = useAuth();
  const downloadQueueRef = useRef<DownloadItem[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);

  // Load history from AsyncStorage
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem(HISTORY_KEY);
        if (stored) setHistory(JSON.parse(stored));
      } catch (e) { console.error('Failed to load history', e); }
    };
    loadHistory();
  }, []);

  // Save history to AsyncStorage
  useEffect(() => {
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    downloadQueueRef.current = queue;
  }, [queue]);

  const addToHistory = useCallback((item: HistoryItem) => {
    setHistory(prev => [item, ...prev].slice(0, MAX_HISTORY_ITEMS));
    if (user) saveDownloadHistory(user.uid, user.email, user.displayName, item);
  }, [user]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const removeFromHistory = useCallback((id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  }, []);

  const getMediaInfo = useCallback(async (url: string): Promise<VideoInfo | MusicInfo | null> => {
    setIsLoadingPreview(true);
    try {
      const result = await mediaApi.extractVideoInfo(url);
      return result.success ? result.data : null;
    } catch (error) {
      return null;
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

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
    // In Mobile, we usually want to use expo-file-system for background downloads
    // For now, we'll implement the polling logic for MovieBox
    setActiveDownloads(prev => prev + 1);
    setCurrentDownloadProgress(0);
    setActiveStage('Initializing...');
    
    const isMovieBox = url.includes('hakunaymatata') || url.includes('aoneroom') || subjectId;
    
    if (isMovieBox) {
      try {
        const startResult = await mediaApi.startMovieDownloadTask(url, filename.split('_')[0], quality, subjectId, referer, mediaType, season, episode);
        if (!startResult.success || !startResult.data?.task_id) throw new Error('Failed to start download');

        const taskId = startResult.data.task_id;
        setActiveTaskId(taskId);

        return new Promise((resolve, reject) => {
          const pollInterval = setInterval(async () => {
            if (activeTaskIdRef.current !== taskId) {
              clearInterval(pollInterval);
              resolve();
              return;
            }

            try {
              const statusResult = await mediaApi.getMovieDownloadStatus(taskId);
              if (!statusResult.success) throw new Error(statusResult.error);

              const { progress, status, stage, paused } = statusResult.data;
              if (stage) setActiveStage(stage);
              if (paused !== undefined) setIsPaused(paused);
              setCurrentDownloadProgress(progress);

              if (status === 'completed') {
                clearInterval(pollInterval);
                setActiveStage('Ready to download');
                // Note: On mobile, you might want to use a direct link or Sharing API
                const fileUrl = mediaApi.getMovieDownloadFileUrl(taskId);
                
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
                setActiveDownloads(prev => Math.max(0, prev - 1));
                resolve();
              } else if (status === 'error') {
                clearInterval(pollInterval);
                reject(new Error('Server error'));
              }
            } catch (err) {
              clearInterval(pollInterval);
              reject(err);
            }
          }, 3000);
        });
      } catch (err) {
        setActiveDownloads(prev => Math.max(0, prev - 1));
        setCurrentDownloadProgress(0);
        setActiveTaskId(null);
      }
    }
  }, [addToHistory]);

  const cancelDownload = useCallback(async () => {
    if (activeTaskId) {
      await mediaApi.cancelMovieDownloadTask(activeTaskId);
      setActiveTaskId(null);
      setActiveStage(undefined);
      setCurrentDownloadProgress(0);
      setActiveDownloads(prev => Math.max(0, prev - 1));
    }
  }, [activeTaskId]);

  const pauseDownload = useCallback(async () => {
    if (activeTaskId) {
      const result = await mediaApi.pauseMovieDownloadTask(activeTaskId);
      if (result.success && result.data) setIsPaused(result.data.paused);
    }
  }, [activeTaskId]);

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
          return result.success && result.data 
            ? { ...qItem, mediaInfo: result.data, status: 'waiting' as DownloadStatus }
            : { ...qItem, status: 'error' as DownloadStatus, error: result.error };
        }
        return qItem;
      }));
    }
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const startDownload = useCallback(async (id: string, quality?: VideoQuality | AudioQuality): Promise<void> => {
    // Basic implementation for queue downloads
  }, []);

  const downloadAll = useCallback(async (): Promise<void> => {
    // Basic implementation
  }, []);

  const value = {
    queue, addToQueue, removeFromQueue, clearQueue,
    startDownload, downloadWithProgress, downloadAll,
    cancelDownload, pauseDownload,
    getMediaInfo, currentPreview, setCurrentPreview, isLoadingPreview,
    history, addToHistory, clearHistory, removeFromHistory,
    activeDownloads, currentDownloadProgress,
    maxConcurrent: MAX_CONCURRENT_DOWNLOADS, isPaused, activeStage
  };

  return (
    <DownloadContext.Provider value={value}>
      {children}
    </DownloadContext.Provider>
  );
};
