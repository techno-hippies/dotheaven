import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import {
  Alert,
  FlatList,
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
  DotsThreeVertical,
  CaretRight,
  List,
  Tray,
  CaretDown,
  PlusCircle,
  FolderOpen,
  Cloud,
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

const H_PADDING = 20;
const CARD_WIDTH = 140;
const CARD_GAP = 12;
const TRACKS_STORAGE_KEY = 'heaven:music-tracks';

type MusicView = 'home' | 'library' | 'shared';

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

// ── Section Header ──────────────────────────────────────────────────

const SectionHeader: React.FC<{
  title: string;
  action?: string;
  onAction?: () => void;
}> = ({ title, action, onAction }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {action && (
      <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
        <Text style={styles.sectionLink}>{action}</Text>
      </TouchableOpacity>
    )}
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
    <Text style={styles.albumCardTitle} numberOfLines={1}>{title}</Text>
    <Text style={styles.albumCardArtist} numberOfLines={1}>{artist}</Text>
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

// ── Library Entry Card (Home screen) ────────────────────────────────

const LibraryEntryCard: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  badge?: string;
  onPress?: () => void;
}> = ({ icon, iconBg, title, subtitle, badge, onPress }) => (
  <TouchableOpacity style={styles.entryCard} activeOpacity={0.7} onPress={onPress}>
    <View style={[styles.entryCardIcon, { backgroundColor: iconBg }]}>
      {icon}
    </View>
    <View style={styles.entryCardText}>
      <Text style={styles.entryCardTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.entryCardSubtitle} numberOfLines={1}>{subtitle}</Text>
    </View>
    {badge ? (
      <View style={styles.entryCardBadge}>
        <Text style={styles.entryCardBadgeText}>{badge}</Text>
      </View>
    ) : (
      <CaretRight size={18} color={colors.textMuted} />
    )}
  </TouchableOpacity>
);

// ── Shared Track Row ────────────────────────────────────────────────

const SharedTrackRow: React.FC<{
  title: string;
  artist: string;
  sharedFrom: string;
  isNew?: boolean;
  imageUri?: string;
  onPress?: () => void;
  onSave?: () => void;
}> = ({ title, artist, sharedFrom, isNew, imageUri, onPress, onSave }) => (
  <TouchableOpacity style={styles.sharedRow} activeOpacity={0.7} onPress={onPress}>
    <View style={styles.sharedRowCover}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.sharedRowCoverImage} />
      ) : (
        <MusicNote size={18} color={colors.textMuted} />
      )}
    </View>
    <View style={styles.sharedRowInfo}>
      <View style={styles.sharedRowTitleRow}>
        <Text style={styles.sharedRowTitle} numberOfLines={1}>{title}</Text>
        {isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
      </View>
      <Text style={styles.sharedRowMeta} numberOfLines={1}>
        {artist} · from {sharedFrom}
      </Text>
    </View>
    <TouchableOpacity
      style={styles.saveButton}
      onPress={(e) => { e.stopPropagation; onSave?.(); }}
      activeOpacity={0.7}
    >
      <PlusCircle size={22} color={colors.accentBlue} />
    </TouchableOpacity>
    <TouchableOpacity style={styles.menuButton} activeOpacity={0.7}>
      <DotsThreeVertical size={20} color={colors.textSecondary} weight="bold" />
    </TouchableOpacity>
  </TouchableOpacity>
);

// ═════════════════════════════════════════════════════════════════════
// SCREEN 1: Music Home
// ═════════════════════════════════════════════════════════════════════

const MusicHome: React.FC<{
  onNavigate: (view: MusicView) => void;
  trackCount: number;
  sharedCount: number;
  playlistCount: number;
}> = ({ onNavigate, trackCount, sharedCount, playlistCount }) => (
  <ScrollView
    contentContainerStyle={styles.scrollContent}
    showsVerticalScrollIndicator={false}
  >
    {/* Entry rows */}
    <View style={styles.entrySection}>
      <LibraryEntryCard
        icon={<List size={20} color={colors.accentPurple} />}
        iconBg="#2e2040"
        title="Library"
        subtitle="Local + Cloud"
        onPress={() => onNavigate('library')}
      />
      <LibraryEntryCard
        icon={<Tray size={20} color={colors.accentBlue} />}
        iconBg="#1e2d40"
        title="Shared With You"
        subtitle={`${sharedCount} song${sharedCount !== 1 ? 's' : ''}`}
        badge={sharedCount > 0 ? `${sharedCount} new` : undefined}
        onPress={() => onNavigate('shared')}
      />
      <LibraryEntryCard
        icon={<MusicNotes size={20} color={colors.success} weight="fill" />}
        iconBg="#1e3a2a"
        title="Playlists"
        subtitle={`${playlistCount} playlist${playlistCount !== 1 ? 's' : ''}`}
      />
    </View>

    {/* Trending */}
    <View style={styles.section}>
      <SectionHeader title="Trending" action="See all" />
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
      <SectionHeader title="New Releases" action="See all" />
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

    {/* Popular Artists */}
    <View style={styles.section}>
      <SectionHeader title="Top Artists" action="See all" />
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

// ═════════════════════════════════════════════════════════════════════
// SCREEN 2: Library Detail
// ═════════════════════════════════════════════════════════════════════

const LibraryDetail: React.FC<{
  tracks: MusicTrack[];
  scanning: boolean;
  onScan: () => void;
  onPlayTrack: (track: MusicTrack) => void;
  currentTrackId?: string;
  isPlaying: boolean;
  onBack: () => void;
}> = ({ tracks, scanning, onScan, onPlayTrack, currentTrackId, isPlaying, onBack }) => {
  const renderTrackItem = useCallback(({ item }: { item: MusicTrack }) => (
    <TrackItem
      key={item.id}
      track={item}
      isActive={currentTrackId === item.id}
      isPlaying={currentTrackId === item.id && isPlaying}
      onPress={() => onPlayTrack(item)}
    />
  ), [currentTrackId, isPlaying, onPlayTrack]);

  const keyExtractor = useCallback((item: MusicTrack) => item.id, []);

  return (
    <View style={styles.flex1}>
      <MobileHeader
        title="Library"
        onBackPress={onBack}
        rightSlot={
          <TouchableOpacity style={styles.headerSearchBtn} activeOpacity={0.7}>
            <Cloud size={20} color={colors.textSecondary} weight="fill" />
          </TouchableOpacity>
        }
      />

      {/* Filter + Sort bar (matches web FilterSortBar) */}
      <View style={styles.filterSortBar}>
        <TouchableOpacity style={styles.filterSortBtn} activeOpacity={0.7}>
          <Text style={styles.filterSortText}>Filter: All</Text>
          <CaretDown size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterSortBtn} activeOpacity={0.7}>
          <Text style={styles.filterSortText}>Sort: Recent</Text>
          <CaretDown size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Track list */}
      {tracks.length === 0 && !scanning ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No songs in your library yet</Text>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={onScan}
            activeOpacity={0.7}
          >
            <FolderOpen size={14} color={colors.accentBlue} />
            <Text style={styles.scanButtonLabel}>Scan device</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tracks}
          renderItem={renderTrackItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.trackListContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          getItemLayout={(_data, index) => ({
            length: 72,
            offset: 72 * index,
            index,
          })}
        />
      )}
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════
// SCREEN 3: Shared With You
// ═════════════════════════════════════════════════════════════════════

const SharedWithYou: React.FC<{
  onBack: () => void;
}> = ({ onBack }) => (
  <View style={styles.flex1}>
    <MobileHeader
      title="Shared With You"
      onBackPress={onBack}
      rightSlot={
        SHARED_TRACKS.length > 0 ? (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{SHARED_TRACKS.length} new</Text>
          </View>
        ) : undefined
      }
    />

    {/* Filter + Sort bar */}
    <View style={styles.filterSortBar}>
      <Text style={styles.filterSortText}>{SHARED_TRACKS.length} songs</Text>
      <TouchableOpacity style={styles.filterSortBtn} activeOpacity={0.7}>
        <Text style={styles.filterSortText}>Sort: Recent</Text>
        <CaretDown size={14} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>

    {/* Shared tracks */}
    <ScrollView
      contentContainerStyle={styles.trackListContent}
      showsVerticalScrollIndicator={false}
    >
      {SHARED_TRACKS.map((item, i) => (
        <SharedTrackRow
          key={`${item.sharedFrom}-${item.title}-${i}`}
          title={item.title}
          artist={item.artist}
          sharedFrom={item.sharedFrom}
          isNew
        />
      ))}
      {SHARED_TRACKS.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Songs shared to you appear here</Text>
        </View>
      )}
      {SHARED_TRACKS.length > 0 && (
        <View style={styles.helperTextWrap}>
          <Text style={styles.helperText}>Songs shared to you appear here</Text>
        </View>
      )}
    </ScrollView>
  </View>
);

// ═════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════

export const MusicScreen: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = usePlayer();
  const drawer = useContext(DrawerContext);
  const [view, setView] = useState<MusicView>('home');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitialSyncRef = useRef(false);
  const tracksRef = useRef<MusicTrack[]>(tracks);
  tracksRef.current = tracks;

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

  // Keep local library fresh while app is open
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

  // On reopen, refresh cached library once in the background
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
      void playTrack(track, tracksRef.current);
    },
    [currentTrack, togglePlayPause, playTrack],
  );

  return (
    <View style={styles.container}>
      {/* Show MobileHeader only on home view */}
      {view === 'home' && (
        <MobileHeader
          title="Music"
          isAuthenticated={isAuthenticated}
          onAvatarPress={drawer.open}
          rightSlot={
            <TouchableOpacity
              style={styles.headerSearchBtn}
              activeOpacity={0.7}
            >
              <MagnifyingGlass size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          }
        />
      )}

      {view === 'home' && (
        <MusicHome
          onNavigate={setView}
          trackCount={tracks.length}
          sharedCount={SHARED_TRACKS.length}
          playlistCount={0}
        />
      )}

      {view === 'library' && (
        <LibraryDetail
          tracks={tracks}
          scanning={scanning}
          onScan={handleScan}
          onPlayTrack={handlePlayTrack}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
          onBack={() => setView('home')}
        />
      )}

      {view === 'shared' && (
        <SharedWithYou onBack={() => setView('home')} />
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
  flex1: {
    flex: 1,
  },

  // Scroll
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 140,
  },
  trackListContent: {
    paddingBottom: 140,
  },

  // Entry cards (Music Home)
  entrySection: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    paddingHorizontal: 16,
    gap: 12,
  },
  entryCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryCardText: {
    flex: 1,
    minWidth: 0,
  },
  entryCardTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  entryCardSubtitle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    marginTop: 1,
  },
  entryCardBadge: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryCardBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#171717',
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
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionLink: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.accentBlue,
  },

  // Horizontal scroll
  hScroll: {
    paddingHorizontal: H_PADDING,
    gap: CARD_GAP,
  },

  // Album cards
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
  albumCardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  albumCardArtist: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },

  // Artist circles
  artistItem: {
    width: 80,
    alignItems: 'center',
    gap: 8,
  },
  artistAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  artistAvatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  artistName: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    width: 80,
  },

  headerBadge: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#171717',
  },

  // Header search button (Music Home)
  headerSearchBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },

  // Filter + Sort bar
  filterSortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    paddingHorizontal: H_PADDING,
    marginBottom: 4,
  },
  filterSortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterSortText: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textSecondary,
  },

  // Shared track rows
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 68,
    paddingHorizontal: H_PADDING,
    gap: 12,
  },
  sharedRowCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sharedRowCoverImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  sharedRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  sharedRowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sharedRowTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  sharedRowMeta: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginTop: 1,
  },
  newBadge: {
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#171717',
  },
  saveButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyStateText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accentBlue,
  },
  scanButtonLabel: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.accentBlue,
  },

  // Helper text (Shared screen)
  helperTextWrap: {
    alignItems: 'center',
    paddingTop: 24,
  },
  helperText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
});
