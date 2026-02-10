import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal, Show } from 'solid-js'
import { TrackList, type Track } from './track-list'
import { MiniPlayer } from './mini-player'
import { MobileFooter } from '../../layout/MobileFooter'
import { PageHeader } from '../shared/page-header'
import { IconButton } from '../../primitives/icon-button'
import {
  Home, HomeFill, UsersThree, MusicNotes, MusicNotesFill,
  ChatCircle, ChatCircleFill, Wallet, ChevronLeft,
} from '../../icons'

// ── Data ─────────────────────────────────────────────────────────────

const sharedTracks: Track[] = [
  { id: 's1', title: 'Breathe', artist: 'Telepopmusik', album: 'Genetic World', albumCover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=100&h=100&fit=crop', dateAdded: '1/25/2026', sharedBy: 'alice.heaven' },
  { id: 's2', title: 'Electric Feel', artist: 'MGMT', album: 'Oracular Spectacular', albumCover: 'https://images.unsplash.com/photo-1674501695526-da10f852203b?w=100&h=100&fit=crop', dateAdded: '1/20/2026', sharedBy: 'bob.heaven' },
  { id: 's3', title: 'Midnight City', artist: 'M83', album: "Hurry Up, We're Dreaming", albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop', dateAdded: '1/15/2026', sharedBy: 'technohippies.heaven' },
  { id: 's4', title: 'Digital Love', artist: 'Daft Punk', album: 'Discovery', albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop', dateAdded: '1/10/2026', sharedBy: 'alice.heaven' },
]

const footerTabs = [
  { id: 'home', icon: <Home class="w-6 h-6" />, activeIcon: <HomeFill class="w-6 h-6" />, label: 'Home' },
  { id: 'community', icon: <UsersThree class="w-6 h-6" />, label: 'Community' },
  { id: 'library', icon: <MusicNotes class="w-6 h-6" />, activeIcon: <MusicNotesFill class="w-6 h-6" />, label: 'Music' },
  { id: 'messages', icon: <ChatCircle class="w-6 h-6" />, activeIcon: <ChatCircleFill class="w-6 h-6" />, label: 'Chat' },
  { id: 'wallet', icon: <Wallet class="w-6 h-6" />, label: 'Wallet' },
]

const menuActions = {
  onAddToPlaylist: (track: Track) => console.log('Add to playlist:', track),
  onAddToQueue: (track: Track) => console.log('Add to queue:', track),
  onGoToArtist: (track: Track) => console.log('Go to artist:', track),
}

// ── Playback hook ────────────────────────────────────────────────────

function usePlayback() {
  const [isPlaying, setIsPlaying] = createSignal(true)
  const [progress, setProgress] = createSignal(35)
  const [activeTrackId, setActiveTrackId] = createSignal('s1')

  setInterval(() => {
    if (isPlaying()) setProgress((p) => (p >= 100 ? 0 : p + 0.2))
  }, 100)

  const activeTrack = () => sharedTracks.find((t) => t.id === activeTrackId())

  const playTrack = (track: Track) => {
    setActiveTrackId(track.id)
    setIsPlaying(true)
    setProgress(0)
  }

  return { isPlaying, setIsPlaying, progress, activeTrackId, activeTrack, playTrack }
}

// ── Shared Page (matches LibraryPage.tsx shared tab) ─────────────────

function SharedMobile(props: { pb: ReturnType<typeof usePlayback> }) {
  return (
    <div class="flex flex-col h-full bg-[var(--bg-page)]">
      <div class="flex-1 overflow-y-auto min-h-0">
        <PageHeader
          compact
          title="Shared With You"
          leftSlot={
            <IconButton variant="soft" size="md" aria-label="Back" onClick={() => console.log('back')}>
              <ChevronLeft class="w-5 h-5" />
            </IconButton>
          }
        />

        {/* TrackList — matches real app: forceCompact, showSharedBy, showAlbum=false */}
        <TrackList
          tracks={sharedTracks}
          showAlbum={false}
          showSharedBy
          forceCompact
          activeTrackId={props.pb.activeTrackId()}
          activeTrackPlaying={props.pb.isPlaying()}
          onTrackClick={(track) => console.log('click', track.title)}
          onTrackPlay={props.pb.playTrack}
          menuActions={menuActions}
        />

        <Show when={sharedTracks.length === 0}>
          <div class="flex items-start justify-center pt-6">
            <p class="text-base text-[var(--text-muted)]">Songs shared to you appear here</p>
          </div>
        </Show>
      </div>

      <MiniPlayer
        title={props.pb.activeTrack()?.title}
        artist={props.pb.activeTrack()?.artist}
        coverSrc={props.pb.activeTrack()?.albumCover}
        progress={props.pb.progress()}
        isPlaying={props.pb.isPlaying()}
        onPlayPause={() => props.pb.setIsPlaying(!props.pb.isPlaying())}
        onExpand={() => console.log('expand')}
      />

      <MobileFooter
        tabs={footerTabs}
        activeTab="library"
        onTabPress={(id) => console.log('Tab:', id)}
      />
    </div>
  )
}

// ── Stories ──────────────────────────────────────────────────────────

const meta: Meta = {
  title: 'Music/Shared Page',
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Mobile: Story = {
  render: () => {
    const pb = usePlayback()
    return (
      <div class="h-screen">
        <SharedMobile pb={pb} />
      </div>
    )
  },
}
