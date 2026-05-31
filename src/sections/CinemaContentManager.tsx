import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Film, 
  Calendar, 
  Loader2, 
  Check, 
  Image as ImageIcon,
  Video,
  LayoutDashboard
} from 'lucide-react';
import { db, uploadFile } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  onSnapshot 
} from 'firebase/firestore';
import { Button } from '../components/ui/button';
import { useToast } from '../contexts/ToastContext';

interface CarouselItem {
  id: string;
  image: string;
  title: string;
  tagline: string;
}

interface TrailerItem {
  id: string;
  title: string;
  thumbnail: string;
  videoUrl: string;
  duration: string;
}

interface UpcomingItem {
  id: string;
  title: string;
  poster: string;
  trailerUrl?: string;
  description: string;
  releaseDate: string;
}

export const CinemaContentManager: React.FC = () => {
  const { showSuccess, showError } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'carousel' | 'trailers' | 'upcoming'>('carousel');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Data State
  const [carouselItems, setCarouselItems] = useState<CarouselItem[]>([]);
  const [trailers, setTrailers] = useState<TrailerItem[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);

  // Form State
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [file1, setFile1] = useState<File | null>(null); // Main Image/Poster
  const [file2, setFile2] = useState<File | null>(null); // Video/Trailer

  const file1Ref = useRef<HTMLInputElement>(null);
  const file2Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubCarousel = onSnapshot(query(collection(db, 'cinema_carousel')), (snap) => {
      setCarouselItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as CarouselItem)));
    });
    const unsubTrailers = onSnapshot(query(collection(db, 'cinema_trailers')), (snap) => {
      setTrailers(snap.docs.map(d => ({ id: d.id, ...d.data() } as TrailerItem)));
    });
    const unsubUpcoming = onSnapshot(query(collection(db, 'cinema_upcoming')), (snap) => {
      setUpcoming(snap.docs.map(d => ({ id: d.id, ...d.data() } as UpcomingItem)));
    });

    return () => {
      unsubCarousel();
      unsubTrailers();
      unsubUpcoming();
    };
  }, []);

  const resetForm = () => {
    setTitle('');
    setTagline('');
    setDescription('');
    setDuration('');
    setReleaseDate('');
    setFile1(null);
    setFile2(null);
    setUploadProgress(0);
  };

  const handleDelete = async (coll: string, id: string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    try {
      await deleteDoc(doc(db, coll, id));
      showSuccess('Item deleted successfully');
    } catch (err) {
      showError('Failed to delete item');
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return showError('Title is required');
    if (!file1) return showError('Main image is required');

    setIsSubmitting(true);
    try {
      // 1. Upload Main Image
      const imageFolder = activeSubTab === 'carousel' ? 'cinema/carousel' : activeSubTab === 'trailers' ? 'cinema/trailers/thumbs' : 'cinema/upcoming/posters';
      const imageUrl = await uploadFile(file1, imageFolder, 'assets', (p) => setUploadProgress(p));

      let finalData: any = { title };

      if (activeSubTab === 'carousel') {
        finalData = { ...finalData, image: imageUrl, tagline, createdAt: Date.now() };
        await addDoc(collection(db, 'cinema_carousel'), finalData);
      } 
      else if (activeSubTab === 'trailers') {
        if (!file2) throw new Error('Video file is required for trailers');
        const videoUrl = await uploadFile(file2, 'cinema/trailers/videos', 'movies', (p) => setUploadProgress(p));
        finalData = { ...finalData, thumbnail: imageUrl, videoUrl, duration, createdAt: Date.now() };
        await addDoc(collection(db, 'cinema_trailers'), finalData);
      }
      else if (activeSubTab === 'upcoming') {
        let trailerUrl = '';
        if (file2) {
          trailerUrl = await uploadFile(file2, 'cinema/upcoming/trailers', 'movies', (p) => setUploadProgress(p));
        }
        finalData = { ...finalData, poster: imageUrl, trailerUrl, description, releaseDate, createdAt: Date.now() };
        await addDoc(collection(db, 'cinema_upcoming'), finalData);
      }

      showSuccess('Content added successfully!');
      resetForm();
    } catch (err: any) {
      showError(err.message || 'Upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Sub-Tabs */}
      <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl w-fit">
        <button 
          onClick={() => { setActiveSubTab('carousel'); resetForm(); }}
          className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'carousel' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}
        >
          Curtain Carousel
        </button>
        <button 
          onClick={() => { setActiveSubTab('trailers'); resetForm(); }}
          className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'trailers' ? 'bg-blue-600 text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}
        >
          Trailer Section
        </button>
        <button 
          onClick={() => { setActiveSubTab('upcoming'); resetForm(); }}
          className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'upcoming' ? 'bg-emerald-600 text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}
        >
          Coming Soon
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form Section */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className={`p-2 rounded-lg ${activeSubTab === 'carousel' ? 'bg-primary/20 text-primary' : activeSubTab === 'trailers' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              {activeSubTab === 'carousel' ? <LayoutDashboard className="w-5 h-5" /> : activeSubTab === 'trailers' ? <Video className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">
                Add {activeSubTab === 'carousel' ? 'Carousel Slide' : activeSubTab === 'trailers' ? 'Official Trailer' : 'Upcoming Movie'}
              </h3>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Enter content details below</p>
            </div>
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Title</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  placeholder="e.g. Inception 4K"
                  className="w-full glass-input p-3 rounded-xl text-sm outline-none focus:border-primary/50"
                  required
                />
              </div>

              {activeSubTab === 'carousel' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Tagline</label>
                  <input 
                    type="text" 
                    value={tagline} 
                    onChange={e => setTagline(e.target.value)} 
                    placeholder="e.g. Experience it in IMAX"
                    className="w-full glass-input p-3 rounded-xl text-sm outline-none focus:border-primary/50"
                  />
                </div>
              )}

              {activeSubTab === 'upcoming' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Description</label>
                  <textarea 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    placeholder="Brief movie synopsis..."
                    className="w-full glass-input p-3 rounded-xl text-sm outline-none focus:border-primary/50 h-24 resize-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {activeSubTab === 'trailers' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Duration</label>
                    <input 
                      type="text" 
                      value={duration} 
                      onChange={e => setDuration(e.target.value)} 
                      placeholder="e.g. 2:30"
                      className="w-full glass-input p-3 rounded-xl text-sm outline-none focus:border-primary/50"
                    />
                  </div>
                )}
                {activeSubTab === 'upcoming' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Release Date</label>
                    <input 
                      type="text" 
                      value={releaseDate} 
                      onChange={e => setReleaseDate(e.target.value)} 
                      placeholder="e.g. Dec 20, 2026"
                      className="w-full glass-input p-3 rounded-xl text-sm outline-none focus:border-primary/50"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* File Uploads */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                  {activeSubTab === 'carousel' ? 'Carousel Image' : activeSubTab === 'trailers' ? 'Thumbnail' : 'Poster'}
                </label>
                <div 
                  onClick={() => file1Ref.current?.click()}
                  className={`aspect-video rounded-xl border-2 border-dashed ${file1 ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all group overflow-hidden relative`}
                >
                  {file1 ? (
                    <img src={URL.createObjectURL(file1)} className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <ImageIcon className="w-6 h-6 text-muted-foreground group-hover:text-primary mb-1" />
                      <span className="text-[10px] font-bold text-muted-foreground group-hover:text-primary uppercase tracking-tighter">Select Image</span>
                    </>
                  )}
                  <input type="file" ref={file1Ref} onChange={e => setFile1(e.target.files?.[0] || null)} className="hidden" accept="image/*" />
                </div>
              </div>

              {(activeSubTab === 'trailers' || activeSubTab === 'upcoming') && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                    {activeSubTab === 'trailers' ? 'Trailer Video' : 'Trailer Video (Optional)'}
                  </label>
                  <div 
                    onClick={() => file2Ref.current?.click()}
                    className={`aspect-video rounded-xl border-2 border-dashed ${file2 ? 'border-blue-500 bg-blue-500/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/50 transition-all group overflow-hidden relative`}
                  >
                    {file2 ? (
                      <div className="flex flex-col items-center gap-1 text-blue-400">
                        <Check className="w-6 h-6" />
                        <span className="text-[8px] font-black uppercase text-center px-2 truncate w-full">{file2.name}</span>
                      </div>
                    ) : (
                      <>
                        <Video className="w-6 h-6 text-muted-foreground group-hover:text-blue-400 mb-1" />
                        <span className="text-[10px] font-bold text-muted-foreground group-hover:text-blue-400 uppercase tracking-tighter">Select Video</span>
                      </>
                    )}
                    <input type="file" ref={file2Ref} onChange={e => setFile2(e.target.files?.[0] || null)} className="hidden" accept="video/*" />
                  </div>
                </div>
              )}
            </div>

            <Button 
              type="submit" 
              disabled={isSubmitting} 
              className={`w-full h-12 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg transition-all active:scale-95 ${activeSubTab === 'carousel' ? 'gradient-bg shadow-primary/20' : activeSubTab === 'trailers' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'}`}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uploadProgress > 0 ? `UPLOADING ${uploadProgress}%` : 'PROCESSING...'}</span>
                </div>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" /> 
                  Add to {activeSubTab === 'carousel' ? 'Carousel' : activeSubTab === 'trailers' ? 'Trailers' : 'Upcoming'}
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Preview / List Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Current Items</h4>
            <span className="text-[10px] font-black text-white/20">
              {activeSubTab === 'carousel' ? carouselItems.length : activeSubTab === 'trailers' ? trailers.length : upcoming.length} TOTAL
            </span>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {activeSubTab === 'carousel' && carouselItems.map(item => (
              <div key={item.id} className="glass-card p-3 flex gap-4 items-center group">
                <div className="w-24 aspect-video rounded-lg overflow-hidden border border-white/10 shrink-0">
                  <img src={item.image} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-black text-sm text-white truncate">{item.title}</h5>
                  <p className="text-[10px] text-muted-foreground truncate uppercase font-bold">{item.tagline || 'No tagline'}</p>
                </div>
                <button 
                  onClick={() => handleDelete('cinema_carousel', item.id)}
                  className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {activeSubTab === 'trailers' && trailers.map(item => (
              <div key={item.id} className="glass-card p-3 flex gap-4 items-center group">
                <div className="w-24 aspect-video rounded-lg overflow-hidden border border-white/10 shrink-0 relative">
                  <img src={item.thumbnail} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Video className="w-4 h-4 text-white/60" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-black text-sm text-white truncate">{item.title}</h5>
                  <p className="text-[10px] text-blue-400 uppercase font-black">{item.duration}</p>
                </div>
                <button 
                  onClick={() => handleDelete('cinema_trailers', item.id)}
                  className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {activeSubTab === 'upcoming' && upcoming.map(item => (
              <div key={item.id} className="glass-card p-3 flex gap-4 items-center group">
                <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden border border-white/10 shrink-0">
                  <img src={item.poster} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-black text-sm text-white truncate">{item.title}</h5>
                  <p className="text-[10px] text-emerald-400 uppercase font-black tracking-widest">{item.releaseDate}</p>
                  <p className="text-[9px] text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>
                </div>
                <button 
                  onClick={() => handleDelete('cinema_upcoming', item.id)}
                  className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {((activeSubTab === 'carousel' && carouselItems.length === 0) || 
              (activeSubTab === 'trailers' && trailers.length === 0) || 
              (activeSubTab === 'upcoming' && upcoming.length === 0)) && (
              <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl opacity-30">
                <Film className="w-10 h-10 mx-auto mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">No items found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
