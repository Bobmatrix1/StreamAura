import React, { useState, useEffect, useRef } from 'react';
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
  LogOut,
  Crown,
  Menu,
  ChevronRight,
  Tv,
  Loader2,
  Smile,
  ChevronLeft,
  X,
  Trash2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useCinemaSync } from '../hooks/useCinemaSync';
import { toast } from 'sonner';
import { API_BASE_URL } from '../api/mediaApi';
import { auth, db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface CinemaLiveRoomProps {
  roomId: string;
  roomData: any;
  onLeave: () => void;
}

const COMMON_EMOJIS = ["❤️", "👍", "😂", "🔥", "😮", "👏", "🍿", "👀"];

export const CinemaLiveRoom: React.FC<CinemaLiveRoomProps> = ({ roomId, roomData, onLeave }) => {
  const { user, isAdmin } = useAuth();
  const [showChat, setShowChat] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const {
    roomState,
    viewers,
    messages,
    isVoiceActive,
    isMuted,
    syncPlayback,
    syncEpisode,
    sendChatMessage,
    joinVoice,
    toggleMute,
    reactToMessage,
    moderateUser,
    activeUserUids
  } = useCinemaSync(roomId, user);

  const isCoHost = roomData?.coHosts?.[user?.uid || ''];
  const isHost = user?.uid === roomData.host_uid;
  const canControl = isHost || isAdmin || isCoHost;
  const isSeries = roomData.content_type === 'series';
  const currentEpIndex = roomState?.currentEpisodeIndex || 0;
  const episodes = roomData.episodes || [];
  const isFreeRoom = roomData.room_type === 'free';

  // Enforcement Logic: Check for Bans/Kicks/Mutes
  useEffect(() => {
    if (!user || !roomData) return;

    // 1. Check for Ban
    if (roomData.bannedUsers?.[user.uid]) {
      toast.error("You are banned from this room.");
      onLeave();
      return;
    }
  }, [roomData, user]);

  const currentVideoSrc = isSeries
    ? episodes[currentEpIndex]?.url
    : roomData.movie_file;

  const currentEpTitle = isSeries
    ? `S1 E${episodes[currentEpIndex]?.number}: ${episodes[currentEpIndex]?.title}`
    : roomData.movie_title;

  // Handle Next Episode
  const handleNextEpisode = () => {
    if (!canControl || !isSeries) return;
    if (currentEpIndex < episodes.length - 1) {
      syncEpisode(currentEpIndex + 1);
      toast.success(`Playing Episode ${episodes[currentEpIndex + 1].number}`);
    } else {
      toast.info('This is the last episode of the season.');
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // Sync Video with Room State
  useEffect(() => {
    if (!videoRef.current || !roomState) return;

    const video = videoRef.current;

    // Sync status (playing/paused)
    if (roomState.status === 'playing' && video.paused) {
      video.play().catch(() => {});
    } else if (roomState.status === 'paused' && !video.paused) {
      video.pause();
    }

    // Anti-drift (if time difference > 2 seconds)
    if (Math.abs(video.currentTime - roomState.movieTime) > 2) {
      video.currentTime = roomState.movieTime;
    }
  }, [roomState]);

  const handleVideoAction = (action: 'play' | 'pause' | 'seek') => {
    if (!canControl) return;
    const time = videoRef.current?.currentTime || 0;
    syncPlayback(action, time);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    // Check for Mutes (Room-wide or Individual)
    const isRoomMuted = roomState?.mutedAll && !canControl;
    const isUserMuted = roomData.mutedUsers?.[user?.uid || ''];

    if (isRoomMuted || isUserMuted) {
       toast.error(isUserMuted ? "You are muted in this room." : "Chat is currently muted by admin.");
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
    if (roomData.mutedUsers?.[user?.uid || '']) return;
    reactToMessage(messageId, emoji);
    setActiveReactionId(null);
  };

  const handleVideoError = () => {
    setVideoError("Unsupported video format or source unreachable.");
  };

  const toggleChatVisibility = () => {
    setShowChat(prev => !prev);
    // On mobile, this also toggles the sidebar
    if (window.innerWidth < 768) {
      setIsSidebarOpen(prev => !prev);
    }
  };

  const handleUpdateRoom = async (updates: any) => {
    if (!canControl) return;
    try {
      const roomRef = doc(db, 'cinema_rooms', roomId);
      await updateDoc(roomRef, updates);
      toast.success("Room updated successfully");
    } catch (err) {
      toast.error("Failed to update room");
    }
  };

  const handleDeleteRoom = async () => {
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

  // Get user details for all active UIDs
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
  }).filter(u => u.uid !== user?.uid); // Don't show self in moderation list

  return (
    <div className="fixed inset-0 z-[500] bg-black flex flex-col md:flex-row overflow-hidden font-sans">  
      {/* Settings Modal */}
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
              className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between mb-6 shrink-0">
                <h3 className="text-xl font-black uppercase tracking-widest text-white">Room Settings</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white rounded-xl">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
                {/* Global Controls */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Admin Controls</label>
                  <Button 
                    variant="outline"
                    onClick={() => handleUpdateRoom({ mutedAll: !roomState?.mutedAll })}
                    className={`w-full rounded-2xl h-12 font-bold border-white/5 bg-white/5 transition-all ${roomState?.mutedAll ? 'text-rose-500 border-rose-500/20 bg-rose-500/5' : 'text-white'}`}
                  >
                    {roomState?.mutedAll ? 'Unmute Everyone' : 'Mute Everyone'}
                  </Button>
                </div>

                {/* User List / Moderation */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Users in Room ({roomUsers.length})</label>
                  </div>
                  
                  <div className="space-y-2">
                    {roomUsers.length === 0 ? (
                      <div className="p-8 text-center bg-white/5 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">No other users detected</p>
                      </div>
                    ) : (
                      roomUsers.map((u: any) => {
                        const isMuted = roomData.mutedUsers?.[u.uid];
                        const isCoHost = roomData.coHosts?.[u.uid];
                        
                        return (
                          <div key={u.uid} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-2xl group">
                            <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0 border border-white/10">
                              {u.photo ? <img src={u.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-black text-white/20">{u.name[0]}</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{u.name}</p>
                              <div className="flex gap-2">
                                {isCoHost && <span className="text-[8px] font-black text-primary uppercase">Co-Host</span>}
                                {isMuted && <span className="text-[8px] font-black text-rose-500 uppercase">Muted</span>}
                              </div>
                            </div>
                            
                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className={`h-8 w-8 p-0 rounded-lg ${isMuted ? 'text-rose-500 bg-rose-500/10' : 'text-white/40'}`}
                                onClick={() => moderateUser(u.uid, isMuted ? 'unmute' : 'mute')}
                              >
                                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 w-8 p-0 text-white/40 rounded-lg"
                                onClick={() => moderateUser(u.uid, 'kick')}
                                title="Kick"
                              >
                                <LogOut className="w-3.5 h-3.5 text-orange-500" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 w-8 p-0 text-white/40 rounded-lg"
                                onClick={() => moderateUser(u.uid, 'ban')}
                                title="Ban"
                              >
                                <X className="w-3.5 h-3.5 text-rose-500" />
                              </Button>
                              {!isCoHost && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-8 w-8 p-0 text-white/40 rounded-lg"
                                  onClick={() => moderateUser(u.uid, 'cohost')}
                                  title="Make Co-Host"
                                >
                                  <Crown className="w-3.5 h-3.5 text-amber-500" />
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
                    <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest text-center">Danger Zone</p>
                    <Button 
                      onClick={handleDeleteRoom}
                      className="w-full rounded-2xl h-12 font-black uppercase tracking-widest bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-600/20"
                    >
                      Close & Delete Room
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative h-full min-h-0">
        {/* Hide/Show Chat Pull-up Button (Only when chat is hidden) */}
        {!showChat && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={toggleChatVisibility}
            className="absolute top-1/2 right-4 -translate-y-1/2 z-[60] py-5 px-3 bg-primary text-white rounded-full shadow-[0_0_50px_rgba(34,197,94,0.6)] hover:scale-110 active:scale-95 transition-all hidden md:flex flex-col items-center gap-2 border-2 border-white/30 group"
          >
            <MessageSquare className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <div className="flex flex-col items-center leading-none">
              <span className="text-[8px] font-black uppercase tracking-tighter opacity-70">Open</span>
              <span className="text-[10px] font-black uppercase tracking-widest">Chat</span>
            </div>
            <ChevronLeft className="w-4 h-4 mt-1 animate-pulse" />
          </motion.button>
        )}

        {/* Top Header Overlay */}
        <div className="absolute top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-auto">
            <Button variant="ghost" size="icon" onClick={onLeave} className="text-white hover:bg-white/10 rounded-full">
               <LogOut className="w-5 h-5 rotate-180" />
            </Button>
            <div>
              <h2 className="text-white font-black uppercase text-sm tracking-tight line-clamp-1">{roomData.room_name}</h2>
              <div className="flex items-center gap-2">
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <Crown className={`w-3 h-3 ${isHost ? 'text-amber-500' : 'text-blue-500'}`} />
                  {roomData.host_name}'s Theater
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

          <div className="flex items-center gap-4 pointer-events-auto">
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
             <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden text-white">
                <Menu className="w-5 h-5" />
             </Button>
          </div>
        </div>

        {/* Video Player Container */}
        <div className="flex-1 bg-black flex items-center justify-center relative group overflow-hidden">
           {currentVideoSrc ? (
             <>
               <video
                 key={currentVideoSrc}
                 ref={videoRef}
                 className="w-full h-full object-contain"
                 playsInline
                 autoPlay
                 onPlay={() => handleVideoAction('play')}
                 onPause={() => handleVideoAction('pause')}
                 onSeeked={() => handleVideoAction('seek')}
                 onError={handleVideoError}
                 crossOrigin="anonymous"
               >
                 <source src={currentVideoSrc} type="video/mp4" />
                 <source src={currentVideoSrc} type="video/webm" />
                 <source src={currentVideoSrc} type="video/ogg" />
                 Your browser does not support the video tag.
               </video>
               {videoError && (
                 <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-8 text-center gap-4">
                    <Loader2 className="w-12 h-12 text-rose-500" />
                    <p className="text-white font-black uppercase tracking-widest text-xs">{videoError}</p>
                    <Button variant="outline" onClick={() => window.location.reload()} className="border-white/10 text-white rounded-xl">Reload Stream</Button>
                 </div>
               )}
             </>
           ) : (
             <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Initializing Stream Cores...</p>
             </div>
           )}

           {/* Custom Controls (Only show for host/admin) */}
           {canControl && (
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-50">
                 <div className="flex flex-col gap-4">
                    {isSeries && (
                       <div className="flex justify-center">
                          <Button 
                            onClick={handleNextEpisode}
                            disabled={currentEpIndex >= episodes.length - 1}
                            className="bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-widest text-[10px] h-9 gap-2 shadow-lg shadow-purple-600/20"
                          >
                            Play Next Episode <ChevronRight className="w-4 h-4" />
                          </Button>
                       </div>
                    )}
                    <div className="flex items-center gap-6">
                       <button onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()} className="text-white">
                          {videoRef.current?.paused ? <Play className="w-8 h-8 fill-current" /> : <Pause className="w-8 h-8 fill-current" />}
                       </button>
                       <div className="flex-1 h-1.5 bg-white/20 rounded-full relative overflow-hidden">   
                          <div className="absolute inset-y-0 left-0 bg-primary w-[30%]" />
                       </div>
                       <button className="text-white">
                          <Maximize className="w-6 h-6" />
                       </button>
                    </div>
                 </div>
              </div>
           )}

           {/* Watermark */}
           <div className="absolute bottom-8 right-8 opacity-20 pointer-events-none select-none">
              <img src="/logo.png" className="w-12 h-12" alt="StreamAura" />
           </div>
        </div>

        {/* Mobile Bottom Voice Toggle */}
        <div className="md:hidden p-4 bg-zinc-900 border-t border-white/10 flex items-center justify-between">
           <div className="flex items-center gap-3">
              <button 
                onClick={joinVoice} 
                disabled={isFreeRoom}
                className={`p-2 rounded-full transition-all ${isVoiceActive ? 'bg-primary text-white' : 'bg-white/5 text-white/60'} ${isFreeRoom && 'opacity-30 grayscale cursor-not-allowed'}`}
              >
                 {isVoiceActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase text-white/40">Voice Chat</span>
                {isFreeRoom && <span className="text-[7px] font-black text-rose-500/60 uppercase tracking-tighter leading-none mt-0.5">Inactive in Free Rooms</span>}
              </div>
           </div>
           <button onClick={() => setShowChat(!showChat)} className="flex flex-col items-center gap-1 text-white group">
              <MessageSquare className="w-5 h-5 group-hover:text-primary transition-colors" />
              <span className="text-[8px] font-black uppercase tracking-widest text-white/60">Open Chat</span>
           </button>
        </div>
      </div>

      {/* Sidebar (Chat & People) */}
      <AnimatePresence>
        {(showChat || !isSidebarOpen) && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className={`w-full md:w-80 lg:w-96 bg-zinc-950 border-l border-white/10 flex flex-col z-[100] h-[45%] md:h-full min-h-0 fixed md:relative bottom-0 left-0 md:bottom-auto md:left-auto ${!showChat && 'hidden md:flex'}`}
          >
            {/* Sidebar Tabs */}
            <div className="p-4 border-b border-white/5 flex items-center gap-4">
              <button 
                onClick={toggleChatVisibility}
                className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white border border-white/10 hidden md:flex"
                title="Hide Chat"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <h3 className="text-xs font-black uppercase tracking-widest text-primary flex-1">Live Interaction</h3>
              <div className="flex gap-2">
                 <button 
                  onClick={toggleMute} 
                  disabled={isFreeRoom || !isVoiceActive}
                  className={`p-2 rounded-xl transition-all ${!isMuted ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-white/5 text-white/40 border border-white/10'} ${isFreeRoom && 'opacity-20 grayscale cursor-not-allowed'}`}
                 >        
                    {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}      
                 </button>
                 <button 
                   onClick={() => setShowSettings(true)}
                   className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white border border-white/10"
                 >      
                    <Settings className="w-3.5 h-3.5" />
                 </button>
                 <button 
                   onClick={toggleChatVisibility}
                   className="md:hidden p-2 rounded-xl bg-white/5 text-rose-500 border border-white/10"
                 >
                   <X className="w-3.5 h-3.5" />
                 </button>
              </div>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-0 relative">
               <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                  <p className="text-[10px] text-primary font-bold uppercase tracking-wider text-center leading-relaxed">Welcome to {roomData.host_name}'s Theater! Keep it respectful.</p>
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
                          {msg.userName} {msg.uid === roomData.host_uid && '• HOST'}
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
                               uids.length > 0 && (
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
            <div className="p-4 bg-zinc-900 border-t border-white/10 relative">
               {/* Simple Emoji Picker */}
               <AnimatePresence>
                 {showEmojiPicker && (
                   <motion.div 
                    ref={emojiPickerRef}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute bottom-full left-4 right-4 mb-2 p-3 bg-zinc-800 border border-white/10 rounded-2xl shadow-2xl z-50"
                   >
                     <div className="grid grid-cols-4 gap-2">
                       {COMMON_EMOJIS.map(e => (
                         <button 
                          key={e} 
                          onClick={() => addEmoji(e)}
                          className="w-full aspect-square flex items-center justify-center text-xl hover:bg-white/5 rounded-xl transition-colors"
                         >
                           {e}
                         </button>
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
                      placeholder="Type a message..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-white/20 outline-none focus:border-primary/50 transition-colors"
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                       <Send className="w-4 h-4" />
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
                   This will end the screening for everyone and permanently delete the movie and poster from the cloud.
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
                     'End & Delete Everything'
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
