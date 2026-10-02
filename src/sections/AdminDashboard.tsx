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
  ChevronUp,
  AlertTriangle,
  Smartphone,
  Laptop,
  Tablet as TabletIcon,
  HelpCircle,
  RefreshCcw,
  LineChart,
  Clock,
  TrendingUp,
  Eye,
  Download,
  History as HistoryIcon,
  Send,
  MessageSquare,
  Info,
  Package,
  Store,
  Film,
  Banknote,
  Handshake,
  MapPin,
  Flame,
  Coins,
  Sparkles,

} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { 
  getAllUsers,
  adminCreditUserWallet, 
  toggleAdminStatus, 
  toggleVendorStatus,
  deleteUserAccount,
  getGlobalHistory,
  getStatsSummary,
  getPlatformFinancials,
  clearUserHistory,
  clearAllHistory,
  clearAllTraffic,
  getUserDetails,
  db,
  type SystemStats,
  type PlatformFinancials,
  type UserFinancials,
  type UserActivitySummary
} from '../lib/firebase';
import { collection, getDocs, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
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
import { AuraCoinIcon } from '../components/AuraCoinIcon';
import { Plus, Gamepad2, WalletCards } from 'lucide-react';
import { PreOrderManager } from './PreOrderManager';
import { StoreManager } from './StoreManager';
import { PartnersManager } from './PartnersManager';
import { CinemaContentManager } from './CinemaContentManager';
import { AdsManager } from './AdsManager';
import { Badge } from '../components/ui/badge';
import { CheckCircle2, X, Copy, ChevronRight, Megaphone, FileAudio, FileVideo, ExternalLink, Maximize2, UserCheck, Share2, Mail, Calendar, Key } from 'lucide-react';
import { auth } from '../lib/firebase';

const PAGE_TITLE_MAP: Record<string, string> = {
  home: 'Home Hub',
  video: 'Video Downloader',
  music: 'Music Downloader',
  movie: 'Movie Downloader',
  cinema: 'Cinema Watch Room',
  games: 'Split or Steal Games',
  wallet: 'Wallet & Payouts',
  bulk: 'Bulk Multi-Stream',
  referral: 'Refer & Earn',
  profile: 'User Profile',
  history: 'Download History',
  about: 'About StreamAura'
};

const ActivityThumbnail: React.FC<{ 
  thumbnail?: string; 
  title: string; 
  platform: string; 
  mediaType: string;
}> = ({ thumbnail, title, platform, mediaType }) => {
  const [hasError, setHasError] = useState(false);

  if (!thumbnail || hasError) {
    return (
      <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center bg-white/5 border border-white/10 text-center select-none flex-shrink-0">
        {mediaType === 'audio' || mediaType === 'music' ? (
          <FileAudio className="w-4 h-4 text-orange-400" />
        ) : (
          <FileVideo className="w-4 h-4 text-primary" />
        )}
        <span className="text-[7px] font-black uppercase text-white/70 tracking-wider truncate max-w-full px-0.5">
          {platform?.slice(0, 4) || 'AURA'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={thumbnail}
      alt={title}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
      className="w-10 h-10 rounded-lg object-cover border border-white/10 flex-shrink-0"
    />
  );
};

const AdminDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showSuccess, showError } = useToast();
  
  const [activeTab, setActiveTab] = useState<'users' | 'history' | 'financials' | 'preorders' | 'traffic' | 'insights' | 'messages' | 'store' | 'cinema' | 'payouts' | 'partners' | 'ads'>('users');
  const [financials, setFinancials] = useState<PlatformFinancials | null>(null);
  const [isFinLoading, setIsFinLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [history, setHistory] = useState<GlobalHistoryItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [isUsersCollapsed, setIsUsersCollapsed] = useState(true);
  const [isExpandingUsers, setIsExpandingUsers] = useState(false);
  const [expandedWithdrawalId, setExpandedWithdrawalId] = useState<string | null>(null);
  const [modalInputValue, setModalInputValue] = useState('');

  const loadWithdrawals = () => {
    const q = query(collection(db, 'withdrawals'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    }, (err) => {
      console.error('Failed to stream withdrawals', err);
      setIsLoading(false);
    });
    return unsubscribe;
  };
  
  // Detailed User Info State
  const [userDetails, setUserDetailsMap] = useState<Record<string, { financials: UserFinancials, activity: UserActivitySummary }>>({});
  const [isDetailLoading, setIsDetailLoading] = useState<string | null>(null);

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Notification State
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifLink, setNotifLink] = useState('');
  const [notifImageUrl, setNotifImageUrl] = useState('');
  const [notifButtonText, setNotifButtonText] = useState('Explore Now');
  const [notifType, setNotifType] = useState<'update' | 'ad' | 'general' | 'alert'>('update');
  const [isSending, setIsSending] = useState(false);

  // Insight Accordion State
  const [expandedInsight, setExpandedInsight] = useState<string | null>('users');
  const [showAllItems, setShowAllItems] = useState<Record<string, boolean>>({});

  // User Profile & Avatar Inspection Modal State
  const [selectedUserProfile, setSelectedUserProfile] = useState<User | null>(null);
  const [isAvatarLightboxOpen, setIsAvatarLightboxOpen] = useState(false);

  // User Filter & Realtime Presence Ticker
  const [userFilter, setUserFilter] = useState<'all' | 'online' | 'daily' | 'away' | 'admin' | 'vendor'>('all');
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  // Credit Wallet Modal State
  const [creditModal, setCreditModal] = useState<{
    isOpen: boolean;
    user: User | null;
    walletType: 'main' | 'game' | 'vendor' | 'aura_coins';
    amount: string;
    note: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    user: null,
    walletType: 'main',
    amount: '',
    note: '',
    isSubmitting: false
  });

  const openCreditModal = (user: User, initialWalletType: 'main' | 'game' | 'vendor' | 'aura_coins' = 'main') => {
    setCreditModal({
      isOpen: true,
      user,
      walletType: initialWalletType,
      amount: '',
      note: '',
      isSubmitting: false
    });
  };

  const closeCreditModal = () => {
    if (creditModal.isSubmitting) return;
    setCreditModal(prev => ({ ...prev, isOpen: false }));
  };

  const handleExecuteCredit = async () => {
    if (!creditModal.user) return;
    const parsedAmount = parseFloat(creditModal.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showError("Please enter a valid credit amount strictly greater than 0. Admin cannot deduct funds.");
      return;
    }

    if (creditModal.walletType === 'vendor' && !creditModal.user.isVendor) {
      showError("User is not registered as a Vendor. Please grant vendor status first.");
      return;
    }

    setCreditModal(prev => ({ ...prev, isSubmitting: true }));
    try {
      const res = await adminCreditUserWallet(
        creditModal.user.uid,
        creditModal.walletType,
        parsedAmount,
        creditModal.note
      );

      if (res.success) {
        showSuccess(res.message || `Successfully credited ${creditModal.walletType.replace('_', ' ')} wallet!`);
        setCreditModal(prev => ({ ...prev, isOpen: false }));
        await loadUsers();
        if (creditModal.user.uid) {
          const updatedDetails = await getUserDetails(creditModal.user.uid);
          setUserDetailsMap(prev => ({ ...prev, [creditModal.user!.uid]: updatedDetails }));
        }
      } else {
        showError(res.error || "Failed to credit wallet.");
      }
    } catch (err: any) {
      showError(err.message || "Operation failed.");
    } finally {
      setCreditModal(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: (inputValue?: string) => void | Promise<void>;
    type: 'danger' | 'warning';
    showInput?: boolean;
    inputPlaceholder?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'danger',
    showInput: false,
    inputPlaceholder: ''
  });

  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const closeConfirmModal = () => {
    if (isConfirmLoading) return;
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    setModalInputValue('');
    setIsConfirmLoading(false);
  };

  const loadStats = async () => {
    try {
      const data = await getStatsSummary();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats');
    }
  };

  const loadFinancials = async () => {
    setIsFinLoading(true);
    try {
      const data = await getPlatformFinancials();
      setFinancials(data);
    } catch (err) {
      console.error('Failed to load platform financials', err);
    } finally {
      setIsFinLoading(false);
    }

  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await getAllUsers();
      
      // Fetch wallet balances for all users in parallel
      const walletsRef = collection(db, 'room_wallets');
      const walletSnap = await getDocs(walletsRef);
      const walletMap: Record<string, number> = {};
      walletSnap.docs.forEach(doc => {
        walletMap[doc.id] = doc.data().balance || 0;
      });

      const augmentedUsers = data.map(u => ({
        ...u,
        auraCoins: Number(u.auraCoins ?? (u as any).auraCoin ?? (u as any).bonusBalance ?? 1000),
        walletBalance: walletMap[u.uid] || 0
      }));

      setUsers(augmentedUsers as any);
    } catch (error: any) {
      showError(error.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExpandUsers = async (filter?: 'all' | 'online' | 'daily' | 'away' | 'admin' | 'vendor') => {
    if (filter) {
      setUserFilter(filter);
    }
    setIsExpandingUsers(true);
    try {
      if (users.length === 0) {
        await loadUsers();
      } else {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      setIsUsersCollapsed(false);
    } catch (err) {
      console.error('Error expanding users:', err);
      setIsUsersCollapsed(false);
    } finally {
      setIsExpandingUsers(false);
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
          message: notifMessage,
          link: notifLink.trim() || undefined,
          imageUrl: notifImageUrl.trim() || undefined,
          buttonText: notifButtonText.trim() || 'Explore Now',
          type: notifType
        })
      });
      
      const result = await response.json();
      console.log('Broadcast API Result:', result);
      
      if (result.success) {
        const count = result.data?.delivered_to ?? 0;
        showSuccess(`Broadcast delivered to ${count} users.`);
        setNotifTitle('');
        setNotifMessage('');
        setNotifLink('');
        setNotifImageUrl('');
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

  const handleToggleVendorAction = (uid: string, name: string, isVendor: boolean) => {
    if (uid === currentUser?.uid) {
      showError("Self-modification is restricted.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: isVendor ? "Revoke Vendor Status" : "Grant Vendor Status",
      message: `Are you sure you want to change ${name}'s vendor permissions?`,
      type: 'warning',
      onConfirm: async () => {
        try {
          await toggleVendorStatus(uid, !isVendor);
          showSuccess(`${name}'s vendor status updated.`);
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

  const handlePayoutAction = async (id: string, action: 'approve' | 'reject') => {
    setConfirmModal({
      isOpen: true,
      title: `${action.toUpperCase()} Payout?`,
      message: action === 'approve' 
        ? "This will trigger a real TransactPay transfer to the user's bank account." 
        : "This will reject the request, refund the user's balance, and send a rejection notification.",
      type: action === 'approve' ? 'warning' : 'danger',
      showInput: action === 'reject',
      inputPlaceholder: "Enter rejection reason (required)...",
      onConfirm: async (reason?: string) => {
        if (action === 'reject' && !reason?.trim()) {
          showError("Rejection reason is required");
          return;
        }
        try {
          const token = await auth.currentUser?.getIdToken();
          let url = `${API_BASE_URL}/api/cinema/admin/payouts/${id}/process?action=${action}`;
          if (action === 'reject' && reason) {
            url += `&reason=${encodeURIComponent(reason.trim())}`;
          }
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const result = await resp.json();
          if (result.success) {
            showSuccess(result.message);
          } else {
            showError(result.detail || "Action failed");
          }
        } catch (err) { showError("Network error"); }
        closeConfirmModal();
      }
    });
  };

  useEffect(() => {
    loadStats();
    loadFinancials();

    const finDocRef = doc(db, 'system_analytics', 'platform_financials');
    const unsub = onSnapshot(finDocRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setFinancials(prev => ({
          success: true,
          total_burned_auracoins: Number(d.total_burned_auracoins || 0),
          total_platform_cash_earnings: Number(d.total_platform_cash_earnings || 0),
          auracoins_breakdown: {
            burned_from_entry_fees: Number(d.burned_from_entry_fees || 0),
            burned_from_forfeits: Number(d.burned_from_forfeits || 0),
            total_in_circulation: prev?.auracoins_breakdown?.total_in_circulation || 0
          },
          cash_breakdown: {
            cinema_tickets: Number(d.cash_from_cinema_tickets || 0),
            game_entries: Number(d.cash_from_game_entries || 0),
            game_forfeits: Number(d.cash_from_game_forfeits || 0),
            vendor_store: Number(d.cash_from_vendor_store || 0),
            withdrawal_fees: Number(d.cash_from_withdrawal_fees || 0)
          },
          recent_events: prev?.recent_events || []
        }));
      }
    }, (err) => {
      console.warn('Realtime financials subscription failed:', err);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    let unsubUsers: (() => void) | null = null;

    if (activeTab === 'users' || activeTab === 'insights') {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      unsubUsers = onSnapshot(q, async (snap) => {
        try {
          const walletsRef = collection(db, 'room_wallets');
          const walletSnap = await getDocs(walletsRef).catch(() => null);
          const walletMap: Record<string, number> = {};
          if (walletSnap) {
            walletSnap.docs.forEach(d => {
              walletMap[d.id] = d.data().balance || 0;
            });
          }

          const augmented = snap.docs.map(docSnap => {
            const data = docSnap.data() as any;
            const coins = Number(data.auraCoins ?? data.auraCoin ?? data.bonusBalance ?? 1000);
            return {
              ...data,
              uid: docSnap.id,
              auraCoins: coins,
              walletBalance: walletMap[docSnap.id] || data.walletBalance || 0
            };
          });
          setUsers(augmented as any);
          setIsLoading(false);
        } catch (e) {
          loadUsers();
        }
      }, (err) => {
        console.warn('Realtime users stream error, falling back:', err);
        loadUsers();
      });
    } else if (activeTab === 'history') {
      loadHistory();
    } else if (activeTab === 'financials') {
      loadFinancials();
    } else if (activeTab === 'traffic') {
      loadStats();
    } else if (activeTab === 'payouts') {
      loadWithdrawals();
      loadUsers();
    } else {
      setIsLoading(false);
    }

    return () => {
      if (unsubUsers) unsubUsers();
    };
  }, [activeTab]);

  const getUserLastActiveTimestamp = (u: any): number => {
    if (!u) return 0;
    const la = u.lastActive ?? u.lastSeen ?? u.updatedAt;
    if (!la) return typeof u.createdAt === 'number' ? u.createdAt : 0;
    if (typeof la === 'number') return la;
    if (typeof la.toMillis === 'function') return la.toMillis();
    if (typeof la.toDate === 'function') return la.toDate().getTime();
    if (la.seconds) return la.seconds * 1000 + (la.nanoseconds ? Math.floor(la.nanoseconds / 1e6) : 0);
    if (typeof la === 'string') {
      const parsed = new Date(la).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  };

  const formatPresenceTimeAgo = (diffMs: number, lastActiveMs: number): string => {
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 10) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} mins ago`;
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return new Date(lastActiveMs).toLocaleDateString();
  };

  const getUserPresence = (u: any, refTime: number = currentTime) => {
    const lastActiveMs = getUserLastActiveTimestamp(u);
    if (!lastActiveMs) {
      return {
        isOnline: false,
        isAway: false,
        isActiveToday: false,
        status: 'offline' as const,
        statusLabel: 'Offline',
        lastSeenFormatted: 'Never',
        relativeText: 'Never active',
        detail: 'Never active',
        device: u?.lastDevice || 'Unknown'
      };
    }

    const diffMs = Math.max(0, refTime - lastActiveMs);
    const diffSec = Math.floor(diffMs / 1000);
    const timeAgo = formatPresenceTimeAgo(diffMs, lastActiveMs);
    const isActiveToday = diffMs <= 24 * 60 * 60 * 1000;

    // Online if active within last 4 minutes (4 * 60 * 1000 ms)
    if (diffMs <= 4 * 60 * 1000) {
      return {
        isOnline: true,
        isAway: false,
        isActiveToday: true,
        status: 'online' as const,
        statusLabel: 'Online Now',
        lastSeenFormatted: timeAgo,
        relativeText: diffSec < 10 ? 'Active just now' : `Active ${timeAgo}`,
        detail: diffSec < 10 ? 'Active just now' : `Active ${timeAgo}`,
        device: u?.lastDevice || 'Desktop'
      };
    }

    // Away if active between 4 and 15 minutes ago
    if (diffMs <= 15 * 60 * 1000) {
      return {
        isOnline: false,
        isAway: true,
        isActiveToday: true,
        status: 'away' as const,
        statusLabel: 'Away',
        lastSeenFormatted: timeAgo,
        relativeText: `Away (${timeAgo})`,
        detail: `Away (${timeAgo})`,
        device: u?.lastDevice || 'Desktop'
      };
    }

    // Offline (> 15 minutes ago)
    return {
      isOnline: false,
      isAway: false,
      isActiveToday,
      status: 'offline' as const,
      statusLabel: 'Offline',
      lastSeenFormatted: timeAgo,
      relativeText: `Last seen ${timeAgo}`,
      detail: `Last seen ${timeAgo}`,
      device: u?.lastDevice || 'Desktop'
    };
  };

  const getDeviceIcon = (device: string = '') => {
    const d = device.toLowerCase();
    if (d.includes('android')) return <Smartphone className="w-3.5 h-3.5 text-green-500" />;
    if (d.includes('ios') || d.includes('iphone')) return <Smartphone className="w-3.5 h-3.5 text-blue-500" />;
    if (d.includes('tablet') || d.includes('ipad')) return <TabletIcon className="w-3.5 h-3.5 text-purple-500" />;
    if (d.includes('windows') || d.includes('mac') || d.includes('desktop')) return <Laptop className="w-3.5 h-3.5 text-slate-500" />;
    return <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  // Realtime search matching logic across users
  const searchMatchedUsers = users.filter(u => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.email?.toLowerCase().includes(q) || 
      u.displayName?.toLowerCase().includes(q) ||
      (u as any).uid?.toLowerCase().includes(q) ||
      (u as any).lastDevice?.toLowerCase().includes(q)
    );
  });

  const poolUsers = searchQuery.trim() ? searchMatchedUsers : users;
  const onlineUsers = poolUsers.filter(u => getUserPresence(u, currentTime).isOnline);
  const dailyUsers = poolUsers.filter(u => getUserPresence(u, currentTime).isActiveToday);
  const awayUsers = poolUsers.filter(u => getUserPresence(u, currentTime).isAway);
  const adminUsers = poolUsers.filter(u => u.isAdmin);
  const vendorUsers = poolUsers.filter(u => !!(u as any).isVendor);

  const filteredUsers = searchMatchedUsers.filter(u => {
    const presence = getUserPresence(u, currentTime);
    if (userFilter === 'online') return presence.isOnline;
    if (userFilter === 'daily') return presence.isActiveToday;
    if (userFilter === 'away') return presence.isAway;
    if (userFilter === 'admin') return u.isAdmin;
    if (userFilter === 'vendor') return !!(u as any).isVendor;

    return true;
  });

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

  const toggleShowAll = (id: string) => {
    setShowAllItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleUserExpansion = async (uid: string) => {
    if (expandedUserId === uid) {
      setExpandedUserId(null);
      return;
    }

    setExpandedUserId(uid);
    if (!userDetails[uid]) {
      setIsDetailLoading(uid);
      try {
        const details = await getUserDetails(uid);
        setUserDetailsMap(prev => ({ ...prev, [uid]: details }));
      } catch (err) {
        console.error("Failed to load user details");
      } finally {
        setIsDetailLoading(null);
      }
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* MODAL LAYER */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => { if (!isConfirmLoading) closeConfirmModal(); }} 
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md glass-card p-8 border-white/10 shadow-2xl">
              <div className={`absolute top-0 left-0 w-full h-1 ${confirmModal.type === 'danger' ? 'bg-red-500' : 'bg-orange-500'}`} />
              <div className="flex flex-col items-center text-center space-y-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${confirmModal.type === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}><AlertTriangle className="w-8 h-8" /></div>
                <div className="space-y-2"><h3 className="text-xl font-bold text-foreground">{confirmModal.title}</h3><p className="text-sm text-muted-foreground">{confirmModal.message}</p></div>
                {confirmModal.showInput && (
                  <div className="w-full pt-2">
                    <textarea
                      value={modalInputValue}
                      onChange={(e) => setModalInputValue(e.target.value)}
                      placeholder={confirmModal.inputPlaceholder || "Enter details..."}
                      className="w-full h-24 p-3 bg-white/5 border border-white/10 rounded-xl text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-red-500 transition-colors resize-none"
                      disabled={isConfirmLoading}
                    />
                  </div>
                )}
                <div className="flex items-center gap-3 w-full pt-4">
                  <button 
                    onClick={closeConfirmModal} 
                    disabled={isConfirmLoading} 
                    className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={async () => {
                      setIsConfirmLoading(true);
                      try {
                        await confirmModal.onConfirm(modalInputValue);
                      } catch (err) {
                        console.error("Confirm error:", err);
                      } finally {
                        setIsConfirmLoading(false);
                      }
                    }} 
                    disabled={isConfirmLoading} 
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${
                      isConfirmLoading ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                      confirmModal.type === 'danger' 
                        ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20' 
                        : 'bg-orange-600 hover:bg-orange-500 shadow-orange-600/20'
                    }`}
                  >
                    {isConfirmLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                      "Confirm"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREDIT WALLET MODAL (ADD FUNDS ONLY) */}
      <AnimatePresence>
        {creditModal.isOpen && creditModal.user && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => { if (!creditModal.isSubmitting) closeCreditModal(); }} 
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full max-w-lg glass-card p-6 md:p-8 border-white/10 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              {/* Top Accent bar */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500" />
              
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                    <WalletCards className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-white">Credit User Wallet</h3>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] font-black uppercase tracking-wider">
                        ADD-ONLY
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Admin Balance Top-up & Manual Rewards</p>
                  </div>
                </div>
                <button
                  onClick={closeCreditModal}
                  disabled={creditModal.isSubmitting}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Security Banner: Add-Only restriction notice */}
              <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-emerald-300/90 leading-relaxed font-medium">
                  <span className="font-bold text-emerald-300">Add-Only Policy:</span> For security and integrity, admins are strictly restricted to <em>crediting</em> (adding funds). Balance reductions or deductions are disabled.
                </p>
              </div>

              {/* User Identity Chip */}
              <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0">
                    {creditModal.user.photoURL ? (
                      <img src={creditModal.user.photoURL} className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-white truncate">{creditModal.user.displayName || 'User'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{creditModal.user.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase tracking-wider font-mono text-white/40 block">UID</span>
                  <span className="text-[10px] font-mono text-white/70">{creditModal.user.uid.slice(0, 8)}...</span>
                </div>
              </div>

              {/* Wallet Type Selection Tabs */}
              <div className="mt-5 space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                  Select Target Wallet
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreditModal(prev => ({ ...prev, walletType: 'main' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      creditModal.walletType === 'main'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-white shadow-lg shadow-emerald-500/10'
                        : 'bg-white/[0.02] border-white/5 text-muted-foreground hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[10px] font-black uppercase">Main</span>
                    </div>
                    <p className="text-xs font-bold text-emerald-400 truncate">
                      ₦{(creditModal.user.walletBalance || 0).toLocaleString()}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreditModal(prev => ({ ...prev, walletType: 'game' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      creditModal.walletType === 'game'
                        ? 'bg-blue-500/20 border-blue-500/50 text-white shadow-lg shadow-blue-500/10'
                        : 'bg-white/[0.02] border-white/5 text-muted-foreground hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Gamepad2 className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[10px] font-black uppercase">Game</span>
                    </div>
                    <p className="text-xs font-bold text-blue-400 truncate">
                      ₦{(creditModal.user.gameWalletBalance || 0).toLocaleString()}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreditModal(prev => ({ ...prev, walletType: 'vendor' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      creditModal.walletType === 'vendor'
                        ? 'bg-amber-500/20 border-amber-500/50 text-white shadow-lg shadow-amber-500/10'
                        : 'bg-white/[0.02] border-white/5 text-muted-foreground hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Store className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[10px] font-black uppercase">Vendor</span>
                    </div>
                    <p className="text-xs font-bold text-amber-400 truncate">
                      {creditModal.user.isVendor ? `₦${(creditModal.user.vendorWalletBalance || 0).toLocaleString()}` : 'Non-Vendor'}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreditModal(prev => ({ ...prev, walletType: 'aura_coins' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      creditModal.walletType === 'aura_coins'
                        ? 'bg-purple-500/20 border-purple-500/50 text-white shadow-lg shadow-purple-500/10'
                        : 'bg-white/[0.02] border-white/5 text-muted-foreground hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <AuraCoinIcon size="xs" className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black uppercase">AuraCoin</span>
                    </div>
                    <p className="text-xs font-bold text-amber-400 truncate">
                      {(creditModal.user.auraCoins || 0).toLocaleString()}
                    </p>
                  </button>
                </div>

                {creditModal.walletType === 'vendor' && !creditModal.user.isVendor && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs text-amber-400">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>User is not registered as a Vendor yet.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleVendorAction(creditModal.user!.uid, creditModal.user!.displayName || 'User', false)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 text-black font-black text-[10px] uppercase hover:bg-amber-400 transition-all"
                    >
                      Make Vendor
                    </button>
                  </div>
                )}
              </div>

              {/* Amount to Add */}
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Type Amount to Credit ({creditModal.walletType === 'aura_coins' ? 'Coins' : '₦ NGN'})
                  </label>
                  {parseFloat(creditModal.amount) > 0 && (
                    <span className="text-[11px] font-black text-emerald-400">
                      + {creditModal.walletType === 'aura_coins' ? `${parseInt(creditModal.amount).toLocaleString()} Coins` : `₦${parseFloat(creditModal.amount).toLocaleString()}`}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-base pointer-events-none">
                    {creditModal.walletType === 'aura_coins' ? <AuraCoinIcon size="sm" className="w-4 h-4" /> : '₦'}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    placeholder={creditModal.walletType === 'aura_coins' ? "Type coins to award (e.g. 500, 2500)" : "Type any amount to credit (e.g. 1500, 50000)"}
                    value={creditModal.amount}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^0-9.]/g, '');
                      const parts = val.split('.');
                      if (parts.length > 2) {
                        val = parts[0] + '.' + parts.slice(1).join('');
                      }
                      if (creditModal.walletType === 'aura_coins') {
                        val = val.replace(/\./g, '');
                      }
                      setCreditModal(prev => ({ ...prev, amount: val }));
                    }}
                    className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-black text-lg placeholder:text-white/20 focus:outline-none focus:border-emerald-500 focus:bg-white/[0.08] transition-all"
                  />
                  {creditModal.amount && (
                    <button
                      type="button"
                      onClick={() => setCreditModal(prev => ({ ...prev, amount: '' }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-all"
                      title="Clear amount"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Quick Add Preset Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[9px] text-white/30 uppercase font-bold mr-1">Quick Select:</span>
                  {(creditModal.walletType === 'aura_coins'
                    ? [50, 100, 250, 500, 1000, 2500, 5000]
                    : [500, 1000, 2500, 5000, 10000, 20000, 50000]
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCreditModal(prev => ({ ...prev, amount: preset.toString() }))}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30 border border-white/5 text-[10px] font-bold text-white/70 transition-all active:scale-95"
                    >
                      +{creditModal.walletType === 'aura_coins' ? `${preset.toLocaleString()} 🪙` : `₦${preset.toLocaleString()}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Balance Calculation Preview */}
              {parseFloat(creditModal.amount) > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold block">Current</span>
                    <span className="text-xs font-bold text-white/70 mt-0.5 block">
                      {creditModal.walletType === 'aura_coins'
                        ? `${(creditModal.user.auraCoins || 0).toLocaleString()} 🪙`
                        : `₦${(creditModal.walletType === 'main' ? creditModal.user.walletBalance || 0 : creditModal.walletType === 'game' ? creditModal.user.gameWalletBalance || 0 : creditModal.user.vendorWalletBalance || 0).toLocaleString()}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-center">
                    <span className="text-xs font-black text-emerald-400">+ Credit</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-bold block">New Balance</span>
                    <span className="text-xs font-black text-emerald-400 mt-0.5 block">
                      {creditModal.walletType === 'aura_coins'
                        ? `${((creditModal.user.auraCoins || 0) + parseInt(creditModal.amount || '0')).toLocaleString()} 🪙`
                        : `₦${((creditModal.walletType === 'main' ? creditModal.user.walletBalance || 0 : creditModal.walletType === 'game' ? creditModal.user.gameWalletBalance || 0 : creditModal.user.vendorWalletBalance || 0) + parseFloat(creditModal.amount || '0')).toLocaleString()}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Reason / Note (Optional) */}
              <div className="mt-4 space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                  Admin Memo / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Promotional Top-Up, Event Reward, Manual Resolution"
                  value={creditModal.note}
                  onChange={(e) => setCreditModal(prev => ({ ...prev, note: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 w-full pt-6">
                <button
                  type="button"
                  onClick={closeCreditModal}
                  disabled={creditModal.isSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCredit}
                  disabled={creditModal.isSubmitting || !creditModal.amount || parseFloat(creditModal.amount) <= 0}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creditModal.isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Credit Wallet</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* USER PROFILE INTELLIGENCE & AVATAR MODAL */}
      <AnimatePresence>
        {selectedUserProfile && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUserProfile(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-[#090e1c]/95 border border-white/15 rounded-3xl p-5 sm:p-7 shadow-2xl z-10 overflow-hidden my-auto max-h-[92vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
            >
              {/* Header Gradient Glow */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600" />
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-32 bg-cyan-500/15 blur-3xl rounded-full pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => setSelectedUserProfile(null)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all cursor-pointer z-10"
              >
                <X className="w-4 h-4" />
              </button>

              {/* User Identity & Avatar Hero Card */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 pt-2 pb-4 border-b border-white/10">
                {/* Avatar with click to zoom */}
                <div 
                  onClick={() => {
                    if (selectedUserProfile.photoURL) {
                      setIsAvatarLightboxOpen(true);
                    }
                  }}
                  className={`w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border-2 overflow-hidden bg-white/5 flex items-center justify-center flex-shrink-0 shadow-xl relative group transition-all duration-300 ${
                    selectedUserProfile.photoURL 
                      ? 'border-cyan-500/50 hover:border-cyan-400 cursor-pointer hover:shadow-cyan-500/25 hover:scale-102' 
                      : 'border-white/10'
                  }`}
                  title={selectedUserProfile.photoURL ? "Click to view full image" : "No avatar set"}
                >
                  {selectedUserProfile.photoURL ? (
                    <>
                      <img 
                        src={selectedUserProfile.photoURL} 
                        alt={selectedUserProfile.displayName || 'User Profile'} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-[10px] font-black text-cyan-300 uppercase tracking-wider">
                        <Maximize2 className="w-5 h-5 text-cyan-400" />
                        <span>View Full</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-2 text-white/40">
                      <Users className="w-10 h-10 text-primary mb-1" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">Default</span>
                    </div>
                  )}
                </div>

                {/* Main Identity Information */}
                <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
                      {selectedUserProfile.displayName || 'Anonymous User'}
                    </h3>
                    {selectedUserProfile.isAdmin && (
                      <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Admin
                      </span>
                    )}
                    {(selectedUserProfile as any).isVendor && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Store className="w-3 h-3" /> Vendor
                      </span>
                    )}
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-black uppercase tracking-wider">
                      Member
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-white/70">
                    <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                      <Mail className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="truncate">{selectedUserProfile.email || 'No email'}</span>
                      {selectedUserProfile.email && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedUserProfile.email || '');
                            showSuccess("Email copied to clipboard!");
                          }}
                          className="hover:text-white text-white/40 ml-1 p-0.5 cursor-pointer"
                          title="Copy Email"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 font-mono text-[11px]">
                      <Key className="w-3.5 h-3.5 text-purple-400" />
                      <span>{selectedUserProfile.uid.slice(0, 10)}...</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedUserProfile.uid);
                          showSuccess("User UID copied to clipboard!");
                        }}
                        className="hover:text-white text-white/40 ml-1 p-0.5 cursor-pointer"
                        title="Copy Full UID"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Device & Registration Date */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-[11px] text-white/50 pt-1">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-white/40" />
                      Joined {new Date(selectedUserProfile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {getDeviceIcon((selectedUserProfile as any).lastDevice)}
                      <span className="uppercase font-mono font-bold text-white/70">{(selectedUserProfile as any).lastDevice || 'Desktop / Mobile'}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Presence & Current Activity Banner */}
              {(() => {
                const presence = getUserPresence(selectedUserProfile, currentTime);
                return (
                  <div className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    presence.isOnline 
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 shadow-lg shadow-emerald-950/20' 
                      : presence.isAway 
                      ? 'bg-amber-950/40 border-amber-500/30 text-amber-300 shadow-lg shadow-amber-950/20' 
                      : 'bg-white/[0.02] border-white/5 text-white/70'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center flex-shrink-0">
                        {presence.isOnline ? (
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-sm shadow-emerald-500"></span>
                          </span>
                        ) : presence.isAway ? (
                          <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                        ) : (
                          <span className="w-3 h-3 rounded-full bg-zinc-600"></span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-black uppercase tracking-wider">
                          {presence.isOnline ? 'Online Now' : presence.isAway ? 'Currently Away' : 'Offline'}
                        </span>
                        <span className="text-white/20 font-mono">·</span>
                        <span className="font-medium text-white/90">{presence.detail}</span>
                        {(selectedUserProfile as any).currentPage && (
                          <>
                            <span className="text-white/20 font-mono">·</span>
                            <span className="text-[11px] text-cyan-300 font-mono bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                              Viewing /{PAGE_TITLE_MAP[(selectedUserProfile as any).currentPage] || (selectedUserProfile as any).currentPage}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-white/60">
                      <span className="flex items-center gap-1.5">
                        {getDeviceIcon((selectedUserProfile as any).lastDevice)}
                        <span className="font-bold text-white/80 uppercase font-mono">{(selectedUserProfile as any).lastDevice || 'Desktop'}</span>
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Bio & Status Card */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-cyan-400">
                  <span className="flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Bio & About Me
                  </span>
                  <span className="text-white/40 text-[9px] font-normal lowercase tracking-normal">from user profile</span>
                </div>
                <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-medium">
                  {(selectedUserProfile as any).bio && String((selectedUserProfile as any).bio).trim() ? (
                    <span className="italic">"{(selectedUserProfile as any).bio}"</span>
                  ) : (
                    <span className="text-white/35 italic not-italic">No short bio or description provided by this user.</span>
                  )}
                </p>
              </div>

              {/* Referral Network Intelligence Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-[#0b1021] to-[#090e1c] border border-indigo-500/25 space-y-3.5 shadow-lg">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-indigo-400" />
                    <span>Referral Network & Growth Intelligence</span>
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black uppercase">
                    500 Coins/Ref
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Total Referrals Count */}
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col">
                    <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Total Invited</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Users className="w-4 h-4 text-indigo-400" />
                      <span className="text-lg font-black text-white">
                        {(selectedUserProfile.referredCount || 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-indigo-300/80 font-bold uppercase">users</span>
                    </div>
                  </div>

                  {/* Referral Balance (₦) */}
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col">
                    <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Referral Payouts</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Banknote className="w-4 h-4 text-emerald-400" />
                      <span className="text-lg font-black text-emerald-400">
                        ₦{formatNumber(selectedUserProfile.referralBalance || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Referral AuraCoins Accumulated */}
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col">
                    <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Referral AuraCoins</span>
                    <div className="flex items-center gap-1.5 mt-1 text-amber-400">
                      <AuraCoinIcon size="xs" className="w-4 h-4" />
                      <span className="text-lg font-black">
                        +{formatNumber((selectedUserProfile.referredCount || 0) * 500)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Who Referred This User */}
                <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5 text-white/40" />
                    <span className="text-white/50 font-medium">Referred By:</span>
                    {(() => {
                      const refVal = selectedUserProfile.referredBy;
                      if (!refVal) return <span className="font-bold text-white/40">Direct Registration / Organic</span>;
                      const refUser = users.find(u => u.uid === refVal || (u as any).referralCode === refVal);
                      if (refUser) {
                        return (
                          <span 
                            onClick={() => setSelectedUserProfile(refUser)} 
                            className="font-bold text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            {refUser.displayName || 'User'} ({refUser.email || refVal.slice(0, 8)})
                          </span>
                        );
                      }
                      return <span className="font-mono text-cyan-300 font-bold">{refVal}</span>;
                    })()}
                  </div>

                  {/* Copy Invite Link */}
                  <button
                    onClick={() => {
                      const link = `${window.location.origin}/signup?ref=${selectedUserProfile.uid}`;
                      navigator.clipboard.writeText(link);
                      showSuccess("User's referral invite link copied!");
                    }}
                    className="text-[11px] font-bold text-indigo-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer w-fit"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy User's Invite Link</span>
                  </button>
                </div>
              </div>

              {/* Wallets Overview Grid */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  User Wallet Balances
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-1.5 text-purple-400 mb-1">
                      <AuraCoinIcon size="xs" className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black uppercase tracking-wider">AuraCoins</span>
                    </div>
                    <p className="text-sm font-black text-amber-400">
                      {formatNumber(Number(selectedUserProfile.auraCoins ?? (selectedUserProfile as any).auraCoin ?? 1000))}
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                      <Banknote className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Main Wallet</span>
                    </div>
                    <p className="text-sm font-black text-emerald-400">
                      ₦{formatNumber((selectedUserProfile as any).walletBalance || 0)}
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-1.5 text-blue-400 mb-1">
                      <Gamepad2 className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Game Wallet</span>
                    </div>
                    <p className="text-sm font-black text-blue-400">
                      ₦{formatNumber((selectedUserProfile as any).gameWalletBalance || 0)}
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-1.5 text-amber-400 mb-1">
                      <Store className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Vendor Wallet</span>
                    </div>
                    <p className="text-sm font-black text-amber-400">
                      ₦{formatNumber((selectedUserProfile as any).vendorWalletBalance || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Controls */}
              <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const u = selectedUserProfile;
                      setSelectedUserProfile(null);
                      openCreditModal(u, 'main');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Credit Wallet</span>
                  </button>

                  <button
                    onClick={() => {
                      handleToggleAdminAction(selectedUserProfile.uid, selectedUserProfile.displayName || 'User', selectedUserProfile.isAdmin);
                      setSelectedUserProfile(prev => prev ? ({ ...prev, isAdmin: !prev.isAdmin }) : null);
                    }}
                    disabled={selectedUserProfile.uid === currentUser?.uid}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer active:scale-95 disabled:opacity-20 flex items-center gap-1.5 ${
                      selectedUserProfile.isAdmin 
                        ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 hover:bg-orange-500/30' 
                        : 'bg-green-500/20 border-green-500/40 text-green-300 hover:bg-green-500/30'
                    }`}
                  >
                    {selectedUserProfile.isAdmin ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    <span>{selectedUserProfile.isAdmin ? 'Revoke Admin' : 'Make Admin'}</span>
                  </button>

                  <button
                    onClick={() => {
                      handleToggleVendorAction(selectedUserProfile.uid, selectedUserProfile.displayName || 'User', !!(selectedUserProfile as any).isVendor);
                      setSelectedUserProfile(prev => prev ? ({ ...prev, isVendor: !(prev as any).isVendor } as any) : null);
                    }}
                    disabled={selectedUserProfile.uid === currentUser?.uid}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer active:scale-95 disabled:opacity-20 flex items-center gap-1.5 ${
                      (selectedUserProfile as any).isVendor 
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30' 
                        : 'bg-blue-500/20 border-blue-500/40 text-blue-300 hover:bg-blue-500/30'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>{(selectedUserProfile as any).isVendor ? 'Revoke Vendor' : 'Make Vendor'}</span>
                  </button>
                </div>

                <button
                  onClick={() => setSelectedUserProfile(null)}
                  className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULL RESOLUTION AVATAR LIGHTBOX */}
      <AnimatePresence>
        {isAvatarLightboxOpen && selectedUserProfile?.photoURL && (
          <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center p-4 bg-black/95 backdrop-blur-2xl">
            {/* Top Toolbar */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20">
                  <img src={selectedUserProfile.photoURL} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white">{selectedUserProfile.displayName || 'User'} Profile Picture</h4>
                  <p className="text-[10px] text-white/50">Full Resolution Preview</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={selectedUserProfile.photoURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Raw Image</span>
                </a>
                <button
                  onClick={() => setIsAvatarLightboxOpen(false)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="Close Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Image Container with Zoom Animation */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="max-w-xl max-h-[75vh] p-2 rounded-3xl bg-white/5 border border-white/15 shadow-2xl overflow-hidden flex items-center justify-center"
            >
              <img
                src={selectedUserProfile.photoURL}
                alt={selectedUserProfile.displayName || 'Avatar'}
                className="max-w-full max-h-[72vh] object-contain rounded-2xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
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
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4">
          <div className="flex items-center gap-2 p-1 glass rounded-xl min-w-max">
            <button onClick={() => setActiveTab('users')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Users className="w-4 h-4" />Users</button>
            <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Activity className="w-4 h-4" />Activity</button>
            <button onClick={() => setActiveTab('financials')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'financials' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Flame className="w-4 h-4" />Revenue & Burns</button>
            <button onClick={() => setActiveTab('preorders')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'preorders' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Package className="w-4 h-4" />Pre-orders</button>
            <button onClick={() => setActiveTab('traffic')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'traffic' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Globe className="w-4 h-4" />Traffic</button>
            <button onClick={() => setActiveTab('insights')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'insights' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25' : 'text-muted-foreground hover:text-foreground'}`}><LineChart className="w-4 h-4" />Insights</button>
            <button onClick={() => setActiveTab('messages')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'messages' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Send className="w-4 h-4" />Messages</button>
            <button onClick={() => setActiveTab('store')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'store' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Store className="w-4 h-4" />Store</button>
            <button onClick={() => setActiveTab('cinema')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'cinema' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Film className="w-4 h-4" />Cinema</button>
            <button onClick={() => setActiveTab('payouts')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'payouts' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Banknote className="w-4 h-4" />Payouts</button>
            <button onClick={() => setActiveTab('partners')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'partners' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-muted-foreground hover:text-foreground'}`}><Handshake className="w-4 h-4" />Partners</button>
            <button onClick={() => setActiveTab('ads')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'ads' ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/25' : 'text-muted-foreground hover:text-foreground'}`}><Megaphone className="w-4 h-4" />Ads</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {/* 20% Platform Revenue Hero Card */}
        <div 
          onClick={() => setActiveTab('financials')}
          className="glass-card p-4 flex items-center gap-3.5 border-emerald-500/30 hover:border-emerald-500/60 transition-all cursor-pointer group relative overflow-hidden bg-gradient-to-br from-emerald-950/30 via-black/20 to-transparent xl:col-span-2"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform flex-shrink-0">
            <Banknote className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] text-emerald-400 uppercase font-black tracking-wider truncate">Platform 20% Earnings</p>
              <Badge className="bg-emerald-500/20 text-emerald-300 text-[8px] font-black px-1 py-0 h-3.5 leading-none">
                REVENUE
              </Badge>
            </div>
            <p className="text-xl font-black text-white truncate mt-0.5">
              ₦{(financials?.total_platform_cash_earnings || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Burned Coins Hero Card */}
        <div 
          onClick={() => setActiveTab('financials')}
          className="glass-card p-4 flex items-center gap-3.5 border-amber-500/30 hover:border-amber-500/60 transition-all cursor-pointer group relative overflow-hidden bg-gradient-to-br from-amber-950/30 via-black/20 to-transparent xl:col-span-2"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30 group-hover:scale-105 transition-transform flex-shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] text-amber-400 uppercase font-black tracking-wider truncate">Burned AuraCoins</p>
              <Badge className="bg-amber-500/20 text-amber-300 text-[8px] font-black px-1 py-0 h-3.5 leading-none">
                SINK
              </Badge>
            </div>
            <p className="text-xl font-black text-amber-400 flex items-center gap-1.5 truncate mt-0.5">
              <AuraCoinIcon size="xs" className="w-4 h-4" />
              <span>{(financials?.total_burned_auracoins || 0).toLocaleString()}</span>
            </p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400"><BarChart className="w-6 h-6" /></div><div><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Sessions</p><p className="text-2xl font-bold">{formatNumber(stats?.totalVisits)}</p></div></div>
        
        {/* Total Users Card - click to view all users */}
        <div 
          onClick={() => {
            setActiveTab('users');
            handleExpandUsers('all');
          }}
          className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:border-purple-500/50 hover:bg-purple-950/20 transition-all group"
          title="Click to view all registered users"
        >
          <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                {searchQuery.trim() ? "Matched Users" : "Total Users"}
              </p>
              {searchQuery.trim() && (
                <span className="px-1.5 py-0.2 text-[8px] rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                  SEARCH
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-white">
              {formatNumber(searchQuery.trim() ? searchMatchedUsers.length : (users.length || stats?.totalUsers || 0))}
            </p>
          </div>
        </div>

        {/* Daily Users Card - click to view users active today */}
        <div 
          onClick={() => {
            setActiveTab('users');
            handleExpandUsers('daily');
          }}
          className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-950/20 transition-all group"
          title="Click to view users active in the last 24 hours"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                {searchQuery.trim() ? "Matched Today" : "Daily Users"}
              </p>
            </div>
            <p className="text-2xl font-bold text-indigo-400">
              {formatNumber(dailyUsers.length || (searchQuery.trim() ? 0 : (stats?.dailyActiveUsers || 0)))}
            </p>
          </div>
        </div>
        
        {/* Online Now Card - click to view online users */}
        <div 
          onClick={() => {
            setActiveTab('users');
            handleExpandUsers('online');
          }}
          className="glass-card p-4 flex items-center gap-4 relative overflow-hidden cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-950/25 transition-all group"
          title="Click to view all currently online users"
        >
          <div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center text-green-400 group-hover:scale-105 transition-transform">
            <Zap className="w-6 h-6 fill-current animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                {searchQuery.trim() ? "Matched Online" : "Online"}
              </p>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-2xl font-bold text-green-400">
              {formatNumber(onlineUsers.length || (searchQuery.trim() ? 0 : (stats?.onlineNow || 0)))}
            </p>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center text-orange-400"><Globe className="w-6 h-6" /></div><div className="flex-1 min-w-0"><p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Top Source</p><p className="text-lg font-bold truncate">{stats?.topCountries[0]?.country || '---'}</p></div></div>
      </div>

      <div className="glass-card p-6">
        {/* TOOLBAR */}
        {activeTab !== 'messages' && activeTab !== 'insights' && activeTab !== 'preorders' && activeTab !== 'ads' && activeTab !== 'financials' && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder={activeTab === 'users' ? "Search name, email, device, UID..." : "Filter data..."} 
                  value={searchQuery} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchQuery(val);
                    if (val.trim() && isUsersCollapsed && activeTab === 'users') {
                      setIsUsersCollapsed(false);
                    }
                  }} 
                  className={`w-full glass-input pl-10 text-sm focus:outline-none transition-all rounded-lg border-white/10 ${
                    searchQuery ? 'pr-20' : 'pr-4'
                  } py-2`} 
                />
                {searchQuery && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded-md bg-primary/20 text-primary border border-primary/30 text-[9px] font-mono font-bold">
                      {activeTab === 'users' ? filteredUsers.length : (activeTab === 'history' ? filteredHistory.length : '')} found
                    </span>
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="text-white/40 hover:text-white p-0.5 text-xs font-bold leading-none"
                      title="Clear search"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Users Filter Segmented Pills */}
              {activeTab === 'users' && (
                <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/10 rounded-xl overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setUserFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      userFilter === 'all'
                        ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>All Users</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded bg-black/40 text-white/80 font-mono">{searchMatchedUsers.length}</span>
                  </button>

                  <button
                    onClick={() => setUserFilter('online')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      userFilter === 'online'
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25 ring-1 ring-emerald-300'
                        : 'text-emerald-400 hover:bg-emerald-500/10'
                    }`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>Online</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded bg-black/40 text-emerald-300 font-mono font-black">{onlineUsers.length}</span>
                  </button>

                  <button
                    onClick={() => setUserFilter('daily')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      userFilter === 'daily'
                        ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/25 ring-1 ring-indigo-300'
                        : 'text-indigo-400 hover:bg-indigo-500/10'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Active Today</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded bg-black/40 text-indigo-300 font-mono font-bold">{dailyUsers.length}</span>
                  </button>

                  <button
                    onClick={() => setUserFilter('away')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      userFilter === 'away'
                        ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25 ring-1 ring-amber-300'
                        : 'text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>Away</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded bg-black/40 text-amber-300 font-mono font-bold">{awayUsers.length}</span>
                  </button>

                  <button
                    onClick={() => setUserFilter('admin')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      userFilter === 'admin'
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Shield className="w-3 h-3 text-orange-400" />
                    <span>Admins</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded bg-black/40 text-white/80 font-mono">{adminUsers.length}</span>
                  </button>

                  <button
                    onClick={() => setUserFilter('vendor')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      userFilter === 'vendor'
                        ? 'bg-purple-500 text-white shadow-md shadow-purple-500/25'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Store className="w-3 h-3 text-purple-400" />
                    <span>Vendors</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded bg-black/40 text-white/80 font-mono">{vendorUsers.length}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'users' && (
                <>
                  <button 
                    onClick={() => {
                      if (isUsersCollapsed) {
                        handleExpandUsers();
                      } else {
                        setIsUsersCollapsed(true);
                      }
                    }} 
                    disabled={isExpandingUsers}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:text-white transition-all text-xs font-bold disabled:opacity-50"
                    title={isUsersCollapsed ? "Expand User Directory" : "Collapse User Directory"}
                  >
                    {isExpandingUsers ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                        <span className="hidden sm:inline">Expanding...</span>
                        <span className="sm:hidden">Loading...</span>
                      </>
                    ) : isUsersCollapsed ? (
                      <>
                        <ChevronDown className="w-3.5 h-3.5 text-primary" />
                        <span className="hidden sm:inline">Expand List</span>
                        <span className="sm:hidden">Expand</span>
                      </>
                    ) : (
                      <>
                        <ChevronUp className="w-3.5 h-3.5 text-primary" />
                        <span className="hidden sm:inline">Collapse List</span>
                        <span className="sm:hidden">Collapse</span>
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => loadUsers()} 
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:text-white transition-all text-xs font-bold"
                    title="Resync User List"
                  >
                    <RefreshCcw className="w-3.5 h-3.5 text-primary" />
                    <span className="hidden sm:inline">Sync Users</span>
                    <span className="sm:hidden">Sync</span>
                  </button>
                </>
              )}
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
          {isLoading && activeTab !== 'preorders' && activeTab !== 'financials' ? (
            <div className="flex flex-col items-center justify-center py-24"><Loader2 className="w-10 h-10 text-primary animate-spin mb-4" /><p className="text-muted-foreground font-medium tracking-widest text-xs uppercase">Syncing</p></div>
          ) : activeTab === 'financials' ? (
            <div className="p-6 space-y-6">
              {/* Financials Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Flame className="w-5 h-5 text-amber-500" /> Platform Revenue & AuraCoin Burns
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time ledger of 20% platform cash profits & AuraCoin burn sinks.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Live Sync Active</span>
                  </div>
                  <button
                    onClick={() => loadFinancials()}
                    disabled={isFinLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/10 transition-all disabled:opacity-50"
                  >
                    <RefreshCcw className={`w-3.5 h-3.5 ${isFinLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Top 2 Primary Metric Hero Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Real Cash 20% Earnings Card */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-emerald-900/10 to-black/60 border border-emerald-500/30 space-y-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex items-start justify-between relative">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-black uppercase tracking-wider px-2 py-0.5">
                          PLATFORM 20% CUT
                        </Badge>
                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Real Cash (₦)</span>
                      </div>
                      <h3 className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-2">
                        ₦{(financials?.total_platform_cash_earnings || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </h3>
                      <p className="text-xs text-emerald-400/80 font-medium">
                        Total real cash retained across all platform activities
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                      <Banknote className="w-6 h-6" />
                    </div>
                  </div>

                  {/* Cash Breakdown Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-emerald-500/15">
                    <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground truncate">Cinema Tickets</p>
                      <p className="text-sm font-bold text-white mt-0.5 truncate">
                        ₦{(financials?.cash_breakdown?.cinema_tickets || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground truncate">Game Entries</p>
                      <p className="text-sm font-bold text-white mt-0.5 truncate">
                        ₦{(financials?.cash_breakdown?.game_entries || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground truncate">Game Forfeits</p>
                      <p className="text-sm font-bold text-white mt-0.5 truncate">
                        ₦{(financials?.cash_breakdown?.game_forfeits || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground truncate">Store 20% Cut</p>
                      <p className="text-sm font-bold text-white mt-0.5 truncate">
                        ₦{(financials?.cash_breakdown?.vendor_store || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 col-span-2 sm:col-span-1">
                      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground truncate">Withdrawal Fees</p>
                      <p className="text-sm font-bold text-white mt-0.5 truncate">
                        ₦{(financials?.cash_breakdown?.withdrawal_fees || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. AuraCoin Burn Sink Card */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-950/40 via-amber-900/10 to-black/60 border border-amber-500/30 space-y-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex items-start justify-between relative">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] font-black uppercase tracking-wider px-2 py-0.5">
                          TOTAL BURN SINK
                        </Badge>
                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">AuraCoins 🪙</span>
                      </div>
                      <h3 className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight mt-2 flex items-center gap-2">
                        <AuraCoinIcon size="sm" className="w-8 h-8 inline-block" />
                        <span>{(financials?.total_burned_auracoins || 0).toLocaleString()}</span>
                      </h3>
                      <p className="text-xs text-amber-400/80 font-medium">
                        AuraCoins permanently retired from circulation (deflationary sinks)
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
                      <Flame className="w-6 h-6" />
                    </div>
                  </div>

                  {/* AuraCoin Breakdown Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-amber-500/15">
                    <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10">
                      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground truncate">Entry Fee Sinks</p>
                      <p className="text-sm font-bold text-amber-400 mt-0.5 truncate flex items-center gap-1">
                        <AuraCoinIcon size="xs" className="w-3 h-3" />
                        <span>{(financials?.auracoins_breakdown?.burned_from_entry_fees || 0).toLocaleString()}</span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10">
                      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground truncate">Forfeit Sinks</p>
                      <p className="text-sm font-bold text-amber-400 mt-0.5 truncate flex items-center gap-1">
                        <AuraCoinIcon size="xs" className="w-3 h-3" />
                        <span>{(financials?.auracoins_breakdown?.burned_from_forfeits || 0).toLocaleString()}</span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 col-span-2 sm:col-span-1">
                      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground truncate">In Circulation</p>
                      <p className="text-sm font-bold text-white mt-0.5 truncate flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-yellow-400" />
                        <span>{(financials?.auracoins_breakdown?.total_in_circulation || 0).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Economic Rules Summary Strip */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-white">AuraCoin Economy (80/10/10)</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      80% to Host, 10% to Active Referrer (active in last 90d), and 10% burned by platform (20% burn if host is unreferred).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 mt-0.5">
                    <Banknote className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-white">Real Cash Economy (20% Platform)</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      20% fixed Platform Cut. Referral 10% bonus is deducted from host's 80% pool (72% Host / 8% Referrer / 20% Platform).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 flex-shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-white">Admin Hosts (100% Payout)</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Rooms created by System Admins retain 100% ticket earnings with 0% platform fee and 0% referral cut.
                    </p>
                  </div>
                </div>
              </div>

              {/* Platform Revenue & Burn Audit Ledger */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Platform Revenue & Burn Events
                  </h3>
                  <Badge className="bg-white/5 text-white/70 border-white/10 font-bold px-2.5">
                    {financials?.recent_events?.length || 0} Recent Events
                  </Badge>
                </div>

                <div className="overflow-x-auto custom-scrollbar no-scrollbar rounded-xl border border-white/5 bg-black/20">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40 bg-white/[0.02]">
                        <th className="px-4 py-3">Type & Source</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Room / Target</th>
                        <th className="px-4 py-3 text-right">Date & Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {financials?.recent_events && financials.recent_events.length > 0 ? (
                        financials.recent_events.map((ev, idx) => {
                          const isCash = ev.currency === 'NGN' || ev.currency === 'cash';
                          const formattedDate = ev.timestamp_str || (ev.timestamp?.toDate ? ev.timestamp.toDate().toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric',
                            hour12: true
                          }) : ev.timestamp ? new Date(ev.timestamp).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric',
                            hour12: true
                          }) : '---');

                          return (
                            <tr key={ev.id || idx} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2">
                                  {isCash ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-black text-[9px] uppercase px-2 py-0.5">
                                      CASH +20%
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-black text-[9px] uppercase px-2 py-0.5">
                                      BURN 🔥
                                    </Badge>
                                  )}
                                  <span className="text-[11px] font-bold text-white/80 capitalize">
                                    {(ev.source || 'platform').replace(/_/g, ' ')}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-white/90 font-medium max-w-xs truncate">
                                {ev.desc || 'Platform cut recorded'}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {isCash ? (
                                  <span className="font-bold text-emerald-400">
                                    +₦{Number(ev.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="font-bold text-amber-400 flex items-center gap-1">
                                    <AuraCoinIcon size="xs" className="w-3.5 h-3.5" />
                                    <span>{Number(ev.amount || 0).toLocaleString()} 🪙</span>
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-muted-foreground text-[11px] font-mono truncate max-w-[120px]">
                                {ev.room_id ? `#${ev.room_id.slice(0, 8)}` : '---'}
                              </td>
                              <td className="px-4 py-3.5 text-right text-muted-foreground text-[11px] whitespace-nowrap">
                                {formattedDate}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-muted-foreground text-xs italic">
                            No platform revenue or burn events recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'preorders' ? (
            <PreOrderManager />
          ) : activeTab === 'store' ? (
            <StoreManager />
          ) : activeTab === 'cinema' ? (
            <CinemaContentManager />
          ) : activeTab === 'payouts' ? (
            <div className="p-6 space-y-6">
               <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-500" /> Withdrawal Requests
                  </h3>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-black px-3">
                    PENDING: {withdrawals.filter(w => w.status === 'pending').length}
                  </Badge>
               </div>

               <div className="overflow-x-auto custom-scrollbar no-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">
                        <th className="px-2 py-4 w-8"></th>
                        <th className="px-4 py-4">User Name & ID</th>
                        <th className="px-4 py-4">Type</th>
                        <th className="px-4 py-4">Gross</th>
                        <th className="px-4 py-4">Net Payout</th>
                        <th className="px-4 py-4">Bank Details</th>
                        <th className="px-4 py-4">Date</th>
                        <th className="px-4 py-4">Status</th>
                        <th className="px-4 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.length > 0 ? (
                        withdrawals.map((wd) => {
                          const associatedUser = users.find(u => u.uid === wd.user_uid);
                          const displayBankName = (associatedUser as any)?.bankDetails?.bankName || wd.bank_name || wd.bank_code;
                          
                          return (
                            <React.Fragment key={wd.id}>
                              <tr className="text-xs group hover:bg-white/[0.02] transition-colors">
                                <td className="px-2 py-4">
                                  <button 
                                    onClick={() => setExpandedWithdrawalId(expandedWithdrawalId === wd.id ? null : wd.id)}
                                    className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white transition-all"
                                    title="Toggle details"
                                  >
                                    {expandedWithdrawalId === wd.id ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                </td>
                                <td className="px-4 py-4">
                                   <div className="space-y-0.5">
                                      <p className="font-black text-white uppercase">{wd.user_name || 'N/A'}</p>
                                      <div className="text-[10px] text-white/30 font-mono flex items-center gap-1">
                                        <span>ID: {wd.user_uid}</span>
                                        <button 
                                          onClick={() => {
                                            navigator.clipboard.writeText(wd.user_uid);
                                            showSuccess("User ID copied!");
                                          }}
                                          className="p-0.5 hover:text-white hover:bg-white/5 rounded transition-colors"
                                          title="Copy User ID"
                                        >
                                          <Copy className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                   </div>
                                </td>
                                <td className="px-4 py-4">
                                   <Badge className={`font-black text-[9px] ${
                                     wd.type === 'funded' ? 'bg-blue-500/20 text-blue-400' :
                                     wd.type === 'host' ? 'bg-amber-500/20 text-amber-400' :
                                     'bg-purple-500/20 text-purple-400'
                                   }`}>
                                     {wd.type?.toUpperCase()}
                                   </Badge>
                                </td>
                                <td className="px-4 py-4">
                                   <span className="font-bold text-white/40">₦{wd.amount?.toLocaleString()}</span>
                                </td>
                                <td className="px-4 py-4">
                                   <span className="font-black text-emerald-400 text-sm">₦{(wd.payout_amount || wd.amount)?.toLocaleString()}</span>
                                </td>
                                <td className="px-4 py-4">
                                   <div className="space-y-0.5 text-[10px]">
                                      <p className="font-bold text-white/60">{displayBankName}</p>
                                      <div className="flex items-center gap-1.5 font-mono text-white/40">
                                         <span>{wd.account_number}</span>
                                         <button 
                                           onClick={() => {
                                             navigator.clipboard.writeText(wd.account_number);
                                             showSuccess("Account number copied!");
                                           }}
                                           className="p-0.5 rounded text-white/30 hover:text-white hover:bg-white/5 transition-all"
                                           title="Copy Account Number"
                                         >
                                           <Copy className="w-3 h-3" />
                                         </button>
                                         <span>• {wd.account_name}</span>
                                      </div>
                                   </div>
                                </td>
                                <td className="px-4 py-4 text-white/40">
                                   {wd.created_at?.toDate ? wd.created_at.toDate().toLocaleDateString() : 'Recent'}
                                </td>
                                <td className="px-4 py-4">
                                   <Badge className={`font-black text-[9px] ${
                                     wd.status === 'pending' ? 'bg-orange-500/20 text-orange-400 border-orange-500/20' :
                                     wd.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' :
                                     'bg-rose-500/20 text-rose-400 border-rose-500/20'
                                   }`}>
                                     {wd.status?.toUpperCase()}
                                   </Badge>
                                </td>
                                <td className="px-4 py-4 text-right">
                                   {wd.status === 'pending' && (
                                     <div className="flex items-center justify-end gap-2">
                                        <button 
                                          onClick={() => handlePayoutAction(wd.id, 'reject')}
                                          className="p-2 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                                          title="Reject"
                                        >
                                           <X className="w-4 h-4" />
                                        </button>
                                        <button 
                                          onClick={() => handlePayoutAction(wd.id, 'approve')}
                                          className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                                          title="Approved"
                                        >
                                           <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                     </div>
                                   )}
                                </td>
                              </tr>
                              {expandedWithdrawalId === wd.id && (
                                <tr className="bg-white/[0.01]">
                                  <td colSpan={9} className="px-6 py-4 border-t border-b border-white/5">
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                                      <div>
                                        <p className="text-white/40 font-bold uppercase tracking-wider text-[9px]">Balance Before</p>
                                        <p className="text-white font-bold text-sm mt-1">₦{wd.balance_before?.toLocaleString() ?? 'N/A'}</p>
                                      </div>
                                      <div>
                                        <p className="text-white/40 font-bold uppercase tracking-wider text-[9px]">Balance After</p>
                                        <p className="text-white font-bold text-sm mt-1">₦{wd.balance_after?.toLocaleString() ?? 'N/A'}</p>
                                      </div>
                                      <div>
                                        <p className="text-white/40 font-bold uppercase tracking-wider text-[9px]">Withdrawal ID</p>
                                        <p className="text-white font-mono mt-1 select-all">{wd.id}</p>
                                      </div>
                                      <div>
                                        <p className="text-white/40 font-bold uppercase tracking-wider text-[9px]">User Email</p>
                                        <p className="text-white mt-1">{wd.user_email ?? 'N/A'}</p>
                                      </div>
                                      <div>
                                        <p className="text-white/40 font-bold uppercase tracking-wider text-[9px]">Fee Charged</p>
                                        <p className="text-white mt-1">₦{wd.fee_amount?.toLocaleString() ?? 0}</p>
                                      </div>
                                      <div className="col-span-2 md:col-span-5 border-t border-white/5 pt-2">
                                        <p className="text-white/40 font-bold uppercase tracking-wider text-[9px] mb-1">User's Configured Wallet Bank Details (Profile)</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-white/[0.01] p-3 rounded-lg border border-white/5">
                                          <div>
                                            <span className="text-[10px] text-white/30 uppercase font-bold block">Set Bank Name</span>
                                            <span className="text-white font-bold">{(associatedUser as any)?.bankDetails?.bankName || 'Not Set'}</span>
                                          </div>
                                          <div>
                                            <span className="text-[10px] text-white/30 uppercase font-bold block">Set Account Name</span>
                                            <span className="text-white">{(associatedUser as any)?.bankDetails?.name || 'Not Set'}</span>
                                          </div>
                                          <div>
                                            <span className="text-[10px] text-white/30 uppercase font-bold block">Set Account Number</span>
                                            <span className="text-white font-mono">{(associatedUser as any)?.bankDetails?.account || 'Not Set'}</span>
                                          </div>
                                        </div>
                                      </div>
                                      {wd.rejection_reason && (
                                        <div className="col-span-2 md:col-span-5 border-t border-white/5 pt-2">
                                          <p className="text-rose-400/80 font-bold uppercase tracking-wider text-[9px]">Rejection Reason</p>
                                          <p className="text-rose-400 mt-1">{wd.rejection_reason}</p>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="py-20 text-center text-muted-foreground opacity-50 uppercase font-black text-[10px] tracking-widest">
                             No payout requests found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
               </div>
            </div>
          ) : activeTab === 'partners' ? (
            <PartnersManager />
          ) : activeTab === 'ads' ? (
            <AdsManager />
          ) : activeTab === 'users' ? (
            isExpandingUsers ? (
              <div className="py-24 flex flex-col items-center justify-center gap-4 bg-white/[0.01]">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                  <Loader2 className="w-7 h-7 text-primary animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white uppercase tracking-widest">Opening User Directory</p>
                  <p className="text-xs text-white/40 mt-1 font-medium">Preparing ledger & live status presence...</p>
                </div>
              </div>
            ) : isUsersCollapsed ? (
              <div className="p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-4 bg-white/[0.01]">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 shadow-inner">
                  <Users className="w-7 h-7" />
                </div>
                <div className="max-w-md text-center">
                  <h3 className="text-base font-bold text-white">
                    {searchQuery.trim() ? "Search Results (Directory Collapsed)" : "User Directory Collapsed"}
                  </h3>
                  <p className="text-xs text-white/40 mt-1">
                    {searchQuery.trim()
                      ? `Found ${filteredUsers.length} user${filteredUsers.length === 1 ? '' : 's'} matching "${searchQuery}" (${users.length} total registered).`
                      : `Directory is currently hidden. ${filteredUsers.length} users match current filters (${users.length} total registered).`}
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => handleExpandUsers()}
                    disabled={isExpandingUsers}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-60"
                  >
                    {isExpandingUsers ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading Directory...</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        <span>Expand User Directory ({filteredUsers.length})</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => loadUsers()}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 text-xs font-bold transition-all cursor-pointer"
                  >
                    <RefreshCcw className="w-3.5 h-3.5 text-primary" />
                    <span>Sync</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Desktop View: Full 9-Column Data Ledger (lg and above) */}
                <div className="hidden lg:block overflow-x-auto">
                  <Table>
              <TableHeader>
                <TableRow className="border-white/5 bg-white/[0.02] hover:bg-transparent text-center">
                  <TableHead className="text-muted-foreground font-bold text-left">USER IDENTITY & PRESENCE</TableHead>
                  <TableHead className="text-muted-foreground font-bold">DEVICE & STATUS</TableHead>
                  <TableHead className="text-muted-foreground font-bold text-center">MAIN WALLET</TableHead>
                  <TableHead className="text-muted-foreground font-bold text-center">GAME WALLET</TableHead>
                  <TableHead className="text-muted-foreground font-bold text-center">VENDOR WALLET</TableHead>
                  <TableHead className="text-muted-foreground font-bold text-center">AURACOINS</TableHead>
                  <TableHead className="text-muted-foreground font-bold text-center">REFERRAL</TableHead>
                  <TableHead className="text-muted-foreground font-bold">JOINED</TableHead>
                  <TableHead className="text-right text-muted-foreground font-bold pr-10">CONTROLS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-20 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Users className="w-10 h-10 text-white/20 mb-1" />
                        <p className="text-sm font-bold text-white/80">No users match your criteria</p>
                        <p className="text-xs text-white/40">
                          {userFilter === 'online' ? 'No users are online right now.' : userFilter === 'away' ? 'No users are currently away.' : 'Try clearing your search query or switching filters.'}
                        </p>
                        {userFilter !== 'all' && (
                          <button 
                            onClick={() => setUserFilter('all')}
                            className="mt-3 px-4 py-2 rounded-xl bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 text-xs font-bold transition-all cursor-pointer"
                          >
                            View All Users ({users.length})
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map(user => {
                    const isExpanded = expandedUserId === user.uid;
                    const details = userDetails[user.uid];
                    const presence = getUserPresence(user, currentTime);
                    
                    return (
                      <React.Fragment key={user.uid}>
                        <TableRow 
                          className={`border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer ${isExpanded ? 'bg-white/[0.04]' : ''}`}
                          onClick={() => toggleUserExpansion(user.uid)}
                        >
                          <TableCell onClick={(e) => { e.stopPropagation(); setSelectedUserProfile(user); }}>
                            <div className="flex items-center gap-3 group">
                              <div 
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedUserProfile(user);
                                }}
                                className={`w-10 h-10 rounded-full border overflow-hidden bg-white/5 flex items-center justify-center flex-shrink-0 cursor-pointer hover:scale-110 transition-all duration-200 relative shadow-md ${
                                  presence.isOnline 
                                    ? 'border-emerald-500 ring-2 ring-emerald-500/30' 
                                    : presence.isAway 
                                    ? 'border-amber-500/60' 
                                    : 'border-white/10'
                                }`}
                                title={`Click to view full profile & bio (${presence.relativeText})`}
                              >
                                {user.photoURL ? (
                                  <img src={user.photoURL} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <Users className="w-5 h-5 text-primary group-hover:text-cyan-400 transition-colors" />
                                )}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Eye className="w-3.5 h-3.5 text-cyan-300" />
                                </div>

                                {/* Presence Indicator Dot */}
                                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0B0F19] flex items-center justify-center">
                                  {presence.isOnline ? (
                                    <span className="relative flex h-2.5 w-2.5">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-sm shadow-emerald-500"></span>
                                    </span>
                                  ) : presence.isAway ? (
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                                  ) : (
                                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-600"></span>
                                  )}
                                </div>
                              </div>
                              <div 
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedUserProfile(user);
                                }}
                                className="flex flex-col min-w-0 cursor-pointer group/name text-left"
                                title="Click to view full user profile & bio"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-sm truncate group-hover/name:text-cyan-400 transition-colors">{user.displayName || 'Anonymous'}</span>
                                  {user.isAdmin && <Shield className="w-3 h-3 text-orange-400 flex-shrink-0" />}
                                  {(user as any).isVendor && <Store className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] text-muted-foreground uppercase truncate group-hover/name:text-white/70 transition-colors">{user.email}</span>
                                  {/* Presence Badge */}
                                  {presence.isOnline ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-black tracking-wider border border-emerald-500/40 flex-shrink-0">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                      ONLINE · {presence.lastSeenFormatted}
                                    </span>
                                  ) : presence.isAway ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold tracking-wider border border-amber-500/30 flex-shrink-0">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                      AWAY · {presence.lastSeenFormatted}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[9px] text-zinc-400 font-medium flex-shrink-0">
                                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
                                      Last seen {presence.lastSeenFormatted}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border w-fit mx-auto ${
                              presence.isOnline 
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                                : presence.isAway
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                                : 'bg-white/5 border-white/5 text-white/70'
                            }`}>
                              {getDeviceIcon((user as any).lastDevice)}
                              <div className="flex flex-col text-left">
                                <span className="text-[10px] font-black uppercase">{(user as any).lastDevice || 'Desktop'}</span>
                                <span className={`text-[8px] font-bold tracking-wider ${
                                  presence.isOnline ? 'text-emerald-400 uppercase' : presence.isAway ? 'text-amber-400/90' : 'text-zinc-500'
                                }`}>
                                  {presence.isOnline ? `Active (${presence.lastSeenFormatted})` : presence.lastSeenFormatted}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-bold text-sm text-emerald-400">
                            ₦{formatNumber((user as any).walletBalance || 0)}
                          </TableCell>
                          <TableCell className="text-center font-bold text-sm text-blue-400">
                            ₦{formatNumber((user as any).gameWalletBalance || 0)}
                          </TableCell>
                          <TableCell className="text-center font-bold text-sm">
                            {(user as any).isVendor ? (
                              <span className="text-amber-400">₦{formatNumber((user as any).vendorWalletBalance || 0)}</span>
                            ) : (
                              <span className="text-white/20 text-xs font-mono">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-bold text-sm">
                            <div className="flex items-center justify-center gap-1 text-amber-400">
                              <AuraCoinIcon size="xs" className="w-3.5 h-3.5" />
                              <span>{formatNumber(Number((user as any).auraCoins ?? (user as any).auraCoin ?? 1000))}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-bold text-sm text-orange-400">
                            ₦{formatNumber(user.referralBalance || 0)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-1.5 relative z-[100]" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                setSelectedUserProfile(user);
                              }}
                              className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/40 transition-all shadow-lg active:scale-95 active:brightness-125 border border-cyan-500/30"
                              title="Inspect Full Profile, Bio & Referrals"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                openCreditModal(user, 'main');
                              }}
                              className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 transition-all shadow-lg active:scale-95 active:brightness-125 border border-emerald-500/30"
                              title="Credit / Add Funds to User Wallet"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                handleToggleAdminAction(user.uid, user.displayName || 'User', user.isAdmin);
                              }}
                              disabled={user.uid === currentUser?.uid}
                              className={`p-2.5 rounded-xl transition-all shadow-lg active:scale-95 active:brightness-125 disabled:opacity-20 ${
                                user.isAdmin ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/40' : 'bg-green-500/20 text-green-400 hover:bg-green-500/40'
                              }`}
                              title={user.isAdmin ? "Revoke Admin" : "Make Admin"}
                            >
                              {user.isAdmin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                handleToggleVendorAction(user.uid, user.displayName || 'User', !!(user as any).isVendor);
                              }}
                              disabled={user.uid === currentUser?.uid}
                              className={`p-2.5 rounded-xl transition-all shadow-lg active:scale-95 active:brightness-125 disabled:opacity-20 ${
                                (user as any).isVendor ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/40' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/40'
                              }`}
                              title={(user as any).isVendor ? "Revoke Vendor Status" : "Grant Vendor Status"}
                            >
                              <Store className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                handleDeleteUserAction(user.uid, user.displayName || 'User');
                              }}
                              disabled={user.uid === currentUser?.uid}
                              className="p-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-all shadow-lg active:scale-95 active:brightness-125 disabled:opacity-20"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                toggleUserExpansion(user.uid);
                              }}
                              className="p-2 hover:bg-white/5 rounded-lg transition-colors ml-1"
                            >
                              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>

                      <AnimatePresence>
                        {isExpanded && (
                          <TableRow className="border-none bg-black/40 hover:bg-black/40">
                            <TableCell colSpan={9} className="p-0">
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }} 
                                animate={{ height: 'auto', opacity: 1 }} 
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                                  {isDetailLoading === user.uid ? (
                                    <div className="col-span-full py-12 flex flex-col items-center gap-4 text-primary">
                                      <Loader2 className="w-8 h-8 animate-spin" />
                                      <p className="text-[10px] font-black uppercase tracking-widest">Fetching user intelligence...</p>
                                    </div>
                                  ) : details ? (
                                    <>
                                      {/* Financial Summary */}
                                      <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                            <Banknote className="w-3.5 h-3.5 text-emerald-500" /> Financial Intelligence
                                          </h4>
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault(); e.stopPropagation();
                                              openCreditModal(user, 'main');
                                            }}
                                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-1"
                                          >
                                            <Plus className="w-3 h-3" /> Credit Wallets
                                          </button>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2.5">
                                          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <div>
                                              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Main Wallet</span>
                                              <span className="text-xs text-white/40">Room & General balance</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-black text-emerald-400">₦{details.financials.walletBalance.toLocaleString()}</span>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); openCreditModal(user, 'main'); }}
                                                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/30 transition-all text-[10px] font-black"
                                                title="Add to Main Wallet"
                                              >
                                                <Plus className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>

                                          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <div>
                                              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Game Wallet</span>
                                              <span className="text-xs text-white/40">Split or Steal funds</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-black text-blue-400">₦{details.financials.gameWalletBalance.toLocaleString()}</span>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); openCreditModal(user, 'game'); }}
                                                className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/30 transition-all text-[10px] font-black"
                                                title="Add to Game Wallet"
                                              >
                                                <Plus className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>

                                          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <div>
                                              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Vendor Wallet</span>
                                              <span className="text-xs text-white/40">{details.financials.isVendor ? 'Store earnings' : 'Not registered as vendor'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {details.financials.isVendor ? (
                                                <>
                                                  <span className="text-sm font-black text-amber-400">₦{details.financials.vendorWalletBalance.toLocaleString()}</span>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); openCreditModal(user, 'vendor'); }}
                                                    className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/30 transition-all text-[10px] font-black"
                                                    title="Add to Vendor Wallet"
                                                  >
                                                    <Plus className="w-3 h-3" />
                                                  </button>
                                                </>
                                              ) : (
                                                <Badge variant="outline" className="text-[9px] uppercase border-white/10 text-white/40">
                                                  Non-Vendor
                                                </Badge>
                                              )}
                                            </div>
                                          </div>

                                          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <div>
                                              <span className="text-[10px] font-bold text-muted-foreground uppercase block">AuraCoins</span>
                                              <span className="text-xs text-white/40">Rewards & Cinema Tokens</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <div className="flex items-center gap-1 text-amber-400 font-black text-sm">
                                                <AuraCoinIcon size="xs" className="w-3.5 h-3.5" />
                                                <span>{details.financials.auraCoins.toLocaleString()}</span>
                                              </div>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); openCreditModal(user, 'aura_coins'); }}
                                                className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/30 transition-all text-[10px] font-black"
                                                title="Award AuraCoins"
                                              >
                                                <Plus className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>

                                          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Referral Rewards</span>
                                            <span className="text-sm font-black text-orange-400">₦{(user.referralBalance || 0).toLocaleString()}</span>
                                          </div>
                                          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Ticket Earnings</span>
                                            <span className="text-sm font-black text-primary">₦{details.financials.totalEarned.toLocaleString()}</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Cinema Activity */}
                                      <div className="space-y-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                          <Film className="w-3.5 h-3.5 text-rose-500" /> Cinema Activity
                                        </h4>
                                        <div className="grid grid-cols-1 gap-3">
                                          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Rooms Created</span>
                                            <span className="text-sm font-black text-white">{details.activity.roomsCreated} Rooms</span>
                                          </div>
                                          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Tickets Sold</span>
                                            <span className="text-sm font-black text-white">{details.financials.ticketsSold} Sold</span>
                                          </div>
                                          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col gap-2">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Hosted Movies</span>
                                            <div className="flex flex-wrap gap-1.5">
                                              {details.activity.moviesHosted.length > 0 ? details.activity.moviesHosted.map((movie, idx) => (
                                                <Badge key={idx} variant="outline" className="bg-primary/10 border-primary/20 text-[8px] uppercase">{movie}</Badge>
                                              )) : <span className="text-[10px] italic text-muted-foreground">No movies hosted yet</span>}
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Social & Store */}
                                      <div className="space-y-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                          <Users className="w-3.5 h-3.5 text-blue-500" /> Social & Store
                                        </h4>
                                        <div className="grid grid-cols-1 gap-3">
                                          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Referred People</span>
                                            <span className="text-sm font-black text-blue-400">{user.referredCount || 0} Users</span>
                                          </div>
                                          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Snack Orders</span>
                                            <span className="text-sm font-black text-purple-400">{details.activity.snacksCount} Orders</span>
                                          </div>
                                          <div className="p-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase leading-relaxed">
                                              User has been part of Aura since {new Date(user.createdAt).toLocaleDateString()}.
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                              </motion.div>
                            </TableCell>
                          </TableRow>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                }))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile & Tablet View: Rich Responsive Cards (< lg) */}
          <div className="block lg:hidden p-3 sm:p-4 space-y-3">
            {filteredUsers.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Users className="w-10 h-10 text-white/20 mb-1" />
                <p className="text-sm font-bold text-white/80">No users match your criteria</p>
                <p className="text-xs text-white/40">
                  {userFilter === 'online' ? 'No users are online right now.' : userFilter === 'away' ? 'No users are currently away.' : 'Try clearing your search query or switching filters.'}
                </p>
                {userFilter !== 'all' && (
                  <button 
                    onClick={() => setUserFilter('all')}
                    className="mt-3 px-4 py-2 rounded-xl bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 text-xs font-bold transition-all cursor-pointer"
                  >
                    View All Users ({users.length})
                  </button>
                )}
              </div>
            ) : (
              filteredUsers.map(user => {
                const isExpanded = expandedUserId === user.uid;
                const details = userDetails[user.uid];
                const presence = getUserPresence(user, currentTime);

                return (
                  <div
                    key={user.uid}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                      isExpanded 
                        ? 'bg-white/[0.05] border-white/20 shadow-xl shadow-black/50' 
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                    }`}
                  >
                    {/* User Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div 
                        className="flex items-center gap-3 cursor-pointer group min-w-0 flex-1"
                        onClick={() => setSelectedUserProfile(user)}
                        title="Tap to view full profile & bio"
                      >
                        <div className={`w-11 h-11 rounded-full border overflow-hidden bg-white/5 flex items-center justify-center flex-shrink-0 relative ${
                          presence.isOnline 
                            ? 'border-emerald-500 ring-2 ring-emerald-500/30' 
                            : presence.isAway 
                            ? 'border-amber-500/60' 
                            : 'border-white/10'
                        }`}>
                          {user.photoURL ? (
                            <img src={user.photoURL} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Users className="w-5 h-5 text-primary" />
                          )}
                          {/* Presence Dot */}
                          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0B0F19] flex items-center justify-center">
                            {presence.isOnline ? (
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-sm shadow-emerald-500"></span>
                              </span>
                            ) : presence.isAway ? (
                              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                            )}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm text-white truncate">{user.displayName || 'Anonymous'}</span>
                            {user.isAdmin && <Shield className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />}
                            {(user as any).isVendor && <Store className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {presence.isOnline ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-black tracking-wider border border-emerald-500/40">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                ONLINE · {presence.lastSeenFormatted}
                              </span>
                            ) : presence.isAway ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold tracking-wider border border-amber-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                AWAY · {presence.lastSeenFormatted}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] text-zinc-400 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
                                Last seen {presence.lastSeenFormatted}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Device & Status */}
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold flex-shrink-0 ${
                        presence.isOnline 
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                          : 'bg-white/5 border-white/10 text-white/60'
                      }`}>
                        {getDeviceIcon((user as any).lastDevice)}
                        <span className="uppercase">{(user as any).lastDevice || 'Desktop'}</span>
                      </div>
                    </div>

                    {/* Wallet & Balance Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/5">
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Main Wallet</span>
                        <span className="text-xs font-black text-emerald-400 mt-0.5">₦{formatNumber((user as any).walletBalance || 0)}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Game Wallet</span>
                        <span className="text-xs font-black text-blue-400 mt-0.5">₦{formatNumber((user as any).gameWalletBalance || 0)}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">AuraCoins</span>
                        <div className="flex items-center gap-1 text-amber-400 text-xs font-black mt-0.5">
                          <AuraCoinIcon size="xs" className="w-3 h-3" />
                          <span>{formatNumber(Number((user as any).auraCoins ?? (user as any).auraCoin ?? 1000))}</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Referral</span>
                        <span className="text-xs font-black text-orange-400 mt-0.5">₦{formatNumber(user.referralBalance || 0)}</span>
                      </div>
                      {(user as any).isVendor && (
                        <div className="col-span-2 sm:col-span-4 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                          <span className="text-[9px] uppercase font-bold text-amber-300 tracking-wider">Vendor Wallet</span>
                          <span className="text-xs font-black text-amber-400">₦{formatNumber((user as any).vendorWalletBalance || 0)}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Controls Bar */}
                    <div className="flex items-center justify-between gap-1.5 mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedUserProfile(user); }}
                          className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30 active:scale-95 transition-all text-xs font-bold flex items-center gap-1"
                          title="Inspect Full Profile, Bio & Referrals"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="text-[10px]">Profile</span>
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); openCreditModal(user, 'main'); }}
                          className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 active:scale-95 transition-all text-xs font-bold flex items-center gap-1"
                          title="Credit Wallet"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="text-[10px]">Credit</span>
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleAdminAction(user.uid, user.displayName || 'User', user.isAdmin); }}
                          disabled={user.uid === currentUser?.uid}
                          className={`p-2 rounded-xl border transition-all active:scale-95 disabled:opacity-20 flex items-center gap-1 ${
                            user.isAdmin 
                              ? 'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/40' 
                              : 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/40'
                          }`}
                          title={user.isAdmin ? "Revoke Admin" : "Make Admin"}
                        >
                          {user.isAdmin ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleVendorAction(user.uid, user.displayName || 'User', !!(user as any).isVendor); }}
                          disabled={user.uid === currentUser?.uid}
                          className={`p-2 rounded-xl border transition-all active:scale-95 disabled:opacity-20 flex items-center gap-1 ${
                            (user as any).isVendor 
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/40' 
                              : 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/40'
                          }`}
                          title={(user as any).isVendor ? "Revoke Vendor Status" : "Grant Vendor Status"}
                        >
                          <Store className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteUserAction(user.uid, user.displayName || 'User'); }}
                          disabled={user.uid === currentUser?.uid}
                          className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/40 border border-red-500/30 active:scale-95 transition-all disabled:opacity-20"
                          title="Delete User"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => toggleUserExpansion(user.uid)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 flex items-center gap-1 text-[10px] font-bold transition-all ml-auto"
                      >
                        <span>{isExpanded ? 'Hide' : 'Details'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Expanded Intelligence Drawer */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-3 pt-3 border-t border-white/10"
                        >
                          {isDetailLoading === user.uid ? (
                            <div className="py-6 flex flex-col items-center gap-2 text-primary">
                              <Loader2 className="w-6 h-6 animate-spin" />
                              <p className="text-[10px] font-black uppercase tracking-widest">Fetching user intelligence...</p>
                            </div>
                          ) : details ? (
                            <div className="space-y-4">
                              {/* Financial Details */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Banknote className="w-3.5 h-3.5 text-emerald-500" /> Financial Breakdown
                                  </h5>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openCreditModal(user, 'main'); }}
                                    className="text-[9px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30"
                                  >
                                    + Credit
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                    <span className="text-[9px] text-muted-foreground uppercase block">Ticket Earnings</span>
                                    <span className="font-bold text-primary">₦{details.financials.totalEarned.toLocaleString()}</span>
                                  </div>
                                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                    <span className="text-[9px] text-muted-foreground uppercase block">Tickets Sold</span>
                                    <span className="font-bold text-white">{details.financials.ticketsSold}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Cinema Details */}
                              <div className="space-y-2">
                                <h5 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <Film className="w-3.5 h-3.5 text-rose-500" /> Cinema Activity
                                </h5>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                    <span className="text-[9px] text-muted-foreground uppercase block">Rooms Created</span>
                                    <span className="font-bold text-white">{details.activity.roomsCreated}</span>
                                  </div>
                                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                    <span className="text-[9px] text-muted-foreground uppercase block">Snack Orders</span>
                                    <span className="font-bold text-purple-400">{details.activity.snacksCount}</span>
                                  </div>
                                </div>
                                {details.activity.moviesHosted.length > 0 && (
                                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                    <span className="text-[9px] text-muted-foreground uppercase block mb-1">Hosted Movies</span>
                                    <div className="flex flex-wrap gap-1">
                                      {details.activity.moviesHosted.map((movie, idx) => (
                                        <Badge key={idx} variant="outline" className="bg-primary/10 border-primary/20 text-[8px] uppercase">{movie}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Social / Referral Details */}
                              <div className="space-y-2">
                                <h5 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5 text-blue-500" /> Social & Referrals
                                </h5>
                                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
                                  <span className="text-[10px] text-muted-foreground uppercase">Referred Users</span>
                                  <span className="font-bold text-blue-400">{user.referredCount || 0} Users</span>
                                </div>
                                <p className="text-[9px] text-muted-foreground">Joined: {new Date(user.createdAt).toLocaleDateString()}</p>
                              </div>
                            </div>
                          ) : null}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )
          ) : activeTab === 'history' ? (
            <div className="divide-y divide-white/5">
              {sortedUserIds.map(userId => {
                const group = groupedHistory[userId];
                const isExpanded = expandedUserId === userId;
                return (
                  <div key={userId}>
                    <button onClick={() => setExpandedUserId(isExpanded ? null : userId)} className={`w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-all ${isExpanded ? 'bg-white/[0.02]' : ''}`}><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/10"><Activity className="w-6 h-6 text-primary" /></div><div className="text-left"><p className="font-bold text-foreground text-base">{group.userName}</p><p className="text-xs text-muted-foreground uppercase font-bold">{group.downloads.length} Tracks</p></div></div><ChevronDown className={`w-6 h-6 text-muted-foreground transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`} /></button>
                    <AnimatePresence>{isExpanded && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-black/20"><div className="p-4 border-t border-white/5 flex items-center justify-between"><p className="text-[10px] text-muted-foreground font-black uppercase">Activity Logs</p><button onClick={(e) => { e.stopPropagation(); handleClearHistoryAction(userId, group.userName); }} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-black uppercase">Clear Data</button></div><div className="p-4 overflow-x-auto"><Table><TableHeader><TableRow className="border-white/5"><TableHead className="text-[10px] uppercase font-black">Content</TableHead><TableHead className="text-[10px] uppercase font-black">Source</TableHead><TableHead className="text-right text-[10px] uppercase font-black">Time</TableHead></TableRow></TableHeader><TableBody>{group.downloads.map((item, idx) => (<TableRow key={item.id + idx} className="border-white/5"><TableCell><div className="flex items-center gap-3"><ActivityThumbnail thumbnail={item.thumbnail} title={item.title} platform={item.platform} mediaType={item.mediaType} /><div className="flex flex-col"><span className="text-sm font-bold truncate max-w-[200px]">{item.title}</span><span className="text-[10px] text-muted-foreground uppercase">{item.mediaType}</span></div></div></TableCell><TableCell><span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-black uppercase">{item.platform}</span></TableCell><TableCell className="text-right text-[10px] text-muted-foreground font-bold">{new Date(item.downloadedAt).toLocaleString()}</TableCell></TableRow>))}</TableBody></Table></div></motion.div>)}</AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : activeTab === 'traffic' ? (
            <div className="p-6 space-y-10">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                  <Activity className="w-5 h-5 text-orange-500" /> Global Traffic Intel
                </h3>
                <button onClick={loadStats} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 group">
                  <RefreshCcw className={`w-4 h-4 text-primary group-hover:rotate-180 transition-transform duration-500`} />
                </button>
              </div>

              {/* 1. Geographic & Device Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 {/* Top Countries */}
                 <div className="glass-card p-6 space-y-4 border-white/5">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> Top Countries</h4>
                    <div className="space-y-3">
                       {stats?.topCountries && stats.topCountries.length > 0 ? (
                         stats.topCountries.map((c, i) => (
                           <div key={i} className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold uppercase"><span className="text-white/80">{c.country}</span><span className="text-primary">{c.count}</span></div>
                              <div className="h-1 bg-white/5 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${(c.count / (stats?.totalVisits || 1)) * 100}%` }} className="h-full bg-primary" /></div>
                           </div>
                         ))
                       ) : (
                         <p className="text-xs text-muted-foreground italic opacity-60">No country location logs recorded yet</p>
                       )}
                    </div>
                 </div>

                 {/* Top States */}
                 <div className="glass-card p-6 space-y-4 border-white/5">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-blue-400" /> Top States/Regions</h4>
                    <div className="space-y-3">
                       {stats?.topStates && stats.topStates.length > 0 ? (
                         stats.topStates.map((s, i) => (
                           <div key={i} className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold uppercase"><span className="text-white/80">{s.state}</span><span className="text-blue-400">{s.count}</span></div>
                              <div className="h-1 bg-white/5 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${(s.count / (stats?.totalVisits || 1)) * 100}%` }} className="h-full bg-blue-500" /></div>
                           </div>
                         ))
                       ) : (
                         <p className="text-xs text-muted-foreground italic opacity-60">No state location logs recorded yet</p>
                       )}
                    </div>
                 </div>

                 {/* Device Distribution */}
                 <div className="glass-card p-6 space-y-4 border-white/5">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2"><Smartphone className="w-3.5 h-3.5 text-emerald-400" /> Device Distribution</h4>
                    <div className="space-y-3">
                       {stats?.topDevices && stats.topDevices.length > 0 ? (
                         stats.topDevices.map((d, i) => (
                           <div key={i} className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold uppercase items-center gap-2">
                                 <div className="flex items-center gap-2">{getDeviceIcon(d.device)} <span className="text-white/80 truncate">{d.device}</span></div>
                                 <span className="text-emerald-400">{d.count}</span>
                              </div>
                              <div className="h-1 bg-white/5 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${(d.count / (stats?.totalVisits || 1)) * 100}%` }} className="h-full bg-emerald-500" /></div>
                           </div>
                         ))
                       ) : (
                         <p className="text-xs text-muted-foreground italic opacity-60">No device logs recorded yet</p>
                       )}
                    </div>
                 </div>
              </div>

              {/* 2. Page Ranking & Engagement */}
              <div className="glass-card overflow-hidden border-white/5 bg-black/20">
                 <div className="p-6 border-b border-white/5"><h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5 text-purple-400" /> Page Ranking & Engagement</h4></div>
                 <Table>
                    <TableHeader className="bg-white/[0.02] border-white/5">
                       <TableRow>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest">Ranked Page</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Visits</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Avg Engagement</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-right">Popularity</TableHead>
                       </TableRow>
                    </TableHeader>
                    <TableBody>
                       {stats?.pageVisitsRanked && stats.pageVisitsRanked.length > 0 ? (
                         stats.pageVisitsRanked.map((pv, i) => (
                           <TableRow key={i} className="border-white/5 hover:bg-white/[0.01]">
                              <TableCell className="font-bold text-xs uppercase tracking-tight text-white/90">
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black ${i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : i === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' : i === 2 ? 'bg-orange-700/20 text-orange-400 border border-orange-700/30' : 'bg-white/5 text-muted-foreground'}`}>
                                    {i + 1}
                                  </span>
                                  <span>{PAGE_TITLE_MAP[pv.page.toLowerCase()] || pv.page}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center font-black text-xs text-primary">{pv.count}</TableCell>
                              <TableCell className="text-center"><Badge variant="outline" className="text-[9px] border-white/10 bg-white/5">{pv.avgTimeSpent}s / view</Badge></TableCell>
                              <TableCell className="text-right">
                                 <div className="w-24 h-1 bg-white/5 rounded-full ml-auto overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (pv.count / Math.max(1, stats.pageVisitsRanked[0]?.count || 1)) * 100)}%` }} /></div>
                              </TableCell>
                           </TableRow>
                         ))
                       ) : (
                         <TableRow>
                            <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground italic opacity-60">No page visit records found</TableCell>
                         </TableRow>
                       )}
                    </TableBody>
                 </Table>
              </div>

              {/* 3. Business Intelligence Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {/* User Behavior */}
                 <div className="p-6 glass-card border-white/5 space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Behavior Signals</h4>
                    <div className="space-y-4">
                       <div className="flex justify-between items-center"><span className="text-xs font-bold text-white/60">Total Clicks</span><span className="text-lg font-black text-white">{formatNumber(stats?.userBehavior.clicks)}</span></div>
                       <div className="flex justify-between items-center"><span className="text-xs font-bold text-white/60">Total Taps</span><span className="text-lg font-black text-white">{formatNumber(stats?.userBehavior.taps)}</span></div>
                       <div className="flex justify-between items-center"><span className="text-xs font-bold text-rose-400">Abandonments</span><span className="text-lg font-black text-rose-500">{formatNumber(stats?.userBehavior.abandonedActions)}</span></div>
                    </div>
                 </div>

                 {/* Payment Intelligence */}
                 <div className="p-6 glass-card border-white/5 space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Payment Health</h4>
                    <div className="space-y-4">
                       <div className="flex justify-between items-center"><span className="text-xs font-bold text-white/60">Success</span><span className="text-lg font-black text-emerald-400">{stats?.paymentStats.successful}</span></div>
                       <div className="flex justify-between items-center"><span className="text-xs font-bold text-white/60">Failed</span><span className="text-lg font-black text-rose-400">{stats?.paymentStats.failed}</span></div>
                       <div className="pt-2 border-t border-white/5 flex justify-between items-center"><span className="text-[10px] font-black text-muted-foreground">Conv Rate</span><span className="text-sm font-black text-primary">{stats?.paymentStats.rate}%</span></div>
                    </div>
                 </div>

                 {/* Room & Invites */}
                 <div className="p-6 glass-card border-white/5 space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Social Velocity</h4>
                    <div className="space-y-4">
                       <div className="flex justify-between items-center"><span className="text-xs font-bold text-white/60">Invites Sent</span><span className="text-lg font-black text-blue-400">{stats?.inviteStats.sent}</span></div>
                       <div className="flex justify-between items-center"><span className="text-xs font-bold text-white/60">Accepted</span><span className="text-lg font-black text-emerald-400">{stats?.inviteStats.accepted}</span></div>
                       <div className="pt-2 border-t border-white/5 flex justify-between items-center"><span className="text-[10px] font-black text-muted-foreground">Accept Rate</span><span className="text-sm font-black text-primary">{stats?.inviteStats.rate}%</span></div>
                    </div>
                 </div>

                 {/* Live Status */}
                 <div className="p-6 glass-card border-white/5 space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Cloud Pulse</h4>
                    <div className="space-y-4">
                       <div className="flex justify-between items-center"><span className="text-xs font-bold text-white/60">Active Rooms</span><Badge className="bg-rose-500 font-black text-[10px]">{stats?.liveSystem.activeRooms}</Badge></div>
                       <div className="flex justify-between items-center"><span className="text-xs font-bold text-white/60">R2 Movies</span><span className="text-lg font-black text-white">{stats?.liveSystem.totalMoviesR2}</span></div>
                       <div className="pt-2 border-t border-white/5 flex justify-between items-center"><span className="text-[10px] font-black text-muted-foreground">Watch Logs</span><span className="text-sm font-black text-primary">{formatNumber(stats?.watchHistoryCount)}</span></div>
                    </div>
                 </div>
              </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-black uppercase text-muted-foreground tracking-widest px-1">Headline / Title</label>
                    <input 
                      type="text" 
                      value={notifTitle}
                      onChange={(e) => setNotifTitle(e.target.value)}
                      placeholder="e.g. Special Weekend Offer! 🎁" 
                      className="w-full glass-input p-4 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-muted-foreground tracking-widest px-1">Type / Category</label>
                    <select
                      value={notifType}
                      onChange={(e: any) => setNotifType(e.target.value)}
                      className="w-full glass-input p-4 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all bg-[#0f172a] text-white"
                    >
                      <option value="update">🚀 App Update</option>
                      <option value="ad">📢 Sponsored / Ad Promo</option>
                      <option value="general">ℹ️ General Info</option>
                      <option value="alert">⚠️ Important Alert</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-muted-foreground tracking-widest px-1">Message Content</label>
                  <textarea 
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Tell your users what's new or what offer they are getting..." 
                    className="w-full glass-input p-4 rounded-xl h-28 resize-none focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                    required
                  />
                </div>

                {/* Clickable Link & Flyer Image Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[11px] font-black uppercase text-indigo-300 tracking-wider flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" /> Target Link / Page (Optional)
                    </label>
                    <input 
                      type="text" 
                      value={notifLink}
                      onChange={(e) => setNotifLink(e.target.value)}
                      placeholder="e.g. https://your-offer.com or movie / video / cinema" 
                      className="w-full glass-input p-3 text-xs rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase text-indigo-300 tracking-wider">Button CTA Text</label>
                    <input 
                      type="text" 
                      value={notifButtonText}
                      onChange={(e) => setNotifButtonText(e.target.value)}
                      placeholder="e.g. Claim Now" 
                      className="w-full glass-input p-3 text-xs rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-3">
                    <label className="text-[11px] font-black uppercase text-indigo-300 tracking-wider">Flyer / Banner Image URL (Optional)</label>
                    <input 
                      type="url" 
                      value={notifImageUrl}
                      onChange={(e) => setNotifImageUrl(e.target.value)}
                      placeholder="https://... (Direct image link for thumbnail preview)" 
                      className="w-full glass-input p-3 text-xs rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isSending || !notifTitle || !notifMessage}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Broadcast Notification</>}
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
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400"><TrendingUp className="w-5 h-5" /></div><div className="text-left"><h3 className="font-bold text-foreground">Search & Media Trends</h3><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Live user searches & top media</p></div></div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedInsight === 'trends' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {expandedInsight === 'trends' && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-black/20 border-t border-white/5">
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Top Hot Searches</h4>
                          <div className="space-y-2">
                            {stats?.topSearches && stats.topSearches.length > 0 ? (
                              stats.topSearches.slice(0, showAllItems['trends'] ? undefined : 5).map((s, i) => (
                                <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                  <span className="text-sm font-bold truncate pr-4">{s.query}</span>
                                  <span className="text-[10px] font-black bg-white/10 px-2 py-1 rounded-lg">{formatNumber(s.count)} HITS</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground italic opacity-50">No search logs recorded yet</p>
                            )}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Popular Content</h4>
                          <div className="space-y-2">
                            {stats?.topMovies && stats.topMovies.length > 0 ? (
                              stats.topMovies.slice(0, showAllItems['trends'] ? undefined : 5).map((m, i) => (
                                <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                                  <span className="text-sm font-bold truncate block">{m.title}</span>
                                  <div className="flex gap-4"><div className="flex items-center gap-1.5"><Eye className="w-3 h-3 text-cyan-400" /> <span className="text-[10px] font-black text-cyan-400">{formatNumber(m.watches)}</span></div><div className="flex items-center gap-1.5"><Download className="w-3 h-3 text-purple-400" /> <span className="text-[10px] font-black text-purple-400">{formatNumber(m.downloads)}</span></div></div>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground italic opacity-50">No media downloads recorded yet</p>
                            )}
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
                            {stats?.featureUsage && stats.featureUsage.length > 0 ? (
                              stats.featureUsage.map((f, i) => {
                                const max = Math.max(1, stats.featureUsage[0]?.count || 1);
                                const percentage = (f.count / max) * 100;
                                return (
                                  <div key={i} className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-foreground"><span>{f.feature}</span><span>{formatNumber(f.count)} ACTIONS</span></div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} className={`h-full ${i === 0 ? 'bg-cyan-500' : 'bg-white/20'}`} /></div>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-xs text-muted-foreground italic opacity-50">No feature interactions recorded yet</p>
                            )}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Source Conversion</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {stats?.topPlatforms && stats.topPlatforms.length > 0 ? (
                              stats.topPlatforms.map((p, i) => (
                                <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-white/[0.03] border border-white/5"><span className="text-xs font-bold capitalize">{p.platform}</span><span className="text-[10px] font-black text-orange-400">{formatNumber(p.count)}</span></div>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground italic opacity-50 col-span-2">No platform conversion logs</p>
                            )}
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
                        {stats?.peakHours && stats.peakHours.length > 0 ? (
                          stats.peakHours.map((h: any, i: number) => {
                            const maxPeak = Math.max(1, stats.peakHours[0]?.count || 1);
                            return (
                              <div key={i} className="flex-1 min-w-[120px] p-4 rounded-2xl bg-white/[0.03] border border-white/5 text-center space-y-1">
                                <p className="text-xl font-black text-blue-400">{h.display}</p>
                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{formatNumber(h.count)} VISITS</p>
                                <div className="w-full h-1 bg-white/5 mt-2 rounded-full overflow-hidden"><div className="h-full bg-blue-500/40" style={{ width: `${(h.count / maxPeak) * 100}%` }} /></div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground italic opacity-50">No visit time logs recorded</p>
                        )}
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
