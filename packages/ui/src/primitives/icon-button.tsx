import { type Component, type JSX, splitProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
        soft: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-highlight-hover)]',
        default: 'bg-[var(--bg-highlight)] text-[var(--text-primary)] hover:bg-[var(--bg-highlight-hover)]',
        play: 'bg-white text-black hover:scale-105 transition-transform',
        send: 'bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white disabled:bg-[var(--bg-highlight)] disabled:text-[var(--text-muted)]',
      },
      size: {
        sm: 'w-7 h-7',  // 28px container for w-3.5 h-3.5 (14px) icons
        md: 'w-9 h-9',  // 36px container for w-5 h-5 (20px) icons — matches p-2 + 20px icon
        lg: 'w-11 h-11', // 44px container for w-6 h-6 (24px) icons
        xl: 'w-12 h-12', // 48px container for send buttons (matches input field height)
      },
    },
    defaultVariants: {
      variant: 'soft',
      size: 'md',
    },
  }
)

export interface IconButtonProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof iconButtonVariants> {
  children: JSX.Element
  'aria-label': string
}

/**
 * IconButton - Standardized button for icon-only actions.
 *
 * Size guidelines:
 * - sm: 28px container with 14px icons (w-3.5 h-3.5) - compact contexts
 * - md: 36px container with 20px icons (w-5 h-5) - standard UI, most common
 * - lg: 44px container with 24px icons (w-6 h-6) - primary actions, touch targets
 * - xl: 48px container with 20px icons (w-5 h-5) - send buttons, matches input field height
 *
 * Variants:
 * - ghost: Hover color change only, no background
 * - soft: Hover color change + subtle background highlight on hover
 * - default: Always has background
 * - play: Special white circular button with scale effect (for play/pause)
 * - send: Pastel blue circular button for message sending (disabled state shows muted background)
 */
export const IconButton: Component<IconButtonProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'variant', 'size', 'children'])

  return (
    <button
      type="button"
      class={cn(iconButtonVariants({ variant: local.variant, size: local.size }), local.class)}
      {...others}
    >
      {local.children}
    </button>
  )
}
