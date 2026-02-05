import { type Component, createSignal, createMemo, For, Show, createEffect, onCleanup } from 'solid-js'
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
  AppLogo,
} from '@heaven/ui'
import { useNavigate, useLocation } from '@solidjs/router'
import { createQuery, useQueryClient } from '@tanstack/solid-query'
import { usePlatform } from 'virtual:heaven-platform'
import { useXMTP, useAuth, usePlayer } from '../../providers'
import { openAuthDialog } from '../../lib/auth-dialog'
import { fetchUserPlaylists, type OnChainPlaylist } from '../../lib/heaven/playlists'
import { fetchUploadedContent, fetchSharedContent } from '../../lib/heaven/scrobbles'
import { createPlaylistService } from '../../lib/playlist-service'
import { addToast } from '../../lib/toast'

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


const WalletIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
  </svg>
)

const CalendarIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
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

interface NavItemProps {
  icon: () => any
  label: string
  path: string
  active: boolean
  onClick: () => void
  badge?: number
}

const NavItem: Component<NavItemProps> = (props) => (
  <button
    type="button"
    class={`flex items-center gap-3 w-full px-3 py-3 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${props.active ? 'bg-[var(--bg-highlight)]' : ''}`}
    onClick={props.onClick}
  >
    <span class="relative w-6 h-6 flex items-center justify-center text-[var(--text-secondary)]">
      <props.icon />
      <Show when={props.badge && props.badge > 0}>
        <span class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1">
          {props.badge! > 99 ? '99+' : props.badge}
        </span>
      </Show>
    </span>
    <span class="text-base font-semibold text-[var(--text-secondary)]">{props.label}</span>
  </button>
)

export const AppSidebar: Component = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const platform = usePlatform()
  const auth = useAuth()
  const xmtp = useXMTP()
  const player = usePlayer()
  const queryClient = useQueryClient()
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
        navigate(`/playlist/${result.playlistId}`)

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
      <Sidebar>
        {/* Logo */}
        <div class="px-3 py-4 mb-2">
          <AppLogo size={36} />
        </div>

        {/* Main navigation */}
        <nav class="flex flex-col gap-1">
          <NavItem icon={HomeIcon} label="Home" path="/" active={isActive('/')} onClick={() => navigate('/')} />
          <NavItem icon={ChatCircleIcon} label="Messages" path="/chat" active={location.pathname.startsWith('/chat')} onClick={() => navigate('/chat')} badge={unreadMessageCount()} />
          <NavItem icon={WalletIcon} label="Wallet" path="/wallet" active={isActive('/wallet')} onClick={() => navigate('/wallet')} />
          <NavItem icon={CalendarIcon} label="Schedule" path="/schedule" active={isActive('/schedule')} onClick={() => navigate('/schedule')} />
          <NavItem icon={UserIcon} label="Profile" path="/profile" active={isActive('/profile')} onClick={() => navigate('/profile')} />
        </nav>

        {/* Music section - unified library + playlists */}
        <div class="mt-6 -mx-3 px-3 border-t border-[var(--bg-highlight)] pt-4">
          <div class="flex items-center justify-between px-3 mb-2">
            <span class="text-base text-[var(--text-muted)] font-medium">Music</span>
            <IconButton variant="soft" size="md" aria-label="Create playlist" onClick={() => auth.isAuthenticated() ? setCreatePlaylistOpen(true) : openAuthDialog()}>
              <PlusIcon />
            </IconButton>
          </div>

          <div class="flex flex-col gap-0.5">
            {/* System collections (Local, Cloud, Shared) */}
            <Show when={platform.isTauri}>
              <button
                type="button"
                class={`flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${isActive('/music/local') ? 'bg-[var(--bg-highlight)]' : ''}`}
                onClick={() => navigate('/music/local')}
              >
                <div class="w-10 h-10 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                  <FolderIcon />
                </div>
                <div class="flex flex-col min-w-0 text-left">
                  <span class="text-base text-[var(--text-primary)]">Local</span>
                  <span class="text-sm text-[var(--text-muted)]">{localTrackCount().toLocaleString()} songs</span>
                </div>
              </button>
            </Show>
            <button
              type="button"
              class={`flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${isActive('/music/cloud') ? 'bg-[var(--bg-highlight)]' : ''}`}
              onClick={() => navigate('/music/cloud')}
            >
              <div class="w-10 h-10 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                <CloudIcon />
              </div>
              <div class="flex flex-col min-w-0 text-left">
                <span class="text-base text-[var(--text-primary)]">Cloud</span>
                <span class="text-sm text-[var(--text-muted)]">{cloudTrackCount()} songs</span>
              </div>
            </button>
            <button
              type="button"
              class={`flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${isActive('/music/shared') ? 'bg-[var(--bg-highlight)]' : ''}`}
              onClick={() => navigate('/music/shared')}
            >
              <div class="w-10 h-10 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                <ShareIcon />
              </div>
              <div class="flex flex-col min-w-0 text-left">
                <span class="text-base text-[var(--text-primary)]">Shared</span>
                <span class="text-sm text-[var(--text-muted)]">{sharedTrackCount()} songs</span>
              </div>
            </button>

            {/* User playlists */}
            <For each={playlists()}>
              {(pl) => (
                <button
                  type="button"
                  class={`flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${location.pathname === `/playlist/${pl.id}` ? 'bg-[var(--bg-highlight)]' : ''}`}
                  onClick={() => navigate(`/playlist/${pl.id}`)}
                >
                  <AlbumCover
                    size="sm"
                    src={pl.coverCid ? `https://heaven.myfilebase.com/ipfs/${pl.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80` : undefined}
                    icon="playlist"
                  />
                  <div class="flex flex-col min-w-0 text-left">
                    <span class="text-base text-[var(--text-primary)] truncate">{pl.name}</span>
                    <span class="text-sm text-[var(--text-muted)]">{pl.trackCount} songs</span>
                  </div>
                </button>
              )}
            </For>
          </div>
        </div>


      </Sidebar>

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
