import { type Component, type JSX, splitProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const iconButtonVariants = cva(
  'inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
        soft: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-highlight-hover)] rounded-md',
        default: 'bg-[var(--bg-highlight)] text-[var(--text-primary)] hover:bg-[var(--bg-highlight-hover)] rounded-md',
        play: 'bg-white text-black rounded-full hover:scale-105 transition-transform',
        send: 'bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white rounded-full disabled:bg-[var(--bg-highlight)] disabled:text-[var(--text-muted)]',
      },
      size: {
        sm: 'w-6 h-6',  // 24px container for w-3.5 h-3.5 (14px) icons
        md: 'w-8 h-8',  // 32px container for w-5 h-5 (20px) icons
        lg: 'w-10 h-10', // 40px container for w-6 h-6 (24px) icons
        xl: 'w-11 h-11', // 44px container for send buttons
      },
    },
    defaultVariants: {
      variant: 'ghost',
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
 * - md: 32px container with 20px icons (w-5 h-5) - standard UI, most common
 * - lg: 40px container with 24px icons (w-6 h-6) - primary actions, touch targets
 * - xl: 44px container with 20px icons (w-5 h-5) - send buttons, large touch targets
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
