/**
 * AppLayout — shared layout wrapper for all routes.
 *
 * Renders AppShell (header, sidebar, right panel, footer with MusicPlayer)
 * and an <Outlet /> for child route content. This stays mounted across
 * navigation so the music player persists.
 */

import type { ParentComponent } from 'solid-js'
import { Show } from 'solid-js'
import {
  AppShell,
  Header,
  RightPanel,
  MusicPlayer,
} from '@heaven/ui'
import { AppSidebar, HeaderActions } from '.'
import { NowPlaying } from '../player/now-playing'
import { Toaster } from '../Toaster'
import { usePlayer } from '../../providers'

export const AppLayout: ParentComponent = (props) => {
  const player = usePlayer()

  return (
    <AppShell
      header={<Header rightSlot={<HeaderActions />} />}
      sidebar={<AppSidebar />}
      rightPanel={
        <RightPanel>
          <div class="p-4">
            <Show
              when={player.currentTrack()}
              fallback={
                <div class="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
                  <svg class="w-12 h-12 mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                  <p class="text-sm">Nothing playing</p>
                </div>
              }
            >
              {(track) => (
                <>
                  <NowPlaying
                    title={track().title}
                    artist={track().artist}
                    albumArtSrc={track().albumCover}
                  />
                  <div class="mt-4 flex flex-col gap-2">
                    <Show when={track().album}>
                      <div class="flex justify-between text-sm">
                        <span class="text-[var(--text-muted)]">Album</span>
                        <span class="text-[var(--text-secondary)] truncate ml-4 text-right">{track().album}</span>
                      </div>
                    </Show>
                    <Show when={track().duration}>
                      <div class="flex justify-between text-sm">
                        <span class="text-[var(--text-muted)]">Duration</span>
                        <span class="text-[var(--text-secondary)]">{track().duration}</span>
                      </div>
                    </Show>
                  </div>
                </>
              )}
            </Show>
          </div>
        </RightPanel>
      }
      footer={
        <MusicPlayer
          title={player.currentTrack()?.title}
          artist={player.currentTrack()?.artist}
          coverSrc={player.currentTrack()?.albumCover}
          currentTime={player.currentTimeFormatted()}
          duration={player.durationFormatted()}
          progress={player.progress()}
          volume={player.volume()}
          isPlaying={player.isPlaying()}
          onPlayPause={player.togglePlay}
          onNext={player.playNext}
          onPrev={player.playPrev}
          onProgressChange={player.handleSeek}
          onProgressChangeStart={player.handleSeekStart}
          onProgressChangeEnd={player.handleSeekEnd}
          onVolumeChange={player.handleVolumeChange}
        />
      }
    >
      {props.children}
      <Toaster />
    </AppShell>
  )
}
