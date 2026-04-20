import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { uploadToCloud, fulfillPreOrder, type PreOrder, type CloudMovie } from '../lib/firebase';
import { useToast } from '../contexts/ToastContext';

interface UploadModalProps {
  preOrder: PreOrder;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ preOrder, onClose, onSuccess }) => {
  const [streamUrl, setStreamUrl] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isFulfilling, setIsFulfilling] = useState(false);
  const { showSuccess, showError } = useToast();

  const handleFulfill = async () => {
    if (!streamUrl || !downloadUrl) {
      showError('Please provide both stream and download URLs');
      return;
    }
    setIsFulfilling(true);
    try {
      const movieData: CloudMovie = {
        id: preOrder.movieId,
        title: preOrder.title,
        thumbnail: preOrder.thumbnail,
        description: '', // You can add a field for this later if needed
        year: '',
        rating: '',
        streamUrl,
        downloadUrl,
        mediaType: 'movie',
        addedAt: Date.now(),
      };

      await uploadToCloud(movieData);
      await fulfillPreOrder(preOrder.id, preOrder.userId, preOrder.title);
      showSuccess('Movie fulfilled and user notified!');
      onSuccess();
    } catch (err) {
      showError('Failed to fulfill order');
    } finally {
      setIsFulfilling(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full max-w-lg p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold">Fulfill Pre-Order: {preOrder.title}</h3>
          <button onClick={onClose}><X /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground">Stream URL</label>
            <input
              type="text"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              className="w-full glass-input p-2 rounded-lg mt-1"
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground">Download URL</label>
            <input
              type="text"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              className="w-full glass-input p-2 rounded-lg mt-1"
              placeholder="https://..."
            />
          </div>
        </div>
        <button
          onClick={handleFulfill}
          disabled={isFulfilling}
          className="w-full py-3 bg-cyan-600 text-white rounded-lg font-bold flex items-center justify-center"
        >
          {isFulfilling ? <Loader2 className="animate-spin" /> : 'Fulfill & Notify'}
        </button>
      </motion.div>
    </div>,
    document.body
  );
};
