import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Gamepad2, 
  Plus, 
  Users, 
  Timer, 
  X, 
  ChevronDown,
  ShieldAlert,
  Loader2,
  Swords,
  History
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { db, auth } from '../lib/firebase';
import { collection, doc, getDoc, getDocs, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { API_BASE_URL } from '../api/mediaApi';

import SplitOrStealGame from './SplitOrStealGame';

export default function Games() {
  const { user, isAdmin, requireAuth } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGameData, setActiveGameData] = useState<any>(null);

  // Scroll Lock Effect
  useEffect(() => {
    if (isCreateModalOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => { 
      document.body.style.overflow = ''; 
      document.documentElement.style.overflow = ''; 
    };
  }, [isCreateModalOpen]);

  // Form State
  const [roomName, setRoomName] = useState('');
  const [entryFee, setEntryFee] = useState('');
  const [startCondition, setStartCondition] = useState<'manual' | 'auto'>('auto');
  const [autoStartUsers, setAutoStartUsers] = useState('10');
  
  // Multi-Round & Prize State
  const [isMultipleRounds, setIsMultipleRounds] = useState(false);
  const [numberOfRounds, setNumberOfRounds] = useState('2');
  const [prizePerRound, setPrizePerRound] = useState('');
  
  // Admin only specific pairings
  const [isManualPairing, setIsManualPairing] = useState(false);
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');

  // Wallet & Insufficient Funds State
  const [gameWalletBalance, setGameWalletBalance] = useState(0);
  const [mainWalletBalance, setMainWalletBalance] = useState(0);
  const [gameActivity, setGameActivity] = useState<any[]>([]);
  const [insufficientFunds, setInsufficientFunds] = useState<{ show: boolean; required: number } | null>(null);

  // Fetch Balances & Activity
  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        try {
          const gameWalletRef = doc(db, 'game_wallets', user.uid);
          const gameWalletSnap = await getDoc(gameWalletRef);
          if (gameWalletSnap.exists()) setGameWalletBalance(gameWalletSnap.data().balance || 0);

          const mainWalletRef = doc(db, 'room_wallets', user.uid);
          const mainWalletSnap = await getDoc(mainWalletRef);
          if (mainWalletSnap.exists()) setMainWalletBalance(mainWalletSnap.data().balance || 0);
          
          // Activity
          const activitySnap = await getDocs(query(collection(db, 'game_wallets', user.uid, 'activity'), orderBy('timestamp', 'desc'), limit(10)));
          setGameActivity(activitySnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {}
      };
      fetchData();
    }
  }, [user]);

  // Projected Prize Pool (Total Cost to Host)
  const calculateTotalPrizeCost = () => {
    const prize = parseFloat(prizePerRound) || 0;
    const rounds = isMultipleRounds ? parseInt(numberOfRounds) || 1 : 1;
    return prize * rounds;
  };

  // Host Earnings Calculation (70% to host, 30% to platform. Admin gets 100%)
  const calculateHostEarnings = () => {
    const fee = parseFloat(entryFee) || 0;
    const users = startCondition === 'auto' ? parseInt(autoStartUsers) || 2 : 2;
    const totalEntryMoney = fee * users;
    
    if (isAdmin) return totalEntryMoney; // Admin keeps 100%
    return totalEntryMoney * 0.70; // Regular host keeps 70%
  };

  const handleWithdrawGameWallet = () => {
    if (gameWalletBalance <= 0) {
      showError("Your Game Wallet is empty.");
      return;
    }
    const fee = gameWalletBalance * 0.10;
    const net = gameWalletBalance - fee;
    showInfo(`Withdrawal requested. 10% fee (₦${fee.toLocaleString()}) applied. You will receive ₦${net.toLocaleString()} in your main wallet soon.`);
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roomName.trim() || !entryFee || !prizePerRound) {
      showError('Please enter a room name, entry fee, and prize per round.');
      return;
    }

    if (isManualPairing && (!playerAId.trim() || !playerBId.trim())) {
      showError('Please enter Aura IDs for both Player A and Player B.');
      return;
    }

    const totalCost = calculateTotalPrizeCost();

    // Check Balance (Admins bypass funding requirement)
    if (!isAdmin && totalCost > mainWalletBalance) {
      setInsufficientFunds({ show: true, required: totalCost });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        roomName,
        entryFee: parseFloat(entryFee),
        prizePerRound: parseFloat(prizePerRound),
        isMultipleRounds,
        numberOfRounds: isMultipleRounds ? parseInt(numberOfRounds) : 1,
        startCondition,
        autoStartUsers: startCondition === 'auto' ? parseInt(autoStartUsers) : null,
        isManualPairing,
        playerAId,
        playerBId
      };

      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/games/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create game room.');
      }

      showSuccess('Game Room created successfully!');
      setIsCreateModalOpen(false);
      // Reset form
      setRoomName('');
      setEntryFee('');
      setPrizePerRound('');
      setIsMultipleRounds(false);
      setIsManualPairing(false);
      
      // Update local balance state
      if (!isAdmin) setMainWalletBalance(prev => prev - totalCost);
      
    } catch (err: any) {
      showError(err.message || 'Failed to create game room.');
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

  // Active Game Fetching Logic
  const [rooms, setRooms] = useState<any[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'game_rooms'), where('status', 'in', ['waiting', 'live']));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRooms(activeRooms);
    });
    return () => unsubscribe();
  }, []);

  const handleEnterPool = async (game: any) => {
    requireAuth(async () => {
      try {
        if (game.participants?.some((p: any) => p.uid === user?.uid)) {
          handleJoinGameById(game.id);
          return;
        }

        if (mainWalletBalance < game.entryFee) {
          // Trigger the Add Funds modal overlay instead of a simple toast
          setInsufficientFunds({ show: true, required: game.entryFee });
          return;
        }

        setIsSubmitting(true);
        const token = await auth.currentUser?.getIdToken();
        const resp = await fetch(`${API_BASE_URL}/api/games/join-pool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ gameId: game.id })
        });

        if (!resp.ok) throw new Error('Failed to join pool.');

        showSuccess('Entered Pool Successfully!');
        setMainWalletBalance(prev => prev - game.entryFee); // Optimistic UI update
        handleJoinGameById(game.id);
      } catch (err) {
        showError('Error entering pool.');
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  const handleJoinGameById = async (gameId: string) => {
    try {
      const docSnap = await getDoc(doc(db, 'game_rooms', gameId));
      if (docSnap.exists()) {
        setActiveGameId(gameId);
        setActiveGameData({ id: docSnap.id, ...docSnap.data() });
      } else {
        showError('Game room not found.');
      }
    } catch (err) {
      showError('Error entering game.');
    }
  };

  if (activeGameId && activeGameData) {
    return <SplitOrStealGame gameId={activeGameId} gameData={activeGameData} onLeave={() => { setActiveGameId(null); setActiveGameData(null); }} />;
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Insufficient Funds Modal */}
      {insufficientFunds?.show && createPortal(
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
           <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="glass-card max-w-sm w-full p-8 text-center space-y-6 border-white/10 shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto border border-rose-500/20">
                 <ShieldAlert className="text-rose-500 w-8 h-8" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase text-white">Insufficient Balance</h3>
                 <p className="text-xs text-muted-foreground font-medium uppercase leading-relaxed tracking-wider">
                    You need ₦{insufficientFunds.required.toLocaleString()} in your Main Wallet to fund the prize pool for this room.
                 </p>
              </div>
              <div className="flex flex-col gap-3">
                 <Button onClick={handleGoToWallet} className="w-full gradient-bg h-12 font-black uppercase text-[10px]">Add Funds to Wallet</Button>
                 <Button variant="ghost" onClick={() => setInsufficientFunds(null)} className="w-full h-11 text-[10px] font-black uppercase border border-white/5">Cancel</Button>
              </div>
           </motion.div>
        </div>, document.body
      )}

      {/* Header & Game Wallet */}
      <div className="flex flex-col items-center text-center gap-6">
        <div className="w-20 h-20 rounded-3xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20 shadow-[0_0_40px_rgba(234,179,8,0.15)]">
          <Gamepad2 className="w-10 h-10 text-yellow-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black uppercase tracking-tight text-white drop-shadow-md">
            StreamAura <span className="text-yellow-500">Games</span>
          </h1>
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-70">
            Play, Compete, and Win Cash Prizes
          </p>
        </div>

        {/* GAME WALLET CARD */}
        {user && (
          <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="p-6 rounded-3xl bg-gradient-to-br from-yellow-500/20 to-purple-600/20 border border-white/10 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex justify-between items-center relative z-10">
                   <div className="text-left space-y-1">
                     <p className="text-[10px] font-black uppercase tracking-widest text-yellow-500">My Game Wallet</p>
                     <p className="text-3xl font-black text-white">₦{gameWalletBalance.toLocaleString()}</p>
                   </div>
                   <Button onClick={handleWithdrawGameWallet} className="h-10 px-6 rounded-xl font-black uppercase text-[10px] bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg">
                     Withdraw
                   </Button>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest relative z-10">
                   <span>Winnings & Host Earnings</span>
                   <span>10% Handling Fee</span>
                </div>
             </div>

             <div className="p-6 rounded-3xl bg-black/40 border border-white/10 shadow-xl flex flex-col">
                <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                   <History className="w-3.5 h-3.5 text-primary" />
                   <span className="text-[10px] font-black uppercase tracking-widest">Recent Activity</span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto max-h-24 custom-scrollbar">
                   {gameActivity.map((act) => (
                     <div key={act.id} className="flex justify-between items-center">
                        <div className="text-left">
                           <p className="text-[10px] font-bold text-white/90">{act.desc}</p>
                           <p className="text-[8px] text-muted-foreground uppercase">{new Date(act.timestamp?.toDate()).toLocaleDateString()}</p>
                        </div>
                        <span className={`text-[10px] font-black ${act.type.includes('win') || act.type.includes('earning') ? 'text-emerald-400' : 'text-rose-400'}`}>
                           {act.type.includes('win') || act.type.includes('earning') ? '+' : '-'}₦{act.amount.toLocaleString()}
                        </span>
                     </div>
                   ))}
                   {gameActivity.length === 0 && <p className="text-[10px] text-muted-foreground italic text-center py-4">No recent game transactions</p>}
                </div>
             </div>
          </div>
        )}
        
        <Button 
          onClick={() => setIsCreateModalOpen(true)}
          className="h-12 px-8 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl text-[11px] font-black uppercase tracking-wider shadow-lg shadow-yellow-500/20 gap-2"
        >
          <Plus className="w-4 h-4" /> Create Game Room
        </Button>
      </div>

      {/* Featured Game Info */}
      <div className="glass-card p-1 border-white/10 overflow-hidden relative group">
         <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-purple-500/10 to-transparent opacity-50 pointer-events-none" />
         <div className="relative z-10 p-8 flex flex-col md:flex-row items-center gap-8">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-yellow-500 to-purple-600 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(234,179,8,0.3)]">
               <Swords className="w-12 h-12 text-white" />
            </div>
            <div className="space-y-3 text-center md:text-left">
               <Badge className="bg-white/10 text-white border-white/20">NOW AVAILABLE</Badge>
               <h2 className="text-3xl font-black uppercase tracking-tighter">Split or Steal</h2>
               <p className="text-sm text-muted-foreground font-medium max-w-xl">
                 Two players are randomly selected. You have 60 seconds to chat and convince each other. Then, you must choose to Split or Steal.
               </p>
               <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-yellow-500">
                    <div className="w-2 h-2 rounded-full bg-yellow-500" /> Split + Split = Share
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-purple-400">
                    <div className="w-2 h-2 rounded-full bg-purple-500" /> Split + Steal = Stealer Takes All
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div className="w-2 h-2 rounded-full bg-slate-500" /> Steal + Steal = Nothing
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* Live Lobbies */}
      <div className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          <Timer className="w-4 h-4 text-yellow-500" /> Active Lobbies
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map(game => (
            <Card key={game.id} className="glass-card border-white/10 overflow-hidden group hover:border-yellow-500/30 transition-colors">
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <Badge className={game.status === 'live' ? 'bg-rose-500 text-white' : 'bg-blue-500/20 text-blue-400'}>
                    {game.status === 'live' ? 'LIVE NOW' : 'WAITING FOR PLAYERS'}
                  </Badge>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 text-[10px] font-black tracking-widest">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    {game.participants?.length || 0} / {game.autoStartUsers || '∞'}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">{game.roomName}</h3>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Host: {game.hostName}</p>
                </div>

                <div className="pt-4 border-t border-white/5 flex justify-between items-end">
                   <div>
                     <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">Entry Fee</p>
                     <p className="text-lg font-black text-white">₦{game.entryFee}</p>
                   </div>
                   <Button 
                    disabled={isSubmitting}
                    onClick={() => handleEnterPool(game)}
                    className="h-9 px-6 rounded-xl font-black uppercase text-[10px] bg-white/10 hover:bg-yellow-500 hover:text-black transition-all"
                   >
                     {isSubmitting ? '...' : 'Enter Pool'}
                   </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isCreateModalOpen && (
            <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCreateModalOpen(false)} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
              <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar glass-card border-white/10 shadow-2xl">
                 <div className="sticky top-0 bg-background/90 backdrop-blur-xl border-b border-white/10 p-6 flex justify-between items-center z-20">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                          <Gamepad2 className="w-5 h-5 text-yellow-500" />
                       </div>
                       <div>
                         <h2 className="text-lg font-black uppercase tracking-tight">Host a Game</h2>
                         <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Split or Steal Event</p>
                       </div>
                    </div>
                    <button onClick={() => setIsCreateModalOpen(false)} className="p-2 rounded-full hover:bg-white/10"><X className="w-5 h-5" /></button>
                 </div>

                 <form onSubmit={handleCreateGame} className="p-6 space-y-6">
                    <div className="space-y-4">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Room Name</label>
                          <input type="text" required value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="e.g. 100k Challenge" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-yellow-500/50" />
                       </div>

                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Entry Fee per User (₦)</label>
                          <input type="number" required value={entryFee} onChange={e => setEntryFee(e.target.value)} placeholder="e.g. 50" min="0" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-yellow-500/50" />
                       </div>

                       <div className="space-y-4 pt-4 border-t border-white/10">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Multiple Rounds?</label>
                            <input type="checkbox" checked={isMultipleRounds} onChange={e => setIsMultipleRounds(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
                          </div>
                          <AnimatePresence>
                             {isMultipleRounds && (
                               <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Number of Rounds</label>
                                  <input type="number" required={isMultipleRounds} value={numberOfRounds} onChange={e => setNumberOfRounds(e.target.value)} placeholder="e.g. 5" min="2" className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm font-bold outline-none focus:border-yellow-500/50" />
                               </motion.div>
                             )}
                          </AnimatePresence>
                       </div>

                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Prize Per Round (₦)</label>
                          <input type="number" required value={prizePerRound} onChange={e => setPrizePerRound(e.target.value)} placeholder="e.g. 1000" min="0" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-yellow-500/50" />
                       </div>

                       <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Start Condition</label>
                          <div className="flex gap-2">
                             <button type="button" onClick={() => setStartCondition('auto')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${startCondition === 'auto' ? 'bg-yellow-500 text-black shadow-lg' : 'bg-black/40 text-muted-foreground border border-white/10'}`}>Auto-Start</button>
                             <button type="button" onClick={() => setStartCondition('manual')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${startCondition === 'manual' ? 'bg-yellow-500 text-black shadow-lg' : 'bg-black/40 text-muted-foreground border border-white/10'}`}>Manual Start</button>
                          </div>
                          
                          {startCondition === 'auto' && (
                             <div className="space-y-2 pt-2">
                               <label className="text-[9px] font-bold text-muted-foreground uppercase">When pool reaches:</label>
                               <div className="relative">
                                 <select value={autoStartUsers} onChange={e => setAutoStartUsers(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-[11px] outline-none text-white appearance-none focus:border-yellow-500/50 font-black">
                                   <option value="2">2 Users</option>
                                   <option value="4">4 Users</option>
                                   <option value="6">6 Users</option>
                                   <option value="8">8 Users</option>
                                   <option value="10">10 Users</option>
                                   <option value="12">12 Users</option>
                                   <option value="14">14 Users</option>
                                   <option value="16">16 Users</option>
                                   <option value="18">18 Users</option>
                                   <option value="20">20 Users</option>
                                 </select>
                                 <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                               </div>
                             </div>
                          )}
                       </div>

                       {isAdmin && (
                         <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-4">
                           <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-purple-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">Admin Bypass: Manual Pairing</span>
                              </div>
                              <input type="checkbox" checked={isManualPairing} onChange={e => setIsManualPairing(e.target.checked)} className="w-4 h-4 accent-purple-500" />
                           </div>
                           
                           <AnimatePresence>
                             {isManualPairing && (
                               <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                                  <input type="text" value={playerAId} onChange={e => setPlayerAId(e.target.value)} placeholder="Player A Aura ID" className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-xs outline-none focus:border-purple-500/50" />
                                  <input type="text" value={playerBId} onChange={e => setPlayerBId(e.target.value)} placeholder="Player B Aura ID" className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-xs outline-none focus:border-purple-500/50" />
                               </motion.div>
                             )}
                           </AnimatePresence>
                         </div>
                       )}

                       <div className="flex gap-4">
                         <div className="flex-1 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex flex-col justify-center">
                            <div className="space-y-1">
                              <p className="text-[10px] font-black uppercase text-yellow-500 tracking-widest">
                                 Host Earnings ({isAdmin ? '100%' : '70%'})
                              </p>
                              <p className="text-[9px] text-muted-foreground font-medium">From pool</p>
                            </div>
                            <p className="text-xl font-black text-white mt-2">₦{calculateHostEarnings().toLocaleString()}</p>
                         </div>
                         <div className="flex-1 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col justify-center">
                            <div className="space-y-1">
                              <p className="text-[10px] font-black uppercase text-rose-500 tracking-widest">Total Prize Cost</p>
                              <p className="text-[9px] text-muted-foreground font-medium">Deducted from wallet</p>
                            </div>
                            <p className="text-xl font-black text-white mt-2">₦{calculateTotalPrizeCost().toLocaleString()}</p>
                         </div>
                       </div>
                    </div>

                    <Button type="submit" disabled={isSubmitting} className="w-full h-14 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest rounded-xl shadow-lg shadow-yellow-500/20 text-xs">
                       {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</> : <>{calculateTotalPrizeCost() > 0 ? `Pay ₦${calculateTotalPrizeCost().toLocaleString()} & Create Pool` : 'Create & Open Pool'}</>}
                    </Button>
                 </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
