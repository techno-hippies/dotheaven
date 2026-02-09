import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MusicNotes, Play, Pause, SkipForward } from 'phosphor-react-native';
import { colors } from '../lib/theme';
import type { MusicTrack } from '../services/music-scanner';

// Standalone presentational version of MiniPlayer for Storybook
// (the real MiniPlayer depends on PlayerProvider context)
interface MiniPlayerDisplayProps {
  track: MusicTrack | null;
  isPlaying: boolean;
  progressPercent: number;
}

const MiniPlayerDisplay: React.FC<MiniPlayerDisplayProps> = ({ track, isPlaying, progressPercent }) => {
  if (!track) return null;

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>
      <View style={styles.content}>
        <View style={styles.info}>
          <View style={styles.albumArt}>
            <MusicNotes size={20} color={colors.textMuted} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>
          </View>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity style={styles.playButton}>
            {isPlaying ? (
              <Pause size={22} color={colors.textPrimary} weight="fill" />
            ) : (
              <Play size={22} color={colors.textPrimary} weight="fill" />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton}>
            <SkipForward size={20} color={colors.textSecondary} weight="fill" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bgElevated, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  progressBar: { height: 2, backgroundColor: colors.bgPage },
  progressFill: { height: 2, backgroundColor: colors.accentBlue },
  content: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  albumArt: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.bgSurface, alignItems: 'center', justifyContent: 'center' },
  textContainer: { flex: 1, marginLeft: 10 },
  title: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  artist: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgHighlight, alignItems: 'center', justifyContent: 'center' },
  skipButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});

const mockTrack: MusicTrack = {
  id: '1',
  title: 'Midnight City',
  artist: 'M83',
  album: 'Hurry Up, We\'re Dreaming',
  duration: 243,
  uri: '',
  filename: 'midnight-city.mp3',
};

const meta: Meta<typeof MiniPlayerDisplay> = {
  title: 'Components/MiniPlayer',
  component: MiniPlayerDisplay,
  args: {
    track: mockTrack,
    isPlaying: true,
    progressPercent: 49,
  },
};

export default meta;
type Story = StoryObj<typeof MiniPlayerDisplay>;

export const Playing: Story = {};

export const Paused: Story = {
  args: { isPlaying: false, progressPercent: 25 },
};

export const NearEnd: Story = {
  args: { progressPercent: 97 },
};

export const NoTrack: Story = {
  args: { track: null },
};
