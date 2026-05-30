import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowRight,
  CreditCard, 
  History, 
  Banknote,
  Plus,
  Clock,
  QrCode,
  Eye,
  EyeOff,
  Copy,
  Share2,
  Ticket,
  Users,
  DollarSign,
  ShieldAlert,
  Crown,
  Wallet as WalletIconLucide,
  Film,
  Building,
  CheckCircle2,
  ChevronDown,
  X,
  Loader2
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { doc, collection, query, where, onSnapshot, orderBy, getDoc, updateDoc, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { API_BASE_URL } from '../api/mediaApi';
import { initializePaystackPayment, fetchBanks, resolveBankAccount } from '../api/paymentApi';
import { LoginRequired } from '../components/LoginRequired';
import { Wallet as WalletIcon } from 'lucide-react';

interface Bank {
  name: string;
  code: string;
  slug?: string;
}

interface TicketItem {
  id: string;
  movie: string;
  date: string;
  time: string;
  room: string;
  seat: string;
  price: string;
  status: string;
  thumbnail: string;
  roomCode: string;
  host: string;
}

const Wallet: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();
  
  if (!isAuthenticated) {
    return (
      <LoginRequired 
        title="Secure Wallet"
        description="Sign in to manage your funds, purchase movie tickets, and track your transactions securely."
        icon={WalletIcon}
      />
    );
  }

  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'host' | 'withdraw'>('overview');
  const [showFullId, setShowFullId] = useState(false);
  const [isAddingFunds, setIsAddingFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  
  // Bank States
  const [availableBanks, setAvailableBanks] = useState<Bank[]>([]);
  const [bankDetails, setBankDetails] = useState({ name: '', account: '', bankName: '', bankCode: '', logo: '' });
  const [hasBankSet, setHasBankSet] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankSearch, setBankQuery] = useState('');
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [scrollToTab, setScrollToTab] = useState<'history' | 'overview' | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle cross-component deep linking (e.g. from Games modal 'Add Funds')
  useEffect(() => {
    const action = sessionStorage.getItem('wallet_action');
    if (action === 'deposit') {
      setActiveTab('overview');
      // Intentionally not setting scrollToTab here so the page starts at the top
      sessionStorage.removeItem('wallet_action');
    }
  }, []);

  const [balance, setBalance] = useState({
    available: 0, // funded
    host_earnings: 0,
    currency: 'NGN'
  });

  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (user?.uid) {
      const unsubBalance = onSnapshot(doc(db, 'room_wallets', user.uid), (docSnap) => {
         if (docSnap.exists()) {
             const data = docSnap.data();
             setBalance({ 
               available: data.funded_balance || 0, 
               host_earnings: data.host_balance || 0, 
               currency: 'NGN' 
             });
         }
      });

      // Load Bank Details from Profile
      const loadBank = async () => {
         const userRef = doc(db, 'users', user.uid);
         const userSnap = await getDoc(userRef);
         if (userSnap.exists() && userSnap.data().bankDetails) {
            setBankDetails(userSnap.data().bankDetails);
            setHasBankSet(true);
         }
      };
      loadBank();

      // Combined History Listener (Transactions + Withdrawals)
      const qTx = query(collection(db, 'transactions'), where('user_uid', '==', user.uid), orderBy('timestamp', 'desc'));
      const qWd = query(collection(db, 'withdrawals'), where('user_uid', '==', user.uid), orderBy('created_at', 'desc'));
      
      let allItems: any[] = [];
      const updateHistory = () => {
         const sorted = [...allItems].sort((a, b) => {
            const tsA = a.timestamp?.seconds || (a.created_at?.seconds) || 0;
            const tsB = b.timestamp?.seconds || (b.created_at?.seconds) || 0;
            return tsB - tsA;
         });
         setTransactions(sorted);
      };

      const unsubTx = onSnapshot(qTx, (snapshot) => {
         const txs = snapshot.docs.map(d => {
            const data = d.data();
            const dateStr = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleDateString() : data.date || 'Recent';
            return { id: d.id, ...data, date: dateStr, category: 'transaction' };
         });
         allItems = [...allItems.filter(i => i.category !== 'transaction'), ...txs];
         updateHistory();
      });

      const unsubWd = onSnapshot(qWd, (snapshot) => {
         const wds = snapshot.docs.map(d => {
            const data = d.data();
            const dateStr = data.created_at?.toDate ? data.created_at.toDate().toLocaleDateString() : 'Recent';
            return { 
               id: d.id, 
               ...data, 
               title: `Withdrawal (${data.type})`,
               amount: data.amount,
               type: 'withdrawal',
               status: data.status,
               date: dateStr,
               category: 'withdrawal' 
            };
         });
         allItems = [...allItems.filter(i => i.category !== 'withdrawal'), ...wds];
         updateHistory();
      });

      return () => { unsubBalance(); unsubTx(); unsubWd(); };
    }
  }, [user?.uid]);

  // Common Nigerian Bank Prefixes (for OPay-style auto-detection)
  const BANK_PREFIXES: Record<string, string[]> = {
    "044": ["Access Bank"],
    "050": ["Ecobank"],
    "070": ["Fidelity Bank"],
    "011": ["First Bank"],
    "214": ["First City Monument Bank"],
    "058": ["GTBank"],
    "030": ["Heritage Bank"],
    "082": ["Keystone Bank"],
    "999992": ["OPay"],
    "999991": ["PalmPay"],
    "076": ["Polaris Bank"],
    "101": ["Providus Bank"],
    "032": ["Union Bank"],
    "033": ["United Bank For Africa"],
    "215": ["Unity Bank"],
    "035": ["Wema Bank"],
    "057": ["Zenith Bank"],
    "50211": ["Kuda Bank"],
    "50515": ["Moniepoint"]
  };

  // History Pagination
  const [historyPage, setHistoryPage] = useState(1);
  const itemsPerPage = 10;

  // Load Banks on Mount
  useEffect(() => {
    const loadBanks = async () => {
      try {
        const result = await fetchBanks();
        if (result.status && Array.isArray(result.data)) {
          setAvailableBanks(result.data);
        }
      } catch (err) {
        console.error("Failed to load banks");
      }
    };
    loadBanks();
  }, []);

  // Handle Click Outside Dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowBankDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Smart Resolution Logic (Auto-Resolve when Acc# and Bank are present)
  useEffect(() => {
    if (bankDetails.account.length === 10 && bankDetails.bankCode && !bankDetails.name) {
      resolveAccount();
    } else if (bankDetails.account.length < 10) {
      // Clear name if account becomes invalid
      if (bankDetails.name) setBankDetails(prev => ({ ...prev, name: '' }));
    }
  }, [bankDetails.account, bankDetails.bankCode]);
  const resolveAccount = async () => {
    setIsResolving(true);
    try {
      const result = await resolveBankAccount(bankDetails.account, bankDetails.bankCode);
      if (result.status && result.data?.account_name) {
        setBankDetails(prev => ({ ...prev, name: result.data.account_name }));
        showSuccess("Account verified successfully!");
      } else {
        showError("Could not verify account. Please check number and bank.");
        setBankDetails(prev => ({ ...prev, name: '' }));
      }
    } catch (err) {
      showError("Verification failed.");
      setBankDetails(prev => ({ ...prev, name: '' }));
    } finally {
      setIsResolving(false);
    }
  };

  const getSuggestedBankNames = () => {
    if (bankDetails.account.length >= 3) {
      const prefix3 = bankDetails.account.substring(0, 3);
      const prefix5 = bankDetails.account.substring(0, 5);
      const prefix6 = bankDetails.account.substring(0, 6);
      return BANK_PREFIXES[prefix6] || BANK_PREFIXES[prefix5] || BANK_PREFIXES[prefix3] || [];
    }
    return [];
  };

  const suggestedBanks = getSuggestedBankNames();

  const filteredBanks = availableBanks.filter(b => {
    if (bankSearch) return b.name.toLowerCase().includes(bankSearch.toLowerCase());
    // Auto-filter by account number if no explicit search
    if (suggestedBanks.length > 0 && bankDetails.account.length >= 3 && !bankDetails.bankCode) {
      return suggestedBanks.some(name => b.name.toLowerCase().includes(name.toLowerCase()));
    }
    return true;
  });

  const [hostRooms, setHostRooms] = useState<any[]>([]);

  useEffect(() => {
    if (user?.uid && activeTab === 'host') {
      const unsubWallet = onSnapshot(doc(db, 'room_wallets', user.uid), () => {
        // Just keeping the listener alive if needed for specific host things,
        // but stats are now room-specific.
      });

      const q = query(collection(db, 'cinema_rooms'), where('host_uid', '==', user.uid), orderBy('created_at', 'desc'), limit(10));
      const unsubRooms = onSnapshot(q, (snap) => {
        setHostRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      return () => { unsubWallet(); unsubRooms(); };
    }
  }, [user?.uid, activeTab]);

  const paginatedTransactions = transactions.slice(0, historyPage * itemsPerPage);

  const myTickets: TicketItem[] = [
    {
      id: 'T-1024',
      movie: 'Interstellar',
      date: 'Dec 15, 2023',
      time: '08:00 PM',
      room: 'Room Alpha',
      seat: 'A-05',
      price: '₦2,500',
      status: 'upcoming',
      thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=2094&auto=format&fit=crop',
      roomCode: 'ALPHA-77X-99',
      host: 'Bobbizy'
    },
    {
      id: 'T-1025',
      movie: 'The Matrix',
      date: 'Dec 18, 2023',
      time: '10:00 PM',
      room: 'Midnight Room',
      seat: 'B-12',
      price: '₦1,500',
      status: 'upcoming',
      thumbnail: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=2070&auto=format&fit=crop',
      roomCode: 'NEO-101-MAT',
      host: 'Neo'
    }
  ];

  const handleAddFunds = () => {
    if (!fundAmount || parseFloat(fundAmount) <= 0) {
      showError('Please enter a valid amount');
      return;
    }
    const email = user?.email;
    if (!email) {
      showError('Your account requires an email to process payments.');
      return;
    }

    setIsAddingFunds(true);
    initializePaystackPayment(
      email,
      parseFloat(fundAmount),
      { type: 'wallet_funding', user_uid: user.uid },
      async (reference) => {
        try {
          const token = await auth.currentUser?.getIdToken();
          const resp = await fetch(`${API_BASE_URL}/api/cinema/verify-wallet-funding?reference=${reference}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          const result = await resp.json();
          if (result.success) {
            showSuccess(`₦${parseFloat(fundAmount).toLocaleString()} successfully added!`);
            setFundAmount('');
          } else {
            showError(result.message || 'Verification failed. Please contact support.');
          }
        } catch (err) {
          showError('Error communicating with server.');
        } finally {
          setIsAddingFunds(false);
        }
      },
      () => {
        setIsAddingFunds(false);
        showError('Payment window closed.');
      }
    );
  };

  const handleEnterRoom = (ticket: TicketItem) => {
    const ticketDateStr = `${ticket.date} ${ticket.time}`;
    const scheduledTime = new Date(ticketDateStr).getTime();
    
    if (Date.now() < scheduledTime - (15 * 60000)) {
      showInfo(`The movie hasn't started yet! Please check back on ${ticket.date} at ${ticket.time}.`);
      return;
    }
    
    window.location.href = `/?tab=cinema&room=${ticket.roomCode}`;
  };

  const handleShareTicket = (ticket: TicketItem) => {
    const shareUrl = `${API_BASE_URL}/share?title=${encodeURIComponent(`StreamAura Ticket: ${ticket.movie}`)}&desc=${encodeURIComponent(`Join me in ${ticket.room} for a premium movie experience!`)}&img=${encodeURIComponent(ticket.thumbnail)}&target=${encodeURIComponent(`/?tab=wallet&ticket=${ticket.id}`)}`;
    const shareText = `🎥 Join me for "${ticket.movie}" on StreamAura!\n🎟️ Room: ${ticket.room}\n🔗 Access Link:`;
    if (navigator.share) {
      navigator.share({ title: `StreamAura Ticket - ${ticket.movie}`, text: shareText, url: shareUrl }).catch(console.error);
    } else {
      navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      showSuccess('Share link copied!');
    }
  };

  const handleViewTicketCode = (id: string) => {
     navigator.clipboard.writeText(id);
     showSuccess(`Ticket Code ${id} copied!`);
  };

  const [withdrawSource, setWithdrawSource] = useState<'funded' | 'host'>('funded');

  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const handleRequestPayout = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!withdrawAmount || isNaN(amt) || amt <= 0) {
      showError('Enter a valid amount to withdraw.');
      return;
    }

    if (!bankDetails.name || !bankDetails.account || !bankDetails.bankCode) {
      showError('Please verify and save your bank details first.');
      return;
    }

    const available = withdrawSource === 'funded' ? balance.available : balance.host_earnings;
    if (amt > available) {
      showError(`Insufficient ${withdrawSource} balance.`);
      return;
    }

    setIsConfirmModalOpen(true);
  };

  const confirmWithdrawal = async () => {
    const amt = parseFloat(withdrawAmount);
    setIsConfirmModalOpen(false);
    setIsSubmittingWithdrawal(true);
    
    try {
      const token = await auth.currentUser?.getIdToken();
      const payload = {
        amount: amt,
        balance_type: withdrawSource,
        bank_code: bankDetails.bankCode,
        account_number: bankDetails.account,
        account_name: bankDetails.name
      };

      const response = await fetch(`${API_BASE_URL}/api/cinema/withdraw`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.success) {
        showSuccess("Withdrawal request submitted successfully!");
        setWithdrawAmount('');
      } else {
        showError(result.detail || "Withdrawal failed.");
      }
    } catch (err) {
      showError("Connection error. Please try again.");
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Confirmation Modal */}
      <AnimatePresence>
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsConfirmModalOpen(false)} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm glass-card p-6 border-white/10 shadow-2xl space-y-6">
               <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center mx-auto mb-4">
                     <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black uppercase text-white">Confirm Payout</h3>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest px-4">Please verify the details below before proceeding.</p>
               </div>

               <div className="space-y-2 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest border-b border-white/5 pb-2">
                     <span className="text-muted-foreground">Source</span>
                     <span className={withdrawSource === 'funded' ? 'text-primary' : 'text-amber-500'}>{withdrawSource} Balance</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest border-b border-white/5 py-2">
                     <span className="text-muted-foreground">Amount</span>
                     <span className="text-white">₦{parseFloat(withdrawAmount || '0').toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest pt-2">
                     <span className="text-emerald-500/60">Net to receive</span>
                     <span className="text-emerald-400 text-sm">
                       ₦{(parseFloat(withdrawAmount || '0') * (withdrawSource === 'funded' ? 0.95 : 0.99)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </span>
                  </div>
               </div>

               <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setIsConfirmModalOpen(false)} className="flex-1 h-12 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 rounded-xl border border-white/10">
                     Cancel
                  </Button>
                  <Button onClick={confirmWithdrawal} disabled={isSubmittingWithdrawal} className="flex-1 h-12 gradient-bg rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20">
                     {isSubmittingWithdrawal ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                  </Button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header Section */}
      <div className="flex flex-col items-center text-center gap-6 mb-12">
        <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
          <WalletIconLucide className="w-10 h-10 text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black uppercase tracking-tight text-white drop-shadow-md">
            StreamAura <span className="text-emerald-500">Wallet</span>
          </h1>
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-70">
            Securely Manage your funds and tickets
          </p>
        </div>

        <div className="flex items-center gap-3 w-full max-w-sm">
          <Button variant="outline" onClick={() => {
            setActiveTab('history');
            setScrollToTab('history');
          }} className="flex-1 gap-2 border-white/10 rounded-xl h-12 text-xs font-black uppercase tracking-widest active:scale-95 transition-all">
            <History className="w-4 h-4" /> History
          </Button>
          <Button onClick={() => {
            setActiveTab('overview');
            setScrollToTab('overview');
          }} className="flex-1 gradient-bg rounded-xl h-12 text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all gap-2">
            <Plus className="w-4 h-4" /> Add Funds
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <motion.div whileHover={{ scale: 1.02 }} className="relative aspect-[1.6/1] w-full rounded-[2rem] overflow-hidden shadow-2xl border border-white/5">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="space-y-4">
                  <div className="flex flex-wrap justify-between items-start gap-4 w-full">
                    <div className="space-y-1 min-w-[120px] flex-1">
                      <p className="text-white/40 text-[9px] uppercase font-black tracking-widest flex items-center gap-1.5">
                        <WalletIconLucide className="w-3 h-3 text-primary" /> Funded
                      </p>
                      <h2 className="text-[clamp(1.25rem,4.5vw,1.75rem)] font-black text-white tracking-tighter break-all">₦{balance.available.toLocaleString()}</h2>
                    </div>
                    <div className="text-left sm:text-right space-y-1 min-w-[120px] flex-1">
                      <p className="text-white/40 text-[9px] uppercase font-black tracking-widest flex items-center sm:justify-end gap-1.5">
                        Earnings <Crown className="w-3 h-3 text-amber-500" />
                      </p>
                      <h2 className="text-[clamp(1.25rem,4.5vw,1.75rem)] font-black text-amber-500 tracking-tighter break-all">₦{balance.host_earnings.toLocaleString()}</h2>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-white/10 flex items-center gap-4">
                    <div className="space-y-0.5">
                       <p className="text-[10px] text-white/60 font-black uppercase tracking-widest leading-tight">
                          Total Spending Power
                       </p>
                       <p className="text-[7px] text-white/30 font-bold uppercase tracking-tighter">Combined Deposits & Sales</p>
                    </div>
                    <span className="text-xl font-black text-white leading-none">₦{(balance.available + balance.host_earnings).toLocaleString()}</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                   <img src="/logo.png" alt="Aura" className="w-6 h-6 opacity-80" />
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-[7px] uppercase font-black text-white/30 tracking-[0.3em]">Aura ID</p>
                <div className="flex items-center justify-between gap-4 overflow-hidden bg-black/20 p-2 rounded-xl border border-white/5">
                   <p className="font-mono text-white/90 text-xs tracking-[0.1em] truncate flex-1 min-w-0">
                     {showFullId ? user?.uid : `**** **** **** ${user?.uid?.slice(-4)}`}
                   </p>
                   <div className="flex gap-1 shrink-0">
                     <button onClick={() => {
                        navigator.clipboard.writeText(user?.uid || '');
                        showSuccess("Aura ID Copied!");
                     }} className="p-2 text-white/40 hover:text-primary transition-colors">
                       <Copy className="w-3.5 h-3.5" />
                     </button>
                     <button onClick={() => setShowFullId(!showFullId)} className="p-2 text-white/40 hover:text-primary transition-colors">
                       {showFullId ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                     </button>
                   </div>
                </div>
                <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] opacity-80 truncate">{user?.displayName || 'Premium Aura Member'}</p>
              </div>
            </div>
          </motion.div>

          <Card id="quick-deposit" className="p-6 glass-card border-white/10 space-y-5 shadow-2xl relative z-10">
            <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
               <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quick Funding</h3>
            </div>
            <div className="space-y-4">
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-lg text-muted-foreground group-focus-within:text-primary transition-colors">₦</span>
                <input 
                  type="text" 
                  inputMode="numeric" 
                  value={fundAmount} 
                  onChange={(e) => setFundAmount(e.target.value.replace(/[^0-9.]/g, ''))} 
                  placeholder="0.00" 
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-10 pr-4 text-lg font-black outline-none focus:border-primary/50 transition-all" 
                />
              </div>
              <Button onClick={handleAddFunds} disabled={isAddingFunds} className="w-full gradient-bg h-14 font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-primary/10">
                {isAddingFunds ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Pay with Paystack'}
              </Button>
              <p className="text-[8px] text-center text-muted-foreground uppercase font-bold tracking-[0.1em] leading-relaxed">Secured via encrypted gateway. 100% full refund policy active.</p>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-fit overflow-x-auto no-scrollbar max-w-full">
            {[
              { id: 'overview', label: 'My Tickets', icon: Ticket },
              { id: 'history', label: 'History', icon: History },
              { id: 'host', label: 'Host & Earnings', icon: Crown },
              { id: 'withdraw', label: 'Cash Out', icon: Banknote }
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}>
                <tab.icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div 
                key="tickets" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }} 
                className="space-y-6"
                onAnimationStart={() => {
                  if (scrollToTab === 'overview') {
                    document.getElementById('quick-deposit')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setScrollToTab(null);
                  }
                }}
              >
                {myTickets.length > 0 ? myTickets.map(ticket => (
                  <Card key={ticket.id} className="glass-card border-white/5 relative overflow-hidden flex flex-col md:flex-row shadow-xl group/ticket">
                     {/* Stub Side */}
                     <div className="w-full md:w-48 h-40 md:h-auto relative bg-zinc-950 border-b md:border-b-0 md:border-r border-dashed border-white/20">
                        <img src={ticket.thumbnail} className="w-full h-full object-cover opacity-50 grayscale group-hover/ticket:grayscale-0 transition-all duration-700" alt="Movie" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent md:bg-gradient-to-r" />
                        
                        <div className="absolute inset-0 p-4 flex flex-col justify-between">
                           <div className="flex justify-between items-start">
                              <Badge className="bg-primary/20 text-primary border-primary/30 text-[7px] font-black">{ticket.room}</Badge>
                           </div>
                           <div className="space-y-1">
                              <p className="text-[6px] font-black text-white/40 tracking-[0.3em] uppercase">Cinema ID</p>
                              <p className="text-[9px] font-mono text-white/90 uppercase tracking-widest">{ticket.id}</p>
                           </div>
                        </div>
                        
                        {/* Realistic Ticket Punches */}
                        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border border-white/10 hidden md:block" />
                        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border border-white/10 hidden md:block" />
                     </div>
                     
                     {/* Body Side */}
                     <div className="flex-1 p-6 flex flex-col">
                        <div className="flex justify-between items-start">
                           <div className="flex-1 min-w-0 pr-4">
                              <div className="flex items-center gap-2 mb-1">
                                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                 <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Valid Entry</p>
                              </div>
                              <h4 className="font-black text-2xl text-white uppercase tracking-tight leading-tight">{ticket.movie}</h4>
                              <p className="text-xs text-muted-foreground font-bold mt-1 uppercase flex items-center gap-1.5">
                                 <Film className="w-3 h-3" /> {ticket.room} • Hosted by {ticket.host}
                              </p>
                           </div>
                           <div className="shrink-0 p-2 bg-white rounded-lg">
                              <QrCode className="w-12 h-12 text-black" />
                           </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6 my-6 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                           <div>
                              <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Show Date</p>
                              <p className="text-xs font-black text-white uppercase">{ticket.date}</p>
                           </div>
                           <div>
                              <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Show Time</p>
                              <p className="text-xs font-black text-white uppercase">{ticket.time}</p>
                           </div>
                           <div>
                              <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Assigned Seat</p>
                              <p className="text-xs font-black text-primary uppercase">{ticket.seat}</p>
                           </div>
                        </div>

                        <div className="mt-auto flex items-center gap-3 pt-4 border-t border-dashed border-white/10">
                           <Button onClick={() => handleEnterRoom(ticket)} className="flex-1 h-12 gradient-bg rounded-xl font-black uppercase text-[10px] tracking-widest group/btn">
                              Enter Theater 
                              <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                           </Button>
                           <Button variant="outline" onClick={() => handleShareTicket(ticket)} className="w-12 h-12 rounded-xl p-0 border-white/10 hover:bg-white/5">
                              <Share2 className="w-4 h-4" />
                           </Button>
                           <Button variant="outline" onClick={() => handleViewTicketCode(ticket.id)} className="text-white border-white/10 hover:bg-white/5 font-black uppercase text-[10px] px-4 rounded-xl h-12">
                              View Code
                           </Button>
                        </div>
                     </div>
                  </Card>
                )) : (
                  <div className="py-20 text-center text-muted-foreground">
                     <Ticket className="w-12 h-12 mx-auto mb-4 opacity-20" />
                     <p className="text-sm font-bold uppercase tracking-widest">No tickets purchased yet</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                id="transaction-history" 
                key="history" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }} 
                className="space-y-4"
                onAnimationStart={() => {
                  if (scrollToTab === 'history') {
                    document.getElementById('transaction-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setScrollToTab(null);
                  }
                }}
              >
                 <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Transaction History</h3>

                 <div className="space-y-3">
                   {paginatedTransactions.map(tx => (
                     <div key={tx.id} className="p-4 rounded-xl glass-card border-white/5 flex items-center justify-between group hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-4">
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'earning' || tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                             {tx.type === 'earning' || tx.type === 'deposit' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                           </div>
                           <div>
                              <p className="text-xs font-bold text-white uppercase tracking-tight">{tx.title}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase">{tx.date}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className={`text-sm font-black ${['earning', 'deposit', 'transfer_in', 'payout_refund'].includes(tx.type) ? 'text-emerald-500' : 'text-foreground'}`}>
                              {['earning', 'deposit', 'transfer_in', 'payout_refund'].includes(tx.type) ? '+' : '-'}₦{tx.amount.toLocaleString()}
                           </p>
                           <Badge variant="outline" className={`mt-1 text-[8px] uppercase tracking-widest ${tx.status === 'completed' ? 'border-emerald-500/30 text-emerald-500' : 'border-amber-500/30 text-amber-500'}`}>{tx.status}</Badge>
                        </div>
                     </div>
                   ))}
                 </div>
                 {historyPage * itemsPerPage < transactions.length && (
                   <Button variant="ghost" onClick={() => setHistoryPage(p => p + 1)} className="w-full mt-4 text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-white/5 py-6">
                      Load More Activity
                   </Button>
                 )}
              </motion.div>
            )}

            {activeTab === 'host' && (
               <motion.div key="host" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                 <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">My Hosted Rooms & Performance</h3>
                    <div className="grid grid-cols-1 gap-6">
                       {hostRooms.length > 0 ? hostRooms.map(room => {
                         const gross = room.gross_revenue || 0;
                         const net = room.total_earned || 0;
                         const fee = gross * 0.3;
                         
                         return (
                           <Card key={room.id} className="p-6 glass-card border-white/5 space-y-6 overflow-hidden relative">
                              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                 <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                       <span className={`w-1.5 h-1.5 rounded-full ${room.status === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-orange-500'}`} />
                                       <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{room.status}</p>
                                    </div>
                                    <h4 className="font-black text-lg text-white uppercase truncate">{room.room_name}</h4>
                                    <p className="text-[10px] text-muted-foreground font-bold uppercase flex items-center gap-1.5">
                                      <Clock className="w-3 h-3" /> {new Date(room.created_at?.seconds * 1000).toLocaleDateString()} • ₦{room.ticket_price?.toLocaleString()} / ticket
                                    </p>
                                 </div>
                                 <div className="flex gap-2">
                                    <Button onClick={() => window.location.href = `/?tab=cinema&room=${room.id}`} className="h-9 rounded-lg gradient-bg text-[10px] font-black uppercase tracking-widest px-6 shadow-lg shadow-primary/20">
                                       Enter Room
                                    </Button>
                                 </div>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                 {[
                                   { label: 'Visits', value: room.active_viewers || 0, icon: Users, color: 'text-blue-400' },
                                   { label: 'Sold', value: room.tickets_sold || 0, icon: Ticket, color: 'text-primary' },
                                   { label: 'Gross', value: `₦${gross.toLocaleString()}`, icon: DollarSign, color: 'text-white' },
                                   { label: 'Net (70%)', value: `₦${net.toLocaleString()}`, icon: WalletIconLucide, color: 'text-emerald-400' },
                                   { label: 'Fee (30%)', value: `-₦${fee.toLocaleString()}`, icon: ShieldAlert, color: 'text-orange-400' }
                                 ].map((stat, i) => (
                                   <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                                      <div className="flex items-center gap-1.5 opacity-40">
                                         <stat.icon className="w-2.5 h-2.5" />
                                         <span className="text-[7px] font-black uppercase tracking-widest">{stat.label}</span>
                                      </div>
                                      <p className={`text-xs font-black ${stat.color}`}>{stat.value}</p>
                                   </div>
                                 ))}
                              </div>

                              <div className="space-y-2">
                                 <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                                    <span className="text-white/40">Seat Occupancy</span>
                                    <span className="text-primary">{room.tickets_sold || 0} / {room.max_seats || '∞'}</span>
                                 </div>
                                 <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                    <motion.div 
                                      initial={{ width: 0 }} 
                                      animate={{ width: room.max_seats ? `${((room.tickets_sold || 0) / room.max_seats) * 100}%` : '0%' }} 
                                      className="h-full bg-primary" 
                                    />
                                 </div>
                              </div>
                           </Card>
                         );
                       }) : (
                         <div className="py-20 text-center glass-card border-white/5 border-dashed border-2 rounded-[2rem]">
                            <Film className="w-12 h-12 mx-auto mb-4 opacity-10" />
                            <p className="text-[10px] font-black uppercase text-white/20 tracking-[0.2em]">No hosted rooms found</p>
                         </div>
                       )}
                    </div>
                 </div>
               </motion.div>
            )}

            {activeTab === 'withdraw' && (
              <motion.div key="withdraw" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <Card className="p-8 glass-card border-white/10 max-w-xl mx-auto overflow-hidden relative">
                   <div className="space-y-8">
                      <div className="space-y-1 text-center">
                        <h3 className="text-2xl font-black uppercase tracking-tight text-white">Cash Out</h3>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest opacity-60">Verified Bank Transfer</p>
                      </div>

                      {!hasBankSet ? (
                         <div className="space-y-5">
                            <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-200 text-[11px] font-medium flex items-start gap-3">
                               <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
                               <p>You need to link a bank account before you can request a payout. Payouts are manually verified and processed.</p>
                            </div>
                            <div className="space-y-4">
                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account Number (10 Digits)</label>
                                  <div className="relative">
                                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input 
                                      value={bankDetails.account} 
                                      onChange={e => {
                                        const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                                        setBankDetails({...bankDetails, account: val});
                                        
                                        // Clear name immediately if not 10 digits
                                        if (val.length !== 10 && bankDetails.name) {
                                          setBankDetails(prev => ({ ...prev, name: '' }));
                                        }

                                        // Prefix Auto-Detection (OPay Style)
                                        if (val.length === 10 && !bankDetails.bankCode && !bankSearch) {
                                          const prefix3 = val.substring(0, 3);
                                          const prefix5 = val.substring(0, 5);
                                          const match = BANK_PREFIXES[prefix5] || BANK_PREFIXES[prefix3];
                                          if (match) {
                                            const bank = availableBanks.find(b => b.name.toLowerCase().includes(match[0].toLowerCase()));
                                            if (bank) {
                                              setBankDetails(prev => ({ ...prev, bankName: bank.name, bankCode: bank.code }));
                                              setBankQuery(bank.name);
                                            }
                                          }
                                        }
                                      }} 
                                      placeholder="0123456789" 
                                      type="text"
                                      inputMode="numeric"
                                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-12 text-sm outline-none focus:border-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                                    />
                                    {isResolving && (
                                      <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4">
                                        <svg className="animate-spin h-full w-full text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                               </div>

                               <div className="space-y-2 relative z-[100]" ref={dropdownRef}>
                                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Select Your Bank</label>
                                  <div className="relative group">
                                    <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input 
                                      value={bankSearch || bankDetails.bankName} 
                                      onFocus={() => setShowBankDropdown(true)}
                                      onChange={e => {
                                        setBankQuery(e.target.value);
                                        setBankDetails({...bankDetails, bankName: e.target.value, bankCode: ''});
                                        if (!showBankDropdown) setShowBankDropdown(true);
                                      }} 
                                      placeholder="Search bank name..." 
                                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-12 text-sm outline-none focus:border-primary/50" 
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                      {(bankSearch || bankDetails.bankName) && (
                                        <button 
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setBankQuery('');
                                            setBankDetails({...bankDetails, bankName: '', bankCode: '', name: ''});
                                          }}
                                          className="p-1 hover:bg-white/10 rounded-full text-muted-foreground hover:text-white transition-colors"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                      <button 
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowBankDropdown(!showBankDropdown);
                                        }}
                                        className="p-1 hover:bg-white/10 rounded-full text-muted-foreground hover:text-white transition-colors"
                                      >
                                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBankDropdown ? 'rotate-180' : ''}`} />
                                      </button>
                                    </div>
                                  </div>

                                  <AnimatePresence>
                                    {showBankDropdown && (
                                      <motion.div 
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 5 }}
                                        className="absolute z-[110] left-0 right-0 top-full mt-2 max-h-64 overflow-y-auto bg-[#0f172a] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl custom-scrollbar"
                                      >
                                        {filteredBanks.length > 0 ? filteredBanks.map((bank, i) => (
                                          <button
                                            key={`${bank.code || 'bank'}-${i}`}
                                            type="button"
                                            onClick={() => {
                                              setBankDetails({...bankDetails, bankName: bank.name, bankCode: bank.code});
                                              setBankQuery(bank.name);
                                              setShowBankDropdown(false);
                                            }}
                                            className="w-full text-left px-4 py-3.5 text-xs font-bold hover:bg-primary/10 transition-colors border-b border-white/5 last:border-0 flex items-center gap-3 group/item"
                                          >
                                            <div className="relative w-8 h-8 shrink-0">
                                               <div className="absolute inset-0 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-black text-primary group-hover/item:bg-primary/30 transition-colors">
                                                  {bank.name.substring(0, 2).toUpperCase()}
                                               </div>
                                               {bank.slug && (
                                                  <img 
                                                    src={`https://raw.githubusercontent.com/iam-kevin/nigerian-banks-logos/master/logos/${bank.slug}.png`} 
                                                    className="absolute inset-0 w-full h-full rounded-full object-contain bg-white border border-white/10 shadow-sm" 
                                                    alt=""
                                                    onError={(e) => (e.target as any).style.display = 'none'}
                                                  />
                                               )}
                                            </div>
                                            <span className="flex-1 truncate text-white/90 group-hover/item:text-primary transition-colors">{bank.name}</span>
                                          </button>
                                        )) : (
                                          <div className="p-6 text-center text-[10px] text-muted-foreground uppercase font-black tracking-widest italic opacity-50">No matching bank found.</div>
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                               </div>

                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account Name (Auto-Verified)</label>
                                  <div className="relative">
                                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input value={bankDetails.name} readOnly placeholder="Enter Account Number & Bank to Verify" className="w-full bg-white/[0.02] border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm outline-none cursor-not-allowed text-primary font-black uppercase" />
                                    {bankDetails.name && <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />}
                                  </div>
                               </div>
                               
                               <div className="flex gap-3 pt-2">
                                 <Button variant="ghost" onClick={() => setActiveTab('overview')} className="flex-1 h-12 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-white/5 rounded-xl border border-white/10">
                                    Cancel
                                 </Button>
                                 <Button 
                                    disabled={!bankDetails.name || bankDetails.account.length !== 10 || isResolving}
                                    onClick={async () => {
                                      try {
                                        const userRef = doc(db, 'users', user!.uid);
                                        await updateDoc(userRef, { bankDetails });
                                        setHasBankSet(true); 
                                        showSuccess('Bank details saved for payouts!');
                                      } catch (err) {
                                        showError("Failed to save bank info.");
                                      }
                                    }} 
                                    className="flex-[2] h-12 gradient-bg rounded-xl font-black uppercase tracking-widest text-[10px] disabled:opacity-50"
                                 >
                                    Save Bank Info
                                 </Button>
                               </div>
                            </div>
                         </div>
                      ) : (
                         <div className="space-y-6">
                            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between group">
                               <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                     <Building className="w-6 h-6" />
                                  </div>
                                  <div>
                                     <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60 leading-none mb-1">Verified Payout Account</p>
                                     <p className="text-sm font-black text-white uppercase">{bankDetails.bankName}</p>
                                     <p className="text-[10px] text-emerald-200 font-bold tracking-widest">{bankDetails.account} • {bankDetails.name}</p>
                                  </div>
                               </div>
                               <Button variant="ghost" size="sm" onClick={() => setHasBankSet(false)} className="text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-black uppercase tracking-widest px-4">Edit</Button>
                            </div>

                            <div className="space-y-4">
                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Select Withdrawal Source</label>
                                  <div className="grid grid-cols-2 gap-3">
                                     <button 
                                       onClick={() => setWithdrawSource('funded')}
                                       className={`p-4 rounded-xl border transition-all text-left space-y-1 ${withdrawSource === 'funded' ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10' : 'bg-white/5 border-white/10 opacity-60 hover:opacity-100'}`}
                                     >
                                        <div className="flex justify-between items-center">
                                           <WalletIconLucide className="w-4 h-4 text-primary" />
                                           {withdrawSource === 'funded' && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                                        </div>
                                        <p className="text-[10px] font-black uppercase text-white">Funded</p>
                                        <p className="text-[9px] font-bold text-muted-foreground">₦{balance.available.toLocaleString()}</p>
                                     </button>
                                     <button 
                                       onClick={() => setWithdrawSource('host')}
                                       className={`p-4 rounded-xl border transition-all text-left space-y-1 ${withdrawSource === 'host' ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/10' : 'bg-white/5 border-white/10 opacity-60 hover:opacity-100'}`}
                                     >
                                        <div className="flex justify-between items-center">
                                           <Crown className="w-4 h-4 text-amber-500" />
                                           {withdrawSource === 'host' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />}
                                        </div>
                                        <p className="text-[10px] font-black uppercase text-white">Earnings</p>
                                        <p className="text-[9px] font-bold text-muted-foreground">₦{balance.host_earnings.toLocaleString()}</p>
                                     </button>
                                  </div>
                               </div>

                               <div className="space-y-3">
                                  <div className="flex justify-between items-end">
                                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Amount to Withdraw</label>
                                    <span className="text-[10px] text-muted-foreground font-black">
                                       Max: ₦{(withdrawSource === 'funded' ? balance.available : balance.host_earnings).toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="relative">
                                     <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-xl">₦</span>
                                     <input type="text" inputMode="numeric" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-2xl font-black outline-none focus:border-primary/50" />
                                  </div>

                                  {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                                     <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center">
                                        <span className="text-[9px] font-black uppercase text-emerald-500/60 tracking-widest">You will receive:</span>
                                        <span className="text-sm font-black text-white">
                                           ₦{(parseFloat(withdrawAmount) * (withdrawSource === 'funded' ? 0.95 : 0.99)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                     </motion.div>
                                  )}
                                  
                                  <div className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${withdrawSource === 'funded' ? 'bg-blue-500/5 border-blue-500/20 text-blue-200' : 'bg-amber-500/5 border-amber-500/20 text-amber-200'}`}>
                                     <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${withdrawSource === 'funded' ? 'text-blue-500' : 'text-amber-500'}`} />
                                     <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase italic">Withdrawal Logic Applied</p>
                                        <p className="text-[9px] font-medium leading-relaxed opacity-80">
                                           {withdrawSource === 'funded' 
                                             ? "100% Refundable deposit. A flat 5% handling fee applies to standard bank transfers. You will receive 95% of the requested amount."
                                             : "Host Earnings. A flat 1% handling fee applies to standard bank transfers. You will receive 99% of the requested amount."
                                           }
                                        </p>
                                     </div>
                                  </div>
                               </div>
                               <Button 
                                  onClick={handleRequestPayout} 
                                  disabled={isSubmittingWithdrawal}
                                  className="w-full h-14 gradient-bg rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20"
                               >
                                  {isSubmittingWithdrawal ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Confirm Payout Request'}
                                </Button>
                            </div>
                         </div>
                      )}

                   </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Wallet;
