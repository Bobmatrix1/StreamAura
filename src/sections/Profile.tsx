import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Mail, 
  Lock, 
  Camera, 
  Building, 
  CreditCard, 
  CheckCircle2, 
  Loader2, 
  ChevronDown,
  LogOut,
  AlertTriangle,
  Eye,
  EyeOff
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { db, auth, uploadFile } from '../lib/firebase';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { fetchBanks, resolveBankAccount } from '../api/paymentApi';
import { LoginRequired } from '../components/LoginRequired';

interface Bank {
  name: string;
  code: string;
  slug?: string;
}

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

const Profile: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { showSuccess, showError } = useToast();

  if (!isAuthenticated) {
    return (
      <LoginRequired
        title="My Profile"
        description="Sign in to customize your profile, manage bank details, and secure your account."
        icon={User}
      />
    );
  }

  const [activeTab, setActiveTab] = useState<'info' | 'bank' | 'security'>('info');
  
  // Personal Info State
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState('');
  const [isUpdatingInfo, setIsUpdatingInfo] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Bank State
  const [availableBanks, setAvailableBanks] = useState<Bank[]>([]);
  const [bankDetails, setBankDetails] = useState({ name: '', account: '', bankName: '', bankCode: '', logo: '' });
  const [bankSearch, setBankQuery] = useState('');
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Load Data
  useEffect(() => {
    if (user?.uid) {
      const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.displayName) setDisplayName(data.displayName);
          if (data.bio) setBio(data.bio);
          if (data.bankDetails) setBankDetails(data.bankDetails);
        }
      });
      return () => unsub();
    }
  }, [user?.uid]);

  // Load Banks
  useEffect(() => {
    const loadBanks = async () => {
      try {
        const result = await fetchBanks();
        if (result.status && Array.isArray(result.data)) {
          setAvailableBanks(result.data);
        }
      } catch (err) {}
    };
    loadBanks();
  }, []);

  // Bank Dropdown Click Outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowBankDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Bank Resolution
  useEffect(() => {
    if (bankDetails.account.length === 10 && bankDetails.bankCode && !bankDetails.name) {
      const resolve = async () => {
        setIsResolving(true);
        try {
          const result = await resolveBankAccount(bankDetails.account, bankDetails.bankCode);
          if (result.status && result.data?.account_name) {
            setBankDetails(prev => ({ ...prev, name: result.data.account_name }));
            showSuccess("Account verified!");
          } else {
            showError("Could not verify account.");
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
    } else if (bankDetails.account.length < 10 && bankDetails.name) {
      setBankDetails(prev => ({ ...prev, name: '' }));
    }
  }, [bankDetails.account, bankDetails.bankCode]);

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return showError("Display name is required");
    
    setIsUpdatingInfo(true);
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName });
      }
      await updateDoc(doc(db, 'users', user!.uid), {
        displayName,
        bio,
        updatedAt: serverTimestamp()
      });
      showSuccess("Profile updated successfully!");
    } catch (err: any) {
      showError(err.message || "Failed to update profile");
    } finally {
      setIsUpdatingInfo(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      return showError("Image must be less than 2MB");
    }

    setIsUploadingPhoto(true);
    try {
      const photoURL = await uploadFile(file, `avatars/${user!.uid}`);
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { photoURL });
      }
      await updateDoc(doc(db, 'users', user!.uid), { photoURL });
      showSuccess("Photo uploaded successfully!");
    } catch (err: any) {
      showError("Failed to upload photo");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveBank = async () => {
    if (!bankDetails.name || bankDetails.account.length !== 10) {
      return showError("Please verify your account details first");
    }

    setIsSavingBank(true);
    try {
      await updateDoc(doc(db, 'users', user!.uid), { bankDetails });
      showSuccess("Bank details saved!");
    } catch (err: any) {
      showError("Failed to save bank details");
    } finally {
      setIsSavingBank(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return showError("Passwords do not match");
    if (newPassword.length < 6) return showError("Password must be at least 6 characters");

    setIsUpdatingPassword(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) throw new Error("No user found");

      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      
      showSuccess("Password updated successfully!");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showError(err.message || "Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const getSuggestedBanks = () => {
    if (bankDetails.account.length >= 3) {
      const p3 = bankDetails.account.substring(0, 3);
      const p5 = bankDetails.account.substring(0, 5);
      const p6 = bankDetails.account.substring(0, 6);
      return BANK_PREFIXES[p6] || BANK_PREFIXES[p5] || BANK_PREFIXES[p3] || [];
    }
    return [];
  };

  const filteredBanks = availableBanks.filter(b => {
    if (bankSearch) return b.name.toLowerCase().includes(bankSearch.toLowerCase());
    const suggested = getSuggestedBanks();
    if (suggested.length > 0 && bankDetails.account.length >= 3 && !bankDetails.bankCode) {
      return suggested.some(name => b.name.toLowerCase().includes(name.toLowerCase()));
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {/* Header Profile Section */}
      <div className="relative p-8 rounded-3xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/10 overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 p-4">
            <Badge className="bg-blue-500 text-white border-none px-3 py-1 text-[10px] font-black uppercase tracking-widest">Active Member</Badge>
         </div>
         
         <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
            <div className="relative group">
               <div className="w-32 h-32 rounded-full border-4 border-white/10 overflow-hidden shadow-2xl relative">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                       <User className="w-12 h-12 text-white/50" />
                    </div>
                  )}
                  {isUploadingPhoto && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                       <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                  )}
               </div>
               <label className="absolute bottom-0 right-0 p-2 bg-blue-500 rounded-full text-white cursor-pointer shadow-lg hover:bg-blue-400 transition-all transform hover:scale-110 active:scale-95 group-hover:scale-110">
                  <Camera className="w-4 h-4" />
                  <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
               </label>
            </div>

            <div className="text-center md:text-left space-y-2">
               <h1 className="text-3xl font-black text-white uppercase tracking-tight">{displayName || 'Aura User'}</h1>
               <p className="text-xs text-blue-300 font-bold uppercase tracking-[0.2em] opacity-80">{user?.email}</p>
               <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-2">
                  <Badge variant="outline" className="bg-white/5 border-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest px-3">
                     Joined {new Date(user?.createdAt || Date.now()).toLocaleDateString()}
                  </Badge>
                  <Badge variant="outline" className="bg-white/5 border-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest px-3">
                     Aura ID: {user?.uid.substring(0, 8).toUpperCase()}
                  </Badge>
               </div>
            </div>
         </div>

         {/* Stats Preview */}
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-white/10">
            <div className="text-center md:text-left">
               <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Referral Balance</p>
               <p className="text-lg font-black text-emerald-400">₦{user?.referralBalance?.toLocaleString() || 0}</p>
            </div>
            <div className="text-center md:text-left border-l border-white/5 pl-4">
               <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Network Size</p>
               <p className="text-lg font-black text-blue-400">{user?.referredCount || 0} Users</p>
            </div>
            <div className="text-center md:text-left border-l border-white/5 pl-4">
               <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Bonus Credit</p>
               <p className="text-lg font-black text-amber-400">₦{user?.bonusBalance?.toLocaleString() || 0}</p>
            </div>
            <div className="text-center md:text-left border-l border-white/5 pl-4">
               <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Status</p>
               <p className={`text-lg font-black ${user?.isAdmin ? 'text-rose-500' : 'text-slate-500'}`}>{user?.isAdmin ? 'ADMIN' : 'MEMBER'}</p>
            </div>
         </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 p-1 bg-white/5 rounded-2xl border border-white/10">
         {[
           { id: 'info', label: 'Personal Info', icon: User },
           { id: 'bank', label: 'Bank Details', icon: Building },
           { id: 'security', label: 'Security & Privacy', icon: Lock }
         ].map(tab => (
           <button
             key={tab.id}
             onClick={() => setActiveTab(tab.id as any)}
             className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
               activeTab === tab.id 
               ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
               : 'text-white/40 hover:bg-white/5 hover:text-white'
             }`}
           >
             <tab.icon className="w-3.5 h-3.5" />
             {tab.label}
           </button>
         ))}
      </div>

      <AnimatePresence mode="wait">
         {activeTab === 'info' && (
           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <Card className="glass-card p-8 border-white/10 shadow-2xl">
                 <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                       <User className="w-5 h-5" />
                    </div>
                    <div>
                       <h2 className="text-xl font-black text-white uppercase tracking-tight">Edit Basic Details</h2>
                       <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest">Visible across the Aura ecosystem</p>
                    </div>
                 </div>

                 <form onSubmit={handleUpdateInfo} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-white/40 tracking-widest px-1">Display Name</label>
                          <div className="relative">
                             <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                             <input 
                               type="text" 
                               value={displayName}
                               onChange={e => setDisplayName(e.target.value)}
                               placeholder="What should we call you?"
                               className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-sm font-bold outline-none focus:border-blue-500/50 text-white" 
                             />
                          </div>
                       </div>
                       <div className="space-y-2 opacity-60">
                          <label className="text-[10px] font-black uppercase text-white/40 tracking-widest px-1">Email Address (Locked)</label>
                          <div className="relative">
                             <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                             <input 
                               type="email" 
                               value={user?.email || ''} 
                               disabled 
                               className="w-full bg-white/[0.02] border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-sm font-bold cursor-not-allowed text-white/40" 
                             />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase text-white/40 tracking-widest px-1">Short Bio</label>
                       <textarea 
                         value={bio}
                         onChange={e => setBio(e.target.value)}
                         placeholder="Tell the community a bit about yourself..."
                         rows={4}
                         className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-sm font-bold outline-none focus:border-blue-500/50 text-white resize-none"
                       />
                    </div>

                    <div className="flex justify-end pt-4">
                       <Button 
                         type="submit" 
                         disabled={isUpdatingInfo} 
                         className="h-12 px-10 gradient-bg rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-500/20"
                       >
                          {isUpdatingInfo ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Changes'}
                       </Button>
                    </div>
                 </form>
              </Card>
           </motion.div>
         )}

         {activeTab === 'bank' && (
           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Card className="glass-card p-8 border-white/10 shadow-2xl overflow-visible">
                 <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                       <Building className="w-5 h-5" />
                    </div>
                    <div>
                       <h2 className="text-xl font-black text-white uppercase tracking-tight">Payout Configuration</h2>
                       <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest">Where your earnings go</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-white/40 tracking-widest px-1">Account Number</label>
                          <div className="relative">
                             <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                             <input 
                               type="text"
                               inputMode="numeric"
                               maxLength={10}
                               value={bankDetails.account}
                               onChange={e => {
                                  const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                                  setBankDetails(prev => ({ ...prev, account: val }));
                               }}
                               placeholder="10 Digits"
                               className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-sm font-black outline-none focus:border-emerald-500/50 text-white" 
                             />
                             {isResolving && (
                               <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                  <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                               </div>
                             )}
                          </div>
                       </div>

                       <div className="space-y-2 relative" ref={dropdownRef}>
                          <label className="text-[10px] font-black uppercase text-white/40 tracking-widest px-1">Bank Name</label>
                          <div className="relative">
                             <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                             <input 
                               type="text" 
                               value={bankSearch || bankDetails.bankName}
                               onFocus={() => setShowBankDropdown(true)}
                               onChange={e => {
                                  setBankQuery(e.target.value);
                                  setBankDetails(prev => ({ ...prev, bankName: e.target.value, bankCode: '', name: '' }));
                               }}
                               placeholder="Search bank..."
                               className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-sm font-bold outline-none focus:border-emerald-500/50 text-white" 
                             />
                             <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 transition-transform ${showBankDropdown ? 'rotate-180' : ''}`} />
                          </div>

                          <AnimatePresence>
                             {showBankDropdown && (
                               <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute z-[100] left-0 right-0 mt-2 bg-[#0a0f1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                                  {filteredBanks.map((bank, index) => (
                                    <button 
                                      key={`${bank.code}-${index}`}
                                      onClick={() => {
                                         setBankDetails(prev => ({ ...prev, bankName: bank.name, bankCode: bank.code }));
                                         setBankQuery(bank.name);
                                         setShowBankDropdown(false);
                                      }}
                                      className="w-full text-left px-4 py-3 text-xs font-bold text-white/80 hover:bg-emerald-500/10 hover:text-white transition-colors flex items-center gap-3 border-b border-white/5 last:border-0"
                                    >
                                       <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[8px] font-black uppercase overflow-hidden">
                                          {bank.slug ? (
                                            <img src={`https://raw.githubusercontent.com/iam-kevin/nigerian-banks-logos/master/logos/${bank.slug}.png`} alt="" onError={(e) => (e.target as any).style.display='none'} />
                                          ) : bank.name.substring(0, 2)}
                                       </div>
                                       {bank.name}
                                    </button>
                                  ))}
                                  {filteredBanks.length === 0 && <div className="p-4 text-center text-[10px] font-black text-white/20 uppercase tracking-widest">No banks found</div>}
                               </motion.div>
                             )}
                          </AnimatePresence>
                       </div>

                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-white/40 tracking-widest px-1">Account Name</label>
                          <div className="relative">
                             <input 
                               value={bankDetails.name} 
                               readOnly 
                               placeholder="Verifies automatically..." 
                               className="w-full bg-white/[0.02] border border-white/10 rounded-xl py-3.5 px-4 text-sm font-black text-emerald-400 uppercase tracking-tight cursor-not-allowed" 
                             />
                             {bankDetails.name && <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />}
                          </div>
                       </div>
                    </div>

                    <div className="flex flex-col justify-between">
                       <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-4">
                          <div className="flex items-center gap-2 text-amber-500">
                             <AlertTriangle className="w-4 h-4" />
                             <span className="text-[10px] font-black uppercase tracking-widest">Payout Safety Info</span>
                          </div>
                          <p className="text-[10px] text-amber-200/60 font-medium leading-relaxed uppercase tracking-tight">
                             Ensure your bank details are correct. StreamAura is not responsible for funds sent to incorrect accounts. Transfers are typically processed within 24 hours.
                          </p>
                       </div>

                       <div className="pt-6">
                          <Button 
                            onClick={handleSaveBank}
                            disabled={!bankDetails.name || isSavingBank}
                            className="w-full h-14 gradient-bg rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-emerald-500/10"
                          >
                             {isSavingBank ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Secure & Save Bank Info'}
                          </Button>
                       </div>
                    </div>
                 </div>
              </Card>
           </motion.div>
         )}

         {activeTab === 'security' && (
           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <Card className="glass-card p-8 border-white/10 shadow-2xl">
                 <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20">
                       <Lock className="w-5 h-5" />
                    </div>
                    <div>
                       <h2 className="text-xl font-black text-white uppercase tracking-tight">Security & Auth</h2>
                       <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest">Secure your account credentials</p>
                    </div>
                 </div>

                 <form onSubmit={handleChangePassword} className="space-y-6 max-w-lg">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase text-white/40 tracking-widest px-1">Current Password</label>
                       <div className="relative">
                          <input 
                            type={showCurrentPassword ? "text" : "password"} 
                            required
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-4 pr-11 text-sm font-bold outline-none focus:border-rose-500/50 text-white" 
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                          >
                             {showCurrentPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                       </div>
                    </div>

                    <div className="space-y-2 pt-2">
                       <label className="text-[10px] font-black uppercase text-white/40 tracking-widest px-1">New Secure Password</label>
                       <div className="relative">
                          <input 
                            type={showNewPassword ? "text" : "password"} 
                            required
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-4 pr-11 text-sm font-bold outline-none focus:border-rose-500/50 text-white" 
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                          >
                             {showNewPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase text-white/40 tracking-widest px-1">Confirm New Password</label>
                       <div className="relative">
                          <input 
                            type={showConfirmPassword ? "text" : "password"} 
                            required
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-4 pr-11 text-sm font-bold outline-none focus:border-rose-500/50 text-white" 
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                          >
                             {showConfirmPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                       </div>
                    </div>



                    <div className="pt-4">
                       <Button 
                         type="submit" 
                         disabled={isUpdatingPassword}
                         className="h-12 px-10 bg-rose-500 hover:bg-rose-400 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-rose-500/20"
                       >
                          {isUpdatingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update Access Credentials'}
                       </Button>
                    </div>
                 </form>
              </Card>
           </motion.div>
         )}
      </AnimatePresence>

      <div className="flex justify-center pt-8">
         <Button onClick={logout} variant="ghost" className="text-white/40 hover:text-red-400 hover:bg-red-500/10 text-[10px] font-black uppercase tracking-[0.2em]">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out of Aura
         </Button>
      </div>
    </div>
  );
};

export default Profile;
