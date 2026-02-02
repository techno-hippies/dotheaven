import type { Component, JSX } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const avatarVariants = cva(
  'relative flex items-center justify-center bg-[var(--bg-elevated)] overflow-hidden',
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
        '4xl': 'w-32 h-32',
      },
      shape: {
        circle: 'rounded-full',      // For people/profiles
        square: 'rounded-md',        // For albums/songs
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
            viewBox="0 0 256 256"
          >
            <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
          </svg>
        )
      )}
    </div>
  )
}
