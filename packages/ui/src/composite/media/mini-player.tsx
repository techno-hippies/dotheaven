import { type Component, Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { AlbumCover } from './album-cover'
import { IconButton } from '../../primitives/icon-button'
import { PlayFill, PauseFill, SkipForwardFill } from '../../icons'

export interface MiniPlayerProps {
  class?: string
  /** Track title */
  title?: string
  /** Artist name */
  artist?: string
  /** Album cover image URL */
  coverSrc?: string
  /** Progress as percentage (0-100) */
  progress?: number
  /** Whether track is currently playing */
  isPlaying?: boolean
  /** Play/pause toggle */
  onPlayPause?: () => void
  /** Tap on player to expand */
  onExpand?: () => void
  /** Skip to next track */
  onNext?: () => void
}

/**
 * Compact mini player bar for mobile.
 * Shows album art, title, artist, play/pause, and progress.
 * Tap to expand to full player view.
 * Height: 64px, sits above mobile footer nav.
 */
export const MiniPlayer: Component<MiniPlayerProps> = (props) => {
  const hasTrack = () => !!props.title

  return (
    <div
      class={cn(
        'h-16 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] relative',
        props.class
      )}
    >
      {/* Progress bar at top */}
      <div class="absolute top-0 left-0 right-0 h-0.5 bg-[var(--bg-highlight)]">
        <div
          class="h-full bg-[var(--accent-blue)] transition-all duration-150"
          style={{ width: `${props.progress ?? 0}%` }}
        />
      </div>

      <div class="h-full flex items-center px-3 gap-3">
        {/* Tappable area: cover + info */}
        <button
          type="button"
          class="flex items-center gap-3 flex-1 min-w-0 h-full"
          onClick={props.onExpand}
        >
          <AlbumCover size="sm" src={props.coverSrc} class="flex-shrink-0" />
          <div class="flex flex-col min-w-0 text-left">
            <span class="text-base font-medium text-[var(--text-primary)] truncate">
              {props.title || 'Not Playing'}
            </span>
            <Show when={props.artist}>
              <span class="text-base text-[var(--text-secondary)] truncate">
                {props.artist}
              </span>
            </Show>
          </div>
        </button>

        {/* Controls */}
        <Show when={hasTrack()}>
          <div class="flex items-center gap-0.5">
            <IconButton
              variant="soft"
              size="lg"
              aria-label={props.isPlaying ? 'Pause' : 'Play'}
              onClick={(e) => {
                e.stopPropagation()
                props.onPlayPause?.()
              }}
            >
              {props.isPlaying ? <PauseFill class="w-5 h-5" /> : <PlayFill class="w-5 h-5" />}
            </IconButton>
            <IconButton
              variant="soft"
              size="lg"
              aria-label="Next"
              onClick={(e) => {
                e.stopPropagation()
                props.onNext?.()
              }}
            >
              <SkipForwardFill class="w-5 h-5" />
            </IconButton>
          </div>
        </Show>
      </div>
    </div>
  )
}
