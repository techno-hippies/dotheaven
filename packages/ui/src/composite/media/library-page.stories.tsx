import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { TrackList, type Track, type SortField, type SortState } from './track-list'
import { MiniPlayer } from './mini-player'
import { SidePlayer } from './side-player'
import { MobileFooter } from '../../layout/MobileFooter'
import { AppShell } from '../../layout/AppShell'
import { RightPanel } from '../../layout/RightPanel'
import { Sidebar } from '../../layout/Sidebar'
import { AlbumCover } from './album-cover'
import { Button } from '../../primitives/button'
import { IconButton } from '../../primitives/icon-button'
import { AddFundsDialog } from './add-funds-dialog'
import { PageHeader } from '../shared/page-header'
import { PageHero } from '../shared/page-hero'
import { FilterSortBar } from '../shared/filter-sort-bar'
import {
  Home, HomeFill, UsersThree, UsersThreeFill, Compass,
  MusicNotes, MusicNotesFill,
  ChatCircle, ChatCircleFill, Wallet, CalendarBlank,
  CloudFill, User, Gear, Download, Plus, ShareNetwork,
  ChevronLeft,
} from '../../icons'

// ── Data ─────────────────────────────────────────────────────────────

const allTracks: Track[] = [
  { id: '1', title: 'Summer Waves', artist: 'Ocean Blue', album: 'Tidal Album', albumCover: 'https://images.unsplash.com/photo-1746793868936-77b7a2b431d5?w=100&h=100&fit=crop', duration: '3:42', filePath: '/music/summer.mp3' },
  { id: '2', title: 'Golden Hour', artist: 'Sunset Crew', album: 'Daybreak EP', albumCover: 'https://images.unsplash.com/photo-1752454830565-5007b4656238?w=100&h=100&fit=crop', duration: '4:15', filePath: '/music/golden.mp3' },
  { id: '3', title: 'Crystal Clear', artist: 'Maya Aquaris', album: 'Prisma', albumCover: 'https://images.unsplash.com/photo-1633503787953-8f04ffa1cf76?w=100&h=100&fit=crop', duration: '3:58', pieceCid: 'baga...' },
  { id: '4', title: 'Velvet Sky', artist: 'Nova Bloom', album: 'Stardust', albumCover: 'https://images.unsplash.com/photo-1564251104897-2254ad893684?w=100&h=100&fit=crop', duration: '5:10', filePath: '/music/velvet.mp3' },
  { id: '5', title: 'Electric Feel', artist: 'MGMT', album: 'Oracular Spectacular', albumCover: 'https://images.unsplash.com/photo-1674501695526-da10f852203b?w=100&h=100&fit=crop', duration: '3:49', pieceCid: 'baga...' },
  { id: '6', title: 'Midnight City', artist: 'M83', album: "Hurry Up, We're Dreaming", albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop', duration: '4:03', filePath: '/music/midnight.mp3' },
  { id: '7', title: 'Pulse Drive', artist: 'Hyper Flux', album: 'Circuit Breaker', albumCover: 'https://images.unsplash.com/photo-1504904126298-3fde501c9b31?w=100&h=100&fit=crop', duration: '6:22', pieceCid: 'baga...' },
  { id: '8', title: 'Digital Love', artist: 'Daft Punk', album: 'Discovery', albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop', duration: '4:58', filePath: '/music/digital.mp3' },
]

const menuActions = {
  onAddToPlaylist: (track: Track) => console.log('Add to playlist:', track),
  onAddToQueue: (track: Track) => console.log('Add to queue:', track),
  onGoToArtist: (track: Track) => console.log('Go to artist:', track),
  onGoToAlbum: (track: Track) => console.log('Go to album:', track),
  onDownload: (track: Track) => console.log('Download:', track),
}

// ── Filter / Sort types ──────────────────────────────────────────────

type LibraryFilter = 'all' | 'local' | 'cloud'
type LibrarySortField = 'recent' | 'title' | 'artist' | 'album'

const filterLabels: Record<LibraryFilter, string> = { all: 'All', local: 'On device', cloud: 'Cloud' }
const sortLabels: Record<LibrarySortField, string> = { recent: 'Recent', title: 'Title', artist: 'Artist', album: 'Album' }

// ── Playback hook ────────────────────────────────────────────────────

function usePlayback() {
  const [isPlaying, setIsPlaying] = createSignal(true)
  const [progress, setProgress] = createSignal(35)
  const [activeTrackId, setActiveTrackId] = createSignal('2')

  setInterval(() => {
    if (isPlaying()) setProgress((p) => (p >= 100 ? 0 : p + 0.2))
  }, 100)

  const activeTrack = () => allTracks.find((t) => t.id === activeTrackId())

  const playTrack = (track: Track) => {
    setActiveTrackId(track.id)
    setIsPlaying(true)
    setProgress(0)
  }

  const nextTrack = () => {
    const idx = allTracks.findIndex((t) => t.id === activeTrackId())
    playTrack(allTracks[(idx + 1) % allTracks.length])
  }

  const prevTrack = () => {
    const idx = allTracks.findIndex((t) => t.id === activeTrackId())
    playTrack(allTracks[(idx - 1 + allTracks.length) % allTracks.length])
  }

  return { isPlaying, setIsPlaying, progress, activeTrackId, activeTrack, playTrack, nextTrack, prevTrack }
}

// ── Library content (shared between Mobile & Desktop) ────────────────

function LibraryContent(props: {
  pb: ReturnType<typeof usePlayback>
  forceCompact?: boolean
  artistBelowTitle?: boolean
  showRowNumbers?: boolean
}) {
  return (
    <TrackList
      tracks={allTracks}
      forceCompact={props.forceCompact}
      artistBelowTitle={props.artistBelowTitle}
      showRowNumbers={props.showRowNumbers}
      activeTrackId={props.pb.activeTrackId()}
      activeTrackPlaying={props.pb.isPlaying()}
      onTrackClick={props.pb.playTrack}
      onTrackPlay={props.pb.playTrack}
      menuActions={menuActions}
    />
  )
}

// ── Standard sidebar (matches AppShell.stories.tsx pattern) ──────────

const NavItem = (props: { icon: () => any; label: string; active: boolean; badge?: number }) => (
  <button
    type="button"
    class={`flex items-center gap-3 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] w-full px-3 py-3 ${props.active ? 'bg-[var(--bg-highlight)]' : ''}`}
  >
    <span class="relative w-6 h-6 flex-shrink-0 flex items-center justify-center text-[var(--text-secondary)]">
      <props.icon />
      {props.badge && props.badge > 0 && (
        <span class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1">
          {props.badge > 99 ? '99+' : props.badge}
        </span>
      )}
    </span>
    <span class="text-base font-semibold text-[var(--text-secondary)] whitespace-nowrap">{props.label}</span>
  </button>
)

function LibrarySidebar() {
  return (
    <Sidebar>
      <div class="py-4 mb-2 px-3">
        <div class="w-9 h-9 rounded-full bg-gradient-to-br from-[oklch(0.65_0.12_240)] to-[oklch(0.60_0.15_290)] flex items-center justify-center text-white text-base font-bold">
          H
        </div>
      </div>

      <nav class="flex flex-col gap-1">
        <NavItem icon={() => <Home class="w-6 h-6" />} label="Home" active={false} />
        <NavItem icon={() => <UsersThree class="w-6 h-6" />} label="Community" active={false} />
        <NavItem icon={() => <ChatCircle class="w-6 h-6" />} label="Messages" active={false} badge={2} />
        <NavItem icon={() => <Wallet class="w-6 h-6" />} label="Wallet" active={false} />
        <NavItem icon={() => <CalendarBlank class="w-6 h-6" />} label="Schedule" active={false} />
        <NavItem icon={() => <User class="w-6 h-6" />} label="Profile" active={false} />
      </nav>

      <div class="mt-6 -mx-3 px-3 border-t border-[var(--border-subtle)] pt-4">
        <div class="flex items-center justify-between px-3 mb-2 min-h-10">
          <span class="text-base text-[var(--text-muted)] font-medium whitespace-nowrap">Music</span>
          <IconButton variant="soft" size="md" aria-label="Create">
            <Plus class="w-5 h-5" />
          </IconButton>
        </div>

        <div class="flex flex-col gap-0.5">
          <button type="button" class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]">
            <div class="w-10 h-10 flex-shrink-0 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
              <Compass class="w-5 h-5" />
            </div>
            <div class="flex flex-col min-w-0 text-left">
              <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Discover</span>
            </div>
          </button>
          <button type="button" class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors bg-[var(--bg-highlight)]">
            <div class="w-10 h-10 flex-shrink-0 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
              <MusicNotes class="w-5 h-5" />
            </div>
            <div class="flex flex-col min-w-0 text-left">
              <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Library</span>
            </div>
          </button>
          <button type="button" class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]">
            <div class="w-10 h-10 flex-shrink-0 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
              <ShareNetwork class="w-5 h-5" />
            </div>
            <div class="flex flex-col min-w-0 text-left">
              <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Shared With Me</span>
              <span class="text-base text-[var(--text-muted)] whitespace-nowrap">0 songs</span>
            </div>
          </button>
          <button type="button" class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]">
            <AlbumCover size="sm" icon="playlist" class="flex-shrink-0" />
            <div class="flex flex-col min-w-0 text-left">
              <span class="text-base text-[var(--text-primary)] truncate whitespace-nowrap">Chill Vibes</span>
              <span class="text-base text-[var(--text-muted)] whitespace-nowrap">12 songs</span>
            </div>
          </button>
          <button type="button" class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]">
            <AlbumCover size="sm" icon="playlist" class="flex-shrink-0" />
            <div class="flex flex-col min-w-0 text-left">
              <span class="text-base text-[var(--text-primary)] truncate whitespace-nowrap">Workout Mix</span>
              <span class="text-base text-[var(--text-muted)] whitespace-nowrap">8 songs</span>
            </div>
          </button>
        </div>
      </div>

      <div class="mt-auto pt-3 flex flex-col gap-1">
        <NavItem icon={() => <Download class="w-5 h-5" />} label="Download" active={false} />
        <NavItem icon={() => <Gear class="w-5 h-5" />} label="Settings" active={false} />
      </div>
    </Sidebar>
  )
}

// ── Mobile footer tabs ───────────────────────────────────────────────

const mobileFooterTabs = [
  { id: 'home', icon: <Home class="w-6 h-6" />, activeIcon: <HomeFill class="w-6 h-6" />, label: 'Home' },
  { id: 'community', icon: <UsersThree class="w-6 h-6" />, activeIcon: <UsersThreeFill class="w-6 h-6" />, label: 'Community' },
  { id: 'music', icon: <MusicNotes class="w-6 h-6" />, activeIcon: <MusicNotesFill class="w-6 h-6" />, label: 'Music' },
  { id: 'chat', icon: <ChatCircle class="w-6 h-6" />, activeIcon: <ChatCircleFill class="w-6 h-6" />, label: 'Chat' },
  { id: 'wallet', icon: <Wallet class="w-6 h-6" />, label: 'Wallet' },
]

// ── Mobile Library ───────────────────────────────────────────────────

function LibraryMobile(props: { pb: ReturnType<typeof usePlayback> }) {
  const [filter, setFilter] = createSignal<LibraryFilter>('all')
  const [sortField, setSortField] = createSignal<LibrarySortField>('recent')
  const [addFundsOpen, setAddFundsOpen] = createSignal(false)

  return (
    <div class="flex flex-col h-full bg-[var(--bg-page)]">
      <div class="flex-1 overflow-y-auto min-h-0">
        <PageHeader
          compact
          title="Library"
          leftSlot={
            <IconButton variant="soft" size="md" aria-label="Back" onClick={() => console.log('Back')}>
              <ChevronLeft class="w-5 h-5" />
            </IconButton>
          }
          rightSlot={
            <IconButton variant="soft" size="md" aria-label="Cloud storage" onClick={() => setAddFundsOpen(true)}>
              <CloudFill class="w-5 h-5" />
            </IconButton>
          }
        />
        <AddFundsDialog
          open={addFundsOpen()}
          onOpenChange={setAddFundsOpen}
          currentBalance="$2.50"
          daysRemaining={45}
          balanceNum={2.5}
          monthlyCost="$0.12"
          loading={false}
          onDeposit={(amount) => console.log('Deposit:', amount)}
        />

        <FilterSortBar
          filter={filter()}
          filterLabels={filterLabels}
          onFilterChange={setFilter}
          sortField={sortField()}
          sortLabels={sortLabels}
          onSortChange={setSortField}
        />

        <LibraryContent pb={props.pb} forceCompact />
      </div>

      <MiniPlayer
        title={props.pb.activeTrack()?.title}
        artist={props.pb.activeTrack()?.artist}
        coverSrc={props.pb.activeTrack()?.albumCover}
        progress={props.pb.progress()}
        isPlaying={props.pb.isPlaying()}
        onPlayPause={() => props.pb.setIsPlaying(!props.pb.isPlaying())}
        onExpand={() => console.log('expand')}
        onNext={props.pb.nextTrack}
      />

      <MobileFooter
        tabs={mobileFooterTabs}
        activeTab="music"
        onTabPress={(id) => console.log('Tab:', id)}
      />
    </div>
  )
}

// ── Desktop Library (uses AppShell) ──────────────────────────────────

function LibraryDesktop() {
  const pb = usePlayback()
  const [filter, setFilter] = createSignal<LibraryFilter>('all')
  const [sortField, setSortField] = createSignal<LibrarySortField>('recent')

  return (
    <AppShell
      sidebar={<LibrarySidebar />}
      rightPanel={
        <RightPanel>
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
        </RightPanel>
      }
      mobilePlayer={
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
      }
      mobileFooter={
        <MobileFooter
          tabs={mobileFooterTabs}
          activeTab="music"
          onTabPress={(id) => console.log('Tab:', id)}
        />
      }
    >
      <div class="flex-1 overflow-y-auto">
        <PageHero
          title="Library"
          backgroundStyle={{ background: 'linear-gradient(135deg, #312e81 0%, #5b21b6 40%, #7c3aed 70%, #6d28d9 100%)' }}
          subtitle="5 local, 3 cloud"
          actions={
            <Button variant="secondary" icon={<Wallet />} onClick={() => console.log('Add Funds')} class="!bg-white/15 !border-white/25 !text-white hover:!bg-white/25">
              Add Funds
            </Button>
          }
        />

        <FilterSortBar
          filter={filter()}
          filterLabels={filterLabels}
          onFilterChange={setFilter}
          sortField={sortField()}
          sortLabels={sortLabels}
          onSortChange={setSortField}
        />

        <LibraryContent pb={pb} artistBelowTitle showRowNumbers={false} />
      </div>
    </AppShell>
  )
}

// ── Stories ──────────────────────────────────────────────────────────

const meta: Meta = {
  title: 'Music/Library Page',
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Mobile: Story = {
  render: () => {
    const pb = usePlayback()
    return (
      <div class="h-screen">
        <LibraryMobile pb={pb} />
      </div>
    )
  },
}

export const Desktop: Story = {
  render: () => <LibraryDesktop />,
}
