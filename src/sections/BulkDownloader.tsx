/**
 * Bulk Downloader Component
 * 
 * Multi-link download interface with queue management and batch processing.
 * Features drag-and-drop, progress tracking, and batch operations.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  X,
  Link2,
  List,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import { useIsMobile } from '../hooks/use-mobile';
const BulkDownloader: React.FC = () => {
  const [inputUrls, setInputUrls] = useState('');
  const { queue, addToQueue, startDownload, removeFromQueue, clearQueue, isProcessing } = useDownload();
  const { showSuccess, showError } = useToast();
  const isMobile = useIsMobile();

  const handleAddUrls = async () => {
    if (!inputUrls.trim()) {
      showError('Please paste at least one URL');
      return;
    }

    // Split by newlines or spaces and filter out empty strings
    const urls = inputUrls
      .split(/[\n\s,]+/)
      .map(url => url.trim())
      .filter(url => url.startsWith('http'));

    if (urls.length === 0) {
      showError('No valid URLs found');
      return;
    }

    await addToQueue(urls);
    setInputUrls('');
  };

  const handleStartAll = async () => {
    const waitingItems = queue.filter(item => item.status === 'waiting' || item.status === 'error');
    if (waitingItems.length === 0) {
      showError('No items waiting to download');
      return;
    }

    for (const item of waitingItems) {
      try {
        await startDownload(item.id);
      } catch (err) {
        console.error(`Failed to download ${item.url}`, err);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'downloading': return 'text-blue-400';
      case 'completed': return 'text-green-400';
      case 'error': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20"
        >
          <List className="w-10 h-10 text-white" />
        </motion.div>
        <h2 className="text-4xl font-bold gradient-text">Bulk Downloader</h2>
        <p className="text-muted-foreground max-w-md mx-auto px-4">
          Paste multiple links to download them all at once.
        </p>
      </div>

      <div className="glass-card p-6 space-y-4 mx-4 md:mx-0">
        <div className="relative group">
          <textarea
            value={inputUrls}
            onChange={(e) => setInputUrls(e.target.value)}
            placeholder={isMobile ? "Paste links line-by-line..." : "Paste multiple URLs here (one per line)..."}
            className="w-full glass-input min-h-[120px] p-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all rounded-xl resize-none"
          />
          <div className="absolute right-4 bottom-4 text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-50 group-focus-within:opacity-100 transition-opacity">
            {isMobile ? "One link per line" : "Shift + Enter for new line"}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleAddUrls}
            disabled={!inputUrls.trim()}
            className="flex-1 glass-button bg-indigo-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
            Add to Queue
          </button>
          
          {queue.length > 0 && (
            <button
              onClick={handleStartAll}
              disabled={isProcessing}
              className="flex-1 glass-button bg-green-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              Start All
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {queue.length > 0 ? (
          <div className="space-y-4 px-4 md:px-0">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
                Queue ({queue.length})
              </h3>
              <button
                onClick={clearQueue}
                className="text-[10px] font-black uppercase text-red-400 hover:text-red-300 transition-colors"
              >
                Clear All
              </button>
            </div>

            <div className="grid gap-3">
              {queue.map((item, index) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  className="glass-card p-4 flex items-center gap-4 relative overflow-hidden group"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors ${
                    item.status === 'completed' ? 'bg-green-500' : 
                    item.status === 'downloading' ? 'bg-blue-500' : 
                    item.status === 'error' ? 'bg-red-500' : 'bg-white/10'
                  }`} />

                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/40 flex-shrink-0 border border-white/10">
                    {item.mediaInfo?.thumbnail ? (
                      <img src={item.mediaInfo.thumbnail} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Link2 className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-black uppercase tracking-tighter ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                      {item.mediaInfo && (
                        <span className="text-[10px] text-muted-foreground font-bold uppercase opacity-50">• {item.mediaInfo.platform}</span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm truncate pr-4">
                      {item.mediaInfo?.title || item.url}
                    </h4>
                    
                    {/* Per-item progress bar */}
                    {item.status === 'downloading' && (
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between items-center text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                          <span>Progress</span>
                          <span>{item.progress}%</span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${item.progress}%` }}
                            className="h-full bg-indigo-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {item.status === 'waiting' && (
                      <button
                        onClick={() => startDownload(item.id)}
                        className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-all"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                    {item.status === 'downloading' && (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {item.status === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    )}
                    {item.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20 glass-card bg-white/[0.02] mx-4 md:mx-0"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/5 flex items-center justify-center border border-white/5">
              <Plus className="w-8 h-8 text-muted-foreground opacity-30" />
            </div>
            <h3 className="text-xl font-bold mb-2">Queue is Empty</h3>
            <p className="text-muted-foreground max-w-md mx-auto px-4">
              Paste multiple links above to add them to your download queue.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BulkDownloader;
