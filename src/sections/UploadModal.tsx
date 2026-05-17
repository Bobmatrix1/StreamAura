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
  const [isFulfilling, setIsFulfilling] = useState(false);
  const { showSuccess, showError } = useToast();

  const movieInputRef = React.useRef<HTMLInputElement>(null);
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  const handleFulfill = async () => {
    if (!movieFile || !coverFile) {
      showError('Please upload both the movie file and a cover image');
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
        description: preOrder.mediaType === 'series' 
          ? `Season ${preOrder.season}, Episode ${preOrder.episode} now available.` 
          : 'Pre-ordered content now available.',
        year: new Date().getFullYear().toString(),
        rating: '8.5',
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
    <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full max-w-lg p-8 space-y-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-600" />
        
        <div className="flex justify-between items-start">
          <div className="space-y-1">
             <h3 className="text-xl font-black uppercase tracking-tight text-white">Deliver Media</h3>
             <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{preOrder.title}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {/* Movie File Picker */}
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Movie File</label>
              <div 
                onClick={() => movieInputRef.current?.click()}
                className={`aspect-video rounded-2xl border-2 border-dashed ${movieFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all group`}
              >
                 {movieFile ? (
                   <>
                     <Check className="w-8 h-8 text-emerald-500 mb-2" />
                     <span className="text-[10px] font-bold text-emerald-400 uppercase truncate px-4">{movieFile.name}</span>
                   </>
                 ) : (
                   <>
                     <Video className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                     <span className="text-[10px] font-black text-muted-foreground uppercase">Upload Video</span>
                   </>
                 )}
                 <input type="file" ref={movieInputRef} className="hidden" accept="video/*" onChange={e => setMovieFile(e.target.files?.[0] || null)} />
              </div>
           </div>

           {/* Poster Image Picker */}
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Cinema Poster</label>
              <div 
                onClick={() => coverInputRef.current?.click()}
                className={`aspect-video rounded-2xl border-2 border-dashed ${coverFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all group overflow-hidden relative`}
              >
                 {coverFile ? (
                   <div className="absolute inset-0">
                      <img src={URL.createObjectURL(coverFile)} className="w-full h-full object-cover p-2" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <ImageIcon className="w-6 h-6 text-white" />
                      </div>
                   </div>
                 ) : (
                   <>
                     <ImageIcon className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                     <span className="text-[10px] font-black text-muted-foreground uppercase">Upload Poster</span>
                   </>
                 )}
                 <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={e => setCoverFile(e.target.files?.[0] || null)} />
              </div>
           </div>
        </div>

        <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3">
           <Upload className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
           <p className="text-[10px] text-muted-foreground font-medium leading-relaxed uppercase tracking-wider">
             Media will be uploaded to Cloudflare R2 and added to the global library. User will receive an instant notification with access.
           </p>
        </div>

        <button
          onClick={handleFulfill}
          disabled={isFulfilling}
          className="w-full py-4 gradient-bg text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {isFulfilling ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Uploading to R2...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Complete Delivery
            </>
          )}
        </button>
      </motion.div>
    </div>,
    document.body
  );
};
