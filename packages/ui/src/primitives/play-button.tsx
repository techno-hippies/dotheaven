import { type Component, type JSX, splitProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/classnames'
import { PlayFill, PauseFill } from '../icons'

const playButtonVariants = cva(
  'inline-flex items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white hover:scale-105',
        white: 'bg-white text-black hover:scale-105',
      },
      size: {
        md: 'w-10 h-10', // 40px - for inline use
        lg: 'w-14 h-14', // 56px - for playlist headers
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'lg',
    },
  }
)

export interface PlayButtonProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof playButtonVariants> {
  isPlaying?: boolean
  'aria-label'?: string
}

/**
 * PlayButton - Large circular play/pause button for media controls.
 *
 * Used in:
 * - Playlist/album headers (size="lg", variant="primary")
 * - Music player controls (size="md", variant="white")
 *
 * Features:
 * - Automatic play/pause icon toggle
 * - Scale animation on hover
 * - Two size variants (md: 40px, lg: 56px)
 * - Two color variants (primary: blue accent, white: white bg)
 */
export const PlayButton: Component<PlayButtonProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'variant', 'size', 'isPlaying'])

  return (
    <button
      type="button"
      class={cn(playButtonVariants({ variant: local.variant, size: local.size }), local.class)}
      aria-label={props['aria-label'] || (local.isPlaying ? 'Pause' : 'Play')}
      {...others}
    >
      {local.isPlaying ? (
        <PauseFill class={cn(local.size === 'lg' ? 'w-6 h-6' : 'w-4 h-4')} />
      ) : (
        <PlayFill class={cn(local.size === 'lg' ? 'w-6 h-6' : 'w-4 h-4', 'ml-0.5')} />
      )}
    </button>
  )
}
