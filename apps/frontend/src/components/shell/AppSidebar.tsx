import { type Component, createSignal, For, Show, createEffect } from 'solid-js'
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
import { useXMTP, useAuth } from '../../providers'

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

  const [newChatAddress, setNewChatAddress] = createSignal('')
  const [newChatOpen, setNewChatOpen] = createSignal(false)

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
        <SidebarSection
          title="Chat"
          icon={<ChatCircleIcon />}
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
          <Show when={xmtp.isConnecting()}>
            <div class="px-3 py-2 text-sm text-[var(--text-muted)]">
              Connecting...
            </div>
          </Show>
          <Show when={xmtp.isConnected() && xmtp.conversations().length === 0}>
            <div class="px-3 py-2 text-sm text-[var(--text-muted)]">
              No conversations yet
            </div>
          </Show>
          <Show when={!auth.isAuthenticated() && !xmtp.isConnecting()}>
            <div class="px-3 py-2 text-sm text-[var(--text-muted)]">
              Sign in to see chats
            </div>
          </Show>
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
              <IconButton variant="soft" size="md" aria-label="Add playlist">
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
            subtitle="0 songs"
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
          <ListItem
            title="Scrobbles"
            subtitle="On-chain history"
            cover={<AlbumCover size="sm" icon="music" />}
            onClick={() => navigate('/scrobbles')}
            active={isActive('/scrobbles')}
          />
          <ListItem
            title="Free Weekly"
            subtitle="Playlist • technohippies"
            cover={<AlbumCover size="sm" icon="playlist" />}
          />
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
              class="w-full px-4 py-2.5 rounded-lg bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
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
    </>
  )
}
