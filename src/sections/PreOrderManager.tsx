import React, { useState, useEffect } from 'react';
import { getPreOrders, type PreOrder } from '../lib/firebase';
import { RefreshCw, Play, Clock, User, Film, Tv } from 'lucide-react';
import { UploadModal } from './UploadModal';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

export const PreOrderManager: React.FC = () => {
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);

  const fetchPreOrders = async () => {
    setIsLoading(true);
    try {
      const data = await getPreOrders();
      setPreOrders(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPreOrders();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Global Pre-orders</h3>
        <button onClick={fetchPreOrders} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <RefreshCw className={`w-4 h-4 text-primary ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
           <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : preOrders.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {preOrders.map(order => (
            <div key={order.id} className={`glass-card p-4 flex items-center justify-between border-white/5 group hover:bg-white/[0.02] transition-all ${order.status === 'available' ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-4">
                <div className="w-16 h-20 relative rounded-lg overflow-hidden border border-white/10">
                   <img src={order.thumbnail} className="w-full h-full object-cover" />
                   <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      {order.mediaType === 'series' ? <Tv className="w-6 h-6 text-white/50" /> : <Film className="w-6 h-6 text-white/50" />}
                   </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-sm uppercase tracking-tight text-white">{order.title}</p>
                    {order.season && <Badge variant="outline" className="text-[7px] border-primary/20 text-primary uppercase">S{order.season} E{order.episode}</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-bold uppercase">
                     <span className="flex items-center gap-1.5"><User className="w-3 h-3" /> {order.userName}</span>
                     <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {new Date(order.requestedAt).toLocaleDateString()}</span>
                  </div>
                  <Badge className={`text-[8px] font-black uppercase ${order.status === 'available' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {order.status === 'available' ? 'READY' : 'PENDING'}
                  </Badge>
                </div>
              </div>
              
              {order.status === 'pending' && (
                <Button
                  onClick={() => setSelectedPreOrder(order)}
                  className="gradient-bg text-white rounded-xl font-black uppercase text-[10px] tracking-widest px-6 h-10 shadow-lg shadow-primary/20"
                >
                  Deliver
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center opacity-20">
           <Play className="w-12 h-12 mx-auto mb-4" />
           <p className="text-sm font-bold uppercase tracking-widest">No pending pre-orders</p>
        </div>
      )}

      {selectedPreOrder && (
        <UploadModal
          preOrder={selectedPreOrder}
          onClose={() => setSelectedPreOrder(null)}
          onSuccess={() => {
            fetchPreOrders();
            setSelectedPreOrder(null);
          }}
        />
      )}
    </div>
  );
};
