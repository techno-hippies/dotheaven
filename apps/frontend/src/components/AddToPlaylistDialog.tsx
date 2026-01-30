import { type Component, createSignal, Show, For } from 'solid-js'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
  Button,
  AlbumCover,
  type Track,
} from '@heaven/ui'
import { createQuery, useQueryClient } from '@tanstack/solid-query'
import { fetchUserPlaylists, fetchPlaylistTracks, type OnChainPlaylist } from '../lib/heaven/playlists'
import { createPlaylistService } from '../lib/playlist-service'
import { useAuth } from '../providers'

interface AddToPlaylistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  track: Track | null
}

export const AddToPlaylistDialog: Component<AddToPlaylistDialogProps> = (props) => {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [adding, setAdding] = createSignal<string | null>(null)
  const [showCreate, setShowCreate] = createSignal(false)
  const [newName, setNewName] = createSignal('')
  const [creating, setCreating] = createSignal(false)

  const playlistService = createPlaylistService(
    () => auth.getAuthContext(),
    () => auth.pkpInfo()?.publicKey ?? null,
    () => auth.pkpAddress() ?? null,
  )

  const playlistsQuery = createQuery(() => ({
    queryKey: ['userPlaylists', auth.pkpAddress()],
    queryFn: () => fetchUserPlaylists(auth.pkpAddress()!),
    get enabled() { return props.open && !!auth.pkpAddress() },
  }))

  const playlists = () => playlistsQuery.data ?? []

  const handleAddToPlaylist = async (playlist: OnChainPlaylist) => {
    const track = props.track
    if (!track) return

    setAdding(playlist.id)
    try {
      const existingTracks = await fetchPlaylistTracks(playlist.id)
      const existingTrackIds = existingTracks.map((t) => t.trackId)

      const result = await playlistService.setTracks({
        playlistId: playlist.id,
        existingTrackIds,
        tracks: [{
          artist: track.artist,
          title: track.title,
          album: track.album || undefined,
        }],
      })

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['playlistTracks', playlist.id] })
        queryClient.invalidateQueries({ queryKey: ['resolvedTracks', playlist.id] })
        queryClient.invalidateQueries({ queryKey: ['userPlaylists'] })
        props.onOpenChange(false)
      } else {
        console.error('[AddToPlaylist] Failed:', result.error)
      }
    } catch (err) {
      console.error('[AddToPlaylist] Error:', err)
    }
    setAdding(null)
  }

  const handleCreateAndAdd = async () => {
    const track = props.track
    const name = newName().trim()
    if (!track || !name) return

    setCreating(true)
    try {
      const result = await playlistService.createPlaylist({
        name,
        coverCid: '',
        visibility: 0,
        tracks: [{
          artist: track.artist,
          title: track.title,
          album: track.album || undefined,
        }],
      })

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['userPlaylists'] })
        props.onOpenChange(false)
        setShowCreate(false)
        setNewName('')
      } else {
        console.error('[AddToPlaylist] Create failed:', result.error)
      }
    } catch (err) {
      console.error('[AddToPlaylist] Create error:', err)
    }
    setCreating(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Playlist</DialogTitle>
          <DialogDescription>
            {props.track ? `"${props.track.title}" by ${props.track.artist}` : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Show when={!showCreate()} fallback={
            <div class="flex flex-col gap-3">
              <input
                type="text"
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAndAdd() }}
                placeholder="Playlist name"
                class="w-full px-4 py-2.5 rounded-lg bg-[var(--bg-highlight)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
                autofocus
              />
              <div class="flex gap-2">
                <Button variant="secondary" onClick={() => setShowCreate(false)} class="flex-1">
                  Back
                </Button>
                <Button onClick={handleCreateAndAdd} disabled={!newName().trim() || creating()} class="flex-1">
                  {creating() ? 'Creating...' : 'Create & Add'}
                </Button>
              </div>
            </div>
          }>
            <div class="flex flex-col gap-1">
              {/* Create New Playlist */}
              <button
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-highlight)] transition-colors text-left"
                onClick={() => setShowCreate(true)}
              >
                <div class="w-10 h-10 rounded-lg bg-[var(--bg-highlight)] flex items-center justify-center text-[var(--text-muted)]">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <span class="text-[var(--text-primary)] font-medium">Create New Playlist</span>
              </button>

              <Show when={playlistsQuery.isLoading}>
                <div class="px-3 py-4 text-center text-[var(--text-muted)] text-sm">Loading playlists...</div>
              </Show>

              <Show when={!playlistsQuery.isLoading}>
                <For each={playlists()}>
                  {(pl) => (
                    <button
                      class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-highlight)] transition-colors text-left disabled:opacity-50"
                      onClick={() => handleAddToPlaylist(pl)}
                      disabled={adding() !== null}
                    >
                      <AlbumCover
                        size="sm"
                        src={pl.coverCid ? `https://ipfs.filebase.io/ipfs/${pl.coverCid}` : undefined}
                        icon="playlist"
                      />
                      <div class="flex-1 min-w-0">
                        <p class="text-[var(--text-primary)] text-sm truncate">{pl.name}</p>
                        <p class="text-[var(--text-muted)] text-xs">{pl.trackCount} songs</p>
                      </div>
                      <Show when={adding() === pl.id}>
                        <span class="text-[var(--text-muted)] text-xs">Adding...</span>
                      </Show>
                    </button>
                  )}
                </For>
              </Show>

              <Show when={!playlistsQuery.isLoading && playlists().length === 0}>
                <div class="px-3 py-4 text-center text-[var(--text-muted)] text-sm">
                  No playlists yet. Create one above.
                </div>
              </Show>
            </div>
          </Show>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
