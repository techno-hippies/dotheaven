import type { Component } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import {
  cn,
  AlbumCover,
  IconButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@heaven/ui'

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  albumCover?: string
  dateAdded: string
  duration: string
}

export interface TrackMenuActions {
  onAddToPlaylist?: (track: Track) => void
  onAddToQueue?: (track: Track) => void
  onGoToArtist?: (track: Track) => void
  onGoToAlbum?: (track: Track) => void
  onRemoveFromPlaylist?: (track: Track) => void
}

export interface TrackListProps {
  class?: string
  tracks: Track[]
  onTrackClick?: (track: Track) => void
  onTrackPlay?: (track: Track) => void
  menuActions?: TrackMenuActions
}

/**
 * TrackList - Track listing table for playlists/albums/artists.
 *
 * Columns: # | Title | Album | Date added | Duration | Menu
 */
export const TrackList: Component<TrackListProps> = (props) => {
  return (
    <div class={cn('px-8 pb-8', props.class)}>
      {/* Table Header */}
      <div class="grid grid-cols-[48px_minmax(200px,4fr)_minmax(120px,2fr)_minmax(120px,1fr)_80px_48px] gap-4 px-4 py-2 border-b border-[var(--bg-highlight)] text-sm text-[var(--text-muted)] font-medium">
        <div class="text-center">#</div>
        <div>Title</div>
        <div>Album</div>
        <div>Date added</div>
        <div class="flex items-center justify-center">
          {/* Duration icon (clock) */}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <div /> {/* Empty column for menu */}
      </div>

      {/* Track Rows */}
      <div class="mt-2">
        <For each={props.tracks}>
          {(track, index) => {
            const [menuOpen, setMenuOpen] = createSignal(false)
            return (
              <div
                class={cn(
                  "group grid grid-cols-[48px_minmax(200px,4fr)_minmax(120px,2fr)_minmax(120px,1fr)_80px_48px] gap-4 px-4 py-2 rounded-lg transition-colors cursor-pointer",
                  menuOpen() ? "bg-[var(--bg-highlight)]" : "hover:bg-[var(--bg-highlight)]"
                )}
                onClick={() => props.onTrackClick?.(track)}
                onDblClick={() => props.onTrackPlay?.(track)}
              >
              {/* Track Number / Play Button */}
              <div class="flex items-center justify-center text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                <span class="group-hover:hidden">{index() + 1}</span>
                <svg class="w-4 h-4 hidden group-hover:block" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
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
                  <div class="text-[var(--text-primary)] font-medium truncate">
                    {track.title}
                  </div>
                  <div class="text-sm text-[var(--text-secondary)] truncate">
                    {track.artist}
                  </div>
                </div>
              </div>

              {/* Album */}
              <div class="flex items-center text-sm text-[var(--text-secondary)] truncate">
                {track.album}
              </div>

              {/* Date Added */}
              <div class="flex items-center text-sm text-[var(--text-secondary)]">
                {track.dateAdded}
              </div>

              {/* Duration */}
              <div class="flex items-center justify-center text-sm text-[var(--text-secondary)]">
                {track.duration}
              </div>

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
