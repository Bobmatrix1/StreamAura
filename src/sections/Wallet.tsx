import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  CreditCard, 
  History, 
  Banknote,
  Plus,
  Clock,
  Calendar,
  QrCode,
  Eye,
  EyeOff,
  Copy,
  Share2,
  ExternalLink,
  ChevronRight,
  Ticket
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { API_BASE_URL } from '../api/mediaApi';

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

/**
 * Wallet Section
 * Financial hub for users and hosts with card-style balance and ticket-style bookings.
 * Enhanced with Naira, Paystack flow, and detailed ticket logic.
 */
import { LoginRequired } from '../components/LoginRequired';
import { Wallet as WalletIcon } from 'lucide-react';

const Wallet: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return (
      <LoginRequired 
        title="Secure Wallet"
        description="Sign in to manage your funds, purchase movie tickets, and track your transactions securely."
        icon={WalletIcon}
      />
    );
  }
  const [activeTab, setActiveTab] = useState<'overview' | 'withdraw'>('overview');
  const [showFullId, setShowFullId] = useState(false);
  const [isAddingFunds, setIsAddingFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState('');

  // Mock data for balance (Now in Naira)
  const [balance, setBalance] = useState({
    available: 15400.00,
    total: 22000.00,
    currency: 'NGN'
  });

  // Mock transactions (Naira)
  const transactions = [
    { id: '1', type: 'earning', amount: 5000.00, title: 'IMAX Experience (Tickets Sold)', date: 'Today, 2:30 PM', status: 'completed' },
    { id: '2', type: 'purchase', amount: 1500.00, title: 'Midnight Classics (Ticket)', date: 'Yesterday, 8:15 PM', status: 'completed' },
    { id: '3', type: 'withdrawal', amount: 10000.00, title: 'Bank Withdrawal', date: 'Oct 24, 2023', status: 'pending' }
  ];

  // Mock tickets with seat assignment logic
  const myTickets: TicketItem[] = [
    {
      id: 'T-1024',
      movie: 'Interstellar',
      date: 'Dec 15, 2023',
      time: '08:00 PM',
      room: 'Room Alpha',
      seat: 'A-05', // Assigned on first pay first serve
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
      status: 'watched',
      thumbnail: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=2070&auto=format&fit=crop',
      roomCode: 'NEO-101-MAT',
      host: 'Neo'
    }
  ];

  const handleAddFunds = () => {
    if (!fundAmount || parseFloat(fundAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    // Simulate Paystack Flow
    setIsAddingFunds(true);
    toast.info(`Redirecting to Paystack for ₦${fundAmount}...`);
    
    setTimeout(() => {
      setBalance(prev => ({
        ...prev,
        available: prev.available + parseFloat(fundAmount)
      }));
      toast.success(`₦${fundAmount} successfully added to your wallet!`);
      setIsAddingFunds(false);
      setFundAmount('');
    }, 2000);
  };

  const handleShareTicket = (ticket: TicketItem) => {
    // Professional Share URL (Redirects via Backend to show rich meta tags on WhatsApp/etc)
    const shareUrl = `${API_BASE_URL}/share?title=${encodeURIComponent(`StreamAura Ticket: ${ticket.movie}`)}&desc=${encodeURIComponent(`Join me in ${ticket.room} for a premium movie experience!`)}&img=${encodeURIComponent(ticket.thumbnail)}&target=${encodeURIComponent(`/?tab=wallet&ticket=${ticket.id}`)}`;
    
    const shareText = `🎥 Join me for "${ticket.movie}" on StreamAura!\n🎟️ Room: ${ticket.room}\n🔗 Access Link:`;
    
    if (navigator.share) {
      navigator.share({
        title: `StreamAura Ticket - ${ticket.movie}`,
        text: shareText,
        url: shareUrl
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      toast.success('Professional share link copied!');
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">My Wallet</h1>
          <p className="text-muted-foreground mt-1">Manage funds, tickets, and your virtual card.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2 border-white/10">
            <History className="w-4 h-4" />
            History
          </Button>
          <Button onClick={() => setActiveTab('overview')} className="gap-2 gradient-bg">
            <Plus className="w-4 h-4" />
            Add Funds
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Virtual Card & Stats */}
        <div className="lg:col-span-1 space-y-6">
          {/* Virtual Card */}
          <motion.div
            whileHover={{ scale: 1.02, rotateY: 5 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="relative aspect-[1.6/1] w-full rounded-3xl overflow-hidden shadow-2xl group cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-white/40 text-[10px] uppercase font-bold tracking-[0.2em]">Current Balance</p>
                  <h2 className="text-3xl font-black text-white">₦{balance.available.toLocaleString()}</h2>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-white/5 backdrop-blur-md flex items-center justify-center border border-white/10">
                  <img src="/logo.png" alt="Aura" className="w-8 h-8 object-contain" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-white/30 text-[7px] uppercase font-bold tracking-widest ml-0.5">Aura ID</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-white/90 font-mono text-base tracking-widest">
                      {showFullId ? (
                        <span className="text-xs break-all">{user?.uid || 'AURA-USER-ID'}</span>
                      ) : (
                        <>
                          <span>****</span>
                          <span>****</span>
                          <span>****</span>
                          <span>{user?.uid?.slice(-4) || '8842'}</span>
                        </>
                      )}
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          navigator.clipboard.writeText(user?.uid || '');
                          toast.success('Copied!');
                        }}
                        className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/40 hover:text-white"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowFullId(!showFullId); }}
                      className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/60"
                    >
                      {showFullId ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-white/30 text-[7px] uppercase font-bold tracking-widest ml-0.5">Card Holder</p>
                    <p className="text-xs font-medium text-white uppercase tracking-wider">{user?.displayName || 'Aura Member'}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="border-white/20 text-white/40 text-[8px] uppercase font-black px-2 py-0">Verified</Badge>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
          </motion.div>

          {/* Add Funds Action */}
          <Card className="p-6 glass-card border-white/10 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Add Money</h3>
            <div className="space-y-3">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">₦</span>
                <input 
                  type="number" 
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm font-medium outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <Button 
                onClick={handleAddFunds}
                disabled={isAddingFunds}
                className="w-full gradient-bg h-12 font-bold gap-2"
              >
                {isAddingFunds ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Secure Pay with Paystack <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          </Card>

          {/* Recent Activity */}
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Activity</h3>
            </div>
            <div className="space-y-2">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                  <div className={`p-2 rounded-xl ${tx.type === 'earning' ? 'bg-emerald-500/10 text-emerald-500' : tx.type === 'purchase' ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500'}`}>
                    {tx.type === 'earning' ? <ArrowUpRight className="w-4 h-4" /> : tx.type === 'purchase' ? <ArrowDownLeft className="w-4 h-4" /> : <Banknote className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{tx.title}</p>
                    <p className="text-[10px] text-muted-foreground">{tx.date}</p>
                  </div>
                  <p className={`text-xs font-black ${tx.type === 'earning' ? 'text-emerald-500' : 'text-foreground'}`}>
                    {tx.type === 'earning' ? '+' : '-'}₦{tx.amount.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Tickets & Withdraw */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex gap-4 p-1.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] w-fit">
            {[
              { id: 'overview', label: 'My Tickets', icon: Ticket },
              { id: 'withdraw', label: 'Cash Out', icon: Banknote }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'overview' ? (
              <motion.div 
                key="tickets"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {myTickets.map((ticket: TicketItem) => (
                  <div key={ticket.id} className="relative group perspective-1000">
                    <Card className="overflow-hidden border-none bg-transparent shadow-none flex transition-transform duration-500 group-hover:translate-y-[-5px]">
                      <div className="w-24 bg-zinc-900 border-l border-y border-white/10 rounded-l-3xl overflow-hidden relative">
                        <img src={ticket.thumbnail} className="w-full h-full object-cover opacity-50" alt="Movie" />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="[writing-mode:vertical-lr] rotate-180 text-[8px] font-black tracking-[0.5em] uppercase text-white/20">PREMIUM ACCESS</span>
                        </div>
                      </div>

                      <div className="flex-1 bg-zinc-900 border-y border-white/10 p-5 relative">
                        <div className="absolute left-0 top-0 bottom-0 w-px border-l border-dashed border-white/20" />
                        <div className="absolute right-0 top-0 bottom-0 w-px border-l border-dashed border-white/20" />
                        
                        <div className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-background border border-white/10" />
                        <div className="absolute -left-2 -bottom-2 w-4 h-4 rounded-full bg-background border border-white/10" />
                        <div className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-background border border-white/10" />
                        <div className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-background border border-white/10" />

                        <div className="flex justify-between items-start mb-4">
                          <div className="min-w-0">
                            <h4 className="font-black text-base text-white uppercase truncate tracking-tight">{ticket.movie}</h4>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Badge variant="outline" className="text-[8px] border-primary/30 text-primary bg-primary/5 uppercase font-black px-1.5">{ticket.room}</Badge>
                            </div>
                          </div>
                          <Badge className={`${ticket.status === 'upcoming' ? 'bg-emerald-500' : 'bg-slate-700'} text-[8px] font-black`}>{ticket.status.toUpperCase()}</Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-y-4">
                          <div>
                            <p className="text-[7px] font-black text-muted-foreground uppercase tracking-widest mb-1">Schedule</p>
                            <p className="text-[10px] font-bold text-white flex items-center gap-1.5"><Calendar className="w-3 h-3 text-primary" /> {ticket.date}</p>
                            <p className="text-[10px] font-bold text-white flex items-center gap-1.5 mt-1"><Clock className="w-3 h-3 text-primary" /> {ticket.time}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[7px] font-black text-muted-foreground uppercase tracking-widest mb-1">Assignment</p>
                            <p className="text-[10px] font-black text-primary">SEAT {ticket.seat}</p>
                            <p className="text-[8px] font-medium text-white/40 mt-1 uppercase truncate">{ticket.id}</p>
                          </div>
                        </div>
                      </div>

                      <div className="w-20 bg-zinc-900 border-r border-y border-white/10 rounded-r-3xl flex flex-col items-center justify-center gap-2 p-2 relative">
                        <div className="p-1.5 bg-white rounded-lg group-hover:scale-110 transition-transform">
                          <QrCode className="w-9 h-9 text-black" />
                        </div>
                        <span className="text-[7px] font-black text-white/30 tracking-widest uppercase">Room Link</span>
                        <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                           <Share2 className="w-6 h-6 text-white" />
                        </div>
                      </div>
                    </Card>
                    
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all rounded-3xl flex flex-col items-center justify-center gap-4 border border-primary/20">
                      <div className="text-center space-y-1 px-4">
                        <p className="text-sm font-black text-white">Share Your Experience</p>
                        <p className="text-[10px] text-white/60">Invite friends with your unique room link.</p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => handleShareTicket(ticket)}
                          size="sm" 
                          className="rounded-full gap-2 px-6"
                        >
                          <Share2 className="w-4 h-4" /> Share Info
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="rounded-full gap-2 bg-white/5 border-white/10"
                          onClick={() => toast.success('Room code copied!')}
                        >
                          <ExternalLink className="w-4 h-4" /> Code
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div 
                key="withdraw"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <Card className="p-8 glass-card border-white/10 overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                     <Banknote className="w-40 h-40 rotate-12" />
                  </div>
                  
                  <div className="max-w-md space-y-8 relative z-10">
                    <div className="space-y-2">
                      <h3 className="text-3xl font-black tracking-tight text-foreground uppercase">Cash Out</h3>
                      <p className="text-muted-foreground text-sm font-medium">Withdraw your funds to your bank account anytime. Instant processing for members.</p>
                    </div>

                    <div className="p-6 bg-primary/10 rounded-3xl border border-primary/20 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Available Balance</p>
                        <p className="text-4xl font-black text-white">₦{balance.available.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Destination Bank</label>
                        <div className="p-4 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-between group hover:bg-white/[0.08] transition-colors cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center border border-white/10 group-hover:border-primary/50 transition-colors">
                              <CreditCard className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-black">Access Bank ****1024</p>
                              <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Primary Account
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Withdrawal Amount</label>
                        <div className="relative group">
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-muted-foreground group-focus-within:text-primary">₦</span>
                          <input 
                            type="number" 
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-12 pr-6 text-2xl font-black outline-none focus:border-primary/50 transition-all placeholder:text-white/10"
                            placeholder="0"
                            onChange={(e) => setFundAmount(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/20">
                         <p className="text-[10px] font-medium text-orange-200/60 leading-relaxed">
                           <span className="font-black text-orange-400 uppercase">Note:</span> 30% platform charge only applies to host earnings. Personal withdrawals are free of charge.
                         </p>
                      </div>

                      <Button className="w-full py-7 rounded-2xl font-black text-xl gradient-bg shadow-[0_0_30px_rgba(59,130,246,0.2)] hover:scale-[1.02] transition-transform">
                        Confirm Cash Out
                      </Button>
                    </div>
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
