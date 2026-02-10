import { type Component, createSignal, createMemo, Show, onCleanup, createEffect, createResource } from 'solid-js'
import {
  MediaHeader,
  TrackList,
  IconButton,
  Button,
  PlayButton,
  PageHeader,
  PageHero,
  FilterSortBar,
  SongPublishForm,
  AddFundsDialog,
  useIsMobile,
  type SongFormData,
  type PublishStep,
  type Track,
  type SortField,
  type SortState,
} from '@heaven/ui'
import { musicTab, MUSIC } from '@heaven/core'
import { ChevronLeft, Wallet, CloudFill } from '@heaven/ui/icons'
import { usePlatform } from 'virtual:heaven-platform'
import { useParams, useNavigate } from '@solidjs/router'
import { pickFolder, type LocalTrack } from '../lib/local-music'
import { usePlayer, useAuth } from '../providers'
import { usePlaylistDialog, buildMenuActions } from '../hooks/useTrackListActions'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'
// TODO: Re-add share functionality via TrackList menu actions
// import { ShareContentDialog } from '../components/ShareContentDialog'
import { enqueueUpload, jobs } from '../lib/upload-manager'
import { initFilecoinUploadService } from '../lib/filecoin-upload-service'
import { fetchUploadedContent, fetchSharedContent } from '../lib/heaven/scrobbles'
import { mapUploadedToTracks, mapSharedToTracks, buildEntriesMap, handleEncryptedTrackPlay } from './library-utils'
import { publishSong, type PublishResult } from '../lib/heaven/song-publish'
import { getStorageStatus, depositAndApprove, type StorageStatus } from '../lib/storage-service'

type LibraryTab = 'library' | 'local' | 'cloud' | 'shared' | 'publish'
type LibraryFilter = 'all' | 'local' | 'cloud'
type LibrarySortField = 'recent' | 'title' | 'artist' | 'album'

const filterLabels: Record<LibraryFilter, string> = { all: 'All', local: 'On device', cloud: 'Cloud' }
const sortFieldLabels: Record<LibrarySortField, string> = { recent: 'Recent', title: 'Title', artist: 'Artist', album: 'Album' }

export const LibraryPage: Component = () => {
  const platform = usePlatform()
  const player = usePlayer()
  const auth = useAuth()
  const isMobile = useIsMobile()
  const params = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const plDialog = usePlaylistDialog()

  // Initialize upload service once (idempotent — setQueueProcessor just replaces the fn)
  if (platform.isTauri) {
    initFilecoinUploadService({
      getAuthContext: () => auth.getAuthContext(),
      getPkp: () => auth.pkpInfo(),
    })
  }

  // Get tab from route params, default to library
  const tab = createMemo<LibraryTab>(() => {
    const t = params.tab
    if (t === 'library') return 'library'
    if (t === 'local' && platform.isTauri) return 'local'
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
    instrumentalFile: null,
    canvasFile: null,
    license: 'non-commercial',
    revShare: 10,
    mintingFee: '0',
    attestation: false,
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
    navigate(musicTab('cloud'))
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
  const [sharedTracks] = createResource(
    () => auth.pkpInfo()?.ethAddress,
    (addr) => fetchSharedContent(addr),
  )


  // Convert uploaded/shared entries to Track[] for TrackList
  const uploadedTracksAsTrack = createMemo<Track[]>(() => mapUploadedToTracks(uploadedTracks() ?? []))
  const uploadedEntriesMap = createMemo(() => buildEntriesMap(uploadedTracks() ?? []))
  const sharedTracksAsTrack = createMemo<Track[]>(() => mapSharedToTracks(sharedTracks() ?? []))
  const sharedEntriesMap = createMemo(() => buildEntriesMap(sharedTracks() ?? []))

  // Filter & sort state for unified library
  const [libraryFilter, setLibraryFilter] = createSignal<LibraryFilter>('all')
  const [librarySortField, setLibrarySortField] = createSignal<LibrarySortField>('recent')

  // Sort state
  const [sort, setSort] = createSignal<SortState | undefined>(undefined)
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  const sortedTracks = createMemo<LocalTrack[]>(() => {
    const s = sort()
    const t = player.tracks()
    if (!s) return t
    return [...t].sort((a, b) => {
      const aVal = ((a as any)[s.field] ?? '') as string
      const bVal = ((b as any)[s.field] ?? '') as string
      const cmp = collator.compare(aVal, bVal)
      return s.direction === 'asc' ? cmp : -cmp
    })
  })

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
  const [storageStatus, setStorageStatus] = createSignal<StorageStatus | null>(null)
  const [storageLoading, setStorageLoading] = createSignal(false)
  const [storageError, setStorageError] = createSignal<string | null>(null)
  const [depositLoading, setDepositLoading] = createSignal(false)
  const [addFundsOpen, setAddFundsOpen] = createSignal(false)

  let storageRefreshInflight = false
  async function refreshStorage() {
    const pkp = auth.pkpInfo()
    if (!pkp || storageRefreshInflight) return
    storageRefreshInflight = true
    setStorageLoading(true)
    setStorageError(null)
    try {
      const authCtx = await auth.getAuthContext()
      const status = await getStorageStatus(pkp, authCtx)
      setStorageStatus(status)
    } catch (e: any) {
      console.error('[Library] Storage status error:', e)
      setStorageError(e.message || 'Failed to load storage status')
    } finally {
      setStorageLoading(false)
      storageRefreshInflight = false
    }
  }

  async function handleDeposit(amount: string) {
    const pkp = auth.pkpInfo()
    if (!pkp) return
    setDepositLoading(true)
    try {
      const authCtx = await auth.getAuthContext()
      await depositAndApprove(pkp, authCtx, amount)
      await refreshStorage()
    } catch (e: any) {
      console.error('[Library] Deposit error:', e)
      setStorageError(e.message || 'Deposit failed')
    } finally {
      setDepositLoading(false)
      setAddFundsOpen(false)
    }
  }

  // Load storage status when authenticated and on cloud/library tab
  createEffect(() => {
    if (auth.isAuthenticated() && auth.pkpInfo() && (tab() === 'cloud' || tab() === 'library')) {
      refreshStorage()
    }
  })

  // Compute balance as number for AddFundsDialog estimate
  const balanceNum = createMemo(() => {
    const status = storageStatus()
    if (!status) return 0
    return parseFloat(status.balance.replace('$', '')) || 0
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

  const handleSort = (field: SortField) => {
    const current = sort()
    if (current?.field === field) {
      setSort({ field, direction: current.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      setSort({ field, direction: 'asc' })
    }
  }

  async function handlePickFolder() {
    const path = await pickFolder()
    if (!path) return
    await player.setLibraryFolder(path)
    await player.rescanLibrary(path)
  }

  const menuActionsLocal = buildMenuActions(plDialog, {
    onIdentify: () => {
      window.open('https://picard.musicbrainz.org/', '_blank')
    },
    onUploadToFilecoin: platform.isTauri
      ? (track) => {
          const lt = track as LocalTrack
          if (!lt.filePath) {
            console.warn('[Upload] No filePath for track:', track.title)
            return
          }
          enqueueUpload({
            id: lt.id,
            title: lt.title,
            artist: lt.artist,
            filePath: lt.filePath,
            coverPath: lt.coverPath,
            encrypted: true,
          })
        }
      : undefined,
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
        {/* Mobile: compact header bar */}
        <Show when={isMobile()}>
          <PageHeader
            compact
            title="Library"
            leftSlot={
              <IconButton variant="soft" size="md" aria-label="Back" onClick={() => navigate(MUSIC)}>
                <ChevronLeft class="w-5 h-5" />
              </IconButton>
            }
            rightSlot={
              <IconButton variant="soft" size="md" aria-label="Cloud storage" onClick={() => setAddFundsOpen(true)}>
                <CloudFill class="w-5 h-5" />
              </IconButton>
            }
          />
        </Show>

        {/* Desktop: full gradient hero */}
        <Show when={!isMobile()}>
          <PageHero
            title="Library"
            backgroundStyle={{ background: 'linear-gradient(135deg, #312e81 0%, #5b21b6 40%, #7c3aed 70%, #6d28d9 100%)' }}
            subtitle={<>{(sortedTracks() as Track[]).length.toLocaleString()} local, {uploadedTracksAsTrack().length.toLocaleString()} cloud</>}
            actions={
              <Button variant="secondary" icon={<Wallet />} onClick={() => setAddFundsOpen(true)} class="!bg-white/15 !border-white/25 !text-white hover:!bg-white/25">
                Add Funds
              </Button>
            }
          />
        </Show>

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
      </Show>

      {/* ── Shared with Me tab ──────────────────────────────────────── */}
      <Show when={tab() === 'shared'}>
        {/* Header */}
        <PageHeader
          compact
          title="Shared with Me"
          leftSlot={
            <IconButton variant="soft" size="md" aria-label="Back" onClick={() => navigate(MUSIC)}>
              <ChevronLeft class="w-5 h-5" />
            </IconButton>
          }
          rightSlot={
            <Show when={(sharedTracks()?.length ?? 0) > 0}>
              <span class="h-[22px] px-2 rounded-full bg-[var(--accent-blue)] text-[11px] font-semibold text-[#171717] flex items-center">
                {sharedTracks()?.length} new
              </span>
            </Show>
          }
        />

        <Show when={sharedTracks.loading}>
          <div class="flex items-center justify-center py-20 text-[var(--text-muted)]">
            <div class="flex items-center gap-3">
              <div class="w-5 h-5 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
              <span>Loading shared songs...</span>
            </div>
          </div>
        </Show>
        <Show when={!sharedTracks.loading && sharedTracksAsTrack().length > 0}>
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
      </Show>

      {/* ── Legacy: Local Files tab (direct access via /music/local) ── */}
      <Show when={tab() === 'local'}>
      <MediaHeader
        type="playlist"
        title="Local Files"
        creator={player.folderPath() || 'No folder selected'}
        stats={{ songCount: player.tracks().length }}
        onBack={() => navigate(MUSIC)}
        actionsSlot={
          <div class="flex items-center gap-4">
            <PlayButton
              variant="primary"
              size="lg"
              onClick={() => {
                if (player.tracks().length > 0) player.playTrack(0)
              }}
              aria-label="Play library"
            />

            <IconButton
              variant="soft"
              size="lg"
              onClick={() => {
                const t = [...player.tracks()]
                for (let i = t.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1))
                  ;[t[i], t[j]] = [t[j], t[i]]
                }
                player.setTracks(t)
                if (t.length > 0) player.playTrack(0)
              }}
              aria-label="Shuffle"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </IconButton>

            <Show when={platform.isTauri}>
              <IconButton
                variant="soft"
                size="lg"
                onClick={handlePickFolder}
                aria-label="Select music folder"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </IconButton>
            </Show>

            <Show when={platform.isTauri && player.folderPath()}>
              <IconButton
                variant="soft"
                size="lg"
                onClick={() => player.rescanLibrary()}
                aria-label="Re-sync folder"
                disabled={player.scanning()}
              >
                <svg
                  class={`w-6 h-6 ${player.scanning() ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </IconButton>
              <Show when={player.scanning() && player.scanProgress()}>
                {(p) => (
                  <span class="text-base text-[var(--text-muted)] tabular-nums hidden md:inline">
                    {p().done === 0
                      ? `Finding files... ${p().total.toLocaleString()}`
                      : `${p().done.toLocaleString()}/${p().total.toLocaleString()}`}
                  </span>
                )}
              </Show>
            </Show>
          </div>
        }
      />
      </Show>

      {/* Publish tab */}
      <Show when={tab() === 'publish'}>
        <div class="max-w-2xl mx-auto py-8 px-4">
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
      </Show>

      {/* Local Files tab */}
      <Show when={tab() === 'local'}>
        <Show
          when={player.tracks().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
              <Show
                when={platform.isTauri}
                fallback={<p>Local music playback is available in the desktop app.</p>}
              >
                <Show
                  when={!player.initialLoading()}
                  fallback={
                    <div class="flex items-center gap-3">
                      <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Loading library...</span>
                    </div>
                  }
                >
                  <p class="text-lg mb-2">No music loaded</p>
                  <p>Click the folder icon above to select your music folder.</p>
                </Show>
              </Show>
            </div>
          }
        >
          <Show when={scrollRef()}>
            {(el) => (
              <TrackList
                tracks={sortedTracks()}
                showDateAdded={false}
                activeTrackId={player.currentTrack()?.id}
                selectedTrackId={player.selectedTrackId() || undefined}
                sort={sort()}
                onSort={handleSort}
                scrollRef={el()}
                enableDrag
                onTrackClick={(track) => player.setSelectedTrackId(track.id)}
                onTrackPlay={(track) => {
                  const idx = player.tracks().findIndex((t) => t.id === track.id)
                  if (idx >= 0) player.playTrack(idx)
                }}
                menuActions={menuActionsLocal}
              />
            )}
          </Show>
        </Show>
      </Show>

      {/* Cloud tab */}
      <Show when={tab() === 'cloud'}>
        <PageHeader
          compact
          title="Cloud Library"
          leftSlot={
            <IconButton variant="soft" size="md" aria-label="Back" onClick={() => navigate(MUSIC)}>
              <ChevronLeft class="w-5 h-5" />
            </IconButton>
          }
          rightSlot={
            <IconButton variant="soft" size="md" aria-label="Add Funds" onClick={() => setAddFundsOpen(true)}>
              <Wallet class="w-5 h-5" />
            </IconButton>
          }
        />

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

      </Show>

      <AddFundsDialog
        open={addFundsOpen()}
        onOpenChange={setAddFundsOpen}
        currentBalance={storageStatus()?.balance ?? '$0.00'}
        daysRemaining={storageStatus()?.daysRemaining ?? null}
        balanceNum={balanceNum()}
        monthlyCost={storageStatus()?.monthlyCost}
        loading={depositLoading()}
        onDeposit={handleDeposit}
      />

      <AddToPlaylistDialog
        open={plDialog.open()}
        onOpenChange={plDialog.setOpen}
        track={plDialog.track()}
      />
    </div>
  )
}
