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

  createEffect(async () => {
    const address = auth.pkpAddress()
    if (!address) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      console.log('[ScrobblesPage] Fetching scrobbles for:', address)
      const entries = await fetchScrobbleEntries(address)
      console.log('[ScrobblesPage] Got entries:', entries.length, entries)
      const converted = scrobblesToTracks(entries)
      console.log('[ScrobblesPage] Converted tracks:', converted.length, converted)
      setTracks(converted)
    } catch (err) {
      console.error('[ScrobblesPage] Failed to fetch scrobbles:', err)
    } finally {
      setLoading(false)
    }
  })

  const handleIdentify = (track: Track) => {
    console.log('[ScrobblesPage] Identify track:', track.title)
  }

  return (
    <AppShell
      header={
        <Header rightSlot={<HeaderActions />} />
      }
      sidebar={<AppSidebar />}
      rightPanel={<RightPanel />}
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
            songCount: tracks().length,
            duration: 'Verified on MegaETH',
          }}
        />
        <Show when={loading()}>
          <div class="px-6 py-12 text-center text-[var(--text-muted)]">
            Loading scrobbles...
          </div>
        </Show>
        <Show when={!loading() && tracks().length === 0}>
          <div class="px-6 py-12 text-center text-[var(--text-muted)]">
            No scrobbles yet. Play a song to start recording your listening history on-chain.
          </div>
        </Show>
        <Show when={!loading() && tracks().length > 0}>
          <TrackList
            tracks={tracks()}
            showScrobbleStatus
            onTrackClick={(track) => console.log('Track clicked:', track)}
            onTrackPlay={(track) => console.log('Track play:', track)}
            menuActions={{
              onIdentify: handleIdentify,
            }}
          />
        </Show>
      </div>
    </AppShell>
  )
}
