import type { Component, JSX } from 'solid-js'
import { splitProps, Show } from 'solid-js'
import { cn } from '@/lib/utils'
import { AlbumCover } from './album-cover'
import { Button } from './button'
import { IconButton } from './icon-button'

export interface NowPlayingProps {
  class?: string
  // Track info
  title: string
  artist: string
  albumArtSrc?: string
  // Unlock/purchase state
  isLocked?: boolean
  unlockPrice?: string
  onUnlock?: () => void
  // Custom action (if not using default unlock button)
  action?: JSX.Element
  // Share action
  onShare?: () => void
}

/**
 * NowPlaying - "Now Playing" card showing current track with album art.
 * Supports locked content with unlock button (monetization).
 */
export const NowPlaying: Component<NowPlayingProps> = (props) => {
  const [local] = splitProps(props, [
    'class',
    'title',
    'artist',
    'albumArtSrc',
    'isLocked',
    'unlockPrice',
    'onUnlock',
    'action',
    'onShare',
  ])

  return (
    <div class={cn('flex flex-col gap-4', local.class)}>
      {/* Section Header with Share Button */}
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-[var(--text-primary)]">Now Playing</span>
        <Show when={local.onShare}>
          <IconButton
            variant="ghost"
            size="md"
            aria-label="Share track"
            onClick={local.onShare}
          >
            <ShareIcon />
          </IconButton>
        </Show>
      </div>

      {/* Album Art - large, centered */}
      <div class="w-full aspect-square rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
        <Show
          when={local.albumArtSrc}
          fallback={
            <AlbumCover
              size="xl"
              class="w-full h-full rounded-lg"
              icon="music"
            />
          }
        >
          <img
            src={local.albumArtSrc}
            alt={`${local.title} by ${local.artist}`}
            class="w-full h-full object-cover"
          />
        </Show>
      </div>

      {/* Track Info */}
      <div class="flex flex-col gap-1">
        <h3 class="text-lg font-semibold text-[var(--text-primary)] truncate">
          {local.title}
        </h3>
        <p class="text-sm text-[var(--text-secondary)] truncate">
          {local.artist}
        </p>
      </div>

      {/* Action Button */}
      <Show when={local.action}>
        {local.action}
      </Show>

      <Show when={!local.action && local.isLocked}>
        <Button onClick={local.onUnlock} class="w-full">
          <LockIcon class="w-4 h-4 mr-2" />
          Unlock for {local.unlockPrice || '$1'}
        </Button>
      </Show>
    </div>
  )
}

const LockIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const ShareIcon: Component = () => (
  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16,6 12,2 8,6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
)
