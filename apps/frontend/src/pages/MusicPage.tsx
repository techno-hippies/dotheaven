import type { Component } from 'solid-js'
import { For, Show, createResource } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { useNavigate } from '@solidjs/router'
import { musicTab } from '@heaven/core'
import {
  type Track,
  PageHeader,
  IconButton,
  useIsMobile,
} from '@heaven/ui'
import {
  ChevronRight,
  List,
  Tray,
  MusicNotesFill,
  MagnifyingGlass,
} from '@heaven/ui/icons'
import { useI18n } from '@heaven/i18n/solid'
import { useAuth } from '../providers'
import { fetchUserPlaylists } from '../lib/heaven/playlists'
import { fetchSharedContent } from '../lib/heaven/scrobbles'
import { fetchScrobbleEntries, scrobblesToTracks } from '../lib/heaven/scrobbles'

// ── Library entry card ─────────────────────────────────────────────

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

// ── Section header ──────────────────────────────────────────────────

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

// ── Discovery album card ────────────────────────────────────────────

function HorizAlbumCard(props: { track: Track }) {
  return (
    <div class="flex-shrink-0 w-[140px] cursor-pointer group">
      <div class="w-[140px] h-[140px] rounded-lg overflow-hidden bg-[var(--bg-elevated)] mb-2">
        <Show when={props.track.albumCover}>
          <img src={props.track.albumCover} alt={props.track.title} class="w-full h-full object-cover" />
        </Show>
      </div>
      <p class="text-base font-semibold text-[var(--text-primary)] truncate">{props.track.title}</p>
      <p class="text-base text-[var(--text-muted)] truncate">{props.track.artist}</p>
    </div>
  )
}

// ── Placeholder discovery data ──────────────────────────────────────

const trendingPlaceholder: Track[] = [
  { id: 'tr-1', title: 'Midnight Dreams', artist: 'Luna Sky', album: '', albumCover: 'https://images.unsplash.com/photo-1559258483-af85e116556c?w=200&h=200&fit=crop' },
  { id: 'tr-2', title: 'Electric Hearts', artist: 'Neon Pulse', album: '', albumCover: 'https://images.unsplash.com/photo-1761005653991-5e5bde985e97?w=200&h=200&fit=crop' },
  { id: 'tr-3', title: 'Summer Waves', artist: 'Ocean Blue', album: '', albumCover: 'https://images.unsplash.com/photo-1746793868936-77b7a2b431d5?w=200&h=200&fit=crop' },
  { id: 'tr-4', title: 'Golden Hour', artist: 'Sunset Crew', album: '', albumCover: 'https://images.unsplash.com/photo-1650220796580-25c433490c80?w=200&h=200&fit=crop' },
  { id: 'tr-5', title: 'Crystal Clear', artist: 'Maya Aquaris', album: '', albumCover: 'https://images.unsplash.com/photo-1633503787953-8f04ffa1cf76?w=200&h=200&fit=crop' },
]

const newReleasesPlaceholder: Track[] = [
  { id: 'nr-1', title: 'Electric Bloom', artist: 'Cosmo Ray', album: '', albumCover: 'https://images.unsplash.com/photo-1710664416966-901fa8b99d67?w=200&h=200&fit=crop' },
  { id: 'nr-2', title: 'Pulse Drive', artist: 'Hyper Flux', album: '', albumCover: 'https://images.unsplash.com/photo-1504904126298-3fde501c9b31?w=200&h=200&fit=crop' },
  { id: 'nr-3', title: 'Neon Sunset', artist: 'Dusk Wave', album: '', albumCover: 'https://images.unsplash.com/photo-1651629993462-ffe011a4fd6b?w=200&h=200&fit=crop' },
  { id: 'nr-4', title: 'Velvet Sky', artist: 'Nova Bloom', album: '', albumCover: 'https://images.unsplash.com/photo-1564251104897-2254ad893684?w=200&h=200&fit=crop' },
  { id: 'nr-5', title: 'Digital Love', artist: 'Daft Punk', album: '', albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop' },
]

const topArtistsPlaceholder = [
  { name: 'Luna Sky', avatar: 'https://images.unsplash.com/photo-1639502373148-69b234bd1e97?w=100&h=100&fit=crop' },
  { name: 'Neon Pulse', avatar: 'https://images.unsplash.com/photo-1615104603156-3dc403ca7cc8?w=100&h=100&fit=crop' },
  { name: 'Ocean Blue', avatar: 'https://images.unsplash.com/photo-1748723940975-0bafa95448c3?w=100&h=100&fit=crop' },
  { name: 'Sunset Crew', avatar: 'https://images.unsplash.com/photo-1583892963651-ddaeea1fffb8?w=100&h=100&fit=crop' },
]

// ── Artist circle ───────────────────────────────────────────────────

function ArtistCircle(props: { name: string; avatar?: string }) {
  return (
    <div class="flex-shrink-0 w-20 flex flex-col items-center gap-2 cursor-pointer">
      <Show
        when={props.avatar}
        fallback={
          <div class="w-[72px] h-[72px] rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
            <span class="text-2xl font-bold text-[var(--text-muted)]">{props.name.charAt(0).toUpperCase()}</span>
          </div>
        }
      >
        <div class="w-[72px] h-[72px] rounded-full overflow-hidden bg-[var(--bg-elevated)]">
          <img src={props.avatar} alt={props.name} class="w-full h-full object-cover" />
        </div>
      </Show>
      <p class="text-base font-medium text-[var(--text-secondary)] text-center truncate w-full">{props.name}</p>
    </div>
  )
}

// ── Music Home Page ─────────────────────────────────────────────────

export const MusicPage: Component = () => {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const auth = useAuth()
  const navigate = useNavigate()

  const playlistsQuery = createQuery(() => ({
    queryKey: ['userPlaylists', auth.pkpAddress()],
    queryFn: () => fetchUserPlaylists(auth.pkpAddress()!),
    get enabled() { return auth.isAuthenticated() && !!auth.pkpAddress() },
  }))

  const [sharedContent] = createResource(
    () => auth.pkpInfo()?.ethAddress,
    (addr) => fetchSharedContent(addr),
  )

  const scrobblesQuery = createQuery(() => ({
    queryKey: ['scrobbles', auth.pkpAddress(), 20],
    queryFn: () => fetchScrobbleEntries(auth.pkpAddress()!, 20),
    get enabled() { return auth.isAuthenticated() && !!auth.pkpAddress() },
  }))

  const recentTracks = (): Track[] => scrobblesToTracks(scrobblesQuery.data ?? [])
  const playlists = () => playlistsQuery.data ?? []
  const sharedCount = () => sharedContent()?.length ?? 0

  // Build playlist subtitle
  const playlistSubtitle = () => {
    const count = playlists().length
    return count === 0 ? 'No playlists yet' : `${count} playlist${count !== 1 ? 's' : ''}`
  }

  // Build shared subtitle
  const sharedSubtitle = () => {
    const count = sharedCount()
    return count === 0 ? 'No shared songs' : `${count} song${count !== 1 ? 's' : ''}`
  }

  return (
    <div class="h-full overflow-y-auto">
      <PageHeader
        title={isMobile() ? t('nav.music') : t('music.discover')}
        rightSlot={isMobile() ? (
          <IconButton
            variant="soft"
            size="md"
            aria-label="Search library"
            onClick={() => navigate(musicTab('library'))}
          >
            <MagnifyingGlass class="w-5 h-5" />
          </IconButton>
        ) : undefined}
      />

      <div class="h-4" />

      {/* Library entry rows — mobile only (sidebar handles these on desktop) */}
      <div class="flex flex-col pb-2 md:hidden">
        <LibraryEntryCard
          icon={<List class="w-5 h-5" />}
          iconBg="#2e2040"
          iconColor="var(--accent-purple)"
          title="Library"
          subtitle="Local + Cloud"
          onClick={() => navigate(musicTab('library'))}
        />
        <LibraryEntryCard
          icon={<Tray class="w-5 h-5" />}
          iconBg="#1e2d40"
          iconColor="var(--accent-blue)"
          title="Shared With You"
          subtitle={sharedSubtitle()}
          badge={sharedCount() > 0 ? `${sharedCount()} new` : undefined}
          badgeColor="var(--accent-blue)"
          onClick={() => navigate(musicTab('shared'))}
        />
        <LibraryEntryCard
          icon={<MusicNotesFill class="w-5 h-5" />}
          iconBg="#1e3a2a"
          iconColor="#a6e3a1"
          title="Playlists"
          subtitle={playlistSubtitle()}
          onClick={() => navigate('/music')} // TODO: playlists section
        />
      </div>

      {/* Discovery: Recent Listens */}
      <Show when={recentTracks().length > 0}>
        <div class="flex flex-col gap-3.5 pb-7">
          <SectionHeader title="Recent Listens" onAction={() => navigate(musicTab('library'))} />
          <div class="flex gap-3 overflow-x-auto px-5 scrollbar-hide">
            <For each={recentTracks().slice(0, 6)}>
              {(track) => <HorizAlbumCard track={track} />}
            </For>
          </div>
        </div>
      </Show>

      {/* Discovery: Trending (placeholder) */}
      <div class="flex flex-col gap-3.5 pb-7">
        <SectionHeader title="Trending" />
        <div class="flex gap-3 overflow-x-auto px-5 scrollbar-hide">
          <For each={trendingPlaceholder}>
            {(track) => <HorizAlbumCard track={track} />}
          </For>
        </div>
      </div>

      {/* Discovery: New Releases (placeholder) */}
      <div class="flex flex-col gap-3.5 pb-7">
        <SectionHeader title="New Releases" />
        <div class="flex gap-3 overflow-x-auto px-5 scrollbar-hide">
          <For each={newReleasesPlaceholder}>
            {(track) => <HorizAlbumCard track={track} />}
          </For>
        </div>
      </div>

      {/* Discovery: Top Artists (placeholder) */}
      <div class="flex flex-col gap-3.5 pb-7">
        <SectionHeader title="Top Artists" />
        <div class="flex gap-4 overflow-x-auto px-5 scrollbar-hide">
          <For each={topArtistsPlaceholder}>
            {(artist) => <ArtistCircle name={artist.name} avatar={artist.avatar} />}
          </For>
        </div>
      </div>
    </div>
  )
}
