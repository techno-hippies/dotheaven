import type { Component } from 'solid-js'
import { For } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { ChatListItem, IconButton } from '@heaven/ui'
import { useXMTP } from '../providers'

const PenIcon = () => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" />
  </svg>
)

// Placeholder conversations for when XMTP isn't connected
const PLACEHOLDER_CHATS = [
  { name: 'Miku', handle: 'miku.heaven', avatar: 'https://placewaifu.com/image/101', lastMessage: 'Have you heard the new album?', timestamp: '2m ago', unread: 2, online: true },
  { name: 'Rei', handle: 'rei.heaven', avatar: 'https://placewaifu.com/image/102', lastMessage: 'Check out this playlist I made', timestamp: '15m ago', unread: 1, online: false },
  { name: 'Asuka', handle: 'asuka.eth', avatar: 'https://placewaifu.com/image/103', lastMessage: 'That concert was insane last night', timestamp: '1h ago', unread: 0, online: false },
  { name: 'Sakura', handle: 'sakura.heaven', avatar: 'https://placewaifu.com/image/104', lastMessage: 'Want to go to the show tonight?', timestamp: '3h ago', unread: 0, online: true },
  { name: 'Misato', handle: 'misato.heaven', avatar: 'https://placewaifu.com/image/105', lastMessage: "I'll send you the link later", timestamp: 'Yesterday', unread: 0, online: false },
  { name: 'Kaworu', handle: 'kaworu.heaven', avatar: 'https://placewaifu.com/image/107', lastMessage: 'You need to listen to this', timestamp: '2d ago', unread: 5, online: true },
]

export const ChatListPage: Component = () => {
  const navigate = useNavigate()
  const xmtp = useXMTP()

  const conversations = () => xmtp.conversations()
  const hasReal = () => conversations().length > 0

  return (
    <div class="h-full overflow-y-auto">
      <div class="max-w-[600px] mx-auto py-4 px-4 flex flex-col gap-3">
        {/* Header */}
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-bold text-[var(--text-primary)]">Messages</h1>
          <IconButton
            variant="soft"
            size="md"
            aria-label="New message"
            onClick={() => {/* TODO: open new chat dialog */}}
          >
            <PenIcon />
          </IconButton>
        </div>

        {/* Conversation list card */}
        <div class="bg-[var(--bg-surface)] rounded-md">
          {/* AI Chat pinned at top */}
          <ChatListItem
            name="Scarlett"
            handle="AI Assistant"
            avatarUrl="https://picsum.photos/seed/scarlett/200/200"
            lastMessage="How can I help you today?"
            timestamp=""
            online
            onClick={() => navigate('/chat/ai/scarlett')}
          />

          <div class="h-px bg-[var(--bg-highlight)] mx-3" />

          {/* Real XMTP conversations */}
          <For each={conversations()}>
            {(chat) => (
              <ChatListItem
                name={chat.name}
                lastMessage={chat.lastMessage}
                timestamp={chat.timestamp}
                unreadCount={chat.hasUnread ? 1 : 0}
                onClick={() => navigate(`/chat/${encodeURIComponent(chat.peerAddress)}`)}
              />
            )}
          </For>

          {/* Placeholder when no real conversations */}
          <For each={hasReal() ? [] : PLACEHOLDER_CHATS}>
            {(chat) => (
              <ChatListItem
                name={chat.name}
                handle={chat.handle}
                avatarUrl={chat.avatar}
                lastMessage={chat.lastMessage}
                timestamp={chat.timestamp}
                unreadCount={chat.unread}
                online={chat.online}
                onClick={() => navigate(`/chat/${encodeURIComponent(chat.handle)}`)}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
