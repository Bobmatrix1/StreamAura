import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingBag, 
  X, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  MapPin, 
  Phone, 
  Mail, 
  ChevronRight,
  Store,
  Star,
  CheckCircle2,
  ArrowLeft,
  MessageSquareQuote,
  Quote,
  BadgeCheck,
  ShieldCheck,
  Truck,
  Flame,
  Clock,
  Check,
  Receipt
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  placeOrder,
  listenToProductReviews,
  type Product, 
  type Partner,
  type Vendor,
  type ProductReview,
  db
} from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../api/mediaApi';
import { doc, getDoc, setDoc, addDoc, updateDoc, collection, increment, serverTimestamp, onSnapshot } from 'firebase/firestore';

interface CinemaStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CinemaStoreModal: React.FC<CinemaStoreModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'store' | 'cart' | 'checkout'>('store');
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  
  // Product Detail Page State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productReviews, setProductReviews] = useState<ProductReview[]>([]);
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Cart State
  const [cart, setCart] = useState<{product: Product, quantity: number}[]>([]);
  
  // Checkout Form State
  const [deliveryInfo, setDeliveryInfo] = useState({
    address: '',
    phone: '',
    email: user?.email || '',
    name: user?.displayName || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scroll Lock Effect
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Keep selected product in sync with products list
  useEffect(() => {
    if (selectedProduct) {
      const updated = products.find(p => p.id === selectedProduct.id);
      if (updated) {
        setSelectedProduct(updated);
      }
    }
  }, [products]);

  // Real-time product reviews listener
  useEffect(() => {
    if (!selectedProduct?.id) {
      setProductReviews([]);
      return;
    }
    setIsReviewsLoading(true);
    const unsub = listenToProductReviews(selectedProduct.id, (reviews) => {
      setProductReviews(reviews);
      setIsReviewsLoading(false);
    });
    return () => unsub();
  }, [selectedProduct?.id]);

  useEffect(() => {
    if (!isOpen) return;

    // Real-time synchronization for Cinema Store products, partners, and vendors
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      const prods = snap.docs.map(d => {
        const data = d.data();
        const isInStock = data.inStock ?? (data.available !== false && data.stockStatus !== 'out_of_stock');
        const stockStatus = data.stockStatus || (isInStock ? 'in_stock' : 'out_of_stock');
        return {
          id: d.id,
          name: data.name || '',
          description: data.description || '',
          price: Number(data.price) || 0,
          slashPrice: data.slashPrice ? Number(data.slashPrice) : undefined,
          image: data.image || '',
          vendorId: data.vendorId || '',
          inStock: isInStock,
          stockStatus: stockStatus,
          available: data.available ?? isInStock,
          quantity: data.quantity ?? 10,
          category: data.category || 'snack',
          rating: data.rating ? Number(data.rating) : undefined,
          reviewCount: data.reviewCount ? Number(data.reviewCount) : undefined
        } as Product;
      });
      setProducts(prods);
    }, (err) => {
      console.error('Failed to listen to products:', err);
      toast.error('Failed to load store products');
    });

    const unsubPartners = onSnapshot(collection(db, 'partners'), (snap) => {
      setPartners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Partner)));
    }, (err) => console.error('Failed to listen to partners:', err));

    const unsubVendors = onSnapshot(collection(db, 'vendors'), (snap) => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor)));
    }, (err) => console.error('Failed to listen to vendors:', err));

    return () => {
      unsubProducts();
      unsubPartners();
      unsubVendors();
    };
  }, [isOpen]);

  const addToCart = (product: Product, quantity: number = 1) => {
    if (quantity <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + quantity } 
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    toast.success(quantity === 1 ? `${product.name} added to cart` : `${quantity}x ${product.name} added to cart`);
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please login to place an order');
      return;
    }
    if (cart.length === 0) return;

    setIsSubmitting(true);
    try {
      // 1. Check Customer Wallet Balance
      const customerWalletRef = doc(db, 'room_wallets', user.uid);
      const customerWalletSnap = await getDoc(customerWalletRef);
      const customerBalance = customerWalletSnap.exists() ? (customerWalletSnap.data().funded_balance || 0) : 0;

      if (customerBalance < cartTotal) {
        toast.error(`Insufficient wallet balance. Total is ₦${cartTotal.toLocaleString()} but your balance is ₦${customerBalance.toLocaleString()}. Please fund your wallet first.`);
        setIsSubmitting(false);
        return;
      }

      // Group items by vendor
      const vendorGroups = cart.reduce((acc, item) => {
        const vId = item.product.vendorId || 'admin-store';
        if (!acc[vId]) acc[vId] = [];
        acc[vId].push(item);
        return acc;
      }, {} as Record<string, typeof cart>);

      // Deduct Customer Wallet Balance
      await setDoc(customerWalletRef, {
        funded_balance: increment(-cartTotal),
        balance: increment(-cartTotal)
      }, { merge: true });

      // Save Customer Transaction Log
      const txCol = collection(db, 'transactions');
      await addDoc(txCol, {
        user_uid: user.uid,
        type: 'purchase',
        amount: cartTotal,
        title: `Store Purchase: ${cart.map(i => `${i.quantity}x ${i.product.name}`).join(', ')}`,
        status: 'completed',
        timestamp: serverTimestamp()
      });

      // Place orders for each vendor
      for (const [vendorId, items] of Object.entries(vendorGroups)) {
        const vendor = vendors.find(v => v.id === vendorId);
        const orderTotal = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        
        const orderData = {
          userId: user.uid,
          userName: deliveryInfo.name,
          userEmail: deliveryInfo.email,
          userPhone: deliveryInfo.phone,
          deliveryAddress: deliveryInfo.address,
          items: items.map(item => ({
            productId: item.product.id,
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price
          })),
          totalAmount: orderTotal,
          vendorId: vendorId,
          vendorName: vendor?.name || 'Snack Vendor'
        };

        const { id: orderId, orderNumber } = await placeOrder(orderData);

        // Send In-App Notification to Customer with unique order number and details
        try {
          const notifDocId = `order_${orderId}_placed`;
          await setDoc(doc(db, 'users', user.uid, 'notifications', notifDocId), {
            title: `🛒 Order Placed - #${orderNumber}`,
            message: `Your order for ${orderData.items.map(i => `${i.quantity}x ${i.name}`).join(', ')} totaling ₦${orderTotal.toLocaleString()} has been placed and sent to ${vendor?.name || 'the vendor'}. Delivery to: ${deliveryInfo.address}`,
            timestamp: Date.now(),
            read: false,
            type: 'order_placed',
            orderId,
            orderNumber,
            vendorId,
            vendorName: vendor?.name || 'Vendor',
            orderStatus: 'pending',
            estimatedDeliveryTime: ''
          }, { merge: true });
          await updateDoc(doc(db, 'users', user.uid), { unreadCount: increment(1) }).catch(() => {});
        } catch (ne) {
          console.warn('Failed to add in-app purchase notification:', ne);
        }

        // Credit Vendor Dedicated Store Wallet (70% Share) & Log Earnings Stats
        const vendorShare = orderTotal * 0.70;
        const platformShare = orderTotal * 0.30;
        const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);

        const vendorWalletRef = doc(db, 'room_wallets', vendorId);
        await setDoc(vendorWalletRef, {
          vendor_balance: increment(vendorShare),
          vendor_earnings: increment(vendorShare),
          vendor_revenue: increment(orderTotal),
          vendor_sales_count: increment(itemsCount),
          vendor_fees: increment(platformShare)
        }, { merge: true });

        // Save Vendor Transaction Log
        await addDoc(txCol, {
          user_uid: vendorId,
          vendorId: vendorId,
          vendorName: vendor?.name || 'Snack Vendor',
          orderId: orderId,
          orderNumber: orderNumber,
          type: 'vendor_earning',
          amount: vendorShare,
          grossAmount: orderTotal,
          platformFee: platformShare,
          itemsCount: itemsCount,
          customerName: deliveryInfo.name,
          customerPhone: deliveryInfo.phone,
          customerAddress: deliveryInfo.address,
          items: orderData.items,
          title: `Sales Earning (70%) - Order #${orderNumber} (${orderData.items.map(i => `${i.quantity}x ${i.name}`).join(', ')})`,
          status: 'completed',
          timestamp: serverTimestamp()
        });

        // Update Platform Fees global stats
        const statsRef = doc(db, 'system_analytics', 'global_counters');
        await setDoc(statsRef, {
          [`payments.success.count`]: increment(1),
          [`payments.success.totalAmount`]: increment(orderTotal),
          [`payments.platform_fees`]: increment(platformShare)
        }, { merge: true });

        // Send to Telegram Bot via backend
        try {
          await fetch(`${API_BASE_URL}/api/store/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              orderNumber,
              vendorId,
              vendorName: vendor?.name || 'Snack Vendor',
              telegramGroupId: vendor?.telegramGroupId,
              customerName: deliveryInfo.name,
              customerPhone: deliveryInfo.phone,
              customerAddress: deliveryInfo.address,
              items: orderData.items,
              total: orderTotal,
              userId: user.uid
            })
          });
        } catch (tge) {
          console.warn('Failed to dispatch telegram order notification:', tge);
        }
      }

      toast.success('Order placed successfully! Wallet debited.');
      setCart([]);
      setActiveTab('store');
      setSelectedProduct(null);
      onClose();
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast.error(error.message || 'Payment processing failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatReviewDate = (timestamp?: number) => {
    if (!timestamp) return 'Recently';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Recently';
    }
  };

  // Extract categories for filtering
  const categories = ['all', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
  const filteredProducts = selectedCategory === 'all' 
    ? products 
    : products.filter(p => p.category.toLowerCase() === selectedCategory.toLowerCase());

  // Rating metrics helper
  const calculateRatingStats = (reviews: ProductReview[], fallbackRating?: number) => {
    const total = reviews.length;
    if (total === 0) {
      const avg = fallbackRating || 5.0;
      return {
        avg: avg.toFixed(1),
        total: 0,
        breakdown: { 5: 100, 4: 0, 3: 0, 2: 0, 1: 0 }
      };
    }
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
    const avg = (sum / total).toFixed(1);
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5))) as 1 | 2 | 3 | 4 | 5;
      counts[star] = (counts[star] || 0) + 1;
    });
    const breakdown = {
      5: Math.round((counts[5] / total) * 100),
      4: Math.round((counts[4] / total) * 100),
      3: Math.round((counts[3] / total) * 100),
      2: Math.round((counts[2] / total) * 100),
      1: Math.round((counts[1] / total) * 100)
    };
    return { avg, total, breakdown };
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="cinema-store-modal relative w-full max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex flex-col overflow-hidden z-[3001] shadow-2xl rounded-2xl sm:rounded-3xl text-slate-900 dark:text-white"
          >
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/90 dark:bg-black/40 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20 shadow-lg shadow-primary/10">
                  <Store className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Cinema Snack Store</h2>
                  <p className="text-[10px] text-slate-600 dark:text-muted-foreground font-bold uppercase tracking-widest">Premium Refreshments Delivered to your seat</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 sm:gap-4">
                <button 
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('cart');
                  }}
                  className="header-cart-btn relative p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 transition-all border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white shadow-xs flex items-center justify-center cursor-pointer"
                  title="View Shopping Cart"
                  aria-label="View Shopping Cart"
                >
                  <ShoppingBag className="w-5 h-5 text-slate-900 dark:text-white stroke-[2.2]" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-primary !text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-md">
                      {cart.reduce((s, i) => s + i.quantity, 0)}
                    </span>
                  )}
                </button>
                <button 
                  onClick={onClose} 
                  className="header-close-btn p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 transition-colors border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white shadow-xs flex items-center justify-center cursor-pointer"
                  title="Close Store"
                  aria-label="Close Store"
                >
                  <X className="w-5 h-5 text-slate-900 dark:text-white stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs Header */}
            <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-slate-200 dark:border-white/10 bg-slate-100/90 dark:bg-black/30">
              <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-white/5 border-2 border-slate-300 dark:border-white/10 overflow-x-auto no-scrollbar shadow-xs">
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('store');
                  }}
                  className={`cinema-nav-tab flex-1 min-w-[130px] py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'store' 
                      ? 'cinema-nav-tab-active active bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md border border-slate-900 dark:border-white' 
                      : 'text-slate-900 hover:text-black dark:text-slate-200 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  <Store className="w-4 h-4" />
                  <span>Snacks Menu</span>
                </button>
                
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('cart');
                  }}
                  className={`cinema-nav-tab flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 relative cursor-pointer ${
                    activeTab === 'cart' 
                      ? 'cinema-nav-tab-active active bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md border border-slate-900 dark:border-white' 
                      : 'text-slate-900 hover:text-black dark:text-slate-200 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Shopping Cart</span>
                  {cart.length > 0 && (
                    <span className={`min-w-[18px] h-[18px] px-1 text-[10px] font-black rounded-full flex items-center justify-center shadow-xs ${
                      activeTab === 'cart' ? 'bg-primary text-white' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    }`}>
                      {cart.reduce((s, i) => s + i.quantity, 0)}
                    </span>
                  )}
                </button>

                <button 
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('checkout');
                  }}
                  className={`cinema-nav-tab flex-1 min-w-[130px] py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'checkout' 
                      ? 'cinema-nav-tab-active active bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md border border-slate-900 dark:border-white' 
                      : 'text-slate-900 hover:text-black dark:text-slate-200 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Checkout</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              <AnimatePresence mode="wait">
                {/* 1. STORE TAB */}
                {activeTab === 'store' && (
                  <>
                    {/* A. PRODUCT DETAIL VIEW (ECOMMERCE STORE PAGE) */}
                    {selectedProduct ? (
                      <motion.div
                        key={`product-detail-${selectedProduct.id}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="space-y-8"
                      >
                        {/* Navigation & Breadcrumb */}
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setSelectedProduct(null)}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-xs font-black uppercase tracking-wider text-slate-900 hover:text-black dark:text-white transition-all border-2 border-slate-300 dark:border-white/15 shadow-xs cursor-pointer"
                          >
                            <ArrowLeft className="w-4 h-4 text-slate-900 dark:text-white" /> Back to Snacks Menu
                          </button>
                          
                          <div className="hidden sm:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            <span>Store</span>
                            <span>/</span>
                            <span className="text-primary font-black">{selectedProduct.category}</span>
                            <span>/</span>
                            <span className="text-slate-900 dark:text-white font-black truncate max-w-[160px]">{selectedProduct.name}</span>
                          </div>
                        </div>

                        {/* Product Detail Layout: 2 Columns */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                          {/* Left: Product Image & Highlights */}
                          <div className="space-y-4">
                            <div className="relative aspect-square rounded-3xl overflow-hidden bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 shadow-xl group">
                              <img
                                src={selectedProduct.image}
                                alt={selectedProduct.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
                              
                              {/* Badges */}
                              <div className="absolute top-3 left-3 flex flex-col gap-2">
                                {selectedProduct.slashPrice && (
                                  <Badge className="bg-rose-600 !text-white font-black text-[10px] uppercase tracking-widest px-3 py-1 shadow-lg" style={{ color: '#ffffff' }}>
                                    Special Offer
                                  </Badge>
                                )}
                                <Badge className="bg-black/75 backdrop-blur-md !text-white font-bold text-[9px] uppercase tracking-widest px-3 py-1 border border-white/20 shadow-md" style={{ color: '#ffffff' }}>
                                  {selectedProduct.category || 'Snacks'}
                                </Badge>
                              </div>

                              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-black uppercase !text-white bg-black/75 backdrop-blur-md p-3 rounded-2xl border border-white/20 shadow-lg" style={{ color: '#ffffff' }}>
                                <div className="flex items-center gap-2">
                                  <Truck className="w-4 h-4 text-amber-400" style={{ color: '#f59e0b' }} />
                                  <span style={{ color: '#ffffff' }}>Instant Delivery</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-emerald-400" style={{ color: '#34d399' }}>
                                  <ShieldCheck className="w-4 h-4" />
                                  <span style={{ color: '#34d399' }}>Verified Quality</span>
                                </div>
                              </div>
                            </div>

                            {/* Service Badges */}
                            <div className="grid grid-cols-3 gap-3">
                              <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center space-y-1">
                                <Flame className="w-4 h-4 text-orange-600 dark:text-orange-400 mx-auto" />
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white">Fresh & Hot</p>
                                <p className="text-[9px] font-semibold text-slate-600 dark:text-muted-foreground">Made on order</p>
                              </div>
                              <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center space-y-1">
                                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mx-auto" />
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white">5-10 Mins</p>
                                <p className="text-[9px] font-semibold text-slate-600 dark:text-muted-foreground">Delivery time</p>
                              </div>
                              <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center space-y-1">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto" />
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white">Safe Pay</p>
                                <p className="text-[9px] font-semibold text-slate-600 dark:text-muted-foreground">Wallet secured</p>
                              </div>
                            </div>
                          </div>

                          {/* Right: Product Info & Actions */}
                          <div className="space-y-6">
                            {/* Title & Vendor */}
                            <div className="space-y-2">
                              {(() => {
                                const vendorObj = vendors.find(v => v.id === selectedProduct.vendorId);
                                const stats = calculateRatingStats(productReviews, selectedProduct.rating || vendorObj?.rating || 5.0);
                                return (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-black" style={{ color: '#f59e0b' }}>
                                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                                        <span style={{ color: '#f59e0b' }}>{stats.avg}</span>
                                      </div>
                                      <span className="text-xs text-slate-600 dark:text-muted-foreground font-bold">
                                        ({stats.total} {stats.total === 1 ? 'Customer Review' : 'Customer Reviews'})
                                      </span>
                                    </div>

                                    <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white leading-tight">
                                      {selectedProduct.name}
                                    </h1>

                                    {/* Vendor Badge */}
                                    <div className="flex items-center gap-2 pt-1">
                                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-black border border-primary/20">
                                        <Store className="w-3 h-3" />
                                      </div>
                                      <p className="text-xs text-slate-600 dark:text-muted-foreground font-bold">
                                        Sold & Prepared by <span className="text-slate-900 dark:text-white font-black">{vendorObj?.name || 'Cinema Kitchen'}</span>
                                      </p>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            {/* Price Section */}
                            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-muted-foreground">Pricing</p>
                              <div className="flex items-baseline gap-3">
                                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                                  ₦{selectedProduct.price.toLocaleString()}
                                </span>
                                {selectedProduct.slashPrice && (
                                  <>
                                    <span className="text-sm text-slate-500 dark:text-muted-foreground line-through decoration-rose-500/60 font-bold">
                                      ₦{selectedProduct.slashPrice.toLocaleString()}
                                    </span>
                                    <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase">
                                      Save ₦{(selectedProduct.slashPrice - selectedProduct.price).toLocaleString()}
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Stock Status */}
                            <div className="flex items-center gap-2">
                              {selectedProduct.stockStatus === 'out_of_stock' || selectedProduct.inStock === false ? (
                                <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30 text-xs font-bold uppercase">
                                  Out of Stock
                                </Badge>
                              ) : selectedProduct.stockStatus === 'restocking' ? (
                                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-bold uppercase">
                                  Restocking Soon
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase flex items-center gap-1.5">
                                  <Check className="w-3 h-3" /> In Stock & Ready to Deliver
                                </Badge>
                              )}
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-muted-foreground">Product Description</h3>
                              <p className="text-sm text-slate-700 dark:text-muted-foreground font-medium leading-relaxed">
                                {selectedProduct.description || 'Enjoy our delicious cinema snack, prepared with premium ingredients for the ultimate movie-watching experience.'}
                              </p>
                            </div>

                            {/* Quantity Selector & Add To Cart CTA */}
                            {selectedProduct.stockStatus !== 'out_of_stock' && selectedProduct.inStock !== false ? (
                              <div className="p-5 rounded-2xl bg-slate-100/90 dark:bg-black/40 border-2 border-slate-200 dark:border-white/10 space-y-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <span className="quantity-selector-label text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                    Select Quantity:
                                  </span>
                                  <div className="flex items-center gap-2 bg-white dark:bg-black/40 rounded-xl border-2 border-slate-300 dark:border-white/20 p-1 shadow-sm">
                                    <button 
                                      type="button"
                                      onClick={() => setDetailQuantity(q => Math.max(1, q - 1))}
                                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-900 dark:text-white flex items-center justify-center transition-colors border border-slate-200 dark:border-white/10"
                                      aria-label="Decrease quantity"
                                    >
                                      <Minus className="w-4 h-4 text-slate-900 dark:text-white" />
                                    </button>
                                    <span className="quantity-selector-value text-base font-black w-8 text-center text-slate-900 dark:text-white">
                                      {detailQuantity}
                                    </span>
                                    <button 
                                      type="button"
                                      onClick={() => setDetailQuantity(q => q + 1)}
                                      className="w-8 h-8 rounded-lg bg-primary hover:bg-primary/90 !text-white flex items-center justify-center transition-colors shadow-xs"
                                      aria-label="Increase quantity"
                                    >
                                      <Plus className="w-4 h-4 text-white" />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-xs font-bold uppercase pt-2 border-t border-slate-200 dark:border-white/5">
                                  <span className="quantity-subtotal-label text-xs font-black uppercase text-slate-900 dark:text-slate-200">
                                    Subtotal:
                                  </span>
                                  <span className="quantity-subtotal-value text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                                    ₦{(selectedProduct.price * detailQuantity).toLocaleString()}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => addToCart(selectedProduct, detailQuantity)}
                                    className="h-12 rounded-xl font-black uppercase tracking-widest text-xs gradient-bg !text-white shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                                  >
                                    <ShoppingBag className="w-4 h-4 text-white" />
                                    <span>Add to Cart</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      addToCart(selectedProduct, detailQuantity);
                                      setActiveTab('checkout');
                                    }}
                                    className="cinema-order-now-btn h-12 rounded-xl font-black uppercase tracking-widest text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 !text-white dark:!text-slate-900 transition-all flex items-center justify-center gap-1.5 shadow-lg active:scale-95 border border-slate-900 dark:border-white"
                                  >
                                    <span>Order Now</span>
                                    <ChevronRight className="w-4 h-4 text-white dark:text-slate-900" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-1">
                                <p className="text-xs font-black uppercase text-red-600 dark:text-red-400">Currently Unavailable</p>
                                <p className="text-[10px] text-slate-600 dark:text-muted-foreground font-semibold">This snack is temporarily sold out. Please choose another delicious item from the menu.</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Customer Reviews & Feedback Section */}
                        <div className="pt-8 border-t border-slate-200 dark:border-white/10 space-y-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                                <MessageSquareQuote className="w-5 h-5 text-primary" /> Customer Reviews & Ratings
                              </h3>
                              <p className="text-[10px] text-slate-600 dark:text-muted-foreground font-bold uppercase tracking-widest">
                                Verified feedback from moviegoers who ordered this snack
                              </p>
                            </div>
                            <Badge className="bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-muted-foreground border border-slate-200 dark:border-white/10 font-black text-xs">
                              {productReviews.length} {productReviews.length === 1 ? 'Review' : 'Reviews'}
                            </Badge>
                          </div>

                          {/* Rating Breakdown Card */}
                          {(() => {
                            const vendorObj = vendors.find(v => v.id === selectedProduct.vendorId);
                            const stats = calculateRatingStats(productReviews, selectedProduct.rating || vendorObj?.rating || 5.0);
                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 items-center">
                                <div className="text-center sm:text-left space-y-2 sm:border-r sm:border-slate-200 dark:sm:border-white/10 sm:pr-6">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-muted-foreground">Average Rating</p>
                                  <div className="text-4xl sm:text-5xl font-black text-amber-500 tracking-tight flex items-center justify-center sm:justify-start gap-2" style={{ color: '#f59e0b' }}>
                                    <span style={{ color: '#f59e0b' }}>{stats.avg}</span>
                                    <Star className="w-8 h-8 fill-amber-400 text-amber-400" style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                                  </div>
                                  <p className="text-xs text-slate-600 dark:text-muted-foreground font-bold">
                                    Based on {stats.total} verified reviews
                                  </p>
                                </div>

                                <div className="sm:col-span-2 space-y-2">
                                  {[5, 4, 3, 2, 1].map((starVal) => {
                                    const pct = (stats.breakdown as any)[starVal] || 0;
                                    return (
                                      <div key={starVal} className="flex items-center gap-3 text-xs font-bold">
                                        <span className="w-8 text-right text-slate-700 dark:text-muted-foreground flex items-center justify-end gap-1">
                                          {starVal} <Star className="w-3 h-3 fill-amber-400 text-amber-400" style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                                        </span>
                                        <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                          <div 
                                            className="h-full bg-amber-400 rounded-full transition-all duration-500" 
                                            style={{ width: `${pct}%`, backgroundColor: '#f59e0b' }}
                                          />
                                        </div>
                                        <span className="w-10 text-right text-slate-700 dark:text-muted-foreground text-[10px] font-black">
                                          {pct}%
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Reviews List */}
                          <div className="space-y-4">
                            {isReviewsLoading ? (
                              <div className="py-12 text-center text-slate-600 dark:text-muted-foreground space-y-2">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                                <p className="text-xs uppercase font-bold tracking-widest">Loading reviews...</p>
                              </div>
                            ) : productReviews.length === 0 ? (
                              <div className="py-12 text-center p-8 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 space-y-3">
                                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto" style={{ color: '#f59e0b' }}>
                                  <Star className="w-6 h-6 fill-amber-400 text-amber-400" style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                                </div>
                                <h4 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">No Reviews Yet</h4>
                                <p className="text-xs text-slate-600 dark:text-muted-foreground font-medium max-w-sm mx-auto">
                                  Order this snack today and be the first to rate your experience when delivered!
                                </p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {productReviews.map((rev) => (
                                  <div
                                    key={rev.id}
                                    className="p-5 rounded-2xl bg-white dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 space-y-3 flex flex-col justify-between shadow-xs"
                                  >
                                    <div className="space-y-3">
                                      <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center !text-white font-black text-xs shadow-md">
                                            {(rev.userName || 'C').charAt(0).toUpperCase()}
                                          </div>
                                          <div>
                                            <p className="review-author-name text-xs font-black uppercase text-slate-900 dark:text-white leading-tight">
                                              {rev.userName || 'Verified Customer'}
                                            </p>
                                            <div className="flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                                              <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Verified Purchase
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex items-center text-amber-500">
                                          {[1, 2, 3, 4, 5].map((s) => (
                                            <Star
                                              key={s}
                                              className={`w-3.5 h-3.5 ${s <= (rev.rating || 5) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-white/20'}`}
                                            />
                                          ))}
                                        </div>
                                      </div>

                                      <div className="review-comment-box relative bg-slate-100/90 dark:bg-black/35 p-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-2xs">
                                        <Quote className="w-4 h-4 text-primary absolute top-3 right-3 rotate-180 opacity-60" />
                                        <p className="review-comment-text text-xs text-slate-900 dark:text-white/95 leading-relaxed font-bold italic pr-5">
                                          "{rev.review || 'Great snack! Arrived on time and freshly prepared.'}"
                                        </p>
                                      </div>
                                    </div>

                                    <div className="text-[10px] text-slate-700 dark:text-slate-300 font-bold pt-2.5 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
                                      <div className="flex items-center gap-1 text-slate-900 dark:text-white/80 font-mono font-bold">
                                        <span>Order #{rev.orderId?.slice(0, 8).toUpperCase() || 'CINEMA'}</span>
                                      </div>
                                      <span className="text-slate-600 dark:text-slate-300 font-bold">{formatReviewDate(rev.createdAt)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      /* B. STANDARD STORE CATALOG / GRID VIEW */
                      <motion.div 
                        key="store-grid"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-8"
                      >
                        {/* Partners Section */}
                        {partners.length > 0 && (
                          <div className="space-y-3">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-muted-foreground">Our Cinema Partners</h3>
                            <div className="flex flex-wrap gap-3">
                              {partners.map(partner => (
                                <div key={partner.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all text-slate-900 dark:text-white">
                                  <img src={partner.logo} className="w-5 h-5 object-contain" alt={partner.name} />
                                  <span className="text-[9px] font-black uppercase">{partner.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Category Filter Pills */}
                        {categories.length > 1 && (
                          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                            {categories.map(cat => (
                              <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                  selectedCategory === cat 
                                    ? 'bg-primary !text-white shadow-lg shadow-primary/20 font-black' 
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 dark:bg-white/5 dark:text-muted-foreground dark:hover:text-white border border-slate-200 dark:border-white/10 font-bold'
                                }`}
                                style={selectedCategory === cat ? { color: '#ffffff' } : undefined}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Products Grid - Mobile-Optimized 2-Column Ecommerce Layout */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
                          {filteredProducts.map(product => {
                            const isOutOfStock = product.stockStatus === 'out_of_stock' || product.inStock === false || product.available === false;
                            const isRestocking = product.stockStatus === 'restocking';
                            const isUnavailable = isOutOfStock || isRestocking;
                            const cartItem = cart.find(i => i.product.id === product.id);

                            return (
                              <Card 
                                key={product.id} 
                                onClick={() => setSelectedProduct(product)}
                                className={`group relative overflow-hidden rounded-2xl bg-white dark:bg-white/[0.03] hover:bg-slate-50/90 dark:hover:bg-white/[0.07] border border-slate-200 dark:border-white/10 hover:border-primary/50 dark:hover:border-primary/40 transition-all duration-300 flex flex-col cursor-pointer shadow-xs hover:shadow-xl hover:shadow-primary/10 ${isUnavailable ? 'opacity-60 bg-slate-100 dark:bg-black/20' : ''}`}
                              >
                                {/* Product Image Container */}
                                <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-black/40">
                                  <img 
                                    src={product.image} 
                                    className={`w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 ${isUnavailable ? 'grayscale' : ''}`}
                                    alt={product.name} 
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                                  
                                  {/* Badges Overlay */}
                                  <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                                    {product.slashPrice && product.slashPrice > product.price && !isUnavailable && (
                                      <span className="bg-rose-600 !text-white font-black text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-md uppercase tracking-wider shadow-md" style={{ color: '#ffffff' }}>
                                        -{Math.round(((product.slashPrice - product.price) / product.slashPrice) * 100)}%
                                      </span>
                                    )}
                                    {isOutOfStock && (
                                      <span className="bg-red-600/95 !text-white font-black text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-md uppercase tracking-wider shadow-md" style={{ color: '#ffffff' }}>
                                        Sold Out
                                      </span>
                                    )}
                                    {isRestocking && (
                                      <span className="bg-amber-600/95 !text-white font-black text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-md uppercase tracking-wider shadow-md" style={{ color: '#ffffff' }}>
                                        Restocking
                                      </span>
                                    )}
                                  </div>

                                  {/* Category Badge (Top Right) */}
                                  <div className="absolute top-2 right-2 z-10">
                                    <span 
                                      className="bg-black/75 backdrop-blur-md !text-white font-black text-[8px] sm:text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider border border-white/20 shadow-md"
                                      style={{ color: '#ffffff' }}
                                    >
                                      {product.category || 'Snacks'}
                                    </span>
                                  </div>

                                  {/* Floating Star Rating */}
                                  {(() => {
                                    const vendorObj = vendors.find(v => v.id === product.vendorId);
                                    const ratingVal = product.rating ? Number(product.rating).toFixed(1) : (vendorObj?.rating ? Number(vendorObj.rating).toFixed(1) : '5.0');
                                    const reviewCount = product.reviewCount || vendorObj?.ratingCount || 0;
                                    return (
                                      <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/20 text-amber-400 text-[10px] font-black shadow-md" style={{ color: '#f59e0b' }}>
                                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                                        <span className="font-black" style={{ color: '#f59e0b' }}>{ratingVal}</span>
                                        {reviewCount > 0 && (
                                          <span className="!text-white/70 text-[8px] font-bold hidden sm:inline" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>({reviewCount})</span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>

                                {/* Content Details */}
                                <div className="p-2.5 sm:p-3.5 flex-1 flex flex-col justify-between gap-2.5">
                                  <div className="space-y-0.5">
                                    {(() => {
                                      const vendorObj = vendors.find(v => v.id === product.vendorId);
                                      return (
                                        <p className="text-[9px] sm:text-[10px] text-slate-600 dark:text-muted-foreground font-bold uppercase tracking-wider truncate">
                                          {vendorObj?.name || 'Cinema Kitchen'}
                                        </p>
                                      );
                                    })()}
                                    <h4 className="font-black text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-primary transition-colors tracking-tight leading-snug">
                                      {product.name}
                                    </h4>
                                    {product.description && (
                                      <p className="hidden sm:line-clamp-1 text-[11px] text-slate-600 dark:text-muted-foreground font-medium leading-tight pt-0.5">
                                        {product.description}
                                      </p>
                                    )}
                                  </div>
                                  
                                  {/* Price & Action Button Row */}
                                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-white/5 gap-2">
                                    <div className="flex flex-col min-w-0">
                                      {product.slashPrice && product.slashPrice > product.price && (
                                        <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-muted-foreground line-through italic decoration-rose-500/60 font-semibold leading-none mb-0.5">
                                          ₦{product.slashPrice.toLocaleString()}
                                        </span>
                                      )}
                                      <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 tracking-tight leading-none truncate">
                                        ₦{product.price.toLocaleString()}
                                      </span>
                                    </div>

                                    {cartItem ? (
                                      <div 
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-1 sm:gap-1.5 bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/40 rounded-xl p-0.5 sm:p-1"
                                      >
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateQuantity(product.id, -1);
                                          }}
                                          className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-white dark:bg-black/40 hover:bg-slate-100 dark:hover:bg-black/60 flex items-center justify-center text-slate-800 dark:text-white transition-colors shadow-2xs border border-slate-200 dark:border-none"
                                          title="Decrease"
                                        >
                                          <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                        </button>
                                        <span className="text-[11px] sm:text-xs font-black text-slate-900 dark:text-white w-3.5 sm:w-4 text-center">
                                          {cartItem.quantity}
                                        </span>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateQuantity(product.id, 1);
                                          }}
                                          className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-primary !text-white hover:bg-primary/80 flex items-center justify-center transition-colors shadow-2xs"
                                          style={{ color: '#ffffff' }}
                                          title="Increase"
                                        >
                                          <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <Button 
                                        size="sm" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          addToCart(product, 1);
                                        }}
                                        disabled={isUnavailable}
                                        className={`h-7 sm:h-8 px-2.5 sm:px-3 rounded-xl font-black uppercase text-[9px] sm:text-[10px] tracking-wider transition-all active:scale-95 flex-shrink-0 ${
                                          isUnavailable 
                                            ? 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-400 dark:text-muted-foreground cursor-not-allowed' 
                                            : 'gradient-bg !text-white shadow-md shadow-primary/20 hover:brightness-110'
                                        }`}
                                        style={!isUnavailable ? { color: '#ffffff' } : undefined}
                                      >
                                        {isOutOfStock ? 'Sold Out' : isRestocking ? 'Restock' : (
                                          <span className="flex items-center gap-1" style={{ color: '#ffffff' }}>
                                            <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                            <span>Add</span>
                                          </span>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </>
                )}

                {/* 2. CART TAB - PRO E-COMMERCE CART EXPERIENCE */}
                {activeTab === 'cart' && (
                  <motion.div 
                    key="cart-view"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="space-y-6"
                  >
                    {cart.length === 0 ? (
                      <div className="py-16 text-center space-y-5">
                        <div className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-white/10 flex items-center justify-center mx-auto text-slate-800 dark:text-white border-2 border-slate-300 dark:border-white/15 shadow-sm">
                          <ShoppingBag className="w-12 h-12 stroke-[1.8]" />
                        </div>
                        <div className="space-y-1.5">
                          <h3 className="font-black uppercase tracking-tight text-xl text-slate-900 dark:text-white">Your Shopping Cart is Empty</h3>
                          <p className="text-xs text-slate-600 dark:text-muted-foreground font-semibold max-w-sm mx-auto">
                            Browse fresh cinema popcorn, cold beverages, and sweet refreshments delivered straight to your hall seat.
                          </p>
                        </div>
                        <Button 
                          onClick={() => setActiveTab('store')} 
                          className="cinema-order-now-btn h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 !text-white dark:!text-slate-900 transition-all shadow-lg active:scale-95"
                        >
                          <Store className="w-4 h-4 mr-2" /> Explore Snacks Menu
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Cart Header Banner */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-100/90 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
                              <ShoppingBag className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-tight">Your Cart Items</h3>
                              <p className="text-[10px] text-slate-600 dark:text-muted-foreground font-bold">
                                {cart.reduce((s, i) => s + i.quantity, 0)} {cart.reduce((s, i) => s + i.quantity, 0) === 1 ? 'item' : 'items'} ready for cinema delivery
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveTab('store')}
                              className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white transition-all border border-slate-300 dark:border-white/15 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 text-primary" /> Add More
                            </button>
                            <button
                              type="button"
                              onClick={() => setCart([])}
                              className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 transition-all border border-rose-500/20 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Clear
                            </button>
                          </div>
                        </div>

                        {/* E-Commerce 2-Column Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                          {/* Left Column: Cart Items List */}
                          <div className="lg:col-span-7 xl:col-span-8 space-y-3">
                            {cart.map((item) => {
                              const vendorObj = vendors.find(v => v.id === item.product.vendorId);
                              return (
                                <div 
                                  key={item.product.id}
                                  className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all shadow-xs space-y-3"
                                >
                                  <div className="flex items-start gap-3 sm:gap-4">
                                    {/* Product Image */}
                                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 shrink-0">
                                      <img 
                                        src={item.product.image} 
                                        alt={item.product.name} 
                                        className="w-full h-full object-cover"
                                      />
                                      {item.product.category && (
                                        <div className="absolute bottom-1 left-1 right-1">
                                          <span className="block text-center bg-black/80 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-wider py-0.5 rounded-md">
                                            {item.product.category}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Product Details & Header */}
                                    <div className="flex-1 min-w-0 space-y-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className="text-[9px] sm:text-[10px] text-slate-600 dark:text-muted-foreground font-bold uppercase tracking-wider truncate">
                                            {vendorObj?.name || 'Cinema Kitchen'}
                                          </p>
                                          <h4 className="font-black text-sm sm:text-base uppercase text-slate-900 dark:text-white leading-tight">
                                            {item.product.name}
                                          </h4>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => removeFromCart(item.product.id)}
                                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 transition-all cursor-pointer"
                                          title="Remove from cart"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>

                                      <div className="flex items-baseline gap-2 pt-0.5">
                                        <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                                          ₦{item.product.price.toLocaleString()}
                                        </span>
                                        {item.product.slashPrice && item.product.slashPrice > item.product.price && (
                                          <span className="text-[10px] text-slate-500 dark:text-muted-foreground line-through font-bold">
                                            ₦{item.product.slashPrice.toLocaleString()}
                                          </span>
                                        )}
                                        <span className="text-[10px] text-slate-500 dark:text-muted-foreground font-semibold">each</span>
                                      </div>

                                      {/* Stepper + Total Row */}
                                      <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-white/5">
                                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-black/40 rounded-xl border border-slate-300 dark:border-white/15 p-1 shadow-2xs">
                                          <button 
                                            type="button"
                                            onClick={() => updateQuantity(item.product.id, -1)} 
                                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-900 dark:text-white flex items-center justify-center transition-colors border border-slate-200 dark:border-white/10 cursor-pointer"
                                            aria-label="Decrease quantity"
                                          >
                                            <Minus className="w-3.5 h-3.5 text-slate-900 dark:text-white" />
                                          </button>
                                          <span className="text-xs font-black w-7 text-center text-slate-900 dark:text-white">
                                            {item.quantity}
                                          </span>
                                          <button 
                                            type="button"
                                            onClick={() => updateQuantity(item.product.id, 1)} 
                                            className="w-7 h-7 rounded-lg bg-primary hover:bg-primary/90 text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                                            aria-label="Increase quantity"
                                          >
                                            <Plus className="w-3.5 h-3.5 text-white" />
                                          </button>
                                        </div>

                                        <div className="text-right">
                                          <p className="text-[9px] font-bold uppercase text-slate-500 dark:text-muted-foreground">Item Subtotal</p>
                                          <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-tight leading-none">
                                            ₦{(item.product.price * item.quantity).toLocaleString()}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Add More Snacks Banner */}
                            <div 
                              onClick={() => setActiveTab('store')}
                              className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100/90 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] border-2 border-dashed border-slate-300 dark:border-white/15 flex items-center justify-between cursor-pointer transition-all group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-primary/10 group-hover:bg-primary/20 text-primary flex items-center justify-center transition-colors">
                                  <Plus className="w-5 h-5" />
                                </div>
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-900 dark:text-white">Craving something else?</p>
                                  <p className="text-[10px] text-slate-600 dark:text-muted-foreground font-semibold">Explore popcorn, sodas, nachos, or candies</p>
                                </div>
                              </div>
                              <span className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1">
                                Browse Store <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                              </span>
                            </div>
                          </div>

                          {/* Right Column: Sticky Order Summary */}
                          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                            <div className="p-6 rounded-3xl bg-slate-50/90 dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 space-y-5 shadow-sm">
                              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
                                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                                  <Receipt className="w-4 h-4 text-primary" /> Order Summary
                                </h3>
                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase">
                                  Free Seat Delivery
                                </Badge>
                              </div>

                              <div className="space-y-3 text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-600 dark:text-muted-foreground">Items Subtotal</span>
                                  <span className="text-slate-900 dark:text-white font-black">₦{cartTotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-600 dark:text-muted-foreground">Delivery To Seat</span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-black">FREE</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-600 dark:text-muted-foreground">Estimated Time</span>
                                  <span className="text-amber-600 dark:text-amber-400 font-black">5 - 10 Mins</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-600 dark:text-muted-foreground">Estimated Tax</span>
                                  <span className="text-slate-900 dark:text-white font-black">₦0.00</span>
                                </div>
                              </div>

                              <div className="pt-4 border-t-2 border-slate-200 dark:border-white/10 flex items-baseline justify-between">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-muted-foreground">Total to Pay</p>
                                  <p className="text-xs text-slate-500 dark:text-muted-foreground font-semibold">Wallet / Direct Debit</p>
                                </div>
                                <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                                  ₦{cartTotal.toLocaleString()}
                                </p>
                              </div>

                              {/* Seat Delivery Guarantee Note */}
                              <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 space-y-1">
                                <div className="flex items-center gap-2 text-primary text-xs font-black uppercase">
                                  <Truck className="w-4 h-4" /> Instant Seat Delivery
                                </div>
                                <p className="text-[10px] text-slate-700 dark:text-white/80 font-semibold leading-relaxed">
                                  Your snacks will be freshly prepared and brought to your specific cinema room seat.
                                </p>
                              </div>

                              {/* Checkout Button */}
                              <Button 
                                onClick={() => setActiveTab('checkout')}
                                className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs gradient-bg !text-white shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                style={{ color: '#ffffff' }}
                              >
                                <span style={{ color: '#ffffff' }}>Proceed to Checkout</span>
                                <ChevronRight className="w-4 h-4 text-white" style={{ color: '#ffffff' }} />
                              </Button>

                              {/* Trust Highlights */}
                              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-white/10 text-center">
                                <div className="space-y-0.5">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mx-auto" />
                                  <p className="text-[8px] font-black uppercase text-slate-700 dark:text-muted-foreground">Safe Pay</p>
                                </div>
                                <div className="space-y-0.5">
                                  <Flame className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 mx-auto" />
                                  <p className="text-[8px] font-black uppercase text-slate-700 dark:text-muted-foreground">Fresh Made</p>
                                </div>
                                <div className="space-y-0.5">
                                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mx-auto" />
                                  <p className="text-[8px] font-black uppercase text-slate-700 dark:text-muted-foreground">Fast Delivery</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* 3. CHECKOUT TAB */}
                {activeTab === 'checkout' && (
                  <motion.div 
                    key="checkout-form"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-8"
                  >
                    <div className="space-y-6">
                      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-900 dark:text-white">
                        <MapPin className="w-4 h-4 text-primary" /> Delivery Details
                      </h3>
                      <form id="checkout-form" onSubmit={handleCheckout} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-900 dark:text-slate-300 ml-1">Full Name</label>
                          <input 
                            required
                            className="w-full bg-white dark:bg-white/5 border-2 border-slate-300 dark:border-white/10 rounded-xl p-3 text-xs outline-none focus:border-primary text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60 shadow-xs font-semibold" 
                            placeholder="John Doe"
                            value={deliveryInfo.name}
                            onChange={e => setDeliveryInfo({...deliveryInfo, name: e.target.value})}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-900 dark:text-slate-300 ml-1">Phone Number</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-muted-foreground" />
                            <input 
                              required
                              type="tel"
                              className="w-full bg-white dark:bg-white/5 border-2 border-slate-300 dark:border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs outline-none focus:border-primary text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60 shadow-xs font-semibold" 
                              placeholder="08012345678"
                              value={deliveryInfo.phone}
                              onChange={e => setDeliveryInfo({...deliveryInfo, phone: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-900 dark:text-slate-300 ml-1">Email Address</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-muted-foreground" />
                            <input 
                              required
                              type="email"
                              className="w-full bg-white dark:bg-white/5 border-2 border-slate-300 dark:border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs outline-none focus:border-primary text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60 shadow-xs font-semibold" 
                              placeholder="john@example.com"
                              value={deliveryInfo.email}
                              onChange={e => setDeliveryInfo({...deliveryInfo, email: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-900 dark:text-slate-300 ml-1">Seat Location / Hall Room Number</label>
                          <textarea 
                            required
                            className="w-full bg-white dark:bg-white/5 border-2 border-slate-300 dark:border-white/10 rounded-xl p-3 text-xs outline-none focus:border-primary h-24 resize-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground/60 shadow-xs font-semibold" 
                            placeholder="Cinema Hall 2, Row F, Seat 14..."
                            value={deliveryInfo.address}
                            onChange={e => setDeliveryInfo({...deliveryInfo, address: e.target.value})}
                          />
                        </div>
                      </form>
                    </div>

                    <div className="space-y-6">
                      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-900 dark:text-white">
                        <CreditCard className="w-4 h-4 text-primary" /> Order Summary
                      </h3>
                      <Card className="p-6 bg-white dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 space-y-4 rounded-2xl shadow-xs">
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                          {cart.map(item => (
                            <div key={item.product.id} className="flex justify-between text-xs font-bold uppercase tracking-tight text-slate-900 dark:text-white">
                              <span className="text-slate-700 dark:text-muted-foreground">{item.quantity}x {item.product.name}</span>
                              <span className="text-slate-900 dark:text-white font-black">₦{(item.product.price * item.quantity).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2">
                          <div className="flex justify-between text-xs font-bold uppercase text-slate-900 dark:text-white">
                            <span className="text-slate-700 dark:text-muted-foreground">Subtotal</span>
                            <span className="text-slate-900 dark:text-white font-black">₦{cartTotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold uppercase text-slate-900 dark:text-white">
                            <span className="text-slate-700 dark:text-muted-foreground">Delivery Fee</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-black">FREE</span>
                          </div>
                          <div className="flex justify-between text-lg font-black uppercase pt-2 border-t border-slate-200 dark:border-white/5 text-slate-900 dark:text-white">
                            <span>Total</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-black">₦{cartTotal.toLocaleString()}</span>
                          </div>
                        </div>
                        
                        <div className="pt-4 space-y-3">
                          <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/20">
                            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                            <p className="text-[9px] text-primary font-bold uppercase leading-tight">By clicking confirm, order details will be sent to the vendor for immediate fulfillment.</p>
                          </div>
                          <Button 
                            type="submit"
                            form="checkout-form"
                            disabled={isSubmitting}
                            className="w-full h-14 rounded-xl font-black uppercase tracking-widest text-xs gradient-bg !text-white shadow-2xl shadow-primary/20"
                            style={{ color: '#ffffff' }}
                          >
                            {isSubmitting ? 'Processing...' : 'Confirm Order & Pay'}
                          </Button>
                          <p className="text-[8px] text-center text-slate-600 dark:text-muted-foreground uppercase font-black tracking-widest">Secured Payment via Wallet</p>
                        </div>
                      </Card>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

