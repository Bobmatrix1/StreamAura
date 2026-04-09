/**
 * Media API Service for Mobile (Backend Master Engine)
 */

import type { 
  VideoInfo, 
  MusicInfo, 
  MovieInfo,
  ApiResponse,
} from '../types';

export const API_BASE_URL = process.env.EXPO_PUBLIC_VITE_API_URL || '';

/**
 * MASTER API EXPORTS (Talking to Render)
 */

export const searchMovies = async (query: string, type: 'movie' | 'series' = 'movie'): Promise<ApiResponse<MovieInfo[]>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/movies/search?query=${encodeURIComponent(query)}&type=${type}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Search failed");
    return result;
  } catch (err: any) {
    return { success: false, error: err.message || "Server connection failed." };
  }
};

export const getMovieDetails = async (subjectId: string, type: 'movie' | 'series' = 'movie', title?: string): Promise<ApiResponse<MovieInfo>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/movies/details?subject_id=${encodeURIComponent(subjectId)}&type=${type}&title=${encodeURIComponent(title || '')}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Mirrors not found");
    return result;
  } catch (err: any) {
    return { success: false, error: err.message || "Mirror server busy." };
  }
};

export const extractVideoInfo = async (url: string): Promise<ApiResponse<VideoInfo>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return await response.json();
  } catch (error: any) {
    return { success: false, error: "Extraction server offline." };
  }
};

export const startMovieDownloadTask = async (url: string, title: string, quality: string, subjectId?: string, referer?: string, mediaType?: 'movie' | 'series', season?: number, episode?: number): Promise<ApiResponse<{ task_id: string }>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/movies/download/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, quality, subject_id: subjectId, referer, mediaType, season, episode })
    });
    return await response.json();
  } catch (error: any) {
    return { success: false, error: "Download server offline." };
  }
};

export const getMovieDownloadStatus = async (taskId: string) => {
  const response = await fetch(`${API_BASE_URL}/api/movies/download/status/${taskId}`);
  return await response.json();
};

export const getMovieDownloadFileUrl = (taskId: string) => `${API_BASE_URL}/api/movies/download/file/${taskId}`;

export default {
  searchMovies,
  getMovieDetails,
  extractVideoInfo,
  startMovieDownloadTask,
  getMovieDownloadStatus,
  getMovieDownloadFileUrl
};
