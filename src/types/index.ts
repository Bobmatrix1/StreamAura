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
  bonusBalance?: number; // Legacy balance
  auraCoins?: number; // AuraCoins accumulated from game room, rewards, etc.
  auraCoin?: number;
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
export type ViewType = MediaType | 'home' | 'bulk' | 'history' | 'admin' | 'notifications' | 'about' | 'privacy' | 'terms' | 'cookies' | 'contact' | 'cinema' | 'wallet' | 'referral' | 'games' | 'profile' | 'vendor';

export interface AppState {
  isAuthenticated: boolean;
  user: User | null;
  theme: 'dark' | 'light';
  activeTab: ViewType;
}

// Platform detection
export type Platform = 
  | 'youtube' 
  | 'youtube-music'
  | 'tiktok' 
  | 'instagram' 
  | 'facebook' 
  | 'twitter' 
  | 'spotify' 
  | 'soundcloud' 
  | 'apple-music'
  | 'audiomack'
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
  rating?: number;
  reviewCount?: number;
}

export interface ProductReview {
  id: string;
  orderId?: string;
  vendorId?: string;
  userId?: string;
  userName?: string;
  rating: number;
  review?: string;
  createdAt: number;
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

// Advertisement & Marketing Campaign Types
export type AdType = 'flyer' | 'popup' | 'banner' | 'carousel';
export type AdFrequency = 'always' | 'once_per_session' | 'once_per_day' | 'x_per_day' | 'x_per_week' | 'once_ever';
export type AdInteractionSource = 'flyer' | 'popup' | 'banner' | 'carousel' | 'notification';
export type AdDismissMethod = 'close_button' | 'backdrop_tap' | 'esc_key' | 'auto_timer';

export interface CarouselSlideConfig {
  id?: string;
  imageUrl: string;
  destinationType?: 'external' | 'in_app' | 'none';
  targetUrl?: string; // external URL or fallback
  inAppPage?: string; // e.g. 'cinema', 'games', 'wallet', 'vendor', etc.
  buttonText?: string; // custom CTA for this slide
  title?: string;
}

export interface AdCampaign {
  id: string;
  title: string;
  type: AdType; // 'flyer' (OPay App Launch Splash) | 'popup' (Targeted In-App Modal) | 'banner' (sticky banner) | 'carousel' (moving carousel slide)
  imageUrl: string;
  imageUrls?: string[]; // Multiple images for carousel slider
  carouselSlides?: CarouselSlideConfig[]; // Rich multi-slide configurations with per-slide links
  destinationType?: 'external' | 'in_app' | 'none';
  targetUrl?: string; // link to open when clicked
  targetPages: string[]; // ['all'] or ['home', 'video', etc.]
  active: boolean;
  
  // Frequency & Capping
  frequency: AdFrequency; // 'always' | 'once_per_session' | 'once_per_day' | 'x_per_day' | 'x_per_week' | 'once_ever'
  maxPerDay?: number; // e.g. 2 times a day
  maxPerWeek?: number; // e.g. 5 times a week
  
  // Timing & Scheduling
  startDate?: number; // timestamp
  endDate?: number; // timestamp
  displayDelaySeconds?: number; // delay before showing popup in seconds
  autoCloseSeconds?: number; // auto close countdown (0 = manual only)
  
  // Styling / Presentation
  aspectRatio?: 'flyer' | 'square' | 'wide'; // 'flyer' (3:4 - OPay poster style), 'square' (1:1), 'wide' (16:9)
  roundedCorners?: 'full' | 'xl' | '2xl' | '3xl';
  bannerPosition?: 'top' | 'bottom'; // for banner
  buttonText?: string; // e.g. "Claim Offer", "Open Now"
  description?: string;
  
  // Performance Metrics & Tracking
  impressions: number;
  clicks: number;
  closes?: number; // Total times ad was closed/dismissed
  
  // Source Attribution Breakdown
  clicksBySource?: {
    flyer?: number;
    popup?: number;
    banner?: number;
    carousel?: number;
    notification?: number;
  };
  impressionsBySource?: {
    flyer?: number;
    popup?: number;
    banner?: number;
    carousel?: number;
    notification?: number;
  };
  closesByMethod?: {
    close_button?: number;
    backdrop_tap?: number;
    esc_key?: number;
    auto_timer?: number;
  };

  createdAt: number;
  updatedAt?: number;
}

export interface AdTelemetryDelta {
  impressions?: number;
  clicks?: number;
  closes?: number;
  clicksBySource?: Partial<Record<AdInteractionSource, number>>;
  impressionsBySource?: Partial<Record<AdInteractionSource, number>>;
  closesByMethod?: Partial<Record<AdDismissMethod, number>>;
}
