import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Mic, 
  MicOff, 
  Users, 
  MessageSquare, 
  Settings, 
  Play,
  Pause,
  Maximize,
  Minimize,
  LogOut,
  Crown,
  Menu,
  ChevronRight,
  Tv,
  Loader2,
  Smile,
  X,
  Trash2,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Share2,
  Radio,
  Copy
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useCinemaSync } from '../hooks/useCinemaSync';
import { toast } from 'sonner';
import { API_BASE_URL } from '../api/mediaApi';
import { auth, db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { setCinemaActive } from '@/lib/appLifecycle';

const COMMON_EMOJIS = ["❤️", "👍", "😂", "🔥", "😮", "👏", "🍿", "👀"];

const EXTENDED_EMOJI_CATEGORIES = [
  {
    name: "Cinema & Snacks",
    emojis: ["🍿", "🎬", "🎥", "📽️", "🎞️", "🎟️", "🥤", "🍫", "🍕", "🍔", "🍻", "🥂", "🎂", "🍩", "🍪", "🍦"]
  },
  {
    name: "Reactions & Faces",
    emojis: [
      "😂", "🤣", "😭", "😍", "🥰", "😎", "🤩", "🥳", "🔥", "💯", "🤯", "💀", "😮", "😱", "🥹", "😏",
      "🤔", "🤫", "🫡", "🫠", "🫣", "🤤", "😬", "🥶", "🥵", "🥱", "😵", "😇", "🤠", "😈", "🤡", "😴"
    ]
  },
  {
    name: "Hands & Hearts",
    emojis: [
      "👍", "👎", "👏", "🙌", "👌", "✌️", "🤞", "🤙", "👊", "🤝", "🙏", "💪", "🤘", "👋", "👉", "👈",
      "👆", "👇", "👑", "🏆", "💎", "💖", "❤️", "💔", "💕", "💘", "💞", "💓", "💥", "⚡", "💡", "🎯"
    ]
  },
  {
    name: "Fun & Vibes",
    emojis: [
      "🚀", "🎮", "🕹️", "🎲", "🎉", "🎊", "🎈", "🎁", "🪄", "🔮", "🧿", "👻", "🦄", "🦁", "🐶", "🐱",
      "🌹", "🌻", "🌴", "🍀", "🌈", "☀️", "🌙", "⭐", "🪐", "💧", "❄️", "💤", "💬", "👁️", "👀", "🚨"
    ]
  }
];

const formatTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

interface CinemaLiveRoomProps {
  roomId: string;
  roomData: any;
  onLeave: () => void;
}

export const CinemaLiveRoom: React.FC<CinemaLiveRoomProps> = ({ roomId, roomData, onLeave }) => {
  const { user, isAdmin } = useAuth();
  const [showChat, setShowChat] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resolvedVideoSrc, setResolvedVideoSrc] = useState<string | null>(null);
  const [isResolvingStream, setIsResolvingStream] = useState<boolean>(false);
  
  // Video Player Controls & Progress State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isUserScrubbing, setIsUserScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(true);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticUpdateRef = useRef(false);

  const {
    roomState,
    viewers,
    messages,
    isVoiceActive,
    isMuted,
    syncPlayback,
    syncEpisode,
    toggleMuteAll,
    sendChatMessage,
    joinVoice,
    leaveVoice,
    toggleMute,
    reactToMessage,
    moderateUser,
    activeUserUids
  } = useCinemaSync(roomId, user);

  const isCoHost = Boolean(roomData?.coHosts?.[user?.uid || '']);
  const isHost = user?.uid === roomData?.host_uid;
  const canControl = isHost || isAdmin || isCoHost;
  const isSeries = roomData?.content_type === 'series';
  const currentEpIndex = roomState?.currentEpisodeIndex ?? 0;
  const episodes = roomData?.episodes || [];
  const isFreeRoom = roomData?.room_type === 'free';
  const isMutedAll = Boolean(roomState?.mutedAll ?? roomData?.mutedAll);

  // Enforcement Logic: Check for Ban
  useEffect(() => {
    if (!user || !roomData) return;
    if (roomData.bannedUsers?.[user.uid]) {
      toast.error("You are banned from this room.");
      onLeave();
    }
  }, [roomData, user, onLeave]);

  // Fullscreen State Listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const rawVideoSrc = isSeries
    ? episodes[currentEpIndex]?.url
    : roomData?.movie_file;

  // Resilient Cloudflare R2 / Stream URL Resolver
  useEffect(() => {
    let active = true;

    const resolveStream = async () => {
      if (!rawVideoSrc) {
        setResolvedVideoSrc(null);
        return;
      }

      if (rawVideoSrc.includes('X-Amz-Signature') || rawVideoSrc.startsWith('data:') || rawVideoSrc.startsWith('blob:')) {
        setResolvedVideoSrc(rawVideoSrc);
        return;
      }

      const isR2 = rawVideoSrc.includes('cdn.streamaura.site') || 
                   rawVideoSrc.includes('r2.cloudflarestorage.com') || 
                   !rawVideoSrc.startsWith('http');

      if (isR2) {
        setIsResolvingStream(true);
        try {
          const token = await auth.currentUser?.getIdToken();
          const headers: Record<string, string> = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(
            `${API_BASE_URL}/api/cinema/stream-url?url=${encodeURIComponent(rawVideoSrc)}&room_id=${roomId}&episode_index=${currentEpIndex}`,
            { headers }
          );
          if (res.ok) {
            const data = await res.json();
            if (active && data.stream_url) {
              setResolvedVideoSrc(data.stream_url);
              setVideoError(null);
              return;
            }
          }
        } catch (err) {
          console.warn('Cinema stream resolution error:', err);
        } finally {
          if (active) setIsResolvingStream(false);
        }
      }

      if (active) {
        setResolvedVideoSrc(rawVideoSrc);
        setVideoError(null);
      }
    };

    resolveStream();

    return () => {
      active = false;
    };
  }, [rawVideoSrc, roomId, currentEpIndex]);

  const currentVideoSrc = resolvedVideoSrc || rawVideoSrc;

  const currentEpTitle = isSeries
    ? `S1 E${episodes[currentEpIndex]?.number || (currentEpIndex + 1)}: ${episodes[currentEpIndex]?.title || 'Episode'}`
    : (roomData?.movie_title || 'Feature Film');

  // Handle Next Episode
  const handleNextEpisode = () => {
    if (!canControl || !isSeries) return;
    if (currentEpIndex < episodes.length - 1) {
      syncEpisode(currentEpIndex + 1);
      toast.success(`Playing Episode ${episodes[currentEpIndex + 1]?.number || (currentEpIndex + 2)}`);
    } else {
      toast.info('This is the last episode of the season.');
    }
  };

  // Scroll Chat to Bottom on New Messages and when Chat is Reopened
  const scrollToLatestChat = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
    chatEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (showChat) {
      // Reopening chat: immediate jump to bottom
      requestAnimationFrame(() => {
        scrollToLatestChat('auto');
      });
    }
  }, [showChat, scrollToLatestChat]);

  useEffect(() => {
    if (showChat && messages.length > 0) {
      scrollToLatestChat('smooth');
    }
  }, [messages, showChat, scrollToLatestChat]);

  // Handle outside emoji click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
      const target = e.target as HTMLElement;
      if (activeReactionId && !target.closest('.reaction-picker')) {
        setActiveReactionId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeReactionId]);

  // Room Lifecycle and Active State Registration
  useEffect(() => {
    setCinemaActive(roomId);
    return () => {
      setCinemaActive(null);
    };
  }, [roomId]);

  // MediaSession API Integration for background playback continuity
  useEffect(() => {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentEpTitle,
          artist: roomData?.room_name || 'StreamAura Cinema',
          album: roomData?.movie_title || 'Virtual Theater',
          artwork: [
            { src: roomData?.movie_cover_image || '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: roomData?.movie_cover_image || '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' }
          ]
        });

        navigator.mediaSession.playbackState = roomState?.status === 'playing' ? 'playing' : 'paused';

        if (canControl) {
          navigator.mediaSession.setActionHandler('play', () => handleHostPlayPause(true));
          navigator.mediaSession.setActionHandler('pause', () => handleHostPlayPause(false));
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) {
              handleSeekCommit(details.seekTime);
            }
          });
        }
      } catch (err) {
        console.debug('MediaSession setup:', err);
      }
    }
  }, [currentEpTitle, roomData, roomState?.status, canControl]);

  // Synchronize Video Playback accurately with Room State from Server
  useEffect(() => {
    if (!videoRef.current || !roomState) return;

    const video = videoRef.current;
    isProgrammaticUpdateRef.current = true;

    // 1. Sync Status (Play / Pause)
    if (roomState.status === 'playing' && video.paused) {
      video.play().catch(() => {});
    } else if (roomState.status === 'paused' && !video.paused) {
      video.pause();
    }

    // 2. Anti-drift synchronization (Seek if drift exceeds 1.5 seconds)
    if (typeof roomState.movieTime === 'number') {
      const timeDiff = Math.abs(video.currentTime - roomState.movieTime);
      if (timeDiff > 1.5) {
        video.currentTime = roomState.movieTime;
      }
    }

    const timer = setTimeout(() => {
      isProgrammaticUpdateRef.current = false;
    }, 350);

    return () => clearTimeout(timer);
  }, [roomState]);

  // Tab Visibility Re-Sync: Resynchronize playback instantly when user switches back
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && videoRef.current && roomState) {
        const video = videoRef.current;
        isProgrammaticUpdateRef.current = true;

        if (roomState.status === 'playing' && video.paused) {
          video.play().catch(() => {});
        }
        if (typeof roomState.movieTime === 'number' && Math.abs(video.currentTime - roomState.movieTime) > 1.5) {
          video.currentTime = roomState.movieTime;
        }

        setTimeout(() => {
          isProgrammaticUpdateRef.current = false;
        }, 350);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [roomState]);

  // Host/Admin Controls: Explicit Play / Pause
  const handleHostPlayPause = (forcePlay?: boolean) => {
    if (!canControl || !videoRef.current) return;
    const video = videoRef.current;
    const shouldPlay = forcePlay !== undefined ? forcePlay : video.paused;

    isProgrammaticUpdateRef.current = true;
    if (shouldPlay) {
      video.play().catch(() => {});
      syncPlayback('play', video.currentTime);
    } else {
      video.pause();
      syncPlayback('pause', video.currentTime);
    }
    setTimeout(() => { isProgrammaticUpdateRef.current = false; }, 350);
  };

  // Host/Admin Controls: Interactive Scrubber / Seek
  const handleSeekChange = (val: number) => {
    if (!canControl) return;
    setIsUserScrubbing(true);
    setScrubTime(val);
  };

  const handleSeekCommit = (val: number) => {
    if (!canControl || !videoRef.current) return;
    setIsUserScrubbing(false);
    isProgrammaticUpdateRef.current = true;
    
    videoRef.current.currentTime = val;
    setCurrentTime(val);

    const currentStatus = (roomState?.status === 'playing' || !videoRef.current.paused) ? 'play' : 'pause';
    syncPlayback(currentStatus, val);

    setTimeout(() => { isProgrammaticUpdateRef.current = false; }, 350);
  };

  // Host/Admin Controls: Skip 10s Backward / Forward
  const handleSkipTime = (seconds: number) => {
    if (!canControl || !videoRef.current) return;
    const newTime = Math.max(0, Math.min(duration || 999999, videoRef.current.currentTime + seconds));
    handleSeekCommit(newTime);
  };

  // Native Video Event Handlers (With anti-loop protection)
  const handleNativeTimeUpdate = () => {
    if (videoRef.current && !isUserScrubbing) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleNativeLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
      if (roomState?.movieTime && roomState.movieTime > 0) {
        videoRef.current.currentTime = roomState.movieTime;
      }
    }
  };

  const handleNativePlay = () => {
    if (isProgrammaticUpdateRef.current) return;
    if (canControl && videoRef.current) {
      syncPlayback('play', videoRef.current.currentTime);
    } else if (!canControl && roomState?.status === 'paused' && videoRef.current) {
      // Non-hosts cannot override room pause
      videoRef.current.pause();
    }
  };

  const handleNativePause = () => {
    if (isProgrammaticUpdateRef.current) return;
    if (canControl && videoRef.current) {
      syncPlayback('pause', videoRef.current.currentTime);
    } else if (!canControl && roomState?.status === 'playing' && videoRef.current) {
      // Non-hosts cannot pause the room for others
      videoRef.current.play().catch(() => {});
    }
  };

  const handleNativeSeeked = () => {
    if (isProgrammaticUpdateRef.current) return;
    if (canControl && videoRef.current) {
      const status = videoRef.current.paused ? 'pause' : 'play';
      syncPlayback(status, videoRef.current.currentTime);
    }
  };

  // Fullscreen Toggle
  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (videoContainerRef.current?.requestFullscreen) {
          await videoContainerRef.current.requestFullscreen();
        } else if ((videoRef.current as any)?.webkitEnterFullscreen) {
          (videoRef.current as any).webkitEnterFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen error:', err);
    }
  };

  // Volume & Audio Controls
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
      setIsAudioMuted(newVol === 0);
    }
  };

  const handleToggleAudioMute = () => {
    if (videoRef.current) {
      const nextMute = !isAudioMuted;
      videoRef.current.muted = nextMute;
      setIsAudioMuted(nextMute);
      if (!nextMute && volume === 0) {
        setVolume(0.5);
        videoRef.current.volume = 0.5;
      }
    }
  };

  // Autohide Controls on Inactivity
  const handleMouseMoveControls = () => {
    setAreControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (roomState?.status === 'playing' && !isUserScrubbing) {
        setAreControlsVisible(false);
      }
    }, 4000);
  };

  // Chat Sending
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const isUserMuted = Boolean(roomData?.mutedUsers?.[user?.uid || '']);
    if (isMutedAll && !canControl) {
      toast.error("Chat is currently muted by admin.");
      return;
    }
    if (isUserMuted) {
      toast.error("You are muted in this room.");
      return;
    }

    sendChatMessage(chatInput);
    setChatInput('');
    setShowEmojiPicker(false);
  };

  const addEmoji = (emoji: string) => {
    setChatInput(prev => prev + emoji);
  };

  const handleMsgReaction = (messageId: string, emoji: string) => {
    if (roomData?.mutedUsers?.[user?.uid || '']) return;
    reactToMessage(messageId, emoji);
    setActiveReactionId(null);
  };

  // Stream Error Handling with Fallback
  const handleVideoError = async () => {
    if (rawVideoSrc && currentVideoSrc === rawVideoSrc) {
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(
          `${API_BASE_URL}/api/cinema/stream-url?url=${encodeURIComponent(rawVideoSrc)}&room_id=${roomId}&episode_index=${currentEpIndex}`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.stream_url && data.stream_url !== currentVideoSrc) {
            setResolvedVideoSrc(data.stream_url);
            setVideoError(null);
            return;
          }
        }
      } catch (e) {
        console.warn('Fallback stream resolution error:', e);
      }
    }
    setVideoError("Video stream unreachable or format unsupported.");
  };

  const toggleChatVisibility = () => {
    setShowChat(prev => !prev);
  };

  const handleUpdateRoom = async (updates: any) => {
    if (!canControl) return;
    try {
      const roomRef = doc(db, 'cinema_rooms', roomId);
      await updateDoc(roomRef, updates);
    } catch (err) {
      toast.error("Failed to update room settings");
    }
  };

  // Dynamic Mute Everyone Toggle
  const handleToggleMuteEveryone = async () => {
    if (!canControl) return;
    const nextMute = !isMutedAll;
    toggleMuteAll(nextMute);
    await handleUpdateRoom({ mutedAll: nextMute });
    toast.success(nextMute ? "Muted chat for everyone" : "Unmuted chat for everyone");
  };

  const handleDeleteRoom = () => {
    if (!canControl) return;
    setShowSettings(false);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteRoom = async () => {
    setIsDeleting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      await fetch(`${API_BASE_URL}/api/cinema/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      onLeave();
    } catch (err) {
      toast.error("Failed to delete room");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/?tab=cinema&room=${roomId}`;
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied to clipboard!");
  };

  // Active Users for Moderation
  const roomUsers = Array.from(new Set([
    ...activeUserUids,
    ...messages.map(m => m.uid)
  ])).map(uid => {
    const msg = messages.find(m => m.uid === uid);
    return {
      uid,
      name: msg?.userName || `User ${uid.substring(0, 4)}`,
      photo: msg?.userPhoto || null
    };
  }).filter(u => u.uid !== user?.uid);

  const displayCurrentTime = isUserScrubbing ? scrubTime : currentTime;
  const progressPercent = duration > 0 ? (displayCurrentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[500] bg-black flex flex-col md:flex-row overflow-hidden font-sans select-none">  
      {/* Settings & Moderation Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] z-10"
            >
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Settings className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-wider text-white">Room Settings</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white rounded-xl">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                {/* Global Moderation Controls */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Room Chat Controls</label>
                  <Button 
                    variant="outline"
                    onClick={handleToggleMuteEveryone}
                    className={`w-full rounded-2xl h-12 font-black uppercase tracking-wider text-xs border transition-all ${
                      isMutedAll 
                        ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20' 
                        : 'text-rose-400 border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20'
                    }`}
                  >
                    {isMutedAll ? '🔊 Unmute Everyone (Chat)' : '🔇 Mute Everyone (Chat)'}
                  </Button>
                </div>

                {/* Invite & Share */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Invite Audience</label>
                  <Button 
                    variant="outline"
                    onClick={handleCopyInviteLink}
                    className="w-full rounded-2xl h-11 font-bold border-white/10 bg-white/5 text-white hover:bg-white/10 gap-2 text-xs"
                  >
                    <Copy className="w-4 h-4 text-primary" />
                    Copy Theater Room Link
                  </Button>
                </div>

                {/* User List / Individual Moderation */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Users in Theater ({roomUsers.length})</label>
                  </div>
                  
                  <div className="space-y-2">
                    {roomUsers.length === 0 ? (
                      <div className="p-8 text-center bg-white/5 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">No other viewers currently in theater</p>
                      </div>
                    ) : (
                      roomUsers.map((u: any) => {
                        const isUserMuted = Boolean(roomData?.mutedUsers?.[u.uid]);
                        const isUserCoHost = Boolean(roomData?.coHosts?.[u.uid]);
                        
                        return (
                          <div key={u.uid} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-2xl group">
                            <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden shrink-0 border border-white/10">
                              {u.photo ? <img src={u.photo} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center font-black text-white/40">{u.name[0]}</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">{u.name}</p>
                              <div className="flex gap-2 mt-0.5">
                                {isUserCoHost && <span className="text-[8px] font-black text-primary uppercase">Co-Host</span>}
                                {isUserMuted && <span className="text-[8px] font-black text-rose-500 uppercase">Muted</span>}
                              </div>
                            </div>
                            
                            <div className="flex gap-1">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className={`h-8 w-8 p-0 rounded-lg ${isUserMuted ? 'text-rose-500 bg-rose-500/10' : 'text-white/40 hover:text-white'}`}
                                onClick={() => moderateUser(u.uid, isUserMuted ? 'unmute' : 'mute')}
                                title={isUserMuted ? "Unmute" : "Mute"}
                              >
                                {isUserMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 w-8 p-0 text-white/40 hover:text-orange-400 rounded-lg"
                                onClick={() => moderateUser(u.uid, 'kick')}
                                title="Kick"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 w-8 p-0 text-white/40 hover:text-rose-500 rounded-lg"
                                onClick={() => moderateUser(u.uid, 'ban')}
                                title="Ban"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                              {!isUserCoHost && isHost && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-8 w-8 p-0 text-white/40 hover:text-amber-400 rounded-lg"
                                  onClick={() => moderateUser(u.uid, 'cohost')}
                                  title="Appoint as Co-Host"
                                >
                                  <Crown className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {isHost && (
                  <div className="pt-6 border-t border-white/5 space-y-4 shrink-0">
                    <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest text-center">Danger Zone</p>
                    <Button 
                      onClick={handleDeleteRoom}
                      className="w-full rounded-2xl h-12 font-black uppercase tracking-widest bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-600/20 text-xs"
                    >
                      Close & Delete Theater
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Hamburger Navigation Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[1100] md:hidden flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="relative bg-zinc-950 border-t border-white/10 rounded-t-3xl p-6 space-y-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-white uppercase tracking-tight line-clamp-1">{roomData?.room_name}</h3>
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <Crown className="w-3 h-3 text-amber-500" />
                    Host: {roomData?.host_name}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)} className="text-white/60 hover:text-white rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Theater Info & Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-rose-500" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Audience</p>
                    <p className="text-xs font-black text-white">{viewers} Viewers</p>
                  </div>
                </div>
                <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-2.5">
                  <Tv className="w-4 h-4 text-purple-400" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Type</p>
                    <p className="text-xs font-black text-white">{isSeries ? 'Series Season' : 'Movie'}</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions List */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setShowChat(true);
                  }}
                  className="w-full h-12 rounded-2xl justify-start px-4 gap-3 bg-white/5 border-white/10 text-white font-bold text-xs"
                >
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Open Live Chat & Reactions
                </Button>

                <Button
                  variant="outline"
                  onClick={handleCopyInviteLink}
                  className="w-full h-12 rounded-2xl justify-start px-4 gap-3 bg-white/5 border-white/10 text-white font-bold text-xs"
                >
                  <Share2 className="w-4 h-4 text-blue-400" />
                  Share Theater Invite Link
                </Button>

                {isSeries && canControl && currentEpIndex < episodes.length - 1 && (
                  <Button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleNextEpisode();
                    }}
                    className="w-full h-12 rounded-2xl justify-start px-4 gap-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20"
                  >
                    <ChevronRight className="w-4 h-4" />
                    Play Next Episode (Ep {episodes[currentEpIndex + 1]?.number || currentEpIndex + 2})
                  </Button>
                )}

                {canControl && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setShowSettings(true);
                    }}
                    className="w-full h-12 rounded-2xl justify-start px-4 gap-3 bg-white/5 border-white/10 text-white font-bold text-xs"
                  >
                    <Settings className="w-4 h-4 text-amber-400" />
                    Room Settings & Moderation
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onLeave();
                  }}
                  className="w-full h-12 rounded-2xl justify-start px-4 gap-3 text-rose-500 hover:bg-rose-500/10 font-bold text-xs"
                >
                  <LogOut className="w-4 h-4 rotate-180" />
                  Leave Theater
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Video Screen Area */}
      <div 
        ref={videoContainerRef}
        onMouseMove={handleMouseMoveControls}
        className="flex-1 flex flex-col relative h-full min-h-0 bg-black overflow-hidden"
      >
        {/* Top Header Overlay */}
        <div className={`absolute top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 pointer-events-none ${areControlsVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center gap-3 pointer-events-auto">
            <Button variant="ghost" size="icon" onClick={onLeave} className="text-white hover:bg-white/10 rounded-full h-9 w-9">
               <LogOut className="w-5 h-5 rotate-180" />
            </Button>
            <div>
              <h2 className="text-white font-black uppercase text-sm tracking-tight line-clamp-1">{roomData?.room_name}</h2>
              <div className="flex items-center gap-2">
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <Crown className={`w-3 h-3 ${isHost ? 'text-amber-500' : 'text-blue-500'}`} />
                  {roomData?.host_name}'s Theater
                </p>
                {isSeries && (
                   <Badge className="bg-purple-600 text-[8px] font-black h-4 px-1.5 border-none">SERIES</Badge>
                )}
                {isFreeRoom && (
                   <Badge variant="outline" className="text-[8px] font-black h-4 px-1.5 border-white/20 text-white/40">FREE ROOM</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 pointer-events-auto">
             {isSeries && (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-600/20 border border-purple-500/30 backdrop-blur-md">
                   <Tv className="w-3.5 h-3.5 text-purple-400" />
                   <span className="text-[10px] font-black text-white">{currentEpTitle}</span>
                </div>
             )}
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                <Users className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-[10px] font-black text-white">{viewers} VIEWERS</span>
             </div>
             {canControl && (
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className="text-white hover:bg-white/10 rounded-full hidden md:flex h-9 w-9">
                   <Settings className="w-4 h-4" />
                </Button>
             )}
             <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)} className="md:hidden text-white hover:bg-white/10 rounded-full h-9 w-9">
                <Menu className="w-5 h-5" />
             </Button>
          </div>
        </div>

        {/* Video Player Display */}
        <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden group">
           {isResolvingStream ? (
             <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Securing High-Speed Stream...</p>
             </div>
           ) : currentVideoSrc ? (
             <>
               <video
                 key={currentVideoSrc}
                 ref={videoRef}
                 className="w-full h-full object-contain cursor-pointer"
                 playsInline
                 autoPlay
                 onTimeUpdate={handleNativeTimeUpdate}
                 onLoadedMetadata={handleNativeLoadedMetadata}
                 onPlay={handleNativePlay}
                 onPause={handleNativePause}
                 onSeeked={handleNativeSeeked}
                 onError={handleVideoError}
                 onClick={() => {
                   if (canControl) handleHostPlayPause();
                   else setAreControlsVisible(prev => !prev);
                 }}
               >
                 <source src={currentVideoSrc} type="video/mp4" />
                 <source src={currentVideoSrc} type="video/webm" />
                 <source src={currentVideoSrc} type="video/ogg" />
                 Your browser does not support the video tag.
               </video>

               {/* Video Error Screen */}
               {videoError && (
                 <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-8 text-center gap-4 backdrop-blur-md">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-xl shadow-rose-500/10">
                      <Tv className="w-7 h-7" />
                    </div>
                    <div className="space-y-1 max-w-md">
                      <p className="text-white font-black uppercase tracking-wider text-xs">{videoError}</p>
                      <p className="text-white/50 text-[10px] font-medium">The uploaded media source is taking longer to respond or is temporarily unreachable.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setVideoError(null);
                          if (rawVideoSrc) {
                            setResolvedVideoSrc(null);
                          }
                          if (videoRef.current) {
                            videoRef.current.load();
                            videoRef.current.play().catch(() => {});
                          }
                        }} 
                        className="border-white/10 text-white hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-wider h-9 px-4"
                      >
                        Retry Stream
                      </Button>
                      {roomData?.trailer_url && roomData.trailer_url !== currentVideoSrc && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setVideoError(null);
                            setResolvedVideoSrc(roomData.trailer_url);
                          }}
                          className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider h-9 px-4"
                        >
                          Play Trailer Preview
                        </Button>
                      )}
                      {canControl && (
                        <Button
                          variant="ghost"
                          onClick={() => setShowSettings(true)}
                          className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-wider h-9 px-4"
                        >
                          Room Settings
                        </Button>
                      )}
                    </div>
                 </div>
               )}
             </>
           ) : (
             <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Initializing Stream Cores...</p>
             </div>
           )}

           {/* Professional Custom Control Bar */}
           <div className={`absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-300 z-40 ${areControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="flex flex-col gap-3 max-w-5xl mx-auto">
                 {/* Next Episode Button for Series */}
                 {isSeries && canControl && (
                    <div className="flex justify-center">
                       <Button 
                         onClick={handleNextEpisode}
                         disabled={currentEpIndex >= episodes.length - 1}
                         className="bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-widest text-[9px] md:text-[10px] h-8 md:h-9 gap-2 shadow-lg shadow-purple-600/20 rounded-xl px-4"
                       >
                         Next Episode <ChevronRight className="w-4 h-4" />
                       </Button>
                    </div>
                 )}

                 {/* Interactive Scrubber Bar */}
                 <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-white/70 font-bold min-w-[40px] text-right">
                       {formatTime(displayCurrentTime)}
                    </span>
                    
                    <div className="relative flex-1 group/bar py-2 flex items-center">
                       <input 
                         type="range"
                         min={0}
                         max={duration || 100}
                         step={0.5}
                         disabled={!canControl}
                         value={displayCurrentTime}
                         onChange={(e) => handleSeekChange(parseFloat(e.target.value))}
                         onMouseUp={(e) => handleSeekCommit(parseFloat((e.target as HTMLInputElement).value))}
                         onTouchEnd={(e) => handleSeekCommit(parseFloat((e.target as HTMLInputElement).value))}
                         className={`w-full h-1.5 bg-white/20 rounded-full appearance-none outline-none accent-primary cursor-pointer ${!canControl && 'cursor-default opacity-80'}`}
                         style={{
                           background: `linear-gradient(to right, #22c55e ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%)`
                         }}
                       />
                    </div>

                    <span className="text-[10px] font-mono text-white/50 font-bold min-w-[40px]">
                       {formatTime(duration)}
                    </span>
                 </div>

                 {/* Control Action Buttons */}
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 md:gap-4">
                       {canControl ? (
                         <>
                           <button 
                             onClick={() => handleHostPlayPause()}
                             className="w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-white flex items-center justify-center shadow-lg shadow-primary/30 transition-transform active:scale-95"
                             title={roomState?.status === 'playing' ? 'Pause Theater' : 'Play Theater'}
                           >
                              {roomState?.status === 'playing' ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                           </button>

                           <button 
                             onClick={() => handleSkipTime(-10)} 
                             className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                             title="Rewind 10 seconds"
                           >
                              <RotateCcw className="w-4 h-4" />
                           </button>

                           <button 
                             onClick={() => handleSkipTime(10)} 
                             className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                             title="Forward 10 seconds"
                           >
                              <RotateCw className="w-4 h-4" />
                           </button>
                         </>
                       ) : (
                         <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                            <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/70">Synced with Host</span>
                         </div>
                       )}

                       {/* Local Volume Slider */}
                       <div className="flex items-center gap-2 group/vol">
                          <button onClick={handleToggleAudioMute} className="text-white/70 hover:text-white p-1.5">
                             {isAudioMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                          </button>
                          <input 
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={isAudioMuted ? 0 : volume}
                            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                            className="w-16 md:w-20 h-1 bg-white/20 rounded-full appearance-none accent-primary cursor-pointer"
                          />
                       </div>
                    </div>

                    <div className="flex items-center gap-2">
                       <Button
                         variant="ghost"
                         size="icon"
                         onClick={toggleChatVisibility}
                         className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl h-9 w-9 hidden md:flex"
                         title={showChat ? "Hide Chat" : "Show Chat"}
                       >
                          <MessageSquare className="w-4 h-4" />
                       </Button>

                       <Button
                         variant="ghost"
                         size="icon"
                         onClick={handleToggleFullscreen}
                         className="text-white hover:bg-white/10 rounded-xl h-9 w-9"
                         title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                       >
                          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                       </Button>
                    </div>
                 </div>
              </div>
           </div>

           {/* Watermark Logo */}
           <div className="absolute bottom-6 right-6 opacity-20 pointer-events-none select-none hidden md:block">
              <img src="/logo.png" className="w-10 h-10" alt="StreamAura" />
           </div>
        </div>

        {/* Mobile Bottom Voice / Chat Bar */}
        <div className="md:hidden p-3 bg-zinc-950 border-t border-white/10 flex items-center justify-between">
           <div className="flex items-center gap-3">
              <button 
                onClick={isVoiceActive ? leaveVoice : joinVoice} 
                disabled={isFreeRoom}
                className={`p-2 rounded-full transition-all ${isVoiceActive ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-white/60'} ${isFreeRoom && 'opacity-30 grayscale cursor-not-allowed'}`}
              >
                 {isVoiceActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-white/50">Voice Room</span>
                {isFreeRoom && <span className="text-[7px] font-black text-rose-500/60 uppercase tracking-tighter leading-none">Inactive (Free)</span>}
              </div>
           </div>
           <button onClick={() => setShowChat(!showChat)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white font-black text-[10px] uppercase">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              <span>{showChat ? 'Hide Chat' : 'Open Chat'}</span>
           </button>
        </div>
      </div>

      {/* Persistent Chat Sidebar */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="w-full md:w-80 lg:w-96 bg-zinc-950 border-l border-white/10 flex flex-col z-[100] h-[45%] md:h-full min-h-0 fixed md:relative bottom-0 left-0 md:bottom-auto md:left-auto shadow-2xl"
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                <h3 className="text-xs font-black uppercase tracking-widest text-white">Live Discussion</h3>
              </div>
              <div className="flex items-center gap-1.5">
                 <button 
                  onClick={toggleMute} 
                  disabled={isFreeRoom || !isVoiceActive}
                  className={`p-2 rounded-xl transition-all ${!isMuted ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-white/5 text-white/40 border border-white/10'} ${isFreeRoom && 'opacity-20 grayscale cursor-not-allowed'}`}
                  title={isMuted ? "Unmute Mic" : "Mute Mic"}
                 >        
                    {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}      
                 </button>
                 {canControl && (
                   <button 
                     onClick={() => setShowSettings(true)}
                     className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white border border-white/10"
                     title="Room Settings"
                   >      
                      <Settings className="w-3.5 h-3.5" />
                   </button>
                 )}
                 <button 
                   onClick={toggleChatVisibility}
                   className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white border border-white/10"
                   title="Close Chat"
                 >
                   <X className="w-3.5 h-3.5" />
                 </button>
              </div>
            </div>

            {/* Chat Messages Area */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-0 relative">
               <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                  <p className="text-[10px] text-primary font-bold uppercase tracking-wider text-center leading-relaxed">
                    Welcome to {roomData?.host_name}'s Theater! Keep discussions respectful.
                  </p>
               </div>

               {messages.map((msg, i) => (
                 <div key={msg.id || i} className={`flex gap-2.5 ${msg.uid === user?.uid ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 overflow-hidden shrink-0">
                       {msg.userPhoto ? (
                         <img src={msg.userPhoto} className="w-full h-full object-cover" alt="" />
                       ) : (
                         <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-white/40 uppercase bg-gradient-to-br from-white/10 to-transparent">
                            {msg.userName?.[0]}
                         </div>
                       )}
                    </div>

                    <div className={`flex flex-col gap-1 max-w-[75%] ${msg.uid === user?.uid ? 'items-end' : 'items-start'}`}>
                       <span className="text-[8px] font-black text-white/40 uppercase tracking-widest px-1">
                          {msg.userName} {msg.uid === roomData?.host_uid && '• HOST'}
                       </span>

                       <div className="relative group">
                          <div 
                            onDoubleClick={() => setActiveReactionId(activeReactionId === msg.id ? null : msg.id)}
                            className={`px-3 py-2 rounded-2xl text-xs font-medium leading-relaxed cursor-pointer transition-all active:scale-95 select-none ${msg.uid === user?.uid ? 'bg-primary text-white rounded-tr-none' : 'bg-white/5 text-white/90 border border-white/10 rounded-tl-none hover:bg-white/10'}`}
                          >
                             {msg.text}
                          </div>

                          {/* Reaction Picker Overlay */}
                          <AnimatePresence>
                             {activeReactionId === msg.id && (
                               <motion.div 
                                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                                className={`reaction-picker absolute bottom-full mb-2 z-[200] flex gap-1 bg-black/90 backdrop-blur-xl p-1.5 rounded-xl border border-white/10 shadow-2xl ${msg.uid === user?.uid ? 'right-0' : 'left-0'}`}
                               >
                                  {COMMON_EMOJIS.slice(0, 5).map(e => (
                                    <button 
                                      key={e} 
                                      onClick={() => handleMsgReaction(msg.id, e)}
                                      className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors text-lg active:scale-125"
                                    >
                                       {e}
                                    </button>
                                  ))}
                               </motion.div>
                             )}
                          </AnimatePresence>
                       </div>

                       {/* Reaction Counts */}
                       {msg.reactions && Object.entries(msg.reactions).length > 0 && (
                         <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(msg.reactions).map(([emoji, uids]) => (
                               Array.isArray(uids) && uids.length > 0 && (
                                 <button 
                                  key={emoji}
                                  onClick={() => handleMsgReaction(msg.id, emoji)}
                                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] transition-all ${user?.uid && uids.includes(user.uid) ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white/60'}`}
                                 >
                                    <span>{emoji}</span>
                                    <span className="font-black text-[8px]">{uids.length}</span>
                                 </button>
                               )
                            ))}
                         </div>
                       )}

                       <span className="text-[7px] font-bold text-white/20 uppercase px-1">
                          {msg.timestamp?.toDate ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                       </span>
                    </div>
                 </div>
               ))}
               <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="p-3 md:p-4 bg-zinc-900 border-t border-white/10 relative">
               <AnimatePresence>
                 {showEmojiPicker && (
                   <motion.div 
                    ref={emojiPickerRef}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full left-2 right-2 sm:left-4 sm:right-4 mb-2 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
                   >
                     <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                       <span className="text-[10px] font-black uppercase tracking-wider text-white/50">Emojis</span>
                       <button
                         type="button"
                         onClick={() => setShowEmojiPicker(false)}
                         className="text-white/40 hover:text-white text-xs p-1 rounded-md transition-colors"
                       >
                         ✕
                       </button>
                     </div>
                     <div 
                       className="p-2.5 space-y-3 max-h-56 md:max-h-64 overflow-y-auto select-none [&::-webkit-scrollbar]:hidden"
                       style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                     >
                       {EXTENDED_EMOJI_CATEGORIES.map(cat => (
                         <div key={cat.name} className="space-y-1.5">
                           <p className="text-[9px] font-black uppercase tracking-widest text-white/30 px-1">{cat.name}</p>
                           <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                             {cat.emojis.map(e => (
                               <button 
                                 key={e} 
                                 type="button"
                                 onClick={() => addEmoji(e)}
                                 className="w-full aspect-square flex items-center justify-center text-lg md:text-xl hover:bg-white/10 rounded-xl transition-all active:scale-125 select-none"
                               >
                                 {e}
                               </button>
                             ))}
                           </div>
                         </div>
                       ))}
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>

               <form onSubmit={handleSendMessage} className="flex items-center gap-2">      
                  <button 
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white transition-colors"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                  <div className="relative flex-1">
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder={isMutedAll && !canControl ? "Chat is muted by admin" : "Type a message..."}
                      disabled={isMutedAll && !canControl}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-4 pr-10 text-xs md:text-sm text-white placeholder:text-white/20 outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                    />
                    <button 
                      type="submit" 
                      disabled={isMutedAll && !canControl}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                       <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
               </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirm && createPortal(
        <div 
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md font-sans cursor-pointer"
        >
           <motion.div 
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0, y: 20 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-[2rem] p-8 text-center space-y-6 shadow-2xl cursor-default"
           >
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto border border-rose-500/20">
                 <Trash2 className="text-rose-500 w-8 h-8" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase text-white tracking-tighter">Close Theater?</h3>
                 <p className="text-xs text-white/40 font-medium uppercase leading-relaxed tracking-wider">
                   This will end the screening for all viewers and remove the room from the active theaters list.
                 </p>
              </div>
              <div className="flex flex-col gap-3">
                 <Button 
                   onClick={confirmDeleteRoom} 
                   disabled={isDeleting}
                   className="w-full bg-rose-600 hover:bg-rose-500 text-white h-12 font-black uppercase text-[10px] shadow-lg shadow-rose-600/20 rounded-2xl"
                 >
                   {isDeleting ? (
                     <>
                       <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                       Ending Session...
                     </>
                   ) : (
                     'End & Delete Theater'
                   )}
                 </Button>
                 <Button 
                   variant="ghost" 
                   disabled={isDeleting}
                   onClick={() => setShowDeleteConfirm(false)} 
                   className="w-full h-11 text-[10px] font-black uppercase border border-white/5 hover:bg-white/5 text-white/60 rounded-2xl"
                 >
                   Keep Streaming
                 </Button>
              </div>
           </motion.div>
        </div>, 
        document.body
      )}
    </div>
  );
};
