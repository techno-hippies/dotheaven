import type { Component } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import { createVirtualizer } from '@tanstack/solid-virtual'
import { cn } from '../../lib/classnames'
import { useIsMobile } from '../../lib/use-media-query'
import { AlbumCover } from './album-cover'
import { IconButton } from '../../primitives/icon-button'
import { Play, DotsThree, HashStraight, Clock, Check, WarningCircle, CheckCircle, CloudFill } from '../../icons'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../primitives/dropdown-menu'

export type ScrobbleStatus = 'verified' | 'unidentified'

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  albumCover?: string
  dateAdded?: string
  duration?: string
  scrobbleCount?: number
  scrobbleStatus?: ScrobbleStatus
  /** MusicBrainz recording MBID (if known) */
  mbid?: string
  /** MusicBrainz artist MBID (if known) */
  artistMbid?: string
  /** On-chain track kind (1=MBID, 2=ipId, 3=meta) */
  kind?: number
  /** On-chain track payload (bytes32 hex) */
  payload?: string
  /** Filecoin piece CID (cloud playback) */
  pieceCid?: string
  /** Beam CDN dataset owner address (cloud playback) */
  datasetOwner?: string
  /** ContentRegistry content ID (cloud playback) */
  contentId?: string
  /** Encryption algorithm: 0 = plaintext, 1 = AES-GCM-256 (cloud playback) */
  algo?: number
  /** Local file path (desktop metadata; indicates user owns this track) */
  filePath?: string
  /** Local cover image path (desktop metadata) */
  coverPath?: string
  /** IPFS CID for cover art */
  coverCid?: string
  /** Story Protocol IP Asset ID (for published songs) */
  ipId?: string
  /** Optional storage lifecycle state */
  storageStatus?: 'local' | 'uploaded' | 'permanent'
  /** Who shared this track (heaven name or address) */
  sharedBy?: string
}

export interface TrackMenuActions {
  onAddToPlaylist?: (track: Track) => void
  onAddToQueue?: (track: Track) => void
  onGoToArtist?: (track: Track) => void
  onGoToAlbum?: (track: Track) => void
  onRemoveFromPlaylist?: (track: Track) => void
  onIdentify?: (track: Track) => void
  onUploadToFilecoin?: (track: Track) => void
  onSaveForever?: (track: Track) => void
  onDownload?: (track: Track) => void
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
  showArtist?: boolean
  showAlbum?: boolean
  showDateAdded?: boolean
  showDuration?: boolean
  showScrobbleCount?: boolean
  showScrobbleStatus?: boolean
  showSharedBy?: boolean
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
  /** Force compact mobile layout regardless of screen size */
  forceCompact?: boolean
  /** Enable drag-to-playlist for playable tracks (those with filePath, pieceCid, or contentId) */
  enableDrag?: boolean
  /** Show artist as subtitle below track title instead of a separate column */
  artistBelowTitle?: boolean
  /** Show row numbers column (default true) */
  showRowNumbers?: boolean
}

const ROW_HEIGHT = 64
const COMPACT_ROW_HEIGHT = 72

/** Check if a track has a playback source (can be dragged to playlist) */
const isTrackDraggable = (track: Track): boolean =>
  !!(track.filePath || track.pieceCid || track.contentId)

/** Check if a track is cloud-only (no local file) */
const isCloudTrack = (track: Track): boolean =>
  !track.filePath && !!(track.pieceCid || track.contentId)

/** Check if a track has uploaded payload metadata and can be anchored. */
const canSaveForever = (track: Track): boolean =>
  track.storageStatus !== 'permanent' && !!(track.pieceCid || track.contentId)

/** Create a custom drag preview element */
const createDragPreview = (track: Track): HTMLElement => {
  const el = document.createElement('div')
  el.className = 'fixed pointer-events-none px-3 py-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-lg text-base text-[var(--text-primary)] whitespace-nowrap z-[9999]'
  el.textContent = `${track.title} \u2022 ${track.artist}`
  el.style.cssText = 'position: fixed; top: -1000px; left: -1000px;'
  document.body.appendChild(el)
  return el
}

/** Handle drag start for a track */
const handleDragStart = (e: DragEvent, track: Track) => {
  if (!e.dataTransfer) return

  // Set drag data
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('application/x-heaven-track', JSON.stringify(track))

  // Create and position custom drag image
  const preview = createDragPreview(track)
  e.dataTransfer.setDragImage(preview, 0, 0)

  // Clean up preview after drag starts
  requestAnimationFrame(() => {
    setTimeout(() => preview.remove(), 0)
  })
}

/**
 * TrackList - Virtualized track listing with sticky sortable headers.
 *
 * Desktop: # | Title | Artist | Album (opt) | Date added (opt) | Scrobbles (opt) | Duration | Status (opt) | Menu
 * Mobile (compact): Album cover | Title + Artist | Duration | Menu
 */
export const TrackList: Component<TrackListProps> = (props) => {
  const isMobile = useIsMobile()
  const isCompact = () => props.forceCompact || isMobile()

  const showArtist = () => props.showArtist !== false && !isCompact() && !props.artistBelowTitle
  const showAlbum = () => props.showAlbum !== false && !isCompact()
  const showDate = () => props.showDateAdded === true && !isCompact()
  const showDuration = () => props.showDuration !== false && !isCompact()
  const showScrobbles = () => props.showScrobbleCount === true && !isCompact()
  const showStatus = () => props.showScrobbleStatus === true && !isCompact()
  const showSharedBy = () => props.showSharedBy === true && !isCompact()

  const rowHeight = () => isCompact() ? COMPACT_ROW_HEIGHT : ROW_HEIGHT

  // Build grid-template-columns as inline style (NOT dynamic Tailwind — JIT can't detect runtime strings)
  const gridTemplate = () => {
    if (isCompact()) {
      // Compact (flex layout, grid template not used)
      return '1fr 40px'
    }
    const cols: string[] = []
    if (props.showRowNumbers !== false) cols.push('48px') // #
    cols.push('minmax(200px,3fr)')   // Title
    if (showArtist()) cols.push('minmax(120px,2fr)') // Artist
    if (showAlbum()) cols.push('minmax(120px,2fr)') // Album
    if (showSharedBy()) cols.push('minmax(120px,1.5fr)') // Shared by
    if (showDate()) cols.push('minmax(120px,1fr)') // Date added
    if (showScrobbles()) cols.push('100px') // Scrobble count
    if (showDuration()) cols.push('44px') // Duration
    if (showStatus()) cols.push('48px') // Scrobble status
    cols.push('36px')                // Menu
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
    estimateSize: () => rowHeight(),
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

  // Track menu dropdown (shared between compact and full)
  const TrackMenu: Component<{ track: Track; menuOpen: boolean; setMenuOpen: (v: boolean) => void; alwaysVisible?: boolean }> = (menuProps) => (
    <DropdownMenu onOpenChange={menuProps.setMenuOpen}>
      <DropdownMenuTrigger
        as={(triggerProps: any) => <IconButton {...triggerProps} variant="soft" size="sm" />}
        aria-label="More options"
        class={cn(
          "transition-opacity",
          menuProps.alwaysVisible || menuProps.menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <DotsThree class="w-3.5 h-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <Show when={props.menuActions?.onAddToPlaylist}>
          <DropdownMenuItem onSelect={() => props.menuActions?.onAddToPlaylist?.(menuProps.track)}>
            Add to playlist
          </DropdownMenuItem>
        </Show>
        <Show when={props.menuActions?.onAddToQueue}>
          <DropdownMenuItem onSelect={() => props.menuActions?.onAddToQueue?.(menuProps.track)}>
            Add to queue
          </DropdownMenuItem>
        </Show>
        <Show when={props.menuActions?.onGoToArtist}>
          <DropdownMenuItem onSelect={() => props.menuActions?.onGoToArtist?.(menuProps.track)}>
            Go to artist
          </DropdownMenuItem>
        </Show>
        <Show when={props.menuActions?.onGoToAlbum}>
          <DropdownMenuItem onSelect={() => props.menuActions?.onGoToAlbum?.(menuProps.track)}>
            Go to album
          </DropdownMenuItem>
        </Show>
        <Show when={props.menuActions?.onRemoveFromPlaylist}>
          <DropdownMenuItem onSelect={() => props.menuActions?.onRemoveFromPlaylist?.(menuProps.track)}>
            Remove from playlist
          </DropdownMenuItem>
        </Show>
        <Show when={props.menuActions?.onIdentify && menuProps.track.scrobbleStatus === 'unidentified'}>
          <DropdownMenuItem onSelect={() => props.menuActions?.onIdentify?.(menuProps.track)}>
            Tag with MusicBrainz Picard
          </DropdownMenuItem>
        </Show>
        <Show when={props.menuActions?.onUploadToFilecoin}>
          <DropdownMenuItem onSelect={() => props.menuActions?.onUploadToFilecoin?.(menuProps.track)}>
            Upload
          </DropdownMenuItem>
        </Show>
        <Show when={canSaveForever(menuProps.track)}>
          <DropdownMenuItem onSelect={() => props.menuActions?.onSaveForever?.(menuProps.track)}>
            Save Forever
          </DropdownMenuItem>
        </Show>
        <Show when={props.menuActions?.onDownload && isCloudTrack(menuProps.track)}>
          <DropdownMenuItem onSelect={() => props.menuActions?.onDownload?.(menuProps.track)}>
            Download
          </DropdownMenuItem>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  // Compact row (mobile)
  const CompactTrackRow: Component<{ track: Track; index: number; isActive: boolean; isSelected: boolean }> = (rowProps) => {
    const [menuOpen, setMenuOpen] = createSignal(false)
    const draggable = () => props.enableDrag && isTrackDraggable(rowProps.track)
    return (
      <div
        class={cn(
          "group flex items-center gap-3 px-4 h-full transition-colors cursor-pointer",
          rowProps.isSelected || menuOpen()
            ? "bg-[var(--bg-highlight)]"
            : "active:bg-[var(--bg-highlight)]"
        )}
        draggable={draggable()}
        onDragStart={(e) => draggable() && handleDragStart(e, rowProps.track)}
        onClick={() => props.onTrackClick?.(rowProps.track)}
        onDblClick={() => props.onTrackPlay?.(rowProps.track)}
      >
        {/* Album Cover */}
        <AlbumCover
          src={rowProps.track.albumCover}
          size="md"
          icon="music"
          class="flex-shrink-0"
        />

        {/* Title + Artist */}
        <div class="flex-1 min-w-0">
          <div
            class={cn(
              "font-medium truncate text-base flex items-center gap-1.5",
              rowProps.isActive ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
            )}
          >
            <span class="truncate">{rowProps.track.title}</span>
            <Show when={isCloudTrack(rowProps.track)}>
              <CloudFill class="w-3 h-3 text-[var(--accent-blue)] flex-shrink-0" />
            </Show>
          </div>
          <div class="text-base text-[var(--text-muted)] truncate">
            <Show
              when={props.menuActions?.onGoToArtist}
              fallback={rowProps.track.artist}
            >
              <button
                type="button"
                class="truncate hover:underline hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  props.menuActions?.onGoToArtist?.(rowProps.track)
                }}
              >
                {rowProps.track.artist}
              </button>
            </Show>
          </div>
        </div>

        {/* Menu */}
        <div class="flex items-center justify-center flex-shrink-0">
          <TrackMenu
            track={rowProps.track}
            menuOpen={menuOpen()}
            setMenuOpen={setMenuOpen}
            alwaysVisible
          />
        </div>
      </div>
    )
  }

  // Full row (desktop)
  const FullTrackRow: Component<{ track: Track; index: number; isActive: boolean; isSelected: boolean }> = (rowProps) => {
    const [menuOpen, setMenuOpen] = createSignal(false)
    const draggable = () => props.enableDrag && isTrackDraggable(rowProps.track)
    return (
      <div
        class={cn(
          "group grid gap-2 px-4 h-full transition-colors cursor-pointer items-center",
          rowProps.isSelected || menuOpen()
            ? "bg-[var(--bg-highlight)]"
            : "hover:bg-[var(--bg-highlight)]"
        )}
        style={{ 'grid-template-columns': gridTemplate() }}
        draggable={draggable()}
        onDragStart={(e) => draggable() && handleDragStart(e, rowProps.track)}
        onClick={() => props.onTrackClick?.(rowProps.track)}
        onDblClick={() => props.onTrackPlay?.(rowProps.track)}
      >
        {/* Track Number / Play Button */}
        <Show when={props.showRowNumbers !== false}>
          <div class={cn(
            "flex items-center justify-center group-hover:text-[var(--text-primary)]",
            rowProps.isActive ? "text-[var(--primary)]" : "text-[var(--text-secondary)]"
          )}>
            <span class="group-hover:hidden">{rowProps.index + 1}</span>
            <button
              type="button"
              class="hidden group-hover:flex items-center justify-center"
              aria-label={`Play ${rowProps.track.title}`}
              onClick={(e) => {
                e.stopPropagation()
                props.onTrackPlay?.(rowProps.track)
              }}
            >
              <Play class="w-4 h-4" />
            </button>
          </div>
        </Show>

        {/* Title */}
        <div class="flex items-center gap-3 min-w-0">
          <AlbumCover
            src={rowProps.track.albumCover}
            size="sm"
            icon="music"
            class="flex-shrink-0"
          />
          <div class="flex flex-col min-w-0">
            <div
              class={cn(
                "font-medium truncate flex items-center gap-1.5",
                rowProps.isActive ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
              )}
            >
              <span class="truncate">{rowProps.track.title}</span>
              <Show when={isCloudTrack(rowProps.track)}>
                <CloudFill class="w-3 h-3 text-[var(--accent-blue)] flex-shrink-0" />
              </Show>
            </div>
            <Show when={props.artistBelowTitle}>
              <Show
                when={props.menuActions?.onGoToArtist}
                fallback={
                  <span class="text-sm text-[var(--text-secondary)] truncate">{rowProps.track.artist}</span>
                }
              >
                <button
                  type="button"
                  class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline truncate text-left cursor-pointer transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.menuActions?.onGoToArtist?.(rowProps.track)
                  }}
                >
                  {rowProps.track.artist}
                </button>
              </Show>
            </Show>
          </div>
        </div>

        {/* Artist */}
        <Show when={showArtist()}>
          <div class="flex items-center text-base truncate">
            <Show
              when={props.menuActions?.onGoToArtist}
              fallback={
                <span class={rowProps.isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
                  {rowProps.track.artist}
                </span>
              }
            >
              <button
                type="button"
                class={cn(
                  "truncate hover:underline cursor-pointer transition-colors",
                  rowProps.isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  props.menuActions?.onGoToArtist?.(rowProps.track)
                }}
              >
                {rowProps.track.artist}
              </button>
            </Show>
          </div>
        </Show>

        {/* Album */}
        <Show when={showAlbum()}>
          <div class="flex items-center text-base truncate">
            <Show
              when={props.menuActions?.onGoToAlbum && rowProps.track.album}
              fallback={
                <span class={rowProps.isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
                  {rowProps.track.album}
                </span>
              }
            >
              <button
                type="button"
                class={cn(
                  "truncate hover:underline cursor-pointer transition-colors",
                  rowProps.isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  props.menuActions?.onGoToAlbum?.(rowProps.track)
                }}
              >
                {rowProps.track.album}
              </button>
            </Show>
          </div>
        </Show>

        {/* Shared by */}
        <Show when={showSharedBy()}>
          <div class="flex items-center text-base text-[var(--text-secondary)] truncate">
            {rowProps.track.sharedBy}
          </div>
        </Show>

        {/* Date Added */}
        <Show when={showDate()}>
          <div class="flex items-center text-base text-[var(--text-secondary)]">
            {rowProps.track.dateAdded}
          </div>
        </Show>

        {/* Scrobble Count */}
        <Show when={showScrobbles()}>
          <div class="flex items-center justify-center text-base text-[var(--text-secondary)]">
            {rowProps.track.scrobbleCount?.toLocaleString() ?? '0'}
          </div>
        </Show>

        {/* Duration */}
        <Show when={showDuration()}>
          <div class={cn(
            "flex items-center justify-end text-base",
            rowProps.isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
          )}>
            {rowProps.track.duration}
          </div>
        </Show>

        {/* Scrobble Status Icon */}
        <Show when={showStatus()}>
          <div class="flex items-center justify-center">
            {rowProps.track.scrobbleStatus === 'verified' ? (
              <span title="Verified" class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[oklch(0.65_0.12_240)]">
                <Check class="w-3.5 h-3.5 text-white" />
              </span>
            ) : rowProps.track.scrobbleStatus === 'unidentified' ? (
              <button
                type="button"
                title="Unidentified — click to identify"
                class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  props.menuActions?.onIdentify?.(rowProps.track)
                }}
              >
                <WarningCircle class="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </Show>

        {/* More Menu (Three Dots) */}
        <div class="flex items-center justify-center">
          <TrackMenu
            track={rowProps.track}
            menuOpen={menuOpen()}
            setMenuOpen={setMenuOpen}
          />
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} class={cn(isCompact() ? 'px-2 pb-4' : 'pb-4', props.class)}>
      {/* Sticky Header - only show on desktop */}
      <Show when={!isCompact()}>
        <div
          class="sticky top-0 z-10 grid gap-2 px-4 py-2 text-base text-[var(--text-muted)] font-medium bg-[var(--bg-page)] border-b border-[var(--border-subtle)]"
          style={{ 'grid-template-columns': gridTemplate() }}
        >
          <Show when={props.showRowNumbers !== false}>
            <div class="text-center">#</div>
          </Show>
          <div class={headerClass} onClick={() => handleHeaderClick('title')}>
            Title
            <Show when={sortIcon('title')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
          </div>
          <Show when={showArtist()}>
            <div class={headerClass} onClick={() => handleHeaderClick('artist')}>
              Artist
              <Show when={sortIcon('artist')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
            </div>
          </Show>
          <Show when={showAlbum()}>
            <div class={headerClass} onClick={() => handleHeaderClick('album')}>
              Album
              <Show when={sortIcon('album')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
            </div>
          </Show>
          <Show when={showSharedBy()}>
            <div class="flex items-center gap-1 select-none text-[var(--text-muted)]">
              Shared by
            </div>
          </Show>
          <Show when={showDate()}>
            <div class={headerClass} onClick={() => handleHeaderClick('dateAdded')}>
              Date added
              <Show when={sortIcon('dateAdded')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
            </div>
          </Show>
          <Show when={showScrobbles()}>
            <div class={cn(headerClass, 'justify-center')}>
              <HashStraight class="w-4 h-4" />
            </div>
          </Show>
          <Show when={showDuration()}>
            <div class={cn(headerClass, 'justify-end')} onClick={() => handleHeaderClick('duration')}>
              <Clock class="w-4 h-4" />
              <Show when={sortIcon('duration')}>{(icon) => <span class="text-[var(--text-secondary)] text-xs">{icon()}</span>}</Show>
            </div>
          </Show>
          <Show when={showStatus()}>
            <div class="flex items-center justify-center" title="Scrobble status">
              <CheckCircle class="w-4 h-4" />
            </div>
          </Show>
          <div />
        </div>
      </Show>

      {/* Virtualized Track Rows */}
      <div class="relative mt-2" style={{ height: `${totalHeight()}px` }}>
        <For each={virtualItems()}>
          {(vItem) => {
            const track = () => props.tracks[vItem.index]
            const isActive = () => props.activeTrackId === track().id
            const isSelected = () => props.selectedTrackId === track().id
            return (
              <div
                class="absolute left-0 right-0"
                style={{ top: `${vItem.start}px`, height: `${rowHeight()}px` }}
              >
                <Show
                  when={isCompact()}
                  fallback={
                    <FullTrackRow
                      track={track()}
                      index={vItem.index}
                      isActive={isActive()}
                      isSelected={isSelected()}
                    />
                  }
                >
                  <CompactTrackRow
                    track={track()}
                    index={vItem.index}
                    isActive={isActive()}
                    isSelected={isSelected()}
                  />
                </Show>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}
