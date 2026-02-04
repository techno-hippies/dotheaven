import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../lib/utils'
import { Heart, HeartFill, Chat, ShareNetwork, Info } from '../icons'

export interface EngagementBarProps {
  /** Number of likes */
  likes?: number
  /** Whether the current user has liked */
  isLiked?: boolean
  /** Like button click handler */
  onLike?: () => void
  /** Number of comments */
  comments?: number
  /** Comment button click handler */
  onComment?: () => void
  /** Number of shares */
  shares?: number
  /** Share button click handler */
  onShare?: () => void
  /** Show info button (for provenance/details) */
  showInfo?: boolean
  /** Info button click handler */
  onInfo?: () => void
  /** Custom right slot (replaces info button) */
  rightSlot?: JSX.Element
  /** Additional class for container */
  class?: string
  /** Compact mode - smaller icons, tighter spacing */
  compact?: boolean
}

/**
 * Format count for display (e.g. 1200 -> "1.2K")
 */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toString()
}

/**
 * EngagementBar - Reusable engagement actions (like, comment, share, info)
 *
 * Used in:
 * - FeedPost
 * - Video posts
 * - Comments
 *
 * Layout:
 * ```
 * [Heart] [count]  [Chat] [count]  [Share] [count]  [Info/rightSlot]
 * ```
 */
export const EngagementBar: Component<EngagementBarProps> = (props) => {
  const iconSize = () => props.compact ? 'w-5 h-5' : 'w-6 h-6'
  const textSize = () => 'text-base' // Always use readable text size
  const gap = () => props.compact ? 'gap-4' : 'gap-5'

  return (
    <div class={cn('flex items-center', gap(), props.class)}>
      {/* Like button */}
      <Show when={props.onLike}>
        <button
          type="button"
          class={cn(
            'flex items-center gap-1.5 cursor-pointer transition-colors',
            textSize(),
            props.isLiked
              ? 'text-red-500'
              : 'text-[var(--text-secondary)] hover:text-red-400'
          )}
          onClick={() => props.onLike?.()}
        >
          <Show when={props.isLiked} fallback={<Heart class={iconSize()} />}>
            <HeartFill class={iconSize()} />
          </Show>
          <Show when={props.likes !== undefined}>
            <span>{formatCount(props.likes!)}</span>
          </Show>
        </button>
      </Show>

      {/* Comment button */}
      <Show when={props.onComment}>
        <button
          type="button"
          class={cn(
            'flex items-center gap-1.5 cursor-pointer transition-colors',
            textSize(),
            'text-[var(--text-secondary)] hover:text-[var(--accent-blue)]'
          )}
          onClick={() => props.onComment?.()}
        >
          <Chat class={iconSize()} />
          <Show when={props.comments !== undefined}>
            <span>{formatCount(props.comments!)}</span>
          </Show>
        </button>
      </Show>

      {/* Share button */}
      <Show when={props.onShare}>
        <button
          type="button"
          class={cn(
            'flex items-center gap-1.5 cursor-pointer transition-colors',
            textSize(),
            'text-[var(--text-secondary)] hover:text-[var(--accent-purple)]'
          )}
          onClick={() => props.onShare?.()}
        >
          <ShareNetwork class={iconSize()} />
          <Show when={props.shares !== undefined}>
            <span>{formatCount(props.shares!)}</span>
          </Show>
        </button>
      </Show>

      {/* Spacer to push info/rightSlot to the right */}
      <Show when={props.showInfo || props.rightSlot}>
        <div class="flex-1" />
      </Show>

      {/* Info button or custom right slot */}
      <Show
        when={props.rightSlot}
        fallback={
          <Show when={props.showInfo && props.onInfo}>
            <button
              type="button"
              class="flex items-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
              onClick={() => props.onInfo?.()}
            >
              <Info class={props.compact ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>
          </Show>
        }
      >
        {props.rightSlot}
      </Show>
    </div>
  )
}
