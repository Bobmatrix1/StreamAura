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
  Settings,
  LineChart,
  Clock,
  TrendingUp,
  Eye,
  Download,
  History as HistoryIcon,
  Send,
  MessageSquare,
  Info
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
import { API_BASE_URL } from '../api/mediaApi';
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
  
  const [activeTab, setActiveTab] = useState<'users' | 'history' | 'traffic' | 'insights' | 'messages'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [history, setHistory] = useState<GlobalHistoryItem[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Notification State
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Insight Accordion State
  const [expandedInsight, setExpandedInsight] = useState<string | null>('users');
  const [showAllItems, setShowAllItems] = useState<Record<string, boolean>>({});

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

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle || !notifMessage) return;
    
    setIsSending(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: notifTitle,
          message: notifMessage
        })
      });
      
      const result = await response.json();
      if (result.success) {
        const count = result.data?.delivered_to ?? 0;
        showSuccess(`Broadcast delivered to ${count} users.`);
        setNotifTitle('');
        setNotifMessage('');
      } else {
        showError(result.error || 'Failed to send broadcast');
      }
    } catch (err) {
      showError("Connection to backend failed.");
    } finally {
      setIsSending(false);
    }
  };

  const handleWipeNotificationsAction = () => {
    setConfirmModal({
      isOpen: true,
      title: "Wipe System Notifications",
      message: "DANGER: This will delete ALL notifications from EVERY user's inbox. This cannot be undone.",
      type: 'danger',
      onConfirm: async () => {
        setIsSending(true);
        try {
          const resp = await fetch(`${API_BASE_URL}/api/admin/notifications/clear`, { method: 'DELETE' });
          const res = await resp.json();
          if (res.success) {
            showSuccess(`Cleared ${res.total_cleared} notifications system-wide.`);
            closeConfirmModal();
          }
        } catch (e) {
          showError("Clear failed.");
        } finally {
          setIsSending(false);
        }
      }
    });
  };

  const handleToggleAdminAction = (uid: string, name: string, isAdmin: boolean) => {
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

  const formatTime = (minutes: number) => {
    if (!minutes) return '0m';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const sortedUserIds = Object.keys(groupedHistory).sort((a, b) => {
    const latestA = groupedHistory[a].downloads[0].downloadedAt;
    const latestB = groupedHistory[b].downloads[0].downloadedAt;
    return latestB - latestA;
  });

  const filteredTraffic = stats?.topCountries.filter(c => 
    c.country.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const toggleShowAll = (id: string) => {
    setShowAllItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
        <div className="flex flex-wrap items-center gap-2 p-1 glass rounded-xl w-fit">
          <button onClick={() => setActiveTab('users')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Users className="w-4 h-4" />Users</button>
          <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Activity className="w-4 h-4" />Activity</button>
          <button onClick={() => setActiveTab('traffic')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'traffic' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Globe className="w-4 h-4" />Traffic</button>
          <button onClick={() => setActiveTab('insights')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'insights' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25' : 'text-muted-foreground hover:text-foreground'}`}><LineChart className="w-4 h-4" />Insights</button>
          <button onClick={() => setActiveTab('messages')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'messages' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Send className="w-4 h-4" />Messages</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400"><BarChart className="w-6 h-6" /></div><div><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Sessions</p><p className="text-2xl font-bold">{formatNumber(stats?.totalVisits)}</p></div></div>
        <div className="glass-card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400"><Users className="w-6 h-6" /></div><div><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Total Users</p><p className="text-2xl font-bold">{formatNumber(stats?.totalUsers)}</p></div></div>
        <div className="glass-card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400"><Clock className="w-6 h-6" /></div><div><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Daily Users</p><p className="text-2xl font-bold text-indigo-400">{formatNumber(stats?.dailyActiveUsers)}</p></div></div>
        <div className="glass-card p-4 flex items-center gap-4 relative overflow-hidden"><div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center text-green-400"><Zap className="w-6 h-6 fill-current animate-pulse" /></div><div><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Online</p><p className="text-2xl font-bold text-green-400">{formatNumber(stats?.onlineNow)}</p></div></div>
        <div className="glass-card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center text-orange-400"><Globe className="w-6 h-6" /></div><div className="flex-1 min-w-0"><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Top Source</p><p className="text-lg font-bold truncate">{stats?.topCountries[0]?.country || '---'}</p></div></div>
      </div>

      <div className="glass-card p-6">
        {/* TOOLBAR (Optional for some tabs) */}
        {activeTab !== 'messages' && activeTab !== 'insights' && (
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
        )}

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
          ) : activeTab === 'traffic' ? (
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
          ) : activeTab === 'messages' ? (
            <div className="p-8 max-w-2xl mx-auto space-y-8">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400 mx-auto">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold">Broadcast Center</h3>
                <p className="text-sm text-muted-foreground">Send a live push notification to all StreamAura users.</p>
              </div>

              <div className="flex justify-end">
                <button 
                  onClick={handleWipeNotificationsAction}
                  className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-[10px] font-black uppercase flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Wipe Global Inbox
                </button>
              </div>

              <form onSubmit={handleSendNotification} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-muted-foreground tracking-widest px-1">Headline / Title</label>
                  <input 
                    type="text" 
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="e.g. New Features Added! 🚀" 
                    className="w-full glass-input p-4 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-muted-foreground tracking-widest px-1">Message Content</label>
                  <textarea 
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Tell your users what's new in this update..." 
                    className="w-full glass-input p-4 rounded-xl h-32 resize-none focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isSending || !notifTitle || !notifMessage}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Broadcast Now</>}
                </button>
              </form>

              <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-3">
                <Info className="w-4 h-4 text-indigo-400 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed uppercase font-bold">
                  Note: This will trigger a live notification on all installed PWAs and increment the app icon badge count for every user.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {/* 1. Top Engaged Users */}
              <div className="glass-card overflow-hidden border-white/5">
                <button onClick={() => setExpandedInsight(expandedInsight === 'users' ? null : 'users')} className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-all">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400"><Users className="w-5 h-5" /></div><div className="text-left"><h3 className="font-bold text-foreground">Top Engaged Users</h3><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Activity tracking enabled</p></div></div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedInsight === 'users' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {expandedInsight === 'users' && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-black/20 border-t border-white/5">
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(stats as any)?.topUsers?.slice(0, showAllItems['users'] ? undefined : 4).map((u: any, i: number) => (
                          <div key={i} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs">{u.name.charAt(0)}</div><div><p className="font-bold text-sm text-foreground">{u.name}</p><p className="text-[10px] text-muted-foreground">{u.email}</p></div></div>
                              <p className="text-xs font-black text-blue-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(u.timeSpent)}</p>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1.5"><HistoryIcon className="w-3 h-3" /> Recent Activities</p>
                              <div className="space-y-1.5">
                                {u.recentActivity?.map((act: any, idx: number) => (
                                  <div key={idx} className="flex items-center gap-2 text-[11px] bg-white/5 p-2 rounded-lg">
                                    {act.action === 'watch' ? <Eye className="w-3 h-3 text-cyan-400" /> : <Download className="w-3 h-3 text-purple-400" />}
                                    <span className="flex-1 truncate font-medium">{act.title}</span>
                                    <span className="text-[9px] font-bold uppercase opacity-40">{act.platform || act.action}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {(stats as any)?.topUsers?.length > 4 && (
                        <div className="p-4 border-t border-white/5 flex justify-center">
                          <button onClick={() => toggleShowAll('users')} className="text-[10px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-2 hover:brightness-125 transition-all">
                            {showAllItems['users'] ? 'Show Less' : 'View All Users'} <ChevronDown className={`w-3 h-3 ${showAllItems['users'] ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 2. Top Searches & Media Trends */}
              <div className="glass-card overflow-hidden border-white/5">
                <button onClick={() => setExpandedInsight(expandedInsight === 'trends' ? null : 'trends')} className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-all">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400"><TrendingUp className="w-5 h-5" /></div><div className="text-left"><h3 className="font-bold text-foreground">Search & Media Trends</h3><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Filtered by 10+ interactions</p></div></div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedInsight === 'trends' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {expandedInsight === 'trends' && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-black/20 border-t border-white/5">
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Top Hot Searches</h4>
                          <div className="space-y-2">
                            {(stats?.topSearches || []).slice(0, showAllItems['trends'] ? undefined : 5).map((s, i) => (
                              <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                <span className="text-sm font-bold truncate pr-4">{s.query}</span>
                                <span className="text-[10px] font-black bg-white/10 px-2 py-1 rounded-lg">{formatNumber(s.count)} HITS</span>
                              </div>
                            ))}
                            {(!stats?.topSearches || stats.topSearches.length === 0) && <p className="text-xs text-muted-foreground italic opacity-50">Threshold (10 hits) not reached</p>}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Popular Content</h4>
                          <div className="space-y-2">
                            {(stats?.topMovies || []).slice(0, showAllItems['trends'] ? undefined : 5).map((m, i) => (
                              <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                                <span className="text-sm font-bold truncate block">{m.title}</span>
                                <div className="flex gap-4"><div className="flex items-center gap-1.5"><Eye className="w-3 h-3 text-cyan-400" /> <span className="text-[10px] font-black text-cyan-400">{formatNumber(m.watches)}</span></div><div className="flex items-center gap-1.5"><Download className="w-3 h-3 text-purple-400" /> <span className="text-[10px] font-black text-purple-400">{formatNumber(m.downloads)}</span></div></div>
                              </div>
                            ))}
                            {(!stats?.topMovies || stats.topMovies.length === 0) && <p className="text-xs text-muted-foreground italic opacity-50">Threshold (10+ interactions) not reached</p>}
                          </div>
                        </div>
                      </div>
                      {((stats?.topSearches?.length || 0) > 5 || (stats?.topMovies?.length || 0) > 5) && (
                        <div className="p-4 border-t border-white/5 flex justify-center"><button onClick={() => toggleShowAll('trends')} className="text-[10px] font-black uppercase tracking-widest text-purple-400 flex items-center gap-2 hover:brightness-125 transition-all">{showAllItems['trends'] ? 'Show Less' : 'View Full Leaderboard'} <ChevronDown className={`w-3 h-3 ${showAllItems['trends'] ? 'rotate-180' : ''}`} /></button></div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 3. Usage & Platforms */}
              <div className="glass-card overflow-hidden border-white/5">
                <button onClick={() => setExpandedInsight(expandedInsight === 'usage' ? null : 'usage')} className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-all">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400"><BarChart className="w-5 h-5" /></div><div className="text-left"><h3 className="font-bold text-foreground">Usage Analytics</h3><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Features & Platforms</p></div></div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedInsight === 'usage' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {expandedInsight === 'usage' && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-black/20 border-t border-white/5">
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Feature Popularity</h4>
                          <div className="space-y-4">
                            {stats?.featureUsage.map((f, i) => {
                              const max = stats.featureUsage[0].count;
                              const percentage = (f.count / max) * 100;
                              return (
                                <div key={i} className="space-y-2">
                                  <div className="flex justify-between text-[10px] font-black uppercase text-foreground"><span>{f.feature}</span><span>{formatNumber(f.count)} ACTIONS</span></div>
                                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} className={`h-full ${i === 0 ? 'bg-cyan-500' : 'bg-white/20'}`} /></div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Source Conversion</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {stats?.topPlatforms.map((p, i) => (
                              <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-white/[0.03] border border-white/5"><span className="text-xs font-bold capitalize">{p.platform}</span><span className="text-[10px] font-black text-orange-400">{formatNumber(p.count)}</span></div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 4. Peak Traffic Times */}
              <div className="glass-card overflow-hidden border-white/5">
                <button onClick={() => setExpandedInsight(expandedInsight === 'time' ? null : 'time')} className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-all">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400"><Clock className="w-5 h-5" /></div><div className="text-left"><h3 className="font-bold text-foreground">Peak Usage Times</h3><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">24H Heat Map (12H Format)</p></div></div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedInsight === 'time' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {expandedInsight === 'time' && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-black/20 border-t border-white/5">
                      <div className="p-6 flex flex-wrap gap-3">
                        {stats?.peakHours.map((h: any, i: number) => (
                          <div key={i} className="flex-1 min-w-[120px] p-4 rounded-2xl bg-white/[0.03] border border-white/5 text-center space-y-1">
                            <p className="text-xl font-black text-blue-400">{h.display}</p>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{formatNumber(h.count)} VISITS</p>
                            <div className="w-full h-1 bg-white/5 mt-2 rounded-full overflow-hidden"><div className="h-full bg-blue-500/40" style={{ width: `${(h.count / stats.peakHours[0].count) * 100}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
