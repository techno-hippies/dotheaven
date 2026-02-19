import { type Component, Show, createEffect, createMemo, createSignal, onMount, onCleanup } from 'solid-js'
import { useNavigate, useParams, useLocation } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import {
  AlbumCover,
  Button,
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  PlayButton,
  TrackList,
} from '@heaven/ui'
import { musicTab, publicProfile } from '@heaven/core'
import { fetchPlaylistWithTracks, fetchPlaylistWithTracksAtCheckpoint } from '../lib/heaven/playlists'
import { getPrimaryName } from '../lib/heaven'
import { resolveCoverUrl } from '../lib/heaven/cover-ref'
import { useTrackPlayback, usePlaylistDialog, buildMenuActions } from '../hooks/useTrackListActions'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'
import { MediaBackBar } from '../components/library/media-back-bar'

export const PlaylistPage: Component = () => {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [editOpen, setEditOpen] = createSignal(false)
  const [deleteOpen, setDeleteOpen] = createSignal(false)
  const [editTitle, setEditTitle] = createSignal('')
  const [editDescription, setEditDescription] = createSignal('')
  const [editCoverUrl, setEditCoverUrl] = createSignal('')
  const [hashTick, setHashTick] = createSignal(0)
  const [stickySnapshot, setStickySnapshot] = createSignal<{ th?: string; pv?: number }>({})

  const playback = useTrackPlayback()
  const plDialog = usePlaylistDialog()
  const menuActions = buildMenuActions(plDialog)

  const queryParams = () => {
    // Track hash changes explicitly; HashRouter updates aren't always reflected in location.search.
    hashTick()
    const fromSearch = location.search
    if (fromSearch?.startsWith('?')) {
      return new URLSearchParams(fromSearch)
    }
    const fromPath = location.pathname
    if (fromPath?.includes('?')) {
      return new URLSearchParams(fromPath.slice(fromPath.indexOf('?')))
    }
    const hash = window.location.hash
    if (hash?.includes('?')) {
      return new URLSearchParams(hash.slice(hash.indexOf('?')))
    }
    return new URLSearchParams('')
  }

  const playlistId = createMemo(() => {
    const raw = (params.id || '').toLowerCase()
    const byRegex = raw.match(/0x[0-9a-f]{64}/)?.[0]
    if (byRegex) return byRegex
    return raw.split('?')[0]
  })

  const routeSharedTracksHash = createMemo<string | undefined>(() => {
    const th = queryParams().get('th')?.trim()
    if (!th) return undefined
    const lower = th.toLowerCase()
    if (!/^0x[0-9a-f]{64}$/.test(lower)) return undefined
    return lower
  })

  const routeSharedPlaylistVersion = createMemo<number | undefined>(() => {
    const pv = queryParams().get('pv')?.trim()
    if (!pv) return undefined
    const n = parseInt(pv, 10)
    return Number.isFinite(n) ? n : undefined
  })

  // Keep shared snapshot params sticky for this mounted page instance.
  // This prevents transient hash/query changes during playback/back from dropping us out of
  // snapshot mode and showing "Playlist not found".
  createEffect(() => {
    playlistId()
    setStickySnapshot({})
  })

  createEffect(() => {
    const th = routeSharedTracksHash()
    const pv = routeSharedPlaylistVersion()
    if (th) {
      setStickySnapshot({ th, pv })
    }
  })

  const sharedTracksHash = createMemo<string | undefined>(() => routeSharedTracksHash() ?? stickySnapshot().th)
  const sharedPlaylistVersion = createMemo<number | undefined>(() => routeSharedPlaylistVersion() ?? stickySnapshot().pv)

  onMount(() => {
    const onHashLikeChange = () => setHashTick((v) => v + 1)
    window.addEventListener('hashchange', onHashLikeChange)
    window.addEventListener('popstate', onHashLikeChange)
    onCleanup(() => {
      window.removeEventListener('hashchange', onHashLikeChange)
      window.removeEventListener('popstate', onHashLikeChange)
    })
  })

  const query = createQuery(() => ({
    queryKey: ['playlist', playlistId(), sharedTracksHash(), sharedPlaylistVersion()],
    queryFn: () => {
      const th = sharedTracksHash()
      if (th) return fetchPlaylistWithTracksAtCheckpoint(playlistId(), th, sharedPlaylistVersion())
      return fetchPlaylistWithTracks(playlistId())
    },
    enabled: !!playlistId(),
    // Don't cache null results (subgraph indexing lag); cache real data for 60s
    staleTime: (q: any) => q.state.data ? 60_000 : 0,
    // Auto-retry every 3s when subgraph hasn't indexed yet
    refetchInterval: (q: any) => q.state.data ? false : 3000,
  }))

  const playlist = () => query.data?.playlist ?? null
  const tracks = () => query.data?.tracks ?? []

  // Debug logs (DEV only) to help diagnose HashRouter query parsing + subgraph indexing.
  createEffect(() => {
    if (!import.meta.env.DEV) return
    console.log('[PlaylistPage] route', {
      paramsId: params.id,
      playlistId: playlistId(),
      locationPathname: location.pathname,
      locationSearch: location.search,
      windowHash: window.location.hash,
      th: sharedTracksHash(),
      pv: sharedPlaylistVersion(),
    })
  })

  createEffect(() => {
    if (!import.meta.env.DEV) return
    const data = query.data
    console.log('[PlaylistPage] query', {
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      isError: query.isError,
      error: (query.error as any)?.message ?? (query.error ? String(query.error) : null),
      data: data ? { playlist: data.playlist?.id, tracks: data.tracks?.length } : null,
    })
  })

  const coverUrl = () => {
    const p = playlist()
    return resolveCoverUrl(p?.coverCid, { width: 300, height: 300, format: 'webp', quality: 80 })
  }

  // Resolve playlist owner to heaven name (falls back to truncated address)
  const ownerAddress = () => playlist()?.owner as `0x${string}` | undefined
  const creatorQuery = createQuery(() => ({
    queryKey: ['primaryName', ownerAddress()],
    queryFn: () => getPrimaryName(ownerAddress()!),
    get enabled() { return !!ownerAddress() },
    staleTime: 1000 * 60 * 5,
  }))

  const creatorName = () => {
    const primary = creatorQuery.data
    if (primary?.label) return primary.label
    const addr = ownerAddress()
    if (addr) return `${addr.slice(0, 6)}...${addr.slice(-4)}`
    return undefined
  }

  const creatorHref = () => {
    const primary = creatorQuery.data
    if (primary?.label) return `#${publicProfile(`${primary.label}.heaven`)}`
    const addr = ownerAddress()
    if (addr) return `#${publicProfile(addr)}`
    return undefined
  }

  const openEditDialog = () => {
    // Shared playlist snapshots are read-only views.
    if (sharedTracksHash()) return
    const p = playlist()
    if (!p) return
    setEditTitle(p.name)
    setEditDescription('')
    setEditCoverUrl(coverUrl() || '')
    setEditOpen(true)
  }

  const handleSave = async () => {
    // TODO: wire to on-chain playlist update via Lit Action
    setEditOpen(false)
  }

  const handleDelete = async () => {
    // TODO: wire to on-chain playlist delete via Lit Action
    setDeleteOpen(false)
  }

  const handleCopyUrl = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url)
    console.log('URL copied to clipboard')
  }

  const handlePlay = () => {
    playback.playFirst(tracks())
  }

  const totalDuration = () => {
    const trackList = tracks()
    if (trackList.length === 0) return '0 min'
    // Parse duration strings (e.g., "3:42") back to seconds
    const totalSec = trackList.reduce((sum, t) => {
      if (!t.duration || t.duration === '--:--') return sum
      const [m, s] = t.duration.split(':').map(Number)
      return sum + (m * 60 + s)
    }, 0)
    if (totalSec === 0) return '0 min'
    const hours = Math.floor(totalSec / 3600)
    const mins = Math.floor((totalSec % 3600) / 60)
    if (hours > 0) return `${hours} hr ${mins} min`
    return `${mins} min`
  }

  const handleAddCollaborator = () => {
    console.log('Add collaborator')
  }

  return (
    <div class="h-full overflow-y-auto">
      <MediaBackBar
        title="Playlist"
        onBack={() => {
          if (sharedTracksHash()) {
            navigate(musicTab('shared'))
            return
          }
          navigate(-1)
        }}
      />

      <div class="max-w-5xl mx-auto w-full">
        <Show when={import.meta.env.DEV}>
          <details class="mx-4 md:mx-8 mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-4 py-3 text-sm text-[var(--text-muted)]">
            <summary class="cursor-pointer select-none text-[var(--text-secondary)]">Debug</summary>
            <pre class="mt-3 whitespace-pre-wrap break-words">{JSON.stringify({
              paramsId: params.id,
              playlistId: playlistId(),
              th: sharedTracksHash(),
              pv: sharedPlaylistVersion(),
              location: {
                pathname: location.pathname,
                search: location.search,
                hash: window.location.hash,
              },
              query: {
                isLoading: query.isLoading,
                isFetching: query.isFetching,
                isError: query.isError,
                error: (query.error as any)?.message ?? (query.error ? String(query.error) : null),
              },
            }, null, 2)}</pre>
          </details>
        </Show>

        <Show when={!query.isLoading} fallback={
          <div class="min-h-[260px] py-20 flex items-center justify-center">
            <p class="text-[var(--text-muted)]">Loading...</p>
          </div>
        }>
          <Show when={playlist()} fallback={
            <div class="min-h-[260px] py-20 flex items-center justify-center">
              <Show when={query.isError} fallback={
                <Show when={query.isFetching} fallback={
                  <p class="text-[var(--text-muted)]">Playlist not found</p>
                }>
                  <p class="text-[var(--text-muted)]">Indexing playlist...</p>
                </Show>
              }>
                <div class="text-center">
                  <p class="text-[var(--text-muted)]">Playlist load failed</p>
                  <p class="mt-2 text-sm text-[var(--text-muted)]">{(query.error as any)?.message ?? String(query.error)}</p>
                </div>
              </Show>
            </div>
          }>
            {(p) => (
              <>
                <div class="px-4 md:px-8 py-6">
                  <div class="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 p-4 md:p-6">
                    <div class="flex flex-col md:flex-row gap-5 md:gap-6">
                      <button
                        type="button"
                        class="self-center md:self-auto cursor-pointer"
                        onClick={openEditDialog}
                        aria-label="Edit playlist cover"
                      >
                        <AlbumCover
                          src={coverUrl()}
                          icon="playlist"
                          class="w-40 h-40 md:w-48 md:h-48"
                        />
                      </button>

                      <div class="flex-1 min-w-0">
                        <div class="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Playlist</div>
                        <Show when={sharedTracksHash()}>
                          <div class="mt-2 inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                            <span class="px-2 py-1 rounded-full bg-[var(--bg-highlight)] border border-[var(--border-subtle)]">
                              Shared snapshot
                            </span>
                          </div>
                        </Show>
                        <h1
                          class="mt-2 text-2xl md:text-4xl font-bold leading-tight text-[var(--text-primary)] cursor-pointer hover:underline"
                          onClick={openEditDialog}
                        >
                          {p().name}
                        </h1>

                        <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-[var(--text-secondary)]">
                          <Show when={creatorName()}>
                            <Show
                              when={creatorHref()}
                              fallback={<span class="font-semibold text-[var(--text-primary)]">{creatorName()}</span>}
                            >
                              <a
                                href={creatorHref()!}
                                class="font-semibold text-[var(--text-primary)] hover:underline"
                              >
                                {creatorName()}
                              </a>
                            </Show>
                            <span>&middot;</span>
                          </Show>
                          <span>{sharedTracksHash() ? tracks().length : p().trackCount} tracks</span>
                          <span>&middot;</span>
                          <span>{totalDuration()}</span>
                        </div>

                        <div class="mt-5 flex flex-wrap items-center gap-3">
                          <PlayButton onClick={handlePlay} aria-label="Play playlist" />

                          <IconButton
                            variant="soft"
                            size="lg"
                            onClick={handleAddCollaborator}
                            aria-label="Add collaborator"
                          >
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                          </IconButton>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              as={(props: any) => (
                                <IconButton
                                  {...props}
                                  variant="soft"
                                  size="lg"
                                  aria-label="More options"
                                >
                                  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                  </svg>
                                </IconButton>
                              )}
                            />
                            <DropdownMenuContent>
                              <DropdownMenuItem onSelect={openEditDialog}>
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => console.log('Request Access')}>
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                </svg>
                                Request Access
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => console.log('Mint NFT')}>
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                                </svg>
                                Mint NFT
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={handleCopyUrl}>
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copy URL
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setDeleteOpen(true)}
                                class="text-[var(--accent-coral)]"
                              >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete Playlist
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Show when={tracks().length > 0} fallback={
                  <div class="px-4 md:px-8 py-12 text-center">
                    <p class="text-[var(--text-muted)] text-lg">No songs yet</p>
                    <p class="text-[var(--text-muted)] text-base mt-2">Add songs to this playlist to get started</p>
                  </div>
                }>
                  <TrackList
                    tracks={tracks()}
                    activeTrackId={playback.activeTrackId()}
                    selectedTrackId={playback.selectedTrackId()}
                    onTrackClick={(track) => playback.select(track)}
                    onTrackPlay={(track) => playback.play(track)}
                    menuActions={menuActions}
                  />
                </Show>

                <Dialog open={editOpen()} onOpenChange={setEditOpen}>
                  <DialogContent class="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>Edit Playlist</DialogTitle>
                      <DialogDescription>
                        Update your playlist details.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogBody>
                      <div class="flex gap-6">
                        <div class="flex-shrink-0">
                          <input
                            type="file"
                            accept="image/*"
                            id="cover-upload"
                            class="hidden"
                            onChange={(e) => {
                              const file = e.currentTarget.files?.[0]
                              if (file) {
                                const reader = new FileReader()
                                reader.onload = (ev) => {
                                  setEditCoverUrl(ev.target?.result as string)
                                }
                                reader.readAsDataURL(file)
                              }
                            }}
                          />
                          <label
                            for="cover-upload"
                            class="block w-48 h-48 rounded-md bg-[var(--bg-highlight)] flex items-center justify-center cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors overflow-hidden"
                          >
                            <Show when={editCoverUrl()} fallback={
                              <div class="text-center text-[var(--text-muted)]">
                                <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                                  <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                                <span class="text-base">Choose photo</span>
                              </div>
                            }>
                              <img src={editCoverUrl()} alt="Cover" class="w-full h-full object-cover" />
                            </Show>
                          </label>
                        </div>
                        <div class="flex-1 flex flex-col gap-4">
                          <input
                            type="text"
                            value={editTitle()}
                            onInput={(e) => setEditTitle(e.currentTarget.value)}
                            placeholder="Playlist name"
                            class="w-full px-4 py-3 rounded-full bg-[var(--bg-highlight)] text-[var(--text-primary)] text-lg placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
                            autofocus
                          />
                          <textarea
                            value={editDescription()}
                            onInput={(e) => setEditDescription(e.currentTarget.value)}
                            placeholder="Add a description (optional)"
                            rows={4}
                            class="w-full px-4 py-3 rounded-2xl bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors resize-none flex-1"
                          />
                        </div>
                      </div>
                    </DialogBody>
                    <DialogFooter>
                      <DialogCloseButton
                        as={(props: any) => (
                          <Button {...props} variant="secondary">Cancel</Button>
                        )}
                      />
                      <Button onClick={handleSave}>Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={deleteOpen()} onOpenChange={setDeleteOpen}>
                  <DialogContent class="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Delete Playlist</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete "{p().name}"? This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogCloseButton
                        as={(props: any) => (
                          <Button {...props} variant="secondary">Cancel</Button>
                        )}
                      />
                      <Button
                        onClick={handleDelete}
                        class="bg-[var(--accent-coral)] hover:bg-[var(--accent-coral)]/90"
                      >
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </Show>
        </Show>
      </div>

      <AddToPlaylistDialog
        open={plDialog.open()}
        onOpenChange={plDialog.setOpen}
        track={plDialog.track()}
      />
    </div>
  )
}
