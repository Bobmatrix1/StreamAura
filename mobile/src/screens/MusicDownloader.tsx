import React, { useState } from 'react';
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
  Music, 
  Play, 
  Pause,
  User,
  Check,
  ChevronDown,
  Volume2
} from 'lucide-react-native';
import { useDownload } from '../contexts/DownloadContext';
import type { AudioQuality } from '../types';

const { width } = Dimensions.get('window');

const MusicDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
  const [selectedQuality, setSelectedQuality] = useState<AudioQuality | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
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
      Alert.alert('Error', 'Please enter a music URL');
      return;
    }

    const info = await getMediaInfo(url);
    if (info) {
      setCurrentPreview(info);
    } else {
      Alert.alert('Error', 'Failed to fetch music information');
    }
  };

  const handleClear = () => {
    setUrl('');
    setCurrentPreview(null);
    setSelectedQuality(null);
    setIsPlaying(false);
    setIsQualityDropdownOpen(false);
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
              <Music color="white" size={32} />
            </View>
            <Text style={styles.title}>Music Downloader</Text>
            <Text style={styles.subtitle}>Download tracks from Spotify, SoundCloud, and more.</Text>
          </View>

          {/* Input Section */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Link2 size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Paste music link here..."
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
                <View style={styles.artWrapper}>
                  <Image source={{ uri: currentPreview.thumbnail }} style={styles.albumArt} />
                  <TouchableOpacity style={styles.playOverlay}>
                    {isPlaying ? <Pause size={32} color="white" /> : <Play size={32} color="white" fill="white" />}
                  </TouchableOpacity>
                </View>
                <View style={styles.previewInfo}>
                  <Text style={styles.musicTitle} numberOfLines={2}>{currentPreview.title}</Text>
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
                        setSelectedQuality(q as AudioQuality);
                        setIsQualityDropdownOpen(false);
                      }}
                    >
                      <View>
                        <Text style={styles.qualityItemText}>{q.quality}</Text>
                        <Text style={styles.qualitySizeText}>{q.size} • {q.format}</Text>
                      </View>
                      {selectedQuality?.quality === q.quality && <Check size={16} color="#f97316" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity 
                style={[styles.downloadButton, !selectedQuality && styles.buttonDisabled]}
                onPress={() => {}}
                disabled={!selectedQuality}
              >
                <Download size={20} color="white" />
                <Text style={styles.downloadButtonText}>Download MP3</Text>
              </TouchableOpacity>
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
  iconContainer: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#f97316', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', marginBottom: 5 },
  subtitle: { color: '#94a3b8', textAlign: 'center', fontSize: 14 },
  inputContainer: { gap: 15, marginBottom: 20 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 15, paddingHorizontal: 15, height: 60 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: 'white', fontSize: 16 },
  fetchButton: { backgroundColor: '#ea580c', height: 55, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  fetchButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  previewContainer: { gap: 20 },
  previewCard: { backgroundColor: '#1e293b', borderRadius: 20, padding: 15, flexDirection: 'row', gap: 15 },
  artWrapper: { width: 100, aspectRatio: 1, borderRadius: 15, overflow: 'hidden', position: 'relative' },
  albumArt: { width: '100%', height: '100%' },
  playOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  previewInfo: { flex: 1, justifyContent: 'center', gap: 10 },
  musicTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  authorBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  authorText: { color: '#94a3b8', fontSize: 14 },
  qualitySelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: 18, borderRadius: 15 },
  qualityText: { color: 'white', fontWeight: 'bold' },
  qualityList: { backgroundColor: '#1e293b', borderRadius: 15, marginTop: -10, padding: 5 },
  qualityItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 10 },
  qualityItemText: { color: 'white', fontWeight: 'bold' },
  qualitySizeText: { color: '#64748b', fontSize: 12 },
  downloadButton: { backgroundColor: '#f97316', height: 60, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10 },
  buttonDisabled: { opacity: 0.5 },
  downloadButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});

export default MusicDownloader;
