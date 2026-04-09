import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  StyleSheet, 
  ActivityIndicator, 
  Alert,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Bell, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Info, 
  AlertTriangle, 
  Zap,
  Inbox,
  CheckCheck,
  RefreshCcw
} from 'lucide-react-native';
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

  useEffect(() => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    const unsubscribe = listenToNotifications(
      user.uid, 
      (notifs) => {
        setNotifications(notifs);
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const handleMarkRead = async (id: string) => {
    if (!user?.uid) return;
    await markAsRead(user.uid, id);
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear All",
      "Are you sure you want to permanently delete all notifications?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", style: "destructive", onPress: async () => {
          if (user?.uid) await clearAllUserNotifications(user.uid);
        }}
      ]
    );
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'update': return <Zap size={20} color="#fb7185" />;
      case 'alert': return <AlertTriangle size={20} color="#fbbf24" />;
      default: return <Info size={20} color="#fb7185" />;
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => (
    <View style={[styles.notifCard, item.read && styles.notifRead]}>
      <View style={[styles.iconBox, { backgroundColor: item.read ? 'rgba(255,255,255,0.05)' : 'rgba(251, 113, 133, 0.1)' }]}>
        {getIcon(item.type)}
      </View>
      <View style={styles.notifInfo}>
        <View style={styles.notifHeader}>
          <Text style={[styles.notifTitle, item.read && styles.textRead]}>{item.title}</Text>
          <Text style={styles.notifTime}>{new Date(item.timestamp).toLocaleDateString()}</Text>
        </View>
        <Text style={[styles.notifMessage, item.read && styles.textRead]} numberOfLines={2}>{item.message}</Text>
        <View style={styles.notifActions}>
          {!item.read && (
            <TouchableOpacity onPress={() => handleMarkRead(item.id)} style={styles.actionBtn}>
              <CheckCircle2 size={12} color="#fb7185" />
              <Text style={styles.actionText}>Mark read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={async () => { if (user?.uid) await clearNotification(user.uid, item.id); }} style={styles.actionBtn}>
            <Trash2 size={12} color="#ef4444" />
            <Text style={[styles.actionText, { color: '#ef4444' }]}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Stay updated with improvements</Text>
        </View>
        {notifications.length > 0 && (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => { if (user?.uid) markAllAsRead(user.uid); }} style={styles.circleBtn}>
              <CheckCheck size={18} color="#22d3ee" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClearAll} style={[styles.circleBtn, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Trash2 size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#fb7185" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Inbox size={48} color="#334155" />
              <Text style={styles.emptyText}>Your inbox is empty</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  subtitle: { color: '#94a3b8', fontSize: 14 },
  headerActions: { flexDirection: 'row', gap: 10 },
  circleBtn: { width: 45, height: 45, borderRadius: 15, backgroundColor: 'rgba(34, 211, 238, 0.1)', justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20 },
  notifCard: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 20, padding: 15, marginBottom: 12, gap: 15 },
  notifRead: { opacity: 0.6 },
  iconBox: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  notifInfo: { flex: 1, gap: 5 },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notifTitle: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  notifTime: { color: '#64748b', fontSize: 10 },
  notifMessage: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },
  textRead: { color: '#64748b' },
  notifActions: { flexDirection: 'row', gap: 15, marginTop: 5 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: '#fb7185', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  emptyState: { paddingVertical: 100, alignItems: 'center', gap: 15 },
  emptyText: { color: '#64748b', italic: true }
});

export default Notifications;
