import type { Meta, StoryObj } from 'storybook-solidjs'
import { TrackList } from './track-list'
import { MediaHeader } from './media-header'

const meta = {
  title: 'UI/TrackList',
  component: TrackList,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof TrackList>

export default meta
type Story = StoryObj<typeof meta>

const mockTracks = [
  {
    id: '1',
    title: 'The Sign (with CamelPhat)',
    artist: 'Anyma, CamelPhat',
    album: 'Genesys',
    albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop',
    dateAdded: '3 weeks ago',
    duration: '3:33',
  },
  {
    id: '2',
    title: 'Inner Light',
    artist: 'Elderbrook, Bob Moses',
    album: 'Inner Light',
    albumCover: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=100&h=100&fit=crop',
    dateAdded: '3 weeks ago',
    duration: '4:17',
  },
  {
    id: '3',
    title: 'On My Knees',
    artist: 'RÜFÜS DU SOL',
    album: 'Surrender',
    albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop',
    dateAdded: '3 weeks ago',
    duration: '4:21',
  },
  {
    id: '4',
    title: 'Shine On',
    artist: 'Kaskade, Wilkinson, Paige Cavell',
    album: 'Shine On',
    albumCover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=100&h=100&fit=crop',
    dateAdded: '3 weeks ago',
    duration: '3:20',
  },
  {
    id: '5',
    title: 'On My Way',
    artist: 'Kaskade',
    album: 'REDUX 006',
    albumCover: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=100&h=100&fit=crop',
    dateAdded: '3 weeks ago',
    duration: '4:15',
  },
  {
    id: '6',
    title: 'Midnight',
    artist: 'Lane 8',
    album: 'Brightest Lights',
    albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop',
    dateAdded: '2 weeks ago',
    duration: '6:42',
  },
  {
    id: '7',
    title: 'Lose My Mind',
    artist: 'Meduza, Becky Hill, Goodboys',
    album: 'Lose My Mind',
    albumCover: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=100&h=100&fit=crop',
    dateAdded: '2 weeks ago',
    duration: '3:12',
  },
  {
    id: '8',
    title: 'Sun Came Up',
    artist: 'Sofi Tukker, John Summit',
    album: 'Sun Came Up',
    albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop',
    dateAdded: '1 week ago',
    duration: '3:45',
  },
]

export const Default: Story = {
  args: {
    tracks: mockTracks,
    onTrackClick: (track: any) => console.log('Track clicked:', track),
    onTrackPlay: (track: any) => console.log('Track play:', track),
    menuActions: {
      onAddToPlaylist: (track: any) => console.log('Add to playlist:', track),
      onAddToQueue: (track: any) => console.log('Add to queue:', track),
      onGoToArtist: (track: any) => console.log('Go to artist:', track),
      onGoToAlbum: (track: any) => console.log('Go to album:', track),
      onRemoveFromPlaylist: (track: any) => console.log('Remove from playlist:', track),
    },
  },
  decorators: [
    (Story: any) => (
      <div class="min-h-screen bg-[var(--bg-page)]">
        <Story />
      </div>
    ),
  ],
}

export const WithHeader: Story = {
  args: {
    tracks: mockTracks,
    onTrackClick: (track: any) => console.log('Track clicked:', track),
    onTrackPlay: (track: any) => console.log('Track play:', track),
    menuActions: {
      onAddToPlaylist: (track: any) => console.log('Add to playlist:', track),
      onAddToQueue: (track: any) => console.log('Add to queue:', track),
      onGoToArtist: (track: any) => console.log('Go to artist:', track),
      onGoToAlbum: (track: any) => console.log('Go to album:', track),
      onRemoveFromPlaylist: (track: any) => console.log('Remove from playlist:', track),
    },
  },
  decorators: [
    (Story: any) => (
      <div class="min-h-screen bg-gradient-to-b from-[#3a4a5a] via-[#2a3540] to-[var(--bg-page)]">
        <MediaHeader
          type="playlist"
          title="haus"
          creator="asdfadsf"
          stats={{
            songCount: 15,
            duration: '52 min 49 sec',
          }}
          coverImages={[
            'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
            'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=400&fit=crop',
            'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop',
            'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop',
          ]}
          onPlay={() => console.log('Play clicked')}
        />
        <div class="pt-4">
          <Story />
        </div>
      </div>
    ),
  ],
}

export const EmptyPlaylist: Story = {
  args: {
    tracks: [],
  },
  decorators: [
    (Story: any) => (
      <div class="min-h-screen bg-[var(--bg-page)]">
        <Story />
      </div>
    ),
  ],
}

export const LongPlaylist: Story = {
  args: {
    tracks: [
      ...mockTracks,
      ...mockTracks.map((t, i) => ({ ...t, id: `${t.id}-dup-${i}` })),
      ...mockTracks.map((t, i) => ({ ...t, id: `${t.id}-dup2-${i}` })),
    ],
    onTrackClick: (track: any) => console.log('Track clicked:', track),
  },
  decorators: [
    (Story: any) => (
      <div class="min-h-screen bg-[var(--bg-page)]">
        <Story />
      </div>
    ),
  ],
}
