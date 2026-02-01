import { type Component, createSignal, For, Show, createEffect, onCleanup } from 'solid-js'
import {
  Sidebar,
  SidebarSection,
  ListItem,
  Avatar,
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
import { fetchUserPlaylists, type OnChainPlaylist } from '../../lib/heaven/playlists'
import { createPlaylistService } from '../../lib/playlist-service'
import { addToast, updateToast } from '../../lib/toast'

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

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const SparkleIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,144a15.78,15.78,0,0,1-10.42,14.94l-51.65,19-19,51.65a15.92,15.92,0,0,1-29.88,0L78,178l-51.62-19a15.92,15.92,0,0,1,0-29.88l51.65-19,19-51.65a15.92,15.92,0,0,1,29.88,0l19,51.65,51.65,19A15.78,15.78,0,0,1,208,144ZM152,48h16V64a8,8,0,0,0,16,0V48h16a8,8,0,0,0,0-16H184V16a8,8,0,0,0-16,0V32H152a8,8,0,0,0,0,16Zm88,32h-8V72a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0V96h8a8,8,0,0,0,0-16Z" />
  </svg>
)

// AI Personalities
const AI_PERSONALITIES = [
  {
    id: 'scarlett',
    name: 'Scarlett',
    subtitle: 'AI Assistant',
    avatarUrl: 'https://picsum.photos/seed/scarlett/200/200',
  },
]

export const AppSidebar: Component = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  const xmtp = useXMTP()
  const queryClient = useQueryClient()

  const player = usePlayer()

  const [newChatAddress, setNewChatAddress] = createSignal('')
  const [newChatOpen, setNewChatOpen] = createSignal(false)
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

  // AbortController for retry loops — scoped to component lifetime
  const retryAbort = new AbortController()
  onCleanup(() => retryAbort.abort())

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName().trim()
    console.log('[Sidebar] handleCreatePlaylist called, name:', JSON.stringify(name))
    if (!name) return
    setCreatingPlaylist(true)
    try {
      console.log('[Sidebar] Calling playlistService.createPlaylist...')
      const result = await playlistService.createPlaylist({
        name,
        coverCid: '',
        visibility: 0,
        tracks: [],
      })
      console.log('[Sidebar] createPlaylist result:', JSON.stringify(result))
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
        // Seed playlist page cache so it renders immediately
        queryClient.setQueryData(['playlist', result.playlistId], {
          playlist: optimisticPlaylist,
          tracks: [],
        })
        // Prepend to sidebar playlist list
        const cached = queryClient.getQueryData<OnChainPlaylist[]>(['userPlaylists', addr]) ?? []
        queryClient.setQueryData(['userPlaylists', addr], [optimisticPlaylist, ...cached])

        setCreatePlaylistOpen(false)
        setNewPlaylistName('')
        navigate(`/playlist/${result.playlistId}`)

        // Background: delayed retry invalidation until subgraph indexes
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
  // Skip if authData is null (new signup) — signing would trigger WebAuthn without a user gesture.
  createEffect(() => {
    if (auth.isAuthenticated() && auth.authData() && !xmtp.isConnected() && !xmtp.isConnecting()) {
      xmtp.connect().catch((err) => {
        console.error('[AppSidebar] Failed to connect XMTP:', err)
      })
    }
  })

  const isActive = (path: string) => location.pathname === path

  const handleStartChat = () => {
    const address = newChatAddress().trim()
    if (address) {
      setNewChatOpen(false)
      setNewChatAddress('')
      navigate(`/chat/${encodeURIComponent(address)}`)
    }
  }

  return (
    <>
      <Sidebar>
        <button
          type="button"
          class={`flex items-center gap-2 px-3 py-3 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${isActive('/') ? 'bg-[var(--bg-highlight)]' : ''}`}
          onClick={() => navigate('/')}
        >
          <span class="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)]">
            <HomeIcon />
          </span>
          <span class="text-sm font-semibold text-[var(--text-secondary)]">Home</span>
        </button>
        <SidebarSection
          title="Chat"
          icon={<ChatCircleIcon />}
          onTitleClick={() => navigate('/chat')}
          action={
            <div class="flex items-center gap-1">
              <IconButton
                variant="soft"
                size="md"
                aria-label="Add chat"
                onClick={() => setNewChatOpen(true)}
              >
                <PlusIcon />
              </IconButton>
              <IconButton variant="soft" size="md" aria-label="Chat options">
                <ChevronDownIcon />
              </IconButton>
            </div>
          }
        >
          {/* AI Personalities - always visible */}
          <For each={AI_PERSONALITIES}>
            {(ai) => (
              <ListItem
                title={ai.name}
                subtitle={ai.subtitle}
                cover={
                  <div class="relative">
                    <Avatar size="sm" src={ai.avatarUrl} alt={ai.name} />
                    <div class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--accent-purple)] flex items-center justify-center">
                      <SparkleIcon />
                    </div>
                  </div>
                }
                onClick={() => navigate(`/chat/ai/${ai.id}`)}
                active={location.pathname === `/chat/ai/${ai.id}`}
              />
            )}
          </For>

          {/* XMTP Conversations */}
          <For each={xmtp.conversations()}>
            {(chat) => (
              <ListItem
                title={chat.name}
                cover={<Avatar size="sm" />}
                trailing={chat.hasUnread ? <div class="w-2.5 h-2.5 rounded-full bg-[var(--accent-blue)] shrink-0" /> : undefined}
                onClick={() => navigate(`/chat/${encodeURIComponent(chat.peerAddress)}`)}
                active={location.pathname === `/chat/${encodeURIComponent(chat.peerAddress)}`}
              />
            )}
          </For>
        </SidebarSection>
        <SidebarSection
          title="Music"
          icon={<MusicNotesIcon />}
          action={
            <div class="flex items-center gap-1">
              <IconButton variant="soft" size="md" aria-label="Add playlist" onClick={() => setCreatePlaylistOpen(true)}>
                <PlusIcon />
              </IconButton>
              <IconButton variant="soft" size="md" aria-label="Music options">
                <ChevronDownIcon />
              </IconButton>
            </div>
          }
        >
          <ListItem
            title="My Library"
            subtitle={`${player.tracks().length.toLocaleString()} songs`}
            cover={<AlbumCover size="sm" icon="music" />}
            onClick={() => navigate('/library')}
            active={isActive('/library')}
          />
          <ListItem
            title="Liked Songs"
            subtitle="0 songs"
            cover={<AlbumCover size="sm" icon="heart" />}
            onClick={() => navigate('/liked-songs')}
            active={isActive('/liked-songs')}
          />
          <For each={playlists()}>
            {(pl) => (
              <ListItem
                title={pl.name}
                subtitle={`${pl.trackCount} songs`}
                cover={
                  <AlbumCover
                    size="sm"
                    src={pl.coverCid ? `https://heaven.myfilebase.com/ipfs/${pl.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80` : undefined}
                    icon="playlist"
                  />
                }
                onClick={() => navigate(`/playlist/${pl.id}`)}
                active={location.pathname === `/playlist/${pl.id}`}
              />
            )}
          </For>
        </SidebarSection>
      </Sidebar>

      {/* New Chat Dialog */}
      <Dialog open={newChatOpen()} onOpenChange={setNewChatOpen}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>
              Start a conversation with anyone on the network.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <input
              type="text"
              value={newChatAddress()}
              onInput={(e) => setNewChatAddress(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleStartChat()
              }}
              placeholder="Message any ENS, .heaven, or 0x wallet address"
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
            <Button disabled={!newChatAddress().trim()} onClick={handleStartChat}>
              Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
