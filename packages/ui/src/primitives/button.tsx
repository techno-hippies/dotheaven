import { type Component, type JSX, splitProps, Show } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]/20 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]',
        destructive: 'bg-[var(--accent-coral)] text-white hover:bg-[var(--accent-coral)]/90',
        outline: 'border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-highlight)]',
        secondary: 'bg-[var(--bg-highlight)] text-[var(--text-primary)] hover:bg-[var(--bg-highlight-hover)]',
        ghost: 'text-[var(--text-primary)] hover:bg-[var(--bg-highlight)]',
        link: 'text-[var(--accent-blue)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        md: 'h-10 rounded-lg px-6',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

const Spinner: Component<{ class?: string }> = (props) => (
  <svg
    class={cn('animate-spin h-4 w-4', props.class)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      class="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="4"
    />
    <path
      class="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

export interface ButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button: Component<ButtonProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'variant', 'size', 'children', 'loading', 'disabled'])

  return (
    <button
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      disabled={local.loading || local.disabled}
      {...others}
    >
      <Show when={local.loading}>
        <Spinner class="mr-2" />
      </Show>
      {local.children}
    </button>
  )
}
