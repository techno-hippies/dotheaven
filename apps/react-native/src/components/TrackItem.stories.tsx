import type { Meta, StoryObj } from '@storybook/react';
import { TrackItem } from './TrackItem';
import type { MusicTrack } from '../services/music-scanner';

const mockTrack: MusicTrack = {
  id: '1',
  title: 'Midnight City',
  artist: 'M83',
  album: 'Hurry Up, We\'re Dreaming',
  duration: 243,
  uri: '',
  filename: 'midnight-city.mp3',
};

const longTrack: MusicTrack = {
  id: '2',
  title: 'A Really Long Track Title That Should Be Truncated Properly',
  artist: 'An Artist With A Very Long Name That Goes On And On',
  album: 'Album',
  duration: 612,
  uri: '',
  filename: 'long.mp3',
};

const meta: Meta<typeof TrackItem> = {
  title: 'Components/TrackItem',
  component: TrackItem,
  args: {
    track: mockTrack,
    isActive: false,
    isPlaying: false,
    onPress: () => console.log('pressed'),
  },
};

export default meta;
type Story = StoryObj<typeof TrackItem>;

export const Default: Story = {};

export const Active: Story = {
  args: { isActive: true },
};

export const ActivePlaying: Story = {
  args: { isActive: true, isPlaying: true },
};

export const LongText: Story = {
  args: { track: longTrack },
};

export const NoDuration: Story = {
  args: {
    track: { ...mockTrack, duration: 0 },
  },
};
