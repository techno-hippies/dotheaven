import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CaretDown,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  MusicNotes,
  DotsThree,
} from 'phosphor-react-native';
import { colors, fontSize } from '../lib/theme';
import { usePlayer, usePlayerProgress } from '../providers/PlayerProvider';
import { IconButton } from '../ui';
import { TrackMenuDrawer } from '../components/TrackMenuDrawer';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';
import type { MusicTrack } from '../services/music-scanner';

type PlayerScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Player'>;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = Math.min(SCREEN_WIDTH - 80, 400);

const Scrubber: React.FC<{
  position: number;
  duration: number;
  onSeek: (position: number) => void;
}> = ({ position, duration, onSeek }) => {
  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.scrubberContainer}>
      <View style={styles.scrubberTrack}>
        <View style={[styles.scrubberFill, { width: `${progressPercent}%` }]} />
      </View>
      <View style={styles.scrubberTime}>
        <Text style={styles.scrubberTimeText}>{formatTime(position)}</Text>
        <Text style={styles.scrubberTimeText}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
};

export const PlayerScreen: React.FC<PlayerScreenProps> = ({ navigation }) => {
  const { currentTrack, isPlaying, togglePlayPause, skipNext, skipPrevious, seekTo } = usePlayer();
  const progress = usePlayerProgress();
  const [artworkUri, setArtworkUri] = useState<string | undefined>(undefined);
  const [artworkFailed, setArtworkFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!currentTrack) {
      setArtworkUri(undefined);
      setArtworkFailed(false);
      return;
    }
    setArtworkUri(currentTrack.artworkUri);
    setArtworkFailed(false);
  }, [currentTrack?.id, currentTrack?.artworkUri, currentTrack?.artworkFallbackUri]);

  const handleArtworkError = useCallback(() => {
    if (!currentTrack) {
      setArtworkFailed(true);
      return;
    }
    if (
      artworkUri === currentTrack.artworkUri &&
      currentTrack.artworkFallbackUri &&
      currentTrack.artworkFallbackUri !== artworkUri
    ) {
      setArtworkUri(currentTrack.artworkFallbackUri);
      return;
    }
    setArtworkFailed(true);
  }, [artworkUri, currentTrack]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleMenuOpen = useCallback(() => {
    setMenuOpen(true);
  }, []);

  const handleUploadToFilecoin = useCallback((track: MusicTrack) => {
    console.log('[PlayerScreen] Upload to Filecoin:', track);
    Alert.alert('Coming Soon', 'Upload to Filecoin will be available soon!');
  }, []);

  const handleAddToPlaylist = useCallback((track: MusicTrack) => {
    console.log('[PlayerScreen] Add to playlist:', track);
    Alert.alert('Coming Soon', 'Add to playlist will be available soon!');
  }, []);

  const handleAddToQueue = useCallback((track: MusicTrack) => {
    console.log('[PlayerScreen] Add to queue:', track);
    Alert.alert('Coming Soon', 'Add to queue will be available soon!');
  }, []);

  const handleGoToAlbum = useCallback((track: MusicTrack) => {
    console.log('[PlayerScreen] Go to album:', track);
    // TODO: Navigate to album page
  }, []);

  const handleGoToArtist = useCallback((track: MusicTrack) => {
    if (track.artist) {
      navigation.navigate('Artist', { artistName: track.artist });
    }
  }, [navigation]);

  if (!currentTrack) {
    // No track playing — dismiss screen
    useEffect(() => {
      handleBack();
    }, [handleBack]);
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        {/* Header with close button and menu */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            activeOpacity={0.7}
            style={styles.closeButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <CaretDown size={28} color={colors.textPrimary} weight="bold" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleMenuOpen}
            activeOpacity={0.7}
            style={styles.menuButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <DotsThree size={28} color={colors.textPrimary} weight="bold" />
          </TouchableOpacity>
        </View>

        {/* Album cover */}
        <View style={styles.coverContainer}>
          <View style={[styles.albumCover, { width: COVER_SIZE, height: COVER_SIZE }]}>
            {artworkUri && !artworkFailed ? (
              <Image
                source={{ uri: artworkUri }}
                style={styles.albumCoverImage}
                onError={handleArtworkError}
              />
            ) : (
              <MusicNotes size={80} color={colors.textMuted} />
            )}
          </View>
        </View>

        {/* Track info */}
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={2}>
            {currentTrack.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {currentTrack.artist}
          </Text>
          {currentTrack.album && (
            <Text style={styles.trackAlbum} numberOfLines={1}>
              {currentTrack.album}
            </Text>
          )}
        </View>

        {/* Scrubber */}
        <Scrubber position={progress.position} duration={progress.duration} onSeek={seekTo} />

        {/* Controls */}
        <View style={styles.controls}>
          <IconButton
            variant="soft"
            size="lg"
            accessibilityLabel="Previous track"
            onPressIn={() => void skipPrevious()}
          >
            <SkipBack size={28} color={colors.textPrimary} weight="fill" />
          </IconButton>

          <TouchableOpacity
            style={styles.playButton}
            onPress={() => void togglePlayPause()}
            activeOpacity={0.8}
          >
            {isPlaying ? (
              <Pause size={40} color={colors.bgPage} weight="fill" />
            ) : (
              <Play size={40} color={colors.bgPage} weight="fill" />
            )}
          </TouchableOpacity>

          <IconButton
            variant="soft"
            size="lg"
            accessibilityLabel="Next track"
            onPressIn={() => void skipNext()}
          >
            <SkipForward size={28} color={colors.textPrimary} weight="fill" />
          </IconButton>
        </View>
      </View>

      {/* Track Menu Drawer */}
      <TrackMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        track={currentTrack}
        onUploadToFilecoin={handleUploadToFilecoin}
        onAddToPlaylist={handleAddToPlaylist}
        onAddToQueue={handleAddToQueue}
        onGoToAlbum={handleGoToAlbum}
        onGoToArtist={handleGoToArtist}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  coverContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  albumCover: {
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  albumCoverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  trackInfo: {
    marginBottom: 32,
    alignItems: 'center',
  },
  trackTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  trackArtist: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  trackAlbum: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'center',
  },
  scrubberContainer: {
    marginBottom: 32,
  },
  scrubberTrack: {
    height: 4,
    backgroundColor: colors.bgHighlight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  scrubberFill: {
    height: 4,
    backgroundColor: colors.accentBlue,
  },
  scrubberTime: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  scrubberTimeText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
