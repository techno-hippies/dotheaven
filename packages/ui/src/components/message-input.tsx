import { type Component, createSignal, splitProps } from 'solid-js'
import { TextArea } from './text-field'
import { IconButton } from './icon-button'
import { cn } from '../lib/utils'

const SendIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
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
  /** Max height for textarea before scrolling */
  maxHeight?: number
}

/**
 * MessageInput - Message input field with send button
 *
 * Features:
 * - Auto-resizing textarea
 * - Send button (disabled when empty)
 * - Enter to send (Shift+Enter for new line)
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
    'maxHeight',
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
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      class={cn(
        'flex items-end gap-2 p-4 bg-[var(--bg-page)] border-t border-[var(--border-default)]',
        local.class
      )}
      {...others}
    >
      <TextArea
        placeholder={local.placeholder || 'Type a message...'}
        value={currentValue()}
        onChange={setValue}
        disabled={local.disabled}
        autoResize
        class="flex-1"
        textAreaClass={cn(
          'min-h-[44px]',
          local.maxHeight ? `max-h-[${local.maxHeight}px]` : 'max-h-[120px]',
          'overflow-y-auto'
        )}
        onKeyDown={handleKeyDown}
      />
      <IconButton
        variant="send"
        size="xl"
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
