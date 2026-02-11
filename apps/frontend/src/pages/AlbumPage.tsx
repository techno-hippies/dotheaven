import { type Component, Show, For, createMemo } from 'solid-js'
import { useParams, useNavigate, A } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { MediaHeader, TrackList, IconButton } from '@heaven/ui'
import { SpotifyLogo } from '@heaven/ui/icons'
import { artist as artistRoute } from '@heaven/core'
import { fetchAlbumPageData, albumTracksToTracks, normalizeArtistVariants } from '../lib/heaven'
import { useTrackPlayback, usePlaylistDialog, buildMenuActions } from '../hooks/useTrackListActions'
import { usePlayer } from '../providers'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'

export const AlbumPage: Component = () => {
  const params = useParams<{ mbid: string }>()
  const navigate = useNavigate()

  const player = usePlayer()
  const playback = useTrackPlayback()
  const plDialog = usePlaylistDialog()
  const menuActions = buildMenuActions(plDialog)

  const normalizeTitleKey = (title: string) => {
    if (!title) return ''
    return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
  }

  const query = createQuery(() => ({
    queryKey: ['album', params.mbid],
    queryFn: () => fetchAlbumPageData(params.mbid),
    enabled: !!params.mbid,
    staleTime: 30_000,
    refetchInterval: 30_000,
  }))

  const info = () => query.data?.info ?? null

  const localCoverMap = createMemo(() => {
    const map = new Map<string, string>()
    for (const t of player.tracks()) {
      if (!t.albumCover) continue
      const titleKey = normalizeTitleKey(t.title)
      if (!titleKey) continue
      const variants = normalizeArtistVariants(t.artist)
      for (const variant of variants) {
        map.set(`${variant}::${titleKey}`, t.albumCover)
      }
    }
    return map
  })

  const tracks = () => {
    const base = query.data ? albumTracksToTracks(query.data.tracks) : []
    const map = localCoverMap()
    return base.map((t) => {
      if (t.albumCover) return t
      const titleKey = normalizeTitleKey(t.title)
      const variants = normalizeArtistVariants(t.artist)
      for (const variant of variants) {
        const hit = map.get(`${variant}::${titleKey}`)
        if (hit) return { ...t, albumCover: hit }
      }
      return t
    })
  }

  const totalScrobbles = () => query.data?.totalScrobbles ?? 0
  const uniqueListeners = () => query.data?.uniqueListeners ?? 0
  const ranking = () => query.data?.ranking ?? 0

  const coverUrl = () => {
    const i = info()
    return i?.coverArtUrl ?? undefined
  }

  const formatReleaseDate = (value: string | null | undefined) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <Show when={!query.isLoading} fallback={
      <div class="h-full flex items-center justify-center">
        <p class="text-[var(--text-muted)]">Loading...</p>
      </div>
    }>
      <Show when={info()} fallback={
        <div class="h-full flex items-center justify-center">
          <Show when={query.isFetching} fallback={
            <p class="text-[var(--text-muted)]">Album not found</p>
          }>
            <div class="flex items-center gap-3 text-[var(--text-muted)]">
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Loading album...</span>
            </div>
          </Show>
        </div>
      }>
        {(albumInfo) => {
          const linkEntries = () => Object.entries(albumInfo().links).filter(([key]) => getLinkIcon(key))

          const descriptionSlot = (
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-1 text-base text-[var(--text-secondary)]">
                  <For each={albumInfo().artists}>
                  {(a) => (
                    <>
                      <A
                        href={artistRoute(a.mbid)}
                        class="text-[var(--text-primary)] font-semibold hover:underline"
                      >
                        {a.name}
                      </A>
                      <Show when={a.joinphrase}>
                        <span>{a.joinphrase}</span>
                      </Show>
                    </>
                  )}
                </For>
                </div>

              <div class="flex flex-wrap items-center gap-2 text-base text-[var(--text-muted)]">
                <Show when={albumInfo().trackCount}>
                  <span>{albumInfo().trackCount} tracks</span>
                </Show>
                <Show when={albumInfo().releaseDate}>
                  <span>&middot; {formatReleaseDate(albumInfo().releaseDate)}</span>
                </Show>
              </div>

              <Show when={linkEntries().length > 0}>
                <div class="flex flex-wrap gap-1">
                  <For each={linkEntries()}>
                    {([key, url]) => {
                      const Icon = getLinkIcon(key)!
                      return (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={linkLabel(key)}
                        >
                          <IconButton variant="soft" size="md" aria-label={linkLabel(key)}>
                            <Icon class="w-5 h-5" />
                          </IconButton>
                        </a>
                      )
                    }}
                  </For>
                </div>
              </Show>
            </div>
          )

          return (
            <div class="h-full overflow-y-auto max-w-5xl mx-auto w-full">
              <MediaHeader
                title={albumInfo().title}
                coverSrc={coverUrl()}
                description={descriptionSlot}
                onBack={() => navigate(-1)}
              />

              <div class="px-4 md:px-8 pb-5">
                <div class="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-4 py-3 md:px-6 md:py-4">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                    <div class="md:pr-6 md:border-r md:border-[var(--border-subtle)]">
                      <div class="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Listeners</div>
                      <div class="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] tabular-nums mt-1">
                        {uniqueListeners().toLocaleString()}
                      </div>
                    </div>
                    <div class="md:px-6 md:border-r md:border-[var(--border-subtle)]">
                      <div class="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Scrobbles</div>
                      <div class="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] tabular-nums mt-1">
                        {totalScrobbles().toLocaleString()}
                      </div>
                    </div>
                    <div class="md:pl-6">
                      <div class="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Ranking</div>
                      <div class="flex items-end gap-2 mt-1">
                        <div class="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] tabular-nums">
                          #{ranking().toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Show when={tracks().length > 0} fallback={
                <div class="px-8 py-12 text-center">
                  <p class="text-[var(--text-muted)] text-lg">No scrobbles found</p>
                  <p class="text-[var(--text-muted)] text-base mt-2">
                    Scrobble tracks from this album to see them here
                  </p>
                </div>
              }>
                <div class="px-4 md:px-8 pb-2">
                  <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-0">
                    Top tracks
                  </h2>
                </div>
                <TrackList
                  tracks={tracks()}
                  activeTrackId={playback.activeTrackId()}
                  selectedTrackId={playback.selectedTrackId()}
                  onTrackClick={(track) => playback.select(track)}
                  onTrackPlay={(track) => playback.play(track)}
                  showScrobbleCount={true}
                  showScrobbleStatus={false}
                  showDateAdded={false}
                  showDuration={true}
                  menuActions={menuActions}
                />
              </Show>
            </div>
          )
        }}
      </Show>
      <AddToPlaylistDialog
        open={plDialog.open()}
        onOpenChange={plDialog.setOpen}
        track={plDialog.track()}
      />
    </Show>
  )
}

function linkLabel(key: string): string {
  const labels: Record<string, string> = {
    spotify: 'Spotify',
  }
  return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

function getLinkIcon(key: string) {
  const icons: Record<string, typeof SpotifyLogo> = {
    spotify: SpotifyLogo,
  }
  return icons[key] ?? null
}
