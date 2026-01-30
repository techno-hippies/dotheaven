import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../providers/PlayerProvider';

export const MiniPlayer: React.FC = () => {
  const { currentTrack, isPlaying, progress, togglePlayPause, skipNext } = usePlayer();

  if (!currentTrack) return null;

  const progressPercent = progress.duration > 0
    ? (progress.position / progress.duration) * 100
    : 0;

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>

      <View style={styles.content}>
        {/* Track info */}
        <View style={styles.info}>
          <View style={styles.albumArt}>
            <Ionicons name="musical-notes" size={20} color="#7878a0" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {currentTrack.artist}
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color="#f0f0f5"
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={skipNext} style={styles.skipButton}>
            <Ionicons name="play-forward" size={20} color="#b8b8d0" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#252139',
    borderTopWidth: 1,
    borderTopColor: '#2d2645',
  },
  progressBar: {
    height: 2,
    backgroundColor: '#1a1625',
  },
  progressFill: {
    height: 2,
    backgroundColor: '#8fb8e0',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  albumArt: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#1f1b2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0f0f5',
  },
  artist: {
    fontSize: 12,
    color: '#b8b8d0',
    marginTop: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2d2645',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
