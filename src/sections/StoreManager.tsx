import React, { useState, useEffect, useRef } from 'react';
import { 
  getVendors, 
  updateVendor, 
  deleteVendor,
  getProducts, 
  addProduct, 
  updateProduct, 
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
  Store, 
  Users, 
  Package, 
  Handshake, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Upload,
  Image as ImageIcon,
  DollarSign,
  Tag,
  Box,
  Loader2,
  Camera
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export const StoreManager: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'vendors' | 'products' | 'partners'>('vendors');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Form States
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: '', telegramGroupId: '' });

  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '', description: '', price: 0, slashPrice: 0, image: '', vendorId: '', inStock: true, quantity: 10, category: 'Snacks'
  });
  const [newPartner, setNewPartner] = useState<Partial<Partner>>({ name: '', logo: '', url: '' });

  const productFileRef = useRef<HTMLInputElement>(null);
  const partnerFileRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
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

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Vendor Handlers
  const handleCreateVendor = async () => {
    if (!newVendor.name.trim() || !newVendor.telegramGroupId.trim()) {
      toast.error('Please fill in both Vendor Name and Telegram Group ID');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const id = `vendor_${Date.now()}`;
      await updateVendor({ id, ...newVendor });
      toast.success(`Vendor "${newVendor.name}" created successfully`);
      setNewVendor({ name: '', telegramGroupId: '' });
      setIsAddingVendor(false);
      await fetchData();
    } catch (error: any) { 
      console.error('Create Vendor Error:', error);
      toast.error(error.message || 'Failed to create vendor'); 
    } finally {
      setIsSubmitting(true);
      // Wait a bit to prevent double clicks then reset
      setTimeout(() => setIsSubmitting(false), 500);
    }
  };

  const handleUpdateVendor = async () => {
    if (!editingVendor) return;
    if (!editingVendor.name.trim() || !editingVendor.telegramGroupId.trim()) {
      toast.error('Fields cannot be empty');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateVendor(editingVendor);
      toast.success('Vendor updated successfully');
      setEditingVendor(null);
      await fetchData();
    } catch (error: any) { 
      console.error('Update Vendor Error:', error);
      toast.error(error.message || 'Failed to update vendor'); 
    } finally {
      setTimeout(() => setIsSubmitting(false), 500);
    }
  };

  const handleDeleteVendor = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vendor? All products under this vendor will remain but won\'t route correctly.')) return;
    try {
      await deleteVendor(id);
      toast.success('Vendor deleted');
      fetchData();
    } catch (error) { toast.error('Delete failed'); }
  };

  // Product Handlers
  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.vendorId || !newProduct.image) {
      toast.error('Please fill name, vendor and upload an image');
      return;
    }
    try {
      await addProduct(newProduct as Omit<Product, 'id'>);
      toast.success('Product added');
      setNewProduct({ name: '', description: '', price: 0, slashPrice: 0, image: '', vendorId: '', inStock: true, quantity: 10, category: 'Snacks' });
      fetchData();
    } catch (error) { toast.error('Add failed'); }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteProduct(id);
      toast.success('Product deleted');
      fetchData();
    } catch (error) { toast.error('Delete failed'); }
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

  const handleDeletePartner = async (id: string) => {
    try {
      await deletePartner(id);
      toast.success('Partner removed');
      fetchData();
    } catch (error) { toast.error('Delete failed'); }
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-fit border border-white/10">
        {[
          { id: 'vendors', label: 'Vendors', icon: Users },
          { id: 'products', label: 'Products', icon: Package },
          { id: 'partners', label: 'Partners', icon: Handshake }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === tab.id ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Vendors Management */}
      {activeSubTab === 'vendors' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
             <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
               <Users className="w-4 h-4" /> Manage Vendors
             </h3>
             <Button onClick={() => setIsAddingVendor(true)} variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest gap-2">
               <Plus className="w-3 h-3" /> New Vendor
             </Button>
          </div>

          <AnimatePresence>
            {isAddingVendor && (
              <Card className="p-4 glass-card border-primary/20 bg-primary/5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Vendor Name</label>
                    <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs" placeholder="e.g. Ada Chinchin" value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Telegram Group ID</label>
                    <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono" placeholder="-100..." value={newVendor.telegramGroupId} onChange={e => setNewVendor({...newVendor, telegramGroupId: e.target.value})} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsAddingVendor(false)} className="h-9 text-[10px] font-black uppercase">Cancel</Button>
                  <Button onClick={handleCreateVendor} className="h-9 text-[10px] font-black uppercase px-6 gradient-bg">Save Vendor</Button>
                </div>
              </Card>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vendors.map(v => (
              <Card key={v.id} className="p-4 glass-card border-white/10 flex justify-between items-center group">
                {editingVendor?.id === v.id ? (
                  <div className="flex-1 space-y-2 pr-4">
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-bold" 
                      value={editingVendor.name} 
                      onChange={e => setEditingVendor({...editingVendor, name: e.target.value})}
                    />
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] font-mono" 
                      value={editingVendor.telegramGroupId} 
                      onChange={e => setEditingVendor({...editingVendor, telegramGroupId: e.target.value})}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-black text-sm uppercase tracking-tight">{v.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">TG ID: {v.telegramGroupId}</p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  {editingVendor?.id === v.id ? (
                    <>
                      <Button size="icon" variant="ghost" onClick={handleUpdateVendor} className="text-emerald-500"><Check className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingVendor(null)} className="text-rose-500"><X className="w-4 h-4" /></Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => setEditingVendor(v)} className="text-primary hover:bg-primary/10"><Edit2 className="w-4 h-4" /></Button>
                      <button onClick={() => handleDeleteVendor(v.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
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
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Vendor</label>
                  <select className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs" value={newProduct.vendorId} onChange={e => setNewProduct({...newProduct, vendorId: e.target.value})}>
                    <option value="">Select Vendor</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Price (₦)</label>
                  <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs" placeholder="3000" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Slash Price (₦)</label>
                  <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs" placeholder="4500" value={newProduct.slashPrice} onChange={e => setNewProduct({...newProduct, slashPrice: parseFloat(e.target.value)})} />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Description</label>
                  <textarea className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs h-20 resize-none" placeholder="Crispy and fresh..." value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
                </div>
              </div>

              {/* Product Image Upload */}
              <div className="space-y-4">
                <label className="text-[9px] font-black uppercase text-muted-foreground ml-1 block text-center">Product Image</label>
                <div 
                  onClick={() => productFileRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-white/10 bg-black/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all overflow-hidden group relative"
                >
                  {newProduct.image ? (
                    <>
                      <img src={newProduct.image} className="w-full h-full object-cover" alt="Preview" />
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <Camera className="w-8 h-8 text-white mb-2" />
                        <span className="text-[8px] font-black uppercase text-white">Change Image</span>
                      </div>
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
                  <Badge variant={p.inStock ? "default" : "secondary"} className="text-[8px] h-4">{p.inStock ? 'IN STOCK' : 'OUT OF STOCK'}</Badge>
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
                 <label className="text-[9px] font-black uppercase text-muted-foreground block text-center">Partner Logo</label>
                 <div 
                  onClick={() => partnerFileRef.current?.click()}
                  className="w-full aspect-video rounded-2xl border-2 border-dashed border-white/10 bg-black/40 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/50 transition-all overflow-hidden group relative"
                >
                  {newPartner.logo ? (
                    <>
                      <img src={newPartner.logo} className="w-full h-full object-contain p-4" alt="Preview" />
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <Camera className="w-6 h-6 text-white mb-2" />
                        <span className="text-[8px] font-black uppercase text-white">Change Logo</span>
                      </div>
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
    </div>
  );
};
