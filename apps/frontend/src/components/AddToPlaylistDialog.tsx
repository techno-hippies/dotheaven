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
import { fetchUserPlaylists, type OnChainPlaylist } from '../lib/heaven/playlists'
import { createPlaylistService } from '../lib/playlist-service'
import { useAuth } from '../providers'
import { addToast, updateToast } from '../lib/toast'
import { setCoverCache, setCoverCacheById } from '../lib/cover-cache'
import { readCoverBase64 } from '../lib/cover-image'
import { computeTrackIdFromMeta } from '../lib/track-id'

interface AddToPlaylistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  track: Track | null
}

/** Delay invalidation so optimistic data isn't overwritten by stale subgraph. */
const INVALIDATION_DELAY = 8000
const INDEX_POLL_INTERVAL = 5000
const INDEX_POLL_MAX_ATTEMPTS = 6

export const AddToPlaylistDialog: Component<AddToPlaylistDialogProps> = (props) => {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = createSignal(false)
  const [newName, setNewName] = createSignal('')

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

  const handleAddToPlaylist = (playlist: OnChainPlaylist) => {
    const track = props.track
    if (!track) return

    // Close dialog immediately
    props.onOpenChange(false)

    const local = track as Track & {
      mbid?: string | null
      ipId?: string | null
      coverCid?: string | null
      coverPath?: string | null
    }
    const computedTrackId = computeTrackIdFromMeta({
      artist: track.artist,
      title: track.title,
      album: track.album ?? null,
      mbid: local.mbid ?? null,
      ipId: local.ipId ?? null,
    })

    // Cache local cover so it survives refetch for unscrobbled tracks
    if (track.albumCover) {
      setCoverCache(track.artist, track.title, track.album, track.albumCover)
      setCoverCacheById(computedTrackId ?? undefined, track.albumCover)
    }

    // Optimistic cache updates
    const addr = auth.pkpAddress()
    const cached = queryClient.getQueryData<{ playlist: OnChainPlaylist; tracks: Track[] }>(['playlist', playlist.id])
    if (cached) {
      queryClient.setQueryData(['playlist', playlist.id], {
        playlist: { ...cached.playlist, trackCount: Number(cached.playlist.trackCount) + 1 },
        tracks: [...cached.tracks, {
          id: computedTrackId ?? `optimistic-${Date.now()}`,
          title: track.title,
          artist: track.artist,
          album: track.album || '',
          albumCover: track.albumCover,
          duration: track.duration || '--:--',
        }],
      })
    }
    const cachedPlaylists = queryClient.getQueryData<OnChainPlaylist[]>(['userPlaylists', addr])
    if (cachedPlaylists) {
      queryClient.setQueryData(['userPlaylists', addr],
        cachedPlaylists.map((p) => p.id === playlist.id ? { ...p, trackCount: Number(p.trackCount) + 1 } : p),
      )
    }

    // Background: run Lit Action + delayed invalidation
    const toastId = addToast(`Adding to ${playlist.name}...`, 'info', 0)

    ;(async () => {
      try {
        const coverImage = (!local.coverCid && local.coverPath)
          ? await readCoverBase64(local.coverPath)
          : null

        const trackInput = {
          artist: track.artist,
          title: track.title,
          ...(track.album ? { album: track.album } : {}),
          ...(local.mbid ? { mbid: local.mbid } : {}),
          ...(local.ipId ? { ipId: local.ipId } : {}),
          ...(local.coverCid ? { coverCid: local.coverCid } : {}),
          ...(coverImage ? { coverImage } : {}),
        }

        // Get existing trackIds from cache (preferred) or subgraph (fallback)
        const existingTrackIds: string[] = cached?.tracks
          ?.map((t) => t.id)
          .filter((id) => /^0x[0-9a-fA-F]{64}$/.test(id)) ?? []

        if (existingTrackIds.length === 0 && playlist.trackCount > 0) {
          const { fetchPlaylistTracks } = await import('../lib/heaven/playlists')
          const subgraphTracks = await fetchPlaylistTracks(playlist.id)
          existingTrackIds.push(...subgraphTracks.map((t) => t.trackId))
        }

        const result = await playlistService.setTracks({
          playlistId: playlist.id,
          existingTrackIds,
          tracks: [trackInput],
        })

        if (result.success) {
          updateToast(toastId, `Added to ${playlist.name}`, 'success', 4000)
        } else {
          updateToast(toastId, `Failed to add to ${playlist.name}`, 'error', 4000)
          console.error('[AddToPlaylist] Failed:', result.error)
        }
      } catch (err) {
        updateToast(toastId, `Failed to add to ${playlist.name}`, 'error', 4000)
        console.error('[AddToPlaylist] Error:', err)
      }

      // Delay invalidation until the subgraph indexes the new track
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['playlist', playlist.id] })
        queryClient.invalidateQueries({ queryKey: ['userPlaylists'] })
      }

      if (computedTrackId) {
        try {
          const { fetchPlaylistTracks } = await import('../lib/heaven/playlists')
          for (let i = 0; i < INDEX_POLL_MAX_ATTEMPTS; i++) {
            await new Promise((r) => setTimeout(r, INDEX_POLL_INTERVAL))
            const subgraphTracks = await fetchPlaylistTracks(playlist.id)
            if (subgraphTracks.some((t) => t.trackId.toLowerCase() === computedTrackId.toLowerCase())) {
              invalidate()
              return
            }
          }
        } catch {
          // ignore and fall back to delayed invalidation
        }
      }

      setTimeout(invalidate, INVALIDATION_DELAY)
    })()
  }

  const handleCreateAndAdd = () => {
    const track = props.track
    const name = newName().trim()
    if (!track || !name) return

    // Close dialog immediately
    props.onOpenChange(false)
    setShowCreate(false)
    setNewName('')

    const local = track as Track & {
      mbid?: string | null
      ipId?: string | null
      coverCid?: string | null
      coverPath?: string | null
    }
    const computedTrackId = computeTrackIdFromMeta({
      artist: track.artist,
      title: track.title,
      album: track.album ?? null,
      mbid: local.mbid ?? null,
      ipId: local.ipId ?? null,
    })

    // Cache local cover
    if (track.albumCover) {
      setCoverCache(track.artist, track.title, track.album, track.albumCover)
      setCoverCacheById(computedTrackId ?? undefined, track.albumCover)
    }

    const toastId = addToast(`Creating "${name}"...`, 'info', 0)

    ;(async () => {
      try {
        const coverImage = (!local.coverCid && local.coverPath)
          ? await readCoverBase64(local.coverPath)
          : null

        const trackInput = {
          artist: track.artist,
          title: track.title,
          ...(track.album ? { album: track.album } : {}),
          ...(local.mbid ? { mbid: local.mbid } : {}),
          ...(local.ipId ? { ipId: local.ipId } : {}),
          ...(local.coverCid ? { coverCid: local.coverCid } : {}),
          ...(coverImage ? { coverImage } : {}),
        }

        const result = await playlistService.createPlaylist({
          name,
          coverCid: '',
          visibility: 0,
          tracks: [trackInput],
        })

        if (result.success && result.playlistId) {
          const now = Math.floor(Date.now() / 1000)
          const addr = auth.pkpAddress()
          const optimisticPlaylist: OnChainPlaylist = {
            id: result.playlistId,
            owner: addr?.toLowerCase() ?? '',
            name,
            coverCid: '',
            visibility: 0,
            trackCount: 1,
            version: 1,
            exists: true,
            tracksHash: '',
            createdAt: now,
            updatedAt: now,
          }
          // Seed playlist page cache
          queryClient.setQueryData(['playlist', result.playlistId], {
            playlist: optimisticPlaylist,
            tracks: [{
              id: computedTrackId ?? `optimistic-${Date.now()}`,
              title: track.title,
              artist: track.artist,
              album: track.album || '',
              albumCover: track.albumCover,
              duration: track.duration || '--:--',
            }],
          })
          // Add to sidebar list
          const cachedPlaylists = queryClient.getQueryData<OnChainPlaylist[]>(['userPlaylists', addr]) ?? []
          queryClient.setQueryData(['userPlaylists', addr], [optimisticPlaylist, ...cachedPlaylists])

          updateToast(toastId, `Created "${name}"`, 'success', 4000)

          // Delayed invalidation
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['userPlaylists'] })
          }, INVALIDATION_DELAY)
        } else {
          updateToast(toastId, `Failed to create playlist`, 'error', 4000)
          console.error('[AddToPlaylist] Create failed:', result.error)
        }
      } catch (err) {
        updateToast(toastId, `Failed to create playlist`, 'error', 4000)
        console.error('[AddToPlaylist] Create error:', err)
      }
    })()
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
                class="w-full px-4 py-2.5 rounded-full bg-[var(--bg-highlight)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
                autofocus
              />
              <div class="flex gap-2">
                <Button variant="secondary" onClick={() => setShowCreate(false)} class="flex-1">
                  Back
                </Button>
                <Button onClick={handleCreateAndAdd} disabled={!newName().trim()} class="flex-1">
                  Create & Add
                </Button>
              </div>
            </div>
          }>
            <div class="flex flex-col gap-1">
              {/* Create New Playlist */}
              <button
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--bg-highlight)] transition-colors text-left"
                onClick={() => setShowCreate(true)}
              >
                <div class="w-10 h-10 rounded-md bg-[var(--bg-highlight)] flex items-center justify-center text-[var(--text-muted)]">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <span class="text-[var(--text-primary)] font-medium">Create New Playlist</span>
              </button>

              <Show when={playlistsQuery.isLoading}>
                <div class="px-3 py-4 text-center text-[var(--text-muted)] text-base">Loading playlists...</div>
              </Show>

              <Show when={!playlistsQuery.isLoading}>
                <For each={playlists()}>
                  {(pl) => (
                    <button
                      class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--bg-highlight)] transition-colors text-left"
                      onClick={() => handleAddToPlaylist(pl)}
                    >
                      <AlbumCover
                        size="sm"
                        src={pl.coverCid ? `https://heaven.myfilebase.com/ipfs/${pl.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80` : undefined}
                        icon="playlist"
                      />
                      <div class="flex-1 min-w-0">
                        <p class="text-[var(--text-primary)] text-base truncate">{pl.name}</p>
                        <p class="text-[var(--text-muted)] text-xs">{pl.trackCount} songs</p>
                      </div>
                    </button>
                  )}
                </For>
              </Show>

              <Show when={!playlistsQuery.isLoading && playlists().length === 0}>
                <div class="px-3 py-4 text-center text-[var(--text-muted)] text-base">
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
