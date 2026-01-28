import { type Component, type JSX, splitProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const messageBubbleVariants = cva(
  'px-4 py-2.5 rounded-lg max-w-[75%] break-words',
  {
    variants: {
      alignment: {
        left: 'bg-[var(--bg-highlight)] text-[var(--text-primary)]',
        right: 'bg-[var(--accent-blue)] text-white',
      },
    },
    defaultVariants: {
      alignment: 'left',
    },
  }
)

export interface MessageBubbleProps extends VariantProps<typeof messageBubbleVariants> {
  /** Message text content */
  message: string
  /** Timestamp text (e.g., "2:30 PM") */
  timestamp?: string
  /** Additional class for container */
  class?: string
}

/**
 * MessageBubble - Chat message bubble component
 *
 * Features:
 * - Left alignment: Gray bubble with rounded top-left corner cut
 * - Right alignment: Green bubble with rounded top-right corner cut
 * - Timestamp support
 * - Max width 75% for readability
 *
 * Design matches iMessage/WhatsApp style messaging
 */
export const MessageBubble: Component<MessageBubbleProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'alignment', 'message', 'timestamp'])

  return (
    <div
      class={cn(
        'flex flex-col gap-1',
        local.alignment === 'right' ? 'items-end' : 'items-start',
        local.class
      )}
      {...others}
    >
      <div class={messageBubbleVariants({ alignment: local.alignment })}>
        <p class="text-base leading-snug whitespace-pre-wrap">{local.message}</p>
      </div>
      {local.timestamp && (
        <span
          class={cn(
            'text-xs',
            local.alignment === 'right' ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
          )}
        >
          {local.timestamp}
        </span>
      )}
    </div>
  )
}

export interface MessageListProps {
  children: JSX.Element
  class?: string
}

/**
 * MessageList - Container for message bubbles with proper spacing
 */
export const MessageList: Component<MessageListProps> = (props) => {
  return (
    <div class={cn('flex flex-col gap-3 p-4', props.class)}>
      {props.children}
    </div>
  )
}
