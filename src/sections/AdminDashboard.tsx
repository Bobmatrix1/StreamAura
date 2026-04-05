import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Activity, 
  Trash2, 
  Shield, 
  ShieldOff,
  Search,
  Loader2,
  BarChart,
  Globe,
  Zap,
  ChevronDown,
  AlertTriangle,
  Smartphone,
  Laptop,
  Tablet as TabletIcon,
  HelpCircle,
  RefreshCcw,
  Settings
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { 
  getAllUsers, 
  toggleAdminStatus, 
  deleteUserAccount,
  getGlobalHistory,
  getStatsSummary,
  clearUserHistory,
  clearAllHistory,
  clearAllTraffic,
  type SystemStats
} from '../lib/firebase';
import type { User, GlobalHistoryItem } from '../types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const AdminDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showSuccess, showError } = useToast();
  
  const [activeTab, setActiveTab] = useState<'users' | 'history' | 'traffic'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [history, setHistory] = useState<GlobalHistoryItem[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'danger'
  });

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const loadStats = async () => {
    try {
      const data = await getStatsSummary();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats');
    }
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (error: any) {
      showError(error.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await getGlobalHistory(100);
      setHistory(data);
    } catch (error: any) {
      showError(error.message || 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  };

  // --- ACTIONS ---

  const handleToggleAdminAction = (uid: string, name: string, isAdmin: boolean) => {
    console.log(`[ACTION] Toggle Admin Clicked for: ${name} (${uid})`);
    if (uid === currentUser?.uid) {
      showError("Self-demotion is restricted.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: isAdmin ? "Demote Admin" : "Promote to Admin",
      message: `Are you sure you want to change ${name}'s role?`,
      type: 'warning',
      onConfirm: async () => {
        console.log(`[ACTION] Confirming Admin Change for ${uid}`);
        try {
          await toggleAdminStatus(uid, !isAdmin);
          showSuccess(`${name} role updated.`);
          loadUsers();
          closeConfirmModal();
        } catch (err: any) {
          showError(err.message);
        }
      }
    });
  };

  const handleDeleteUserAction = (uid: string, name: string) => {
    console.log(`[ACTION] Delete User Clicked for: ${name} (${uid})`);
    if (uid === currentUser?.uid) {
      showError("You cannot delete yourself.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Permanent Removal",
      message: `Delete ${name}'s account and profile data? This is permanent.`,
      type: 'danger',
      onConfirm: async () => {
        console.log(`[ACTION] Confirming Deletion for ${uid}`);
        try {
          await deleteUserAccount(uid);
          showSuccess(`${name} removed.`);
          loadUsers();
          loadStats();
          closeConfirmModal();
        } catch (err: any) {
          showError(err.message);
        }
      }
    });
  };

  const handleResetTrafficAction = () => {
    setConfirmModal({
      isOpen: true,
      title: "Reset Traffic Logs",
      message: "This will wipe all visit logs and reset the traffic counter to zero. Proceed?",
      type: 'danger',
      onConfirm: async () => {
        try {
          await clearAllTraffic();
          showSuccess("Traffic stats reset.");
          loadStats();
          closeConfirmModal();
        } catch (err: any) {
          showError(err.message);
        }
      }
    });
  };

  const handleClearHistoryAction = (uid?: string, name?: string) => {
    setConfirmModal({
      isOpen: true,
      title: uid ? "Clear History" : "Wipe All Records",
      message: uid ? `Delete download logs for ${name}?` : "Delete EVERY record in the system?",
      type: 'danger',
      onConfirm: async () => {
        try {
          if (uid) await clearUserHistory(uid);
          else await clearAllHistory();
          showSuccess("History cleared.");
          loadHistory();
          closeConfirmModal();
        } catch (err: any) {
          showError(err.message);
        }
      }
    });
  };

  useEffect(() => {
    loadStats();
    if (activeTab === 'users') loadUsers();
    else if (activeTab === 'history') loadHistory();
    else setIsLoading(false);
  }, [activeTab]);

  const getDeviceIcon = (device: string = '') => {
    const d = device.toLowerCase();
    if (d.includes('android')) return <Smartphone className="w-3.5 h-3.5 text-green-500" />;
    if (d.includes('ios') || d.includes('iphone')) return <Smartphone className="w-3.5 h-3.5 text-blue-500" />;
    if (d.includes('tablet') || d.includes('ipad')) return <TabletIcon className="w-3.5 h-3.5 text-purple-500" />;
    if (d.includes('windows') || d.includes('mac') || d.includes('desktop')) return <Laptop className="w-3.5 h-3.5 text-slate-500" />;
    return <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredHistory = history.filter(h => 
    h.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.platform.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedHistory = filteredHistory.reduce((acc, item) => {
    const userId = item.userId;
    if (!acc[userId]) {
      acc[userId] = {
        userName: item.userDisplayName || 'Unknown User',
        userEmail: item.userEmail || 'No Email',
        downloads: []
      };
    }
    acc[userId].downloads.push(item);
    return acc;
  }, {} as Record<string, { userName: string, userEmail: string, downloads: GlobalHistoryItem[] }>);

  const formatNumber = (num: number | string | undefined): string => {
    if (num === undefined) return '0';
    const n = typeof num === 'string' ? parseInt(num, 10) : num;
    if (isNaN(n)) return '0';
    
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  };

  const sortedUserIds = Object.keys(groupedHistory).sort((a, b) => {
    const latestA = groupedHistory[a].downloads[0].downloadedAt;
    const latestB = groupedHistory[b].downloads[0].downloadedAt;
    return latestB - latestA;
  });

  const filteredTraffic = stats?.topCountries.filter(c => 
    c.country.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 pb-10">
      {/* MODAL LAYER */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeConfirmModal} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md glass-card p-8 border-white/10 shadow-2xl">
              <div className={`absolute top-0 left-0 w-full h-1 ${confirmModal.type === 'danger' ? 'bg-red-500' : 'bg-orange-500'}`} />
              <div className="flex flex-col items-center text-center space-y-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${confirmModal.type === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}><AlertTriangle className="w-8 h-8" /></div>
                <div className="space-y-2"><h3 className="text-xl font-bold text-foreground">{confirmModal.title}</h3><p className="text-sm text-muted-foreground">{confirmModal.message}</p></div>
                <div className="flex items-center gap-3 w-full pt-4">
                  <button onClick={closeConfirmModal} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 transition-all">Cancel</button>
                  <button onClick={confirmModal.onConfirm} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all ${confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20' : 'bg-orange-600 hover:bg-orange-500 shadow-orange-600/20'}`}>Confirm</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm">System management & live monitoring.</p>
        </div>
        <div className="flex items-center gap-2 p-1 glass rounded-xl w-fit">
          <button onClick={() => setActiveTab('users')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Users className="w-4 h-4" />Users</button>
          <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Activity className="w-4 h-4" />Activity</button>
          <button onClick={() => setActiveTab('traffic')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'traffic' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Globe className="w-4 h-4" />Traffic</button>
        </div>
      </div>

      {/* QUICK STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400"><BarChart className="w-6 h-6" /></div><div><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Sessions</p><p className="text-2xl font-bold">{formatNumber(stats?.totalVisits)}</p></div></div>
        <div className="glass-card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400"><Users className="w-6 h-6" /></div><div><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Total Users</p><p className="text-2xl font-bold">{formatNumber(stats?.totalUsers)}</p></div></div>
        <div className="glass-card p-4 flex items-center gap-4 relative overflow-hidden"><div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center text-green-400"><Zap className="w-6 h-6 fill-current animate-pulse" /></div><div><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Online</p><p className="text-2xl font-bold text-green-400">{formatNumber(stats?.onlineNow)}</p></div></div>
        <div className="glass-card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center text-orange-400"><Globe className="w-6 h-6" /></div><div className="flex-1 min-w-0"><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Top Source</p><p className="text-lg font-bold truncate">{stats?.topCountries[0]?.country || '---'}</p></div></div>
      </div>

      <div className="glass-card p-6">
        {/* TOOLBAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Filter data..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full glass-input pl-10 pr-4 py-2 text-sm focus:outline-none transition-all rounded-lg border-white/10" />
          </div>
          <div className="flex items-center gap-3">
            {activeTab === 'history' && (
              <button onClick={() => handleClearHistoryAction()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-xs font-bold"><Trash2 className="w-3.5 h-3.5" />Wipe Records</button>
            )}
            {activeTab === 'traffic' && (
              <button onClick={handleResetTrafficAction} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-xs font-bold"><RefreshCcw className="w-3.5 h-3.5" />Reset Traffic</button>
            )}
          </div>
        </div>

        {/* MAIN AREA */}
        <div className="overflow-hidden rounded-xl border border-white/5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24"><Loader2 className="w-10 h-10 text-primary animate-spin mb-4" /><p className="text-muted-foreground font-medium tracking-widest text-xs uppercase">Syncing</p></div>
          ) : activeTab === 'users' ? (
            <Table>
              <TableHeader><TableRow className="border-white/5 bg-white/[0.02] hover:bg-transparent"><TableHead className="text-muted-foreground font-bold">USER IDENTITY</TableHead><TableHead className="text-muted-foreground font-bold">DEVICE OS</TableHead><TableHead className="text-muted-foreground font-bold">JOINED</TableHead><TableHead className="text-right text-muted-foreground font-bold pr-10">CONTROLS</TableHead></TableRow></TableHeader>
              <TableBody>
                {filteredUsers.map(user => (
                  <TableRow key={user.uid} className="border-white/5 hover:bg-white/[0.03]">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-white/5 flex items-center justify-center">{user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-primary" />}</div>
                        <div className="flex flex-col"><span className="font-bold text-sm">{user.displayName || 'Anonymous'}</span><span className="text-[10px] text-muted-foreground uppercase">{user.email}</span></div>
                      </div>
                    </TableCell>
                    <TableCell><div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 w-fit">{getDeviceIcon((user as any).lastDevice)}<span className="text-[10px] font-black uppercase">{(user as any).lastDevice || 'Unknown'}</span></div></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right pr-6">
                      {/* ACTION BUTTONS */}
                      <div className="flex items-center justify-end gap-2 relative z-[100]">
                        <button
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            handleToggleAdminAction(user.uid, user.displayName || 'User', user.isAdmin);
                          }}
                          disabled={user.uid === currentUser?.uid}
                          className={`p-3 rounded-xl transition-all shadow-lg active:scale-95 active:brightness-125 disabled:opacity-20 ${
                            user.isAdmin ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/40' : 'bg-green-500/20 text-green-400 hover:bg-green-500/40'
                          }`}
                        >
                          {user.isAdmin ? <ShieldOff className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            handleDeleteUserAction(user.uid, user.displayName || 'User');
                          }}
                          disabled={user.uid === currentUser?.uid}
                          className="p-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-all shadow-lg active:scale-95 active:brightness-125 disabled:opacity-20"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : activeTab === 'history' ? (
            <div className="divide-y divide-white/5">
              {sortedUserIds.map(userId => {
                const group = groupedHistory[userId];
                const isExpanded = expandedUserId === userId;
                return (
                  <div key={userId}>
                    <button onClick={() => setExpandedUserId(isExpanded ? null : userId)} className={`w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-all ${isExpanded ? 'bg-white/[0.02]' : ''}`}><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/10"><Activity className="w-6 h-6 text-primary" /></div><div className="text-left"><p className="font-bold text-foreground text-base">{group.userName}</p><p className="text-xs text-muted-foreground uppercase font-bold">{group.downloads.length} Tracks</p></div></div><ChevronDown className={`w-6 h-6 text-muted-foreground transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`} /></button>
                    <AnimatePresence>{isExpanded && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-black/20"><div className="p-4 border-t border-white/5 flex items-center justify-between"><p className="text-[10px] text-muted-foreground font-black uppercase">Activity Logs</p><button onClick={(e) => { e.stopPropagation(); handleClearHistoryAction(userId, group.userName); }} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-black uppercase">Clear Data</button></div><div className="p-4 overflow-x-auto"><Table><TableHeader><TableRow className="border-white/5"><TableHead className="text-[10px] uppercase font-black">Content</TableHead><TableHead className="text-[10px] uppercase font-black">Source</TableHead><TableHead className="text-right text-[10px] uppercase font-black">Time</TableHead></TableRow></TableHeader><TableBody>{group.downloads.map((item, idx) => (<TableRow key={item.id + idx} className="border-white/5"><TableCell><div className="flex items-center gap-3"><img src={item.thumbnail} className="w-10 h-10 rounded-lg object-cover border border-white/10" /><div className="flex flex-col"><span className="text-sm font-bold truncate max-w-[200px]">{item.title}</span><span className="text-[10px] text-muted-foreground uppercase">{item.mediaType}</span></div></div></TableCell><TableCell><span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-black uppercase">{item.platform}</span></TableCell><TableCell className="text-right text-[10px] text-muted-foreground font-bold">{new Date(item.downloadedAt).toLocaleString()}</TableCell></TableRow>))}</TableBody></Table></div></motion.div>)}</AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-6 p-4">
              <div className="glass-card p-6 border-red-500/20 bg-red-500/[0.02]">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4 text-center md:text-left">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/10"><Settings className="w-8 h-8 animate-[spin_4s_linear_infinite]" /></div>
                    <div><h3 className="text-lg font-bold text-foreground">System Maintenance</h3><p className="text-sm text-muted-foreground">Clear all visitor analytics and reset session tracking to zero.</p></div>
                  </div>
                  <button onClick={handleResetTrafficAction} className="w-full md:w-auto px-8 py-4 rounded-2xl bg-red-600 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-red-600/30 flex items-center justify-center gap-3 hover:bg-red-500 transition-all"><RefreshCcw className="w-4 h-4" />Reset Traffic Analytics</button>
                </div>
              </div>
              <Table>
                <TableHeader><TableRow className="border-white/5 bg-white/[0.02]"><TableHead className="font-bold uppercase tracking-widest text-[10px]">Location / Origin</TableHead><TableHead className="text-right font-bold pr-6 uppercase tracking-widest text-[10px]">Sessions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredTraffic.map((item, idx) => (
                    <TableRow key={idx} className="border-white/5 hover:bg-white/[0.03]"><TableCell><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400 border border-orange-500/20"><Globe className="w-4 h-4" /></div><span className="font-bold text-sm">{item.country}</span></div></TableCell><TableCell className="text-right pr-6"><span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm font-black tracking-tighter">{formatNumber(item.count)}</span></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
