/**
 * ChatLayout - Two-panel layout for messaging (Warpcast/X style)
 *
 * Left panel: conversation list (always visible)
 * Right panel: active conversation via <Outlet />
 */

import type { Component, ParentComponent } from 'solid-js'
import { For, Show, createSignal, createMemo } from 'solid-js'
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
  useIsMobile,
  PageHeader,
  PencilSimple,
} from '@heaven/ui'
import { CHAT, peerChat, aiChat } from '@heaven/core'
import { useXMTP, type ChatListItem as XMTPChatItem } from '../providers'
import { usePeerName } from '../lib/hooks/usePeerName'

const formatAddress = (addr: string) => {
  if (!addr) return ''
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** Format timestamp for chat list display */
const formatTimestamp = (date: Date | undefined): string => {
  if (!date) return ''
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Conversation item with name resolution.
 * Uses usePeerName hook to resolve heaven/ENS names.
 */
const ConversationItem: Component<{
  chat: XMTPChatItem
  active: boolean
  onClick: () => void
}> = (props) => {
  const peerName = usePeerName(() => props.chat.peerAddress)

  // Show truncated address as secondary handle when we have a resolved name
  const handle = () => {
    if (peerName.heavenName || peerName.ensName) {
      return formatAddress(props.chat.peerAddress)
    }
    return undefined
  }

  return (
    <ChatListItem
      name={peerName.displayName}
      handle={handle()}
      avatarUrl={peerName.avatarUrl ?? undefined}
      lastMessage={props.chat.lastMessage}
      timestamp={formatTimestamp(props.chat.timestamp)}
      unreadCount={props.chat.hasUnread ? 1 : 0}
      active={props.active}
      onClick={props.onClick}
    />
  )
}

const EmptyChat = () => (
  <div class="flex flex-col items-center justify-center h-full text-center px-8">
    <div class="w-16 h-16 rounded-full bg-[var(--bg-highlight)] flex items-center justify-center mb-4">
      <svg class="w-8 h-8 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
        <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
      </svg>
    </div>
    <h2 class="text-xl font-bold text-[var(--text-primary)] mb-2">Start Conversation</h2>
    <p class="text-base text-[var(--text-muted)]">Messages are e2e encrypted over XMTP.</p>
  </div>
)

// Default intro message for Scarlett
const SCARLETT_INTRO = "Hey, I'm Scarlett. I will match you with other users who like your music and meet your preferences to make new friends or date!"

export const ChatLayout: ParentComponent = (props) => {
  const navigate = useNavigate()
  const location = useLocation()
  const xmtp = useXMTP()
  const isMobile = useIsMobile()

  const [newChatOpen, setNewChatOpen] = createSignal(false)
  const [newChatAddress, setNewChatAddress] = createSignal('')

  // Get Scarlett's last message from localStorage, or use intro
  const scarlettLastMessage = createMemo(() => {
    try {
      const stored = localStorage.getItem('ai-chat-scarlett')
      if (stored) {
        const messages = JSON.parse(stored)
        if (messages.length > 0) {
          const last = messages[messages.length - 1]
          return last.content as string
        }
      }
    } catch {
      // Ignore parse errors
    }
    return SCARLETT_INTRO
  })

  const handleStartChat = () => {
    const addr = newChatAddress().trim()
    if (!addr) return
    setNewChatOpen(false)
    setNewChatAddress('')
    navigate(peerChat(addr))
  }

  const conversations = () => xmtp.conversations()

  // Check if we're on a specific chat (not just /chat index)
  const hasActiveChat = () => location.pathname !== CHAT

  // Mobile: show list OR conversation, not both
  // Desktop: show both side by side
  return (
    <div class="flex h-full">
      {/* Left: Conversation list - hidden on mobile when viewing a chat */}
      <Show when={!isMobile() || !hasActiveChat()}>
        <div class={`${isMobile() ? 'w-full' : 'w-[360px]'} flex-shrink-0 border-r border-[var(--border-subtle)] flex flex-col h-full overflow-hidden`}>
          {/* Header */}
          <PageHeader
            title="Messages"
            rightSlot={
              <IconButton onClick={() => setNewChatOpen(true)} aria-label="New message" variant="soft">
                <PencilSimple class="w-5 h-5" />
              </IconButton>
            }
          />

          {/* Conversation list */}
          <div class="flex-1 overflow-y-auto">
            {/* AI Chat pinned at top */}
            <ChatListItem
              name="Scarlett"
              avatarUrl="/scarlett-avatar.png"
              lastMessage={scarlettLastMessage()}
              timestamp=""
              active={location.pathname === aiChat('scarlett')}
              onClick={() => navigate(aiChat('scarlett'))}
            />

            {/* Real XMTP conversations */}
            <For each={conversations()}>
              {(chat) => (
                <ConversationItem
                  chat={chat}
                  active={location.pathname === peerChat(chat.peerAddress)}
                  onClick={() => navigate(peerChat(chat.peerAddress))}
                />
              )}
            </For>

          </div>
        </div>
      </Show>

      {/* Right: Active conversation or empty state */}
      {/* On mobile: full width when viewing a chat, hidden when on list */}
      <Show when={!isMobile() || hasActiveChat()}>
        <div class="flex-1 h-full overflow-hidden">
          <Show when={hasActiveChat()} fallback={<EmptyChat />}>
            {props.children}
          </Show>
        </div>
      </Show>
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
              class="w-full px-4 py-2.5 rounded-full bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
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
