import { type Component, Show, For, createMemo, createSignal, createEffect, createResource } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { TrackList, IconButton, Tabs, type TabItem } from '@heaven/ui'
import { publicProfile } from '@heaven/core'
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
import { usePeerNames } from '../lib/hooks/usePeerName'
import { usePlayer } from '../providers'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'
import { resolveImageUrl } from '../lib/image-cache'
import { MediaBackBar } from '../components/library/media-back-bar'

type ArtistTab = 'top' | 'leaderboard'

const artistTabs: TabItem[] = [
  { id: 'top', label: 'Top songs' },
  { id: 'leaderboard', label: 'Leaderboard' },
]

const artistScrobbleFormatter = new Intl.NumberFormat()

function formatLeaderboardName(address: string, label?: string): { label: string; title: string } {
  const fallback = `${address.slice(0, 6)}...${address.slice(-4)}`
  const resolved = label?.trim()

  if (!resolved) {
    return { label: fallback, title: address }
  }

  const isFullAddress = resolved === address
  return {
    label: resolved,
    title: isFullAddress ? address : resolved,
  }
}

export const ArtistPage: Component = () => {
  const params = useParams<{ mbid: string }>()
  const navigate = useNavigate()

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
      const albumKey = normalizeTitleKey(t.album || '')
      const variants = normalizeArtistVariants(t.artist)

      for (const variant of variants) {
        map.set(`${variant}::${titleKey}`, t.albumCover)
        if (albumKey) {
          map.set(`${variant}::${albumKey}::${titleKey}`, t.albumCover)
        }
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
      const titleKey = normalizeTitleKey(t.title)
      const albumKey = normalizeTitleKey(t.album || '')
      const variants = normalizeArtistVariants(t.artist)

      let localCover: string | undefined
      let matchKey: string | undefined

      for (const variant of variants) {
        const albumMatchKey = albumKey ? `${variant}::${albumKey}::${titleKey}` : undefined
        const albumHit = albumMatchKey ? map.get(albumMatchKey) : undefined
        if (albumHit) {
          localCover = albumHit
          matchKey = albumMatchKey
          break
        }

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
          album: t.album,
          titleKey,
          albumKey,
          variants: Array.from(variants),
          matchKey,
          hasLocalCover: !!localCover,
          hasOnchainCover: !!t.albumCover,
        })
        logged += 1
      }

      if (localCover) return { ...t, albumCover: localCover }
      return t
    })
  }

  const uniqueListeners = () => query.data?.uniqueListeners ?? 0
  const totalScrobbles = () => query.data?.totalScrobbles ?? 0
  const leaderboard = () => query.data?.leaderboard ?? []
  const [activeTab, setActiveTab] = createSignal<ArtistTab>('top')
  const leaderboardUsers = () => [...new Set(leaderboard().map((entry) => entry.user))]
  const peerNames = usePeerNames(leaderboardUsers)

  const imageUrl = () => {
    const i = info()
    if (!i) return undefined
    // Use Wikimedia Commons image if available from MusicBrainz links
    if (i.links.image) return promoteWikimediaThumb(i.links.image, 1600)
    return undefined
  }

  // Rehost external images to IPFS automatically
  const [rehostedImageUrl] = createResource(imageUrl, resolveImageUrl)

  const localArtistImage = createMemo(() => {
    const firstWithCover = tracks().find((t) => !!t.albumCover)
    return firstWithCover?.albumCover
  })

  const heroImageCandidates = createMemo(() => {
    // Use rehosted IPFS URL if available, otherwise fallback to original
    const resolved = rehostedImageUrl()
    const remoteCandidates = resolved ? buildWikimediaImageCandidates(resolved) : buildWikimediaImageCandidates(imageUrl())
    if (remoteCandidates.length > 0) return remoteCandidates

    // Fallback: if artist image is missing, use local/on-chain album cover from the track list.
    const local = localArtistImage()
    return local ? [local] : []
  })

  const heroImageSrc = () => heroImageCandidates()[heroImageIndex()]

  createEffect(() => {
    heroImageCandidates()
    setHeroImageIndex(0)
  })

  return (
    <div class="h-full overflow-y-auto">
      <MediaBackBar title="Artist" onBack={() => navigate(-1)} />

      <div class="max-w-5xl mx-auto w-full">
        <Show when={!query.isLoading} fallback={
          <div class="px-4 md:px-8 py-6">
            <div class="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 overflow-hidden">
              <div class="h-[220px] md:h-[320px] bg-[var(--bg-elevated)] animate-pulse" />
              <div class="p-4 md:p-6 space-y-3">
                <div class="h-3 w-20 bg-[var(--bg-elevated)] rounded animate-pulse" />
                <div class="h-10 w-2/3 bg-[var(--bg-elevated)] rounded animate-pulse" />
                <div class="h-5 w-56 bg-[var(--bg-elevated)] rounded animate-pulse" />
              </div>
            </div>
            <div class="mt-6 space-y-2">
              {Array.from({ length: 8 }).map(() => (
                <div class="h-12 bg-[var(--bg-elevated)] rounded-md animate-pulse" />
              ))}
            </div>
          </div>
        }>
          <Show when={info()} fallback={
            <div class="min-h-[260px] py-20 flex items-center justify-center">
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
              // Filter to only entries that have a known icon (excludes 'image' key etc.)
              const linkEntries = () => Object.entries(artistInfo().links).filter(([key]) => getLinkIcon(key))

              return (
                <>
                  <div class="px-4 md:px-8 py-6">
                    <div class="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 overflow-hidden">
                      <div class="relative h-[220px] md:h-[320px]">
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
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/15" />
                      </div>

                      <div class="px-4 py-4 md:px-6 md:py-5">
                        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                          <div class="min-w-0">
                            <div class="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Artist</div>
                            <h1 class="mt-2 text-2xl md:text-4xl font-bold leading-tight text-[var(--text-primary)]">
                              {artist().name}
                            </h1>
                            <div class="mt-2 flex flex-wrap items-center gap-2 text-base text-[var(--text-secondary)]">
                              <span>{uniqueListeners().toLocaleString()} listeners</span>
                              <span>&middot;</span>
                              <span>{totalScrobbles().toLocaleString()} scrobbles</span>
                            </div>
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
                      </div>
                    </div>
                  </div>

                  <Tabs
                    tabs={artistTabs}
                    activeTab={activeTab()}
                    onTabChange={(tabId) => setActiveTab(tabId as ArtistTab)}
                    class="mt-2"
                  />

                  <Show when={activeTab() === 'top'}>
                    <Show when={tracks().length > 0} fallback={
                      <div class="px-4 md:px-8 py-12 text-center">
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
                  </Show>

                  <Show when={activeTab() === 'leaderboard'}>
                    <Show when={leaderboard().length > 0} fallback={
                      <div class="px-4 md:px-8 py-12 text-center">
                        <p class="text-[var(--text-muted)] text-lg">No listener leaderboard yet</p>
                        <p class="text-[var(--text-muted)] text-base mt-2">
                          Scrobble tracks by this artist for listeners to appear here
                        </p>
                      </div>
                    }>
                      <div class="px-4 md:px-8 py-2">
                        <div class="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 overflow-hidden">
                          <div class="px-4 md:px-6 py-3 border-b border-[var(--border-subtle)]">
                            <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-0">
                              Top listeners
                            </h2>
                          </div>

                          <div class="divide-y divide-[var(--border-subtle)]">
                            <For each={leaderboard()}>
                              {(entry, index) => (
                                <div class="px-4 md:px-6 py-3 grid grid-cols-[3rem_1fr_auto] gap-3 items-center">
                                  <div class="text-base text-[var(--text-muted)]">#{index() + 1}</div>
                                  <button
                                    type="button"
                                    class="text-base text-[var(--text-primary)] truncate hover:underline text-left"
                                    title={formatLeaderboardName(entry.user, peerNames.get(entry.user)?.displayName).title}
                                    onClick={() => navigate(publicProfile(entry.user))}
                                  >
                                    {formatLeaderboardName(entry.user, peerNames.get(entry.user)?.displayName).label}
                                  </button>
                                  <div class="text-sm text-[var(--text-secondary)] text-right whitespace-nowrap">
                                    {artistScrobbleFormatter.format(entry.scrobbles)} scrobbles
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        </div>
                      </div>
                    </Show>
                  </Show>
                </>
              )
            }}
          </Show>

          <AddToPlaylistDialog
            open={plDialog.open()}
            onOpenChange={plDialog.setOpen}
            track={plDialog.track()}
          />
        </Show>
      </div>
    </div>
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
