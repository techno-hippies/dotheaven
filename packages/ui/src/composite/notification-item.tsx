import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'

export type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'scrobble' | 'playlist'

export interface NotificationItemProps {
  class?: string
  /** Avatar URL of the actor */
  avatarUrl?: string
  /** Name of the actor (e.g. "Yuki") */
  actorName: string
  /** Action description (e.g. "liked your post") */
  action: string
  /** Optional preview/context text */
  preview?: string
  /** Timestamp (e.g. "2h ago") */
  timestamp: string
  /** Notification type — determines the icon badge */
  type: NotificationType
  /** Whether this notification is unread */
  unread?: boolean
  onClick?: () => void
}

const typeIcons: Record<NotificationType, () => JSX.Element> = {
  like: () => (
    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
      <path d="M240,94c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,220.66,16,164,16,94A62.07,62.07,0,0,1,78,32c20.65,0,38.73,8.88,50,23.89C139.27,40.88,157.35,32,178,32A62.07,62.07,0,0,1,240,94Z" />
    </svg>
  ),
  comment: () => (
    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
      <path d="M232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Z" />
    </svg>
  ),
  follow: () => (
    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
      <path d="M256,136a8,8,0,0,1-8,8H232v16a8,8,0,0,1-16,0V144H200a8,8,0,0,1,0-16h16V112a8,8,0,0,1,16,0v16h16A8,8,0,0,1,256,136Zm-57.87,58.85a8,8,0,0,1-12.26,10.3C165.75,181.19,138.09,168,108,168s-57.75,13.19-77.87,37.15a8,8,0,0,1-12.26-10.3c14.94-17.78,33.52-30.41,54.17-37.17a68,68,0,1,1,71.92,0C164.61,164.44,183.19,177.07,198.13,194.85ZM108,152a52,52,0,1,0-52-52A52.06,52.06,0,0,0,108,152Z" />
    </svg>
  ),
  mention: () => (
    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
      <path d="M128,24a104,104,0,0,0,0,208c21.51,0,44.1-6.48,60.43-17.33a8,8,0,0,0-8.86-13.34C166,210.12,146.21,216,128,216a88,88,0,1,1,88-88c0,26.45-10.88,32-20,32s-20-5.55-20-32V88a8,8,0,0,0-16,0v4.26a48,48,0,1,0,5.93,65.1c6,12,16.35,18.64,30.07,18.64,22.54,0,36-17.94,36-48A104.11,104.11,0,0,0,128,24Zm0,136a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z" />
    </svg>
  ),
  scrobble: () => (
    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
      <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.77l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69Z" />
    </svg>
  ),
  playlist: () => (
    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
      <path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm8,72H160a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16Zm72,48H40a8,8,0,0,0,0,16h72a8,8,0,0,0,0-16Zm135.66-57.7a8,8,0,0,0-10-5.26l-58.66,18V96a8,8,0,0,0-16,0v56a36,36,0,1,0,16,29.92V112l50.66-15.44A8,8,0,0,0,247.66,126.34Z" />
    </svg>
  ),
}

const typeBgColors: Record<NotificationType, string> = {
  like: 'bg-red-500/80',
  comment: 'bg-[var(--accent-blue)]',
  follow: 'bg-[var(--accent-purple)]',
  mention: 'bg-[var(--accent-blue)]',
  scrobble: 'bg-green-500/80',
  playlist: 'bg-[var(--accent-coral)]',
}

export const NotificationItem: Component<NotificationItemProps> = (props) => {
  return (
    <button
      type="button"
      class={cn(
        'flex items-center gap-3 w-full px-4 py-3 text-left transition-colors',
        props.unread
          ? 'bg-[var(--bg-highlight)]/40'
          : 'hover:bg-[var(--bg-highlight-hover)]',
        props.onClick && 'cursor-pointer',
        props.class,
      )}
      onClick={() => props.onClick?.()}
    >
      {/* Avatar with type badge */}
      <div class="relative flex-shrink-0">
        <Avatar src={props.avatarUrl} size="lg" shape="circle" />
        <div class={cn(
          'absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white border-2 border-[var(--bg-page)]',
          typeBgColors[props.type],
        )}>
          {typeIcons[props.type]()}
        </div>
      </div>

      {/* Text content */}
      <div class="flex-1 min-w-0">
        <div class="text-sm">
          <span class={cn(
            'font-semibold',
            props.unread ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]',
          )}>
            {props.actorName}
          </span>
          <span class="text-[var(--text-secondary)]"> {props.action}</span>
        </div>
        <Show when={props.preview}>
          <div class="text-sm text-[var(--text-muted)] truncate mt-0.5">
            {props.preview}
          </div>
        </Show>
      </div>

      {/* Timestamp + unread dot */}
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class={cn(
          'text-xs',
          props.unread ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]',
        )}>
          {props.timestamp}
        </span>
        <Show when={props.unread}>
          <div class="w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
        </Show>
      </div>
    </button>
  )
}
