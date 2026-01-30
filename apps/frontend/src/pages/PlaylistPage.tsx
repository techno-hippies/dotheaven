import { type Component, createSignal, createEffect, Show } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
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
  type Track,
} from '@heaven/ui'
import { getPlaylist, updatePlaylist, deletePlaylist, type Playlist } from '@heaven/core'

export const PlaylistPage: Component = () => {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [playlist, setPlaylist] = createSignal<Playlist | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [editOpen, setEditOpen] = createSignal(false)
  const [deleteOpen, setDeleteOpen] = createSignal(false)
  const [editTitle, setEditTitle] = createSignal('')
  const [editDescription, setEditDescription] = createSignal('')
  const [editCoverUrl, setEditCoverUrl] = createSignal('')

  createEffect(async () => {
    setLoading(true)
    const data = await getPlaylist(params.id)
    setPlaylist(data ?? null)
    setLoading(false)
  })

  const openEditDialog = () => {
    const p = playlist()
    if (!p) return
    setEditTitle(p.title)
    setEditDescription(p.description)
    setEditCoverUrl(p.coverUrl || '')
    setEditOpen(true)
  }

  const handleSave = async () => {
    const p = playlist()
    if (!p) return

    const updated = await updatePlaylist(p.id, {
      title: editTitle().trim() || 'My Playlist',
      description: editDescription().trim(),
      coverUrl: editCoverUrl().trim() || undefined,
    })

    if (updated) {
      setPlaylist(updated)
      // Playlist is already persisted in IDB, sidebar will refresh on next load
    }
    setEditOpen(false)
  }

  const handleDelete = async () => {
    const p = playlist()
    if (!p) return

    const success = await deletePlaylist(p.id)
    if (success) {
      // Playlist is already removed from IDB, navigate away
      navigate('/') // Navigate back to home or library
    }
    setDeleteOpen(false)
  }

  const handleCopyUrl = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url)
    // TODO: Show toast notification
    console.log('URL copied to clipboard')
  }

  const handlePlay = () => {
    console.log('Play playlist')
    // TODO: Implement play functionality
  }

  const handleAddCollaborator = () => {
    console.log('Add collaborator')
    // TODO: Implement add collaborator functionality
  }

  // Empty tracks for now
  const tracks: Track[] = []

  return (
    <Show when={!loading()} fallback={
      <div class="h-full flex items-center justify-center">
        <p class="text-[var(--text-muted)]">Loading...</p>
      </div>
    }>
      <Show when={playlist()} fallback={
        <div class="h-full flex items-center justify-center">
          <p class="text-[var(--text-muted)]">Playlist not found</p>
        </div>
      }>
        {(p) => (
          <div class="h-full overflow-y-auto bg-gradient-to-b from-[#4a3f6b] via-[#2a2440] to-[var(--bg-page)] rounded-t-lg">
            <MediaHeader
                type="playlist"
                title={p().title}
                description={p().description}
                coverSrc={p().coverUrl}
                stats={{
                  songCount: p().songCount,
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
              <Show when={tracks.length > 0} fallback={
                <div class="px-8 py-12 text-center">
                  <p class="text-[var(--text-muted)] text-lg">No songs yet</p>
                  <p class="text-[var(--text-muted)] text-sm mt-2">Add songs to this playlist to get started</p>
                </div>
              }>
                <TrackList
                  tracks={tracks}
                  onTrackClick={(track) => console.log('Track clicked:', track)}
                  onTrackPlay={(track) => console.log('Track play:', track)}
                  menuActions={{
                    onAddToPlaylist: (track) => console.log('Add to playlist:', track),
                    onAddToQueue: (track) => console.log('Add to queue:', track),
                    onGoToArtist: (track) => console.log('Go to artist:', track),
                    onGoToAlbum: (track) => console.log('Go to album:', track),
                  }}
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
                          class="block w-48 h-48 rounded-lg bg-[var(--bg-highlight)] flex items-center justify-center cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors overflow-hidden"
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
                          class="w-full px-4 py-3 rounded-lg bg-[var(--bg-highlight)] text-[var(--text-primary)] text-lg placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
                          autofocus
                        />
                        <textarea
                          value={editDescription()}
                          onInput={(e) => setEditDescription(e.currentTarget.value)}
                          placeholder="Add a description (optional)"
                          rows={4}
                          class="w-full px-4 py-3 rounded-lg bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors resize-none flex-1"
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
                      Are you sure you want to delete "{p().title}"? This action cannot be undone.
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
    </Show>
  )
}
