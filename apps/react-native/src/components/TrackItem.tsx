import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { MusicNote, DotsThree } from 'phosphor-react-native';
import { colors } from '../lib/theme';
import type { MusicTrack } from '../services/music-scanner';

interface TrackItemProps {
  track: MusicTrack;
  isActive: boolean;
  isPlaying: boolean;
  onPress: () => void;
}

export const TrackItem: React.FC<TrackItemProps> = React.memo(({ track, isActive, isPlaying, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.container, isActive && styles.active]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Album cover placeholder */}
      <View style={styles.albumCover}>
        {track.artworkUri ? (
          <Image source={{ uri: track.artworkUri }} style={styles.albumArtImage} />
        ) : (
          <MusicNote
            size={20}
            color={isActive ? colors.accentBlue : colors.textMuted}
            weight={isPlaying ? 'fill' : 'regular'}
          />
        )}
      </View>

      {/* Title + Artist */}
      <View style={styles.info}>
        <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      {/* Menu button */}
      <View style={styles.menuButton}>
        <DotsThree size={20} color={colors.textSecondary} weight="bold" />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 72,
    gap: 12,
  },
  active: {
    backgroundColor: colors.bgHighlight,
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
    width: '100%',
    height: '100%',
    borderRadius: 8,
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
  titleActive: {
    color: colors.accentBlue,
  },
  artist: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 1,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
