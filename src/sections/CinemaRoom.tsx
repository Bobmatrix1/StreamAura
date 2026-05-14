import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Plus, 
  Users, 
  Ticket, 
  Calendar,
  Tv,
  Film,
  Camera,
  Upload,
  X,
  Info,
  Clock,
  ShieldAlert,
  Video,
  ShoppingBag,
  ChevronDown
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { CinemaStoreModal } from './CinemaStoreModal';

interface Room {
  id: string;
  title: string;
  movie: string;
  poster: string;
  host: string;
  viewers: number;
  status: 'live' | 'upcoming';
  startTime: string;
  capacity: number | 'unlimited';
  type: 'free' | 'paid' | 'private';
}

interface Trailer {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
}

interface CinemaSlide {
  id: string;
  image: string;
  title: string;
  tagline: string;
}

/**
 * CinemaRoom Section
 * Enhanced Immersive cinema experience and advanced room creation.
 */
const CinemaRoom: React.FC = () => {
  const { requireAuth } = useAuth();
  const { showSuccess, showInfo } = useToast();
  const [activeTab, setActiveTab] = useState<'rooms' | 'trailers' | 'schedule'>('rooms');
  const [curtainsOpen, setCurtainsOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const timeInputRef = React.useRef<HTMLInputElement>(null);

  // Auto-open curtains on load
  useEffect(() => {
    const timer = setTimeout(() => setCurtainsOpen(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleBuySnacks = () => {
    requireAuth(() => {
      setIsStoreOpen(true);
    });
  };

  const handleJoinRoom = (room: Room) => {
    requireAuth(() => {
      // Mock join logic
      showSuccess(`Joining ${room.title}...`);
    });
  };

  const handleMyTickets = () => {
    requireAuth(() => {
       showInfo('No active tickets found.');
    });
  };

  const handleOpenCreateModal = () => {
    requireAuth(() => {
      setIsCreateModalOpen(true);
    });
  };

  // Scroll Lock Effect
  useEffect(() => {
    if (isCreateModalOpen || isStoreOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isCreateModalOpen, isStoreOpen]);

  // Admin Poster Slides (Carousel) - Expanded for verification
  const [slides] = useState<CinemaSlide[]>([
    { id: 's1', image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2050&auto=format&fit=crop', title: 'IMAX BLOCKBUSTERS', tagline: 'Experience it in 4K Quality' },
    { id: 's2', image: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=2070&auto=format&fit=crop', title: 'MIDNIGHT PREMIERES', tagline: 'Only on StreamAura' },
    { id: 's3', image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=2094&auto=format&fit=crop', title: 'EXCLUSIVE SCREENINGS', tagline: 'Join the Grand Theater' },
    { id: 's4', image: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2059&auto=format&fit=crop', title: 'ACTION ARENA', tagline: 'Heart-Pumping Thrills' },
    { id: 's5', image: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?q=80&w=2070&auto=format&fit=crop', title: 'CLASSIC CINEMA', tagline: 'Timeless Masterpieces' }
  ]);

  // Automated Curtain Loop & Poster Slide Logic
  useEffect(() => {
    let loopTimeout: any;
    
    if (!curtainsOpen) {
      // Step 1: Wait 5 seconds closed, then open
      loopTimeout = setTimeout(() => {
        setCurtainsOpen(true);
        setCurrentSlide(0);
      }, 5000);
    } else {
      // Step 2: If open, slide through posters
      const slideInterval = setInterval(() => {
        setCurrentSlide(prev => {
          if (prev < slides.length - 1) {
            return prev + 1;
          } else {
            // Step 3: All slides shown, wait 5s then close
            clearInterval(slideInterval);
            loopTimeout = setTimeout(() => {
              setCurtainsOpen(false);
            }, 5000);
            return prev;
          }
        });
      }, 5000); // 5s per poster
      
      return () => {
        clearInterval(slideInterval);
        clearTimeout(loopTimeout);
      };
    }

    return () => clearTimeout(loopTimeout);
  }, [curtainsOpen, slides.length]);

  // Form State
  const [roomType, setRoomType] = useState<'free' | 'paid' | 'private'>('free');
  const [isLiveNow, setIsLiveNow] = useState(true);
  const [isUnlimited, setIsUnlimited] = useState(true);
  const [privateSeats, setPrivateSeats] = useState(1);
  const [privateGuests, setPrivateGuests] = useState<string[]>(['']);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return 'Set Date';
    const [year, month, day] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDisplayTime = (timeStr: string) => {
    if (!timeStr) return 'Set Time';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12.toString().padStart(2, '0')}:${minutes} ${ampm}`;
  };

  // Mock data for cinema rooms
  const rooms: Room[] = [
    {
      id: '1',
      title: 'IMAX Experience',
      movie: 'Interstellar',
      poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=2094&auto=format&fit=crop',
      host: 'Bobbizy',
      viewers: 124,
      status: 'live',
      startTime: '8:00 PM',
      capacity: 'unlimited',
      type: 'paid'
    },
    {
      id: '2',
      title: 'Midnight Classics',
      movie: 'The Matrix',
      poster: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=2070&auto=format&fit=crop',
      host: 'Neo',
      viewers: 86,
      status: 'live',
      startTime: '10:00 PM',
      capacity: 100,
      type: 'free'
    },
    {
      id: '3',
      title: 'Action Arena',
      movie: 'John Wick 4',
      poster: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=2070&auto=format&fit=crop',
      host: 'Baba Yaga',
      viewers: 0,
      status: 'upcoming',
      startTime: 'Tomorrow, 6:00 PM',
      capacity: 50,
      type: 'paid'
    }
  ];

  const trailers: Trailer[] = [
    {
      id: '1',
      title: 'The Dark Knight',
      thumbnail: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=2070&auto=format&fit=crop',
      duration: '2:30'
    },
    {
      id: '2',
      title: 'Inception',
      thumbnail: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=2070&auto=format&fit=crop',
      duration: '2:15'
    }
  ];

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomType === 'private') {
      const cost = privateSeats * 1000;
      showSuccess(`Private Room Created! ₦${cost.toLocaleString()} deducted from wallet.`);
    } else {
      showSuccess('Room created successfully! Link copied to clipboard.');
    }
    setIsCreateModalOpen(false);
  };

  const handlePrivateGuestChange = (index: number, value: string) => {
    const newGuests = [...privateGuests];
    newGuests[index] = value;
    setPrivateGuests(newGuests);
  };

  const updatePrivateSeats = (val: number) => {
    if (val < 1) return;
    setPrivateSeats(val);
    const newGuests = [...privateGuests];
    if (val > newGuests.length) {
      newGuests.push(...Array(val - newGuests.length).fill(''));
    } else if (val < newGuests.length) {
      newGuests.splice(val);
    }
    setPrivateGuests(newGuests);
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-20 relative overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight gradient-text">Cinema Room</h1>
          <p className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase tracking-widest opacity-70">Experience movies together in virtual luxury.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <Button variant="outline" onClick={handleBuySnacks} className="flex-1 md:flex-none h-10 gap-2 border-white/10 text-emerald-400 hover:text-emerald-300 rounded-xl text-[10px] font-black uppercase tracking-wider">
            <ShoppingBag className="w-3.5 h-3.5" />
            Buy Snacks
          </Button>
          <Button variant="outline" onClick={handleMyTickets} className="flex-1 md:flex-none h-10 gap-2 border-white/10 rounded-xl text-[10px] font-black uppercase tracking-wider">
            <Ticket className="w-3.5 h-3.5" />
            My Tickets
          </Button>
          <Button onClick={handleOpenCreateModal} className="w-full md:w-auto h-10 gap-2 gradient-bg rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-primary/20">
            <Plus className="w-3.5 h-3.5" />
            Create Room
          </Button>
        </div>
      </div>

      {/* Main Cinema Screen Area */}
      <div className="relative aspect-video rounded-[1.5rem] md:rounded-[2rem] overflow-hidden bg-black border border-white/10 shadow-2xl">
        {/* ... slides and curtains remain same but ensure responsive rounding ... */}
        
        {/* Cinema Background (Poster Carousel - behind curtains) */}
        <div className="absolute inset-0 z-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              className="absolute inset-0"
            >
              <img 
                src={slides[currentSlide].image} 
                className="w-full h-full object-cover" 
                alt="Cinema Background" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Big Bright Cinema Lights (Top Corners) */}
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/20 blur-[60px] rounded-full z-40 pointer-events-none" />
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 blur-[60px] rounded-full z-40 pointer-events-none" />
        <div className="absolute top-4 left-4 w-6 h-6 rounded-full bg-white shadow-[0_0_30px_white,0_0_60px_white,0_0_100px_white] z-50 pointer-events-none border border-white/50" />
        <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-white shadow-[0_0_30px_white,0_0_60px_white,0_0_100px_white] z-50 pointer-events-none border border-white/50" />

        {/* Curtains Layer with "Shut" entry and exit animations */}
        <AnimatePresence>
          {!curtainsOpen && (
            <React.Fragment key="curtains-fragment">
              <motion.div 
                key="left-curtain"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ duration: 1.5, ease: [0.45, 0, 0.55, 1] }}
                className="absolute inset-y-0 left-0 w-1/2 z-20 bg-rose-950 border-r border-rose-900 shadow-[30px_0_60px_rgba(0,0,0,0.8)]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.4) 41px, rgba(0,0,0,0.4) 80px)',
                  backgroundSize: '80px 100%'
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/60" />
              </motion.div>
              <motion.div 
                key="right-curtain"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 1.5, ease: [0.45, 0, 0.55, 1] }}
                className="absolute inset-y-0 right-0 w-1/2 z-20 bg-rose-950 border-l border-rose-900 shadow-[-30px_0_60px_rgba(0,0,0,0.8)]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.4) 41px, rgba(0,0,0,0.4) 80px)',
                  backgroundSize: '80px 100%'
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/60" />
              </motion.div>
            </React.Fragment>
          )}
        </AnimatePresence>

        {/* Intro Text Overlay (Only visible when curtains are closed) */}
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-8 text-center pointer-events-none">
          <AnimatePresence mode="wait">
            {!curtainsOpen && (
              <motion.div 
                key="theater-intro"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ 
                  delay: 1.2, // Wait for curtains to mostly close
                  duration: 0.8,
                  ease: "easeOut"
                }}
                className="space-y-6"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-rose-500 blur-[40px] opacity-20" />
                  <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center mx-auto border border-white/20 shadow-[0_0_40px_rgba(225,29,72,0.2)]">
                    <Film className="w-10 h-10 text-rose-500 drop-shadow-[0_0_8px_rgba(225,29,72,0.6)]" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 drop-shadow-2xl uppercase">
                    The Grand Theater
                  </h2>
                  <div className="flex items-center justify-center gap-3">
                    <div className="h-[1px] w-8 bg-rose-500/50" />
                    <p className="text-rose-400 uppercase tracking-[0.3em] text-[10px] font-bold">Premium Cinematic Experience</p>
                    <div className="h-[1px] w-8 bg-rose-500/50" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Enhanced Tab Navigation */}
      <div className="flex justify-start lg:justify-start overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 scroll-smooth active:cursor-grabbing">
        <div className="p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-1 min-w-max">
          {[
            { id: 'rooms', label: 'Active Rooms', icon: Tv, color: 'text-rose-500', bg: 'bg-rose-600' },
            { id: 'trailers', label: 'Trailers', icon: Camera, color: 'text-blue-500', bg: 'bg-blue-600' },
            { id: 'schedule', label: 'Coming Soon', icon: Calendar, color: 'text-emerald-500', bg: 'bg-emerald-600' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'rooms' | 'trailers' | 'schedule')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all relative overflow-hidden group ${
                activeTab === tab.id 
                  ? 'text-white' 
                  : 'text-muted-foreground hover:text-white'
              }`}
            >
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTabPill"
                  className={`absolute inset-0 ${tab.bg} shadow-lg`}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                />
              )}
              <tab.icon className={`w-3.5 h-3.5 relative z-10 ${activeTab === tab.id ? 'text-white' : tab.color}`} />
              <span className="relative z-10 whitespace-nowrap">{tab.label}</span>
              {tab.id === 'rooms' && (
                 <span className={`relative z-10 flex h-1.5 w-1.5 ${activeTab === tab.id ? 'opacity-100' : 'opacity-50'}`}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                 </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeTab === 'rooms' && rooms.map(room => (
          <motion.div
            key={room.id}
            whileHover={{ y: -5 }}
            className="group relative"
          >
            <Card className="overflow-hidden glass-card border-white/5 h-full flex flex-col">
              <div className="relative aspect-[16/9] overflow-hidden">
                <img 
                  src={room.poster} 
                  alt={room.movie} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                
                <div className="absolute top-3 left-3 flex gap-2">
                  {room.status === 'live' ? (
                    <Badge className="bg-rose-500 hover:bg-rose-500 border-none gap-1.5 shadow-lg shadow-rose-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      LIVE
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-black/60 backdrop-blur-md border-white/20">
                      UPCOMING
                    </Badge>
                  )}
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center border border-white/20 shadow-lg">
                      <span className="text-[10px] font-black tracking-widest">{room.host[0]}</span>
                    </div>
                    <span className="text-xs font-bold text-white/90 drop-shadow-md">by {room.host}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/90 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
                    <Users className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold">{room.viewers} watching</span>
                  </div>
                </div>
              </div>
              
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-black text-lg leading-tight line-clamp-1">{room.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4 flex items-center gap-1.5 font-medium">
                  <Film className="w-3.5 h-3.5 text-primary" />
                  Showing: <span className="text-foreground font-bold">{room.movie}</span>
                </p>
                
                <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">Start Time</span>
                    <span className="text-xs font-bold flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> {room.startTime}</span>
                  </div>
                  {/* Join Room discovers if Paid/Free implicitly */}
                  <Button onClick={() => handleJoinRoom(room)} size="sm" className="rounded-xl px-6 font-bold shadow-lg transition-transform hover:scale-105 gradient-bg">
                    Join Room
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}

        {activeTab === 'trailers' && trailers.map(trailer => (
          <motion.div
            key={trailer.id}
            whileHover={{ y: -5 }}
            className="group relative"
          >
            <Card className="overflow-hidden glass-card border-white/5">
              <div className="relative aspect-video overflow-hidden">
                <img 
                  src={trailer.thumbnail} 
                  alt={trailer.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 hover:bg-white/30 transition-colors">
                    <Play className="w-6 h-6 text-white fill-current" />
                  </div>
                </div>
                <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-black tracking-widest">
                  {trailer.duration}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-base truncate">{trailer.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Official Trailer • 2.4M views</p>
              </div>
            </Card>
          </motion.div>
        ))}

        {activeTab === 'schedule' && (
          <div className="col-span-full py-20 text-center">
            <div className="w-24 h-24 rounded-3xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Calendar className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-black">No screenings scheduled yet</h3>
            <p className="text-muted-foreground mt-2 font-medium max-w-sm mx-auto">Check back later for the next movie premiere or create your own room.</p>
            <Button variant="outline" className="mt-6 rounded-xl font-bold border-white/10">
              Notify Me
            </Button>
          </div>
        )}
      </div>

      {/* Decorative Floor Reflection */}
      <div className="fixed bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-blue-900/5 to-transparent pointer-events-none -z-10" />

      {/* Create Room Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <React.Fragment key="modal-fragment">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
              animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
              exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
              className="fixed left-1/2 top-1/2 w-full max-w-2xl max-h-[90vh] overflow-y-auto z-[101] p-4"
            >
              <Card className="glass-card border-white/10 shadow-2xl overflow-hidden relative">
                <div className="sticky top-0 bg-background/80 backdrop-blur-xl border-b border-white/10 p-6 flex items-center justify-between z-20">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight">Create Cinema Room</h2>
                    <p className="text-xs text-muted-foreground font-medium mt-1">Host a movie experience for friends or the public.</p>
                  </div>
                  <button onClick={() => setIsCreateModalOpen(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <X className="w-5 h-5 text-muted-foreground hover:text-white" />
                  </button>
                </div>

                <div className="px-6 py-2 flex justify-end">
                   <Button type="button" variant="outline" onClick={handleBuySnacks} className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-8 text-[10px] font-black uppercase">
                      <ShoppingBag className="w-3 h-3" />
                      Buy Snacks for Room
                   </Button>
                </div>

                <form onSubmit={handleCreateRoom} className="p-6 space-y-8">
                  {/* Media Uploads */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Movie Art Cover</label>
                      <div className="aspect-[3/4] rounded-2xl border-2 border-dashed border-white/10 bg-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group">
                        <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                        <span className="text-xs font-bold text-muted-foreground group-hover:text-primary">Upload Poster</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Movie File</label>
                        <div className="h-24 rounded-2xl border-2 border-dashed border-white/10 bg-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group">
                           <Film className="w-5 h-5 text-muted-foreground group-hover:text-primary mb-1" />
                           <span className="text-xs font-bold text-muted-foreground">Upload Video</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Trailer Video</label>
                        <div className="h-24 rounded-2xl border-2 border-dashed border-white/10 bg-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group">
                           <Camera className="w-5 h-5 text-muted-foreground group-hover:text-primary mb-1" />
                           <span className="text-xs font-bold text-muted-foreground">Upload Trailer</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Room Details */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Room Name</label>
                      <input type="text" required placeholder="e.g. Midnight Watch Party" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-primary/50" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Movie Title</label>
                        <input type="text" required placeholder="Movie Name" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm outline-none focus:border-primary/50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Genre</label>
                        <div className="relative">
                          <select className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-3 px-4 text-[13px] outline-none focus:border-primary/50 appearance-none text-white font-medium">
                            <option value="">Select Genre</option>
                            <option value="Action">Action</option>
                            <option value="Adventure">Adventure</option>
                            <option value="Alternate History">Alternate History</option>
                            <option value="Animation">Animation</option>
                            <option value="Anime">Anime</option>
                            <option value="Anthology">Anthology</option>
                            <option value="Apocalyptic">Apocalyptic</option>
                            <option value="Art House">Art House</option>
                            <option value="Biography">Biography (Biopic)</option>
                            <option value="Black Comedy">Black Comedy</option>
                            <option value="Blaxploitation">Blaxploitation</option>
                            <option value="Buddy Cop">Buddy Cop</option>
                            <option value="Buddy Film">Buddy Film</option>
                            <option value="Caper">Caper</option>
                            <option value="Cartoon">Cartoon</option>
                            <option value="Children's">Children’s</option>
                            <option value="Chick Flick">Chick Flick</option>
                            <option value="Christmas">Christmas</option>
                            <option value="Classic">Classic</option>
                            <option value="Comedy">Comedy</option>
                            <option value="Coming-of-Age">Coming-of-Age</option>
                            <option value="Concert Film">Concert Film</option>
                            <option value="Crime">Crime</option>
                            <option value="Cult">Cult</option>
                            <option value="Cyberpunk">Cyberpunk</option>
                            <option value="Dance">Dance</option>
                            <option value="Dark Comedy">Dark Comedy</option>
                            <option value="Disaster">Disaster</option>
                            <option value="Documentary">Documentary</option>
                            <option value="Docudrama">Docudrama</option>
                            <option value="Drama">Drama</option>
                            <option value="Dystopian">Dystopian</option>
                            <option value="Educational">Educational</option>
                            <option value="Epic">Epic</option>
                            <option value="Erotic">Erotic</option>
                            <option value="Experimental">Experimental</option>
                            <option value="Fairy Tale">Fairy Tale</option>
                            <option value="Family">Family</option>
                            <option value="Fantasy">Fantasy</option>
                            <option value="Film Noir">Film Noir</option>
                            <option value="Found Footage">Found Footage</option>
                            <option value="Gangster">Gangster</option>
                            <option value="Ghost">Ghost</option>
                            <option value="Gore">Gore</option>
                            <option value="Gothic">Gothic</option>
                            <option value="Grindhouse">Grindhouse</option>
                            <option value="Heist">Heist</option>
                            <option value="Historical">Historical</option>
                            <option value="Historical Fiction">Historical Fiction</option>
                            <option value="Holiday">Holiday</option>
                            <option value="Horror">Horror</option>
                            <option value="Independent">Independent (Indie)</option>
                            <option value="Inspirational">Inspirational</option>
                            <option value="Interactive">Interactive</option>
                            <option value="Legal Drama">Legal Drama</option>
                            <option value="Live Action">Live Action</option>
                            <option value="Martial Arts">Martial Arts</option>
                            <option value="Medical Drama">Medical Drama</option>
                            <option value="Melodrama">Melodrama</option>
                            <option value="Military">Military</option>
                            <option value="Mockumentary">Mockumentary</option>
                            <option value="Monster">Monster</option>
                            <option value="Music">Music</option>
                            <option value="Musical">Musical</option>
                            <option value="Mystery">Mystery</option>
                            <option value="Mythological">Mythological</option>
                            <option value="Neo-Noir">Neo-Noir</option>
                            <option value="Occult">Occult</option>
                            <option value="Parody">Parody</option>
                            <option value="Period Drama">Period Drama</option>
                            <option value="Political Thriller">Political Thriller</option>
                            <option value="Post-Apocalyptic">Post-Apocalyptic</option>
                            <option value="Psychological Thriller">Psychological Thriller</option>
                            <option value="Psychological Horror">Psychological Horror</option>
                            <option value="Road Movie">Road Movie</option>
                            <option value="Romance">Romance</option>
                            <option value="Romantic Comedy">Romantic Comedy (Rom-Com)</option>
                            <option value="Satire">Satire</option>
                            <option value="Science Fiction">Science Fiction (Sci-Fi)</option>
                            <option value="Screwball Comedy">Screwball Comedy</option>
                            <option value="Short Film">Short Film</option>
                            <option value="Silent Film">Silent Film</option>
                            <option value="Slapstick">Slapstick</option>
                            <option value="Slasher">Slasher</option>
                            <option value="Slice of Life">Slice of Life</option>
                            <option value="Soap Opera">Soap Opera</option>
                            <option value="Space Opera">Space Opera</option>
                            <option value="Sports">Sports</option>
                            <option value="Spy">Spy</option>
                            <option value="Steampunk">Steampunk</option>
                            <option value="Stop Motion">Stop Motion</option>
                            <option value="Superhero">Superhero</option>
                            <option value="Supernatural">Supernatural</option>
                            <option value="Survival">Survival</option>
                            <option value="Suspense">Suspense</option>
                            <option value="Sword and Sorcery">Sword and Sorcery</option>
                            <option value="Teen">Teen</option>
                            <option value="Tech Noir">Tech Noir</option>
                            <option value="Thriller">Thriller</option>
                            <option value="Time Travel">Time Travel</option>
                            <option value="Tragedy">Tragedy</option>
                            <option value="True Crime">True Crime</option>
                            <option value="Vampire">Vampire</option>
                            <option value="War">War</option>
                            <option value="Western">Western</option>
                            <option value="Whodunit">Whodunit</option>
                            <option value="Zombie">Zombie</option>
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</label>
                        <span className="text-[10px] text-muted-foreground">Max 200 words</span>
                      </div>
                      <textarea rows={3} placeholder="What is this room about?" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm outline-none focus:border-primary/50 resize-none" />
                    </div>
                  </div>

                  {/* Scheduling & Capacity */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Schedule</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsLiveNow(true)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all border ${isLiveNow ? 'bg-rose-500/10 border-rose-500/50 text-rose-500' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                          Live Now
                        </button>
                        <button type="button" onClick={() => setIsLiveNow(false)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all border ${!isLiveNow ? 'bg-primary/10 border-primary/50 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                          Later
                        </button>
                      </div>
                      {!isLiveNow && (
                        <div className="flex flex-col gap-3 mt-3">
                          <div 
                            className="relative group cursor-pointer"
                            onClick={() => dateInputRef.current?.showPicker()}
                          >
                             <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10 group-hover:border-primary/50 transition-colors">
                                <Calendar className="w-4 h-4 text-primary" />
                                <span className="text-[11px] font-bold text-white flex-1">{formatDisplayDate(scheduledDate)}</span>
                             </div>
                             <input 
                              ref={dateInputRef}
                              type="date" 
                              value={scheduledDate}
                              onChange={(e) => setScheduledDate(e.target.value)}
                              className="absolute inset-0 opacity-0 pointer-events-none" 
                            />
                          </div>
                          <div 
                            className="relative group cursor-pointer"
                            onClick={() => timeInputRef.current?.showPicker()}
                          >
                             <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10 group-hover:border-primary/50 transition-colors">
                                <Clock className="w-4 h-4 text-primary" />
                                <span className="text-[11px] font-bold text-white flex-1">{formatDisplayTime(scheduledTime)}</span>
                             </div>
                             <input 
                              ref={timeInputRef}
                              type="time" 
                              value={scheduledTime}
                              onChange={(e) => setScheduledTime(e.target.value)}
                              className="absolute inset-0 opacity-0 pointer-events-none" 
                            />
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2 mt-2">
                        <Info className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-[9px] text-muted-foreground leading-tight">Live rooms without users auto-delete after 24h.</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Room Capacity</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsUnlimited(true)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all border ${isUnlimited ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                          Unlimited
                        </button>
                        <button type="button" onClick={() => setIsUnlimited(false)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all border ${!isUnlimited ? 'bg-blue-500/10 border-blue-500/50 text-blue-500' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                          Limited
                        </button>
                      </div>
                      {!isUnlimited && (
                        <div className="mt-2 relative">
                          <input type="number" placeholder="Seats" className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-3 pr-10 text-xs outline-none focus:border-primary/50" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground font-bold">Seats</span>
                        </div>
                      )}
                      <div className="space-y-1 mt-3">
                         <label className="text-[9px] font-bold text-muted-foreground uppercase">Auto-Start</label>
                         <div className="relative">
                            <select className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-2 px-3 text-[11px] outline-none text-white appearance-none focus:border-primary/50">
                              <option value="none">Manual Start</option>
                              <option value="5">When 5 users join</option>
                              <option value="10">When 10 users join</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                         </div>
                      </div>
                    </div>
                  </div>

                  {/* Room Type & Privacy Logic */}
                  <div className="space-y-4 border-t border-white/10 pt-6">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Access Type</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { id: 'free', label: 'Free', icon: Users, desc: 'Open to everyone', color: 'text-blue-500', active: 'bg-blue-500/10 border-blue-500/50 shadow-lg' },
                        { id: 'paid', label: 'Paid', icon: Ticket, desc: 'Sell tickets', color: 'text-orange-500', active: 'bg-orange-500/10 border-orange-500/50 shadow-lg' },
                        { id: 'private', label: 'Private', icon: ShieldAlert, desc: 'Invite only', color: 'text-amber-500', active: 'bg-amber-500/10 border-amber-500/50 shadow-lg' }
                      ].map(type => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setRoomType(type.id as 'free' | 'paid' | 'private')}
                          className={`p-3 rounded-2xl border flex items-center md:flex-col gap-3 transition-all ${
                            roomType === type.id 
                              ? type.active
                              : 'bg-white/5 border-white/10 hover:border-white/30'
                          }`}
                        >
                          <div className={`p-2 rounded-xl ${roomType === type.id ? 'bg-white/10' : 'bg-white/5'}`}>
                            <type.icon className={`w-5 h-5 ${roomType === type.id ? type.color : 'text-muted-foreground'}`} />
                          </div>
                          <div className="text-left md:text-center overflow-hidden">
                            <p className={`text-xs font-black uppercase tracking-wider ${roomType === type.id ? type.color : 'text-foreground'}`}>{type.label}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-1">{type.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Dynamic Logic Based on Room Type */}
                    <AnimatePresence mode="wait">
                      {roomType === 'free' && (
                        <motion.div key="free-logic" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex gap-3 items-center">
                          <Users className="w-5 h-5 text-blue-500 flex-shrink-0" />
                          <p className="text-[11px] text-blue-200 font-medium">This room will be public. <span className="font-bold text-blue-400">Text and reactions</span> are available.</p>
                        </motion.div>
                      )}

                      {roomType === 'paid' && (
                        <motion.div key="paid-logic" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                           <div className="space-y-2">
                             <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ticket Price</label>
                             <div className="relative">
                               <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₦</span>
                               <input type="number" placeholder="0.00" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-9 pr-4 text-sm font-bold outline-none focus:border-primary/50" />
                             </div>
                           </div>
                           <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex gap-3 items-center">
                            <Ticket className="w-5 h-5 text-orange-500 flex-shrink-0" />
                            <p className="text-[11px] text-orange-200 font-medium">Users must buy a ticket. <span className="font-bold text-orange-400">Voice chat</span> enabled.</p>
                          </div>
                        </motion.div>
                      )}

                      {roomType === 'private' && (
                        <motion.div key="private-logic" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                           
                           <div className="p-4 md:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-4">
                              <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                <div>
                                  <h4 className="text-sm font-black text-amber-500 uppercase tracking-tight">Private Screening</h4>
                                  <p className="text-[10px] text-amber-200/70 mt-1 max-w-[250px]">Hidden room. Access via unique link or QR. Premium features included.</p>
                                </div>
                                <div className="md:text-right">
                                  <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Cost</p>
                                  <p className="text-2xl font-black text-white">₦{(privateSeats * 1000).toLocaleString()}</p>
                                </div>
                              </div>

                              <div className="space-y-4 pt-4 border-t border-amber-500/20">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-amber-300">Seats (₦1k/seat)</label>
                                 <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                   <div className="flex items-center gap-4 bg-black/20 p-1.5 rounded-2xl border border-white/5 w-fit">
                                      <button type="button" onClick={() => updatePrivateSeats(privateSeats - 1)} disabled={privateSeats <= 1} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-amber-500 hover:bg-white/10 disabled:opacity-50">-</button>
                                      <span className="text-lg font-black w-6 text-center">{privateSeats}</span>
                                      <button type="button" onClick={() => updatePrivateSeats(privateSeats + 1)} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-amber-500 hover:bg-white/10">+</button>
                                   </div>
                                   
                                   <div className="flex-1 flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                     <div className="p-1.5 rounded-lg bg-amber-500/20">
                                       <Video className="w-3.5 h-3.5 text-amber-500" />
                                     </div>
                                     <span className="text-[9px] font-black uppercase text-amber-500 tracking-tight">Premium Video Calling</span>
                                   </div>
                                 </div>
                                 <p className="text-[9px] text-amber-300 font-bold uppercase tracking-widest">{privateSeats === 2 ? '❤️ Couple Special Active' : ''}</p>
                              </div>
                           </div>

                           <div className="space-y-3">
                             <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                               {privateSeats === 1 ? 'Invite Partner (Aura ID)' : 'Invite Guests (Aura IDs)'}
                             </label>
                             <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                               {privateGuests.map((guest, index) => (
                                 <div key={index} className="relative">
                                   <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                   <input 
                                     type="text" 
                                     placeholder="Paste Aura ID..." 
                                     value={guest}
                                     onChange={(e) => handlePrivateGuestChange(index, e.target.value)}
                                     className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-[11px] outline-none focus:border-amber-500/50" 
                                     required
                                   />
                                 </div>
                               ))}
                             </div>
                           </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  {/* Submit Action */}
                  <div className="pt-4 border-t border-white/10 flex justify-end gap-3 sticky bottom-0 bg-background p-4 -m-6 mt-0 shadow-[0_-20px_40px_rgba(0,0,0,0.8)]">
                     <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
                     <Button type="submit" className="gradient-bg px-8 font-black gap-2">
                       {roomType === 'private' ? `Pay ₦${(privateSeats * 1000).toLocaleString()} & Create` : 'Create Room'} 
                       <Plus className="w-4 h-4" />
                     </Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>

      <CinemaStoreModal isOpen={isStoreOpen} onClose={() => setIsStoreOpen(false)} />
    </div>
  );
};

export default CinemaRoom;