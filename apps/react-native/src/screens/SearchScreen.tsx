import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeft,
  MagnifyingGlass,
  MusicNote,
  MusicNotes,
  X,
} from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';
import { TrackItem } from '../components/TrackItem';
import { TrackMenuDrawer } from '../components/TrackMenuDrawer';
import { usePlayer } from '../providers/PlayerProvider';
import { colors, fontSize } from '../lib/theme';
import type { MusicTrack } from '../services/music-scanner';

const TRACKS_STORAGE_KEY = 'heaven:music-tracks';
const DEBOUNCE_MS = 150;
const SECTION_CAP = 5;

type SectionKey = 'songs' | 'artists' | 'albums';

export const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { currentTrack, isPlaying, playTrack, togglePlayPause, recentTracks } = usePlayer();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [allTracks, setAllTracks] = useState<MusicTrack[]>([]);
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const inputRef = useRef<TextInput>(null);
  const allTracksRef = useRef<MusicTrack[]>([]);
  allTracksRef.current = allTracks;

  // Load tracks from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(TRACKS_STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setAllTracks(parsed);
        } catch {}
      }
    });
  }, []);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset expanded section when query changes
  useEffect(() => {
    setExpandedSection(null);
  }, [debouncedQuery]);

  // Search results
  const { songs, artists, albums } = useMemo(() => {
    if (!debouncedQuery) return { songs: [], artists: [], albums: [] };
    const q = debouncedQuery.toLowerCase();

    const matchedSongs = allTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album && t.album.toLowerCase().includes(q)),
    );

    // Unique artists from matched songs
    const artistSet = new Map<string, string>();
    for (const t of matchedSongs) {
      const key = t.artist.toLowerCase();
      if (!artistSet.has(key)) artistSet.set(key, t.artist);
    }
    // Also include artists from full library matching the query
    for (const t of allTracks) {
      const key = t.artist.toLowerCase();
      if (key.includes(q) && !artistSet.has(key)) artistSet.set(key, t.artist);
    }
    const matchedArtists = Array.from(artistSet.values());

    // Unique albums from matched songs
    const albumSet = new Map<string, { album: string; artist: string }>();
    for (const t of matchedSongs) {
      if (!t.album) continue;
      const key = t.album.toLowerCase();
      if (!albumSet.has(key)) albumSet.set(key, { album: t.album, artist: t.artist });
    }
    for (const t of allTracks) {
      if (!t.album) continue;
      const key = t.album.toLowerCase();
      if (key.includes(q) && !albumSet.has(key)) albumSet.set(key, { album: t.album, artist: t.artist });
    }
    const matchedAlbums = Array.from(albumSet.values());

    return { songs: matchedSongs, artists: matchedArtists, albums: matchedAlbums };
  }, [debouncedQuery, allTracks]);

  const handlePlayTrack = useCallback(
    (track: MusicTrack) => {
      if (currentTrack?.id === track.id) {
        void togglePlayPause();
      } else {
        void playTrack(track, allTracksRef.current);
      }
      navigation.navigate('Player');
    },
    [currentTrack, togglePlayPause, playTrack, navigation],
  );

  const handleArtistPress = useCallback((artistName: string) => {
    setQuery(artistName);
  }, []);

  const handleAlbumPress = useCallback((albumName: string) => {
    setQuery(albumName);
  }, []);

  const toggleSection = useCallback((section: SectionKey) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  }, []);

  const handleTrackMenu = useCallback((track: MusicTrack) => {
    setSelectedTrack(track);
    setTrackMenuOpen(true);
  }, []);

  const handleAddToPlaylist = useCallback((track: MusicTrack) => {
    Alert.alert('Coming Soon', 'Add to playlist will be available soon!');
  }, []);

  const handleAddToQueue = useCallback((track: MusicTrack) => {
    Alert.alert('Coming Soon', 'Add to queue will be available soon!');
  }, []);

  const handleGoToAlbum = useCallback((track: MusicTrack) => {
    if (track.album) setQuery(track.album);
  }, []);

  const handleGoToArtist = useCallback((track: MusicTrack) => {
    setQuery(track.artist);
  }, []);

  const isSearching = debouncedQuery.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <CaretLeft size={24} color={colors.textPrimary} weight="bold" />
        </TouchableOpacity>
        <View style={styles.inputContainer}>
          <MagnifyingGlass size={18} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="What do you want to listen to?"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            selectionColor={colors.accentBlue}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!isSearching ? (
          /* ── Recents ── */
          <View>
            <Text style={styles.sectionTitle}>Recents</Text>
            {recentTracks.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No recent plays</Text>
              </View>
            ) : (
              recentTracks.map((track) => (
                <TrackItem
                  key={track.id}
                  track={track}
                  isActive={currentTrack?.id === track.id}
                  isPlaying={currentTrack?.id === track.id && isPlaying}
                  onPress={() => handlePlayTrack(track)}
                  onMenuPress={() => handleTrackMenu(track)}
                />
              ))
            )}
          </View>
        ) : (
          /* ── Search Results ── */
          <View>
            {/* Songs */}
            {songs.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Songs</Text>
                {(expandedSection === 'songs' ? songs : songs.slice(0, SECTION_CAP)).map(
                  (track) => (
                    <TrackItem
                      key={track.id}
                      track={track}
                      isActive={currentTrack?.id === track.id}
                      isPlaying={currentTrack?.id === track.id && isPlaying}
                      onPress={() => handlePlayTrack(track)}
                      onMenuPress={() => handleTrackMenu(track)}
                    />
                  ),
                )}
                {songs.length > SECTION_CAP && (
                  <TouchableOpacity
                    style={styles.seeAllButton}
                    onPress={() => toggleSection('songs')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.seeAllText}>
                      {expandedSection === 'songs' ? 'Show less' : `See all (${songs.length})`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Artists */}
            {artists.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Artists</Text>
                {(expandedSection === 'artists' ? artists : artists.slice(0, SECTION_CAP)).map(
                  (name) => (
                    <TouchableOpacity
                      key={name}
                      style={styles.resultRow}
                      onPress={() => handleArtistPress(name)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.artistIcon}>
                        <MusicNotes size={20} color={colors.textMuted} />
                      </View>
                      <Text style={styles.resultText} numberOfLines={1}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
                {artists.length > SECTION_CAP && (
                  <TouchableOpacity
                    style={styles.seeAllButton}
                    onPress={() => toggleSection('artists')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.seeAllText}>
                      {expandedSection === 'artists' ? 'Show less' : `See all (${artists.length})`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Albums */}
            {albums.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Albums</Text>
                {(expandedSection === 'albums' ? albums : albums.slice(0, SECTION_CAP)).map(
                  (item) => (
                    <TouchableOpacity
                      key={`${item.album}-${item.artist}`}
                      style={styles.resultRow}
                      onPress={() => handleAlbumPress(item.album)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.albumIcon}>
                        <MusicNote size={20} color={colors.textMuted} />
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultText} numberOfLines={1}>
                          {item.album}
                        </Text>
                        <Text style={styles.resultSubtext} numberOfLines={1}>
                          {item.artist}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ),
                )}
                {albums.length > SECTION_CAP && (
                  <TouchableOpacity
                    style={styles.seeAllButton}
                    onPress={() => toggleSection('albums')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.seeAllText}>
                      {expandedSection === 'albums' ? 'Show less' : `See all (${albums.length})`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* No results */}
            {songs.length === 0 && artists.length === 0 && albums.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No results for "{debouncedQuery}"</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <TrackMenuDrawer
        open={trackMenuOpen}
        onClose={() => setTrackMenuOpen(false)}
        track={selectedTrack}
        onAddToPlaylist={handleAddToPlaylist}
        onAddToQueue={handleAddToQueue}
        onGoToAlbum={handleGoToAlbum}
        onGoToArtist={handleGoToArtist}
      />
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: colors.bgSurface,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 14,
    gap: 10,
    borderRadius: 9999,
    backgroundColor: colors.bgElevated,
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    padding: 0,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  section: {
    marginBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
  },
  artistIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: {
    flex: 1,
    minWidth: 0,
  },
  resultText: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  resultSubtext: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginTop: 1,
  },
  seeAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  seeAllText: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.accentBlue,
  },
});
