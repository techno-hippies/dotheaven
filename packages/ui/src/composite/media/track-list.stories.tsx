import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { TrackList, type SortField, type SortState, type Track } from './track-list'
import { MediaHeader, type MediaHeaderMenuItem } from './media-header'
import { PlayButton } from '../../primitives/play-button'
import { Button } from '../../primitives/button'
import { LockSimple, Sparkle } from '../../icons'

const meta = {
  title: 'Media/TrackList',
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

// Mix of local and cloud tracks to demonstrate the cloud icon
const mixedTracks: Track[] = [
  {
    id: 'l1',
    title: 'The Sign (with CamelPhat)',
    artist: 'Anyma, CamelPhat',
    album: 'Genesys',
    albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop',
    duration: '3:33',
    filePath: '/music/the-sign.mp3',
  },
  {
    id: 'c1',
    title: 'Inner Light',
    artist: 'Elderbrook, Bob Moses',
    album: 'Inner Light',
    albumCover: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=100&h=100&fit=crop',
    duration: '4:17',
    pieceCid: 'baga6ea4seaqao7s73y24kcutaosvacpdjgfe5pw76ooefynber4k2cljibs3ejq',
    contentId: '0x1234',
  },
  {
    id: 'l2',
    title: 'On My Knees',
    artist: 'RÜFÜS DU SOL',
    album: 'Surrender',
    albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop',
    duration: '4:21',
    filePath: '/music/on-my-knees.mp3',
  },
  {
    id: 'c2',
    title: 'Midnight',
    artist: 'Lane 8',
    album: 'Brightest Lights',
    albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop',
    duration: '6:42',
    pieceCid: 'baga6ea4seaqxyz',
    contentId: '0x5678',
  },
  {
    id: 'c3',
    title: 'Lose My Mind',
    artist: 'Meduza, Becky Hill, Goodboys',
    album: 'Lose My Mind',
    albumCover: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=100&h=100&fit=crop',
    duration: '3:12',
    pieceCid: 'baga6ea4seaqabc',
    contentId: '0x9abc',
  },
  {
    id: 'l3',
    title: 'Sun Came Up',
    artist: 'Sofi Tukker, John Summit',
    album: 'Sun Came Up',
    albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop',
    duration: '3:45',
    filePath: '/music/sun-came-up.mp3',
  },
]

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

const headerMenuItems: MediaHeaderMenuItem[] = [
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
          onBack={() => console.log('Back')}
          mobileMenuItems={headerMenuItems}
          actionsSlot={
            <div class="flex items-center gap-4">
              <PlayButton onClick={() => console.log('Play')} aria-label="Play" />
            </div>
          }
        />
        <Story />
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
 * "Shared with Me" page — MediaHeader + tracks shared by other users.
 * Artist line shows "Artist • from 0xABC...1234" like the real page.
 */
const sharedTracks: Track[] = [
  {
    id: 's1',
    title: 'Midnight City',
    artist: 'M83',
    album: 'Hurry Up, We\'re Dreaming',
    albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop',
    dateAdded: '1/28/2026',
    duration: '4:03',
    sharedBy: 'technohippies.heaven',
  },
  {
    id: 's2',
    title: 'Innerbloom',
    artist: 'R\u00dcF\u00dcS DU SOL',
    album: 'Bloom',
    albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop',
    dateAdded: '1/25/2026',
    duration: '9:39',
    sharedBy: 'alice.heaven',
  },
  {
    id: 's3',
    title: 'Opus',
    artist: 'Eric Prydz',
    album: 'Opus',
    dateAdded: '1/20/2026',
    duration: '9:26',
    sharedBy: 'technohippies.heaven',
  },
  {
    id: 's4',
    title: 'Strobe',
    artist: 'deadmau5',
    album: 'For Lack of a Better Name',
    albumCover: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=100&h=100&fit=crop',
    dateAdded: '1/15/2026',
    duration: '10:37',
    sharedBy: 'bob.heaven',
  },
  {
    id: 's5',
    title: 'Sunset Lover',
    artist: 'Petit Biscuit',
    album: 'Presence',
    albumCover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=100&h=100&fit=crop',
    dateAdded: '1/10/2026',
    duration: '3:29',
    sharedBy: 'alice.heaven',
  },
  {
    id: 's6',
    title: 'Cola',
    artist: 'CamelPhat, Elderbrook',
    album: 'Cola',
    albumCover: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=100&h=100&fit=crop',
    dateAdded: '1/5/2026',
    duration: '5:31',
    sharedBy: 'technohippies.heaven',
  },
]

export const SharedWithMe: Story = {
  args: {
    tracks: sharedTracks,
    showAlbum: false,
    showSharedBy: true,
    showDateAdded: true,
    onTrackClick: (track: any) => console.log('Track clicked:', track),
    onTrackPlay: (track: any) => console.log('Track play:', track),
    menuActions,
  },
  decorators: [
    (Story: any) => (
      <div class="h-screen overflow-y-auto bg-[var(--bg-page)]">
        <MediaHeader
          type="playlist"
          title="Shared with Me"
          creator={`${sharedTracks.length} tracks`}
          onBack={() => console.log('Back')}
          mobileMenuItems={headerMenuItems}
          actionsSlot={
            <div class="flex items-center gap-3">
              <Button
                variant="outline"
                icon={<LockSimple />}
                onClick={() => console.log('Request Access')}
              >
                Request Access
              </Button>
              <Button
                variant="outline"
                icon={<Sparkle />}
                onClick={() => console.log('Mint NFT')}
              >
                Mint NFT
              </Button>
            </div>
          }
        />
        <Story />
      </div>
    ),
  ],
}

/**
 * Mix of local and cloud tracks — cloud tracks show a cloud icon next to the title.
 */
export const MixedSources: Story = {
  args: {
    tracks: mixedTracks,
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
