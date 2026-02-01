import { type Component, createSignal, createMemo, Show, onCleanup, createEffect } from 'solid-js'
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
import { usePlayer } from '../providers'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'

export const LibraryPage: Component = () => {
  const platform = usePlatform()
  const player = usePlayer()
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
      class="h-full overflow-y-auto bg-gradient-to-b from-[#4a3a6a] via-[#2a2040] to-[var(--bg-page)] rounded-t-lg"
    >
      <MediaHeader
        type="playlist"
        title="Library"
        creator={player.folderPath() || 'No folder selected'}
        stats={{
          songCount: player.tracks().length,
        }}
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
                  <span class="text-sm text-[var(--text-muted)] tabular-nums">
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
              }}
            />
          )}
        </Show>
      </Show>
      <AddToPlaylistDialog
        open={playlistDialogOpen()}
        onOpenChange={setPlaylistDialogOpen}
        track={playlistDialogTrack()}
      />
    </div>
  )
}
