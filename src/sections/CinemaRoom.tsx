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
  Trash2,
  Wallet as WalletIcon,
  DoorOpen,
  Clapperboard,
  ArrowRight
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { CinemaStoreModal } from './CinemaStoreModal';
import mediaApi, { API_BASE_URL } from '../api/mediaApi';
import { auth, db, uploadFile, logUserAction, logPaymentEvent, logInviteEvent } from '@/lib/firebase';
import { doc, getDoc, deleteDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { initializePaystackPayment, verifyPaymentOnBackend } from '../api/paymentApi';
import { CinemaLiveRoom } from './CinemaLiveRoom';
import { setCinemaActive } from '@/lib/appLifecycle';
import { AuraCoinIcon } from '../components/AuraCoinIcon';

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
  
  // Dynamic Content State
  const [slides, setSlides] = useState<CinemaSlide[]>([]);
  const [trailers, setTrailers] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [selectedTrailer, setSelectedTrailer] = useState<any | null>(null);
  const [resolvedTrailerUrl, setResolvedTrailerUrl] = useState<string | null>(null);
  const [trailerEmbedUrl, setTrailerEmbedUrl] = useState<string | null>(null);
  const [trailerPlayerMode, setTrailerPlayerMode] = useState<'video' | 'embed'>('video');
  const [isLoadingTrailerVideo, setIsLoadingTrailerVideo] = useState(false);
  const [isTrailerBuffering, setIsTrailerBuffering] = useState(false);
  const [trailerPlayError, setTrailerPlayError] = useState<string | null>(null);
  
  // Cinema Doors & Curtain Opening Entrance State
  const [selectedDoorRoom, setSelectedDoorRoom] = useState<any | null>(null);
  const [isDoorCurtainsOpen, setIsDoorCurtainsOpen] = useState(false);

  const handleOpenDoorEntrance = (room: any) => {
    setSelectedDoorRoom(room);
    setIsDoorCurtainsOpen(false);
    // Smoothly trigger the curtain opening sequence shortly after mount
    setTimeout(() => {
      setIsDoorCurtainsOpen(true);
    }, 120);
  };

  const handleCloseDoorEntrance = () => {
    setIsDoorCurtainsOpen(false);
    setTimeout(() => {
      setSelectedDoorRoom(null);
    }, 450);
  };
  
  // Live Room State
  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dynamic Trailer Stream Resolution Effect
  useEffect(() => {
    if (!selectedTrailer) {
      setResolvedTrailerUrl(null);
      setTrailerEmbedUrl(null);
      setTrailerPlayerMode('video');
      setTrailerPlayError(null);
      setIsLoadingTrailerVideo(false);
      setIsTrailerBuffering(false);
      return;
    }

    let active = true;
    const resolveTrailer = async () => {
      setIsLoadingTrailerVideo(true);
      setIsTrailerBuffering(true);
      setTrailerPlayError(null);

      const rawUrl = (
        selectedTrailer.videoUrl || 
        selectedTrailer.trailer_url || 
        selectedTrailer.trailerUrl || 
        selectedTrailer.streamUrl || 
        selectedTrailer.stream_url || 
        selectedTrailer.url || 
        ''
      ).trim();

      const movieTitle = selectedTrailer.title || selectedTrailer.movie_title || selectedTrailer.roomName || '';
      const roomId = selectedTrailer.roomId || selectedTrailer.id;

      // 1. Direct YouTube link handling
      if (rawUrl && (rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be'))) {
        let ytId = '';
        if (rawUrl.includes('youtu.be/')) {
          ytId = rawUrl.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0] || '';
        } else if (rawUrl.includes('v=')) {
          ytId = rawUrl.split('v=')[1]?.split('&')[0] || '';
        } else if (rawUrl.includes('/embed/')) {
          ytId = rawUrl.split('/embed/')[1]?.split('?')[0] || '';
        }
        if (ytId) {
          if (active) {
            setTrailerEmbedUrl(`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`);
            setTrailerPlayerMode('embed');
            setIsLoadingTrailerVideo(false);
            setIsTrailerBuffering(false);
          }
          return;
        }
      }

      // 2. Resolve via backend trailer streaming endpoint (handles R2 presigned streaming, Cloudflare URLs, etc.)
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const queryParams = new URLSearchParams();
        if (rawUrl) queryParams.set('url', rawUrl);
        if (roomId) queryParams.set('room_id', roomId);
        if (selectedTrailer.id) queryParams.set('trailer_id', selectedTrailer.id);
        if (movieTitle) queryParams.set('title', movieTitle);

        const res = await fetch(`${API_BASE_URL}/api/cinema/trailer-stream-url?${queryParams.toString()}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (active && data.success) {
            if (data.player_mode === 'embed' && data.embed_url) {
              setTrailerEmbedUrl(data.embed_url);
              setTrailerPlayerMode('embed');
            } else if (data.stream_url) {
              setResolvedTrailerUrl(data.stream_url);
              setTrailerPlayerMode('video');
            }
            setIsLoadingTrailerVideo(false);
            return;
          }
        }
      } catch (backendErr) {
        console.warn('Trailer backend stream resolution notice:', backendErr);
      }

      // 3. If a direct/uploaded URL was provided, use it directly (do NOT fall back to YouTube for uploaded trailers)
      if (rawUrl) {
        if (active) {
          setResolvedTrailerUrl(rawUrl);
          setTrailerPlayerMode('video');
          setIsLoadingTrailerVideo(false);
        }
        return;
      }

      // 4. Fallback search via mediaApi movie trailer service ONLY when no trailer was uploaded
      if (movieTitle) {
        try {
          const trailerData = await mediaApi.getMovieTrailer(movieTitle);
          if (active && trailerData.success && trailerData.data) {
            const yKey = trailerData.data.youtubeKey || trailerData.data.key;
            if (trailerData.data.embedUrl || yKey) {
              setTrailerEmbedUrl(trailerData.data.embedUrl || `https://www.youtube-nocookie.com/embed/${yKey}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`);
              setTrailerPlayerMode('embed');
              setIsLoadingTrailerVideo(false);
              setIsTrailerBuffering(false);
              return;
            } else if (trailerData.data.streamUrl || trailerData.data.directUrl) {
              setResolvedTrailerUrl(trailerData.data.streamUrl || trailerData.data.directUrl || null);
              setTrailerPlayerMode('video');
              setIsLoadingTrailerVideo(false);
              return;
            }
          }
        } catch (mErr) {
          console.warn('Trailer search fallback notice:', mErr);
        }
      }

      if (active) {
        setTrailerPlayError('Trailer stream is currently unavailable. Please try again.');
        setIsLoadingTrailerVideo(false);
        setIsTrailerBuffering(false);
      }
    };

    resolveTrailer();

    return () => {
      active = false;
    };
  }, [selectedTrailer]);

  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const timeInputRef = React.useRef<HTMLInputElement>(null);

  // URL Deep Link Logic & Room Session Recovery
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    const verifyRef = params.get('verify');
    const triggerCreate = params.get('create');

    if (roomId) {
      logInviteEvent('accepted', roomId, auth.currentUser?.uid);
      handleJoinRoomById(roomId);
    } else {
      // Seamlessly restore active cinema room if tab was backgrounded / resumed
      const savedRoomId = sessionStorage.getItem('aura_active_cinema_room_id');
      if (savedRoomId && !activeRoom) {
        handleJoinRoomById(savedRoomId);
      }
    }

    if (verifyRef && roomId) {
      handleVerifyPayment(roomId, verifyRef);
    }

    const applyPrefillData = (data: {
      title?: string;
      thumbnail?: string;
      movieUrl?: string;
      season?: string;
      episode?: string;
      description?: string;
      genre?: string;
      roomName?: string;
    }) => {
      const { title: mTitle, thumbnail: mThumb, movieUrl: mUrl, season: mSeason, episode: mEpisode, description: mDesc, genre: mGenre, roomName: rName } = data;
      if (mTitle) {
        setMovieTitle(mSeason ? `${mTitle} (S${mSeason} E${mEpisode || '1'})` : mTitle);
        setRoomName(rName || `${mTitle} Watch Party`);
      }
      if (mThumb) setPreFilledCoverUrl(mThumb);
      if (mUrl) setPreFilledMovieUrl(mUrl);
      if (mDesc) setMovieDescription(mDesc);
      if (mGenre) setMovieGenre(mGenre);
      setIsCreateModalOpen(true);
    };

    if (triggerCreate === 'true') {
      const mTitle = params.get('title') || '';
      const mThumb = params.get('thumbnail') || '';
      const mUrl = params.get('movie_url') || '';
      const mSeason = params.get('season') || undefined;
      const mEpisode = params.get('episode') || undefined;
      const mDesc = params.get('desc') || params.get('description') || undefined;
      const mGenre = params.get('genre') || undefined;
      const rName = params.get('room_name') || undefined;

      applyPrefillData({
        title: mTitle,
        thumbnail: mThumb,
        movieUrl: mUrl,
        season: mSeason,
        episode: mEpisode,
        description: mDesc,
        genre: mGenre,
        roomName: rName
      });
      
      // Clean URL params to prevent re-opening on reload
      const url = new URL(window.location.href);
      url.searchParams.delete('create');
      url.searchParams.delete('movie_id');
      url.searchParams.delete('title');
      url.searchParams.delete('thumbnail');
      url.searchParams.delete('movie_url');
      url.searchParams.delete('season');
      url.searchParams.delete('episode');
      url.searchParams.delete('desc');
      url.searchParams.delete('description');
      url.searchParams.delete('genre');
      url.searchParams.delete('room_name');
      window.history.replaceState({}, '', url);
    } else {
      // Check session storage pre-fill
      const storedPrefill = sessionStorage.getItem('aura_cinema_prefill_room');
      if (storedPrefill) {
        try {
          const parsed = JSON.parse(storedPrefill);
          applyPrefillData(parsed);
        } catch (e) {}
        sessionStorage.removeItem('aura_cinema_prefill_room');
      }
    }
  }, []);

  // Listen for external open create room events
  useEffect(() => {
    const handleOpenCreateRoomEvent = (e: any) => {
      const detail = e.detail || {};
      if (detail.title) {
        setMovieTitle(detail.season ? `${detail.title} (S${detail.season} E${detail.episode || '1'})` : detail.title);
        setRoomName(detail.roomName || `${detail.title} Watch Party`);
      }
      if (detail.thumbnail) setPreFilledCoverUrl(detail.thumbnail);
      if (detail.movieUrl) setPreFilledMovieUrl(detail.movieUrl);
      if (detail.description) setMovieDescription(detail.description);
      if (detail.genre) setMovieGenre(detail.genre);
      setIsCreateModalOpen(true);
    };

    window.addEventListener('aura_open_create_room', handleOpenCreateRoomEvent);
    return () => window.removeEventListener('aura_open_create_room', handleOpenCreateRoomEvent);
  }, []);

  // Listen for external leave cinema events
  useEffect(() => {
    const handleLeaveCinema = () => {
      setCinemaActive(null);
      setActiveRoom(null);
    };
    window.addEventListener('aura_leave_cinema', handleLeaveCinema);
    return () => window.removeEventListener('aura_leave_cinema', handleLeaveCinema);
  }, []);

  const handleJoinRoomById = async (roomId: string) => {
    try {
      const roomDoc = await getDoc(doc(db, 'cinema_rooms', roomId));
      if (!roomDoc.exists()) {
        showError('Room not found or no longer available');
        setCinemaActive(null);
        return;
      }
      const roomData: any = { id: roomDoc.id, ...roomDoc.data() };
      
      // If free, join immediately
      if (roomData.room_type === 'free') {
        setActiveRoom(roomData);
        setCinemaActive(roomId);
        return;
      }

      // If paid/private, check for access pass
      if (auth.currentUser) {
        const passesRef = collection(db, 'room_access_passes');
        const q = query(passesRef, where('room_id', '==', roomId), where('user_uid', '==', auth.currentUser.uid));
        const passDocs = await getDocs(q);
        
        if (!passDocs.empty || roomData.host_uid === auth.currentUser.uid || isAdmin) {
          setActiveRoom(roomData);
          setCinemaActive(roomId);
        } else {
          // Trigger Payment Flow
          handlePaymentPrompt(roomData);
        }
      } else {
        requireAuth(() => handleJoinRoomById(roomId));
      }
    } catch (err) {
      showError('Failed to join room');
      setCinemaActive(null);
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

  // Dynamic Content Listeners (Defensive Pattern)
  useEffect(() => {
    let active = true;
    let unsubCarousel: any;
    let unsubTrailers: any;
    let unsubUpcoming: any;

    // Small delay to let React 19/Strict Mode finish its double-mount cycle
    const timeout = setTimeout(() => {
      if (!active) return;

      unsubCarousel = onSnapshot(query(collection(db, 'cinema_carousel'), orderBy('createdAt', 'desc')), (snap) => {
        if (active) setSlides(snap.docs.map(d => ({ id: d.id, ...d.data() } as CinemaSlide)));
      }, (err) => console.error('Carousel Sync Error:', err));

      unsubTrailers = onSnapshot(collection(db, 'cinema_trailers'), (snap) => {
        if (active) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a: any, b: any) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (typeof a.createdAt === 'number' ? a.createdAt : 0);
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (typeof b.createdAt === 'number' ? b.createdAt : 0);
            return timeB - timeA;
          });
          setTrailers(list);
        }
      }, (err) => console.error('Trailers Sync Error:', err));

      unsubUpcoming = onSnapshot(query(collection(db, 'cinema_upcoming'), orderBy('createdAt', 'desc')), (snap) => {
        if (active) setUpcoming(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.error('Upcoming Sync Error:', err));
    }, 100);

    return () => {
      active = false;
      clearTimeout(timeout);
      if (unsubCarousel) unsubCarousel();
      if (unsubTrailers) unsubTrailers();
      if (unsubUpcoming) unsubUpcoming();
    };
  }, []);

  // Automated Curtain Loop & Poster Slide Logic
  useEffect(() => {
    if (slides.length === 0) return;
    let loopTimeout: any;
    
    if (!curtainsOpen) {
      loopTimeout = setTimeout(() => {
        setCurtainsOpen(true);
        setCurrentSlide(0);
      }, 5000);
    } else {
      const slideInterval = setInterval(() => {
        setCurrentSlide(prev => {
          if (prev < slides.length - 1) {
            return prev + 1;
          } else {
            clearInterval(slideInterval);
            loopTimeout = setTimeout(() => {
              setCurtainsOpen(false);
            }, 5000);
            return prev;
          }
        });
      }, 5000);
      
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
  const [limitedCapacity, setLimitedCapacity] = useState('50');
  const [privateSeats, setPrivateSeats] = useState(1);
  const [privateGuests, setPrivateGuests] = useState(['']);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  
  // New Form Fields
  const [roomName, setRoomName] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [movieGenre, setMovieGenre] = useState('');
  const [movieDescription, setMovieDescription] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [runtime, setRuntime] = useState('');
  const [ageRating, setAgeRating] = useState('');
  const [director, setDirector] = useState('');
  const [cast, setCast] = useState('');
  const [tagline, setTagline] = useState('');
  const [ticketPrice, setTicketPrice] = useState('');
  const [movieFile, setMovieFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [trailerFile, setTrailerFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Series Specific State
  const [episodes, setEpisodes] = useState<{ number: number; title: string; file: File | null }[]>([
    { number: 1, title: '', file: null }
  ]);
  const [paymentWallet, setPaymentWallet] = useState<'normal' | 'referral' | 'auracoin'>('auracoin');
  const [privateWallet, setPrivateWallet] = useState<'normal' | 'referral' | 'auracoin'>('normal');
  const [userBalances, setUserBalances] = useState({ normal: 0, referral: 0, auracoin: 0 });
  const [insufficientFunds, setInsufficientFunds] = useState<{ show: boolean; type: 'normal' | 'referral' | 'auracoin'; required: number } | null>(null);

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

      // 2. Referral & AuraCoin Balances
      const userRef = doc(db, 'users', auth.currentUser!.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.exists() ? userDoc.data() : {};
      const referralBal = userData.referralBalance || 0;
      const auracoinBal = Number(userData.auraCoins ?? userData.auraCoin ?? userData.bonusBalance ?? 0);

      setUserBalances({ normal: normalBal, referral: referralBal, auracoin: auracoinBal });
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
    let auracoinRequired = 0;

    // 1. Episode Cost (50 AuraCoins or ₦50 Cash/Referral per episode)
    if (contentType === 'series') {
      const perEp = 50;
      if (paymentWallet === 'auracoin') auracoinRequired += (episodes.length * perEp);
      else if (paymentWallet === 'referral') referralRequired += (episodes.length * perEp);
      else normalRequired += (episodes.length * perEp);
    }

    // 2. Private Room Cost (2,500 AuraCoins, ₦2,500 Referral, or ₦1,000 Main per seat)
    if (roomType === 'private') {
      if (privateWallet === 'auracoin') {
        auracoinRequired += (privateSeats * 2500);
      } else if (privateWallet === 'referral') {
        referralRequired += (privateSeats * 2500);
      } else {
        normalRequired += (privateSeats * 1000);
      }
    }

    return { 
      normal: normalRequired, 
      referral: referralRequired, 
      auracoin: auracoinRequired,
      total: normalRequired + referralRequired + auracoinRequired 
    };
  };

  // Reset slide index if slides are removed or out of bounds
  useEffect(() => {
    if (slides.length > 0) {
      if (currentSlide >= slides.length) {
        setCurrentSlide(0);
      }
    } else {
      setCurrentSlide(0);
    }
  }, [slides.length, currentSlide]);

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

  const [rooms, setRooms] = useState<any[]>([]);

  // Real-time Rooms Listener
  useEffect(() => {
    const q = query(collection(db, 'cinema_rooms'), orderBy('created_at', 'desc'), limit(12));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleShareRoom = (room: any) => {
    const shareUrl = `${API_BASE_URL}/share?title=${encodeURIComponent(`Live Cinema: ${room.room_name}`)}&desc=${encodeURIComponent(`Watching ${room.movie_title} with ${room.active_viewers || 0} others. Join now!`)}&img=${encodeURIComponent(room.movie_cover_image)}&target=${encodeURIComponent(`/?tab=cinema&room=${room.id}`)}`;
    
    if (navigator.share) {
      navigator.share({
        title: `Join StreamAura Cinema - ${room.room_name}`,
        text: `🍿 I'm watching ${room.movie_title} on StreamAura! Come join the room.`,
        url: shareUrl
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareUrl);
      showSuccess('Room link copied for sharing!');
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    setRoomToDelete(roomId);
  };

  const confirmDeleteRoom = async () => {
    if (!roomToDelete) return;
    setIsDeleting(true);
    
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/cinema/rooms/${roomToDelete}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!response.ok) throw new Error('Failed to delete room');
      showSuccess("Room and all associated files deleted successfully");
      setRoomToDelete(null);
    } catch (err) {
      showError("Failed to delete room");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteTrailer = async (trailerId: string) => {
    if (!window.confirm("Are you sure you want to delete this trailer?")) return;
    try {
      setTrailers(prev => prev.filter(t => t.id !== trailerId));
      await deleteDoc(doc(db, 'cinema_trailers', trailerId));
      showSuccess("Trailer deleted successfully");
    } catch (err: any) {
      showError("Failed to delete trailer: " + (err.message || ''));
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
    if (costs.auracoin > userBalances.auracoin) {
      setInsufficientFunds({ show: true, type: 'auracoin', required: costs.auracoin });
      return;
    }
    if (costs.normal > userBalances.normal) {
      setInsufficientFunds({ show: true, type: 'normal', required: costs.normal });
      return;
    }
    if (costs.referral > userBalances.referral) {
      setInsufficientFunds({ show: true, type: 'referral', required: costs.referral });
      return;
    }

    // 2. Standard Validations (Only compulsory fields enforced)
    const hasCover = coverFile || preFilledCoverUrl;
    if (!roomName.trim() || !movieTitle.trim() || !hasCover || !movieGenre) {
      showError('Please fill all compulsory fields (Room Name, Movie Title, Genre, and Cover Poster).');
      return;
    }

    if (contentType === 'movie') {
      const hasMovie = movieFile || preFilledMovieUrl;
      if (!hasMovie) {
        showError('Please upload a movie video file or provide a stream URL.');
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

    if (!isLiveNow && (!scheduledDate || !scheduledTime)) {
      showError('Please select both scheduled date and time.');
      return;
    }

    if (!isUnlimited && roomType !== 'private') {
      const parsedCap = parseInt(limitedCapacity, 10);
      if (isNaN(parsedCap) || parsedCap < 1) {
        showError('Please enter a valid room capacity of at least 1 seat.');
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
        setUploadProgress(0);
        coverUrl = await uploadFile(coverFile, 'cinema/covers', 'assets', (p) => setUploadProgress(p));
      }
      
      // 2. Resolve Content (Movie or Series)
      let movieUrl = preFilledMovieUrl;
      let episodesData: any[] = [];

      if (contentType === 'movie') {
        if (movieFile) {
          setUploadProgress(0);
          movieUrl = await uploadFile(movieFile, 'cinema/movies', 'movies', (p) => setUploadProgress(p));
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
             setUploadProgress(0);
             showInfo(`Uploading Episode ${ep.number}...`);
             const epUrl = await uploadFile(ep.file, `cinema/series/${movieTitle}/ep${ep.number}`, 'movies', (p) => setUploadProgress(p));
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
        setUploadProgress(0);
        trailerUrl = await uploadFile(trailerFile, 'cinema/trailers', 'movies', (p) => setUploadProgress(p));
      }

      // 4. Prepare payload with optional movie metadata
      const payload = {
        room_name: roomName,
        room_type: roomType,
        content_type: contentType,
        movie_title: movieTitle,
        movie_cover_image: coverUrl,
        movie_file: contentType === 'movie' ? movieUrl : null,
        episodes: episodesData,
        trailer_url: trailerUrl,
        description: movieDescription || null,
        release_year: releaseYear.trim() || null,
        duration: runtime.trim() || null,
        age_rating: ageRating.trim() || null,
        director: director.trim() || null,
        cast: cast.trim() || null,
        tagline: tagline.trim() || null,
        max_seats: isUnlimited ? null : (roomType === 'private' ? Math.max(1, privateSeats) : Math.max(1, parseInt(limitedCapacity, 10) || 50)),
        category: movieGenre,
        scheduled_start_time: isLiveNow ? null : new Date(`${scheduledDate}T${scheduledTime}`).getTime(),
        text_chat_enabled: true,
        voice_enabled: roomType !== 'free',
        camera_enabled: roomType === 'private',
        ticket_price: roomType === 'paid' ? parseFloat(ticketPrice) : null,
        invite_only: roomType === 'private',
        private_guests: roomType === 'private' ? privateGuests.map(g => g.trim()).filter(Boolean) : [],
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
      closeCreateModal();

    } catch (err: any) {
      showError(err.message || 'Error creating room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setRoomName('');
    setMovieTitle('');
    setMovieGenre('');
    setMovieDescription('');
    setReleaseYear('');
    setRuntime('');
    setAgeRating('');
    setDirector('');
    setCast('');
    setTagline('');
    setTicketPrice('');
    setLimitedCapacity('50');
    setIsUnlimited(true);
    setIsLiveNow(true);
    setScheduledDate('');
    setScheduledTime('');
    setPrivateSeats(1);
    setPrivateGuests(['']);
    setMovieFile(null);
    setCoverFile(null);
    setTrailerFile(null);
    setPreFilledCoverUrl(null);
    setPreFilledMovieUrl(null);
    setEpisodes([{ number: 1, title: '', file: null }]);
    setPaymentWallet('normal');
    setPrivateWallet('normal');
    setInsufficientFunds(null);
    setContentType('movie');
    setRoomType('free');
    setUploadProgress(0);
    setIsAutoStartDropdownOpen(false);
    setIsGenreDropdownOpen(false);
  };

  const handleGoToWallet = () => {
    setInsufficientFunds(null);
    closeCreateModal();
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
    return (
      <CinemaLiveRoom
        roomId={activeRoom.id}
        roomData={activeRoom}
        onLeave={() => {
          setCinemaActive(null);
          setActiveRoom(null);
        }}
      />
    );
  }

  const closeCreateModal = () => {
    if (roomName.trim() || movieTitle.trim()) {
      logUserAction('room_creation_abandoned', 'cinema', { roomName, movieTitle }, auth.currentUser?.uid);
    }
    resetCreateForm();
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
          <Button variant="outline" onClick={handleBuySnacks} className="flex-1 md:flex-none h-10 gap-2 border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shadow-2xs">
            <ShoppingBag className="w-3.5 h-3.5" />
            Buy Snacks
          </Button>
          <Button variant="outline" onClick={handleMyTickets} className="flex-1 md:flex-none h-10 gap-2 border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shadow-2xs">
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
            {slides.length > 0 && slides[currentSlide] && (
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
            )}
            {slides.length === 0 && (
              <div className="absolute inset-0 bg-[#0a0a0a]" />
            )}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {activeTab === 'rooms' && rooms.map((room, idx) => (
          <motion.div
            key={room.id}
            whileHover={{ y: -4, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
            className="group relative cursor-pointer flex flex-col"
            onClick={() => handleOpenDoorEntrance(room)}
          >
            {/* Cinema Door Architectural Portal Card */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-[#1c120c] via-[#0d0d12] to-[#040406] border border-amber-500/30 p-2 sm:p-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.85)] group-hover:border-amber-400/70 group-hover:shadow-[0_0_25px_rgba(245,158,11,0.25)] transition-all duration-300 flex flex-col h-full">
              
              {/* Top Illuminated Marquee Screen Header */}
              <div className="relative mb-2 px-2 py-1 rounded-xl bg-gradient-to-r from-zinc-950 via-[#1a110a] to-zinc-950 border border-amber-500/20 flex items-center justify-between shadow-inner">
                {/* Screen Sign with Glowing Retro Bulb Vibe */}
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_#fbbf24]" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]">
                    HALL {(idx + 1).toString().padStart(2, '0')}
                  </span>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-1">
                  {room.status === 'live' ? (
                    <Badge className="bg-rose-600/90 hover:bg-rose-600 border border-rose-400/40 text-[8px] font-black tracking-wider gap-1 py-0 px-1.5 shadow-[0_0_8px_rgba(225,29,72,0.4)]">
                      <span className="w-1 h-1 rounded-full bg-white animate-ping inline-block" />
                      LIVE
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-300 text-[8px] font-black py-0 px-1.5">
                      UPCOMING
                    </Badge>
                  )}
                  {room.room_type === 'paid' && room.ticket_price && (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[8px] font-black py-0 px-1">
                      ₦{room.ticket_price}
                    </Badge>
                  )}
                  {room.room_type === 'private' && (
                    <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[8px] font-black py-0 px-1">
                      Priv
                    </Badge>
                  )}
                </div>
              </div>

              {/* The Cinema Double Doors & Poster Centerpiece (Flyer 2/3 ratio) */}
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-black border border-amber-500/20 shadow-xl group/door">
                {/* Poster Artwork with glass reflections */}
                <img 
                  src={room.movie_cover_image} 
                  alt={room.movie_title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 filter brightness-[0.92] group-hover:brightness-100" 
                />

                {/* Cinema Door Glass Overlay & Shadow Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/10 pointer-events-none" />
                
                {/* Top Corner Transom Light Glow */}
                <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-amber-400/15 via-transparent to-transparent pointer-events-none" />

                {/* Left & Right Door Vertical Split Seam with Brass Trim */}
                <div className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-gradient-to-b from-amber-500/50 via-amber-400/30 to-amber-600/50 pointer-events-none shadow-[0_0_3px_rgba(0,0,0,0.9)]" />

                {/* Twin Brass Door Handles in the Center */}
                <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none z-10">
                  {/* Left Door Handle */}
                  <div className="w-1 h-8 sm:h-10 rounded-full bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 border border-amber-100/40 shadow-[0_0_8px_rgba(251,191,36,0.6)] group-hover:scale-110 transition-transform" />
                  {/* Right Door Handle */}
                  <div className="w-1 h-8 sm:h-10 rounded-full bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 border border-amber-100/40 shadow-[0_0_8px_rgba(251,191,36,0.6)] group-hover:scale-110 transition-transform" />
                </div>

                {/* Quick Action Overlay (Share & Delete) */}
                <div className="absolute top-2 right-2 flex gap-1 z-20">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleShareRoom(room); }}
                    className="p-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white/90 hover:bg-primary hover:text-white transition-all shadow-md"
                    title="Share Room"
                  >
                    <Share2 className="w-3 h-3" />
                  </button>
                  {(isAdmin || room.host_uid === auth.currentUser?.uid) && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room.id); }}
                      className="p-1 rounded-full bg-rose-500/30 backdrop-blur-md border border-rose-500/40 text-rose-400 hover:bg-rose-600 hover:text-white transition-all shadow-md"
                      title="Delete Room & Files"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Bottom Center Prompt on Door */}
                <div className="absolute bottom-2 inset-x-2 flex items-center justify-between z-10 pointer-events-none">
                  <div className="flex items-center gap-1 text-white/90 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-amber-500/30 shadow-md">
                    <Users className="w-2.5 h-2.5 text-amber-400" />
                    <span className="text-[9px] font-black text-amber-200">{room.active_viewers || 0}</span>
                  </div>
                  <div className="flex items-center gap-1 bg-amber-500/20 backdrop-blur-md border border-amber-500/40 text-amber-300 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider shadow-md">
                    <DoorOpen className="w-2.5 h-2.5 text-amber-400" />
                    <span>Open</span>
                  </div>
                </div>
              </div>

              {/* Lower Theater Plaque / Movie Identity */}
              <div className="mt-2 space-y-1.5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-black text-xs sm:text-sm leading-snug text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                    {room.movie_title || room.room_name}
                  </h3>
                  <p className="text-[10px] text-muted-foreground font-medium truncate flex items-center gap-1 mt-0.5">
                    <span className="w-1 h-1 rounded-full bg-primary/80 shrink-0" />
                    <span className="truncate">{room.room_name}</span>
                  </p>
                </div>

                {/* Smart Metadata Highlights (Only rendered if present) */}
                {(room.release_year || room.year || room.age_rating || room.duration || room.category || room.content_type === 'series') && (
                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                    {(room.release_year || room.year) && (
                      <span className="px-1.5 py-0.2 rounded bg-white/10 text-white/90 text-[8px] sm:text-[9px] font-bold">
                        {room.release_year || room.year}
                      </span>
                    )}
                    {room.age_rating && (
                      <span className="px-1 py-0.2 rounded border border-white/20 text-white/80 text-[8px] sm:text-[9px] font-black uppercase">
                        {room.age_rating}
                      </span>
                    )}
                    {room.duration && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[8px] sm:text-[9px] font-bold">
                        <Clock className="w-2 h-2" />
                        {room.duration}
                      </span>
                    )}
                    {room.content_type === 'series' && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] sm:text-[9px] font-bold">
                        Series
                      </span>
                    )}
                  </div>
                )}

                {/* Enter Door Action Button */}
                <div className="pt-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleOpenDoorEntrance(room); }}
                    className="w-full py-1.5 sm:py-2 px-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-amber-500/20 border border-amber-500/40 text-amber-300 hover:text-black hover:bg-amber-400 font-black text-[9px] sm:text-[10px] tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all shadow-md group-hover:scale-[1.02]"
                  >
                    <DoorOpen className="w-3.5 h-3.5" />
                    <span>Enter Door</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

            </div>
          </motion.div>
        ))}

        {activeTab === 'trailers' && trailers.map(trailer => (
          <motion.div
            key={trailer.id}
            whileHover={{ y: -4, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
            className="group relative flex flex-col"
          >
            <Card className="overflow-hidden glass-card border-white/5 h-full flex flex-col p-2 sm:p-2.5 rounded-2xl">
              <div 
                className="relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer"
                onClick={() => setSelectedTrailer(trailer)}
              >
                <img 
                  src={trailer.thumbnail} 
                  alt={trailer.title || trailer.movie_title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                
                {/* Category & Trailer Badges */}
                <div className="absolute top-2 left-2 flex items-center gap-1 flex-wrap z-10">
                  <Badge className="bg-blue-600 hover:bg-blue-600 border-none font-black text-[8px] tracking-wider uppercase shadow-md py-0 px-1.5">
                    TRAILER
                  </Badge>
                  {trailer.category && (
                    <Badge variant="outline" className="bg-black/60 backdrop-blur-md border-white/20 text-[8px] font-bold uppercase tracking-wider text-white py-0 px-1.5">
                      {trailer.category}
                    </Badge>
                  )}
                </div>

                {/* Top Right Action Icons */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                   <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (navigator.share) {
                        navigator.share({ title: trailer.title || trailer.movie_title, text: `Watch trailer for ${trailer.title || trailer.movie_title} on StreamAura`, url: window.location.href });
                      } else {
                        navigator.clipboard.writeText(trailer.videoUrl);
                        showSuccess("Trailer link copied!");
                      }
                    }}
                    className="p-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-primary transition-all"
                    title="Share Trailer"
                   >
                     <Share2 className="w-3 h-3" />
                   </button>
                   {(isAdmin || trailer.host_uid === auth.currentUser?.uid) && (
                     <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteTrailer(trailer.id); }}
                      className="p-1 rounded-full bg-rose-500/20 backdrop-blur-md border border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                      title="Delete Trailer"
                     >
                       <Trash2 className="w-3 h-3" />
                     </button>
                   )}
                </div>

                {/* Play Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-blue-600/90 text-white backdrop-blur-md flex items-center justify-center border border-white/30 shadow-xl group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 fill-current translate-x-0.5" />
                  </div>
                </div>
              </div>

              {/* Movie Details Section */}
              <div className="pt-2 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-black text-xs sm:text-sm leading-snug line-clamp-1 text-white">{trailer.title || trailer.movie_title}</h3>
                  {trailer.host_name && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">by {trailer.host_name}</p>
                  )}
                </div>

                {/* Footer Controls: Watch Preview & Join Room */}
                <div className="pt-2 mt-auto border-t border-white/5 flex items-center justify-between gap-1.5">
                  <Button 
                    onClick={() => setSelectedTrailer(trailer)} 
                    size="sm" 
                    variant="outline"
                    className="w-full rounded-xl py-1 px-2 h-7 text-[9px] sm:text-[10px] font-bold border-white/10 hover:bg-white/10 flex items-center justify-center gap-1"
                  >
                    <Play className="w-2.5 h-2.5 fill-current text-blue-400" />
                    Preview
                  </Button>

                  {trailer.roomId && rooms.some(r => r.id === trailer.roomId) && (
                    <Button 
                      onClick={() => handleJoinRoomById(trailer.roomId)} 
                      size="sm" 
                      className="rounded-xl py-1 px-2.5 h-7 text-[9px] sm:text-[10px] font-bold gradient-bg shadow-md flex items-center justify-center gap-1 shrink-0"
                    >
                      <Tv className="w-2.5 h-2.5" />
                      Join
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        ))}

        {activeTab === 'schedule' && upcoming.map(item => (
          <motion.div
            key={item.id}
            whileHover={{ y: -4, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
            className="group relative flex flex-col"
          >
            <Card className="overflow-hidden glass-card border-white/5 h-full flex flex-col p-2 sm:p-2.5 rounded-2xl">
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden">
                <img 
                  src={item.poster} 
                  alt={item.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                <div className="absolute top-2 right-2">
                   <Badge className="bg-emerald-600 hover:bg-emerald-600 border-none font-black text-[8px] tracking-wider shadow-md py-0 px-1.5">
                     COMING SOON
                   </Badge>
                </div>
                {item.trailerUrl && (
                  <button 
                    onClick={() => setSelectedTrailer({
                      id: item.id,
                      title: item.title,
                      movie_title: item.title,
                      description: item.description,
                      thumbnail: item.poster,
                      videoUrl: item.trailerUrl,
                      trailer_url: item.trailerUrl,
                      release_year: item.release_year || item.year,
                      age_rating: item.age_rating,
                      duration: item.duration,
                      director: item.director,
                      cast: item.cast,
                      tagline: item.tagline,
                      category: item.category || 'Coming Soon'
                    })}
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-600/80 backdrop-blur-md flex items-center justify-center border border-white/20 hover:scale-110 transition-transform">
                      <Video className="w-4 h-4 text-white" />
                    </div>
                  </button>
                )}
              </div>
              
              <div className="pt-2 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-black text-xs sm:text-sm leading-snug line-clamp-1 uppercase text-white">{item.title}</h3>
                  <p className="text-[9px] text-emerald-400 font-bold uppercase mt-0.5">
                    {item.releaseDate || item.release_year || 'Coming Soon'}
                  </p>
                </div>

                <div className="pt-2 mt-auto border-t border-white/5 flex items-center justify-between">
                  <Button variant="outline" className="w-full rounded-xl border-white/10 hover:bg-white/5 h-7 text-[9px] sm:text-[10px] font-black uppercase">
                    Notify Me
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}

        {((activeTab === 'rooms' && rooms.length === 0) || (activeTab === 'trailers' && trailers.length === 0) || (activeTab === 'schedule' && upcoming.length === 0)) && (
          <div className="col-span-full py-20 text-center">
            <div className="w-24 h-24 rounded-3xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto mb-6 shadow-inner opacity-40">
              {activeTab === 'rooms' ? (
                <DoorOpen className="w-10 h-10 text-muted-foreground" />
              ) : activeTab === 'trailers' ? (
                <Video className="w-10 h-10 text-muted-foreground" />
              ) : (
                <Calendar className="w-10 h-10 text-muted-foreground" />
              )}
            </div>
            <h3 className="text-xl font-black opacity-60">
              No {activeTab === 'rooms' ? 'active rooms' : activeTab === 'trailers' ? 'trailers' : 'upcoming screenings'} found
            </h3>
            <p className="text-muted-foreground mt-2 font-medium max-w-sm mx-auto opacity-50">
              {activeTab === 'rooms' ? 'Create a room to host a watch party or check back soon.' : 'Check back soon for new theater content.'}
            </p>
            {activeTab === 'rooms' && (
              <div className="pt-6">
                <Button 
                  onClick={handleOpenCreateModal} 
                  className="rounded-2xl px-6 py-5 font-black uppercase text-xs tracking-wider gradient-bg shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Host A Cinema Room
                </Button>
              </div>
            )}
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
                                <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-3">
                                   <div>
                                      <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Episode Hosting Cost</p>
                                      <p className="text-xl font-black text-white flex items-center gap-1.5 mt-1">
                                        {paymentWallet === 'auracoin' ? (
                                          <>
                                            <AuraCoinIcon size="sm" className="w-5 h-5 text-amber-400" />
                                            <span className="text-amber-400">{(episodes.length * 50).toLocaleString()}</span>
                                            <span className="text-xs font-bold text-amber-300/80 uppercase">AuraCoins</span>
                                          </>
                                        ) : (
                                          `₦${(episodes.length * 50).toLocaleString()}`
                                        )}
                                      </p>
                                   </div>
                                   <div className="flex flex-col gap-1.5 w-full sm:max-w-[270px]">
                                      <div className="flex justify-between items-center text-[8px] font-black text-muted-foreground uppercase">
                                        <span>Pay Episodes With</span>
                                        <span className="text-white/70">
                                          {paymentWallet === 'auracoin' 
                                            ? `Bal: ${userBalances.auracoin.toLocaleString()} 🪙` 
                                            : paymentWallet === 'referral' 
                                            ? `Bal: ₦${userBalances.referral.toLocaleString()}` 
                                            : `Bal: ₦${userBalances.normal.toLocaleString()}`}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 p-1 bg-black/40 rounded-lg border border-white/5 gap-1">
                                         <button 
                                          type="button" 
                                          onClick={() => setPaymentWallet('auracoin')}
                                          className={`py-1.5 px-2 rounded text-[8px] font-black transition-all flex items-center justify-center gap-1 ${
                                            paymentWallet === 'auracoin' 
                                              ? 'bg-amber-500 text-black shadow-lg font-black' 
                                              : 'text-muted-foreground hover:text-white'
                                          }`}
                                         >
                                           <AuraCoinIcon size="xs" className="w-3 h-3" />
                                           50 🪙
                                         </button>
                                         <button 
                                          type="button" 
                                          onClick={() => setPaymentWallet('normal')}
                                          className={`py-1.5 px-2 rounded text-[8px] font-black transition-all ${
                                            paymentWallet === 'normal' 
                                              ? 'bg-primary text-white shadow-lg' 
                                              : 'text-muted-foreground hover:text-white'
                                          }`}
                                         >
                                           ₦50 CASH
                                         </button>
                                         <button 
                                          type="button" 
                                          onClick={() => setPaymentWallet('referral')}
                                          className={`py-1.5 px-2 rounded text-[8px] font-black transition-all ${
                                            paymentWallet === 'referral' 
                                              ? 'bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-lg shadow-orange-500/25' 
                                              : 'text-muted-foreground hover:text-white'
                                          }`}
                                         >
                                           ₦50 REF
                                         </button>
                                      </div>
                                   </div>
                                </div>
                                <p className="text-[9px] text-muted-foreground leading-relaxed">
                                  {paymentWallet === 'auracoin' 
                                    ? "50 AuraCoins per episode. Use your AuraCoin rewards to host and watch series episodes with friends!" 
                                    : "₦50 per episode. Paid via Room Wallet balance or Referral earnings."}
                                </p>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Room & Movie Details */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                          <span>Room Name</span>
                          <span className="text-[9px] text-rose-500 font-bold uppercase">Required</span>
                        </label>
                        <input type="text" required value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="e.g. Midnight Watch Party" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-primary/50 text-white" />
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
                      {/* Additional Movie Metadata (Optional) */}
                      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary/90">Additional Movie Info</span>
                          <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest">Optional</span>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Release Year</label>
                            <input 
                              type="text" 
                              value={releaseYear} 
                              onChange={e => setReleaseYear(e.target.value)} 
                              placeholder="e.g. 2024" 
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/40" 
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Runtime / Duration</label>
                            <input 
                              type="text" 
                              value={runtime} 
                              onChange={e => setRuntime(e.target.value)} 
                              placeholder="e.g. 2h 15m" 
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/40" 
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Age Rating</label>
                            <input 
                              type="text" 
                              value={ageRating} 
                              onChange={e => setAgeRating(e.target.value)} 
                              placeholder="e.g. PG-13, 18+" 
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/40" 
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Director / Creator</label>
                            <input 
                              type="text" 
                              value={director} 
                              onChange={e => setDirector(e.target.value)} 
                              placeholder="e.g. Christopher Nolan" 
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/40" 
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Cast / Starring</label>
                            <input 
                              type="text" 
                              value={cast} 
                              onChange={e => setCast(e.target.value)} 
                              placeholder="e.g. Cillian Murphy, Emily Blunt" 
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/40" 
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Movie Tagline</label>
                          <input 
                            type="text" 
                            value={tagline} 
                            onChange={e => setTagline(e.target.value)} 
                            placeholder="e.g. The world forever changes" 
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/40" 
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Description / Synopsis</label>
                          <textarea 
                            value={movieDescription} 
                            onChange={e => setMovieDescription(e.target.value)} 
                            rows={3} 
                            placeholder="What is this movie or screening about? (Optional)" 
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs outline-none focus:border-primary/50 resize-none text-white placeholder:text-muted-foreground/40" 
                          />
                        </div>
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
                            <input 
                              type="number" 
                              min="1"
                              step="1"
                              value={limitedCapacity}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  setLimitedCapacity('');
                                } else {
                                  const parsed = parseInt(val, 10);
                                  if (!isNaN(parsed)) {
                                    setLimitedCapacity(Math.max(1, parsed).toString());
                                  }
                                }
                              }}
                              onKeyDown={(e) => {
                                if (['-', 'e', '+', '.', 'E'].includes(e.key)) {
                                  e.preventDefault();
                                }
                              }}
                              placeholder="Seats (e.g. 50)" 
                              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-3 pr-10 text-xs outline-none focus:border-primary/50 font-black text-white" 
                            />
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
                                 <input 
                                   type="number" 
                                   min="0"
                                   step="any"
                                   required={roomType === 'paid'} 
                                   value={ticketPrice} 
                                   onChange={e => {
                                     const val = e.target.value;
                                     if (val === '' || parseFloat(val) >= 0) {
                                       setTicketPrice(val);
                                     }
                                   }}
                                   onKeyDown={(e) => {
                                     if (['-', 'e', '+', 'E'].includes(e.key)) {
                                       e.preventDefault();
                                     }
                                   }}
                                   placeholder="0.00" 
                                   className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-9 pr-4 text-sm font-bold outline-none focus:border-primary/50" 
                                 />
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
                                    {privateWallet === 'auracoin' ? (
                                      <p className="text-2xl font-black text-amber-400 flex items-center justify-start md:justify-end gap-1.5">
                                        <AuraCoinIcon size="sm" className="w-5 h-5" />
                                        {(privateSeats * 2500).toLocaleString()}
                                      </p>
                                    ) : (
                                      <p className="text-2xl font-black text-white">₦{(privateSeats * (privateWallet === 'referral' ? 2500 : 1000)).toLocaleString()}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-amber-500/20 relative z-10">
                                   <div className="flex justify-between items-center">
                                      <label className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                                        Seats ({privateWallet === 'auracoin' ? '2.5k Coins' : privateWallet === 'referral' ? '₦2.5k' : '₦1k'}/seat)
                                      </label>
                                      
                                      <div className="flex flex-col gap-1.5 w-7/12">
                                         <p className="text-[8px] font-black text-amber-500/60 uppercase text-right">Pay Seats With</p>
                                         <div className="flex p-1 bg-black/40 rounded-lg border border-white/5 gap-1">
                                            <button 
                                              type="button" 
                                              onClick={() => setPrivateWallet('normal')}
                                              className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${privateWallet === 'normal' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}
                                            >
                                              MAIN
                                            </button>
                                            <button 
                                              type="button" 
                                              onClick={() => setPrivateWallet('referral')}
                                              className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${privateWallet === 'referral' ? 'bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}
                                            >
                                              REF
                                            </button>
                                            <button 
                                              type="button" 
                                              onClick={() => setPrivateWallet('auracoin')}
                                              className={`flex-1 py-1 rounded text-[8px] font-black transition-all flex items-center justify-center gap-0.5 ${privateWallet === 'auracoin' ? 'bg-amber-500 text-black shadow-lg font-black' : 'text-muted-foreground hover:text-white'}`}
                                            >
                                              <AuraCoinIcon size="xs" className="w-2.5 h-2.5" />
                                              COIN
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
                       <Button type="button" variant="ghost" onClick={closeCreateModal} disabled={isSubmitting}>Cancel</Button>
                       <Button type="submit" disabled={isSubmitting} className="gradient-bg px-8 font-black gap-2 disabled:opacity-50 min-w-[200px]">
                         {isSubmitting ? (
                           <div className="flex flex-col items-center justify-center gap-1">
                             <div className="flex items-center gap-2">
                               <Loader2 className="w-4 h-4 animate-spin" />
                               <span>{uploadProgress > 0 ? `Uploading ${uploadProgress}%` : 'Processing...'}</span>
                             </div>
                             {uploadProgress > 0 && (
                               <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mt-1">
                                 <motion.div 
                                   initial={{ width: 0 }}
                                   animate={{ width: `${uploadProgress}%` }}
                                   className="h-full bg-white"
                                 />
                               </div>
                             )}
                           </div>
                         ) : (
                           <>
                             {calculateTotalCost().total > 0
                               ? (paymentWallet === 'auracoin' && contentType === 'series'
                                   ? `Pay ${calculateTotalCost().auracoin.toLocaleString()} 🪙 & Create`
                                   : `Pay ₦${calculateTotalCost().total.toLocaleString()} & Create`)
                               : 'Create Room'}
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

      {/* Custom Delete Confirmation Modal */}
      {roomToDelete && createPortal(
        <div 
          onClick={() => !isDeleting && setRoomToDelete(null)}
          className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md font-sans cursor-pointer"
        >
           <motion.div 
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0, y: 20 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            className="glass-card max-w-sm w-full p-8 text-center space-y-6 border-white/10 shadow-2xl cursor-default"
           >
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto border border-rose-500/20">
                 <Trash2 className="text-rose-500 w-8 h-8" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase text-white tracking-tighter">Delete Cinema Room?</h3>
                 <p className="text-xs text-muted-foreground font-medium uppercase leading-relaxed tracking-wider">
                   This will permanently remove the room and delete all associated media files from storage. This action cannot be undone.
                 </p>
              </div>
              <div className="flex flex-col gap-3">
                 <Button 
                   onClick={confirmDeleteRoom} 
                   disabled={isDeleting}
                   className="w-full bg-rose-600 hover:bg-rose-500 text-white h-12 font-black uppercase text-[10px] shadow-lg shadow-rose-600/20"
                 >
                   {isDeleting ? (
                     <>
                       <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                       Deleting...
                     </>
                   ) : (
                     'Confirm Deletion'
                   )}
                 </Button>
                 <Button 
                   variant="ghost" 
                   disabled={isDeleting}
                   onClick={() => setRoomToDelete(null)} 
                   className="w-full h-11 text-[10px] font-black uppercase border border-white/5 hover:bg-white/5"
                 >
                   Cancel
                 </Button>
              </div>
           </motion.div>
        </div>, 
        document.body
      )}

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
                   {insufficientFunds.type === 'referral'
                     ? 'Referral Balance Low'
                     : insufficientFunds.type === 'auracoin'
                     ? 'AuraCoins Balance Low'
                     : 'Wallet Balance Low'}
                 </h3>
                  <p className="text-xs text-muted-foreground font-medium uppercase leading-relaxed tracking-wider">
                     {insufficientFunds.type === 'referral'
                       ? "You don't have enough referral earnings. Refer more friends to earn sales commissions or pay with your main wallet balance."
                       : insufficientFunds.type === 'auracoin'
                       ? `You need ${insufficientFunds.required.toLocaleString()} AuraCoins (50 AuraCoins per episode) to host/watch this series. Win AuraCoins in Game Rooms or pay with Cash.`
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

      {/* Trailer Video Player Modal */}
      {selectedTrailer && typeof document !== 'undefined' && createPortal(
        <div 
          onClick={() => setSelectedTrailer(null)}
          className="fixed inset-0 z-[5000] flex items-center justify-center p-3 sm:p-4 md:p-8 bg-black/90 backdrop-blur-xl font-sans"
        >
          <motion.div 
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            className="w-full max-w-4xl bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="p-4 md:p-5 border-b border-white/10 flex items-center justify-between bg-zinc-900/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <Film className="w-5 h-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">Official Trailer</span>
                    {selectedTrailer.category && (
                      <Badge variant="outline" className="text-[8px] py-0 px-1.5 uppercase font-bold text-white/60 border-white/10">
                        {selectedTrailer.category}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-base md:text-lg font-black text-white truncate">{selectedTrailer.title || selectedTrailer.movie_title}</h3>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTrailer(null)}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors shrink-0 ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player Container */}
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {isLoadingTrailerVideo ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20 gap-3">
                  <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                  <span className="text-xs font-black uppercase tracking-widest text-white/70">Connecting Cinema Stream...</span>
                </div>
              ) : trailerPlayerMode === 'embed' && trailerEmbedUrl ? (
                <div className="relative w-full h-full">
                  <iframe 
                    key={trailerEmbedUrl}
                    src={trailerEmbedUrl} 
                    title={selectedTrailer.title || selectedTrailer.movie_title || 'Official Trailer'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full border-0"
                    onLoad={() => setIsTrailerBuffering(false)}
                  />
                  {isTrailerBuffering && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20 gap-3">
                      <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                      <span className="text-xs font-black uppercase tracking-widest text-white/70">Loading Trailer...</span>
                    </div>
                  )}
                  {/* StreamAura Cinema Overlay Badge */}
                  <div className="absolute bottom-3 right-3 z-30 pointer-events-none flex items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-lg">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[10px] font-black tracking-widest uppercase text-white/90">StreamAura Cinema</span>
                  </div>
                </div>
              ) : resolvedTrailerUrl ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <video 
                    key={resolvedTrailerUrl}
                    src={resolvedTrailerUrl} 
                    controls 
                    autoPlay 
                    playsInline
                    className="w-full h-full object-contain"
                    onWaiting={() => setIsTrailerBuffering(true)}
                    onPlaying={() => setIsTrailerBuffering(false)}
                    onCanPlay={() => setIsTrailerBuffering(false)}
                    onError={(e) => {
                      console.error("Trailer video playback error:", e);
                      const rawUrl = (
                        selectedTrailer.videoUrl || 
                        selectedTrailer.trailer_url || 
                        selectedTrailer.trailerUrl || 
                        selectedTrailer.streamUrl || 
                        selectedTrailer.stream_url || 
                        selectedTrailer.url || 
                        ''
                      ).trim();

                      // If this is an uploaded trailer / custom file, do NOT switch to YouTube on error
                      if (rawUrl && !rawUrl.includes('youtube.com') && !rawUrl.includes('youtu.be')) {
                        setTrailerPlayError('Unable to load uploaded trailer stream. Please try again.');
                        return;
                      }

                      const movieTitle = selectedTrailer.title || selectedTrailer.movie_title;
                      if (movieTitle && !trailerEmbedUrl) {
                        mediaApi.getMovieTrailer(movieTitle).then(res => {
                          if (res.success && res.data) {
                            const yKey = res.data.youtubeKey || res.data.key;
                            if (res.data.embedUrl || yKey) {
                              setTrailerEmbedUrl(res.data.embedUrl || `https://www.youtube-nocookie.com/embed/${yKey}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`);
                              setTrailerPlayerMode('embed');
                              return;
                            }
                          }
                          setTrailerPlayError('Unable to load video format. Please try again.');
                        }).catch(() => {
                          setTrailerPlayError('Unable to load video format. Please try again.');
                        });
                      } else {
                        setTrailerPlayError('Unable to load video format. Please try again.');
                      }
                    }}
                  />
                  {isTrailerBuffering && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black z-10 gap-3">
                      <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                      <span className="text-xs font-black uppercase tracking-widest text-white/70">Connecting Cinema Stream...</span>
                    </div>
                  )}
                  {/* StreamAura Cinema Watermark Overlay */}
                  <div className="absolute top-3 left-3 z-30 pointer-events-none flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                    <Film className="w-3 h-3 text-blue-400" />
                    <span className="text-[9px] font-black tracking-widest uppercase text-white/90">Cinema Trailer</span>
                  </div>
                </div>
              ) : trailerPlayError ? (
                <div className="p-8 text-center space-y-3 z-10">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
                    <Video className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-white/80">{trailerPlayError}</p>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="rounded-xl border-white/10 text-xs font-bold"
                    onClick={() => {
                      const t = selectedTrailer;
                      setSelectedTrailer(null);
                      setTimeout(() => setSelectedTrailer(t), 100);
                    }}
                  >
                    Retry Preview
                  </Button>
                </div>
              ) : (
                <div className="p-8 text-center space-y-2">
                  <p className="text-sm font-bold text-white/60">No trailer stream available</p>
                </div>
              )}
            </div>

            {/* Trailer Details & Actions Footer */}
            <div className="p-5 md:p-6 bg-zinc-900/80 border-t border-white/5 space-y-4 overflow-y-auto">
              {/* Smart Metadata Badges */}
              {(selectedTrailer.release_year || selectedTrailer.year || selectedTrailer.age_rating || selectedTrailer.category) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {(selectedTrailer.release_year || selectedTrailer.year) && (
                    <span className="px-2.5 py-0.5 rounded-md bg-white/10 text-white/90 text-[11px] font-bold">
                      {selectedTrailer.release_year || selectedTrailer.year}
                    </span>
                  )}
                  {selectedTrailer.age_rating && (
                    <span className="px-2 py-0.5 rounded border border-white/20 text-white/80 text-[11px] font-black uppercase">
                      {selectedTrailer.age_rating}
                    </span>
                  )}
                  {selectedTrailer.category && (
                    <span className="px-2.5 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[11px] font-bold">
                      {selectedTrailer.category}
                    </span>
                  )}
                </div>
              )}

              {/* Smart Tagline */}
              {selectedTrailer.tagline && (
                <p className="text-xs md:text-sm italic text-white/80 border-l-2 border-primary/60 pl-3">
                  "{selectedTrailer.tagline}"
                </p>
              )}

              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white/50">Movie Overview</h4>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                    {selectedTrailer.description || `Official preview for ${selectedTrailer.title || selectedTrailer.movie_title}. Join the live theater room to watch together.`}
                  </p>

                  {/* Smart Director & Cast */}
                  {(selectedTrailer.director || selectedTrailer.cast) && (
                    <div className="space-y-1 pt-2 border-t border-white/5 text-xs">
                      {selectedTrailer.director && (
                        <div className="flex items-center gap-1.5 text-white/60">
                          <span className="text-[10px] font-black uppercase tracking-wider text-white/40">Director:</span>
                          <span className="text-white/90 font-medium">{selectedTrailer.director}</span>
                        </div>
                      )}
                      {selectedTrailer.cast && (
                        <div className="flex items-center gap-1.5 text-white/60">
                          <span className="text-[10px] font-black uppercase tracking-wider text-white/40">Cast:</span>
                          <span className="text-white/90 font-medium">{selectedTrailer.cast}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedTrailer.host_name && (
                    <p className="text-[11px] font-medium text-white/40 pt-1">
                      Cinema room hosted by <span className="text-white/80 font-bold">{selectedTrailer.host_name}</span>
                    </p>
                  )}
                </div>

                {selectedTrailer.roomId && rooms.some(r => r.id === selectedTrailer.roomId) && (
                  <Button 
                    onClick={() => {
                      const rId = selectedTrailer.roomId;
                      setSelectedTrailer(null);
                      handleJoinRoomById(rId);
                    }}
                    className="gradient-bg rounded-2xl px-6 py-6 font-black uppercase text-xs tracking-wider shadow-xl shadow-primary/20 shrink-0 flex items-center gap-2 hover:scale-105 transition-transform"
                  >
                    <Tv className="w-4 h-4" />
                    Enter Cinema Room Now
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Cinema Door Curtain-Opening Entrance Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedDoorRoom && (
            <div className="fixed inset-0 z-[2500] flex items-center justify-center overflow-hidden bg-black select-none">
              
              {/* Grand Velvet Theater Curtains (Left & Right) */}
              {/* Left Velvet Curtain */}
              <motion.div
                key="door-curtain-left"
                initial={{ x: 0 }}
                animate={{ x: isDoorCurtainsOpen ? '-100%' : 0 }}
                exit={{ x: 0 }}
                transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-y-0 left-0 w-1/2 z-40 bg-gradient-to-r from-[#180206] via-[#450a15] to-[#250308] border-r-2 border-amber-500/40 shadow-[25px_0_50px_rgba(0,0,0,0.9)] flex items-center justify-end"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 35px, rgba(0,0,0,0.5) 36px, rgba(0,0,0,0.5) 70px)',
                  backgroundSize: '70px 100%'
                }}
              >
                {/* Velvet Drape Highlight & Golden Fringe Edge */}
                <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-black/60 pointer-events-none" />
                <div className="h-full w-2.5 bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 shadow-[0_0_15px_rgba(245,158,11,0.6)]" />
              </motion.div>

              {/* Right Velvet Curtain */}
              <motion.div
                key="door-curtain-right"
                initial={{ x: 0 }}
                animate={{ x: isDoorCurtainsOpen ? '100%' : 0 }}
                exit={{ x: 0 }}
                transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-y-0 right-0 w-1/2 z-40 bg-gradient-to-r from-[#250308] via-[#450a15] to-[#180206] border-l-2 border-amber-500/40 shadow-[-25px_0_50px_rgba(0,0,0,0.9)] flex items-center justify-start"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 35px, rgba(0,0,0,0.5) 36px, rgba(0,0,0,0.5) 70px)',
                  backgroundSize: '70px 100%'
                }}
              >
                {/* Velvet Drape Highlight & Golden Fringe Edge */}
                <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-black/60 pointer-events-none" />
                <div className="h-full w-2.5 bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 shadow-[0_0_15px_rgba(245,158,11,0.6)]" />
              </motion.div>

              {/* Ambient Theater Light Cone */}
              <div className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/15 via-black/80 to-black" />

              {/* The Revealed Cinema Foyer & Screening Lounge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: isDoorCurtainsOpen ? 1 : 0, scale: isDoorCurtainsOpen ? 1 : 0.94 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ delay: 0.25, duration: 0.65, ease: "easeOut" }}
                className="relative z-30 w-full max-w-5xl h-full max-h-[92vh] mx-auto p-4 md:p-6 flex flex-col"
              >
                {/* Cinema Lounge Card */}
                <div className="relative w-full h-full rounded-[2rem] bg-gradient-to-b from-zinc-900/95 via-black/95 to-zinc-950/95 border border-amber-500/30 shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col backdrop-blur-2xl">
                  
                  {/* Atmospheric Backdrop Poster Blur */}
                  <div className="absolute inset-0 z-0 opacity-20 pointer-events-none overflow-hidden">
                    <img 
                      src={selectedDoorRoom.movie_cover_image} 
                      alt="" 
                      className="w-full h-full object-cover filter blur-3xl scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
                  </div>

                  {/* Top Bar: Screen Marquee & Close Controls */}
                  <div className="relative z-10 px-6 py-4 border-b border-amber-500/20 bg-black/40 backdrop-blur-md flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                        <Clapperboard className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black tracking-[0.25em] uppercase text-amber-400">
                            HALL {(rooms.findIndex(r => r.id === selectedDoorRoom.id) + 1 || 1).toString().padStart(2, '0')}
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span className="text-[10px] font-bold text-white/60 uppercase">The Grand Theater</span>
                        </div>
                        <h2 className="text-lg md:text-xl font-black uppercase tracking-tight text-white line-clamp-1">
                          {selectedDoorRoom.room_name}
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCloseDoorEntrance}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-xs transition-all"
                      >
                        <X className="w-4 h-4" />
                        <span className="hidden sm:inline">Back to Lobby</span>
                      </button>
                    </div>
                  </div>

                  {/* Modal Content: Two-Column Showcase */}
                  <div className="relative z-10 flex-1 overflow-y-auto p-5 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-center">
                    
                    {/* Left Column: Framed Movie Poster Showcase */}
                    <div className="md:col-span-5 flex flex-col items-center">
                      <div className="relative w-full max-w-[280px] md:max-w-[320px] aspect-[2/3] rounded-2xl overflow-hidden border-2 border-amber-500/40 shadow-[0_15px_45px_rgba(245,158,11,0.2)] group">
                        <img 
                          src={selectedDoorRoom.movie_cover_image} 
                          alt={selectedDoorRoom.movie_title}
                          className="w-full h-full object-cover" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
                        
                        {/* Status Beacon on Poster */}
                        <div className="absolute top-3 left-3 flex gap-2">
                          {selectedDoorRoom.status === 'live' ? (
                            <Badge className="bg-rose-600 hover:bg-rose-600 border border-rose-300 text-[10px] font-black tracking-widest gap-1.5 shadow-lg shadow-rose-600/40">
                              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                              LIVE
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/20 border-amber-400 text-amber-300 text-[10px] font-black tracking-widest">
                              UPCOMING
                            </Badge>
                          )}
                        </div>

                        {/* Ticket Badge */}
                        <div className="absolute top-3 right-3">
                          {selectedDoorRoom.room_type === 'paid' && selectedDoorRoom.ticket_price ? (
                            <Badge className="bg-emerald-500 text-black font-black text-xs px-2.5 py-0.5 shadow-lg">
                              ₦{selectedDoorRoom.ticket_price}
                            </Badge>
                          ) : selectedDoorRoom.room_type === 'private' ? (
                            <Badge className="bg-purple-600 text-white font-black text-xs px-2.5 py-0.5 shadow-lg">
                              Private Room
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-400 text-black font-black text-[10px] uppercase px-2 py-0.5 shadow-lg">
                              Free Access
                            </Badge>
                          )}
                        </div>

                        {/* Audience overlay at bottom of poster */}
                        <div className="absolute bottom-3 inset-x-3 flex items-center justify-between text-xs bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                          <div className="flex items-center gap-1.5 text-white/90">
                            <Users className="w-4 h-4 text-amber-400" />
                            <span className="font-bold">{selectedDoorRoom.active_viewers || 0} watching</span>
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                            Now Screening
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Rich Smart Details & Entry CTA */}
                    <div className="md:col-span-7 flex flex-col justify-center space-y-4">
                      
                      {/* Movie Header */}
                      <div className="space-y-1">
                        {selectedDoorRoom.content_type === 'series' && (
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-black uppercase tracking-wider">
                              TV Series {selectedDoorRoom.episodes?.length ? `(${selectedDoorRoom.episodes.length} Episodes)` : ''}
                            </span>
                          </div>
                        )}
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-white leading-tight">
                          {selectedDoorRoom.movie_title || selectedDoorRoom.room_name}
                        </h1>
                        <p className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                          <span>Room: <strong className="text-white">{selectedDoorRoom.room_name}</strong></span>
                          <span>•</span>
                          <span>Hosted by <strong className="text-amber-300">{selectedDoorRoom.host_name}</strong></span>
                        </p>
                      </div>

                      {/* Smart Metadata Badges (Only rendered if present) */}
                      {(selectedDoorRoom.release_year || selectedDoorRoom.year || selectedDoorRoom.age_rating || selectedDoorRoom.duration || selectedDoorRoom.category) && (
                        <div className="flex items-center gap-2 flex-wrap pt-1">
                          {(selectedDoorRoom.release_year || selectedDoorRoom.year) && (
                            <span className="px-3 py-1 rounded-lg bg-white/10 text-white font-bold text-xs">
                              {selectedDoorRoom.release_year || selectedDoorRoom.year}
                            </span>
                          )}
                          {selectedDoorRoom.age_rating && (
                            <span className="px-2.5 py-1 rounded-lg border border-white/20 text-white font-black text-xs uppercase">
                              {selectedDoorRoom.age_rating}
                            </span>
                          )}
                          {selectedDoorRoom.duration && (
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold">
                              <Clock className="w-3.5 h-3.5" />
                              {selectedDoorRoom.duration}
                            </span>
                          )}
                          {selectedDoorRoom.category && (
                            <span className="px-3 py-1 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/20 text-xs font-bold">
                              {selectedDoorRoom.category}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Smart Tagline (Only if present) */}
                      {selectedDoorRoom.tagline && (
                        <p className="text-xs md:text-sm italic text-amber-200/90 border-l-2 border-amber-400 pl-3 py-0.5">
                          "{selectedDoorRoom.tagline}"
                        </p>
                      )}

                      {/* Smart Description / Synopsis (Only if present) */}
                      {selectedDoorRoom.description && (
                        <div className="space-y-1">
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Synopsis</h4>
                          <p className="text-xs md:text-sm text-white/80 leading-relaxed max-h-28 overflow-y-auto pr-2">
                            {selectedDoorRoom.description}
                          </p>
                        </div>
                      )}

                      {/* Smart Director & Cast (Only if present) */}
                      {(selectedDoorRoom.director || selectedDoorRoom.cast) && (
                        <div className="space-y-1.5 pt-2 border-t border-white/10 text-xs">
                          {selectedDoorRoom.director && (
                            <div className="flex items-center gap-2 text-white/70">
                              <Clapperboard className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-white/40">Director:</span>
                              <span className="text-white/90 font-medium truncate">{selectedDoorRoom.director}</span>
                            </div>
                          )}
                          {selectedDoorRoom.cast && (
                            <div className="flex items-center gap-2 text-white/70">
                              <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-white/40">Cast:</span>
                              <span className="text-white/90 font-medium truncate">{selectedDoorRoom.cast}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Schedule & Start Time */}
                      <div className="pt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span>Screening Time: <strong className="text-white">{selectedDoorRoom.scheduled_start_time ? new Date(selectedDoorRoom.scheduled_start_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Live In Session Now'}</strong></span>
                      </div>

                      {/* Prominent Enter Theater Action Buttons */}
                      <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <Button
                          onClick={() => {
                            const rId = selectedDoorRoom.id;
                            handleCloseDoorEntrance();
                            handleJoinRoomById(rId);
                          }}
                          className="flex-1 py-6 rounded-2xl font-black uppercase text-xs md:text-sm tracking-widest bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 text-black hover:opacity-95 shadow-[0_0_30px_rgba(245,158,11,0.4)] flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          Enter Cinema Room Now
                        </Button>

                        <Button
                          onClick={() => {
                            handleShareRoom(selectedDoorRoom);
                          }}
                          variant="outline"
                          className="py-6 px-5 rounded-2xl border-white/10 hover:bg-white/10 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                        >
                          <Share2 className="w-4 h-4 text-amber-400" />
                          Share
                        </Button>
                      </div>

                    </div>

                  </div>

                </div>
              </motion.div>

            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default CinemaRoom;
