import { type Component, createSignal, createMemo, Show, For, onCleanup, createEffect, createResource } from 'solid-js'
import {
  MediaHeader,
  TrackList,
  IconButton,
  PlayButton,
  type Track,
  type SortField,
  type SortState,
} from '@heaven/ui'
import { usePlatform } from 'virtual:heaven-platform'
import { pickFolder, type LocalTrack } from '../lib/local-music'
import { usePlayer, useAuth } from '../providers'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'
import { ShareContentDialog } from '../components/ShareContentDialog'
import { enqueueUpload, jobs } from '../lib/upload-manager'
import { initFilecoinUploadService } from '../lib/filecoin-upload-service'
import { fetchUploadedContent, fetchSharedContent, type UploadedContentEntry, type SharedContentEntry } from '../lib/heaven/scrobbles'

type LibraryTab = 'local' | 'uploaded' | 'shared'

export const LibraryPage: Component = () => {
  const platform = usePlatform()
  const player = usePlayer()
  const auth = useAuth()

  // Initialize upload service once (idempotent — setQueueProcessor just replaces the fn)
  if (platform.isTauri) {
    initFilecoinUploadService({
      getAuthContext: () => auth.getAuthContext(),
      getPkp: () => auth.pkpInfo(),
    })
  }

  const [tab, setTab] = createSignal<LibraryTab>(platform.isTauri ? 'local' : 'uploaded')

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

  // Add to playlist dialog
  const [playlistDialogOpen, setPlaylistDialogOpen] = createSignal(false)
  const [playlistDialogTrack, setPlaylistDialogTrack] = createSignal<Track | null>(null)
  const [shareDialogOpen, setShareDialogOpen] = createSignal(false)
  const [shareEntry, setShareEntry] = createSignal<UploadedContentEntry | null>(null)

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

  return (
    <div
      ref={setScrollRefEl}
      onScroll={handleScroll}
      class="h-full overflow-y-auto"
    >
      <MediaHeader
        type="playlist"
        title={tab() === 'local' ? 'Local Files' : tab() === 'uploaded' ? 'Uploaded to Filecoin' : 'Shared with Me'}
        creator={tab() === 'local' ? (player.folderPath() || 'No folder selected') : tab() === 'uploaded' ? `${uploadedTracks()?.length ?? 0} tracks` : `${sharedTracks()?.length ?? 0} tracks`}
        stats={tab() === 'local' ? { songCount: player.tracks().length } : { songCount: (tab() === 'uploaded' ? uploadedTracks()?.length : sharedTracks()?.length) ?? 0 }}
        actionsSlot={
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
                    <span class="text-sm text-[var(--text-muted)] tabular-nums">
                      {p().done === 0
                        ? `Finding files... ${p().total.toLocaleString()}`
                        : `${p().done.toLocaleString()}/${p().total.toLocaleString()}`}
                    </span>
                  )}
                </Show>
              </Show>
            </div>
          </Show>
        }
      />

      {/* Tab switcher */}
      <div class="flex gap-1 px-4 py-2">
        <Show when={platform.isTauri}>
          <button
            class={`px-3 py-1 text-sm rounded-md transition-colors ${
              tab() === 'local'
                ? 'bg-[var(--bg-highlight)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)]'
            }`}
            onClick={() => setTab('local')}
          >
            Local Files
          </button>
        </Show>
        <button
          class={`px-3 py-1 text-sm rounded-md transition-colors ${
            tab() === 'uploaded'
              ? 'bg-[var(--bg-highlight)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)]'
          }`}
          onClick={() => setTab('uploaded')}
        >
          Uploaded
          <Show when={(uploadedTracks()?.length ?? 0) > 0}>
            <span class="ml-1 text-[var(--text-muted)]">({uploadedTracks()!.length})</span>
          </Show>
        </button>
        <button
          class={`px-3 py-1 text-sm rounded-md transition-colors ${
            tab() === 'shared'
              ? 'bg-[var(--bg-highlight)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)]'
          }`}
          onClick={() => setTab('shared')}
        >
          Shared
          <Show when={(sharedTracks()?.length ?? 0) > 0}>
            <span class="ml-1 text-[var(--text-muted)]">({sharedTracks()!.length})</span>
          </Show>
        </button>
      </div>

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
                onTrackClick={(track) => player.setSelectedTrackId(track.id)}
                onTrackPlay={(track) => {
                  const idx = player.tracks().findIndex((t) => t.id === track.id)
                  if (idx >= 0) player.playTrack(idx)
                }}
                menuActions={{
                  onAddToQueue: (track) => console.log('Add to queue:', track),
                  onAddToPlaylist: (track) => {
                    setPlaylistDialogTrack(track)
                    setPlaylistDialogOpen(true)
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
                          encrypted: false,
                        })
                      }
                    : undefined,
                }}
              />
            )}
          </Show>
        </Show>
      </Show>

      {/* Uploaded tab */}
      <Show when={tab() === 'uploaded'}>
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
            when={(uploadedTracks()?.length ?? 0) > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
                <p class="text-lg mb-2">No uploaded tracks yet</p>
                <p>Right-click a local track and select "Upload to Filecoin".</p>
              </div>
            }
          >
            <div class="px-4">
              <For each={uploadedTracks()}>
                {(entry: UploadedContentEntry) => {
                  const isActive = () => player.currentTrack()?.id === entry.contentId
                  const isEntryPlaying = () => isActive() && player.isPlaying()
                  const isEntryDecrypting = () => isActive() && player.decrypting()
                  return (
                    <div
                      class={`flex items-center gap-3 py-2 px-2 rounded-md cursor-pointer group ${isActive() ? 'bg-[var(--bg-highlight)]' : 'hover:bg-[var(--bg-highlight-hover)]'}`}
                      onClick={() => player.playEncryptedContent(entry)}
                    >
                      <div class="w-8 h-8 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                        <Show when={isEntryDecrypting()} fallback={
                          <Show when={isEntryPlaying()} fallback={
                            <svg class="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          }>
                            <svg class="w-4 h-4 text-[var(--accent-blue)]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                          </Show>
                        }>
                          <svg class="w-4 h-4 animate-spin text-[var(--accent-blue)]" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        </Show>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class={`truncate ${isActive() ? 'text-[var(--accent-blue)]' : 'text-[var(--text-primary)]'}`}>{entry.title}</div>
                        <div class="text-sm text-[var(--text-muted)] truncate">{entry.artist}</div>
                      </div>
                      <div class="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
                        {new Date(entry.uploadedAt * 1000).toLocaleDateString()}
                      </div>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label="Share"
                        class="opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          setShareEntry(entry)
                          setShareDialogOpen(true)
                        }}
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                        </svg>
                      </IconButton>
                    </div>
                  )
                }}
              </For>
            </div>
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
        <Show when={!sharedTracks.loading}>
          <Show
            when={(sharedTracks()?.length ?? 0) > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
                <p class="text-lg mb-2">No shared tracks yet</p>
                <p>When someone shares content with you, it will appear here.</p>
              </div>
            }
          >
            <div class="px-4">
              <For each={sharedTracks()}>
                {(entry: SharedContentEntry) => {
                  const isActive = () => player.currentTrack()?.id === entry.contentId
                  const isEntryPlaying = () => isActive() && player.isPlaying()
                  const isEntryDecrypting = () => isActive() && player.decrypting()
                  return (
                    <div
                      class={`flex items-center gap-3 py-2 px-2 rounded-md cursor-pointer group ${isActive() ? 'bg-[var(--bg-highlight)]' : 'hover:bg-[var(--bg-highlight-hover)]'}`}
                      onClick={() => player.playEncryptedContent(entry)}
                    >
                      <div class="w-8 h-8 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                        <Show when={isEntryDecrypting()} fallback={
                          <Show when={isEntryPlaying()} fallback={
                            <svg class="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          }>
                            <svg class="w-4 h-4 text-[var(--accent-blue)]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                          </Show>
                        }>
                          <svg class="w-4 h-4 animate-spin text-[var(--accent-blue)]" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        </Show>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class={`truncate ${isActive() ? 'text-[var(--accent-blue)]' : 'text-[var(--text-primary)]'}`}>{entry.title}</div>
                        <div class="text-sm text-[var(--text-muted)] truncate">{entry.artist}</div>
                      </div>
                      <div class="text-xs text-[var(--text-muted)] truncate shrink-0 max-w-[120px]">
                        from {entry.sharedBy.slice(0, 6)}...{entry.sharedBy.slice(-4)}
                      </div>
                      <div class="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
                        {new Date(entry.uploadedAt * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </Show>
      </Show>

      <AddToPlaylistDialog
        open={playlistDialogOpen()}
        onOpenChange={setPlaylistDialogOpen}
        track={playlistDialogTrack()}
      />
      <Show when={shareEntry()}>
        {(entry) => (
          <ShareContentDialog
            open={shareDialogOpen()}
            onOpenChange={setShareDialogOpen}
            contentId={entry().contentId}
            title={`${entry().title} - ${entry().artist}`}
          />
        )}
      </Show>
    </div>
  )
}
