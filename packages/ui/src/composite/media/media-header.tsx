import { Show, For, createSignal, type Component, type JSX } from 'solid-js'
import { cn } from '../../lib/utils'
import { useIsMobile } from '../../lib/use-media-query'
import { AlbumCover } from './album-cover'
import { IconButton } from '../../primitives/icon-button'
import { ChevronLeft, DotsThree } from '../../icons'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '../../primitives/drawer'

export interface MediaHeaderMenuItem {
  label: string
  icon?: JSX.Element
  onSelect: () => void
}

export interface MediaHeaderProps {
  class?: string
  title: string
  type?: 'playlist' | 'album' | 'artist'
  creator?: string
  creatorHref?: string
  description?: string | JSX.Element
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
  /** Back button handler (mobile: shows chevron in header bar) */
  onBack?: () => void
  /** Menu items shown in a drawer on mobile (3-dots button) */
  mobileMenuItems?: MediaHeaderMenuItem[]
}

/**
 * MediaHeader - Large header for playlist/album/artist views.
 *
 * Mobile: sticky header bar with back chevron + 3-dots menu, then cover + metadata centered.
 * Desktop: cover + metadata side-by-side with actions slot below.
 */
export const MediaHeader: Component<MediaHeaderProps> = (props) => {
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = createSignal(false)

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
    <div class={cn(props.class)}>
      {/* Mobile header bar with back + dots */}
      <Show when={isMobile() && (props.onBack || (props.mobileMenuItems && props.mobileMenuItems.length > 0))}>
        <div class="flex items-center justify-between px-2 py-2">
          <Show when={props.onBack} fallback={<div class="w-10" />}>
            <IconButton
              variant="soft"
              size="md"
              onClick={props.onBack}
              aria-label="Go back"
            >
              <ChevronLeft class="w-5 h-5" />
            </IconButton>
          </Show>

          <Show when={props.mobileMenuItems && props.mobileMenuItems.length > 0} fallback={<div class="w-10" />}>
            <IconButton
              variant="soft"
              size="md"
              onClick={() => setDrawerOpen(true)}
              aria-label="More options"
            >
              <DotsThree class="w-5 h-5" />
            </IconButton>
          </Show>
        </div>
      </Show>

      <div class={cn('px-4 pb-4 md:p-8', !isMobile() && 'pt-4')}>
        <div class="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          {/* Cover Art */}
          <div
            class={cn('flex-shrink-0 self-center md:self-auto', props.onCoverClick && 'cursor-pointer')}
            onClick={props.onCoverClick}
          >
            {props.coverImages && props.coverImages.length > 0 ? (
              // Playlist mosaic (2x2 grid)
              <div class="w-48 h-48 md:w-56 md:h-56 grid grid-cols-2 grid-rows-2 gap-1 bg-[var(--bg-elevated)] rounded-md overflow-hidden">
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
                class="w-48 h-48 md:w-56 md:h-56"
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
                'text-2xl md:text-4xl font-bold text-[var(--text-primary)] mb-1 md:mb-2 leading-tight',
                props.onTitleClick && 'cursor-pointer hover:underline'
              )}
              onClick={props.onTitleClick}
            >
              {props.title}
            </h1>

            {/* Description (if provided) */}
            {props.description && (
              typeof props.description === 'string' ? (
                <p class="text-base text-[var(--text-secondary)] mb-2 md:mb-4 line-clamp-2">
                  {props.description}
                </p>
              ) : (
                <div class="mb-2 md:mb-4">
                  {props.description}
                </div>
              )
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
                  <a href={props.creatorHref} class="font-semibold text-[var(--text-primary)] hover:underline cursor-pointer">
                    {props.creator}
                  </a>
                </Show>
                <Show when={formatStats()}>
                  <span class="text-[var(--text-secondary)]">&bull;</span>
                </Show>
              </Show>
              <Show when={formatStats()}>
                <span class="text-[var(--text-secondary)]">
                  {formatStats()}
                </span>
              </Show>
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

      {/* Mobile menu drawer */}
      <Show when={props.mobileMenuItems && props.mobileMenuItems.length > 0}>
        <Drawer open={drawerOpen()} onOpenChange={setDrawerOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{props.title}</DrawerTitle>
            </DrawerHeader>
            <div class="flex flex-col py-2">
              <For each={props.mobileMenuItems}>
                {(item) => (
                  <button
                    type="button"
                    class="flex items-center gap-3 px-2 py-3 rounded-md text-[var(--text-primary)] hover:bg-[var(--bg-highlight)] active:bg-[var(--bg-highlight)] transition-colors text-left"
                    onClick={() => {
                      setDrawerOpen(false)
                      item.onSelect()
                    }}
                  >
                    <Show when={item.icon}>
                      <span class="flex-shrink-0 text-[var(--text-secondary)]">{item.icon}</span>
                    </Show>
                    <span class="text-base">{item.label}</span>
                  </button>
                )}
              </For>
            </div>
          </DrawerContent>
        </Drawer>
      </Show>
    </div>
  )
}
