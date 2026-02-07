import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal, For, Show } from 'solid-js'
import { TrackList, type Track } from './track-list'
import { MiniPlayer } from './mini-player'
import { SidePlayer } from './side-player'
import { MobileFooter } from '../../layout/MobileFooter'
import { Sidebar, SidebarSection } from '../../layout/Sidebar'
import { ListItem } from '../shared/list-item'
import { MediaRow } from '../shared/media-row'
import { AlbumCover } from './album-cover'
import { IconButton } from '../../primitives/icon-button'
import { Button } from '../../primitives/button'
import { Tabs } from '../../primitives/tabs'

// --- Icons ---

const ListMusicIcon = () => (
  <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path d="M21 15V6m0 0-7 2m7-2-3.5 1M3 10h7M3 14h7M3 18h4m5-8v8a3 3 0 1 1-3-3h3Z" />
  </svg>
)

const HomeIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
  </svg>
)

const MusicNotesIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)

const ChatCircleIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)

const RadioIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm56-88a56,56,0,1,1-56-56A56.06,56.06,0,0,1,184,128Zm-56-40a40,40,0,1,0,40,40A40,40,0,0,0,128,88Z" />
  </svg>
)

const SearchIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
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

// --- Data ---

const SearchIcon2 = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
  </svg>
)

const CalendarIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
  </svg>
)

const footerTabs = [
  { id: 'home', icon: <HomeIcon />, label: 'Home' },
  { id: 'search', icon: <SearchIcon2 />, label: 'Search' },
  { id: 'library', icon: <MusicNotesIcon />, label: 'Music' },
  { id: 'messages', icon: <ChatCircleIcon />, label: 'Chat' },
  { id: 'schedule', icon: <CalendarIcon />, label: 'Schedule' },
  { id: 'wallet', icon: <WalletIcon />, label: 'Wallet' },
]

interface Playlist {
  name: string
  color: string
}

const playlists: Playlist[] = [
  { name: 'Chill Vibes', color: 'var(--accent-purple)' },
  { name: 'Workout Mix', color: '#f38ba8' },
  { name: 'Focus Flow', color: '#94e2d5' },
  { name: 'Late Night', color: '#fab387' },
  { name: 'Road Trip', color: '#89b4fa' },
  { name: 'Summer Hits', color: '#f5c2e7' },
]

const mockTracks: Track[] = [
  { id: '1', title: 'Midnight Dreams', artist: 'Luna Sky', album: 'Starlight Album', albumCover: 'https://picsum.photos/seed/cover1/96/96', dateAdded: '2 days ago' },
  { id: '2', title: 'Electric Hearts', artist: 'Neon Pulse', album: 'Synthwave EP', albumCover: 'https://picsum.photos/seed/cover2/96/96', dateAdded: '3 days ago' },
  { id: '3', title: 'Summer Waves', artist: 'Ocean Blue', album: 'Coastal Sounds', albumCover: 'https://picsum.photos/seed/cover3/96/96', dateAdded: '1 week ago' },
  { id: '4', title: 'Golden Hour', artist: 'Sunset Crew', album: 'Daylight Dreams', albumCover: 'https://picsum.photos/seed/cover4/96/96', dateAdded: '1 week ago' },
  { id: '5', title: 'Neon Lights', artist: 'City Vibes', album: 'Urban Nights', albumCover: 'https://picsum.photos/seed/cover5/96/96', dateAdded: '2 weeks ago' },
  { id: '6', title: 'Crystal Clear', artist: 'Aqua Dreams', album: 'Deep Blue', albumCover: 'https://picsum.photos/seed/cover6/96/96', dateAdded: '2 weeks ago' },
  { id: '7', title: 'Velvet Sky', artist: 'Nova Bloom', album: 'Twilight Garden', albumCover: 'https://picsum.photos/seed/cover7/96/96', dateAdded: '3 weeks ago' },
  { id: '8', title: 'Pulse Drive', artist: 'Hyper Flux', album: 'Circuit Breaker', albumCover: 'https://picsum.photos/seed/cover8/96/96', dateAdded: '3 weeks ago' },
  { id: '9', title: 'Starfall', artist: 'Cosmo Ray', album: 'Nebula Sessions', albumCover: 'https://picsum.photos/seed/cover9/96/96', dateAdded: '1 month ago' },
  { id: '10', title: 'Horizon Line', artist: 'Dusk & Dawn', album: 'Twilight EP', albumCover: 'https://picsum.photos/seed/cover10/96/96', dateAdded: '1 month ago' },
]

const menuActions = {
  onAddToPlaylist: (track: Track) => console.log('Add to playlist:', track),
  onAddToQueue: (track: Track) => console.log('Add to queue:', track),
  onGoToArtist: (track: Track) => console.log('Go to artist:', track),
  onGoToAlbum: (track: Track) => console.log('Go to album:', track),
}

// --- Shared playback state hook ---

function usePlayback() {
  const [isPlaying, setIsPlaying] = createSignal(true)
  const [progress, setProgress] = createSignal(35)
  const [activeTrackId, setActiveTrackId] = createSignal('2')

  setInterval(() => {
    if (isPlaying()) {
      setProgress((p) => (p >= 100 ? 0 : p + 0.2))
    }
  }, 100)

  const activeTrack = () => mockTracks.find((t) => t.id === activeTrackId())

  const playTrack = (track: Track) => {
    setActiveTrackId(track.id)
    setIsPlaying(true)
    setProgress(0)
  }

  const nextTrack = () => {
    const idx = mockTracks.findIndex((t) => t.id === activeTrackId())
    const next = mockTracks[(idx + 1) % mockTracks.length]
    playTrack(next)
  }

  const prevTrack = () => {
    const idx = mockTracks.findIndex((t) => t.id === activeTrackId())
    const prev = mockTracks[(idx - 1 + mockTracks.length) % mockTracks.length]
    playTrack(prev)
  }

  return { isPlaying, setIsPlaying, progress, activeTrackId, activeTrack, playTrack, nextTrack, prevTrack }
}

// --- Playlist Card ---

function PlaylistCard(props: { playlist: Playlist }) {
  return (
    <MediaRow
      title={props.playlist.name}
      cover={<div class="w-12 h-12 rounded-md flex-shrink-0" style={{ background: props.playlist.color }} />}
      onClick={() => console.log('Playlist:', props.playlist.name)}
      class="bg-[var(--bg-highlight)] h-12 px-0 py-0 flex-1 min-w-0 overflow-hidden"
    />
  )
}

// --- Tabs + Song List ---

function TabsAndSongs(props: {
  forceCompact?: boolean
  activeTrackId: string
  isPlaying: boolean
  onTrackClick: (track: Track) => void
  onTrackPlay: (track: Track) => void
}) {
  const [activeTab, setActiveTab] = createSignal('songs')

  const tabs = [
    { id: 'songs', label: 'Songs' },
    { id: 'artists', label: 'Artists' },
    { id: 'playlists', label: 'Playlists' },
  ]

  return (
    <>
      <Tabs tabs={tabs} activeTab={activeTab()} onTabChange={setActiveTab} />

      <div class="pt-2">
        <TrackList
          tracks={mockTracks}
          forceCompact={props.forceCompact}
          showDateAdded={!props.forceCompact}
          activeTrackId={props.activeTrackId}
          activeTrackPlaying={props.isPlaying}
          onTrackClick={props.onTrackClick}
          onTrackPlay={props.onTrackPlay}
          menuActions={menuActions}
        />
      </div>
    </>
  )
}

// --- Mobile Music Page ---

function MobileMusicPage() {
  const pb = usePlayback()

  return (
    <div class="h-screen flex flex-col bg-[var(--bg-page)]" style={{ "max-width": "430px", margin: "0 auto" }}>
      {/* Scrollable content */}
      <div class="flex-1 overflow-y-auto min-h-0">
        {/* Header */}
        <div class="flex items-center justify-between px-5 pt-4 pb-3">
          <h1 class="text-[28px] font-bold text-[var(--text-primary)]" style={{ "font-family": "'Plus Jakarta Sans', sans-serif" }}>
            Music
          </h1>
          <Button size="sm" onClick={() => console.log('Open Room')}>
            <RadioIcon />
            Open Room
          </Button>
        </div>

        {/* Your Playlists */}
        <div class="px-5 pt-2 pb-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-[var(--accent-purple)]"><ListMusicIcon /></span>
            <span class="text-base font-bold text-[var(--text-primary)]" style={{ "font-family": "'Plus Jakarta Sans', sans-serif" }}>
              Your Playlists
            </span>
          </div>

          <div class="flex flex-col gap-2.5">
            <For each={[0, 1, 2]}>
              {(rowIdx) => (
                <div class="flex gap-2.5">
                  <PlaylistCard playlist={playlists[rowIdx * 2]} />
                  <PlaylistCard playlist={playlists[rowIdx * 2 + 1]} />
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Tabs + Songs */}
        <TabsAndSongs
          forceCompact
          activeTrackId={pb.activeTrackId()}
          isPlaying={pb.isPlaying()}
          onTrackClick={pb.playTrack}
          onTrackPlay={pb.playTrack}
        />
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

// --- Desktop Music Page ---

function DesktopMusicPage() {
  const pb = usePlayback()

  return (
    <div class="h-screen flex flex-col bg-[var(--bg-page)]">
      {/* Main layout: sidebar + content + right panel */}
      <div class="flex-1 flex min-h-0">
        {/* Sidebar */}
        <Sidebar>
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-3 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]"
          >
            <span class="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)]"><HomeIcon /></span>
            <span class="text-base font-semibold text-[var(--text-secondary)]">Home</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-3 rounded-md cursor-pointer transition-colors bg-[var(--bg-highlight)]"
          >
            <span class="w-6 h-6 flex items-center justify-center text-[var(--text-primary)]"><MusicNotesIcon /></span>
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
            <For each={playlists}>
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
          {/* Header bar */}
          <div class="flex items-center justify-between px-8 py-4 border-b border-[var(--bg-highlight)]">
            <h1 class="text-2xl font-bold text-[var(--text-primary)]" style={{ "font-family": "'Plus Jakarta Sans', sans-serif" }}>
              All Songs
            </h1>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--bg-highlight)] text-[var(--text-secondary)]">
                <SearchIcon />
                <span class="text-base">Search songs, artists, albums...</span>
              </div>
              <Button size="sm" onClick={() => console.log('Open Room')}>
                <RadioIcon />
                Open Room
              </Button>
            </div>
          </div>

          {/* Scrollable song area */}
          <div class="flex-1 overflow-y-auto">
            <div class="px-4 pt-2">
              <TabsAndSongs
                activeTrackId={pb.activeTrackId()}
                isPlaying={pb.isPlaying()}
                onTrackClick={pb.playTrack}
                onTrackPlay={pb.playTrack}
              />
            </div>
          </div>
        </div>

        {/* Right panel — side player */}
        <div class="w-[300px] border-l border-[var(--bg-highlight)] flex flex-col overflow-y-auto">
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
          />
        </div>
      </div>

      {/* Desktop bottom player bar */}
      <div class="flex items-center gap-4 px-6 py-3 border-t border-[var(--bg-highlight)] bg-[var(--bg-surface)]">
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

// --- Responsive Music Page (auto-switches) ---

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

// --- Story Meta ---

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
