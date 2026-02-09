import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Plus, ArrowsClockwise, MusicNotes, FolderOpen, Disc } from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scanMediaLibrary, pickMusicFiles, extractArtistFromFilename, type MusicTrack } from '../services/music-scanner';
import { TrackItem } from '../components/TrackItem';
import { usePlayer } from '../providers/PlayerProvider';
import { colors } from '../lib/theme';
import { Button, IconButton } from '../ui';

const TRACKS_STORAGE_KEY = 'heaven:music-tracks';

export const MusicScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = usePlayer();

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
      if (currentTrack?.id === track.id) {
        void togglePlayPause();
        return;
      }
      void playTrack(track, tracks);
    },
    [currentTrack, togglePlayPause, playTrack, tracks],
  );


  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Music</Text>
        </View>
        <View style={styles.headerRight}>
          <IconButton variant="soft" size="md" accessibilityLabel="Add music files" onPress={handlePickFiles}>
            <Plus size={20} color={colors.textSecondary} />
          </IconButton>
          <IconButton variant="soft" size="md" accessibilityLabel="Scan library" onPress={handleScanLibrary}>
            <ArrowsClockwise size={18} color={colors.textSecondary} />
          </IconButton>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accentBlue} />
          <Text style={styles.loadingText}>Scanning...</Text>
        </View>
      )}

      {!hasScanned && !loading ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <MusicNotes size={40} color={colors.textMuted} weight="light" />
          </View>
          <Text style={styles.emptyTitle}>No Music Yet</Text>
          <Text style={styles.emptySubtitle}>
            Scan your device library or add files manually
          </Text>
          <View style={styles.emptyButtons}>
            <Button
              variant="default"
              size="md"
              fullWidth
              onPress={handleScanLibrary}
              leftIcon={<Disc size={18} color={colors.white} weight="fill" />}
            >
              Scan Library
            </Button>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onPress={handlePickFiles}
              leftIcon={<FolderOpen size={18} color={colors.textPrimary} />}
            >
              Pick Files
            </Button>
          </View>
        </View>
      ) : hasScanned ? (
        <>
          <View style={styles.countRow}>
            <Text style={styles.trackCount}>
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {tracks.map((track) => (
              <TrackItem
                key={track.id}
                track={track}
                isActive={currentTrack?.id === track.id}
                isPlaying={currentTrack?.id === track.id && isPlaying}
                onPress={() => handlePlayTrack(track)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 9999,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyButtons: {
    gap: 12,
    width: '100%',
  },
  countRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  trackCount: {
    fontSize: 14,
    color: colors.textMuted,
  },
  listContent: {
    paddingBottom: 140,
  },
});
