import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { MediaHeader } from './media-header'

const meta = {
  title: 'Composite/MediaHeader',
  component: MediaHeader,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div class="min-h-screen bg-gradient-to-b from-[#3a4a5a] to-[var(--bg-page)] p-0">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MediaHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Playlist: Story = {
  args: {
    type: 'playlist',
    title: 'haus',
    creator: 'asdfadsf',
    stats: {
      songCount: 15,
      duration: '52 min 49 sec',
    },
    coverImages: [
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop',
    ],
    onPlay: () => console.log('Play clicked'),
  },
}

export const Album: Story = {
  args: {
    type: 'album',
    title: 'Midnight Dreams',
    creator: 'The Neon Collective',
    stats: {
      songCount: 12,
      duration: '48 min 23 sec',
    },
    coverSrc: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
    onPlay: () => console.log('Play clicked'),
  },
}

export const LongTitle: Story = {
  args: {
    type: 'playlist',
    title: 'The Ultimate Late Night Coding Session Mix',
    creator: 'CodeMaster3000',
    description: 'Perfect beats for those long coding sessions when the coffee runs out and the bugs keep coming.',
    stats: {
      songCount: 127,
      duration: '8 hr 34 min',
      followers: 12453,
    },
    coverImages: [
      'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=400&fit=crop',
    ],
    onPlay: () => console.log('Play clicked'),
  },
}

export const EmptyPlaylist: Story = {
  args: {
    type: 'playlist',
    title: 'Empty Playlist',
    creator: 'You',
    stats: {
      songCount: 0,
      duration: '0 min',
    },
    onPlay: () => console.log('Play clicked'),
  },
}

export const PartialCovers: Story = {
  args: {
    type: 'playlist',
    title: 'Work in Progress',
    creator: 'DJ Incomplete',
    stats: {
      songCount: 2,
      duration: '8 min 12 sec',
    },
    coverImages: [
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=400&fit=crop',
    ],
    onPlay: () => console.log('Play clicked'),
  },
}
