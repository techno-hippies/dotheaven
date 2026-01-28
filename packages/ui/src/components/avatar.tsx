import type { Component, JSX } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const avatarVariants = cva(
  'relative flex items-center justify-center bg-[var(--bg-highlight)] overflow-hidden',
  {
    variants: {
      size: {
        xs: 'w-6 h-6',
        sm: 'w-8 h-8',
        md: 'w-10 h-10',
        lg: 'w-12 h-12',
        xl: 'w-16 h-16',
        '2xl': 'w-24 h-24',
        '3xl': 'w-[100px] h-[100px]',
      },
      shape: {
        circle: 'rounded-full',      // For people/profiles
        square: 'rounded-sm',        // For albums/songs (Spotify-style)
      },
    },
    defaultVariants: {
      size: 'md',
      shape: 'circle',
    },
  }
)

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  class?: string
  src?: string
  alt?: string
  fallback?: JSX.Element
}

/**
 * Avatar component - round for people, square with rounded corners for albums/songs.
 * Matches the design system: people are round, album art is rounded-corner square.
 */
export const Avatar: Component<AvatarProps> = (props) => {
  return (
    <div class={cn(avatarVariants({ size: props.size, shape: props.shape }), props.class)}>
      {props.src ? (
        <img
          src={props.src}
          alt={props.alt || ''}
          class="w-full h-full object-cover"
        />
      ) : (
        props.fallback || (
          <svg
            class="w-1/2 h-1/2 text-[var(--text-muted)]"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        )
      )}
    </div>
  )
}
