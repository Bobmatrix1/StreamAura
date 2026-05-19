import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  ChevronDown,
  Share2,
  Check,
  Loader2,
  Wallet as WalletIcon
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { CinemaStoreModal } from './CinemaStoreModal';
import { API_BASE_URL } from '../api/mediaApi';
import { auth, db, uploadFile, logUserAction, logPaymentEvent, logInviteEvent } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { initializePaystackPayment, verifyPaymentOnBackend } from '../api/paymentApi';
import { CinemaLiveRoom } from './CinemaLiveRoom';

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
  const { requireAuth, isAdmin } = useAuth();
  const { showSuccess, showInfo, showError } = useToast();

  const [activeTab, setActiveTab] = useState<'rooms' | 'trailers' | 'schedule'>('rooms');
  const [curtainsOpen, setCurtainsOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  
  // Live Room State
  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const timeInputRef = React.useRef<HTMLInputElement>(null);

  // URL Deep Link Logic
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    const verifyRef = params.get('verify');
    const triggerCreate = params.get('create');

    if (roomId) {
      logInviteEvent('accepted', roomId, auth.currentUser?.uid);
      handleJoinRoomById(roomId);
    }

    if (verifyRef && roomId) {
      handleVerifyPayment(roomId, verifyRef);
    }

    if (triggerCreate === 'true') {
      const mTitle = params.get('title') || '';
      const mThumb = params.get('thumbnail') || '';
      const mUrl = params.get('movie_url') || '';
      const mSeason = params.get('season');
      const mEpisode = params.get('episode');

      if (mTitle) setMovieTitle(mSeason ? `${mTitle} (S${mSeason} E${mEpisode})` : mTitle);
      if (mThumb) setPreFilledCoverUrl(mThumb);
      if (mUrl) setPreFilledMovieUrl(mUrl);
      
      setIsCreateModalOpen(true);
      
      // Clean URL params to prevent re-opening on reload
      const url = new URL(window.location.href);
      url.searchParams.delete('create');
      url.searchParams.delete('movie_id');
      url.searchParams.delete('title');
      url.searchParams.delete('thumbnail');
      url.searchParams.delete('movie_url');
      url.searchParams.delete('season');
      url.searchParams.delete('episode');
      window.history.replaceState({}, '', url);
    }
  }, []);

  const handleJoinRoomById = async (roomId: string) => {
    try {
      const roomDoc = await getDoc(doc(db, 'cinema_rooms', roomId));
      if (!roomDoc.exists()) {
        showError('Room not found');
        return;
      }
      const roomData = roomDoc.data();
      
      // If free, join immediately
      if (roomData.room_type === 'free') {
        setActiveRoom(roomData);
        return;
      }

      // If paid/private, check for access pass
      if (auth.currentUser) {
        const passesRef = collection(db, 'room_access_passes');
        const q = query(passesRef, where('room_id', '==', roomId), where('user_uid', '==', auth.currentUser.uid));
        const passDocs = await getDocs(q);
        
        if (!passDocs.empty || roomData.host_uid === auth.currentUser.uid || isAdmin) {
          setActiveRoom(roomData);
        } else {
          // Trigger Payment Flow
          handlePaymentPrompt(roomData);
        }
      } else {
        requireAuth(() => handleJoinRoomById(roomId));
      }
    } catch (err) {
      showError('Failed to join room');
    }
  };

  const handlePaymentPrompt = (room: any) => {
    requireAuth(async () => {
      const email = auth.currentUser?.email;
      if (!email) return;

      initializePaystackPayment(
        email,
        room.ticket_price,
        { room_id: room.id, user_uid: auth.currentUser?.uid },
        async (reference) => {
          handleVerifyPayment(room.id, reference);
        },
        () => {
          showInfo('Payment cancelled');
        }
      );
    });
  };

  const handleVerifyPayment = async (roomId: string, reference: string) => {
    setIsVerifyingPayment(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const result = await verifyPaymentOnBackend(roomId, reference, token);
      if (result.success) {
        showSuccess('Payment verified! Enjoy the movie.');
        // Remove verify param from URL without reloading
        const url = new URL(window.location.href);
        url.searchParams.delete('verify');
        window.history.replaceState({}, '', url);
        
        // Join room
        handleJoinRoomById(roomId);
      } else {
        showError('Payment verification failed');
      }
    } catch (err) {
      showError('Error verifying payment');
    } finally {
      setIsVerifyingPayment(false);
    }
  };

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
  const [contentType, setContentType] = useState<'movie' | 'series'>('movie');
  const [roomType, setRoomType] = useState<'free' | 'paid' | 'private'>('free');
  const [isLiveNow, setIsLiveNow] = useState(true);
  const [isUnlimited, setIsUnlimited] = useState(true);
  const [privateSeats, setPrivateSeats] = useState(1);
  const [privateGuests, setPrivateGuests] = useState(['']);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  
  // New Form Fields
  const [roomName, setRoomName] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [movieGenre, setMovieGenre] = useState('');
  const [movieDescription, setMovieDescription] = useState('');
  const [ticketPrice, setTicketPrice] = useState('');
  const [movieFile, setMovieFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [trailerFile, setTrailerFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Series Specific State
  const [episodes, setEpisodes] = useState<{ number: number; title: string; file: File | null }[]>([
    { number: 1, title: '', file: null }
  ]);
  const [paymentWallet, setPaymentWallet] = useState<'normal' | 'referral'>('normal');
  const [privateWallet, setPrivateWallet] = useState<'normal' | 'referral'>('normal');
  const [userBalances, setUserBalances] = useState({ normal: 0, referral: 0 });
  const [insufficientFunds, setInsufficientFunds] = useState<{ show: boolean; type: 'normal' | 'referral'; required: number } | null>(null);

  // Fetch Balances when modal opens
  useEffect(() => {
    if (isCreateModalOpen && auth.currentUser) {
      fetchUserBalances();
    }
  }, [isCreateModalOpen, auth.currentUser?.uid]);

  const fetchUserBalances = async () => {
    try {
      // 1. Normal Wallet
      const walletRef = doc(db, 'room_wallets', auth.currentUser!.uid);
      const walletDoc = await getDoc(walletRef);
      const normalBal = walletDoc.exists() ? (walletDoc.data().balance || 0) : 0;

      // 2. Referral Balance
      const userRef = doc(db, 'users', auth.currentUser!.uid);
      const userDoc = await getDoc(userRef);
      const referralBal = userDoc.exists() ? (userDoc.data().referralBalance || 0) : 0;

      setUserBalances({ normal: normalBal, referral: referralBal });
    } catch (err) {
      console.error('Error fetching balances:', err);
    }
  };

  const [isAutoStartDropdownOpen, setIsAutoStartDropdownOpen] = useState(false);
  const [autoStartValue, setAutoStartValue] = useState('none');
  const autoStartRef = React.useRef<HTMLDivElement>(null);
  const [showAutoDeleteTooltip, setShowAutoDeleteTooltip] = useState(false);

  const autoStartOptions = [
    { value: 'none', label: 'Manual Start' },
    { value: '5', label: 'When 5 users join' },
    { value: '10', label: 'When 10 users join' },
    { value: '15', label: 'When 15 users join' },
    { value: '20', label: 'When 20 users join' }
  ];

  // Combined Total Calculation
  const calculateTotalCost = () => {
    let normalRequired = 0;
    let referralRequired = 0;
    
    // 1. Episode Cost (if series)
    if (contentType === 'series') {
      const perEp = paymentWallet === 'referral' ? 50 : 100;
      if (paymentWallet === 'referral') referralRequired += (episodes.length * perEp);
      else normalRequired += (episodes.length * perEp);
    }
    
    // 2. Private Room Cost
    if (roomType === 'private') {
      const perSeat = privateWallet === 'referral' ? 2500 : 1000;
      if (privateWallet === 'referral') referralRequired += (privateSeats * perSeat);
      else normalRequired += (privateSeats * perSeat);
    }
    
    return { normal: normalRequired, referral: referralRequired, total: normalRequired + referralRequired };
  };

  // Pre-filled states from Deep Links
  const [preFilledMovieUrl, setPreFilledMovieUrl] = useState<string | null>(null);
  const [preFilledCoverUrl, setPreFilledCoverUrl] = useState<string | null>(null);

  // File Refs
  const movieFileRef = React.useRef<HTMLInputElement>(null);
  const coverFileRef = React.useRef<HTMLInputElement>(null);
  const trailerFileRef = React.useRef<HTMLInputElement>(null);

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

  const handleShareRoom = (room: Room) => {
    const shareUrl = `${API_BASE_URL}/share?title=${encodeURIComponent(`Live Cinema: ${room.title}`)}&desc=${encodeURIComponent(`Watching ${room.movie} with ${room.viewers} others. Join now!`)}&img=${encodeURIComponent(room.poster)}&target=${encodeURIComponent(`/?tab=cinema&room=${room.id}`)}`;
    
    if (navigator.share) {
      navigator.share({
        title: `Join StreamAura Cinema - ${room.title}`,
        text: `🍿 I'm watching ${room.movie} on StreamAura! Come join the room.`,
        url: shareUrl
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareUrl);
      showSuccess('Room link copied for sharing!');
    }
  };

  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const genreRef = React.useRef<HTMLDivElement>(null);

  const genres = [
    "Action", "Adventure", "Alternate History", "Animation", "Anime", "Anthology", "Apocalyptic", "Art House", 
    "Biography", "Black Comedy", "Blaxploitation", "Buddy Cop", "Buddy Film", "Caper", "Cartoon", "Children's", 
    "Chick Flick", "Christmas", "Classic", "Comedy", "Coming-of-Age", "Concert Film", "Crime", "Cult", 
    "Cyberpunk", "Dance", "Dark Comedy", "Disaster", "Documentary", "Docudrama", "Drama", "Dystopian", 
    "Educational", "Epic", "Erotic", "Experimental", "Fairy Tale", "Family", "Fantasy", "Film Noir", 
    "Found Footage", "Gangster", "Ghost", "Gore", "Gothic", "Grindhouse", "Heist", "Historical", 
    "Historical Fiction", "Holiday", "Horror", "Independent", "Inspirational", "Interactive", "Legal Drama", 
    "Live Action", "Martial Arts", "Medical Drama", "Melodrama", "Military", "Mockumentary", "Monster", 
    "Music", "Musical", "Mystery", "Mythological", "Neo-Noir", "Occult", "Parody", "Period Drama", 
    "Political Thriller", "Post-Apocalyptic", "Psychological Thriller", "Psychological Horror", "Road Movie", 
    "Romance", "Romantic Comedy", "Satire", "Science Fiction", "Screwball Comedy", "Short Film", "Silent Film", 
    "Slapstick", "Slasher", "Slice of Life", "Soap Opera", "Space Opera", "Sports", "Spy", "Steampunk", 
    "Stop Motion", "Superhero", "Supernatural", "Survival", "Suspense", "Sword and Sorcery", "Teen", 
    "Tech Noir", "Thriller", "Time Travel", "Tragedy", "True Crime", "Vampire", "War", "Western", 
    "Whodunit", "Zombie"
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (genreRef.current && !genreRef.current.contains(event.target as Node)) {
        setIsGenreDropdownOpen(false);
      }
      if (autoStartRef.current && !autoStartRef.current.contains(event.target as Node)) {
        setIsAutoStartDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const costs = calculateTotalCost();

    // 1. Balance Verification
    if (costs.normal > userBalances.normal) {
      setInsufficientFunds({ show: true, type: 'normal', required: costs.normal });
      return;
    }
    if (costs.referral > userBalances.referral) {
      setInsufficientFunds({ show: true, type: 'referral', required: costs.referral });
      return;
    }

    // 2. Standard Validations
    const hasCover = coverFile || preFilledCoverUrl;
    if (!roomName.trim() || !movieTitle.trim() || !hasCover || !movieGenre) {
      showError('Please fill all required fields and upload a cover poster.');
      return;
    }

    if (contentType === 'movie') {
      const hasMovie = movieFile || preFilledMovieUrl;
      if (!hasMovie) {
        showError('Please upload a movie file or provide a stream URL.');
        return;
      }
    } else {
      if (episodes.length === 0) {
        showError('Please add at least one episode.');
        return;
      }
      const invalidEp = episodes.find(ep => !ep.title || !ep.file);
      if (invalidEp) {
        showError(`Episode ${invalidEp.number} is missing a title or video file.`);
        return;
      }
    }

    if (roomType === 'paid' && (!ticketPrice || parseFloat(ticketPrice) <= 0)) {
       showError('Please enter a valid ticket price for paid rooms.');
       return;
    }

    setIsSubmitting(true);
    
    try {
      // 1. Resolve Cover URL
      let coverUrl = preFilledCoverUrl;
      if (coverFile) {
        coverUrl = await uploadFile(coverFile, 'cinema/covers', 'assets');
      }
      
      // 2. Resolve Content (Movie or Series)
      let movieUrl = preFilledMovieUrl;
      let episodesData: any[] = [];

      if (contentType === 'movie') {
        if (movieFile) {
          movieUrl = await uploadFile(movieFile, 'cinema/movies', 'movies');
        }
        // Even for single movie, we store it as a single element in episodes for the sync engine
        episodesData.push({
          number: 1,
          title: movieTitle,
          url: movieUrl,
          watched: false
        });
      } else {
        // Handle Episodes Uploads
        for (const ep of episodes) {
           if (ep.file) {
             showInfo(`Uploading Episode ${ep.number}...`);
             const epUrl = await uploadFile(ep.file, `cinema/series/${movieTitle}/ep${ep.number}`, 'movies');
             episodesData.push({
               number: ep.number,
               title: ep.title,
               url: epUrl,
               watched: false
             });
           }
        }
      }

      // 3. Upload trailer if present
      let trailerUrl = null;
      if (trailerFile) {
        trailerUrl = await uploadFile(trailerFile, 'cinema/trailers', 'assets');
      }

      // 4. Prepare payload
      const payload = {
        room_name: roomName,
        room_type: roomType,
        content_type: contentType,
        movie_title: movieTitle,
        movie_cover_image: coverUrl,
        movie_file: contentType === 'movie' ? movieUrl : null,
        episodes: episodesData,
        trailer_url: trailerUrl,
        description: movieDescription,
        max_seats: isUnlimited ? null : (roomType === 'private' ? privateSeats : 100),
        category: movieGenre,
        scheduled_start_time: isLiveNow ? null : new Date(`${scheduledDate}T${scheduledTime}`).getTime(),
        text_chat_enabled: true,
        voice_enabled: roomType !== 'free',
        camera_enabled: roomType === 'private',
        ticket_price: roomType === 'paid' ? parseFloat(ticketPrice) : null,
        invite_only: roomType === 'private',
        payment_wallet_episodes: contentType === 'series' ? paymentWallet : 'normal',
        payment_wallet_private: roomType === 'private' ? privateWallet : 'normal',
        auto_start_at: autoStartValue !== 'none' ? parseInt(autoStartValue) : null
      };

      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/cinema/rooms/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create room on server.');
      }
      
      const result = await response.json();

      const totalPaid = costs.total;
      if (totalPaid > 0) {
      logPaymentEvent('success', totalPaid, { roomType, contentType, episodes: episodes.length }, auth.currentUser?.uid);
      showSuccess(`Cinema Room Active!${result.invite_link ? ` Invite: ${result.invite_link}` : ''}`);
      } else {
      showSuccess(`Cinema Room Active!${result.invite_link ? ` Invite: ${result.invite_link}` : ''}`);
      }
      setIsCreateModalOpen(false);

    } catch (err: any) {
      showError(err.message || 'Error creating room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoToWallet = () => {
    setInsufficientFunds(null);
    setIsCreateModalOpen(false);
    sessionStorage.setItem('wallet_action', 'deposit');
    window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'wallet' } }));
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
    
    // Ensure first slot is always the current user for private rooms
    if (newGuests.length > 0) {
      newGuests[0] = auth.currentUser?.uid || '';
    } else {
      newGuests.push(auth.currentUser?.uid || '');
    }

    if (val > newGuests.length) {
      newGuests.push(...Array(val - newGuests.length).fill(''));
    } else if (val < newGuests.length) {
      newGuests.splice(val);
    }
    setPrivateGuests(newGuests);
  };

  if (activeRoom) {
    return <CinemaLiveRoom roomId={activeRoom.id} roomData={activeRoom} onLeave={() => setActiveRoom(null)} />;
  }

  const closeCreateModal = () => {
    if (roomName.trim() || movieTitle.trim()) {
      logUserAction('room_creation_abandoned', 'cinema', { roomName, movieTitle }, auth.currentUser?.uid);
    }
    setIsCreateModalOpen(false);
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-20 relative overflow-x-hidden">
      {isVerifyingPayment && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-white font-black uppercase tracking-widest text-sm">Verifying Payment...</p>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-6 px-1 mb-4">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight gradient-text">Cinema Room</h1>
          <p className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase tracking-widest opacity-70">Experience movies together in virtual luxury.</p>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-2 md:gap-3">
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

        {/* Curtains Layer */}
        <AnimatePresence initial={false}>
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
          <AnimatePresence mode="wait" initial={false}>
            {!curtainsOpen && (
              <motion.div 
                key="theater-intro"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ 
                  delay: 1.2,
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
                  <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.4)] uppercase">
                    The Grand Theater
                  </h2>
                  <div className="flex items-center justify-center gap-3">
                    <div className="h-[1px] w-8 bg-[#FFD700]/50" />
                    <p className="text-[#FFD700] uppercase tracking-[0.3em] text-[10px] font-black animate-pulse">Available Movies</p>
                    <div className="h-[1px] w-8 bg-[#FFD700]/50" />
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

                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                    onClick={(e) => { e.stopPropagation(); handleShareRoom(room); }}
                    className="p-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-primary transition-all"
                   >
                     <Share2 className="w-4 h-4" />
                   </button>
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
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isCreateModalOpen && (
            <React.Fragment key="modal-fragment">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeCreateModal}
                className="fixed inset-0 bg-black/90 backdrop-blur-md z-[2000]"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
                className="fixed left-1/2 top-1/2 w-full max-w-2xl max-h-[90vh] overflow-y-auto z-[2001] p-4"
              >
                <Card className="glass-card border-white/10 shadow-2xl overflow-hidden relative">
                  <div className="sticky top-0 bg-background/90 backdrop-blur-xl border-b border-white/10 p-8 flex flex-col items-center text-center z-20 relative">
                    <button 
                      type="button"
                      onClick={closeCreateModal} 
                      className="absolute right-6 top-6 p-2 rounded-full hover:bg-white/10 transition-all hover:rotate-90 group"
                    >
                      <X className="w-5 h-5 text-muted-foreground group-hover:text-white" />
                    </button>
                    
                    <div className="w-14 h-14 rounded-[1.25rem] bg-primary/10 flex items-center justify-center mb-5 border border-primary/20 shadow-[0_0_30px_rgba(225,29,72,0.15)] relative group">
                      <div className="absolute inset-0 bg-primary/20 rounded-[1.25rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                      <Tv className="w-7 h-7 text-primary relative z-10" />
                    </div>
                    
                    <h2 className="text-3xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/40 uppercase">
                      Create Cinema Room
                    </h2>
                    <p className="text-[10px] md:text-xs text-muted-foreground font-black uppercase tracking-[0.25em] mt-3 opacity-60 max-w-[80%] mx-auto leading-relaxed">
                      Host a movie experience for friends or the public
                    </p>
                    
                    <div className="flex items-center gap-3 mt-6">
                      <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-primary/40" />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_#e11d48]" />
                      <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-primary/40" />
                    </div>
                  </div>

                  <div className="px-6 py-2 flex justify-end">
                     <Button type="button" variant="outline" onClick={handleBuySnacks} className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-8 text-[10px] font-black uppercase">
                        <ShoppingBag className="w-3 h-3" />
                        Buy Snacks for Room
                     </Button>
                  </div>

                  <form onSubmit={handleCreateRoom} className="p-6 space-y-8">
                    {/* Content Type Selector */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">What are you hosting?</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          type="button" 
                          onClick={() => setContentType('movie')}
                          className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${contentType === 'movie' ? 'bg-primary/10 border-primary text-primary shadow-lg shadow-primary/10' : 'bg-white/5 border-white/10 text-muted-foreground'}`}
                        >
                          <Film className="w-6 h-6" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Single Movie</span>
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setContentType('series')}
                          className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${contentType === 'series' ? 'bg-purple-500/10 border-purple-500 text-purple-400 shadow-lg shadow-purple-500/10' : 'bg-white/5 border-white/10 text-muted-foreground'}`}
                        >
                          <Tv className="w-6 h-6" />
                          <span className="text-[10px] font-black uppercase tracking-widest">TV Season / Series</span>
                        </button>
                      </div>
                    </div>

                    {/* Media Uploads */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Main Poster / Cover Art</label>
                        <div 
                          onClick={() => coverFileRef.current?.click()}
                          className={`aspect-[3/4] rounded-2xl border-2 border-dashed ${coverFile ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group relative overflow-hidden`}
                        >
                          {coverFile ? (
                             <div className="absolute inset-0">
                               <img src={URL.createObjectURL(coverFile)} className="w-full h-full object-cover opacity-60" />
                               <div className="absolute inset-0 flex flex-col items-center justify-center">
                                 <Check className="w-8 h-8 text-primary mb-2" />
                                 <span className="text-xs font-bold text-white shadow-black drop-shadow-md">Cover Selected</span>
                               </div>
                             </div>
                          ) : (
                             <>
                              <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                              <span className="text-xs font-bold text-muted-foreground group-hover:text-primary uppercase tracking-tighter">Upload Poster</span>
                             </>
                          )}
                          <input type="file" ref={coverFileRef} onChange={(e) => setCoverFile(e.target.files?.[0] || null)} className="hidden" accept="image/*" />
                        </div>
                      </div>

                      <div className="space-y-6">
                        {contentType === 'movie' ? (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Movie Video File</label>
                              <div 
                                 onClick={() => movieFileRef.current?.click()}
                                 className={`h-32 rounded-2xl border-2 border-dashed ${movieFile ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group`}
                              >
                                 {movieFile ? (
                                   <>
                                     <Check className="w-5 h-5 text-primary mb-1" />
                                     <span className="text-xs font-bold text-white truncate max-w-[90%]">{movieFile.name}</span>
                                   </>
                                 ) : (
                                   <>
                                     <Film className="w-5 h-5 text-muted-foreground group-hover:text-primary mb-1" />
                                     <span className="text-xs font-bold text-muted-foreground">Upload Movie</span>
                                   </>
                                 )}
                                 <input type="file" ref={movieFileRef} onChange={(e) => setMovieFile(e.target.files?.[0] || null)} className="hidden" accept="video/*" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Trailer (Optional)</label>
                              <div 
                                 onClick={() => trailerFileRef.current?.click()}
                                 className={`h-24 rounded-2xl border-2 border-dashed ${trailerFile ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group relative`}
                              >
                                 {trailerFile ? (
                                   <>
                                     <Check className="w-5 h-5 text-primary mb-1" />
                                     <span className="text-xs font-bold text-white truncate max-w-[90%]">{trailerFile.name}</span>
                                   </>
                                 ) : (
                                   <>
                                     <Camera className="w-5 h-5 text-muted-foreground group-hover:text-primary mb-1" />
                                     <span className="text-xs font-bold text-muted-foreground">Upload Trailer</span>
                                   </>
                                 )}
                                 <input type="file" ref={trailerFileRef} onChange={(e) => setTrailerFile(e.target.files?.[0] || null)} className="hidden" accept="video/*" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                             <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Episodes Management</label>
                                <Badge className="bg-purple-600 font-black text-[9px]">{episodes.length} EPISODE{episodes.length === 1 ? '' : 'S'}</Badge>
                             </div>
                             
                             <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {episodes.map((ep, idx) => (
                                  <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3 relative group">
                                     <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-purple-400">EPISODE {ep.number}</span>
                                        {episodes.length > 1 && (
                                          <button 
                                            type="button" 
                                            onClick={() => setEpisodes(episodes.filter((_, i) => i !== idx))}
                                            className="text-rose-500 hover:text-rose-400 p-1"
                                          >
                                            <X size={14} />
                                          </button>
                                        )}
                                     </div>
                                     <input 
                                       type="text" 
                                       placeholder="Episode Title (e.g. The Beginning)" 
                                       value={ep.title}
                                       onChange={(e) => {
                                         const newEps = [...episodes];
                                         newEps[idx].title = e.target.value;
                                         setEpisodes(newEps);
                                       }}
                                       className="w-full bg-black/20 border border-white/5 rounded-lg py-3 px-4 text-xs outline-none focus:border-purple-500/50"
                                     />
                                     <button 
                                        type="button" 
                                        onClick={() => {
                                          const input = document.createElement('input');
                                          input.type = 'file';
                                          input.accept = 'video/*';
                                          input.onchange = (e) => {
                                            const file = (e.target as HTMLInputElement).files?.[0];
                                            if (file) {
                                              const newEps = [...episodes];
                                              newEps[idx].file = file;
                                              setEpisodes(newEps);
                                            }
                                          };
                                          input.click();
                                        }}
                                        className={`w-full py-3 rounded-xl text-[10px] font-bold border transition-all ${ep.file ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'}`}
                                      >
                                         {ep.file ? `✓ ${ep.file.name.substring(0, 20)}...` : 'Select Video File'}
                                      </button>
                                  </div>
                                ))}
                                <Button 
                                  type="button" 
                                  onClick={() => setEpisodes([...episodes, { number: episodes.length + 1, title: '', file: null }])}
                                  className="w-full border-dashed border-white/10 h-12 text-[9px] font-black uppercase tracking-widest hover:bg-white/5" 
                                  variant="outline"
                                >
                                  <Plus className="w-3 h-3 mr-2" /> Add Next Episode
                                </Button>
                             </div>

                             {/* Payment Method for Episodes */}
                             <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-4 mt-4">
                                <div className="flex justify-between items-end">
                                   <div>
                                      <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Episode Hosting Cost</p>
                                      <p className="text-xl font-black text-white">₦{(episodes.length * (paymentWallet === 'referral' ? 50 : 100)).toLocaleString()}</p>
                                   </div>
                                   <div className="flex flex-col gap-2 w-1/2">
                                      <p className="text-[8px] font-black text-muted-foreground uppercase text-right">Choose Wallet</p>
                                      <div className="flex p-1 bg-black/40 rounded-lg border border-white/5">
                                         <button 
                                          type="button" 
                                          onClick={() => setPaymentWallet('normal')}
                                          className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${paymentWallet === 'normal' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground'}`}
                                         >
                                           MAIN (100)
                                         </button>
                                         <button 
                                          type="button" 
                                          onClick={() => setPaymentWallet('referral')}
                                          className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${paymentWallet === 'referral' ? 'bg-orange-600 text-white shadow-lg' : 'text-muted-foreground'}`}
                                         >
                                           REF (50)
                                         </button>
                                      </div>
                                   </div>
                                </div>
                                <p className="text-[9px] text-muted-foreground leading-relaxed italic">
                                  {paymentWallet === 'referral' 
                                    ? "Using your Aura Referral Balance. get 50% off per episode!" 
                                    : "Standard rate applied. Episodes are hosted until the entire season is watched."}
                                </p>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Room Details */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Room Name</label>
                        <input type="text" required value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="e.g. Midnight Watch Party" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-primary/50" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{contentType === 'movie' ? 'Movie Title' : 'Season Name'}</label>
                          <input type="text" required value={movieTitle} onChange={e => setMovieTitle(e.target.value)} placeholder={contentType === 'movie' ? 'Movie Name' : 'e.g. The Boys Season 4'} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm outline-none focus:border-primary/50" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Genre</label>
                          <div className="relative" ref={genreRef}>
                            <button
                              type="button"
                              onClick={() => setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-[13px] outline-none focus:border-primary/50 flex items-center justify-between transition-all"
                            >
                              <span className={movieGenre ? 'text-white font-bold' : 'text-muted-foreground'}>
                                {movieGenre || 'Select Genre'}
                              </span>
                              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${isGenreDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            <AnimatePresence>
                              {isGenreDropdownOpen && (
                                <motion.div
                                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                  className="absolute left-0 right-0 top-full mt-2 z-[3000] bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar"
                                >
                                  <div className="p-2 grid grid-cols-1 gap-1">
                                    {genres.map((genre) => (
                                      <button
                                        key={genre}
                                        type="button"
                                        onClick={() => {
                                          setMovieGenre(genre);
                                          setIsGenreDropdownOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                          movieGenre === genre 
                                            ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                                            : 'text-muted-foreground hover:bg-white/5 hover:text-white'
                                        }`}
                                      >
                                        {genre}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</label>
                          <span className="text-[10px] text-muted-foreground">Max 200 words</span>
                        </div>
                        <textarea required value={movieDescription} onChange={e => setMovieDescription(e.target.value)} rows={3} placeholder="What is this room about?" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm outline-none focus:border-primary/50 resize-none" />
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
                        <div className="flex items-center gap-2 mt-2 relative">
                          <div 
                            onMouseEnter={() => setShowAutoDeleteTooltip(true)}
                            onMouseLeave={() => setShowAutoDeleteTooltip(false)}
                            onClick={() => setShowAutoDeleteTooltip(!showAutoDeleteTooltip)}
                            className="cursor-help"
                          >
                             <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          </div>
                          <p className="text-[9px] text-muted-foreground leading-tight">Live rooms without users auto-delete after 24h.</p>
                          
                          <AnimatePresence>
                            {showAutoDeleteTooltip && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute bottom-full left-0 mb-2 w-48 p-3 rounded-xl bg-[#0f172a] border border-white/10 shadow-2xl z-[4000] pointer-events-none"
                              >
                                <p className="text-[8px] text-white/90 font-bold uppercase leading-relaxed tracking-wider">To keep our cloud fast, rooms with zero activity for 24 hours are cleared. However, series rooms stay active until the final episode is watched!</p>
                              </motion.div>
                            )}
                          </AnimatePresence>
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
                            <input type="number" placeholder="Seats" className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-3 pr-10 text-xs outline-none focus:border-primary/50 font-black" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground font-bold">Seats</span>
                          </div>
                        )}
                        <div className="space-y-1.5 mt-3">
                           <label className="text-[9px] font-bold text-muted-foreground uppercase ml-1">Auto-Start</label>
                           <div className="relative" ref={autoStartRef}>
                              <button
                                type="button"
                                onClick={() => setIsAutoStartDropdownOpen(!isAutoStartDropdownOpen)}
                                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-2.5 px-3 text-[11px] outline-none text-white flex items-center justify-between transition-all"
                              >
                                <span className="font-black uppercase tracking-tighter">
                                  {autoStartOptions.find(o => o.value === autoStartValue)?.label}
                                </span>
                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 ${isAutoStartDropdownOpen ? 'rotate-180' : ''}`} />
                              </button>

                              <AnimatePresence>
                                {isAutoStartDropdownOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                    className="absolute left-0 right-0 top-full mt-2 z-[3000] bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                                  >
                                    <div className="p-1">
                                      {autoStartOptions.map((opt) => (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          onClick={() => {
                                            setAutoStartValue(opt.value);
                                            setIsAutoStartDropdownOpen(false);
                                          }}
                                          className={`w-full text-left px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${
                                            autoStartValue === opt.value 
                                              ? 'bg-primary text-white' 
                                              : 'text-muted-foreground hover:bg-white/5 hover:text-white'
                                          }`}
                                        >
                                          {opt.label}
                                        </button>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
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
                                 <input type="number" required={roomType === 'paid'} value={ticketPrice} onChange={e => setTicketPrice(e.target.value)} placeholder="0.00" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-9 pr-4 text-sm font-bold outline-none focus:border-primary/50" />
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
                             
                             <div className="p-4 md:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-4 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-2 opacity-10">
                                   <ShieldAlert className="w-20 h-20" />
                                </div>

                                <div className="flex flex-col md:flex-row justify-between items-start gap-4 relative z-10">
                                  <div>
                                    <h4 className="text-sm font-black text-amber-500 uppercase tracking-tight">Private Screening</h4>
                                    <p className="text-[10px] text-amber-200/70 mt-1 max-w-[250px]">Hidden room. Access via unique link or QR. Premium features included.</p>
                                  </div>
                                  <div className="md:text-right">
                                    <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Seat Cost</p>
                                    <p className="text-2xl font-black text-white">₦{(privateSeats * (privateWallet === 'referral' ? 2500 : 1000)).toLocaleString()}</p>
                                  </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-amber-500/20 relative z-10">
                                   <div className="flex justify-between items-center">
                                      <label className="text-[10px] font-black uppercase tracking-widest text-amber-300">Seats ({privateWallet === 'referral' ? '₦2.5k' : '₦1k'}/seat)</label>
                                      
                                      <div className="flex flex-col gap-1.5 w-1/2">
                                         <p className="text-[8px] font-black text-amber-500/60 uppercase text-right">Pay Seats With</p>
                                         <div className="flex p-1 bg-black/40 rounded-lg border border-white/5">
                                            <button 
                                              type="button" 
                                              onClick={() => setPrivateWallet('normal')}
                                              className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${privateWallet === 'normal' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground'}`}
                                            >
                                              MAIN
                                            </button>
                                            <button 
                                              type="button" 
                                              onClick={() => setPrivateWallet('referral')}
                                              className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${privateWallet === 'referral' ? 'bg-orange-600 text-white shadow-lg' : 'text-muted-foreground'}`}
                                            >
                                              REF
                                            </button>
                                         </div>
                                      </div>
                                   </div>

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
                                     <Users className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${index === 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                                     <input 
                                       type="text" 
                                       placeholder={index === 0 ? "Your Aura ID" : "Paste Aura ID..."}
                                       value={guest}
                                       readOnly={index === 0}
                                       onChange={(e) => handlePrivateGuestChange(index, e.target.value)}
                                       className={`w-full border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-[11px] outline-none transition-all ${
                                         index === 0 
                                           ? 'bg-primary/5 border-primary/20 text-primary font-bold cursor-default' 
                                           : 'bg-white/5 focus:border-amber-500/50'
                                       }`} 
                                       required
                                     />
                                     {index === 0 && (
                                       <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-primary tracking-widest bg-primary/10 px-2 py-0.5 rounded-full">
                                         You (Host)
                                       </span>
                                     )}
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
                       <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)} disabled={isSubmitting}>Cancel</Button>
                       <Button type="submit" disabled={isSubmitting} className="gradient-bg px-8 font-black gap-2 disabled:opacity-50 min-w-[200px]">
                         {isSubmitting ? (
                           <>
                             <Loader2 className="w-4 h-4 animate-spin" />
                             Processing...
                           </>
                         ) : (
                           <>
                             {calculateTotalCost().total > 0 ? `Pay ₦${calculateTotalCost().total.toLocaleString()} & Create` : 'Create Room'}
                             <Plus className="w-4 h-4" />
                           </>
                         )}
                       </Button>
                    </div>
                  </form>
                </Card>
              </motion.div>
            </React.Fragment>
          )}
        </AnimatePresence>,
        document.body
      )}

      <CinemaStoreModal isOpen={isStoreOpen} onClose={() => setIsStoreOpen(false)} />

      {/* Insufficient Funds Modal */}
      {insufficientFunds?.show && createPortal(
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md font-sans">
           <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            className="glass-card max-w-sm w-full p-8 text-center space-y-6 border-white/10 shadow-2xl"
           >
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto border border-rose-500/20">
                 <ShieldAlert className="text-rose-500 w-8 h-8" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase text-white tracking-tighter">
                   {insufficientFunds.type === 'referral' ? 'Referral Balance Low' : 'Wallet Balance Low'}
                 </h3>
                 <p className="text-xs text-muted-foreground font-medium uppercase leading-relaxed tracking-wider">
                    {insufficientFunds.type === 'referral' 
                      ? "You don't have enough referral earnings. Refer more friends to get 50% off or pay with your main wallet balance." 
                      : `You need ₦${insufficientFunds.required.toLocaleString()} in your wallet to create this room.`}
                 </p>
              </div>
              <div className="flex flex-col gap-3">
                 {insufficientFunds.type === 'normal' && (
                    <Button onClick={handleGoToWallet} className="w-full gradient-bg h-12 font-black uppercase text-[10px] shadow-lg shadow-primary/20">
                      <WalletIcon className="w-4 h-4 mr-2" />
                      Add Funds to Wallet
                    </Button>
                 )}
                 <Button variant="ghost" onClick={() => setInsufficientFunds(null)} className="w-full h-11 text-[10px] font-black uppercase border border-white/5 hover:bg-white/5">
                   Go Back
                 </Button>
              </div>
           </motion.div>
        </div>, 
        document.body
      )}
    </div>
  );
};

export default CinemaRoom;
