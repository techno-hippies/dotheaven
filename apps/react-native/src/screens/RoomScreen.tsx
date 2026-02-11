/**
 * RoomScreen — standalone voice room screen
 *
 * Matches the Storybook design from packages/ui/src/composite/room/room-panel.tsx:
 *   Header (duration + settings + close)
 *   → Now Playing bar (when song selected)
 *   → Lyrics area (centered, flex-1)
 *   → Bottom section: participants row + controls (song picker + mic)
 *
 * Uses useSafeAreaInsets() for proper status bar handling.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  FlatList,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Microphone,
  MicrophoneSlash,
  GearSix,
  MusicNote,
} from 'phosphor-react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useFreeRoomVoice, type CreateRoomOptions, type PKPInfo } from '../hooks/useFreeRoomVoice';
import { useAuth } from '../providers/AuthProvider';
import { colors, fontSize } from '../lib/theme';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { BottomSheet } from '../ui/BottomSheet';
import {
  fetchScrobbleEntries,
  isValidCid,
  coverUrl,
  type ScrobbleEntry,
} from '../lib/scrobbles';

type RoomScreenParams = {
  mode: 'create' | 'join';
  roomId?: string;
  visibility?: 'open' | 'private';
  ai_enabled?: boolean;
};

type RouteParams = RouteProp<{ Room: RoomScreenParams }, 'Room'>;

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function errorMessage(error: Error): string {
  const msg = error.message;
  if (msg === 'heaven_name_required') return 'You need a .heaven name to create a room.';
  if (msg === 'insufficient_credits') return 'Not enough credits to join a room.';
  if (msg === 'already_hosting_free_room') return 'You already have an active room. Close it first.';
  if (msg === 'already_in_free_room') return 'You are already in another room.';
  if (msg === 'room_not_found') return 'Room not found or already closed.';
  if (msg === 'room_full') return 'This room is full.';
  return msg;
}

interface Participant {
  id: string;
  name: string;
  isSpeaking: boolean;
  isOnStage: boolean;
}

interface SelectedSong {
  title: string;
  artist: string;
  coverUri?: string;
}

// ── Song Picker Sheet ─────────────────────────────────────────────

interface SongPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (song: SelectedSong) => void;
  userAddress?: string;
}

const SongPickerSheet: React.FC<SongPickerSheetProps> = ({
  open,
  onClose,
  onSelect,
  userAddress,
}) => {
  const [tracks, setTracks] = useState<ScrobbleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open || !userAddress || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    fetchScrobbleEntries(userAddress, 200)
      .then((entries) => {
        // Deduplicate by trackId, keep latest scrobble of each
        const seen = new Set<string>();
        const unique: ScrobbleEntry[] = [];
        for (const e of entries) {
          if (!seen.has(e.trackId)) {
            seen.add(e.trackId);
            unique.push(e);
          }
        }
        setTracks(unique);
      })
      .catch((err) => console.error('[SongPicker] Failed to load:', err))
      .finally(() => setLoading(false));
  }, [open, userAddress]);

  const handleSelect = useCallback(
    (entry: ScrobbleEntry) => {
      onSelect({
        title: entry.title,
        artist: entry.artist,
        coverUri: isValidCid(entry.coverCid) ? coverUrl(entry.coverCid) : undefined,
      });
      onClose();
    },
    [onSelect, onClose],
  );

  const renderTrack = useCallback(
    ({ item }: { item: ScrobbleEntry }) => {
      const cover = isValidCid(item.coverCid) ? coverUrl(item.coverCid) : null;
      return (
        <TouchableOpacity
          style={songStyles.row}
          onPress={() => handleSelect(item)}
          activeOpacity={0.7}
        >
          <View style={songStyles.albumCover}>
            {cover ? (
              <Image source={{ uri: cover }} style={songStyles.albumArtImage} />
            ) : (
              <MusicNote size={20} color={colors.textMuted} />
            )}
          </View>
          <View style={songStyles.info}>
            <Text style={songStyles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={songStyles.artist} numberOfLines={1}>
              {item.artist}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleSelect],
  );

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={songStyles.sheetTitle}>Pick a Song</Text>
      {loading ? (
        <View style={songStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
          <Text style={songStyles.loadingText}>Loading your tracks...</Text>
        </View>
      ) : tracks.length === 0 ? (
        <View style={songStyles.emptyContainer}>
          <MusicNote size={32} color={colors.textMuted} />
          <Text style={songStyles.emptyText}>No tracks found</Text>
          <Text style={songStyles.emptySubtext}>
            Scrobble some music first to add songs to your room.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tracks}
          renderItem={renderTrack}
          keyExtractor={(item) => item.trackId}
          getItemLayout={(_data, index) => ({
            length: 72,
            offset: 72 * index,
            index,
          })}
          style={songStyles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </BottomSheet>
  );
};

const songStyles = StyleSheet.create({
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'center',
  },
  list: {
    maxHeight: 400,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    gap: 12,
  },
  albumCover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  albumArtImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  artist: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginTop: 1,
  },
});

// ── Main Room Screen ──────────────────────────────────────────────

export const RoomScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const {
    pkpInfo: authPkp,
    signMessage: authSignMessage,
    createAuthContext,
    isAuthenticated,
  } = useAuth();
  const [pageError, setPageError] = useState<string | null>(null);
  const [peerUids, setPeerUids] = useState<number[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const authInitRef = useRef(false);
  const [songPickerOpen, setSongPickerOpen] = useState(false);
  const [currentSong, setCurrentSong] = useState<SelectedSong | null>(null);

  const voicePkpInfo: PKPInfo = {
    tokenId: authPkp?.tokenId ?? '',
    publicKey: authPkp?.pubkey ?? '',
    ethAddress: authPkp?.ethAddress ?? '',
  };

  useEffect(() => {
    if (authInitRef.current) return;
    if (!isAuthenticated || !authPkp?.ethAddress) {
      setPageError('You must be logged in to join a room.');
      return;
    }

    authInitRef.current = true;
    console.log('[Room] Creating auth context for PKP:', authPkp.ethAddress);
    createAuthContext()
      .then(() => {
        console.log('[Room] Auth context ready');
        setAuthReady(true);
      })
      .catch((err) => {
        console.error('[Room] Failed to create auth context:', err);
        setPageError(`Auth failed: ${err?.message || 'Unknown error'}`);
      });
  }, [isAuthenticated, authPkp?.ethAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const voice = useFreeRoomVoice({
    pkpInfo: voicePkpInfo,
    signMessage: authSignMessage,
    onPeerJoined: (uid) => {
      setPeerUids((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
    },
    onPeerLeft: (uid) => {
      setPeerUids((prev) => prev.filter((u) => u !== uid));
    },
    onCreditsLow: (remaining) => {
      console.log(`Credits low: ${Math.floor(remaining / 60)}m remaining`);
    },
    onCreditsExhausted: () => {
      console.log('Credits exhausted. Leaving room.');
      voice.leave().finally(() => navigation.goBack());
    },
    onError: (error) => {
      const msg = errorMessage(error);
      setPageError(msg);
      console.error('[Room] Error:', msg);
    },
  });

  useEffect(() => {
    if (!authReady) return;

    const { mode, roomId, visibility = 'open', ai_enabled = false } = route.params;

    if (mode === 'create') {
      const options: CreateRoomOptions = { visibility, ai_enabled };
      voice.createAndJoin(options);
    } else if (mode === 'join' && roomId) {
      voice.join(roomId);
    }
  }, [authReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build participant list
  const participants: Participant[] = [
    {
      id: 'self',
      name: 'You',
      isSpeaking: voice.isSelfSpeaking,
      isOnStage: true,
    },
    ...peerUids.map((uid) => ({
      id: String(uid),
      name: `User ${String(uid).slice(-4)}`,
      isSpeaking: voice.speakingUids.includes(uid),
      isOnStage: false,
    })),
  ];

  const stageParticipants = participants.filter((p) => p.isOnStage);
  const audienceParticipants = participants.filter((p) => !p.isOnStage);

  const handleLeave = async () => {
    await voice.leave();
    setPeerUids([]);
    navigation.goBack();
  };

  // ── Error state ───────────────────────────────────────────────
  if (pageError && voice.state !== 'connected' && voice.state !== 'connecting') {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.centeredContent}>
          <Text style={styles.errorText}>{pageError}</Text>
          <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Connecting / Initializing state ───────────────────────────
  if (voice.state !== 'connected') {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
          <Text style={styles.loadingText}>
            {voice.state === 'connecting' ? 'Connecting...' : 'Initializing...'}
          </Text>
        </View>
      </View>
    );
  }

  // ── Connected state ───────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header — duration left, settings + close right */}
      <View style={styles.header}>
        <Text style={styles.duration}>{formatDuration(voice.duration)}</Text>
        <View style={styles.headerActions}>
          <IconButton variant="soft" size="md" accessibilityLabel="Room settings" onPress={() => {}}>
            <GearSix size={20} color={colors.textSecondary} weight="bold" />
          </IconButton>
          <IconButton variant="soft" size="md" accessibilityLabel="Leave room" onPress={handleLeave}>
            <X size={20} color={colors.textPrimary} weight="bold" />
          </IconButton>
        </View>
      </View>

      {/* Now Playing bar — shown when a song is selected */}
      {currentSong && (
        <View style={styles.nowPlaying}>
          <View style={styles.nowPlayingCover}>
            {currentSong.coverUri ? (
              <Image source={{ uri: currentSong.coverUri }} style={styles.nowPlayingCoverImage} />
            ) : (
              <MusicNote size={20} color={colors.textMuted} />
            )}
          </View>
          <View style={styles.nowPlayingInfo}>
            <Text style={styles.nowPlayingTitle} numberOfLines={1}>
              {currentSong.title}
            </Text>
            <Text style={styles.nowPlayingArtist} numberOfLines={1}>
              {currentSong.artist}
            </Text>
          </View>
        </View>
      )}

      {/* Lyrics area (centered, fills remaining space) */}
      <View style={styles.lyricsArea}>
        <Text style={styles.waitingText}>
          {currentSong ? 'Lyrics not available' : 'Waiting for song...'}
        </Text>
      </View>

      {/* Bottom section — bg-surface, participants + controls */}
      <View style={styles.bottomSection}>
        {/* Participants row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.participantsScroll}
          style={styles.participantsRow}
        >
          {/* Stage participants — larger with purple ring */}
          {stageParticipants.map((p) => (
            <View key={p.id} style={styles.participantItem}>
              <Avatar
                size="lg"
                borderWidth={2}
                borderColor={
                  p.isSpeaking ? colors.accentPurple : 'rgba(203, 166, 247, 0.4)'
                }
              />
              <Text style={styles.participantName} numberOfLines={1}>
                {p.name}
              </Text>
            </View>
          ))}

          {/* Divider between stage and audience */}
          {stageParticipants.length > 0 && audienceParticipants.length > 0 && (
            <View style={styles.participantDivider} />
          )}

          {/* Audience */}
          {audienceParticipants.map((p) => (
            <View key={p.id} style={styles.participantItem}>
              <Avatar size="lg" />
              <Text style={styles.participantName} numberOfLines={1}>
                {p.name}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Controls — song picker + mic (matching Storybook host controls) */}
        <View style={styles.controls}>
          <IconButton
            variant="soft"
            size="xl"
            accessibilityLabel="Pick a song"
            onPress={() => setSongPickerOpen(true)}
          >
            <MusicNote size={24} color={colors.textPrimary} weight="bold" />
          </IconButton>
          <TouchableOpacity
            style={[styles.micButton, voice.isMuted && styles.micButtonMuted]}
            onPress={voice.toggleMute}
          >
            {voice.isMuted ? (
              <MicrophoneSlash size={28} color="#fff" weight="bold" />
            ) : (
              <Microphone size={28} color="#fff" weight="bold" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Song picker sheet */}
      <SongPickerSheet
        open={songPickerOpen}
        onClose={() => setSongPickerOpen(false)}
        onSelect={setCurrentSong}
        userAddress={authPkp?.ethAddress}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 9999,
    backgroundColor: colors.accentBlue,
  },
  errorButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: '#fff',
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  duration: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // ── Now Playing bar ─────────────────────────────────────────
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  nowPlayingCover: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nowPlayingCoverImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  nowPlayingInfo: {
    flex: 1,
    minWidth: 0,
  },
  nowPlayingTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  nowPlayingArtist: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },

  // ── Lyrics area ─────────────────────────────────────────────
  lyricsArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  waitingText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },

  // ── Bottom section ──────────────────────────────────────────
  bottomSection: {
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },

  // ── Participants row ────────────────────────────────────────
  participantsRow: {
    paddingVertical: 12,
  },
  participantsScroll: {
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },
  participantItem: {
    alignItems: 'center',
    gap: 4,
    width: 56,
  },
  participantName: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  participantDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: 4,
  },

  // ── Controls ────────────────────────────────────────────────
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingTop: 4,
    paddingBottom: 20,
    paddingHorizontal: 40,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonMuted: {
    backgroundColor: colors.borderDefault,
  },
});
