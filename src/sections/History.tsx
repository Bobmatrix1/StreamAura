/**
 * History Component
 * 
 * Displays recent downloads with options to clear individual items or all history.
 * Data is persisted in localStorage.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  Trash2, 
  FileVideo, 
  FileAudio,
  X,
  AlertTriangle
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';

const History: React.FC = () => {
  const { history, removeFromHistory, clearHistory } = useDownload();
  const { showSuccess } = useToast();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Handle clear all
  const handleClearAll = () => {
    clearHistory();
    setIsConfirmModalOpen(false);
    showSuccess('History cleared successfully');
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConfirmModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md glass-card p-6 md:p-8 border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
              
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground">Clear All History</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Are you sure you want to permanently delete your entire local download history? This action cannot be undone.
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full pt-4">
                  <button
                    onClick={() => setIsConfirmModalOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20 transition-all"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold gradient-text">Download History</h2>
          <p className="text-sm text-muted-foreground">
            Your recent downloads are saved here
          </p>
        </div>
        {history.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsConfirmModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-sm font-bold"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear History</span>
          </motion.button>
        )}
      </div>

      {/* History List */}
      <AnimatePresence mode="popLayout">
        {history.length > 0 ? (
          <div className="grid gap-3">
            {history.map((item, index) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: index * 0.05 }}
                className="glass-card p-4 group relative overflow-hidden"
              >
                <div className="flex items-center gap-4 relative z-10">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-black/30 flex-shrink-0 border border-white/5">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.mediaType === 'music' ? (
                        <FileAudio className="w-3.5 h-3.5 text-orange-400" />
                      ) : (
                        <FileVideo className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        {item.platform}
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm md:text-base truncate pr-8">{item.title}</h4>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(item.downloadedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Desktop Actions */}
                  <div className="hidden md:flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => removeFromHistory(item.id)}
                      className="p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                      title="Remove from history"
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </div>

                  {/* Mobile Delete Button (Always visible on mobile) */}
                  <button
                    onClick={() => removeFromHistory(item.id)}
                    className="md:hidden absolute top-0 right-0 p-2 text-muted-foreground hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20 glass-card"
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-white/5 flex items-center justify-center border border-white/5">
              <Clock className="w-12 h-12 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No History Found</h3>
            <p className="text-muted-foreground max-w-sm mx-auto px-4">
              Your download history will appear here once you start using the downloader.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default History;
