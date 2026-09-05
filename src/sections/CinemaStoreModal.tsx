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
  CheckCircle2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  placeOrder,
  type Product, 
  type Partner,
  type Vendor,
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
          category: data.category || 'snack'
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

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast.success(`${product.name} added to cart`);
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
      onClose();
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast.error(error.message || 'Payment processing failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90 backdrop-blur-xl"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-4xl max-h-[90vh] glass-card border-white/10 flex flex-col overflow-hidden z-[3001]"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">Cinema Snack Store</h2>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Premium Refreshments Delivered to your seat</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setActiveTab('cart')}
                  className="relative p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10"
                >
                  <ShoppingBag className="w-5 h-5 text-white" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-black">
                      {cart.length}
                    </span>
                  )}
                </button>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5 text-muted-foreground hover:text-white" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex px-6 pt-4 gap-4 overflow-x-auto no-scrollbar border-b border-white/5">
              <button 
                onClick={() => setActiveTab('store')}
                className={`pb-2 text-[9px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === 'store' ? 'text-primary' : 'text-muted-foreground hover:text-white'}`}
              >
                Snacks Menu
                {activeTab === 'store' && <motion.div layoutId="storeTab" className="absolute -bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
              <button 
                onClick={() => setActiveTab('cart')}
                className={`pb-2 text-[9px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === 'cart' ? 'text-primary' : 'text-muted-foreground hover:text-white'}`}
              >
                Shopping Cart
                {activeTab === 'cart' && <motion.div layoutId="storeTab" className="absolute -bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
              <button 
                disabled={cart.length === 0}
                onClick={() => setActiveTab('checkout')}
                className={`pb-2 text-[9px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === 'checkout' ? 'text-primary' : 'text-muted-foreground hover:text-white'} disabled:opacity-30`}
              >
                Checkout
                {activeTab === 'checkout' && <motion.div layoutId="storeTab" className="absolute -bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <AnimatePresence mode="wait">
                {activeTab === 'store' && (
                  <motion.div 
                    key="store-grid"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-8"
                  >
                    {/* Partners Section */}
                    {partners.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Our Partners</h3>
                        <div className="flex flex-wrap gap-4">
                          {partners.map(partner => (
                            <div key={partner.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                              <img src={partner.logo} className="w-5 h-5 object-contain" alt={partner.name} />
                              <span className="text-[9px] font-bold uppercase">{partner.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Products Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {products.map(product => {
                        const isOutOfStock = product.stockStatus === 'out_of_stock' || product.inStock === false || product.available === false;
                        const isRestocking = product.stockStatus === 'restocking';
                        const isUnavailable = isOutOfStock || isRestocking;

                        return (
                          <Card key={product.id} className={`overflow-hidden glass-card border-white/10 group flex flex-col transition-all duration-300 ${isUnavailable ? 'opacity-50 bg-black/10' : ''}`}>
                            <div className="relative aspect-square overflow-hidden bg-black/40">
                              <img 
                                src={product.image} 
                                className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isUnavailable ? 'grayscale' : ''}`}
                                alt={product.name} 
                              />
                              {product.slashPrice && !isUnavailable && (
                                <Badge className="absolute top-2 left-2 bg-rose-600 text-[9px] font-black uppercase">
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
                            <div className="p-4 flex-1 flex flex-col justify-between">
                              <div className="space-y-1">
                                {(() => {
                                  const vendorObj = vendors.find(v => v.id === product.vendorId);
                                  const vendorRating = vendorObj?.rating ? Number(vendorObj.rating).toFixed(1) : (vendorObj?.ratingCount ? '5.0' : '5.0');
                                  const vendorReviewCount = vendorObj?.ratingCount || 0;
                                  return (
                                    <>
                                      <div className="flex justify-between items-start">
                                        <h4 className="font-black text-sm uppercase leading-tight line-clamp-1">{product.name}</h4>
                                        <div className="flex items-center text-amber-500" title={vendorReviewCount > 0 ? `${vendorReviewCount} ratings` : '5.0 (New Vendor)'}>
                                          <Star className="w-3 h-3 fill-current" />
                                          <span className="text-[10px] font-black ml-1">{vendorRating}</span>
                                          {vendorReviewCount > 0 && (
                                            <span className="text-[8px] text-muted-foreground ml-0.5 font-bold">({vendorReviewCount})</span>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground font-bold italic truncate">
                                        by {vendorObj?.name || 'Store'}
                                      </p>
                                    </>
                                  );
                                })()}
                                <p className="text-[10px] text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
                                  {product.description}
                                </p>
                              </div>
                              
                              <div className="mt-4 flex items-center justify-between">
                                <div className="flex flex-col">
                                  {product.slashPrice && (
                                    <span className="text-[10px] text-muted-foreground line-through italic decoration-rose-500/50">
                                      ₦{product.slashPrice.toLocaleString()}
                                    </span>
                                  )}
                                  <span className="text-sm font-black text-emerald-400 tracking-tighter">
                                    ₦{product.price.toLocaleString()}
                                  </span>
                                </div>
                                <Button 
                                  size="sm" 
                                  onClick={() => addToCart(product)}
                                  disabled={isUnavailable}
                                  className={`h-9 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest ${isUnavailable ? 'bg-white/5 border border-white/10 text-muted-foreground cursor-not-allowed' : 'gradient-bg'}`}
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
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto text-muted-foreground">
                          <ShoppingBag className="w-10 h-10" />
                        </div>
                        <h3 className="font-black uppercase tracking-widest text-lg">Your cart is empty</h3>
                        <Button onClick={() => setActiveTab('store')} variant="outline" className="rounded-xl font-black uppercase tracking-widest text-[10px]">
                          Go to Store
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3">
                          {cart.map(item => (
                            <Card key={item.product.id} className="p-4 glass-card border-white/10 flex items-center gap-4">
                              <img src={item.product.image} className="w-16 h-16 rounded-xl object-cover" alt={item.product.name} />
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
                        
                        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex justify-between items-center">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order Total</p>
                            <p className="text-2xl font-black text-emerald-400">₦{cartTotal.toLocaleString()}</p>
                          </div>
                          <Button 
                            onClick={() => setActiveTab('checkout')}
                            className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-xs gradient-bg shadow-xl"
                          >
                            Proceed to Checkout <ChevronRight className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}

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
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs outline-none focus:border-primary/50" 
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
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs outline-none focus:border-primary/50" 
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
                              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs outline-none focus:border-primary/50" 
                              placeholder="john@example.com"
                              value={deliveryInfo.email}
                              onChange={e => setDeliveryInfo({...deliveryInfo, email: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Delivery Location / Address</label>
                          <textarea 
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs outline-none focus:border-primary/50 h-24 resize-none" 
                            placeholder="Room 4, Building A, or Home Address..."
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
                          <p className="text-[8px] text-center text-muted-foreground uppercase font-black tracking-widest">Secured Payment via Wallet / Cards</p>
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
