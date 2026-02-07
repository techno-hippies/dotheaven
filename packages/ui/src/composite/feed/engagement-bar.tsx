import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../../lib/utils'
import { Heart, HeartFill, ChatCircle, Repeat, Upload, PencilSimple } from '../../icons'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../primitives/dropdown-menu'

export interface EngagementBarProps {
  /** Number of comments */
  comments?: number
  /** Comment button click handler */
  onComment?: () => void
  /** Number of reposts */
  reposts?: number
  /** Whether the current user has reposted */
  isReposted?: boolean
  /** Repost (instant) click handler */
  onRepost?: () => void
  /** Quote repost click handler — opens compose */
  onQuote?: () => void
  /** Number of likes */
  likes?: number
  /** Whether the current user has liked */
  isLiked?: boolean
  /** Like button click handler */
  onLike?: () => void
  /** Share button click handler */
  onShare?: () => void
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

export const EngagementBar: Component<EngagementBarProps> = (props) => {
  const iconSize = () => props.compact ? 'w-5 h-5' : 'w-[22px] h-[22px]'

  return (
    <div class={cn('flex items-center w-full', props.class)}>
      {/* Left group: comment, repost, like — evenly spaced */}
      <div class="flex items-center gap-10">
        {/* Comment */}
        <button
          type="button"
          class="flex items-center gap-2 cursor-pointer transition-colors text-[var(--text-muted)] hover:text-[var(--accent-blue)]"
          onClick={() => props.onComment?.()}
        >
          <ChatCircle class={iconSize()} />
          <Show when={props.comments !== undefined && props.comments! > 0}>
            <span class="text-base">{formatCount(props.comments!)}</span>
          </Show>
        </button>

        {/* Repost with dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            as="button"
            type="button"
            class={cn(
              'flex items-center gap-2 cursor-pointer transition-colors',
              props.isReposted
                ? 'text-green-500'
                : 'text-[var(--text-muted)] hover:text-green-400'
            )}
          >
            <Repeat class={iconSize()} />
            <Show when={props.reposts !== undefined && props.reposts! > 0}>
              <span class="text-base">{formatCount(props.reposts!)}</span>
            </Show>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-[160px]">
            <DropdownMenuItem onSelect={() => props.onRepost?.()}>
              <Repeat class="w-4 h-4" />
              Repost
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onQuote?.()}>
              <PencilSimple class="w-4 h-4" />
              Quote
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Like */}
        <button
          type="button"
          class={cn(
            'flex items-center gap-2 cursor-pointer transition-colors',
            props.isLiked
              ? 'text-red-500'
              : 'text-[var(--text-muted)] hover:text-red-400'
          )}
          onClick={() => props.onLike?.()}
        >
          <Show when={props.isLiked} fallback={<Heart class={iconSize()} />}>
            <HeartFill class={iconSize()} />
          </Show>
          <Show when={props.likes !== undefined && props.likes! > 0}>
            <span class="text-base">{formatCount(props.likes!)}</span>
          </Show>
        </button>
      </div>

      {/* Spacer */}
      <div class="flex-1" />

      {/* Share — right-aligned */}
      <button
        type="button"
        class="flex items-center cursor-pointer transition-colors text-[var(--text-muted)] hover:text-[var(--accent-blue)]"
        onClick={() => props.onShare?.()}
      >
        <Upload class={iconSize()} />
      </button>
    </div>
  )
}
