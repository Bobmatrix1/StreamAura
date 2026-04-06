import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Info, 
  AlertTriangle, 
  Zap,
  ChevronRight,
  Inbox,
  CheckCheck,
  X,
  RefreshCcw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
  listenToNotifications, 
  markAsRead, 
  markAllAsRead,
  clearNotification, 
  clearAllUserNotifications,
  type AppNotification 
} from '../lib/firebase';

const Notifications: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const loadNotifications = () => {
    if (!user?.uid) return () => {};
    
    setIsLoading(true);
    setError(null);

    // Safety timeout: stop spinner after 5 seconds no matter what
    const timer = setTimeout(() => setIsLoading(false), 5000);

    const unsubscribe = listenToNotifications(
      user.uid, 
      (notifs) => {
        clearTimeout(timer);
        setNotifications(notifs);
        setIsLoading(false);
      },
      (err) => {
        clearTimeout(timer);
        console.error('Notification error:', err);
        setError('Failed to load notifications.');
        setIsLoading(false);
      }
    );

    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = loadNotifications();
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [user?.uid]);

  const handleMarkRead = async (id: string) => {
    if (!user?.uid) return;
    await markAsRead(user.uid, id);
  };

  const handleReadAll = async () => {
    if (!user?.uid || notifications.length === 0) return;
    await markAllAsRead(user.uid);
  };

  const handleClear = async (id: string) => {
    if (!user?.uid) return;
    await clearNotification(user.uid, id);
  };

  const handleClearAll = async () => {
    if (!user?.uid || notifications.length === 0) return;
    await clearAllUserNotifications(user.uid);
    setIsConfirmOpen(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'update': return <Zap className="w-5 h-5 text-rose-400" />;
      case 'alert': return <AlertTriangle className="w-5 h-5 text-orange-400" />;
      default: return <Info className="w-5 h-5 text-rose-400" />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-32">
      {/* Custom Confirm Modal */}
      <AnimatePresence>
        {isConfirmOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConfirmOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm glass-card p-8 border-white/10 shadow-2xl text-center space-y-6"
            >
              <div className="w-20 h-20 rounded-3xl bg-red-500/20 flex items-center justify-center text-red-500 mx-auto">
                <AlertTriangle className="w-10 h-10" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Wipe Notifications?</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This will permanently delete all messages from your inbox. This action cannot be undone.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsConfirmOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleClearAll}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold shadow-lg shadow-red-600/20 hover:bg-red-500 active:scale-95 transition-all"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
          <Bell className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-4xl font-bold gradient-text">Notifications</h2>
        <p className="text-muted-foreground">Stay updated with the latest improvements and alerts.</p>
        
        {(!isLoading && notifications.length === 0) && (
          <button 
            onClick={() => loadNotifications()}
            className="flex items-center gap-2 mx-auto px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase hover:bg-white/10 transition-all"
          >
            <RefreshCcw className="w-3 h-3" /> Sync Inbox
          </button>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/5 space-y-4 bg-white/[0.01]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold tracking-tight text-foreground">Recent Activity</span>
              {notifications.some(n => !n.read) && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-500 text-[10px] font-black border border-rose-500/20">
                  {notifications.filter(n => !n.read).length} NEW
                </span>
              )}
            </div>
            
            {notifications.length > 0 && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleReadAll}
                  title="Mark all as read"
                  className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/20 transition-all border border-cyan-500/10"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsConfirmOpen(true)}
                  title="Clear all"
                  className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-all border border-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          {notifications.length > 0 && (
            <div className="flex gap-2">
              <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(notifications.filter(n => n.read).length / notifications.length) * 100}%` }}
                  className="h-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                />
              </div>
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none">
                {Math.round((notifications.filter(n => n.read).length / notifications.length) * 100)}% Cleared
              </span>
            </div>
          )}
        </div>

        <div className="divide-y divide-white/5">
          <AnimatePresence initial={false}>
            {isLoading ? (
              <div className="p-20 text-center">
                <motion.div 
                  animate={{ rotate: 360 }} 
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full mx-auto"
                />
              </div>
            ) : notifications.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-20 text-center space-y-4"
              >
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                  <Inbox className="w-8 h-8 text-muted-foreground opacity-20" />
                </div>
                <p className="text-muted-foreground italic">Your inbox is empty</p>
              </motion.div>
            ) : (
              notifications.map((notif) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`p-5 flex items-start gap-4 transition-colors ${notif.read ? 'opacity-60' : 'bg-white/[0.03]'}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/10 ${notif.read ? 'bg-white/5' : 'bg-white/10 shadow-lg'}`}>
                    {getIcon(notif.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className={`font-bold text-sm truncate ${notif.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {notif.title}
                      </h3>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 flex-shrink-0">
                        <Clock className="w-3 h-3" />
                        {new Date(notif.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {notif.message}
                    </p>
                    
                    <div className="flex items-center gap-3 pt-2">
                      {!notif.read && (
                        <button 
                          onClick={() => handleMarkRead(notif.id)}
                          className="flex items-center gap-1.5 text-[10px] font-black uppercase text-rose-400 hover:brightness-125 transition-all"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Mark as read
                        </button>
                      )}
                      <button 
                        onClick={() => handleClear(notif.id)}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase text-red-400 hover:brightness-125 transition-all"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
