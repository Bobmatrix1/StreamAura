import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Share2, 
  Users, 
  Copy, 
  ShieldAlert,
  Info,
  TrendingUp,
  Timer,
  ExternalLink,
  ShieldCheck,
  LucideHistory,
  Building,
  CreditCard,
  CheckCircle2,
  Loader2,
  Banknote,
  ArrowUpRight,
  ChevronDown,
  X
} from 'lucide-react';

import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { LoginRequired } from '../components/LoginRequired';
import { Badge } from '../components/ui/badge';
import { db, auth } from '../lib/firebase';
import { collection, query, where, orderBy, limit, doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { fetchBanks, resolveBankAccount } from '../api/paymentApi';
import { API_BASE_URL } from '../api/mediaApi';

/**
 * Referral Section with Integrated Withdrawal
 */
const Referral: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { showSuccess, showError } = useToast();
  
  if (!isAuthenticated) {
    return (
      <LoginRequired 
        title="Refer & Earn"
        description="Share StreamAura with your friends and earn rewards that can be used for movie tickets and premium features."
        icon={Share2}
      />
    );
  }

  const [referralLink, setReferralLink] = useState('');
  const [referrals, setReferrals] = useState<any[]>([]);
  const [isLoadingReferrals, setIsLoadingReferrals] = useState(true);

  const [history, setHistory] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(true);
  
  // Withdrawal States
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);
  const [availableBanks, setAvailableBanks] = useState<any[]>([]);
  const [savedBankDetails, setSavedBankDetails] = useState({ name: '', account: '', bankName: '', bankCode: '' });
  const [bankDetails, setBankDetails] = useState({ name: '', account: '', bankName: '', bankCode: '' });
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [hasBankSet, setHasBankSet] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCancelBankEdit = () => {
    if (savedBankDetails.account && savedBankDetails.name && savedBankDetails.bankName && savedBankDetails.bankCode && savedBankDetails.account.length === 10) {
      setBankDetails(savedBankDetails);
      setBankSearch(savedBankDetails.bankName);
      setHasBankSet(true);
    }
    setShowBankDropdown(false);
  };

  const handleCloseWithdrawModal = () => {
    setWithdrawAmount('');
    if (savedBankDetails.account && savedBankDetails.name && savedBankDetails.bankName && savedBankDetails.bankCode && savedBankDetails.account.length === 10) {
      setBankDetails(savedBankDetails);
      setBankSearch(savedBankDetails.bankName);
      setHasBankSet(true);
    } else {
      setBankDetails({ name: '', account: '', bankName: '', bankCode: '' });
      setBankSearch('');
      setHasBankSet(false);
    }
    setShowBankDropdown(false);
    setIsWithdrawModalOpen(false);
  };

  // When withdraw modal opens, ensure saved bank is active
  useEffect(() => {
    if (isWithdrawModalOpen) {
      if (savedBankDetails.account && savedBankDetails.name && savedBankDetails.bankName && savedBankDetails.bankCode && savedBankDetails.account.length === 10) {
        setBankDetails(savedBankDetails);
        setBankSearch(savedBankDetails.bankName);
        setHasBankSet(true);
      }
      setShowBankDropdown(false);
    }
  }, [isWithdrawModalOpen, savedBankDetails]);

  // Scroll Lock Effect
  useEffect(() => {
    if (isWithdrawModalOpen) {
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
  }, [isWithdrawModalOpen]);

  useEffect(() => {
    if (user?.uid) {
      const baseUrl = window.location.origin;
      setReferralLink(`${baseUrl}/?ref=${user.uid}`);
    }
  }, [user?.uid]);

  useEffect(() => {
    // Load Banks
    const loadBanks = async () => {
      try {
        const result = await fetchBanks();
        if (result.status && Array.isArray(result.data)) {
          setAvailableBanks(result.data);
        }
      } catch (err) {}
    };
    loadBanks();
    
    // Check if bank already set
    const checkExistingBank = async () => {
       if (!user?.uid) return;
       const userRef = doc(db, 'users', user.uid);
       const userSnap = await getDoc(userRef);
       if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.bankDetails) {
             setSavedBankDetails(data.bankDetails);
             setBankDetails(data.bankDetails);
             if (data.bankDetails.name && data.bankDetails.bankName && data.bankDetails.bankCode && data.bankDetails.account?.length === 10) {
                setHasBankSet(true);
             }
          }
       }
    };
    checkExistingBank();

    const fetchReferrals = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/games/referrals/list`, {
          headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
        });
        const data = await response.json();
        if (data.success) {
          setReferrals(data.referrals);
        }
      } catch (err) {
        console.error('Failed to fetch referrals', err);
      } finally {
        setIsLoadingReferrals(false);
      }
    };

    let unsubHistory: (() => void) | null = null;
    if (user?.uid) {
      try {
        const activityRef = collection(db, 'game_wallets', user.uid, 'activity');
        const q = query(activityRef, orderBy('timestamp', 'desc'), limit(100));
        unsubHistory = onSnapshot(q, (snap) => {
          const referralItems = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter(item => item.type === 'referral_earning' || item.type === 'referral_reward' || item.type === 'referral_bonus');
          setHistory(referralItems);
          setIsLoadingHistory(false);
        }, (err) => {
          console.error('Failed to stream history', err);
          setIsLoadingHistory(false);
        });
      } catch (err) {
        setIsLoadingHistory(false);
      }
    }

    const fetchWithdrawals = () => {
      if (!user?.uid) return;
      const q = query(collection(db, 'withdrawals'), where('user_uid', '==', user.uid), orderBy('created_at', 'desc'), limit(20));
      const unsubscribe = onSnapshot(q, (snap) => {
        setWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setIsLoadingWithdrawals(false);
      }, (err) => {
        console.error('Failed to stream withdrawals', err);
        setIsLoadingWithdrawals(false);
      });
      return unsubscribe;
    };

    fetchReferrals();
    const unsubscribeWithdrawals = fetchWithdrawals();

    return () => {
      if (unsubHistory) unsubHistory();
      if (unsubscribeWithdrawals) unsubscribeWithdrawals();
    };
  }, [user?.uid]);

  // Click outside bank dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowBankDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Resolve account when 10 digits + bank code are present
  useEffect(() => {
    if (bankDetails.account.length === 10 && bankDetails.bankCode && !hasBankSet && !bankDetails.name) {
      const resolve = async () => {
        setIsResolving(true);
        try {
          const result = await resolveBankAccount(bankDetails.account, bankDetails.bankCode);
          if (result.status && result.data?.account_name) {
            setBankDetails(prev => ({ ...prev, name: result.data.account_name }));
            showSuccess("Account Verified!");
          } else {
            showError(result.message || "Could not verify account.");
            setBankDetails(prev => ({ ...prev, name: '' }));
          }
        } catch (err) {
          showError("Verification failed.");
          setBankDetails(prev => ({ ...prev, name: '' }));
        } finally {
          setIsResolving(false);
        }
      };
      resolve();
    } else if (bankDetails.account.length < 10 && bankDetails.name && !hasBankSet) {
      setBankDetails(prev => ({ ...prev, name: '' }));
    }
  }, [bankDetails.account, bankDetails.bankCode, hasBankSet]);

  const handleSelectBank = (bank: any) => {
    setBankDetails(prev => ({ ...prev, bankName: bank.name, bankCode: bank.code, name: '' }));
    setBankSearch(bank.name);
    setShowBankDropdown(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    showSuccess('Referral link copied to clipboard!');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on StreamAura!',
          text: 'Get ₦100 instantly when you sign up for StreamAura with my link! Download anything, watch movies together.',
          url: referralLink,
        });
      } catch (err) {
        console.error('Sharing failed', err);
      }
    } else {
      handleCopyLink();
    }
  };

  const handleWithdrawClick = () => {
    const bal = user?.referralBalance || 0;
    console.log("Withdraw clicked. Balance:", bal);
    setWithdrawAmount(bal > 0 ? bal.toString() : '');
    setIsWithdrawModalOpen(true);
  };

  const handleConfirmWithdrawal = async () => {
    if (!bankDetails.name || !bankDetails.account || !bankDetails.bankCode || !bankDetails.bankName || bankDetails.account.length !== 10) {
      showError("Please select a bank and verify your 10-digit account details first.");
      return;
    }

    setIsSubmittingWithdrawal(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const payload = {
        amount: parseFloat(withdrawAmount),
        bank_code: bankDetails.bankCode,
        bank_name: bankDetails.bankName,
        account_number: bankDetails.account,
        account_name: bankDetails.name
      };

      const response = await fetch(`${API_BASE_URL}/api/cinema/withdraw`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ ...payload, balance_type: 'referral' })
      });

      const result = await response.json();
      if (result.success) {
        showSuccess("Withdrawal request submitted! Payout processed within 24-48h.");
        setIsWithdrawModalOpen(false);
        setWithdrawAmount('');
        // Save bank details for next time
        const userRef = doc(db, 'users', user!.uid);
        await updateDoc(userRef, { bankDetails });
        setSavedBankDetails(bankDetails);
        setHasBankSet(true);
      } else {
        showError(result.detail || "Withdrawal failed.");
      }
    } catch (err) {
      showError("Connection error.");
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  const getExpiryCountdown = (createdAt: any) => {
    let createdTs = 0;
    if (createdAt && typeof createdAt === 'object') {
      if (typeof createdAt.toDate === 'function') {
        createdTs = createdAt.toDate().getTime();
      } else if ('seconds' in createdAt) {
        createdTs = createdAt.seconds * 1000;
      } else if ('_seconds' in createdAt) {
        createdTs = createdAt._seconds * 1000;
      }
    } else if (typeof createdAt === 'number') {
      createdTs = createdAt > 1e11 ? createdAt : createdAt * 1000;
    } else if (typeof createdAt === 'string') {
      createdTs = new Date(createdAt).getTime();
    }

    if (!createdTs || isNaN(createdTs)) {
      return 'Active';
    }

    const expiryTs = createdTs + (90 * 24 * 3600 * 1000); // 90 days
    const now = Date.now();
    const remaining = expiryTs - now;

    if (remaining <= 0) return 'Expired';

    const days = Math.floor(remaining / (24 * 3600 * 1000));
    const hours = Math.floor((remaining % (24 * 3600 * 1000)) / (3600 * 1000));
    
    if (days > 0) return `${days}d left`;
    return `${hours}h left`;
  };

  const filteredBanks = availableBanks.filter(b => 
    b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  const stats = {
    totalReferred: user?.referredCount || 0,
    balance: user?.referralBalance || 0,
    bonusBalance: user?.bonusBalance || 0
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Withdrawal Modal */}
      <AnimatePresence>
        {isWithdrawModalOpen && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCloseWithdrawModal} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass-card p-8 border-slate-200 dark:border-white/10 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
               <button 
                 type="button" 
                 onClick={handleCloseWithdrawModal}
                 className="absolute right-6 top-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors"
               >
                 <X className="w-5 h-5" />
               </button>
               <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black uppercase text-slate-900 dark:text-white">Withdraw Earnings</h3>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest opacity-60">Commission Payout to Bank</p>
               </div>

               <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-500/60 tracking-widest">Total Available</span>
                    <span className="text-xl font-black text-slate-900 dark:text-white">₦{stats.balance.toLocaleString()}</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-white/40">Amount to Withdraw</label>
                    <div className="relative">
                      <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-muted-foreground" />
                      <input 
                        type="number" 
                        value={withdrawAmount} 
                        onChange={e => setWithdrawAmount(e.target.value)} 
                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg py-2 pl-9 pr-4 text-xs font-black outline-none focus:border-primary/50 text-slate-900 dark:text-white" 
                        placeholder="0.00"
                      />
                    </div>
                  </div>
               </div>

               {stats.balance <= 0 && (
                 <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 flex items-center gap-3">
                    <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" />
                    <p className="text-[9px] text-rose-700 dark:text-rose-200/70 font-bold uppercase tracking-tight leading-none">Commissions are earned when your referrals host rooms.</p>
                 </div>
               )}

               {!hasBankSet ? (
                  <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payout Destination</span>
                        {savedBankDetails.name && savedBankDetails.bankName && savedBankDetails.bankCode && (
                          <button 
                            type="button"
                            onClick={handleCancelBankEdit}
                            className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                          >
                            Cancel Edit
                          </button>
                        )}
                     </div>
                     <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-3">
                        <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[9px] text-amber-700 dark:text-amber-200/70 font-bold uppercase leading-relaxed">Please provide your bank details. We'll save them for future payouts.</p>
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account Number</label>
                       <div className="relative">
                         <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-muted-foreground" />
                         <input 
                           value={bankDetails.account} 
                           onChange={e => {
                             const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                             setBankDetails(prev => ({ 
                               ...prev, 
                               account: val,
                               name: val.length !== 10 || val !== prev.account ? '' : prev.name
                             }));
                           }} 
                           placeholder="0123456789" 
                           className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-3 pl-11 pr-11 text-sm outline-none focus:border-primary/50 text-slate-900 dark:text-white font-bold" 
                         />
                         {isResolving && (
                           <div className="absolute right-4 top-1/2 -translate-y-1/2">
                             <Loader2 className="w-4 h-4 text-primary animate-spin" />
                           </div>
                         )}
                       </div>
                     </div>
                     <div className="space-y-2 relative" ref={dropdownRef}>
                       <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Select Bank</label>
                       <div className="relative">
                         <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-muted-foreground" />
                         <input 
                           value={bankSearch || bankDetails.bankName} 
                           onFocus={() => setShowBankDropdown(true)} 
                           onChange={e => {
                             setBankSearch(e.target.value);
                             setBankDetails(prev => ({ ...prev, bankName: e.target.value, bankCode: '', name: '' }));
                             setShowBankDropdown(true);
                           }} 
                           placeholder="Search bank..." 
                           className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-3 pl-11 pr-14 text-sm outline-none focus:border-primary/50 text-slate-900 dark:text-white font-bold" 
                         />
                         <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                           {(bankSearch || bankDetails.bankName) && (
                             <button 
                               type="button"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setBankSearch('');
                                 setBankDetails(prev => ({ ...prev, bankName: '', bankCode: '', name: '' }));
                               }}
                               className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white transition-colors"
                             >
                               <X className="w-3.5 h-3.5" />
                             </button>
                           )}
                           <button 
                             type="button"
                             onClick={(e) => {
                               e.stopPropagation();
                               setShowBankDropdown(!showBankDropdown);
                             }}
                             className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white transition-colors"
                           >
                             <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBankDropdown ? 'rotate-180' : ''}`} />
                           </button>
                         </div>
                       </div>
                       <AnimatePresence>
                         {showBankDropdown && (
                           <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute z-10 left-0 right-0 top-full mt-2 max-h-48 overflow-y-auto bg-card border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl no-scrollbar animate-in fade-in-50 slide-in-from-top-2">
                             {filteredBanks.map(bank => (
                               <button key={bank.code} onClick={() => handleSelectBank(bank)} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 dark:text-white/80 hover:bg-primary/10 hover:text-primary dark:hover:text-white transition-colors border-b border-slate-100 dark:border-white/5 last:border-0">{bank.name}</button>
                             ))}
                             {filteredBanks.length === 0 && <div className="p-4 text-center text-[10px] font-black text-slate-500 dark:text-white/20 uppercase tracking-widest">No banks found</div>}
                           </motion.div>
                         )}
                       </AnimatePresence>
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account Name</label>
                       <div className="relative">
                         <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-muted-foreground" />
                         <input value={bankDetails.name} readOnly placeholder={isResolving ? 'Verifying...' : 'Account Holder Name'} className="w-full bg-slate-100/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm outline-none text-primary font-black uppercase cursor-not-allowed" />
                         {bankDetails.name && !isResolving && <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />}
                       </div>
                     </div>
                  </div>
               ) : (
                  <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between group">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                           <Building className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-white/40 leading-none mb-1">Target Account</p>
                           <p className="text-sm font-black text-slate-900 dark:text-white uppercase">{savedBankDetails.bankName || bankDetails.bankName}</p>
                           <p className="text-[10px] text-muted-foreground font-bold tracking-widest">{(savedBankDetails.account || bankDetails.account)} • {(savedBankDetails.name || bankDetails.name)}</p>
                        </div>
                     </div>
                     <Button 
                       variant="ghost" 
                       size="sm" 
                       onClick={() => {
                         setBankDetails(savedBankDetails);
                         setBankSearch(savedBankDetails.bankName || '');
                         setHasBankSet(false);
                       }} 
                       className="text-primary hover:bg-primary/10 text-[10px] font-black uppercase tracking-widest px-4"
                     >
                       Edit
                     </Button>
                  </div>
               )}

               <div className="flex flex-col gap-3 pt-2">
                  <Button 
                    onClick={handleConfirmWithdrawal} 
                    disabled={isSubmittingWithdrawal || !bankDetails.name || !bankDetails.bankName || !bankDetails.bankCode || bankDetails.account.length !== 10 || isResolving || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > stats.balance} 
                    className="w-full h-14 gradient-bg rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 disabled:opacity-50"
                  >
                     {isSubmittingWithdrawal ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Withdrawal'}
                  </Button>
                  <Button variant="ghost" onClick={handleCloseWithdrawModal} className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-900 dark:text-white/40 dark:hover:text-white">Cancel Request</Button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Balance Card Section (Top of Page) */}
      <div className="max-w-md mx-auto w-full">
        <motion.div 
          whileHover={{ scale: 1.02 }} 
          className="relative aspect-[1.6/1] w-full rounded-3xl overflow-hidden shadow-2xl group cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-orange-600 via-rose-900 to-black p-6 flex flex-col justify-between overflow-hidden wallet-card">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
            
            <div className="flex justify-between items-start relative z-10">
              <div className="space-y-1">
                <p className="text-white/50 text-[10px] uppercase font-black tracking-[0.2em]">Withdrawable Commission</p>
                <motion.h2 key={stats.balance} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-4xl font-black text-white">₦{stats.balance.toLocaleString()}</motion.h2>
              </div>
              <Button onClick={handleWithdrawClick} className="h-10 px-4 rounded-xl bg-white text-black font-black uppercase text-[10px] gap-2 hover:bg-emerald-500 hover:text-white transition-all">
                 Withdraw <ArrowUpRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4 relative z-10">
              <div className="flex items-end justify-between">
                <div className="space-y-1">
                  <p className="text-[7px] uppercase font-black text-white/40 tracking-[0.3em]">Network Growth</p>
                  <div className="flex items-center gap-2">
                     <Users className="w-4 h-4 text-primary" />
                     <span className="text-lg font-black text-white">{stats.totalReferred} Users</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[7px] uppercase font-black text-white/40 tracking-[0.3em]">Signup Bonus (Non-Withdrawable)</p>
                  <p className="text-lg font-black text-emerald-400">₦{stats.bonusBalance.toLocaleString()}</p>
                </div>
              </div>
              <div className="pt-2 flex items-center gap-2 border-t border-white/10">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><TrendingUp className="w-3 h-3 text-emerald-400" /></div>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Tiered Revenue Sharing Active</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Header Section */}
      <div className="flex flex-col items-center text-center gap-6 my-8">
        <div className="w-20 h-20 rounded-3xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 shadow-[0_0_40px_rgba(249,115,22,0.15)]">
          <Share2 className="w-10 h-10 text-orange-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900 dark:text-white drop-shadow-md">
            StreamAura <span className="text-orange-500">Referral</span>
          </h1>
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-70">
            Build your network and watch movies for free
          </p>
        </div>
        
        <Button onClick={handleShare} className="gap-2 gradient-bg rounded-xl h-12 px-8 text-xs font-black uppercase shadow-lg shadow-primary/20 active:scale-95 transition-all">
          <Share2 className="w-4 h-4" /> Share Invite Link
        </Button>
      </div>

      {/* My Referral Link Card (Top of Page) */}
      <div className="max-w-md mx-auto w-full mb-8">
        <Card className="p-6 glass-card border-white/10 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground text-center">My Referral Link</h3>
          <div className="space-y-3">
            <div className="relative group">
              <input readOnly value={referralLink} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-[10px] font-mono outline-none focus:border-primary/50 text-muted-foreground" />
              <button onClick={handleCopyLink} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg text-primary transition-colors"><Copy className="w-4 h-4" /></button>
            </div>
            <p className="text-[8px] text-center text-muted-foreground uppercase tracking-widest font-bold">Share this link. When they earn as a host, you earn a 10% commission for 3 months (90 days).</p>
          </div>
        </Card>
      </div>

      {/* Activity & History Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Active Referrals List */}
        <Card className="glass-card border-white/10 flex flex-col overflow-hidden">
           <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 flex items-center gap-2"><Users className="w-3 h-3" /> Active Referrals</h3>
              <Badge variant="outline" className="text-[8px] h-4 font-black border-white/10">{referrals.length}</Badge>
           </div>
           <div className="flex-1 max-h-[350px] overflow-y-auto custom-scrollbar no-scrollbar">
              {isLoadingReferrals ? (
                <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
              ) : referrals.length > 0 ? (
                <div className="divide-y divide-white/5">
                  {referrals.map((ref) => (
                    <div key={ref.uid} className="p-4 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 overflow-hidden"><img src={ref.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${ref.uid}`} alt="" className="w-full h-full object-cover" /></div>
                      <div className="flex-1 min-w-0">
                         <p className="text-[10px] font-black text-white truncate uppercase">{ref.displayName}</p>
                         <div className="flex items-center gap-2 mt-0.5">
                           <LucideHistory className="w-2.5 h-2.5 text-muted-foreground" />
                           <p className="text-[8px] font-bold text-muted-foreground uppercase">
                             {(() => {
                               let d = 0;
                               if (ref.createdAt && typeof ref.createdAt === 'object') {
                                 d = typeof ref.createdAt.toDate === 'function' ? ref.createdAt.toDate().getTime() : (ref.createdAt.seconds || ref.createdAt._seconds || 0) * 1000;
                               } else if (typeof ref.createdAt === 'number') {
                                 d = ref.createdAt > 1e11 ? ref.createdAt : ref.createdAt * 1000;
                               } else if (typeof ref.createdAt === 'string') {
                                 d = new Date(ref.createdAt).getTime();
                               }
                               return d ? new Date(d).toLocaleDateString() : 'Recent';
                             })()}
                           </p>
                         </div>
                      </div>
                      <div className="text-right">
                         <div className="flex items-center gap-1 justify-end"><Timer className={`w-2.5 h-2.5 ${getExpiryCountdown(ref.createdAt) === 'Expired' ? 'text-rose-500' : 'text-emerald-500'}`} /><span className={`text-[9px] font-black uppercase ${getExpiryCountdown(ref.createdAt) === 'Expired' ? 'text-rose-500' : 'text-emerald-500'}`}>{getExpiryCountdown(ref.createdAt)}</span></div>
                         <p className="text-[7px] font-black text-white/20 uppercase tracking-tighter mt-0.5">Commission Window</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center space-y-3"><Users className="w-8 h-8 mx-auto text-white/5" /><p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">No referrals yet</p></div>
              )}
           </div>
        </Card>

        {/* Referral History List */}
        <Card className="glass-card border-white/10 flex flex-col overflow-hidden">
           <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 flex items-center gap-2"><LucideHistory className="w-3.5 h-3.5" /> Referral History</h3>
           </div>
           <div className="flex-1 max-h-[350px] overflow-y-auto custom-scrollbar no-scrollbar">
              {isLoadingHistory ? (
                <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
              ) : history.length > 0 ? (
                <div className="divide-y divide-white/5">
                  {history.map((item) => (
                    <div key={item.id} className="p-4 space-y-2 hover:bg-white/[0.02] transition-colors">
                      <div className="flex justify-between items-start">
                         <div className="space-y-0.5">
                            <p className="text-[10px] font-black text-white uppercase tracking-tight">{item.desc}</p>
                            <div className="flex items-center gap-1.5"><ExternalLink className="w-2.5 h-2.5 text-muted-foreground" /><p className="text-[8px] font-bold text-muted-foreground uppercase">{item.room || 'System'}</p></div>
                         </div>
                         <span className="text-[11px] font-black text-emerald-400">+₦{item.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-[7px] font-black text-white/20 uppercase tracking-widest">
                         <span>{item.timestamp ? (typeof item.timestamp.toDate === 'function' ? item.timestamp.toDate().toLocaleDateString() : new Date((item.timestamp.seconds || item.timestamp._seconds || 0) * 1000).toLocaleDateString()) : 'Recent'}</span>
                         <div className="flex items-center gap-1"><ShieldCheck className="w-2 h-2" /><span>Verified</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center space-y-3"><LucideHistory className="w-8 h-8 mx-auto text-white/5" /><p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">No earnings yet</p></div>
              )}
           </div>
        </Card>

        {/* Withdrawal Status Section */}
        <Card className="glass-card border-white/10 flex flex-col overflow-hidden">
           <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 flex items-center gap-2">
                <Banknote className="w-3.5 h-3.5" /> Withdrawal Status
              </h3>
           </div>
           <div className="flex-1 max-h-[350px] overflow-y-auto custom-scrollbar no-scrollbar">
              {isLoadingWithdrawals ? (
                <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
              ) : withdrawals.length > 0 ? (
                <div className="divide-y divide-white/5">
                  {withdrawals.map((wd) => (
                    <div key={wd.id} className="p-4 space-y-2 hover:bg-white/[0.02] transition-colors">
                      <div className="flex justify-between items-center">
                         <span className="text-sm font-black text-white">₦{wd.amount?.toLocaleString()}</span>
                         <Badge className={`text-[8px] font-black ${
                           wd.status === 'pending' ? 'bg-orange-500/20 text-orange-400' :
                           wd.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                           'bg-rose-500/20 text-rose-400'
                         }`}>
                           {wd.status?.toUpperCase()}
                         </Badge>
                      </div>
                      <div className="flex justify-between items-center text-[7px] font-black text-white/20 uppercase tracking-widest">
                         <span>{wd.created_at ? (typeof wd.created_at.toDate === 'function' ? wd.created_at.toDate().toLocaleDateString() : new Date((wd.created_at.seconds || wd.created_at._seconds || 0) * 1000).toLocaleDateString()) : 'Recent'}</span>
                         <span>{wd.bank_name || 'Bank Payout'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center space-y-3">
                   <Banknote className="w-8 h-8 mx-auto text-white/5" />
                   <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">No withdrawals requested</p>
                </div>
              )}
           </div>
        </Card>
      </div>
    </div>
  );
};

export default Referral;
