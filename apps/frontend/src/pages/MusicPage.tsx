import type { Component } from 'solid-js'
import { createSignal, For, Show } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { useNavigate } from '@solidjs/router'
import {
  Tabs,
  TrackList,
  MediaRow,
  type Track,
} from '@heaven/ui'
import { useAuth, usePlayer } from '../providers'
import { fetchUserPlaylists } from '../lib/heaven/playlists'
import { fetchScrobbleEntries, scrobblesToTracks } from '../lib/heaven/scrobbles'
import { usePlaylistDialog, buildMenuActions, useArtistNavigation } from '../hooks/useTrackListActions'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'

const PLAYLIST_COLORS = [
  'var(--accent-purple)',
  '#f38ba8',
  '#94e2d5',
  '#fab387',
  '#89b4fa',
  '#f5c2e7',
  '#a6e3a1',
  '#74c7ec',
]

const tabs = [
  { id: 'songs', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'playlists', label: 'Playlists' },
]

export const MusicPage: Component = () => {
  const auth = useAuth()
  const player = usePlayer()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = createSignal('songs')
  const plDialog = usePlaylistDialog()
  const menuActions = buildMenuActions(plDialog)
  const goToArtist = useArtistNavigation()

  const playlistsQuery = createQuery(() => ({
    queryKey: ['userPlaylists', auth.pkpAddress()],
    queryFn: () => fetchUserPlaylists(auth.pkpAddress()!),
    get enabled() { return auth.isAuthenticated() && !!auth.pkpAddress() },
  }))

  const scrobblesQuery = createQuery(() => ({
    queryKey: ['scrobbles', auth.pkpAddress(), 50],
    queryFn: () => fetchScrobbleEntries(auth.pkpAddress()!, 50),
    get enabled() { return auth.isAuthenticated() && !!auth.pkpAddress() },
  }))

  const tracks = (): Track[] => scrobblesToTracks(scrobblesQuery.data ?? [])
  const playlists = () => playlistsQuery.data ?? []

  const handleTrackPlay = (track: Track) => {
    const current = player.currentTrack()
    if (current?.id === track.id) {
      player.togglePlay()
      return
    }
    player.setSelectedTrackId(track.id)
  }

  return (
    <div class="h-full overflow-y-auto">
      {/* Tabs: Songs / Artists / Playlists */}
      <Tabs tabs={tabs} activeTab={activeTab()} onTabChange={setActiveTab} />

      {/* Songs tab */}
      <Show when={activeTab() === 'songs'}>
        <Show
          when={!scrobblesQuery.isLoading}
          fallback={
            <div class="flex items-center justify-center py-20 text-[var(--text-muted)]">
              <div class="w-5 h-5 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <Show
            when={tracks().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
                <p class="text-base">No recent listens yet</p>
              </div>
            }
          >
            <div class="pt-2">
              <TrackList
                tracks={tracks()}
                forceCompact
                activeTrackId={player.currentTrack()?.id}
                activeTrackPlaying={player.isPlaying()}
                onTrackClick={handleTrackPlay}
                onTrackPlay={handleTrackPlay}
                menuActions={{
                  ...menuActions,
                  onGoToArtist: goToArtist,
                }}
              />
            </div>
          </Show>
        </Show>
      </Show>

      {/* Artists tab */}
      <Show when={activeTab() === 'artists'}>
        <div class="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
          <p class="text-base">Coming soon</p>
        </div>
      </Show>

      {/* Playlists tab */}
      <Show when={activeTab() === 'playlists'}>
        <Show
          when={!playlistsQuery.isLoading}
          fallback={
            <div class="flex items-center justify-center py-20 text-[var(--text-muted)]">
              <div class="w-5 h-5 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <Show
            when={playlists().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
                <p class="text-base">No playlists yet</p>
              </div>
            }
          >
            <div class="px-2 pt-2">
              <For each={playlists()}>
                {(pl, i) => (
                  <MediaRow
                    title={pl.name}
                    subtitle={`${pl.trackCount} tracks`}
                    cover={
                      <div
                        class="w-10 h-10 rounded-md flex-shrink-0"
                        style={{ background: PLAYLIST_COLORS[i() % PLAYLIST_COLORS.length] }}
                      />
                    }
                    onClick={() => navigate(`/playlist/${pl.id}`)}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Show>

      <AddToPlaylistDialog
        open={plDialog.open()}
        onOpenChange={plDialog.setOpen}
        track={plDialog.track()}
      />
    </div>
  )
}

