import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal, For, Show } from 'solid-js'
import { TrackList, type Track } from './track-list'
import { MiniPlayer } from './mini-player'
import { SidePlayer } from './side-player'
import { StorageCard, type StorageStatus } from './storage-card'
import { AddFundsDialog } from './add-funds-dialog'
import { MobileFooter } from '../../layout/MobileFooter'
import { Sidebar, SidebarSection } from '../../layout/Sidebar'
import { ListItem } from '../shared/list-item'
import { AlbumCover } from './album-cover'
import { IconButton } from '../../primitives/icon-button'
import { Button } from '../../primitives/button'
import { Tabs } from '../../primitives/tabs'
import {
  Home, HomeFill, MagnifyingGlass, MusicNotes, MusicNotesFill,
  ChatCircle, ChatCircleFill, Wallet, MicrophoneIcon, Plus,
} from '../../icons'

// ── Data ─────────────────────────────────────────────────────────────

interface Playlist {
  name: string
  cover: string
  count: number
}

const playlists: Playlist[] = [
  { name: 'Chill Vibes', cover: 'https://images.unsplash.com/photo-1558726339-77239740a81b?w=100&h=100&fit=crop', count: 24 },
  { name: 'Workout Mix', cover: 'https://images.unsplash.com/photo-1609858922253-031e93922b6d?w=100&h=100&fit=crop', count: 18 },
  { name: 'Focus Flow', cover: 'https://images.unsplash.com/photo-1662803370162-72886fde3e33?w=100&h=100&fit=crop', count: 32 },
]

const mockTracks: Track[] = [
  { id: '1', title: 'Midnight Dreams', artist: 'Luna Sky', album: 'Starlight Album', albumCover: 'https://images.unsplash.com/photo-1559258483-af85e116556c?w=100&h=100&fit=crop', dateAdded: '2 days ago' },
  { id: '2', title: 'Electric Hearts', artist: 'Neon Pulse', album: 'Synthwave EP', albumCover: 'https://images.unsplash.com/photo-1761005653991-5e5bde985e97?w=100&h=100&fit=crop', dateAdded: '3 days ago' },
  { id: '3', title: 'Summer Waves', artist: 'Ocean Blue', album: 'Coastal Sounds', albumCover: 'https://images.unsplash.com/photo-1746793868936-77b7a2b431d5?w=100&h=100&fit=crop', dateAdded: '1 week ago' },
  { id: '4', title: 'Golden Hour', artist: 'Sunset Crew', album: 'Daylight Dreams', albumCover: 'https://images.unsplash.com/photo-1752454830565-5007b4656238?w=100&h=100&fit=crop', dateAdded: '1 week ago' },
  { id: '5', title: 'Neon Lights', artist: 'City Vibes', album: 'Urban Nights', albumCover: 'https://images.unsplash.com/photo-1674501695526-da10f852203b?w=100&h=100&fit=crop', dateAdded: '2 weeks ago' },
  { id: '6', title: 'Crystal Clear', artist: 'Aqua Dreams', album: 'Deep Blue', albumCover: 'https://images.unsplash.com/photo-1633503787953-8f04ffa1cf76?w=100&h=100&fit=crop', dateAdded: '2 weeks ago' },
  { id: '7', title: 'Velvet Sky', artist: 'Nova Bloom', album: 'Twilight Garden', albumCover: 'https://images.unsplash.com/photo-1564251104897-2254ad893684?w=100&h=100&fit=crop', dateAdded: '3 weeks ago' },
  { id: '8', title: 'Pulse Drive', artist: 'Hyper Flux', album: 'Circuit Breaker', albumCover: 'https://images.unsplash.com/photo-1504904126298-3fde501c9b31?w=100&h=100&fit=crop', dateAdded: '3 weeks ago' },
]

const cloudTracks: Track[] = [
  { id: 'c1', title: 'Midnight City', artist: 'M83', album: 'Hurry Up', albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop', dateAdded: '2/3/2026' },
  { id: 'c2', title: 'Digital Love', artist: 'Daft Punk', album: 'Discovery', albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop', dateAdded: '1/28/2026' },
]

const sharedTracks: Track[] = [
  { id: 's1', title: 'Breathe', artist: 'Telepopmusik', album: 'Genetic World', albumCover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=100&h=100&fit=crop', dateAdded: '1/25/2026', sharedBy: 'alice.heaven' },
]

interface TrendingItem {
  title: string
  artist: string
  cover: string
}

const trendingItems: TrendingItem[] = [
  { title: 'Midnight Dreams', artist: 'Luna Sky', cover: 'https://images.unsplash.com/photo-1559258483-af85e116556c?w=200&h=200&fit=crop' },
  { title: 'Electric Hearts', artist: 'Neon Pulse', cover: 'https://images.unsplash.com/photo-1761005653991-5e5bde985e97?w=200&h=200&fit=crop' },
  { title: 'Summer Waves', artist: 'Ocean Blue', cover: 'https://images.unsplash.com/photo-1746793868936-77b7a2b431d5?w=200&h=200&fit=crop' },
  { title: 'Golden Hour', artist: 'Sunset Crew', cover: 'https://images.unsplash.com/photo-1650220796580-25c433490c80?w=200&h=200&fit=crop' },
]

const newReleases: TrendingItem[] = [
  { title: 'Electric Bloom', artist: 'Cosmo Ray', cover: 'https://images.unsplash.com/photo-1710664416966-901fa8b99d67?w=200&h=200&fit=crop' },
  { title: 'Pulse Drive', artist: 'Hyper Flux', cover: 'https://images.unsplash.com/photo-1504904126298-3fde501c9b31?w=200&h=200&fit=crop' },
  { title: 'Neon Sunset', artist: 'Dusk Wave', cover: 'https://images.unsplash.com/photo-1651629993462-ffe011a4fd6b?w=200&h=200&fit=crop' },
]

interface ArtistItem {
  name: string
  avatar: string
}

const popularArtists: ArtistItem[] = [
  { name: 'Luna Sky', avatar: 'https://images.unsplash.com/photo-1639502373148-69b234bd1e97?w=100&h=100&fit=crop' },
  { name: 'Neon Pulse', avatar: 'https://images.unsplash.com/photo-1615104603156-3dc403ca7cc8?w=100&h=100&fit=crop' },
  { name: 'Ocean Blue', avatar: 'https://images.unsplash.com/photo-1748723940975-0bafa95448c3?w=100&h=100&fit=crop' },
  { name: 'Sunset Crew', avatar: 'https://images.unsplash.com/photo-1583892963651-ddaeea1fffb8?w=100&h=100&fit=crop' },
]

const healthyStatus: StorageStatus = {
  balance: '$5.00',
  balanceRaw: 5000000000000000000n,
  operatorApproved: true,
  monthlyCost: '$0.12',
  daysRemaining: 1250,
  ready: true,
}

const footerTabs = [
  { id: 'home', icon: <Home class="w-6 h-6" />, activeIcon: <HomeFill class="w-6 h-6" />, label: 'Home' },
  { id: 'search', icon: <MagnifyingGlass class="w-6 h-6" />, label: 'Search' },
  { id: 'library', icon: <MusicNotes class="w-6 h-6" />, activeIcon: <MusicNotesFill class="w-6 h-6" />, label: 'Music' },
  { id: 'messages', icon: <ChatCircle class="w-6 h-6" />, activeIcon: <ChatCircleFill class="w-6 h-6" />, label: 'Chat' },
  { id: 'wallet', icon: <Wallet class="w-6 h-6" />, label: 'Wallet' },
]

const menuActions = {
  onAddToPlaylist: (track: Track) => console.log('Add to playlist:', track),
  onAddToQueue: (track: Track) => console.log('Add to queue:', track),
  onGoToArtist: (track: Track) => console.log('Go to artist:', track),
  onGoToAlbum: (track: Track) => console.log('Go to album:', track),
}

// ── Shared playback hook ─────────────────────────────────────────────

function usePlayback() {
  const [isPlaying, setIsPlaying] = createSignal(true)
  const [progress, setProgress] = createSignal(35)
  const [activeTrackId, setActiveTrackId] = createSignal('2')

  setInterval(() => {
    if (isPlaying()) setProgress((p) => (p >= 100 ? 0 : p + 0.2))
  }, 100)

  const activeTrack = () => mockTracks.find((t) => t.id === activeTrackId())

  const playTrack = (track: Track) => {
    setActiveTrackId(track.id)
    setIsPlaying(true)
    setProgress(0)
  }

  const nextTrack = () => {
    const idx = mockTracks.findIndex((t) => t.id === activeTrackId())
    playTrack(mockTracks[(idx + 1) % mockTracks.length])
  }

  const prevTrack = () => {
    const idx = mockTracks.findIndex((t) => t.id === activeTrackId())
    playTrack(mockTracks[(idx - 1 + mockTracks.length) % mockTracks.length])
  }

  return { isPlaying, setIsPlaying, progress, activeTrackId, activeTrack, playTrack, nextTrack, prevTrack }
}

// ── Section header ───────────────────────────────────────────────────

function SectionHeader(props: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div class="flex items-center justify-between px-5">
      <h2 class="text-lg font-bold text-[var(--text-primary)]">{props.title}</h2>
      <Show when={props.action}>
        <button
          type="button"
          class="text-[13px] font-medium text-[var(--accent-blue)] hover:underline cursor-pointer"
          onClick={props.onAction}
        >
          {props.action}
        </button>
      </Show>
    </div>
  )
}

// ── Horizontal scroll card ───────────────────────────────────────────

function AlbumCard(props: { item: TrendingItem }) {
  return (
    <div class="flex-shrink-0 w-[140px] cursor-pointer group">
      <div class="w-[140px] h-[140px] rounded-lg overflow-hidden bg-[var(--bg-elevated)] mb-2">
        <img src={props.item.cover} alt={props.item.title} class="w-full h-full object-cover" />
      </div>
      <p class="text-[13px] font-semibold text-[var(--text-primary)] truncate">{props.item.title}</p>
      <p class="text-xs text-[var(--text-muted)] truncate">{props.item.artist}</p>
    </div>
  )
}

// ── Artist circle ────────────────────────────────────────────────────

function ArtistCircle(props: { artist: ArtistItem }) {
  return (
    <div class="flex-shrink-0 w-20 flex flex-col items-center gap-2 cursor-pointer">
      <div class="w-[72px] h-[72px] rounded-full overflow-hidden bg-[var(--bg-elevated)]">
        <img src={props.artist.avatar} alt={props.artist.name} class="w-full h-full object-cover" />
      </div>
      <p class="text-xs font-medium text-[var(--text-secondary)] text-center truncate w-full">{props.artist.name}</p>
    </div>
  )
}

// ── Playlist pill card ───────────────────────────────────────────────

function PlaylistPill(props: { playlist: Playlist }) {
  return (
    <div class="flex-shrink-0 flex items-center h-14 bg-[var(--bg-elevated)] rounded-[10px] overflow-hidden cursor-pointer hover:bg-[var(--bg-highlight)]">
      <div class="w-14 h-14 flex-shrink-0">
        <img src={props.playlist.cover} alt={props.playlist.name} class="w-full h-full object-cover" />
      </div>
      <div class="flex flex-col gap-0.5 px-3 min-w-0">
        <span class="text-[13px] font-semibold text-[var(--text-primary)] truncate">{props.playlist.name}</span>
        <span class="text-[11px] text-[var(--text-muted)]">{props.playlist.count} songs</span>
      </div>
    </div>
  )
}

// ── For You tab content ──────────────────────────────────────────────

function ForYouContent(props: { pb: ReturnType<typeof usePlayback> }) {
  return (
    <div class="flex flex-col gap-7">
      {/* Trending on Heaven */}
      <div class="flex flex-col gap-3.5">
        <SectionHeader title="Trending on Heaven" action="See all" />
        <div class="flex gap-3 overflow-x-auto px-5 scrollbar-hide">
          <For each={trendingItems}>{(item) => <AlbumCard item={item} />}</For>
        </div>
      </div>

      {/* New Releases */}
      <div class="flex flex-col gap-3.5">
        <SectionHeader title="New Releases" />
        <div class="flex gap-3 overflow-x-auto px-5 scrollbar-hide">
          <For each={newReleases}>{(item) => <AlbumCard item={item} />}</For>
        </div>
      </div>

      {/* Recently Played */}
      <div class="flex flex-col gap-3.5">
        <SectionHeader title="Recently Played" action="See all" />
        <TrackList
          tracks={mockTracks.slice(0, 4)}
          forceCompact
          activeTrackId={props.pb.activeTrackId()}
          activeTrackPlaying={props.pb.isPlaying()}
          onTrackClick={props.pb.playTrack}
          onTrackPlay={props.pb.playTrack}
          menuActions={menuActions}
        />
      </div>

      {/* Popular Artists */}
      <div class="flex flex-col gap-3.5">
        <SectionHeader title="Popular Artists" action="See all" />
        <div class="flex gap-4 overflow-x-auto px-5 scrollbar-hide">
          <For each={popularArtists}>{(artist) => <ArtistCircle artist={artist} />}</For>
        </div>
      </div>
    </div>
  )
}

// ── Library tab content ──────────────────────────────────────────────

function LibraryContent(props: { pb: ReturnType<typeof usePlayback> }) {
  const [addFundsOpen, setAddFundsOpen] = createSignal(false)

  return (
    <div class="flex flex-col gap-6">
      {/* Storage Card */}
      <div class="px-5">
        <StorageCard
          status={healthyStatus}
          loading={false}
          error={null}
          onAddFunds={() => setAddFundsOpen(true)}
        />
      </div>

      {/* Your Playlists */}
      <div class="flex flex-col gap-3.5">
        <div class="flex items-center justify-between px-5">
          <h2 class="text-lg font-bold text-[var(--text-primary)]">Your Playlists</h2>
          <button
            type="button"
            class="flex items-center gap-1 text-[13px] font-medium text-[var(--accent-blue)] hover:underline cursor-pointer"
            onClick={() => console.log('New playlist')}
          >
            <Plus class="w-4 h-4" />
            New
          </button>
        </div>
        <div class="flex gap-2.5 overflow-x-auto px-5 scrollbar-hide">
          <For each={playlists}>{(pl) => <PlaylistPill playlist={pl} />}</For>
        </div>
      </div>

      {/* Cloud Uploads */}
      <div class="flex flex-col gap-3.5">
        <div class="flex items-center justify-between px-5">
          <h2 class="text-lg font-bold text-[var(--text-primary)]">Cloud Uploads</h2>
          <span class="text-[13px] text-[var(--text-muted)]">{cloudTracks.length} tracks</span>
        </div>
        <TrackList
          tracks={cloudTracks}
          forceCompact
          activeTrackId={props.pb.activeTrackId()}
          activeTrackPlaying={props.pb.isPlaying()}
          onTrackClick={props.pb.playTrack}
          onTrackPlay={props.pb.playTrack}
          menuActions={menuActions}
        />
      </div>

      {/* Shared With You */}
      <div class="flex flex-col gap-3.5">
        <div class="flex items-center justify-between px-5">
          <h2 class="text-lg font-bold text-[var(--text-primary)]">Shared With You</h2>
          <span class="text-[13px] text-[var(--text-muted)]">{sharedTracks.length} tracks</span>
        </div>
        <TrackList
          tracks={sharedTracks}
          forceCompact
          showSharedBy
          activeTrackId={props.pb.activeTrackId()}
          activeTrackPlaying={props.pb.isPlaying()}
          onTrackClick={props.pb.playTrack}
          onTrackPlay={props.pb.playTrack}
          menuActions={menuActions}
        />
      </div>

      <AddFundsDialog
        open={addFundsOpen()}
        onOpenChange={setAddFundsOpen}
        currentBalance="$5.00"
        daysRemaining={1250}
        balanceNum={5}
        loading={false}
        onDeposit={(amount) => { console.log('Deposit:', amount); setAddFundsOpen(false) }}
      />
    </div>
  )
}

// ── Mobile Music Page ────────────────────────────────────────────────

function MobileMusicPage() {
  const pb = usePlayback()
  const [activeTab, setActiveTab] = createSignal('for-you')

  return (
    <div class="h-screen flex flex-col bg-[var(--bg-page)]" style={{ "max-width": "390px", margin: "0 auto" }}>
      {/* Scrollable content */}
      <div class="flex-1 overflow-y-auto min-h-0">
        {/* Header with Open Room button */}
        <div class="flex items-center justify-end px-5 pt-4 pb-1">
          <Button size="sm" onClick={() => console.log('Open Karaoke Room')}>
            <MicrophoneIcon class="w-4 h-4" />
            Open Room
          </Button>
        </div>

        {/* Tabs */}
        <div class="px-5 pb-2">
          <Tabs
            tabs={[
              { id: 'for-you', label: 'For You' },
              { id: 'library', label: 'Library' },
            ]}
            activeTab={activeTab()}
            onTabChange={setActiveTab}
          />
        </div>

        {/* Tab content */}
        <div class="pb-4">
          <Show when={activeTab() === 'for-you'} fallback={<LibraryContent pb={pb} />}>
            <ForYouContent pb={pb} />
          </Show>
        </div>
      </div>

      {/* Mini Player */}
      <MiniPlayer
        title={pb.activeTrack()?.title}
        artist={pb.activeTrack()?.artist}
        coverSrc={pb.activeTrack()?.albumCover}
        progress={pb.progress()}
        isPlaying={pb.isPlaying()}
        onPlayPause={() => pb.setIsPlaying(!pb.isPlaying())}
        onExpand={() => console.log('expand')}
        onNext={pb.nextTrack}
      />

      <MobileFooter
        tabs={footerTabs}
        activeTab="library"
        onTabPress={(id) => console.log('Tab:', id)}
      />
    </div>
  )
}

// ── Desktop Music Page ───────────────────────────────────────────────

const ListMusicIcon = () => (
  <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path d="M21 15V6m0 0-7 2m7-2-3.5 1M3 10h7M3 14h7M3 18h4m5-8v8a3 3 0 1 1-3-3h3Z" />
  </svg>
)


const RadioIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm56-88a56,56,0,1,1-56-56A56.06,56.06,0,0,1,184,128Zm-56-40a40,40,0,1,0,40,40A40,40,0,0,0,128,88Z" />
  </svg>
)

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

function DesktopMusicPage() {
  const pb = usePlayback()
  const [searchQuery, setSearchQuery] = createSignal('')

  const sidebarPlaylists = [
    { name: 'Chill Vibes', color: 'var(--accent-purple)' },
    { name: 'Workout Mix', color: '#f38ba8' },
    { name: 'Focus Flow', color: '#94e2d5' },
    { name: 'Late Night', color: '#fab387' },
    { name: 'Road Trip', color: '#89b4fa' },
    { name: 'Summer Hits', color: '#f5c2e7' },
  ]

  return (
    <div class="h-screen flex flex-col bg-[var(--bg-page)]">
      <div class="flex-1 flex min-h-0">
        {/* Sidebar */}
        <Sidebar>
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-3 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]"
          >
            <span class="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)]"><Home class="w-6 h-6" /></span>
            <span class="text-base font-semibold text-[var(--text-secondary)]">Home</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-3 rounded-md cursor-pointer transition-colors bg-[var(--bg-highlight)]"
          >
            <span class="w-6 h-6 flex items-center justify-center text-[var(--text-primary)]"><MusicNotesFill class="w-6 h-6" /></span>
            <span class="text-base font-semibold text-[var(--text-primary)]">Music</span>
          </button>
          <SidebarSection
            title="Playlists"
            icon={<ListMusicIcon />}
            action={
              <div class="flex items-center gap-1">
                <IconButton variant="soft" size="md" aria-label="New playlist"><PlusIcon /></IconButton>
                <IconButton variant="soft" size="md" aria-label="Options"><ChevronDownIcon /></IconButton>
              </div>
            }
          >
            <For each={sidebarPlaylists}>
              {(pl) => (
                <ListItem
                  title={pl.name}
                  subtitle="Playlist"
                  cover={<div class="w-10 h-10 rounded-md flex-shrink-0" style={{ background: pl.color }} />}
                />
              )}
            </For>
          </SidebarSection>
        </Sidebar>

        {/* Main content */}
        <div class="flex-1 flex flex-col min-w-0">
          <div class="flex items-center justify-between px-8 py-4 border-b border-[var(--border-subtle)]">
            <h1 class="text-2xl font-bold text-[var(--text-primary)]">All Songs</h1>
            <Button size="sm" onClick={() => console.log('Open Room')}>
              <RadioIcon />
              Open Room
            </Button>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div class="px-4 pt-2">
              <Tabs
                tabs={[
                  { id: 'songs', label: 'Songs' },
                  { id: 'artists', label: 'Artists' },
                  { id: 'playlists', label: 'Playlists' },
                ]}
                activeTab="songs"
                onTabChange={() => {}}
              />
              <div class="pt-2">
                <TrackList
                  tracks={mockTracks}
                  showDateAdded
                  activeTrackId={pb.activeTrackId()}
                  activeTrackPlaying={pb.isPlaying()}
                  onTrackClick={pb.playTrack}
                  onTrackPlay={pb.playTrack}
                  menuActions={menuActions}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div class="w-[300px] border-l border-[var(--border-subtle)] flex flex-col overflow-y-auto">
          <SidePlayer
            title={pb.activeTrack()?.title}
            artist={pb.activeTrack()?.artist}
            coverSrc={pb.activeTrack()?.albumCover}
            currentTime="1:24"
            duration={pb.activeTrack()?.duration}
            progress={pb.progress()}
            isPlaying={pb.isPlaying()}
            onPlayPause={() => pb.setIsPlaying(!pb.isPlaying())}
            onPrev={pb.prevTrack}
            onNext={pb.nextTrack}
            onProgressChange={() => {}}
            onArtistClick={() => console.log('Go to artist')}
            menuActions={menuActions}
            track={pb.activeTrack()}
            searchQuery={searchQuery()}
            onSearchChange={setSearchQuery}
            onSearchSubmit={(q) => console.log('Search:', q)}
          />
        </div>
      </div>

      {/* Desktop bottom player bar */}
      <div class="flex items-center gap-4 px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <AlbumCover size="sm" src={pb.activeTrack()?.albumCover} />
        <div class="flex-1 min-w-0">
          <p class="text-base font-semibold text-[var(--text-primary)] truncate">{pb.activeTrack()?.title}</p>
          <p class="text-base text-[var(--text-secondary)] truncate">{pb.activeTrack()?.artist}</p>
        </div>
        <div class="flex-1" />
        <span class="text-base text-[var(--text-muted)]">1:24 / {pb.activeTrack()?.duration}</span>
      </div>
    </div>
  )
}

// ── Responsive Music Page ────────────────────────────────────────────

function ResponsiveMusicPage() {
  const [isMobile, setIsMobile] = createSignal(window.innerWidth < 768)

  window.addEventListener('resize', () => {
    setIsMobile(window.innerWidth < 768)
  })

  return (
    <Show when={isMobile()} fallback={<DesktopMusicPage />}>
      <MobileMusicPage />
    </Show>
  )
}

// ── Story Meta ───────────────────────────────────────────────────────

const meta: Meta = {
  title: 'Music/Music Page',
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: () => <MobileMusicPage />,
}

export const Desktop: Story = {
  render: () => <DesktopMusicPage />,
}

export const Responsive: Story = {
  render: () => <ResponsiveMusicPage />,
}
