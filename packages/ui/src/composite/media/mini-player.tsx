import { type Component, Show } from 'solid-js'
import { cn } from '../../lib/utils'
import { AlbumCover } from './album-cover'
import { IconButton } from '../../primitives/icon-button'

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

// Phosphor icons (fill weight, 256x256 viewBox)
const PlayFillIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z" />
  </svg>
)

const PauseFillIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z" />
  </svg>
)

const SkipForwardFillIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,40V216a8,8,0,0,1-16,0V146.77L72.43,221.55A15.95,15.95,0,0,1,48,208.12V47.88A15.95,15.95,0,0,1,72.43,34.45L192,109.23V40a8,8,0,0,1,16,0Z" />
  </svg>
)

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
              {props.isPlaying ? <PauseFillIcon /> : <PlayFillIcon />}
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
              <SkipForwardFillIcon />
            </IconButton>
          </div>
        </Show>
      </div>
    </div>
  )
}
