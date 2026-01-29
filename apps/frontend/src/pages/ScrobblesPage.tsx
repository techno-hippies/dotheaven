import { type Component, createSignal, createEffect, Show } from 'solid-js'
import {
  AppShell,
  Header,
  RightPanel,
  MusicPlayer,
  MediaHeader,
  TrackList,
  type Track,
} from '@heaven/ui'
import { AppSidebar, HeaderActions } from '../components/shell'
import { useAuth } from '../providers'
import { fetchScrobbleEntries, scrobblesToTracks } from '../lib/heaven'

export const ScrobblesPage: Component = () => {
  const auth = useAuth()
  const [tracks, setTracks] = createSignal<Track[]>([])
  const [loading, setLoading] = createSignal(true)
  const [totalCount, setTotalCount] = createSignal(0)

  createEffect(async () => {
    const address = auth.pkpAddress()
    if (!address) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const entries = await fetchScrobbleEntries(address)
      setTotalCount(entries.length)
      setTracks(scrobblesToTracks(entries))
    } catch (err) {
      console.error('[ScrobblesPage] Failed to fetch scrobbles:', err)
    } finally {
      setLoading(false)
    }
  })

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
            <p class="text-lg font-semibold text-[var(--text-primary)]">-</p>
            <p class="text-base text-[var(--text-secondary)]">-</p>
          </div>
        </RightPanel>
      }
      footer={
        <MusicPlayer
          title="-"
          artist="-"
          currentTime="0:00"
          duration="0:00"
          progress={0}
        />
      }
    >
      <div class="h-full overflow-y-auto bg-gradient-to-b from-[#3a5a4a] via-[#253a30] to-[var(--bg-page)] rounded-t-lg">
        <MediaHeader
          type="playlist"
          title="Scrobbles"
          creator="On-chain listening history"
          stats={{
            songCount: totalCount(),
            duration: 'Verified on MegaETH',
          }}
        />
        <Show when={loading()}>
          <div class="px-6 py-12 text-center text-[var(--text-muted)]">
            Loading scrobbles...
          </div>
        </Show>
        <Show when={!loading() && !auth.isAuthenticated()}>
          <div class="px-6 py-12 text-center text-[var(--text-muted)]">
            Sign in to see your scrobbles
          </div>
        </Show>
        <Show when={!loading() && auth.isAuthenticated() && tracks().length === 0}>
          <div class="px-6 py-12 text-center text-[var(--text-muted)]">
            No scrobbles yet. Start listening to build your on-chain history.
          </div>
        </Show>
        <Show when={!loading() && tracks().length > 0}>
          <TrackList
            tracks={tracks()}
            onTrackClick={(track) => console.log('Track clicked:', track)}
            onTrackPlay={(track) => console.log('Track play:', track)}
            menuActions={{
              onAddToPlaylist: (track) => console.log('Add to playlist:', track),
              onAddToQueue: (track) => console.log('Add to queue:', track),
              onGoToArtist: (track) => console.log('Go to artist:', track),
              onGoToAlbum: (track) => console.log('Go to album:', track),
            }}
          />
        </Show>
      </div>
    </AppShell>
  )
}
