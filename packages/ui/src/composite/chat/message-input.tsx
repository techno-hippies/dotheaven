import { type Component, createSignal, splitProps } from 'solid-js'
import { cn } from '../../lib/utils'
import { IconButton } from '../../primitives/icon-button'

const SendIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M227.32,28.68a16,16,0,0,0-15.66-4.08l-.15,0L19.57,82.84a16,16,0,0,0-2.49,29.8L102,154l41.3,84.87A15.86,15.86,0,0,0,157.74,248q.69,0,1.38-.06a15.88,15.88,0,0,0,14-11.51l58.2-191.94c0-.05,0-.1,0-.15A16,16,0,0,0,227.32,28.68ZM157.83,231.85l-.05.14,0-.07-40.06-82.3,48-48a8,8,0,0,0-11.31-11.31l-48,48L24.08,98.25l-.07,0,.14,0L216,40Z" />
  </svg>
)

export interface MessageInputProps {
  /** Controlled value */
  value?: string
  /** Change handler */
  onChange?: (value: string) => void
  /** Submit handler (called when send button clicked or Enter pressed) */
  onSubmit?: (message: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Disabled state */
  disabled?: boolean
  /** Additional class for container */
  class?: string
}

/**
 * MessageInput - Single-line message input with send button
 *
 * Features:
 * - Single-line input (like X/Twitter)
 * - Send button (disabled when empty)
 * - Enter to send
 * - Consistent styling with Heaven color scheme
 */
export const MessageInput: Component<MessageInputProps> = (props) => {
  const [local, others] = splitProps(props, [
    'class',
    'value',
    'onChange',
    'onSubmit',
    'placeholder',
    'disabled',
  ])

  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = createSignal('')

  const currentValue = () => local.value ?? internalValue()
  const setValue = (val: string) => {
    if (local.onChange) {
      local.onChange(val)
    } else {
      setInternalValue(val)
    }
  }

  const handleSubmit = () => {
    const message = currentValue().trim()
    if (!message || local.disabled) return

    local.onSubmit?.(message)
    setValue('') // Clear input after sending
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      class={cn(
        'flex items-center gap-3 p-4 bg-[var(--bg-page)] border-t border-[var(--border-default)]',
        local.class
      )}
      {...others}
    >
      <input
        type="text"
        placeholder={local.placeholder || 'Type a message...'}
        value={currentValue()}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        disabled={local.disabled}
        class="flex-1 bg-[var(--bg-elevated)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 rounded-md border-none outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/50"
      />
      <IconButton
        variant="send"
        size="lg"
        aria-label="Send message"
        disabled={!currentValue().trim() || local.disabled}
        onClick={handleSubmit}
        class="flex-shrink-0"
      >
        <SendIcon />
      </IconButton>
    </div>
  )
}
