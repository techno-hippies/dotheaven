import type { Component } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/classnames'
import { MusicNote, Compass, Heart, List } from '../../icons'

const albumCoverVariants = cva(
  'relative flex items-center justify-center bg-[var(--bg-elevated)] overflow-hidden rounded-sm',
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

const icons = {
  music: () => <MusicNote class="w-1/2 h-1/2 text-[var(--text-muted)]" />,
  compass: () => <Compass class="w-1/2 h-1/2 text-[var(--text-muted)]" />,
  heart: () => <Heart class="w-1/2 h-1/2 text-[var(--text-muted)]" />,
  playlist: () => <List class="w-1/2 h-1/2 text-[var(--text-muted)]" />,
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
