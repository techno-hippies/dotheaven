import type { Component } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import { createVirtualizer } from '@tanstack/solid-virtual'
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
  onUploadToFilecoin?: (track: Track) => void
  onUploadToFilecoinPublic?: (track: Track) => void
}

export type SortField = 'title' | 'artist' | 'album' | 'dateAdded' | 'duration'
export type SortDirection = 'asc' | 'desc'
export interface SortState {
  field: SortField
  direction: SortDirection
}

export interface TrackListProps {
  class?: string
  tracks: Track[]
  showDateAdded?: boolean
  showScrobbleStatus?: boolean
  activeTrackId?: string
  activeTrackPlaying?: boolean
  selectedTrackId?: string
  onTrackClick?: (track: Track) => void
  onTrackPlay?: (track: Track) => void
  menuActions?: TrackMenuActions
  /** Pass the scrollable parent element for virtual scrolling */
  scrollRef?: HTMLElement
  /** Current sort state */
  sort?: SortState
  /** Called when a sortable header is clicked */
  onSort?: (field: SortField) => void
}

const ROW_HEIGHT = 56

/**
 * TrackList - Virtualized track listing with sticky sortable headers.
 *
 * Columns: # | Title | Artist | Album | Date added (opt) | Duration | Status (opt) | Menu
 */
export const TrackList: Component<TrackListProps> = (props) => {
  const showDate = () => props.showDateAdded !== false
  const showStatus = () => props.showScrobbleStatus === true

  // Build grid-template-columns as inline style (NOT dynamic Tailwind — JIT can't detect runtime strings)
  const gridTemplate = () => {
    const cols: string[] = ['48px'] // #
    cols.push('minmax(160px,3fr)')   // Title
    cols.push('minmax(120px,2fr)')   // Artist
    cols.push('minmax(120px,2fr)')   // Album
    if (showDate()) cols.push('minmax(120px,1fr)') // Date added
    cols.push('80px')                // Duration
    if (showStatus()) cols.push('48px') // Scrobble status
    cols.push('48px')                // Menu
    return cols.join(' ')
  }

  // Find scroll parent: use explicit scrollRef or walk up DOM
  let containerRef!: HTMLDivElement
  const getScrollElement = () => {
    if (props.scrollRef) return props.scrollRef
    let el: HTMLElement | null = containerRef
    while (el) {
      const style = getComputedStyle(el)
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') return el
      el = el.parentElement
    }
    return document.documentElement
  }

  const virtualizer = createVirtualizer({
    get count() { return props.tracks.length },
    getScrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const totalHeight = () => virtualizer.getTotalSize()
  const virtualItems = () => virtualizer.getVirtualItems()

  // Sort indicator helper
  const sortIcon = (field: SortField) => {
    if (!props.sort || props.sort.field !== field) return null
    return props.sort.direction === 'asc' ? '▲' : '▼'
  }

  const handleHeaderClick = (field: SortField) => {
    props.onSort?.(field)
  }

  const headerClass = "flex items-center gap-1 select-none cursor-pointer hover:text-[var(--text-primary)] transition-colors"

  return (
    <div ref={containerRef} class={cn('px-8 pb-8', props.class)}>
      {/* Sticky Header */}
      <div
        class="sticky top-0 z-10 grid gap-4 px-4 py-2 border-b border-[var(--bg-highlight)] text-sm text-[var(--text-muted)] font-medium bg-[var(--bg-page)]"
        style={{ 'grid-template-columns': gridTemplate() }}
      >
        <div class="text-center">#</div>
        <div class={headerClass} onClick={() => handleHeaderClick('title')}>
          Title
          <Show when={sortIcon('title')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
        </div>
        <div class={headerClass} onClick={() => handleHeaderClick('artist')}>
          Artist
          <Show when={sortIcon('artist')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
        </div>
        <div class={headerClass} onClick={() => handleHeaderClick('album')}>
          Album
          <Show when={sortIcon('album')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
        </div>
        <Show when={showDate()}>
          <div class={headerClass} onClick={() => handleHeaderClick('dateAdded')}>
            Date added
            <Show when={sortIcon('dateAdded')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
          </div>
        </Show>
        <div class={cn(headerClass, 'justify-center')} onClick={() => handleHeaderClick('duration')}>
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
            <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z" />
          </svg>
          <Show when={sortIcon('duration')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
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

      {/* Virtualized Track Rows */}
      <div class="relative mt-2" style={{ height: `${totalHeight()}px` }}>
        <For each={virtualItems()}>
          {(vItem) => {
            const track = () => props.tracks[vItem.index]
            const [menuOpen, setMenuOpen] = createSignal(false)
            const isActive = () => props.activeTrackId === track().id
            const isSelected = () => props.selectedTrackId === track().id
            return (
              <div
                class="absolute left-0 right-0"
                style={{ top: `${vItem.start}px`, height: `${ROW_HEIGHT}px` }}
              >
                <div
                  class={cn(
                    "group grid gap-4 px-4 h-full rounded-md transition-colors cursor-pointer items-center",
                    isSelected() || menuOpen()
                      ? "bg-[var(--bg-highlight)]"
                      : "hover:bg-[var(--bg-highlight)]"
                  )}
                  style={{ 'grid-template-columns': gridTemplate() }}
                  onClick={() => props.onTrackClick?.(track())}
                  onDblClick={() => props.onTrackPlay?.(track())}
                >
                  {/* Track Number / Play Button */}
                  <div class={cn(
                    "flex items-center justify-center group-hover:text-[var(--text-primary)]",
                    isActive() ? "text-[var(--primary)]" : "text-[var(--text-secondary)]"
                  )}>
                    <span class="group-hover:hidden">{vItem.index + 1}</span>
                    <button
                      type="button"
                      class="hidden group-hover:flex items-center justify-center"
                      aria-label={`Play ${track().title}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onTrackPlay?.(track())
                      }}
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,39.87V216.13A15.94,15.94,0,0,0,80,232a16.07,16.07,0,0,0,8.36-2.35L232.4,141.51a15.81,15.81,0,0,0,0-27ZM80,215.94V40l143.83,88Z" />
                      </svg>
                    </button>
                  </div>

                  {/* Title */}
                  <div class="flex items-center gap-3 min-w-0">
                    <AlbumCover
                      src={track().albumCover}
                      size="sm"
                      icon="music"
                      class="flex-shrink-0"
                    />
                    <div
                      class={cn(
                        "font-medium truncate",
                        isActive() ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
                      )}
                    >
                      {track().title}
                    </div>
                  </div>

                  {/* Artist */}
                  <div class={cn(
                    "flex items-center text-sm truncate",
                    isActive() ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  )}>
                    {track().artist}
                  </div>

                  {/* Album */}
                  <div class={cn(
                    "flex items-center text-sm truncate",
                    isActive() ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  )}>
                    {track().album}
                  </div>

                  {/* Date Added */}
                  <Show when={showDate()}>
                    <div class="flex items-center text-sm text-[var(--text-secondary)]">
                      {track().dateAdded}
                    </div>
                  </Show>

                  {/* Duration */}
                  <div class={cn(
                    "flex items-center justify-center text-sm",
                    isActive() ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  )}>
                    {track().duration}
                  </div>

                  {/* Scrobble Status Icon */}
                  <Show when={showStatus()}>
                    <div class="flex items-center justify-center">
                      {track().scrobbleStatus === 'verified' ? (
                        <span title="Verified" class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[oklch(0.65_0.12_240)]">
                          <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </span>
                      ) : track().scrobbleStatus === 'unidentified' ? (
                        <button
                          type="button"
                          title="Unidentified — click to identify"
                          class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            props.menuActions?.onIdentify?.(track())
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
                        as={(triggerProps: any) => <IconButton {...triggerProps} variant="ghost" size="md" />}
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
                          <DropdownMenuItem onSelect={() => props.menuActions?.onAddToPlaylist?.(track())}>
                            Add to playlist
                          </DropdownMenuItem>
                        </Show>
                        <Show when={props.menuActions?.onAddToQueue}>
                          <DropdownMenuItem onSelect={() => props.menuActions?.onAddToQueue?.(track())}>
                            Add to queue
                          </DropdownMenuItem>
                        </Show>
                        <Show when={props.menuActions?.onAddToPlaylist || props.menuActions?.onAddToQueue}>
                          <DropdownMenuSeparator />
                        </Show>
                        <Show when={props.menuActions?.onGoToArtist}>
                          <DropdownMenuItem onSelect={() => props.menuActions?.onGoToArtist?.(track())}>
                            Go to artist
                          </DropdownMenuItem>
                        </Show>
                        <Show when={props.menuActions?.onGoToAlbum}>
                          <DropdownMenuItem onSelect={() => props.menuActions?.onGoToAlbum?.(track())}>
                            Go to album
                          </DropdownMenuItem>
                        </Show>
                        <Show when={(props.menuActions?.onGoToArtist || props.menuActions?.onGoToAlbum) && props.menuActions?.onRemoveFromPlaylist}>
                          <DropdownMenuSeparator />
                        </Show>
                        <Show when={props.menuActions?.onRemoveFromPlaylist}>
                          <DropdownMenuItem onSelect={() => props.menuActions?.onRemoveFromPlaylist?.(track())}>
                            Remove from playlist
                          </DropdownMenuItem>
                        </Show>
                        <Show when={props.menuActions?.onUploadToFilecoin || props.menuActions?.onUploadToFilecoinPublic}>
                          <DropdownMenuSeparator />
                          <Show when={props.menuActions?.onUploadToFilecoin}>
                            <DropdownMenuItem onSelect={() => props.menuActions?.onUploadToFilecoin?.(track())}>
                              Upload to Filecoin (Encrypted)
                            </DropdownMenuItem>
                          </Show>
                          <Show when={props.menuActions?.onUploadToFilecoinPublic}>
                            <DropdownMenuItem onSelect={() => props.menuActions?.onUploadToFilecoinPublic?.(track())}>
                              Upload to Filecoin (Public)
                            </DropdownMenuItem>
                          </Show>
                        </Show>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}
