import { type Component, createSignal, createMemo, For, Show, createEffect, onCleanup } from 'solid-js'
import type { Track } from '@heaven/ui'
import {
  Sidebar,
  AlbumCover,
  IconButton,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
  DownloadDialog,
} from '@heaven/ui'
import {
  HOME, PROFILE, WALLET, SCHEDULE, SEARCH, CHAT, SETTINGS,
  musicTab, playlist,
} from '@heaven/core'
import { AppLogo } from './header'
import { useNavigate, useLocation } from '@solidjs/router'
import { createQuery, useQueryClient } from '@tanstack/solid-query'
import { usePlatform } from 'virtual:heaven-platform'
import { useXMTP, useAuth, usePlayer } from '../../providers'
import { openAuthDialog } from '../../lib/auth-dialog'
import { fetchUserPlaylists, type OnChainPlaylist } from '../../lib/heaven/playlists'
import { fetchUploadedContent, fetchSharedContent } from '../../lib/heaven/scrobbles'
import { createPlaylistService } from '../../lib/playlist-service'
import { addToast, updateToast } from '../../lib/toast'
import { computeTrackIdFromMeta } from '../../lib/track-id'
import { setCoverCache, setCoverCacheById } from '../../lib/cover-cache'
import { readCoverBase64 } from '../../lib/cover-image'

// Phosphor icons (regular weight, 256x256)
const HomeIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
  </svg>
)

const ChatCircleIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)

const UserIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)


const SearchIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
  </svg>
)

const CalendarIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
  </svg>
)

const GearIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.48l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187,173.11a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.48a73.93,73.93,0,0,1-8.68,0,8,8,0,0,0-5.48,1.74L100.45,215.8a91.57,91.57,0,0,1-15-6.23L82.89,187a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64L46.43,170.6a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.48,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.48L40.2,100.45a91.57,91.57,0,0,1,6.23-15L69,82.89a8,8,0,0,0,5.1-2.64,74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,82.89,69L85.4,46.43a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.48,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.48-1.74L155.55,40.2a91.57,91.57,0,0,1,15,6.23L173.11,69a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z" />
  </svg>
)

const DownloadIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z" />
  </svg>
)

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
  </svg>
)

// Music library sub-nav icons
const FolderIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,200H40V88H216Z" />
  </svg>
)
const CloudIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M160,40A88.09,88.09,0,0,0,81.29,88.67,64,64,0,1,0,72,216h88a88,88,0,0,0,0-176Zm0,160H72a48,48,0,0,1,0-96c1.1,0,2.2,0,3.29.11A88,88,0,0,0,72,128a8,8,0,0,0,16,0,72,72,0,1,1,72,72Z" />
  </svg>
)
const ShareIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z" />
  </svg>
)

/** Parse track data from drag event */
const parseTrackFromDrag = (e: DragEvent): Track | null => {
  try {
    const data = e.dataTransfer?.getData('application/x-heaven-track')
    if (!data) return null
    return JSON.parse(data) as Track
  } catch {
    return null
  }
}

interface PlaylistDropTargetProps {
  playlist: OnChainPlaylist
  isActive: boolean
  onClick: () => void
  onDrop: (track: Track, playlist: OnChainPlaylist) => void
  compact?: boolean
}

const PlaylistDropTarget: Component<PlaylistDropTargetProps> = (props) => {
  const [isDragOver, setIsDragOver] = createSignal(false)

  const handleDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('application/x-heaven-track')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const track = parseTrackFromDrag(e)
    if (track) {
      props.onDrop(track, props.playlist)
    }
  }

  const coverSrc = () => props.playlist.coverCid
    ? `https://heaven.myfilebase.com/ipfs/${props.playlist.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
    : undefined

  return (
    <button
      type="button"
      class={`flex items-center rounded-md cursor-pointer transition-colors ${
        isDragOver()
          ? 'ring-2 ring-[var(--accent-blue)] bg-[var(--bg-highlight)]'
          : props.isActive
            ? 'bg-[var(--bg-highlight)]'
            : 'hover:bg-[var(--bg-highlight-hover)]'
      } ${props.compact ? 'w-11 h-11 justify-center p-0 overflow-hidden' : 'gap-3 w-full px-3 py-2'}`}
      onClick={props.onClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      title={props.playlist.name}
    >
      <Show when={props.compact} fallback={
        <>
          <AlbumCover
            size="sm"
            src={coverSrc()}
            icon="playlist"
            class="flex-shrink-0"
          />
          <div class="flex flex-col min-w-0 text-left">
            <span class="text-base text-[var(--text-primary)] truncate whitespace-nowrap">{props.playlist.name}</span>
            <span class="text-sm text-[var(--text-muted)] whitespace-nowrap">{props.playlist.trackCount} songs</span>
          </div>
        </>
      }>
        <AlbumCover
          size="sm"
          src={coverSrc()}
          icon="playlist"
        />
      </Show>
    </button>
  )
}

interface NavItemProps {
  icon: () => any
  label: string
  path: string
  active: boolean
  onClick: () => void
  badge?: number
  compact?: boolean
}

const NavItem: Component<NavItemProps> = (props) => (
  <button
    type="button"
    class={`flex items-center gap-3 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${props.active ? 'bg-[var(--bg-highlight)]' : ''} ${props.compact ? 'w-11 h-12 justify-center p-0' : 'w-full px-3 py-3'}`}
    onClick={props.onClick}
    title={props.label}
  >
    <span class="relative w-6 h-6 flex-shrink-0 flex items-center justify-center text-[var(--text-secondary)]">
      <props.icon />
      <Show when={props.badge && props.badge > 0}>
        <span class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1">
          {props.badge! > 99 ? '99+' : props.badge}
        </span>
      </Show>
    </span>
    <Show when={!props.compact}>
      <span class="text-base font-semibold text-[var(--text-secondary)] whitespace-nowrap">{props.label}</span>
    </Show>
  </button>
)

export const AppSidebar: Component<{ compact?: boolean }> = (props) => {
  const navigate = useNavigate()
  const location = useLocation()
  const platform = usePlatform()
  const auth = useAuth()
  const xmtp = useXMTP()
  const player = usePlayer()
  const queryClient = useQueryClient()
  const [downloadOpen, setDownloadOpen] = createSignal(false)
  const [createPlaylistOpen, setCreatePlaylistOpen] = createSignal(false)
  const [newPlaylistName, setNewPlaylistName] = createSignal('')
  const [creatingPlaylist, setCreatingPlaylist] = createSignal(false)

  const playlistService = createPlaylistService(
    () => auth.getAuthContext(),
    () => auth.pkpInfo()?.publicKey ?? null,
    () => auth.pkpAddress() ?? null,
  )

  const playlistsQuery = createQuery(() => ({
    queryKey: ['userPlaylists', auth.pkpAddress()],
    queryFn: () => fetchUserPlaylists(auth.pkpAddress()!),
    get enabled() { return auth.isAuthenticated() && !!auth.pkpAddress() },
  }))

  const playlists = () => playlistsQuery.data ?? []

  // Cloud/Shared track counts
  const cloudTracksQuery = createQuery(() => ({
    queryKey: ['uploadedContent', auth.pkpInfo()?.ethAddress],
    queryFn: () => fetchUploadedContent(auth.pkpInfo()!.ethAddress),
    get enabled() { return !!auth.pkpInfo()?.ethAddress },
  }))

  const sharedTracksQuery = createQuery(() => ({
    queryKey: ['sharedContent', auth.pkpInfo()?.ethAddress],
    queryFn: () => fetchSharedContent(auth.pkpInfo()!.ethAddress),
    get enabled() { return !!auth.pkpInfo()?.ethAddress },
  }))

  const localTrackCount = () => player.tracks().length
  const cloudTrackCount = () => cloudTracksQuery.data?.length ?? 0
  const sharedTrackCount = () => sharedTracksQuery.data?.length ?? 0

  const retryAbort = new AbortController()
  onCleanup(() => retryAbort.abort())

  /** Handle track drop onto a playlist */
  const handleTrackDrop = async (track: Track, playlist: OnChainPlaylist) => {
    const toastId = addToast(`Adding to ${playlist.name}...`, 'info', 0)

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

    if (track.albumCover) {
      setCoverCache(track.artist, track.title, track.album, track.albumCover)
      setCoverCacheById(computedTrackId ?? undefined, track.albumCover)
    }

    try {
      // Get existing trackIds from cache or subgraph
      const cached = queryClient.getQueryData<{ playlist: OnChainPlaylist; tracks: Track[] }>(['playlist', playlist.id])
      const existingTrackIds: string[] = cached?.tracks
        ?.map((t) => t.id)
        .filter((id) => /^0x[0-9a-fA-F]{64}$/.test(id)) ?? []

      if (existingTrackIds.length === 0 && playlist.trackCount > 0) {
        const { fetchPlaylistTracks } = await import('../../lib/heaven/playlists')
        const subgraphTracks = await fetchPlaylistTracks(playlist.id)
        existingTrackIds.push(...subgraphTracks.map((t) => t.trackId))
      }

      // Build track input
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

      // Optimistic cache update
      const addr = auth.pkpAddress()
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

      const result = await playlistService.setTracks({
        playlistId: playlist.id,
        existingTrackIds,
        tracks: [trackInput],
      })

      if (result.success) {
        updateToast(toastId, `Added to ${playlist.name}`, 'success', 4000)
      } else {
        updateToast(toastId, `Failed to add to ${playlist.name}`, 'error', 4000)
        console.error('[Sidebar] Drop failed:', result.error)
      }

      // Delay invalidation until the subgraph indexes the new track
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['playlist', playlist.id] })
        queryClient.invalidateQueries({ queryKey: ['userPlaylists'] })
      }

      if (computedTrackId) {
        try {
          const { fetchPlaylistTracks } = await import('../../lib/heaven/playlists')
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 5000))
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

      setTimeout(invalidate, 8000)
    } catch (err) {
      updateToast(toastId, `Failed to add to ${playlist.name}`, 'error', 4000)
      console.error('[Sidebar] Drop error:', err)
    }
  }

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName().trim()
    if (!name) return
    setCreatingPlaylist(true)
    try {
      const result = await playlistService.createPlaylist({
        name,
        coverCid: '',
        visibility: 0,
        tracks: [],
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
          trackCount: 0,
          version: 1,
          exists: true,
          tracksHash: '',
          createdAt: now,
          updatedAt: now,
        }
        queryClient.setQueryData(['playlist', result.playlistId], {
          playlist: optimisticPlaylist,
          tracks: [],
        })
        const cached = queryClient.getQueryData<OnChainPlaylist[]>(['userPlaylists', addr]) ?? []
        queryClient.setQueryData(['userPlaylists', addr], [optimisticPlaylist, ...cached])

        setCreatePlaylistOpen(false)
        setNewPlaylistName('')
        navigate(playlist(result.playlistId))

        const signal = retryAbort.signal
        ;(async () => {
          for (let i = 0; i < 5; i++) {
            if (signal.aborted) break
            await new Promise((r) => setTimeout(r, 5000))
            if (signal.aborted) break
            queryClient.invalidateQueries({ queryKey: ['userPlaylists'] })
            queryClient.invalidateQueries({ queryKey: ['playlist', result.playlistId] })
            const current = playlistsQuery.data ?? []
            if (current.some((p) => p.id === result.playlistId)) break
          }
        })()
      }
    } catch (err) {
      console.error('[Sidebar] Create playlist failed:', err)
      addToast('Failed to create playlist', 'error')
    }
    setCreatingPlaylist(false)
  }

  // Auto-connect XMTP when authenticated AND authData is available.
  createEffect(() => {
    if (auth.isAuthenticated() && auth.authData() && !xmtp.isConnected() && !xmtp.isConnecting()) {
      xmtp.connect().catch((err) => {
        console.error('[AppSidebar] Failed to connect XMTP:', err)
      })
    }
  })

  const isActive = (path: string) => location.pathname === path
  const unreadMessageCount = createMemo(() =>
    xmtp.conversations().filter((c) => c.hasUnread).length
  )

  return (
    <>
      <Sidebar compact={props.compact}>
        {/* Logo */}
        <div class={`py-4 mb-2 flex items-center ${props.compact ? 'justify-center' : 'px-3'}`}>
          <AppLogo size={36} />
        </div>

        {/* Main navigation */}
        <nav class="flex flex-col gap-1">
          <NavItem icon={HomeIcon} label="Home" path={HOME} active={isActive(HOME)} onClick={() => navigate(HOME)} compact={props.compact} />
          <NavItem icon={SearchIcon} label="Search" path={SEARCH} active={isActive(SEARCH)} onClick={() => navigate(SEARCH)} compact={props.compact} />
          <NavItem icon={ChatCircleIcon} label="Messages" path={CHAT} active={location.pathname.startsWith(CHAT)} onClick={() => navigate(CHAT)} badge={unreadMessageCount()} compact={props.compact} />
          <NavItem icon={WalletIcon} label="Wallet" path={WALLET} active={isActive(WALLET)} onClick={() => navigate(WALLET)} compact={props.compact} />
          <NavItem icon={CalendarIcon} label="Schedule" path={SCHEDULE} active={isActive(SCHEDULE)} onClick={() => navigate(SCHEDULE)} compact={props.compact} />
          <NavItem icon={UserIcon} label="Profile" path={PROFILE} active={isActive(PROFILE)} onClick={() => navigate(PROFILE)} compact={props.compact} />
        </nav>

        {/* Music section - unified library + playlists */}
        <div class="mt-6 -mx-3 px-3 border-t border-[var(--bg-highlight)] pt-4">
          <div class="flex items-center justify-between px-3 mb-2 min-h-10">
            <Show when={!props.compact}>
              <span class="text-base text-[var(--text-muted)] font-medium whitespace-nowrap">Music</span>
              <IconButton variant="soft" size="md" aria-label="Create playlist" onClick={() => auth.isAuthenticated() ? setCreatePlaylistOpen(true) : openAuthDialog()}>
                <PlusIcon />
              </IconButton>
            </Show>
          </div>

          <div class={`flex flex-col ${props.compact ? 'gap-1.5' : 'gap-0.5'}`}>
            {/* System collections (Local, Cloud, Shared) */}
            <Show when={platform.isTauri}>
              <Show when={props.compact} fallback={
                <button
                  type="button"
                  class={`flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${isActive(musicTab('local')) ? 'bg-[var(--bg-highlight)]' : ''}`}
                  onClick={() => navigate(musicTab('local'))}
                >
                  <div class="w-10 h-10 flex-shrink-0 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                    <FolderIcon />
                  </div>
                  <div class="flex flex-col min-w-0 text-left">
                    <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Local</span>
                    <span class="text-sm text-[var(--text-muted)] whitespace-nowrap">{localTrackCount().toLocaleString()} songs</span>
                  </div>
                </button>
              }>
                <button
                  type="button"
                  class={`w-11 h-11 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors ${isActive(musicTab('local')) ? 'ring-1 ring-[var(--accent-blue)]' : ''}`}
                  onClick={() => navigate(musicTab('local'))}
                  title="Local"
                >
                  <FolderIcon />
                </button>
              </Show>
            </Show>

            <Show when={props.compact} fallback={
              <button
                type="button"
                class={`flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${isActive(musicTab('cloud')) ? 'bg-[var(--bg-highlight)]' : ''}`}
                onClick={() => navigate(musicTab('cloud'))}
              >
                <div class="w-10 h-10 flex-shrink-0 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                  <CloudIcon />
                </div>
                <div class="flex flex-col min-w-0 text-left">
                  <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Cloud</span>
                  <span class="text-sm text-[var(--text-muted)] whitespace-nowrap">{cloudTrackCount()} songs</span>
                </div>
              </button>
            }>
              <button
                type="button"
                class={`w-11 h-11 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors ${isActive(musicTab('cloud')) ? 'ring-1 ring-[var(--accent-blue)]' : ''}`}
                onClick={() => navigate(musicTab('cloud'))}
                title="Cloud"
              >
                <CloudIcon />
              </button>
            </Show>

            <Show when={props.compact} fallback={
              <button
                type="button"
                class={`flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${isActive(musicTab('shared')) ? 'bg-[var(--bg-highlight)]' : ''}`}
                onClick={() => navigate(musicTab('shared'))}
              >
                <div class="w-10 h-10 flex-shrink-0 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                  <ShareIcon />
                </div>
                <div class="flex flex-col min-w-0 text-left">
                  <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Shared</span>
                  <span class="text-sm text-[var(--text-muted)] whitespace-nowrap">{sharedTrackCount()} songs</span>
                </div>
              </button>
            }>
              <button
                type="button"
                class={`w-11 h-11 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors ${isActive(musicTab('shared')) ? 'ring-1 ring-[var(--accent-blue)]' : ''}`}
                onClick={() => navigate(musicTab('shared'))}
                title="Shared"
              >
                <ShareIcon />
              </button>
            </Show>

            {/* User playlists */}
            <For each={playlists()}>
              {(pl) => (
                <PlaylistDropTarget
                  playlist={pl}
                  isActive={location.pathname === playlist(pl.id)}
                  onClick={() => navigate(playlist(pl.id))}
                  onDrop={handleTrackDrop}
                  compact={props.compact}
                />
              )}
            </For>
          </div>
        </div>

        {/* Download + Settings - bottom sidebar actions */}
        <div class="mt-auto pt-3 flex flex-col gap-1">
          <NavItem
            icon={DownloadIcon}
            label="Download"
            path=""
            active={false}
            onClick={() => setDownloadOpen(true)}
            compact={props.compact}
          />
          <NavItem
            icon={GearIcon}
            label="Settings"
            path={SETTINGS}
            active={isActive(SETTINGS)}
            onClick={() => navigate(SETTINGS)}
            compact={props.compact}
          />
        </div>
      </Sidebar>

      {/* Download Dialog */}
      <DownloadDialog open={downloadOpen()} onOpenChange={setDownloadOpen} />

      {/* Create Playlist Dialog */}
      <Dialog open={createPlaylistOpen()} onOpenChange={setCreatePlaylistOpen}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Playlist</DialogTitle>
            <DialogDescription>
              Create a new on-chain playlist.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <input
              type="text"
              value={newPlaylistName()}
              onInput={(e) => setNewPlaylistName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreatePlaylist()
              }}
              placeholder="Playlist name"
              class="w-full px-4 py-2.5 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
              autofocus
            />
          </DialogBody>
          <DialogFooter>
            <DialogCloseButton
              as={(props: Record<string, unknown>) => (
                <Button {...props} variant="secondary">Cancel</Button>
              )}
            />
            <Button disabled={!newPlaylistName().trim() || creatingPlaylist()} onClick={handleCreatePlaylist}>
              {creatingPlaylist() ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
