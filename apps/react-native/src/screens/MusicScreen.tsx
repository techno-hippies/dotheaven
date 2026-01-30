import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scanMediaLibrary, pickMusicFiles, extractArtistFromFilename, type MusicTrack } from '../services/music-scanner';
import { TrackItem } from '../components/TrackItem';
import { usePlayer } from '../providers/PlayerProvider';

const TRACKS_STORAGE_KEY = 'heaven:music-tracks';

export const MusicScreen: React.FC = () => {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const { currentTrack, isPlaying, playTrack } = usePlayer();

  // Restore cached tracks on mount
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(TRACKS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTracks(parsed);
            setHasScanned(true);
          }
        } catch {}
      }
    })();
  }, []);

  const handleScanLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const scanned = await scanMediaLibrary();
      // Enrich artist from filename
      const enriched = scanned.map((t) => ({
        ...t,
        artist: t.artist === 'Unknown Artist' ? extractArtistFromFilename(t.filename) : t.artist,
      }));
      setTracks(enriched);
      setHasScanned(true);
      await AsyncStorage.setItem(TRACKS_STORAGE_KEY, JSON.stringify(enriched));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to scan media library');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePickFiles = useCallback(async () => {
    setLoading(true);
    try {
      const picked = await pickMusicFiles();
      if (picked.length > 0) {
        const enriched = picked.map((t) => ({
          ...t,
          artist: t.artist === 'Unknown Artist' ? extractArtistFromFilename(t.filename) : t.artist,
        }));
        const merged = [...tracks, ...enriched];
        setTracks(merged);
        setHasScanned(true);
        await AsyncStorage.setItem(TRACKS_STORAGE_KEY, JSON.stringify(merged));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to pick files');
    } finally {
      setLoading(false);
    }
  }, [tracks]);

  const handlePlayTrack = useCallback(
    (track: MusicTrack) => {
      playTrack(track, tracks);
    },
    [playTrack, tracks],
  );

  const renderTrack = useCallback(
    ({ item }: { item: MusicTrack }) => (
      <TrackItem
        track={item}
        isActive={currentTrack?.id === item.id}
        isPlaying={currentTrack?.id === item.id && isPlaying}
        onPress={() => handlePlayTrack(item)}
      />
    ),
    [currentTrack, isPlaying, handlePlayTrack],
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Music</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handlePickFiles} style={styles.headerButton}>
            <Ionicons name="add" size={24} color="#b8b8d0" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleScanLibrary} style={styles.headerButton}>
            <Ionicons name="refresh" size={22} color="#b8b8d0" />
          </TouchableOpacity>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#8fb8e0" />
          <Text style={styles.loadingText}>Scanning...</Text>
        </View>
      )}

      {!hasScanned && !loading ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="musical-notes-outline" size={64} color="#7878a0" />
          <Text style={styles.emptyTitle}>No Music Yet</Text>
          <Text style={styles.emptySubtitle}>
            Scan your device library or add files manually
          </Text>
          <View style={styles.emptyButtons}>
            <TouchableOpacity style={styles.scanButton} onPress={handleScanLibrary}>
              <Ionicons name="library" size={20} color="#1a1625" />
              <Text style={styles.scanButtonText}>Scan Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickButton} onPress={handlePickFiles}>
              <Ionicons name="folder-open" size={20} color="#f0f0f5" />
              <Text style={styles.pickButtonText}>Pick Files</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.trackCount}>
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          </Text>
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
            renderItem={renderTrack}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1625',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1f1b2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2d2645',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f0f0f5',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#252139',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  loadingText: {
    color: '#b8b8d0',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f0f0f5',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#7878a0',
    textAlign: 'center',
    marginTop: 8,
  },
  emptyButtons: {
    marginTop: 24,
    gap: 12,
    width: '100%',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#8fb8e0',
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1625',
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2d2645',
  },
  pickButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f0f0f5',
  },
  trackCount: {
    fontSize: 13,
    color: '#7878a0',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  listContent: {
    paddingBottom: 120, // Space for mini player + tabs
  },
});
