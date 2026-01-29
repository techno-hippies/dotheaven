import type { Component } from 'solid-js'
import {
  AppShell,
  Header,
  RightPanel,
  MusicPlayer,
  MediaHeader,
  TrackList,
  IconButton,
  PlayButton,
  type Track,
} from '@heaven/ui'
import { AppSidebar, HeaderActions } from '../components/shell'

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
  return (
    <AppShell
      header={
        <Header rightSlot={<HeaderActions />} />
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
      <div class="h-full overflow-y-auto bg-gradient-to-b from-[#5a3a7a] via-[#3a2550] to-[var(--bg-page)] rounded-t-lg">
        <MediaHeader
          type="playlist"
          title="Liked Songs"
          creator="You"
          stats={{
            songCount: likedSongs.length,
            duration: '7 min 01 sec',
          }}
          actionsSlot={
            <div class="flex items-center gap-4">
              <PlayButton onClick={() => console.log('Play liked songs')} aria-label="Play Liked Songs" />

              {/* Shuffle Button */}
              <IconButton
                variant="soft"
                size="lg"
                onClick={() => console.log('Shuffle')}
                aria-label="Shuffle"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </IconButton>
            </div>
          }
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
