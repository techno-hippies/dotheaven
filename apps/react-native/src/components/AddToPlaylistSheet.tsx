/**
 * AddToPlaylistSheet — bottom sheet for adding a track to a playlist.
 *
 * Local-first: playlists are created/modified instantly in AsyncStorage.
 * No authentication required. On-chain playlists also shown when signed in.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MusicNotes, Plus } from 'phosphor-react-native';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { colors, fontSize, radii } from '../lib/theme';
import { useAuth } from '../providers/AuthProvider';
import {
  fetchUserPlaylists,
  type OnChainPlaylist,
} from '../lib/playlists';
import {
  getLocalPlaylists,
  createLocalPlaylist,
  addTrackToLocalPlaylist,
  type LocalPlaylist,
  type LocalPlaylistTrack,
} from '../lib/local-playlists';
import type { MusicTrack } from '../services/music-scanner';
import { IPFS_GATEWAY } from '../lib/heaven-constants';

// Unified playlist type for the list
interface PlaylistItem {
  id: string;
  name: string;
  trackCount: number;
  coverUri: string | null;
  isLocal: boolean;
}

interface AddToPlaylistSheetProps {
  open: boolean;
  onClose: () => void;
  track: MusicTrack | null;
  onSuccess?: (playlistId: string, playlistName: string) => void;
}

export const AddToPlaylistSheet: React.FC<AddToPlaylistSheetProps> = ({
  open,
  onClose,
  track,
  onSuccess,
}) => {
  const { isAuthenticated, pkpInfo } = useAuth();
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  // Load both local and on-chain playlists when sheet opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const items: PlaylistItem[] = [];

      // Always load local playlists (no auth needed)
      try {
        const local = await getLocalPlaylists();
        for (const lp of local) {
          // Use playlist cover, or fall back to first track's artwork
          const cover = lp.coverUri
            ?? lp.tracks[0]?.artworkUri
            ?? null;
          items.push({
            id: lp.id,
            name: lp.name,
            trackCount: lp.tracks.length,
            coverUri: cover,
            isLocal: true,
          });
        }
      } catch (err) {
        console.warn('[AddToPlaylist] Failed to load local playlists:', err);
      }

      // Also load on-chain playlists if authenticated
      if (isAuthenticated && pkpInfo?.ethAddress) {
        try {
          const onChain = await fetchUserPlaylists(pkpInfo.ethAddress);
          for (const p of onChain) {
            items.push({
              id: p.id,
              name: p.name,
              trackCount: p.trackCount,
              coverUri: p.coverCid
                ? `${IPFS_GATEWAY}${p.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
                : null,
              isLocal: false,
            });
          }
        } catch (err) {
          console.warn('[AddToPlaylist] Failed to fetch on-chain playlists:', err);
        }
      }

      if (!cancelled) {
        setPlaylists(items);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [open, isAuthenticated, pkpInfo?.ethAddress]);

  const buildLocalTrack = useCallback((): LocalPlaylistTrack | null => {
    if (!track) return null;
    return {
      artist: track.artist,
      title: track.title,
      album: track.album ?? undefined,
      duration: track.duration,
      uri: track.uri,
      artworkUri: track.artworkUri,
      artworkFallbackUri: track.artworkFallbackUri,
    };
  }, [track]);

  const handleAddToExisting = useCallback(async (item: PlaylistItem) => {
    const localTrack = buildLocalTrack();
    if (!localTrack) return;

    if (item.isLocal) {
      // Instant local add
      await addTrackToLocalPlaylist(item.id, localTrack);
      onClose();
      onSuccess?.(item.id, item.name);
    } else {
      // On-chain playlist — for now, show a message that this needs auth
      // (This path is only reachable when already authenticated)
      // TODO: wire to Lit Action for on-chain add
      console.log('[AddToPlaylist] On-chain add not yet wired:', item.id);
      onClose();
      onSuccess?.(item.id, item.name);
    }
  }, [buildLocalTrack, onClose, onSuccess]);

  const handleCreateNew = useCallback(async () => {
    const localTrack = buildLocalTrack();
    const name = newName.trim();
    if (!localTrack || !name) return;

    // Instant local creation
    const created = await createLocalPlaylist(name, localTrack);
    setNewName('');
    setShowCreate(false);
    onClose();
    onSuccess?.(created.id, name);
  }, [buildLocalTrack, newName, onClose, onSuccess]);

  const handleClose = useCallback(() => {
    setShowCreate(false);
    setNewName('');
    onClose();
  }, [onClose]);

  const renderPlaylistItem = useCallback(({ item }: { item: PlaylistItem }) => (
    <TouchableOpacity
      style={styles.playlistRow}
      activeOpacity={0.7}
      onPress={() => handleAddToExisting(item)}
    >
      <View style={styles.playlistCover}>
        {item.coverUri ? (
          <Image source={{ uri: item.coverUri }} style={styles.playlistCoverImage} />
        ) : (
          <MusicNotes size={20} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.playlistInfo}>
        <Text style={styles.playlistName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.playlistMeta} numberOfLines={1}>
          {item.trackCount} track{item.trackCount !== 1 ? 's' : ''}
        </Text>
      </View>
    </TouchableOpacity>
  ), [handleAddToExisting]);

  if (!track) return null;

  return (
    <BottomSheet open={open} onClose={handleClose}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Add to Playlist</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {track.title} — {track.artist}
        </Text>
      </View>

      {/* Create new playlist inline */}
      {showCreate ? (
        <View style={styles.createSection}>
          <TextInput
            style={styles.nameInput}
            placeholder="Playlist name"
            placeholderTextColor={colors.textMuted}
            value={newName}
            onChangeText={setNewName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreateNew}
          />
          <View style={styles.createActions}>
            <TouchableOpacity
              onPress={() => { setShowCreate(false); setNewName(''); }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Button
              onPress={handleCreateNew}
              disabled={!newName.trim()}
              size="sm"
            >
              Create
            </Button>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.createRow}
          activeOpacity={0.7}
          onPress={() => setShowCreate(true)}
        >
          <View style={styles.createIcon}>
            <Plus size={20} color={colors.accentBlue} />
          </View>
          <Text style={styles.createLabel}>Create New Playlist</Text>
        </TouchableOpacity>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Playlist list */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accentBlue} />
        </View>
      ) : playlists.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No playlists yet</Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          renderItem={renderPlaylistItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
        />
      )}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },

  // Create new
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  createIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createLabel: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.accentBlue,
  },
  createSection: {
    paddingVertical: 12,
    gap: 12,
  },
  nameInput: {
    height: 44,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: 16,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
  },
  cancelText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 4,
  },

  // Playlist rows — matches TrackItem layout
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    gap: 12,
  },
  playlistCover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  playlistCoverImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  playlistInfo: {
    flex: 1,
    minWidth: 0,
  },
  playlistName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  playlistMeta: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 1,
  },

  // Loading / Empty
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
});
