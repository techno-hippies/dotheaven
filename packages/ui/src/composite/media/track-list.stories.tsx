import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { TrackList, type SortField, type SortState, type Track } from './track-list'
import { MediaHeader } from './media-header'

const meta = {
  title: 'Composite/TrackList',
  component: TrackList,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof TrackList>

export default meta
type Story = StoryObj<typeof meta>

const mockTracks: Track[] = [
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

// Generate a large dataset for virtual scrolling testing
function generateLargeMockTracks(count: number): Track[] {
  const artists = ['Lane 8', 'RÜFÜS DU SOL', 'Anyma', 'Kaskade', 'Meduza', 'Elderbrook', 'CamelPhat', 'Ben Böhmer', 'Yotto', 'Above & Beyond', 'Odesza', 'Bonobo', 'Four Tet', 'Jon Hopkins']
  const albums = ['Brightest Lights', 'Surrender', 'Genesys', 'REDUX 006', 'Paradise', 'Inner Light', 'Dark Matter', 'Breathing', 'North', 'Common Ground', 'The Last Goodbye', 'Fragments', 'New Energy', 'Immunity']
  const titles = ['Midnight', 'Sunrise', 'Eclipse', 'Horizon', 'Pulse', 'Breathe', 'Atlas', 'Nova', 'Cascade', 'Drift', 'Ember', 'Zenith', 'Prism', 'Aura', 'Solace', 'Radiant', 'Velvet', 'Clarity', 'Stellar', 'Opal']
  const durations = ['3:12', '4:17', '3:33', '5:01', '6:42', '3:45', '4:21', '3:20', '4:15', '5:30', '2:58', '7:12']

  const tracks: Track[] = []
  for (let i = 0; i < count; i++) {
    tracks.push({
      id: `track-${i}`,
      title: `${titles[i % titles.length]}${i >= titles.length ? ` ${Math.floor(i / titles.length) + 1}` : ''}`,
      artist: artists[i % artists.length],
      album: albums[i % albums.length],
      duration: durations[i % durations.length],
      dateAdded: `${(i % 30) + 1} days ago`,
    })
  }
  return tracks
}

const menuActions = {
  onAddToPlaylist: (track: any) => console.log('Add to playlist:', track),
  onAddToQueue: (track: any) => console.log('Add to queue:', track),
  onGoToArtist: (track: any) => console.log('Go to artist:', track),
  onGoToAlbum: (track: any) => console.log('Go to album:', track),
  onRemoveFromPlaylist: (track: any) => console.log('Remove from playlist:', track),
}

export const Default: Story = {
  args: {
    tracks: mockTracks,
    onTrackClick: (track: any) => console.log('Track clicked:', track),
    onTrackPlay: (track: any) => console.log('Track play:', track),
    menuActions,
  },
  decorators: [
    (Story: any) => (
      <div class="h-screen overflow-y-auto bg-[var(--bg-page)]">
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
    menuActions,
  },
  decorators: [
    (Story: any) => (
      <div class="h-screen overflow-y-auto bg-gradient-to-b from-[#3a4a5a] via-[#2a3540] to-[var(--bg-page)]">
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
      <div class="h-screen overflow-y-auto bg-[var(--bg-page)]">
        <Story />
      </div>
    ),
  ],
}

/**
 * Large list (500 tracks) to test virtual scrolling performance.
 * The virtualizer should only render ~20 rows at a time.
 */
export const LargeLibrary: Story = {
  args: {
    tracks: generateLargeMockTracks(500),
    showDateAdded: true,
    onTrackClick: (track: any) => console.log('Track clicked:', track),
    onTrackPlay: (track: any) => console.log('Track play:', track),
    menuActions,
  },
  decorators: [
    (Story: any) => {
      let scrollRef!: HTMLDivElement
      return (
        <div ref={scrollRef} class="h-screen overflow-y-auto bg-[var(--bg-page)]">
          <Story />
        </div>
      )
    },
  ],
}

/**
 * Sortable headers demo — click column headers to sort.
 */
export const Sortable: Story = {
  render: () => {
    const [sort, setSort] = createSignal<SortState | undefined>(undefined)
    const [tracks, setTracks] = createSignal(generateLargeMockTracks(200))

    const handleSort = (field: SortField) => {
      const current = sort()
      let direction: 'asc' | 'desc' = 'asc'
      if (current?.field === field) {
        direction = current.direction === 'asc' ? 'desc' : 'asc'
      }
      setSort({ field, direction })

      const sorted = [...tracks()].sort((a, b) => {
        const aVal = (a[field] ?? '') as string
        const bVal = (b[field] ?? '') as string
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true })
        return direction === 'asc' ? cmp : -cmp
      })
      setTracks(sorted)
    }

    return (
      <div class="h-screen overflow-y-auto bg-[var(--bg-page)]">
        <TrackList
          tracks={tracks()}
          showDateAdded={true}
          sort={sort()}
          onSort={handleSort}
          onTrackClick={(t) => console.log('Click:', t.title)}
          onTrackPlay={(t) => console.log('Play:', t.title)}
          menuActions={menuActions}
        />
      </div>
    )
  },
}
