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
  X, 
  Play, 
  Zap,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import mediaApi from '../api/mediaApi';
import { logSearch, checkCloudMovie, createPreOrder, type CloudMovie } from '../lib/firebase';
import type { MovieInfo } from '../types';

const MovieDownloader: React.FC = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const searchType = 'movie'; // Fixed to 'movie' since series functionality seems incomplete or moved
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MovieInfo[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieInfo | null>(null);
  const [isLoadingDetails, setIsLoadingPreview] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  // Cloud Logic States
  const [cloudData, setCloudData] = useState<CloudMovie | null>(null);
  const [showPreOrderModal, setShowPreOrderModal] = useState(false);
  const [isPreOrdering, setIsPreOrdering] = useState(false);
  const [preOrderSuccess, setPreOrderSuccess] = useState(false);
  const [movieToPreOrder, setMovieToPreOrder] = useState<MovieInfo | null>(null);

  const { showError, showSuccess } = useToast();

  // Body scroll lock
  useEffect(() => {
    if (showPlayer || (isLoadingDetails && !selectedMovie) || showPreOrderModal) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = 'unset'; };
    }
  }, [showPlayer, isLoadingDetails, selectedMovie, showPreOrderModal]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSelectedMovie(null);
    logSearch(query, searchType as any, user?.uid);
    try {
      const result = await mediaApi.searchMovies(query, searchType as 'movie' | 'series');
      if (result.success && result.data) {
        setSearchResults(result.data);
      }
    } catch (err) {
      showError('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectMovie = async (movie: MovieInfo) => {
    setIsLoadingPreview(true);
    setCloudData(null);
    setPreOrderSuccess(false);

    try {
      // 1. Check Cloud Library first
      const cloud = await checkCloudMovie(movie.id);
      
      if (cloud) {
        // If in cloud, use cloud data for details and show details view
        setCloudData(cloud);
        setSelectedMovie({
          ...movie,
          title: cloud.title,
          description: cloud.description,
          thumbnail: cloud.thumbnail,
          year: cloud.year,
          rating: cloud.rating
        });
      } else {
        // If NOT in cloud, STAY on search grid but show pre-order modal
        setMovieToPreOrder(movie);
        setShowPreOrderModal(true);
      }
    } catch (err) {
      showError('Error checking library');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handlePreOrderRequest = async () => {
    if (!user || !movieToPreOrder) return;
    setIsPreOrdering(true);
    try {
      await createPreOrder(user.uid, user.email || '', user.displayName || 'Anonymous', movieToPreOrder);
      setPreOrderSuccess(true);
      setShowPreOrderModal(false);
      showSuccess('Movie pre-ordered successfully!');
    } catch (err) {
      showError('Failed to process pre-order');
    } finally {
      setIsPreOrdering(false);
    }
  };

  const handleWatchNow = () => {
    if (!cloudData) return;
    setShowPlayer(true);
  };

  const handleDownload = () => {
    if (!cloudData) return;
    window.open(cloudData.downloadUrl, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32 text-foreground">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br flex items-center justify-center shadow-lg transition-all duration-500 ${
            searchType === 'movie' ? 'from-cyan-500 to-blue-600 shadow-cyan-500/20' : 'from-purple-500 to-indigo-600 shadow-purple-500/20'
          }`}
        >
          {searchType === 'movie' ? <Film className="w-10 h-10 text-white" /> : <Tv className="w-10 h-10 text-white" />}
        </motion.div>
        <h2 className="text-4xl font-bold gradient-text">StreamAura Cinema</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Access our high-quality cloud library or pre-order upcoming releases.
        </p>
      </div>

      {/* Search Input */}
      <div className="glass-card p-3 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search movie or series..."
            className="w-full glass-input pl-12 pr-4 py-4 rounded-xl outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className={`px-8 py-4 rounded-xl font-bold text-white transition-all ${
            searchType === 'movie' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-purple-600 hover:bg-purple-500'
          }`}
        >
          {isSearching ? <Loader2 className="animate-spin" /> : 'Search'}
        </button>
      </div>

      {/* Results / Details */}
      <AnimatePresence mode="wait">
        {selectedMovie ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <button onClick={() => setSelectedMovie(null)} className="text-xs text-muted-foreground hover:text-white flex items-center gap-2">
              <X size={14} /> Back to Search
            </button>
            
            <div className="glass-card p-6 md:p-10">
              <div className="flex flex-col md:flex-row gap-10">
                <div className="w-full md:w-64 flex-shrink-0">
                  <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-2xl">
                    <img src={selectedMovie.thumbnail} className="w-full h-full object-cover" />
                  </div>
                </div>

                <div className="flex-1 space-y-6">
                  <div>
                    <h3 className="text-4xl font-black mb-4">{selectedMovie.title}</h3>
                    <div className="flex gap-4">
                      <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-bold border border-yellow-500/20 flex items-center gap-1.5">
                        <Star size={14} fill="currentColor" /> {selectedMovie.rating}
                      </span>
                      <span className="px-3 py-1 rounded-full bg-white/5 text-slate-400 text-xs font-bold border border-white/10">
                        {selectedMovie.year}
                      </span>
                    </div>
                  </div>

                  <p className="text-muted-foreground leading-relaxed text-lg italic">
                    {selectedMovie.description}
                  </p>

                  <div className="pt-8 border-t border-white/5">
                    {cloudData && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button onClick={handleWatchNow} className="py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20">
                          <Play fill="currentColor" /> Watch Now
                        </button>
                        <button onClick={handleDownload} className="py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-white/10">
                          <Download /> Download
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6">
            {searchResults.map(movie => (
              <motion.div key={movie.id} whileHover={{ y: -5 }} onClick={() => handleSelectMovie(movie)} className="glass-card group cursor-pointer overflow-hidden border-white/5">
                <div className="aspect-[2/3] relative">
                  <img src={movie.thumbnail} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <div className="px-4 py-2 bg-white text-black text-xs font-black uppercase rounded-lg">Details</div>
                  </div>
                </div>
                <div className="p-3">
                  <p className="font-bold text-sm truncate">{movie.title}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase">{movie.year}</p>
                    {preOrderSuccess && movieToPreOrder?.id === movie.id && (
                      <span className="text-[8px] bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full font-bold">PRE-ORDERED</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pre-Order Confirmation Modal */}
      {showPreOrderModal && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card max-w-md w-full p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto">
              <Zap className="w-10 h-10 text-blue-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase tracking-tighter">Pre-Order Movie?</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Do you want to pre-order <span className="text-white font-bold">"{movieToPreOrder?.title}"</span>? It is completely free! We will notify you once it's uploaded to our cloud.
              </p>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  setShowPreOrderModal(false);
                  setMovieToPreOrder(null);
                }}
                className="flex-1 py-4 rounded-xl border border-white/10 font-bold uppercase text-xs hover:bg-white/5"
              >
                No, Cancel
              </button>
              <button 
                onClick={handlePreOrderRequest}
                disabled={isPreOrdering}
                className="flex-1 py-4 rounded-xl bg-blue-600 text-white font-bold uppercase text-xs flex items-center justify-center gap-2"
              >
                {isPreOrdering ? <Loader2 className="animate-spin w-4 h-4" /> : 'Yes, Pre-Order'}
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Video Player Modal */}
      {showPlayer && cloudData && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black flex flex-col">
          <div className="p-4 flex justify-between items-center text-white bg-black/50 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <button onClick={() => setShowPlayer(false)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><X /></button>
              <h3 className="font-bold">{cloudData.title}</h3>
            </div>
          </div>
          <div className="flex-1 bg-black flex items-center justify-center">
            <video controls autoPlay className="max-w-full max-h-full">
              <source src={cloudData.streamUrl} type="video/mp4" />
            </video>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default MovieDownloader;
