/**
 * Media API Service
 * 
 * Handles all backend communication for media extraction and download operations.
 * Connected to Python (FastAPI) backend using yt-dlp.
 */

import type { 
  VideoInfo, 
  MusicInfo, 
  MovieInfo,
  ApiResponse,
  Platform 
} from '@/types';

// API Base URL - empty when using Vite proxy in development
export const API_BASE_URL = '';

/**
 * Detect platform from URL
 */
export const detectPlatform = (url: string): Platform => {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('youtube') || lowerUrl.includes('youtu.be')) return 'youtube';
  if (lowerUrl.includes('tiktok')) return 'tiktok';
  if (lowerUrl.includes('instagram')) return 'instagram';
  if (lowerUrl.includes('facebook') || lowerUrl.includes('fb.watch')) return 'facebook';
  if (lowerUrl.includes('twitter') || lowerUrl.includes('x.com')) return 'twitter';
  if (lowerUrl.includes('spotify')) return 'spotify';
  if (lowerUrl.includes('soundcloud')) return 'soundcloud';
  if (lowerUrl.includes('music.apple') || lowerUrl.includes('itunes')) return 'apple-music';
  if (lowerUrl.includes('deezer')) return 'deezer';
  if (lowerUrl.includes('moviebox')) return 'moviebox';
  
  return 'unknown';
};

/**
 * Check if platform is supported
 */
export const isPlatformSupported = (platform: Platform): boolean => {
  const supportedPlatforms: Platform[] = [
    'youtube', 'tiktok', 'instagram', 'facebook', 'twitter',
    'spotify', 'soundcloud', 'apple-music', 'deezer', 'moviebox'
  ];
  return supportedPlatforms.includes(platform);
};

/**
 * Extract video information
 */
export const extractVideoInfo = async (url: string): Promise<ApiResponse<VideoInfo>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to extract video information');
    }
    
    return await response.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Connection to backend failed. Make sure the server is running.'
    };
  }
};

/**
 * Extract music information
 */
export const extractMusicInfo = async (url: string): Promise<ApiResponse<MusicInfo>> => {
  const result = await extractVideoInfo(url);
  if (result.success && result.data) {
    return {
      success: true,
      data: result.data as unknown as MusicInfo
    };
  }
  return result as ApiResponse<MusicInfo>;
};

/**
 * Search movies or series using MovieBox API
 */
export const searchMovies = async (query: string, type: 'movie' | 'series' = 'movie'): Promise<ApiResponse<MovieInfo[]>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/movies/search?query=${encodeURIComponent(query)}&type=${type}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to search');
    }
    
    return await response.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to search'
    };
  }
};

/**
 * Get detailed movie or series information and download links
 */
export const getMovieDetails = async (
  subjectId: string, 
  type: 'movie' | 'series' = 'movie',
  title?: string,
  season?: number,
  episode?: number
): Promise<ApiResponse<MovieInfo>> => {
  try {
    let url = `${API_BASE_URL}/api/movies/details?subject_id=${encodeURIComponent(subjectId)}&type=${type}`;
    if (title) url += `&title=${encodeURIComponent(title)}`;
    if (season !== undefined) url += `&season=${season}`;
    if (episode !== undefined) url += `&episode=${episode}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get details');
    }
    
    return await response.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to get details'
    };
  }
};

/**
 * Start download (Proxy URL for direct streams)
 */
export const startDownload = async (
  mediaUrl: string,
  quality: string,
  filename?: string,
  referer?: string
): Promise<ApiResponse<{ downloadUrl: string; expiresAt: number }>> => {
  try {
    const safeFilename = filename || 'video.mp4';
    let proxyUrl = `${API_BASE_URL}/api/download?url=${encodeURIComponent(mediaUrl)}&quality=${encodeURIComponent(quality)}&filename=${encodeURIComponent(safeFilename)}`;
    if (referer) proxyUrl += `&referer=${encodeURIComponent(referer)}`;
    
    return {
      success: true,
      data: {
        downloadUrl: proxyUrl,
        expiresAt: Date.now() + 30 * 60 * 1000 // 30 minutes
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to start download'
    };
  }
};


/**
 * Start a server-side movie/series download task
 */
export const startMovieDownloadTask = async (
  url: string,
  title: string,
  quality: string,
  subjectId?: string,
  referer?: string,
  mediaType?: 'movie' | 'series',
  season?: number,
  episode?: number
): Promise<ApiResponse<{ task_id: string }>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/movies/download/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url, 
        title, 
        quality, 
        subject_id: subjectId, 
        referer,
        mediaType,
        season,
        episode
      })
    });
    return await response.json();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * Get status of a movie download task
 */
export const getMovieDownloadStatus = async (taskId: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/movies/download/status/${taskId}`);
    return await response.json();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * Cancel a movie download task
 */
export const cancelMovieDownloadTask = async (taskId: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/movies/download/${taskId}`, { method: 'DELETE' });
    return await response.json();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * Pause or resume a movie download task
 */
export const pauseMovieDownloadTask = async (taskId: string): Promise<ApiResponse<{ paused: boolean }>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/movies/download/pause/${taskId}`, { method: 'POST' });
    return await response.json();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * Get the actual download URL for a completed task
 */
export const getMovieDownloadFileUrl = (taskId: string): string => {
  return `${API_BASE_URL}/api/movies/download/file/${taskId}`;
};

/**
 * Get download progress
 */
export const getDownloadProgress = async (
  _downloadId: string
): Promise<ApiResponse<{ progress: number; status: string; speed?: string }>> => {
  return {
    success: true,
    data: {
      progress: 100,
      status: 'streaming',
      speed: 'Fast'
    }
  };
};

/**
 * Cancel download
 */
export const cancelDownload = async (_downloadId: string): Promise<ApiResponse<void>> => {
  return { success: true };
};

/**
 * Bulk extract - process multiple URLs
 */
export const bulkExtract = async (urls: string[]): Promise<ApiResponse<(VideoInfo | MusicInfo | MovieInfo)[]>> => {
  try {
    const results: (VideoInfo | MusicInfo | MovieInfo)[] = [];
    for (const url of urls) {
      const result = await extractVideoInfo(url);
      if (result.success && result.data) {
        results.push(result.data);
      }
    }
    return {
      success: true,
      data: results
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to process URLs'
    };
  }
};

/**
 * Health check
 */
export const healthCheck = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/docs`);
    return response.ok;
  } catch {
    return false;
  }
};

export default {
  extractVideoInfo,
  extractMusicInfo,
  searchMovies,
  getMovieDetails,
  startDownload,
  startMovieDownloadTask,
  getMovieDownloadStatus,
  cancelMovieDownloadTask,
  pauseMovieDownloadTask,
  getMovieDownloadFileUrl,
  getDownloadProgress,
  cancelDownload,
  bulkExtract,
  healthCheck,
  detectPlatform,
  isPlatformSupported
};
