import { type Component, createSignal, createMemo, For, Show, createEffect, onCleanup } from 'solid-js'
import type { Track } from '@heaven/ui'
import {
  Sidebar,
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
  CreateDialog,
} from '@heaven/ui'
import {
  HOME, PROFILE, WALLET, SCHEDULE, SEARCH, CHAT, SETTINGS,
  musicTab, playlist,
} from '@heaven/core'
import { AppLogo } from './header'
import {
  HomeIcon, ChatCircleIcon, UserIcon, SearchIcon,
  CalendarIcon, WalletIcon, GearIcon, DownloadIcon, PlusIcon,
  FolderIcon, CloudIcon, ShareIcon,
} from './sidebar-icons'
import { NavItem, PlaylistDropTarget } from './sidebar-nav'
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

export const AppSidebar: Component<{ compact?: boolean }> = (props) => {
  const navigate = useNavigate()
  const location = useLocation()
  const platform = usePlatform()
  const auth = useAuth()
  const xmtp = useXMTP()
  const player = usePlayer()
  const queryClient = useQueryClient()
  const [downloadOpen, setDownloadOpen] = createSignal(false)
  const [createOpen, setCreateOpen] = createSignal(false)
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
  const handleTrackDrop = async (track: Track, pl: OnChainPlaylist) => {
    const toastId = addToast(`Adding to ${pl.name}...`, 'info', 0)

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
      const cached = queryClient.getQueryData<{ playlist: OnChainPlaylist; tracks: Track[] }>(['playlist', pl.id])
      const existingTrackIds: string[] = cached?.tracks
        ?.map((t) => t.id)
        .filter((id) => /^0x[0-9a-fA-F]{64}$/.test(id)) ?? []

      if (existingTrackIds.length === 0 && pl.trackCount > 0) {
        const { fetchPlaylistTracks } = await import('../../lib/heaven/playlists')
        const subgraphTracks = await fetchPlaylistTracks(pl.id)
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
        queryClient.setQueryData(['playlist', pl.id], {
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
          cachedPlaylists.map((p) => p.id === pl.id ? { ...p, trackCount: Number(p.trackCount) + 1 } : p),
        )
      }

      const result = await playlistService.setTracks({
        playlistId: pl.id,
        existingTrackIds,
        tracks: [trackInput],
      })

      if (result.success) {
        updateToast(toastId, `Added to ${pl.name}`, 'success', 4000)
      } else {
        updateToast(toastId, `Failed to add to ${pl.name}`, 'error', 4000)
        console.error('[Sidebar] Drop failed:', result.error)
      }

      // Delay invalidation until the subgraph indexes the new track
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['playlist', pl.id] })
        queryClient.invalidateQueries({ queryKey: ['userPlaylists'] })
      }

      if (computedTrackId) {
        try {
          const { fetchPlaylistTracks } = await import('../../lib/heaven/playlists')
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 5000))
            const subgraphTracks = await fetchPlaylistTracks(pl.id)
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
      updateToast(toastId, `Failed to add to ${pl.name}`, 'error', 4000)
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
        <nav class={`flex flex-col gap-1 ${props.compact ? 'items-center' : ''}`}>
          <NavItem icon={HomeIcon} label="Home" path={HOME} active={isActive(HOME)} onClick={() => navigate(HOME)} compact={props.compact} />
          <NavItem icon={SearchIcon} label="Search" path={SEARCH} active={isActive(SEARCH)} onClick={() => navigate(SEARCH)} compact={props.compact} />
          <NavItem icon={ChatCircleIcon} label="Messages" path={CHAT} active={location.pathname.startsWith(CHAT)} onClick={() => navigate(CHAT)} badge={unreadMessageCount()} compact={props.compact} />
          <NavItem icon={WalletIcon} label="Wallet" path={WALLET} active={isActive(WALLET)} onClick={() => navigate(WALLET)} compact={props.compact} />
          <NavItem icon={CalendarIcon} label="Schedule" path={SCHEDULE} active={isActive(SCHEDULE)} onClick={() => navigate(SCHEDULE)} compact={props.compact} />
          <NavItem icon={UserIcon} label="Profile" path={PROFILE} active={isActive(PROFILE)} onClick={() => navigate(PROFILE)} compact={props.compact} />
        </nav>

        {/* Music section - unified library + playlists */}
        <div class="mt-6 -mx-3 px-3 border-t border-[var(--border-subtle)] pt-4">
          <div class="flex items-center justify-between px-3 mb-2 min-h-10">
            <Show when={!props.compact}>
              <span class="text-base text-[var(--text-muted)] font-medium whitespace-nowrap">Music</span>
              <IconButton
                variant="soft"
                size="md"
                aria-label="Create"
                onClick={() => auth.isAuthenticated() ? setCreateOpen(true) : openAuthDialog()}
              >
                <PlusIcon />
              </IconButton>
            </Show>
          </div>

          <div class={`flex flex-col ${props.compact ? 'gap-1.5 items-center' : 'gap-0.5'}`}>
            {/* System collections (Local, Cloud, Shared With Me) */}
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
                    <span class="text-base text-[var(--text-muted)] whitespace-nowrap">{localTrackCount().toLocaleString()} songs</span>
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
                  <span class="text-base text-[var(--text-muted)] whitespace-nowrap">{cloudTrackCount()} songs</span>
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
                  <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Shared With Me</span>
                  <span class="text-base text-[var(--text-muted)] whitespace-nowrap">{sharedTrackCount()} songs</span>
                </div>
              </button>
            }>
              <button
                type="button"
                class={`w-11 h-11 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors ${isActive(musicTab('shared')) ? 'ring-1 ring-[var(--accent-blue)]' : ''}`}
                onClick={() => navigate(musicTab('shared'))}
                title="Shared With Me"
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
        <div class={`mt-auto pt-3 flex flex-col gap-1 ${props.compact ? 'items-center' : ''}`}>
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

      {/* Create Dialog (New Playlist / Publish Song) */}
      <CreateDialog
        open={createOpen()}
        onOpenChange={setCreateOpen}
        onNewPlaylist={() => setCreatePlaylistOpen(true)}
        onPublishSong={() => navigate(musicTab('publish'))}
      />

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
