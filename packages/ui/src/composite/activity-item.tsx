import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../lib/utils'

export interface ActivityItemProps {
  class?: string
  /** Left slot - icon or image element */
  icon: JSX.Element
  /** Main title text */
  title: string
  /** Optional subtitle/description */
  subtitle?: string
  /** Timestamp text (e.g., "8h ago", "1d ago") */
  timestamp: string
  /** Click handler */
  onClick?: () => void
}

/**
 * ActivityItem - Feed item for user activity
 *
 * Used for passive activity items like:
 * - Sleep tracking
 * - Exercise/runs
 * - Scrobbles
 * - Playlists created
 * - Artists discovered
 *
 * Features:
 * - Left icon/image slot (flexible - can be circular or square)
 * - Title + optional subtitle
 * - Timestamp on right
 * - Hover state
 * - Optional click handler
 */
export const ActivityItem: Component<ActivityItemProps> = (props) => {
  const content = (
    <>
      {/* Icon/Image slot */}
      <div class="flex-shrink-0">
        {props.icon}
      </div>

      {/* Text content */}
      <div class="flex-1 min-w-0">
        <div class="text-lg font-semibold text-[var(--text-primary)] truncate">
          {props.title}
        </div>
        <Show when={props.subtitle}>
          <div class="text-base text-[var(--text-secondary)] truncate">
            {props.subtitle}
          </div>
        </Show>
      </div>

      {/* Timestamp */}
      <div class="text-base text-[var(--text-muted)] flex-shrink-0">
        {props.timestamp}
      </div>

      {/* Chevron for clickable items */}
      <Show when={props.onClick}>
        <svg class="w-5 h-5 text-[var(--text-muted)] flex-shrink-0" fill="currentColor" viewBox="0 0 256 256">
          <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
        </svg>
      </Show>
    </>
  )

  return props.onClick ? (
    <button
      type="button"
      class={cn(
        'flex items-center gap-4 w-full p-4 rounded-md text-left',
        'cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors',
        props.class
      )}
      onClick={props.onClick}
    >
      {content}
    </button>
  ) : (
    <div
      class={cn(
        'flex items-center gap-4 w-full p-4 rounded-md',
        props.class
      )}
    >
      {content}
    </div>
  )
}
