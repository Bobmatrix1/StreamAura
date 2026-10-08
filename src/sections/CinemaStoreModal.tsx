import React, { useState, useEffect, useMemo } from 'react';
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
  Receipt,
  Search,
  SlidersHorizontal,
  Popcorn,
  Share2,
  Copy,
  ChefHat,
  ArrowUpRight
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { CustomPlatformDropdown } from '../components/ui/CustomPlatformDropdown';
import { 
  auth,
  listenToProductReviews,
  type Product, 
  type Partner, 
  type Vendor, 
  type ProductReview, 
  db 
} from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../api/mediaApi';
import { collection, onSnapshot } from 'firebase/firestore';

export type StoreSortOption = 
  | 'featured' 
  | 'rating' 
  | 'best-sellers' 
  | 'discount-highest' 
  | 'price-asc' 
  | 'price-desc' 
  | 'delivery-fastest' 
  | 'newest';

const SORT_OPTIONS: { value: string; label: string; icon: string; description?: string }[] = [
  { value: 'featured', label: 'Featured & Recommended', icon: '⭐', description: 'Curated cinema picks' },
  { value: 'rating', label: 'Top Customer Rated', icon: '🌟', description: 'Highest 5-star reviews' },
  { value: 'best-sellers', label: 'Most Popular / Best Sellers', icon: '🔥', description: 'Moviegoers favorite picks' },
  { value: 'discount-highest', label: 'Biggest Discount / Deals', icon: '🏷️', description: 'Highest percentage savings' },
  { value: 'price-asc', label: 'Price: Low to High', icon: '📈', description: 'Budget friendly first' },
  { value: 'price-desc', label: 'Price: High to Low', icon: '💎', description: 'Premium items first' },
  { value: 'delivery-fastest', label: 'Fastest Delivery (ETA)', icon: '⚡', description: 'Delivered in under 10 mins' },
  { value: 'newest', label: 'Newest Arrivals', icon: '🆕', description: 'Freshly added menu items' }
];

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
  
  // Dedicated Vendor Store View State
  const [selectedVendorStore, setSelectedVendorStore] = useState<Vendor | null>(null);

  // Product Detail Page State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productReviews, setProductReviews] = useState<ProductReview[]>([]);
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<StoreSortOption>('featured');

  // Cart State
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  
  // Checkout Form State
  const [deliveryInfo, setDeliveryInfo] = useState({
    address: '',
    phone: '',
    email: user?.email || '',
    name: user?.displayName || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);


  // Scroll Lock Effect & Reset on Close
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setActiveTab('store');
      setSelectedProduct(null);
      setSelectedVendorStore(null);
      setDetailQuantity(1);
      setSelectedCategory('all');
      setSearchQuery('');
      setSortBy('featured');
      setDeliveryInfo({
        address: '',
        phone: '',
        email: user?.email || '',
        name: user?.displayName || ''
      });
      setIsSubmitting(false);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, user]);

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

    // Real-time synchronization for Crave Aura products, partners, and vendors
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
          category: data.category || 'Snacks',
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
    toast.success(quantity === 1 ? `${product.name} added to Crave Bag` : `${quantity}x ${product.name} added to Crave Bag`);
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

  const cartDeliveryTime = useMemo(() => {
    const times = Array.from(new Set(cart.map(i => i.product.deliveryTime).filter(Boolean)));
    if (times.length === 0) return '5 - 10 Mins';
    return times.join(', ');
  }, [cart]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in to place your Crave Aura order');
      return;
    }
    if (cart.length === 0) return;

    setIsSubmitting(true);
    try {
      // Group items by vendor
      const vendorGroups = cart.reduce((acc, item) => {
        const vId = item.product.vendorId || 'admin-store';
        if (!acc[vId]) acc[vId] = [];
        acc[vId].push(item);
        return acc;
      }, {} as Record<string, typeof cart>);

      const token = await auth.currentUser?.getIdToken();
      const payload = {
        customerName: deliveryInfo.name,
        customerEmail: deliveryInfo.email || user.email || '',
        customerPhone: deliveryInfo.phone,
        customerAddress: deliveryInfo.address,
        vendorGroups: Object.entries(vendorGroups).map(([vendorId, items]) => {
          const vendor = vendors.find(v => v.id === vendorId);
          const itemDeliveryTime = items.find(it => it.product.deliveryTime)?.product.deliveryTime || '5-10 mins';
          return {
            vendorId,
            vendorName: vendor?.name || 'Crave Aura Kitchen',
            telegramGroupId: vendor?.telegramGroupId || null,
            estimatedDeliveryTime: itemDeliveryTime,
            items: items.map(it => ({
              productId: it.product.id,
              name: it.product.name,
              quantity: it.quantity,
              price: it.product.price
            }))
          };
        })
      };

      const response = await fetch(`${API_BASE_URL}/api/store/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.detail || result.error || 'Failed to complete Crave Aura checkout.');
      }

      toast.success('🍿 Crave Aura order placed successfully! Your refreshments are being freshly prepared.');
      setCart([]);
      setActiveTab('store');
      setSelectedProduct(null);
      onClose();
    } catch (err: any) {
      console.error('Checkout error:', err);
      toast.error(err.message || 'Failed to place order. Please try again.');
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

  // Extract categories for current vendor store view
  const vendorCategories = useMemo<string[]>(() => {
    if (!selectedVendorStore) return ['all'];
    const list = selectedVendorStore.id === 'cravecinema-official'
      ? products.filter(p => {
          const knownVendorIds = new Set(vendors.map(v => v.id));
          return !p.vendorId || !knownVendorIds.has(p.vendorId);
        })
      : products.filter(p => p.vendorId === selectedVendorStore.id);
    const unique = Array.from(new Set(list.map(p => p.category).filter((c): c is string => Boolean(c))));
    return ['all', ...unique];
  }, [products, selectedVendorStore, vendors]);

  const getCategoryIcon = (category: string) => {
    const cat = category.toLowerCase();
    if (cat === 'all') return '🍿';
    if (cat.includes('drink') || cat.includes('mocktail') || cat.includes('beverage') || cat.includes('soda') || cat.includes('juice') || cat.includes('zobo') || cat.includes('water')) return '🍹';
    if (cat.includes('chop') || cat.includes('finger') || cat.includes('bite')) return '🥟';
    if (cat.includes('grill') || cat.includes('bbq') || cat.includes('suya') || cat.includes('wing')) return '🍗';
    if (cat.includes('popcorn') || cat.includes('snack')) return '🍿';
    if (cat.includes('pastr') || cat.includes('bakery') || cat.includes('bread') || cat.includes('cake') || cat.includes('pie')) return '🥐';
    if (cat.includes('fast food') || cat.includes('burger') || cat.includes('pizza') || cat.includes('shawarma') || cat.includes('hot')) return '🍔';
    if (cat.includes('local') || cat.includes('african') || cat.includes('rice') || cat.includes('soup')) return '🍲';
    if (cat.includes('dessert') || cat.includes('ice cream') || cat.includes('waffle')) return '🍨';
    if (cat.includes('fruit') || cat.includes('healthy') || cat.includes('salad')) return '🥗';
    if (cat.includes('gourmet') || cat.includes('platter') || cat.includes('meal') || cat.includes('combo')) return '🍱';
    if (cat.includes('coffee') || cat.includes('tea') || cat.includes('warm')) return '☕';
    if (cat.includes('candy') || cat.includes('sweet') || cat.includes('chocolate')) return '🍫';
    return '🍿';
  };

  // Sorting algorithm supporting vendor highlights, best sellers, discounts, and delivery speed
  const sortProductList = (list: Product[], currentSort: StoreSortOption) => {
    const parseDeliveryMins = (eta?: string) => {
      if (!eta) return 999;
      const match = eta.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 999;
    };

    const getDiscountPct = (p: Product) => {
      if (!p.slashPrice || p.slashPrice <= p.price) return 0;
      return (p.slashPrice - p.price) / p.slashPrice;
    };

    switch (currentSort) {
      case 'price-asc':
        return [...list].sort((a, b) => a.price - b.price);
      case 'price-desc':
        return [...list].sort((a, b) => b.price - a.price);
      case 'rating':
        return [...list].sort((a, b) => (b.rating || 5) - (a.rating || 5));
      case 'best-sellers':
        return [...list].sort((a, b) => {
          const aScore = (a.isBestSeller ? 100 : 0) + (a.salesCount || 0) + (a.reviewCount || 0);
          const bScore = (b.isBestSeller ? 100 : 0) + (b.salesCount || 0) + (b.reviewCount || 0);
          return bScore - aScore;
        });
      case 'discount-highest':
        return [...list].sort((a, b) => getDiscountPct(b) - getDiscountPct(a));
      case 'delivery-fastest':
        return [...list].sort((a, b) => parseDeliveryMins(a.deliveryTime) - parseDeliveryMins(b.deliveryTime));
      case 'newest':
        return [...list].sort((a, b) => {
          const aNew = (a.isNewArrival ? 50 : 0) + (a.createdAt || 0);
          const bNew = (b.isNewArrival ? 50 : 0) + (b.createdAt || 0);
          return bNew - aNew;
        });
      case 'featured':
      default:
        return [...list].sort((a, b) => {
          const aFeat = (a.isFeatured ? 50 : 0) + (a.tags?.includes('featured') ? 50 : 0);
          const bFeat = (b.isFeatured ? 50 : 0) + (b.tags?.includes('featured') ? 50 : 0);
          return bFeat - aFeat;
        });
    }
  };

  // Share & Copy Vendor Store Links
  const getBrandStoreUrl = (vendorId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://streamaura.site';
    return `${origin}/?craveStore=${vendorId}`;
  };

  const handleCopyBrandStoreLink = (vendorId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = getBrandStoreUrl(vendorId);
    navigator.clipboard.writeText(url);
    toast.success('🔗 Brand store link copied to clipboard!');
  };

  const handleShareBrandStore = async (vendor: Vendor, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = getBrandStoreUrl(vendor.id);
    const title = `${vendor.name} on Crave Aura`;
    const text = `Order delicious snacks & drinks directly from ${vendor.name} on Crave Aura!`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {}
    } else {
      handleCopyBrandStoreLink(vendor.id);
    }
  };

  // List of active brands with product counts & metadata
  const activeBrands = useMemo(() => {
    const knownVendorIds = new Set(vendors.map(v => v.id));
    const unassignedProds = products.filter(p => !p.vendorId || !knownVendorIds.has(p.vendorId));

    const brandList: (Vendor & { productCount: number; inStockCount: number; sampleImage: string })[] = vendors.map(v => {
      const vProds = products.filter(p => p.vendorId === v.id);
      return {
        ...v,
        productCount: vProds.length,
        inStockCount: vProds.filter(p => p.inStock !== false).length,
        sampleImage: v.flyer || vProds[0]?.image || v.logo || ''
      };
    }).filter(v => Boolean(v.name));

    if (unassignedProds.length > 0) {
      brandList.unshift({
        id: 'cravecinema-official',
        name: 'Crave Aura Cinema Store',
        tagline: 'Signature Cinema Popcorn, Drinks & Combos',
        category: 'Popcorn & Cinema Combos',
        deliveryTime: '5-10 mins',
        flyer: 'https://images.unsplash.com/photo-1572177812156-58036aae439c?w=1200&auto=format&fit=crop&q=80',
        logo: '',
        rating: 5.0,
        ratingCount: 120,
        productCount: unassignedProds.length,
        inStockCount: unassignedProds.filter(p => p.inStock !== false).length,
        sampleImage: unassignedProds[0]?.image || '',
        description: 'Official Crave Aura fresh popcorn, cinema treats, and refreshments delivered straight to your seat.'
      } as any);
    }

    return brandList;
  }, [vendors, products]);

  // Deep linking: Automatically open dedicated vendor store if ?craveStore= or ?store= or session storage
  useEffect(() => {
    if (!isOpen) return;

    try {
      const params = new URLSearchParams(window.location.search);
      const urlVendorId = params.get('craveStore') || params.get('store');
      const sessionVendorId = sessionStorage.getItem('aura_initial_vendor_store');
      const targetId = urlVendorId || sessionVendorId;

      if (targetId) {
        const matched = activeBrands.find(v => 
          v.id === targetId || 
          (v.slug && v.slug.toLowerCase() === targetId.toLowerCase()) || 
          (v.name && v.name.toLowerCase() === targetId.toLowerCase())
        ) || vendors.find(v => 
          v.id === targetId || 
          (v.slug && v.slug.toLowerCase() === targetId.toLowerCase()) || 
          (v.name && v.name.toLowerCase() === targetId.toLowerCase())
        );

        if (matched) {
          setSelectedVendorStore(matched);
          setActiveTab('store');
          sessionStorage.removeItem('aura_initial_vendor_store');
        } else if (targetId === 'cravecinema-official' || targetId === 'admin-store') {
          const official = activeBrands.find(b => b.id === 'cravecinema-official');
          if (official) {
            setSelectedVendorStore(official);
            setActiveTab('store');
            sessionStorage.removeItem('aura_initial_vendor_store');
          }
        } else if (vendors.length > 0 || products.length > 0) {
          // If vendor doc not found but ID is specified, create fallback store so products for this vendor are viewable
          const fallbackVendor: Vendor = {
            id: targetId,
            name: 'Vendor Store',
            telegramGroupId: '',
            category: 'Snacks & Small Chops',
            deliveryTime: '5-10 mins'
          };
          setSelectedVendorStore(fallbackVendor);
          setActiveTab('store');
          sessionStorage.removeItem('aura_initial_vendor_store');
        }
      }
    } catch {}
  }, [isOpen, vendors, activeBrands, products]);

  // Brand categories for the store flyer directory
  const brandCategories = useMemo<string[]>(() => {
    const cats = Array.from(new Set(activeBrands.map(b => b.category).filter((c): c is string => Boolean(c))));
    return ['all', ...cats];
  }, [activeBrands]);

  // Filtered brands for Store Flyer directory page
  const filteredBrands = useMemo(() => {
    return activeBrands.filter(brand => {
      const matchesCategory = selectedCategory === 'all' || 
        (brand.category && brand.category.toLowerCase().includes(selectedCategory.toLowerCase()));
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query ||
        brand.name.toLowerCase().includes(query) ||
        (brand.tagline && brand.tagline.toLowerCase().includes(query)) ||
        (brand.category && brand.category.toLowerCase().includes(query)) ||
        (brand.description && brand.description.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [activeBrands, selectedCategory, searchQuery]);

  // Filtered & Sorted Products for Dedicated Vendor View
  const vendorScopedProducts = useMemo(() => {
    if (!selectedVendorStore) return [];
    const list = selectedVendorStore.id === 'cravecinema-official'
      ? products.filter(p => {
          const knownVendorIds = new Set(vendors.map(v => v.id));
          return !p.vendorId || !knownVendorIds.has(p.vendorId);
        })
      : products.filter(p => p.vendorId === selectedVendorStore.id);
    
    const filtered = list.filter(p => {
      const matchesCategory = selectedCategory === 'all' || (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase());
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || 
        p.name.toLowerCase().includes(query) || 
        (p.description && p.description.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });

    return sortProductList(filtered, sortBy);
  }, [products, selectedVendorStore, selectedCategory, searchQuery, sortBy, vendors]);

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
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-hidden">
          {/* Backdrop with Luxury Blur */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/85 backdrop-blur-2xl"
          />
          
          {/* Main Modal Surface */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="crave-aura-store-modal relative w-full max-w-5xl max-h-[92vh] bg-slate-50 dark:bg-[#070b14] border border-slate-200 dark:border-white/10 flex flex-col overflow-hidden z-[3001] shadow-2xl rounded-2xl sm:rounded-3xl text-slate-900 dark:text-white"
          >
            {/* 1. Header Bar */}
            <div className="p-3.5 sm:p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-rose-500/5 to-purple-500/10 dark:from-amber-500/15 dark:via-purple-900/20 dark:to-black/40 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 border border-white/20 shrink-0">
                  <Popcorn className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight bg-gradient-to-r from-amber-500 via-rose-500 to-purple-500 bg-clip-text text-transparent">
                      Welcome to Crave Aura
                    </h2>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Store
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-300 font-bold tracking-wide">
                    Fresh cinema snacks & drinks delivered right to your seat
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3">
                <button 
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('cart');
                  }}
                  className="relative p-2.5 sm:p-3 rounded-2xl bg-white/80 hover:bg-slate-100 dark:bg-white/10 dark:hover:bg-white/20 transition-all border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white shadow-sm flex items-center justify-center cursor-pointer active:scale-95"
                  title="View Crave Bag"
                  aria-label="View Crave Bag"
                >
                  <ShoppingBag className="w-5 h-5 text-amber-500 dark:text-amber-400 stroke-[2.2]" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-gradient-to-r from-amber-500 to-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-md animate-in zoom-in-50">
                      {cart.reduce((s, i) => s + i.quantity, 0)}
                    </span>
                  )}
                </button>

                <button 
                  onClick={onClose} 
                  className="p-2.5 sm:p-3 rounded-2xl bg-white/80 hover:bg-slate-100 dark:bg-white/10 dark:hover:bg-white/20 transition-colors border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white shadow-sm flex items-center justify-center cursor-pointer active:scale-95"
                  title="Close Store"
                  aria-label="Close Store"
                >
                  <X className="w-5 h-5 text-slate-700 dark:text-white stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* 2. Navigation Tabs Header */}
            <div className="px-3.5 sm:px-6 pt-2.5 pb-2 border-b border-slate-200 dark:border-white/10 bg-slate-100/90 dark:bg-black/30 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-x-auto no-scrollbar shadow-xs">
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('store');
                  }}
                  className={`flex-1 min-w-[120px] py-2 px-3 sm:px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'store' 
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-amber-500/20 border border-amber-400' 
                      : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Snacks Menu</span>
                </button>
                
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('cart');
                  }}
                  className={`flex-1 min-w-[130px] py-2 px-3 sm:px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 relative cursor-pointer ${
                    activeTab === 'cart' 
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-amber-500/20 border border-amber-400' 
                      : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Crave Bag</span>
                  {cart.length > 0 && (
                    <span className={`min-w-[18px] h-[18px] px-1 text-[10px] font-black rounded-full flex items-center justify-center shadow-xs ${
                      activeTab === 'cart' ? 'bg-white text-slate-900' : 'bg-amber-500 text-white'
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
                  className={`flex-1 min-w-[120px] py-2 px-3 sm:px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'checkout' 
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-amber-500/20 border border-amber-400' 
                      : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Checkout</span>
                </button>
              </div>
            </div>

            {/* 3. Scrollable Body Area */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 custom-scrollbar space-y-6">
              <AnimatePresence mode="wait">
                {/* TAB 1: CRAVE AURA STORE */}
                {activeTab === 'store' && (
                  <>
                    {/* A. PRODUCT DETAIL VIEW */}
                    {selectedProduct ? (
                      <motion.div
                        key={`crave-product-detail-${selectedProduct.id}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="space-y-6"
                      >
                        {/* Navigation & Breadcrumb */}
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedProduct(null)}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white transition-all border border-slate-200 dark:border-white/10 shadow-xs cursor-pointer active:scale-95"
                          >
                            <ArrowLeft className="w-4 h-4 text-amber-500" /> {selectedVendorStore ? `Back to ${selectedVendorStore.name}` : 'Back to Snacks Menu'}
                          </button>
                          
                          <div className="hidden sm:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            <span>{selectedVendorStore ? selectedVendorStore.name : 'Crave Aura'}</span>
                            <span>/</span>
                            <span className="text-amber-600 dark:text-amber-400 font-black">{selectedProduct.category}</span>
                            <span>/</span>
                            <span className="text-slate-900 dark:text-white font-black truncate max-w-[180px]">{selectedProduct.name}</span>
                          </div>
                        </div>

                        {/* Product Detail Layout: 2 Columns */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-start">
                          {/* Left: Product Image & Badges */}
                          <div className="space-y-4">
                            <div className="relative aspect-square rounded-3xl overflow-hidden bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 shadow-2xl group">
                              <img
                                src={selectedProduct.image}
                                alt={selectedProduct.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
                              
                              {/* Badges */}
                              <div className="absolute top-3 left-3 flex flex-col gap-2">
                                {selectedProduct.slashPrice && selectedProduct.slashPrice > selectedProduct.price && (
                                  <Badge className="bg-rose-600 !text-white font-black text-[10px] uppercase tracking-widest px-3 py-1 shadow-lg" style={{ color: '#ffffff' }}>
                                    Save {Math.round(((selectedProduct.slashPrice - selectedProduct.price) / selectedProduct.slashPrice) * 100)}%
                                  </Badge>
                                )}
                                <Badge className="bg-black/80 backdrop-blur-md !text-white font-bold text-[9px] uppercase tracking-widest px-3 py-1 border border-white/20 shadow-md" style={{ color: '#ffffff' }}>
                                  {getCategoryIcon(selectedProduct.category || '')} {selectedProduct.category || 'Snacks'}
                                </Badge>
                              </div>

                              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-black uppercase text-white bg-black/80 backdrop-blur-md p-3 rounded-2xl border border-white/20 shadow-lg">
                                <div className="flex items-center gap-2">
                                  <Truck className="w-4 h-4 text-amber-400" />
                                  <span>Seat Delivery</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-emerald-400">
                                  <ShieldCheck className="w-4 h-4" />
                                  <span>Fresh & Certified</span>
                                </div>
                              </div>
                            </div>

                            {/* Quality Perks Badges */}
                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                              <div className="p-3 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center space-y-0.5 shadow-xs">
                                <Flame className="w-4 h-4 text-orange-500 mx-auto" />
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white">Fresh & Warm</p>
                                <p className="text-[9px] font-semibold text-slate-500 dark:text-muted-foreground">Prepared on order</p>
                              </div>
                              <div className="p-3 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center space-y-0.5 shadow-xs">
                                <Clock className="w-4 h-4 text-amber-500 mx-auto" />
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white">Delivery</p>
                                <p className="text-[9px] font-semibold text-slate-500 dark:text-muted-foreground">High speed delivery</p>
                              </div>
                              <div className="p-3 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center space-y-0.5 shadow-xs">
                                <ShieldCheck className="w-4 h-4 text-emerald-500 mx-auto" />
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white">Payment</p>
                                <p className="text-[9px] font-semibold text-slate-500 dark:text-muted-foreground">100% Secured</p>
                              </div>
                            </div>
                          </div>

                          {/* Right: Product Info & Actions */}
                          <div className="space-y-5">
                            {/* Title & Vendor */}
                            <div className="space-y-2">
                              {(() => {
                                const vendorObj = vendors.find(v => v.id === selectedProduct.vendorId);
                                const stats = calculateRatingStats(productReviews, selectedProduct.rating || vendorObj?.rating || 5.0);
                                return (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-black">
                                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                        <span>{stats.avg}</span>
                                      </div>
                                      <span className="text-xs text-slate-600 dark:text-muted-foreground font-bold">
                                        ({stats.total} {stats.total === 1 ? 'Customer Review' : 'Customer Reviews'})
                                      </span>
                                    </div>

                                    <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white leading-tight">
                                      {selectedProduct.name}
                                    </h1>

                                    {/* Vendor Badge */}
                                    <div className="flex items-center gap-2 pt-0.5">
                                      <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[10px] font-black border border-amber-500/30">
                                        <Store className="w-3.5 h-3.5" />
                                      </div>
                                      <p className="text-xs text-slate-600 dark:text-slate-300 font-bold">
                                        Prepared by <span className="text-slate-900 dark:text-white font-black">{vendorObj?.name || 'Crave Aura Cinema Kitchen'}</span>
                                      </p>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            {/* Price Section */}
                            <div className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1 shadow-xs">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground">Price</p>
                              <div className="flex items-baseline gap-3">
                                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                                  ₦{selectedProduct.price.toLocaleString()}
                                </span>
                                {selectedProduct.slashPrice && selectedProduct.slashPrice > selectedProduct.price && (
                                  <>
                                    <span className="text-sm text-slate-400 dark:text-muted-foreground line-through decoration-rose-500/60 font-bold">
                                      ₦{selectedProduct.slashPrice.toLocaleString()}
                                    </span>
                                    <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase">
                                      Save ₦{(selectedProduct.slashPrice - selectedProduct.price).toLocaleString()}
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Stock & Delivery Status */}
                            <div className="flex flex-wrap items-center gap-2">
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
                                  <Check className="w-3.5 h-3.5" /> In Stock & Ready to Deliver
                                </Badge>
                              )}
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-bold uppercase flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-500" /> {selectedProduct.deliveryTime || '5-10 mins'}
                              </Badge>
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">Item Details</h3>
                              <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                                {selectedProduct.description || 'Enjoy our delicious cinema snacks prepared fresh for the ultimate movie-watching experience.'}
                              </p>
                            </div>

                            {/* Quantity Selector & Add To Crave Bag CTA */}
                            {selectedProduct.stockStatus !== 'out_of_stock' && selectedProduct.inStock !== false ? (
                              <div className="p-4 sm:p-5 rounded-3xl bg-slate-100/90 dark:bg-black/40 border border-slate-200 dark:border-white/10 space-y-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                    Select Quantity:
                                  </span>
                                  <div className="flex items-center gap-2 bg-white dark:bg-black/60 rounded-xl border border-slate-200 dark:border-white/15 p-1 shadow-sm">
                                    <button 
                                      type="button"
                                      onClick={() => setDetailQuantity(q => Math.max(1, q - 1))}
                                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-900 dark:text-white flex items-center justify-center transition-colors cursor-pointer"
                                      aria-label="Decrease quantity"
                                    >
                                      <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="text-base font-black w-8 text-center text-slate-900 dark:text-white">
                                      {detailQuantity}
                                    </span>
                                    <button 
                                      type="button"
                                      onClick={() => setDetailQuantity(q => q + 1)}
                                      className="w-8 h-8 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                                      aria-label="Increase quantity"
                                    >
                                      <Plus className="w-4 h-4 text-white" />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-xs font-bold uppercase pt-2 border-t border-slate-200 dark:border-white/5">
                                  <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                                    Subtotal:
                                  </span>
                                  <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                                    ₦{(selectedProduct.price * detailQuantity).toLocaleString()}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => addToCart(selectedProduct, detailQuantity)}
                                    className="h-12 rounded-2xl font-black uppercase tracking-widest text-xs bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-xl shadow-amber-500/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                  >
                                    <ShoppingBag className="w-4 h-4" />
                                    <span>Add to Bag</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      addToCart(selectedProduct, detailQuantity);
                                      setActiveTab('checkout');
                                    }}
                                    className="h-12 rounded-2xl font-black uppercase tracking-widest text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 transition-all flex items-center justify-center gap-1.5 shadow-lg active:scale-95 cursor-pointer border border-slate-900 dark:border-white"
                                  >
                                    <span>Express Buy</span>
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-1">
                                <p className="text-xs font-black uppercase text-red-600 dark:text-red-400">Temporarily Sold Out</p>
                                <p className="text-[10px] text-slate-600 dark:text-muted-foreground font-semibold">This item is currently sold out in the cinema kitchen. Please check our other delicious treats!</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Customer Reviews & Ratings Section */}
                        <div className="pt-8 border-t border-slate-200 dark:border-white/10 space-y-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                                <MessageSquareQuote className="w-5 h-5 text-amber-500" /> Customer Reviews & Ratings
                              </h3>
                              <p className="text-[10px] text-slate-500 dark:text-muted-foreground font-bold uppercase tracking-widest">
                                Verified reviews from moviegoers who ordered this snack
                              </p>
                            </div>
                            <Badge className="bg-white dark:bg-white/5 text-slate-800 dark:text-muted-foreground border border-slate-200 dark:border-white/10 font-black text-xs">
                              {productReviews.length} {productReviews.length === 1 ? 'Review' : 'Reviews'}
                            </Badge>
                          </div>

                          {/* Rating Breakdown Card */}
                          {(() => {
                            const vendorObj = vendors.find(v => v.id === selectedProduct.vendorId);
                            const stats = calculateRatingStats(productReviews, selectedProduct.rating || vendorObj?.rating || 5.0);
                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6 rounded-3xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 items-center shadow-xs">
                                <div className="text-center sm:text-left space-y-2 sm:border-r sm:border-slate-200 dark:sm:border-white/10 sm:pr-6">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground">Average Rating</p>
                                  <div className="text-4xl sm:text-5xl font-black text-amber-500 tracking-tight flex items-center justify-center sm:justify-start gap-2">
                                    <span>{stats.avg}</span>
                                    <Star className="w-8 h-8 fill-amber-400 text-amber-400" />
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-muted-foreground font-bold">
                                    Based on {stats.total} verified reviews
                                  </p>
                                </div>

                                <div className="sm:col-span-2 space-y-2">
                                  {[5, 4, 3, 2, 1].map((starVal) => {
                                    const pct = (stats.breakdown as any)[starVal] || 0;
                                    return (
                                      <div key={starVal} className="flex items-center gap-3 text-xs font-bold">
                                        <span className="w-8 text-right text-slate-600 dark:text-muted-foreground flex items-center justify-end gap-1">
                                          {starVal} <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                        </span>
                                        <div className="flex-1 h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                          <div 
                                            className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-500" 
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                        <span className="w-10 text-right text-slate-600 dark:text-muted-foreground text-[10px] font-black">
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
                              <div className="py-12 text-center text-slate-500 dark:text-muted-foreground space-y-2">
                                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                                <p className="text-xs uppercase font-bold tracking-widest">Loading reviews...</p>
                              </div>
                            ) : productReviews.length === 0 ? (
                              <div className="py-12 text-center p-8 rounded-3xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 space-y-3">
                                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                                  <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
                                </div>
                                <h4 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">No Reviews Yet</h4>
                                <p className="text-xs text-slate-500 dark:text-muted-foreground font-medium max-w-sm mx-auto">
                                  Order this delicious treat today and be the first to rate your experience when delivered!
                                </p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {productReviews.map((rev) => (
                                  <div
                                    key={rev.id}
                                    className="p-5 rounded-3xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3 flex flex-col justify-between shadow-xs"
                                  >
                                    <div className="space-y-3">
                                      <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white font-black text-xs shadow-md">
                                            {(rev.userName || 'C').charAt(0).toUpperCase()}
                                          </div>
                                          <div>
                                            <p className="text-xs font-black uppercase text-slate-900 dark:text-white leading-tight">
                                              {rev.userName || 'Verified Moviegoer'}
                                            </p>
                                            <div className="flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                                              <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Verified Order
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

                                      <div className="relative bg-slate-100/90 dark:bg-black/40 p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xs">
                                        <Quote className="w-4 h-4 text-amber-500 absolute top-3 right-3 rotate-180 opacity-60" />
                                        <p className="text-xs text-slate-800 dark:text-white/95 leading-relaxed font-bold italic pr-5">
                                          "{rev.review || 'Delicious snack! Arrived freshly prepared and on time for the movie.'}"
                                        </p>
                                      </div>
                                    </div>

                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold pt-2.5 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
                                      <span className="font-mono text-slate-700 dark:text-white/80">Order #{rev.orderId?.slice(0, 8).toUpperCase() || 'CRAVE'}</span>
                                      <span>{formatReviewDate(rev.createdAt)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ) : selectedVendorStore ? (
                      /* B. DEDICATED VENDOR BRAND STORE VIEW */
                      <motion.div
                        key={`crave-vendor-store-${selectedVendorStore.id}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="space-y-6"
                      >
                        {/* Navigation bar / Back */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVendorStore(null);
                              setSelectedCategory('all');
                              setSearchQuery('');
                            }}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white transition-all border border-slate-200 dark:border-white/10 shadow-xs cursor-pointer active:scale-95"
                          >
                            <ArrowLeft className="w-4 h-4 text-amber-500" /> All Crave Aura Brands & Snacks
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => handleCopyBrandStoreLink(selectedVendorStore.id, e)}
                              className="px-3 py-2 rounded-xl bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white transition-all border border-slate-200 dark:border-white/10 shadow-xs flex items-center gap-1.5 cursor-pointer"
                              title="Copy Store Link"
                            >
                              <Copy className="w-3.5 h-3.5 text-amber-500" /> Copy Store Link
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleShareBrandStore(selectedVendorStore, e)}
                              className="px-3.5 py-2 rounded-xl gradient-bg text-slate-950 text-xs font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                              title="Share Store Link"
                            >
                              <Share2 className="w-3.5 h-3.5" /> Share Store
                            </button>
                          </div>
                        </div>

                        {/* Dedicated Brand Hero Flyer Banner */}
                        <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-amber-500/30 shadow-2xl">
                          {/* Banner Background Image or Gradient */}
                          <div className="relative aspect-[21/9] sm:aspect-[24/9] md:aspect-[3/1] w-full min-h-[160px] max-h-[280px] bg-slate-900 overflow-hidden">
                            {selectedVendorStore.flyer ? (
                              <img 
                                src={selectedVendorStore.flyer} 
                                alt={selectedVendorStore.name} 
                                className="w-full h-full object-cover object-center"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-r from-amber-600 via-rose-600 to-purple-800 opacity-80" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                            {/* Top Badges */}
                            <div className="absolute top-3 left-3 right-3 flex justify-between items-center pointer-events-none">
                              <Badge className="bg-black/70 backdrop-blur-md text-amber-400 border border-amber-500/40 text-[10px] font-black uppercase tracking-wider px-2.5 py-1">
                                {selectedVendorStore.category || 'Official Crave Aura Store'}
                              </Badge>
                              <div className="flex items-center gap-2">
                                <span className="bg-black/70 backdrop-blur-md text-white border border-white/15 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-400" /> {selectedVendorStore.deliveryTime || '5-10 mins'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Brand Info Overlay Bar */}
                          <div className="p-4 sm:p-6 bg-slate-900/95 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black/60 border-2 border-amber-500/40 overflow-hidden flex items-center justify-center shrink-0 shadow-lg -mt-10 sm:-mt-12 relative z-10 bg-slate-900">
                                {selectedVendorStore.logo ? (
                                  <img src={selectedVendorStore.logo} alt={selectedVendorStore.name} className="w-full h-full object-cover" />
                                ) : (
                                  <ChefHat className="w-7 h-7 text-amber-400" />
                                )}
                              </div>
                              <div className="space-y-0.5 min-w-0">
                                <h3 className="text-base sm:text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                                  {selectedVendorStore.name}
                                  <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                                </h3>
                                {selectedVendorStore.tagline ? (
                                  <p className="text-xs font-bold text-amber-400 line-clamp-1">
                                    {selectedVendorStore.tagline}
                                  </p>
                                ) : (
                                  <p className="text-xs font-medium text-slate-300">
                                    Official Brand Store on Crave Aura
                                  </p>
                                )}
                                {selectedVendorStore.description && (
                                  <p className="text-[11px] text-slate-400 line-clamp-2 max-w-xl pt-0.5">
                                    {selectedVendorStore.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                              <div className="text-right">
                                <p className="text-[9px] font-black uppercase text-slate-400">Available Menu</p>
                                <p className="text-sm font-black text-amber-400">{vendorScopedProducts.length} Items</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Search & Sort for this vendor */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                          <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-muted-foreground" />
                            <input 
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search items by vendor..."
                              className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-amber-500 rounded-2xl py-2.5 pl-10 pr-9 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                            />
                            {searchQuery && (
                              <button 
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="shrink-0 w-full sm:w-60">
                            <CustomPlatformDropdown 
                              value={sortBy}
                              onChange={(val) => setSortBy(val as StoreSortOption)}
                              options={SORT_OPTIONS}
                              icon={<SlidersHorizontal className="w-4 h-4 text-amber-500" />}
                              variant="gold"
                            />
                          </div>
                        </div>

                        {/* Vendor Category Filter Chips */}
                        {vendorCategories.length > 1 && (
                          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                            {vendorCategories.map(cat => {
                              const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
                              return (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => setSelectedCategory(cat)}
                                  className={`px-3.5 py-1.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs ${
                                    isSelected 
                                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-amber-500/25 border border-amber-400' 
                                      : 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-white/10'
                                  }`}
                                >
                                  <span>{getCategoryIcon(cat)}</span>
                                  <span>{cat === 'all' ? 'All Items' : cat}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Vendor Menu Grid */}
                        {vendorScopedProducts.length === 0 ? (
                          <div className="py-16 text-center space-y-4 p-8 rounded-3xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 shadow-xs">
                            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20">
                              <ChefHat className="w-8 h-8" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-base font-black uppercase tracking-tight text-slate-900 dark:text-white">
                                No Products Found for {selectedVendorStore.name}
                              </h4>
                              <p className="text-xs text-slate-500 dark:text-muted-foreground max-w-sm mx-auto">
                                {searchQuery ? 'Try adjusting your search query.' : 'This brand store will be uploading fresh items soon!'}
                              </p>
                            </div>
                            {searchQuery && (
                              <Button
                                onClick={() => setSearchQuery('')}
                                variant="outline"
                                className="h-9 text-xs uppercase font-black tracking-wider border-amber-500/40 text-amber-600 dark:text-amber-400"
                              >
                                Clear Search
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                            {vendorScopedProducts.map((product) => {
                              const inCart = cart.find(item => item.product.id === product.id);
                              return (
                                <Card 
                                  key={product.id}
                                  onClick={() => setSelectedProduct(product)}
                                  className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] backdrop-blur-md hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 relative cursor-pointer"
                                >
                                  {/* Top Image & Floating Badges */}
                                  <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-black/30">
                                    <img 
                                      src={product.image} 
                                      alt={product.name} 
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                                    {/* Top Left: Category */}
                                    <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
                                      <span className="bg-black/60 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border border-white/10">
                                        {product.category}
                                      </span>
                                    </div>

                                    {/* Bottom Info on Image: Price & Rating */}
                                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between z-10">
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-sm sm:text-base font-black text-emerald-400 drop-shadow-md">
                                            ₦{product.price.toLocaleString()}
                                          </span>
                                          {product.slashPrice && product.slashPrice > product.price && (
                                            <span className="text-[10px] text-slate-300 line-through font-semibold">
                                              ₦{product.slashPrice.toLocaleString()}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-white/10 text-amber-400 text-[10px] font-black">
                                        <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                        <span>{(product.rating || 5.0).toFixed(1)}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Card Body */}
                                  <div className="p-3 sm:p-4 flex flex-col justify-between flex-1 gap-2.5">
                                    <div className="space-y-1">
                                      <h4 className="text-xs sm:text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white line-clamp-1 group-hover:text-amber-500 transition-colors">
                                        {product.name}
                                      </h4>
                                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium line-clamp-2 leading-relaxed">
                                        {product.description || 'Freshly prepared for movie lovers.'}
                                      </p>
                                    </div>

                                    {/* Action Row */}
                                    <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-amber-500" /> {product.deliveryTime || '5-10 mins'}
                                      </span>

                                      {inCart ? (
                                        <div 
                                          onClick={(e) => e.stopPropagation()}
                                          className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 rounded-xl p-1"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => updateQuantity(product.id, -1)}
                                            className="w-5 h-5 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold hover:bg-amber-600 active:scale-95 text-xs"
                                          >
                                            <Minus className="w-3 h-3" />
                                          </button>
                                          <span className="text-xs font-black text-amber-600 dark:text-amber-300 min-w-[14px] text-center">
                                            {inCart.quantity}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => updateQuantity(product.id, 1)}
                                            className="w-5 h-5 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold hover:bg-amber-600 active:scale-95 text-xs"
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            addToCart(product, 1);
                                          }}
                                          className="h-7 px-2.5 text-[10px] font-black uppercase tracking-wider gradient-bg shadow-xs active:scale-95"
                                        >
                                          <Plus className="w-3 h-3 mr-0.5" /> Add
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      /* C. STORE FLYERS DIRECTORY VIEW (2 ON A ROW) */
                      <motion.div 
                        key="crave-store-flyers-directory"
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 15 }}
                        className="space-y-6"
                      >
                        {/* 1. Hero Promo Banner */}
                        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-purple-600/15 border border-amber-500/30 dark:border-white/10 p-4 sm:p-6 shadow-xl">
                          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
                          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1.5 max-w-lg">
                              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-black uppercase tracking-wider">
                                <Popcorn className="w-4 h-4 text-amber-500" />
                                <span>Cinema Food Court & Brand Stores</span>
                              </div>
                              <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
                                Discover Cinema Brands & Stores
                              </h3>
                              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                                Browse authentic brand flyers, select your favorite vendor store, and order fresh snacks delivered right to your seat or watch party.
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/80 dark:bg-black/40 backdrop-blur-md border border-slate-200 dark:border-white/10 shadow-xs">
                                <Clock className="w-4 h-4 text-amber-500" />
                                <div>
                                  <p className="text-[9px] font-black uppercase text-slate-500 dark:text-muted-foreground">Delivery</p>
                                  <p className="text-xs font-black text-slate-900 dark:text-white">High speed delivery</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/80 dark:bg-black/40 backdrop-blur-md border border-slate-200 dark:border-white/10 shadow-xs">
                                <Truck className="w-4 h-4 text-emerald-500" />
                                <div>
                                  <p className="text-[9px] font-black uppercase text-slate-500 dark:text-muted-foreground">Direct Delivery</p>
                                  <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">To your seat</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/80 dark:bg-black/40 backdrop-blur-md border border-slate-200 dark:border-white/10 shadow-xs">
                                <ShieldCheck className="w-4 h-4 text-purple-500" />
                                <div>
                                  <p className="text-[9px] font-black uppercase text-slate-500 dark:text-muted-foreground">Payment</p>
                                  <p className="text-xs font-black text-slate-900 dark:text-white">100% Secured</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 2. Brand Search & Specialty Filter Controls */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                          {/* Search Input for Brands */}
                          <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-muted-foreground" />
                            <input 
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search brand stores..."
                              className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-amber-500 dark:focus:border-amber-500 rounded-2xl py-2.5 pl-10 pr-9 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground outline-none transition-all shadow-2xs"
                            />
                            {searchQuery && (
                              <button 
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white hover:bg-slate-200 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-3 py-2 rounded-2xl text-[11px] font-black uppercase shrink-0">
                              <ChefHat className="w-3.5 h-3.5 mr-1.5 inline text-amber-500" />
                              {filteredBrands.length} {filteredBrands.length === 1 ? 'Brand Store' : 'Brand Stores'}
                            </Badge>
                          </div>
                        </div>

                        {/* 3. Brand Category / Specialty Filter Chips */}
                        {brandCategories.length > 1 && (
                          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                            {brandCategories.map(cat => {
                              const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
                              const catCount = cat === 'all' 
                                ? activeBrands.length 
                                : activeBrands.filter(b => b.category?.toLowerCase() === cat.toLowerCase()).length;
                              return (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => setSelectedCategory(cat)}
                                  className={`px-3.5 py-2 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs ${
                                    isSelected 
                                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-amber-500/25 border border-amber-400' 
                                      : 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-white/10'
                                  }`}
                                >
                                  <span>{getCategoryIcon(cat)}</span>
                                  <span>{cat === 'all' ? 'All Brand Stores' : cat}</span>
                                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                    isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                                  }`}>
                                    {catCount}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* 4. Brand Flyers Showcase Grid - TWO ON A ROW */}
                        {filteredBrands.length === 0 ? (
                          <div className="py-16 text-center space-y-4 p-8 rounded-3xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 shadow-xs">
                            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20">
                              <Store className="w-8 h-8" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-base font-black uppercase text-slate-900 dark:text-white">No Brand Stores Found</h4>
                              <p className="text-xs text-slate-500 dark:text-muted-foreground max-w-sm mx-auto font-medium">
                                {searchQuery ? `We couldn't find any brand stores matching "${searchQuery}".` : 'No brand stores available in this category right now.'}
                              </p>
                            </div>
                            <Button 
                              onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
                              className="h-10 px-6 rounded-xl font-black uppercase text-xs gradient-bg !text-white"
                            >
                              Reset Filters
                            </Button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:gap-5">
                            {filteredBrands.map((brand) => (
                              <Card
                                key={brand.id}
                                onClick={() => {
                                  setSelectedVendorStore(brand);
                                  setSelectedCategory('all');
                                  setSearchQuery('');
                                }}
                                className="group overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 hover:border-amber-500/60 hover:shadow-2xl hover:shadow-amber-500/15 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                              >
                                {/* Flyer Banner Header */}
                                <div className="relative aspect-[16/10] sm:aspect-[16/9] w-full bg-slate-900 overflow-hidden">
                                  {brand.flyer ? (
                                    <img 
                                      src={brand.flyer} 
                                      alt={brand.name} 
                                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-6 bg-gradient-to-br from-amber-500/25 via-slate-900 to-black text-center">
                                      <Store className="w-7 h-7 sm:w-12 sm:h-12 text-amber-500/60 mb-1 sm:mb-2 group-hover:scale-110 transition-transform" />
                                      <p className="text-[11px] sm:text-sm font-black text-white uppercase tracking-wider line-clamp-1">{brand.name}</p>
                                      <p className="text-[8px] sm:text-[11px] text-amber-400 font-bold mt-0.5 line-clamp-1">{brand.tagline || brand.category}</p>
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                                  {/* Overlay Category & Delivery Time */}
                                  <div className="absolute top-1.5 sm:top-2.5 left-1.5 sm:left-2.5 right-1.5 sm:right-2.5 flex justify-between items-center pointer-events-none gap-1">
                                    <span className="bg-black/80 backdrop-blur-md text-amber-400 text-[8px] sm:text-[9px] font-black uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg border border-amber-500/40 shadow-xs truncate max-w-[55%]">
                                      {brand.category || 'Brand Store'}
                                    </span>
                                    <span className="bg-black/80 backdrop-blur-md text-white text-[8px] sm:text-[9px] font-black uppercase px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg flex items-center gap-1 border border-white/15 shadow-xs shrink-0">
                                      <Clock className="w-2.5 h-2.5 text-amber-400" /> {brand.deliveryTime || '5-10m'}
                                    </span>
                                  </div>
                                </div>

                                {/* Brand Details Footer */}
                                <div className="p-2.5 sm:p-4 space-y-2 sm:space-y-3 flex-1 flex flex-col justify-between">
                                  <div className="flex items-start gap-2 sm:gap-3">
                                    <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-slate-100 dark:bg-black/70 border border-amber-500/30 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                                      {brand.logo ? (
                                        <img src={brand.logo} alt={brand.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <ChefHat className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase truncate group-hover:text-amber-500 transition-colors flex items-center gap-1">
                                        <span className="truncate">{brand.name}</span>
                                        <BadgeCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500 shrink-0" />
                                      </h4>
                                      <p className="text-[9px] sm:text-xs font-bold text-amber-600 dark:text-amber-400 truncate">
                                        {brand.tagline || 'Specialty snacks & treats'}
                                      </p>
                                      {brand.description && (
                                        <p className="hidden md:line-clamp-1 text-[10px] text-slate-500 dark:text-muted-foreground mt-0.5 font-medium">
                                          {brand.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Bottom link info & CTA */}
                                  <div className="flex items-center justify-between pt-1.5 sm:pt-2.5 border-t border-slate-100 dark:border-white/10 text-[9px] sm:text-[10px] font-black uppercase gap-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] truncate">
                                        {brand.productCount} {brand.productCount === 1 ? 'Item' : 'Items'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => handleShareBrandStore(brand, e)}
                                        title="Share Brand Store"
                                        className="p-1 rounded hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 transition-colors"
                                      >
                                        <Share2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                      </button>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedVendorStore(brand);
                                        setSelectedCategory('all');
                                        setSearchQuery('');
                                      }}
                                      className="h-6 sm:h-7.5 px-2 sm:px-3 rounded-lg sm:rounded-xl font-black uppercase text-[8px] sm:text-[10px] tracking-wider gradient-bg !text-white shadow-xs shadow-amber-500/20 group-hover:brightness-110 flex items-center gap-1 shrink-0"
                                    >
                                      <span>Enter</span>
                                      <ArrowUpRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                    </Button>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}

                        {/* Verified Store Partners */}
                        {partners.length > 0 && (
                          <div className="pt-6 border-t border-slate-200 dark:border-white/10 space-y-3">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground">
                              Verified Cinema Partners
                            </h4>
                            <div className="flex flex-wrap items-center gap-2.5">
                              {partners.map(p => (
                                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white shadow-2xs">
                                  {p.logo ? (
                                    <img src={p.logo} alt={p.name} className="w-4 h-4 object-contain" />
                                  ) : (
                                    <Store className="w-3.5 h-3.5 text-amber-500" />
                                  )}
                                  <span className="text-[10px] font-black uppercase">{p.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </>
                )}

                {/* TAB 2: CRAVE BAG (CART) */}
                {activeTab === 'cart' && (
                  <motion.div 
                    key="crave-cart-view"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="space-y-6"
                  >
                    {cart.length === 0 ? (
                      <div className="py-16 text-center space-y-5">
                        <div className="w-24 h-24 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border-2 border-amber-500/20 shadow-sm">
                          <ShoppingBag className="w-12 h-12 stroke-[1.8]" />
                        </div>
                        <div className="space-y-1.5">
                          <h3 className="font-black uppercase tracking-tight text-xl text-slate-900 dark:text-white">Your Crave Bag is Empty</h3>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground font-semibold max-w-sm mx-auto">
                            Add fresh cinema popcorn, cold sips, nachos, and sweet snacks delivered straight to your hall seat.
                          </p>
                        </div>
                        <Button 
                          onClick={() => setActiveTab('store')} 
                          className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-xs bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-xl shadow-amber-500/20 hover:brightness-110 active:scale-95 cursor-pointer"
                        >
                          <Popcorn className="w-4 h-4 mr-2" /> Browse Snacks Menu
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Cart Header Banner */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-3xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-xs">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                              <ShoppingBag className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-tight">Your Selected Items</h3>
                              <p className="text-[10px] text-slate-500 dark:text-muted-foreground font-bold">
                                {cart.reduce((s, i) => s + i.quantity, 0)} {cart.reduce((s, i) => s + i.quantity, 0) === 1 ? 'item' : 'items'} ready for express delivery
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveTab('store')}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white transition-all border border-slate-200 dark:border-white/15 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 text-amber-500" /> Add More
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
                                  className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-amber-500/30 transition-all shadow-xs space-y-3"
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
                                          <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-muted-foreground font-bold uppercase tracking-wider truncate">
                                            {vendorObj?.name || 'Crave Aura Store'}
                                          </p>
                                          <h4 className="font-black text-sm sm:text-base uppercase text-slate-900 dark:text-white leading-tight">
                                            {item.product.name}
                                          </h4>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => removeFromCart(item.product.id)}
                                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 transition-all cursor-pointer"
                                          title="Remove item"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                        <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                                          ₦{item.product.price.toLocaleString()}
                                        </span>
                                        {item.product.slashPrice && item.product.slashPrice > item.product.price && (
                                          <span className="text-[10px] text-slate-400 dark:text-muted-foreground line-through font-bold">
                                            ₦{item.product.slashPrice.toLocaleString()}
                                          </span>
                                        )}
                                        <span className="text-[10px] text-slate-500 dark:text-muted-foreground font-semibold">each</span>
                                        <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20 ml-auto">
                                          <Clock className="w-2.5 h-2.5" /> {item.product.deliveryTime || '5-10 mins'}
                                        </span>
                                      </div>

                                      {/* Stepper + Subtotal Row */}
                                      <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-white/5">
                                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-black/40 rounded-xl border border-slate-200 dark:border-white/15 p-1 shadow-2xs">
                                          <button 
                                            type="button"
                                            onClick={() => updateQuantity(item.product.id, -1)} 
                                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-900 dark:text-white flex items-center justify-center transition-colors cursor-pointer"
                                            aria-label="Decrease quantity"
                                          >
                                            <Minus className="w-3.5 h-3.5" />
                                          </button>
                                          <span className="text-xs font-black w-7 text-center text-slate-900 dark:text-white">
                                            {item.quantity}
                                          </span>
                                          <button 
                                            type="button"
                                            onClick={() => updateQuantity(item.product.id, 1)} 
                                            className="w-7 h-7 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                                            aria-label="Increase quantity"
                                          >
                                            <Plus className="w-3.5 h-3.5 text-white" />
                                          </button>
                                        </div>

                                        <div className="text-right">
                                          <p className="text-[9px] font-bold uppercase text-slate-500 dark:text-muted-foreground">Subtotal</p>
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
                              className="p-4 rounded-3xl bg-white hover:bg-slate-100/90 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] border-2 border-dashed border-slate-300 dark:border-white/15 flex items-center justify-between cursor-pointer transition-all group shadow-xs"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-2xl bg-amber-500/15 group-hover:bg-amber-500/25 text-amber-500 flex items-center justify-center transition-colors">
                                  <Plus className="w-5 h-5" />
                                </div>
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-900 dark:text-white">Craving another snack?</p>
                                  <p className="text-[10px] text-slate-500 dark:text-muted-foreground font-semibold">Explore popcorn, cold slushies, or chocolate</p>
                                </div>
                              </div>
                              <span className="text-xs font-black text-amber-500 uppercase tracking-wider flex items-center gap-1">
                                Browse <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                              </span>
                            </div>
                          </div>

                          {/* Right Column: Sticky Order Summary */}
                          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                            <div className="p-6 rounded-3xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-5 shadow-md">
                              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
                                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                                  <Receipt className="w-4 h-4 text-amber-500" /> Crave Summary
                                </h3>
                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase">
                                  Free Seat Delivery
                                </Badge>
                              </div>

                              <div className="space-y-3 text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-muted-foreground">Items Subtotal</span>
                                  <span className="text-slate-900 dark:text-white font-black">₦{cartTotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-muted-foreground">Delivery to Seat</span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-black">FREE</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-muted-foreground">Prep & Delivery Time</span>
                                  <span className="text-amber-600 dark:text-amber-400 font-black">{cartDeliveryTime}</span>
                                </div>
                              </div>

                              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-baseline justify-between">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground">Total to Pay</p>
                                  <p className="text-xs text-slate-400 dark:text-muted-foreground font-semibold">StreamAura Wallet</p>
                                </div>
                                <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                                  ₦{cartTotal.toLocaleString()}
                                </p>
                              </div>

                              {/* Seat Delivery Guarantee Note */}
                              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-black uppercase">
                                  <Truck className="w-4 h-4" /> Instant Seat Delivery
                                </div>
                                <p className="text-[10px] text-slate-700 dark:text-white/80 font-semibold leading-relaxed">
                                  Your snacks will be prepared fresh and served directly to your cinema room or hall seat.
                                </p>
                              </div>

                              {/* Checkout Button */}
                              <Button 
                                onClick={() => setActiveTab('checkout')}
                                className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-xl shadow-amber-500/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <span>Proceed to Express Checkout</span>
                                <ChevronRight className="w-4 h-4" />
                              </Button>

                              {/* Trust Highlights */}
                              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-white/10 text-center">
                                <div className="space-y-0.5">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                                  <p className="text-[8px] font-black uppercase text-slate-600 dark:text-muted-foreground">Safe Pay</p>
                                </div>
                                <div className="space-y-0.5">
                                  <Flame className="w-3.5 h-3.5 text-orange-500 mx-auto" />
                                  <p className="text-[8px] font-black uppercase text-slate-600 dark:text-muted-foreground">Fresh Made</p>
                                </div>
                                <div className="space-y-0.5">
                                  <Clock className="w-3.5 h-3.5 text-amber-500 mx-auto" />
                                  <p className="text-[8px] font-black uppercase text-slate-600 dark:text-muted-foreground">Fast Delivery</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* TAB 3: CHECKOUT TAB */}
                {activeTab === 'checkout' && (
                  <motion.div 
                    key="crave-checkout-form"
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 15 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-start"
                  >
                    {/* Left: Delivery Details Form */}
                    <div className="space-y-5">
                      <div className="space-y-1">
                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-900 dark:text-white">
                          <MapPin className="w-4 h-4 text-amber-500" /> Delivery & Seat Details
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-muted-foreground">
                          Where should we bring your fresh refreshments?
                        </p>
                      </div>

                      <form id="checkout-form" onSubmit={handleCheckout} className="space-y-3.5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300 ml-1">Full Name</label>
                          <input 
                            required
                            className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-3 text-xs outline-none focus:border-amber-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground font-semibold shadow-2xs" 
                            placeholder="e.g. Bobby Adams"
                            value={deliveryInfo.name}
                            onChange={e => setDeliveryInfo({...deliveryInfo, name: e.target.value})}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300 ml-1">Phone Number</label>
                          <div className="relative">
                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-muted-foreground" />
                            <input 
                              required
                              type="tel"
                              className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-3 pl-10 pr-4 text-xs outline-none focus:border-amber-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground font-semibold shadow-2xs" 
                              placeholder="08012345678"
                              value={deliveryInfo.phone}
                              onChange={e => setDeliveryInfo({...deliveryInfo, phone: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300 ml-1">Email Address</label>
                          <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-muted-foreground" />
                            <input 
                              required
                              type="email"
                              className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-3 pl-10 pr-4 text-xs outline-none focus:border-amber-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground font-semibold shadow-2xs" 
                              placeholder="bobby@example.com"
                              value={deliveryInfo.email}
                              onChange={e => setDeliveryInfo({...deliveryInfo, email: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300 ml-1">Seat Location / Hall Room Number</label>
                          <textarea 
                            required
                            className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-3 text-xs outline-none focus:border-amber-500 h-24 resize-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-muted-foreground font-semibold shadow-2xs" 
                            placeholder="e.g. Cinema Hall 2, Row F, Seat 14 (or Room #3)"
                            value={deliveryInfo.address}
                            onChange={e => setDeliveryInfo({...deliveryInfo, address: e.target.value})}
                          />
                        </div>
                      </form>
                    </div>

                    {/* Right: Order Summary Recap */}
                    <div className="space-y-5">
                      <div className="space-y-1">
                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-900 dark:text-white">
                          <CreditCard className="w-4 h-4 text-amber-500" /> Order Summary
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-muted-foreground">
                          Review your refreshments before confirming
                        </p>
                      </div>

                      <Card className="p-5 sm:p-6 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-4 rounded-3xl shadow-md">
                        <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-2">
                          {cart.map(item => (
                            <div key={item.product.id} className="flex justify-between items-center text-xs font-bold uppercase tracking-tight text-slate-900 dark:text-white">
                              <span className="text-slate-600 dark:text-slate-300 truncate max-w-[200px]">{item.quantity}x {item.product.name}</span>
                              <span className="text-slate-900 dark:text-white font-black">₦{(item.product.price * item.quantity).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2">
                          <div className="flex justify-between text-xs font-bold uppercase text-slate-900 dark:text-white">
                            <span className="text-slate-500 dark:text-muted-foreground">Subtotal</span>
                            <span className="text-slate-900 dark:text-white font-black">₦{cartTotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold uppercase text-slate-900 dark:text-white">
                            <span className="text-slate-500 dark:text-muted-foreground">Seat Delivery</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-black">FREE</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold uppercase text-slate-900 dark:text-white">
                            <span className="text-slate-500 dark:text-muted-foreground">Estimated Delivery</span>
                            <span className="text-amber-600 dark:text-amber-400 font-black">{cartDeliveryTime}</span>
                          </div>
                          <div className="flex justify-between text-lg font-black uppercase pt-2 border-t border-slate-200 dark:border-white/10 text-slate-900 dark:text-white">
                            <span>Total</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-black">₦{cartTotal.toLocaleString()}</span>
                          </div>
                        </div>
                        
                        <div className="pt-2 space-y-3">
                          <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                            <CheckCircle2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            <p className="text-[10px] text-amber-700 dark:text-amber-300 font-bold uppercase leading-tight">
                              By confirming, your order will be dispatched to the kitchen for immediate preparation.
                            </p>
                          </div>

                          <Button 
                            type="submit"
                            form="checkout-form"
                            disabled={isSubmitting}
                            className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-xl shadow-amber-500/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                          >
                            {isSubmitting ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Processing Order...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span>Confirm Order & Pay</span>
                                <ChevronRight className="w-4 h-4" />
                              </div>
                            )}
                          </Button>
                          <p className="text-[8px] text-center text-slate-400 dark:text-muted-foreground uppercase font-black tracking-widest">
                            Secured Payment via StreamAura Wallet
                          </p>
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
