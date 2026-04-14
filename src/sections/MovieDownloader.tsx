import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Film, 
  Tv,
  Search, 
  Download, 
  Loader2, 
  Star, 
  Calendar, 
  Clock, 
  X, 
  Play, 
  ChevronDown, 
  Check
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import mediaApi, { API_BASE_URL } from '../api/mediaApi';
import { logSearch, logMediaInteraction } from '../lib/firebase';
import type { MovieInfo, VideoQuality } from '../types';

const MovieDownloader: React.FC = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'movie' | 'series'>('movie');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MovieInfo[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieInfo | null>(null);
  const [isLoadingDetails, setIsLoadingPreview] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality | null>(null);
  const [isQualityDropdownOpen, setIsQualityDropdownOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  // Series specific states
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);

  const { 
    downloadWithProgress, 
    currentDownloadProgress, 
    cancelDownload,
    pauseDownload,
    isPaused,
    activeStage
  } = useDownload();
  const { showError } = useToast();

  // Refs for outside click detection
  const seasonRef = React.useRef<HTMLDivElement>(null);
  const episodeRef = React.useRef<HTMLDivElement>(null);
  const qualityRef = React.useRef<HTMLDivElement>(null);

  // Body scroll lock
  useEffect(() => {
    if (showPlayer || (isLoadingDetails && !selectedMovie)) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      const originalHeight = document.body.style.height;
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100dvh';
      return () => {
        document.body.style.overflow = originalStyle;
        document.body.style.height = originalHeight;
      };
    }
  }, [showPlayer, isLoadingDetails, selectedMovie]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (seasonRef.current && !seasonRef.current.contains(event.target as Node)) setIsSeasonOpen(false);
      if (episodeRef.current && !episodeRef.current.contains(event.target as Node)) setIsEpisodeOpen(false);
      if (qualityRef.current && !qualityRef.current.contains(event.target as Node)) setIsQualityDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSelectedMovie(null);
    logSearch(query, searchType as any, user?.uid);
    try {
      const result = await mediaApi.searchMovies(query, searchType as 'movie' | 'series');
      if (result.success && result.data) {
        setSearchResults(result.data);
        if (result.data.length === 0) {
          showError(`No ${searchType === 'movie' ? 'movies' : 'series'} found for "${query}"`);
        }
      } else {
        showError(result.error || `Failed to search ${searchType}`);
      }
    } catch (err) {
      showError('Connection to backend failed');
    } finally {
      setIsSearching(false);
    }
  };

  // Dropdown states for series
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [isEpisodeOpen, setIsEpisodeOpen] = useState(false);

  const handleSelectMovie = async (movie: MovieInfo) => {
    setIsLoadingPreview(true);
    setSelectedQuality(null);
    setSelectedSeason(null);
    setSelectedEpisode(null);
    setIsSeasonOpen(false);
    setIsEpisodeOpen(false);
    try {
      const result = await mediaApi.getMovieDetails(movie.id, searchType as 'movie' | 'series', movie.title);
      if (result.success && result.data) {
        setSelectedMovie(result.data);
        
        // Auto-select first season/episode for series
        if (searchType === 'series' && result.data.seasons && result.data.seasons.length > 0) {
          const firstSeason = result.data.seasons[0];
          setSelectedSeason(firstSeason.season);
          if (firstSeason.episodes && firstSeason.episodes.length > 0) {
            setSelectedEpisode(firstSeason.episodes[0]);
            handleSelectEpisode(firstSeason.season, firstSeason.episodes[0], result.data);
          }
        }
      } else {
        showError(result.error || 'Failed to get details');
      }
    } catch (err) {
      showError('Failed to load details');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSelectEpisode = async (season: number, episode: number, currentMovie?: MovieInfo) => {
    const movie = currentMovie || selectedMovie;
    if (!movie) return;

    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setIsLoadingPreview(true);
    setSelectedQuality(null);

    try {
      const result = await mediaApi.getMovieDetails(movie.id, 'series', movie.title, season, episode);
      if (result.success && result.data) {
        setSelectedMovie(prev => prev ? {
          ...prev,
          qualities: result.data?.qualities || []
        } : (result.data || null));
      } else {
        showError(result.error || 'Failed to get episode details');
      }
    } catch (err) {
      showError('Failed to load episode details');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedMovie || !selectedQuality) {
      showError('Please select a quality first');
      return;
    }

    setIsDownloading(true);
    try {
      const safeTitle = selectedMovie.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      let filename = `${safeTitle}_${selectedQuality.quality}.mp4`;
      
      if (searchType === 'series' && selectedSeason !== null && selectedEpisode !== null) {
        filename = `${safeTitle}_S${selectedSeason}E${selectedEpisode}_${selectedQuality.quality}.mp4`;
      }
      
      await downloadWithProgress(
        selectedQuality.url, 
        selectedQuality.quality, 
        filename, 
        selectedMovie.referer
      );
      
      setIsDownloading(false);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showError('Download failed');
      }
      setIsDownloading(false);
    }
  };

  const handleWatchNow = () => {
    if (!selectedMovie || !selectedQuality) {
      showError('Please select a quality first');
      return;
    }
    
    logMediaInteraction({
      id: selectedMovie.id,
      title: selectedMovie.title,
      mediaType: searchType,
      platform: 'MovieBox'
    }, 'watch', user?.uid);

    setShowPlayer(true);
  };

  const handleCancelDownload = () => {
    cancelDownload();
    setIsDownloading(false);
  };

  const getStreamUrl = () => {
    if (!selectedQuality || !selectedMovie) return '';
    const baseUrl = API_BASE_URL || window.location.origin;
    return `${baseUrl}/api/stream?url=${encodeURIComponent(selectedQuality.url)}&referer=${encodeURIComponent(selectedMovie.referer || 'https://fmoviesunblocked.net/')}`;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32 text-foreground">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br flex items-center justify-center shadow-lg transition-all duration-500 ${
            searchType === 'movie' 
              ? 'from-cyan-500 to-blue-600 shadow-cyan-500/20' 
              : 'from-purple-500 to-indigo-600 shadow-purple-500/20'
          }`}
        >
          {searchType === 'movie' ? <Film className="w-10 h-10 text-white" /> : <Tv className="w-10 h-10 text-white" />}
        </motion.div>
        <h2 className="text-4xl font-bold gradient-text">{searchType === 'movie' ? 'Movie Downloader' : 'Series Downloader'}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Search and download your favorite {searchType === 'movie' ? 'movies' : 'TV shows'} in high quality.
        </p>
      </div>

      {/* Type Toggle */}
      <div className="flex justify-center">
        <div className="glass-card p-1 flex gap-1 rounded-2xl">
          <button
            onClick={() => {
              setSearchType('movie');
              setSearchResults([]);
              setQuery('');
            }}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              searchType === 'movie' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-muted-foreground hover:bg-white/5'
            }`}
          >
            <Film className="w-4 h-4" /> Movies
          </button>
          <button
            onClick={() => {
              setSearchType('series');
              setSearchResults([]);
              setQuery('');
            }}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              searchType === 'series' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-muted-foreground hover:bg-white/5'
            }`}
          >
            <Tv className="w-4 h-4" /> Series
          </button>
        </div>
      </div>

      {/* Search Section */}
      <div className="glass-card p-3 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-muted-foreground transition-colors z-10">
            <Search className={`w-5 h-5 transition-colors ${searchType === 'movie' ? 'group-focus-within:text-cyan-500' : 'group-focus-within:text-purple-500'}`} />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={`Search for a ${searchType}...`}
            className={`w-full glass-input pl-12 pr-4 py-4 text-base focus:outline-none focus:ring-2 transition-all rounded-xl ${
              searchType === 'movie' ? 'focus:ring-cyan-500/50' : 'focus:ring-purple-500/50'
            }`}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!query.trim() || isSearching}
          className={`px-8 py-4 glass-button text-white font-bold flex items-center justify-center gap-2 min-w-[140px] disabled:opacity-50 transition-colors ${
            searchType === 'movie' ? 'bg-cyan-600' : 'bg-purple-600'
          }`}
        >
          {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Search</span><Search className="w-4 h-4" /></>}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {selectedMovie ? (
          /* Movie/Series Details View */
          <motion.div
            key="details"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <button 
              onClick={() => setSelectedMovie(null)}
              className={`flex items-center gap-2 text-sm text-muted-foreground transition-colors ${
                searchType === 'movie' ? 'hover:text-cyan-500' : 'hover:text-purple-500'
              }`}
            >
              <X className="w-4 h-4" /> Back to results
            </button>

            <div className="glass-card p-6 md:p-8">
              <div className="flex flex-col md:flex-row gap-8">
                {/* Poster */}
                <div className="w-full md:w-64 flex-shrink-0">
                  <div className="aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                    {selectedMovie.thumbnail ? (
                      <img 
                        src={selectedMovie.thumbnail} 
                        alt={selectedMovie.title} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x600?text=No+Poster';
                        }}
                      />
                    ) : (
                      <Film className="w-12 h-12 text-muted-foreground opacity-20" />
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 space-y-6">
                  <div>
                    <h3 className="text-3xl font-bold text-foreground mb-2">{selectedMovie.title}</h3>
                    <div className="flex flex-wrap gap-3">
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-bold border border-yellow-500/20">
                        <Star className="w-3.5 h-3.5 fill-current" /> {selectedMovie.rating || 'N/A'}
                      </span>
                      <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        searchType === 'movie' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' : 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                      }`}>
                        <Calendar className="w-3.5 h-3.5" /> {selectedMovie.year || 'N/A'}
                      </span>
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/10 text-slate-400 text-xs font-bold border border-slate-500/20">
                        <Clock className="w-3.5 h-3.5" /> {selectedMovie.duration || 'N/A'}
                      </span>
                    </div>
                  </div>

                  <p className="text-muted-foreground leading-relaxed">
                    {selectedMovie.description}
                  </p>

                  {/* Series Episode Selection */}
                  {searchType === 'series' && selectedMovie.seasons && (
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Tv className="w-4 h-4 text-purple-500" /> Select Episode
                      </h4>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Season Select */}
                        <div className="space-y-2" ref={seasonRef}>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Season</label>
                          <button
                            onClick={() => {
                              setIsSeasonOpen(!isSeasonOpen);
                              setIsEpisodeOpen(false);
                              setIsQualityDropdownOpen(false);
                            }}
                            className={`w-full p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                              isSeasonOpen ? 'bg-white/10 border-purple-500/50 shadow-lg shadow-purple-500/10' : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-sm font-bold text-foreground">Season {selectedSeason}</span>
                            <ChevronDown className={`w-4 h-4 text-purple-500 transition-transform duration-300 ${isSeasonOpen ? 'rotate-180' : ''}`} />
                          </button>

                          <AnimatePresence>
                            {isSeasonOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-2 p-1.5 glass-card bg-background/95 border-border backdrop-blur-2xl rounded-xl max-h-48 overflow-y-auto custom-scrollbar">
                                  {selectedMovie.seasons.map(s => (
                                    <button
                                      key={s.season}
                                      onClick={() => {
                                        setSelectedSeason(s.season);
                                        setIsSeasonOpen(false);
                                        if (s.episodes && s.episodes.length > 0) {
                                          handleSelectEpisode(s.season, s.episodes[0]);
                                        }
                                      }}
                                      className={`w-full p-3 text-left text-sm rounded-lg transition-all ${
                                        selectedSeason === s.season 
                                          ? 'bg-purple-500 text-white shadow-lg' 
                                          : 'text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-white/10'
                                      }`}
                                    >
                                      Season {s.season}
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Episode Select */}
                        <div className="space-y-2" ref={episodeRef}>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Episode</label>
                          <button
                            onClick={() => {
                              setIsEpisodeOpen(!isEpisodeOpen);
                              setIsSeasonOpen(false);
                              setIsQualityDropdownOpen(false);
                            }}
                            className={`w-full p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                              isEpisodeOpen ? 'bg-white/10 border-purple-500/50 shadow-lg shadow-purple-500/10' : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-sm font-bold text-foreground">Episode {selectedEpisode}</span>
                            <ChevronDown className={`w-4 h-4 text-purple-500 transition-transform duration-300 ${isEpisodeOpen ? 'rotate-180' : ''}`} />
                          </button>

                          <AnimatePresence>
                            {isEpisodeOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-2 p-1.5 glass-card bg-background/95 border-border backdrop-blur-2xl rounded-xl max-h-48 overflow-y-auto custom-scrollbar">
                                  {(selectedMovie.seasons.find(s => s.season === selectedSeason)?.episodes || []).map(ep => (
                                    <button
                                      key={ep}
                                      onClick={() => {
                                        handleSelectEpisode(selectedSeason!, ep);
                                        setIsEpisodeOpen(false);
                                      }}
                                      className={`w-full p-3 text-left text-sm rounded-lg transition-all ${
                                        selectedEpisode === ep 
                                          ? 'bg-purple-500 text-white shadow-lg' 
                                          : 'text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-white/10'
                                      }`}
                                    >
                                      Episode {ep}
                                    </button>
                                  ))}
                                  {(!selectedMovie.seasons.find(s => s.season === selectedSeason)?.episodes?.length) && (
                                    <div className="p-4 text-center text-xs text-muted-foreground italic">No Episodes Found</div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quality Dropdown */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <Download className={`w-4 h-4 ${searchType === 'movie' ? 'text-cyan-500' : 'text-purple-500'}`} /> Select Quality
                    </h4>
                    <div className="space-y-2" ref={qualityRef}>
                      <button
                        onClick={() => {
                          setIsQualityDropdownOpen(!isQualityDropdownOpen);
                          setIsSeasonOpen(false);
                          setIsEpisodeOpen(false);
                        }}
                        disabled={isLoadingDetails}
                        className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${
                          isQualityDropdownOpen 
                            ? `bg-white/10 ${searchType === 'movie' ? 'border-cyan-500/50 shadow-cyan-500/10' : 'border-purple-500/50 shadow-purple-500/10'} shadow-lg` 
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        } disabled:opacity-50`}
                      >
                        <div className="flex items-center gap-3">
                          {isLoadingDetails ? (
                            <Loader2 className={`w-5 h-5 animate-spin ${searchType === 'movie' ? 'text-cyan-500' : 'text-purple-500'}`} />
                          ) : selectedQuality ? (
                            <>
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                searchType === 'movie' ? 'bg-cyan-500/20 text-cyan-500' : 'bg-purple-500/20 text-purple-500'
                              }`}>
                                <Film className="w-5 h-5" />
                              </div>
                              <div className="text-left">
                                <p className="font-bold text-sm text-foreground">{selectedQuality.quality}</p>
                                <p className="text-xs text-muted-foreground">{selectedQuality.size}</p>
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground italic">Choose a resolution...</span>
                          )}
                        </div>
                        <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${
                          searchType === 'movie' ? 'text-cyan-500' : 'text-purple-500'
                        } ${isQualityDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {isQualityDropdownOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="p-1.5 glass-card bg-background/95 border-border backdrop-blur-2xl rounded-xl max-h-60 overflow-y-auto custom-scrollbar">
                              {selectedMovie.qualities?.map((quality) => (
                                <button
                                  key={quality.quality}
                                  onClick={() => {
                                    setSelectedQuality(quality);
                                    setIsQualityDropdownOpen(false);
                                  }}
                                  className={`w-full p-3 rounded-lg flex items-center justify-between transition-all ${
                                    selectedQuality?.quality === quality.quality 
                                      ? (searchType === 'movie' ? 'bg-cyan-500 text-white shadow-lg' : 'bg-purple-500 text-white shadow-lg') 
                                      : 'text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-white/10'
                                  }`}
                                >
                                  <div className="text-left">
                                    <p className={`font-bold text-sm ${selectedQuality?.quality === quality.quality ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{quality.quality}</p>
                                    <p className={`text-xs opacity-70 ${selectedQuality?.quality === quality.quality ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'}`}>{quality.size}</p>
                                  </div>
                                  {selectedQuality?.quality === quality.quality && <Check className="w-4 h-4 text-white" />}
                                </button>
                              ))}
                              {(!selectedMovie.qualities || selectedMovie.qualities.length === 0) && (
                                <div className="p-6 text-center text-sm text-muted-foreground italic">
                                  No high-speed servers available for this content
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    {isDownloading ? (
                      <div className="space-y-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Loader2 className={`w-4 h-4 animate-spin ${searchType === 'movie' ? 'text-cyan-500' : 'text-purple-500'}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${
                              searchType === 'movie' ? 'text-cyan-500' : 'text-purple-500'
                            }`}>
                              {activeStage || (currentDownloadProgress > 0 ? 'Downloading Content...' : 'Downloading...')}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-white">{currentDownloadProgress}%</span>
                        </div>
                        
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${currentDownloadProgress}%` }}
                            className={`h-full shadow-[0_0_15px_rgba(6,182,212,0.5)] ${
                              searchType === 'movie' ? 'bg-gradient-to-r from-cyan-500 to-blue-600' : 'bg-gradient-to-r from-purple-500 to-indigo-600'
                            }`}
                          />
                        </div>

                        <div className="flex gap-2">
                          <button 
                            onClick={pauseDownload}
                            className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase transition-colors"
                          >
                            {isPaused ? 'Resume' : 'Pause'}
                          </button>
                          <button 
                            onClick={handleCancelDownload}
                            className="flex-1 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-bold uppercase transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <AnimatePresence>
                        {selectedQuality && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-3"
                          >
                            <button
                              onClick={handleDownload}
                              disabled={isDownloading || isLoadingDetails}
                              className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-xl transition-all disabled:opacity-50 disabled:grayscale hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 ${
                                searchType === 'movie' 
                                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 shadow-cyan-500/20' 
                                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 shadow-purple-500/20'
                              }`}
                            >
                              <Download className="w-5 h-5" />
                              Download {searchType === 'movie' ? 'Movie' : 'Episode'}
                            </button>

                            <button
                              onClick={handleWatchNow}
                              disabled={isDownloading || isLoadingDetails}
                              className={`w-full py-4 rounded-2xl bg-white/5 text-foreground font-bold text-lg border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]`}
                            >
                              <Play className={`w-5 h-5 fill-current ${searchType === 'movie' ? 'text-cyan-500' : 'text-purple-500'}`} />
                              Watch Now
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          /* Search Results Grid */
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
          >
            {searchResults.map((movie) => (
              <motion.div
                key={movie.id}
                whileHover={{ y: -10 }}
                onClick={() => handleSelectMovie(movie)}
                className="glass-card overflow-hidden group cursor-pointer border-white/5"
              >
                <div className="aspect-[2/3] relative overflow-hidden bg-white/5 flex items-center justify-center">
                  {movie.thumbnail ? (
                    <img 
                      src={movie.thumbnail} 
                      alt={movie.title} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x600?text=No+Poster';
                      }}
                    />
                  ) : (
                    <Film className="w-8 h-8 text-muted-foreground opacity-20" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      <span className="text-xs font-bold text-white">{movie.rating}</span>
                    </div>
                    <button className={`w-full py-2 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg ${
                      searchType === 'movie' ? 'bg-cyan-500' : 'bg-purple-500'
                    }`}>
                      <Play className="w-3 h-3 fill-current" /> View Details
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <h4 className={`font-bold text-sm truncate text-foreground transition-colors ${
                    searchType === 'movie' ? 'group-hover:text-cyan-400' : 'group-hover:text-purple-400'
                  }`}>{movie.title}</h4>
                  <div className="flex items-center justify-between mt-1 opacity-60">
                    <span className="text-[10px] font-bold uppercase">{movie.year}</span>
                    <span className="text-[10px] font-bold uppercase">{movie.duration !== 'N/A' ? movie.duration : searchType === 'series' ? 'Series' : 'N/A'}</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Empty state */}
            {!isSearching && searchResults.length === 0 && (
              <div className="col-span-full py-20 text-center space-y-4 opacity-50">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto border border-white/10">
                  {searchType === 'movie' ? <Film className="w-10 h-10 text-muted-foreground" /> : <Tv className="w-10 h-10 text-muted-foreground" />}
                </div>
                <div className="space-y-1">
                  <p className="text-xl font-bold text-foreground">Find Your Favorite {searchType === 'movie' ? 'Movies' : 'Series'}</p>
                  <p className="text-sm text-muted-foreground">Type a {searchType} name to search high-speed servers</p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Player Modal */}
      {createPortal(
        <AnimatePresence>
          {showPlayer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[999999] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-4 md:p-10 overflow-hidden"
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, height: '100dvh', width: '100vw' }}
            >
              <div className="w-full max-w-5xl space-y-4">
                <div className="flex justify-between items-center text-white">
                  <div>
                    <h3 className="text-xl font-bold">{selectedMovie?.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {searchType === 'series' ? `Season ${selectedSeason} • Episode ${selectedEpisode}` : selectedMovie?.year}
                      {selectedQuality && ` • ${selectedQuality.quality}`}
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowPlayer(false)}
                    className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="relative aspect-video rounded-3xl overflow-hidden bg-black shadow-2xl border border-white/10 group">
                  <video 
                    key={getStreamUrl()}
                    controls 
                    autoPlay
                    preload="auto"
                    playsInline
                    className="w-full h-full"
                    poster={selectedMovie?.thumbnail}
                  >
                    <source src={getStreamUrl()} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 text-cyan-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Streaming via High-Speed Proxy</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Details Loading Overlay */}
      {createPortal(
        <AnimatePresence>
          {isLoadingDetails && !selectedMovie && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center"
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, height: '100dvh', width: '100vw' }}
            >
              <div className="w-20 h-20 rounded-3xl glass flex items-center justify-center mb-4">
                <Loader2 className={`w-10 h-10 animate-spin ${searchType === 'movie' ? 'text-cyan-500' : 'text-purple-500'}`} />
              </div>
              <p className="text-white font-bold tracking-widest uppercase text-xs">Fetching High-Speed Servers...</p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default MovieDownloader;
