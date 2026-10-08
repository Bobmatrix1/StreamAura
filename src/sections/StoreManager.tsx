import React, { useState, useEffect, useRef } from 'react';
import { 
  getVendors, 
  updateVendor, 
  deleteVendor,
  getProducts, 
  addProduct, 
  deleteProduct, 
  getPartners, 
  addPartner, 
  deletePartner,
  uploadFile,
  type Vendor,
  type Product,
  type Partner
} from '../lib/firebase';
import { 
  Users, 
  Package, 
  Handshake, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Upload,
  Loader2,
  Camera,
  Clock,
  Store,
  Copy,
  ImageIcon,
  ChefHat
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { CustomPlatformDropdown } from '../components/ui/CustomPlatformDropdown';
import { STORE_CATEGORIES } from '../types';

export const StoreManager: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'vendors' | 'products' | 'partners'>('vendors');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingVendorAsset, setIsUploadingVendorAsset] = useState<'flyer' | 'logo' | null>(null);

  // In-app Delete Confirmation Modal State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'vendor' | 'product' | 'partner';
    id: string;
    name: string;
    image?: string;
  }>({
    isOpen: false,
    type: 'product',
    id: '',
    name: '',
    image: ''
  });

  // Form States
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [newVendor, setNewVendor] = useState<Partial<Vendor>>({ 
    name: '', 
    telegramGroupId: '',
    tagline: '',
    category: 'Snacks & Bites',
    deliveryTime: '5-10 mins',
    logo: '',
    flyer: '',
    description: '',
    phone: ''
  });

  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '', description: '', price: 0, slashPrice: 0, deliveryTime: '5-10 mins', image: '', vendorId: '', inStock: true, quantity: 10, category: 'Snacks'
  });
  const [newPartner, setNewPartner] = useState<Partial<Partner>>({ name: '', logo: '', url: '' });

  const productFileRef = useRef<HTMLInputElement>(null);
  const partnerFileRef = useRef<HTMLInputElement>(null);
  const newVendorFlyerRef = useRef<HTMLInputElement>(null);
  const newVendorLogoRef = useRef<HTMLInputElement>(null);
  const editVendorFlyerRef = useRef<HTMLInputElement>(null);
  const editVendorLogoRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      const [v, p, pt] = await Promise.all([getVendors(), getProducts(), getPartners()]);
      
      // Initialize default vendors if missing
      if (v.length === 0) {
        const defaults: Vendor[] = [
          { id: 'vendorA', name: 'Vendor A', telegramGroupId: '-5213737575' },
          { id: 'vendorB', name: 'Vendor B', telegramGroupId: '-5034217395' },
          { id: 'vendorC', name: 'Vendor C', telegramGroupId: '-5234642721' },
          { id: 'vendorD', name: 'Vendor D', telegramGroupId: '-5242703318' },
          { id: 'vendorE', name: 'Vendor E', telegramGroupId: '-5277224435' }
        ];
        for (const vend of defaults) await updateVendor(vend);
        setVendors(defaults);
      } else {
        setVendors(v);
      }
      
      setProducts(p);
      setPartners(pt);
    } catch (error) {
      toast.error('Failed to load store data');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Image Upload Handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'product' | 'partner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await uploadFile(file, `store/${type}s`);
      if (type === 'product') setNewProduct(prev => ({ ...prev, image: url }));
      else setNewPartner(prev => ({ ...prev, logo: url }));
      toast.success('Image uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveProductImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNewProduct(prev => ({ ...prev, image: '' }));
    if (productFileRef.current) productFileRef.current.value = '';
    toast.info('Product image removed');
  };

  const handleRemovePartnerLogo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNewPartner(prev => ({ ...prev, logo: '' }));
    if (partnerFileRef.current) partnerFileRef.current.value = '';
    toast.info('Partner logo removed');
  };

  // Copy Store Link helper
  const handleCopyVendorStoreLink = (vendorId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://streamaura.site';
    const url = `${origin}/?craveStore=${vendorId}`;
    navigator.clipboard.writeText(url);
    toast.success('🔗 Store link copied to clipboard!');
  };

  // Vendor Flyer / Logo Upload Handlers
  const handleVendorAssetUpload = async (
    e: React.ChangeEvent<HTMLInputElement>, 
    assetType: 'flyer' | 'logo', 
    target: 'new' | 'edit'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingVendorAsset(assetType);
    try {
      const url = await uploadFile(file, `vendors/${assetType}s`);
      if (target === 'new') {
        setNewVendor(prev => ({ ...prev, [assetType]: url }));
      } else if (editingVendor) {
        setEditingVendor({ ...editingVendor, [assetType]: url });
      }
      toast.success(`Vendor ${assetType} uploaded successfully`);
    } catch (error) {
      toast.error(`Failed to upload ${assetType}`);
    } finally {
      setIsUploadingVendorAsset(null);
    }
  };

  // Vendor Handlers
  const handleCreateVendor = async () => {
    if (!newVendor.name?.trim() || !newVendor.telegramGroupId?.trim()) {
      toast.error('Please fill in both Vendor Name and Telegram Group ID');
      return;
    }
    
    try {
      const id = `vendor_${Date.now()}`;
      await updateVendor({ id, ...newVendor } as Vendor);
      toast.success(`Vendor "${newVendor.name}" created successfully`);
      setNewVendor({ 
        name: '', 
        telegramGroupId: '',
        tagline: '',
        category: 'Snacks & Bites',
        deliveryTime: '5-10 mins',
        logo: '',
        flyer: '',
        description: '',
        phone: ''
      });
      setIsAddingVendor(false);
      await fetchData();
    } catch (error: any) { 
      console.error('Create Vendor Error:', error);
      toast.error(error.message || 'Failed to create vendor'); 
    }
  };

  const handleUpdateVendor = async () => {
    if (!editingVendor) return;
    if (!editingVendor.name?.trim() || !editingVendor.telegramGroupId?.trim()) {
      toast.error('Fields cannot be empty');
      return;
    }

    try {
      await updateVendor(editingVendor);
      toast.success('Vendor updated successfully');
      setEditingVendor(null);
      await fetchData();
    } catch (error: any) { 
      console.error('Update Vendor Error:', error);
      toast.error(error.message || 'Failed to update vendor'); 
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.id) return;
    const { id, type, name, image } = deleteModal;

    // 1. Close modal and optimistically remove item immediately (0ms lag)
    setDeleteModal({ isOpen: false, type: 'product', id: '', name: '', image: '' });

    if (type === 'vendor') {
      setVendors(prev => prev.filter(v => v.id !== id));
      toast.success(`Vendor "${name}" deleted`);
    } else if (type === 'product') {
      setProducts(prev => prev.filter(p => p.id !== id));
      toast.success(`Product "${name}" deleted`);
    } else if (type === 'partner') {
      setPartners(prev => prev.filter(p => p.id !== id));
      toast.success(`Partner "${name}" removed`);
    }

    // 2. Perform backend/database deletion
    try {
      if (type === 'vendor') {
        await deleteVendor(id);
      } else if (type === 'product') {
        await deleteProduct(id, image);
      } else if (type === 'partner') {
        await deletePartner(id, image);
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(err?.message || 'Delete failed');
      fetchData(); // Rollback / sync state on failure
    }
  };

  const handleDeleteVendor = (id: string) => {
    const v = vendors.find(item => item.id === id);
    setDeleteModal({
      isOpen: true,
      type: 'vendor',
      id,
      name: v?.name || 'this vendor'
    });
  };

  // Product Handlers
  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.vendorId || !newProduct.image) {
      toast.error('Please fill name, vendor and upload an image');
      return;
    }
    try {
      await addProduct({
        ...newProduct,
        inStock: true,
        available: true,
        stockStatus: 'in_stock'
      } as Omit<Product, 'id'>);
      toast.success('Product added');
      setNewProduct({ name: '', description: '', price: 0, slashPrice: 0, deliveryTime: '5-10 mins', image: '', vendorId: '', inStock: true, quantity: 10, category: 'Snacks' });
      fetchData();
    } catch (error) { toast.error('Add failed'); }
  };

  const handleDeleteProduct = (id: string) => {
    const prod = products.find(p => p.id === id);
    setDeleteModal({
      isOpen: true,
      type: 'product',
      id,
      name: prod?.name || 'this product',
      image: prod?.image
    });
  };

  // Partner Handlers
  const handleAddPartner = async () => {
    if (!newPartner.name || !newPartner.logo) {
      toast.error('Please provide name and upload a logo');
      return;
    }
    try {
      await addPartner(newPartner as Omit<Partner, 'id'>);
      toast.success('Partner added');
      setNewPartner({ name: '', logo: '', url: '' });
      fetchData();
    } catch (error) { toast.error('Add failed'); }
  };

  const handleDeletePartner = (id: string) => {
    const pt = partners.find(p => p.id === id);
    setDeleteModal({
      isOpen: true,
      type: 'partner',
      id,
      name: pt?.name || 'this partner',
      image: pt?.logo
    });
  };

  const handleSubTabChange = (tab: 'vendors' | 'products' | 'partners') => {
    setIsAddingVendor(false);
    setNewVendor({ 
      name: '', 
      telegramGroupId: '',
      tagline: '',
      category: 'Snacks & Bites',
      deliveryTime: '5-10 mins',
      logo: '',
      flyer: '',
      description: '',
      phone: ''
    });
    setEditingVendor(null);
    setNewProduct({ name: '', description: '', price: 0, slashPrice: 0, image: '', vendorId: '', inStock: true, quantity: 10, category: 'Snacks' });
    setNewPartner({ name: '', logo: '', url: '' });
    setActiveSubTab(tab);
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="overflow-x-auto no-scrollbar -mx-2 px-2 pb-2">
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl min-w-max border border-white/10">
          {[
            { id: 'vendors', label: 'Vendors', icon: Users },
            { id: 'products', label: 'Products', icon: Package },
            { id: 'partners', label: 'Partners', icon: Handshake }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleSubTabChange(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === tab.id ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Vendors Management */}
      {activeSubTab === 'vendors' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
             <div>
               <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                 <Store className="w-4 h-4 text-amber-500" /> Manage Brand Vendors & Flyers
               </h3>
               <p className="text-[10px] text-muted-foreground uppercase mt-0.5">
                 Manage vendor brand logos, flyer banners, taglines, and direct Crave Aura store links
               </p>
             </div>
             <Button onClick={() => setIsAddingVendor(true)} variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest gap-2">
               <Plus className="w-3 h-3" /> New Brand Vendor
             </Button>
          </div>

          {/* Hidden inputs for Flyer & Logo uploads */}
          <input 
            type="file" 
            ref={newVendorFlyerRef} 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => handleVendorAssetUpload(e, 'flyer', 'new')} 
          />
          <input 
            type="file" 
            ref={newVendorLogoRef} 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => handleVendorAssetUpload(e, 'logo', 'new')} 
          />
          <input 
            type="file" 
            ref={editVendorFlyerRef} 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => handleVendorAssetUpload(e, 'flyer', 'edit')} 
          />
          <input 
            type="file" 
            ref={editVendorLogoRef} 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => handleVendorAssetUpload(e, 'logo', 'edit')} 
          />

          <AnimatePresence>
            {isAddingVendor && (
              <Card className="p-5 glass-card border-amber-500/30 bg-amber-500/5 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5" /> Create New Brand Store
                  </h4>
                  <Button variant="ghost" size="icon" onClick={() => setIsAddingVendor(false)} className="h-6 w-6">
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Brand Name (e.g. Zobo by Liza)</label>
                    <input 
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-bold" 
                      placeholder="e.g. Zobo by Liza, Small Chops by Sam" 
                      value={newVendor.name || ''} 
                      onChange={e => setNewVendor({...newVendor, name: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Tagline / What They Sell</label>
                    <input 
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs" 
                      placeholder="e.g. Authentic Chilled Hibiscus Drinks & Fruit Blends" 
                      value={newVendor.tagline || ''} 
                      onChange={e => setNewVendor({...newVendor, tagline: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Category / Specialty</label>
                    <CustomPlatformDropdown
                      value={newVendor.category || STORE_CATEGORIES[0]}
                      onChange={val => setNewVendor({...newVendor, category: val})}
                      options={STORE_CATEGORIES as unknown as string[]}
                      variant="gold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Telegram Group ID (for order alerts)</label>
                    <input 
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono" 
                      placeholder="-100..." 
                      value={newVendor.telegramGroupId || ''} 
                      onChange={e => setNewVendor({...newVendor, telegramGroupId: e.target.value})} 
                    />
                  </div>
                </div>

                {/* Upload flyer and logo for new vendor */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 text-amber-500" /> Brand Flyer Banner
                    </label>
                    <div 
                      onClick={() => newVendorFlyerRef.current?.click()}
                      className="h-24 rounded-xl border-2 border-dashed border-white/10 bg-black/40 flex items-center justify-center cursor-pointer hover:border-amber-500/50 transition-all overflow-hidden relative"
                    >
                      {isUploadingVendorAsset === 'flyer' ? (
                        <div className="text-center p-2">
                          <Loader2 className="w-5 h-5 mx-auto text-amber-500 mb-1 animate-spin" />
                          <span className="text-[9px] uppercase font-bold text-muted-foreground">Uploading Flyer...</span>
                        </div>
                      ) : newVendor.flyer ? (
                        <img src={newVendor.flyer} alt="Flyer" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center p-2">
                          <Upload className="w-4 h-4 mx-auto text-amber-500 mb-1" />
                          <span className="text-[9px] uppercase font-bold text-muted-foreground">Upload Flyer Banner</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1 flex items-center gap-1">
                      <Store className="w-3 h-3 text-amber-500" /> Brand Logo / Avatar
                    </label>
                    <div 
                      onClick={() => newVendorLogoRef.current?.click()}
                      className="h-24 rounded-xl border-2 border-dashed border-white/10 bg-black/40 flex items-center justify-center cursor-pointer hover:border-amber-500/50 transition-all overflow-hidden relative"
                    >
                      {isUploadingVendorAsset === 'logo' ? (
                        <div className="text-center p-2">
                          <Loader2 className="w-5 h-5 mx-auto text-amber-500 mb-1 animate-spin" />
                          <span className="text-[9px] uppercase font-bold text-muted-foreground">Uploading Logo...</span>
                        </div>
                      ) : newVendor.logo ? (
                        <img src={newVendor.logo} alt="Logo" className="w-16 h-16 object-cover rounded-xl" />
                      ) : (
                        <div className="text-center p-2">
                          <ChefHat className="w-4 h-4 mx-auto text-amber-500 mb-1" />
                          <span className="text-[9px] uppercase font-bold text-muted-foreground">Upload Brand Logo</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setIsAddingVendor(false)} className="h-9 text-[10px] font-black uppercase">Cancel</Button>
                  <Button onClick={handleCreateVendor} className="h-9 text-[10px] font-black uppercase px-6 gradient-bg">Save Brand Vendor</Button>
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* Vendors Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vendors.map(v => (
              <Card key={v.id} className="glass-card border-white/10 overflow-hidden flex flex-col justify-between group hover:border-amber-500/30 transition-all">
                {editingVendor?.id === v.id ? (
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase text-amber-400">Editing Brand: {v.name}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={handleUpdateVendor} className="text-emerald-400 h-7 text-[10px] font-bold"><Check className="w-3.5 h-3.5 mr-1" /> Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingVendor(null)} className="text-rose-400 h-7 text-[10px] font-bold"><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      <div>
                        <label className="text-[8px] font-black uppercase text-muted-foreground">Brand Name</label>
                        <input 
                          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-bold" 
                          value={editingVendor.name || ''} 
                          onChange={e => setEditingVendor({...editingVendor, name: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-black uppercase text-muted-foreground">Tagline / What they sell</label>
                        <input 
                          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs" 
                          value={editingVendor.tagline || ''} 
                          placeholder="e.g. Zobo drinks, small chops"
                          onChange={e => setEditingVendor({...editingVendor, tagline: e.target.value})}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[8px] font-black uppercase text-muted-foreground">Category</label>
                          <input 
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs" 
                            value={editingVendor.category || 'Snacks & Bites'} 
                            onChange={e => setEditingVendor({...editingVendor, category: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase text-muted-foreground">Telegram Group ID</label>
                          <input 
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-mono" 
                            value={editingVendor.telegramGroupId || ''} 
                            onChange={e => setEditingVendor({...editingVendor, telegramGroupId: e.target.value})}
                          />
                        </div>
                      </div>

                      {/* Flyer / Logo replace triggers */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => editVendorFlyerRef.current?.click()}
                          disabled={isUploadingVendorAsset === 'flyer'}
                          className="h-7 text-[9px] uppercase font-black border-white/10"
                        >
                          {isUploadingVendorAsset === 'flyer' ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin text-amber-400" />
                          ) : (
                            <Upload className="w-3 h-3 mr-1 text-amber-400" />
                          )}
                          {editingVendor.flyer ? 'Replace Flyer' : 'Add Flyer'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => editVendorLogoRef.current?.click()}
                          disabled={isUploadingVendorAsset === 'logo'}
                          className="h-7 text-[9px] uppercase font-black border-white/10"
                        >
                          {isUploadingVendorAsset === 'logo' ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin text-amber-400" />
                          ) : (
                            <Upload className="w-3 h-3 mr-1 text-amber-400" />
                          )}
                          {editingVendor.logo ? 'Replace Logo' : 'Add Logo'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Flyer Banner Thumbnail */}
                    {v.flyer && (
                      <div className="relative aspect-[21/9] w-full bg-slate-900 overflow-hidden border-b border-white/5">
                        <img src={v.flyer} alt={v.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        <div className="absolute bottom-2 left-3 right-3 flex justify-between items-center">
                          <Badge variant="outline" className="text-[8px] font-black uppercase border-amber-500/40 text-amber-300 bg-black/60">
                            {v.category || 'Kitchen'}
                          </Badge>
                          <span className="text-[8px] font-mono text-white/70 bg-black/60 px-1.5 py-0.5 rounded">
                            {v.deliveryTime || '5-10 mins'}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                            {v.logo ? (
                              <img src={v.logo} alt={v.name} className="w-full h-full object-cover" />
                            ) : (
                              <ChefHat className="w-5 h-5 text-amber-500" />
                            )}
                          </div>
                          <div>
                            <p className="font-black text-sm uppercase tracking-tight text-white">{v.name}</p>
                            {v.tagline && (
                              <p className="text-[10px] text-amber-400 font-bold line-clamp-1">{v.tagline}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditingVendor(v)} className="text-primary hover:bg-primary/10 h-8 w-8">
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <button onClick={() => handleDeleteVendor(v.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono bg-black/40 p-2 rounded-lg border border-white/5">
                        <span>TG: {v.telegramGroupId}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyVendorStoreLink(v.id)}
                          className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-bold uppercase"
                        >
                          <Copy className="w-3 h-3" /> Store Link
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Products Management */}
      {activeSubTab === 'products' && (
        <div className="space-y-6">
          <Card className="p-6 glass-card border-primary/20 bg-primary/5">
            <h4 className="text-sm font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-primary">
              <Plus className="w-4 h-4" /> Add New Snack
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Product Info */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Product Name</label>
                  <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs" placeholder="e.g. Jumbo Popcorn" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Vendor / Kitchen</label>
                  <CustomPlatformDropdown
                    value={newProduct.vendorId || ''}
                    onChange={val => setNewProduct({...newProduct, vendorId: val})}
                    options={vendors.map(v => ({ value: v.id, label: v.name, description: v.category || v.tagline }))}
                    placeholder="Select Vendor / Kitchen"
                    variant="gold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Product Category</label>
                  <CustomPlatformDropdown
                    value={newProduct.category || STORE_CATEGORIES[3]}
                    onChange={val => setNewProduct({...newProduct, category: val})}
                    options={STORE_CATEGORIES as unknown as string[]}
                    variant="gold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Price (₦)</label>
                  <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs" placeholder="3000" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Delivery Time</label>
                  <input type="text" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs" placeholder="e.g. 5-10 mins" value={newProduct.deliveryTime || ''} onChange={e => setNewProduct({...newProduct, deliveryTime: e.target.value})} />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Description</label>
                  <textarea className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs h-20 resize-none" placeholder="Crispy and fresh..." value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
                </div>
              </div>

              {/* Product Image Upload */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Product Image</label>
                  {newProduct.image && (
                    <button
                      type="button"
                      onClick={handleRemoveProductImage}
                      className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
                <div 
                  onClick={() => productFileRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-white/10 bg-black/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all overflow-hidden group relative"
                >
                  {newProduct.image ? (
                    <>
                      <img src={newProduct.image} className="w-full h-full object-cover" alt="Preview" />
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all gap-2">
                        <Camera className="w-6 h-6 text-white" />
                        <span className="text-[8px] font-black uppercase text-white">Change Image</span>
                        <button
                          type="button"
                          onClick={handleRemoveProductImage}
                          className="px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white text-[8px] font-black uppercase tracking-wider transition-all"
                        >
                          Remove Image
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveProductImage}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-rose-600 text-white transition-all shadow-md z-10"
                        title="Remove image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {isUploading ? <Loader2 className="w-8 h-8 text-primary animate-spin" /> : <Upload className="w-8 h-8 text-muted-foreground mb-2" />}
                      <span className="text-[8px] font-black uppercase text-muted-foreground">Upload from Device</span>
                    </>
                  )}
                  <input ref={productFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'product')} />
                </div>
                <Button className="w-full h-11 font-black uppercase tracking-widest text-[10px] gradient-bg" onClick={handleAddProduct} disabled={isUploading}>
                  Publish Product
                </Button>
              </div>
            </div>
          </Card>

          {/* Products List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(p => (
              <Card key={p.id} className="overflow-hidden glass-card border-white/10 flex gap-4 p-3 relative group">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-black/40">
                  <img src={p.image} className="w-full h-full object-cover" alt={p.name} />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-black text-xs uppercase truncate pr-6">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground font-bold italic">{vendors.find(v => v.id === p.vendorId)?.name || 'Unknown Vendor'}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-black text-xs">₦{p.price.toLocaleString()}</span>
                    {p.slashPrice && <span className="text-[10px] text-muted-foreground line-through italic">₦{p.slashPrice.toLocaleString()}</span>}
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <Badge variant={p.inStock ? "default" : "secondary"} className="text-[8px] h-4">{p.inStock ? 'IN STOCK' : 'OUT OF STOCK'}</Badge>
                    {p.deliveryTime && (
                      <span className="text-[9px] text-amber-400 font-bold flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        <Clock className="w-2.5 h-2.5" /> {p.deliveryTime}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleDeleteProduct(p.id)} className="absolute top-2 right-2 p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Partners Management */}
      {activeSubTab === 'partners' && (
        <div className="space-y-6">
          <Card className="p-6 glass-card border-emerald-500/20 bg-emerald-500/5">
            <h4 className="text-sm font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-emerald-500">
              <Handshake className="w-4 h-4" /> Add Partner
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4 md:col-span-2">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Partner Name</label>
                    <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs" placeholder="e.g. Coca Cola" value={newPartner.name} onChange={e => setNewPartner({...newPartner, name: e.target.value})} />
                 </div>
                 <Button className="w-full h-11 font-black uppercase tracking-widest text-[10px] bg-emerald-600 hover:bg-emerald-500" onClick={handleAddPartner} disabled={isUploading}>
                   Register Partner
                 </Button>
              </div>

              <div className="space-y-2">
                 <div className="flex items-center justify-between">
                   <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Partner Logo</label>
                   {newPartner.logo && (
                     <button
                       type="button"
                       onClick={handleRemovePartnerLogo}
                       className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-rose-500/10"
                     >
                       <Trash2 className="w-3 h-3" /> Remove
                     </button>
                   )}
                 </div>
                 <div 
                  onClick={() => partnerFileRef.current?.click()}
                  className="w-full aspect-video rounded-2xl border-2 border-dashed border-white/10 bg-black/40 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/50 transition-all overflow-hidden group relative"
                >
                  {newPartner.logo ? (
                    <>
                      <img src={newPartner.logo} className="w-full h-full object-contain p-4" alt="Preview" />
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all gap-2">
                        <Camera className="w-6 h-6 text-white" />
                        <span className="text-[8px] font-black uppercase text-white">Change Logo</span>
                        <button
                          type="button"
                          onClick={handleRemovePartnerLogo}
                          className="px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white text-[8px] font-black uppercase tracking-wider transition-all"
                        >
                          Remove Logo
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePartnerLogo}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-rose-600 text-white transition-all shadow-md z-10"
                        title="Remove logo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {isUploading ? <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /> : <Upload className="w-6 h-6 text-muted-foreground mb-2" />}
                      <span className="text-[8px] font-black uppercase text-muted-foreground">Upload Logo</span>
                    </>
                  )}
                  <input ref={partnerFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'partner')} />
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {partners.map(pt => (
              <div key={pt.id} className="glass-card p-4 flex flex-col items-center gap-2 relative group">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/5 p-2 flex items-center justify-center border border-white/5">
                  <img src={pt.logo} className="w-full h-full object-contain" alt={pt.name} />
                </div>
                <p className="text-[10px] font-black uppercase text-center truncate w-full">{pt.name}</p>
                <button onClick={() => handleDeletePartner(pt.id)} className="absolute -top-1 -right-1 p-1.5 rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 shadow-lg transition-all active:scale-90">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In-App Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModal.isOpen && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4"
            onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
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
                  Delete {deleteModal.type.toUpperCase()}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Are you sure you want to permanently delete <span className="font-bold text-white">"{deleteModal.name}"</span>?
                  {deleteModal.type === 'product' && ' This will remove it from the Crave Aura Store and Cloudflare storage.'}
                  {deleteModal.type === 'vendor' && ' Products under this vendor will remain but won\'t route correctly.'}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1 h-10 sm:h-11 rounded-xl text-[10px] sm:text-xs font-black uppercase"
                  onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  onClick={handleConfirmDelete}
                  className="flex-1 h-10 sm:h-11 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white font-black"
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
