import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { MediaHeader, type MediaHeaderMenuItem } from './media-header'
import { PlayButton } from '../../primitives/play-button'

const meta = {
  title: 'Media/MediaHeader',
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

const menuItems: MediaHeaderMenuItem[] = [
  {
    label: 'Request Access',
    icon: (
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    onSelect: () => console.log('Request Access'),
  },
  {
    label: 'Mint NFT',
    icon: (
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
    onSelect: () => console.log('Mint NFT'),
  },
]

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
    onBack: () => console.log('Back'),
    mobileMenuItems: menuItems,
    onPlay: () => console.log('Play clicked'),
  },
}

export const PlaylistWithActions: Story = {
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
    onBack: () => console.log('Back'),
    mobileMenuItems: menuItems,
    actionsSlot: (
      <div class="flex items-center gap-4">
        <PlayButton onClick={() => console.log('Play')} aria-label="Play" />
      </div>
    ),
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
    onBack: () => console.log('Back'),
    mobileMenuItems: menuItems,
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
    onBack: () => console.log('Back'),
    mobileMenuItems: menuItems,
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
    onBack: () => console.log('Back'),
    mobileMenuItems: menuItems,
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
    onBack: () => console.log('Back'),
    mobileMenuItems: menuItems,
    onPlay: () => console.log('Play clicked'),
  },
}
