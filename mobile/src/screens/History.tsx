import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Image, 
  FlatList, 
  StyleSheet, 
  Modal, 
  Alert,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Clock, 
  Trash2, 
  FileVideo, 
  FileAudio,
  X,
  AlertTriangle
} from 'lucide-react-native';
import { useDownload } from '../contexts/DownloadContext';

const History: React.FC = () => {
  const { history, removeFromHistory, clearHistory } = useDownload();
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear History",
      "Are you sure you want to permanently delete your entire local download history?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", style: "destructive", onPress: clearHistory }
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.historyCard}>
      <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
      <View style={styles.info}>
        <View style={styles.platformRow}>
          {item.mediaType === 'music' ? (
            <FileAudio size={12} color="#f97316" />
          ) : (
            <FileVideo size={12} color="#3b82f6" />
          )}
          <Text style={styles.platformText}>{item.platform}</Text>
        </View>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.timeRow}>
          <Clock size={12} color="#64748b" />
          <Text style={styles.timeText}>{formatDate(item.downloadedAt)}</Text>
        </View>
      </View>
      <TouchableOpacity 
        onPress={() => removeFromHistory(item.id)}
        style={styles.deleteItem}
      >
        <X size={18} color="#64748b" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>History</Text>
          <Text style={styles.subtitle}>Your recent downloads</Text>
        </View>
        {history.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
            <Trash2 size={18} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Clock size={48} color="#334155" />
            </View>
            <Text style={styles.emptyTitle}>No History Found</Text>
            <Text style={styles.emptySubtitle}>Your downloads will appear here</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  subtitle: { color: '#94a3b8', fontSize: 14 },
  clearButton: { width: 45, height: 45, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20 },
  historyCard: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 15, padding: 12, marginBottom: 12, alignItems: 'center', gap: 12 },
  thumbnail: { width: 60, height: 60, borderRadius: 10, backgroundColor: '#0f172a' },
  info: { flex: 1, gap: 4 },
  platformRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  platformText: { color: '#64748b', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  itemTitle: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeText: { color: '#64748b', fontSize: 12 },
  deleteItem: { padding: 5 },
  emptyState: { paddingVertical: 100, alignItems: 'center', gap: 15 },
  emptyIcon: { width: 100, height: 100, borderRadius: 30, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  emptySubtitle: { color: '#64748b', textAlign: 'center' }
});

export default History;
