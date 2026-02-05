import { Show, type Component, type JSX } from 'solid-js'
import { cn } from '../../lib/utils'
import { AlbumCover } from './album-cover'

export interface MediaHeaderProps {
  class?: string
  title: string
  type?: 'playlist' | 'album' | 'artist'
  creator?: string
  creatorHref?: string
  description?: string
  coverImages?: string[] // Up to 4 images for playlist mosaic
  coverSrc?: string // Single image for albums/artists
  stats?: {
    songCount?: number
    duration?: string
    followers?: number
    scrobbles?: number
  }
  onPlay?: () => void
  onTitleClick?: () => void
  onCoverClick?: () => void
  actionsSlot?: JSX.Element // Slot for action buttons below the metadata
}

/**
 * MediaHeader - Large header for playlist/album/artist views.
 *
 * Features:
 * - Mosaic of 4 album covers for playlists (or single cover for albums/artists)
 * - Large title and metadata
 * - Play button
 */
export const MediaHeader: Component<MediaHeaderProps> = (props) => {
  const formatStats = () => {
    const parts: string[] = []

    // For artists: show listeners and scrobbles like Last.fm
    if (props.stats?.followers !== undefined) {
      parts.push(`Listeners ${props.stats.followers.toLocaleString()}`)
    }
    if (props.stats?.scrobbles !== undefined) {
      parts.push(`Scrobbles ${props.stats.scrobbles.toLocaleString()}`)
    }

    // For playlists/albums: show song count and duration
    if (props.stats?.songCount) {
      parts.push(`${props.stats.songCount} songs`)
    }
    if (props.stats?.duration) {
      parts.push(props.stats.duration)
    }

    return parts.join(', ')
  }

  return (
    <div class={cn('p-4 md:p-8', props.class)}>
      <div class="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
        {/* Cover Art */}
        <div
          class={cn('flex-shrink-0 self-center md:self-auto', props.onCoverClick && 'cursor-pointer')}
          onClick={props.onCoverClick}
        >
          {props.coverImages && props.coverImages.length > 0 ? (
            // Playlist mosaic (2x2 grid)
            <div class="w-32 h-32 md:w-56 md:h-56 grid grid-cols-2 grid-rows-2 gap-1 bg-[var(--bg-elevated)] rounded-md overflow-hidden">
              {props.coverImages.slice(0, 4).map((src) => (
                <AlbumCover
                  src={src}
                  class="w-full h-full rounded-none"
                />
              ))}
              {/* Fill empty slots if less than 4 images */}
              {Array.from({ length: Math.max(0, 4 - props.coverImages.length) }).map(() => (
                <AlbumCover
                  icon="playlist"
                  class="w-full h-full rounded-none"
                />
              ))}
            </div>
          ) : (
            // Single album cover
            <AlbumCover
              src={props.coverSrc}
              icon="playlist"
              class="w-32 h-32 md:w-56 md:h-56"
            />
          )}
        </div>

        {/* Metadata */}
        <div class="flex-1 min-w-0 text-center md:text-left">
          {/* Type label */}
          {props.type && (
            <div class="text-base font-medium text-[var(--text-primary)] mb-1 md:mb-2">
              {props.type.charAt(0).toUpperCase() + props.type.slice(1)}
            </div>
          )}

          {/* Title */}
          <h1
            class={cn(
              'text-2xl md:text-4xl font-bold text-[var(--text-primary)] mb-2 md:mb-4 leading-tight',
              props.onTitleClick && 'cursor-pointer hover:underline'
            )}
            onClick={props.onTitleClick}
          >
            {props.title}
          </h1>

          {/* Description (if provided) */}
          {props.description && (
            <p class="text-base text-[var(--text-secondary)] mb-2 md:mb-4 line-clamp-2">
              {props.description}
            </p>
          )}

          {/* Creator and stats */}
          <div class="flex items-center justify-center md:justify-start gap-1 text-base">
            <Show when={props.creator}>
              <Show
                when={props.creatorHref}
                fallback={
                  <span class="font-semibold text-[var(--text-primary)]">
                    {props.creator}
                  </span>
                }
              >
                <a href={props.creatorHref} class="font-semibold text-[var(--text-primary)] hover:underline">
                  {props.creator}
                </a>
              </Show>
              <Show when={props.stats}>
                <span class="text-[var(--text-secondary)]">•</span>
              </Show>
            </Show>
            {props.stats && (
              <span class="text-[var(--text-secondary)]">
                {formatStats()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions slot - below album art and metadata */}
      {props.actionsSlot && (
        <div class="mt-4 md:mt-6 flex justify-center md:justify-start">
          {props.actionsSlot}
        </div>
      )}
    </div>
  )
}
