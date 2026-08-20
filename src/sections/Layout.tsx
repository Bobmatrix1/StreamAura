/**
 * Layout Component
 * 
 * Main app layout with navigation sidebar/header, theme toggle, and user menu.
 * Features glassmorphism design and smooth animations.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, 
  Music, 
  List, 
  History, 
  Sun, 
  Moon, 
  LogOut, 
  User,
  Menu,
  X,
  ChevronDown,
  Shield,
  Film,
  Bell,
  Info,
  HelpCircle,
  Tv,
  Wallet,
  Share2,
  Home,
  Gamepad2,
  ArrowUp,
  ArrowLeft
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDownload } from '../contexts/DownloadContext';
import { useIsMobile } from '../hooks/use-mobile';
import { listenToNotifications } from '../lib/firebase';
import type { ViewType } from '@/types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: ViewType;
  onTabChange: (tab: ViewType) => void;
}

interface Tab {
  id: ViewType;
  label: string;
  icon: React.ElementType;
  color: string;
  adminOnly?: boolean;
}

const tabs: Tab[] = [
  { id: 'home', label: 'Home', icon: Home, color: 'indigo' },
  { id: 'profile', label: 'My Profile', icon: User, color: 'neon' },
  { id: 'video', label: 'Video', icon: Video, color: 'blue' },
  { id: 'music', label: 'Music', icon: Music, color: 'orange' },
  { id: 'movie', label: 'Movies', icon: Film, color: 'cyan' },
  { id: 'cinema', label: 'Cinema Room', icon: Tv, color: 'purple' },
  { id: 'games', label: 'Game Room', icon: Gamepad2, color: 'yellow' },
  { id: 'wallet', label: 'Wallet', icon: Wallet, color: 'emerald' },
  { id: 'referral', label: 'Refer & Earn', icon: Share2, color: 'orange' },
  { id: 'bulk', label: 'Bulk Download', icon: List, color: 'purple' },
  { id: 'notifications', label: 'Notifications', icon: Bell, color: 'rose' },
  { id: 'history', label: 'History', icon: History, color: 'indigo' },
  { id: 'about', label: 'About', icon: Info, color: 'fuchsia' },
  { id: 'privacy', label: 'Privacy', icon: Shield, color: 'emerald' },
  { id: 'contact', label: 'Contact', icon: HelpCircle, color: 'lime' },
  { id: 'admin', label: 'Admin Dashboard', icon: Shield, color: 'red', adminOnly: true }
];

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const { user, logout, isAdmin, requireAuth, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { queue, activeDownloads } = useDownload();
  const isMobile = useIsMobile();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const prevTabRef = React.useRef<ViewType>(activeTab);
  const [historyStack, setHistoryStack] = useState<ViewType[]>([]);
  const [isBackAction, setIsBackAction] = useState(false);

  useEffect(() => {
    const prevTab = prevTabRef.current;
    if (activeTab !== prevTab) {
      if (isBackAction) {
        setIsBackAction(false);
      } else {
        setHistoryStack(prev => {
          if (prev.length > 0 && prev[prev.length - 1] === prevTab) return prev;
          return [...prev, prevTab];
        });
      }
      prevTabRef.current = activeTab;
    }
  }, [activeTab, isBackAction]);

  const handleBack = () => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    setHistoryStack(prev => prev.slice(0, -1));
    setIsBackAction(true);
    onTabChange(previous);
  };

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = listenToNotifications(user.uid, (notifs) => {
      setUnreadCount(notifs.filter(n => !n.read).length);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  // Lock scroll when mobile menu is open
  useEffect(() => {
    if (isMobile && isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [isMobile, isMobileMenuOpen]);

  const handleLogout = async () => {
    try {
      await logout();
      setIsUserMenuOpen(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleSignIn = () => {
    requireAuth(() => {});
    setIsUserMenuOpen(false);
  };

  const queueCount = queue.filter(item => item.status === 'waiting' || item.status === 'processing').length;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden glass-card mx-4 mt-4 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center p-1 bg-white/5">
            <img src="/logo.png" alt="StreamAura" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold gradient-text">StreamAura</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onTabChange('notifications')}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors relative"
          >
            <Bell className={`w-6 h-6 ${unreadCount > 0 ? 'text-rose-500 animate-pulse' : ''}`} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-900">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={isMobile === undefined ? {} : (isMobile ? { 
          x: isMobileMenuOpen ? 0 : '-100%',
          opacity: isMobileMenuOpen ? 1 : 0
        } : { 
          x: 0, 
          opacity: 1 
        })}
        transition={{ 
          type: 'spring', 
          damping: 25, 
          stiffness: 200,
          opacity: { duration: 0.2 } 
        }}
        className={`
          fixed inset-y-0 left-0 z-50 w-72 m-4 
          -translate-x-[110%] opacity-0
          md:m-0 md:static md:translate-x-0 md:opacity-100
          flex flex-col md:rounded-none md:border-r md:border-l-0 md:border-t-0 md:border-b-0
          bg-background md:bg-transparent glass-card md:glass-none
          h-[calc(100vh-2rem)] md:h-screen
        `}
      >
        {/* Logo */}
        <div className="p-6 hidden md:flex items-center gap-3 flex-shrink-0">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center p-1.5 bg-white/5 shadow-xl border border-white/10">
            <img src="/logo.png" alt="StreamAura" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-xl gradient-text">StreamAura</span>
        </div>

        {/* Navigation - Scrollable Area */}
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto custom-scrollbar">
          {tabs.map((tab) => {
            if (tab.adminOnly && !isAdmin) return null;
            
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            // Color mapping for active states
            const colorClasses: Record<string, string> = {
              blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-blue-500/10',
              purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20 shadow-purple-500/10',
              orange: 'bg-orange-500/10 text-orange-500 border-orange-500/20 shadow-orange-500/10',
              green: 'bg-green-500/10 text-green-500 border-green-500/20 shadow-green-500/10',
              red: 'bg-red-500/10 text-red-500 border-red-500/20 shadow-red-500/10',
              cyan: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20 shadow-cyan-500/10',
              rose: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-rose-500/10',
              indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 shadow-indigo-500/10',
              emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-emerald-500/10',        
              fuchsia: 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20 shadow-fuchsia-500/10',        
              lime: 'bg-lime-500/10 text-lime-500 border-lime-500/20 shadow-lime-500/10',
              yellow: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 shadow-yellow-500/10',
              neon: 'bg-gradient-to-r from-cyan-500/15 to-pink-500/15 text-cyan-400 border-white/10 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
              };
            const activeClass = colorClasses[tab.color] || colorClasses.blue;
            
            return (
              <motion.button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  setIsMobileMenuOpen(false);
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300
                  ${isActive 
                    ? `${activeClass} border shadow-sm` 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }
                `}
              >
                <Icon className={`w-5 h-5`} />
                <span className="font-medium">{tab.label}</span>
                {tab.id === 'bulk' && queueCount > 0 && (
                  <span className={`ml-auto ${isActive ? 'bg-orange-500' : 'bg-muted-foreground/30'} text-white text-xs px-2 py-0.5 rounded-full`}>
                    {queueCount}
                  </span>
                )}
                {tab.id === 'notifications' && unreadCount > 0 && (
                  <span className={`ml-auto ${isActive ? 'bg-rose-500' : 'bg-rose-500/50'} text-white text-[10px] font-black px-2 py-0.5 rounded-full`}>
                    {unreadCount}
                  </span>
                )}
              </motion.button>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-white/10 space-y-2 flex-shrink-0">
          {/* Active Downloads Indicator */}
          {activeDownloads > 0 && (
            <div className="px-4 py-2 bg-primary/10 rounded-xl border border-primary/20">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="text-primary font-medium">{activeDownloads} active download(s)</span>
              </div>
            </div>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-300"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {/* Admin Badge */}
          {isAdmin && (
            <div className="px-4 py-2 bg-primary/10 rounded-xl border border-primary/20">
              <span className="text-sm font-medium text-primary">Admin</span>
            </div>
          )}

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-all duration-300"
            >
              {user?.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || 'User'} 
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-medium text-foreground truncate">{user?.displayName || 'Guest User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email || 'Login to sync data'}</p>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform text-muted-foreground ${isUserMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* User Dropdown */}
            <AnimatePresence>
              {isUserMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-full left-0 right-0 mb-2 glass-card overflow-hidden"
                >
                  {isAuthenticated ? (
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="font-medium">Sign Out</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSignIn}
                      className="w-full flex items-center gap-3 px-4 py-3 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    >
                      <User className="w-5 h-5" />
                      <span className="font-medium">Sign In</span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className={`flex-1 overflow-auto transition-all duration-300 ${isMobileMenuOpen ? 'blur-sm brightness-90 md:blur-none md:brightness-100' : ''}`}>
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
          <AnimatePresence>
            {historyStack.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3 pb-2 border-b border-white/5"
              >
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.08] dark:bg-white/[0.06] backdrop-blur-md border border-white/10 dark:border-white/5 hover:bg-white/[0.12] hover:border-white/20 active:scale-95 shadow-[0_4px_12px_rgba(0,0,0,0.1)] text-white text-xs font-black uppercase tracking-widest transition-all duration-200 group"
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span>Back</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {children}
        </div>
      </main>
      {/* Scroll to Top Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 50 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 z-[999] p-4 rounded-full gradient-bg border border-white/10 shadow-2xl text-white hover:scale-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            title="Scroll to top"
          >
            <ArrowUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Layout;
