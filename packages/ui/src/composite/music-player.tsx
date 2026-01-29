import type { Component } from 'solid-js'
import { cn } from '../lib/utils'
import { AlbumCover } from './album-cover'
import { Scrubber } from './scrubber'
import { IconButton } from '../primitives/icon-button'
import { PlayButton } from '../primitives/play-button'

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
  onProgressChangeStart?: () => void
  onProgressChangeEnd?: () => void
  onVolumeChange?: (value: number) => void
  /** Hide now playing info and volume for centered minimal layout */
  minimal?: boolean
}

/**
 * Music player footer bar - matches Spotify-like bottom player.
 */
export const MusicPlayer: Component<MusicPlayerProps> = (props) => {
  return (
    <div class={cn(
      'h-20 bg-[var(--bg-page)] flex items-center px-4 gap-6',
      props.minimal && 'justify-center',
      props.class
    )}>
      {/* Left: Now playing info */}
      {!props.minimal && (
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
      )}

      {/* Center: Controls + progress */}
      <div class={cn(
        'flex flex-col items-center justify-center gap-1',
        props.minimal ? 'w-full max-w-2xl' : 'flex-1 max-w-md mx-auto'
      )}>
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
          <PlayButton variant="white" size="md" isPlaying={props.isPlaying} onClick={props.onPlayPause} />
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
            onChangeStart={props.onProgressChangeStart}
            onChangeEnd={props.onProgressChangeEnd}
          />
          <span class="text-base text-[var(--text-muted)] w-10">
            {props.duration || '0:00'}
          </span>
        </div>
      </div>

      {/* Right: Volume */}
      {!props.minimal && (
        <div class="flex items-center gap-3 w-40 justify-end">
          <svg class="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <Scrubber
            class="w-20"
            value={props.volume ?? 75}
            onChange={props.onVolumeChange}
          />
        </div>
      )}
    </div>
  )
}
