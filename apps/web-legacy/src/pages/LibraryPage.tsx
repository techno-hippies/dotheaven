import { type Component, createSignal, createMemo, For, Show, onCleanup, createEffect, createResource } from 'solid-js'
import {
  AlbumCover,
  TrackList,
  IconButton,
  Button,
  PageHeader,
  PageHero,
  FilterSortBar,
  SongPublishForm,
  PUBLISH_STEPS,
  isPublishFormStep,
  isPublishNextDisabled,
  useIsMobile,
  type SongFormData,
  type PublishStep,
  type Track,
} from '@heaven/ui'
import { musicTab, MUSIC } from '@heaven/core'
import { ChevronLeft, CloudFill } from '@heaven/ui/icons'
import { useParams, useNavigate } from '@solidjs/router'
import { type LocalTrack } from '../lib/local-music'
import { usePlayer, useAuth } from '../providers'
import { usePlaylistDialog, buildMenuActions } from '../hooks/useTrackListActions'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'
// TODO: Re-add share functionality via TrackList menu actions
// import { ShareContentDialog } from '../components/ShareContentDialog'
import { jobs } from '../lib/upload-manager'
import { fetchUploadedContent, fetchSharedContent, type SharedContentEntry } from '../lib/heaven/scrobbles'
import { fetchSharedPlaylists, type PlaylistShareEntry } from '../lib/heaven/playlists'
import { mapUploadedToTracks, mapSharedToTracks, buildEntriesMap, handleEncryptedTrackPlay } from './library-utils'
import { publishSong, type PublishResult } from '../lib/heaven/song-publish'
import { getStorageStatus } from '../lib/storage-service'
import { resolveCoverUrl } from '../lib/heaven/cover-ref'
import { getPrimaryNamesBatch } from '../lib/heaven/registry'

type LibraryTab = 'library' | 'cloud' | 'shared' | 'publish'
type LibraryFilter = 'all' | 'local' | 'cloud'
type LibrarySortField = 'recent' | 'title' | 'artist' | 'album'

const filterLabels: Record<LibraryFilter, string> = { all: 'All', local: 'On device', cloud: 'Cloud' }
const sortFieldLabels: Record<LibrarySortField, string> = { recent: 'Recent', title: 'Title', artist: 'Artist', album: 'Album' }

// Process-lifetime cache to avoid flickery loaders when navigating between tabs/routes.
const sharedPlaylistsCacheByAddr = new Map<string, PlaylistShareEntry[]>()
const sharedTracksCacheByAddr = new Map<string, SharedContentEntry[]>()

function sharedSeenStorageKey(addr: string) {
  return `heaven:shared:last-seen:${addr.toLowerCase()}`
}

export const LibraryPage: Component = () => {
  const player = usePlayer()
  const auth = useAuth()
  const isMobile = useIsMobile()
  const params = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const plDialog = usePlaylistDialog()

  // Get tab from route params, default to library
  const tab = createMemo<LibraryTab>(() => {
    const t = params.tab
    if (t === 'library') return 'library'
    if (t === 'cloud') return 'cloud'
    if (t === 'shared') return 'shared'
    if (t === 'publish') return 'publish'
    // Default: unified library view
    return 'library'
  })

  // ── Publish form state ──────────────────────────────────────────
  const defaultFormData: SongFormData = {
    title: '',
    artist: '',
    genre: '',
    primaryLanguage: '',
    secondaryLanguage: '',
    lyrics: '',
    coverFile: null,
    audioFile: null,
    vocalsFile: null,
    instrumentalFile: null,
    canvasFile: null,
    license: 'non-commercial',
    revShare: 10,
    mintingFee: '0',
    attestation: false,
    publishType: 'original',
    parentIpIds: [],
    licenseTermsIds: [],
  }

  const [publishStep, setPublishStep] = createSignal<PublishStep>('song')
  const [publishForm, setPublishForm] = createSignal<SongFormData>({ ...defaultFormData })
  const [publishProgress, setPublishProgress] = createSignal(0)
  const [publishError, setPublishError] = createSignal<string | undefined>()
  const [publishResult, setPublishResult] = createSignal<PublishResult | undefined>()

  const publishSteps: PublishStep[] = ['song', 'canvas', 'details', 'license']

  const handlePublishNext = () => {
    const idx = publishSteps.indexOf(publishStep())
    if (idx < publishSteps.length - 1) setPublishStep(publishSteps[idx + 1])
  }

  const handlePublishBack = () => {
    if (publishStep() === 'error') { setPublishStep('license'); return }
    const idx = publishSteps.indexOf(publishStep())
    if (idx > 0) setPublishStep(publishSteps[idx - 1])
  }

  const handlePublishSkip = () => {
    if (publishStep() === 'canvas') setPublishStep('details')
  }

  const handlePublish = async () => {
    setPublishStep('publishing')
    setPublishProgress(0)
    setPublishError(undefined)
    try {
      const pkp = auth.pkpInfo()
      if (!pkp) throw new Error('Not authenticated — sign in first')
      const authContext = await auth.getAuthContext()
      const result = await publishSong(
        publishForm(), authContext, pkp,
        (pct) => setPublishProgress(pct),
      )
      setPublishResult(result)
      setPublishStep('success')
    } catch (err: any) {
      console.error('[Publish] Failed:', err)
      setPublishError(err?.message || 'Publishing failed')
      setPublishStep('error')
    }
  }

  const handlePublishDone = () => {
    setPublishStep('song')
    setPublishForm({ ...defaultFormData })
    setPublishProgress(0)
    setPublishError(undefined)
    setPublishResult(undefined)
    navigate(musicTab('library'))
    // Refetch after delays to allow subgraph indexing
    setTimeout(() => refetchUploaded(), 3000)
    setTimeout(() => refetchUploaded(), 8000)
    setTimeout(() => refetchUploaded(), 15000)
  }

  // Redirect bare /music/:tab to /music/library if no tab specified
  createEffect(() => {
    if (!params.tab) {
      navigate(musicTab('library'), { replace: true })
    }
  })

  // Uploaded tracks — fetched from subgraph (cross-device)
  const [uploadedTracks, { refetch: refetchUploaded }] = createResource(
    () => auth.pkpInfo()?.ethAddress,
    (addr) => fetchUploadedContent(addr),
  )

  // Shared with me — content others granted access to
  const [sharedPlaylists, { refetch: refetchSharedPlaylists }] = createResource(
    () => auth.pkpInfo()?.ethAddress,
    (addr) => fetchSharedPlaylists(addr),
  )

  const [sharedTracks, { refetch: refetchSharedTracks }] = createResource(
    () => auth.pkpInfo()?.ethAddress,
    (addr) => fetchSharedContent(addr),
  )

  // Convert uploaded/shared entries to Track[] for TrackList
  const uploadedTracksAsTrack = createMemo<Track[]>(() => mapUploadedToTracks(uploadedTracks() ?? []))
  const uploadedEntriesMap = createMemo(() => buildEntriesMap(uploadedTracks() ?? []))
  const sharedAddr = createMemo(() => auth.pkpInfo()?.ethAddress?.toLowerCase())

  const sharedPlaylistsValue = createMemo<PlaylistShareEntry[]>(() => {
    const addr = sharedAddr()
    return sharedPlaylists() ?? (addr ? sharedPlaylistsCacheByAddr.get(addr) : undefined) ?? []
  })

  const sharedTracksEntries = createMemo<SharedContentEntry[]>(() => {
    const addr = sharedAddr()
    return sharedTracks() ?? (addr ? sharedTracksCacheByAddr.get(addr) : undefined) ?? []
  })

  createEffect(() => {
    const addr = sharedAddr()
    const v = sharedPlaylists()
    if (!addr || v === undefined) return
    sharedPlaylistsCacheByAddr.set(addr, v)
  })

  createEffect(() => {
    const addr = sharedAddr()
    const v = sharedTracks()
    if (!addr || v === undefined) return
    sharedTracksCacheByAddr.set(addr, v)
  })

  // Mark shared items as seen when user opens the Shared tab.
  createEffect(() => {
    if (tab() !== 'shared') return
    const addr = sharedAddr()
    if (!addr) return
    const latestGrant = sharedTracksEntries().reduce((mx, e) => Math.max(mx, e.grantedAt || e.uploadedAt || 0), 0)
    const nowSec = Math.floor(Date.now() / 1000)
    const seenAt = Math.max(nowSec, latestGrant)
    localStorage.setItem(sharedSeenStorageKey(addr), String(seenAt))
  })

  const sharedBusy = createMemo(() => !!sharedPlaylists.loading || !!sharedTracks.loading)

  const sharedTracksAsTrack = createMemo<Track[]>(() => mapSharedToTracks(sharedTracksEntries()))
  const sharedEntriesMap = createMemo(() => buildEntriesMap(sharedTracksEntries()))
  const sharedOwnerKey = createMemo(() => {
    return [...new Set(
      sharedPlaylistsValue()
        .map((s) => s.owner.toLowerCase())
        .filter((a) => /^0x[0-9a-f]{40}$/.test(a)),
    )]
      .sort()
      .join(',')
  })

  const [sharedOwnerLabels] = createResource<Record<string, string>, string>(
    sharedOwnerKey,
    async (key) => {
      if (!key) return {}
      const addresses = key.split(',').filter(Boolean) as `0x${string}`[]
      const rows = await getPrimaryNamesBatch(addresses)
      const out: Record<string, string> = {}
      for (const row of rows) {
        if (row.fullName) out[row.address.toLowerCase()] = row.fullName
      }
      return out
    },
    { initialValue: {} },
  )

  const sharedOwnerDisplay = (owner: string) => {
    const key = owner.toLowerCase()
    const resolved = sharedOwnerLabels()?.[key]
    if (resolved) return resolved
    return `${owner.slice(0, 6)}...${owner.slice(-4)}`
  }

  // Filter & sort state for unified library
  const [libraryFilter, setLibraryFilter] = createSignal<LibraryFilter>('all')
  const [librarySortField, setLibrarySortField] = createSignal<LibrarySortField>('recent')

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  const sortedTracks = createMemo<LocalTrack[]>(() => player.tracks())

  // Combined tracks for unified library view (local + cloud, deduped)
  const libraryTracks = createMemo<Track[]>(() => {
    const local = sortedTracks() as Track[]
    const cloud = uploadedTracksAsTrack()
    const filter = libraryFilter()
    const seen = new Set<string>()
    const combined: Track[] = []

    if (filter !== 'cloud') {
      for (const t of local) {
        const key = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`
        if (!seen.has(key)) {
          seen.add(key)
          combined.push(t)
        }
      }
    }
    if (filter !== 'local') {
      for (const t of cloud) {
        const key = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`
        if (!seen.has(key)) {
          seen.add(key)
          combined.push(t)
        }
      }
    }

    // Apply sort
    const sf = librarySortField()
    if (sf !== 'recent') {
      combined.sort((a, b) => {
        const aVal = (sf === 'title' ? a.title : sf === 'artist' ? a.artist : a.album) ?? ''
        const bVal = (sf === 'title' ? b.title : sf === 'artist' ? b.artist : b.album) ?? ''
        return collator.compare(aVal, bVal)
      })
    }

    return combined
  })

  // Refetch when new uploads complete (with delay for subgraph indexing)
  let lastDoneCount = 0
  createEffect(() => {
    const j = jobs()
    const doneCount = j.filter((job) => job.step === 'done').length
    if (doneCount > lastDoneCount) {
      lastDoneCount = doneCount
      // Subgraph needs time to index — refetch after short delays
      setTimeout(() => refetchUploaded(), 3000)
      setTimeout(() => refetchUploaded(), 8000)
      setTimeout(() => refetchUploaded(), 15000)
    }
  })

  // ── Storage state (cloud tab) ──────────────────────────────────────
  let storageRefreshInflight = false
  async function refreshStorage() {
    const pkp = auth.pkpInfo()
    if (!pkp || storageRefreshInflight) return
    storageRefreshInflight = true
    try {
      const authCtx = await auth.getAuthContext()
      await getStorageStatus(pkp, authCtx)
    } catch (e) {
      console.error('[Library] Storage status error:', e)
    } finally {
      storageRefreshInflight = false
    }
  }

  // Load storage status when authenticated and on cloud/library tab
  createEffect(() => {
    if (auth.isAuthenticated() && auth.pkpInfo() && (tab() === 'cloud' || tab() === 'library')) {
      refreshStorage()
    }
  })

  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement | undefined>(undefined)
  let pendingScrollEl: HTMLDivElement | undefined
  const setScrollRefEl = (el: HTMLDivElement | undefined) => {
    pendingScrollEl = el
    if (!el) {
      setScrollRef(undefined)
      return
    }
    if (el.isConnected) {
      setScrollRef(el)
      return
    }
    requestAnimationFrame(() => {
      if (pendingScrollEl !== el) return
      if (el.isConnected) {
        setScrollRef(el)
      }
    })
  }
  let scrollRaf = 0
  const handleScroll = () => {
    const el = scrollRef()
    if (!el) return
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0
      player.setLibraryScrollTop(el.scrollTop)
    })
  }

  let restored = false
  createEffect(() => {
    const el = scrollRef()
    if (!el || restored || player.tracks().length === 0) return
    restored = true
    requestAnimationFrame(() => {
      const next = scrollRef()
      if (!next) return
      next.scrollTop = player.libraryScrollTop()
      next.dispatchEvent(new Event('scroll'))
    })
  })
  onCleanup(() => {
    if (scrollRaf) cancelAnimationFrame(scrollRaf)
    setScrollRefEl(undefined)
    restored = false
  })

  const menuActionsLocal = buildMenuActions(plDialog, {
    onIdentify: () => {
      window.open('https://picard.musicbrainz.org/', '_blank')
    },
    onUploadToFilecoin: undefined,
  })

  const menuActionsCloud = buildMenuActions(plDialog)
  const menuActionsShared = buildMenuActions(plDialog)

  return (
    <div
      ref={setScrollRefEl}
      onScroll={handleScroll}
      class="h-full overflow-y-auto"
    >
      {/* ── Unified Library tab ──────────────────────────────────────── */}
      <Show when={tab() === 'library'}>
        {/* Mobile: compact header bar — full-width border */}
        <Show when={isMobile()}>
          <div class="border-b border-[var(--border-subtle)]">
            <div class="max-w-4xl mx-auto w-full px-4 md:px-8">
              <PageHeader
                compact
                title="Library"
                class="border-b-0 !px-0"
                leftSlot={
                  <IconButton variant="soft" size="md" aria-label="Back" onClick={() => navigate(MUSIC)}>
                    <ChevronLeft class="w-5 h-5" />
                  </IconButton>
                }
                rightSlot={
                  <IconButton variant="soft" size="md" aria-label="Refresh cloud status" onClick={() => void refreshStorage()}>
                    <CloudFill class="w-5 h-5" />
                  </IconButton>
                }
              />
            </div>
          </div>
        </Show>

        {/* Desktop: full gradient hero */}
        <Show when={!isMobile()}>
          <PageHero
            title="Library"
            backgroundStyle={{ background: 'linear-gradient(135deg, #312e81 0%, #5b21b6 40%, #7c3aed 70%, #6d28d9 100%)' }}
            subtitle={<>{(sortedTracks() as Track[]).length.toLocaleString()} local, {uploadedTracksAsTrack().length.toLocaleString()} cloud</>}
            actions={
              <Button variant="secondary" icon={<CloudFill class="w-5 h-5" />} onClick={() => void refreshStorage()} class="!bg-white/15 !border-white/25 !text-white hover:!bg-white/25">
                Refresh Storage
              </Button>
            }
          />
        </Show>

        <div class="max-w-4xl mx-auto w-full px-4 md:px-8">
        <FilterSortBar
          filter={libraryFilter()}
          filterLabels={filterLabels}
          onFilterChange={setLibraryFilter}
          sortField={librarySortField()}
          sortLabels={sortFieldLabels}
          onSortChange={setLibrarySortField}
        />

        <Show
          when={libraryTracks().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
              <p class="text-base">No songs in your library yet</p>
            </div>
          }
        >
          <TrackList
            tracks={libraryTracks()}
            artistBelowTitle
            showRowNumbers={false}
            activeTrackId={player.currentTrack()?.id}
            activeTrackPlaying={player.isPlaying()}
            onTrackClick={(track) => player.setSelectedTrackId(track.id)}
            onTrackPlay={(track) => {
              const idx = player.tracks().findIndex((t) => t.id === track.id)
              if (idx >= 0) { player.playTrack(idx); return }
              handleEncryptedTrackPlay(track, uploadedEntriesMap(), player)
            }}
            menuActions={menuActionsLocal}
          />
        </Show>
        </div>
      </Show>

      {/* ── Shared with Me tab ──────────────────────────────────────── */}
      <Show when={tab() === 'shared'}>
        {/* Header — full-width border, content constrained */}
        <div class="border-b border-[var(--border-subtle)]">
          <div class="max-w-4xl mx-auto w-full px-4 md:px-8">
            <PageHeader
              compact
              title="Shared with Me"
              class="border-b-0 bg-transparent !px-0"
              leftSlot={
                <IconButton variant="soft" size="md" aria-label="Back" onClick={() => navigate(MUSIC)}>
                  <ChevronLeft class="w-5 h-5" />
                </IconButton>
              }
              rightSlot={
                <div class="flex items-center gap-2">
                  <Show
                    when={!sharedBusy()}
                    fallback={
                      <span class="h-9 w-9 inline-flex items-center justify-center text-[var(--text-muted)]">
                        <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      </span>
                    }
                  >
                    <IconButton
                      variant="soft"
                      size="md"
                      aria-label="Refresh shared"
                      onClick={() => {
                        refetchSharedPlaylists()
                        refetchSharedTracks()
                      }}
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M20 9a8 8 0 00-14.828-3M4 15a8 8 0 0014.828 3" />
                      </svg>
                    </IconButton>
                  </Show>
                </div>
              }
            />
          </div>
        </div>

        <div class="max-w-4xl mx-auto w-full px-4 md:px-8">
          {/* Shared playlists */}
          <Show when={sharedPlaylistsValue().length > 0}>
            <div class="py-6">
              <div class="text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">Playlists</div>
              <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <For each={sharedPlaylistsValue()}>{(s) => (
                  <button
                    type="button"
                    class="w-full flex items-center gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 hover:bg-[var(--bg-highlight-hover)] transition-colors px-4 py-4 text-left"
                    onClick={() => navigate(`/playlist/${s.playlist.id}?th=${s.tracksHash}&pv=${s.playlistVersion}`)}
                  >
                    <AlbumCover
                      src={resolveCoverUrl(s.playlist.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 })}
                      icon="playlist"
                      class="w-14 h-14 flex-shrink-0"
                    />
                    <div class="min-w-0">
                      <div class="text-base font-semibold text-[var(--text-primary)] truncate">{s.playlist.name || 'Playlist'}</div>
                      <div class="text-sm text-[var(--text-muted)] truncate">
                        {s.trackCount} tracks · shared by {sharedOwnerDisplay(s.owner)}
                      </div>
                    </div>
                  </button>
                )}</For>
              </div>
            </div>
          </Show>

          <div class="h-6" />

          <Show when={sharedTracksAsTrack().length > 0}>
            <TrackList
              tracks={sharedTracksAsTrack()}
              showAlbum={false}
              showSharedBy
              showDateAdded
              forceCompact
              activeTrackId={player.currentTrack()?.id}
              activeTrackPlaying={player.isPlaying()}
              onTrackClick={(track) => player.setSelectedTrackId(track.id)}
              onTrackPlay={(track) => handleEncryptedTrackPlay(track, sharedEntriesMap(), player)}
              menuActions={menuActionsShared}
            />
          </Show>
          <Show when={!sharedTracks.loading && sharedTracksAsTrack().length === 0}>
            <div class="flex items-start justify-center pt-6">
              <p class="text-base text-[var(--text-muted)]">Songs shared to you appear here</p>
            </div>
          </Show>
        </div>
      </Show>

      {/* Publish tab */}
      <Show when={tab() === 'publish'}>
        <div class="flex flex-col min-h-full">
          <div class="flex-1 max-w-2xl mx-auto w-full py-8 px-4">
            <SongPublishForm
              step={publishStep()}
              formData={publishForm()}
              onFormChange={(partial) => setPublishForm((prev) => ({ ...prev, ...partial }))}
              onNext={handlePublishNext}
              onBack={handlePublishBack}
              onSkip={handlePublishSkip}
              onPublish={handlePublish}
              onDone={handlePublishDone}
              progress={publishProgress()}
              error={publishError()}
              result={publishResult()}
            />
          </div>
          {/* Footer — border full width, buttons constrained */}
          <Show when={isPublishFormStep(publishStep())}>
            <div class="sticky bottom-0 border-t border-[var(--border-subtle)] bg-[var(--bg-page)]">
              <div class="max-w-2xl mx-auto w-full px-4 py-4 flex items-center gap-3">
                <Show when={PUBLISH_STEPS.indexOf(publishStep()) > 0}>
                  <Button variant="secondary" onClick={handlePublishBack} class="flex-1">
                    Back
                  </Button>
                </Show>
                <Show
                  when={publishStep() !== 'license'}
                  fallback={
                    <Button disabled={isPublishNextDisabled(publishStep(), publishForm())} onClick={handlePublish} class="flex-1">
                      Publish Song
                    </Button>
                  }
                >
                  <Button disabled={isPublishNextDisabled(publishStep(), publishForm())} onClick={handlePublishNext} class="flex-1">
                    Next
                  </Button>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Cloud tab */}
      <Show when={tab() === 'cloud'}>
        {/* Header — full-width border, content constrained */}
        <div class="border-b border-[var(--border-subtle)]">
          <div class="max-w-4xl mx-auto w-full px-4 md:px-8">
            <PageHeader
              compact
              title="Cloud Library"
              class="border-b-0 bg-transparent !px-0"
              leftSlot={
                <IconButton variant="soft" size="md" aria-label="Back" onClick={() => navigate(MUSIC)}>
                  <ChevronLeft class="w-5 h-5" />
                </IconButton>
              }
              rightSlot={
                <IconButton variant="soft" size="md" aria-label="Refresh cloud status" onClick={() => void refreshStorage()}>
                  <CloudFill class="w-5 h-5" />
                </IconButton>
              }
            />
          </div>
        </div>

        <div class="max-w-4xl mx-auto w-full px-4 md:px-8">
        <Show when={uploadedTracks.loading}>
          <div class="flex items-center justify-center py-20 text-[var(--text-muted)]">
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Loading uploads...</span>
            </div>
          </div>
        </Show>
        <Show when={!uploadedTracks.loading}>
          <Show when={scrollRef()}>
            {(el) => (
              <TrackList
                tracks={uploadedTracksAsTrack()}
                showDateAdded
                activeTrackId={player.currentTrack()?.id}
                activeTrackPlaying={player.isPlaying()}
                selectedTrackId={player.selectedTrackId() || undefined}
                scrollRef={el()}
                enableDrag
                onTrackClick={(track) => player.setSelectedTrackId(track.id)}
                onTrackPlay={(track) => handleEncryptedTrackPlay(track, uploadedEntriesMap(), player)}
                menuActions={menuActionsCloud}
              />
            )}
          </Show>
        </Show>
        </div>

      </Show>
      <AddToPlaylistDialog
        open={plDialog.open()}
        onOpenChange={plDialog.setOpen}
        track={plDialog.track()}
      />
    </div>
  )
}
