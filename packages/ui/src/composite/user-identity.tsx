import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'

export type UserIdentitySize = 'sm' | 'md' | 'lg'

export interface UserIdentityProps {
  /** Primary display name (heaven name, ENS, or wallet address) */
  name: string
  /** Secondary text (e.g. truncated address, "@handle") */
  handle?: string
  /** Avatar image URL */
  avatarUrl?: string
  /** Timestamp or additional text (e.g. "2m ago", "Yesterday", "Now playing") */
  timestamp?: string
  /** Size variant - affects avatar size and text scale */
  size?: UserIdentitySize
  /** Whether to show online indicator on avatar */
  online?: boolean
  /** Click handler for the entire identity block */
  onClick?: () => void
  /** Click handler specifically for the avatar */
  onAvatarClick?: () => void
  /** Whether name should be bold (default: true) */
  nameBold?: boolean
  /** Custom name color class (overrides default) */
  nameClass?: string
  /** Custom handle color class (overrides default) */
  handleClass?: string
  /** Custom timestamp color class (overrides default) */
  timestampClass?: string
  /** Whether to show separator dot between name and timestamp */
  showDot?: boolean
  /** ISO 3166-1 alpha-2 nationality code (e.g. "US"). Shows a flag badge on the avatar. */
  nationalityCode?: string
  /** Additional class for container */
  class?: string
  /** Right-aligned slot (e.g. menu, badge) */
  rightSlot?: JSX.Element
  /** Secondary line content (e.g. last message preview) */
  secondaryLine?: JSX.Element
}

const avatarSizes: Record<UserIdentitySize, 'sm' | 'md' | 'lg'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
}

/**
 * UserIdentity - Reusable component for displaying user avatar, name, handle, and timestamp.
 *
 * Used in:
 * - FeedPost (author header)
 * - ChatListItem (conversation preview)
 * - MessageBubble (message sender)
 * - CommentItem (comment author)
 * - Profile headers
 *
 * Layout:
 * ```
 * [Avatar] [Name] [Handle] · [Timestamp]  [rightSlot]
 *          [secondaryLine]
 * ```
 */
export const UserIdentity: Component<UserIdentityProps> = (props) => {
  const size = () => props.size ?? 'md'
  const nameBold = () => props.nameBold !== false

  const textSizeClass = () => {
    switch (size()) {
      case 'sm':
        return 'text-base'
      case 'lg':
        return 'text-lg'
      default:
        return 'text-base'
    }
  }

  const handleTextSize = () => {
    // Secondary text uses same size as primary, just different color/weight
    return textSizeClass()
  }

  const AvatarWrapper = () => (
    <div class="relative flex-shrink-0">
      <Avatar
        src={props.avatarUrl}
        size={avatarSizes[size()]}
        shape="circle"
        nationalityCode={props.nationalityCode}
      />
      <Show when={props.online}>
        <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-[var(--bg-surface)]" />
      </Show>
    </div>
  )

  return (
    <div
      class={cn(
        'flex items-center gap-3',
        props.onClick && 'cursor-pointer',
        props.class
      )}
      onClick={() => props.onClick?.()}
    >
      {/* Avatar - clickable separately if onAvatarClick provided */}
      <Show
        when={props.onAvatarClick}
        fallback={<AvatarWrapper />}
      >
        <button
          type="button"
          class="cursor-pointer flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            props.onAvatarClick?.()
          }}
        >
          <AvatarWrapper />
        </button>
      </Show>

      {/* Text content */}
      <div class="flex-1 min-w-0">
        {/* Primary line: name + handle + timestamp */}
        <div class="flex items-center gap-1.5">
          <span
            class={cn(
              textSizeClass(),
              'truncate',
              nameBold() ? 'font-semibold' : 'font-medium',
              props.nameClass ?? 'text-[var(--text-primary)]'
            )}
          >
            {props.name}
          </span>
          <Show when={props.handle}>
            <span
              class={cn(
                handleTextSize(),
                'truncate',
                props.handleClass ?? 'text-[var(--text-muted)]'
              )}
            >
              {props.handle}
            </span>
          </Show>
          <Show when={props.showDot && props.timestamp}>
            <span class={cn(textSizeClass(), 'text-[var(--text-muted)]')}>·</span>
          </Show>
          <Show when={props.timestamp}>
            <span
              class={cn(
                handleTextSize(),
                'flex-shrink-0',
                props.timestampClass ?? 'text-[var(--text-muted)]'
              )}
            >
              {props.timestamp}
            </span>
          </Show>
        </div>

        {/* Secondary line */}
        <Show when={props.secondaryLine}>
          <div class="mt-0.5">
            {props.secondaryLine}
          </div>
        </Show>
      </div>

      {/* Right slot */}
      <Show when={props.rightSlot}>
        <div class="flex-shrink-0">
          {props.rightSlot}
        </div>
      </Show>
    </div>
  )
}
