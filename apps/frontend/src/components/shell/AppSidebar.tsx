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
} from '@heaven/ui'
import { useNavigate, useLocation } from '@solidjs/router'
import { createQuery, useQueryClient } from '@tanstack/solid-query'
import { useXMTP, useAuth, usePlayer } from '../../providers'
import { usePlatform } from 'virtual:heaven-platform'
import { fetchUserPlaylists, type OnChainPlaylist } from '../../lib/heaven/playlists'
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

const MusicNotesIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)

const UserIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)

const BellIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M168,224a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,224Zm53.85-32A15.8,15.8,0,0,1,208,200H48a16,16,0,0,1-13.8-24.06C39.75,166.38,48,139.34,48,104a80,80,0,1,1,160,0c0,35.33,8.26,62.38,13.81,71.94A15.89,15.89,0,0,1,221.85,192ZM208,184c-7.73-13.27-16-43.95-16-80a64,64,0,1,0-128,0c0,36.06-8.28,66.74-16,80Z" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
  </svg>
)

const GearIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z" />
  </svg>
)

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M12 5v14M5 12h14" />
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
  const auth = useAuth()
  const xmtp = useXMTP()
  const queryClient = useQueryClient()
  const player = usePlayer()
  const platform = usePlatform()

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
        {/* Main navigation */}
        <nav class="flex flex-col gap-1">
          <NavItem icon={HomeIcon} label="Home" path="/" active={isActive('/')} onClick={() => navigate('/')} />
          <NavItem icon={ChatCircleIcon} label="Messages" path="/chat" active={location.pathname.startsWith('/chat')} onClick={() => navigate('/chat')} badge={unreadMessageCount()} />
          <Show when={platform.isTauri}>
            <NavItem icon={MusicNotesIcon} label="Local Files" path="/library" active={isActive('/library')} onClick={() => navigate('/library')} />
          </Show>
          <NavItem icon={BellIcon} label="Notifications" path="/notifications" active={isActive('/notifications')} onClick={() => {}} />
          <NavItem icon={WalletIcon} label="Wallet" path="/wallet" active={isActive('/wallet')} onClick={() => navigate('/wallet')} />
          <NavItem icon={UserIcon} label="Profile" path="/profile" active={isActive('/profile')} onClick={() => navigate('/profile')} />
          <NavItem icon={GearIcon} label="Settings" path="/settings" active={isActive('/settings')} onClick={() => navigate('/settings')} />
        </nav>

        {/* Playlists section */}
        <div class="mt-6 border-t border-[var(--bg-highlight)] pt-4">
          <div class="flex items-center justify-between px-3 mb-2">
            <span class="text-base text-[var(--text-muted)] font-medium">Playlists</span>
            <IconButton variant="soft" size="md" aria-label="Create playlist" onClick={() => setCreatePlaylistOpen(true)}>
              <PlusIcon />
            </IconButton>
          </div>

          <div class="flex flex-col gap-0.5">
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
            <Show when={playlists().length === 0}>
              <p class="px-3 py-2 text-sm text-[var(--text-muted)]">No playlists yet</p>
            </Show>
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
