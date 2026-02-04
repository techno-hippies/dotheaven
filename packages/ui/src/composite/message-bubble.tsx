import { type Component, type JSX, splitProps, Show } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'

export interface MessageBubbleProps {
  /** Message text content */
  message: string
  /** Sender's display name */
  username?: string
  /** Avatar image URL */
  avatarUrl?: string
  /** ISO 3166-1 alpha-2 nationality code (e.g. "US"). Shows a flag badge on the avatar. */
  nationalityCode?: string
  /** Timestamp text (e.g., "2:30 PM") */
  timestamp?: string
  /** Whether this message is from the current user */
  isOwn?: boolean
  /** Whether this is the first message in a group (shows avatar/username) */
  isFirstInGroup?: boolean
  /** Additional class for container */
  class?: string
}

/**
 * MessageBubble - Discord-style chat message component
 *
 * Features:
 * - Avatar on left, content stacked to the right
 * - Username + timestamp on first line (when isFirstInGroup)
 * - Message content below
 * - Own messages have accent colored username
 *
 * Note: This component has a specialized layout that differs from UserIdentity.
 * The message text appears below the username/timestamp line, not as a secondary line
 * within the identity block. This is intentional for the Discord-style layout.
 */
export const MessageBubble: Component<MessageBubbleProps> = (props) => {
  const [local, others] = splitProps(props, [
    'class',
    'message',
    'username',
    'avatarUrl',
    'nationalityCode',
    'timestamp',
    'isOwn',
    'isFirstInGroup',
  ])

  const showHeader = () => local.isFirstInGroup !== false

  return (
    <div
      class={cn(
        'flex gap-3 px-4 py-1.5 -mx-4 hover:bg-[rgba(255,255,255,0.03)] transition-colors',
        showHeader() && 'mt-4 first:mt-0',
        local.class
      )}
      {...others}
    >
      <Show
        when={showHeader()}
        fallback={<div class="w-10 flex-shrink-0 ml-4" />}
      >
        <Avatar size="md" src={local.avatarUrl} nationalityCode={local.nationalityCode} class="flex-shrink-0 mt-0.5 ml-4" />
      </Show>
      <div class="flex-1 min-w-0 mr-4">
        <Show when={showHeader()}>
          <div class="flex items-baseline gap-2">
            <Show when={local.username}>
              <span
                class={cn(
                  'text-base font-semibold',
                  local.isOwn ? 'text-[var(--accent-blue)]' : 'text-[var(--text-primary)]'
                )}
              >
                {local.username}
              </span>
            </Show>
            <Show when={local.timestamp}>
              <span class="text-base text-[var(--text-muted)]">{local.timestamp}</span>
            </Show>
          </div>
        </Show>
        <p class="text-base text-[var(--text-primary)] leading-snug whitespace-pre-wrap break-words">
          {local.message}
        </p>
      </div>
    </div>
  )
}

export interface MessageListProps {
  children: JSX.Element
  class?: string
}

/**
 * MessageList - Container for message bubbles with proper spacing
 */
export const MessageList: Component<MessageListProps> = (props) => {
  return (
    <div class={cn('flex flex-col py-4', props.class)}>
      {props.children}
    </div>
  )
}
