import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  ScrollView, 
  Modal, 
  ActivityIndicator, 
  StyleSheet,
  Dimensions,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Film, 
  Tv, 
  Search, 
  Download, 
  Star, 
  Calendar, 
  Clock, 
  X, 
  Play, 
  ChevronDown, 
  Check,
  ArrowLeft
} from 'lucide-react-native';
import { useDownload } from '../contexts/DownloadContext';
import { useAuth } from '../contexts/AuthContext';
import mediaApi, { API_BASE_URL } from '../api/mediaApi';
import type { MovieInfo, VideoQuality } from '../types';

const { width } = Dimensions.get('window');

const MovieDownloader: React.FC = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'movie' | 'series'>('movie');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MovieInfo[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieInfo | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality | null>(null);
  const [isQualityDropdownOpen, setIsQualityDropdownOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  // Series specific states
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [isEpisodeOpen, setIsEpisodeOpen] = useState(false);

  const { 
    downloadWithProgress, 
    currentDownloadProgress, 
    cancelDownload,
    pauseDownload,
    isPaused,
    activeStage
  } = useDownload();

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSelectedMovie(null);
    try {
      const result = await mediaApi.searchMovies(query, searchType);
      if (result.success && result.data) {
        setSearchResults(result.data);
        if (result.data.length === 0) {
          Alert.alert('No Results', `No ${searchType === 'movie' ? 'movies' : 'series'} found for "${query}"`);
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to search');
      }
    } catch (err) {
      Alert.alert('Error', 'Connection failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectMovie = async (movie: MovieInfo) => {
    setIsLoadingDetails(true);
    setSelectedQuality(null);
    setSelectedSeason(null);
    setSelectedEpisode(null);
    try {
      const result = await mediaApi.getMovieDetails(movie.id, searchType, movie.title);
      if (result.success && result.data) {
        setSelectedMovie(result.data);
        if (searchType === 'series' && result.data.seasons && result.data.seasons.length > 0) {
          const firstSeason = result.data.seasons[0];
          setSelectedSeason(firstSeason.season);
          if (firstSeason.episodes && firstSeason.episodes.length > 0) {
            setSelectedEpisode(firstSeason.episodes[0]);
            handleSelectEpisode(firstSeason.season, firstSeason.episodes[0], result.data);
          }
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to get details');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSelectEpisode = async (season: number, episode: number, currentMovie?: MovieInfo) => {
    const movie = currentMovie || selectedMovie;
    if (!movie) return;

    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setIsLoadingDetails(true);
    setSelectedQuality(null);

    try {
      const result = await mediaApi.getMovieDetails(movie.id, 'series', movie.title, season, episode);
      if (result.success && result.data) {
        setSelectedMovie(prev => prev ? {
          ...prev,
          qualities: result.data?.qualities || []
        } : (result.data || null));
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load episode details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedMovie || !selectedQuality) return;
    setIsDownloading(true);
    // Download logic implementation
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: searchType === 'movie' ? '#06b6d4' : '#a855f7' }]}>
            {searchType === 'movie' ? <Film color="white" size={32} /> : <Tv color="white" size={32} />}
          </View>
          <Text style={styles.title}>{searchType === 'movie' ? 'Movie Downloader' : 'Series Downloader'}</Text>
          <Text style={styles.subtitle}>Search and download in high quality.</Text>
        </View>

        {/* Type Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity 
            onPress={() => setSearchType('movie')}
            style={[styles.toggleButton, searchType === 'movie' && styles.toggleButtonActive]}
          >
            <Film size={16} color={searchType === 'movie' ? 'white' : '#94a3b8'} />
            <Text style={[styles.toggleText, searchType === 'movie' && styles.toggleTextActive]}>Movies</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setSearchType('series')}
            style={[styles.toggleButton, searchType === 'series' && styles.toggleButtonActive]}
          >
            <Tv size={16} color={searchType === 'series' ? 'white' : '#94a3b8'} />
            <Text style={[styles.toggleText, searchType === 'series' && styles.toggleTextActive]}>Series</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Search size={20} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search for a ${searchType}...`}
            placeholderTextColor="#64748b"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity 
            onPress={handleSearch} 
            disabled={isSearching}
            style={[styles.searchButton, { backgroundColor: searchType === 'movie' ? '#0891b2' : '#9333ea' }]}
          >
            {isSearching ? <ActivityIndicator color="white" /> : <Text style={styles.searchButtonText}>Search</Text>}
          </TouchableOpacity>
        </View>

        {selectedMovie ? (
          /* Movie Details View */
          <View style={styles.detailsView}>
            <TouchableOpacity onPress={() => setSelectedMovie(null)} style={styles.backButton}>
              <ArrowLeft size={16} color="#94a3b8" />
              <Text style={styles.backText}>Back to results</Text>
            </TouchableOpacity>

            <View style={styles.detailsCard}>
              <View style={styles.detailsRow}>
                <Image 
                  source={{ uri: selectedMovie.thumbnail || 'https://via.placeholder.com/400x600?text=No+Poster' }} 
                  style={styles.poster}
                />
                <View style={styles.mainInfo}>
                  <Text style={styles.movieTitle}>{selectedMovie.title}</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.badge}>
                      <Star size={12} color="#eab308" fill="#eab308" />
                      <Text style={styles.badgeText}>{selectedMovie.rating}</Text>
                    </View>
                    <View style={styles.badge}>
                      <Calendar size={12} color="#94a3b8" />
                      <Text style={styles.badgeText}>{selectedMovie.year}</Text>
                    </View>
                  </View>
                  <Text style={styles.description} numberOfLines={4}>{selectedMovie.description}</Text>
                </View>
              </View>

              {/* Quality Dropdown Simulation */}
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
                  {selectedMovie.qualities?.map((q) => (
                    <TouchableOpacity 
                      key={q.quality} 
                      style={styles.qualityItem}
                      onPress={() => {
                        setSelectedQuality(q);
                        setIsQualityDropdownOpen(false);
                      }}
                    >
                      <Text style={styles.qualityItemText}>{q.quality}</Text>
                      {selectedQuality?.quality === q.quality && <Check size={16} color="#06b6d4" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity 
                style={[styles.downloadButton, { backgroundColor: searchType === 'movie' ? '#0891b2' : '#9333ea' }]}
                onPress={handleDownload}
              >
                <Download size={20} color="white" />
                <Text style={styles.downloadButtonText}>Download Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Results Grid */
          <View style={styles.resultsGrid}>
            {searchResults.map((movie) => (
              <TouchableOpacity 
                key={movie.id} 
                style={styles.movieCard}
                onPress={() => handleSelectMovie(movie)}
              >
                <Image source={{ uri: movie.thumbnail }} style={styles.gridPoster} />
                <Text style={styles.gridTitle} numberOfLines={1}>{movie.title}</Text>
                <Text style={styles.gridYear}>{movie.year}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 30 },
  iconContainer: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', marginBottom: 5 },
  subtitle: { color: '#94a3b8', textAlign: 'center' },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 15, padding: 4, alignSelf: 'center', marginBottom: 25 },
  toggleButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, gap: 8 },
  toggleButtonActive: { backgroundColor: '#334155' },
  toggleText: { color: '#94a3b8', fontWeight: 'bold' },
  toggleTextActive: { color: 'white' },
  searchContainer: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 15, padding: 5, alignItems: 'center' },
  searchIcon: { marginLeft: 15 },
  searchInput: { flex: 1, color: 'white', paddingHorizontal: 15, height: 50 },
  searchButton: { paddingHorizontal: 20, height: 40, borderRadius: 10, justifyContent: 'center' },
  searchButtonText: { color: 'white', fontWeight: 'bold' },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 20 },
  movieCard: { width: (width - 60) / 2, marginBottom: 20, backgroundColor: '#1e293b', borderRadius: 15, overflow: 'hidden' },
  gridPoster: { width: '100%', aspectRatio: 2/3 },
  gridTitle: { color: 'white', fontWeight: 'bold', padding: 10, paddingBottom: 2 },
  gridYear: { color: '#64748b', fontSize: 12, paddingHorizontal: 10, paddingBottom: 10 },
  detailsView: { marginTop: 10 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  backText: { color: '#94a3b8', fontSize: 14 },
  detailsCard: { backgroundColor: '#1e293b', borderRadius: 25, padding: 20 },
  detailsRow: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  poster: { width: 100, aspectRatio: 2/3, borderRadius: 15 },
  mainInfo: { flex: 1 },
  movieTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  badgeRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  description: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  qualitySelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#334155', padding: 15, borderRadius: 15, marginTop: 10 },
  qualityText: { color: 'white', fontWeight: 'bold' },
  qualityList: { backgroundColor: '#334155', borderRadius: 15, marginTop: 5, padding: 5 },
  qualityItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 10 },
  qualityItemText: { color: 'white' },
  downloadButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 18, borderRadius: 15, marginTop: 20, gap: 10 },
  downloadButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});

export default MovieDownloader;
