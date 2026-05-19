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
  TrendingUp,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Flame,
  Zap,
  DollarSign,
  Loader2,
  Gamepad2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { useGameSync } from '../hooks/useGameSync';
import { Badge } from '../components/ui/badge';

interface SplitOrStealGameProps {
  gameId: string;
  gameData: any;
  onLeave: () => void;
}

const SplitOrStealGame: React.FC<SplitOrStealGameProps> = ({ gameId, gameData, onLeave }) => {
  const { user, isAdmin } = useAuth();
  const { gameState, messages, sendAction } = useGameSync(gameId, user);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isHost = user?.uid === gameData.hostUid;
  const isPlayerA = user?.uid === gameState?.playerA?.uid;
  const isPlayerB = user?.uid === gameState?.playerB?.uid;
  const isContestant = isPlayerA || isPlayerB;
  const canControl = isHost || isAdmin;

  // Reveal Logic Colors
  const getBGColor = () => {
    if (gameState?.status === 'revealing' || gameState?.status === 'finished') {
       if (gameState.revealResult === 'share') return 'bg-yellow-600';
       if (gameState.revealResult === 'one_steal') return 'bg-purple-900';
       if (gameState.revealResult === 'none') return 'bg-zinc-800';
    }
    return 'bg-[#00040d]';
  };

  const handlePickPlayers = () => {
    if (!canControl) return;
    sendAction('pick_random_players');
  };

  const handleAddBot = () => {
    if (!canControl || !isAdmin) return;
    sendAction('add_bot_player');
  };

  const handleStartGame = () => {
    if (!canControl) return;
    sendAction('start_convincing');
  };

  const handleChoice = (choice: 'split' | 'steal') => {
    if (!isContestant || gameState?.status !== 'choosing') return;
    sendAction('make_choice', { choice });
  };

  // Bot Auto-Choice Logic (Frontend Simulation for Admin Testing)
  useEffect(() => {
    if (gameState?.status === 'choosing') {
      if (gameState.playerA?.isBot) {
        setTimeout(() => sendAction('make_choice', { choice: Math.random() > 0.5 ? 'split' : 'steal', botUid: gameState.playerA.uid }), 3000);
      }
      if (gameState.playerB?.isBot) {
        setTimeout(() => sendAction('make_choice', { choice: Math.random() > 0.5 ? 'split' : 'steal', botUid: gameState.playerB.uid }), 5000);
      }
    }
  }, [gameState?.status]);

  const handleReaction = (emoji: string) => {
    sendAction('emoji', { emoji });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendAction('chat', { text: chatInput });
    setChatInput('');
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Outcome Text Logic
  const getOutcomeLabel = (isPlayerA: boolean) => {
    if (gameState?.status !== 'revealing' && gameState?.status !== 'finished') return null;
    if (!gameState.revealResult) return null;

    const choiceA = gameState.choices[gameState.playerA?.uid];
    const choiceB = gameState.choices[gameState.playerB?.uid];

    if (gameState.revealResult === 'share') {
      return <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute inset-0 flex items-center justify-center bg-yellow-500/40 backdrop-blur-sm z-20"><span className="text-4xl font-black text-white drop-shadow-2xl uppercase italic">Winner</span></motion.div>;
    }
    if (gameState.revealResult === 'none') {
      return <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute inset-0 flex items-center justify-center bg-zinc-800/60 backdrop-blur-sm z-20"><span className="text-4xl font-black text-white/50 drop-shadow-2xl uppercase italic">Lost</span></motion.div>;
    }
    if (gameState.revealResult === 'one_steal') {
      const myChoice = isPlayerA ? choiceA : choiceB;
      const otherChoice = isPlayerA ? choiceB : choiceA;
      
      if (myChoice === 'split' && otherChoice === 'steal') {
        return <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute inset-0 flex items-center justify-center bg-purple-900/60 backdrop-blur-sm z-20"><span className="text-4xl font-black text-purple-400 drop-shadow-2xl uppercase italic">Betrayed</span></motion.div>;
      }
      if (myChoice === 'steal') {
        return <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute inset-0 flex items-center justify-center bg-yellow-500/20 z-20"><span className="text-4xl font-black text-white drop-shadow-2xl uppercase italic">Winner</span></motion.div>;
      }
    }
    return null;
  };

  return (
    <div className={`fixed inset-0 z-[1000] flex flex-col transition-colors duration-1000 ${getBGColor()} overflow-hidden font-sans`}>
      {/* Confetti Simulation Layer */}
      {gameState?.revealResult === 'share' && (
        <div className="absolute inset-0 pointer-events-none z-[1001]">
           {[...Array(50)].map((_, i) => (
             <motion.div
               key={i}
               initial={{ y: -10, x: Math.random() * 100 + '%' }}
               animate={{ y: '110vh', rotate: 360 }}
               transition={{ duration: Math.random() * 2 + 2, repeat: Infinity, ease: 'linear' }}
               className="w-2 h-2 rounded-full absolute bg-yellow-400 shadow-[0_0_10px_#eab308]"
             />
           ))}
        </div>
      )}

      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10 bg-black/40 backdrop-blur-md relative z-50">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onLeave} className="text-white hover:bg-white/10 rounded-full">
            <X className="w-6 h-6" />
          </Button>
          <div>
            <h2 className="text-white font-black uppercase text-sm tracking-tight">{gameData.roomName}</h2>
            <div className="flex items-center gap-2">
               <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <Crown className="w-3 h-3 text-yellow-500" /> Host: {gameData.hostName}
               </p>
               <Badge className="bg-primary/20 text-primary border-none text-[8px] px-1.5">SPLIT OR STEAL</Badge>
               {gameData.isMultipleRounds && (
                  <Badge className="bg-purple-600 border-none text-[8px] px-1.5 text-white">ROUND {gameState?.currentRound || 1} OF {gameData.numberOfRounds}</Badge>
               )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
           <div className="hidden md:flex flex-col items-end">
              <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">Prize Pool</p>
              <p className="text-xl font-black text-yellow-500">₦{gameData.prizeAmount.toLocaleString()}</p>
           </div>
           {gameState?.timer !== undefined && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-500/30">
                 <Timer className={`w-5 h-5 text-rose-500 ${gameState.timer <= 10 ? 'animate-bounce' : ''}`} />
                 <span className="text-lg font-black text-white tabular-nums">{gameState.timer}s</span>
              </div>
           )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row relative">
        {/* Arena Section */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-12 relative">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-20 relative w-full max-w-4xl">
             {/* VS Visualizer */}
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity }}
                  className="w-32 h-32 rounded-full border border-white/5 flex items-center justify-center"
                >
                   <Swords className="w-16 h-16 text-white/10" />
                </motion.div>
                <div className="absolute font-black text-6xl text-white/5 tracking-tighter uppercase italic">VERSUS</div>
             </div>

             {/* Player A Card */}
             <div className="flex flex-col items-center space-y-6 relative z-10">
                <div className="relative">
                   <div className={`w-32 h-32 md:w-48 md:h-48 rounded-[3rem] ${isPlayerA ? 'ring-4 ring-primary shadow-[0_0_50px_rgba(34,197,94,0.3)]' : 'border border-white/10'} bg-zinc-900 flex items-center justify-center overflow-hidden relative group`}>
                      {gameState?.playerA ? (
                        <>
                          <img src={gameState.playerA.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${gameState.playerA.uid}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                          {getOutcomeLabel(true)}
                        </>
                      ) : (
                        <User className="w-20 h-20 text-white/5" />
                      )}
                   </div>
                   {gameState?.playerA && (
                     <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-black uppercase text-[10px] px-3 shadow-lg">CONTESTANT A</Badge>
                   )}
                </div>
                <div className="text-center">
                   <h3 className="text-2xl font-black uppercase text-white tracking-tight">{gameState?.playerA?.displayName || 'WAITING...'}</h3>
                   <p className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">Aura ID: {gameState?.playerA?.uid?.substring(0, 8) || '---'}</p>
                </div>
             </div>

             {/* Player B Card */}
             <div className="flex flex-col items-center space-y-6 relative z-10">
                <div className="relative">
                   <div className={`w-32 h-32 md:w-48 md:h-48 rounded-[3rem] ${isPlayerB ? 'ring-4 ring-primary shadow-[0_0_50px_rgba(34,197,94,0.3)]' : 'border border-white/10'} bg-zinc-900 flex items-center justify-center overflow-hidden relative group`}>
                      {gameState?.playerB ? (
                        <>
                          <img src={gameState.playerB.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${gameState.playerB.uid}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                          {getOutcomeLabel(false)}
                        </>
                      ) : (
                        <User className="w-20 h-20 text-white/5" />
                      )}
                   </div>
                   {gameState?.playerB && (
                     <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-black uppercase text-[10px] px-3 shadow-lg">CONTESTANT B</Badge>
                   )}
                </div>
                <div className="text-center">
                   <h3 className="text-2xl font-black uppercase text-white tracking-tight">{gameState?.playerB?.displayName || 'WAITING...'}</h3>
                   <p className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">Aura ID: {gameState?.playerB?.uid?.substring(0, 8) || '---'}</p>
                </div>
             </div>
          </div>

          {/* Game Controls Section */}
          <div className="w-full max-w-lg">
             <AnimatePresence mode="wait">
                {gameState?.status === 'waiting' && canControl && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4">
                      <div className="flex gap-4">
                        <Button onClick={handlePickPlayers} className="h-14 px-12 gradient-bg rounded-2xl font-black uppercase text-xs gap-3 shadow-2xl shadow-primary/20">
                           Pick Contestants <Target className="w-5 h-5" />
                        </Button>
                        {isAdmin && (
                          <Button onClick={handleAddBot} variant="outline" className="h-14 px-8 border-white/10 rounded-2xl font-black uppercase text-xs gap-3 hover:bg-white/5">
                             Play with Bot <Gamepad2 className="w-5 h-5" />
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Lobby is ready for action</p>
                   </motion.div>
                )}

                {gameState?.status === 'selecting' && (
                   <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary animate-pulse text-center">Randomizing Pool... Picking The Lucky Two</p>
                   </motion.div>
                )}

                {gameState?.status === 'convincing' && (
                   <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6">
                      <h4 className="text-4xl font-black uppercase tracking-tighter text-white animate-pulse">Convince Each Other!</h4>
                      <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Chat will lock in {gameState.timer} seconds</p>
                      {canControl && (
                        <Button onClick={handleStartGame} variant="outline" className="border-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-white/5">
                           End Convincing Phase
                        </Button>
                      )}
                   </motion.div>
                )}

                {gameState?.status === 'choosing' && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6">
                    <div className="text-center">
                       <h4 className="text-2xl font-black uppercase text-white italic">Decision Time</h4>
                       <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Choice is hidden until reveal</p>
                    </div>

                    {isContestant ? (
                      <div className="grid grid-cols-2 gap-6 w-full">
                         <button 
                          disabled={!!gameState.choices[user?.uid!]}
                          onClick={() => handleChoice('split')}
                          className={`group h-24 rounded-3xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${gameState.choices[user?.uid!] === 'split' ? 'bg-yellow-500 border-yellow-400 text-black shadow-[0_0_30px_#eab308]' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500 hover:text-black'}`}
                         >
                            <TrendingUp className="w-8 h-8" />
                            <span className="text-xs font-black uppercase">SPLIT</span>
                         </button>
                         <button 
                          disabled={!!gameState.choices[user?.uid!]}
                          onClick={() => handleChoice('steal')}
                          className={`group h-24 rounded-3xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${gameState.choices[user?.uid!] === 'steal' ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_30px_#9333ea]' : 'bg-purple-600/10 border-purple-600/30 text-purple-400 hover:bg-purple-600 hover:text-white'}`}
                         >
                            <Target className="w-8 h-8" />
                            <span className="text-xs font-black uppercase">STEAL</span>
                         </button>
                      </div>
                    ) : (
                      <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center animate-pulse">
                         <p className="text-xs font-bold uppercase text-white/50 tracking-widest">Waiting for players to lock their choices...</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {gameState?.status === 'revealing' && (
                  <motion.div initial={{ opacity: 0, scale: 1.5 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
                     <h4 className="text-6xl font-black uppercase text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">THE REVEAL</h4>
                     <p className="text-xs font-black uppercase tracking-[0.5em] text-white/40">Hold your breath...</p>
                  </motion.div>
                )}

                {gameState?.status === 'round_finished' && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6">
                    <div className="text-center">
                       <h4 className="text-4xl font-black uppercase text-white">Round Completed</h4>
                       <p className="text-xs text-muted-foreground font-black uppercase tracking-widest mt-2">Get ready for the next round...</p>
                    </div>
                    {canControl && (
                       <Button onClick={handlePickPlayers} className="h-14 px-12 gradient-bg rounded-2xl font-black uppercase text-xs gap-3 shadow-2xl shadow-primary/20">
                          Start Next Round <Target className="w-5 h-5" />
                       </Button>
                    )}
                  </motion.div>
                )}

                {gameState?.status === 'finished' && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6">
                    <div className="text-center">
                       <h4 className="text-4xl font-black uppercase text-white">Game Over</h4>
                       <p className="text-xs text-muted-foreground font-black uppercase tracking-widest mt-2">All rounds completed</p>
                    </div>
                    {canControl && (
                       <Button onClick={onLeave} variant="outline" className="h-12 px-8 rounded-2xl font-black uppercase text-xs border-white/10 hover:bg-white/5">
                          Close Lobby
                       </Button>
                    )}
                  </motion.div>
                )}
             </AnimatePresence>

          </div>
        </div>

        {/* Chat & Sidebar Section */}
        <div className="w-full lg:w-96 border-l border-white/10 bg-black/60 backdrop-blur-xl flex flex-col relative z-50">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-widest text-white">Live Convincing</span>
             </div>
             <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                   {[...Array(3)].map((_, i) => (
                     <div key={i} className="w-6 h-6 rounded-full border-2 border-black bg-zinc-800" />
                   ))}
                   <div className="w-6 h-6 rounded-full border-2 border-black bg-zinc-800 flex items-center justify-center text-[8px] font-black">+42</div>
                </div>
             </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
             {messages.map((msg, i) => (
               <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={`flex flex-col ${msg.uid === user?.uid ? 'items-end' : 'items-start'}`}>
                  <span className="text-[8px] font-black uppercase text-muted-foreground mb-1 ml-1">{msg.userName}</span>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-xs font-medium leading-relaxed ${msg.uid === user?.uid ? 'bg-primary text-white rounded-tr-none' : 'bg-white/5 border border-white/10 text-white rounded-tl-none'}`}>
                     {msg.text}
                  </div>
               </motion.div>
             ))}
             <div ref={chatEndRef} />
          </div>

          {/* Audience Reaction Bar */}
          <div className="px-4 py-2 border-t border-white/5 flex gap-2 overflow-x-auto no-scrollbar">
             {[
               { icon: <Heart className="w-3.5 h-3.5" />, color: 'bg-rose-500', emoji: '❤️' },
               { icon: <ThumbsUp className="w-3.5 h-3.5" />, color: 'bg-blue-500', emoji: '👍' },
               { icon: <ThumbsDown className="w-3.5 h-3.5" />, color: 'bg-zinc-600', emoji: '👎' },
               { icon: <Flame className="w-3.5 h-3.5" />, color: 'bg-orange-600', emoji: '🔥' },
               { icon: <Zap className="w-3.5 h-3.5" />, color: 'bg-yellow-500', emoji: '⚡' },
               { icon: <DollarSign className="w-3.5 h-3.5" />, color: 'bg-emerald-600', emoji: '💰' }
             ].map((r, idx) => (
               <button 
                key={idx} 
                onClick={() => handleReaction(r.emoji)}
                className={`flex-shrink-0 w-8 h-8 rounded-lg ${r.color} flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform`}
               >
                 {r.icon}
               </button>
             ))}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-black/40">
             <form onSubmit={handleSendMessage} className="flex gap-2 relative">
                <input 
                  type="text" 
                  disabled={gameState?.status === 'choosing' || gameState?.status === 'revealing'}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder={(gameState?.status === 'choosing' || gameState?.status === 'revealing') ? "Chat Locked" : "Send a message..."} 
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-xs text-white outline-none focus:border-primary/50 transition-all disabled:opacity-30"
                />
                <button 
                  type="submit" 
                  disabled={!chatInput.trim()}
                  className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center text-white shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                   <Send className="w-4 h-4" />
                </button>
             </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplitOrStealGame;
