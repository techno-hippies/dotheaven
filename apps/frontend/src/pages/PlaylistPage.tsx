import { type Component, createSignal, createMemo, Show } from 'solid-js'
import { useParams } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import {
  MediaHeader,
  TrackList,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
  Button,
  IconButton,
  PlayButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@heaven/ui'
import { fetchPlaylistWithTracks } from '../lib/heaven/playlists'
import { getPrimaryName } from '../lib/heaven'
import { useTrackPlayback, usePlaylistDialog, buildMenuActions } from '../hooks/useTrackListActions'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'

export const PlaylistPage: Component = () => {
  const params = useParams<{ id: string }>()
  const [editOpen, setEditOpen] = createSignal(false)
  const [deleteOpen, setDeleteOpen] = createSignal(false)
  const [editTitle, setEditTitle] = createSignal('')
  const [editDescription, setEditDescription] = createSignal('')
  const [editCoverUrl, setEditCoverUrl] = createSignal('')

  const playback = useTrackPlayback()
  const plDialog = usePlaylistDialog()
  const menuActions = buildMenuActions(plDialog)

  const query = createQuery(() => ({
    queryKey: ['playlist', params.id],
    queryFn: () => fetchPlaylistWithTracks(params.id),
    enabled: !!params.id,
    // Don't cache null results (subgraph indexing lag); cache real data for 60s
    staleTime: (q: any) => q.state.data ? 60_000 : 0,
    // Auto-retry every 3s when subgraph hasn't indexed yet
    refetchInterval: (q: any) => q.state.data ? false : 3000,
  }))

  const playlist = () => query.data?.playlist ?? null
  const tracks = () => query.data?.tracks ?? []

  const coverUrl = () => {
    const p = playlist()
    return p?.coverCid ? `https://heaven.myfilebase.com/ipfs/${p.coverCid}?img-width=300&img-height=300&img-format=webp&img-quality=80` : undefined
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
    if (primary?.label) return `#/u/${primary.label}.heaven`
    const addr = ownerAddress()
    if (addr) return `#/u/${addr}`
    return undefined
  }

  const openEditDialog = () => {
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

  const handleAddCollaborator = () => {
    console.log('Add collaborator')
  }

  return (
    <Show when={!query.isLoading} fallback={
      <div class="h-full flex items-center justify-center">
        <p class="text-[var(--text-muted)]">Loading...</p>
      </div>
    }>
      <Show when={playlist()} fallback={
        <div class="h-full flex items-center justify-center">
          <Show when={query.isFetching} fallback={
            <p class="text-[var(--text-muted)]">Playlist not found</p>
          }>
            <div class="flex items-center gap-3 text-[var(--text-muted)]">
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Indexing playlist...</span>
            </div>
          </Show>
        </div>
      }>
        {(p) => (
          <div class="h-full overflow-y-auto bg-gradient-to-b from-[#4a3f6b] via-[#2a2440] to-[var(--bg-page)] rounded-t-lg">
            <MediaHeader
                type="playlist"
                title={p().name}
                creator={creatorName()}
                creatorHref={creatorHref()}
                description=""
                coverSrc={coverUrl()}
                stats={{
                  songCount: p().trackCount,
                  duration: '0 min',
                }}
                onTitleClick={openEditDialog}
                onCoverClick={openEditDialog}
                actionsSlot={
                  <div class="flex items-center gap-4">
                    <PlayButton onClick={handlePlay} aria-label="Play playlist" />

                    {/* Add Collaborator Button */}
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

                    {/* More Options Dropdown */}
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
                }
              />
              <Show when={tracks().length > 0} fallback={
                <div class="px-8 py-12 text-center">
                  <p class="text-[var(--text-muted)] text-lg">No songs yet</p>
                  <p class="text-[var(--text-muted)] text-sm mt-2">Add songs to this playlist to get started</p>
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

              {/* Edit Playlist Dialog */}
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
                              <span class="text-sm">Choose photo</span>
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
                          class="w-full px-4 py-3 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-lg placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
                          autofocus
                        />
                        <textarea
                          value={editDescription()}
                          onInput={(e) => setEditDescription(e.currentTarget.value)}
                          placeholder="Add a description (optional)"
                          rows={4}
                          class="w-full px-4 py-3 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors resize-none flex-1"
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

              {/* Delete Confirmation Dialog */}
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
          </div>
        )}
      </Show>
      <AddToPlaylistDialog
        open={plDialog.open()}
        onOpenChange={plDialog.setOpen}
        track={plDialog.track()}
      />
    </Show>
  )
}
