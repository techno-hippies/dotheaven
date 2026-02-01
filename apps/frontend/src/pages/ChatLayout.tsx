/**
 * ChatLayout - Two-panel layout for messaging (Warpcast/X style)
 *
 * Left panel: conversation list (always visible)
 * Right panel: active conversation via <Outlet />
 */

import type { ParentComponent } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import { useNavigate, useLocation } from '@solidjs/router'
import {
  ChatListItem,
  IconButton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
  Button,
} from '@heaven/ui'
import { useXMTP } from '../providers'

const PenIcon = () => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" />
  </svg>
)

const PLACEHOLDER_CHATS = [
  { name: 'miku.heaven', address: '0x1234567890abcdef1234567890abcdef12345678', avatar: 'https://placewaifu.com/image/101', lastMessage: 'Have you heard the new album?', timestamp: '2m ago', unread: 2, online: true },
  { name: 'rei.heaven', address: '0x2345678901abcdef2345678901abcdef23456789', avatar: 'https://placewaifu.com/image/102', lastMessage: 'Check out this playlist I made', timestamp: '15m ago', unread: 1, online: false },
  { name: 'asuka.eth', address: '0x3456789012abcdef3456789012abcdef34567890', avatar: 'https://placewaifu.com/image/103', lastMessage: 'That concert was insane last night', timestamp: '1h ago', unread: 0, online: false },
  { name: 'sakura.heaven', address: '0x4567890123abcdef4567890123abcdef45678901', avatar: 'https://placewaifu.com/image/104', lastMessage: 'Want to go to the show tonight?', timestamp: '3h ago', unread: 0, online: true },
  { name: '', address: '0x5678901234abcdef5678901234abcdef56789012', avatar: 'https://placewaifu.com/image/105', lastMessage: "I'll send you the link later", timestamp: 'Yesterday', unread: 0, online: false },
  { name: 'kaworu.heaven', address: '0x6789012345abcdef6789012345abcdef67890123', avatar: 'https://placewaifu.com/image/107', lastMessage: 'You need to listen to this', timestamp: '2d ago', unread: 5, online: true },
]

const formatAddress = (addr: string) => {
  if (!addr) return ''
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const EmptyChat = () => (
  <div class="flex flex-col items-center justify-center h-full text-center px-8">
    <div class="w-16 h-16 rounded-full bg-[var(--bg-highlight)] flex items-center justify-center mb-4">
      <svg class="w-8 h-8 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
        <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
      </svg>
    </div>
    <h2 class="text-xl font-bold text-[var(--text-primary)] mb-2">Start Conversation</h2>
    <p class="text-base text-[var(--text-muted)]">Choose from your existing conversations, or start a new one.</p>
  </div>
)

export const ChatLayout: ParentComponent = (props) => {
  const navigate = useNavigate()
  const location = useLocation()
  const xmtp = useXMTP()

  const [newChatOpen, setNewChatOpen] = createSignal(false)
  const [newChatAddress, setNewChatAddress] = createSignal('')

  const handleStartChat = () => {
    const addr = newChatAddress().trim()
    if (!addr) return
    setNewChatOpen(false)
    setNewChatAddress('')
    navigate(`/chat/${encodeURIComponent(addr)}`)
  }

  const conversations = () => xmtp.conversations()
  const hasReal = () => conversations().length > 0

  // Check if we're on a specific chat (not just /chat index)
  const hasActiveChat = () => location.pathname !== '/chat'

  return (
    <div class="flex h-full">
      {/* Left: Conversation list */}
      <div class="w-[360px] flex-shrink-0 border-r border-[var(--bg-highlight)] flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <h1 class="text-xl font-bold text-[var(--text-primary)]">Messages</h1>
          <IconButton
            variant="soft"
            size="md"
            aria-label="New message"
            onClick={() => setNewChatOpen(true)}
          >
            <PenIcon />
          </IconButton>
        </div>

        {/* Conversation list */}
        <div class="flex-1 overflow-y-auto">
          {/* AI Chat pinned at top */}
          <ChatListItem
            name="Scarlett"
            avatarUrl="https://picsum.photos/seed/scarlett/200/200"
            lastMessage="How can I help you today?"
            timestamp=""
            online
            active={location.pathname === '/chat/ai/scarlett'}
            onClick={() => navigate('/chat/ai/scarlett')}
          />

          {/* Real XMTP conversations */}
          <For each={conversations()}>
            {(chat) => {
              console.log('[ChatLayout] rendering convo:', { name: chat.name, peerAddress: chat.peerAddress, lastMessage: chat.lastMessage })
              return (
                <ChatListItem
                  name={chat.name}
                  lastMessage={chat.lastMessage}
                  timestamp={chat.timestamp}
                  unreadCount={chat.hasUnread ? 1 : 0}
                  active={location.pathname === `/chat/${encodeURIComponent(chat.peerAddress)}`}
                  onClick={() => navigate(`/chat/${encodeURIComponent(chat.peerAddress)}`)}
                />
              )
            }}
          </For>

          {/* Placeholder when no real conversations */}
          <For each={hasReal() ? [] : PLACEHOLDER_CHATS}>
            {(chat) => (
              <ChatListItem
                name={chat.name || chat.address}
                handle={chat.name ? formatAddress(chat.address) : undefined}
                avatarUrl={chat.avatar}
                lastMessage={chat.lastMessage}
                timestamp={chat.timestamp}
                unreadCount={chat.unread}
                online={chat.online}
                active={location.pathname === `/chat/${encodeURIComponent(chat.address)}`}
                onClick={() => navigate(`/chat/${encodeURIComponent(chat.address)}`)}
              />
            )}
          </For>
        </div>
      </div>

      {/* Right: Active conversation or empty state */}
      <div class="flex-1 h-full overflow-hidden">
        <Show when={hasActiveChat()} fallback={<EmptyChat />}>
          {props.children}
        </Show>
      </div>
      {/* New Chat Dialog */}
      <Dialog open={newChatOpen()} onOpenChange={setNewChatOpen}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>
              Enter an Ethereum address or ENS name to start a conversation.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <input
              type="text"
              value={newChatAddress()}
              onInput={(e) => setNewChatAddress(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStartChat() }}
              placeholder="0x... or name.eth"
              class="w-full px-4 py-2.5 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
              autofocus
            />
          </DialogBody>
          <DialogFooter>
            <DialogCloseButton
              as={(closeProps: Record<string, unknown>) => (
                <Button {...closeProps} variant="secondary">Cancel</Button>
              )}
            />
            <Button disabled={!newChatAddress().trim()} onClick={handleStartChat}>
              Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
