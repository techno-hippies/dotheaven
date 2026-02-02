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
    <svg class="w-1/2 h-1/2 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
      <path d="M210.3,56.34l-80-24A8,8,0,0,0,120,40V148.26A48,48,0,1,0,136,184V98.75l69.7,20.91A8,8,0,0,0,216,112V64A8,8,0,0,0,210.3,56.34ZM88,216a32,32,0,1,1,32-32A32,32,0,0,1,88,216ZM200,101.25l-64-19.2V50.75L200,70Z" />
    </svg>
  ),
  compass: () => (
    <svg class="w-1/2 h-1/2 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
      <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM172.42,72.84l-64,32a8.05,8.05,0,0,0-3.58,3.58l-32,64A8,8,0,0,0,80,184a8.1,8.1,0,0,0,3.58-.84l64-32a8.05,8.05,0,0,0,3.58-3.58l32-64a8,8,0,0,0-10.74-10.74ZM138,138,97.89,158.11,118,118l40.15-20.07Z" />
    </svg>
  ),
  heart: () => (
    <svg class="w-1/2 h-1/2 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
      <path d="M178,40c-20.65,0-38.73,8.88-50,23.89C116.73,48.88,98.65,40,78,40a62.07,62.07,0,0,0-62,62c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,228.66,240,172,240,102A62.07,62.07,0,0,0,178,40ZM128,214.8C109.74,204.16,32,155.69,32,102A46.06,46.06,0,0,1,78,56c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,155.61,146.24,204.15,128,214.8Z" />
    </svg>
  ),
  playlist: () => (
    <svg class="w-1/2 h-1/2 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
      <path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm104,56H40a8,8,0,0,0,0,16h96a8,8,0,0,0,0-16Zm0,64H40a8,8,0,0,0,0,16h96a8,8,0,0,0,0-16Zm112-24a8,8,0,0,1-3.76,6.78l-64,40A8,8,0,0,1,168,200V120a8,8,0,0,1,12.24-6.78l64,40A8,8,0,0,1,248,160Zm-23.09,0L184,134.43v51.14Z" />
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
