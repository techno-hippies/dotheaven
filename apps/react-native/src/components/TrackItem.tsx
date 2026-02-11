import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { MusicNote, DotsThree } from 'phosphor-react-native';
import { colors } from '../lib/theme';
import type { MusicTrack } from '../services/music-scanner';

interface TrackItemProps {
  track: MusicTrack;
  isActive: boolean;
  isPlaying: boolean;
  onPress: () => void;
  onMenuPress?: () => void;
}

export const TrackItem: React.FC<TrackItemProps> = React.memo(({ track, isActive, isPlaying, onPress, onMenuPress }) => {
  const [artworkUri, setArtworkUri] = useState<string | undefined>(track.artworkUri);
  const [artworkFailed, setArtworkFailed] = useState(false);

  useEffect(() => {
    setArtworkUri(track.artworkUri);
    setArtworkFailed(false);
  }, [track.id, track.artworkUri, track.artworkFallbackUri]);

  const handleArtworkError = useCallback(() => {
    if (
      artworkUri === track.artworkUri &&
      track.artworkFallbackUri &&
      track.artworkFallbackUri !== artworkUri
    ) {
      setArtworkUri(track.artworkFallbackUri);
      return;
    }
    setArtworkFailed(true);
  }, [artworkUri, track.artworkUri, track.artworkFallbackUri]);

  return (
    <TouchableOpacity
      style={[styles.container, isActive && styles.active]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Album cover placeholder */}
      <View style={styles.albumCover}>
        {artworkUri && !artworkFailed ? (
          <Image
            source={{ uri: artworkUri }}
            style={styles.albumArtImage}
            onError={handleArtworkError}
          />
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
      <TouchableOpacity
        style={styles.menuButton}
        onPress={(e) => {
          e.stopPropagation();
          onMenuPress?.();
        }}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <DotsThree size={20} color={colors.textSecondary} weight="bold" />
      </TouchableOpacity>
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
