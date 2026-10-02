import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  onSnapshot, 
  collection, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { 
  db, 
  deletePreOrder, 
  type PreOrder 
} from '../lib/firebase';
import { 
  Play, 
  Clock, 
  User, 
  Film, 
  Tv, 
  Trash2, 
  Upload, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  ExternalLink, 
  Loader2,
  Mail,
  Key,
  Layers,
  ChevronDown,
  Check
} from 'lucide-react';
import { UploadModal } from './UploadModal';
import { Badge } from '../components/ui/badge';
import { useToast } from '../contexts/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';

// Platform Custom Dropdown Component
interface PlatformDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  placeholder?: string;
  className?: string;
}

export const PlatformDropdown: React.FC<PlatformDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select option',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-black/40 hover:bg-black/60 border border-white/10 hover:border-cyan-500/50 rounded-xl px-3.5 py-2 text-xs font-bold text-white flex items-center justify-between gap-2 transition-all cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.icon}
          <span className="truncate">{selectedOption?.label || placeholder}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-white/50 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-cyan-400' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#090e1c]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl p-1.5 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer text-left ${
                    isSelected 
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-black' 
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {opt.icon}
                    <span className="truncate">{opt.label}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const PreOrderManager: React.FC = () => {
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<PreOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'pending' | 'delivered' | 'all'>('pending');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { showSuccess, showError } = useToast();

  // Real-time Firestore Stream for Pre-orders
  useEffect(() => {
    setIsLoading(true);
    const preordersRef = collection(db, 'preorders');
    const q = query(preordersRef, orderBy('requestedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PreOrder[];
      setPreOrders(items);
      setIsLoading(false);
    }, (err) => {
      console.error('Real-time pre-orders error:', err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filtered Pre-Orders
  const filteredOrders = useMemo(() => {
    return preOrders.filter(order => {
      // 1. Status Filter
      if (statusFilter === 'pending' && order.status !== 'pending') return false;
      if (statusFilter === 'delivered' && order.status !== 'available') return false;

      // 2. Media Type Filter
      if (mediaTypeFilter !== 'all' && order.mediaType !== mediaTypeFilter) return false;

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = order.title?.toLowerCase().includes(q);
        const matchesUser = order.userName?.toLowerCase().includes(q);
        const matchesEmail = order.userEmail?.toLowerCase().includes(q);
        const matchesUid = order.userId?.toLowerCase().includes(q);
        const matchesSeason = order.season?.toString().includes(q);
        const matchesEpisode = order.episode?.toString().includes(q);
        return matchesTitle || matchesUser || matchesEmail || matchesUid || matchesSeason || matchesEpisode;
      }

      return true;
    });
  }, [preOrders, statusFilter, mediaTypeFilter, searchQuery]);

  // Counts
  const pendingCount = preOrders.filter(o => o.status === 'pending').length;
  const deliveredCount = preOrders.filter(o => o.status === 'available').length;
  const totalCount = preOrders.length;

  const handleDelete = async () => {
    if (!orderToDelete) return;
    setIsDeleting(true);
    try {
      await deletePreOrder(orderToDelete.id);
      showSuccess(`Pre-order request for "${orderToDelete.title}" deleted.`);
      setOrderToDelete(null);
    } catch (err: any) {
      showError(err.message || 'Failed to delete pre-order');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showSuccess(`${label} copied to clipboard!`);
  };

  const mediaTypeOptions = [
    { value: 'all', label: 'All Media Types', icon: <Layers className="w-3.5 h-3.5 text-cyan-400" /> },
    { value: 'movie', label: 'Movies Only', icon: <Film className="w-3.5 h-3.5 text-blue-400" /> },
    { value: 'series', label: 'TV Series Only', icon: <Tv className="w-3.5 h-3.5 text-purple-400" /> }
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Header & Metric Cards (Responsive Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Pending Card */}
        <div 
          onClick={() => setStatusFilter('pending')}
          className={`glass-card p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer group flex items-center justify-between ${
            statusFilter === 'pending' ? 'border-amber-500/50 bg-amber-950/25 shadow-lg shadow-amber-950/30' : 'border-white/10 hover:border-amber-500/30'
          }`}
        >
          <div className="flex items-center gap-3 sm:gap-3.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform shrink-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-black tracking-wider truncate">Pending</p>
              <p className="text-xl sm:text-2xl font-black text-amber-400 mt-0.5">{pendingCount}</p>
            </div>
          </div>
          {pendingCount > 0 && (
            <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-amber-500"></span>
            </span>
          )}
        </div>

        {/* Delivered Card */}
        <div 
          onClick={() => setStatusFilter('delivered')}
          className={`glass-card p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer group flex items-center justify-between ${
            statusFilter === 'delivered' ? 'border-emerald-500/50 bg-emerald-950/25 shadow-lg shadow-emerald-950/30' : 'border-white/10 hover:border-emerald-500/30'
          }`}
        >
          <div className="flex items-center gap-3 sm:gap-3.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-black tracking-wider truncate">Delivered</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5">{deliveredCount}</p>
            </div>
          </div>
        </div>

        {/* Total Card with Layers Icon */}
        <div 
          onClick={() => setStatusFilter('all')}
          className={`glass-card p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer group flex items-center justify-between ${
            statusFilter === 'all' ? 'border-cyan-500/50 bg-cyan-950/25 shadow-lg shadow-cyan-950/30' : 'border-white/10 hover:border-cyan-500/30'
          }`}
        >
          <div className="flex items-center gap-3 sm:gap-3.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform shrink-0">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-black tracking-wider truncate">Total Requests</p>
              <p className="text-xl sm:text-2xl font-black text-white mt-0.5">{totalCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Responsive Toolbar: Search & Platform Custom Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/10">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            <input
              type="text"
              placeholder="Search title, requester, email, UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-12 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-[11px] font-bold"
              >
                Clear
              </button>
            )}
          </div>

          {/* Status Pills */}
          <div className="flex items-center p-1 bg-black/40 border border-white/10 rounded-xl overflow-x-auto no-scrollbar shrink-0">
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                statusFilter === 'pending'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 ring-1 ring-amber-300'
                  : 'text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              <span>Pending</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-black/40 text-amber-200 font-mono font-bold">{pendingCount}</span>
            </button>

            <button
              onClick={() => setStatusFilter('delivered')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                statusFilter === 'delivered'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 ring-1 ring-emerald-300'
                  : 'text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              <span>Delivered</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-black/40 text-emerald-200 font-mono font-bold">{deliveredCount}</span>
            </button>

            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>All</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-black/40 text-white/80 font-mono">{totalCount}</span>
            </button>
          </div>

          {/* Platform Custom Dropdown for Media Type */}
          <PlatformDropdown
            value={mediaTypeFilter}
            onChange={(val) => setMediaTypeFilter(val as any)}
            options={mediaTypeOptions}
            className="w-full sm:w-48 shrink-0"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 text-[11px] font-mono text-white/40 pt-1 sm:pt-0">
          <span>Found <strong className="text-white">{filteredOrders.length}</strong></span>
        </div>
      </div>

      {/* 3. Pre-Orders List (Mobile Optimized) */}
      {isLoading ? (
        <div className="flex flex-col justify-center items-center py-20">
          <Loader2 className="w-9 h-9 text-cyan-400 animate-spin mb-3" />
          <p className="text-xs font-bold uppercase tracking-widest text-white/50">Syncing pre-order stream...</p>
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:gap-4">
          <AnimatePresence>
            {filteredOrders.map(order => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`glass-card p-3.5 sm:p-5 rounded-2xl border transition-all group ${
                  order.status === 'available'
                    ? 'border-emerald-500/20 bg-emerald-950/10 hover:border-emerald-500/40'
                    : 'border-amber-500/20 bg-amber-950/10 hover:border-amber-500/40'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5">
                  {/* Left: Poster & Request Details */}
                  <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                    {/* Poster Card */}
                    <div className="w-16 h-24 sm:w-24 sm:h-32 relative rounded-xl sm:rounded-2xl overflow-hidden border border-white/15 shrink-0 bg-black/60 shadow-lg group-hover:scale-102 transition-transform">
                      {order.thumbnail ? (
                        <img 
                          src={order.thumbnail} 
                          alt={order.title} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/5">
                          {order.mediaType === 'series' ? <Tv className="w-6 h-6 sm:w-8 sm:h-8 text-white/30" /> : <Film className="w-6 h-6 sm:w-8 sm:h-8 text-white/30" />}
                        </div>
                      )}
                      <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2">
                        <span className="p-1 rounded-md bg-black/70 backdrop-blur-md text-white/90 shadow">
                          {order.mediaType === 'series' ? <Tv className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-400" /> : <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400" />}
                        </span>
                      </div>
                    </div>

                    {/* Meta Details */}
                    <div className="space-y-1.5 sm:space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <h4 className="font-black text-sm sm:text-base lg:text-lg text-white tracking-tight truncate max-w-full">
                          {order.title}
                        </h4>
                        {order.season && (
                          <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] sm:text-[10px] font-black uppercase">
                            S{order.season} · E{order.episode || '1'}
                          </Badge>
                        )}
                        <Badge className={`text-[8px] sm:text-[9px] font-black uppercase tracking-wider ${
                          order.status === 'available' 
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          {order.status === 'available' ? 'Delivered' : 'Pending'}
                        </Badge>
                      </div>

                      {/* Requester Profile Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs text-white/70">
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="font-bold text-white truncate">{order.userName || 'Anonymous'}</span>
                        </div>

                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="font-mono text-white/80 truncate text-[11px]">{order.userEmail || 'No Email'}</span>
                        </div>

                        <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{new Date(order.requestedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>

                        <div className="flex items-center gap-1.5 text-white/50 font-mono text-[11px]">
                          <Key className="w-3.5 h-3.5 text-white/30 shrink-0" />
                          <span className="truncate">UID: {order.userId.slice(0, 8)}...</span>
                          <button
                            onClick={() => copyToClipboard(order.userId, 'User UID')}
                            className="p-0.5 hover:text-white text-white/40 cursor-pointer"
                            title="Copy UID"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Delivery Info If Already Available */}
                      {order.status === 'available' && (
                        <div className="mt-1.5 p-2 sm:p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-300 font-bold truncate text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Delivered {order.availableAt ? new Date(order.availableAt).toLocaleDateString() : 'Ready'}</span>
                          </div>

                          {order.movieUrl && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => copyToClipboard(order.movieUrl!, 'Stream URL')}
                                className="px-2 py-1 rounded-lg bg-black/40 hover:bg-black/60 text-emerald-300 border border-emerald-500/30 text-[9px] sm:text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-all"
                              >
                                <Copy className="w-3 h-3" /> Copy Link
                              </button>
                              <a
                                href={order.movieUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[9px] sm:text-[10px] font-black uppercase flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" /> Test
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Action Buttons (Responsive Layout) */}
                  <div className="flex items-center gap-2 shrink-0 justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-white/10 w-full lg:w-auto">
                    {order.status === 'pending' ? (
                      <button
                        onClick={() => setSelectedPreOrder(order)}
                        className="flex-1 lg:flex-none px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-emerald-600 hover:brightness-110 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-cyan-600/25 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Deliver Content</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedPreOrder(order)}
                        className="flex-1 lg:flex-none px-3.5 py-2 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        title="Update stream link or artwork"
                      >
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Update Link</span>
                      </button>
                    )}

                    {/* Delete Request Button */}
                    <button
                      onClick={() => setOrderToDelete(order)}
                      className="p-2.5 sm:p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 transition-all cursor-pointer active:scale-95 shrink-0"
                      title="Permanently Delete Pre-order Request"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="py-20 text-center glass-card rounded-2xl border-white/5 space-y-2.5 p-4">
          <Play className="w-10 h-10 mx-auto text-white/20 mb-1" />
          <h4 className="text-sm font-bold uppercase tracking-widest text-white/60">No pre-orders found</h4>
          <p className="text-xs text-white/30 max-w-sm mx-auto">
            {statusFilter === 'pending' 
              ? 'There are no pending requests waiting for delivery.' 
              : 'No matching pre-order records match your current filter.'}
          </p>
        </div>
      )}

      {/* 4. Fulfillment Modal */}
      {selectedPreOrder && (
        <UploadModal
          preOrder={selectedPreOrder}
          onClose={() => setSelectedPreOrder(null)}
          onSuccess={() => {
            setSelectedPreOrder(null);
          }}
        />
      )}

      {/* 5. Delete Confirmation Modal (Mobile Friendly) */}
      <AnimatePresence>
        {orderToDelete && (
          <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card w-full max-w-md p-5 sm:p-6 rounded-3xl border border-red-500/30 bg-[#0c0d18] shadow-2xl space-y-4 my-auto"
            >
              <div className="flex items-center gap-3 text-red-400">
                <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center shrink-0 border border-red-500/30">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-black uppercase text-white truncate">Delete Request?</h3>
                  <p className="text-[11px] text-red-300/80">This action will permanently delete this record.</p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1 text-xs">
                <p className="text-white font-bold truncate">{orderToDelete.title}</p>
                <p className="text-white/50 text-[11px] truncate">Requester: {orderToDelete.userName} ({orderToDelete.userEmail})</p>
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setOrderToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-white/5 transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>Confirm Delete</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
