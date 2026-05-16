import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Trash2, 
  Image as ImageIcon, 
  Handshake, 
  Check, 
  X, 
  Loader2, 
  ExternalLink
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useToast } from '../contexts/ToastContext';
import { db, uploadFile } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, getDocs, updateDoc, query, orderBy } from 'firebase/firestore';

interface Partner {
  id: string;
  name: string;
  logo: string;
  website: string;
  active: boolean;
  createdAt: number;
}

export const PartnersManager: React.FC = () => {
  const { showSuccess, showError } = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const fetchPartners = async () => {
    setIsLoading(true);
    try {
      const partnersRef = collection(db, 'partners');
      const q = query(partnersRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Partner));
      setPartners(data);
    } catch (err) {
      showError("Failed to load partners");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const handleAddPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !logoFile) {
      showError("Name and Logo are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const logoUrl = await uploadFile(logoFile, 'partners', 'assets');
      
      await addDoc(collection(db, 'partners'), {
        name,
        website,
        logo: logoUrl,
        active: true,
        createdAt: Date.now()
      });

      showSuccess("Partner added successfully");
      setName('');
      setWebsite('');
      setLogoFile(null);
      setIsAdding(false);
      fetchPartners();
    } catch (err) {
      showError("Failed to add partner");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'partners', id), { active: !currentStatus });
      setPartners(partners.map(p => p.id === id ? { ...p, active: !currentStatus } : p));
      showSuccess("Status updated");
    } catch (err) {
      showError("Failed to update status");
    }
  };

  const handleDeletePartner = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this partner?")) return;
    
    try {
      await deleteDoc(doc(db, 'partners', id));
      setPartners(partners.filter(p => p.id !== id));
      showSuccess("Partner removed");
    } catch (err) {
      showError("Failed to remove partner");
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Handshake className="w-4 h-4 text-primary" /> Partners & Sponsors
          </h3>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Manage brands that appear on the homepage</p>
        </div>
        <Button onClick={() => setIsAdding(!isAdding)} className="gradient-bg h-9 text-[10px] font-black uppercase tracking-widest gap-2">
          {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {isAdding ? 'Cancel' : 'Add Partner'}
        </Button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Card className="p-6 bg-white/[0.02] border-white/10">
              <form onSubmit={handleAddPartner} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Partner Logo</label>
                    <div 
                      onClick={() => logoInputRef.current?.click()}
                      className={`aspect-video rounded-2xl border-2 border-dashed ${logoFile ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'} flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group relative overflow-hidden`}
                    >
                      {logoFile ? (
                         <div className="absolute inset-0">
                           <img src={URL.createObjectURL(logoFile)} className="w-full h-full object-contain p-4" />
                           <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                             <ImageIcon className="w-6 h-6 text-white" />
                           </div>
                         </div>
                      ) : (
                         <>
                          <ImageIcon className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                          <span className="text-[10px] font-black text-muted-foreground uppercase">Upload PNG/SVG</span>
                         </>
                      )}
                      <input type="file" ref={logoInputRef} onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="hidden" accept="image/*" />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Brand Name</label>
                      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cloudflare" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-primary/50" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Website URL (Optional)</label>
                      <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={isSubmitting} className="gradient-bg px-8 font-black uppercase text-[10px] tracking-widest h-12 shadow-lg shadow-primary/20">
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Partner'}
                    </Button>
                  </div>
                </div>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : partners.length > 0 ? partners.map(partner => (
          <Card key={partner.id} className="p-4 glass-card border-white/5 flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 p-2 flex items-center justify-center overflow-hidden">
                <img src={partner.logo} alt={partner.name} className="w-full h-full object-contain" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white truncate max-w-[120px]">{partner.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                   <Badge className={partner.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}>
                     {partner.active ? 'Active' : 'Hidden'}
                   </Badge>
                   {partner.website && (
                     <a href={partner.website} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="w-3 h-3" /></a>
                   )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleToggleStatus(partner.id, partner.active)} className={`p-2 rounded-lg transition-all ${partner.active ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-rose-500 hover:bg-rose-500/10'}`}>
                {partner.active ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              </button>
              <button onClick={() => handleDeletePartner(partner.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )) : (
          <div className="col-span-full py-20 text-center opacity-30 border-2 border-dashed border-white/5 rounded-3xl">
             <Handshake className="w-12 h-12 mx-auto mb-4" />
             <p className="text-sm font-bold uppercase tracking-widest">No partners added yet</p>
          </div>
        )}
      </div>
    </div>
  );
};
