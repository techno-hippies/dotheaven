import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../lib/utils'
import { UserIdentity } from './user-identity'

export interface ChatListItemProps {
  class?: string
  /** Primary display name (heaven name, ENS, or full address if no name) */
  name: string
  /** Secondary text shown after name in muted color (e.g. truncated 0x address) */
  handle?: string
  avatarUrl?: string
  /** ISO 3166-1 alpha-2 nationality code (e.g. "US"). Shows a flag badge on the avatar. */
  nationalityCode?: string
  /** Last message preview text */
  lastMessage?: string
  /** Timestamp of last message (e.g. "2m ago", "Yesterday") */
  timestamp?: string
  /** Number of unread messages (0 = no badge) */
  unreadCount?: number
  /** Whether this chat is currently active/selected */
  active?: boolean
  /** Online status indicator */
  online?: boolean
  onClick?: () => void
}

export const ChatListItem: Component<ChatListItemProps> = (props) => {
  const hasUnread = () => (props.unreadCount ?? 0) > 0

  // Unread badge element
  const unreadBadge = () => (
    <Show when={hasUnread()}>
      <span class="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent-blue)] text-white text-xs font-bold flex items-center justify-center">
        {props.unreadCount! > 99 ? '99+' : props.unreadCount}
      </span>
    </Show>
  )

  // Last message preview as secondary line
  const lastMessageLine = () => (
    <Show when={props.lastMessage}>
      <div class="flex items-center justify-between gap-2">
        <span class={cn(
          'text-base truncate',
          hasUnread() ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
        )}>
          {props.lastMessage}
        </span>
        {unreadBadge()}
      </div>
    </Show>
  )

  return (
    <button
      type="button"
      class={cn(
        'flex items-center w-full px-4 py-3 text-left cursor-pointer transition-colors',
        props.active
          ? 'bg-[var(--bg-highlight)]'
          : 'hover:bg-[var(--bg-highlight-hover)]',
        props.class,
      )}
      onClick={() => props.onClick?.()}
    >
      <UserIdentity
        name={props.name}
        handle={props.handle}
        avatarUrl={props.avatarUrl}
        nationalityCode={props.nationalityCode}
        timestamp={props.timestamp}
        online={props.online}
        size="lg"
        nameBold={hasUnread()}
        timestampClass={hasUnread() ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]'}
        secondaryLine={lastMessageLine()}
        class="w-full"
      />
    </button>
  )
}
