import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { MusicPlayer } from './music-player'

const meta: Meta<typeof MusicPlayer> = {
  title: 'UI/MusicPlayer',
  component: MusicPlayer,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof MusicPlayer>

export const Default: Story = {
  args: {
    title: 'Neon Dreams',
    artist: 'Synthwave Collective',
    currentTime: '2:47',
    duration: '4:39',
    progress: 58,
    isPlaying: true,
  },
}

export const Paused: Story = {
  args: {
    title: 'Midnight City',
    artist: 'M83',
    currentTime: '1:23',
    duration: '4:03',
    progress: 34,
    isPlaying: false,
  },
}
