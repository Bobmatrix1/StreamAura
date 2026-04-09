import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Dimensions 
} from 'react-native';
import { 
  Video, 
  Music, 
  Film, 
  History as HistoryIcon, 
  Layout as LayoutIcon,
  Bell,
  Settings,
  Users
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { listenToNotifications } from '../lib/firebase';
import VideoDownloader from './VideoDownloader';
import MusicDownloader from './MusicDownloader';
import MovieDownloader from './MovieDownloader';
import BulkDownloader from './BulkDownloader';
import History from './History';
import Notifications from './Notifications';
import AdminDashboard from './AdminDashboard';
import About from './About';

const { width } = Dimensions.get('window');

const MainNavigator: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('video');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    
    // Sync unread count for badge
    const unsubscribe = listenToNotifications(user.uid, (notifs) => {
      const count = notifs.filter(n => !n.read).length;
      setUnreadCount(count);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const renderContent = () => {
    switch (activeTab) {
      case 'video': return <VideoDownloader />;
      case 'music': return <MusicDownloader />;
      case 'movie': return <MovieDownloader />;
      case 'bulk': return <BulkDownloader />;
      case 'history': return <History />;
      case 'notifications': return <Notifications />;
      case 'admin': return <AdminDashboard />;
      case 'about': return <About />;
      default: return <VideoDownloader />;
    }
  };

  const navItems = [
    { id: 'video', icon: Video, label: 'Video' },
    { id: 'music', icon: Music, label: 'Music' },
    { id: 'movie', icon: Film, label: 'Movies' },
    { id: 'notifications', icon: Bell, label: 'Inbox', badge: unreadCount },
    { id: 'history', icon: HistoryIcon, label: 'History' },
  ];

  if (isAdmin) {
    navItems.push({ id: 'admin', icon: Users, label: 'Admin' });
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Custom Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {navItems.map((item) => (
          <TouchableOpacity 
            key={item.id}
            onPress={() => setActiveTab(item.id)}
            style={styles.tabItem}
          >
            <View style={styles.iconWrapper}>
              <item.icon 
                size={24} 
                color={activeTab === item.id ? '#3b82f6' : '#94a3b8'} 
                strokeWidth={activeTab === item.id ? 2.5 : 2}
              />
              {item.badge !== undefined && item.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge > 9 ? '9+' : item.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, { color: activeTab === item.id ? '#3b82f6' : '#94a3b8' }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
        
        <TouchableOpacity 
          onPress={() => setActiveTab('about')}
          style={styles.tabItem}
        >
          <Settings size={24} color={activeTab === 'about' ? '#3b82f6' : '#94a3b8'} />
          <Text style={[styles.tabLabel, { color: activeTab === 'about' ? '#3b82f6' : '#94a3b8' }]}>
            About
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { flex: 1 },
  tabBar: { 
    flexDirection: 'row', 
    backgroundColor: '#1e293b', 
    paddingBottom: 25, 
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'space-around'
  },
  tabItem: { alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 10, fontWeight: 'bold' },
  iconWrapper: { position: 'relative' },
  badge: { 
    position: 'absolute', 
    top: -4, 
    right: -8, 
    backgroundColor: '#ef4444', 
    borderRadius: 10, 
    minWidth: 18, 
    height: 18, 
    justifyContent: 'center', 
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#1e293b'
  },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' }
});

export default MainNavigator;
