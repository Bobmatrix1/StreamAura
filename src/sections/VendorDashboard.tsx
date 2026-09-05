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
  ChefHat
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

export const VendorDashboard: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const isUserAdmin = Boolean(isAdmin || user?.isAdmin);
  
  // Tab states: 'dashboard' | 'orders' | 'products' | 'payout'
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'orders' | 'products' | 'payout'>('dashboard');

  // Vendor filter states for admin view
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('all');
  const [adminVendors, setAdminVendors] = useState<Vendor[]>([]);

  // Stats states
  const [vendorWallet, setVendorWallet] = useState({
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

  // Orders filters
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

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
    if (isProductModalOpen || isWithdrawModalOpen || deleteModalState.isOpen || shippingModal.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isProductModalOpen, isWithdrawModalOpen, deleteModalState.isOpen, shippingModal.isOpen]);

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

    // 1. Listen to Vendor Wallet details
    const unsubWallet = onSnapshot(doc(db, 'room_wallets', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setVendorWallet({
          funded_balance: data.funded_balance || 0,
          vendor_earnings: data.vendor_earnings || 0,
          vendor_revenue: data.vendor_revenue || 0,
          vendor_sales_count: data.vendor_sales_count || 0,
          vendor_fees: data.vendor_fees || 0
        });
      }
    });

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
    const qPay = query(collection(db, 'withdrawals'), where('user_uid', '==', user.uid), where('type', '==', 'vendor'));
    const qSales = query(collection(db, 'transactions'), where('user_uid', '==', user.uid), where('type', '==', 'vendor_earning'));

    let localPayouts: any[] = [];
    let localSales: any[] = [];

    const mergeAndSort = () => {
      const merged = [
        ...localPayouts.map(p => ({
          id: p.id,
          type: 'withdrawal',
          amount: p.amount,
          date: p.created_at?.toDate ? p.created_at.toDate() : new Date(),
          description: `Withdrawal request to ${p.bank_name} (${p.account_number})`,
          status: p.status
        })),
        ...localSales.map(s => ({
          id: s.id,
          type: 'sale',
          amount: s.amount,
          date: s.timestamp?.toDate ? s.timestamp.toDate() : new Date(),
          description: s.title || 'Store Sales Earning',
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

    const unsubPayouts = onSnapshot(qPay, (snap) => {
      localPayouts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      mergeAndSort();
    });

    const unsubSales = onSnapshot(qSales, (snap) => {
      localSales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      mergeAndSort();
    });

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
  }, [user?.uid, isUserAdmin]);

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

    if (amt > vendorWallet.funded_balance) {
      toast.error('Insufficient available wallet balance.');
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
              {/* Financial Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                <Card className="glass-card p-4 md:p-6 border-white/5 flex flex-col justify-between space-y-3 md:space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Available Balance</span>
                      <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg md:text-2xl font-black text-emerald-400">₦{vendorWallet.funded_balance.toLocaleString()}</h3>
                      <p className="text-[8px] md:text-[9px] text-muted-foreground uppercase font-black">Cleared & Withdrawable</p>
                    </div>
                  </div>
                  <Button 
                    onClick={handleOpenWithdrawModal}
                    className="w-full text-[9px] md:text-xs font-black uppercase tracking-widest h-8 md:h-10 gradient-bg"
                  >
                    Withdraw
                  </Button>
                </Card>

                <Card className="glass-card p-4 md:p-6 border-white/5 flex flex-col justify-between space-y-3 md:space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Sales Revenue</span>
                      <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg md:text-2xl font-black text-white">₦{vendorWallet.vendor_revenue.toLocaleString()}</h3>
                      <p className="text-[8px] md:text-[9px] text-muted-foreground uppercase font-black">Gross generated</p>
                    </div>
                  </div>
                  <div className="text-[8px] md:text-[9px] font-black uppercase flex justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                    <span className="text-muted-foreground">Orders</span>
                    <span className="text-primary">{vendorWallet.vendor_sales_count} Sold</span>
                  </div>
                </Card>

                <Card className="glass-card p-4 md:p-6 border-white/5 flex flex-col justify-between space-y-3 md:space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Store Earning (70%)</span>
                      <Percent className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg md:text-2xl font-black text-amber-500">₦{vendorWallet.vendor_earnings.toLocaleString()}</h3>
                      <p className="text-[8px] md:text-[9px] text-muted-foreground uppercase font-black">Your Share of sales</p>
                    </div>
                  </div>
                </Card>

                <Card className="glass-card p-4 md:p-6 border-white/5 flex flex-col justify-between space-y-3 md:space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Payout Account</span>
                      <Building className="w-4 h-4 md:w-5 md:h-5 text-indigo-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xs sm:text-sm font-black text-white truncate">{bankDetails.bankName || 'NOT CONFIGURED'}</h3>
                      <p className="text-[8px] md:text-[9px] text-muted-foreground uppercase font-black truncate">{bankDetails.accountNumber ? `No. ${bankDetails.accountNumber}` : 'Configure in settings'}</p>
                    </div>
                  </div>
                  {bankDetails.accountName ? (
                    <div className="flex items-center gap-1.5 p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-[7px] sm:text-[8px] font-black uppercase tracking-widest w-fit truncate max-w-full">
                      <UserCheck className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{bankDetails.accountName}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 p-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-[7px] sm:text-[8px] font-black uppercase tracking-widest w-fit">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" /> Missing Settings
                    </div>
                  )}
                </Card>
              </div>

              {/* Fast links */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                <Card className="glass-card p-4 md:p-6 border-white/5 space-y-3 md:space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Order Inflow</h3>
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/10 w-full">
                    <div className="flex items-center gap-3">
                      <Truck className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold uppercase">{allOrders.length} Total Orders</h4>
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase">
                          {allOrders.filter(o => o.status === 'pending' || !o.status).length} Pending Action
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => setActiveSubTab('orders')} className="w-full sm:w-auto px-3 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest h-8 gradient-bg">
                      Manage Orders
                    </Button>
                  </div>
                </Card>

                <Card className="glass-card p-4 md:p-6 border-white/5 space-y-3 md:space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Product Hub</h3>
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/10 w-full">
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold uppercase">{allProducts.length} Products</h4>
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase">Uploaded to Cinema Store</p>
                      </div>
                    </div>
                    <Button onClick={() => openProductModal()} className="w-full sm:w-auto px-3 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest h-8">
                      <Plus className="w-4 h-4 mr-1" /> Add Product
                    </Button>
                  </div>
                </Card>

                <Card className="glass-card p-4 md:p-6 border-white/5 space-y-3 md:space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Recent Payouts</h3>
                  <div className="space-y-2">
                    {payouts.slice(0, 3).map((p: any) => (
                      <div key={p.id} className="flex justify-between items-center p-2.5 bg-black/20 rounded-lg border border-white/5">
                        <div className="text-left">
                          <p className="text-xs font-bold uppercase">₦{p.amount.toLocaleString()}</p>
                          <p className="text-[8px] text-muted-foreground uppercase font-black">{p.bank_name} • {p.account_number}</p>
                        </div>
                        <Badge className="text-[8px] font-black uppercase" variant={p.status === 'completed' ? 'default' : p.status === 'pending' ? 'secondary' : 'destructive'}>
                          {p.status}
                        </Badge>
                      </div>
                    ))}
                    {payouts.length === 0 && (
                      <p className="text-xs text-muted-foreground italic text-center py-4">No payout requests placed yet.</p>
                    )}
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
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {isUserAdmin ? 'Vendor Orders (Admin Oversight)' : 'Customer Orders & Fulfilment'}
                  </h3>
                  {isUserAdmin && (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[8px] font-black uppercase tracking-wider">
                      Admin
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                  {/* Admin Vendor Filter */}
                  {isUserAdmin && (
                    <select
                      value={selectedVendorFilter}
                      onChange={(e) => setSelectedVendorFilter(e.target.value)}
                      aria-label="Filter orders by vendor"
                      className="bg-black/60 border border-white/20 rounded-lg px-2.5 py-1.5 text-[10px] sm:text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                    >
                      <option value="all">All Vendors ({allOrders.length} orders)</option>
                      {adminVendors.map(v => {
                        const count = allOrders.filter(o => o.vendorId === v.id).length;
                        return (
                          <option key={v.id} value={v.id}>
                            {v.name || v.id} ({count})
                          </option>
                        );
                      })}
                    </select>
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

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
                {[
                  { id: 'all', label: 'All', count: allOrders.length },
                  { id: 'pending', label: 'Pending', count: allOrders.filter(o => o.status === 'pending' || !o.status).length, color: 'text-amber-400' },
                  { id: 'accepted', label: 'Accepted', count: allOrders.filter(o => o.status === 'accepted').length, color: 'text-blue-400' },
                  { id: 'shipped', label: 'Out for Delivery', count: allOrders.filter(o => o.status === 'shipped').length, color: 'text-purple-400' },
                  { id: 'delivered', label: 'Delivered', count: allOrders.filter(o => o.status === 'delivered').length, color: 'text-emerald-400' },
                  { id: 'cancelled', label: 'Cancelled', count: allOrders.filter(o => o.status === 'cancelled').length, color: 'text-red-400' },
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

              {/* Orders Feed */}
              <div className="space-y-4">
                {displayedOrders.map((order) => {
                  const status = order.status || 'pending';
                  const orderNum = order.orderNumber || order.id.substring(0, 8).toUpperCase();
                  const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Recent';

                  return (
                    <Card key={order.id} className="glass-card border-white/10 p-4 sm:p-5 space-y-4 text-left transition-all hover:border-white/20">
                      {/* Order Header */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 border-b border-white/5 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400 font-mono">
                            #{orderNum}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(orderNum);
                              toast.success(`Order #${orderNum} copied to clipboard!`);
                            }}
                            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                            title="Copy Order Number"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] text-muted-foreground">• {dateStr}</span>
                          {isUserAdmin && order.vendorName && (
                            <Badge variant="outline" className="text-[8px] font-black uppercase border-amber-500/30 text-amber-300 bg-amber-500/10">
                              Vendor: {order.vendorName}
                            </Badge>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div>
                          {status === 'pending' && (
                            <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[9px] font-black uppercase tracking-widest animate-pulse">
                              Pending Acceptance
                            </Badge>
                          )}
                          {status === 'accepted' && (
                            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/40 text-[9px] font-black uppercase tracking-widest">
                              Accepted / In Kitchen
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
                        </div>
                      </div>

                      {/* Customer & Delivery Information */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                        <div className="space-y-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                            <ChefHat className="w-3.5 h-3.5 text-primary" /> Customer Info
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
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-500" /> Delivery Address / Notes
                          </p>
                          <p className="text-xs text-white/90 font-medium">
                            {order.deliveryAddress || 'Standard Delivery / In-Cinema Pick-Up'}
                          </p>
                          {order.estimatedDeliveryTime && (
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md w-fit">
                              <Clock className="w-3 h-3" /> ETA: {order.estimatedDeliveryTime}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Items Ordered List */}
                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                          Order Items ({order.items?.length || 0})
                        </p>
                        <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-black/30">
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

                      {/* Total & Action Bar */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-3 border-t border-white/5">
                        <div>
                          <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Total Paid: </span>
                          <span className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                            ₦{(order.totalAmount || 0).toLocaleString()}
                          </span>
                        </div>

                        {/* Action Buttons */}
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
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
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
                            <div className="flex items-center gap-1.5 text-xs font-black text-emerald-400 uppercase py-1 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                              <CheckCircle2 className="w-4 h-4" /> Delivered & Completed
                            </div>
                          )}

                          {status === 'cancelled' && (
                            <div className="flex items-center gap-1.5 text-xs font-black text-red-400 uppercase py-1 px-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                              <XCircle className="w-4 h-4" /> Order Cancelled
                            </div>
                          )}
                        </div>
                      </div>
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
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {isUserAdmin && (
                    <select
                      value={selectedVendorFilter}
                      onChange={(e) => setSelectedVendorFilter(e.target.value)}
                      aria-label="Filter products by vendor"
                      className="bg-black/60 border border-white/20 rounded-lg px-2.5 py-1.5 text-[10px] sm:text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                    >
                      <option value="all">All Vendors ({allProducts.length})</option>
                      {adminVendors.map(v => {
                        const count = allProducts.filter(p => p.vendorId === v.id).length;
                        return (
                          <option key={v.id} value={v.id}>
                            {v.name || v.id} ({count})
                          </option>
                        );
                      })}
                      {user?.uid && !adminVendors.some(v => v.id === user.uid) && (
                        <option value={user.uid}>
                          My Personal Products ({allProducts.filter(p => p.vendorId === user.uid).length})
                        </option>
                      )}
                    </select>
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

          {activeSubTab === 'payout' && (
            <motion.div 
              key="payouts"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Earning Sales & Settlement History
                </h3>
                <Button onClick={handleOpenWithdrawModal} className="text-[10px] sm:text-xs font-black uppercase tracking-widest h-9 sm:h-10 gradient-bg">
                  <Banknote className="w-4 h-4 mr-1.5" /> Cash Out Earning
                </Button>
              </div>

              {/* Desktop Table view */}
              <div className="glass-card overflow-hidden border-white/5 hidden md:block">
                <div className="p-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/10 text-[9px] uppercase font-black text-muted-foreground tracking-widest">
                        <th className="py-3 px-4">Transaction ID</th>
                        <th className="py-3 px-4">Activity Type</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(item => (
                        <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.01] text-xs font-bold uppercase tracking-tight">
                          <td className="py-3.5 px-4 font-mono text-[10px] text-muted-foreground">{item.id.substring(0, 10)}...</td>
                          <td className="py-3.5 px-4">
                            <Badge variant={item.type === 'sale' ? 'default' : 'secondary'} className="text-[8px] font-black uppercase tracking-widest">
                              {item.type === 'sale' ? 'Sale Earning' : 'Withdrawal'}
                            </Badge>
                          </td>
                          <td className={`py-3.5 px-4 font-black ${item.type === 'sale' ? 'text-emerald-400' : 'text-orange-400'}`}>
                            {item.type === 'sale' ? `+₦${item.amount.toLocaleString()}` : `-₦${item.amount.toLocaleString()}`}
                          </td>
                          <td className="py-3.5 px-4 text-muted-foreground max-w-xs truncate">{item.description}</td>
                          <td className="py-3.5 px-4 text-muted-foreground">{item.date.toLocaleString()}</td>
                          <td className="py-3.5 px-4 text-right">
                            <Badge variant={item.status === 'completed' ? 'default' : item.status === 'pending' ? 'secondary' : 'destructive'} className="text-[8px] font-black uppercase">
                              {item.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {history.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-muted-foreground italic">
                            No store sales or payouts recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card feed view */}
              <div className="space-y-3 md:hidden">
                {history.map(item => (
                  <Card key={item.id} className="glass-card p-4 border-white/5 space-y-3 text-left">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono text-muted-foreground">ID: {item.id.substring(0, 10)}...</span>
                      <Badge variant={item.status === 'completed' ? 'default' : item.status === 'pending' ? 'secondary' : 'destructive'} className="text-[8px] font-black uppercase">
                        {item.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-end gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={item.type === 'sale' ? 'default' : 'secondary'} className="text-[7px] font-black uppercase tracking-widest px-1 py-0.5">
                            {item.type === 'sale' ? 'Sale' : 'Withdrawal'}
                          </Badge>
                        </div>
                        <p className="text-xs font-bold uppercase text-white leading-normal">{item.description}</p>
                        <p className="text-[9px] text-muted-foreground">{item.date.toLocaleString()}</p>
                      </div>
                      <p className={`text-sm font-black whitespace-nowrap ${item.type === 'sale' ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {item.type === 'sale' ? `+₦${item.amount.toLocaleString()}` : `-₦${item.amount.toLocaleString()}`}
                      </p>
                    </div>
                  </Card>
                ))}
                {history.length === 0 && (
                  <p className="text-xs text-muted-foreground italic text-center py-8">
                    No store sales or payouts recorded yet.
                  </p>
                )}
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
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Category</label>
                    <select
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-primary/50"
                      value={productForm.category}
                      onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                    >
                      <option value="snack">Popcorn & Snacks</option>
                      <option value="drink">Chilled Drinks</option>
                      <option value="combo">Combo Packages</option>
                      <option value="candy">Sweets & Candies</option>
                    </select>
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

                {/* Cover Image Upload */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Cover Image</label>
                  <div className="flex gap-3 items-center">
                    {productForm.image && (
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-white/10 overflow-hidden bg-black/40 flex-shrink-0 flex items-center justify-center">
                        <img src={productForm.image} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <label className="flex-1 flex flex-col items-center justify-center h-14 sm:h-16 border-2 border-dashed border-white/10 hover:border-primary/50 rounded-xl cursor-pointer hover:bg-white/[0.02] transition-all">
                      <div className="flex flex-col items-center justify-center py-2 text-center">
                        {isUploadingImage ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-muted-foreground" />
                            <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-wider text-muted-foreground mt-1">Upload Product image</span>
                          </>
                        )}
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleImageChange}
                        disabled={isUploadingImage}
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-1 py-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Stock Status</label>
                  <select
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-primary/50"
                    value={productForm.stockStatus}
                    onChange={e => setProductForm({ ...productForm, stockStatus: e.target.value as any })}
                  >
                    <option value="in_stock">In Stock</option>
                    <option value="out_of_stock">Out of Stock</option>
                    <option value="restocking">Restocking</option>
                  </select>
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
                    <span className="text-[9px] text-primary font-black uppercase">Max: ₦{vendorWallet.funded_balance.toLocaleString()}</span>
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
    </div>
  );
};
