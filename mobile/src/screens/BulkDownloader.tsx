import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  StyleSheet, 
  ActivityIndicator, 
  Alert,
  Image,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Plus, 
  Play, 
  X,
  Link2,
  List,
  AlertCircle,
  CheckCircle2,
  ArrowRight
} from 'lucide-react-native';
import { useDownload } from '../contexts/DownloadContext';

const { width } = Dimensions.get('window');

const BulkDownloader: React.FC = () => {
  const [inputUrls, setInputUrls] = useState('');
  const { queue, addToQueue, startDownload, removeFromQueue, clearQueue } = useDownload();
  const isProcessing = queue.some(item => item.status === 'downloading' || item.status === 'processing');

  const handleAddUrls = async () => {
    if (!inputUrls.trim()) {
      Alert.alert('Error', 'Please paste at least one URL');
      return;
    }

    const urls = inputUrls
      .split(/[\n\s,]+/)
      .map(url => url.trim())
      .filter(url => url.startsWith('http'));

    if (urls.length === 0) {
      Alert.alert('Error', 'No valid URLs found');
      return;
    }

    await addToQueue(urls);
    setInputUrls('');
  };

  const renderQueueItem = ({ item }: { item: any }) => (
    <View style={styles.queueCard}>
      <View style={[styles.statusIndicator, { backgroundColor: item.status === 'completed' ? '#22c55e' : item.status === 'downloading' ? '#3b82f6' : '#334155' }]} />
      <Image source={{ uri: item.mediaInfo?.thumbnail }} style={styles.itemThumbnail} />
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.mediaInfo?.title || item.url}</Text>
        <Text style={styles.itemStatus}>{item.status}</Text>
      </View>
      <TouchableOpacity onPress={() => removeFromQueue(item.id)}>
        <X size={20} color="#64748b" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <List color="white" size={32} />
          </View>
          <Text style={styles.title}>Bulk Downloader</Text>
          <Text style={styles.subtitle}>Paste multiple links to download all at once.</Text>
        </View>

        <View style={styles.inputCard}>
          <TextInput
            style={styles.textArea}
            placeholder="Paste URLs here (one per line)..."
            placeholderTextColor="#64748b"
            multiline
            numberOfLines={5}
            value={inputUrls}
            onChangeText={setInputUrls}
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={handleAddUrls} style={styles.addButton}>
              <Plus size={20} color="white" />
              <Text style={styles.buttonText}>Add to Queue</Text>
            </TouchableOpacity>
          </View>
        </View>

        {queue.length > 0 && (
          <View style={styles.queueHeader}>
            <Text style={styles.queueCount}>Queue ({queue.length})</Text>
            <TouchableOpacity onPress={clearQueue}>
              <Text style={styles.clearAll}>Clear All</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.queueList}>
          {queue.map((item) => (
            <View key={item.id}>
              {renderQueueItem({ item })}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// Reusing ScrollView instead of FlatList for simplicity in this port
const ScrollView = require('react-native').ScrollView;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 30 },
  iconContainer: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  subtitle: { color: '#94a3b8', textAlign: 'center' },
  inputCard: { backgroundColor: '#1e293b', borderRadius: 20, padding: 15, gap: 15 },
  textArea: { backgroundColor: '#0f172a', borderRadius: 15, padding: 15, color: 'white', fontSize: 14, minHeight: 120, textAlignVertical: 'top' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  addButton: { flex: 1, backgroundColor: '#4f46e5', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  buttonText: { color: 'white', fontWeight: 'bold' },
  queueHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, marginBottom: 15, paddingHorizontal: 5 },
  queueCount: { color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  clearAll: { color: '#ef4444', fontWeight: 'bold', textTransform: 'uppercase', fontSize: 12 },
  queueList: { gap: 10 },
  queueCard: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 15, padding: 12, alignItems: 'center', gap: 12, overflow: 'hidden' },
  statusIndicator: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  itemThumbnail: { width: 45, height: 45, borderRadius: 8, backgroundColor: '#0f172a' },
  itemInfo: { flex: 1, gap: 2 },
  itemTitle: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  itemStatus: { color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 'bold' }
});

export default BulkDownloader;
