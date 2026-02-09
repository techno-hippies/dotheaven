import React, { useState, useEffect, useCallback, useContext, useRef, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import {
  MusicNote,
  MusicNotes,
  DotsThree,
  MagnifyingGlass,
} from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MobileHeader } from '../components/MobileHeader';
import { TrackItem } from '../components/TrackItem';
import { useAuth } from '../providers/AuthProvider';
import { usePlayer } from '../providers/PlayerProvider';
import { DrawerContext } from '../navigation/TabNavigator';
import { scanMediaLibrary, extractArtistFromFilename, type MusicTrack } from '../services/music-scanner';
import { colors, fontSize, radii } from '../lib/theme';
import { TabBar } from '../ui';

const CARD_WIDTH = 150;
const CARD_GAP = 12;
const H_PADDING = 20;
const TRACKS_STORAGE_KEY = 'heaven:music-tracks';

// ── Section Header ──────────────────────────────────────────────────

const SectionHeader: React.FC<{
  title: string;
  right?: string | React.ReactNode;
  onRightPress?: () => void;
}> = ({ title, right, onRightPress }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {typeof right === 'string' ? (
      <TouchableOpacity onPress={onRightPress} activeOpacity={0.7}>
        <Text style={styles.sectionLink}>{right}</Text>
      </TouchableOpacity>
    ) : right ? right : null}
  </View>
);

// ── Album Card (Trending / New Releases) ────────────────────────────

const AlbumCard: React.FC<{
  title: string;
  artist: string;
  imageUri?: string;
}> = ({ title, artist, imageUri }) => (
  <View style={styles.albumCard}>
    <View style={styles.albumCover}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.albumCoverImage} />
      ) : (
        <MusicNote size={24} color={colors.textMuted} />
      )}
    </View>
    <View style={styles.albumCardInfo}>
      <Text style={styles.albumCardTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.albumCardArtist} numberOfLines={1}>{artist}</Text>
    </View>
  </View>
);

// ── Artist Circle ───────────────────────────────────────────────────

const ArtistCircle: React.FC<{ name: string; imageUri?: string }> = ({ name, imageUri }) => (
  <View style={styles.artistItem}>
    <View style={styles.artistAvatar}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.artistAvatarImage} />
      ) : (
        <MusicNotes size={24} color={colors.textMuted} />
      )}
    </View>
    <Text style={styles.artistName} numberOfLines={1}>{name}</Text>
  </View>
);

// ── Track Row (compact — for discover & shared) ─────────────────────

const TrackRow: React.FC<{
  title: string;
  artist: string;
  imageUri?: string;
  sharedFrom?: string;
  onPress?: () => void;
}> = ({ title, artist, imageUri, sharedFrom, onPress }) => (
  <TouchableOpacity style={styles.trackRow} activeOpacity={0.7} onPress={onPress}>
    <View style={styles.trackRowCover}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.trackRowCoverImage} />
      ) : (
        <MusicNote size={18} color={colors.textMuted} />
      )}
    </View>
    <View style={styles.trackRowInfo}>
      <Text style={styles.trackRowTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.trackRowMeta}>
        <Text style={styles.trackRowArtist} numberOfLines={1}>{artist}</Text>
        {sharedFrom && (
          <>
            <Text style={styles.trackRowDot}>·</Text>
            <Text style={styles.trackRowFrom} numberOfLines={1}>from {sharedFrom}</Text>
          </>
        )}
      </View>
    </View>
    <DotsThree size={20} color={colors.textMuted} weight="bold" />
  </TouchableOpacity>
);

// ── Playlist Card (Library) ─────────────────────────────────────────

const PlaylistRow: React.FC<{
  title: string;
  subtitle: string;
  active?: boolean;
  onPress: () => void;
}> = ({ title, subtitle, active, onPress }) => (
  <TouchableOpacity style={[styles.playlistRow, active && styles.playlistRowActive]} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.playlistRowBadge}>
      <MusicNotes size={18} color={colors.textSecondary} />
    </View>
    <View style={styles.playlistRowTextWrap}>
      <Text style={styles.playlistRowTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.playlistRowSubtitle} numberOfLines={1}>{subtitle}</Text>
    </View>
  </TouchableOpacity>
);

type LibrarySortKey = 'recent' | 'title' | 'artist' | 'album';

const SORT_OPTIONS: Array<{ key: LibrarySortKey; label: string }> = [
  { key: 'recent', label: 'Recent Added' },
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
];

// ── Scan Button (pill) ──────────────────────────────────────────────

const ScanButton: React.FC<{ onPress: () => void; loading?: boolean }> = ({ onPress, loading }) => (
  <TouchableOpacity style={styles.scanBtn} onPress={onPress} activeOpacity={0.7} disabled={loading}>
    {loading ? (
      <ActivityIndicator size={14} color={colors.accentBlue} />
    ) : (
      <MagnifyingGlass size={14} color={colors.accentBlue} />
    )}
    <Text style={styles.scanBtnLabel}>{loading ? 'Scanning...' : 'Scan'}</Text>
  </TouchableOpacity>
);

// ── Mock data ───────────────────────────────────────────────────────

const TRENDING = [
  { title: 'Midnight Dreams', artist: 'Luna Sky' },
  { title: 'Electric Hearts', artist: 'Neon Pulse' },
  { title: 'Summer Waves', artist: 'Golden Ray' },
  { title: 'Starlight', artist: 'Cosmos' },
];

const NEW_RELEASES = [
  { title: 'Electric Bloom', artist: 'Galaxy Ray' },
  { title: 'Pulse Drive', artist: 'Hyper Flux' },
  { title: 'Neon Rain', artist: 'Drift Wave' },
];

const RECENT_TRACKS = [
  { title: 'Golden Hour', artist: 'Sunset Crew' },
  { title: 'Neon Lights', artist: 'City Wake' },
  { title: 'Crystal Clear', artist: 'Maya Aquanis' },
  { title: 'Velvet Sky', artist: 'Neon Bloom' },
];

const POPULAR_ARTISTS = [
  { name: 'Luna Sky' },
  { name: 'Neon Pulse' },
  { name: 'Ocean Skin' },
  { name: 'Sunset Crew' },
];

const SHARED_TRACKS = [
  { title: 'Breathe', artist: 'Telepopmusik', album: 'Angel Milk', sharedFrom: 'alice.heaven' },
  { title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We Are Dreaming', sharedFrom: 'bob.heaven' },
];

// ── Discover Tab Content ────────────────────────────────────────────

const DiscoverContent: React.FC = () => (
  <ScrollView
    contentContainerStyle={styles.scrollContent}
    showsVerticalScrollIndicator={false}
  >
    {/* Trending */}
    <View style={styles.section}>
      <SectionHeader title="Trending" right="See all" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hScroll}
      >
        {TRENDING.map((item, i) => (
          <AlbumCard key={i} title={item.title} artist={item.artist} />
        ))}
      </ScrollView>
    </View>

    {/* New Releases */}
    <View style={styles.section}>
      <SectionHeader title="New Releases" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hScroll}
      >
        {NEW_RELEASES.map((item, i) => (
          <AlbumCard key={i} title={item.title} artist={item.artist} />
        ))}
      </ScrollView>
    </View>

    {/* Recently Played */}
    <View style={styles.section}>
      <SectionHeader title="Recently Played" right="See all" />
      <View>
        {RECENT_TRACKS.map((item, i) => (
          <TrackRow key={i} title={item.title} artist={item.artist} />
        ))}
      </View>
    </View>

    {/* Popular Artists */}
    <View style={styles.section}>
      <SectionHeader title="Popular Artists" right="See all" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hScroll}
      >
        {POPULAR_ARTISTS.map((item, i) => (
          <ArtistCircle key={i} name={item.name} />
        ))}
      </ScrollView>
    </View>
  </ScrollView>
);

// ── Library Tab Content ─────────────────────────────────────────────

const LibraryContent: React.FC<{
  tracks: MusicTrack[];
  scanning: boolean;
  onScan: () => void;
  onPlayTrack: (track: MusicTrack) => void;
  currentTrackId?: string;
  isPlaying: boolean;
}> = ({ tracks, scanning, onScan, onPlayTrack, currentTrackId, isPlaying }) => {
  const [activePlaylist, setActivePlaylist] = useState<'local' | 'shared'>('local');
  const [sortBy, setSortBy] = useState<LibrarySortKey>('recent');

  const sortedLocalTracks = useMemo(() => {
    const list = [...tracks];
    if (sortBy === 'recent') return list;
    return list.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'artist') return (a.artist || '').localeCompare(b.artist || '');
      return (a.album || '').localeCompare(b.album || '');
    });
  }, [tracks, sortBy]);

  const sortedSharedTracks = useMemo(() => {
    const list = [...SHARED_TRACKS];
    if (sortBy === 'recent') return list;
    return list.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'artist') return a.artist.localeCompare(b.artist);
      return a.album.localeCompare(b.album);
    });
  }, [sortBy]);

  const localSubtitle =
    scanning ? 'Syncing local files…' : tracks.length > 0 ? `${tracks.length} tracks` : 'No local tracks yet';
  const sharedSubtitle = `${SHARED_TRACKS.length} tracks shared by friends`;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Playlist list */}
      <View style={styles.section}>
        <SectionHeader title="Playlists" />
        <View style={styles.playlistsList}>
          <PlaylistRow
            title="Local Library"
            subtitle={localSubtitle}
            active={activePlaylist === 'local'}
            onPress={() => setActivePlaylist('local')}
          />
          <PlaylistRow
            title="Shared With You"
            subtitle={sharedSubtitle}
            active={activePlaylist === 'shared'}
            onPress={() => setActivePlaylist('shared')}
          />
        </View>
      </View>

      {/* Selected playlist */}
      <View style={styles.section}>
        <SectionHeader
          title={activePlaylist === 'local' ? 'Local Library' : 'Shared With You'}
          right={activePlaylist === 'local' && tracks.length === 0 ? <ScanButton onPress={onScan} loading={scanning} /> : undefined}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortPillsRow}
        >
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.sortPill, sortBy === option.key && styles.sortPillActive]}
              onPress={() => setSortBy(option.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.sortPillText, sortBy === option.key && styles.sortPillTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {activePlaylist === 'local' && tracks.length === 0 && !scanning ? (
          <View style={styles.emptyLocal}>
            <MusicNote size={32} color={colors.textMuted} />
            <Text style={styles.emptyLocalText}>Tap Scan once to import your device music.</Text>
          </View>
        ) : activePlaylist === 'local' ? (
          <View>
            {sortedLocalTracks.slice(0, 50).map((track) => (
              <TrackItem
                key={track.id}
                track={track}
                isActive={currentTrackId === track.id}
                isPlaying={currentTrackId === track.id && isPlaying}
                onPress={() => onPlayTrack(track)}
              />
            ))}
            {sortedLocalTracks.length > 50 && (
              <TouchableOpacity style={styles.seeAllRow} activeOpacity={0.7}>
                <Text style={styles.seeAllText}>
                  See all {sortedLocalTracks.length} tracks
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View>
            {sortedSharedTracks.map((item, i) => (
              <TrackRow
                key={`${item.sharedFrom}-${item.title}-${i}`}
                title={item.title}
                artist={`${item.artist} · ${item.album}`}
                sharedFrom={item.sharedFrom}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

// ── Main Component ──────────────────────────────────────────────────

export const MusicScreen: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = usePlayer();
  const drawer = useContext(DrawerContext);
  const [activeTab, setActiveTab] = useState<'discover' | 'library'>('library');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitialSyncRef = useRef(false);

  // Load cached tracks on mount
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(TRACKS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTracks(parsed);
          }
        } catch {}
      }
    })();
  }, []);

  const runScan = useCallback(async (options?: { silent?: boolean }) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    try {
      const scanned = await scanMediaLibrary();
      const enriched = scanned.map((t) => ({
        ...t,
        artist: t.artist === 'Unknown Artist' ? extractArtistFromFilename(t.filename) : t.artist,
      }));
      setTracks(enriched);
      await AsyncStorage.setItem(TRACKS_STORAGE_KEY, JSON.stringify(enriched));
    } catch (err: any) {
      if (!options?.silent) {
        Alert.alert('Error', err.message || 'Failed to scan media library');
      } else {
        console.log('[MusicScreen] background sync skipped:', err?.message ?? err);
      }
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, []);

  const handleScan = useCallback(async () => {
    await runScan();
  }, [runScan]);

  // Keep local library fresh while app is open.
  useEffect(() => {
    const sub = MediaLibrary.addListener(() => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = setTimeout(() => {
        void runScan({ silent: true });
      }, 1200);
    });
    return () => {
      sub.remove();
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
  }, [runScan]);

  // On reopen, refresh cached library once in the background.
  useEffect(() => {
    if (didInitialSyncRef.current || tracks.length === 0) return;
    didInitialSyncRef.current = true;
    void runScan({ silent: true });
  }, [tracks.length, runScan]);

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
      <MobileHeader isAuthenticated={isAuthenticated} onAvatarPress={drawer.open} />

      <TabBar
        tabs={[
          { key: 'discover', label: 'For You' },
          { key: 'library', label: 'Library' },
        ]}
        activeTab={activeTab}
        onTabPress={(key) => setActiveTab(key as 'discover' | 'library')}
      />

      {activeTab === 'discover' ? (
        <DiscoverContent />
      ) : (
        <LibraryContent
          tracks={tracks}
          scanning={scanning}
          onScan={handleScan}
          onPlayTrack={handlePlayTrack}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
        />
      )}
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },

  // Content
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 140,
  },

  // Sections
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: H_PADDING,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionLink: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.accentBlue,
  },

  // Horizontal scroll
  hScroll: {
    paddingHorizontal: H_PADDING,
    gap: CARD_GAP,
  },

  // Album cards (Trending / New Releases)
  albumCard: {
    width: CARD_WIDTH,
    gap: 8,
  },
  albumCover: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  albumCoverImage: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: 8,
  },
  albumCardInfo: {
    gap: 2,
  },
  albumCardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  albumCardArtist: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // Artist circles
  artistItem: {
    width: 88,
    alignItems: 'center',
    gap: 8,
  },
  artistAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  artistAvatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  artistName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    width: 88,
  },

  // Track rows (discover + shared)
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 68,
    paddingHorizontal: H_PADDING,
  },
  trackRowCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackRowCoverImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  trackRowInfo: {
    flex: 1,
    gap: 2,
  },
  trackRowTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  trackRowArtist: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  trackRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trackRowDot: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  trackRowFrom: {
    fontSize: fontSize.sm,
    color: colors.accentBlue,
  },

  // Scan button (pill)
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accentBlue,
  },
  scanBtnLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.accentBlue,
  },

  // Empty local library
  emptyLocal: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyLocalText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // See all tracks
  seeAllRow: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  seeAllText: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.accentBlue,
  },

  playlistsList: {
    paddingHorizontal: H_PADDING,
    gap: 10,
  },
  playlistRow: {
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 12,
  },
  playlistRowActive: {
    backgroundColor: colors.bgHighlight,
  },
  playlistRowBadge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.bgHighlightHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistRowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  playlistRowTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  playlistRowSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  sortPillsRow: {
    paddingHorizontal: H_PADDING,
    gap: 8,
    marginBottom: 12,
  },
  sortPill: {
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bgHighlight,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortPillActive: {
    backgroundColor: colors.bgHighlight,
    borderColor: colors.accentBlue,
  },
  sortPillText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
  sortPillTextActive: {
    color: colors.textPrimary,
  },
});
