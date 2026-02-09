import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MusicNotes, Play, Pause, SkipForward } from 'phosphor-react-native';
import { colors } from '../lib/theme';
import { usePlayer, usePlayerProgress } from '../providers/PlayerProvider';
import { IconButton } from '../ui';

const MiniPlayerProgress: React.FC = () => {
  const progress = usePlayerProgress();
  const progressPercent = progress.duration > 0
    ? (progress.position / progress.duration) * 100
    : 0;

  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
    </View>
  );
};

export const MiniPlayer: React.FC = () => {
  const { currentTrack, isPlaying, togglePlayPause, skipNext } = usePlayer();

  if (!currentTrack) return null;

  return (
    <View style={styles.container}>
      <MiniPlayerProgress />

      <View style={styles.content}>
        {/* Album art placeholder */}
        <View style={styles.albumCover}>
          <MusicNotes size={20} color={colors.textMuted} />
        </View>

        {/* Track info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {currentTrack.artist}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <IconButton
            variant="soft"
            size="xl"
            accessibilityLabel={isPlaying ? 'Pause track' : 'Play track'}
            onPressIn={() => void togglePlayPause()}
            style={styles.controlButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isPlaying ? (
              <Pause size={20} color={colors.textPrimary} weight="fill" />
            ) : (
              <Play size={20} color={colors.textPrimary} weight="fill" />
            )}
          </IconButton>
          <IconButton
            variant="ghost"
            size="xl"
            accessibilityLabel="Skip to next track"
            onPressIn={() => void skipNext()}
            style={styles.controlButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <SkipForward size={18} color={colors.textSecondary} weight="fill" />
          </IconButton>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 64,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  progressTrack: {
    height: 2,
    backgroundColor: colors.bgHighlight,
  },
  progressFill: {
    height: 2,
    backgroundColor: colors.accentBlue,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 12,
  },
  albumCover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  artist: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  controlButton: {
    marginHorizontal: 1,
  },
});
