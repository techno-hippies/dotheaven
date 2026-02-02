import type { Component } from 'solid-js'
import { cn, AlbumCover, Scrubber, IconButton } from '@heaven/ui'

export interface MusicPlayerProps {
  class?: string
  title?: string
  artist?: string
  coverSrc?: string
  currentTime?: string
  duration?: string
  progress?: number
  volume?: number
  isPlaying?: boolean
  onPlayPause?: () => void
  onPrev?: () => void
  onNext?: () => void
  onShuffle?: () => void
  onRepeat?: () => void
  onProgressChange?: (value: number) => void
  onVolumeChange?: (value: number) => void
}

const PlayButton: Component<{ isPlaying?: boolean; onClick?: () => void }> = (props) => (
  <IconButton variant="play" size="md" aria-label={props.isPlaying ? 'Pause' : 'Play'} onClick={props.onClick}>
    {props.isPlaying ? (
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
        <path d="M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z" />
      </svg>
    ) : (
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
        <path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z" />
      </svg>
    )}
  </IconButton>
)

/**
 * Music player footer bar - matches Spotify-like bottom player.
 */
export const MusicPlayer: Component<MusicPlayerProps> = (props) => {
  return (
    <div class={cn('h-20 bg-[var(--bg-page)] flex items-center px-4 gap-6', props.class)}>
      {/* Left: Now playing info */}
      <div class="flex items-center gap-3 w-56">
        <AlbumCover size="md" src={props.coverSrc} />
        <div class="flex flex-col min-w-0">
          <span class="text-base font-medium text-[var(--text-primary)] truncate">
            {props.title || 'Now Playing'}
          </span>
          <span class="text-base text-[var(--text-secondary)] truncate">
            {props.artist || 'Artist Name'}
          </span>
        </div>
      </div>

      {/* Center: Controls + progress */}
      <div class="flex-1 flex flex-col items-center justify-center gap-1 max-w-md mx-auto">
        {/* Controls */}
        <div class="flex items-center gap-4">
          <IconButton variant="ghost" size="md" aria-label="Shuffle" onClick={props.onShuffle}>
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
              <path d="M237.66,178.34a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32-11.32L212.69,192H200.94a72.12,72.12,0,0,1-58.59-30.15l-41.72-58.4A56.1,56.1,0,0,0,55.06,80H32a8,8,0,0,1,0-16H55.06a72.12,72.12,0,0,1,58.59,30.15l41.72,58.4A56.1,56.1,0,0,0,200.94,176h11.75l-10.35-10.34a8,8,0,0,1,11.32-11.32ZM143,107a8,8,0,0,0,11.16-1.86l1.2-1.67A56.1,56.1,0,0,1,200.94,80h11.75L202.34,90.34a8,8,0,0,0,11.32,11.32l24-24a8,8,0,0,0,0-11.32l-24-24a8,8,0,0,0-11.32,11.32L212.69,64H200.94a72.12,72.12,0,0,0-58.59,30.15l-1.2,1.67A8,8,0,0,0,143,107Zm-30,42a8,8,0,0,0-11.16,1.86l-1.2,1.67A56.1,56.1,0,0,1,55.06,176H32a8,8,0,0,0,0,16H55.06a72.12,72.12,0,0,0,58.59-30.15l1.2-1.67A8,8,0,0,0,113,149Z" />
            </svg>
          </IconButton>
          <IconButton variant="ghost" size="md" aria-label="Previous" onClick={props.onPrev}>
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
              <path d="M208,47.88V208.12a16,16,0,0,1-24.43,13.43L64,146.77V216a8,8,0,0,1-16,0V40a8,8,0,0,1,16,0v69.23L183.57,34.45A15.95,15.95,0,0,1,208,47.88Z" />
            </svg>
          </IconButton>
          <PlayButton isPlaying={props.isPlaying} onClick={props.onPlayPause} />
          <IconButton variant="ghost" size="md" aria-label="Next" onClick={props.onNext}>
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
              <path d="M72.43,34.45A15.95,15.95,0,0,1,48,47.88V208.12a16,16,0,0,0,24.43,13.43L192,146.77V216a8,8,0,0,0,16,0V40a8,8,0,0,0-16,0v69.23Z" />
            </svg>
          </IconButton>
          <IconButton variant="ghost" size="md" aria-label="Repeat" onClick={props.onRepeat}>
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
              <path d="M24,128A72.08,72.08,0,0,1,96,56h96V40a8,8,0,0,1,13.66-5.66l24,24a8,8,0,0,1,0,11.32l-24,24A8,8,0,0,1,192,88V72H96a56.06,56.06,0,0,0-56,56,8,8,0,0,1-16,0Zm200-8a8,8,0,0,0-8,8,56.06,56.06,0,0,1-56,56H64V168a8,8,0,0,0-13.66-5.66l-24,24a8,8,0,0,0,0,11.32l24,24A8,8,0,0,0,64,216V200h96a72.08,72.08,0,0,0,72-72A8,8,0,0,0,224,120Z" />
            </svg>
          </IconButton>
        </div>

        {/* Progress bar */}
        <div class="flex items-center gap-2 w-full">
          <span class="text-base text-[var(--text-muted)] w-10 text-right">
            {props.currentTime || '0:00'}
          </span>
          <Scrubber
            class="flex-1"
            value={props.progress}
            onChange={props.onProgressChange}
          />
          <span class="text-base text-[var(--text-muted)] w-10">
            {props.duration || '0:00'}
          </span>
        </div>
      </div>

      {/* Right: Volume */}
      <div class="flex items-center gap-3 w-40 justify-end">
        <svg class="w-5 h-5 text-[var(--text-secondary)]" fill="currentColor" viewBox="0 0 256 256">
          <path d="M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM32,96H72v64H32ZM144,207.64,88,164.09V91.91l56-43.55Zm54-106.08a40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.58,24,24,0,0,0,0-31.72,8,8,0,0,1,12-10.58ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z" />
        </svg>
        <Scrubber
          class="w-20"
          value={props.volume ?? 75}
          onChange={props.onVolumeChange}
        />
      </div>
    </div>
  )
}
