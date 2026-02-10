import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal, createMemo, For, Show } from 'solid-js'
import { type Track } from './track-list'
import { MiniPlayer } from './mini-player'
import { SidePlayer } from './side-player'
import { MobileFooter } from '../../layout/MobileFooter'
import { AppShell } from '../../layout/AppShell'
import { RightPanel } from '../../layout/RightPanel'
import { Sidebar } from '../../layout/Sidebar'
import { AlbumCover } from './album-cover'
import { IconButton } from '../../primitives/icon-button'
import { PillGroup } from '../../primitives/pill-group'
import { PageHeader } from '../shared/page-header'
import {
  Home, HomeFill, MagnifyingGlass, UsersThree, UsersThreeFill, Compass,
  MusicNotes, MusicNotesFill,
  ChatCircle, ChatCircleFill, Wallet, CalendarBlank, ChevronRight,
  Tray, Plus, List, User, Gear, Download, ShareNetwork,
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

interface TopSongItem {
  title: string
  artist: string
  cover: string
  plays: number
}

const topSongs7d: TopSongItem[] = [
  { title: 'Midnight City', artist: 'M83', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop', plays: 42 },
  { title: 'Electric Feel', artist: 'MGMT', cover: 'https://images.unsplash.com/photo-1674501695526-da10f852203b?w=100&h=100&fit=crop', plays: 38 },
  { title: 'Digital Love', artist: 'Daft Punk', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop', plays: 31 },
  { title: 'Summer Waves', artist: 'Ocean Blue', cover: 'https://images.unsplash.com/photo-1746793868936-77b7a2b431d5?w=100&h=100&fit=crop', plays: 27 },
  { title: 'Crystal Clear', artist: 'Maya Aquaris', cover: 'https://images.unsplash.com/photo-1633503787953-8f04ffa1cf76?w=100&h=100&fit=crop', plays: 19 },
]

const topSongs30d: TopSongItem[] = [
  { title: 'Digital Love', artist: 'Daft Punk', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop', plays: 156 },
  { title: 'Midnight City', artist: 'M83', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop', plays: 134 },
  { title: 'Electric Feel', artist: 'MGMT', cover: 'https://images.unsplash.com/photo-1674501695526-da10f852203b?w=100&h=100&fit=crop', plays: 112 },
  { title: 'Golden Hour', artist: 'Sunset Crew', cover: 'https://images.unsplash.com/photo-1650220796580-25c433490c80?w=100&h=100&fit=crop', plays: 98 },
  { title: 'Summer Waves', artist: 'Ocean Blue', cover: 'https://images.unsplash.com/photo-1746793868936-77b7a2b431d5?w=100&h=100&fit=crop', plays: 87 },
]

const topSongsAll: TopSongItem[] = [
  { title: 'Digital Love', artist: 'Daft Punk', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop', plays: 1204 },
  { title: 'Midnight City', artist: 'M83', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop', plays: 987 },
  { title: 'Electric Feel', artist: 'MGMT', cover: 'https://images.unsplash.com/photo-1674501695526-da10f852203b?w=100&h=100&fit=crop', plays: 843 },
  { title: 'Crystal Clear', artist: 'Maya Aquaris', cover: 'https://images.unsplash.com/photo-1633503787953-8f04ffa1cf76?w=100&h=100&fit=crop', plays: 756 },
  { title: 'Golden Hour', artist: 'Sunset Crew', cover: 'https://images.unsplash.com/photo-1650220796580-25c433490c80?w=100&h=100&fit=crop', plays: 621 },
]

type TopSongsPeriod = '7d' | '30d' | 'all'

const periodOptions: { value: TopSongsPeriod; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
]

const topSongsByPeriod: Record<TopSongsPeriod, TopSongItem[]> = {
  '7d': topSongs7d,
  '30d': topSongs30d,
  'all': topSongsAll,
}

const menuActions = {
  onAddToPlaylist: (track: Track) => console.log('Add to playlist:', track),
  onAddToQueue: (track: Track) => console.log('Add to queue:', track),
  onGoToArtist: (track: Track) => console.log('Go to artist:', track),
  onGoToAlbum: (track: Track) => console.log('Go to album:', track),
}

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

// ── Sub-components ───────────────────────────────────────────────────

function SectionHeader(props: { title: string; onAction?: () => void }) {
  return (
    <div class="flex items-center justify-between px-5">
      <h2 class="text-lg font-bold text-[var(--text-primary)]">{props.title}</h2>
      <Show when={props.onAction}>
        <button
          type="button"
          class="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          onClick={props.onAction}
        >
          <ChevronRight class="w-5 h-5" />
        </button>
      </Show>
    </div>
  )
}

function HorizAlbumCard(props: { item: TrendingItem }) {
  return (
    <div class="flex-shrink-0 w-[140px] cursor-pointer group">
      <div class="w-[140px] h-[140px] rounded-lg overflow-hidden bg-[var(--bg-elevated)] mb-2">
        <img src={props.item.cover} alt={props.item.title} class="w-full h-full object-cover" />
      </div>
      <p class="text-base font-semibold text-[var(--text-primary)] truncate">{props.item.title}</p>
      <p class="text-base text-[var(--text-muted)] truncate">{props.item.artist}</p>
    </div>
  )
}

function TopSongRow(props: { song: TopSongItem; rank: number }) {
  return (
    <div class="flex items-center gap-3 px-5 py-2 hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer">
      <span class="w-5 text-sm font-medium text-[var(--text-muted)] text-right flex-shrink-0">{props.rank}</span>
      <AlbumCover src={props.song.cover} alt={props.song.title} size="sm" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-[var(--text-primary)] truncate">{props.song.title}</p>
        <p class="text-xs text-[var(--text-muted)] truncate">{props.song.artist}</p>
      </div>
      <span class="text-xs text-[var(--text-muted)] flex-shrink-0">{props.song.plays.toLocaleString()} plays</span>
    </div>
  )
}

function TopSongsSection() {
  const [period, setPeriod] = createSignal<TopSongsPeriod>('7d')
  const songs = createMemo(() => topSongsByPeriod[period()])

  return (
    <div class="flex flex-col gap-3.5">
      <div class="flex items-center justify-between px-5">
        <h2 class="text-lg font-bold text-[var(--text-primary)]">Top Songs</h2>
        <PillGroup
          options={periodOptions}
          value={period()}
          onChange={setPeriod}
          pillClass="!text-xs !px-2.5 !py-1"
        />
      </div>
      <div class="flex flex-col">
        <For each={songs()}>{(song, i) => <TopSongRow song={song} rank={i() + 1} />}</For>
      </div>
    </div>
  )
}

function LibraryEntryCard(props: {
  icon: any
  iconBg: string
  iconColor: string
  title: string
  subtitle: string
  badge?: string
  badgeColor?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      class="flex items-center gap-3 h-[72px] px-4 w-full cursor-pointer hover:bg-[var(--bg-highlight)] transition-colors"
      onClick={props.onClick}
    >
      <div
        class="w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: props.iconBg }}
      >
        <span style={{ color: props.iconColor }}>{props.icon}</span>
      </div>
      <div class="flex-1 min-w-0 text-left">
        <p class="text-base font-medium text-[var(--text-primary)] truncate">{props.title}</p>
        <p class="text-base text-[var(--text-secondary)] truncate">{props.subtitle}</p>
      </div>
      <Show when={props.badge}>
        <span
          class="h-[22px] px-2 rounded-full text-[11px] font-semibold flex items-center"
          style={{ background: props.badgeColor || 'var(--accent-blue)', color: '#171717' }}
        >
          {props.badge}
        </span>
      </Show>
      <Show when={!props.badge}>
        <ChevronRight class="w-[18px] h-[18px] text-[var(--text-muted)]" />
      </Show>
    </button>
  )
}

// ── Discover content ─────────────────────────────────────────────────

function DiscoverContent() {
  return (
    <div class="flex flex-col gap-6 py-6">
      <div class="flex flex-col gap-3.5">
        <SectionHeader title="Trending" onAction={() => console.log('See all')} />
        <div class="flex gap-3 overflow-x-auto px-5 scrollbar-hide">
          <For each={trendingItems}>{(item) => <HorizAlbumCard item={item} />}</For>
        </div>
      </div>

      <div class="flex flex-col gap-3.5">
        <SectionHeader title="New Releases" onAction={() => console.log('See all')} />
        <div class="flex gap-3 overflow-x-auto px-5 scrollbar-hide">
          <For each={newReleases}>{(item) => <HorizAlbumCard item={item} />}</For>
        </div>
      </div>

      <TopSongsSection />
    </div>
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

function DiscoverSidebar() {
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
          <button type="button" class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors bg-[var(--bg-highlight)]">
            <div class="w-10 h-10 flex-shrink-0 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
              <Compass class="w-5 h-5" />
            </div>
            <div class="flex flex-col min-w-0 text-left">
              <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Discover</span>
            </div>
          </button>
          <button type="button" class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]">
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

// ── Mobile Discover ──────────────────────────────────────────────────

function DiscoverMobile(props: { pb: ReturnType<typeof usePlayback> }) {
  return (
    <div class="flex flex-col h-full bg-[var(--bg-page)]">
      <div class="flex-1 overflow-y-auto min-h-0">
        <PageHeader
          title="Music"
          rightSlot={
            <IconButton variant="soft" size="md" aria-label="Search library" onClick={() => console.log('search')}>
              <MagnifyingGlass class="w-5 h-5" />
            </IconButton>
          }
        />

        <div class="h-4" />

        <div class="flex flex-col pb-2">
          <LibraryEntryCard
            icon={<List class="w-5 h-5" />}
            iconBg="#2e2040"
            iconColor="var(--accent-purple)"
            title="Library"
            subtitle="Local + Cloud"
            onClick={() => console.log('library')}
          />
          <LibraryEntryCard
            icon={<Tray class="w-5 h-5" />}
            iconBg="#1e2d40"
            iconColor="var(--accent-blue)"
            title="Shared With You"
            subtitle="2 songs"
            onClick={() => console.log('shared')}
          />
          <LibraryEntryCard
            icon={<MusicNotesFill class="w-5 h-5" />}
            iconBg="#1e3a2a"
            iconColor="#a6e3a1"
            title="Playlists"
            subtitle="3 playlists"
            onClick={() => console.log('playlists')}
          />
        </div>

        <DiscoverContent />
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

// ── Desktop Discover (uses AppShell) ─────────────────────────────────

function DiscoverDesktop() {
  const pb = usePlayback()

  return (
    <AppShell
      sidebar={<DiscoverSidebar />}
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
        <PageHeader title="Discover" />
        <DiscoverContent />
      </div>
    </AppShell>
  )
}

// ── Stories ──────────────────────────────────────────────────────────

const meta: Meta = {
  title: 'Music/Discover Page',
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Mobile: Story = {
  render: () => {
    const pb = usePlayback()
    return (
      <div class="h-screen">
        <DiscoverMobile pb={pb} />
      </div>
    )
  },
}

export const Desktop: Story = {
  render: () => <DiscoverDesktop />,
}
