import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  ScrollView, 
  ActivityIndicator, 
  StyleSheet,
  Dimensions,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Link2, 
  X, 
  Download, 
  Play, 
  User,
  Check,
  ChevronDown,
  Video as VideoIcon
} from 'lucide-react-native';
import { useDownload } from '../contexts/DownloadContext';
import mediaApi from '../api/mediaApi';
import type { VideoQuality } from '../types';

const { width } = Dimensions.get('window');

const VideoDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isQualityDropdownOpen, setIsQualityDropdownOpen] = useState(false);
  
  const { 
    getMediaInfo, 
    currentPreview, 
    setCurrentPreview, 
    isLoadingPreview, 
    currentDownloadProgress 
  } = useDownload();

  const handleFetch = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a video URL');
      return;
    }

    const info = await getMediaInfo(url);
    if (info) {
      setCurrentPreview(info);
    } else {
      Alert.alert('Error', 'Failed to fetch video information');
    }
  };

  const handleClear = () => {
    setUrl('');
    setCurrentPreview(null);
    setSelectedQuality(null);
    setIsQualityDropdownOpen(false);
  };

  const handleDownload = async () => {
    if (!currentPreview || !selectedQuality) return;
    setIsDownloading(true);
    // Download logic setup
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <VideoIcon color="white" size={32} />
            </View>
            <Text style={styles.title}>Video Downloader</Text>
            <Text style={styles.subtitle}>Download high-quality videos without watermarks.</Text>
          </View>

          {/* Input Section */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Link2 size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Paste video link here..."
                placeholderTextColor="#64748b"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
              />
              {url.length > 0 && (
                <TouchableOpacity onPress={handleClear}>
                  <X size={20} color="#64748b" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity 
              onPress={handleFetch} 
              disabled={isLoadingPreview}
              style={styles.fetchButton}
            >
              {isLoadingPreview ? <ActivityIndicator color="white" /> : <Text style={styles.fetchButtonText}>Fetch</Text>}
            </TouchableOpacity>
          </View>

          {currentPreview && (
            <View style={styles.previewContainer}>
              <View style={styles.previewCard}>
                <Image source={{ uri: currentPreview.thumbnail }} style={styles.previewImage} />
                <View style={styles.previewInfo}>
                  <Text style={styles.videoTitle} numberOfLines={2}>{currentPreview.title}</Text>
                  <View style={styles.authorBadge}>
                    <User size={14} color="#94a3b8" />
                    <Text style={styles.authorText}>{currentPreview.author}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.qualitySelector} 
                onPress={() => setIsQualityDropdownOpen(!isQualityDropdownOpen)}
              >
                <Text style={styles.qualityText}>
                  {selectedQuality ? selectedQuality.quality : 'Choose Quality...'}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>

              {isQualityDropdownOpen && (
                <View style={styles.qualityList}>
                  {currentPreview.qualities.map((q) => (
                    <TouchableOpacity 
                      key={q.quality} 
                      style={styles.qualityItem}
                      onPress={() => {
                        setSelectedQuality(q as VideoQuality);
                        setIsQualityDropdownOpen(false);
                      }}
                    >
                      <View>
                        <Text style={styles.qualityItemText}>{q.quality}</Text>
                        <Text style={styles.qualitySizeText}>{q.size} • {q.format}</Text>
                      </View>
                      {selectedQuality?.quality === q.quality && <Check size={16} color="#3b82f6" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {isDownloading ? (
                <View style={styles.progressCard}>
                  <View style={styles.progressInfo}>
                    <Text style={styles.progressStatus}>Downloading...</Text>
                    <Text style={styles.progressPercent}>{currentDownloadProgress}%</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${currentDownloadProgress}%` }]} />
                  </View>
                </View>
              ) : (
                <TouchableOpacity 
                  style={[styles.downloadButton, !selectedQuality && styles.buttonDisabled]}
                  onPress={handleDownload}
                  disabled={!selectedQuality}
                >
                  <Download size={20} color="white" />
                  <Text style={styles.downloadButtonText}>Download Video</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  flex: { flex: 1 },
  scrollContent: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 30 },
  iconContainer: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', marginBottom: 5 },
  subtitle: { color: '#94a3b8', textAlign: 'center', fontSize: 14 },
  inputContainer: { gap: 15, marginBottom: 20 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 15, paddingHorizontal: 15, height: 60 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: 'white', fontSize: 16 },
  fetchButton: { backgroundColor: '#2563eb', height: 55, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  fetchButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  previewContainer: { gap: 20 },
  previewCard: { backgroundColor: '#1e293b', borderRadius: 20, overflow: 'hidden' },
  previewImage: { width: '100%', aspectRatio: 16/9 },
  previewInfo: { padding: 15, gap: 10 },
  videoTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  authorBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  authorText: { color: '#94a3b8', fontSize: 14 },
  qualitySelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: 18, borderRadius: 15 },
  qualityText: { color: 'white', fontWeight: 'bold' },
  qualityList: { backgroundColor: '#1e293b', borderRadius: 15, marginTop: -10, padding: 5, borderTopWidth: 1, borderTopColor: '#334155' },
  qualityItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 10 },
  qualityItemText: { color: 'white', fontWeight: 'bold' },
  qualitySizeText: { color: '#64748b', fontSize: 12 },
  downloadButton: { backgroundColor: '#3b82f6', height: 60, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10 },
  buttonDisabled: { opacity: 0.5 },
  downloadButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  progressCard: { backgroundColor: '#1e293b', padding: 20, borderRadius: 20, gap: 15 },
  progressInfo: { flexDirection: 'row', justifyContent: 'space-between' },
  progressStatus: { color: '#3b82f6', fontWeight: 'bold' },
  progressPercent: { color: 'white', fontWeight: 'bold' },
  progressBarBg: { height: 8, backgroundColor: '#334155', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#3b82f6' }
});

export default VideoDownloader;
