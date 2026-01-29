import type { Component } from 'solid-js'
import { For } from 'solid-js'
import { cn } from '../lib/utils'

export interface PillOption<T = string> {
  value: T
  label: string
}

export interface PillGroupProps<T = string> {
  /** Array of options to display as pills */
  options: readonly PillOption<T>[]
  /** Currently selected value(s) */
  value?: T | T[]
  /** Called when a pill is clicked */
  onChange?: (value: T) => void
  /** Allow multiple selections */
  multiple?: boolean
  /** Custom class for container */
  class?: string
  /** Custom class for individual pills */
  pillClass?: string
  /** Disabled state */
  disabled?: boolean
}

/**
 * PillGroup - Toggle pills for single or multiple selection
 *
 * Common use cases:
 * - Gender selection (single)
 * - Tag/category selection (multiple)
 * - Filter options
 */
export const PillGroup: Component<PillGroupProps> = (props) => {
  const isSelected = (optionValue: string) => {
    if (props.multiple && Array.isArray(props.value)) {
      return props.value.includes(optionValue)
    }
    return props.value === optionValue
  }

  const handleClick = (optionValue: string) => {
    if (props.disabled) return
    props.onChange?.(optionValue as any)
  }

  return (
    <div class={cn('flex gap-2 flex-wrap', props.class)}>
      <For each={props.options}>
        {(opt) => (
          <button
            type="button"
            onClick={() => handleClick(opt.value as string)}
            disabled={props.disabled}
            class={cn(
              'h-11 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer',
              'border-2',
              isSelected(opt.value as string)
                ? 'bg-[var(--accent-blue)]/15 border-[var(--accent-blue)] text-[var(--accent-blue)]'
                : 'bg-[var(--bg-highlight)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)]',
              props.disabled && 'opacity-50 cursor-not-allowed',
              props.pillClass,
            )}
          >
            {opt.label}
          </button>
        )}
      </For>
    </div>
  )
}
