import type { Component } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import { cn } from '../lib/utils'
import { AlbumCover } from './album-cover'
import { IconButton } from '../primitives/icon-button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './dropdown-menu'

export type ScrobbleStatus = 'verified' | 'unidentified'

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  albumCover?: string
  dateAdded?: string
  duration?: string
  scrobbleStatus?: ScrobbleStatus
}

export interface TrackMenuActions {
  onAddToPlaylist?: (track: Track) => void
  onAddToQueue?: (track: Track) => void
  onGoToArtist?: (track: Track) => void
  onGoToAlbum?: (track: Track) => void
  onRemoveFromPlaylist?: (track: Track) => void
  onIdentify?: (track: Track) => void
}

export interface TrackListProps {
  class?: string
  tracks: Track[]
  showDateAdded?: boolean
  showScrobbleStatus?: boolean
  activeTrackId?: string
  selectedTrackId?: string
  onTrackClick?: (track: Track) => void
  onTrackPlay?: (track: Track) => void
  menuActions?: TrackMenuActions
}

/**
 * TrackList - Track listing table for playlists/albums/artists.
 *
 * Columns: # | Title | Album | Date added (optional) | Duration | Menu
 */
export const TrackList: Component<TrackListProps> = (props) => {
  const showDate = () => props.showDateAdded !== false
  const showStatus = () => props.showScrobbleStatus === true
  const gridCols = () => {
    if (showStatus() && showDate())
      return 'grid-cols-[48px_minmax(200px,4fr)_minmax(120px,2fr)_minmax(120px,1fr)_80px_48px_48px]'
    if (showStatus())
      return 'grid-cols-[48px_minmax(200px,4fr)_minmax(120px,2fr)_80px_48px_48px]'
    if (showDate())
      return 'grid-cols-[48px_minmax(200px,4fr)_minmax(120px,2fr)_minmax(120px,1fr)_80px_48px]'
    return 'grid-cols-[48px_minmax(200px,4fr)_minmax(120px,2fr)_80px_48px]'
  }

  return (
    <div class={cn('px-8 pb-8', props.class)}>
      {/* Table Header */}
      <div class={cn('grid gap-4 px-4 py-2 border-b border-[var(--bg-highlight)] text-sm text-[var(--text-muted)] font-medium', gridCols())}>
        <div class="text-center">#</div>
        <div>Title</div>
        <div>Album</div>
        <Show when={showDate()}>
          <div>Date added</div>
        </Show>
        <div class="flex items-center justify-center">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <Show when={showStatus()}>
          <div class="flex items-center justify-center" title="Scrobble status">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </Show>
        <div />
      </div>

      {/* Track Rows */}
      <div class="mt-2">
        <For each={props.tracks}>
          {(track, index) => {
            const [menuOpen, setMenuOpen] = createSignal(false)
            const isActive = () => props.activeTrackId === track.id
            const isSelected = () => props.selectedTrackId === track.id
            return (
              <div
                class={cn(
                  "group grid gap-4 px-4 py-2 rounded-lg transition-colors cursor-pointer",
                  gridCols(),
                  isSelected() || menuOpen()
                    ? "bg-[var(--bg-highlight)]"
                    : "hover:bg-[var(--bg-highlight)]"
                )}
                onClick={() => props.onTrackClick?.(track)}
                onDblClick={() => props.onTrackPlay?.(track)}
              >
              {/* Track Number / Play Button */}
              <div class={cn(
                "flex items-center justify-center group-hover:text-[var(--text-primary)]",
                isActive() ? "text-[var(--primary)]" : "text-[var(--text-secondary)]"
              )}>
                <span class="group-hover:hidden">{index() + 1}</span>
                <button
                  type="button"
                  class="hidden group-hover:flex items-center justify-center"
                  aria-label={`Play ${track.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onTrackPlay?.(track)
                  }}
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>

              {/* Title + Artist */}
              <div class="flex items-center gap-3 min-w-0">
                <Show when={track.albumCover}>
                  <AlbumCover
                    src={track.albumCover}
                    size="sm"
                    class="flex-shrink-0"
                  />
                </Show>
                <div class="min-w-0 flex-1">
                  <div
                    class={cn(
                      "font-medium truncate",
                      isActive() ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
                    )}
                  >
                    {track.title}
                  </div>
                  <div
                    class={cn(
                      "text-sm truncate",
                      isActive() ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                    )}
                  >
                    {track.artist}
                  </div>
                </div>
              </div>

              {/* Album */}
              <div class={cn(
                "flex items-center text-sm truncate",
                isActive() ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
              )}>
                {track.album}
              </div>

              {/* Date Added */}
              <Show when={showDate()}>
                <div class="flex items-center text-sm text-[var(--text-secondary)]">
                  {track.dateAdded}
                </div>
              </Show>

              {/* Duration */}
              <div class={cn(
                "flex items-center justify-center text-sm",
                isActive() ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
              )}>
                {track.duration}
              </div>

              {/* Scrobble Status Icon */}
              <Show when={showStatus()}>
                <div class="flex items-center justify-center">
                  {track.scrobbleStatus === 'verified' ? (
                    <span title="Verified" class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[oklch(0.65_0.12_240)]">
                      <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                  ) : track.scrobbleStatus === 'unidentified' ? (
                    <button
                      type="button"
                      title="Unidentified — click to identify"
                      class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        props.menuActions?.onIdentify?.(track)
                      }}
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </Show>

              {/* More Menu (Three Dots) */}
              <div class="flex items-center justify-center">
                <DropdownMenu onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger
                    as={(props: any) => <IconButton {...props} variant="ghost" size="md" />}
                    aria-label="More options"
                    class={cn(
                      "transition-opacity",
                      menuOpen() ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                    onClick={(e: MouseEvent) => e.stopPropagation()}
                  >
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <Show when={props.menuActions?.onAddToPlaylist}>
                      <DropdownMenuItem onSelect={() => props.menuActions?.onAddToPlaylist?.(track)}>
                        Add to playlist
                      </DropdownMenuItem>
                    </Show>
                    <Show when={props.menuActions?.onAddToQueue}>
                      <DropdownMenuItem onSelect={() => props.menuActions?.onAddToQueue?.(track)}>
                        Add to queue
                      </DropdownMenuItem>
                    </Show>
                    <Show when={props.menuActions?.onAddToPlaylist || props.menuActions?.onAddToQueue}>
                      <DropdownMenuSeparator />
                    </Show>
                    <Show when={props.menuActions?.onGoToArtist}>
                      <DropdownMenuItem onSelect={() => props.menuActions?.onGoToArtist?.(track)}>
                        Go to artist
                      </DropdownMenuItem>
                    </Show>
                    <Show when={props.menuActions?.onGoToAlbum}>
                      <DropdownMenuItem onSelect={() => props.menuActions?.onGoToAlbum?.(track)}>
                        Go to album
                      </DropdownMenuItem>
                    </Show>
                    <Show when={(props.menuActions?.onGoToArtist || props.menuActions?.onGoToAlbum) && props.menuActions?.onRemoveFromPlaylist}>
                      <DropdownMenuSeparator />
                    </Show>
                    <Show when={props.menuActions?.onRemoveFromPlaylist}>
                      <DropdownMenuItem onSelect={() => props.menuActions?.onRemoveFromPlaylist?.(track)}>
                        Remove from playlist
                      </DropdownMenuItem>
                    </Show>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}
