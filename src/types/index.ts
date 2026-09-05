// User authentication types
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAdmin: boolean;
  isVendor?: boolean;
  createdAt: number;
  referralBalance: number;
  bonusBalance?: number; // Non-withdrawable signup bonuses (₦100 per referral)
  referredCount: number;
  referredBy: string | null;
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

export interface TmdbCastMember {
  name: string;
  character: string;
  avatar: string | null;
}

export interface TmdbVideo {
  name: string;
  key: string;
  type: string;
}

export interface TmdbReview {
  author: string;
  content: string;
}

export interface TmdbSimilarItem {
  id: string;
  title: string;
  thumbnail: string | null;
  year: string;
  rating: string;
  mediaType: 'movie' | 'series';
}

export interface TmdbData {
  id: number;
  rating: string;
  voteCount: number;
  overview: string | null;
  tagline: string | null;
  genres: string[];
  cast: TmdbCastMember[];
  videos: TmdbVideo[];
  reviews: TmdbReview[];
  similar: TmdbSimilarItem[];
  backdrop: string | null;
  poster: string | null;
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
  detailPath?: string;
  tmdb?: TmdbData | null;
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
export type ViewType = MediaType | 'home' | 'bulk' | 'history' | 'admin' | 'notifications' | 'about' | 'privacy' | 'contact' | 'cinema' | 'wallet' | 'referral' | 'games' | 'profile' | 'vendor';

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

// Store types
export interface Vendor {
  id: string;
  name: string;
  telegramGroupId: string;
  logo?: string;
  rating?: number;
  ratingCount?: number;
  totalRatingPoints?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  slashPrice?: number;
  image: string;
  vendorId: string;
  inStock: boolean;
  stockStatus?: 'in_stock' | 'out_of_stock' | 'restocking';
  quantity: number;
  category: string;
  available?: boolean;
}

export interface Partner {
  id: string;
  name: string;
  logo: string;
  url?: string;
}

export interface Order {
  id: string;
  orderNumber?: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  deliveryAddress: string;
  items: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
  }[];
  totalAmount: number;
  vendorId: string;
  vendorName?: string;
  status: 'pending' | 'accepted' | 'shipped' | 'delivered' | 'cancelled';
  estimatedDeliveryTime?: string;
  acceptedAt?: number;
  shippedAt?: number;
  deliveredAt?: number;
  cancelledAt?: number;
  rated?: boolean;
  rating?: number;
  review?: string;
  telegramMessageId?: number;
  telegramChatId?: string | number;
  createdAt: number;
}
