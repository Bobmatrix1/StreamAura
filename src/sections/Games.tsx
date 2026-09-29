import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Gamepad2, 
  Plus, 
  Users, 
  Timer, 
  X, 
  ShieldAlert,
  Loader2,
  Swords,
  History,
  Trash2,
  ArrowUpRight,
  Share2,
  BookOpen,
  Coins,
  MessageSquare,
  Info
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { db, auth } from '../lib/firebase';
import { collection, doc, getDoc, query, onSnapshot } from 'firebase/firestore';
import { API_BASE_URL } from '../api/mediaApi';
import { AuraCoinIcon } from '../components/AuraCoinIcon';

import SplitOrStealGame from './SplitOrStealGame';

const FieldInfoHelper: React.FC<{
  title: string;
  description: string;
}> = ({ title, description }) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    placement: 'top' | 'bottom';
    arrowLeft: number;
  } | null>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const padding = 12; // safe margin from screen borders
    const screenWidth = window.innerWidth;
    const tooltipWidth = Math.min(280, screenWidth - padding * 2);

    const buttonCenterX = rect.left + rect.width / 2;
    // Strictly clamp tooltip inside viewport edges so it never cuts off
    let tooltipLeft = buttonCenterX - tooltipWidth / 2;
    tooltipLeft = Math.max(padding, Math.min(tooltipLeft, screenWidth - tooltipWidth - padding));

    // Calculate dynamic arrow position pointing directly to the button
    const arrowLeft = Math.max(12, Math.min(buttonCenterX - tooltipLeft, tooltipWidth - 12));

    // Prefer displaying above the button unless there is not enough room (< 160px from top)
    const placeBelow = rect.top < 160;

    if (placeBelow) {
      setCoords({
        top: rect.bottom + 8,
        left: tooltipLeft,
        width: tooltipWidth,
        placement: 'bottom',
        arrowLeft
      });
    } else {
      setCoords({
        bottom: window.innerHeight - rect.top + 8,
        left: tooltipLeft,
        width: tooltipWidth,
        placement: 'top',
        arrowLeft
      });
    }
  }, []);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handleGlobalClick);
    document.addEventListener('touchstart', handleGlobalClick);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handleGlobalClick);
      document.removeEventListener('touchstart', handleGlobalClick);
    };
  }, [isOpen, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="w-4 h-4 rounded-full bg-slate-200 dark:bg-white/10 hover:bg-yellow-500/20 text-slate-500 dark:text-muted-foreground hover:text-yellow-600 dark:hover:text-yellow-400 inline-flex items-center justify-center transition-colors focus:outline-none cursor-pointer shrink-0 ml-1.5 align-middle"
        aria-label={`Info: ${title}`}
      >
        <Info className="w-2.5 h-2.5" />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && coords && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: coords.placement === 'top' ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: coords.placement === 'top' ? 4 : -4 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'fixed',
                top: coords.top !== undefined ? `${coords.top}px` : undefined,
                bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
                left: `${coords.left}px`,
                width: `${coords.width}px`,
                zIndex: 99999
              }}
              onClick={(e) => e.stopPropagation()}
              className="p-3 rounded-xl bg-slate-900/98 dark:bg-slate-950/98 text-white border border-slate-700/80 dark:border-white/20 shadow-2xl backdrop-blur-lg text-left select-text"
            >
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <div className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-yellow-400">{title}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-white/60 hover:text-white p-0.5"
                  aria-label="Close"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[11px] text-slate-200 dark:text-white/85 font-medium leading-relaxed">
                {description}
              </p>

              {/* Dynamic Arrow Indicator */}
              <div
                style={{ left: `${coords.arrowLeft}px` }}
                className={`absolute w-0 h-0 border-x-4 border-x-transparent -translate-x-1/2 ${
                  coords.placement === 'top'
                    ? 'top-full border-t-4 border-t-slate-900 dark:border-t-slate-950'
                    : 'bottom-full border-b-4 border-b-slate-900 dark:border-b-slate-950'
                }`}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default function Games() {
  const { user, isAdmin, requireAuth } = useAuth();
  const { showSuccess, showError } = useToast();

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
  const [entryType, setEntryType] = useState<'cash' | 'auracoin'>('cash');
  const [startCondition, setStartCondition] = useState<'manual' | 'auto'>('auto');
  
  // Multi-Round & Prize State
  const [prizeType, setPrizeType] = useState<'cash' | 'auracoin'>('cash');
  const [isMultipleRounds, setIsMultipleRounds] = useState(false);
  const [numberOfRounds, setNumberOfRounds] = useState('2');
  const [prizePerRound, setPrizePerRound] = useState('');
  
  // Admin only specific pairings
  const [isManualPairing, setIsManualPairing] = useState(false);
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');

  // Wallet & Insufficient Funds State
  const [gameWalletBalance, setGameWalletBalance] = useState(0);
  const [auraCoinsBalance, setAuraCoinsBalance] = useState(0);
  const [mainWalletBalance, setMainWalletBalance] = useState(0);
  const [referralBalance, setReferralBalance] = useState(0);
  const [gameActivity, setGameActivity] = useState<any[]>([]);
  const [insufficientFunds, setInsufficientFunds] = useState<{ show: boolean; type: 'normal' | 'referral' | 'auracoin'; required: number } | null>(null);

  // Payment Selection
  const [paymentWallet] = useState<'normal' | 'referral'>('normal');

  const [hostBalance, setHostBalance] = useState(0);

  // Fetch Balances & Activity
  useEffect(() => {
    if (user?.uid) {
      const unsubGameWallet = onSnapshot(doc(db, 'game_wallets', user.uid), (snap) => {
        if (snap.exists()) setGameWalletBalance(snap.data().balance || 0);
      });

      const unsubMainWallet = onSnapshot(doc(db, 'room_wallets', user.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setMainWalletBalance(data.funded_balance || 0);
          setHostBalance(data.host_balance || 0);
        }
      });

      const unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setReferralBalance(data.referralBalance || 0);
          setAuraCoinsBalance(Number(data.auraCoins ?? data.auraCoin ?? data.bonusBalance ?? 0));
        }
      });

      const unsubActivity = onSnapshot(collection(db, 'game_wallets', user.uid, 'activity'), (snap) => {
        const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => {
            const getTs = (item: any) => {
              if (item.timestamp?.seconds) return item.timestamp.seconds * 1000;
              if (item.timestamp?.toMillis) return item.timestamp.toMillis();
              if (typeof item.timestamp === 'number') return item.timestamp;
              if (typeof item.created_at === 'number') return item.created_at;
              if (typeof item.createdAt === 'number') return item.createdAt;
              if (item.timestamp) {
                const parsed = new Date(item.timestamp).getTime();
                if (!isNaN(parsed)) return parsed;
              }
              return 0;
            };
            return getTs(b) - getTs(a);
          })
          .slice(0, 20);
        setGameActivity(sorted);
      });

      return () => { unsubGameWallet(); unsubMainWallet(); unsubUser(); unsubActivity(); };
    }
  }, [user?.uid]);

  // Projected Prize Pool (Total Cost to Host)
  const calculateTotalPrizeCost = () => {
    const prize = parseFloat(prizePerRound) || 0;
    const rounds = isMultipleRounds ? parseInt(numberOfRounds) || 1 : 1;
    return prize * rounds;
  };

  // Host Earnings Calculation (80% to host, 20% to platform. Admin gets 100%)
  const calculateHostEarnings = () => {
    const fee = parseFloat(entryFee) || 0;
    const rounds = isMultipleRounds ? parseInt(numberOfRounds) || 1 : 1;
    const totalEntryMoney = fee * (rounds * 2);
    
    if (isAdmin) return totalEntryMoney; // Admin keeps 100%
    return totalEntryMoney * 0.80; // Regular host keeps 80%
  };

  // Funding States
  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [fundingAmount, setFundingAmount] = useState('');
  const [fundingSource, setFundingSource] = useState<'funded' | 'host' | 'referral'>('funded');
  const [isSubmittingFunding, setIsSubmittingFunding] = useState(false);

  // Withdrawal States
  const [isWithdrawAmountModalOpen, setIsWithdrawAmountModalOpen] = useState(false);
  const [withdrawAmountInput, setWithdrawAmountInput] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [isConfirmWithdrawModalOpen, setIsConfirmWithdrawModalOpen] = useState(false);

  const handleWithdrawGameWallet = async () => {
    const amt = parseFloat(withdrawAmountInput);
    if (!withdrawAmountInput || isNaN(amt) || amt <= 0) {
      showError("Enter a valid amount.");
      return;
    }

    if (amt > gameWalletBalance) {
      showError("Insufficient game wallet balance.");
      return;
    }

    setIsConfirmWithdrawModalOpen(true);
  };

  const confirmWithdrawal = async () => {
    const amt = parseFloat(withdrawAmountInput);
    if (!user?.uid || isNaN(amt) || amt <= 0) return;

    setIsConfirmWithdrawModalOpen(false);
    setIsWithdrawing(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/games/v1/claim`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ amount: amt })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Withdrawal failed.');
      }

      showSuccess(`₦${amt.toLocaleString()} moved successfully to Main Earnings!`);
      setIsWithdrawAmountModalOpen(false);
      setWithdrawAmountInput('');
    } catch (err: any) {
      showError(err.message || "Withdrawal failed.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleFundFromWallet = async () => {
    const amt = parseFloat(fundingAmount);
    if (!fundingAmount || isNaN(amt) || amt <= 0 || !user?.uid) {
      showError("Enter a valid amount.");
      return;
    }

    // Strict Balance Checks
    if (fundingSource === 'referral' && amt > referralBalance) {
      showError("Insufficient referral balance.");
      return;
    }
    if (fundingSource === 'funded' && amt > mainWalletBalance) {
      showError("Insufficient funded balance.");
      return;
    }
    if (fundingSource === 'host' && amt > hostBalance) {
      showError("Insufficient host earnings.");
      return;
    }

    setIsSubmittingFunding(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/games/fund-from-main`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          amount: amt,
          source_wallet: fundingSource
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Funding failed.');
      }

      showSuccess(`₦${amt.toLocaleString()} moved successfully!`);
      setIsFundingModalOpen(false);
      setFundingAmount('');
    } catch (err: any) {
      showError(err.message || "Funding failed.");
    } finally {
      setIsSubmittingFunding(false);
    }
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roomName.trim() || !entryFee || !prizePerRound) {
      showError('Please enter a room name, entry fee, and prize per round.');
      return;
    }

    if (isMultipleRounds && (!numberOfRounds || isNaN(parseInt(numberOfRounds)) || parseInt(numberOfRounds) < 1)) {
      showError('Please enter a valid number of rounds (minimum 1).');
      return;
    }

    if (isManualPairing && (!playerAId.trim() || !playerBId.trim())) {
      showError('Please enter Aura IDs for both Player A and Player B.');
      return;
    }

    const totalCost = calculateTotalPrizeCost();

    // Check Balance
    if (totalCost > 0) {
      if (prizeType === 'auracoin') {
        if (totalCost > auraCoinsBalance) {
          setInsufficientFunds({ show: true, type: 'auracoin', required: totalCost });
          return;
        }
      } else {
        if (paymentWallet === 'referral' && totalCost > referralBalance) {
          setInsufficientFunds({ show: true, type: 'referral', required: totalCost });
          return;
        }
        if (paymentWallet === 'normal' && totalCost > gameWalletBalance) {
          setInsufficientFunds({ show: true, type: 'normal', required: totalCost });
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        roomName,
        entryFee: parseFloat(entryFee),
        entryType,
        prizePerRound: parseFloat(prizePerRound),
        prizeType,
        isMultipleRounds,
        numberOfRounds: isMultipleRounds ? parseInt(numberOfRounds) : 1,
        startCondition,
        autoStartUsers: startCondition === 'auto' ? (isMultipleRounds ? parseInt(numberOfRounds) * 2 : 2) : null,
        isManualPairing,
        playerAId,
        playerBId,
        payment_wallet: paymentWallet
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
      closeCreateModal();
    } catch (err: any) {
      showError(err.message || 'Failed to create game room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setRoomName('');
    setEntryFee('');
    setEntryType('cash');
    setPrizePerRound('');
    setPrizeType('cash');
    setIsMultipleRounds(false);
    setNumberOfRounds('2');
    setIsManualPairing(false);
    setPlayerAId('');
    setPlayerBId('');
    setStartCondition('auto');
    setInsufficientFunds(null);
  };

  const closeCreateModal = () => {
    resetCreateForm();
    setIsCreateModalOpen(false);
  };

  const closeWithdrawAmountModal = () => {
    setWithdrawAmountInput('');
    setIsWithdrawAmountModalOpen(false);
  };

  const closeConfirmWithdrawModal = () => {
    setIsConfirmWithdrawModalOpen(false);
  };

  const handleGoToWallet = () => {
    setInsufficientFunds(null);
    closeCreateModal();
    sessionStorage.setItem('wallet_action', 'deposit');
    window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'wallet' } }));
  };

  // Active Game Fetching Logic
  const [rooms, setRooms] = useState<any[]>([]);
  useEffect(() => {
    // Include all statuses to ensure rooms don't "disappear" from the lobby until actually deleted
    const q = query(collection(db, 'game_rooms'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeRooms = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter(room => ['waiting', 'selecting', 'convincing', 'choosing', 'revealing', 'round_finished', 'finished'].includes(room.status));
      setRooms(activeRooms);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const autoJoinId = sessionStorage.getItem('aura_auto_join_game');
    if (autoJoinId && rooms.length > 0) {
      const matchingRoom = rooms.find((r) => r.id === autoJoinId);
      if (matchingRoom) {
        sessionStorage.removeItem('aura_auto_join_game');
        handleJoinClick(matchingRoom);
      }
    }
  }, [rooms]);

  const [joiningGame, setJoiningGame] = useState<any | null>(null);
  const [showJoinChoice, setShowJoinChoice] = useState(false);

  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [deletingGame, setDeletingGame] = useState<any | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteRoom = (e: React.MouseEvent, game: any) => {
    e.stopPropagation();
    if (!isAdmin && game.hostUid !== user?.uid) return;
    setDeletingGame(game);
    setShowDeleteConfirm(true);
  };

  const handleShareRoom = (e: React.MouseEvent, game: any) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}?tab=games&gameId=${game.id}`;
    const shareTitle = `Split or Steal: ${game.roomName}`;
    const isAuraCoin = game.entryType === 'auracoin';
    const entryFeeText = isAuraCoin ? `${(game.entryFee || 0).toLocaleString()} AuraCoins` : `₦${(game.entryFee || 0).toLocaleString()}`;
    const shareText = `Join the live game room "${game.roomName}" hosted by ${game.hostName} on StreamAura! Paid pool entry fee: ${entryFeeText}. Split or Steal? Convince, Choose, Win!`;

    if (navigator.share) {
      navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl
      }).catch((err) => {
        console.log("Web Share cancelled/errored:", err);
      });
    } else {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl)
          .then(() => showSuccess("Lobby link copied to clipboard! Share it with friends!"))
          .catch(() => showError("Failed to copy link."));
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          showSuccess("Lobby link copied to clipboard! Share it with friends!");
        } catch (err) {
          showError("Failed to copy link.");
        }
        document.body.removeChild(textArea);
      }
    }
  };

  const confirmDeleteRoom = async () => {
    if (!deletingGame) return;
    const game = deletingGame;
    
    setIsDeletingId(game.id);
    setShowDeleteConfirm(false);
    
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/games/${game.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      let result: any = {};
      try {
        result = await response.json();
      } catch (e) {
        console.warn('Could not parse JSON from delete response', e);
      }

      if (!response.ok) {
        if (response.status === 404) {
          setRooms(prev => prev.filter(r => r.id !== game.id));
          showSuccess('Room was already deleted!');
          return;
        }
        throw new Error(result.detail || 'Failed to delete room');
      }

      setRooms(prev => prev.filter(r => r.id !== game.id));
      showSuccess('Room deleted successfully!');
      
    } catch (err: any) {
      console.error(err);
      showError(err.message || 'Failed to delete room');
    } finally {
      setIsDeletingId(null);
      setDeletingGame(null);
    }
  };

  const handleJoinClick = (game: any) => {
    requireAuth(() => {
      // If already a participant, join immediately
      if (game.participants?.some((p: any) => p.uid === user?.uid) || isAdmin || game.hostUid === user?.uid) {
        handleJoinGameById(game.id);
        return;
      }
      setJoiningGame(game);
      setShowJoinChoice(true);
    });
  };

  const handleSelectRole = (role: 'player' | 'viewer') => {
    if (!joiningGame) return;
    
    if (role === 'player') {
      handleEnterPool(joiningGame);
    } else {
      handleJoinGameById(joiningGame.id);
    }
    setShowJoinChoice(false);
    setJoiningGame(null);
  };

  const handleEnterPool = async (game: any) => {
    requireAuth(async () => {
      try {
        if (game.participants?.some((p: any) => p.uid === user?.uid)) {
          handleJoinGameById(game.id);
          return;
        }

        const isAuraCoin = game.entryType === 'auracoin';
        const fee = Number(game.entryFee || 0);

        if (fee > 0) {
          if (isAuraCoin) {
            if (auraCoinsBalance < fee) {
              setInsufficientFunds({ show: true, type: 'auracoin', required: fee });
              return;
            }
          } else {
            if (gameWalletBalance < fee) {
              setInsufficientFunds({ show: true, type: 'normal', required: fee });
              return;
            }
          }
        }

        setIsSubmitting(true);
        const token = await auth.currentUser?.getIdToken();
        const resp = await fetch(`${API_BASE_URL}/api/games/join-pool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ gameId: game.id })
        });

        if (!resp.ok) {
          const errData = await resp.json();
          throw new Error(errData.detail || 'Failed to join pool.');
        }

        showSuccess('Entered Pool Successfully!');
        handleJoinGameById(game.id);
      } catch (err: any) {
        showError(err.message || 'Error entering pool.');
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
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
           <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-slate-900 max-w-sm w-full p-8 text-center space-y-6 border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl sm:rounded-3xl text-slate-900 dark:text-white">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto border border-rose-500/20">
                 <ShieldAlert className="text-rose-500 w-8 h-8" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white">Insufficient Balance</h3>
                 <p className="text-xs text-slate-500 dark:text-muted-foreground font-medium uppercase leading-relaxed tracking-wider">
                    {insufficientFunds.type === 'auracoin'
                      ? `You need ${insufficientFunds.required.toLocaleString()} AuraCoins to participate or fund this room. Earn more AuraCoins and try again.`
                      : `You need ₦${insufficientFunds.required.toLocaleString()} in your Game Wallet to participate or fund this room. Add funds from your main wallet to your game wallet and try again.`
                    }
                 </p>
              </div>
              <div className="flex flex-col gap-3">
                 {insufficientFunds.type !== 'auracoin' && (
                   <Button onClick={handleGoToWallet} className="w-full gradient-bg h-12 font-black uppercase text-[10px]">Go to Wallet</Button>
                 )}
                 <Button variant="ghost" onClick={() => setInsufficientFunds(null)} className="w-full h-11 text-[10px] font-black uppercase border border-slate-200 dark:border-white/5 text-slate-600 hover:text-slate-900 dark:text-white">Close</Button>
              </div>
           </motion.div>
        </div>, document.body
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingGame && createPortal(
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
           <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-slate-900 max-w-sm w-full p-8 text-center space-y-6 border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl sm:rounded-3xl text-slate-900 dark:text-white">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto border border-rose-500/20">
                 <Trash2 className="text-rose-500 w-8 h-8" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white">Delete Room?</h3>
                 <p className="text-xs text-slate-500 dark:text-muted-foreground font-medium uppercase leading-relaxed tracking-wider">
                    Are you sure you want to delete <span className="text-slate-900 dark:text-white font-bold">"{deletingGame.roomName}"</span>? This will close the room for everyone and cannot be undone.
                 </p>
              </div>
              <div className="flex flex-col gap-3">
                 <Button onClick={confirmDeleteRoom} className="w-full bg-rose-600 hover:bg-rose-700 text-white h-12 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-rose-600/20">Delete Room</Button>
                 <Button variant="ghost" onClick={() => { setShowDeleteConfirm(false); setDeletingGame(null); }} className="w-full h-11 text-[10px] font-black uppercase border border-slate-200 dark:border-white/5 text-slate-600 hover:text-slate-900 dark:text-white">Keep Room</Button>
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
          <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900 dark:text-white drop-shadow-sm">
            StreamAura <span className="text-yellow-500">Games</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-80 dark:opacity-70">
            Play, Compete, and Win Real Cash & AuraCoin Prizes
          </p>
        </div>

        {/* GAME WALLET & AURACOIN CARDS */}
        {user && (
          <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-5">
             {/* Game Wallet (₦) */}
             <div className="p-6 rounded-3xl bg-gradient-to-br from-yellow-500/15 via-purple-500/10 to-amber-500/10 dark:from-yellow-500/20 dark:to-purple-600/20 border border-slate-200 dark:border-white/10 shadow-xl relative overflow-hidden group text-slate-900 dark:text-white flex flex-col justify-between">
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex justify-between items-start relative z-10">
                   <div className="text-left space-y-1">
                     <p className="text-[10px] font-black uppercase tracking-widest text-yellow-700 dark:text-yellow-500">Game Wallet (₦)</p>
                     <p className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white">₦{gameWalletBalance.toLocaleString()}</p>
                   </div>
                   <div className="flex flex-col gap-1.5">
                      <Button 
                        onClick={() => {
                          setWithdrawAmountInput('');
                          setIsWithdrawAmountModalOpen(true);
                        }} 
                        disabled={isWithdrawing} 
                        className="h-8 px-3.5 rounded-xl font-black uppercase text-[9px] bg-yellow-500 hover:bg-yellow-400 text-black shadow-md"
                      >
                        {isWithdrawing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Withdraw'}
                      </Button>
                      <Button 
                        onClick={() => {
                          setFundingAmount('');
                          setIsFundingModalOpen(true);
                        }} 
                        className="h-8 px-3.5 rounded-xl font-black uppercase text-[9px] bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10"
                      >
                        Add Funds
                      </Button>
                   </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[9px] font-bold text-slate-500 dark:text-muted-foreground uppercase tracking-widest relative z-10">
                   <span>Winnings & Host Earnings</span>
                   <span className="text-emerald-600 dark:text-emerald-400 font-black">0% Fee</span>
                </div>
             </div>

             {/* AuraCoin Balance (🪙) */}
             <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/15 via-yellow-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-yellow-600/15 border border-slate-200 dark:border-white/10 shadow-xl relative overflow-hidden group text-slate-900 dark:text-white flex flex-col justify-between">
                <div className="flex justify-between items-start relative z-10">
                   <div className="text-left space-y-1">
                     <div className="flex items-center gap-1.5">
                       <AuraCoinIcon size="xs" className="w-3.5 h-3.5" />
                       <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">AuraCoins</p>
                     </div>
                     <p className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                       {auraCoinsBalance.toLocaleString()}
                       <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">🪙</span>
                     </p>
                   </div>
                   <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[8px] font-black uppercase tracking-widest">
                     Reward Coins
                   </Badge>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[9px] font-bold text-slate-500 dark:text-muted-foreground uppercase tracking-widest relative z-10">
                   <span>Use for Room Prizes & Perks</span>
                   <span className="text-amber-600 dark:text-amber-400 font-black">Game Utility</span>
                </div>
             </div>

             {/* Recent Activity */}
             <div className="p-6 rounded-3xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 shadow-xl flex flex-col justify-between">
                 <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-white/5 pb-2">
                    <div className="flex items-center gap-2">
                       <History className="w-3.5 h-3.5 text-primary" />
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white">Recent Activity</span>
                    </div>
                    {gameActivity.length > 0 && (
                      <span className="text-[8px] font-black text-muted-foreground uppercase">{gameActivity.length} Recent</span>
                    )}
                 </div>
                 <div className="flex-1 space-y-2 overflow-y-auto max-h-32 custom-scrollbar pr-1">
                    {gameActivity.map((act) => {
                       let dateObj: Date | null = null;
                       const ts = act.timestamp || act.created_at || act.createdAt;
                       if (ts) {
                         if (typeof ts.toDate === 'function') {
                           dateObj = ts.toDate();
                         } else if (typeof ts.toMillis === 'function') {
                           dateObj = new Date(ts.toMillis());
                         } else if (typeof ts === 'number') {
                           dateObj = new Date(ts > 1e11 ? ts : ts * 1000);
                         } else if (ts.seconds) {
                           dateObj = new Date(ts.seconds * 1000);
                         } else if (typeof ts === 'string') {
                           const parsed = new Date(ts);
                           if (!isNaN(parsed.getTime())) dateObj = parsed;
                         }
                       }

                       const dateStr = dateObj 
                         ? `${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • ${dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                         : 'Recent';
                       
                       const isAuraCoin = act.currency === 'auracoin' || 
                                          act.currency === 'aura_coins' || 
                                          act.type === 'referral_bonus' || 
                                          act.type === 'referral_reward' || 
                                          act.desc?.toLowerCase().includes('auracoin') || 
                                          act.desc?.includes('🪙') ||
                                          act.title?.toLowerCase().includes('auracoin');

                       const positiveTypes = [
                         'win', 
                         'game_win', 
                         'entry_earnings', 
                         'referral_earning', 
                         'referral_reward', 
                         'referral_bonus', 
                         'fund_from_main', 
                         'host_reclaim', 
                         'create_room_refund', 
                         'room_cancelled_refund', 
                         'pool_cancelled_refund', 
                         'admin_credit',
                         'deposit'
                       ];

                       const isPositive = positiveTypes.includes(act.type);
                       const rawAmt = Math.abs(act.amount !== undefined && act.amount !== null ? Number(act.amount) : 0);
                       const formattedAmt = isAuraCoin 
                         ? (Number.isInteger(rawAmt) ? rawAmt.toLocaleString() : rawAmt.toFixed(0)) 
                         : rawAmt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                       
                       let rawDescription = act.desc || act.description || act.title || 'Game Transaction';
                       const descriptionText = rawDescription
                         .replace(/\.?\s*Platform kept fee\.?/gi, '.')
                         .replace(/\.\.+$/, '.')
                         .trim();

                       return (
                         <div key={act.id} className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/[0.04] last:border-b-0">
                            <div className="text-left flex-1 min-w-0 pr-2">
                               <p className="text-[10px] font-bold text-slate-700 dark:text-white/90 truncate" title={descriptionText}>{descriptionText}</p>
                               <p className="text-[8px] text-muted-foreground uppercase font-medium">{dateStr}</p>
                            </div>
                            {isAuraCoin ? (
                              <span className={`text-[10px] font-black shrink-0 flex items-center gap-1 ${isPositive ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                 {isPositive ? '+' : '-'}{formattedAmt}
                                 <AuraCoinIcon size="xs" className="w-3 h-3 inline-block" />
                              </span>
                            ) : (
                              <span className={`text-[10px] font-black shrink-0 ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                 {isPositive ? '+' : '-'}₦{formattedAmt}
                              </span>
                            )}
                         </div>
                       );
                     })}
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

      {/* Funding Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isFundingModalOpen && (
            <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setFundingAmount(''); setIsFundingModalOpen(false); }} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl p-8 space-y-8 max-h-[85vh] overflow-y-auto custom-scrollbar rounded-2xl sm:rounded-3xl text-slate-900 dark:text-white">
                 <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20">
                       <Plus className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Add Game Funds</h2>
                    <p className="text-[10px] text-slate-500 dark:text-muted-foreground font-bold uppercase tracking-widest">Internal Wallet Transfer</p>
                 </div>

                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground">Select Source Balance</label>
                       <div className="grid grid-cols-1 gap-2">
                          {[
                            { id: 'funded', label: 'Main Wallet Balance', balance: mainWalletBalance, color: 'text-primary' },
                            { id: 'host', label: 'Host Earnings', balance: hostBalance, color: 'text-amber-500' },
                            { id: 'referral', label: 'Referral Balance', balance: referralBalance, color: 'text-orange-500' }
                          ].map(src => (
                            <button 
                              key={src.id}
                              onClick={() => setFundingSource(src.id as any)}
                              className={`p-4 rounded-xl border flex items-center justify-between transition-all ${fundingSource === src.id ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10' : 'bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-white/5 opacity-60 hover:opacity-100'}`}
                            >
                               <span className={`text-[10px] font-black uppercase ${fundingSource === src.id ? src.color : 'text-slate-500 dark:text-white/40'}`}>{src.label}</span>
                               <span className="text-xs font-black text-slate-900 dark:text-white">₦{src.balance.toLocaleString()}</span>
                            </button>
                          ))}
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground">Amount to Transfer (₦)</label>
                       <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 dark:text-white/40">₦</span>
                          <input 
                            type="number" 
                            min="0"
                            value={fundingAmount} 
                            onChange={e => {
                               const val = e.target.value;
                               if (val.startsWith('-')) return;
                               setFundingAmount(val);
                            }} 
                            placeholder="0.00" 
                            className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3.5 pl-10 pr-4 text-sm font-black outline-none focus:border-primary/50 text-slate-900 dark:text-white" 
                          />
                       </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-3">
                       <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                       <p className="text-[9px] text-emerald-700 dark:text-emerald-200/70 font-medium uppercase leading-relaxed tracking-tight">Move funds between your wallets with <strong className="text-emerald-600 dark:text-emerald-400">0% fees</strong>. Instant transfer.</p>
                    </div>
                 </div>

                 <div className="flex flex-col gap-3">
                    <Button onClick={handleFundFromWallet} disabled={isSubmittingFunding} className="w-full h-14 gradient-bg rounded-2xl font-black uppercase tracking-widest text-xs">
                       {isSubmittingFunding ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Transfer'}
                    </Button>
                    <Button variant="ghost" onClick={() => { setFundingAmount(''); setIsFundingModalOpen(false); }} className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-900 dark:text-white/40 dark:hover:text-white">Cancel</Button>
                 </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Featured Game Info */}
      <div className="glass-card p-1 border-slate-200 dark:border-white/10 overflow-hidden relative group bg-white/70 dark:bg-slate-900/60 shadow-sm">
         <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-purple-500/10 to-transparent opacity-50 pointer-events-none" />
         <div className="relative z-10 p-8 flex flex-col md:flex-row items-center gap-8">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-yellow-500 to-purple-600 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(234,179,8,0.3)]">
               <Swords className="w-12 h-12 text-white" />
            </div>
            <div className="space-y-3 text-center md:text-left">
               <Badge className="bg-slate-900/10 dark:bg-white/10 text-slate-900 dark:text-white border-slate-900/20 dark:border-white/20 font-black">NOW AVAILABLE</Badge>
               <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">Split or Steal</h2>
               <p className="text-sm text-slate-600 dark:text-muted-foreground font-medium max-w-xl">
                 Two players are randomly selected. You have 60 seconds to chat and convince each other. Then, you must choose to Split or Steal.
               </p>
               <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-yellow-600 dark:text-yellow-500">
                    <div className="w-2 h-2 rounded-full bg-yellow-500" /> Split + Split = Share
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">
                    <div className="w-2 h-2 rounded-full bg-purple-500" /> Split + Steal = Stealer Takes All
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
                    <div className="w-2 h-2 rounded-full bg-slate-500" /> Steal + Steal = Nothing
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* Live Lobbies */}
      <div className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 dark:text-muted-foreground flex items-center gap-2">
          <Timer className="w-4 h-4 text-yellow-500" /> Active Lobbies
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map(game => (
            <Card key={game.id} className="glass-card border-slate-200 dark:border-white/10 overflow-hidden group hover:border-yellow-500/50 dark:hover:border-yellow-500/30 transition-all bg-white dark:bg-slate-900/60 shadow-sm">
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                   {(() => {
                    const required = (game.numberOfRounds || 1) * 2;
                    const filled = game.participants?.length || 0;
                    const isComplete = filled === required;
                    const isLive = game.status !== 'waiting' && game.status !== 'finished';
                    
                    if (game.status === 'finished') {
                      return (
                        <Badge className="bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-white/50 dark:border-white/10 uppercase font-black text-[9px] tracking-widest">
                          ROOM ENDED
                        </Badge>
                      );
                    } else if (isLive || game.status === 'live') {
                      return (
                        <Badge className="bg-rose-500 text-white border-none uppercase font-black text-[9px] tracking-widest">
                          LIVE NOW
                        </Badge>
                      );
                    } else if (isComplete) {
                      return (
                        <Badge className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-500 border border-yellow-500/30 uppercase font-black text-[9px] tracking-widest animate-pulse">
                          LOBBY READY FOR ACTION
                        </Badge>
                      );
                    } else {
                      return (
                        <Badge className="bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 dark:border-none uppercase font-black text-[9px] tracking-widest">
                          WAITING FOR PLAYERS
                        </Badge>
                      );
                    }
                  })()}
                  <div className="flex items-center gap-2">
                    {(isAdmin || game.hostUid === user?.uid) && (
                      <button 
                        onClick={(e) => handleDeleteRoom(e, game)}
                        disabled={isDeletingId === game.id}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50"
                      >
                        {isDeletingId === game.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-[10px] font-black tracking-widest text-slate-600 dark:text-white/60">
                      <Users className="w-3.5 h-3.5" />
                      {game.participants?.length || 0} / {(game.numberOfRounds || 1) * 2}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">{game.roomName}</h3>
                  <p className="text-[10px] text-slate-500 dark:text-muted-foreground font-bold uppercase tracking-widest">Host: {game.hostName}</p>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex justify-between items-end">
                   <div className="flex gap-6">
                      <div>
                        <p className="text-[9px] text-slate-500 dark:text-muted-foreground uppercase font-black tracking-widest flex items-center gap-1">
                          {game.entryType === 'auracoin' && <AuraCoinIcon size="xs" className="w-2.5 h-2.5 inline" />}
                          Entry Fee
                        </p>
                        <p className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1">
                          {game.entryType === 'auracoin' ? `${(game.entryFee || 0).toLocaleString()} 🪙` : `₦${(game.entryFee || 0).toLocaleString()}`}
                        </p>
                      </div>
                      {game.prizeAmount > 0 && (
                        <div>
                          <p className="text-[9px] text-yellow-600 dark:text-yellow-500/80 uppercase font-black tracking-widest flex items-center gap-1">
                            {game.prizeType === 'auracoin' && <AuraCoinIcon size="xs" className="w-2.5 h-2.5 inline" />}
                            Prize Pool
                          </p>
                          <p className="text-lg font-black text-yellow-600 dark:text-yellow-500 flex items-center gap-1">
                            {game.prizeType === 'auracoin' ? `${game.prizeAmount.toLocaleString()} 🪙` : `₦${game.prizeAmount.toLocaleString()}`}
                          </p>
                        </div>
                      )}
                   </div>
                   <div className="flex gap-2 shrink-0">
                     <Button
                       onClick={(e) => handleShareRoom(e, game)}
                       variant="outline"
                       className="h-9 w-9 rounded-xl border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-white flex items-center justify-center p-0 transition-colors"
                       title="Share Room Link"
                     >
                       <Share2 className="w-3.5 h-3.5" />
                     </Button>
                     <Button 
                      disabled={isSubmitting}
                      onClick={() => handleJoinClick(game)}
                      className="h-9 px-5 rounded-xl font-black uppercase text-[10px] bg-yellow-500 hover:bg-yellow-400 text-black shadow-md shadow-yellow-500/20 active:scale-95 transition-all disabled:opacity-50"
                     >
                       {isSubmitting ? '...' : 'Enter Room'}
                     </Button>
                   </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Detailed Game Rules & Operator's Guide */}
      <div className="glass-card p-6 md:p-10 border-slate-200 dark:border-white/10 relative overflow-hidden mt-12 bg-white dark:bg-slate-900/60 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-purple-500/5 to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-8">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                 <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div>
                 <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">How it Works & Arena Rules</h2>
                 <p className="text-[10px] md:text-xs text-slate-500 dark:text-muted-foreground font-bold uppercase tracking-widest">Master the Split or Steal Game & Lobbies</p>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Step 1: Create */}
              <div className="space-y-3 p-5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-primary/30 transition-all">
                 <div className="w-8 h-8 rounded-lg bg-yellow-500/20 text-yellow-600 dark:text-yellow-500 flex items-center justify-center font-black text-sm">1</div>
                 <h4 className="font-black uppercase tracking-wider text-xs text-slate-900 dark:text-white">Create a Room</h4>
                 <p className="text-[10px] leading-relaxed text-slate-600 dark:text-muted-foreground font-medium">
                   Click <span className="text-yellow-600 dark:text-yellow-500 font-bold">"Create Room"</span>. Specify the name, number of rounds, entry fee (from Game Wallet), and prize pool. You must fund the prize pool from your Game or Referral Wallet.
                 </p>
              </div>

              {/* Step 2: Join */}
              <div className="space-y-3 p-5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-primary/30 transition-all">
                 <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black text-sm">2</div>
                 <h4 className="font-black uppercase tracking-wider text-xs text-slate-900 dark:text-white">Invite & Join</h4>
                 <p className="text-[10px] leading-relaxed text-slate-600 dark:text-muted-foreground font-medium">
                   Click the <span className="text-purple-600 dark:text-purple-400 font-bold">Share icon</span> to copy the direct invite link. Users can join as a <span className="text-slate-900 dark:text-white font-bold">Player</span> (requires paying the entry fee to enter the contestant pool) or as a <span className="text-slate-900 dark:text-white font-bold">Viewer</span>.
                 </p>
              </div>

              {/* Step 3: Matchmaking */}
              <div className="space-y-3 p-5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-primary/30 transition-all">
                 <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-500 flex items-center justify-center font-black text-sm">3</div>
                 <h4 className="font-black uppercase tracking-wider text-xs text-slate-900 dark:text-white">Arena Matchmaking</h4>
                 <p className="text-[10px] leading-relaxed text-slate-600 dark:text-muted-foreground font-medium">
                   Once the lobby is full, the host shuffles the participants. Two players enter the Arena per round. The host initiates a 60-second timer where they converse in the Arena Chat.
                 </p>
              </div>

              {/* Step 4: Split or Steal */}
              <div className="space-y-3 p-5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-primary/30 transition-all">
                 <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-500 flex items-center justify-center font-black text-sm">4</div>
                 <h4 className="font-black uppercase tracking-wider text-xs text-slate-900 dark:text-white">The Choice (Payouts)</h4>
                 <p className="text-[10px] leading-relaxed text-slate-600 dark:text-muted-foreground font-medium">
                   Both players secretly choose to <span className="text-yellow-600 dark:text-yellow-500 font-bold">Split</span> or <span className="text-purple-600 dark:text-purple-500 font-bold">Steal</span>. You have 10 seconds, but your choice is locked in during the final 5 seconds.
                 </p>
              </div>
           </div>

           {/* Outcomes & Financial breakdown */}
           <div className="pt-6 border-t border-slate-200 dark:border-white/5 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                 <h3 className="text-xs font-black uppercase tracking-[0.2em] text-yellow-600 dark:text-yellow-500 flex items-center gap-2">
                    <Coins className="w-4 h-4" /> Game Payout & Outcome Rules
                 </h3>
                 <div className="space-y-3 text-[10px] font-medium text-slate-600 dark:text-muted-foreground leading-relaxed">
                    <div className="flex gap-3 items-start">
                       <span className="font-black"><span className="text-yellow-600 dark:text-yellow-500">Split</span> + <span className="text-yellow-600 dark:text-yellow-500">Split</span> <span className="text-yellow-600 dark:text-yellow-500">(Share):</span></span>
                       <span>Both players split the prize pool for that round 50/50. Winnings are deposited immediately to your Game Wallet.</span>
                    </div>
                    <div className="flex gap-3 items-start">
                        <span className="font-black"><span className="text-purple-600 dark:text-purple-400">Steal</span> + <span className="text-yellow-600 dark:text-yellow-500">Split</span> <span className="text-purple-600 dark:text-purple-400">(Stealer Wins):</span></span>
                       <span>The player who chose Steal wins 100% of the round's prize pool. The player who chose Split gets ₦0.</span>
                    </div>
                    <div className="flex gap-3 items-start">
                        <span className="font-black"><span className="text-purple-600 dark:text-purple-400">Steal</span> + <span className="text-purple-600 dark:text-purple-400">Steal</span> <span className="text-rose-600 dark:text-rose-500">(No Winners):</span></span>
                       <span>Both players choose Steal. Nobody gets any money; the prize pool for that round is forfeited back to the game platform.</span>
                    </div>
                 </div>
              </div>

              <div className="space-y-4">
                 <h3 className="text-xs font-black uppercase tracking-[0.2em] text-purple-600 dark:text-purple-400 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Host Earnings & Chat Control
                 </h3>
                 <div className="space-y-3 text-[10px] font-medium text-slate-600 dark:text-muted-foreground leading-relaxed">
                    <div className="flex gap-3 items-start">
                       <span className="text-slate-900 dark:text-white font-bold">Hosting Rewards:</span>
                       <span>Hosts earn 100% of the player entry fees collected in the room. This makes room hosting an extremely profitable activity.</span>
                    </div>
                    <div className="flex gap-3 items-start">
                       <span className="text-slate-900 dark:text-white font-bold">Arena Chat Lockdown:</span>
                       <span>During active rounds, only the two active contestants are allowed to write in the Arena chat. Spectators and waiting players are view-only.</span>
                    </div>
                    <div className="flex gap-3 items-start">
                       <span className="text-slate-900 dark:text-white font-bold">Global Spectator Chat:</span>
                       <span>Viewers can chat in the Global channel to analyze the match, which is invisible to active contestants to prevent outside interference.</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Create Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isCreateModalOpen && (
            <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCreateModal} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
              <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar glass-card bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl sm:rounded-3xl">
                 <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 p-6 flex justify-between items-center z-20">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                          <Gamepad2 className="w-5 h-5 text-yellow-500" />
                       </div>
                       <div>
                         <h2 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white">Host a Game</h2>
                         <p className="text-[9px] text-slate-500 dark:text-muted-foreground font-bold uppercase tracking-widest">Split or Steal Event</p>
                       </div>
                    </div>
                    <button onClick={closeCreateModal} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-white"><X className="w-5 h-5" /></button>
                 </div>

                  <form onSubmit={handleCreateGame} className="p-6 space-y-6">
                    <div className="space-y-4">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground flex items-center">
                            <span>Room Name</span>
                            <FieldInfoHelper title="Room Name" description="Give your game room an exciting title to attract players from the lobby (e.g. '50k Friday Clash', 'Aura Winner Takes All')." />
                          </label>
                          <input type="text" required value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="e.g. 100k Challenge" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-yellow-500/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60" />
                       </div>

                        {/* Entry Fee Currency & Amount Configuration */}
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-4">
                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground flex items-center justify-between">
                                 <span className="flex items-center">
                                   <span>Entry Fee Currency</span>
                                   <FieldInfoHelper title="Entry Fee Currency" description="Choose how contestants pay to join. Real Money uses Game Wallet balances (₦), while AuraCoins (🪙) uses earned platform reward tokens." />
                                 </span>
                                 <span className="text-[9px] font-bold text-slate-400">
                                   {entryType === 'cash' ? `Balance: ₦${gameWalletBalance.toLocaleString()}` : `Balance: ${auraCoinsBalance.toLocaleString()} 🪙`}
                                 </span>
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                 <button 
                                   type="button" 
                                   onClick={() => setEntryType('cash')} 
                                   className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                                     entryType === 'cash' 
                                       ? 'bg-yellow-500/15 border-yellow-500 text-yellow-700 dark:text-yellow-400 shadow-md' 
                                       : 'bg-white dark:bg-black/30 border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:border-slate-300'
                                   }`}
                                 >
                                    <div className="text-left">
                                       <span className="text-xs font-black uppercase block">Game Wallet (₦)</span>
                                       <span className="text-[9px] opacity-70 font-medium">Real Money Entry</span>
                                    </div>
                                    <span className="text-base font-black">₦</span>
                                 </button>
                                 <button 
                                   type="button" 
                                   onClick={() => setEntryType('auracoin')} 
                                   className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                                     entryType === 'auracoin' 
                                       ? 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-400 shadow-md' 
                                       : 'bg-white dark:bg-black/30 border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:border-slate-300'
                                   }`}
                                 >
                                    <div className="text-left">
                                       <span className="text-xs font-black uppercase block flex items-center gap-1">
                                         AuraCoins <AuraCoinIcon size="xs" className="inline w-3 h-3" />
                                       </span>
                                       <span className="text-[9px] opacity-70 font-medium">Reward Coin Entry</span>
                                    </div>
                                    <span className="text-base font-black">🪙</span>
                                 </button>
                              </div>
                           </div>

                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground flex items-center">
                                 <span>{entryType === 'auracoin' ? 'Entry Fee per User (🪙 AuraCoins)' : 'Entry Fee per User (₦)'}</span>
                                 <FieldInfoHelper title="Entry Fee Amount" description="The amount each player pays to enter the contestant pool. 80% of all collected entry fees are paid to your host balance upon matchmaking (100% for Admins)." />
                              </label>
                              <div className="relative">
                                 <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 dark:text-white/40 text-sm">
                                   {entryType === 'auracoin' ? '🪙' : '₦'}
                                 </span>
                                 <input 
                                   type="number" 
                                   required 
                                   value={entryFee} 
                                   onChange={e => setEntryFee(e.target.value)} 
                                   placeholder={entryType === 'auracoin' ? 'e.g. 50' : 'e.g. 50'} 
                                   min="0" 
                                   className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm font-bold outline-none focus:border-yellow-500/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60" 
                                 />
                              </div>
                           </div>
                        </div>

                       <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-muted-foreground flex items-center">
                              <span>Multiple Rounds?</span>
                              <FieldInfoHelper title="Multi-Round Arena" description="Enable this to host multiple successive 1v1 showdowns in one room session. 2 players from the pool are paired per round." />
                            </label>
                            <input type="checkbox" checked={isMultipleRounds} onChange={e => setIsMultipleRounds(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
                          </div>
                          <AnimatePresence>
                             {isMultipleRounds && (
                               <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground flex items-center">
                                    <span>Number of Rounds</span>
                                    <FieldInfoHelper title="Rounds Count" description="Total number of 1v1 matches in this room. The lobby capacity automatically scales to 2 players per round (e.g. 5 rounds = 10 players required)." />
                                  </label>
                                  <input type="number" required={isMultipleRounds} value={numberOfRounds} onChange={e => setNumberOfRounds(e.target.value)} placeholder="e.g. 5" min="1" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 px-4 text-sm font-bold outline-none focus:border-yellow-500/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60" />
                               </motion.div>
                             )}
                          </AnimatePresence>
                       </div>

                       {/* Prize Currency & Amount Configuration */}
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-4">
                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground flex items-center justify-between">
                                 <span className="flex items-center">
                                   <span>Reward Prize Currency</span>
                                   <FieldInfoHelper title="Reward Prize Currency" description="Select whether round winners receive Real Cash (₦) or AuraCoins (🪙). This prize is funded upfront by the host." />
                                 </span>
                                 <span className="text-[9px] font-bold text-slate-400">
                                   {prizeType === 'cash' ? `Available: ₦${gameWalletBalance.toLocaleString()}` : `Available: ${auraCoinsBalance.toLocaleString()} 🪙`}
                                 </span>
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                 <button 
                                   type="button" 
                                   onClick={() => setPrizeType('cash')} 
                                   className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                                     prizeType === 'cash' 
                                       ? 'bg-yellow-500/15 border-yellow-500 text-yellow-700 dark:text-yellow-400 shadow-md' 
                                       : 'bg-white dark:bg-black/30 border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:border-slate-300'
                                   }`}
                                 >
                                    <div className="text-left">
                                       <span className="text-xs font-black uppercase block">Game Wallet (₦)</span>
                                       <span className="text-[9px] opacity-70 font-medium">Real Money Prize</span>
                                    </div>
                                    <span className="text-base font-black">₦</span>
                                 </button>
                                 <button 
                                   type="button" 
                                   onClick={() => setPrizeType('auracoin')} 
                                   className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                                     prizeType === 'auracoin' 
                                       ? 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-400 shadow-md' 
                                       : 'bg-white dark:bg-black/30 border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:border-slate-300'
                                   }`}
                                 >
                                    <div className="text-left">
                                       <span className="text-xs font-black uppercase block flex items-center gap-1">
                                         AuraCoins <AuraCoinIcon size="xs" className="inline w-3 h-3" />
                                       </span>
                                       <span className="text-[9px] opacity-70 font-medium">Reward Coin Prize</span>
                                    </div>
                                    <span className="text-base font-black">🪙</span>
                                 </button>
                              </div>
                           </div>

                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground flex items-center justify-between">
                                 <span className="flex items-center">
                                   <span>{prizeType === 'auracoin' ? 'Prize Per Round (🪙 AuraCoins)' : 'Prize Per Round (₦)'}</span>
                                   <FieldInfoHelper title="Prize Per Round" description="The reward pot up for grabs in each 1v1 match. If both Split, they share 50/50. If one Steals, they win 100%. If both Steal, nobody wins." />
                                 </span>
                                 {calculateTotalPrizeCost() > 0 && (
                                   <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                     Total: {prizeType === 'auracoin' ? `${calculateTotalPrizeCost().toLocaleString()} Coins` : `₦${calculateTotalPrizeCost().toLocaleString()}`}
                                   </span>
                                 )}
                              </label>
                              <div className="relative">
                                 <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 dark:text-white/40 text-sm">
                                   {prizeType === 'auracoin' ? '🪙' : '₦'}
                                 </span>
                                 <input 
                                   type="number" 
                                   required 
                                   value={prizePerRound} 
                                   onChange={e => setPrizePerRound(e.target.value)} 
                                   placeholder={prizeType === 'auracoin' ? 'e.g. 500' : 'e.g. 1000'} 
                                   min="0" 
                                   className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm font-bold outline-none focus:border-yellow-500/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60" 
                                 />
                              </div>
                           </div>
                        </div>

                       <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground flex items-center">
                            <span>Start Condition</span>
                            <FieldInfoHelper title="Start Condition" description="Auto-Start begins the contestant shuffle automatically once the player lobby is full. Manual Start allows the host to shuffle and start whenever ready." />
                          </label>
                          <div className="flex gap-2">
                             <button type="button" onClick={() => setStartCondition('auto')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${startCondition === 'auto' ? 'bg-yellow-500 text-black shadow-lg font-black' : 'bg-slate-200/70 dark:bg-black/40 text-slate-600 dark:text-muted-foreground border border-slate-300 dark:border-white/10'}`}>Auto-Start</button>
                             <button type="button" onClick={() => setStartCondition('manual')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${startCondition === 'manual' ? 'bg-yellow-500 text-black shadow-lg font-black' : 'bg-slate-200/70 dark:bg-black/40 text-slate-600 dark:text-muted-foreground border border-slate-300 dark:border-white/10'}`}>Manual Start</button>
                          </div>
                          
                          {startCondition === 'auto' && (
                             <div className="space-y-2 pt-2">
                               <label className="text-[9px] font-bold text-slate-500 dark:text-muted-foreground uppercase">When pool reaches:</label>
                                <div className="p-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black text-yellow-600 dark:text-yellow-500 uppercase tracking-widest text-center shadow-xs">
                                  {isMultipleRounds 
                                    ? (numberOfRounds && !isNaN(parseInt(numberOfRounds)) 
                                        ? `${parseInt(numberOfRounds) * 2} Players (Lobby Full)` 
                                        : 'Enter Rounds Count') 
                                    : '2 Players (Lobby Full)'}
                                </div>
                             </div>
                          )}
                       </div>

                       {isAdmin && (
                         <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-4">
                           <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 flex items-center">
                                  <span>Admin Bypass: Manual Pairing</span>
                                  <FieldInfoHelper title="Manual Pairing" description="Allows system administrators to directly assign specific Aura user IDs for Player A and Player B." />
                                </span>
                              </div>
                              <input type="checkbox" checked={isManualPairing} onChange={e => setIsManualPairing(e.target.checked)} className="w-4 h-4 accent-purple-500" />
                           </div>
                           
                           <AnimatePresence>
                             {isManualPairing && (
                               <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                                  <input type="text" value={playerAId} onChange={e => setPlayerAId(e.target.value)} placeholder="Player A Aura ID" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 px-3 text-xs outline-none focus:border-purple-500/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60" />
                                  <input type="text" value={playerBId} onChange={e => setPlayerBId(e.target.value)} placeholder="Player B Aura ID" className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 px-3 text-xs outline-none focus:border-purple-500/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60" />
                               </motion.div>
                             )}
                           </AnimatePresence>
                         </div>
                       )}

                       <div className="flex gap-4">
                         <div className={`flex-1 p-4 rounded-xl border flex flex-col justify-center ${entryType === 'auracoin' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
                            <div className="space-y-1">
                              <p className={`text-[10px] font-black uppercase tracking-widest flex items-center ${entryType === 'auracoin' ? 'text-amber-600 dark:text-amber-500' : 'text-yellow-600 dark:text-yellow-500'}`}>
                                 <span>Host Earnings ({isAdmin ? '100%' : '80%'})</span>
                                 <FieldInfoHelper title="Host Revenue" description="Your revenue from player entry fees. Regular hosts earn 80% (10% to platform / 10% to active referrer), while System Admins keep 100%." />
                              </p>
                              <p className="text-[9px] text-slate-500 dark:text-muted-foreground font-medium">From pool entries</p>
                            </div>
                            <p className="text-xl font-black text-slate-900 dark:text-white mt-2 flex items-center gap-1">
                              {entryType === 'auracoin' ? `${calculateHostEarnings().toLocaleString()} 🪙` : `₦${calculateHostEarnings().toLocaleString()}`}
                            </p>
                         </div>
                         <div className={`flex-1 p-4 rounded-xl border flex flex-col justify-center ${prizeType === 'auracoin' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                             <div className="space-y-1">
                               <p className={`text-[10px] font-black uppercase tracking-widest flex items-center ${prizeType === 'auracoin' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-500'}`}>
                                 <span>Total Prize Cost</span>
                                 <FieldInfoHelper title="Total Prize Cost" description="Total funds deducted from your wallet to back the room prize. Any unplayed rounds or unspent prizes are 100% refunded if the room is cancelled." />
                               </p>
                               <p className="text-[9px] text-slate-500 dark:text-muted-foreground font-medium">
                                 {prizeType === 'auracoin' ? 'Deducted from AuraCoins' : 'Deducted from Game Wallet'}
                               </p>
                             </div>
                             <p className="text-xl font-black text-slate-900 dark:text-white mt-2 flex items-center gap-1">
                               {prizeType === 'auracoin' ? `${calculateTotalPrizeCost().toLocaleString()} 🪙` : `₦${calculateTotalPrizeCost().toLocaleString()}`}
                             </p>
                          </div>
                       </div>
                    </div>

                    <Button type="submit" disabled={isSubmitting} className="w-full h-14 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest rounded-xl shadow-lg shadow-yellow-500/20 text-xs">
                        {isSubmitting ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                        ) : (
                          calculateTotalPrizeCost() > 0 
                            ? (prizeType === 'auracoin' 
                                ? `Fund ${calculateTotalPrizeCost().toLocaleString()} Coins & Create Pool` 
                                : `Pay ₦${calculateTotalPrizeCost().toLocaleString()} & Create Pool`)
                            : 'Create & Open Pool'
                        )}
                     </Button>
                 </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Withdrawal Amount Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isWithdrawAmountModalOpen && (
            <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeWithdrawAmountModal} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm glass-card bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 shadow-2xl p-8 space-y-8 max-h-[85vh] overflow-y-auto custom-scrollbar rounded-2xl sm:rounded-3xl">
                 <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-3xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-4 border border-yellow-500/20">
                       <ArrowUpRight className="w-8 h-8 text-yellow-500" />
                    </div>
                    <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Withdraw Winnings</h2>
                    <p className="text-[10px] text-slate-500 dark:text-muted-foreground font-bold uppercase tracking-widest">Move to Main Earnings Wallet</p>
                 </div>

                 <div className="space-y-6">
                    <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex justify-between items-center">
                       <span className="text-[10px] font-black uppercase text-yellow-700 dark:text-yellow-500/60 tracking-widest">Available</span>
                       <span className="text-xl font-black text-slate-900 dark:text-white">₦{gameWalletBalance.toLocaleString()}</span>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground">Amount to Withdraw (₦)</label>
                       <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 dark:text-white/40">₦</span>
                          <input 
                            type="number" 
                            min="0" value={withdrawAmountInput} 
                             onChange={e => {
                               const val = e.target.value;
                               if (val.startsWith("-")) return;
                               setWithdrawAmountInput(val);
                             }} 
                            placeholder="0.00" 
                            className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3.5 pl-10 pr-4 text-sm font-black outline-none focus:border-primary/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60" 
                          />
                       </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-3">
                       <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                       <p className="text-[9px] text-emerald-700 dark:text-emerald-200/70 font-medium uppercase leading-relaxed tracking-tight">Funds will be moved to your <strong className="text-emerald-600 dark:text-emerald-400">Host Earnings</strong> wallet with <strong className="text-emerald-600 dark:text-emerald-400">0% fees</strong>. Instant transfer.</p>
                    </div>
                 </div>

                 <div className="flex flex-col gap-3">
                    <Button onClick={handleWithdrawGameWallet} disabled={isWithdrawing || !withdrawAmountInput || parseFloat(withdrawAmountInput) <= 0 || parseFloat(withdrawAmountInput) > gameWalletBalance} className="w-full h-14 gradient-bg rounded-2xl font-black uppercase tracking-widest text-xs">
                       {isWithdrawing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Withdrawal'}
                    </Button>
                    <Button variant="ghost" onClick={closeWithdrawAmountModal} className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-900 dark:text-white/40 dark:hover:text-white">Cancel</Button>
                 </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Confirmation Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isConfirmWithdrawModalOpen && (
            <div className="fixed inset-0 z-[7000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeConfirmWithdrawModal} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm glass-card bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 shadow-2xl p-8 space-y-6 text-center rounded-2xl sm:rounded-3xl">
                 <div className="w-16 h-16 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 flex items-center justify-center mx-auto border border-yellow-500/20">
                    <ShieldAlert className="w-8 h-8" />
                 </div>
                 <div className="space-y-2">
                    <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white">Confirm Transfer</h3>
                    <p className="text-xs text-slate-600 dark:text-muted-foreground font-medium uppercase leading-relaxed px-4">
                      Are you sure you want to move ₦{parseFloat(withdrawAmountInput).toLocaleString()} to your Main Earnings wallet?
                    </p>
                 </div>
                 <div className="flex flex-col gap-3">
                    <Button onClick={confirmWithdrawal} disabled={isWithdrawing} className="w-full h-12 gradient-bg rounded-xl font-black uppercase text-[10px]">Yes, Move Funds</Button>
                    <Button variant="ghost" onClick={closeConfirmWithdrawModal} className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-900 dark:text-white/40 dark:hover:text-white">Cancel</Button>
                 </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Join Choice Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showJoinChoice && (
            <div className="fixed inset-0 z-[5001] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowJoinChoice(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm glass-card bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 shadow-2xl p-8 text-center space-y-8 rounded-2xl sm:rounded-3xl">
                 <div className="space-y-2">
                    <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">How do you want to join?</h2>
                    <p className="text-xs text-slate-500 dark:text-muted-foreground font-bold uppercase tracking-widest">
                      Room Fee: {joiningGame?.entryType === 'auracoin' ? `${(joiningGame?.entryFee || 0).toLocaleString()} 🪙` : `₦${(joiningGame?.entryFee || 0).toLocaleString()}`} 
                      <span className="text-yellow-600 dark:text-yellow-500 opacity-80 dark:opacity-60">
                        ({joiningGame?.entryType === 'auracoin' ? 'Paid from AuraCoins' : 'Paid from Game Wallet'})
                      </span>
                    </p>
                 </div>

                 <div className="grid grid-cols-1 gap-4">
                     {(() => {
                       const maxPlayers = (joiningGame?.numberOfRounds || 1) * 2;
                       const currentPlayers = joiningGame?.participants?.length || 0;
                       const isFull = currentPlayers >= maxPlayers;
                       
                       return (
                         <button 
                           disabled={isFull}
                           onClick={() => handleSelectRole('player')}
                           className={`group p-6 rounded-2xl border transition-all text-left flex items-center gap-4 ${
                             isFull 
                             ? 'opacity-40 cursor-not-allowed bg-red-500/5 border-red-500/20 text-slate-900 dark:text-white' 
                             : 'bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500 hover:text-black text-slate-900 dark:text-white'
                           }`}
                         >
                            <div className="w-12 h-12 rounded-xl bg-yellow-500/20 group-hover:bg-black/10 flex items-center justify-center shrink-0">
                               <Swords className={`w-6 h-6 ${isFull ? 'text-red-400' : 'text-yellow-600 dark:text-yellow-500 group-hover:text-black'}`} />
                            </div>
                            <div>
                               <p className="font-black uppercase text-sm">
                                 {isFull ? 'Player Slots Full' : 'Join to Compete'}
                               </p>
                               <p className="text-[10px] font-bold opacity-70">
                                 {isFull 
                                   ? `Limit of ${maxPlayers} players reached (${joiningGame?.numberOfRounds} rounds)`
                                   : `Pay fee and enter prize pool (${currentPlayers}/${maxPlayers} filled)`
                                 }
                               </p>
                            </div>
                         </button>
                       );
                     })()}

                    <button 
                      onClick={() => handleSelectRole('viewer')}
                      className="group p-6 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-left flex items-center gap-4 text-slate-900 dark:text-white"
                    >
                       <div className="w-12 h-12 rounded-xl bg-slate-200/50 dark:bg-white/5 group-hover:bg-slate-200 dark:group-hover:bg-white/10 flex items-center justify-center shrink-0">
                          <Users className="w-6 h-6 text-slate-600 dark:text-muted-foreground group-hover:text-slate-900 dark:group-hover:text-white" />
                       </div>
                       <div>
                          <p className="font-black uppercase text-sm">Watch Only</p>
                          <p className="text-[10px] font-bold opacity-70">Free entry. View only access.</p>
                       </div>
                    </button>
                 </div>

                 <Button variant="ghost" onClick={() => setShowJoinChoice(false)} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 dark:text-white/40 dark:hover:text-white">Cancel</Button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
