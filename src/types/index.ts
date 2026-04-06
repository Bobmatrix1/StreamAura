// User authentication types
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAdmin: boolean;
  createdAt: number;
}

// Media download types
export type MediaType = 'video' | 'music' | 'movie' | 'series';

export interface MediaInfo {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration: string;
  author?: string;
  platform: string;
  mediaType: MediaType;
  createdAt: number;
  expiresAt: number; // 30 minutes from creation
  streamUrl?: string;
}

export interface VideoQuality {
  quality: string;
  resolution: string;
  format: string;
  size: string;
  sizeBytes: number;
  url: string;
}

export interface AudioQuality {
  quality: string;
  bitrate: string;
  format: string;
  size: string;
  sizeBytes: number;
  url: string;
}

export interface VideoInfo extends MediaInfo {
  mediaType: 'video';
  qualities: VideoQuality[];
}

export interface MusicInfo extends MediaInfo {
  mediaType: 'music';
  artist: string;
  album?: string;
  qualities: AudioQuality[];
}

export interface SeasonInfo {
  season: number;
  episodes: number[];
}

// New Movie types
export interface MovieInfo extends MediaInfo {
  mediaType: 'movie' | 'series';
  year: string;
  rating: string;
  description: string;
  genres: string[];
  qualities: VideoQuality[];
  seasons?: SeasonInfo[];
  referer?: string;
}

// Download queue types
export type DownloadStatus = 'waiting' | 'processing' | 'ready' | 'error' | 'downloading' | 'completed';

export interface DownloadItem {
  id: string;
  url: string;
  mediaInfo?: VideoInfo | MusicInfo | MovieInfo;
  status: DownloadStatus;
  progress: number;
  selectedQuality?: VideoQuality | AudioQuality;
  error?: string;
  createdAt: number;
}

export interface DownloadQueue {
  items: DownloadItem[];
  activeDownloads: number;
  maxConcurrent: number;
}

// Toast notification types
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

// App state types
export type ViewType = MediaType | 'bulk' | 'history' | 'admin' | 'notifications' | 'about' | 'privacy' | 'contact';

export interface AppState {
  isAuthenticated: boolean;
  user: User | null;
  theme: 'dark' | 'light';
  activeTab: ViewType;
}

// Platform detection
export type Platform = 
  | 'youtube' 
  | 'tiktok' 
  | 'instagram' 
  | 'facebook' 
  | 'twitter' 
  | 'spotify' 
  | 'soundcloud' 
  | 'apple-music'
  | 'deezer'
  | 'moviebox'
  | 'unknown';

export interface PlatformInfo {
  name: string;
  icon: string;
  supported: boolean;
  mediaType: MediaType;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// History item for local storage
export interface HistoryItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  mediaType: MediaType;
  downloadedAt: number;
  platform: string;
}

// Global history item for Firestore (Admin view)
export interface GlobalHistoryItem extends HistoryItem {
  userId: string;
  userEmail: string | null;
  userDisplayName: string | null;
}
