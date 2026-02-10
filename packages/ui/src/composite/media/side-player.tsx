import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { AlbumCover } from './album-cover'
import { Scrubber } from './scrubber'
import { IconButton } from '../../primitives/icon-button'
import { PlayButton } from '../../primitives/play-button'
import { DotsThree, MagnifyingGlass, Shuffle, SkipBackFill, SkipForwardFill, Repeat } from '../../icons'
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
          <Shuffle class="w-5 h-5" />
        </IconButton>
        <IconButton variant="soft" size="md" aria-label="Previous" onClick={props.onPrev}>
          <SkipBackFill class="w-5 h-5" />
        </IconButton>
        <PlayButton
          variant="white"
          size="lg"
          isPlaying={props.isPlaying}
          onClick={props.onPlayPause}
        />
        <IconButton variant="soft" size="md" aria-label="Next" onClick={props.onNext}>
          <SkipForwardFill class="w-5 h-5" />
        </IconButton>
        <IconButton variant="soft" size="md" aria-label="Repeat" onClick={props.onRepeat}>
          <Repeat class="w-5 h-5" />
        </IconButton>
      </div>
    </div>
  )
}

