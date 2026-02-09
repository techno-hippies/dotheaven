import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { AlbumCover } from './album-cover'
import { Scrubber } from './scrubber'
import { IconButton } from '../../primitives/icon-button'
import { PlayButton } from '../../primitives/play-button'
import { DotsThree, MagnifyingGlass } from '../../icons'
import { TextField } from '../../primitives/text-field'
import type { TrackMenuActions } from './track-list'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../primitives/dropdown-menu'

export interface SidePlayerProps {
  class?: string
  // Track info
  title?: string
  artist?: string
  coverSrc?: string
  // Playback state
  currentTime?: string
  duration?: string
  progress?: number
  isPlaying?: boolean
  // Callbacks
  onPlayPause?: () => void
  onPrev?: () => void
  onNext?: () => void
  onShuffle?: () => void
  onRepeat?: () => void
  onProgressChange?: (value: number) => void
  onProgressChangeStart?: () => void
  onProgressChangeEnd?: () => void
  // Menu actions (shown in 3-dot dropdown above album art)
  menuActions?: TrackMenuActions
  /** The current track object, needed to pass to menu action callbacks */
  track?: { id: string; title: string; artist: string; album: string; albumCover?: string; duration?: string }
  /** Direct callback for clicking the artist name */
  onArtistClick?: () => void
  /** Search query value (controlled) */
  searchQuery?: string
  /** Callback when search query changes */
  onSearchChange?: (query: string) => void
  /** Callback when search is submitted (Enter key) */
  onSearchSubmit?: (query: string) => void
  /** Placeholder text for search field */
  searchPlaceholder?: string
  /** Fallback text when no track is playing */
  noTrackText?: string
  /** Fallback text when artist is unknown */
  unknownArtistText?: string
}

/**
 * SidePlayer - Vertical music player for the right panel.
 *
 * Features:
 * - Large album art at the top
 * - Track info (title, artist)
 * - Progress scrubber with timestamps
 * - Playback controls (shuffle, prev, play, next, repeat)
 * - Volume control
 *
 * Designed to replace the full-width bottom footer player.
 */
export const SidePlayer: Component<SidePlayerProps> = (props) => {
  return (
    <div class={cn('flex flex-col h-full', props.class)}>
      {/* Search bar */}
      <Show when={props.onSearchChange}>
        <div class="px-4 pt-4 pb-2">
          <TextField
            value={props.searchQuery ?? ''}
            onChange={(v) => props.onSearchChange?.(v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onSearchSubmit?.(props.searchQuery ?? '')
            }}
            placeholder={props.searchPlaceholder ?? "Search songs, people, rooms..."}
            icon={<MagnifyingGlass class="w-4 h-4" />}
          />
        </div>
      </Show>

      {/* Album Art */}
      <div class="px-4 pt-2">
        <div class="w-full aspect-square rounded-md overflow-hidden bg-[var(--bg-elevated)]">
          <Show
            when={props.coverSrc}
            fallback={
              <AlbumCover
                size="xl"
                class="w-full h-full rounded-md"
                icon="music"
              />
            }
          >
            <img
              src={props.coverSrc}
              alt={`${props.title || 'Album'} cover`}
              class="w-full h-full object-cover"
            />
          </Show>
        </div>
      </div>

      {/* Track Info */}
      <div class="px-4 pt-4 pb-2">
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-semibold text-[var(--text-primary)] truncate flex-1 min-w-0">
            {props.title || props.noTrackText || 'No track playing'}
          </h3>
          <Show when={props.menuActions && props.track}>
            <DropdownMenu>
              <DropdownMenuTrigger
                as={(triggerProps: any) => <IconButton {...triggerProps} variant="soft" size="sm" />}
                aria-label="More options"
              >
                <DotsThree class="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <Show when={props.menuActions?.onAddToPlaylist}>
                  <DropdownMenuItem onSelect={() => props.menuActions?.onAddToPlaylist?.(props.track!)}>
                    Add to playlist
                  </DropdownMenuItem>
                </Show>
                <Show when={props.menuActions?.onAddToQueue}>
                  <DropdownMenuItem onSelect={() => props.menuActions?.onAddToQueue?.(props.track!)}>
                    Add to queue
                  </DropdownMenuItem>
                </Show>
                <Show when={(props.menuActions?.onAddToPlaylist || props.menuActions?.onAddToQueue) && (props.menuActions?.onGoToArtist || props.menuActions?.onGoToAlbum)}>
                  <DropdownMenuSeparator />
                </Show>
                <Show when={props.menuActions?.onGoToArtist}>
                  <DropdownMenuItem onSelect={() => props.menuActions?.onGoToArtist?.(props.track!)}>
                    Go to artist
                  </DropdownMenuItem>
                </Show>
                <Show when={props.menuActions?.onGoToAlbum}>
                  <DropdownMenuItem onSelect={() => props.menuActions?.onGoToAlbum?.(props.track!)}>
                    Go to album
                  </DropdownMenuItem>
                </Show>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
        </div>
        <Show
          when={props.onArtistClick}
          fallback={
            <p class="text-base text-[var(--text-secondary)] truncate">
              {props.artist || props.unknownArtistText || 'Unknown artist'}
            </p>
          }
        >
          <button
            type="button"
            class="text-base text-[var(--text-secondary)] truncate hover:text-[var(--accent-blue)] hover:underline cursor-pointer transition-colors text-left w-full"
            onClick={props.onArtistClick}
          >
            {props.artist || props.unknownArtistText || 'Unknown artist'}
          </button>
        </Show>
      </div>

      {/* Progress */}
      <div class="px-4 pt-2">
        <Scrubber
          value={props.progress}
          onChange={props.onProgressChange}
          onChangeStart={props.onProgressChangeStart}
          onChangeEnd={props.onProgressChangeEnd}
        />
        <div class="flex items-center justify-between text-xs text-[var(--text-muted)] mt-1">
          <span>{props.currentTime || '0:00'}</span>
          <span>{props.duration || '0:00'}</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div class="px-4 pt-4 flex items-center justify-center gap-4">
        <IconButton variant="soft" size="md" aria-label="Shuffle" onClick={props.onShuffle}>
          <ShuffleIcon />
        </IconButton>
        <IconButton variant="soft" size="md" aria-label="Previous" onClick={props.onPrev}>
          <PrevIcon />
        </IconButton>
        <PlayButton
          variant="white"
          size="lg"
          isPlaying={props.isPlaying}
          onClick={props.onPlayPause}
        />
        <IconButton variant="soft" size="md" aria-label="Next" onClick={props.onNext}>
          <NextIcon />
        </IconButton>
        <IconButton variant="soft" size="md" aria-label="Repeat" onClick={props.onRepeat}>
          <RepeatIcon />
        </IconButton>
      </div>
    </div>
  )
}

// Icons
const ShuffleIcon: Component = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M237.66,178.34a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32-11.32L212.69,192H200.94a72.12,72.12,0,0,1-58.59-30.15l-41.72-58.4A56.1,56.1,0,0,0,55.06,80H32a8,8,0,0,1,0-16H55.06a72.12,72.12,0,0,1,58.59,30.15l41.72,58.4A56.1,56.1,0,0,0,200.94,176h11.75l-10.35-10.34a8,8,0,0,1,11.32-11.32ZM143,107a8,8,0,0,0,11.16-1.86l1.2-1.67A56.1,56.1,0,0,1,200.94,80h11.75L202.34,90.34a8,8,0,0,0,11.32,11.32l24-24a8,8,0,0,0,0-11.32l-24-24a8,8,0,0,0-11.32,11.32L212.69,64H200.94a72.12,72.12,0,0,0-58.59,30.15l-1.2,1.67A8,8,0,0,0,143,107Zm-30,42a8,8,0,0,0-11.16,1.86l-1.2,1.67A56.1,56.1,0,0,1,55.06,176H32a8,8,0,0,0,0,16H55.06a72.12,72.12,0,0,0,58.59-30.15l1.2-1.67A8,8,0,0,0,113,149Z" />
  </svg>
)

const PrevIcon: Component = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,47.88V208.12a16,16,0,0,1-24.43,13.43L64,146.77V216a8,8,0,0,1-16,0V40a8,8,0,0,1,16,0v69.23L183.57,34.45A15.95,15.95,0,0,1,208,47.88Z" />
  </svg>
)

const NextIcon: Component = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M72.43,34.45A15.95,15.95,0,0,1,48,47.88V208.12a16,16,0,0,0,24.43,13.43L192,146.77V216a8,8,0,0,0,16,0V40a8,8,0,0,0-16,0v69.23Z" />
  </svg>
)

const RepeatIcon: Component = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M24,128A72.08,72.08,0,0,1,96,56h96V40a8,8,0,0,1,13.66-5.66l24,24a8,8,0,0,1,0,11.32l-24,24A8,8,0,0,1,192,88V72H96a56.06,56.06,0,0,0-56,56,8,8,0,0,1-16,0Zm200-8a8,8,0,0,0-8,8,56.06,56.06,0,0,1-56,56H64V168a8,8,0,0,0-13.66-5.66l-24,24a8,8,0,0,0,0,11.32l24,24A8,8,0,0,0,64,216V200h96a72.08,72.08,0,0,0,72-72A8,8,0,0,0,224,120Z" />
  </svg>
)
