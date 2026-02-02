import { type Component, type JSX, splitProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

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
        // Pause icon
        <svg class={cn(local.size === 'lg' ? 'w-6 h-6' : 'w-4 h-4')} fill="currentColor" viewBox="0 0 256 256">
          <path d="M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z" />
        </svg>
      ) : (
        // Play icon
        <svg class={cn(local.size === 'lg' ? 'w-6 h-6' : 'w-4 h-4', 'ml-0.5')} fill="currentColor" viewBox="0 0 256 256">
          <path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z" />
        </svg>
      )}
    </button>
  )
}
