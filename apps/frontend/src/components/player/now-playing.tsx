import type { Component, JSX } from 'solid-js'
import { splitProps, Show } from 'solid-js'
import { cn, AlbumCover, Button, IconButton } from '@heaven/ui'

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
      <div class="w-full aspect-square rounded-md overflow-hidden bg-[var(--bg-elevated)]">
        <Show
          when={local.albumArtSrc}
          fallback={
            <AlbumCover
              size="xl"
              class="w-full h-full rounded-md"
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
  <svg class={props.class} fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z" />
  </svg>
)

const ShareIcon: Component = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z" />
  </svg>
)
