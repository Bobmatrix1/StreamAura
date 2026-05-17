import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Loader2, Upload, Check, Video, Image as ImageIcon } from 'lucide-react';
import { uploadToCloud, fulfillPreOrder, uploadFile, type PreOrder, type CloudMovie } from '../lib/firebase';
import { useToast } from '../contexts/ToastContext';

interface UploadModalProps {
  preOrder: PreOrder;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ preOrder, onClose, onSuccess }) => {
  const [movieFile, setMovieFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [description, setDescription] = useState(preOrder.mediaType === 'series' 
    ? `Season ${preOrder.season}, Episode ${preOrder.episode} now available.` 
    : 'Pre-ordered content now available.');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [rating, setRating] = useState('8.5');
  const [isFulfilling, setIsFulfilling] = useState(false);
  const { showSuccess, showError } = useToast();

  const movieInputRef = React.useRef<HTMLInputElement>(null);
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  const handleFulfill = async () => {
    if (!movieFile || !coverFile || !description || !year || !rating) {
      showError('Please fill all fields and upload required media');
      return;
    }
    
    setIsFulfilling(true);
    try {
      // 1. Upload cover image to R2 (assets)
      const coverUrl = await uploadFile(coverFile, 'preorders/covers', 'assets');
      
      // 2. Upload movie file to R2 (movies)
      const movieUrl = await uploadFile(movieFile, 'preorders/movies', 'movies');

      const movieData: CloudMovie = {
        id: preOrder.movieId,
        title: preOrder.title,
        thumbnail: coverUrl,
        description,
        year,
        rating,
        streamUrl: movieUrl,
        downloadUrl: movieUrl,
        mediaType: preOrder.mediaType,
        season: preOrder.season || undefined,
        episode: preOrder.episode || undefined,
        addedAt: Date.now(),
      };

      // 3. Add to global cloud library
      // For series, we store each episode as a separate cloud movie entry or use a nested structure
      // For now, let's use a composite ID for episodes in the movies collection
      const cloudId = preOrder.mediaType === 'series' 
        ? `${preOrder.movieId}_s${preOrder.season}_e${preOrder.episode}` 
        : preOrder.movieId;
        
      await uploadToCloud({ ...movieData, id: cloudId });
      
      // 4. Mark pre-order as available and notify user
      await fulfillPreOrder(preOrder.id, preOrder.userId, preOrder.title, movieUrl, coverUrl);
      
      showSuccess('Movie uploaded and user notified!');
      onSuccess();
    } catch (err) {
      showError('Failed to fulfill order');
    } finally {
      setIsFulfilling(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className="glass-card w-full max-w-2xl max-h-[90vh] flex flex-col relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border-white/10"
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-cyan-500 via-primary to-blue-600 z-50" />
        
        {/* Header */}
        <div className="p-8 border-b border-white/10 flex justify-between items-center bg-black/40 relative z-20">
          <div className="space-y-1">
             <h3 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-3">
               <Upload className="text-primary w-6 h-6" /> Deliver Media
             </h3>
             <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.3em]">{preOrder.title}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all hover:rotate-90 group">
            <X className="w-6 h-6 text-muted-foreground group-hover:text-white" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar relative z-10">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             {/* Movie File Picker */}
             <div className="space-y-3">
                <label className="text-[11px] font-black uppercase text-white/70 tracking-widest ml-1">1. Video Source</label>
                <div 
                  onClick={() => movieInputRef.current?.click()}
                  className={`aspect-video rounded-3xl border-2 border-dashed ${movieFile ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all group overflow-hidden`}
                >
                   {movieFile ? (
                     <div className="text-center p-4">
                       <Check className="w-10 h-10 text-primary mb-3 mx-auto" />
                       <span className="text-[11px] font-black text-white uppercase truncate block w-full px-4">{movieFile.name}</span>
                     </div>
                   ) : (
                     <>
                       <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                          <Video className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                       </div>
                       <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Video File</span>
                     </>
                   )}
                   <input type="file" ref={movieInputRef} className="hidden" accept="video/*" onChange={e => setMovieFile(e.target.files?.[0] || null)} />
                </div>
             </div>

             {/* Poster Image Picker */}
             <div className="space-y-3">
                <label className="text-[11px] font-black uppercase text-white/70 tracking-widest ml-1">2. Cinema Poster</label>
                <div 
                  onClick={() => coverInputRef.current?.click()}
                  className={`aspect-video rounded-3xl border-2 border-dashed ${coverFile ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all group overflow-hidden relative`}
                >
                   {coverFile ? (
                     <div className="absolute inset-0">
                        <img src={URL.createObjectURL(coverFile)} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                           <ImageIcon className="w-8 h-8 text-white" />
                        </div>
                     </div>
                   ) : (
                     <>
                       <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                          <ImageIcon className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                       </div>
                       <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Artwork</span>
                     </>
                   )}
                   <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={e => setCoverFile(e.target.files?.[0] || null)} />
                </div>
             </div>
          </div>

          <div className="space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Release Year</label>
                   <input 
                    type="text" 
                    value={year}
                    onChange={e => setYear(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-white outline-none focus:border-primary/50 transition-all"
                    placeholder="e.g. 2024"
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Rating</label>
                   <input 
                    type="text" 
                    value={rating}
                    onChange={e => setRating(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-white outline-none focus:border-primary/50 transition-all"
                    placeholder="e.g. 8.5"
                   />
                </div>
             </div>

             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Content Description</label>
                <textarea 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-3xl py-4 px-5 text-sm font-medium text-white outline-none focus:border-primary/50 transition-all resize-none leading-relaxed"
                  placeholder="Tell the user about this upload..."
                />
             </div>
          </div>

          <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-4">
             <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Upload className="w-4 h-4 text-primary" />
             </div>
             <div className="space-y-1">
                <p className="text-[11px] text-white font-black uppercase tracking-wider">Cloud Processing Protocol</p>
                <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                  Media will be mirrored to Cloudflare R2 and indexed in the global catalog. 
                  The requester will receive an automated "Content Ready" notification.
                </p>
             </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-8 border-t border-white/10 bg-black/40 relative z-20">
          <button
            onClick={handleFulfill}
            disabled={isFulfilling}
            className="w-full h-16 gradient-bg text-white rounded-2xl font-black uppercase tracking-[0.25em] text-xs shadow-2xl shadow-primary/20 flex items-center justify-center gap-4 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {isFulfilling ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Deducting Cores & Uploading...
              </>
            ) : (
              <>
                <Check className="w-6 h-6" />
                Finalize Delivery
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
