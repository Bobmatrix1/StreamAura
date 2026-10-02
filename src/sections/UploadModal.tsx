import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Loader2, 
  Upload, 
  Check, 
  Video, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  Sparkles, 
  Tv, 
  Film, 
  FileText,
  Tag,
  Calendar,
  Star,
  ChevronDown
} from 'lucide-react';
import { fulfillPreOrder, uploadFile, type PreOrder } from '../lib/firebase';
import { useToast } from '../contexts/ToastContext';

interface UploadModalProps {
  preOrder: PreOrder;
  onClose: () => void;
  onSuccess: () => void;
}

const GENRE_OPTIONS = [
  "Action", "Adventure", "Alternate History", "Animation", "Anime", "Anthology", "Apocalyptic", "Art House", 
  "Biography", "Black Comedy", "Blaxploitation", "Buddy Cop", "Buddy Film", "Caper", "Cartoon", "Children's", 
  "Chick Flick", "Christmas", "Cinema", "Classic", "Comedy", "Coming-of-Age", "Concert Film", "Crime", "Cult", 
  "Cyberpunk", "Dance", "Dark Comedy", "Disaster", "Documentary", "Docudrama", "Drama", "Dystopian", 
  "Educational", "Epic", "Erotic", "Experimental", "Fairy Tale", "Family", "Fantasy", "Film Noir", 
  "Found Footage", "Gangster", "Ghost", "Gore", "Gothic", "Grindhouse", "Heist", "Historical", 
  "Historical Fiction", "Holiday", "Horror", "Independent", "Inspirational", "Interactive", "Legal Drama", 
  "Live Action", "Martial Arts", "Medical Drama", "Melodrama", "Military", "Mockumentary", "Monster", 
  "Music", "Musical", "Mystery", "Mythological", "Neo-Noir", "Occult", "Parody", "Period Drama", 
  "Political Thriller", "Post-Apocalyptic", "Psychological Horror", "Psychological Thriller", "Road Movie", 
  "Romance", "Romantic Comedy", "Satire", "Science Fiction", "Sci-Fi", "Screwball Comedy", "Short Film", "Silent Film", 
  "Slapstick", "Slasher", "Slice of Life", "Soap Opera", "Space Opera", "Sports", "Spy", "Steampunk", 
  "Stop Motion", "Superhero", "Supernatural", "Survival", "Suspense", "Sword and Sorcery", "Teen", 
  "Tech Noir", "Thriller", "Time Travel", "Tragedy", "True Crime", "Vampire", "War", "Western", 
  "Whodunit", "Zombie"
];

export const UploadModal: React.FC<UploadModalProps> = ({ preOrder, onClose, onSuccess }) => {
  // Source Mode: 'url' (Direct Cloud/Stream Link) vs 'file' (Upload from device)
  const [sourceMode, setSourceMode] = useState<'url' | 'file'>(preOrder.movieUrl ? 'url' : 'url');
  const [directMovieUrl, setDirectMovieUrl] = useState(preOrder.movieUrl || '');
  const [movieFile, setMovieFile] = useState<File | null>(null);

  // Poster Mode: 'preorder' (Use existing thumbnail) vs 'url' vs 'file'
  const [coverMode, setCoverMode] = useState<'preorder' | 'url' | 'file'>('preorder');
  const [customCoverUrl, setCustomCoverUrl] = useState(preOrder.thumbnail || '');
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // Content Metadata
  const [title, setTitle] = useState(preOrder.title || '');
  const [genre, setGenre] = useState(preOrder.genre || 'Action');
  const [genreSearch, setGenreSearch] = useState('');
  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const genreDropdownRef = useRef<HTMLDivElement>(null);

  const [description, setDescription] = useState(
    preOrder.description || (
      preOrder.mediaType === 'series' 
        ? `Season ${preOrder.season || '1'}, Episode ${preOrder.episode || '1'} 4K Stream ready.` 
        : 'High-speed 4K cloud streaming and download ready.'
    )
  );
  const [adminNotes, setAdminNotes] = useState(preOrder.adminNotes || '');
  const [year, setYear] = useState(preOrder.year || new Date().getFullYear().toString());
  const [rating, setRating] = useState(preOrder.rating || '8.5');

  const [isFulfilling, setIsFulfilling] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const { showSuccess, showError } = useToast();

  const movieInputRef = React.useRef<HTMLInputElement>(null);
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  // Click outside listener for Genre dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(e.target as Node)) {
        setIsGenreDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFulfill = async () => {
    // Validation
    let resolvedMovieUrl = '';
    if (sourceMode === 'url') {
      if (!directMovieUrl.trim()) {
        showError('Please enter a valid Stream / Video URL (e.g. https://.../movie.mp4)');
        return;
      }
      resolvedMovieUrl = directMovieUrl.trim();
    } else {
      if (!movieFile) {
        showError('Please select a video file to upload.');
        return;
      }
    }

    let resolvedCoverUrl = preOrder.thumbnail || '';
    if (coverMode === 'url') {
      if (!customCoverUrl.trim()) {
        showError('Please enter a valid artwork URL.');
        return;
      }
      resolvedCoverUrl = customCoverUrl.trim();
    } else if (coverMode === 'file') {
      if (!coverFile) {
        showError('Please select a cover image file to upload.');
        return;
      }
    }

    if (!title.trim()) {
      showError('Movie/Series title cannot be empty.');
      return;
    }

    setIsFulfilling(true);
    setUploadProgress(0);

    try {
      // 1. Upload Cover if file mode
      if (coverMode === 'file' && coverFile) {
        setUploadStatusText('Uploading custom artwork to Cloudflare R2...');
        resolvedCoverUrl = await uploadFile(coverFile, 'preorders/covers', 'assets', (p) => {
          setUploadProgress(Math.floor(p * 0.2));
        });
      }

      // 2. Upload Video if file mode
      if (sourceMode === 'file' && movieFile) {
        setUploadStatusText(`Uploading 4K Video file (${(movieFile.size / (1024 * 1024)).toFixed(1)} MB)...`);
        resolvedMovieUrl = await uploadFile(movieFile, 'preorders/movies', 'movies', (p) => {
          setUploadProgress(20 + Math.floor(p * 0.75));
        });
      }

      setUploadStatusText('Indexing in Global Catalog & Notifying User...');
      setUploadProgress(98);

      // 3. Fulfill Pre-order, Save to Cloud Catalog & Trigger Notification
      await fulfillPreOrder(
        preOrder.id,
        preOrder.userId,
        title.trim(),
        resolvedMovieUrl,
        resolvedCoverUrl,
        preOrder.movieId,
        preOrder.mediaType,
        preOrder.season?.toString(),
        preOrder.episode?.toString(),
        {
          description: description.trim(),
          year: year.trim(),
          rating: rating.trim(),
          adminNotes: adminNotes.trim(),
          genre
        }
      );

      setUploadProgress(100);
      showSuccess(`"${title}" delivered! ${preOrder.userName} has been notified.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Fulfill pre-order error:', err);
      showError(err.message || 'Failed to fulfill order');
    } finally {
      setIsFulfilling(false);
      setUploadStatusText('');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-xl flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 15 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="glass-card w-full max-w-3xl max-h-[92dvh] flex flex-col relative overflow-hidden shadow-2xl border-white/15 rounded-3xl bg-[#090d1a] my-auto"
      >
        {/* Top Decorative Glow */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-cyan-500 via-primary to-emerald-500 z-50" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-cyan-500/15 blur-3xl rounded-full pointer-events-none" />
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-center bg-black/40 relative z-20 shrink-0">
          <div className="space-y-1 min-w-0 pr-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] sm:text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border border-cyan-500/30">
                {preOrder.mediaType === 'series' ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                {preOrder.mediaType === 'series' ? 'TV Series Order' : 'Movie Order'}
              </span>
              {preOrder.season && (
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[9px] sm:text-[10px] font-black uppercase border border-purple-500/30">
                  S{preOrder.season} E{preOrder.episode || '1'}
                </span>
              )}
            </div>
            <h3 className="text-base sm:text-xl font-black uppercase tracking-tight text-white flex items-center gap-2 pt-0.5 truncate">
              <Upload className="text-cyan-400 w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Deliver Media & Fulfill Request
            </h3>
            <p className="text-[11px] sm:text-xs text-white/50 font-medium truncate">
              Requester: <strong className="text-white">{preOrder.userName}</strong> ({preOrder.userEmail})
            </p>
          </div>
          <button 
            onClick={onClose} 
            disabled={isFulfilling}
            className="p-2 sm:p-2.5 hover:bg-white/10 rounded-2xl text-white/50 hover:text-white transition-all cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 scrollbar-thin scrollbar-thumb-white/10 relative z-10">
          
          {/* 1. Video Source Section (Direct URL vs File Upload) */}
          <div className="space-y-2.5 p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <Video className="w-4 h-4" /> 1. Video Stream Source (Compulsory)
              </label>
              
              {/* Platform Toggle Pills */}
              <div className="flex items-center p-0.5 rounded-xl bg-black/40 border border-white/10 text-[11px] font-bold w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSourceMode('url')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    sourceMode === 'url' ? 'bg-cyan-500 text-white shadow-md' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <LinkIcon className="w-3 h-3" /> Direct Stream URL
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('file')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    sourceMode === 'file' ? 'bg-cyan-500 text-white shadow-md' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Upload className="w-3 h-3" /> Upload File
                </button>
              </div>
            </div>

            {sourceMode === 'url' ? (
              <div className="space-y-1">
                <div className="relative">
                  <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 pointer-events-none" />
                  <input
                    type="url"
                    value={directMovieUrl}
                    onChange={(e) => setDirectMovieUrl(e.target.value)}
                    placeholder="https://your-bucket.com/movie.mp4 or HLS (.m3u8) link"
                    className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-black/40 border border-white/15 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-cyan-400 transition-all placeholder:text-white/20"
                  />
                </div>
                <p className="text-[10px] text-white/40 font-medium">
                  💡 Paste any HTTPS stream URL, Cloudflare R2 bucket link, S3 object URL, or CDN stream.
                </p>
              </div>
            ) : (
              <div
                onClick={() => movieInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  movieFile ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/15 bg-black/30 hover:border-cyan-500/50'
                }`}
              >
                {movieFile ? (
                  <div className="text-center space-y-1">
                    <Check className="w-7 h-7 sm:w-8 sm:h-8 text-cyan-400 mx-auto" />
                    <p className="text-xs font-black text-white truncate max-w-xs sm:max-w-md">{movieFile.name}</p>
                    <p className="text-[10px] text-cyan-300 font-mono">{(movieFile.size / (1024 * 1024)).toFixed(1)} MB ready to upload</p>
                  </div>
                ) : (
                  <div className="text-center space-y-1">
                    <Video className="w-6 h-6 sm:w-7 sm:h-7 text-white/40 mx-auto mb-1" />
                    <p className="text-xs font-bold text-white">Click or drag & drop video file</p>
                    <p className="text-[10px] text-white/40">MP4, MKV, WebM (Auto-mirrored to R2)</p>
                  </div>
                )}
                <input
                  type="file"
                  ref={movieInputRef}
                  className="hidden"
                  accept="video/*"
                  onChange={(e) => setMovieFile(e.target.files?.[0] || null)}
                />
              </div>
            )}
          </div>

          {/* 2. Poster & Artwork Selection */}
          <div className="space-y-2.5 p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4" /> 2. Cinema Poster & Artwork
              </label>

              {/* Platform Toggle Pills */}
              <div className="flex items-center p-0.5 rounded-xl bg-black/40 border border-white/10 text-[11px] font-bold w-full sm:w-auto overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setCoverMode('preorder')}
                  className={`flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap text-center ${
                    coverMode === 'preorder' ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  Order Poster
                </button>
                <button
                  type="button"
                  onClick={() => setCoverMode('url')}
                  className={`flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap text-center ${
                    coverMode === 'url' ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  Custom URL
                </button>
                <button
                  type="button"
                  onClick={() => setCoverMode('file')}
                  className={`flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap text-center ${
                    coverMode === 'file' ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  Upload Cover
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              {/* Artwork Preview Card */}
              <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl border border-white/20 overflow-hidden bg-black/50 shrink-0 shadow-lg relative">
                {coverMode === 'file' && coverFile ? (
                  <img src={URL.createObjectURL(coverFile)} className="w-full h-full object-cover" alt="Preview" />
                ) : coverMode === 'url' && customCoverUrl ? (
                  <img src={customCoverUrl} className="w-full h-full object-cover" alt="Preview" />
                ) : preOrder.thumbnail ? (
                  <img src={preOrder.thumbnail} className="w-full h-full object-cover" alt={preOrder.title} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}
              </div>

              {/* Selector Input */}
              <div className="flex-1 min-w-0 space-y-1.5">
                {coverMode === 'preorder' && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-200 text-xs">
                    <p className="font-bold text-[11px] sm:text-xs">Using Original Request Poster</p>
                    <p className="text-[10px] text-purple-300/70 truncate mt-0.5">{preOrder.thumbnail || 'No thumbnail link'}</p>
                  </div>
                )}

                {coverMode === 'url' && (
                  <input
                    type="url"
                    value={customCoverUrl}
                    onChange={(e) => setCustomCoverUrl(e.target.value)}
                    placeholder="https://image.tmdb.org/t/p/original/... or custom image URL"
                    className="w-full px-3.5 py-2.5 bg-black/40 border border-white/15 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-purple-400"
                  />
                )}

                {coverMode === 'file' && (
                  <div
                    onClick={() => coverInputRef.current?.click()}
                    className="p-3 rounded-xl border border-dashed border-white/20 bg-black/30 hover:border-purple-400/50 cursor-pointer text-center"
                  >
                    <p className="text-xs font-bold text-white truncate">{coverFile ? coverFile.name : 'Select JPG/PNG poster image'}</p>
                    <input
                      type="file"
                      ref={coverInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Title, Year, Rating & Genre (Platform Design) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-white/70 tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" /> Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white outline-none focus:border-cyan-400"
              />
            </div>

            {/* Platform Custom Genre Dropdown */}
            <div className="space-y-1.5 relative" ref={genreDropdownRef}>
              <label className="text-[11px] font-black uppercase text-white/70 tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-purple-400" /> Primary Genre
              </label>
              
              <button
                type="button"
                onClick={() => setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                className="w-full bg-black/40 hover:bg-black/60 border border-white/15 hover:border-purple-400/50 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white flex items-center justify-between gap-2 transition-all cursor-pointer"
              >
                <span className="truncate">{genre}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-white/50 transition-transform duration-200 ${isGenreDropdownOpen ? 'rotate-180 text-purple-400' : ''}`} />
              </button>

              <AnimatePresence>
                {isGenreDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -5, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#090e1c]/98 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl p-2.5 space-y-2 max-h-72 flex flex-col"
                  >
                    {/* Genre Quick Filter Input */}
                    <div className="relative shrink-0">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Search genre (e.g. Sci-Fi, Anime, Horror)..."
                        value={genreSearch}
                        onChange={(e) => setGenreSearch(e.target.value)}
                        className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-purple-400 font-medium"
                      />
                    </div>

                    {/* Filtered Genre Buttons Grid */}
                    <div className="overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1 scrollbar-thin scrollbar-thumb-white/15 flex-1 pr-0.5">
                      {GENRE_OPTIONS.filter(g => g.toLowerCase().includes(genreSearch.toLowerCase().trim())).map((g) => {
                        const isSelected = g === genre;
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => {
                              setGenre(g);
                              setIsGenreDropdownOpen(false);
                              setGenreSearch('');
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-between gap-1 transition-all cursor-pointer text-left truncate ${
                              isSelected 
                                ? 'bg-purple-600 text-white font-black shadow-sm' 
                                : 'text-white/70 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <span className="truncate">{g}</span>
                            {isSelected && <Check className="w-3 h-3 text-white shrink-0" />}
                          </button>
                        );
                      })}
                      {GENRE_OPTIONS.filter(g => g.toLowerCase().includes(genreSearch.toLowerCase().trim())).length === 0 && (
                        <div className="col-span-2 sm:col-span-3 py-3 text-center text-xs text-white/40 italic">
                          No genres matching "{genreSearch}"
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-white/70 tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" /> Release Year
              </label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white outline-none focus:border-amber-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-white/70 tracking-wider flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-yellow-400" /> Rating
              </label>
              <input
                type="text"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white outline-none focus:border-yellow-400"
              />
            </div>
          </div>

          {/* 4. Content Description & Admin Memo */}
          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-white/70 tracking-wider">
                Description & Room Overview (Auto-filled into Cinema Room Creation)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-black/40 border border-white/15 rounded-xl sm:rounded-2xl p-3 sm:p-4 text-xs font-medium text-white outline-none focus:border-cyan-400 resize-none leading-relaxed"
                placeholder="Content overview, video resolution, audio channels..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-white/70 tracking-wider">
                Admin Note for Requester (Optional memo shown in notification)
              </label>
              <input
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Mastered in 4K with Dolby Atmos & subtitles included!"
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {/* Automated System Sync Protocol Info Banner */}
          <div className="p-3 sm:p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-start gap-2.5 sm:gap-3">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold text-cyan-200 text-[11px] sm:text-xs">Global Catalog & Cinema Deep-Link Sync</p>
              <p className="text-[10px] sm:text-[11px] text-white/60 leading-relaxed">
                Fulfilling this request will save the movie to the global cloud index. Future searches on the movies page will show <strong>"Watch in Cinema"</strong> instead of pre-order. <strong>{preOrder.userName}</strong> will receive an instant notification that directly opens the Cinema Room creation modal with all details pre-filled.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions (Sticky Bottom) */}
        <div className="p-3.5 sm:p-6 border-t border-white/10 bg-black/40 relative z-20 flex items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isFulfilling}
            className="px-4 sm:px-5 py-3 rounded-xl border border-white/15 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-white/5 transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleFulfill}
            disabled={isFulfilling}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-emerald-600 hover:brightness-110 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-cyan-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-98"
          >
            {isFulfilling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="truncate">{uploadStatusText || `Delivering ${uploadProgress}%`}</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span className="truncate">Deliver & Notify Requester</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
