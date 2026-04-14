/**
 * Bulk Downloader Component
 */

import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Play, 
  X,
  Link2,
  List,
  Loader2,
  ArrowRight,
  Square
} from 'lucide-react';
import { useDownload } from '../contexts/DownloadContext';
import { useToast } from '../contexts/ToastContext';
import { useIsMobile } from '../hooks/use-mobile';

const BulkDownloader: React.FC = () => {
  const [inputUrls, setInputUrls] = useState('');
  const { queue, addToQueue, downloadWithProgress, getMediaInfo, removeFromQueue, clearQueue, cancelDownload } = useDownload();
  const { showError, showSuccess } = useToast();
  const isMobile = useIsMobile();
  
  // Track specific items that are currently being processed
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleAddUrls = async () => {
    if (!inputUrls.trim()) {
      showError('Please paste at least one URL');
      return;
    }

    const urls = inputUrls
      .split(/[\n\s,]+/)
      .map(url => url.trim())
      .filter(url => url.startsWith('http'));

    if (urls.length === 0) {
      showError('No valid URLs found');
      return;
    }

    addToQueue(urls);
    setInputUrls('');
  };

  const processItem = async (id: string, url: string) => {
    setProcessingId(id);
    try {
      // 1. EXTRACTION FLOW (Exact same as Music Downloader)
      const info = await getMediaInfo(url);
      if (!info || !info.qualities || info.qualities.length === 0) {
        throw new Error('No working mirrors found for this link');
      }

      // 2. DOWNLOAD FLOW
      const bestQuality = info.qualities[0];
      const safeTitle = info.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const ext = info.mediaType === 'music' ? 'mp3' : 'mp4';
      
      // Use the resolved mirror URL found in Step 1
      await downloadWithProgress(
        bestQuality.url, 
        bestQuality.quality, 
        `${safeTitle}.${ext}`
      );
      
      showSuccess(`Completed: ${info.title}`);
    } catch (err: any) {
      showError(err.message || 'Processing failed');
    } finally {
      setProcessingId(null);
    }
  };

  const handleStartAll = async () => {
    const waitingItems = queue.filter(item => item.status === 'waiting');
    if (waitingItems.length === 0) {
      showError('No items waiting in queue');
      return;
    }

    // Process one by one to ensure stability
    for (const item of waitingItems) {
      await processItem(item.id, item.url);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
          <List className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-4xl font-bold gradient-text">Bulk Downloader</h2>
        <p className="text-muted-foreground max-w-md mx-auto px-4">
          Paste multiple links to download them all at once using our high-speed mirror engine.
        </p>
      </div>

      <div className="glass-card p-6 space-y-4 mx-4 md:mx-0">
        <textarea
          value={inputUrls}
          onChange={(e) => setInputUrls(e.target.value)}
          placeholder={isMobile ? "Paste links line-by-line..." : "Paste multiple music/video URLs (one per line)..."}
          className="w-full glass-input min-h-[120px] p-4 text-sm focus:outline-none rounded-xl resize-none"
        />
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleAddUrls}
            disabled={!inputUrls.trim()}
            className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-5 h-5" /> Add to Queue
          </button>
          
          {queue.length > 0 && (
            <button
              onClick={handleStartAll}
              disabled={!!processingId}
              className="flex-1 bg-green-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {processingId ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              Start All
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {queue.length > 0 && (
          <div className="space-y-4 px-4 md:px-0">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Queue ({queue.length})</h3>
              <button onClick={clearQueue} className="text-[10px] font-black uppercase text-red-400">Clear All</button>
            </div>

            <div className="grid gap-3">
              {queue.map((item) => (
                <div key={item.id} className="glass-card p-4 flex items-center gap-4 relative overflow-hidden group">
                  <div className="w-10 h-10 rounded-lg bg-black/40 flex items-center justify-center border border-white/10">
                    {processingId === item.id ? <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /> : <Link2 className="w-5 h-5 text-muted-foreground" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm truncate opacity-80">{item.url}</h4>
                    <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">
                      {processingId === item.id ? 'Processing Mirror...' : 'Waiting'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {processingId === item.id ? (
                      <button onClick={cancelDownload} className="p-2 text-red-400"><Square size={16} fill="currentColor" /></button>
                    ) : (
                      <button onClick={() => processItem(item.id, item.url)} className="p-2 text-muted-foreground hover:text-white"><ArrowRight size={16} /></button>
                    )}
                    <button onClick={() => removeFromQueue(item.id)} className="p-2 text-muted-foreground hover:text-red-400"><X size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BulkDownloader;
