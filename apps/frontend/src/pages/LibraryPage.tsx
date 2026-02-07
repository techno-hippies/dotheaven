import { type Component, createSignal, createMemo, Show, onCleanup, createEffect, createResource } from 'solid-js'
import {
  MediaHeader,
  type MediaHeaderMenuItem,
  TrackList,
  IconButton,
  Button,
  PlayButton,
  DownloadAppCta,
  SongPublishForm,
  type SongFormData,
  type PublishStep,
  type Track,
  type SortField,
  type SortState,
} from '@heaven/ui'
import { musicTab } from '@heaven/core'
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

type LibraryTab = 'local' | 'cloud' | 'shared' | 'publish'

export const LibraryPage: Component = () => {
  const platform = usePlatform()
  const player = usePlayer()
  const auth = useAuth()
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

  // Get tab from route params, default to local (Tauri) or cloud (web)
  const tab = createMemo<LibraryTab>(() => {
    const t = params.tab
    if (t === 'local' && platform.isTauri) return 'local'
    if (t === 'cloud') return 'cloud'
    if (t === 'shared') return 'shared'
    if (t === 'publish') return 'publish'
    // Default: redirect to appropriate default tab
    return platform.isTauri ? 'local' : 'cloud'
  })

  // ── Publish form state ──────────────────────────────────────────
  const defaultFormData: SongFormData = {
    title: '',
    artist: '',
    album: '',
    genre: '',
    primaryLanguage: '',
    secondaryLanguage: '',
    lyrics: '',
    coverFile: null,
    audioFile: null,
    instrumentalFile: null,
    previewStart: 0,
    previewEnd: 30,
    license: 'non-commercial',
    revShare: 10,
    mintingFee: '0',
    attestation: false,
  }

  const [publishStep, setPublishStep] = createSignal<PublishStep>('upload')
  const [publishForm, setPublishForm] = createSignal<SongFormData>({ ...defaultFormData })
  const [publishProgress, setPublishProgress] = createSignal(0)
  const [publishError, setPublishError] = createSignal<string | undefined>()

  const publishSteps: PublishStep[] = ['upload', 'details', 'lyrics', 'license', 'review']

  const handlePublishNext = () => {
    const idx = publishSteps.indexOf(publishStep())
    if (idx < publishSteps.length - 1) setPublishStep(publishSteps[idx + 1])
  }

  const handlePublishBack = () => {
    if (publishStep() === 'error') { setPublishStep('review'); return }
    const idx = publishSteps.indexOf(publishStep())
    if (idx > 0) setPublishStep(publishSteps[idx - 1])
  }

  const handlePublish = () => {
    setPublishStep('publishing')
    setPublishProgress(0)
    // TODO: Wire to Lit Action song-publish-v1 + story-register-sponsor-v1
    // For now, simulate progress
    const stages = [10, 25, 40, 55, 70, 85, 95, 100]
    let i = 0
    const tick = setInterval(() => {
      setPublishProgress(stages[i])
      i++
      if (i >= stages.length) {
        clearInterval(tick)
        setTimeout(() => setPublishStep('success'), 500)
      }
    }, 800)
  }

  const handlePublishDone = () => {
    setPublishStep('upload')
    setPublishForm({ ...defaultFormData })
    setPublishProgress(0)
    setPublishError(undefined)
    navigate(musicTab('cloud'))
  }

  // Redirect /music to /music/local on Tauri (desktop app has local files as default)
  createEffect(() => {
    if (!params.tab && platform.isTauri) {
      navigate(musicTab('local'), { replace: true })
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
    onUploadToFilecoinPublic: platform.isTauri
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
            encrypted: false,
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
      <Show when={tab() !== 'publish'}>
      <MediaHeader
        type="playlist"
        title={tab() === 'local' ? 'Local Files' : tab() === 'cloud' ? 'Cloud Library' : 'Shared with Me'}
        creator={tab() === 'local' ? (player.folderPath() || 'No folder selected') : tab() === 'cloud' ? `${uploadedTracks()?.length ?? 0} tracks` : `${sharedTracks()?.length ?? 0} tracks`}
        stats={tab() === 'local' ? { songCount: player.tracks().length } : { songCount: (tab() === 'cloud' ? uploadedTracks()?.length : sharedTracks()?.length) ?? 0 }}
        onBack={() => navigate(-1)}
        mobileMenuItems={[
          {
            label: 'Request Access',
            icon: (
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            ),
            onSelect: () => console.log('Request Access'),
          } satisfies MediaHeaderMenuItem,
          {
            label: 'Mint NFT',
            icon: (
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            ),
            onSelect: () => console.log('Mint NFT'),
          } satisfies MediaHeaderMenuItem,
        ]}
        actionsSlot={
          <>
            <Show when={tab() === 'local'}>
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
            </Show>
            <Show when={tab() === 'shared'}>
              <div class="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => console.log('Request Access')}
                >
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                  Request Access
                </Button>
                <Button
                  variant="outline"
                  onClick={() => console.log('Mint NFT')}
                >
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                  </svg>
                  Mint NFT
                </Button>
              </div>
            </Show>
          </>
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
            onPublish={handlePublish}
            onDone={handlePublishDone}
            progress={publishProgress()}
            error={publishError()}
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
          <Show
            when={uploadedTracksAsTrack().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
                <Show
                  when={platform.isTauri}
                  fallback={<DownloadAppCta />}
                >
                  <p class="text-lg mb-2">No uploaded tracks yet</p>
                  <p>Right-click a local track and select "Upload to Filecoin".</p>
                </Show>
              </div>
            }
          >
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
      </Show>

      {/* Shared tab */}
      <Show when={tab() === 'shared'}>
        <Show when={sharedTracks.loading}>
          <div class="flex items-center justify-center py-20 text-[var(--text-muted)]">
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Loading shared tracks...</span>
            </div>
          </div>
        </Show>
        <Show when={!sharedTracks.loading && sharedTracksAsTrack().length > 0}>
          <Show when={scrollRef()}>
            {(el) => (
              <TrackList
                tracks={sharedTracksAsTrack()}
                showAlbum={false}
                showSharedBy
                showDateAdded
                activeTrackId={player.currentTrack()?.id}
                activeTrackPlaying={player.isPlaying()}
                selectedTrackId={player.selectedTrackId() || undefined}
                scrollRef={el()}
                enableDrag
                onTrackClick={(track) => player.setSelectedTrackId(track.id)}
                onTrackPlay={(track) => handleEncryptedTrackPlay(track, sharedEntriesMap(), player)}
                menuActions={menuActionsShared}
              />
            )}
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
