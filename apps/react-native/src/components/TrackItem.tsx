import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MusicTrack } from '../services/music-scanner';

interface TrackItemProps {
  track: MusicTrack;
  isActive: boolean;
  isPlaying: boolean;
  onPress: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const TrackItem: React.FC<TrackItemProps> = ({ track, isActive, isPlaying, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.container, isActive && styles.active]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.icon}>
        {isActive && isPlaying ? (
          <Ionicons name="musical-notes" size={18} color="#b8b8d0" />
        ) : (
          <Ionicons name="musical-note-outline" size={18} color="#7878a0" />
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 8,
    marginVertical: 2,
  },
  active: {
    backgroundColor: '#2d2645',
  },
  icon: {
    width: 32,
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 8,
  },
  title: {
    fontSize: 15,
    color: '#f0f0f5',
    fontWeight: '500',
  },
  titleActive: {
    color: '#8fb8e0',
  },
  artist: {
    fontSize: 13,
    color: '#7878a0',
    marginTop: 2,
  },
  duration: {
    fontSize: 13,
    color: '#7878a0',
    marginLeft: 12,
  },
});
