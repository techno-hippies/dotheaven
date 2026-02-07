import { type Component, type JSX, splitProps, Show } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/classnames'
import { Spinner } from './spinner'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-full text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]/20 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]',
        destructive: 'bg-[var(--accent-coral)] text-white hover:bg-[var(--accent-coral)]/90',
        outline: 'border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-highlight)]',
        secondary: 'border border-[var(--border-default)] bg-[var(--bg-highlight)] text-[var(--text-primary)] hover:bg-[var(--bg-highlight-hover)]',
        ghost: 'text-[var(--text-primary)] hover:bg-[var(--bg-highlight)]',
        link: 'text-[var(--accent-blue)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        md: 'h-10 px-6',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  /** Leading icon element — automatically sized and spaced */
  icon?: JSX.Element
}

export const Button: Component<ButtonProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'variant', 'size', 'children', 'loading', 'disabled', 'icon'])

  return (
    <button
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      disabled={local.loading || local.disabled}
      {...others}
    >
      <Show when={local.loading}>
        <Spinner size="sm" class="mr-2" />
      </Show>
      <Show when={local.icon}>
        <span class="mr-1.5 inline-flex items-center [&>svg]:w-4 [&>svg]:h-4">{local.icon}</span>
      </Show>
      {local.children}
    </button>
  )
}
