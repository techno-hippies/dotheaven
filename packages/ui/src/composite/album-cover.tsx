import type { Component } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const albumCoverVariants = cva(
  'relative flex items-center justify-center bg-[var(--bg-elevated)] overflow-hidden rounded-md',
  {
    variants: {
      size: {
        xs: 'w-8 h-8',
        sm: 'w-12 h-12',
        md: 'w-14 h-14',
        lg: 'w-20 h-20',
        xl: 'w-32 h-32',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

export interface AlbumCoverProps extends VariantProps<typeof albumCoverVariants> {
  class?: string
  src?: string
  alt?: string
  icon?: 'music' | 'compass' | 'heart' | 'playlist'
}

// Icons must be functions to create fresh DOM nodes each time (SolidJS requirement)
const icons = {
  music: () => (
    <svg class="w-1/2 h-1/2 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  ),
  compass: () => (
    <svg class="w-1/2 h-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" />
    </svg>
  ),
  heart: () => (
    <svg class="w-1/2 h-1/2 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ),
  playlist: () => (
    <svg class="w-1/2 h-1/2 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
    </svg>
  ),
}

/**
 * Album cover component - rounded square for music/albums (Spotify-style).
 * Matches Component/Album Cover from Pencil design.
 */
export const AlbumCover: Component<AlbumCoverProps> = (props) => {
  return (
    <div class={cn(albumCoverVariants({ size: props.size }), props.class)}>
      {props.src ? (
        <img
          src={props.src}
          alt={props.alt || 'Album cover'}
          class="w-full h-full object-cover"
        />
      ) : (
        icons[props.icon || 'music']()
      )}
    </div>
  )
}
