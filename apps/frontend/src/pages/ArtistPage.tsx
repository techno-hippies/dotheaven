import { type Component, Show, For, createMemo, createSignal, createEffect, createResource } from 'solid-js'
import { useParams } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { TrackList, IconButton, PageHero } from '@heaven/ui'
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
import { resolveImageUrl } from '../lib/image-cache'

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
    staleTime: 30_000,
    refetchInterval: 30_000, // live updates every 30s
  }))

  const info = () => query.data?.info ?? null
  const [heroImageIndex, setHeroImageIndex] = createSignal(0)
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
  const uniqueListeners = () => query.data?.uniqueListeners ?? 0

  const imageUrl = () => {
    const i = info()
    if (!i) return undefined
    // Use Wikimedia Commons image if available from MusicBrainz links
    if (i.links.image) return promoteWikimediaThumb(i.links.image, 1600)
    return undefined
  }

  // Rehost external images to IPFS automatically
  const [rehostedImageUrl] = createResource(imageUrl, resolveImageUrl)

  const heroImageCandidates = createMemo(() => {
    // Use rehosted IPFS URL if available, otherwise fallback to original
    const resolved = rehostedImageUrl()
    return resolved ? buildWikimediaImageCandidates(resolved) : buildWikimediaImageCandidates(imageUrl())
  })

  const heroImageSrc = () => heroImageCandidates()[heroImageIndex()]

  createEffect(() => {
    heroImageCandidates()
    setHeroImageIndex(0)
  })

  return (
    <Show when={!query.isLoading} fallback={
      <div class="h-full overflow-y-auto">
        {/* Skeleton loader */}
        <div class="pb-4">
          {/* Hero skeleton */}
          <div class="relative overflow-hidden h-[280px] md:h-[420px] bg-[var(--bg-elevated)] animate-pulse" />
        </div>
        {/* Track list skeleton */}
        <div class="px-4 md:px-8 pb-2">
          <div class="h-7 w-24 bg-[var(--bg-elevated)] rounded-md animate-pulse mb-2" />
        </div>
        <div class="px-4 md:px-8 space-y-2">
          {Array.from({ length: 8 }).map(() => (
            <div class="h-12 bg-[var(--bg-elevated)] rounded-md animate-pulse" />
          ))}
        </div>
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
          const artistInfo = () => artist()
          // External links slot for MediaHeader
          // Filter to only entries that have a known icon (excludes 'image' key etc.)
          const linkEntries = () => Object.entries(artistInfo().links).filter(([key]) => getLinkIcon(key))
          return (
            <div class="h-full overflow-y-auto">
              <div class="pb-4">
                <PageHero
                  title={artist().name}
                  background={
                    <Show when={!rehostedImageUrl.loading && heroImageSrc()} fallback={
                      <div class="absolute inset-0 bg-[var(--bg-elevated)] animate-pulse" />
                    }>
                      {(src) => (
                        <img
                          src={src()}
                          alt={artist().name}
                          class="absolute inset-0 w-full h-full object-cover"
                          referrerpolicy="no-referrer"
                          crossorigin="anonymous"
                          onError={() => {
                            const next = heroImageIndex() + 1
                            if (next < heroImageCandidates().length) setHeroImageIndex(next)
                          }}
                        />
                      )}
                    </Show>
                  }
                  subtitle={<>{uniqueListeners().toLocaleString()} listeners</>}
                  actions={
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
                  }
                />
              </div>

              {/* Track list */}
            <Show when={tracks().length > 0} fallback={
              <div class="px-8 py-12 text-center">
                <p class="text-[var(--text-muted)] text-lg">No scrobbles found</p>
                <p class="text-[var(--text-muted)] text-base mt-2">
                  Scrobble tracks by this artist to see them here
                </p>
              </div>
            }>
              <div class="px-4 md:px-8 pb-2">
                <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-0">
                  Popular
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
                showArtist={false}
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

function promoteWikimediaThumb(url: string, width = 1600): string {
  if (!url.includes('/wikipedia/commons/thumb/')) return url
  return url.replace(/\/\d+px-/, `/${width}px-`)
}

function buildWikimediaImageCandidates(url?: string): string[] {
  if (!url) return []

  const out = new Set<string>()
  out.add(url)

  if (url.includes('/wikipedia/commons/thumb/')) {
    out.add(promoteWikimediaThumb(url, 1600))
    out.add(promoteWikimediaThumb(url, 1200))

    const original = url
      .replace('/wikipedia/commons/thumb/', '/wikipedia/commons/')
      .replace(/\/\d+px-[^/]+$/, '')
    out.add(original)

    const filename = original.split('/').pop()
    if (filename) {
      out.add(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1600`)
      out.add(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1200`)
    }
  }

  return Array.from(out)
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
