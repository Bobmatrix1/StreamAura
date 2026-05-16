import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Share2, 
  Users, 
  Copy, 
  Gift, 
  Ticket, 
  ShieldAlert,
  Info,
  TrendingUp,
  Award,
  Zap
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { LoginRequired } from '../components/LoginRequired';

/**
 * Referral Section
 * 
 * Professional referral program interface with "Credit Card" style balance display.
 * Handles link sharing, stats tracking, and explains reward logic.
 */
const Referral: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  
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
  const [showLinkDetails, setShowLinkDetails] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      const baseUrl = window.location.origin;
      setReferralLink(`${baseUrl}/?ref=${user.uid}`);
    }
  }, [user?.uid]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied to clipboard!');
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

  // Mock stats - in a real app, these would come from the User object synced with Firestore
  const stats = {
    totalReferred: user?.referredCount || 0,
    balance: user?.referralBalance || 0,
    potentialEarnings: (user?.referredCount || 0) * 100
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground uppercase tracking-tighter">Refer & Earn</h1>
          <p className="text-muted-foreground mt-1 font-medium">Build your network and watch movies for free.</p>
        </div>
        <Button onClick={handleShare} className="gap-2 gradient-bg rounded-xl h-11 text-xs font-black uppercase shadow-lg shadow-primary/20">
          <Share2 className="w-4 h-4" /> Share Link
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Balance Card Section */}
        <div className="lg:col-span-1 space-y-6">
          <motion.div 
            whileHover={{ scale: 1.02 }} 
            className="relative aspect-[1.6/1] w-full rounded-3xl overflow-hidden shadow-2xl group cursor-pointer"
            onClick={() => setShowLinkDetails(!showLinkDetails)}
          >
            {/* "Credit Card" Design */}
            <div className="absolute inset-0 bg-gradient-to-br from-orange-600 via-rose-900 to-black p-6 flex flex-col justify-between overflow-hidden">
              {/* Background Accents */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
              
              <div className="flex justify-between items-start relative z-10">
                <div className="space-y-1">
                  <p className="text-white/50 text-[10px] uppercase font-black tracking-[0.2em]">Referral Balance</p>
                  <motion.h2 
                    key={stats.balance}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-4xl font-black text-white"
                  >
                    ₦{stats.balance.toLocaleString()}
                  </motion.h2>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10">
                  <Gift className="w-6 h-6 text-white" />
                </div>
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
                    <p className="text-[7px] uppercase font-black text-white/40 tracking-[0.3em]">Card Type</p>
                    <p className="text-[10px] font-black text-white uppercase tracking-widest italic">Aura Rewards</p>
                  </div>
                </div>
                
                <div className="pt-2 flex items-center gap-2 border-t border-white/10">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                  </div>
                  <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">
                    ₦100 Earned per active referral
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          <Card className="p-6 glass-card border-white/10 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">My Referral Link</h3>
            <div className="space-y-3">
              <div className="relative group">
                <input 
                  readOnly 
                  value={referralLink} 
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-[10px] font-mono outline-none focus:border-primary/50 text-muted-foreground" 
                />
                <button 
                  onClick={handleCopyLink}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg text-primary transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[8px] text-center text-muted-foreground uppercase tracking-widest font-bold">
                Share this link with friends. When they sign up, you get paid.
              </p>
            </div>
          </Card>
        </div>

        {/* Benefits & Rules Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Card className="p-6 glass-card border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent hover:border-primary/20 transition-all duration-500 group">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                   <Ticket className="w-6 h-6 text-primary" />
                </div>
                <h4 className="text-sm font-black uppercase tracking-tight text-white mb-2">Buy Movie Tickets</h4>
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                  Use your rewards to purchase entry tickets for any public cinema room. 100% of your referral balance can be used for tickets.
                </p>
             </Card>

             <Card className="p-6 glass-card border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent hover:border-purple-500/20 transition-all duration-500 group">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                   <Zap className="w-6 h-6 text-purple-500" />
                </div>
                <h4 className="text-sm font-black uppercase tracking-tight text-white mb-2">Create Private Rooms</h4>
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                  Invite 25 users (Earn ₦2,500) to create 1 seat in a private room. 50 users (Earn ₦5,000) for 2 seats, and so on.
                </p>
             </Card>

             <Card className="p-6 glass-card border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent hover:border-emerald-500/20 transition-all duration-500 group">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                   <Award className="w-6 h-6 text-emerald-500" />
                </div>
                <h4 className="text-sm font-black uppercase tracking-tight text-white mb-2">Season Movie Perks</h4>
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                  Add episodes to season rooms for just ₦50 using rewards (Normally ₦100 from main wallet). 50% discount for referrers!
                </p>
             </Card>

             <Card className="p-6 glass-card border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent hover:border-amber-500/20 transition-all duration-500 group">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                   <ShieldAlert className="w-6 h-6 text-amber-500" />
                </div>
                <h4 className="text-sm font-black uppercase tracking-tight text-white mb-2">Usage Restrictions</h4>
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                  Referral earnings cannot be withdrawn to bank accounts. They are strictly for in-app utilities and premium movie access.
                </p>
             </Card>
          </div>

          {/* Reward Math Breakdown */}
          <Card className="p-8 glass-card border-white/10 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5">
                <Info className="w-32 h-32" />
             </div>
             
             <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-3">
                   <div className="w-1 h-8 bg-primary rounded-full" />
                   <h3 className="text-lg font-black uppercase tracking-widest text-white">The Reward Maths</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">Unit Earnings</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-white">₦100</span>
                        <span className="text-[10px] font-bold text-primary">/ USER</span>
                      </div>
                   </div>

                   <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">Private Room Cost</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-white">₦2,500</span>
                        <span className="text-[10px] font-bold text-purple-400">/ SEAT</span>
                      </div>
                   </div>

                   <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">Season Episode</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-white">₦50</span>
                        <span className="text-[10px] font-bold text-emerald-400">/ EPISODE</span>
                      </div>
                   </div>
                </div>

                <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3">
                   <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                   <p className="text-[10px] text-blue-200/70 font-medium leading-relaxed uppercase tracking-wider">
                     Private room creation normally costs ₦1,000 per seat from your main wallet. Using referral balance costs ₦2,500 (25 users) because reward money is extra bonus aura.
                   </p>
                </div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Referral;
