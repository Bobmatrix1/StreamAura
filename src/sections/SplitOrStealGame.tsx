import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  User, 
  Crown, 
  Timer, 
  X, 
  MessageSquare, 
  Target,
  Swords,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Flame,
  DollarSign,
  Loader2,
  ChevronDown,
  Lock,
  Users,
  ShieldCheck,
  Handshake,
  Ghost,
  Trash2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { useGameSync } from '../hooks/useGameSync';
import { Badge } from '../components/ui/badge';
import { auth } from '../lib/firebase';
import { API_BASE_URL } from '../api/mediaApi';

interface SplitOrStealGameProps {
  gameId: string;
  gameData: any;
  onLeave: () => void;
}

const SplitOrStealGame: React.FC<SplitOrStealGameProps> = ({ gameId, gameData, onLeave }) => {
  const { user, isAdmin } = useAuth();
  const { gameState, messages, flyingEmojis, sendAction } = useGameSync(gameId, user);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'convincing' | 'viewers'>('viewers');
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [lastTap, setLastTap] = useState<{ id: string, time: number } | null>(null);

  const [showAllEmojis, setShowAllEmojis] = useState(false);
  const [myChoice, setMyChoice] = useState<'split' | 'steal' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRoomClosed, setIsRoomClosed] = useState(false);

  const isHost = user?.uid === gameData.hostUid;
  const isPlayerA = user?.uid === gameState?.playerA?.uid;
  const isPlayerB = user?.uid === gameState?.playerB?.uid;
  const isContestant = isPlayerA || isPlayerB;
  const canControl = isHost || isAdmin;

  // Clear local choice on new round
  useEffect(() => {
    if (gameState?.status === 'selecting' || gameState?.status === 'waiting') {
      setMyChoice(null);
    }
  }, [gameState?.status]);

  // Double tap handler for reactions
  const handleMessageTap = (e: React.MouseEvent, msgId: string) => {
    e.stopPropagation(); // Prevent the click-outside listener from catching the second tap immediately
    const now = Date.now();
    if (lastTap && lastTap.id === msgId && (now - lastTap.time) < 300) {
      setActiveReactionId(activeReactionId === msgId ? null : msgId);
      setShowAllEmojis(false); // Reset expansion on open
      setLastTap(null);
    } else {
      setLastTap({ id: msgId, time: now });
    }
  };

  // Close picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if we clicked the picker itself
      if (target.closest('.emoji-picker-container')) return;
      if (activeReactionId) setActiveReactionId(null);
    };
    
    // Use a slight delay to attach the listener to avoid catching the tap that opened it
    let timeoutId: any;
    if (activeReactionId) {
      timeoutId = setTimeout(() => {
        window.addEventListener('click', handleClickOutside);
      }, 10);
    }
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [activeReactionId]);

  // Ensure tabs are correct on state change
  useEffect(() => {
    if (isContestant) setActiveTab('convincing');
    else setActiveTab('viewers');
  }, [isContestant]);

  const handleAddBots = () => {
    if (!canControl) return;
    sendAction('add_bots');
  };

  const handlePickPlayers = () => {
    if (!canControl) return;
    sendAction('pick_random_players');
  };

  const handleStartGame = () => {
    if (!canControl) return;
    sendAction('start_convincing');
  };

  const handleChoice = (choice: 'split' | 'steal') => {
    if (!isContestant || (gameState?.status !== 'choosing' && gameState?.status !== 'revealing')) return;
    setMyChoice(choice);
    sendAction('make_choice', { choice });
  };

  const handleMsgReaction = (e: React.MouseEvent, messageId: string, emoji: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    sendAction('chat_reaction', { messageId, emoji });
    sendAction('emoji', { emoji, origin });
    setActiveReactionId(null);
  };

  const handleReaction = (e: React.MouseEvent, emoji: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    sendAction('emoji', { emoji, origin });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const channel = (activeTab === 'convincing') ? 'player' : 'viewer';
    
    sendAction('chat', { 
      text: chatInput, 
      channel,
      name: user?.displayName || 'User'
    });
    setChatInput('');
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab, isChatCollapsed]);

  const getChoiceRevealText = (pUid: string | undefined) => {
    if (!pUid || !gameState?.choices) return null;
    const isRevealingLate = gameState.status === 'revealing' && gameState.timer <= 0;
    const isDone = gameState.status === 'finished' || gameState.status === 'round_finished';
    if (!isRevealingLate && !isDone) return null;
    const choice = gameState.choices[pUid];
    if (!choice) return null;
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.5 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className={`px-3 py-1.5 md:px-4 md:py-2 rounded-full font-black uppercase italic text-[10px] md:text-sm flex items-center gap-2 shadow-2xl border-2 z-30 ${choice === 'split' ? 'bg-yellow-400 border-yellow-300 text-black shadow-yellow-500/50' : 'bg-purple-600 border-purple-400 text-white shadow-purple-600/50'}`}
      >
        {choice === 'split' ? <Handshake className="w-4 h-4 md:w-5 md:h-5" /> : <Ghost className="w-4 h-4 md:w-5 md:h-5" />}
        <span>{choice}</span>
      </motion.div>
    );
  };

  const getOutcomeLabel = (isA: boolean) => {
    if (gameState?.status !== 'revealing' && gameState?.status !== 'finished' && gameState?.status !== 'round_finished') return null;
    if (!gameState.revealResult || (gameState.status === 'revealing' && gameState.timer > 0)) return null;
    
    const choiceA = gameState.choices?.[gameState.playerA?.uid];
    const choiceB = gameState.choices?.[gameState.playerB?.uid];
    
    let text = "";
    let style = "";

    if (gameState.revealResult === 'share') {
        text = "Winner";
        style = "bg-yellow-500/40 text-white";
    } else if (gameState.revealResult === 'none') {
        text = "Lost";
        style = "bg-zinc-800/60 text-white/50";
    } else if (gameState.revealResult === 'one_steal') {
        const myChoice = isA ? choiceA : choiceB;
        const otherChoice = isA ? choiceB : choiceA;
        if (myChoice === 'split' && otherChoice === 'steal') {
            text = "Betrayed";
            style = "bg-purple-900/60 text-purple-400";
        } else if (myChoice === 'steal') {
            text = "Winner";
            style = "bg-yellow-500/20 text-white";
        } else {
            text = "Lost";
            style = "bg-zinc-900/60 text-white/30";
        }
    }

    if (!text) return null;

    return (
      <motion.div 
        key={`outcome-${isA ? 'A' : 'B'}`}
        initial={{ opacity: 0, scale: 0.5 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className={`absolute inset-0 flex items-center justify-center backdrop-blur-md z-20 p-2 ${style} overflow-hidden`}
      >
        <span className="text-[clamp(11px,3.5vw,20px)] md:text-[clamp(18px,3vw,32px)] font-black uppercase italic leading-none text-center drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] whitespace-nowrap">
          {text}
        </span>
      </motion.div>
    );
  };

  const filteredMessages = messages.filter(m => (activeTab === 'convincing' ? m.channel === 'player' : m.channel === 'viewer'));

  const handleDeleteRoom = () => {
    if (!canControl) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/games/${gameId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setIsRoomClosed(true);
      } else {
        throw new Error(result.detail || 'Delete failed');
      }
    } catch (err) {
      alert("Failed to delete room.");
      setIsDeleting(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-[1000] flex flex-col transition-colors duration-1000 ${gameState?.status === 'revealing' || gameState?.status === 'finished' ? (gameState.revealResult === 'share' ? 'bg-yellow-600' : gameState.revealResult === 'one_steal' ? 'bg-purple-900' : 'bg-zinc-800') : 'bg-[#00040d]'} overflow-hidden font-sans`}>
      
      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[7000] bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-sm glass-card border-rose-500/20 shadow-2xl p-8 text-center space-y-8">
                <div className="w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto border border-rose-500/20 shadow-[0_0_40px_rgba(244,63,94,0.1)]">
                   {isDeleting ? <Loader2 className="w-10 h-10 text-rose-500 animate-spin" /> : <Trash2 className="w-10 h-10 text-rose-500" />}
                </div>
                <div className="space-y-2">
                   <h3 className="text-2xl font-black uppercase text-white">{isDeleting ? 'Deleting...' : 'Delete Room?'}</h3>
                   <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed px-4">This will instantly kick everyone and remove all game data. This action is permanent.</p>
                </div>
                {!isDeleting && (
                  <div className="flex flex-col gap-3">
                     <Button onClick={confirmDelete} className="h-14 rounded-2xl font-black uppercase text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20">Delete Forever</Button>
                     <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} className="h-14 rounded-2xl font-black uppercase text-xs text-white/60 hover:text-white">Keep Room</Button>
                  </div>
                )}
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ROOM DELETED SUCCESS OVERLAY */}
      <AnimatePresence>
        {isRoomClosed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[8000] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6 text-center">
            <div className="max-w-xs space-y-8">
              <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto border border-emerald-500/30">
                 <ShieldCheck className="w-12 h-12 text-emerald-500" />
              </div>
              <div className="space-y-3">
                <h3 className="text-3xl font-black uppercase text-white italic tracking-tight">DELETED</h3>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] leading-relaxed">The game room and all its data have been successfully purged.</p>
              </div>
              <Button onClick={onLeave} className="w-full h-16 rounded-2xl font-black uppercase text-sm gradient-bg shadow-2xl shadow-primary/20">Return to Lobby</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETED OVERLAY (FOR OTHERS) */}
      <AnimatePresence>
        {(gameState?.status === 'deleted' && !isRoomClosed) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[6000] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 text-center">
            <div className="max-w-xs space-y-6">
              <div className="w-20 h-20 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto border border-rose-500/30">
                 <X className="w-10 h-10 text-rose-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black uppercase text-white tracking-tight">Room Closed</h3>
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest leading-relaxed">This game room has been terminated by the host or admin.</p>
              </div>
              <Button onClick={onLeave} className="w-full h-14 rounded-2xl font-black uppercase text-xs gradient-bg">Back to Lobby</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="fixed inset-0 pointer-events-none z-[5000] overflow-hidden">
        <AnimatePresence>
          {flyingEmojis.map((e: any) => (
            <motion.div
              key={e.id}
              style={{
                left: e.origin ? `${e.origin.x}px` : '50%',
                top: e.origin ? `${e.origin.y}px` : '100%',
                position: 'fixed'
              }}
              initial={{ scale: 1, opacity: 0.9, x: '-50%', y: '-50%' }}
              animate={{ 
                top: '-10vh', 
                opacity: 0, 
                scale: 1.8, 
                rotate: Math.random() * 360 - 180,
                x: (Math.random() - 0.5) * 400
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3.5, ease: "easeOut" }}
              className="text-3xl drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]"
            >
              {e.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="p-3 md:p-4 flex items-center justify-between border-b border-white/10 bg-black/40 backdrop-blur-md relative z-[1003]">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onLeave} className="text-white hover:bg-white/10 rounded-full w-8 h-8 md:w-10 md:h-10"><X className="w-5 h-5 md:w-6 md:h-6" /></Button>
            {canControl && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleDeleteRoom} 
                className="text-rose-500 hover:bg-rose-500/10 rounded-full w-8 h-8 md:w-10 md:h-10 transition-colors"
                title="Delete Room"
              >
                <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
              </Button>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-black uppercase text-[10px] md:text-sm tracking-tight truncate max-w-[120px] md:max-w-none">{gameData.roomName}</h2>
            <div className="flex items-center gap-1.5 md:gap-2">
               <p className="text-white/50 text-[8px] md:text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 truncate max-w-[80px] md:max-w-none"><Crown className="w-2.5 h-2.5 text-yellow-500" /> {gameData.hostName}</p>
               <Badge className="bg-primary/20 text-primary border-none text-[7px] md:text-[8px] px-1 md:px-1.5 whitespace-nowrap uppercase">Round {gameState?.currentRound || 1} / {gameData.numberOfRounds}</Badge>
            </div>
          </div>
        </div>
        {gameState?.timer !== undefined && gameState.status !== 'waiting' && gameState.status !== 'finished' && (
          <div className="flex items-center gap-1.5 md:gap-3 px-2 md:px-4 py-1 md:py-2 rounded-lg md:rounded-xl bg-rose-500/20 border border-rose-500/30">
             <Timer className={`w-3.5 h-3.5 md:w-5 md:h-5 text-rose-500 ${gameState.timer <= 10 ? 'animate-bounce' : ''}`} />
             <span className="text-xs md:text-lg font-black text-white tabular-nums">{gameState.timer}s</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row relative min-h-0">
        <div className="flex-1 flex flex-col items-center justify-start md:justify-center p-4 md:p-8 space-y-10 md:space-y-16 relative overflow-y-auto custom-scrollbar min-h-0 pt-10 pb-20">
          
          {/* PRIZE DISPLAY - VISIBLE FROM START */}
          {(gameState?.status === 'selecting' || gameState?.status === 'convincing' || gameState?.status === 'choosing' || gameState?.status === 'revealing' || gameState?.status === 'round_finished') && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center z-10 bg-white/5 border border-white/10 px-8 py-4 rounded-[2rem] backdrop-blur-xl">
               <p className="text-[10px] md:text-xs font-black text-primary uppercase tracking-[0.5em] mb-1 opacity-50">Competing For</p>
               <div className="flex items-center justify-center gap-2">
                  <span className="text-4xl md:text-7xl font-black text-white italic drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">₦{(gameState?.prizeAmount || gameData.prizeAmount).toLocaleString()}</span>
               </div>
            </motion.div>
          )}

          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-20 relative w-full max-w-7xl">
             <div className="flex items-center gap-6 md:gap-10 bg-white/5 border border-white/10 p-5 md:p-8 rounded-[2rem] md:rounded-[4rem] relative z-10 w-full md:w-auto min-w-[320px] md:min-w-[480px] backdrop-blur-xl">
                <div className="relative shrink-0">
                   <div className={`w-24 h-24 md:w-48 md:h-48 rounded-3xl md:rounded-[3rem] ${isPlayerA ? 'ring-4 ring-primary shadow-[0_0_40px_rgba(34,197,94,0.3)]' : 'border border-white/10'} bg-zinc-900 overflow-hidden flex items-center justify-center relative`}>
                      {gameState?.playerA ? (
                        <>
                          <img src={gameState.playerA.photoURL} className="w-full h-full object-cover" alt="A" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                          {getOutcomeLabel(true)}
                        </>
                      ) : <User className="w-12 h-12 md:w-20 md:h-20 text-white/5" />}
                   </div>
                   <Badge className="absolute -top-3 -left-3 bg-yellow-500 text-black font-black uppercase text-[8px] md:text-[10px] px-2 py-0.5 shadow-xl">CONTESTANT</Badge>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                   <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl md:text-4xl font-black uppercase text-white tracking-tighter truncate leading-none">{gameState?.playerA?.displayName || 'WAITING...'}</h3>
                      {getChoiceRevealText(gameState?.playerA?.uid)}
                   </div>
                   <p className="text-[8px] md:text-[10px] text-muted-foreground font-black tracking-[0.2em] uppercase opacity-50">ID: {gameState?.playerA?.uid?.substring(0, 8) || '---'}</p>
                </div>
             </div>

             <div className="flex flex-col items-center justify-center gap-2 md:gap-4 relative z-0 shrink-0 py-6 md:py-0">
                <AnimatePresence mode="wait">
                  {gameState?.status === 'selecting' ? (
                    <motion.div key="sword-anim" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="w-20 h-20 md:w-32 md:h-32 rounded-full border border-primary/20 flex items-center justify-center bg-primary/5 backdrop-blur-sm">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}>
                        <Swords className="w-10 h-10 md:w-16 md:h-16 text-primary" />
                      </motion.div>
                    </motion.div>
                  ) : (
                    <motion.div key="vs-anim" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} className="w-20 h-20 md:w-32 md:h-32 rounded-full border border-white/10 flex items-center justify-center bg-white/5 shadow-2xl"><span className="font-black text-3xl md:text-5xl text-white/20 uppercase italic tracking-tighter">VS</span></motion.div>
                  )}
                </AnimatePresence>
             </div>

             <div className="flex flex-row-reverse items-center gap-6 md:gap-10 bg-white/5 border border-white/10 p-5 md:p-8 rounded-[2rem] md:rounded-[4rem] relative z-10 w-full md:w-auto min-w-[320px] md:min-w-[480px] backdrop-blur-xl">
                <div className="relative shrink-0">
                   <div className={`w-24 h-24 md:w-48 md:h-48 rounded-3xl md:rounded-[3rem] ${isPlayerB ? 'ring-4 ring-primary shadow-[0_0_40px_rgba(34,197,94,0.3)]' : 'border border-white/10'} bg-zinc-900 overflow-hidden flex items-center justify-center relative`}>
                      {gameState?.playerB ? (
                        <>
                          <img src={gameState.playerB.photoURL} className="w-full h-full object-cover" alt="B" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                          {getOutcomeLabel(false)}
                        </>
                      ) : <User className="w-12 h-12 md:w-20 md:h-20 text-white/5" />}
                   </div>
                   <Badge className="absolute -top-3 -right-3 bg-yellow-500 text-black font-black uppercase text-[8px] md:text-[10px] px-2 py-0.5 shadow-xl">CONTESTANT</Badge>
                </div>
                <div className="min-w-0 flex-1 text-right space-y-2">
                   <div className="flex flex-wrap flex-row-reverse items-center gap-3">
                      <h3 className="text-2xl md:text-4xl font-black uppercase text-white tracking-tighter truncate leading-none">{gameState?.playerB?.displayName || 'WAITING...'}</h3>
                      {getChoiceRevealText(gameState?.playerB?.uid)}
                   </div>
                   <p className="text-[8px] md:text-[10px] text-muted-foreground font-black tracking-[0.2em] uppercase opacity-50">ID: {gameState?.playerB?.uid?.substring(0, 8) || '---'}</p>
                </div>
             </div>
          </div>

          <div className="w-full max-w-lg">
             <AnimatePresence mode="wait">
                {(gameState?.status === 'waiting' || gameState?.status === 'round_finished') && canControl ? (
                   <motion.div key="waiting-controls" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col items-center gap-4">
                      <div className="flex flex-wrap items-center justify-center gap-4">
                        <Button onClick={handlePickPlayers} className="h-12 md:h-14 px-8 md:px-12 gradient-bg rounded-xl md:rounded-2xl font-black uppercase text-[10px] md:text-xs gap-3 shadow-2xl shadow-primary/20">
                           {gameState?.status === 'round_finished' ? 'Start Next Round' : 'Pick Contestants'} <Target className="w-4 h-4 md:w-5 md:h-5" />
                        </Button>
                        {isAdmin && (
                          <Button onClick={handleAddBots} variant="outline" className="h-12 md:h-14 px-6 border-white/10 text-white font-black uppercase text-[10px] md:text-xs rounded-xl md:rounded-2xl gap-2 hover:bg-white/5 transition-all">
                             Add Bots <Users className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-[8px] md:text-[10px] text-muted-foreground font-black uppercase tracking-widest">{gameState?.status === 'round_finished' ? 'Round Over. Shuffle next?' : 'Lobby is ready for action'}</p>
                   </motion.div>
                ) : gameState?.status === 'selecting' ? (
                   <motion.div key="selecting-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4"><Loader2 className="w-8 h-8 md:w-10 md:h-10 text-primary animate-spin" /><p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] text-primary animate-pulse text-center">Picking Contestants...</p></motion.div>
                ) : gameState?.status === 'convincing' ? (
                   <motion.div key="convincing-state" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="text-center space-y-4 md:space-y-6">
                      <h4 className="text-2xl md:text-5xl font-black uppercase tracking-tighter text-white animate-pulse">Convince Each Other!</h4>
                      {canControl && <Button onClick={handleStartGame} variant="outline" className="border-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-white/5 h-10 px-6">End Convincing</Button>}
                   </motion.div>
                ) : (gameState?.status === 'choosing' || gameState?.status === 'revealing') ? (
                  <motion.div key="decision-reveal-state" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center gap-4 md:gap-8">
                    <div className="text-center">
                       <h4 className="text-2xl md:text-4xl font-black uppercase text-white italic">
                         {gameState.status === 'revealing' ? 'THE REVEAL' : 'Decision Time'}
                       </h4>
                       <p className="text-[9px] md:text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                         {gameState.status === 'revealing' ? 'Revealing choices...' : (isContestant ? 'Make your choice below' : 'Waiting for contestants...')}
                       </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 md:gap-8 w-full">
                       <button 
                        disabled={!isContestant} 
                        onClick={() => handleChoice('split')} 
                        className={`group h-20 md:h-32 rounded-2xl md:rounded-[2.5rem] border-2 flex flex-col items-center justify-center gap-2 transition-all ${!isContestant ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${myChoice === 'split' ? 'bg-yellow-500 border-yellow-400 text-black shadow-[0_0_30px_#eab308]' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500 hover:enabled:bg-yellow-500 hover:enabled:text-black'}`}
                       >
                         <Handshake className="w-8 h-8 md:w-12 md:h-12" />
                         <span className="text-xs md:text-base font-black uppercase">SPLIT</span>
                       </button>
                       <button 
                        disabled={!isContestant} 
                        onClick={() => handleChoice('steal')} 
                        className={`group h-20 md:h-32 rounded-2xl md:rounded-[2.5rem] border-2 flex flex-col items-center justify-center gap-2 transition-all ${!isContestant ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${myChoice === 'steal' ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_30px_#9333ea]' : 'bg-purple-600/10 border-purple-600/30 text-purple-400 hover:enabled:bg-purple-600 hover:enabled:text-white'}`}
                       >
                         <Ghost className="w-8 h-8 md:w-12 md:h-12" />
                         <span className="text-xs md:text-base font-black uppercase">STEAL</span>
                       </button>
                    </div>
                    {gameState.status === 'revealing' && (
                       <p className="text-xl md:text-2xl font-black text-primary animate-pulse tabular-nums tracking-widest mt-4">REVEALING IN {gameState.timer}s</p>
                    )}
                  </motion.div>
                ) : gameState?.status === 'finished' ? (
                   <motion.div key="finished-state" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center gap-6"><div className="text-center"><h4 className="text-3xl md:text-5xl font-black uppercase text-white/40">GAME OVER</h4></div>{canControl && <Button onClick={onLeave} variant="outline" className="h-12 px-10 rounded-2xl font-black uppercase text-xs border-white/10 hover:bg-white/5">Close Lobby</Button>}</motion.div>
                ) : null}
             </AnimatePresence>
          </div>
        </div>

        {/* CHAT SIDEBAR */}
        <div className={`w-full lg:w-96 border-l border-white/10 bg-black/60 backdrop-blur-xl flex flex-col relative z-[1003] transition-all duration-300 ${isChatCollapsed ? 'h-12 lg:w-16' : 'h-[400px] lg:h-auto'}`}>
          <div className="flex border-b border-white/10 bg-black/40" onClick={() => isChatCollapsed && setIsChatCollapsed(false)}>
             <button onClick={(e) => { e.stopPropagation(); setActiveTab('convincing'); }} className={`flex-1 p-4 flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'convincing' ? 'border-primary bg-primary/10 text-white' : 'border-transparent text-white/40'}`}><MessageSquare className="w-3.5 h-3.5" /><span className={`text-[10px] font-black uppercase tracking-widest ${isChatCollapsed && 'lg:hidden'}`}>Arena</span></button>
             {(!isContestant || isAdmin) && (<button onClick={(e) => { e.stopPropagation(); setActiveTab('viewers'); }} className={`flex-1 p-4 flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'viewers' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-transparent text-white/40'}`}><Users className="w-3.5 h-3.5" /><span className={`text-[10px] font-black uppercase tracking-widest ${isChatCollapsed && 'lg:hidden'}`}>Global</span></button>)}
             <button onClick={(e) => { e.stopPropagation(); setIsChatCollapsed(!isChatCollapsed); }} className="p-4 text-white/20 hover:text-white"><ChevronDown className={`w-4 h-4 transition-transform ${isChatCollapsed ? 'rotate-180' : ''}`} /></button>
          </div>

          {!isChatCollapsed && (
            <>
              <div className="p-2 bg-white/5 text-center">
                 {activeTab === 'convincing' ? (
                   <div className="flex flex-col items-center"><p className="text-[8px] font-bold text-primary/80 uppercase tracking-widest flex items-center justify-center gap-1.5">{gameState?.status === 'convincing' ? 'Players Arena Channel' : <><Lock className="w-2.5 h-2.5" /> ARENA LOCKED</>}</p>{isAdmin && <Badge className="mt-1 bg-primary/20 text-primary border-none text-[6px] h-3 px-1 flex items-center gap-1"><ShieldCheck className="w-2 h-2" /> Admin Access</Badge>}</div>
                 ) : (
                   <div className="flex flex-col items-center"><p className="text-[8px] font-bold text-purple-400 uppercase tracking-widest flex items-center justify-center gap-1.5">Viewers Global Channel</p>{isAdmin && <Badge className="mt-1 bg-purple-500/20 text-purple-400 border-none text-[6px] h-3 px-1 flex items-center gap-1"><ShieldCheck className="w-2 h-2" /> Admin Access</Badge>}</div>
                 )}
              </div>
              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-5 custom-scrollbar pt-12">
                {filteredMessages.map((msg, i) => (
                  <motion.div key={`${msg.id}-${i}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={`flex flex-col ${msg.uid === user?.uid ? 'items-end' : 'items-start'}`}>
                      <span className="text-[7px] md:text-[8px] font-black uppercase text-muted-foreground mb-1.5 flex items-center gap-1">{msg.userName} {(msg.uid === gameState?.playerA?.uid || msg.uid === gameState?.playerB?.uid) && <span className="text-[6px] bg-primary/20 text-primary px-1 rounded">PLAYER</span>}</span>
                      <div className="relative group max-w-[85%]">
                        <div 
                          onClick={(e) => handleMessageTap(e, msg.id)}
                          className={`p-2.5 md:p-3 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-medium leading-relaxed cursor-pointer active:scale-[0.98] transition-all ${msg.uid === user?.uid ? 'bg-primary text-white rounded-tr-none' : 'bg-white/5 border border-white/10 text-white rounded-tl-none'}`}
                        >
                          {msg.text}
                        </div>
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1.5 ${msg.uid === user?.uid ? 'justify-end' : 'justify-start'}`}>
                            {Object.entries(msg.reactions).map(([emoji, uids]: [string, any]) => (
                              <button key={emoji} onClick={(e) => handleMsgReaction(e, msg.id, emoji)} className="bg-white/10 hover:bg-white/20 rounded-full px-2 py-0.5 text-[9px] flex items-center gap-1 border border-white/5 transition-colors">
                                <span>{emoji}</span>
                                <span className="font-bold opacity-70">{uids.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <AnimatePresence>
                          {activeReactionId === msg.id && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.8 }} 
                              animate={{ opacity: 1, scale: 1 }} 
                              exit={{ opacity: 0, scale: 0.8 }} 
                              className="emoji-picker-container absolute z-[2000]"
                              style={{
                                bottom: i < 2 ? 'auto' : '100%',
                                top: i < 2 ? '100%' : 'auto',
                                marginTop: i < 2 ? '8px' : '0',
                                marginBottom: i < 2 ? '0' : '8px',
                                right: msg.uid === user?.uid ? '0' : 'auto',
                                left: msg.uid === user?.uid ? 'auto' : '0'
                              }}
                            >
                              <div className="flex items-center gap-1 bg-black/90 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl max-w-[280px] overflow-x-auto overflow-y-hidden no-scrollbar">
                                {(showAllEmojis 
                                  ? ['👍', '👎', '💰', '💔', '😢', '😂', '🔥', '❤️', '💯', '💩', '🤝', '⚡', '👑', '💀', '👀', '🎉', '😡', '😱']
                                  : ['👍', '👎', '💰', '💔', '😢', '😂', '🔥', '❤️']
                                ).map(emoji => (
                                  <button key={emoji} onClick={(e) => handleMsgReaction(e, msg.id, emoji)} className="hover:scale-150 active:scale-90 transition-transform text-lg p-1.5 shrink-0">
                                    {emoji}
                                  </button>
                                ))}
                                {!showAllEmojis && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setShowAllEmojis(true); }}
                                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all text-sm font-bold shrink-0 ml-1"
                                  >
                                    +
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="px-4 py-2 border-t border-white/5 flex gap-2.5 overflow-x-auto no-scrollbar bg-black/20">
                {[{ icon: <Heart className="w-3.5 h-3.5" />, color: 'bg-rose-500', emoji: '❤️' }, { icon: <ThumbsUp className="w-3.5 h-3.5" />, color: 'bg-blue-500', emoji: '👍' }, { icon: <ThumbsDown className="w-3.5 h-3.5" />, color: 'bg-zinc-600', emoji: '👎' }, { icon: <Flame className="w-3.5 h-3.5" />, color: 'bg-orange-600', emoji: '🔥' }, { icon: <DollarSign className="w-3.5 h-3.5" />, color: 'bg-emerald-600', emoji: '💰' }].map((r, idx) => (<button key={idx} onClick={(e) => handleReaction(e, r.emoji)} className={`flex-shrink-0 w-8 h-8 rounded-xl ${r.color} flex items-center justify-center text-white shadow-lg active:scale-75 transition-all`}>{r.icon}</button>))}
              </div>
              <div className="p-3 md:p-4 bg-black/60 border-t border-white/10 relative">
                <form onSubmit={handleSendMessage} className="flex gap-2 relative">
                    <input type="text" disabled={(activeTab === 'convincing' && gameState?.status !== 'convincing' && !isAdmin) || (activeTab === 'viewers' && isContestant && !isAdmin)} value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder={(activeTab === 'convincing' && gameState?.status !== 'convincing' && !isAdmin) ? "Arena Locked" : "Type a message..."} className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2.5 md:py-3.5 px-4 text-[10px] md:text-xs text-white outline-none focus:border-primary/50 transition-all disabled:opacity-40" />
                    <button type="submit" disabled={!chatInput.trim() || ((activeTab === 'convincing' && gameState?.status !== 'convincing' && !isAdmin))} className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center text-white shadow-lg active:scale-95 transition-all disabled:opacity-50"><Send className="w-4 h-4" /></button>
                </form>
                {/* Visual Lock Overlay for Arena when Locked */}
                {activeTab === 'convincing' && gameState?.status !== 'convincing' && !isAdmin && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-[4px] rounded-b-xl z-20">
                     <div className="flex flex-col items-center gap-1.5">
                        <Lock className="w-6 h-6 text-primary animate-pulse" />
                        <span className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em]">Arena Locked</span>
                     </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SplitOrStealGame;
