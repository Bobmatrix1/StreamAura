import React, { useState, useEffect } from 'react';
import { getPreOrders, type PreOrder } from '../lib/firebase';
import { Loader2 } from 'lucide-react';
import { UploadModal } from './UploadModal';

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

  if (isLoading) {
    return <div className="flex justify-center items-center p-10"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {preOrders.map(order => (
        <div key={order.id} className="glass-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={order.thumbnail} className="w-16 h-16 object-cover rounded-lg" />
            <div>
              <p className="font-bold">{order.title}</p>
              <p className="text-xs text-muted-foreground">{order.userEmail}</p>
              <p className="text-xs text-muted-foreground">Requested: {new Date(order.requestedAt).toLocaleDateString()}</p>
            </div>
          </div>
          <button
            onClick={() => setSelectedPreOrder(order)}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg font-bold"
          >
            Fulfill
          </button>
        </div>
      ))}
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
