import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Film, 
  Search, 
  Download, 
  Star, 
  X, 
  Play, 
  Check, 
  ShieldAlert, 
  Info, 
  RefreshCw, 
  Tv, 
  Layers, 
  List, 
  Edit3,
  Flame,
  TrendingUp,
  Compass,
  Clapperboard,
  Heart,
  Zap,
  Globe,
  Award,
  Smile,
  Video,
  ChevronRight,
  ArrowLeft,
  SlidersHorizontal
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as mediaApi from '../api/mediaApi';
import { 
  logSearch, 
  checkCloudMovie, 
  createPreOrder, 
  getMyPreOrders, 
  updatePreOrderStatus,
  type CloudMovie,
  type PreOrder
} from '../lib/firebase';
import { SEO } from '../components/SEO';
import type { MovieInfo } from '../types';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

// Genre / Category Filter Definition
export interface GenreItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  searchKeyword?: string;
  description?: string;
}

export const GENRE_FILTERS: GenreItem[] = [
  { id: 'all', label: 'All Discovery', icon: <Compass className="w-3.5 h-3.5" />, color: 'text-cyan-400', badgeBg: 'bg-cyan-500/15', badgeBorder: 'border-cyan-500/30', description: 'Curated 4K blockbuster library & popular releases' },
  { id: 'trending', label: 'Trending Hits', icon: <Flame className="w-3.5 h-3.5" />, color: 'text-amber-400', badgeBg: 'bg-amber-500/15', badgeBorder: 'border-amber-500/30', description: 'Most watched titles right now across cinema' },
  { id: 'popular', label: 'Popular Releases', icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'text-purple-400', badgeBg: 'bg-purple-500/15', badgeBorder: 'border-purple-500/30', searchKeyword: 'popular', description: 'Box office blockbusters and audience favorites' },
  { id: 'action', label: 'Action & Adventure', icon: <Zap className="w-3.5 h-3.5" />, color: 'text-rose-400', badgeBg: 'bg-rose-500/15', badgeBorder: 'border-rose-500/30', searchKeyword: 'action', description: 'High-octane fights, thrillers, stunts & superhero sagas' },
  { id: 'african', label: 'Nollywood & Africa', icon: <Globe className="w-3.5 h-3.5" />, color: 'text-emerald-400', badgeBg: 'bg-emerald-500/15', badgeBorder: 'border-emerald-500/30', searchKeyword: 'nollywood', description: 'Premier Nollywood blockbusters and authentic African cinema' },
  { id: 'kdrama', label: 'K-Drama & Asian', icon: <Tv className="w-3.5 h-3.5" />, color: 'text-pink-400', badgeBg: 'bg-pink-500/15', badgeBorder: 'border-pink-500/30', searchKeyword: 'kdrama', description: 'Addictive Korean dramas, anime series & Asian hits' },
  { id: 'comedy', label: 'Comedy & Laughs', icon: <Smile className="w-3.5 h-3.5" />, color: 'text-yellow-400', badgeBg: 'bg-yellow-500/15', badgeBorder: 'border-yellow-500/30', searchKeyword: 'comedy', description: 'Hilarious comedies, sitcoms and laugh-out-loud hits' },
  { id: 'romance', label: 'Romance & Love', icon: <Heart className="w-3.5 h-3.5" />, color: 'text-rose-400', badgeBg: 'bg-rose-500/15', badgeBorder: 'border-rose-500/30', searchKeyword: 'romance', description: 'Heartfelt romances, emotional chemistry & passionate stories' },
  { id: 'animation', label: 'Animation & Anime', icon: <Video className="w-3.5 h-3.5" />, color: 'text-indigo-400', badgeBg: 'bg-indigo-500/15', badgeBorder: 'border-indigo-500/30', searchKeyword: 'animation', description: 'Stunning animated features, Japanese anime & 3D films' },
  { id: 'scifi', label: 'Sci-Fi & Fantasy', icon: <Zap className="w-3.5 h-3.5" />, color: 'text-blue-400', badgeBg: 'bg-blue-500/15', badgeBorder: 'border-blue-500/30', searchKeyword: 'sci-fi', description: 'Mind-bending futures, space exploration & magical realms' },
  { id: 'horror', label: 'Horror & Thriller', icon: <ShieldAlert className="w-3.5 h-3.5" />, color: 'text-red-400', badgeBg: 'bg-red-500/15', badgeBorder: 'border-red-500/30', searchKeyword: 'horror', description: 'Spine-chilling scares, supernatural mysteries & psychological thrills' },
  { id: 'crime', label: 'Crime & Mystery', icon: <Clapperboard className="w-3.5 h-3.5" />, color: 'text-orange-400', badgeBg: 'bg-orange-500/15', badgeBorder: 'border-orange-500/30', searchKeyword: 'crime', description: 'Underworld heists, detective suspense & thrilling mysteries' },
  { id: 'drama', label: 'Drama & Stories', icon: <Film className="w-3.5 h-3.5" />, color: 'text-teal-400', badgeBg: 'bg-teal-500/15', badgeBorder: 'border-teal-500/30', searchKeyword: 'drama', description: 'Deep human stories, powerful acting and award-winning scripts' },
  { id: 'family', label: 'Family & Kids', icon: <Smile className="w-3.5 h-3.5" />, color: 'text-amber-300', badgeBg: 'bg-amber-400/15', badgeBorder: 'border-amber-400/30', searchKeyword: 'family', description: 'Wholesome entertainment and adventures for the whole family' },
  { id: 'top_rated', label: 'Top Rated (IMDb 8+)', icon: <Award className="w-3.5 h-3.5" />, color: 'text-amber-300', badgeBg: 'bg-amber-400/15', badgeBorder: 'border-amber-400/30', description: 'Critically acclaimed masterpieces with top IMDb scores' },
];

const RotatingSpinner = () => (
  <div className="w-8 h-8 relative">
    <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
    <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
  </div>
);

// Category visual helper
const getCategoryMeta = (catName: string) => {
  const lower = catName.toLowerCase();
  if (lower.includes('action') || lower.includes('fight') || lower.includes('war')) {
    return {
      genreId: 'action',
      icon: <Zap className="w-4 h-4 text-rose-400" />,
      tagline: 'High-octane blockbusters & adrenaline adventures',
      accentColor: 'from-rose-500 to-orange-500'
    };
  }
  if (lower.includes('africa') || lower.includes('nollywood') || lower.includes('nigeria')) {
    return {
      genreId: 'african',
      icon: <Globe className="w-4 h-4 text-emerald-400" />,
      tagline: 'Premier Nollywood & top African cinema hits',
      accentColor: 'from-emerald-500 to-teal-500'
    };
  }
  if (lower.includes('k-drama') || lower.includes('asian') || lower.includes('korean')) {
    return {
      genreId: 'kdrama',
      icon: <Tv className="w-4 h-4 text-pink-400" />,
      tagline: 'Addictive Korean dramas & emotional storytelling',
      accentColor: 'from-pink-500 to-purple-500'
    };
  }
  if (lower.includes('romance') || lower.includes('love') || lower.includes('passion')) {
    return {
      genreId: 'romance',
      icon: <Heart className="w-4 h-4 text-rose-400" />,
      tagline: 'Heartfelt romances, chemistry & emotional journeys',
      accentColor: 'from-rose-500 to-pink-500'
    };
  }
  if (lower.includes('animat') || lower.includes('cartoon') || lower.includes('anime')) {
    return {
      genreId: 'animation',
      icon: <Video className="w-4 h-4 text-cyan-400" />,
      tagline: 'Stunning animated features for all ages',
      accentColor: 'from-cyan-500 to-blue-500'
    };
  }
  if (lower.includes('comedy') || lower.includes('laugh')) {
    return {
      genreId: 'comedy',
      icon: <Smile className="w-4 h-4 text-yellow-400" />,
      tagline: 'Laugh-out-loud comedies and feel-good entertainment',
      accentColor: 'from-yellow-500 to-amber-500'
    };
  }
  if (lower.includes('sci-fi') || lower.includes('fantasy')) {
    return {
      genreId: 'scifi',
      icon: <Zap className="w-4 h-4 text-blue-400" />,
      tagline: 'Visionary science fiction & epic fantasy worlds',
      accentColor: 'from-blue-500 to-indigo-500'
    };
  }
  if (lower.includes('horror') || lower.includes('thrill')) {
    return {
      genreId: 'horror',
      icon: <ShieldAlert className="w-4 h-4 text-red-400" />,
      tagline: 'Dark mysteries, supernatural thrills & suspense',
      accentColor: 'from-red-500 to-rose-600'
    };
  }
  if (lower.includes('top rated') || lower.includes('acclaimed') || lower.includes('award')) {
    return {
      genreId: 'top_rated',
      icon: <Award className="w-4 h-4 text-amber-300" />,
      tagline: 'Critically acclaimed masterpieces & IMDb top rated',
      accentColor: 'from-amber-500 to-yellow-500'
    };
  }
  if (lower.includes('popular') || lower.includes('hot')) {
    return {
      genreId: 'popular',
      icon: <Flame className="w-4 h-4 text-amber-400" />,
      tagline: 'Most watched & trending across StreamAura Cinema',
      accentColor: 'from-amber-500 to-orange-500'
    };
  }
  return {
    genreId: 'trending',
    icon: <Clapperboard className="w-4 h-4 text-indigo-400" />,
    tagline: 'Specially curated entertainment selections',
    accentColor: 'from-indigo-500 to-cyan-500'
  };
};

interface ActiveSectionState {
  title: string;
  genreId: string;
  tagline?: string;
  icon?: React.ReactNode;
  items: MovieInfo[];
  page: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  searchFilter: string;
  sortBy: 'default' | 'rating' | 'year' | 'title';
}

// Module-level persistent cache across mounts / tab switches (0ms load time & zero blank screen)
interface MovieCacheState {
  trendingRows: {
    movie: { id: string; category: string; genreId: string; items: MovieInfo[] }[];
    series: { id: string; category: string; genreId: string; items: MovieInfo[] }[];
  };
  genreSections: Record<string, MovieInfo[]>;
  movieDetails: Map<string, MovieInfo>;
  savedScrollY: number;
  savedMainScrollTop: number;
  searchType: 'movie' | 'series';
  activeTab: 'search' | 'library';
  selectedGenre: string;
  query: string;
  searchResults: MovieInfo[];
  activeSection: ActiveSectionState | null;
}

const movieGlobalCache: MovieCacheState = {
  trendingRows: { movie: [], series: [] },
  genreSections: {},
  movieDetails: new Map(),
  savedScrollY: 0,
  savedMainScrollTop: 0,
  searchType: 'movie',
  activeTab: 'search',
  selectedGenre: 'all',
  query: '',
  searchResults: [],
  activeSection: null
};

// Global set of image URLs that have been successfully loaded across the session
const preloadedImageUrls = new Set<string>();

const MovieDownloader: React.FC = () => {
  const { user, requireAuth } = useAuth();
  const [query, setQuery] = useState(movieGlobalCache.query);
  const [searchType, setSearchType] = useState<'movie' | 'series'>(movieGlobalCache.searchType);
  const [activeTab, setActiveTab] = useState<'search' | 'library'>(movieGlobalCache.activeTab);
  
  const hasCachedTrending = movieGlobalCache.trendingRows[movieGlobalCache.searchType]?.length > 0;
  const [isSearching, setIsSearching] = useState(!hasCachedTrending && movieGlobalCache.activeTab === 'search');
  const [searchResults, setSearchResults] = useState<MovieInfo[]>(movieGlobalCache.searchResults);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(true);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);

  const [isTrending, setIsTrending] = useState(true);
  const [trendingRows, setTrendingRows] = useState<{ id: string; category: string; genreId: string; items: MovieInfo[] }[]>(
    movieGlobalCache.trendingRows[movieGlobalCache.searchType] || []
  );
  const [selectedGenre, setSelectedGenre] = useState<string>(movieGlobalCache.selectedGenre);
  
  // Dedicated Netflix/MovieBox Category/Genre View Section
  const [activeSection, setActiveSection] = useState<ActiveSectionState | null>(movieGlobalCache.activeSection);

  // Hero Spotlight Index
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const spotlightTimerRef = useRef<any>(null);

  // Detail View Section Ref for smooth scrolling & selection tracking
  const detailsSectionRef = useRef<HTMLDivElement>(null);
  const activeSelectionRef = useRef<string | null>(null);

  // Scroll Position Retention Ref
  const savedScrollRef = useRef<{ window: number; main: number }>({
    window: movieGlobalCache.savedScrollY,
    main: movieGlobalCache.savedMainScrollTop
  });

  const [myPreOrders, setMyPreOrders] = useState<PreOrder[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieInfo | null>(null);
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [activeTrailerKey, setActiveTrailerKey] = useState<string | null>(null);

  // Series Specific State
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualSeason, setManualSeason] = useState('');
  const [manualEpisode, setManualEpisode] = useState('');

  // Cloud Logic States
  const [cloudData, setCloudData] = useState<CloudMovie | null>(null);
  const [showPreOrderModal, setShowPreOrderModal] = useState(false);
  const [isPreOrdering, setIsPreOrdering] = useState(false);
  const [preOrderSuccess, setPreOrderSuccess] = useState(false);
  const [movieToPreOrder, setMovieToPreOrder] = useState<MovieInfo | null>(null);

  const { showError, showSuccess } = useToast();

  // Scroll position restorer
  const restoreScrollPosition = (instant: boolean = true) => {
    const targetWindow = savedScrollRef.current.window || movieGlobalCache.savedScrollY;
    const targetMain = savedScrollRef.current.main || movieGlobalCache.savedMainScrollTop;
    
    if (targetWindow > 0 || targetMain > 0) {
      requestAnimationFrame(() => {
        const mainEl = document.querySelector('main');
        if (mainEl && targetMain > 0) {
          mainEl.scrollTo({ top: targetMain, behavior: instant ? 'instant' : 'smooth' });
        }
        if (targetWindow > 0) {
          window.scrollTo({ top: targetWindow, behavior: instant ? 'instant' : 'smooth' });
        }
      });
    }
  };

  // Restore scroll on mount if coming back from another tab or view
  useEffect(() => {
    const timer = setTimeout(() => {
      restoreScrollPosition(true);
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Track active scroll position continuously when not on detail page
  useEffect(() => {
    const handleScrollCapture = () => {
      if (selectedMovie) return; // Never overwrite scroll while viewing details!
      
      const wScroll = window.scrollY || window.pageYOffset || 0;
      const mainEl = document.querySelector('main');
      const mScroll = mainEl ? mainEl.scrollTop : 0;
      
      if (wScroll > 0 || mScroll > 0) {
        savedScrollRef.current = { window: wScroll, main: mScroll };
        movieGlobalCache.savedScrollY = wScroll;
        movieGlobalCache.savedMainScrollTop = mScroll;
      }
    };

    window.addEventListener('scroll', handleScrollCapture, { passive: true });
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.addEventListener('scroll', handleScrollCapture, { passive: true });
    }
    return () => {
      window.removeEventListener('scroll', handleScrollCapture);
      if (mainEl) {
        mainEl.removeEventListener('scroll', handleScrollCapture);
      }
    };
  }, [selectedMovie]);

  const loadLibrary = async () => {
    if (!user) return;
    setIsLoadingLibrary(true);
    try {
      const data = await getMyPreOrders(user.uid);
      setMyPreOrders(data);
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'library') {
      loadLibrary();
    }
    movieGlobalCache.activeTab = activeTab;
  }, [activeTab, user?.uid]);

  useEffect(() => {
    movieGlobalCache.searchType = searchType;
  }, [searchType]);

  useEffect(() => {
    const checkAutoWatch = () => {
      const autoWatchData = sessionStorage.getItem('aura_auto_watch_movie');
      if (autoWatchData) {
        try {
          const movie = JSON.parse(autoWatchData);
          setCloudData({
            id: movie.movieId || movie.id || '',
            title: movie.title,
            thumbnail: movie.thumbnail || '',
            description: 'Pre-ordered content is now available.',
            year: new Date().getFullYear().toString(),
            rating: '8.5',
            streamUrl: movie.movieUrl || movie.streamUrl || '',
            downloadUrl: movie.movieUrl || movie.downloadUrl || '',
            mediaType: movie.mediaType || 'movie',
            season: movie.season,
            episode: movie.episode,
            addedAt: Date.now()
          } as any);
          
          if (movie.season) {
            setSelectedSeason(movie.season.toString());
          }
          if (movie.episode) {
            setSelectedEpisode(movie.episode.toString());
          }
          
          setShowPlayer(true);
        } catch (e) {
          console.error('[MovieDownloader] Error auto-watching pre-order:', e);
        } finally {
          sessionStorage.removeItem('aura_auto_watch_movie');
        }
      }
    };
    
    checkAutoWatch();
    
    window.addEventListener('focus', checkAutoWatch);
    return () => window.removeEventListener('focus', checkAutoWatch);
  }, []);

  // Format incoming raw array into structured 40-item tiles per row
  const formatRowsFromFlat = (items: MovieInfo[], type: 'movie' | 'series') => {
    if (!items || items.length === 0) return [];
    
    // Deduplicate items by ID
    const uniqueMap = new Map<string, MovieInfo>();
    items.forEach(item => {
      if (item.id && !uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    });
    const pool = Array.from(uniqueMap.values());

    const trendingList = pool.slice(0, 40);
    const topRatedList = [...pool].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)).slice(0, 40);
    const recentReleases = [...pool].sort((a, b) => Number(b.year || 0) - Number(a.year || 0)).slice(0, 40);
    const popularPicks = pool.length > 40 ? pool.slice(20, 60) : pool.slice(0, 40);
    const actionPicks = pool.slice(0, 40);
    const internationalPicks = pool.length > 30 ? pool.slice(10, 50) : pool.slice(0, 40);

    const rows = [
      {
        id: 'trending',
        category: type === 'movie' ? '🔥 Trending Movies' : '🔥 Trending TV Series',
        genreId: 'trending',
        items: trendingList.length > 0 ? trendingList : pool.slice(0, 40)
      },
      {
        id: 'top_rated',
        category: '🌟 Critically Acclaimed & Top Rated',
        genreId: 'top_rated',
        items: topRatedList.length > 0 ? topRatedList : pool.slice(0, 40)
      },
      {
        id: 'popular',
        category: '🍿 Popular on StreamAura Cinema',
        genreId: 'popular',
        items: popularPicks.length > 0 ? popularPicks : pool.slice(0, 40)
      },
      {
        id: 'action',
        category: '⚡ Action & High-Octane Thrillers',
        genreId: 'action',
        items: actionPicks.length > 0 ? actionPicks : pool.slice(0, 40)
      },
      {
        id: 'fresh',
        category: '✨ Fresh & New Releases',
        genreId: 'all',
        items: recentReleases.length > 0 ? recentReleases : pool.slice(0, 40)
      },
      {
        id: 'international',
        category: '🌍 Global Cinema, Nollywood & K-Drama',
        genreId: 'african',
        items: internationalPicks.length > 0 ? internationalPicks : pool.slice(0, 40)
      }
    ];

    return rows;
  };

  const loadTrending = async (force: boolean = false) => {
    const cached = movieGlobalCache.trendingRows[searchType];
    if (cached && cached.length > 0 && !force) {
      setTrendingRows(cached);
      setIsSearching(false);
      setIsTrending(true);
    } else {
      setIsSearching(true);
    }

    setSelectedMovie(null);
    setActiveSection(null);
    setSelectedGenre('all');
    movieGlobalCache.selectedGenre = 'all';
    movieGlobalCache.activeSection = null;

    try {
      const result = await mediaApi.getTrendingMovies(searchType);
      if (result.success && Array.isArray(result.data)) {
        let rows: { id: string; category: string; genreId: string; items: MovieInfo[] }[] = [];
        if (result.isRows || (result.data.length > 0 && (result.data[0] as any).category)) {
          // Backend returned categorized rows (MovieBox operatingList)
          rows = (result.data as any[]).map((cat, idx) => {
            const meta = getCategoryMeta(cat.category || '');
            return {
              id: `row-${idx}-${meta.genreId}`,
              category: cat.category,
              genreId: meta.genreId,
              items: cat.items || []
            };
          }).filter(r => r.items && r.items.length > 0);
          
          if (rows.length === 0) {
            rows = formatRowsFromFlat(result.data, searchType);
          }
        } else {
          // Flat list fallback
          rows = formatRowsFromFlat(result.data, searchType);
        }
        
        if (rows.length > 0) {
          setTrendingRows(rows);
          movieGlobalCache.trendingRows[searchType] = rows;
        }
        setSearchResults([]);
        setIsTrending(true);
      }
    } catch (err) {
      console.error('Failed to load trending:', err);
      if (!cached || cached.length === 0) {
        setTrendingRows([]);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (overrideQuery?: string, pageNum: number = 1) => {
    const q = overrideQuery !== undefined ? overrideQuery : query;
    if (!q.trim()) {
      loadTrending();
      return;
    }
    
    if (pageNum === 1) {
      setIsSearching(true);
      setSelectedMovie(null);
      setActiveSection(null);
      setIsTrending(false);
      setSearchPage(1);
      setSearchHasMore(true);
    } else {
      setIsLoadingMoreSearch(true);
    }

    try {
      if (pageNum === 1) {
        logSearch(q, searchType === 'movie' ? 'movie' : 'series', user?.uid);
      }
      const result = await mediaApi.searchMovies(q, searchType, pageNum, 40);
      if (result.success && result.data) {
        const newItems = result.data || [];
        if (pageNum === 1) {
          setSearchResults(newItems);
          movieGlobalCache.searchResults = newItems;
          movieGlobalCache.query = q;
        } else {
          setSearchResults(prev => {
            const seen = new Set(prev.map(p => p.id));
            const fresh = newItems.filter(i => !seen.has(i.id));
            const merged = [...prev, ...fresh];
            movieGlobalCache.searchResults = merged;
            return merged;
          });
        }
        if (newItems.length < 20) {
          setSearchHasMore(false);
        }
      } else {
        if (pageNum === 1) setSearchResults([]);
        setSearchHasMore(false);
      }
    } catch (err) {
      if (pageNum === 1) showError('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
      setIsLoadingMoreSearch(false);
    }
  };

  const handleLoadMoreSearchResults = () => {
    if (isLoadingMoreSearch || !searchHasMore) return;
    const nextPage = searchPage + 1;
    setSearchPage(nextPage);
    handleSearch(undefined, nextPage);
  };

  useEffect(() => {
    if (activeTab === 'search') {
      if (query.trim()) {
        handleSearch(query, 1);
      } else {
        loadTrending();
      }
    }
  }, [searchType, activeTab]);

  // Open dedicated Netflix/MovieBox Category/Genre View section
  const handleOpenSection = async (title: string, genreId: string, initialItems: MovieInfo[] = []) => {
    // 1. Capture scroll before opening section
    const wScroll = window.scrollY || window.pageYOffset || 0;
    const mainEl = document.querySelector('main');
    const mScroll = mainEl ? mainEl.scrollTop : 0;
    savedScrollRef.current = { window: wScroll, main: mScroll };
    movieGlobalCache.savedScrollY = wScroll;
    movieGlobalCache.savedMainScrollTop = mScroll;

    setSelectedMovie(null);
    setQuery('');
    const meta = getCategoryMeta(title);

    let itemsToDisplay = [...initialItems];

    // Check cached genre items first
    const cachedGenre = movieGlobalCache.genreSections[`${genreId}_${searchType}`];
    if (cachedGenre && cachedGenre.length > 0) {
      itemsToDisplay = cachedGenre;
    } else if (itemsToDisplay.length < 20 && genreId !== 'all') {
      setIsSearching(true);
      try {
        const res = await mediaApi.getMoviesByGenre(genreId, searchType, 1, 40);
        if (res.success && res.data && res.data.length > 0) {
          itemsToDisplay = res.data;
          movieGlobalCache.genreSections[`${genreId}_${searchType}`] = res.data;
        }
      } catch (err) {
        console.error('Failed to pre-fetch genre:', err);
      } finally {
        setIsSearching(false);
      }
    }

    const sectionState: ActiveSectionState = {
      title,
      genreId,
      tagline: meta.tagline,
      icon: meta.icon,
      items: itemsToDisplay,
      page: 1,
      hasMore: true,
      isLoadingMore: false,
      searchFilter: '',
      sortBy: 'default'
    };

    setActiveSection(sectionState);
    movieGlobalCache.activeSection = sectionState;
    movieGlobalCache.selectedGenre = genreId;

    window.scrollTo({ top: 0, behavior: 'instant' });
    mainEl?.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleCloseSection = () => {
    setActiveSection(null);
    movieGlobalCache.activeSection = null;
    setSelectedGenre('all');
    movieGlobalCache.selectedGenre = 'all';

    requestAnimationFrame(() => {
      restoreScrollPosition(true);
    });
  };

  // Load 40 more titles inside the dedicated genre / category section
  const handleLoadMoreSection = async () => {
    if (!activeSection || activeSection.isLoadingMore || !activeSection.hasMore) return;

    setActiveSection(prev => prev ? ({ ...prev, isLoadingMore: true }) : null);
    const nextPage = activeSection.page + 1;

    try {
      const res = await mediaApi.getMoviesByGenre(activeSection.genreId, searchType, nextPage, 40);
      if (res.success && res.data && res.data.length > 0) {
        const incoming = res.data;
        setActiveSection(prev => {
          if (!prev) return null;
          const seen = new Set(prev.items.map(m => m.id));
          const uniqueIncoming = incoming.filter(m => !seen.has(m.id));
          const updatedItems = [...prev.items, ...uniqueIncoming];
          movieGlobalCache.genreSections[`${prev.genreId}_${searchType}`] = updatedItems;
          return {
            ...prev,
            items: updatedItems,
            page: nextPage,
            isLoadingMore: false,
            hasMore: uniqueIncoming.length > 0
          };
        });
      } else {
        setActiveSection(prev => prev ? ({ ...prev, hasMore: false, isLoadingMore: false }) : null);
      }
    } catch (err) {
      console.error('Failed to load more section items:', err);
      setActiveSection(prev => prev ? ({ ...prev, isLoadingMore: false }) : null);
    }
  };

  // Genre filter pill selection handler
  const handleGenreSelect = async (genre: GenreItem) => {
    setSelectedGenre(genre.id);
    movieGlobalCache.selectedGenre = genre.id;
    setSelectedMovie(null);

    if (genre.id === 'all') {
      handleCloseSection();
      setQuery('');
      if (trendingRows.length === 0) {
        loadTrending();
      } else {
        setIsTrending(true);
      }
      return;
    }

    // Check if we have matching items locally in trendingRows
    const matchedRow = trendingRows.find(r => 
      r.id === genre.id || 
      r.genreId === genre.id || 
      r.category.toLowerCase().includes(genre.id.toLowerCase()) ||
      (genre.searchKeyword && r.category.toLowerCase().includes(genre.searchKeyword.toLowerCase()))
    );

    const initial = matchedRow ? matchedRow.items : [];
    await handleOpenSection(genre.label, genre.id, initial);
  };

  // Hero Spotlight Featured Items
  const spotlightItems = useMemo(() => {
    if (trendingRows.length === 0) return searchResults.slice(0, 6);
    for (const r of trendingRows) {
      if (r.items && r.items.length > 0) {
        return r.items.slice(0, 6);
      }
    }
    return searchResults.slice(0, 6);
  }, [trendingRows, searchResults]);

  // Auto-rotate spotlight
  useEffect(() => {
    if (spotlightItems.length <= 1) return;
    if (spotlightTimerRef.current) clearInterval(spotlightTimerRef.current);

    spotlightTimerRef.current = setInterval(() => {
      setSpotlightIndex(prev => (prev + 1) % spotlightItems.length);
    }, 8000);

    return () => {
      if (spotlightTimerRef.current) clearInterval(spotlightTimerRef.current);
    };
  }, [spotlightItems.length]);

  const handleBackToDiscovery = () => {
    activeSelectionRef.current = null;
    setSelectedMovie(null);
    setCloudData(null);
    setIsCheckingCloud(false);

    // Smooth instantaneous scroll restoration without resetting to top
    requestAnimationFrame(() => {
      restoreScrollPosition(true);
    });
  };

  const handleSelectMovie = async (movie: MovieInfo) => {
    // 1. Capture exact current scroll position before opening details
    const wScroll = window.scrollY || window.pageYOffset || 0;
    const mainEl = document.querySelector('main');
    const mScroll = mainEl ? mainEl.scrollTop : 0;
    savedScrollRef.current = { window: wScroll, main: mScroll };
    movieGlobalCache.savedScrollY = wScroll;
    movieGlobalCache.savedMainScrollTop = mScroll;

    const requestId = `${movie.id}_${Date.now()}`;
    activeSelectionRef.current = requestId;

    // Check if we have cached details for 0ms instant display
    const cachedDetails = movieGlobalCache.movieDetails.get(movie.id);
    setSelectedMovie(cachedDetails || movie);
    setCloudData(null);
    setPreOrderSuccess(false);
    setSelectedSeason(null);
    setSelectedEpisode(null);
    setIsManualMode(false);
    setIsCheckingCloud(true);
    
    // Scroll smoothly to top of detail view
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainEl?.scrollTo({ top: 0, behavior: 'instant' });

    try {
      const result = await mediaApi.getMovieDetails(
        movie.id, 
        movie.mediaType || searchType, 
        movie.title, 
        undefined, 
        undefined, 
        movie.detailPath,
        movie.thumbnail,
        movie.year,
        movie.rating,
        movie.description
      );
      
      if (activeSelectionRef.current !== requestId) return;

      if (result.success && result.data) {
        const fetchedData = result.data;
        // MERGE: Preserve original card details so image, rating, year, and description never disappear
        const merged: MovieInfo = {
          ...movie,
          ...fetchedData,
          thumbnail: (fetchedData.thumbnail && fetchedData.thumbnail.trim()) || (movie.thumbnail && movie.thumbnail.trim()) || '',
          title: (fetchedData.title && fetchedData.title !== 'Unknown Title' && fetchedData.title.trim()) || movie.title || '',
          year: (fetchedData.year && fetchedData.year !== 'N/A' && fetchedData.year !== '0' && fetchedData.year.trim()) || movie.year || '',
          rating: (fetchedData.rating && fetchedData.rating !== '0.0' && fetchedData.rating.trim()) || movie.rating || '7.5',
          description: (fetchedData.description && fetchedData.description !== 'No description available.' && fetchedData.description !== '4K streaming & high-speed cloud download available for pre-order.' && fetchedData.description.trim()) || movie.description || fetchedData.description || '4K streaming & high-speed cloud download available for pre-order.',
          tmdb: fetchedData.tmdb || movie.tmdb,
          qualities: fetchedData.qualities && fetchedData.qualities.length > 0 ? fetchedData.qualities : (movie.qualities || []),
          seasons: fetchedData.seasons && fetchedData.seasons.length > 0 ? fetchedData.seasons : (movie.seasons || [])
        };

        movieGlobalCache.movieDetails.set(movie.id, merged);
        setSelectedMovie(merged);
        
        if (merged.mediaType === 'series') {
           if (merged.seasons && merged.seasons.length > 0) {
              const firstSeason = merged.seasons[0];
              setSelectedSeason(firstSeason.season.toString());
              if (firstSeason.episodes && firstSeason.episodes.length > 0) {
                await handleSelectEpisode(firstSeason.season.toString(), firstSeason.episodes[0].toString(), merged.id, merged.title);
              }
           } else {
              setIsManualMode(true);
           }
        } else if (merged.mediaType === 'movie') {
          const cloud = await checkCloudMovie(merged.id);
          if (activeSelectionRef.current !== requestId) return;
          if (cloud) setCloudData(cloud);
        }
      }
    } catch (err) {
      if (activeSelectionRef.current === requestId) {
        console.error('Error loading movie details');
        setIsManualMode(true);
      }
    } finally {
      if (activeSelectionRef.current === requestId) {
        setIsCheckingCloud(false);
      }
    }
  };

  const handleSelectEpisode = async (season: string, episode: string, movieIdOverride?: string, movieTitleOverride?: string) => {
    const movieId = movieIdOverride || selectedMovie?.id;
    const movieTitle = movieTitleOverride || selectedMovie?.title;
    if (!movieId) return;

    const currentReq = activeSelectionRef.current;
    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setIsCheckingCloud(true);
    setCloudData(null);
    
    try {
      const cloud = await checkCloudMovie(movieId, season, episode);
      if (activeSelectionRef.current !== currentReq) return;
      if (cloud) {
        setCloudData(cloud);
      } else {
        await mediaApi.getMovieDetails(
          movieId, 
          'series', 
          movieTitle, 
          Number(season), 
          Number(episode), 
          selectedMovie?.detailPath || (movieId.startsWith('/detail/') ? movieId : undefined),
          selectedMovie?.thumbnail,
          selectedMovie?.year,
          selectedMovie?.rating,
          selectedMovie?.description
        );
      }
    } catch (err) {
      console.error('Error checking episode cloud');
    } finally {
      if (activeSelectionRef.current === currentReq && !movieIdOverride) {
        setIsCheckingCloud(false);
      }
    }
  };

  const handlePreOrder = () => {
    requireAuth(() => {
      setMovieToPreOrder(selectedMovie);
      setShowPreOrderModal(true);
    });
  };

  const confirmPreOrder = async () => {
    if (!user || !movieToPreOrder) return;
    setIsPreOrdering(true);
    try {
      await createPreOrder(
        user.uid, 
        user.email || '', 
        user.displayName || 'User', 
        movieToPreOrder,
        selectedSeason || undefined,
        selectedEpisode || undefined
      );
      setPreOrderSuccess(true);
      showSuccess('Pre-order placed successfully!');
      setShowPreOrderModal(false);
    } catch (err: any) {
      showError(err.message || 'Failed to place pre-order');
    } finally {
      setIsPreOrdering(false);
    }
  };

  const handleDownload = () => {
    requireAuth(() => {
      if (!cloudData) return;
      window.open(cloudData.downloadUrl, '_blank');
    });
  };

  const handleWatchNow = () => {
    requireAuth(() => {
      if (!cloudData) return;
      setShowPlayer(true);
    });
  };

  const handleUpdateStatus = async (preOrderId: string, status: 'watched' | 'downloaded') => {
    try {
      await updatePreOrderStatus(preOrderId, status);
      showSuccess(`Marked as ${status}!`);
      loadLibrary();
    } catch (err) {
      showError('Failed to update status');
    }
  };

  const handleCreateRoomFromPreOrder = (preOrder: PreOrder) => {
    const url = new URL(window.location.origin);
    url.searchParams.set('tab', 'cinema');
    url.searchParams.set('create', 'true');
    url.searchParams.set('movie_id', preOrder.movieId);
    url.searchParams.set('title', preOrder.title);
    url.searchParams.set('thumbnail', preOrder.thumbnail);
    url.searchParams.set('movie_url', preOrder.movieUrl || '');
    if (preOrder.season) url.searchParams.set('season', preOrder.season.toString());
    if (preOrder.episode) url.searchParams.set('episode', preOrder.episode.toString());
    window.location.href = url.toString();
  };

  // Section filtered and sorted items calculation
  const filteredSectionItems = useMemo(() => {
    if (!activeSection) return [];
    let list = [...activeSection.items];

    if (activeSection.searchFilter.trim()) {
      const f = activeSection.searchFilter.toLowerCase().trim();
      list = list.filter(m => m.title.toLowerCase().includes(f));
    }

    if (activeSection.sortBy === 'rating') {
      list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    } else if (activeSection.sortBy === 'year') {
      list.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    } else if (activeSection.sortBy === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }

    return list;
  }, [activeSection]);

  const currentSpotlight = spotlightItems[spotlightIndex];
  const spotlightThumbnail = currentSpotlight
    ? ((currentSpotlight.tmdb?.backdrop && currentSpotlight.tmdb.backdrop.trim()) || 
       (currentSpotlight.tmdb?.poster && currentSpotlight.tmdb.poster.trim()) || 
       (currentSpotlight.thumbnail && currentSpotlight.thumbnail.trim()) || null)
    : null;

  const detailPosterSrc = selectedMovie
    ? ((selectedMovie.tmdb?.poster && selectedMovie.tmdb.poster.trim()) || (selectedMovie.thumbnail && selectedMovie.thumbnail.trim()) || null)
    : null;

  const detailBackdropSrc = selectedMovie?.tmdb?.backdrop && selectedMovie.tmdb.backdrop.trim()
    ? selectedMovie.tmdb.backdrop
    : null;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-32 text-foreground">
      {selectedMovie && (
        <SEO 
          title={selectedMovie.title}
          description={selectedMovie.description || `Watch ${selectedMovie.title} on StreamAura Cinema.`}
          image={detailPosterSrc || undefined}
        />
      )}
      
      {/* 1. Header Banner & Mode Switches */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-[#0b1021] via-[#0d1630] to-[#120e29] border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Ambient Lighting Gradients */}
          <div className="absolute -top-24 -left-24 w-60 h-60 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center gap-4 relative z-10 text-center md:text-left">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transform-gpu transition-transform hover:scale-105 ${
                searchType === 'movie' 
                  ? 'bg-gradient-to-br from-cyan-500 to-blue-600 shadow-cyan-500/25' 
                  : 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-500/25'
              }`}
            >
              {searchType === 'movie' ? <Film className="w-7 h-7 text-white" /> : <Tv className="w-7 h-7 text-white" />}
            </div>
            
            <div>
              <div className="flex items-center justify-center md:justify-start gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest text-cyan-300">
                  ● 4K Cinema Hub
                </span>
                <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" /> Instant Streaming & Pre-Orders
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase mt-0.5">
                Stream<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Aura</span> Cinema
              </h2>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 relative z-10">
            {/* View Switcher: Explore vs Library */}
            <div className="flex p-1 bg-black/40 rounded-2xl border border-white/10">
              <button 
                onClick={() => {
                  setActiveTab('search');
                  setActiveSection(null);
                }}
                className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'search' 
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20' 
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Browse & Discover
              </button>
              <button 
                onClick={() => {
                  setActiveTab('library');
                  setSelectedMovie(null);
                }}
                className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'library' 
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/20' 
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <span>My Library</span>
                {myPreOrders.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-white text-black text-[9px] font-black">
                    {myPreOrders.length}
                  </span>
                )}
              </button>
            </div>

            {/* Type Switcher: Movies vs TV Series */}
            {activeTab === 'search' && (
              <div className="flex p-1 bg-black/40 rounded-2xl border border-white/10">
                <button 
                  onClick={() => setSearchType('movie')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    searchType === 'movie' 
                      ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20' 
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Movies</span>
                </button>
                <button 
                  onClick={() => setSearchType('series')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    searchType === 'series' 
                      ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20' 
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>TV Series</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'search' ? (
        <>
          {/* 2. Interactive Search & Quick Genre Selector Bar */}
          <div className="space-y-4">
            {/* Search Input Box */}
            <div className="p-3 rounded-2xl flex flex-col sm:flex-row gap-3 border border-white/10 bg-[#090e1c] shadow-xl">
              <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-cyan-400 transition-colors w-5 h-5" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (!e.target.value.trim()) {
                      loadTrending();
                    }
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(undefined, 1)}
                  placeholder={searchType === 'movie' ? "Search 10,000+ movies, 4K titles, actors, genres..." : "Search TV series, anime, drama seasons, episodes..."}
                  className="w-full bg-white/[0.04] border border-white/10 pl-12 pr-12 py-3.5 rounded-xl text-sm text-white placeholder:text-white/40 outline-none focus:border-cyan-500/50 transition-all font-medium"
                />
                {query && (
                  <button 
                    onClick={() => {
                      setQuery('');
                      loadTrending();
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                onClick={() => handleSearch(undefined, 1)}
                disabled={isSearching || !query.trim()}
                className="px-8 py-3.5 rounded-xl font-black uppercase tracking-wider text-xs text-white bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center min-w-[140px] gap-2 transition-all cursor-pointer active:scale-95"
              >
                {isSearching ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                <span>{isSearching ? 'Searching...' : 'Search'}</span>
              </button>
            </div>

            {/* Categorized Genre Filter Chips Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden overscroll-x-contain touch-pan-x">
              {GENRE_FILTERS.map((genre) => {
                const isSelected = activeSection ? activeSection.genreId === genre.id : selectedGenre === genre.id;
                return (
                  <button
                    key={genre.id}
                    onClick={() => handleGenreSelect(genre)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer active:scale-95 ${
                      isSelected
                        ? `${genre.badgeBg} ${genre.badgeBorder} ${genre.color} shadow-lg shadow-black/40 ring-1 ring-white/20`
                        : 'bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <span className={isSelected ? genre.color : 'text-white/50'}>{genre.icon}</span>
                    <span>{genre.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Main Views: Movie Detail View (animated on top) AND Discovery/Section Tree (preserved in DOM) */}
          <AnimatePresence>
            {selectedMovie && (
              /* A. MOVIE DETAILS VIEW */
              <motion.div 
                key="details" 
                ref={detailsSectionRef}
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }} 
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {/* Back Button */}
                <button 
                  onClick={handleBackToDiscovery} 
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white flex items-center gap-2 font-black uppercase tracking-wider transition-all border border-white/15 cursor-pointer active:scale-95 shadow-md"
                >
                  <ArrowLeft className="w-4 h-4" /> 
                  <span>{activeSection ? `Back to ${activeSection.title}` : 'Back to Cinema Discovery'}</span>
                </button>
                
                {/* Detail Glass Container */}
                <div className="p-6 md:p-10 rounded-3xl border border-white/10 relative overflow-hidden shadow-2xl bg-[#070b19]">
                  {detailBackdropSrc && (
                    <div className="absolute inset-0 h-96 overflow-hidden rounded-t-3xl z-0 pointer-events-none">
                      <img src={detailBackdropSrc} className="w-full h-full object-cover opacity-25" alt="Backdrop" />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#070b19]/80 to-[#070b19]" />
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row gap-8 relative z-10">
                    {/* Poster Column */}
                    <div className="w-full md:w-72 flex-shrink-0">
                      <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-black border-2 border-cyan-400/80 shadow-[0_0_35px_rgba(6,182,212,0.3)] ring-4 ring-cyan-500/20 relative group">
                        {detailPosterSrc ? (
                          <img 
                            src={detailPosterSrc} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                            alt={selectedMovie.title} 
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white/40 gap-2">
                            <Film className="w-10 h-10" />
                            <span className="text-[10px] uppercase font-bold">No Image Available</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-bold">
                          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-black font-black flex items-center gap-1">
                            <Star className="w-3 h-3 fill-current" /> {selectedMovie.rating || '7.5'}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-black/80 border border-white/20 text-white font-mono uppercase">
                            {selectedMovie.year && selectedMovie.year !== 'N/A' && selectedMovie.year !== '0' ? selectedMovie.year : '4K UHD'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Metadata Column */}
                    <div className="flex-1 space-y-6">
                      <div>
                        {selectedMovie.tmdb?.tagline && (
                          <p className="text-xs font-bold text-cyan-400 italic mb-1">"{selectedMovie.tmdb.tagline}"</p>
                        )}
                        <h3 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white leading-tight">
                          {selectedMovie.title}
                        </h3>
                        
                        {/* Badges & Actions */}
                        <div className="flex flex-wrap gap-2.5 items-center mt-3">
                          <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-black border border-amber-500/30 flex items-center gap-1.5">
                            <Star className="w-3.5 h-3.5 fill-current" /> {selectedMovie.rating || '7.5'} IMDb
                            {selectedMovie.tmdb?.voteCount ? ` (${selectedMovie.tmdb.voteCount.toLocaleString()} votes)` : ''}
                          </span>
                          
                          {selectedMovie.year && selectedMovie.year !== 'N/A' && selectedMovie.year !== '0' && (
                            <span className="px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-bold border border-white/15">
                              {selectedMovie.year}
                            </span>
                          )}

                          <span className={`px-3 py-1 rounded-full text-xs font-black uppercase border ${
                            selectedMovie.mediaType === 'series' 
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                              : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                          }`}>
                            {selectedMovie.mediaType === 'series' ? '📺 TV Series' : '🎬 Movie'}
                          </span>

                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black border border-emerald-500/30 uppercase">
                            4K Ultra HD
                          </span>

                          {selectedMovie.tmdb?.videos && selectedMovie.tmdb.videos.length > 0 && (
                            <button 
                              onClick={() => {
                                const tmdb = selectedMovie.tmdb;
                                if (tmdb && tmdb.videos) {
                                  const trailer = tmdb.videos.find(v => v.type === 'Trailer') || tmdb.videos[0];
                                  if (trailer) setActiveTrailerKey(trailer.key);
                                }
                              }}
                              className="px-3.5 py-1 rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-xs font-black border border-cyan-500/30 flex items-center gap-1.5 uppercase transition-all active:scale-95 cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-current" /> Watch Trailer
                            </button>
                          )}
                        </div>

                        {/* Genre Chips */}
                        {selectedMovie.tmdb?.genres && selectedMovie.tmdb.genres.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-4">
                            {selectedMovie.tmdb.genres.map((g, idx) => (
                              <span key={`genre-${idx}`} className="px-3 py-1 rounded-xl bg-white/5 border border-white/10 text-white/80 text-xs font-semibold">
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Overview Synopsis */}
                      {selectedMovie.tmdb?.overview || selectedMovie.description ? (
                        <p className="text-white/80 leading-relaxed text-sm sm:text-base font-normal">
                          {selectedMovie.tmdb?.overview || selectedMovie.description}
                        </p>
                      ) : null}

                      {/* Seasons & Episodes for Series */}
                      {selectedMovie.mediaType === 'series' && (
                        <div className="space-y-5 pt-4 border-t border-white/10">
                          <div className="flex justify-between items-center bg-white/[0.03] p-3.5 rounded-2xl border border-white/10">
                            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                              <Layers className="w-4 h-4 text-purple-400" /> Season & Episode Navigator
                            </h4>
                            <button 
                              onClick={() => setIsManualMode(!isManualMode)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                isManualMode 
                                    ? 'bg-purple-600 text-white shadow-md' 
                                    : 'bg-white/10 text-white/70 hover:text-white'
                              }`}
                            >
                              {isManualMode ? <List className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                              <span>{isManualMode ? 'Show List' : 'Enter Manually'}</span>
                            </button>
                          </div>

                          {!isManualMode ? (
                            <>
                              {selectedMovie.seasons && selectedMovie.seasons.length > 0 ? (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap gap-2">
                                    {selectedMovie.seasons.map(s => {
                                      const isSeasonActive = selectedSeason !== null && selectedSeason === s.season.toString();
                                      return (
                                        <button 
                                          key={`season-btn-${s.season}`}
                                          type="button"
                                          onClick={() => {
                                            setSelectedSeason(s.season.toString());
                                            setSelectedEpisode(null);
                                            setCloudData(null);
                                          }}
                                          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                                            isSeasonActive 
                                              ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/30 scale-105' 
                                              : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                                          }`}
                                        >
                                          Season {s.season}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {selectedSeason !== null && (
                                    <div className="space-y-2 pt-2">
                                      <h5 className="text-[11px] font-black uppercase tracking-wider text-white/60 flex items-center gap-1.5">
                                        <List className="w-3.5 h-3.5" /> Episodes in Season {selectedSeason}
                                      </h5>
                                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-2">
                                        {selectedMovie.seasons?.find(s => s.season.toString() === selectedSeason)?.episodes.map(ep => {
                                          const isEpActive = selectedEpisode !== null && selectedEpisode === ep.toString();
                                          return (
                                            <button 
                                              key={`ep-btn-${ep}`}
                                              type="button"
                                              onClick={() => handleSelectEpisode(selectedSeason, ep.toString())}
                                              className={`h-10 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center justify-center ${
                                                isEpActive 
                                                  ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/25 scale-105' 
                                                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                                              }`}
                                            >
                                              {ep}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold uppercase text-white/60">Season Number</label>
                                      <input 
                                        type="text" 
                                        value={manualSeason} 
                                        onChange={e => setManualSeason(e.target.value)}
                                        placeholder="e.g. 1"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-purple-500"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold uppercase text-white/60">Episode Number</label>
                                      <input 
                                        type="text" 
                                        value={manualEpisode} 
                                        onChange={e => setManualEpisode(e.target.value)}
                                        placeholder="e.g. 1 or 2"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-purple-500"
                                      />
                                    </div>
                                  </div>
                                  <Button 
                                    onClick={() => {
                                      if (manualSeason && manualEpisode) {
                                        handleSelectEpisode(manualSeason, manualEpisode);
                                      } else {
                                        showError('Please enter both Season and Episode.');
                                      }
                                    }}
                                    className="w-full h-11 rounded-xl text-xs font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white shadow-lg"
                                  >
                                    Check Episode Availability
                                  </Button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="p-5 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-purple-300">Enter Season</label>
                                  <input 
                                    type="text" 
                                    value={manualSeason} 
                                    onChange={e => setManualSeason(e.target.value)}
                                    placeholder="e.g. 1"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-purple-500"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-purple-300">Enter Episode</label>
                                  <input 
                                    type="text" 
                                    value={manualEpisode} 
                                    onChange={e => setManualEpisode(e.target.value)}
                                    placeholder="e.g. 1"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-purple-500"
                                  />
                                </div>
                              </div>
                              <Button 
                                onClick={() => {
                                  if (manualSeason && manualEpisode) {
                                    handleSelectEpisode(manualSeason, manualEpisode);
                                  } else {
                                    showError('Please enter both numbers.');
                                  }
                                }}
                                className="w-full h-11 rounded-xl text-xs font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white shadow-lg"
                              >
                                Check Custom Episode
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Cloud Availability & Action CTA */}
                      <div className="pt-6 border-t border-white/10">
                        {isCheckingCloud ? (
                          <div className="py-8 flex flex-col items-center gap-3">
                            <RotatingSpinner />
                            <p className="text-xs font-black uppercase tracking-wider text-cyan-400 animate-pulse">Checking 4K Cloud Streaming Links...</p>
                          </div>
                        ) : cloudData ? (
                          <div className="space-y-4">
                            {selectedMovie.mediaType === 'series' && (
                              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex gap-3 items-center">
                                <Check className="text-emerald-400 w-5 h-5 flex-shrink-0" />
                                <p className="text-xs text-emerald-300 font-bold uppercase tracking-wider">
                                  Episode {selectedEpisode} (Season {selectedSeason}) is ready to stream in 4K!
                                </p>
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <button 
                                onClick={handleWatchNow} 
                                className="py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-2xl font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 shadow-xl shadow-cyan-600/30 transition-all cursor-pointer active:scale-95"
                              >
                                <Play fill="currentColor" className="w-4 h-4" /> Watch Now (4K Player)
                              </button>
                              <button 
                                onClick={handleDownload} 
                                className="py-4 bg-white/10 hover:bg-white/15 text-white rounded-2xl font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 border border-white/15 transition-all cursor-pointer active:scale-95"
                              >
                                <Download className="w-4 h-4" /> Download 4K Video
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {(selectedMovie.mediaType === 'movie' || selectedEpisode !== null) && (
                              <>
                                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex gap-3 items-center">
                                  <ShieldAlert className="text-amber-400 w-5 h-5 flex-shrink-0" />
                                  <p className="text-xs text-amber-200 font-medium leading-relaxed">
                                    {selectedMovie.mediaType === 'series' 
                                      ? `Episode ${selectedEpisode} of Season ${selectedSeason} is not in our cloud cache yet.` 
                                      : "This movie is queued for upload."} 
                                    Pre-order now for high-speed cloud provisioning.
                                  </p>
                                </div>
                                <button 
                                  onClick={handlePreOrder} 
                                  className="w-full py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-black font-black uppercase tracking-wider text-xs rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                                >
                                  {preOrderSuccess ? <Check className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                  <span>{preOrderSuccess ? 'Pre-Order Requested!' : (selectedMovie.mediaType === 'series' ? 'Pre-Order Episode' : 'Pre-Order Movie')}</span>
                                </button>
                              </>
                            )}
                            {selectedMovie.mediaType === 'series' && !selectedSeason && (
                              <div className="text-center py-6 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                                <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Select a season and episode to check streaming status</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* TMDB Cast Section */}
                  {selectedMovie.tmdb?.cast && selectedMovie.tmdb.cast.length > 0 && (
                    <div className="space-y-3 pt-8 mt-8 border-t border-white/10 relative z-10">
                      <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" /> Cast & Starring Actors
                      </h4>
                      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden overscroll-x-contain touch-pan-x">
                        {selectedMovie.tmdb.cast.map((c, idx) => {
                          const avatarSrc = c.avatar && c.avatar.trim() ? c.avatar : null;
                          return (
                            <div key={`cast-${idx}`} className="w-24 flex-shrink-0 text-center space-y-2">
                              <div className="w-16 h-16 rounded-full overflow-hidden bg-white/5 border border-white/15 mx-auto shadow-md">
                                {avatarSrc ? (
                                  <img src={avatarSrc} className="w-full h-full object-cover" alt={c.name} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs font-black text-white/40 uppercase bg-white/5">
                                    {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </div>
                                )}
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[11px] font-bold text-white truncate leading-tight">{c.name}</p>
                                <p className="text-[9px] text-white/50 truncate leading-tight">{c.character}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TMDB Similar Movies Section */}
                  {selectedMovie.tmdb?.similar && selectedMovie.tmdb.similar.length > 0 && (
                    <div className="space-y-3 pt-8 mt-8 border-t border-white/10 relative z-10">
                      <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-400" /> More Like This
                      </h4>
                      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden overscroll-x-contain touch-pan-x">
                        {selectedMovie.tmdb.similar.map((s, idx) => {
                          const simThumbnail = s.thumbnail && s.thumbnail.trim() ? s.thumbnail : null;
                          return (
                            <div 
                              key={`similar-${s.id}-${idx}`} 
                              onClick={() => handleSelectMovie(s as any)}
                              className="w-32 sm:w-36 flex-shrink-0 cursor-pointer group space-y-2 text-left"
                            >
                              <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 relative shadow-md group-hover:border-cyan-500/50 transition-colors">
                                {simThumbnail ? (
                                  <img src={simThumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={s.title} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40 uppercase bg-white/5">No Image</div>
                                )}
                                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-black text-amber-400 flex items-center gap-0.5 shadow-md">
                                  <Star className="w-2.5 h-2.5 fill-current" /> {s.rating}
                                </div>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[11px] font-bold text-white/90 truncate leading-tight group-hover:text-cyan-400 transition-colors">{s.title}</p>
                                <p className="text-[10px] text-white/50">{s.year}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TMDB Reviews Section */}
                  {selectedMovie.tmdb?.reviews && selectedMovie.tmdb.reviews.length > 0 && (
                    <div className="space-y-3 pt-8 mt-8 border-t border-white/10 relative z-10">
                      <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400" /> Audience Reviews
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-none">
                        {selectedMovie.tmdb.reviews.map((r, idx) => (
                          <div key={`review-${idx}`} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2 flex flex-col justify-between">
                            <p className="text-xs text-white/75 leading-relaxed italic line-clamp-4">
                              "{r.content}"
                            </p>
                            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                              <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-black uppercase">
                                {r.author ? r.author[0] : 'U'}
                              </div>
                              <p className="text-[11px] font-bold text-white">{r.author}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* B. DISCOVERY & SECTION TREE (Always preserved in DOM to retain scroll positions & image decodes) */}
          <div className={selectedMovie ? "hidden" : "space-y-8"}>
            {activeSection ? (
              /* DEDICATED CATEGORY / GENRE FULL SECTION VIEW (Netflix & MovieBox Style) */
              <div
                key={`section-${activeSection.genreId}`}
                className="space-y-6"
              >
                {/* Dedicated Section Top Header Bar */}
                <div className="p-5 sm:p-7 rounded-3xl bg-gradient-to-r from-[#0b1021] via-[#0d1630] to-[#120e29] border border-white/10 shadow-2xl relative overflow-hidden space-y-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleCloseSection}
                        className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 border border-white/15 transition-all cursor-pointer active:scale-95 shadow-md flex-shrink-0"
                      >
                        <ArrowLeft className="w-4 h-4" /> <span>Back to Browse</span>
                      </button>
                      <div className="p-2.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex-shrink-0">
                        {activeSection.icon || <Film className="w-5 h-5" />}
                      </div>
                      <div>
                        <h2 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight">
                          {activeSection.title}
                        </h2>
                        {activeSection.tagline && (
                          <p className="text-xs text-white/60 font-medium hidden sm:block">{activeSection.tagline}</p>
                        )}
                      </div>
                    </div>

                    {/* In-Section Quick Filter */}
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" />
                      <input
                        type="text"
                        value={activeSection.searchFilter}
                        onChange={(e) => setActiveSection(prev => prev ? ({ ...prev, searchFilter: e.target.value }) : null)}
                        placeholder={`Filter in ${activeSection.title}...`}
                        className="w-full bg-black/40 border border-white/10 pl-10 pr-8 py-2.5 rounded-xl text-xs text-white placeholder:text-white/40 outline-none focus:border-cyan-500/50"
                      />
                      {activeSection.searchFilter && (
                        <button
                          onClick={() => setActiveSection(prev => prev ? ({ ...prev, searchFilter: '' }) : null)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sub-sort and filter chips */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <span className="text-[11px] font-bold text-white/40 uppercase mr-1 flex items-center gap-1 flex-shrink-0">
                      <SlidersHorizontal className="w-3 h-3 text-cyan-400" /> Sort & Filter:
                    </span>
                    {[
                      { id: 'default', label: 'All Titles' },
                      { id: 'rating', label: 'Top Rated (IMDb 8+)' },
                      { id: 'year', label: 'Newest Releases' },
                      { id: 'title', label: 'A - Z' }
                    ].map(filter => (
                      <button
                        key={filter.id}
                        onClick={() => setActiveSection(prev => prev ? ({ ...prev, sortBy: filter.id as any }) : null)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                          activeSection.sortBy === filter.id
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-md ring-1 ring-cyan-500/30'
                            : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section Responsive Grid */}
                {filteredSectionItems.length === 0 ? (
                  <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-white/[0.01] space-y-3">
                    <Clapperboard className="w-12 h-12 text-white/30 mx-auto" />
                    <h4 className="text-sm font-bold text-white uppercase">No Titles Match Filter</h4>
                    <p className="text-xs text-white/50">Try clearing the search filter or resetting sorting.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                      {filteredSectionItems.map(movie => (
                        <MovieCard key={`section-${movie.id}`} movie={movie} onSelect={handleSelectMovie} />
                      ))}
                    </div>

                    {/* Load More Titles Button */}
                    {activeSection.hasMore && (
                      <div className="text-center pt-4 pb-8">
                        <button
                          onClick={handleLoadMoreSection}
                          disabled={activeSection.isLoadingMore}
                          className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 mx-auto transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          {activeSection.isLoadingMore ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                              <span>Loading More...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 text-cyan-300" />
                              <span>Load More</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* C. MAIN DISCOVERY OVERVIEW OR SEARCH RESULTS */
              <div key="grid" className="space-y-10">
                {/* 4. Featured Hero Spotlight Banner */}
                {isTrending && currentSpotlight && !query.trim() && (
                  <div className="relative rounded-3xl overflow-hidden border border-white/15 bg-[#070a18] shadow-2xl group min-h-[380px] sm:min-h-[460px] md:min-h-[500px] flex flex-col justify-end">
                    {spotlightThumbnail && (
                      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
                        <img 
                          src={spotlightThumbnail} 
                          className="w-full h-full object-cover object-top sm:object-center transition-transform duration-700 ease-out group-hover:scale-105" 
                          alt={currentSpotlight.title} 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#070a18] via-[#070a18]/70 via-40% to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#070a18]/85 via-[#070a18]/25 to-transparent hidden sm:block" />
                      </div>
                    )}

                    <div className="relative z-10 p-6 sm:p-8 md:p-10 w-full max-w-3xl space-y-3 sm:space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {currentSpotlight.rating && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-black font-black text-[11px] flex items-center gap-1 shadow-md">
                            <Star className="w-3 h-3 fill-current" /> {currentSpotlight.rating}
                          </span>
                        )}
                        {currentSpotlight.year && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-black/70 border border-white/15 text-white/90 font-mono text-[11px] font-bold">
                            {currentSpotlight.year}
                          </span>
                        )}
                        {currentSpotlight.genres && currentSpotlight.genres.length > 0 && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-black uppercase tracking-wider">
                            {currentSpotlight.genres[0]}
                          </span>
                        )}
                      </div>

                      <h1 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase text-white tracking-tight leading-tight drop-shadow-xl max-w-2xl">
                        {currentSpotlight.title}
                      </h1>

                      {currentSpotlight.description ? (
                        <p className="text-xs sm:text-sm text-white/85 line-clamp-2 leading-relaxed max-w-xl drop-shadow-md">
                          {currentSpotlight.description}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          onClick={() => handleSelectMovie(currentSpotlight)}
                          className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-cyan-500/25 transition-all cursor-pointer active:scale-95"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Watch & Details</span>
                        </button>

                        <button
                          onClick={() => handleSelectMovie(currentSpotlight)}
                          className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider border border-white/20 transition-all cursor-pointer active:scale-95 backdrop-blur-md"
                        >
                          <span>Explore Season & 4K Info</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        {spotlightItems.map((_, i) => (
                          <button
                            key={`spotlight-dot-${i}`}
                            onClick={() => setSpotlightIndex(i)}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                              i === spotlightIndex ? 'w-8 bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.7)]' : 'w-2 bg-white/30 hover:bg-white/60'
                            }`}
                            title={`Featured Title ${i + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Themed Category Rows or Loading Skeleton */}
                {isSearching && !query.trim() && (!trendingRows || trendingRows.length === 0) ? (
                  <SkeletonDiscovery />
                ) : isTrending && trendingRows.length > 0 ? (
                  <div className="space-y-12">
                    {trendingRows.map((row, rIdx) => (
                      <MovieRow
                        key={`row-${row.id || rIdx}`}
                        row={row}
                        onSelectMovie={handleSelectMovie}
                        onOpenSection={handleOpenSection}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Search Results Grid with 40-items pagination */}
                    {searchResults.length === 0 ? (
                      <div className="text-center py-24 border border-dashed border-white/10 rounded-3xl bg-white/[0.01] space-y-3">
                        <Clapperboard className="w-12 h-12 text-white/30 mx-auto" />
                        <h4 className="text-base font-bold text-white">No Movies or Series Found</h4>
                        <p className="text-xs text-white/50 max-w-sm mx-auto">
                          We couldn't find matches for your query. Try searching by actor name or choose a genre chip above.
                        </p>
                        <button
                          onClick={() => loadTrending(true)}
                          className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                        >
                          Reset & View Trending
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between pb-3 border-b border-white/10">
                          <h4 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                            <Search className="w-4 h-4 text-cyan-400" />
                            <span>Results for "{query || selectedGenre}"</span>
                          </h4>
                          <span className="text-xs text-cyan-300 font-bold">{searchResults.length} Titles Found</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                          {searchResults.map(movie => (
                            <MovieCard key={movie.id} movie={movie} onSelect={handleSelectMovie} />
                          ))}
                        </div>

                        {/* Search Load More */}
                        {searchHasMore && searchResults.length >= 20 && (
                          <div className="text-center pt-4 pb-8">
                            <button
                              onClick={handleLoadMoreSearchResults}
                              disabled={isLoadingMoreSearch}
                              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs uppercase tracking-wider shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 mx-auto transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                              {isLoadingMoreSearch ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                  <span>Loading More Results...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-4 h-4" />
                                  <span>Load More</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* 6. My Library & Pre-Orders Tab */
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                <Film className="w-5 h-5 text-purple-400" />
                <span>My Movie Library & Pre-Orders</span>
              </h3>
              <p className="text-xs text-white/50">Track your requested titles and instant 4K cloud streaming links.</p>
            </div>

            <button 
              onClick={loadLibrary} 
              disabled={isLoadingLibrary}
              className="p-2.5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all active:scale-95 group cursor-pointer"
              title="Refresh Library"
            >
              <RefreshCw className={`w-4 h-4 text-purple-400 transition-all ${isLoadingLibrary ? 'animate-spin' : 'group-hover:rotate-180 duration-500'}`} />
            </button>
          </div>

          {isLoadingLibrary ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4">
              <RotatingSpinner />
              <p className="text-xs font-black uppercase tracking-wider text-purple-400 animate-pulse">Syncing Cloud Library...</p>
            </div>
          ) : myPreOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myPreOrders.map(order => {
                const orderImg = order.thumbnail && order.thumbnail.trim() ? order.thumbnail : null;
                return (
                  <Card key={order.id} className="p-4 bg-[#090e1c] border border-white/10 rounded-2xl flex gap-4 group hover:border-purple-500/40 transition-all overflow-hidden relative shadow-lg">
                    {order.status === 'available' && (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-emerald-500 text-black font-black text-[9px] uppercase tracking-wider shadow-md shadow-emerald-500/30">
                          READY IN 4K
                        </Badge>
                      </div>
                    )}

                    <div className="w-24 h-32 rounded-xl overflow-hidden border border-white/15 flex-shrink-0 relative bg-black/60 shadow-md">
                      {orderImg ? (
                        <img src={orderImg} className="w-full h-full object-cover" alt={order.title} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-black/60 text-white/40">
                          <Film className="w-6 h-6" />
                        </div>
                      )}
                      {order.status === 'available' && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Play fill="currentColor" className="text-white w-6 h-6" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
                      <div>
                        <h4 className="font-black text-sm text-white uppercase truncate">{order.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-white/50 font-medium">Requested {new Date(order.requestedAt).toLocaleDateString()}</p>
                          {order.season && (
                            <Badge variant="outline" className="text-[10px] font-black border-purple-500/40 bg-purple-500/15 text-purple-300">
                              S{order.season} E{order.episode}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2 pt-2">
                        {order.status === 'available' ? (
                          <>
                            <div className="flex flex-wrap gap-2">
                              <Button 
                                onClick={() => { 
                                  setCloudData({ streamUrl: order.movieUrl!, title: order.title } as any); 
                                  setShowPlayer(true); 
                                }} 
                                className="h-8 flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-[10px] font-black uppercase tracking-wider"
                              >
                                Watch Now
                              </Button>
                              <Button 
                                onClick={() => { 
                                  if (order.movieUrl) window.open(order.movieUrl, '_blank'); 
                                  handleUpdateStatus(order.id, 'downloaded'); 
                                }} 
                                variant="outline" 
                                className="h-8 flex-1 border-white/15 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-white/10"
                              >
                                Download
                              </Button>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                onClick={() => handleCreateRoomFromPreOrder(order)} 
                                variant="ghost" 
                                className="h-7 flex-1 border border-white/10 hover:bg-purple-500/10 text-purple-300 rounded-xl text-[9px] font-black uppercase tracking-wider"
                              >
                                Create Watch Room
                              </Button>
                              <Button 
                                onClick={() => handleUpdateStatus(order.id, 'watched')} 
                                variant="ghost" 
                                className="h-7 flex-1 border border-white/10 hover:bg-emerald-500/10 text-emerald-300 rounded-xl text-[9px] font-black uppercase tracking-wider"
                              >
                                {order.userStatus === 'watched' ? '✓ Watched' : 'Mark Watched'}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5">
                            <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0" />
                            <div>
                              <p className="text-[10px] font-bold text-amber-300 uppercase">Request Queued</p>
                              <p className="text-[9px] text-white/50 leading-tight">We'll notify you as soon as it's ready.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="py-24 text-center border border-dashed border-white/10 rounded-3xl bg-white/[0.01] space-y-3">
              <Film className="w-12 h-12 mx-auto text-white/30" />
              <h4 className="text-sm font-bold uppercase tracking-wider text-white">Your library is currently empty</h4>
              <p className="text-xs text-white/50 max-w-sm mx-auto">
                Explore thousands of movies and TV series in the discovery tab and pre-order titles to add them here!
              </p>
              <button
                onClick={() => setActiveTab('search')}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-black uppercase tracking-wider shadow-lg cursor-pointer"
              >
                Browse Cinema
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* 7. Pre-order Confirmation Modal */}
      <AnimatePresence>
        {showPreOrderModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-md p-7 text-center space-y-5 rounded-3xl border border-white/15 shadow-2xl bg-[#0b0f1d]">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-lg">
                <Info className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                  Pre-Order {selectedEpisode ? 'Episode' : 'Title'}
                </h3>
                <p className="text-xs text-white/70 leading-relaxed">
                  You are placing a cloud request for <strong className="text-white">"{movieToPreOrder?.title}"</strong>
                  {selectedEpisode && ` (Season ${selectedSeason}, Episode ${selectedEpisode})`}. 
                  Our system will prioritize this upload and alert you when it is live.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button 
                  onClick={() => setShowPreOrderModal(false)} 
                  variant="ghost" 
                  className="flex-1 h-12 rounded-xl font-bold uppercase tracking-wider text-xs border border-white/10 hover:bg-white/5 text-white/80"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={confirmPreOrder} 
                  disabled={isPreOrdering} 
                  className="flex-[2] h-12 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-black font-black uppercase tracking-wider text-xs shadow-lg shadow-amber-500/20"
                >
                  {isPreOrdering ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : 'Confirm Pre-Order'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 8. 4K Video Player Modal */}
      <AnimatePresence>
        {showPlayer && cloudData && (
          <div className="fixed inset-0 z-[2000] bg-black/95 backdrop-blur-md flex flex-col">
            <div className="p-4 flex justify-between items-center bg-black/80 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Play className="text-cyan-400 w-5 h-5 fill-current" />
                <h4 className="font-black text-white uppercase tracking-tight text-sm">
                  {cloudData.title} {selectedEpisode && `(S${selectedSeason} E${selectedEpisode})`}
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-black uppercase border border-cyan-500/30">
                  4K Stream
                </span>
              </div>
              <button 
                onClick={() => setShowPlayer(false)} 
                className="p-2 hover:bg-white/10 rounded-full text-white transition-all cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-2 sm:p-6">
              <video 
                controls 
                autoPlay 
                className="w-full max-w-5xl max-h-[80vh] rounded-2xl shadow-2xl border border-white/10 bg-black"
              >
                <source src={cloudData.streamUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="p-4 text-center border-t border-white/5">
              <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">
                StreamAura High-Bitrate Cinema Cloud Delivery
              </p>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 9. YouTube Trailer Modal */}
      <AnimatePresence>
        {activeTrailerKey && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[3000] p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden border border-white/15 shadow-2xl bg-black"
            >
              <button 
                onClick={() => setActiveTrailerKey(null)}
                className="absolute top-4 right-4 z-[3010] p-2 rounded-full bg-black/70 text-white hover:bg-black border border-white/20 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <iframe
                src={`https://www.youtube.com/embed/${activeTrailerKey}?autoplay=1`}
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title="Trailer Player"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Reusable Performance-Engineered Movie Poster Card (Zero lag, React.memo, pure GPU CSS transitions, instant preloading)
const MovieCard = React.memo<{ 
  movie: MovieInfo; 
  onSelect: (m: MovieInfo) => void;
  priority?: boolean;
}>(({ movie, onSelect, priority = false }) => {
  const rawSrc = movie.thumbnail && movie.thumbnail.trim() ? movie.thumbnail : null;
  const isPreloaded = rawSrc ? preloadedImageUrls.has(rawSrc) : false;
  const [imgError, setImgError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(isPreloaded);

  const imgSrc = !imgError && rawSrc ? rawSrc : null;

  return (
    <div 
      onClick={() => onSelect(movie)} 
      className="group cursor-pointer overflow-hidden rounded-2xl border border-white/10 hover:border-cyan-500/50 transition-all duration-200 shadow-md hover:shadow-cyan-500/10 flex flex-col h-full bg-[#080d1a] select-none transform-gpu hover:-translate-y-1 active:scale-[0.98] will-change-transform relative"
    >
      <div className="aspect-[2/3] relative overflow-hidden bg-[#0a0f20]">
        {/* Sleek Skeleton Placeholder when loading */}
        {!isLoaded && imgSrc && (
          <div className="absolute inset-0 bg-gradient-to-b from-[#0e172e] via-[#0a1020] to-[#070c18] animate-pulse flex items-center justify-center">
            <Film className="w-6 h-6 text-white/10 animate-pulse" />
          </div>
        )}

        {imgSrc ? (
          <img 
            src={imgSrc} 
            alt={movie.title}
            loading={priority || isPreloaded ? "eager" : "lazy"}
            decoding="async"
            onLoad={() => {
              if (imgSrc) preloadedImageUrls.add(imgSrc);
              setIsLoaded(true);
            }}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#0e1628] to-[#070b16] text-white/30 gap-1.5 p-2">
            <Film className="w-8 h-8 text-white/20" />
            <span className="text-[9px] uppercase font-bold text-center text-white/40">No Poster</span>
          </div>
        )}
        
        {/* Subtle Vignette Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20 opacity-70 group-hover:opacity-40 transition-opacity pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10 pointer-events-none">
          <span className="px-1.5 py-0.5 rounded-md bg-black/85 border border-amber-500/40 text-[9px] font-black text-amber-400 flex items-center gap-0.5 shadow-md">
            <Star className="w-2.5 h-2.5 fill-current" /> {movie.rating && movie.rating !== '0.0' ? movie.rating : '7.5'}
          </span>

          {movie.mediaType === 'series' ? (
            <span className="px-2 py-0.5 rounded-md bg-purple-600 text-[8px] font-black text-white uppercase tracking-wider shadow-md">
              SERIES
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md bg-cyan-600 text-[8px] font-black text-white uppercase tracking-wider shadow-md">
              4K MOVIE
            </span>
          )}
        </div>

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1.5 transition-opacity duration-200 p-2 text-center">
          <div className="w-9 h-9 rounded-full bg-cyan-500 text-white flex items-center justify-center shadow-lg shadow-cyan-500/40 transform group-hover:scale-110 transition-transform">
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </div>
          <span className="text-[9px] font-black uppercase tracking-wider text-white bg-black/70 px-2.5 py-0.5 rounded-full border border-white/20">
            Details
          </span>
        </div>
      </div>

      {/* Card Info Details */}
      <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-between bg-gradient-to-b from-[#080d1a] to-[#0c1322]">
        <h4 className="font-bold text-[11px] sm:text-xs uppercase truncate text-white group-hover:text-cyan-400 transition-colors">
          {movie.title}
        </h4>
        <div className="flex items-center justify-between mt-1 text-[10px] text-white/50 font-bold">
          <span className="uppercase">{movie.year && movie.year !== 'N/A' && movie.year !== '0' ? movie.year : '4K'}</span>
          <span className="text-cyan-400/80 font-mono text-[9px]">4K UHD</span>
        </div>
      </div>
    </div>
  );
});

// Reusable Performance-Engineered Category Row (Smooth Netflix/MovieBox touch & mouse slider)
const MovieRow = React.memo<{
  row: { id: string; category: string; genreId: string; items: MovieInfo[] };
  onSelectMovie: (movie: MovieInfo) => void;
  onOpenSection: (category: string, genreId: string, items: MovieInfo[]) => void;
}>(({ row, onSelectMovie, onOpenSection }) => {
  const meta = getCategoryMeta(row.category);
  const displayItems = row.items.slice(0, 40);

  return (
    <div className="space-y-3.5 relative">
      {/* Row Header with Category info and Clean "View More ›" Button */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-white/5 border border-white/10 shadow-sm text-cyan-400">
            {meta.icon}
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black uppercase text-white tracking-tight">
              {row.category}
            </h3>
            {meta.tagline && (
              <p className="text-[11px] text-white/50 font-medium mt-0.5 hidden sm:block">
                {meta.tagline}
              </p>
            )}
          </div>
        </div>

        {/* View More button opens dedicated section */}
        <button
          onClick={() => onOpenSection(row.category, row.genreId || 'trending', row.items)}
          className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 flex-shrink-0"
        >
          <span>View More</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Smooth Netflix-Style Horizontal Touch/Swipe Slider */}
      <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 pt-1 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden overscroll-x-contain touch-pan-x select-none">
        {displayItems.map((movie, idx) => (
          <div key={`carousel-${movie.id}`} className="w-32 sm:w-44 flex-shrink-0 snap-start select-none">
            <MovieCard movie={movie} onSelect={onSelectMovie} priority={idx < 6} />
          </div>
        ))}

        {/* End Card to Explore All on this genre */}
        <div
          onClick={() => onOpenSection(row.category, row.genreId || 'trending', row.items)}
          className="w-32 sm:w-44 flex-shrink-0 snap-start select-none group/end cursor-pointer flex flex-col"
        >
          <div className="aspect-[2/3] rounded-2xl border-2 border-dashed border-cyan-500/40 hover:border-cyan-400 bg-gradient-to-b from-cyan-500/10 via-[#090e1c] to-[#060a15] hover:bg-cyan-500/15 flex flex-col items-center justify-center gap-2.5 p-4 text-center transition-all duration-300 shadow-md group-hover/end:shadow-cyan-500/20 group-hover/end:scale-102">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center group-hover/end:scale-110 transition-transform">
              <ChevronRight className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-black text-white uppercase tracking-wider">Explore All</p>
            </div>
          </div>
          <div className="p-2 text-center">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider group-hover/end:underline">
              View Section ›
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

// MovieBox / Netflix Shimmer Skeleton Component
const SkeletonDiscovery = () => (
  <div className="space-y-10 animate-pulse">
    {/* Hero Skeleton */}
    <div className="rounded-3xl bg-white/[0.03] border border-white/10 h-[380px] sm:h-[460px] p-8 flex flex-col justify-end gap-4 relative overflow-hidden">
      <div className="w-32 h-6 rounded-lg bg-white/10" />
      <div className="w-3/4 sm:w-1/2 h-10 rounded-xl bg-white/10" />
      <div className="w-full sm:w-2/3 h-12 rounded-xl bg-white/5" />
      <div className="flex gap-3">
        <div className="w-36 h-11 rounded-2xl bg-cyan-500/20" />
        <div className="w-36 h-11 rounded-2xl bg-white/10" />
      </div>
    </div>

    {/* 3 Category Row Skeletons */}
    {[1, 2, 3].map((row) => (
      <div key={`skel-row-${row}`} className="space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-white/10">
          <div className="w-48 h-6 rounded-lg bg-white/10" />
          <div className="w-24 h-6 rounded-lg bg-white/5" />
        </div>
        <div className="flex gap-3 sm:gap-4 overflow-hidden">
          {[1, 2, 3, 4, 5, 6, 7].map((card) => (
            <div
              key={`skel-card-${card}`}
              className="w-32 sm:w-44 aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/5 flex-shrink-0"
            />
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default MovieDownloader;
