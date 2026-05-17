import React, { useState, useEffect, useRef } from 'react';
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
  Loader2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useCinemaSync } from '../hooks/useCinemaSync';
import { toast } from 'sonner';

interface CinemaLiveRoomProps {
  roomId: string;
  roomData: any;
  onLeave: () => void;
}

export const CinemaLiveRoom: React.FC<CinemaLiveRoomProps> = ({ roomId, roomData, onLeave }) => {
  const { user, isAdmin } = useAuth();
  const [showChat, setShowChat] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    toggleMute
  } = useCinemaSync(roomId, user, isAdmin);

  const isHost = user?.uid === roomData.host_uid;
  const canControl = isHost || isAdmin;
  const isSeries = roomData.content_type === 'series';
  const currentEpIndex = roomState?.currentEpisodeIndex || 0;
  const episodes = roomData.episodes || [];
  
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
    sendChatMessage(chatInput);
    setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-[500] bg-black flex flex-col md:flex-row overflow-hidden font-sans">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative h-full">
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
        <div className="flex-1 bg-black flex items-center justify-center relative group">
           {currentVideoSrc ? (
             <video 
               key={currentVideoSrc}
               ref={videoRef}
               src={currentVideoSrc} 
               className="w-full h-full object-contain"
               playsInline
               autoPlay
               onPlay={() => handleVideoAction('play')}
               onPause={() => handleVideoAction('pause')}
               onSeeked={() => handleVideoAction('seek')}
             />
           ) : (
             <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Loading Stream Cores...</p>
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

        {/* Mobile Bottom Chat Toggle */}
        <div className="md:hidden p-4 bg-zinc-900 border-t border-white/10 flex items-center justify-between">
           <div className="flex items-center gap-3">
              <button onClick={joinVoice} className={`p-2 rounded-full ${isVoiceActive ? 'bg-primary text-white' : 'bg-white/5 text-white/60'}`}>
                 <Mic className="w-5 h-5" />
              </button>
              <span className="text-[10px] font-black uppercase text-white/40">Voice Chat</span>
           </div>
           <button onClick={() => setShowChat(!showChat)} className="p-2 text-white">
              <MessageSquare className="w-5 h-5" />
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
            className={`w-full md:w-80 lg:w-96 bg-zinc-950 border-l border-white/10 flex flex-col z-[100] ${!showChat && 'hidden md:flex'}`}
          >
            {/* Sidebar Tabs */}
            <div className="p-4 border-b border-white/5 flex items-center gap-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary flex-1">Live Interaction</h3>
              <div className="flex gap-2">
                 <button onClick={toggleMute} className={`p-2 rounded-xl transition-all ${!isMuted ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-white/5 text-white/40 border border-white/10'}`}>
                    {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                 </button>
                 <button className="p-2 rounded-xl bg-white/5 text-white/40 border border-white/10">
                    <Settings className="w-3.5 h-3.5" />
                 </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
               <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                  <p className="text-[10px] text-primary font-bold uppercase tracking-wider text-center">Welcome to the Watch Party! Keep it respectful.</p>
               </div>

               {messages.map((msg, i) => (
                 <div key={i} className={`flex flex-col ${msg.uid === user?.uid ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl ${msg.uid === user?.uid ? 'bg-primary text-white rounded-tr-none' : 'bg-white/5 text-white/90 border border-white/10 rounded-tl-none'}`}>
                       <p className="text-sm font-medium leading-relaxed">{msg.text}</p>
                    </div>
                    <span className="text-[8px] font-black text-white/20 uppercase mt-1 tracking-widest">
                       {msg.uid === roomData.host_uid ? 'HOST' : 'VIEWER'} • {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                 </div>
               ))}
               <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-4 bg-zinc-900 border-t border-white/10">
               <div className="relative">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
