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
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Zap,
  Clock,
  Check
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
          const notifRef = collection(db, 'users', user.uid, 'notifications');
          await addDoc(notifRef, {
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
          });
          await updateDoc(doc(db, 'users', user.uid), { unreadCount: increment(1) });
        } catch (ne) {
          console.warn('Failed to add in-app purchase notification:', ne);
        }

        // Credit Vendor Wallet (70% Share) & Log Earnings Stats
        const vendorShare = orderTotal * 0.70;
        const platformShare = orderTotal * 0.30;
        const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);

        const vendorWalletRef = doc(db, 'room_wallets', vendorId);
        await setDoc(vendorWalletRef, {
          funded_balance: increment(vendorShare),
          balance: increment(vendorShare),
          vendor_earnings: increment(vendorShare),
          vendor_revenue: increment(orderTotal),
          vendor_sales_count: increment(itemsCount),
          vendor_fees: increment(platformShare)
        }, { merge: true });

        // Save Vendor Transaction Log
        await addDoc(txCol, {
          user_uid: vendorId,
          type: 'vendor_earning',
          amount: vendorShare,
          title: `Earning from order #${orderNumber} (${orderData.items.map(i => `${i.quantity}x ${i.name}`).join(', ')})`,
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
            className="absolute inset-0 bg-black/90 backdrop-blur-xl"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-5xl max-h-[92vh] glass-card border-white/10 flex flex-col overflow-hidden z-[3001] shadow-2xl rounded-3xl"
          >
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20 shadow-lg shadow-primary/10">
                  <Store className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">Cinema Snack Store</h2>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Premium Refreshments Delivered to your seat</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 sm:gap-4">
                <button 
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('cart');
                  }}
                  className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10"
                >
                  <ShoppingBag className="w-5 h-5 text-white" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-black animate-pulse">
                      {cart.reduce((s, i) => s + i.quantity, 0)}
                    </span>
                  )}
                </button>
                <button onClick={onClose} className="p-2.5 rounded-xl hover:bg-white/10 transition-colors border border-transparent hover:border-white/10">
                  <X className="w-5 h-5 text-muted-foreground hover:text-white" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex px-4 sm:px-6 pt-3 gap-6 overflow-x-auto no-scrollbar border-b border-white/5 bg-black/20">
              <button 
                onClick={() => {
                  setSelectedProduct(null);
                  setActiveTab('store');
                }}
                className={`pb-2.5 text-[10px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap flex items-center gap-2 ${activeTab === 'store' ? 'text-primary' : 'text-muted-foreground hover:text-white'}`}
              >
                <Store className="w-3.5 h-3.5" /> Snacks Menu
                {activeTab === 'store' && <motion.div layoutId="storeTab" className="absolute -bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
              <button 
                onClick={() => {
                  setSelectedProduct(null);
                  setActiveTab('cart');
                }}
                className={`pb-2.5 text-[10px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap flex items-center gap-2 ${activeTab === 'cart' ? 'text-primary' : 'text-muted-foreground hover:text-white'}`}
              >
                <ShoppingBag className="w-3.5 h-3.5" /> Shopping Cart {cart.length > 0 && `(${cart.length})`}
                {activeTab === 'cart' && <motion.div layoutId="storeTab" className="absolute -bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
              <button 
                disabled={cart.length === 0}
                onClick={() => {
                  setSelectedProduct(null);
                  setActiveTab('checkout');
                }}
                className={`pb-2.5 text-[10px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap flex items-center gap-2 ${activeTab === 'checkout' ? 'text-primary' : 'text-muted-foreground hover:text-white'} disabled:opacity-30`}
              >
                <CreditCard className="w-3.5 h-3.5" /> Checkout
                {activeTab === 'checkout' && <motion.div layoutId="storeTab" className="absolute -bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
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
                            onClick={() => setSelectedProduct(null)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-white transition-all border border-white/10"
                          >
                            <ArrowLeft className="w-4 h-4" /> Back to Snacks Menu
                          </button>
                          
                          <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            <span>Store</span>
                            <span>/</span>
                            <span className="text-primary">{selectedProduct.category}</span>
                            <span>/</span>
                            <span className="text-white truncate max-w-[160px]">{selectedProduct.name}</span>
                          </div>
                        </div>

                        {/* Product Detail Layout: 2 Columns */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                          {/* Left: Product Image & Highlights */}
                          <div className="space-y-4">
                            <div className="relative aspect-square rounded-3xl overflow-hidden bg-black/40 border border-white/10 shadow-2xl group">
                              <img
                                src={selectedProduct.image}
                                alt={selectedProduct.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
                              
                              {/* Badges */}
                              <div className="absolute top-3 left-3 flex flex-col gap-2">
                                {selectedProduct.slashPrice && (
                                  <Badge className="bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest px-3 py-1 shadow-lg">
                                    Special Offer
                                  </Badge>
                                )}
                                <Badge className="bg-black/60 backdrop-blur-md text-white font-bold text-[9px] uppercase tracking-widest px-3 py-1 border border-white/10">
                                  {selectedProduct.category}
                                </Badge>
                              </div>

                              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-black uppercase text-white/90 bg-black/60 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                                <div className="flex items-center gap-2">
                                  <Zap className="w-4 h-4 text-amber-400" />
                                  <span>Instant Seat Delivery</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-emerald-400">
                                  <ShieldCheck className="w-4 h-4" />
                                  <span>Verified Quality</span>
                                </div>
                              </div>
                            </div>

                            {/* Service Badges */}
                            <div className="grid grid-cols-3 gap-3">
                              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center space-y-1">
                                <Sparkles className="w-4 h-4 text-primary mx-auto" />
                                <p className="text-[9px] font-black uppercase tracking-wider">Fresh & Hot</p>
                                <p className="text-[8px] text-muted-foreground">Made on order</p>
                              </div>
                              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center space-y-1">
                                <Clock className="w-4 h-4 text-amber-400 mx-auto" />
                                <p className="text-[9px] font-black uppercase tracking-wider">5-10 Mins</p>
                                <p className="text-[8px] text-muted-foreground">Delivery time</p>
                              </div>
                              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center space-y-1">
                                <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto" />
                                <p className="text-[9px] font-black uppercase tracking-wider">Safe Pay</p>
                                <p className="text-[8px] text-muted-foreground">Wallet secured</p>
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
                                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-black">
                                        <Star className="w-3.5 h-3.5 fill-current" />
                                        <span>{stats.avg}</span>
                                      </div>
                                      <span className="text-xs text-muted-foreground font-bold">
                                        ({stats.total} {stats.total === 1 ? 'Customer Review' : 'Customer Reviews'})
                                      </span>
                                    </div>

                                    <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white leading-tight">
                                      {selectedProduct.name}
                                    </h1>

                                    {/* Vendor Badge */}
                                    <div className="flex items-center gap-2 pt-1">
                                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-black border border-primary/20">
                                        <Store className="w-3 h-3" />
                                      </div>
                                      <p className="text-xs text-muted-foreground font-bold">
                                        Sold & Prepared by <span className="text-white font-black">{vendorObj?.name || 'Cinema Kitchen'}</span>
                                      </p>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            {/* Price Section */}
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pricing</p>
                              <div className="flex items-baseline gap-3">
                                <span className="text-3xl font-black text-emerald-400 tracking-tight">
                                  ₦{selectedProduct.price.toLocaleString()}
                                </span>
                                {selectedProduct.slashPrice && (
                                  <>
                                    <span className="text-sm text-muted-foreground line-through decoration-rose-500/60 font-bold">
                                      ₦{selectedProduct.slashPrice.toLocaleString()}
                                    </span>
                                    <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase">
                                      Save ₦{(selectedProduct.slashPrice - selectedProduct.price).toLocaleString()}
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Stock Status */}
                            <div className="flex items-center gap-2">
                              {selectedProduct.stockStatus === 'out_of_stock' || selectedProduct.inStock === false ? (
                                <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold uppercase">
                                  Out of Stock
                                </Badge>
                              ) : selectedProduct.stockStatus === 'restocking' ? (
                                <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold uppercase">
                                  Restocking Soon
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase flex items-center gap-1.5">
                                  <Check className="w-3 h-3" /> In Stock & Ready to Deliver
                                </Badge>
                              )}
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Product Description</h3>
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {selectedProduct.description || 'Enjoy our delicious cinema snack, prepared with premium ingredients for the ultimate movie-watching experience.'}
                              </p>
                            </div>

                            {/* Quantity Selector & Add To Cart CTA */}
                            {selectedProduct.stockStatus !== 'out_of_stock' && selectedProduct.inStock !== false ? (
                              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Select Quantity:</span>
                                  <div className="flex items-center gap-3 bg-white/5 rounded-xl border border-white/10 p-1">
                                    <button 
                                      onClick={() => setDetailQuantity(q => Math.max(1, q - 1))}
                                      className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
                                    >
                                      <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="text-sm font-black w-6 text-center text-white">{detailQuantity}</span>
                                    <button 
                                      onClick={() => setDetailQuantity(q => q + 1)}
                                      className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-xs font-bold uppercase pt-2 border-t border-white/5">
                                  <span className="text-muted-foreground">Subtotal:</span>
                                  <span className="text-lg font-black text-emerald-400">
                                    ₦{(selectedProduct.price * detailQuantity).toLocaleString()}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                  <Button
                                    onClick={() => addToCart(selectedProduct, detailQuantity)}
                                    className="h-12 rounded-xl font-black uppercase tracking-widest text-xs gradient-bg shadow-xl"
                                  >
                                    <ShoppingBag className="w-4 h-4 mr-2" /> Add to Cart
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      addToCart(selectedProduct, detailQuantity);
                                      setActiveTab('checkout');
                                    }}
                                    variant="outline"
                                    className="h-12 rounded-xl font-black uppercase tracking-widest text-xs border-primary/40 text-primary hover:bg-primary/10"
                                  >
                                    Order Now <ChevronRight className="w-4 h-4 ml-1" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-1">
                                <p className="text-xs font-black uppercase text-red-400">Currently Unavailable</p>
                                <p className="text-[10px] text-muted-foreground">This snack is temporarily sold out. Please choose another delicious item from the menu.</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Customer Reviews & Feedback Section */}
                        <div className="pt-8 border-t border-white/10 space-y-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-primary" /> Customer Reviews & Ratings
                              </h3>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                Verified feedback from moviegoers who ordered this snack
                              </p>
                            </div>
                            <Badge className="bg-white/5 text-muted-foreground border border-white/10 font-black text-xs">
                              {productReviews.length} {productReviews.length === 1 ? 'Review' : 'Reviews'}
                            </Badge>
                          </div>

                          {/* Rating Breakdown Card */}
                          {(() => {
                            const vendorObj = vendors.find(v => v.id === selectedProduct.vendorId);
                            const stats = calculateRatingStats(productReviews, selectedProduct.rating || vendorObj?.rating || 5.0);
                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6 rounded-3xl bg-white/5 border border-white/10 items-center">
                                <div className="text-center sm:text-left space-y-2 sm:border-r sm:border-white/10 sm:pr-6">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Average Rating</p>
                                  <div className="text-4xl sm:text-5xl font-black text-amber-400 tracking-tight flex items-center justify-center sm:justify-start gap-2">
                                    <span>{stats.avg}</span>
                                    <Star className="w-8 h-8 fill-current text-amber-400" />
                                  </div>
                                  <p className="text-xs text-muted-foreground font-bold">
                                    Based on {stats.total} verified reviews
                                  </p>
                                </div>

                                <div className="sm:col-span-2 space-y-2">
                                  {[5, 4, 3, 2, 1].map((starVal) => {
                                    const pct = (stats.breakdown as any)[starVal] || 0;
                                    return (
                                      <div key={starVal} className="flex items-center gap-3 text-xs font-bold">
                                        <span className="w-8 text-right text-muted-foreground flex items-center justify-end gap-1">
                                          {starVal} <Star className="w-3 h-3 fill-current text-amber-400" />
                                        </span>
                                        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                                          <div 
                                            className="h-full bg-amber-400 rounded-full transition-all duration-500" 
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                        <span className="w-10 text-right text-muted-foreground text-[10px] font-black">
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
                              <div className="py-12 text-center text-muted-foreground space-y-2">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                                <p className="text-xs uppercase font-bold tracking-widest">Loading reviews...</p>
                              </div>
                            ) : productReviews.length === 0 ? (
                              <div className="py-12 text-center p-8 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                                  <Star className="w-6 h-6" />
                                </div>
                                <h4 className="text-sm font-black uppercase tracking-wider text-white">No Reviews Yet</h4>
                                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                  Order this snack today and be the first to rate your experience when delivered!
                                </p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {productReviews.map((rev) => (
                                  <div
                                    key={rev.id}
                                    className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 flex flex-col justify-between"
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center text-white font-black text-xs shadow-md">
                                            {(rev.userName || 'C').charAt(0).toUpperCase()}
                                          </div>
                                          <div>
                                            <p className="text-xs font-black uppercase text-white leading-tight">
                                              {rev.userName || 'Verified Customer'}
                                            </p>
                                            <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold uppercase">
                                              <ShieldCheck className="w-3 h-3" /> Verified Order
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex items-center text-amber-400">
                                          {[1, 2, 3, 4, 5].map((s) => (
                                            <Star
                                              key={s}
                                              className={`w-3.5 h-3.5 ${s <= (rev.rating || 5) ? 'fill-current' : 'text-white/20'}`}
                                            />
                                          ))}
                                        </div>
                                      </div>

                                      <p className="text-xs text-white/90 leading-relaxed italic bg-black/20 p-3 rounded-xl border border-white/5">
                                        "{rev.review || 'Great snack! Arrived on time and freshly prepared.'}"
                                      </p>
                                    </div>

                                    <div className="text-[10px] text-muted-foreground font-bold pt-2 border-t border-white/5 flex items-center justify-between">
                                      <span>Order #{rev.orderId?.slice(0, 8) || 'STORE'}</span>
                                      <span>{formatReviewDate(rev.createdAt)}</span>
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
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Our Cinema Partners</h3>
                            <div className="flex flex-wrap gap-3">
                              {partners.map(partner => (
                                <div key={partner.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                                  <img src={partner.logo} className="w-5 h-5 object-contain" alt={partner.name} />
                                  <span className="text-[9px] font-bold uppercase">{partner.name}</span>
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
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedCategory === cat ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-muted-foreground hover:text-white border border-white/10'}`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Products Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                          {filteredProducts.map(product => {
                            const isOutOfStock = product.stockStatus === 'out_of_stock' || product.inStock === false || product.available === false;
                            const isRestocking = product.stockStatus === 'restocking';
                            const isUnavailable = isOutOfStock || isRestocking;

                            return (
                              <Card 
                                key={product.id} 
                                onClick={() => setSelectedProduct(product)}
                                className={`overflow-hidden glass-card border-white/10 group flex flex-col transition-all duration-300 cursor-pointer hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10 ${isUnavailable ? 'opacity-60 bg-black/20' : ''}`}
                              >
                                <div className="relative aspect-square overflow-hidden bg-black/40">
                                  <img 
                                    src={product.image} 
                                    className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isUnavailable ? 'grayscale' : ''}`}
                                    alt={product.name} 
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-black/80 px-2.5 py-1 rounded-lg border border-primary/30 backdrop-blur-md">
                                      View Product Details →
                                    </span>
                                  </div>
                                  {product.slashPrice && !isUnavailable && (
                                    <Badge className="absolute top-2 left-2 bg-rose-600 text-[9px] font-black uppercase tracking-wider">
                                      Sale
                                    </Badge>
                                  )}
                                  {isOutOfStock && (
                                    <Badge className="absolute top-2 left-2 bg-red-600 text-[9px] font-black uppercase">
                                      Out of Stock
                                    </Badge>
                                  )}
                                  {isRestocking && (
                                    <Badge className="absolute top-2 left-2 bg-amber-600 text-[9px] font-black uppercase">
                                      Restocking
                                    </Badge>
                                  )}
                                </div>
                                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                                  <div className="space-y-1">
                                    {(() => {
                                      const vendorObj = vendors.find(v => v.id === product.vendorId);
                                      const ratingVal = product.rating ? Number(product.rating).toFixed(1) : (vendorObj?.rating ? Number(vendorObj.rating).toFixed(1) : '5.0');
                                      const reviewCount = product.reviewCount || vendorObj?.ratingCount || 0;
                                      return (
                                        <>
                                          <div className="flex justify-between items-start">
                                            <h4 className="font-black text-sm uppercase leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                                              {product.name}
                                            </h4>
                                            <div className="flex items-center text-amber-500 flex-shrink-0" title={reviewCount > 0 ? `${reviewCount} reviews` : '5.0 rating'}>
                                              <Star className="w-3 h-3 fill-current" />
                                              <span className="text-[10px] font-black ml-1">{ratingVal}</span>
                                              {reviewCount > 0 && (
                                                <span className="text-[8px] text-muted-foreground ml-0.5 font-bold">({reviewCount})</span>
                                              )}
                                            </div>
                                          </div>
                                          <p className="text-[10px] text-muted-foreground font-bold italic truncate">
                                            by {vendorObj?.name || 'Cinema Kitchen'}
                                          </p>
                                        </>
                                      );
                                    })()}
                                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
                                      {product.description}
                                    </p>
                                  </div>
                                  
                                  <div className="pt-2 flex items-center justify-between border-t border-white/5">
                                    <div className="flex flex-col">
                                      {product.slashPrice && (
                                        <span className="text-[10px] text-muted-foreground line-through italic decoration-rose-500/50 font-bold">
                                          ₦{product.slashPrice.toLocaleString()}
                                        </span>
                                      )}
                                      <span className="text-sm font-black text-emerald-400 tracking-tighter">
                                        ₦{product.price.toLocaleString()}
                                      </span>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addToCart(product, 1);
                                      }}
                                      disabled={isUnavailable}
                                      className={`h-9 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest ${isUnavailable ? 'bg-white/5 border border-white/10 text-muted-foreground cursor-not-allowed' : 'gradient-bg shadow-md'}`}
                                    >
                                      {isOutOfStock ? 'Sold Out' : isRestocking ? 'Restock' : <><Plus className="w-3.5 h-3.5 mr-1" /> Add</>}
                                    </Button>
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

                {/* 2. CART TAB */}
                {activeTab === 'cart' && (
                  <motion.div 
                    key="cart-view"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    {cart.length === 0 ? (
                      <div className="py-20 text-center space-y-4">
                        <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mx-auto text-muted-foreground border border-white/10">
                          <ShoppingBag className="w-10 h-10" />
                        </div>
                        <h3 className="font-black uppercase tracking-widest text-lg">Your cart is empty</h3>
                        <p className="text-xs text-muted-foreground max-w-xs mx-auto">Browse our delicious cinema refreshments and add them to your cart.</p>
                        <Button onClick={() => setActiveTab('store')} variant="outline" className="rounded-xl font-black uppercase tracking-widest text-[10px] border-primary/30 text-primary">
                          Explore Snacks Menu
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3">
                          {cart.map(item => (
                            <Card key={item.product.id} className="p-4 glass-card border-white/10 flex items-center gap-4">
                              <img src={item.product.image} className="w-16 h-16 rounded-xl object-cover border border-white/10" alt={item.product.name} />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-black text-sm uppercase truncate">{item.product.name}</h4>
                                <p className="text-[10px] text-muted-foreground font-bold italic">₦{item.product.price.toLocaleString()} each</p>
                              </div>
                              <div className="flex items-center gap-3 bg-white/5 rounded-xl border border-white/10 p-1">
                                <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 hover:text-primary transition-colors"><Minus className="w-3.5 h-3.5" /></button>
                                <span className="text-xs font-black w-4 text-center">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 hover:text-primary transition-colors"><Plus className="w-3.5 h-3.5" /></button>
                              </div>
                              <div className="text-right min-w-[80px]">
                                <p className="text-sm font-black text-emerald-400">₦{(item.product.price * item.quantity).toLocaleString()}</p>
                              </div>
                              <button onClick={() => removeFromCart(item.product.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </Card>
                          ))}
                        </div>
                        
                        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order Total</p>
                            <p className="text-2xl font-black text-emerald-400">₦{cartTotal.toLocaleString()}</p>
                          </div>
                          <Button 
                            onClick={() => setActiveTab('checkout')}
                            className="w-full sm:w-auto h-12 px-8 rounded-xl font-black uppercase tracking-widest text-xs gradient-bg shadow-xl"
                          >
                            Proceed to Checkout <ChevronRight className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      </>
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
                      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" /> Delivery Details
                      </h3>
                      <form id="checkout-form" onSubmit={handleCheckout} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Full Name</label>
                          <input 
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs outline-none focus:border-primary/50 text-white" 
                            placeholder="John Doe"
                            value={deliveryInfo.name}
                            onChange={e => setDeliveryInfo({...deliveryInfo, name: e.target.value})}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Phone Number</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input 
                              required
                              type="tel"
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs outline-none focus:border-primary/50 text-white" 
                              placeholder="08012345678"
                              value={deliveryInfo.phone}
                              onChange={e => setDeliveryInfo({...deliveryInfo, phone: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Email Address</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input 
                              required
                              type="email"
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs outline-none focus:border-primary/50 text-white" 
                              placeholder="john@example.com"
                              value={deliveryInfo.email}
                              onChange={e => setDeliveryInfo({...deliveryInfo, email: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Seat Location / Hall Room Number</label>
                          <textarea 
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs outline-none focus:border-primary/50 h-24 resize-none text-white" 
                            placeholder="Cinema Hall 2, Row F, Seat 14..."
                            value={deliveryInfo.address}
                            onChange={e => setDeliveryInfo({...deliveryInfo, address: e.target.value})}
                          />
                        </div>
                      </form>
                    </div>

                    <div className="space-y-6">
                      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-primary" /> Order Summary
                      </h3>
                      <Card className="p-6 glass-card border-white/10 bg-white/5 space-y-4">
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                          {cart.map(item => (
                            <div key={item.product.id} className="flex justify-between text-xs font-bold uppercase tracking-tight">
                              <span className="text-muted-foreground">{item.quantity}x {item.product.name}</span>
                              <span>₦{(item.product.price * item.quantity).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pt-4 border-t border-white/10 space-y-2">
                          <div className="flex justify-between text-xs font-bold uppercase">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>₦{cartTotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold uppercase">
                            <span className="text-muted-foreground">Delivery Fee</span>
                            <span className="text-emerald-400">FREE</span>
                          </div>
                          <div className="flex justify-between text-lg font-black uppercase pt-2 border-t border-white/5">
                            <span>Total</span>
                            <span className="text-emerald-400">₦{cartTotal.toLocaleString()}</span>
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
                            className="w-full h-14 rounded-xl font-black uppercase tracking-widest text-xs gradient-bg shadow-2xl shadow-primary/20"
                          >
                            {isSubmitting ? 'Processing...' : 'Confirm Order & Pay'}
                          </Button>
                          <p className="text-[8px] text-center text-muted-foreground uppercase font-black tracking-widest">Secured Payment via Wallet</p>
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

