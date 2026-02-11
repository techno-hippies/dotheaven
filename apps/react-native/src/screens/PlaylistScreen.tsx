/**
 * PlaylistScreen — full playlist detail view.
 *
 * Supports both local playlists (AsyncStorage) and on-chain playlists (subgraph).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  DotsThree,
  MusicNotes,
  PencilSimple,
  Trash,
  ImageSquare,
  MinusCircle,
  Camera,
  ShareNetwork,
} from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useLitBridge } from '../providers/LitProvider';
import { colors, fontSize, radii } from '../lib/theme';
import { IPFS_GATEWAY } from '../lib/heaven-constants';
import {
  fetchPlaylistWithTracks,
  type OnChainPlaylist,
  type PlaylistTrack,
} from '../lib/playlists';
import {
  updatePlaylistMeta,
  deletePlaylist,
} from '../lib/playlist-service';
import {
  isLocalPlaylistId,
  getLocalPlaylist,
  renameLocalPlaylist,
  deleteLocalPlaylist,
  removeTrackFromLocalPlaylist,
  setLocalPlaylistCover,
  type LocalPlaylistTrack,
} from '../lib/local-playlists';
import { MobileHeader } from '../components/MobileHeader';
import { TrackItem } from '../components/TrackItem';
import { TrackMenuDrawer } from '../components/TrackMenuDrawer';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { usePlayer } from '../providers/PlayerProvider';
import {
  type MusicTrack,
  getCachedLibraryTracks,
  findLocalMatch,
} from '../services/music-scanner';

type Props = NativeStackScreenProps<RootStackParamList, 'Playlist'>;

// Convert local tracks to MusicTrack shape for TrackItem
function localToMusicTracks(tracks: LocalPlaylistTrack[]): MusicTrack[] {
  return tracks.map((t, i) => ({
    id: `local-track-${i}`,
    title: t.title,
    artist: t.artist,
    album: t.album ?? '',
    duration: t.duration ?? 0,
    uri: t.uri ?? '',
    filename: '',
    artworkUri: t.artworkUri,
    artworkFallbackUri: t.artworkFallbackUri,
  }));
}

// Convert on-chain playlist tracks to MusicTrack shape for TrackItem
function playlistToMusicTracks(tracks: PlaylistTrack[]): MusicTrack[] {
  return tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: parseDuration(t.duration),
    uri: '',
    filename: '',
    artworkUri: t.albumCover,
  }));
}

function parseDuration(formatted: string): number {
  if (formatted === '--:--') return 0;
  const [m, s] = formatted.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

export const PlaylistScreen: React.FC<Props> = ({ navigation, route }) => {
  const { playlistId } = route.params;
  const isLocal = isLocalPlaylistId(playlistId);
  const { isAuthenticated, pkpInfo, signMessage } = useAuth();
  const { bridge } = useLitBridge();
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = usePlayer();

  const [playlistName, setPlaylistName] = useState('');
  const [trackCount, setTrackCount] = useState(0);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1);

  // Cached library tracks for resolving playable URIs
  const libraryRef = React.useRef<MusicTrack[]>([]);
  useEffect(() => {
    getCachedLibraryTracks().then((lib) => { libraryRef.current = lib; });
  }, []);

  // For on-chain playlists: track ownership
  const [onChainPlaylist, setOnChainPlaylist] = useState<OnChainPlaylist | null>(null);
  const isOwner = isLocal
    ? true // local playlists are always owned by the user
    : onChainPlaylist && pkpInfo?.ethAddress
      ? onChainPlaylist.owner.toLowerCase() === pkpInfo.ethAddress.toLowerCase()
      : false;

  // Fetch playlist data
  const loadPlaylist = useCallback(async () => {
    setLoading(true);
    try {
      if (isLocal) {
        const lp = await getLocalPlaylist(playlistId);
        if (lp) {
          setPlaylistName(lp.name);
          setTrackCount(lp.tracks.length);
          setCoverUri(lp.coverUri ?? null);
          setTracks(localToMusicTracks(lp.tracks));
        }
      } else {
        const result = await fetchPlaylistWithTracks(playlistId);
        if (result) {
          setOnChainPlaylist(result.playlist);
          setPlaylistName(result.playlist.name);
          setTrackCount(result.playlist.trackCount);
          setCoverUri(
            result.playlist.coverCid
              ? `${IPFS_GATEWAY}${result.playlist.coverCid}?img-width=300&img-height=300&img-format=webp&img-quality=80`
              : null,
          );
          setTracks(playlistToMusicTracks(result.tracks));
        }
      }
    } catch (err) {
      console.warn('[PlaylistScreen] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [playlistId, isLocal]);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  // ── Actions ───────────────────────────────────────────────────────

  const handleTrackPress = useCallback((track: MusicTrack) => {
    // If tapping the already-playing track, toggle play/pause
    if (currentTrack?.id === track.id) {
      void togglePlayPause();
      return;
    }

    // For local playlist tracks that already have a uri, play directly
    if (track.uri) {
      void playTrack(track, tracks);
      navigation.navigate('Player');
      return;
    }

    // For on-chain tracks: match against cached local library by artist+title
    const localMatch = findLocalMatch(libraryRef.current, track.artist, track.title);
    if (localMatch) {
      // Build a playable queue from the playlist, resolving each track's uri
      const resolvedQueue = tracks.map((t) => {
        if (t.uri) return t;
        const match = findLocalMatch(libraryRef.current, t.artist, t.title);
        return match ? { ...t, uri: match.uri, artworkUri: t.artworkUri || match.artworkUri, artworkFallbackUri: match.artworkFallbackUri } : t;
      });
      const resolvedTrack = resolvedQueue.find((t) => t.id === track.id) ?? { ...track, uri: localMatch.uri };
      void playTrack(resolvedTrack, resolvedQueue.filter((t) => !!t.uri));
      navigation.navigate('Player');
      return;
    }

    // No playable source found
    Alert.alert(
      'Track Not Available',
      `"${track.title}" by ${track.artist} is not in your local library. Scan your device library first to play this track.`,
    );
  }, [currentTrack, togglePlayPause, playTrack, tracks, navigation]);

  const handleTrackMenu = useCallback((track: MusicTrack, index: number) => {
    setSelectedTrack(track);
    setSelectedTrackIndex(index);
    setTrackMenuOpen(true);
  }, []);

  const handleEditName = useCallback(() => {
    setEditName(playlistName);
    setEditOpen(true);
    setMenuOpen(false);
  }, [playlistName]);

  const handleSaveName = useCallback(async () => {
    const name = editName.trim();
    if (!name) return;

    setSaving(true);
    try {
      if (isLocal) {
        await renameLocalPlaylist(playlistId, name);
        setPlaylistName(name);
        setEditOpen(false);
      } else {
        if (!bridge || !pkpInfo?.pubkey || !pkpInfo?.ethAddress || !onChainPlaylist) {
          setSaving(false);
          return;
        }
        const result = await updatePlaylistMeta(
          {
            playlistId: onChainPlaylist.id,
            name,
            coverCid: onChainPlaylist.coverCid,
            visibility: onChainPlaylist.visibility,
          },
          signMessage,
          bridge,
          pkpInfo.pubkey,
          pkpInfo.ethAddress,
        );
        if (result.success) {
          setPlaylistName(name);
          setOnChainPlaylist((prev) => prev ? { ...prev, name } : prev);
          setEditOpen(false);
        } else {
          Alert.alert('Error', result.error || 'Failed to update playlist name');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update playlist name');
    } finally {
      setSaving(false);
    }
  }, [editName, isLocal, playlistId, onChainPlaylist, bridge, pkpInfo, signMessage]);

  const handleShare = useCallback(async () => {
    setMenuOpen(false);
    const trackLines = tracks
      .slice(0, 20)
      .map((t, i) => `${i + 1}. ${t.artist} — ${t.title}`)
      .join('\n');
    const suffix = tracks.length > 20 ? `\n...and ${tracks.length - 20} more` : '';
    const message = `🎵 ${playlistName}\n${trackCount} tracks\n\n${trackLines}${suffix}`;
    try {
      await Share.share({ message });
    } catch {}
  }, [playlistName, trackCount, tracks]);

  const handleChangeCover = useCallback(async () => {
    setMenuOpen(false);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;

    if (isLocal) {
      await setLocalPlaylistCover(playlistId, uri);
      setCoverUri(uri);
    } else {
      // TODO: upload to IPFS and call updatePlaylistMeta with new coverCid
      Alert.alert('Coming Soon', 'On-chain cover upload coming in a future update.');
    }
  }, [isLocal, playlistId]);

  const handleDelete = useCallback(async () => {
    setMenuOpen(false);

    Alert.alert(
      'Delete Playlist',
      `Are you sure you want to delete "${playlistName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isLocal) {
                await deleteLocalPlaylist(playlistId);
                navigation.goBack();
              } else {
                if (!bridge || !pkpInfo?.pubkey || !pkpInfo?.ethAddress || !onChainPlaylist) return;
                const result = await deletePlaylist(
                  { playlistId: onChainPlaylist.id },
                  signMessage,
                  bridge,
                  pkpInfo.pubkey,
                  pkpInfo.ethAddress!,
                );
                if (result.success) {
                  navigation.goBack();
                } else {
                  Alert.alert('Error', result.error || 'Failed to delete playlist');
                }
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete playlist');
            }
          },
        },
      ],
    );
  }, [playlistName, isLocal, playlistId, onChainPlaylist, bridge, pkpInfo, signMessage, navigation]);

  const handleRemoveTrack = useCallback(async (index: number) => {
    if (!isLocal) return; // on-chain removal not yet supported
    Alert.alert(
      'Remove Track',
      `Remove "${tracks[index]?.title}" from this playlist?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeTrackFromLocalPlaylist(playlistId, index);
            loadPlaylist();
          },
        },
      ],
    );
  }, [isLocal, tracks, playlistId, loadPlaylist]);

  // ── Render ────────────────────────────────────────────────────────

  const renderTrackItem = useCallback(({ item, index }: { item: MusicTrack; index: number }) => {
    const isActive = currentTrack?.id === item.id;
    return (
      <TrackItem
        track={item}
        isActive={isActive}
        isPlaying={isActive && isPlaying}
        onPress={() => handleTrackPress(item)}
        onMenuPress={() => handleTrackMenu(item, index)}
      />
    );
  }, [handleTrackPress, handleTrackMenu, currentTrack, isPlaying]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accentBlue} size="large" />
      </View>
    );
  }

  if (!playlistName) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Playlist not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const durationMin = Math.floor(totalDuration / 60);

  return (
    <View style={styles.container}>
      <MobileHeader
        title={playlistName}
        onBackPress={() => navigation.goBack()}
        rightSlot={isOwner ? (
          <IconButton variant="soft" size="md" accessibilityLabel="Menu" onPress={() => setMenuOpen(true)}>
            <DotsThree size={20} color={colors.textSecondary} weight="bold" />
          </IconButton>
        ) : undefined}
      />

      <FlatList
        data={tracks}
        renderItem={renderTrackItem}
        keyExtractor={(item, index) => item.id || `track-${index}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.heroSection}>
            {/* Cover — tap to change */}
            <TouchableOpacity
              style={styles.heroCover}
              activeOpacity={isOwner ? 0.7 : 1}
              onPress={isOwner ? handleChangeCover : undefined}
              disabled={!isOwner}
            >
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.heroCoverImage} />
              ) : (
                <View style={styles.heroCoverEmpty}>
                  {isOwner ? (
                    <Camera size={32} color={colors.textMuted} />
                  ) : (
                    <MusicNotes size={48} color={colors.textMuted} />
                  )}
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.heroMeta}>
              {trackCount} track{trackCount !== 1 ? 's' : ''}
              {durationMin > 0 ? ` · ${durationMin} min` : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No tracks yet</Text>
            <Text style={styles.emptySubtext}>
              Add tracks from your library using the track menu
            </Text>
          </View>
        }
      />

      {/* Owner menu sheet */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <Text style={styles.menuTitle}>{playlistName}</Text>
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={handleEditName}>
          <PencilSimple size={22} color={colors.textSecondary} />
          <Text style={styles.menuItemLabel}>Edit Name</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={handleChangeCover}>
          <ImageSquare size={22} color={colors.textSecondary} />
          <Text style={styles.menuItemLabel}>Change Cover</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={handleShare}>
          <ShareNetwork size={22} color={colors.textSecondary} />
          <Text style={styles.menuItemLabel}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={handleDelete}>
          <Trash size={22} color={colors.accentCoral} />
          <Text style={[styles.menuItemLabel, { color: colors.accentCoral }]}>Delete Playlist</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* Edit name sheet */}
      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)}>
        <Text style={styles.menuTitle}>Edit Playlist Name</Text>
        <TextInput
          style={styles.editInput}
          value={editName}
          onChangeText={setEditName}
          placeholder="Playlist name"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSaveName}
        />
        <View style={styles.editActions}>
          <Button variant="outline" onPress={() => setEditOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onPress={handleSaveName} disabled={!editName.trim() || saving} loading={saving}>
            Save
          </Button>
        </View>
      </BottomSheet>

      {/* Track menu — reuse the same drawer as library */}
      <TrackMenuDrawer
        open={trackMenuOpen}
        onClose={() => setTrackMenuOpen(false)}
        track={selectedTrack}
        onAddToPlaylist={() => {}}
        onAddToQueue={() => {}}
        onGoToAlbum={() => {}}
        onGoToArtist={() => {}}
        extraActions={isLocal && isOwner ? [
          {
            icon: <MinusCircle size={28} color={colors.accentCoral} />,
            label: 'Remove from Playlist',
            labelColor: colors.accentCoral,
            onPress: () => {
              setTrackMenuOpen(false);
              if (selectedTrackIndex >= 0) handleRemoveTrack(selectedTrackIndex);
            },
          },
        ] : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
  backLink: {
    fontSize: fontSize.base,
    color: colors.accentBlue,
  },

  // Hero section
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  heroCover: {
    width: 200,
    height: 200,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 16,
  },
  heroCoverImage: {
    width: 200,
    height: 200,
    borderRadius: radii.md,
  },
  heroCoverEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMeta: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginBottom: 4,
  },

  // Track list
  listContent: {
    paddingBottom: 140,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
  emptySubtext: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // Menu sheet
  menuTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  menuItemLabel: {
    fontSize: fontSize.lg,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  // Edit sheet
  editInput: {
    height: 44,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: 16,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    marginBottom: 16,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
});
