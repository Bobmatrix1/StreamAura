import React, { useState, useEffect } from 'react';
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
  Edit3
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

const RotatingSpinner = () => (
  <div className="w-8 h-8 relative">
    <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
    <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
  </div>
);

const MovieDownloader: React.FC = () => {
  const { user, requireAuth } = useAuth();
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'movie' | 'series'>('movie');
  const [activeTab, setActiveTab] = useState<'search' | 'library'>('search');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MovieInfo[]>([]);
  const [myPreOrders, setMyPreOrders] = useState<PreOrder[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieInfo | null>(null);
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

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
  }, [activeTab, user?.uid]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSelectedMovie(null);
    try {
      logSearch(query, searchType === 'movie' ? 'movie' : 'series', user?.uid);
      const result = await mediaApi.searchMovies(query, searchType);
      if (result.success) setSearchResults(result.data || []);
      else showError(result.error || 'No results found');
    } catch (err) {
      showError('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectMovie = async (movie: MovieInfo) => {
    setSelectedMovie(movie);
    setCloudData(null);
    setPreOrderSuccess(false);
    setSelectedSeason(null);
    setSelectedEpisode(null);
    setIsManualMode(false); // Reset manual mode on new selection
    setIsCheckingCloud(true);
    
    try {
      const result = await mediaApi.getMovieDetails(movie.id, movie.mediaType || searchType, movie.title);
      if (result.success && result.data) {
        const fullMovieData = result.data;
        setSelectedMovie(fullMovieData);
        
        if (fullMovieData.mediaType === 'series') {
           // If it has automated seasons, select first by default
           if (fullMovieData.seasons && fullMovieData.seasons.length > 0) {
              const firstSeason = fullMovieData.seasons[0];
              setSelectedSeason(firstSeason.season.toString());
              if (firstSeason.episodes && firstSeason.episodes.length > 0) {
                await handleSelectEpisode(firstSeason.season.toString(), firstSeason.episodes[0].toString(), fullMovieData.id, fullMovieData.title);
              }
           } else {
              // No automated seasons found, switch to manual mode automatically
              setIsManualMode(true);
           }
        } else if (fullMovieData.mediaType === 'movie') {
          const cloud = await checkCloudMovie(fullMovieData.id);
          if (cloud) setCloudData(cloud);
        }
      }
    } catch (err) {
      console.error('Error loading movie details');
      setIsManualMode(true); // Fallback to manual mode on error
    } finally {
      setIsCheckingCloud(false);
    }
  };

  const handleSelectEpisode = async (season: string, episode: string, movieIdOverride?: string, movieTitleOverride?: string) => {
    const movieId = movieIdOverride || selectedMovie?.id;
    const movieTitle = movieTitleOverride || selectedMovie?.title;
    if (!movieId) return;

    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setIsCheckingCloud(true);
    setCloudData(null);
    
    try {
      const cloud = await checkCloudMovie(movieId, season, episode);
      if (cloud) {
        setCloudData(cloud);
      } else {
        // Fetch specific episode details to trigger backend resolution
        await mediaApi.getMovieDetails(movieId, 'series', movieTitle, Number(season), Number(episode));
      }
    } catch (err) {
      console.error('Error checking episode cloud');
    } finally {
      if (!movieIdOverride) setIsCheckingCloud(false);
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

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32 text-foreground">
      {selectedMovie && (
        <SEO 
          title={selectedMovie.title}
          description={selectedMovie.description || `Watch ${selectedMovie.title} on StreamAura Cinema.`}
          image={selectedMovie.thumbnail}
        />
      )}
      
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20"
        >
          {searchType === 'movie' ? <Film className="w-10 h-10 text-white" /> : <Tv className="w-10 h-10 text-white" />}
        </motion.div>
        <h2 className="text-4xl font-bold gradient-text uppercase tracking-tighter">StreamAura Cinema</h2>
        
        <div className="flex flex-col items-center gap-4 mt-6">
           <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
              <button 
                onClick={() => setActiveTab('search')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'search' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}
              >
                Search
              </button>
              <button 
                onClick={() => setActiveTab('library')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'library' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}
              >
                My Library
              </button>
           </div>

           {activeTab === 'search' && (
             <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 scale-90">
                <button 
                  onClick={() => setSearchType('movie')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${searchType === 'movie' ? 'bg-cyan-500 text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}
                >
                  <Film size={12} /> Movies
                </button>
                <button 
                  onClick={() => setSearchType('series')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${searchType === 'series' ? 'bg-purple-500 text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}
                >
                  <Tv size={12} /> Seasons
                </button>
             </div>
           )}
        </div>
      </div>

      {activeTab === 'search' ? (
        <>
          {/* Search Input */}
          <div className="glass-card p-3 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={searchType === 'movie' ? "Search movies..." : "Search TV series & seasons..."}
                className="w-full bg-white/5 border border-white/10 pl-12 pr-4 py-4 rounded-xl outline-none focus:border-primary/50"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="px-10 py-4 rounded-xl font-black uppercase tracking-widest text-[11px] text-white gradient-bg shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center min-w-[160px] gap-2"
            >
              {isSearching ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Search size={14} />}
              {isSearching ? 'Searching...' : 'Search Now'}
            </button>
          </div>

          {/* Results / Details */}
          <AnimatePresence mode="wait">
            {selectedMovie ? (
              <motion.div key="details" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
                <button onClick={() => setSelectedMovie(null)} className="text-xs text-muted-foreground hover:text-white flex items-center gap-2 font-black uppercase tracking-widest transition-colors">
                  <X size={14} /> Back to Search
                </button>
                
                <div className="glass-card p-6 md:p-10 border-white/5">
                  <div className="flex flex-col md:flex-row gap-10">
                    <div className="w-full md:w-64 flex-shrink-0">
                      <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-2xl relative group">
                        <img src={selectedMovie.thumbnail} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                      </div>
                    </div>

                    <div className="flex-1 space-y-6">
                      <div>
                        <h3 className="text-4xl font-black mb-4 uppercase tracking-tight leading-none">{selectedMovie.title}</h3>
                        <div className="flex gap-4">
                          <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-[10px] font-black border border-yellow-500/20 flex items-center gap-1.5 uppercase">
                            <Star size={12} fill="currentColor" /> {selectedMovie.rating}
                          </span>
                          <span className="px-3 py-1 rounded-full bg-white/5 text-slate-400 text-[10px] font-black border border-white/10 uppercase">
                            {selectedMovie.year}
                          </span>
                          {selectedMovie.mediaType === 'series' && (
                            <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-[10px] font-black border border-purple-500/20 uppercase">
                              TV Series
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-muted-foreground leading-relaxed text-lg font-medium italic">
                        {selectedMovie.description}
                      </p>

                      {/* Seasons & Episodes for Series */}
                      {selectedMovie.mediaType === 'series' && (
                        <div className="space-y-6 pt-4 relative">
                           <div className="space-y-3">
                              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                                <h4 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                                  <Layers className="w-4 h-4 text-primary" /> Season Navigator
                                </h4>
                                <button 
                                  onClick={() => setIsManualMode(!isManualMode)}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${isManualMode ? 'bg-primary text-white shadow-lg' : 'bg-white/10 text-muted-foreground hover:text-white'}`}
                                >
                                  {isManualMode ? <List className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
                                  {isManualMode ? 'Show List' : 'Enter Manually'}
                                </button>
                              </div>

                              {!isManualMode ? (
                                <>
                                  {selectedMovie.seasons && selectedMovie.seasons.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 relative z-[60]">
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
                                             className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                                               isSeasonActive 
                                                 ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105' 
                                                 : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:text-white'
                                             }`}
                                           >
                                             Season {s.season}
                                           </button>
                                         );
                                       })}
                                    </div>
                                  ) : (
                                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                                       <div className="grid grid-cols-2 gap-4">
                                          <div className="space-y-1.5">
                                             <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Which Season?</label>
                                             <input 
                                               type="text" 
                                               value={manualSeason} 
                                               onChange={e => setManualSeason(e.target.value)}
                                               placeholder="e.g. 1"
                                               className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm font-black text-white outline-none focus:border-primary/50 transition-all"
                                             />
                                          </div>
                                          <div className="space-y-1.5">
                                             <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Which Episode?</label>
                                             <input 
                                               type="text" 
                                               value={manualEpisode} 
                                               onChange={e => setManualEpisode(e.target.value)}
                                               placeholder="e.g. 1, 2 or 1-10"
                                               className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm font-black text-white outline-none focus:border-primary/50 transition-all"
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
                                          className="w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-widest gradient-bg shadow-lg shadow-primary/20"
                                       >
                                          Check Availability
                                       </Button>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-2xl bg-primary/5 border border-primary/20 space-y-4">
                                   <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-1.5">
                                         <label className="text-[9px] font-black uppercase text-primary/70 tracking-widest">Enter Season</label>
                                         <input 
                                           type="text" 
                                           value={manualSeason} 
                                           onChange={e => setManualSeason(e.target.value)}
                                           placeholder="e.g. 1"
                                           className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-sm font-black text-white outline-none focus:border-primary/50 transition-all"
                                         />
                                      </div>
                                      <div className="space-y-1.5">
                                         <label className="text-[9px] font-black uppercase text-primary/70 tracking-widest">Enter Episode(s)</label>
                                         <input 
                                           type="text" 
                                           value={manualEpisode} 
                                           onChange={e => setManualEpisode(e.target.value)}
                                           placeholder="e.g. 1-10"
                                           className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-sm font-black text-white outline-none focus:border-primary/50 transition-all"
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
                                      className="w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-widest gradient-bg shadow-lg shadow-primary/20"
                                   >
                                      Verify Manual Selection
                                   </Button>
                                </motion.div>
                              )}
                           </div>

                           {!isManualMode && selectedSeason !== null && (
                             <motion.div 
                               initial={{ opacity: 0, y: 5 }} 
                               animate={{ opacity: 1, y: 0 }} 
                               className="space-y-4 pt-2 border-t border-white/5 relative"
                             >
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                  <List className="w-3.5 h-3.5" /> Episodes in Season {selectedSeason}
                                </h4>
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-2 relative z-[60]">
                                   {selectedMovie.seasons?.find(s => s.season.toString() === selectedSeason)?.episodes.map(ep => {
                                     const isEpActive = selectedEpisode !== null && selectedEpisode === ep.toString();
                                     return (
                                       <button 
                                         key={`ep-btn-${ep}`}
                                         type="button"
                                         onClick={() => handleSelectEpisode(selectedSeason, ep.toString())}
                                         className={`h-11 rounded-xl text-[10px] font-black border transition-all cursor-pointer ${
                                           isEpActive 
                                             ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20 scale-105' 
                                             : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:text-white'
                                         }`}
                                       >
                                         {ep}
                                       </button>
                                     );
                                   })}
                                </div>
                             </motion.div>
                           )}
                        </div>
                      )}

                      <div className="pt-8 border-t border-white/5">
                        {isCheckingCloud ? (
                          <div className="py-10 flex flex-col items-center gap-4">
                            <RotatingSpinner />
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary animate-pulse">Verifying Cloud Access...</p>
                          </div>
                        ) : cloudData ? (
                          <div className="space-y-4">
                             {selectedMovie.mediaType === 'series' && (
                               <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex gap-3 items-center">
                                 <Check className="text-emerald-500 w-5 h-5 flex-shrink-0" />
                                 <p className="text-[11px] text-emerald-200 font-bold uppercase tracking-widest">Episode {selectedEpisode} (Season {selectedSeason}) is available!</p>
                               </div>
                             )}
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button onClick={handleWatchNow} className="py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20">
                                  <Play fill="currentColor" size={16} /> Watch Now
                                </button>
                                <button onClick={handleDownload} className="py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 border border-white/10">
                                  <Download size={16} /> Download 4K
                                </button>
                             </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {(selectedMovie.mediaType === 'movie' || selectedEpisode !== null) && (
                              <>
                                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3 items-center text-center">
                                  <ShieldAlert className="text-amber-500 w-5 h-5 flex-shrink-0" />
                                  <p className="text-[11px] text-amber-200 font-medium uppercase tracking-wider">
                                    {selectedMovie.mediaType === 'series' 
                                      ? `Episode ${selectedEpisode} of Season ${selectedSeason} is not in our cloud yet.` 
                                      : "This movie is not in our cloud yet."} 
                                    Pre-order to get notified.
                                  </p>
                                </div>
                                <button onClick={handlePreOrder} className="w-full py-4 gradient-bg text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                                  {preOrderSuccess ? <Check size={16} /> : <Play size={16} />}
                                  {preOrderSuccess ? 'Pre-ordered!' : (selectedMovie.mediaType === 'series' ? 'Pre-order Episode' : 'Pre-order Movie')}
                                </button>
                                {selectedMovie.mediaType === 'series' && !selectedEpisode && (
                                   <button onClick={handlePreOrder} className="w-full py-3 bg-white/5 hover:bg-white/10 text-white/50 rounded-2xl font-black uppercase tracking-widest text-[9px] border border-white/5">
                                      Pre-order Entire Season {selectedSeason}
                                   </button>
                                )}
                              </>
                            )}
                            {selectedMovie.mediaType === 'series' && !selectedSeason && (
                              <div className="text-center py-6 border-2 border-dashed border-white/5 rounded-2xl">
                                 <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select a season & episode to check availability</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6">
                {searchResults.map(movie => (
                  <motion.div key={movie.id} whileHover={{ y: -5 }} onClick={() => handleSelectMovie(movie)} className="glass-card group cursor-pointer overflow-hidden border-white/5">
                    <div className="aspect-[2/3] relative">
                      <img src={movie.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]">
                        <div className="px-4 py-2 bg-white text-black text-[10px] font-black uppercase rounded-lg shadow-2xl">View Details</div>
                      </div>
                      {movie.mediaType === 'series' && (
                        <div className="absolute top-2 left-2 px-2 py-1 rounded bg-purple-600 text-[8px] font-black text-white uppercase tracking-widest shadow-lg">SERIES</div>
                      )}
                    </div>
                    <div className="p-4 bg-white/[0.02]">
                      <p className="font-black text-[11px] uppercase truncate text-white/90">{movie.title}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">{movie.year}</p>
                        {preOrderSuccess && movieToPreOrder?.id === movie.id && (
                          <span className="text-[8px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-black uppercase border border-primary/30">PENDING</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">My Pre-orders & Requests</h3>
            <button 
              onClick={loadLibrary} 
              disabled={isLoadingLibrary}
              className="p-2 hover:bg-white/5 rounded-full transition-all active:scale-95 group"
            >
              <RefreshCw className={`w-4 h-4 text-primary transition-all ${isLoadingLibrary ? 'animate-spin' : 'group-hover:rotate-180 duration-500'}`} />
            </button>
          </div>

          {isLoadingLibrary ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4">
              <RotatingSpinner />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Syncing Library...</p>
            </div>
          ) : myPreOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {myPreOrders.map(order => (
                 <Card key={order.id} className="p-4 glass-card border-white/5 flex gap-5 group hover:border-white/10 transition-all overflow-hidden relative">
                    {order.status === 'available' && <div className="absolute top-0 right-0 p-2"><Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[8px] font-black uppercase">READY</Badge></div>}
                    <div className="w-24 h-32 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 relative">
                       <img src={order.thumbnail} className="w-full h-full object-cover" />
                       {order.status === 'available' && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Play fill="currentColor" className="text-white w-6 h-6" /></div>}
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                       <div>
                          <h4 className="font-black text-sm text-white uppercase truncate">{order.title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                             <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">Requested {new Date(order.requestedAt).toLocaleDateString()}</p>
                             {order.season && <Badge variant="outline" className="text-[12px] font-black border-primary/40 bg-primary/10 text-primary tracking-widest px-3 py-1">S{order.season} E{order.episode}</Badge>}
                          </div>
                       </div>
                       
                       <div className="space-y-2">
                          {order.status === 'available' ? (
                             <>
                               <div className="flex flex-wrap gap-2">
                                  <Button onClick={() => { setCloudData({ streamUrl: order.movieUrl!, title: order.title } as any); setShowPlayer(true); }} className="h-8 flex-1 gradient-bg rounded-lg text-[9px] font-black uppercase tracking-widest">Watch</Button>
                                  <Button onClick={() => { if (order.movieUrl) window.open(order.movieUrl, '_blank'); handleUpdateStatus(order.id, 'downloaded'); }} variant="outline" className="h-8 flex-1 border-white/10 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Save</Button>
                               </div>
                               <div className="flex gap-2">
                                  <Button onClick={() => handleCreateRoomFromPreOrder(order)} variant="ghost" className="h-7 flex-1 border border-white/5 hover:bg-primary/10 text-primary rounded-lg text-[8px] font-black uppercase tracking-widest">Create Room</Button>
                                  <Button onClick={() => handleUpdateStatus(order.id, 'watched')} variant="ghost" className="h-7 flex-1 border border-white/5 hover:bg-emerald-500/10 text-emerald-400 rounded-lg text-[8px] font-black uppercase tracking-widest">{order.userStatus === 'watched' ? '✓ Watched' : 'Mark Watched'}</Button>
                               </div>
                             </>
                          ) : (
                             <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex flex-col items-center justify-center gap-2 min-h-[120px] text-center">
                                <ShieldAlert className="w-6 h-6 text-amber-500/50 mb-1" />
                                <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">Not Available Yet</p>
                                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">
                                  Your request is pending.<br/>Check back later when it's uploaded.
                                </p>
                             </div>
                          )}
                       </div>
                    </div>
                 </Card>
               ))}
            </div>
          ) : (
            <div className="py-20 text-center opacity-30">
               <Film className="w-12 h-12 mx-auto mb-4" />
               <p className="text-sm font-bold uppercase tracking-widest">Your library is empty</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Pre-order Modal */}
      <AnimatePresence>
        {showPreOrderModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full max-w-md p-8 text-center space-y-6 border-white/10 shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto border border-primary/20">
                <Info className="text-primary w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black uppercase tracking-tight text-white">Pre-order {selectedEpisode ? 'Episode' : 'Series'}</h3>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest leading-relaxed">
                  You are about to request "{movieToPreOrder?.title}" 
                  {selectedEpisode && ` (Season ${selectedSeason}, Episode ${selectedEpisode})`}. 
                  Once it's ready in our cloud, you'll receive a notification and it will appear in your library.
                </p>
              </div>
              <div className="flex gap-4">
                <Button onClick={() => setShowPreOrderModal(false)} variant="ghost" className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest text-[10px] border border-white/10 hover:bg-white/5">Cancel</Button>
                <Button onClick={confirmPreOrder} disabled={isPreOrdering} className="flex-[2] h-12 rounded-xl gradient-bg font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20">
                  {isPreOrdering ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Confirm Order'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Player Modal */}
      <AnimatePresence>
        {showPlayer && cloudData && (
          <div className="fixed inset-0 z-[2000] bg-black flex flex-col">
            <div className="p-4 flex justify-between items-center bg-black/50 backdrop-blur-md border-b border-white/10">
              <div className="flex items-center gap-3">
                 <Play className="text-primary w-5 h-5 fill-current" />
                 <h4 className="font-black text-white uppercase tracking-tight text-sm">{cloudData.title} {selectedEpisode && `(S${selectedSeason} E${selectedEpisode})`}</h4>
              </div>
              <button onClick={() => setShowPlayer(false)} className="p-2 hover:bg-white/10 rounded-full transition-all group">
                <X className="w-6 h-6 text-white group-hover:rotate-90 transition-transform" />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-4">
              <video controls autoPlay className="max-w-full max-h-full rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/5">
                <source src={cloudData.streamUrl} type="video/mp4" />
              </video>
            </div>
            <div className="p-6 text-center border-t border-white/5">
               <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.3em] opacity-40">StreamAura High-Quality Cloud Delivery</p>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MovieDownloader;
