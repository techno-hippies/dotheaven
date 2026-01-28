import type { Component } from 'solid-js'
import {
  AppShell,
  Header,
  RightPanel,
  Avatar,
  IconButton,
  MusicPlayer,
  MediaHeader,
  TrackList,
  type Track,
} from '@heaven/ui'
import { AppSidebar } from '../components/shell'
import { useAuth } from '../providers'
import { useNavigate } from '@solidjs/router'

const BellIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
  </svg>
)

// Placeholder liked songs
const likedSongs: Track[] = [
  {
    id: '1',
    title: 'Neon Dreams',
    artist: 'Synthwave Collective',
    album: 'Midnight Drive',
    albumCover: 'https://picsum.photos/seed/album1/100/100',
    dateAdded: '2 days ago',
    duration: '4:39',
  },
  {
    id: '2',
    title: 'Midnight Rain',
    artist: 'Lo-Fi Beats',
    album: 'Chill Sessions',
    albumCover: 'https://picsum.photos/seed/album2/100/100',
    dateAdded: '1 week ago',
    duration: '3:22',
  },
]

export const LikedSongsPage: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()

  return (
    <AppShell
      header={
        <Header
          rightSlot={
            <div class="flex items-center gap-3">
              <IconButton variant="ghost" size="md" aria-label="Notifications">
                <BellIcon />
              </IconButton>
              <IconButton
                variant="ghost"
                size="md"
                aria-label="Wallet"
                onClick={() => navigate('/wallet')}
              >
                <WalletIcon />
              </IconButton>
              <button
                onClick={() => navigate('/profile')}
                class="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title={`Signed in as ${auth.pkpAddress()?.slice(0, 6)}...${auth.pkpAddress()?.slice(-4)}`}
              >
                <Avatar size="sm" class="cursor-pointer" />
              </button>
            </div>
          }
        />
      }
      sidebar={<AppSidebar />}
      rightPanel={
        <RightPanel>
          <div class="p-4">
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Now Playing</h3>
            <div class="aspect-square bg-[var(--bg-highlight)] rounded-lg mb-4" />
            <p class="text-lg font-semibold text-[var(--text-primary)]">Neon Dreams</p>
            <p class="text-base text-[var(--text-secondary)]">Synthwave Collective</p>
          </div>
        </RightPanel>
      }
      footer={
        <MusicPlayer
          title="Neon Dreams"
          artist="Synthwave Collective"
          currentTime="2:47"
          duration="4:39"
          progress={58}
          isPlaying
        />
      }
    >
      <div class="h-full overflow-y-auto bg-gradient-to-b from-[#5a3a7a] via-[#3a2550] to-[var(--bg-page)]">
        <MediaHeader
          type="playlist"
          title="Liked Songs"
          creator="You"
          stats={{
            songCount: likedSongs.length,
            duration: '7 min 01 sec',
          }}
        />
        <TrackList
          tracks={likedSongs}
          onTrackClick={(track) => console.log('Track clicked:', track)}
          onTrackPlay={(track) => console.log('Track play:', track)}
          menuActions={{
            onAddToPlaylist: (track) => console.log('Add to playlist:', track),
            onAddToQueue: (track) => console.log('Add to queue:', track),
            onGoToArtist: (track) => console.log('Go to artist:', track),
            onGoToAlbum: (track) => console.log('Go to album:', track),
            onRemoveFromPlaylist: (track) => console.log('Remove from liked:', track),
          }}
        />
      </div>
    </AppShell>
  )
}
