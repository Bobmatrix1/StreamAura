import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Store, 
  DollarSign, 
  ShoppingBag, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Edit3, 
  Upload, 
  Loader2, 
  AlertCircle, 
  Percent, 
  Banknote,
  Building,
  UserCheck,
  CreditCard,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  X,
  Truck,
  PackageCheck,
  XCircle,
  Clock,
  Phone,
  MapPin,
  Star,
  Copy,
  Search,
  ChefHat,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Eye,
  ShieldCheck
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { 
  db, 
  uploadFile, 
  auth, 
  deleteProduct, 
  deleteCloudflareAsset, 
  updateOrderStatus,
  type Vendor, 
  type Order 
} from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  doc, 
  onSnapshot
} from 'firebase/firestore';
import { API_BASE_URL } from '../api/mediaApi';
import { fetchBanks, resolveBankAccount } from '../api/paymentApi';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  slashPrice?: number;
  image: string;
  category: string;
  vendorId: string;
  available: boolean;
  stockStatus?: 'in_stock' | 'out_of_stock' | 'restocking';
  quantity?: number;
}

interface VendorFilterDropdownProps {
  selectedVendor: string;
  onSelectVendor: (vendorId: string) => void;
  vendors: Vendor[];
  totalAllCount?: number;
  countLabel?: string;
  getItemCount?: (vendorId: string) => number;
  currentUserId?: string;
  className?: string;
  variant?: 'gold' | 'default';
  labelPrefix?: string;
}

const VendorFilterCustomDropdown: React.FC<VendorFilterDropdownProps> = ({
  selectedVendor,
  onSelectVendor,
  vendors,
  totalAllCount,
  countLabel = '',
  getItemCount,
  currentUserId,
  className = '',
  variant = 'default',
  labelPrefix = 'Vendor:'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const selectedVendorObj = vendors.find(v => v.id === selectedVendor);
  const selectedName = selectedVendor === 'all' 
    ? 'All Vendors'
    : (selectedVendor === currentUserId ? 'My Personal Store' : (selectedVendorObj?.name || selectedVendor));

  const isGold = variant === 'gold';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all ${
          isGold
            ? 'bg-black/70 hover:bg-black/90 border border-amber-500/40 text-amber-300 shadow-lg shadow-amber-500/5'
            : 'bg-white/5 hover:bg-white/10 border border-white/15 text-white'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <Store className={`w-3.5 h-3.5 shrink-0 ${isGold ? 'text-amber-400' : 'text-primary'}`} />
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-black hidden sm:inline">
            {labelPrefix}
          </span>
          <span className="truncate font-black">{selectedName}</span>
          {selectedVendor === 'all' && totalAllCount !== undefined && (
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black shrink-0 ${isGold ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white'}`}>
              {totalAllCount}
            </span>
          )}
          {selectedVendor !== 'all' && getItemCount && (
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black shrink-0 ${isGold ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white'}`}>
              {getItemCount(selectedVendor)}
            </span>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${isGold ? 'text-amber-400' : 'text-muted-foreground'}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[120] left-0 sm:left-auto right-0 top-full mt-2 w-full sm:w-72 max-h-72 overflow-y-auto bg-[#0b0f19] border border-amber-500/30 rounded-2xl shadow-2xl p-1.5 divide-y divide-white/5 backdrop-blur-2xl ring-1 ring-black/80 custom-scrollbar"
          >
            {/* Option: All Vendors */}
            <div className="pb-1">
              <button
                type="button"
                onClick={() => {
                  onSelectVendor('all');
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                  selectedVendor === 'all'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'text-white hover:bg-white/5 hover:text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <Store className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-bold">All Vendors</p>
                    <p className="text-[9px] text-muted-foreground uppercase font-black">Aggregated Overview</p>
                  </div>
                </div>
                {totalAllCount !== undefined && (
                  <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-300 bg-amber-500/10 shrink-0">
                    {totalAllCount} {countLabel}
                  </Badge>
                )}
              </button>
            </div>

            {/* Individual Vendors List */}
            <div className="py-1 space-y-1">
              {vendors.map((v) => {
                const count = getItemCount ? getItemCount(v.id) : undefined;
                const isSelected = selectedVendor === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onSelectVendor(v.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'text-white/90 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground shrink-0 uppercase text-[10px] font-black">
                        {(v.name || v.id).substring(0, 2)}
                      </div>
                      <div className="truncate">
                        <p className="font-bold truncate text-white">{v.name || v.id}</p>
                        <p className="text-[8px] text-muted-foreground font-mono truncate">{v.id}</p>
                      </div>
                    </div>
                    {count !== undefined && (
                      <Badge variant="outline" className="text-[8px] border-white/10 bg-black/40 text-muted-foreground shrink-0 ml-2">
                        {count} {countLabel}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Personal Store Account option if admin also has personal UID */}
            {currentUserId && !vendors.some(v => v.id === currentUserId) && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelectVendor(currentUserId);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    selectedVendor === currentUserId
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'text-white/90 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="font-bold">My Personal Account</p>
                      <p className="text-[8px] text-muted-foreground font-mono truncate">{currentUserId}</p>
                    </div>
                  </div>
                  {getItemCount && (
                    <Badge variant="outline" className="text-[8px] border-primary/20 text-primary shrink-0">
                      {getItemCount(currentUserId)} {countLabel}
                    </Badge>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const VendorDashboard: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const isUserAdmin = Boolean(isAdmin || user?.isAdmin);
  
  // Tab states: 'dashboard' | 'orders' | 'products' | 'transactions' | 'payout'
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'orders' | 'products' | 'transactions' | 'payout'>('dashboard');

  // Vendor filter states for admin view
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('all');
  const [adminVendors, setAdminVendors] = useState<Vendor[]>([]);

  // Stats states
  const [vendorWallet, setVendorWallet] = useState({
    vendor_balance: 0,
    funded_balance: 0,
    vendor_earnings: 0,
    vendor_revenue: 0,
    vendor_sales_count: 0,
    vendor_fees: 0
  });

  // Data states
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Orders filters & collapsible state
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});

  const toggleOrderExpand = (id: string) => {
    setExpandedOrderIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAllOrders = () => {
    const nextState: Record<string, boolean> = {};
    displayedOrders.forEach(o => {
      nextState[o.id] = true;
    });
    setExpandedOrderIds(nextState);
  };

  const collapseAllOrders = () => {
    setExpandedOrderIds({});
  };

  // Transactions filters & detail modal state
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'sale' | 'withdrawal'>('all');
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [selectedTxDetail, setSelectedTxDetail] = useState<any | null>(null);

  // Shipping ETA Modal state
  const [shippingModal, setShippingModal] = useState<{
    isOpen: boolean;
    orderId: string;
    orderNumber: string;
    eta: string;
    targetOrder: Order | null;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    orderId: '',
    orderNumber: '',
    eta: '30 mins',
    targetOrder: null,
    isSubmitting: false
  });

  // Filter products by selected vendor in-memory for instant, reliable UI and consistent total product counts
  const displayedProducts = React.useMemo(() => {
    if (!isUserAdmin || selectedVendorFilter === 'all') {
      return allProducts;
    }
    return allProducts.filter(p => p.vendorId === selectedVendorFilter);
  }, [allProducts, isUserAdmin, selectedVendorFilter]);

  // Filter orders by selected vendor and status/search
  const displayedOrders = React.useMemo(() => {
    let list = allOrders;
    if (isUserAdmin && selectedVendorFilter !== 'all') {
      list = list.filter(o => o.vendorId === selectedVendorFilter);
    }
    if (orderStatusFilter !== 'all') {
      list = list.filter(o => o.status === orderStatusFilter);
    }
    if (orderSearchQuery.trim()) {
      const q = orderSearchQuery.toLowerCase();
      list = list.filter(o => 
        (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
        (o.userName && o.userName.toLowerCase().includes(q)) ||
        (o.userPhone && o.userPhone.includes(q)) ||
        (o.deliveryAddress && o.deliveryAddress.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allOrders, isUserAdmin, selectedVendorFilter, orderStatusFilter, orderSearchQuery]);

  // Filter transactions by selected vendor, type, and search query
  const displayedTransactions = React.useMemo(() => {
    let list = history;
    if (isUserAdmin && selectedVendorFilter !== 'all') {
      list = list.filter(item => item.vendorId === selectedVendorFilter);
    }
    if (txTypeFilter !== 'all') {
      list = list.filter(item => item.type === txTypeFilter);
    }
    if (txSearchQuery.trim()) {
      const q = txSearchQuery.toLowerCase();
      list = list.filter(item => 
        (item.id && item.id.toLowerCase().includes(q)) ||
        (item.orderNumber && item.orderNumber.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.customerName && item.customerName.toLowerCase().includes(q)) ||
        (item.bankName && item.bankName.toLowerCase().includes(q)) ||
        (item.accountNumber && item.accountNumber.includes(q))
      );
    }
    return list;
  }, [history, isUserAdmin, selectedVendorFilter, txTypeFilter, txSearchQuery]);

  // Accurate & responsive financial calculations
  const computedStats = React.useMemo(() => {
    const relevantOrders = (isUserAdmin && selectedVendorFilter !== 'all')
      ? allOrders.filter(o => o.vendorId === selectedVendorFilter && o.status !== 'cancelled')
      : (isUserAdmin && selectedVendorFilter === 'all')
        ? allOrders.filter(o => o.status !== 'cancelled')
        : allOrders.filter(o => o.vendorId === user?.uid && o.status !== 'cancelled');

    const ordersGrossRevenue = relevantOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const ordersNetEarnings = ordersGrossRevenue * 0.70;
    const ordersPlatformFees = ordersGrossRevenue * 0.30;
    const ordersItemsCount = relevantOrders.reduce((sum, o) => sum + (o.items?.reduce((s: number, i: any) => s + (i.quantity || 1), 0) || 0), 0);

    const totalRevenue = Math.max(vendorWallet.vendor_revenue || 0, ordersGrossRevenue);
    const totalEarnings = Math.max(vendorWallet.vendor_earnings || 0, ordersNetEarnings);
    const totalFees = Math.max(vendorWallet.vendor_fees || 0, ordersPlatformFees);
    const totalUnits = Math.max(vendorWallet.vendor_sales_count || 0, ordersItemsCount);
    
    // Total vendor withdrawals placed (excluding rejected)
    const totalVendorWithdrawn = payouts
      .filter(p => p.status !== 'rejected')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const pendingVendorWithdrawn = payouts
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Liquid available balance for withdrawals is strictly the net store earnings minus placed withdrawals
    const availableBalance = Math.max(0, totalEarnings - totalVendorWithdrawn);

    return {
      totalRevenue,
      totalEarnings,
      totalFees,
      totalUnits,
      availableBalance,
      totalVendorWithdrawn,
      pendingVendorWithdrawn,
      ordersCount: relevantOrders.length
    };
  }, [allOrders, vendorWallet, payouts, isUserAdmin, selectedVendorFilter, user?.uid]);

  // Bank Info state
  const [bankDetails, setBankDetails] = useState({
    bankName: '',
    accountNumber: '',
    accountName: '',
    bankCode: ''
  });

  // Inline Bank Edit / Setup state for Settlement Modal
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [availableBanks, setAvailableBanks] = useState<any[]>([]);
  const [tempBankDetails, setTempBankDetails] = useState({ name: '', account: '', bankName: '', bankCode: '' });
  const [bankSearch, setBankSearch] = useState('');
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [isResolvingBank, setIsResolvingBank] = useState(false);
  const [isSavingBankSettings, setIsSavingBankSettings] = useState(false);
  const bankDropdownRef = useRef<HTMLDivElement>(null);

  // Product modal states
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const productImageInputRef = useRef<HTMLInputElement>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    slashPrice: '',
    category: 'snack',
    image: '',
    stockStatus: 'in_stock' as 'in_stock' | 'out_of_stock' | 'restocking',
    available: true
  });
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // In-app Delete Confirmation Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    productId: string;
    productName: string;
    productImage?: string;
  }>({
    isOpen: false,
    productId: '',
    productName: '',
    productImage: ''
  });
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);

  // Cashout modal states
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);

  // Background scroll lock
  useEffect(() => {
    if (isProductModalOpen || isWithdrawModalOpen || deleteModalState.isOpen || shippingModal.isOpen || selectedTxDetail) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isProductModalOpen, isWithdrawModalOpen, deleteModalState.isOpen, shippingModal.isOpen, selectedTxDetail]);

  // Load vendors list if admin
  useEffect(() => {
    if (!isUserAdmin) return;
    const unsubVendors = onSnapshot(collection(db, 'vendors'), (snap) => {
      const vList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor));
      setAdminVendors(vList);
    });
    return () => unsubVendors();
  }, [isUserAdmin]);

  // Real-time synchronization
  useEffect(() => {
    if (!user?.uid) return;

    setIsLoading(true);

    const targetVendorId = isUserAdmin && selectedVendorFilter !== 'all' ? selectedVendorFilter : user.uid;

    // 1. Listen to Vendor Wallet details
    let unsubWallet = () => {};
    if (isUserAdmin && selectedVendorFilter === 'all') {
      unsubWallet = onSnapshot(doc(db, 'room_wallets', user.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const vBal = data.vendor_balance !== undefined 
            ? Number(data.vendor_balance || 0) 
            : Number(data.vendor_earnings || 0);

          setVendorWallet({
            vendor_balance: vBal,
            funded_balance: data.funded_balance || 0,
            vendor_earnings: data.vendor_earnings || 0,
            vendor_revenue: data.vendor_revenue || 0,
            vendor_sales_count: data.vendor_sales_count || 0,
            vendor_fees: data.vendor_fees || 0
          });
        }
      });
    } else if (targetVendorId) {
      unsubWallet = onSnapshot(doc(db, 'room_wallets', targetVendorId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const vBal = data.vendor_balance !== undefined 
            ? Number(data.vendor_balance || 0) 
            : Number(data.vendor_earnings || 0);

          setVendorWallet({
            vendor_balance: vBal,
            funded_balance: data.funded_balance || 0,
            vendor_earnings: data.vendor_earnings || 0,
            vendor_revenue: data.vendor_revenue || 0,
            vendor_sales_count: data.vendor_sales_count || 0,
            vendor_fees: data.vendor_fees || 0
          });
        } else {
          setVendorWallet({
            vendor_balance: 0,
            funded_balance: 0,
            vendor_earnings: 0,
            vendor_revenue: 0,
            vendor_sales_count: 0,
            vendor_fees: 0
          });
        }
      });
    }

    // 2. Load vendor products (Admins subscribe to all products once; vendor owners see their own)
    const qProd = isUserAdmin
      ? collection(db, 'products')
      : query(collection(db, 'products'), where('vendorId', '==', user.uid));

    const unsubProducts = onSnapshot(qProd, (snap) => {
      const prods = snap.docs.map(doc => {
        const data = doc.data();
        const isInStock = data.inStock ?? (data.available !== false && data.stockStatus !== 'out_of_stock');
        return { 
          id: doc.id, 
          name: data.name || '',
          description: data.description || '',
          price: Number(data.price) || 0,
          slashPrice: data.slashPrice ? Number(data.slashPrice) : undefined,
          image: data.image || '',
          category: data.category || 'snack',
          vendorId: data.vendorId || '',
          inStock: isInStock,
          available: data.available ?? isInStock,
          stockStatus: data.stockStatus || (isInStock ? 'in_stock' : 'out_of_stock'),
          quantity: data.quantity ?? 10
        } as Product;
      });
      setAllProducts(prods);
      setIsLoading(false);
    }, (err) => {
      console.error('Failed to load products:', err);
      setIsLoading(false);
    });

    // 3. Load vendor payouts & sales transactions
    let qPay;
    let qSales;

    if (isUserAdmin && selectedVendorFilter === 'all') {
      qPay = query(collection(db, 'withdrawals'), where('type', '==', 'vendor'));
      qSales = query(collection(db, 'transactions'), where('type', '==', 'vendor_earning'));
    } else if (targetVendorId) {
      qPay = query(collection(db, 'withdrawals'), where('user_uid', '==', targetVendorId), where('type', '==', 'vendor'));
      qSales = query(collection(db, 'transactions'), where('user_uid', '==', targetVendorId), where('type', '==', 'vendor_earning'));
    }

    let localPayouts: any[] = [];
    let localSales: any[] = [];

    const mergeAndSort = () => {
      const merged = [
        ...localPayouts.map(p => ({
          id: p.id,
          type: 'withdrawal',
          amount: p.amount || 0,
          grossAmount: p.amount || 0,
          feeAmount: p.fee_amount !== undefined ? p.fee_amount : (p.type === 'vendor' ? 0 : (p.amount ? p.amount * 0.05 : 0)),
          payoutAmount: p.payout_amount !== undefined ? p.payout_amount : (p.type === 'vendor' ? (p.amount || 0) : (p.amount ? p.amount * 0.95 : 0)),
          date: p.created_at?.toDate ? p.created_at.toDate() : (p.created_at ? new Date(p.created_at) : new Date()),
          description: `Withdrawal settlement to ${p.bank_name || 'Bank'} (${p.account_number || ''})`,
          bankName: p.bank_name,
          accountNumber: p.account_number,
          accountName: p.account_name,
          vendorId: p.user_uid,
          vendorName: p.user_name,
          status: p.status || 'pending'
        })),
        ...localSales.map(s => ({
          id: s.id,
          type: 'sale',
          amount: s.amount || (s.grossAmount ? s.grossAmount * 0.7 : 0),
          grossAmount: s.grossAmount || (s.amount ? s.amount / 0.7 : 0),
          platformFee: s.platformFee || (s.grossAmount ? s.grossAmount * 0.3 : 0),
          itemsCount: s.itemsCount || (s.items?.length || 1),
          date: s.timestamp?.toDate ? s.timestamp.toDate() : (s.timestamp ? new Date(s.timestamp) : new Date()),
          description: s.title || `Sales Earning from Order #${s.orderNumber || ''}`,
          orderNumber: s.orderNumber,
          orderId: s.orderId,
          customerName: s.customerName,
          customerPhone: s.customerPhone,
          customerAddress: s.customerAddress,
          items: s.items,
          vendorId: s.vendorId || s.user_uid,
          vendorName: s.vendorName,
          status: s.status || 'completed'
        }))
      ].sort((a, b) => b.date.getTime() - a.date.getTime());
      
      setHistory(merged);
      setPayouts(localPayouts.sort((a: any, b: any) => {
        const tsA = a.created_at?.seconds || 0;
        const tsB = b.created_at?.seconds || 0;
        return tsB - tsA;
      }));
    };

    const unsubPayouts = qPay ? onSnapshot(qPay, (snap) => {
      localPayouts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      mergeAndSort();
    }) : () => {};

    const unsubSales = qSales ? onSnapshot(qSales, (snap) => {
      localSales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      mergeAndSort();
    }) : () => {};

    // 4. Listen to Bank Details real-time
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists() && snap.data().bankDetails) {
        const data = snap.data().bankDetails;
        const bCode = data.bankCode || '';
        const bName = data.bankName || '';
        const bAcc = data.account || data.accountNumber || '';
        const bHolder = data.name || data.accountName || '';
        setBankDetails({
          bankName: bName,
          accountNumber: bAcc,
          accountName: bHolder,
          bankCode: bCode
        });
        setTempBankDetails({
          account: bAcc,
          bankName: bName,
          bankCode: bCode,
          name: bHolder
        });
      }
    });

    // 5. Load vendor orders in real-time
    const qOrders = isUserAdmin
      ? collection(db, 'orders')
      : query(collection(db, 'orders'), where('vendorId', '==', user.uid));

    const unsubOrders = onSnapshot(qOrders, (snap) => {
      const ords = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          orderNumber: data.orderNumber || doc.id.substring(0, 8).toUpperCase(),
          userId: data.userId || '',
          userName: data.userName || data.customerName || 'Customer',
          userEmail: data.userEmail || '',
          userPhone: data.userPhone || data.customerPhone || '',
          deliveryAddress: data.deliveryAddress || data.customerAddress || '',
          items: data.items || [],
          totalAmount: data.totalAmount ?? (data.total || 0),
          vendorId: data.vendorId || '',
          vendorName: data.vendorName || '',
          status: data.status || 'pending',
          estimatedDeliveryTime: data.estimatedDeliveryTime,
          acceptedAt: data.acceptedAt,
          shippedAt: data.shippedAt,
          deliveredAt: data.deliveredAt,
          cancelledAt: data.cancelledAt,
          rated: data.rated,
          rating: data.rating,
          review: data.review,
          telegramMessageId: data.telegramMessageId,
          telegramChatId: data.telegramChatId,
          createdAt: data.createdAt || Date.now()
        } as Order;
      });
      ords.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAllOrders(ords);
    }, (err) => {
      console.warn('Orders listener warning:', err);
    });

    return () => {
      unsubWallet();
      unsubProducts();
      unsubPayouts();
      unsubSales();
      unsubUser();
      unsubOrders();
    };
  }, [user?.uid, isUserAdmin, selectedVendorFilter]);

  // Order action handlers
  const handleAcceptOrder = async (order: Order) => {
    const toastId = toast.loading(`Accepting order #${order.orderNumber || order.id}...`);
    try {
      await updateOrderStatus(order.id, 'accepted', undefined, {
        vendorId: order.vendorId,
        userId: order.userId,
        orderNumber: order.orderNumber,
        vendorName: order.vendorName
      });
      toast.success(`Order #${order.orderNumber || order.id} accepted! Customer notified.`, { id: toastId });
    } catch (e: any) {
      toast.error(e.message || 'Failed to accept order', { id: toastId });
    }
  };

  const handleOpenShipModal = (order: Order) => {
    setShippingModal({
      isOpen: true,
      orderId: order.id,
      orderNumber: order.orderNumber || order.id.substring(0, 8).toUpperCase(),
      eta: order.estimatedDeliveryTime || '30 mins',
      targetOrder: order,
      isSubmitting: false
    });
  };

  const handleConfirmShipOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shippingModal.orderId) return;
    const etaVal = shippingModal.eta.trim() || '30 mins';
    
    setShippingModal(prev => ({ ...prev, isSubmitting: true }));
    const toastId = toast.loading(`Setting order #${shippingModal.orderNumber} as Shipped...`);
    try {
      const target = shippingModal.targetOrder;
      await updateOrderStatus(shippingModal.orderId, 'shipped', etaVal, {
        vendorId: target?.vendorId,
        userId: target?.userId,
        orderNumber: target?.orderNumber || shippingModal.orderNumber,
        vendorName: target?.vendorName
      });
      toast.success(`Order #${shippingModal.orderNumber} is Out for Delivery! (ETA: ${etaVal})`, { id: toastId });
      setShippingModal({ isOpen: false, orderId: '', orderNumber: '', eta: '30 mins', targetOrder: null, isSubmitting: false });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update order to shipped', { id: toastId });
      setShippingModal(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleDeliverOrder = async (order: Order) => {
    const toastId = toast.loading(`Marking order #${order.orderNumber || order.id} as Delivered...`);
    try {
      await updateOrderStatus(order.id, 'delivered', undefined, {
        vendorId: order.vendorId,
        userId: order.userId,
        orderNumber: order.orderNumber,
        vendorName: order.vendorName
      });
      toast.success(`Order #${order.orderNumber || order.id} delivered! Rating requested from customer.`, { id: toastId });
    } catch (e: any) {
      toast.error(e.message || 'Failed to mark as delivered', { id: toastId });
    }
  };

  const handleCancelOrder = async (order: Order) => {
    if (!window.confirm(`Are you sure you want to cancel order #${order.orderNumber || order.id}?`)) return;
    const toastId = toast.loading(`Cancelling order #${order.orderNumber || order.id}...`);
    try {
      await updateOrderStatus(order.id, 'cancelled', undefined, {
        vendorId: order.vendorId,
        userId: order.userId,
        orderNumber: order.orderNumber,
        vendorName: order.vendorName
      });
      toast.success(`Order #${order.orderNumber || order.id} cancelled. Customer notified.`, { id: toastId });
    } catch (e: any) {
      toast.error(e.message || 'Failed to cancel order', { id: toastId });
    }
  };

  // Reset transient bank edit states and withdraw amount when settlement modal opens/closes
  useEffect(() => {
    if (isWithdrawModalOpen) {
      setWithdrawAmount('');
      setTempBankDetails({
        account: bankDetails.accountNumber,
        bankName: bankDetails.bankName,
        bankCode: bankDetails.bankCode,
        name: bankDetails.accountName
      });
      setBankSearch(bankDetails.bankName);
      setShowBankDropdown(false);
      setIsEditingBank(false);
    } else {
      setWithdrawAmount('');
    }
  }, [isWithdrawModalOpen, bankDetails]);

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

  // Bank dropdown click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(event.target as Node)) {
        setShowBankDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredBanks = availableBanks.filter(b => {
    if (bankSearch) return b.name.toLowerCase().includes(bankSearch.toLowerCase());
    return true;
  });

  const handleSelectBank = async (bank: any) => {
    setTempBankDetails(prev => ({ ...prev, bankName: bank.name, bankCode: bank.code, name: '' }));
    setBankSearch(bank.name);
    setShowBankDropdown(false);

    if (tempBankDetails.account.length === 10) {
      setIsResolvingBank(true);
      try {
        const result = await resolveBankAccount(tempBankDetails.account, bank.code);
        if (result.status && result.data?.account_name) {
          setTempBankDetails(prev => ({
            ...prev,
            bankName: bank.name,
            bankCode: bank.code,
            name: result.data.account_name
          }));
          toast.success("Account verified!");
        } else {
          toast.error(result.message || "Could not verify account. Please check number and bank.");
          setTempBankDetails(prev => ({ ...prev, name: '' }));
        }
      } catch (err) {
        toast.error("Verification failed.");
        setTempBankDetails(prev => ({ ...prev, name: '' }));
      } finally {
        setIsResolvingBank(false);
      }
    }
  };

  const handleCancelBankEdit = () => {
    setTempBankDetails({
      account: bankDetails.accountNumber,
      bankName: bankDetails.bankName,
      bankCode: bankDetails.bankCode,
      name: bankDetails.accountName
    });
    setBankSearch(bankDetails.bankName);
    setShowBankDropdown(false);
    setIsEditingBank(false);
  };

  const handleOpenWithdrawModal = () => {
    setWithdrawAmount('');
    setIsWithdrawModalOpen(true);
  };

  const handleCloseWithdrawModal = () => {
    setWithdrawAmount('');
    setTempBankDetails({
      account: bankDetails.accountNumber,
      bankName: bankDetails.bankName,
      bankCode: bankDetails.bankCode,
      name: bankDetails.accountName
    });
    setBankSearch(bankDetails.bankName);
    setShowBankDropdown(false);
    setIsEditingBank(false);
    setIsWithdrawModalOpen(false);
  };

  const handleSaveBankDetails = async () => {
    if (!user?.uid) return;
    if (!tempBankDetails.name || !tempBankDetails.bankName || !tempBankDetails.bankCode || tempBankDetails.account.length !== 10) {
      toast.error("Please enter a valid 10-digit account number, select a bank, and ensure your account name is verified.");
      return;
    }

    setIsSavingBankSettings(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        bankDetails: {
          name: tempBankDetails.name,
          account: tempBankDetails.account,
          bankName: tempBankDetails.bankName,
          bankCode: tempBankDetails.bankCode
        }
      });
      setBankDetails({
        bankName: tempBankDetails.bankName,
        accountNumber: tempBankDetails.account,
        accountName: tempBankDetails.name,
        bankCode: tempBankDetails.bankCode
      });
      setIsEditingBank(false);
      toast.success("Bank details saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save bank details.");
    } finally {
      setIsSavingBankSettings(false);
    }
  };

  // Image upload handler
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      // Use existing uploadFile helper which uploads to backend -> R2
      const url = await uploadFile(file, `products/${user?.uid || 'general'}`);
      setProductForm(prev => ({ ...prev, image: url }));
      toast.success('Product image uploaded successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Image upload failed');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Remove product image
  const handleRemoveProductImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setProductForm(prev => ({ ...prev, image: '' }));
    if (productImageInputRef.current) {
      productImageInputRef.current.value = '';
    }
    toast.info('Picture removed. Choose a new picture or upload from your device.');
  };

  // Save Product (Create or Edit)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    if (!productForm.name || !productForm.price || !productForm.image) {
      toast.error('Name, Price, and Product Image are required.');
      return;
    }

    setIsSavingProduct(true);
    try {
      const priceNum = parseFloat(productForm.price);
      const slashPriceNum = productForm.slashPrice ? parseFloat(productForm.slashPrice) : undefined;

      const isAvailable = productForm.stockStatus === 'in_stock';
      const targetVendorId = editingProduct 
        ? editingProduct.vendorId 
        : (isUserAdmin && selectedVendorFilter !== 'all' ? selectedVendorFilter : user.uid);

      const productData = {
        name: productForm.name,
        description: productForm.description,
        price: priceNum,
        slashPrice: slashPriceNum,
        category: productForm.category,
        image: productForm.image,
        inStock: isAvailable,
        available: isAvailable,
        stockStatus: productForm.stockStatus,
        vendorId: targetVendorId,
        updatedAt: Date.now()
      };

      if (editingProduct) {
        // If image was replaced, remove old image from Cloudflare R2
        if (editingProduct.image && editingProduct.image !== productForm.image) {
          deleteCloudflareAsset(editingProduct.image).catch(err => 
            console.warn('Failed to delete old image from Cloudflare:', err)
          );
        }
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
        toast.success('Product updated successfully!');
      } else {
        await addDoc(collection(db, 'products'), {
          ...productData,
          createdAt: Date.now()
        });
        toast.success('Product created and added to Cinema Store!');
      }

      setIsProductModalOpen(false);
      setEditingProduct(null);
      setProductForm({
        name: '',
        description: '',
        price: '',
        slashPrice: '',
        category: 'snack',
        image: '',
        stockStatus: 'in_stock',
        available: true
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save product');
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Open In-App Delete Confirmation Modal
  const promptDeleteProduct = (id: string, name: string, image?: string) => {
    setDeleteModalState({
      isOpen: true,
      productId: id,
      productName: name,
      productImage: image
    });
  };

  // Execute in-app confirmed product deletion
  const handleConfirmDeleteProduct = async () => {
    if (!deleteModalState.productId) return;

    setIsDeletingProduct(true);
    const toastId = toast.loading(`Deleting "${deleteModalState.productName}"...`);
    try {
      await deleteProduct(deleteModalState.productId, deleteModalState.productImage);
      toast.success(`"${deleteModalState.productName}" deleted from database and Cloudflare`, { id: toastId });
      setDeleteModalState({ isOpen: false, productId: '', productName: '', productImage: '' });
    } catch (err: any) {
      console.error('Failed to delete product:', err);
      toast.error(err.message || 'Failed to delete product', { id: toastId });
    } finally {
      setIsDeletingProduct(false);
    }
  };

  // Open Add/Edit Product Modal
  const openProductModal = (product: Product | null = null) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        description: product.description,
        price: product.price.toString(),
        slashPrice: product.slashPrice?.toString() || '',
        category: product.category,
        image: product.image,
        stockStatus: product.stockStatus || (product.available !== false ? 'in_stock' : 'out_of_stock'),
        available: product.available !== false
      });
    } else {
      setEditingProduct(null);
      setProductForm({
        name: '',
        description: '',
        price: '',
        slashPrice: '',
        category: 'snack',
        image: '',
        stockStatus: 'in_stock',
        available: true
      });
    }
    setIsProductModalOpen(true);
  };

  // Initiate Cashout request
  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;

    const amt = parseFloat(withdrawAmount);
    if (!withdrawAmount || isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid payout amount.');
      return;
    }

    if (amt > computedStats.availableBalance) {
      toast.error(`Insufficient vendor withdrawable balance. Available: ₦${computedStats.availableBalance.toLocaleString()}`);
      return;
    }

    if (!bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.accountName || !bankDetails.bankCode || bankDetails.accountNumber.length !== 10) {
      toast.error('Please configure and verify your payout bank account first in settings.');
      return;
    }

    setIsSubmittingWithdrawal(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      // Hit unified withdraw endpoint in backend
      const response = await fetch(`${API_BASE_URL}/api/cinema/withdraw`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: user.uid,
          amount: amt,
          bank_code: bankDetails.bankCode,
          bank_name: bankDetails.bankName,
          account_number: bankDetails.accountNumber,
          account_name: bankDetails.accountName,
          balance_type: 'vendor'
        })
      });

      const result = await response.json();
      if (response.ok && result.success) {
        toast.success('Payout request submitted for approval!');
        setIsWithdrawModalOpen(false);
        setWithdrawAmount('');
      } else {
        toast.error(result.detail || 'Withdrawal failed. Check details.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Payout connection failed');
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 min-h-screen pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-white flex items-center gap-3">
            <Store className="w-7 h-7 md:w-8 md:h-8 text-amber-500" /> Vendor Command Center
          </h2>
          <p className="text-[9px] md:text-xs text-muted-foreground uppercase font-black tracking-widest mt-1">
            Manage your ecommerce store, products, earnings, and payouts
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <Button 
            onClick={() => setActiveSubTab('dashboard')} 
            variant={activeSubTab === 'dashboard' ? 'default' : 'outline'}
            className="flex-1 md:flex-initial text-[10px] md:text-xs uppercase font-black tracking-widest px-2.5 py-1.5 h-9 md:h-10"
          >
            Dashboard
          </Button>
          <Button 
            onClick={() => setActiveSubTab('orders')} 
            variant={activeSubTab === 'orders' ? 'default' : 'outline'}
            className="relative flex-1 md:flex-initial text-[10px] md:text-xs uppercase font-black tracking-widest px-2.5 py-1.5 h-9 md:h-10"
          >
            Orders ({allOrders.length})
            {allOrders.filter(o => o.status === 'pending' || !o.status).length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[8px] sm:text-[9px] font-black animate-pulse">
                {allOrders.filter(o => o.status === 'pending' || !o.status).length} new
              </span>
            )}
          </Button>
          <Button 
            onClick={() => setActiveSubTab('products')} 
            variant={activeSubTab === 'products' ? 'default' : 'outline'}
            className="flex-1 md:flex-initial text-[10px] md:text-xs uppercase font-black tracking-widest px-2.5 py-1.5 h-9 md:h-10"
          >
            Products ({allProducts.length})
          </Button>
          <Button 
            onClick={() => setActiveSubTab('transactions')} 
            variant={activeSubTab === 'transactions' ? 'default' : 'outline'}
            className="relative flex-1 md:flex-initial text-[10px] md:text-xs uppercase font-black tracking-widest px-2.5 py-1.5 h-9 md:h-10"
          >
            <Receipt className="w-3.5 h-3.5 mr-1" /> Transactions ({history.length})
          </Button>
          <Button 
            onClick={() => setActiveSubTab('payout')} 
            variant={activeSubTab === 'payout' ? 'default' : 'outline'}
            className="flex-1 md:flex-initial text-[10px] md:text-xs uppercase font-black tracking-widest px-2.5 py-1.5 h-9 md:h-10"
          >
            Payouts
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {activeSubTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 md:space-y-8"
            >
              {/* Admin Active Vendor Bar */}
              {isUserAdmin && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 sm:p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-black/40 text-[8px] font-black uppercase px-2 py-0.5">
                      Admin Oversight
                    </Badge>
                    <span className="text-xs font-bold text-white">Viewing Store Finances For:</span>
                  </div>
                  <VendorFilterCustomDropdown
                    selectedVendor={selectedVendorFilter}
                    onSelectVendor={setSelectedVendorFilter}
                    vendors={adminVendors}
                    totalAllCount={allOrders.length}
                    countLabel="orders"
                    getItemCount={(vid) => allOrders.filter(o => o.vendorId === vid).length}
                    currentUserId={user?.uid}
                    variant="gold"
                    className="w-full sm:w-auto"
                  />
                </div>
              )}

              {/* Financial Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {/* 1. Store Net Earnings (70%) */}
                <Card className="glass-card p-4 md:p-6 border-white/5 flex flex-col justify-between space-y-3 md:space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Store Net Earnings</span>
                      <Percent className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg md:text-2xl font-black text-amber-500">
                        ₦{computedStats.totalEarnings.toLocaleString()}
                      </h3>
                      <p className="text-[8px] md:text-[9px] text-muted-foreground uppercase font-black">
                        70% Vendor Share Credited
                      </p>
                    </div>
                  </div>
                  <div className="text-[8px] md:text-[9px] font-black uppercase flex justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                    <span className="text-muted-foreground">Orders</span>
                    <span className="text-amber-400">{computedStats.ordersCount} Fulfilled</span>
                  </div>
                </Card>

                {/* 2. Total Gross Sales Revenue */}
                <Card className="glass-card p-4 md:p-6 border-white/5 flex flex-col justify-between space-y-3 md:space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Sales Revenue</span>
                      <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg md:text-2xl font-black text-white">
                        ₦{computedStats.totalRevenue.toLocaleString()}
                      </h3>
                      <p className="text-[8px] md:text-[9px] text-muted-foreground uppercase font-black">
                        100% Gross Customer Spend
                      </p>
                    </div>
                  </div>
                  <div className="text-[8px] md:text-[9px] font-black uppercase flex justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                    <span className="text-muted-foreground">Items Sold</span>
                    <span className="text-primary">{computedStats.totalUnits} Units</span>
                  </div>
                </Card>

                {/* 3. Platform Commission (30%) */}
                <Card className="glass-card p-4 md:p-6 border-white/5 flex flex-col justify-between space-y-3 md:space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Platform Fee (30%)</span>
                      <Building className="w-4 h-4 md:w-5 md:h-5 text-indigo-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg md:text-2xl font-black text-indigo-300">
                        ₦{computedStats.totalFees.toLocaleString()}
                      </h3>
                      <p className="text-[8px] md:text-[9px] text-muted-foreground uppercase font-black">
                        StreamAura service fee
                      </p>
                    </div>
                  </div>
                  <div className="text-[8px] md:text-[9px] font-black uppercase flex justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                    <span className="text-muted-foreground">Platform Cut</span>
                    <span className="text-indigo-400">30% of your sales</span>
                  </div>
                </Card>

                {/* 4. Available Withdrawable Balance */}
                <Card className="glass-card p-4 md:p-6 border-white/5 flex flex-col justify-between space-y-3 md:space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Store Withdrawable Balance</span>
                      <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg md:text-2xl font-black text-emerald-400">
                        ₦{computedStats.availableBalance.toLocaleString()}
                      </h3>
                      <p className="text-[8px] md:text-[9px] text-muted-foreground uppercase font-black">
                        Store Earnings • 0% withdrawal fee
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={handleOpenWithdrawModal}
                    className="w-full text-[9px] md:text-xs font-black uppercase tracking-widest h-8 md:h-10 gradient-bg"
                  >
                    <Banknote className="w-3.5 h-3.5 mr-1" /> Withdraw
                  </Button>
                </Card>
              </div>

              {/* Fast links */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
                <Card className="glass-card p-4 md:p-6 border-white/5 space-y-3 md:space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Order Inflow</h3>
                  <div className="flex flex-col gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                      <Truck className="w-7 h-7 text-amber-500 flex-shrink-0" />
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold uppercase">{allOrders.length} Total Orders</h4>
                        <p className="text-[9px] text-muted-foreground uppercase">
                          {allOrders.filter(o => o.status === 'pending' || !o.status).length} Pending
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => setActiveSubTab('orders')} className="w-full px-3 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest h-8 gradient-bg">
                      Manage Orders
                    </Button>
                  </div>
                </Card>

                <Card className="glass-card p-4 md:p-6 border-white/5 space-y-3 md:space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Product Catalog</h3>
                  <div className="flex flex-col gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="w-7 h-7 text-primary flex-shrink-0" />
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold uppercase">{allProducts.length} Live Items</h4>
                        <p className="text-[9px] text-muted-foreground uppercase">In Cinema Snack Store</p>
                      </div>
                    </div>
                    <Button onClick={() => openProductModal()} className="w-full px-3 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest h-8">
                      <Plus className="w-4 h-4 mr-1" /> Add Product
                    </Button>
                  </div>
                </Card>

                <Card className="glass-card p-4 md:p-6 border-white/5 space-y-3 md:space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Financial Activity</h3>
                  <div className="flex flex-col gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                      <Receipt className="w-7 h-7 text-emerald-400 flex-shrink-0" />
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold uppercase">{history.length} Transactions</h4>
                        <p className="text-[9px] text-muted-foreground uppercase">Sales & Payout Logs</p>
                      </div>
                    </div>
                    <Button onClick={() => setActiveSubTab('transactions')} variant="outline" className="w-full px-3 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest h-8 border-white/20">
                      View Activity Log
                    </Button>
                  </div>
                </Card>

                <Card className="glass-card p-4 md:p-6 border-white/5 space-y-3 md:space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Payout Destination</h3>
                  <div className="flex flex-col gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                      <Building className="w-7 h-7 text-indigo-400 flex-shrink-0" />
                      <div className="truncate">
                        <h4 className="text-xs sm:text-sm font-bold uppercase truncate">{bankDetails.bankName || 'Not Setup'}</h4>
                        <p className="text-[9px] text-muted-foreground uppercase truncate">
                          {bankDetails.accountNumber ? `No. ${bankDetails.accountNumber}` : 'Configure Bank'}
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => setActiveSubTab('payout')} variant="outline" className="w-full px-3 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest h-8 border-white/20">
                      Payout Settings
                    </Button>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {activeSubTab === 'orders' && (
            <motion.div 
              key="orders"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* Header bar with filters & search */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                      {isUserAdmin ? 'Vendor Orders (Admin Oversight)' : 'Customer Orders & Fulfilment'}
                      {isUserAdmin && (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[8px] font-black uppercase tracking-wider">
                          Admin
                        </Badge>
                      )}
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Live order queue & dispatch management
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                  {/* Admin Vendor Filter */}
                  {isUserAdmin && (
                    <VendorFilterCustomDropdown
                      selectedVendor={selectedVendorFilter}
                      onSelectVendor={setSelectedVendorFilter}
                      vendors={adminVendors}
                      totalAllCount={allOrders.length}
                      countLabel="orders"
                      getItemCount={(vid) => allOrders.filter(o => o.vendorId === vid).length}
                      currentUserId={user?.uid}
                      className="w-full sm:w-auto"
                    />
                  )}

                  {/* Search box */}
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search order #, customer, phone..."
                      value={orderSearchQuery}
                      onChange={(e) => setOrderSearchQuery(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 font-medium"
                    />
                    {orderSearchQuery && (
                      <button 
                        type="button" 
                        onClick={() => setOrderSearchQuery('')} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { id: 'all', label: 'All Orders', count: allOrders.length },
                  { id: 'pending', label: 'Pending', count: allOrders.filter(o => o.status === 'pending' || !o.status).length },
                  { id: 'accepted', label: 'In Kitchen', count: allOrders.filter(o => o.status === 'accepted').length },
                  { id: 'shipped', label: 'Out for Delivery', count: allOrders.filter(o => o.status === 'shipped').length },
                  { id: 'delivered', label: 'Delivered', count: allOrders.filter(o => o.status === 'delivered').length },
                  { id: 'cancelled', label: 'Cancelled', count: allOrders.filter(o => o.status === 'cancelled').length },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setOrderStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 border ${
                      orderStatusFilter === tab.id
                        ? 'bg-primary text-black border-primary font-black shadow-lg shadow-primary/20'
                        : 'bg-white/5 border-white/10 text-muted-foreground hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${orderStatusFilter === tab.id ? 'bg-black/20 text-black' : 'bg-white/10 text-white'}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Dedicated View Controls & Summary Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white/[0.02] border border-white/5 p-2.5 sm:px-3.5 sm:py-2 rounded-xl">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-bold text-white uppercase text-[11px]">
                    {displayedOrders.length} {displayedOrders.length === 1 ? 'Order' : 'Orders'}
                  </span>
                  {orderStatusFilter !== 'all' && (
                    <Badge variant="outline" className="text-[9px] font-bold border-white/10 text-muted-foreground capitalize">
                      Filter: {orderStatusFilter}
                    </Badge>
                  )}
                  {allOrders.filter(o => o.status === 'pending' || !o.status).length > 0 && (
                    <span className="text-amber-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      {allOrders.filter(o => o.status === 'pending' || !o.status).length} Action Required
                    </span>
                  )}
                </div>

                {/* Clean View Toggle (Segmented Compact vs Expand All) */}
                {displayedOrders.length > 0 && (
                  <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-lg w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={collapseAllOrders}
                      className={`flex-1 sm:flex-initial px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        displayedOrders.filter(o => expandedOrderIds[o.id]).length === 0
                          ? 'bg-white/15 text-white shadow-sm font-black'
                          : 'text-muted-foreground hover:text-white'
                      }`}
                      title="Collapse all orders into compact list"
                    >
                      <Minimize2 className="w-3 h-3" />
                      <span>Compact</span>
                    </button>

                    <button
                      type="button"
                      onClick={expandAllOrders}
                      className={`flex-1 sm:flex-initial px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        displayedOrders.length > 0 && displayedOrders.every(o => expandedOrderIds[o.id])
                          ? 'bg-amber-500 text-black font-black shadow-sm'
                          : 'text-muted-foreground hover:text-white'
                      }`}
                      title="Expand all orders to show full details"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Expand All</span>
                      {displayedOrders.filter(o => expandedOrderIds[o.id]).length > 0 && (
                        <span className={`px-1.5 py-0.2 rounded-full text-[8px] font-black ${displayedOrders.every(o => expandedOrderIds[o.id]) ? 'bg-black/20 text-black' : 'bg-white/15 text-white'}`}>
                          {displayedOrders.filter(o => expandedOrderIds[o.id]).length}/{displayedOrders.length}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Orders Feed */}
              <div className="space-y-3">
                {displayedOrders.map((order) => {
                  const status = order.status || 'pending';
                  const orderNum = order.orderNumber || order.id.substring(0, 8).toUpperCase();
                  const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Recent';
                  const isExpanded = Boolean(expandedOrderIds[order.id]);
                  const itemsCount = order.items?.reduce((sum: number, it: any) => sum + (it.quantity || 1), 0) || order.items?.length || 0;
                  const itemsSummary = order.items?.map((it: any) => `${it.quantity || 1}x ${it.name}`).join(', ') || 'Snack items';

                  const grossAmount = order.totalAmount || 0;
                  const netVendorEarnings = grossAmount * 0.70;
                  const platformFee = grossAmount * 0.30;

                  return (
                    <Card 
                      key={order.id} 
                      className={`glass-card border-white/10 overflow-hidden text-left transition-all hover:border-white/20 ${
                        isExpanded ? 'ring-1 ring-amber-500/30 border-amber-500/20' : ''
                      }`}
                    >
                      {/* Interactive Header Bar */}
                      <div 
                        onClick={() => toggleOrderExpand(order.id)}
                        className="p-3.5 sm:p-4 cursor-pointer hover:bg-white/[0.02] transition-colors space-y-3"
                      >
                        {/* Top Line: Status Badge, Order Number, Time, Paid Amount, Details Toggle */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          {/* Left Group */}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Status Indicator */}
                            {status === 'pending' && (
                              <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[9px] font-black uppercase tracking-widest animate-pulse">
                                Pending
                              </Badge>
                            )}
                            {status === 'accepted' && (
                              <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/40 text-[9px] font-black uppercase tracking-widest">
                                In Kitchen
                              </Badge>
                            )}
                            {status === 'shipped' && (
                              <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/40 text-[9px] font-black uppercase tracking-widest">
                                Out for Delivery
                              </Badge>
                            )}
                            {status === 'delivered' && (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-black uppercase tracking-widest">
                                Delivered
                              </Badge>
                            )}
                            {status === 'cancelled' && (
                              <Badge className="bg-red-500/20 text-red-400 border border-red-500/40 text-[9px] font-black uppercase tracking-widest">
                                Cancelled
                              </Badge>
                            )}

                            {/* Order Number & Copy */}
                            <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">
                              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400 font-mono">
                                #{orderNum}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(orderNum);
                                  toast.success(`Order #${orderNum} copied to clipboard!`);
                                }}
                                className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                                title="Copy Order Number"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>

                            <span className="text-[10px] text-muted-foreground">• {dateStr}</span>

                            {isUserAdmin && order.vendorName && (
                              <Badge variant="outline" className="text-[8px] font-black uppercase border-amber-500/30 text-amber-300 bg-amber-500/10">
                                Vendor: {order.vendorName}
                              </Badge>
                            )}
                          </div>

                          {/* Right Group: Paid Amount & Explicit Details Toggle Button */}
                          <div className="flex items-center gap-2.5 ml-auto">
                            <div className="text-right">
                              <span className="text-xs sm:text-base font-black text-emerald-400 font-mono">
                                ₦{grossAmount.toLocaleString()}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleOrderExpand(order.id);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
                                isExpanded
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white border-white/10'
                              }`}
                            >
                              <span>{isExpanded ? 'Less' : 'Details'}</span>
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </div>

                        {/* Middle Line: Customer info & Basket summary & Quick action */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 pt-2 border-t border-white/5 text-[11px]">
                          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                            <span className="font-bold text-white uppercase flex items-center gap-1">
                              <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                              {order.userName || 'Guest Customer'}
                            </span>

                            {order.userPhone && (
                              <a
                                href={`tel:${order.userPhone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 font-mono text-emerald-400 hover:underline text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20"
                              >
                                <Phone className="w-2.5 h-2.5" /> {order.userPhone}
                              </a>
                            )}

                            <span>•</span>
                            <span className="truncate max-w-xs sm:max-w-md text-white/80 font-medium">
                              {itemsCount} {itemsCount === 1 ? 'item' : 'items'} ({itemsSummary})
                            </span>
                          </div>

                          {/* Quick Action Button in Header */}
                          <div className="flex items-center gap-1.5 ml-auto sm:ml-0" onClick={(e) => e.stopPropagation()}>
                            {(status === 'pending' || !status) && (
                              <Button
                                size="sm"
                                onClick={() => handleAcceptOrder(order)}
                                className="h-7 px-3 text-[9px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Accept
                              </Button>
                            )}
                            {status === 'accepted' && (
                              <Button
                                size="sm"
                                onClick={() => handleOpenShipModal(order)}
                                className="h-7 px-3 text-[9px] font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white shadow-sm"
                              >
                                <Truck className="w-3 h-3 mr-1" /> Ship / Set ETA
                              </Button>
                            )}
                            {status === 'shipped' && (
                              <Button
                                size="sm"
                                onClick={() => handleDeliverOrder(order)}
                                className="h-7 px-3 text-[9px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                              >
                                <PackageCheck className="w-3 h-3 mr-1" /> Deliver
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expandable Body Dropdown */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            className="overflow-hidden border-t border-white/10 bg-black/40"
                          >
                            <div className="p-4 sm:p-5 space-y-4">
                              {/* Customer & Delivery Information Cards */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white/[0.02] border border-white/5 p-3.5 rounded-xl">
                                <div className="space-y-1.5">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                                    <ChefHat className="w-3.5 h-3.5 text-primary" /> Customer Contact
                                  </p>
                                  <p className="text-xs font-bold text-white uppercase">{order.userName || 'Guest Customer'}</p>
                                  {order.userPhone ? (
                                    <div className="flex items-center gap-2 text-xs">
                                      <Phone className="w-3 h-3 text-emerald-400" />
                                      <a href={`tel:${order.userPhone}`} className="text-emerald-400 hover:underline font-mono font-bold">
                                        {order.userPhone}
                                      </a>
                                    </div>
                                  ) : (
                                    <p className="text-[10px] text-muted-foreground italic">No phone provided</p>
                                  )}
                                  {order.userEmail && (
                                    <p className="text-[10px] text-muted-foreground">{order.userEmail}</p>
                                  )}
                                </div>

                                <div className="space-y-1.5">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-amber-500" /> Delivery Address / Seat Notes
                                  </p>
                                  <p className="text-xs text-white/90 font-medium leading-relaxed">
                                    {order.deliveryAddress || 'Standard Delivery / In-Cinema Pick-Up'}
                                  </p>
                                  {order.estimatedDeliveryTime && (
                                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md w-fit mt-1">
                                      <Clock className="w-3 h-3" /> ETA: {order.estimatedDeliveryTime}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Items Ordered Breakdown */}
                              <div className="space-y-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                  Order Items ({order.items?.length || 0})
                                </p>
                                <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-black/40">
                                  {order.items?.map((item: any, idx: number) => (
                                    <div key={idx} className="p-2.5 sm:p-3 flex items-center justify-between gap-3 text-xs">
                                      <div className="flex items-center gap-3">
                                        {item.image ? (
                                          <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-cover bg-white/5 flex-shrink-0" />
                                        ) : (
                                          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                                            <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                                          </div>
                                        )}
                                        <div>
                                          <p className="font-bold text-white uppercase">{item.name}</p>
                                          <p className="text-[10px] text-muted-foreground font-mono">
                                            ₦{(item.price || 0).toLocaleString()} × {item.quantity || 1}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <span className="font-black text-white font-mono">
                                          ₦{((item.price || 0) * (item.quantity || 1)).toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Revenue Share Split Breakdown Card */}
                              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl grid grid-cols-3 gap-2 text-center text-xs">
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider">Gross Total</span>
                                  <p className="font-mono font-bold text-white">₦{grossAmount.toLocaleString()}</p>
                                </div>
                                <div className="space-y-0.5 border-x border-white/5">
                                  <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">Store Net (70%)</span>
                                  <p className="font-mono font-bold text-emerald-400">₦{netVendorEarnings.toLocaleString()}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Fee (30%)</span>
                                  <p className="font-mono font-bold text-indigo-300">₦{platformFee.toLocaleString()}</p>
                                </div>
                              </div>

                              {/* Rating & Review (if rated) */}
                              {order.rated && order.rating && (
                                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                                    <span>Customer Rating: {order.rating} / 5 Stars</span>
                                  </div>
                                  {order.review && (
                                    <p className="text-xs text-muted-foreground italic">"{order.review}"</p>
                                  )}
                                </div>
                              )}

                              {/* Action Footer & Order Status Bar */}
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-3 border-t border-white/5">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Order Total:</span>
                                  <span className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                                    ₦{grossAmount.toLocaleString()}
                                  </span>
                                </div>

                                {/* Full Action Buttons */}
                                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                                  {(status === 'pending' || !status) && (
                                    <>
                                      <Button
                                        onClick={() => handleAcceptOrder(order)}
                                        className="flex-1 sm:flex-initial h-9 px-4 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Accept Order
                                      </Button>
                                      <Button
                                        onClick={() => handleCancelOrder(order)}
                                        variant="outline"
                                        className="h-9 px-3 text-[10px] font-black uppercase tracking-wider text-red-400 border-red-500/30 hover:bg-red-500/10"
                                      >
                                        <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel Order
                                      </Button>
                                    </>
                                  )}

                                  {status === 'accepted' && (
                                    <>
                                      <Button
                                        onClick={() => handleOpenShipModal(order)}
                                        className="flex-1 sm:flex-initial h-9 px-4 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white"
                                      >
                                        <Truck className="w-3.5 h-3.5 mr-1.5" /> Ship / Out for Delivery
                                      </Button>
                                      <Button
                                        onClick={() => handleCancelOrder(order)}
                                        variant="outline"
                                        className="h-9 px-3 text-[10px] font-black uppercase tracking-wider text-red-400 border-red-500/30 hover:bg-red-500/10"
                                      >
                                        <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                                      </Button>
                                    </>
                                  )}

                                  {status === 'shipped' && (
                                    <>
                                      <Button
                                        onClick={() => handleDeliverOrder(order)}
                                        className="flex-1 sm:flex-initial h-9 px-4 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white"
                                      >
                                        <PackageCheck className="w-3.5 h-3.5 mr-1.5" /> Mark Delivered
                                      </Button>
                                      <Button
                                        onClick={() => handleOpenShipModal(order)}
                                        variant="outline"
                                        className="h-9 px-3 text-[10px] font-black uppercase tracking-wider border-white/20 hover:bg-white/10 text-purple-300"
                                      >
                                        <Clock className="w-3.5 h-3.5 mr-1" /> Update ETA
                                      </Button>
                                    </>
                                  )}

                                  {status === 'delivered' && (
                                    <div className="flex items-center gap-1.5 text-xs font-black text-emerald-400 uppercase py-1.5 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                      <CheckCircle2 className="w-4 h-4" /> Delivered & Completed
                                    </div>
                                  )}

                                  {status === 'cancelled' && (
                                    <div className="flex items-center gap-1.5 text-xs font-black text-red-400 uppercase py-1.5 px-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                      <XCircle className="w-4 h-4" /> Order Cancelled
                                    </div>
                                  )}

                                  <Button
                                    onClick={() => toggleOrderExpand(order.id)}
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-white"
                                  >
                                    <ChevronUp className="w-3.5 h-3.5 mr-1" /> Close Drawer
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  );
                })}

                {displayedOrders.length === 0 && (
                  <div className="glass-card p-12 text-center border-white/5 space-y-3">
                    <Truck className="w-12 h-12 text-muted-foreground mx-auto opacity-30" />
                    <p className="text-sm font-bold uppercase text-white">No Orders Found</p>
                    <p className="text-xs text-muted-foreground">
                      {orderSearchQuery || orderStatusFilter !== 'all'
                        ? 'No orders matched your active filters or search criteria.'
                        : 'New customer snack orders will appear here in real-time.'}
                    </p>
                    {(orderSearchQuery || orderStatusFilter !== 'all') && (
                      <Button
                        onClick={() => {
                          setOrderStatusFilter('all');
                          setOrderSearchQuery('');
                        }}
                        variant="outline"
                        className="text-[10px] font-black uppercase tracking-wider h-8"
                      >
                        Reset Filters
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeSubTab === 'products' && (
            <motion.div 
              key="products"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {isUserAdmin ? 'Vendor Products (Admin View)' : 'My Live Products List'}
                  </h3>
                  {isUserAdmin && (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[8px] font-black uppercase tracking-wider">
                      Admin
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
                  {isUserAdmin && (
                    <VendorFilterCustomDropdown
                      selectedVendor={selectedVendorFilter}
                      onSelectVendor={setSelectedVendorFilter}
                      vendors={adminVendors}
                      totalAllCount={allProducts.length}
                      countLabel="products"
                      getItemCount={(vid) => allProducts.filter(p => p.vendorId === vid).length}
                      currentUserId={user?.uid}
                      className="w-full sm:w-auto"
                    />
                  )}
                  <Button onClick={() => openProductModal()} className="text-[10px] sm:text-xs font-black uppercase tracking-widest h-9 sm:h-10 gradient-bg ml-auto sm:ml-0">
                    <Plus className="w-4 h-4 mr-1.5" /> Add Product Detail
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
                {displayedProducts.map(p => (
                  <Card key={p.id} className="glass-card border-white/10 overflow-hidden group flex flex-col h-full">
                    <div className="relative aspect-video bg-black/40 overflow-hidden flex items-center justify-center border-b border-white/10">
                      {p.image ? (
                        <img src={p.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={p.name} />
                      ) : (
                        <Store className="w-10 h-10 text-muted-foreground opacity-50" />
                      )}
                      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end sm:flex-row sm:top-3 sm:right-3">
                        {isUserAdmin && (
                          <Badge variant="outline" className="text-[7px] sm:text-[8px] font-black uppercase tracking-wider border-amber-500/30 text-amber-300 bg-black/70 backdrop-blur-md px-1 py-0.5">
                            {adminVendors.find(v => v.id === p.vendorId)?.name || p.vendorId}
                          </Badge>
                        )}
                        <Badge 
                          variant={p.stockStatus === 'in_stock' || (p.stockStatus === undefined && p.available !== false) ? 'default' : p.stockStatus === 'restocking' ? 'secondary' : 'destructive'} 
                          className="text-[7px] sm:text-[8px] font-black uppercase tracking-wider px-1 py-0.5"
                        >
                          {p.stockStatus === 'in_stock' || (p.stockStatus === undefined && p.available !== false) ? 'In Stock' : p.stockStatus === 'restocking' ? 'Restocking' : 'Out'}
                        </Badge>
                        <Badge variant="outline" className="text-[7px] sm:text-[8px] font-black uppercase tracking-wider border-white/10 bg-black/60 backdrop-blur-md px-1 py-0.5">
                          {p.category}
                        </Badge>
                      </div>
                    </div>
                    <div className="p-3 md:p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <h4 className="text-xs md:text-sm font-bold text-white truncate uppercase tracking-tight">{p.name}</h4>
                        <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-2 mt-1 h-6 md:h-8">{p.description || 'No description available.'}</p>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        <div className="flex flex-col">
                          <span className="text-sm md:text-base lg:text-lg font-black text-emerald-400">₦{p.price.toLocaleString()}</span>
                          {p.slashPrice && (
                            <span className="text-[9px] md:text-[10px] text-muted-foreground line-through">₦{p.slashPrice.toLocaleString()}</span>
                          )}
                        </div>
                        <div className="flex gap-1.5 w-full">
                          <button 
                            onClick={() => openProductModal(p)}
                            className="flex-1 p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-white active:scale-95 flex items-center justify-center"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => promptDeleteProduct(p.id, p.name, p.image)}
                            className="flex-1 p-2 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all text-red-400 active:scale-95 flex items-center justify-center"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                {displayedProducts.length === 0 && (
                  <div className="col-span-full py-16 text-center space-y-2">
                    <Store className="w-12 h-12 text-muted-foreground mx-auto opacity-30" />
                    <p className="text-sm font-bold uppercase text-muted-foreground">
                      {selectedVendorFilter !== 'all' ? 'No Products For This Vendor' : 'No Products Uploaded'}
                    </p>
                    <p className="text-xs text-muted-foreground opacity-60">Upload products so they can show in the Cinema store.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* DEDICATED TRANSACTIONS ACTIVITY TAB */}
          {activeSubTab === 'transactions' && (
            <motion.div 
              key="transactions"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* Header & Controls */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-400" /> Store Sales & Financial Activity Log
                  </h3>
                  <p className="text-[9px] sm:text-xs text-muted-foreground uppercase font-medium mt-0.5">
                    Real-time ledger of incoming store sales, customer orders, platform commission, and payout settlements
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                  {/* Admin Vendor Filter */}
                  {isUserAdmin && (
                    <VendorFilterCustomDropdown
                      selectedVendor={selectedVendorFilter}
                      onSelectVendor={setSelectedVendorFilter}
                      vendors={adminVendors}
                      totalAllCount={history.length}
                      countLabel="logs"
                      getItemCount={(vid) => history.filter(h => h.vendorId === vid).length}
                      currentUserId={user?.uid}
                      className="w-full sm:w-auto"
                    />
                  )}

                  {/* Search box */}
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search order #, customer, ID..."
                      value={txSearchQuery}
                      onChange={(e) => setTxSearchQuery(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 font-medium"
                    />
                    {txSearchQuery && (
                      <button 
                        type="button" 
                        onClick={() => setTxSearchQuery('')} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Transactions Metrics Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="glass-card p-3.5 border-white/5 space-y-1">
                  <span className="text-[8px] sm:text-[9px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                    <ArrowDownLeft className="w-3 h-3 text-emerald-400" /> Sales Volume (Gross)
                  </span>
                  <p className="text-sm sm:text-base font-black text-white">₦{computedStats.totalRevenue.toLocaleString()}</p>
                  <p className="text-[8px] text-muted-foreground uppercase font-mono">100% total sales</p>
                </Card>

                <Card className="glass-card p-3.5 border-white/5 space-y-1">
                  <span className="text-[8px] sm:text-[9px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                    <Percent className="w-3 h-3 text-amber-400" /> Net Credited (70%)
                  </span>
                  <p className="text-sm sm:text-base font-black text-amber-400">₦{computedStats.totalEarnings.toLocaleString()}</p>
                  <p className="text-[8px] text-muted-foreground uppercase font-mono">Credited to wallet</p>
                </Card>

                <Card className="glass-card p-3.5 border-white/5 space-y-1">
                  <span className="text-[8px] sm:text-[9px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                    <Building className="w-3 h-3 text-indigo-400" /> Platform Fee (30%)
                  </span>
                  <p className="text-sm sm:text-base font-black text-indigo-300">₦{computedStats.totalFees.toLocaleString()}</p>
                  <p className="text-[8px] text-muted-foreground uppercase font-mono">StreamAura fee cut</p>
                </Card>

                <Card className="glass-card p-3.5 border-white/5 space-y-1">
                  <span className="text-[8px] sm:text-[9px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3 text-orange-400" /> Total Cash Outs
                  </span>
                  <p className="text-sm sm:text-base font-black text-orange-400">
                    ₦{payouts.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString()}
                  </p>
                  <p className="text-[8px] text-muted-foreground uppercase font-mono">{payouts.length} payout requests</p>
                </Card>
              </div>

              {/* Activity Type Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { id: 'all', label: 'All Activities', count: history.length },
                  { id: 'sale', label: 'Store Sales (70%)', count: history.filter(h => h.type === 'sale').length },
                  { id: 'withdrawal', label: 'Payout Settlements', count: history.filter(h => h.type === 'withdrawal').length }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setTxTypeFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 border ${
                      txTypeFilter === tab.id
                        ? 'bg-primary text-black border-primary font-black shadow-lg shadow-primary/20'
                        : 'bg-white/5 border-white/10 text-muted-foreground hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${txTypeFilter === tab.id ? 'bg-black/20 text-black' : 'bg-white/10 text-white'}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="glass-card overflow-hidden border-white/5 hidden md:block">
                <div className="p-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/10 text-[9px] uppercase font-black text-muted-foreground tracking-widest">
                        <th className="py-3 px-4">Ref / Order #</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Net Amount</th>
                        <th className="py-3 px-4">Gross Breakdown</th>
                        <th className="py-3 px-4">Activity Details</th>
                        <th className="py-3 px-4">Date & Time</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {displayedTransactions.map((item) => {
                        const isSale = item.type === 'sale';
                        const refCode = item.orderNumber ? `#${item.orderNumber}` : item.id.substring(0, 10).toUpperCase();

                        return (
                          <tr key={item.id} className="hover:bg-white/[0.02] text-xs font-bold uppercase tracking-tight transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-amber-400">
                                <span>{refCode}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(item.orderNumber || item.id);
                                    toast.success(`Copied ${refCode}`);
                                  }}
                                  className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white"
                                  title="Copy"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <Badge 
                                variant={isSale ? 'default' : 'secondary'} 
                                className={`text-[8px] font-black uppercase tracking-widest ${isSale ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30'}`}
                              >
                                {isSale ? 'Sale Earning (70%)' : 'Settlement Payout'}
                              </Badge>
                            </td>

                            <td className={`py-3.5 px-4 font-black font-mono text-sm ${isSale ? 'text-emerald-400' : 'text-orange-400'}`}>
                              {isSale ? `+₦${item.amount.toLocaleString()}` : `-₦${item.amount.toLocaleString()}`}
                            </td>

                            <td className="py-3.5 px-4 text-[10px] font-mono text-muted-foreground">
                              {isSale ? (
                                <div className="space-y-0.5">
                                  <div>Gross: <span className="text-white font-bold">₦{(item.grossAmount || item.amount).toLocaleString()}</span></div>
                                  <div>Fee (30%): <span className="text-indigo-300">-₦{(item.platformFee || 0).toLocaleString()}</span></div>
                                </div>
                              ) : (
                                <div>Fee: <span className="text-muted-foreground">₦{(item.feeAmount || 0).toLocaleString()}</span></div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 max-w-xs truncate text-muted-foreground text-[11px]">
                              {item.customerName && <span className="text-white font-bold block truncate">{item.customerName}</span>}
                              <span className="truncate block">{item.description}</span>
                            </td>

                            <td className="py-3.5 px-4 text-muted-foreground text-[10px] font-mono whitespace-nowrap">
                              {item.date.toLocaleString()}
                            </td>

                            <td className="py-3.5 px-4">
                              <Badge 
                                variant={item.status === 'completed' || item.status === 'delivered' ? 'default' : item.status === 'pending' ? 'secondary' : 'destructive'} 
                                className="text-[8px] font-black uppercase"
                              >
                                {item.status}
                              </Badge>
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedTxDetail(item)}
                                className="h-7 px-2 text-[10px] font-black uppercase text-primary hover:bg-primary/10"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" /> View
                              </Button>
                            </td>
                          </tr>
                        );
                      })}

                      {displayedTransactions.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-16 text-center space-y-2">
                            <Receipt className="w-10 h-10 text-muted-foreground mx-auto opacity-30" />
                            <p className="text-xs uppercase font-bold text-muted-foreground">No transaction records found</p>
                            <p className="text-[10px] text-muted-foreground/60">
                              {txSearchQuery || txTypeFilter !== 'all' ? 'Try clearing your search filters' : 'Incoming snack store sales will automatically show here.'}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card Feed View */}
              <div className="space-y-3 md:hidden">
                {displayedTransactions.map((item) => {
                  const isSale = item.type === 'sale';
                  const refCode = item.orderNumber ? `#${item.orderNumber}` : item.id.substring(0, 10).toUpperCase();

                  return (
                    <Card 
                      key={item.id} 
                      onClick={() => setSelectedTxDetail(item)}
                      className="glass-card p-4 border-white/5 space-y-3 text-left active:scale-[0.99] transition-transform cursor-pointer"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-amber-400">
                          <span>{refCode}</span>
                          <Badge 
                            variant={isSale ? 'default' : 'secondary'} 
                            className={`text-[7px] font-black uppercase tracking-widest px-1 py-0.2 ${isSale ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}`}
                          >
                            {isSale ? '70% Sale' : 'Payout'}
                          </Badge>
                        </div>
                        <Badge 
                          variant={item.status === 'completed' || item.status === 'delivered' ? 'default' : item.status === 'pending' ? 'secondary' : 'destructive'} 
                          className="text-[8px] font-black uppercase"
                        >
                          {item.status}
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        {item.customerName && (
                          <p className="text-xs font-bold text-white uppercase">{item.customerName}</p>
                        )}
                        <p className="text-[11px] text-white/90 leading-tight line-clamp-2">{item.description}</p>
                        <p className="text-[9px] text-muted-foreground font-mono">{item.date.toLocaleString()}</p>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-white/5 text-[10px]">
                        <div className="text-muted-foreground font-mono">
                          {isSale ? `Gross: ₦${(item.grossAmount || item.amount).toLocaleString()}` : (item.bankName || 'Bank')}
                        </div>
                        <div className={`text-sm font-black font-mono ${isSale ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {isSale ? `+₦${item.amount.toLocaleString()}` : `-₦${item.amount.toLocaleString()}`}
                        </div>
                      </div>
                    </Card>
                  );
                })}

                {displayedTransactions.length === 0 && (
                  <div className="p-8 text-center space-y-2 glass-card border-white/5">
                    <Receipt className="w-10 h-10 text-muted-foreground mx-auto opacity-30" />
                    <p className="text-xs uppercase font-bold text-muted-foreground">No transactions found</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeSubTab === 'payout' && (
            <motion.div 
              key="payouts"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest text-white">
                    Vendor Payouts & Settlement Account
                  </h3>
                  <p className="text-[9px] sm:text-xs text-muted-foreground uppercase font-black mt-0.5">
                    Configure your bank account and withdraw earned store revenue
                  </p>
                </div>
                <Button onClick={handleOpenWithdrawModal} className="text-[10px] sm:text-xs font-black uppercase tracking-widest h-9 sm:h-10 gradient-bg">
                  <Banknote className="w-4 h-4 mr-1.5" /> Cash Out Earning
                </Button>
              </div>

              {/* Payout Destination Bank Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <Card className="glass-card p-5 border-white/5 space-y-4">
                  <div className="flex justify-between items-center border-b border-white/5 pb-3">
                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-indigo-400" /> Configured Payout Destination
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTempBankDetails({
                          account: bankDetails.accountNumber,
                          bankName: bankDetails.bankName,
                          bankCode: bankDetails.bankCode,
                          name: bankDetails.accountName
                        });
                        setBankSearch(bankDetails.bankName);
                        setIsEditingBank(true);
                        setIsWithdrawModalOpen(true);
                      }}
                      className="text-[9px] font-black uppercase text-primary hover:underline"
                    >
                      {bankDetails.accountNumber ? 'Change Bank' : 'Setup Bank'}
                    </button>
                  </div>

                  {bankDetails.accountNumber ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                          <Building className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white uppercase">{bankDetails.bankName}</h4>
                          <p className="text-xs font-mono text-muted-foreground">Account: {bankDetails.accountNumber}</p>
                        </div>
                      </div>
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase">
                        <UserCheck className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{bankDetails.accountName}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center space-y-2">
                      <AlertCircle className="w-8 h-8 text-amber-400 mx-auto opacity-70" />
                      <p className="text-xs font-bold uppercase text-white">No Bank Account Configured</p>
                      <p className="text-[10px] text-muted-foreground">Add your Nigerian bank details to receive automated earnings withdrawals.</p>
                      <Button
                        onClick={() => {
                          setIsEditingBank(true);
                          setIsWithdrawModalOpen(true);
                        }}
                        className="text-[10px] font-black uppercase tracking-wider h-8 gradient-bg mt-2"
                      >
                        Setup Bank Account
                      </Button>
                    </div>
                  )}
                </Card>

                <Card className="glass-card p-5 border-white/5 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-400" /> Store Withdrawable Balance
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-black text-emerald-400">
                      ₦{computedStats.availableBalance.toLocaleString()}
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase font-black">
                      Store sales earnings • 0% withdrawal fee
                    </p>
                  </div>
                  <Button 
                    onClick={handleOpenWithdrawModal} 
                    className="w-full h-10 text-xs font-black uppercase tracking-widest gradient-bg"
                    disabled={computedStats.availableBalance <= 0}
                  >
                    Request Payout
                  </Button>
                </Card>
              </div>

              {/* Payouts History */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Withdrawal History ({payouts.length})
                </h4>

                <div className="glass-card overflow-hidden border-white/5 hidden md:block">
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-white/10 text-[9px] uppercase font-black text-muted-foreground tracking-widest">
                          <th className="py-3 px-4">Request ID</th>
                          <th className="py-3 px-4">Requested Amount</th>
                          <th className="py-3 px-4">Fee (0%)</th>
                          <th className="py-3 px-4">Net Payout</th>
                          <th className="py-3 px-4">Bank Destination</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {payouts.map(p => (
                          <tr key={p.id} className="hover:bg-white/[0.01] text-xs font-bold uppercase tracking-tight">
                            <td className="py-3.5 px-4 font-mono text-[10px] text-muted-foreground">{p.id.substring(0, 10)}...</td>
                            <td className="py-3.5 px-4 font-black text-white">₦{p.amount.toLocaleString()}</td>
                            <td className="py-3.5 px-4 text-muted-foreground font-mono text-[11px]">₦{(p.fee_amount !== undefined ? p.fee_amount : (p.type === 'vendor' ? 0 : p.amount * 0.05)).toLocaleString()}</td>
                            <td className="py-3.5 px-4 font-black text-emerald-400">₦{(p.payout_amount !== undefined ? p.payout_amount : (p.type === 'vendor' ? p.amount : p.amount * 0.95)).toLocaleString()}</td>
                            <td className="py-3.5 px-4 text-muted-foreground text-[11px]">
                              {p.bank_name} • {p.account_number}
                            </td>
                            <td className="py-3.5 px-4 text-muted-foreground text-[10px] font-mono">
                              {p.created_at?.toDate ? p.created_at.toDate().toLocaleString() : 'Recent'}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <Badge 
                                variant={p.status === 'completed' || p.status === 'approved' ? 'default' : p.status === 'pending' ? 'secondary' : 'destructive'} 
                                className="text-[8px] font-black uppercase"
                              >
                                {p.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                        {payouts.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-muted-foreground italic">
                              No withdrawal requests submitted yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 md:hidden">
                  {payouts.map(p => (
                    <Card key={p.id} className="glass-card p-4 border-white/5 space-y-2 text-left">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono text-muted-foreground">ID: {p.id.substring(0, 10)}...</span>
                        <Badge 
                          variant={p.status === 'completed' || p.status === 'approved' ? 'default' : p.status === 'pending' ? 'secondary' : 'destructive'} 
                          className="text-[8px] font-black uppercase"
                        >
                          {p.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-xs font-bold text-white uppercase">{p.bank_name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">No. {p.account_number}</p>
                          <p className="text-[9px] text-muted-foreground font-mono mt-1">
                            {p.created_at?.toDate ? p.created_at.toDate().toLocaleString() : 'Recent'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-400 font-mono">₦{p.amount.toLocaleString()}</p>
                          <p className="text-[8px] text-muted-foreground">Fee: ₦{(p.fee_amount !== undefined ? p.fee_amount : (p.type === 'vendor' ? 0 : p.amount * 0.05)).toLocaleString()}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {payouts.length === 0 && (
                    <p className="text-xs text-muted-foreground italic text-center py-6">
                      No withdrawal requests submitted yet.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Product Upload/Edit Modal */}
      <AnimatePresence>
        {isProductModalOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
            onClick={() => setIsProductModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg glass-card border-white/15 p-4 sm:p-6 space-y-4 sm:space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3 sm:pb-4">
                <h3 className="text-sm sm:text-base font-black uppercase tracking-widest text-white">
                  {editingProduct ? 'Edit Product details' : 'Upload New Product'}
                </h3>
                <button onClick={() => setIsProductModalOpen(false)} className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-3 sm:space-y-4 text-left">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Product Name</label>
                    <input 
                      required
                      type="text"
                      placeholder="e.g. Caramel Popcorn"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-primary/50"
                      value={productForm.name}
                      onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Category</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {[
                        { id: 'snack', label: '🍿 Popcorn & Snacks' },
                        { id: 'drink', label: '🥤 Chilled Drinks' },
                        { id: 'combo', label: '🍱 Combo Deals' },
                        { id: 'candy', label: '🍬 Sweets & Candies' }
                      ].map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setProductForm({ ...productForm, category: cat.id })}
                          className={`p-2 sm:p-2.5 rounded-xl text-[10px] sm:text-[11px] font-bold text-center transition-all border ${
                            productForm.category === cat.id
                              ? 'bg-primary/20 text-primary border-primary/50 shadow-md font-black'
                              : 'bg-white/5 border-white/10 text-muted-foreground hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Price (₦)</label>
                    <input 
                      required
                      type="number"
                      placeholder="e.g. 2500"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-primary/50"
                      value={productForm.price}
                      onChange={e => setProductForm({ ...productForm, price: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Slash Price (₦ - Optional)</label>
                    <input 
                      type="number"
                      placeholder="e.g. 3500"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-primary/50"
                      value={productForm.slashPrice}
                      onChange={e => setProductForm({ ...productForm, slashPrice: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Product Description</label>
                  <textarea 
                    placeholder="Provide short details about packaging, size, flavor..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-primary/50 h-20 resize-none"
                    value={productForm.description}
                    onChange={e => setProductForm({ ...productForm, description: e.target.value })}
                  />
                </div>

                {/* Cover Image Upload & Remove */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">
                      Product Picture / Image
                    </label>
                    {productForm.image && (
                      <button
                        type="button"
                        onClick={handleRemoveProductImage}
                        className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                      >
                        <Trash2 className="w-3 h-3" /> Remove Picture
                      </button>
                    )}
                  </div>

                  {productForm.image ? (
                    <div className="relative rounded-2xl border border-white/10 overflow-hidden bg-black/40 p-2.5 flex items-center gap-3.5 group">
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-black/60 border border-white/10 flex-shrink-0">
                        <img 
                          src={productForm.image} 
                          alt="Product preview" 
                          className="w-full h-full object-cover" 
                        />
                        <button
                          type="button"
                          onClick={handleRemoveProductImage}
                          className="absolute top-1 right-1 p-1 rounded-lg bg-black/75 hover:bg-rose-600 text-white transition-all shadow-md"
                          title="Remove picture"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Image Attached</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate font-mono">
                          {productForm.image.split('/').pop() || 'product_image.jpg'}
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          <label 
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[10px] font-black uppercase tracking-wider cursor-pointer border border-white/10 transition-all active:scale-95"
                          >
                            <Upload className="w-3 h-3" />
                            <span>Change Picture</span>
                            <input 
                              ref={productImageInputRef}
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={handleImageChange}
                              disabled={isUploadingImage}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleRemoveProductImage}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase tracking-wider transition-all"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 hover:border-primary/50 rounded-2xl cursor-pointer hover:bg-white/[0.02] transition-all group">
                      <div className="flex flex-col items-center justify-center text-center space-y-2">
                        {isUploadingImage ? (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-primary">Uploading Image...</span>
                          </div>
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-xl bg-white/5 group-hover:bg-primary/10 text-muted-foreground group-hover:text-primary flex items-center justify-center border border-white/10 transition-colors">
                              <Upload className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-black uppercase tracking-wide text-white">Click to upload product image</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">Supports PNG, JPG, WEBP (Max 5MB)</p>
                            </div>
                          </>
                        )}
                      </div>
                      <input 
                        ref={productImageInputRef}
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleImageChange}
                        disabled={isUploadingImage}
                      />
                    </label>
                  )}
                </div>

                <div className="space-y-1.5 py-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Stock Status</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'in_stock', label: 'In Stock', activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/30' },
                      { id: 'restocking', label: 'Restocking', activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30' },
                      { id: 'out_of_stock', label: 'Out of Stock', activeClass: 'bg-red-500/20 text-red-300 border-red-500/40 ring-1 ring-red-500/30' }
                    ].map(st => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setProductForm({ ...productForm, stockStatus: st.id as any })}
                        className={`py-2.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-center transition-all border ${
                          productForm.stockStatus === st.id
                            ? `${st.activeClass} shadow-md`
                            : 'bg-white/5 border-white/10 text-muted-foreground hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-3 sm:pt-4 border-t border-white/5">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1 h-10 sm:h-12 rounded-xl text-[10px] sm:text-xs font-black uppercase"
                    onClick={() => setIsProductModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isSavingProduct || isUploadingImage}
                    className="flex-1 h-10 sm:h-12 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest gradient-bg"
                  >
                    {isSavingProduct ? <Loader2 className="w-4.5 h-4.5 animate-spin mx-auto" /> : editingProduct ? 'Save' : 'Upload'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Withdrawal Modal */}
      <AnimatePresence>
        {isWithdrawModalOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
            onClick={handleCloseWithdrawModal}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm glass-card border-white/15 p-4 sm:p-6 space-y-4 sm:space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3 sm:pb-4">
                <h3 className="text-sm sm:text-base font-black uppercase tracking-widest text-white flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-emerald-400" /> Request Settlement
                </h3>
                <button onClick={handleCloseWithdrawModal} className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {(!bankDetails.accountNumber || isEditingBank) ? (
                <div className="p-3.5 sm:p-4 bg-white/5 border border-white/10 rounded-2xl text-left space-y-3.5">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black uppercase text-primary tracking-widest">Configure Bank Account</p>
                    {bankDetails.accountNumber && (
                      <button 
                        type="button" 
                        onClick={handleCancelBankEdit}
                        className="text-[9px] font-black uppercase text-muted-foreground hover:text-white"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Account Number (10 Digits)</label>
                    <div className="relative">
                      <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input 
                        type="text"
                        inputMode="numeric"
                        placeholder="0123456789"
                        value={tempBankDetails.account}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                          setTempBankDetails(prev => ({
                            ...prev,
                            account: val,
                            name: val.length !== 10 || val !== prev.account ? '' : prev.name
                          }));
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-xs font-bold text-white outline-none focus:border-primary/50"
                      />
                      {isResolvingBank && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 relative" ref={bankDropdownRef}>
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Select Bank</label>
                    <div className="relative">
                      <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input 
                        type="text"
                        placeholder="Search bank name..."
                        value={bankSearch || tempBankDetails.bankName}
                        onFocus={() => setShowBankDropdown(true)}
                        onChange={e => {
                          setBankSearch(e.target.value);
                          setTempBankDetails(prev => ({ ...prev, bankName: e.target.value, bankCode: '', name: '' }));
                          setShowBankDropdown(true);
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-12 text-xs font-bold text-white outline-none focus:border-primary/50"
                      />
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {(bankSearch || tempBankDetails.bankName) && (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBankSearch('');
                              setTempBankDetails(prev => ({ ...prev, bankName: '', bankCode: '', name: '' }));
                            }}
                            className="p-1 hover:bg-white/10 rounded-full text-muted-foreground hover:text-white transition-colors"
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
                          className="p-1 hover:bg-white/10 rounded-full text-muted-foreground hover:text-white transition-colors"
                        >
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBankDropdown ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {showBankDropdown && (
                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute z-[110] left-0 right-0 top-full mt-1.5 max-h-44 overflow-y-auto bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl custom-scrollbar">
                          {filteredBanks.map((bank, i) => (
                            <button 
                              key={`${bank.code}-${i}`} 
                              type="button"
                              onClick={() => handleSelectBank(bank)} 
                              className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-white/90 hover:bg-primary/10 hover:text-primary transition-colors border-b border-white/5 last:border-0 flex items-center gap-2.5"
                            >
                              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[8px] font-black uppercase shrink-0 overflow-hidden">
                                {bank.slug ? (
                                  <img src={`https://raw.githubusercontent.com/iam-kevin/nigerian-banks-logos/master/logos/${bank.slug}.png`} alt="" onError={(e) => (e.target as any).style.display='none'} />
                                ) : bank.name.substring(0, 2)}
                              </div>
                              <span className="truncate">{bank.name}</span>
                            </button>
                          ))}
                          {filteredBanks.length === 0 && <div className="p-3 text-center text-[9px] font-black text-white/30 uppercase tracking-widest">No banks found</div>}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Account Name</label>
                    <div className="relative">
                      <input 
                        readOnly 
                        placeholder={isResolvingBank ? 'Verifying account...' : 'Account holder name'}
                        value={tempBankDetails.name}
                        className="w-full bg-white/[0.02] border border-white/10 rounded-xl py-2.5 pl-3.5 pr-9 text-xs font-black uppercase text-emerald-400 cursor-not-allowed"
                      />
                      {tempBankDetails.name && !isResolvingBank && (
                        <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                  </div>

                  <Button 
                    type="button"
                    onClick={handleSaveBankDetails}
                    disabled={isSavingBankSettings || !tempBankDetails.name || !tempBankDetails.bankName || !tempBankDetails.bankCode || tempBankDetails.account.length !== 10 || isResolvingBank}
                    className="w-full h-10 rounded-xl text-[10px] font-black uppercase tracking-widest gradient-bg disabled:opacity-50"
                  >
                    {isSavingBankSettings ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save & Verify Bank'}
                  </Button>
                </div>
              ) : (
                <div className="p-3 sm:p-4 bg-white/5 border border-white/5 rounded-xl text-left space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground">Payout Destination</p>
                    <button 
                      type="button" 
                      onClick={() => {
                        setTempBankDetails({
                          account: bankDetails.accountNumber,
                          bankName: bankDetails.bankName,
                          bankCode: bankDetails.bankCode,
                          name: bankDetails.accountName
                        });
                        setBankSearch(bankDetails.bankName);
                        setIsEditingBank(true);
                      }}
                      className="text-[9px] font-black uppercase text-primary hover:underline"
                    >
                      Edit Bank
                    </button>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white uppercase">{bankDetails.bankName}</p>
                    <p className="text-[9px] text-muted-foreground uppercase font-black">No. {bankDetails.accountNumber}</p>
                    <p className="text-[9px] text-emerald-400 font-bold uppercase">{bankDetails.accountName}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleRequestWithdrawal} className="space-y-3 sm:space-y-4 text-left">
                <div className="space-y-1">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Amount to Withdraw</label>
                    <span className="text-[9px] text-primary font-black uppercase">Max: ₦{computedStats.availableBalance.toLocaleString()}</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-white">₦</span>
                    <input 
                      required
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 sm:py-3.5 pl-9 pr-4 text-base sm:text-lg font-black text-white outline-none focus:border-primary/50"
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    />
                  </div>
                </div>

                {/* 0% Fee Guarantee Banner */}
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5 text-left">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black uppercase text-emerald-300 tracking-wider">0% Additional Fee</p>
                    <p className="text-[8.5px] text-muted-foreground uppercase font-bold leading-tight">
                      You receive 100% of your withdrawn amount. Platform fee (30%) was already settled on purchase.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-3 sm:pt-4 border-t border-white/5">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1 h-10 sm:h-12 rounded-xl text-[10px] sm:text-xs font-black uppercase"
                    onClick={handleCloseWithdrawModal}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isSubmittingWithdrawal || !bankDetails.accountNumber || !bankDetails.bankName || !bankDetails.accountName || !bankDetails.bankCode || bankDetails.accountNumber.length !== 10}
                    className="flex-1 h-10 sm:h-12 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest gradient-bg disabled:opacity-50"
                  >
                    {isSubmittingWithdrawal ? <Loader2 className="w-4.5 h-4.5 animate-spin mx-auto" /> : 'Confirm'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* In-App Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModalState.isOpen && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4"
            onClick={() => !isDeletingProduct && setDeleteModalState(prev => ({ ...prev, isOpen: false }))}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm glass-card border-white/15 p-5 sm:p-6 space-y-5 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
                <Trash2 className="w-6 h-6" />
              </div>

              <div className="space-y-2">
                <h3 className="text-base sm:text-lg font-black uppercase text-white tracking-wide">
                  Delete Product
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Are you sure you want to permanently delete <span className="font-bold text-white">"{deleteModalState.productName}"</span>? This will remove it from the Cinema Snack Store and Cloudflare storage.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  disabled={isDeletingProduct}
                  className="flex-1 h-10 sm:h-11 rounded-xl text-[10px] sm:text-xs font-black uppercase"
                  onClick={() => setDeleteModalState(prev => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  disabled={isDeletingProduct}
                  onClick={handleConfirmDeleteProduct}
                  className="flex-1 h-10 sm:h-11 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white font-black"
                >
                  {isDeletingProduct ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Shipping ETA Modal */}
      <AnimatePresence>
        {shippingModal.isOpen && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-[1000] flex items-center justify-center p-4"
            onClick={() => !shippingModal.isSubmitting && setShippingModal(prev => ({ ...prev, isOpen: false }))}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md glass-card border-white/15 p-5 sm:p-6 space-y-5 text-left shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                      Dispatch Order #{shippingModal.orderNumber}
                    </h3>
                    <p className="text-[9px] text-muted-foreground uppercase font-black">
                      Set delivery arrival estimate for customer
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => !shippingModal.isSubmitting && setShippingModal(prev => ({ ...prev, isOpen: false }))} 
                  className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmShipOrder} className="space-y-4">
                {/* Quick Presets */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                    Quick Delivery Presets
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {['15 mins', '30 mins', '45 mins', '1 hour', '2 hours'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setShippingModal(prev => ({ ...prev, eta: preset }))}
                        className={`py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                          shippingModal.eta === preset
                            ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/30'
                            : 'bg-white/5 border-white/10 text-muted-foreground hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom ETA input */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                    Custom Arrival Estimate
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                    <input
                      type="text"
                      placeholder="e.g. 20-30 mins, Today by 5:30 PM..."
                      value={shippingModal.eta}
                      onChange={e => setShippingModal(prev => ({ ...prev, eta: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-white outline-none focus:border-purple-500/50"
                      required
                    />
                  </div>
                </div>

                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-[10px] text-purple-300/90 leading-relaxed">
                  💡 When confirmed, this order will be marked <span className="font-bold text-white">Out for Delivery</span>. The customer will receive an immediate in-app notification with this ETA, and the Telegram bot group will be synchronized.
                </div>

                <div className="flex gap-3 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    disabled={shippingModal.isSubmitting}
                    className="flex-1 h-10 sm:h-11 rounded-xl text-[10px] sm:text-xs font-black uppercase"
                    onClick={() => setShippingModal(prev => ({ ...prev, isOpen: false }))}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={shippingModal.isSubmitting || !shippingModal.eta.trim()}
                    className="flex-1 h-10 sm:h-11 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white font-black"
                  >
                    {shippingModal.isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                      'Confirm & Ship'
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Details Modal */}
      <AnimatePresence>
        {selectedTxDetail && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-[1000] flex items-center justify-center p-4"
            onClick={() => setSelectedTxDetail(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg glass-card border-white/15 p-5 sm:p-6 space-y-5 text-left shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${selectedTxDetail.type === 'sale' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'}`}>
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                      {selectedTxDetail.type === 'sale' ? 'Store Sales Receipt' : 'Payout Settlement'}
                    </h3>
                    <p className="text-[9px] text-muted-foreground uppercase font-mono">
                      Ref: {selectedTxDetail.orderNumber ? `#${selectedTxDetail.orderNumber}` : selectedTxDetail.id}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedTxDetail(null)} 
                  className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Amount Highlight */}
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex justify-between items-center">
                <div>
                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">
                    {selectedTxDetail.type === 'sale' ? 'Net Vendor Share Credited' : 'Withdrawal Amount'}
                  </span>
                  <p className={`text-2xl sm:text-3xl font-black font-mono mt-0.5 ${selectedTxDetail.type === 'sale' ? 'text-emerald-400' : 'text-orange-400'}`}>
                    {selectedTxDetail.type === 'sale' ? `+₦${selectedTxDetail.amount.toLocaleString()}` : `-₦${selectedTxDetail.amount.toLocaleString()}`}
                  </p>
                </div>
                <Badge 
                  variant={selectedTxDetail.status === 'completed' || selectedTxDetail.status === 'delivered' || selectedTxDetail.status === 'approved' ? 'default' : selectedTxDetail.status === 'pending' ? 'secondary' : 'destructive'} 
                  className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1"
                >
                  {selectedTxDetail.status}
                </Badge>
              </div>

              {/* Financial Breakdown (Sales) */}
              {selectedTxDetail.type === 'sale' && (
                <div className="space-y-3">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    Revenue & Commission Split
                  </h4>
                  <div className="p-3.5 bg-black/40 border border-white/5 rounded-xl space-y-2 text-xs">
                    <div className="flex justify-between items-center text-white">
                      <span className="text-muted-foreground uppercase text-[10px]">Gross Order Total (100%):</span>
                      <span className="font-bold font-mono">₦{(selectedTxDetail.grossAmount || selectedTxDetail.amount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-indigo-300">
                      <span className="uppercase text-[10px]">StreamAura Platform Commission (30%):</span>
                      <span className="font-bold font-mono">-₦{(selectedTxDetail.platformFee || ((selectedTxDetail.grossAmount || selectedTxDetail.amount) * 0.3)).toLocaleString()}</span>
                    </div>
                    <div className="border-t border-white/5 pt-2 flex justify-between items-center text-emerald-400 font-bold">
                      <span className="uppercase text-[10px]">Net Credited to Vendor (70%):</span>
                      <span className="font-black font-mono">₦{selectedTxDetail.amount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Order Items (Sales) */}
              {selectedTxDetail.items && selectedTxDetail.items.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    Ordered Snack Items ({selectedTxDetail.items.length})
                  </h4>
                  <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-black/20 text-xs">
                    {selectedTxDetail.items.map((it: any, idx: number) => (
                      <div key={idx} className="p-2.5 flex justify-between items-center">
                        <div className="flex items-center gap-2.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-amber-500" />
                          <span className="font-bold text-white uppercase">{it.name || it.productName}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">× {it.quantity || 1}</span>
                        </div>
                        <span className="font-mono text-white font-bold">
                          ₦{((it.price || 0) * (it.quantity || 1)).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer / Destination Info */}
              {selectedTxDetail.type === 'sale' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs">
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block">Customer Name</span>
                    <span className="font-bold text-white uppercase">{selectedTxDetail.customerName || 'Customer'}</span>
                  </div>
                  {selectedTxDetail.customerPhone && (
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block">Phone</span>
                      <span className="font-mono text-emerald-400 font-bold">{selectedTxDetail.customerPhone}</span>
                    </div>
                  )}
                  {selectedTxDetail.customerAddress && (
                    <div className="col-span-full">
                      <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block">Delivery Address</span>
                      <span className="text-white/90">{selectedTxDetail.customerAddress}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-white/[0.02] border border-white/5 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-[10px] uppercase">Destination Bank:</span>
                    <span className="font-bold text-white uppercase">{selectedTxDetail.bankName || 'Bank'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-[10px] uppercase">Account Number:</span>
                    <span className="font-mono font-bold text-white">{selectedTxDetail.accountNumber}</span>
                  </div>
                  {selectedTxDetail.accountName && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-[10px] uppercase">Account Holder:</span>
                      <span className="font-bold text-emerald-400 uppercase">{selectedTxDetail.accountName}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Timestamp */}
              <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono pt-1">
                <span>Timestamp:</span>
                <span>{selectedTxDetail.date.toLocaleString()}</span>
              </div>

              {/* Close button */}
              <Button
                type="button"
                onClick={() => setSelectedTxDetail(null)}
                className="w-full h-10 rounded-xl text-xs font-black uppercase tracking-wider"
                variant="outline"
              >
                Close Receipt
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
