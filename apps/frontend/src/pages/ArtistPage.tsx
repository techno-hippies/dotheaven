import { type Component, Show, For, createMemo } from 'solid-js'
import { useParams } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { MediaHeader, TrackList, IconButton } from '@heaven/ui'
import {
  Globe,
  Database,
  SpotifyLogo,
  SoundcloudLogo,
  XLogo,
  InstagramLogo,
  FacebookLogo,
} from '@heaven/ui/icons'
import { fetchArtistPageData, artistTracksToTracks, normalizeArtistVariants } from '../lib/heaven'
import { useTrackPlayback, usePlaylistDialog, buildMenuActions } from '../hooks/useTrackListActions'
import { usePlayer } from '../providers'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'

export const ArtistPage: Component = () => {
  const params = useParams<{ mbid: string }>()

  const player = usePlayer()
  const playback = useTrackPlayback()
  const plDialog = usePlaylistDialog()
  const menuActions = buildMenuActions(plDialog)

  const debugArtistCovers = () => localStorage.getItem('heaven:debug-artist-covers') === '1'
  const debugLocalPaths = [
    'Back in the U.S.S.R..mp3',
    'Dear Prudence.mp3',
    'Blackbird.mp3',
  ]

  const normalizeTitleKey = (title: string) => {
    if (!title) return ''
    return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
  }

  const query = createQuery(() => ({
    queryKey: ['artist', params.mbid],
    queryFn: () => fetchArtistPageData(params.mbid),
    enabled: !!params.mbid,
    staleTime: 5 * 60_000, // artist data is fairly stable
  }))

  const info = () => query.data?.info ?? null
  const localCoverMap = createMemo(() => {
    const map = new Map<string, string>()
    let total = 0
    let withCover = 0
    for (const t of player.tracks()) {
      total += 1
      if (debugArtistCovers() && t.filePath && debugLocalPaths.some((p) => t.filePath.endsWith(p))) {
        console.log('[Artist] local track', {
          filePath: t.filePath,
          title: t.title,
          artist: t.artist,
          album: t.album,
          albumCover: t.albumCover,
          coverPath: t.coverPath,
          coverCid: t.coverCid,
        })
      }
      if (!t.albumCover) continue
      withCover += 1
      const titleKey = normalizeTitleKey(t.title)
      if (!titleKey) continue
      const variants = normalizeArtistVariants(t.artist)
      for (const variant of variants) {
        map.set(`${variant}::${titleKey}`, t.albumCover)
      }
    }
    if (debugArtistCovers()) {
      const sample = Array.from(map.keys()).slice(0, 5)
      console.log('[Artist] local cover map', { total, withCover, keys: map.size, sample })
    }
    return map
  })

  const tracks = () => {
    const base = query.data ? artistTracksToTracks(query.data.tracks) : []
    const map = localCoverMap()
    let logged = 0
    return base.map((t) => {
      if (t.albumCover) return t
      const titleKey = normalizeTitleKey(t.title)
      const variants = normalizeArtistVariants(t.artist)
      let localCover: string | undefined
      let matchKey: string | undefined
      for (const variant of variants) {
        const key = `${variant}::${titleKey}`
        const hit = map.get(key)
        if (hit) {
          localCover = hit
          matchKey = key
          break
        }
      }
      if (debugArtistCovers() && logged < 10) {
        console.log('[Artist] cover lookup', {
          title: t.title,
          artist: t.artist,
          titleKey,
          variants: Array.from(variants),
          matchKey,
          hasLocalCover: !!localCover,
        })
        logged += 1
      }
      return localCover ? { ...t, albumCover: localCover } : t
    })
  }
  const totalScrobbles = () => query.data?.totalScrobbles ?? 0
  const uniqueListeners = () => query.data?.uniqueListeners ?? 0

  const imageUrl = () => {
    const i = info()
    if (!i) return undefined
    // Use Wikimedia Commons image if available from MusicBrainz links
    if (i.links.image) return i.links.image
    return undefined
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
            <p class="text-[var(--text-muted)]">Artist not found</p>
          }>
            <div class="flex items-center gap-3 text-[var(--text-muted)]">
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Loading artist...</span>
            </div>
          </Show>
        </div>
      }>
        {(artist) => {
          // External links slot for MediaHeader
          const linksSlot = (
            <Show when={Object.keys(artist().links).length > 0}>
              <div class="flex flex-wrap gap-2 mt-3">
                <For each={Object.entries(artist().links)}>
                  {([key, url]) => {
                    const Icon = getLinkIcon(key)
                    if (!Icon) return null
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={linkLabel(key)}
                      >
                        <IconButton variant="ghost" size="lg" aria-label={linkLabel(key)}>
                          <Icon class="w-6 h-6" />
                        </IconButton>
                      </a>
                    )
                  }}
                </For>
              </div>
            </Show>
          )

          return (
            <div class="h-full overflow-y-auto">
              <MediaHeader
                type="artist"
                title={artist().name}
                coverSrc={imageUrl()}
                description={linksSlot}
              />

              {/* Stats */}
              <div class="px-4 md:px-8 pb-6">
                {/* Stats boxes */}
              <div class="grid grid-cols-2 gap-4 max-w-md">
                <div class="bg-[var(--bg-elevated)] rounded-md p-4 text-center">
                  <div class="text-sm text-[var(--text-muted)] mb-1">Listeners</div>
                  <div class="text-2xl font-bold text-[var(--text-primary)]">
                    {uniqueListeners().toLocaleString()}
                  </div>
                </div>
                <div class="bg-[var(--bg-elevated)] rounded-md p-4 text-center">
                  <div class="text-sm text-[var(--text-muted)] mb-1">Scrobbles</div>
                  <div class="text-2xl font-bold text-[var(--text-primary)]">
                    {totalScrobbles().toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

              {/* Track list */}
            <Show when={tracks().length > 0} fallback={
              <div class="px-8 py-12 text-center">
                <p class="text-[var(--text-muted)] text-lg">No scrobbles found</p>
                <p class="text-[var(--text-muted)] text-sm mt-2">
                  Scrobble tracks by this artist to see them here
                </p>
              </div>
            }>
              <div class="px-4 md:px-8 pb-2">
                <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-2">
                  Popular tracks
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
                showDuration={false}
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
    website: 'Website',
    wikidata: 'Wikidata',
    spotify: 'Spotify',
    soundcloud: 'SoundCloud',
    twitter: 'X/Twitter',
    instagram: 'Instagram',
    facebook: 'Facebook',
    image: 'Image',
  }
  return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

function getLinkIcon(key: string) {
  const icons: Record<string, typeof Globe> = {
    website: Globe,
    wikidata: Database,
    spotify: SpotifyLogo,
    soundcloud: SoundcloudLogo,
    twitter: XLogo,
    instagram: InstagramLogo,
    facebook: FacebookLogo,
  }
  return icons[key] ?? null
}
