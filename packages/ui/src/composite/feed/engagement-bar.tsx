import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Heart, HeartFill, ChatCircle, Repeat, Upload, PencilSimple, Globe, LinkSimple, PaperPlaneTilt } from '../../icons'
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
  /** Copy link click handler */
  onCopyLink?: () => void
  /** Send via chat click handler */
  onSendViaChat?: () => void
  /** Additional class for container */
  class?: string
  /** Compact mode - smaller icons, tighter spacing */
  compact?: boolean
  /** Whether a translation exists for this post */
  hasTranslation?: boolean
  /** Called when user clicks "Translate" — should trigger Lit Action */
  onTranslate?: () => void
  /** Whether a translation is currently in progress */
  isTranslating?: boolean
  /** Whether translation is needed (post language differs from user language) */
  needsTranslation?: boolean
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
  const iconSize = () => props.compact ? 'w-4.5 h-4.5' : 'w-5 h-5'
  const iconBtn = 'rounded-full px-2 py-1.5 cursor-pointer transition-colors'

  return (
    <div class={cn('flex items-center justify-between w-full -ml-2', props.class)}>
      {/* Comment */}
      <div class="flex items-center gap-1.5 text-[var(--text-muted)]">
        <button
          type="button"
          class={cn(iconBtn, 'hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10')}
          onClick={() => props.onComment?.()}
        >
          <ChatCircle class={iconSize()} />
        </button>
        <span class="text-base">{formatCount(props.comments ?? 0)}</span>
      </div>

      {/* Repost with dropdown */}
      <div class={cn('flex items-center gap-1.5', props.isReposted ? 'text-green-500' : 'text-[var(--text-muted)]')}>
        <DropdownMenu>
          <DropdownMenuTrigger
            as="button"
            type="button"
            class={cn(iconBtn, !props.isReposted && 'hover:text-green-400 hover:bg-green-500/10')}
          >
            <Repeat class={iconSize()} />
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
        <span class="text-base">{formatCount(props.reposts ?? 0)}</span>
      </div>

      {/* Like */}
      <div class={cn('flex items-center gap-1.5', props.isLiked ? 'text-red-500' : 'text-[var(--text-muted)]')}>
        <button
          type="button"
          class={cn(iconBtn, !props.isLiked && 'hover:text-red-400 hover:bg-red-500/10')}
          onClick={() => props.onLike?.()}
        >
          <Show when={props.isLiked} fallback={<Heart class={iconSize()} />}>
            <HeartFill class={iconSize()} />
          </Show>
        </button>
        <span class="text-base">{formatCount(props.likes ?? 0)}</span>
      </div>

      {/* Translate */}
      <Show when={!props.hasTranslation && props.needsTranslation !== false && props.onTranslate}>
        <button
          type="button"
          class={cn(
            iconBtn,
            props.isTranslating
              ? 'text-[var(--accent-blue)] opacity-70'
              : 'text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10'
          )}
          data-no-post-click
          disabled={props.isTranslating}
          onClick={() => props.onTranslate?.()}
        >
          <Globe class={cn(iconSize(), props.isTranslating && 'animate-spin')} />
        </button>
      </Show>

      {/* Share with dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          as="button"
          type="button"
          class={cn(iconBtn, 'text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10')}
        >
          <Upload class={iconSize()} />
        </DropdownMenuTrigger>
        <DropdownMenuContent class="min-w-[160px]">
          <DropdownMenuItem onSelect={() => props.onCopyLink?.()}>
            <LinkSimple class="w-4 h-4" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => props.onSendViaChat?.()}>
            <PaperPlaneTilt class="w-4 h-4" />
            Send via chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
