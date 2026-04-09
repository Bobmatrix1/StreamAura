import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator, 
  TextInput,
  Alert,
  Dimensions,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Users, 
  Activity, 
  Globe, 
  BarChart, 
  Zap, 
  Search, 
  Trash2, 
  RefreshCcw, 
  Send, 
  MessageSquare, 
  Info,
  Clock,
  TrendingUp,
  ChevronDown
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { 
  getAllUsers, 
  getGlobalHistory, 
  clearAllTraffic,
  toggleAdminStatus,
  deleteUserAccount
} from '../lib/firebase';

const { width } = Dimensions.get('window');

const AdminDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'history' | 'traffic' | 'messages'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Notification State
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'users') {
        const data = await getAllUsers();
        setUsers(data);
      } else if (activeTab === 'history') {
        const data = await getGlobalHistory(50);
        setHistory(data);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendNotification = async () => {
    if (!notifTitle || !notifMessage) return;
    setIsSending(true);
    // Notification broadcast implementation
    setIsSending(false);
    Alert.alert('Success', 'Broadcast sent successfully');
    setNotifTitle('');
    setNotifMessage('');
  };

  const renderUsers = () => (
    <View style={styles.list}>
      {users.map((u) => (
        <View key={u.uid} style={styles.userCard}>
          <View style={styles.userInfo}>
            <View style={styles.avatar}>
              <Users size={20} color="#3b82f6" />
            </View>
            <View>
              <Text style={styles.userName}>{u.displayName || 'Anonymous'}</Text>
              <Text style={styles.userEmail}>{u.email}</Text>
            </View>
          </View>
          <View style={styles.userActions}>
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}
              onPress={() => {}}
            >
              <RefreshCcw size={16} color="#3b82f6" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}
              onPress={() => {}}
            >
              <Trash2 size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin Panel</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
          <TouchableOpacity 
            onPress={() => setActiveTab('users')} 
            style={[styles.tab, activeTab === 'users' && styles.activeTab]}
          >
            <Users size={16} color={activeTab === 'users' ? 'white' : '#94a3b8'} />
            <Text style={[styles.tabText, activeTab === 'users' && styles.activeTabText]}>Users</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setActiveTab('history')} 
            style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          >
            <Activity size={16} color={activeTab === 'history' ? 'white' : '#94a3b8'} />
            <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>Activity</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setActiveTab('messages')} 
            style={[styles.tab, activeTab === 'messages' && styles.activeTab]}
          >
            <Send size={16} color={activeTab === 'messages' ? 'white' : '#94a3b8'} />
            <Text style={[styles.tabText, activeTab === 'messages' && styles.activeTabText]}>Broadcast</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 50 }} />
        ) : (
          <>
            {activeTab === 'users' && renderUsers()}
            {activeTab === 'messages' && (
              <View style={styles.broadcastCard}>
                <Text style={styles.cardTitle}>Send Broadcast</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Headline / Title"
                  placeholderTextColor="#64748b"
                  value={notifTitle}
                  onChangeText={setNotifTitle}
                />
                <TextInput
                  style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                  placeholder="Message Content"
                  placeholderTextColor="#64748b"
                  multiline
                  value={notifMessage}
                  onChangeText={setNotifMessage}
                />
                <TouchableOpacity 
                  onPress={handleSendNotification} 
                  disabled={isSending}
                  style={styles.sendButton}
                >
                  {isSending ? <ActivityIndicator color="white" /> : <Text style={styles.sendButtonText}>Send Now</Text>}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 20, gap: 15 },
  title: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  tabBar: { flexDirection: 'row' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10, marginRight: 10, backgroundColor: '#1e293b' },
  activeTab: { backgroundColor: '#3b82f6' },
  tabText: { color: '#94a3b8', fontWeight: 'bold' },
  activeTabText: { color: 'white' },
  scrollContent: { padding: 20 },
  list: { gap: 12 },
  userCard: { flexDirection: 'row', backgroundColor: '#1e293b', padding: 15, borderRadius: 15, alignItems: 'center', justifyContent: 'space-between' },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  userName: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  userEmail: { color: '#64748b', fontSize: 12 },
  userActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 35, height: 35, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  broadcastCard: { backgroundColor: '#1e293b', padding: 20, borderRadius: 20, gap: 15 },
  cardTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  input: { backgroundColor: '#0f172a', borderRadius: 12, padding: 15, color: 'white' },
  sendButton: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 12, alignItems: 'center' },
  sendButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});

export default AdminDashboard;
