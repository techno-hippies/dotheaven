import { type Component, Show, createSignal } from 'solid-js'
import type { Track } from '@heaven/ui'
import { AlbumCover } from '@heaven/ui'
import type { OnChainPlaylist } from '../../lib/heaven/playlists'
import { resolveCoverUrl } from '../../lib/heaven/cover-ref'

/** Parse track data from drag event */
export const parseTrackFromDrag = (e: DragEvent): Track | null => {
  try {
    const data = e.dataTransfer?.getData('application/x-heaven-track')
    if (!data) return null
    return JSON.parse(data) as Track
  } catch {
    return null
  }
}

// ── Nav Item ────────────────────────────────────────────────────

interface NavItemProps {
  icon: () => any
  label: string
  path: string
  active: boolean
  onClick: () => void
  badge?: number
  compact?: boolean
}

export const NavItem: Component<NavItemProps> = (props) => (
  <button
    type="button"
    class={`flex items-center gap-3 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${props.active ? 'bg-[var(--bg-highlight)]' : ''} ${props.compact ? 'w-11 h-11 justify-center p-0' : 'w-full px-3 py-3'}`}
    onClick={props.onClick}
    title={props.label}
  >
    <span class="relative w-6 h-6 flex-shrink-0 flex items-center justify-center text-[var(--text-secondary)]">
      <props.icon />
      <Show when={props.badge && props.badge > 0}>
        <span class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1">
          {props.badge! > 99 ? '99+' : props.badge}
        </span>
      </Show>
    </span>
    <Show when={!props.compact}>
      <span class="text-base font-semibold text-[var(--text-secondary)] whitespace-nowrap">{props.label}</span>
    </Show>
  </button>
)

// ── Playlist Drop Target ────────────────────────────────────────

interface PlaylistDropTargetProps {
  playlist: OnChainPlaylist
  isActive: boolean
  onClick: () => void
  onDrop: (track: Track, playlist: OnChainPlaylist) => void
  compact?: boolean
}

export const PlaylistDropTarget: Component<PlaylistDropTargetProps> = (props) => {
  const [isDragOver, setIsDragOver] = createSignal(false)

  const handleDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('application/x-heaven-track')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const track = parseTrackFromDrag(e)
    if (track) {
      props.onDrop(track, props.playlist)
    }
  }

  const coverSrc = () => resolveCoverUrl(props.playlist.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 })

  return (
    <button
      type="button"
      class={`flex items-center rounded-md cursor-pointer transition-colors ${
        isDragOver()
          ? 'ring-2 ring-[var(--accent-blue)] bg-[var(--bg-highlight)]'
          : props.isActive
            ? 'bg-[var(--bg-highlight)]'
            : 'hover:bg-[var(--bg-highlight-hover)]'
      } ${props.compact ? 'w-11 h-11 justify-center p-0 overflow-hidden' : 'gap-3 w-full px-3 py-2'}`}
      onClick={props.onClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      title={props.playlist.name}
    >
      <Show when={props.compact} fallback={
        <>
          <AlbumCover
            size="sm"
            src={coverSrc()}
            icon="playlist"
            class="flex-shrink-0"
          />
          <div class="flex flex-col min-w-0 text-left">
            <span class="text-base text-[var(--text-primary)] truncate whitespace-nowrap">{props.playlist.name}</span>
            <span class="text-base text-[var(--text-muted)] whitespace-nowrap">{props.playlist.trackCount} songs</span>
          </div>
        </>
      }>
        <AlbumCover
          size="sm"
          src={coverSrc()}
          icon="playlist"
        />
      </Show>
    </button>
  )
}
