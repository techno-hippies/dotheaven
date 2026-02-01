import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'

export interface ChatListItemProps {
  class?: string
  /** Primary display name (heaven name, ENS, or full address if no name) */
  name: string
  /** Secondary text shown after name in muted color (e.g. truncated 0x address) */
  handle?: string
  avatarUrl?: string
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

  return (
    <button
      type="button"
      class={cn(
        'flex items-center gap-3 w-full px-4 py-3 text-left cursor-pointer transition-colors',
        props.active
          ? 'bg-[var(--bg-highlight)]'
          : 'hover:bg-[var(--bg-highlight-hover)]',
        props.class,
      )}
      onClick={() => props.onClick?.()}
    >
      {/* Avatar with online indicator */}
      <div class="relative flex-shrink-0">
        <Avatar src={props.avatarUrl} size="lg" shape="circle" />
        <Show when={props.online}>
          <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-[var(--bg-surface)]" />
        </Show>
      </div>

      {/* Text content — always 2 rows: (name [handle]) + (lastMessage) */}
      <div class="flex-1 min-w-0">
        {/* Row 1: name + handle inline, timestamp right */}
        <div class="flex items-center justify-between gap-2">
          <span class={cn(
            'truncate',
            hasUnread() ? 'font-bold text-[var(--text-primary)]' : 'font-medium text-[var(--text-primary)]',
          )}>
            <span class="text-base">{props.name}</span>
            <Show when={props.handle}>
              <span class="text-sm text-[var(--text-muted)] font-normal"> {props.handle}</span>
            </Show>
          </span>
          <Show when={props.timestamp}>
            <span class={cn(
              'text-xs flex-shrink-0',
              hasUnread() ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]',
            )}>
              {props.timestamp}
            </span>
          </Show>
        </div>
        {/* Row 2: last message + unread badge */}
        <div class="flex items-center justify-between gap-2 mt-0.5">
          <Show when={props.lastMessage}>
            <span class={cn(
              'text-sm truncate',
              hasUnread() ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
            )}>
              {props.lastMessage}
            </span>
          </Show>
          <Show when={hasUnread()}>
            <span class="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent-blue)] text-white text-xs font-bold flex items-center justify-center">
              {props.unreadCount! > 99 ? '99+' : props.unreadCount}
            </span>
          </Show>
        </div>
      </div>
    </button>
  )
}
