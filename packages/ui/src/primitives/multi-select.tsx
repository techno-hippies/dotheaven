import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { Select as KobalteSelect } from '@kobalte/core/select'
import { cn } from '../lib/utils'

export interface MultiSelectOption {
  value: string
  label: string
}

export interface MultiSelectProps {
  options: MultiSelectOption[]
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
  class?: string
  disabled?: boolean
}

/**
 * MultiSelect - Multi-selection dropdown following Kobalte pattern
 * Shows selected items as removable chips below
 */
export const MultiSelect: Component<MultiSelectProps> = (props) => {
  const selectedValues = () => props.value || []

  // Kobalte passes array of extracted values when optionValue is set
  const handleChange = (newValues: string[]) => {
    props.onChange?.(newValues)
  }

  const handleRemove = (valueToRemove: string, e: MouseEvent) => {
    e.stopPropagation()
    const newValues = selectedValues().filter(v => v !== valueToRemove)
    props.onChange?.(newValues)
  }

  const getLabel = (value: string) => {
    return props.options.find(opt => opt.value === value)?.label || value
  }

  return (
    <div class={cn('flex flex-col gap-2', props.class)}>
      {/* Dropdown */}
      <KobalteSelect<string>
        value={selectedValues()}
        onChange={handleChange}
        multiple
        options={props.options.map(opt => opt.value)}
        placeholder={props.placeholder || 'Select...'}
        itemComponent={(itemProps) => (
          <KobalteSelect.Item
            item={itemProps.item}
            class="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-[var(--bg-highlight-hover)] data-[highlighted]:bg-[var(--bg-highlight-hover)] outline-none"
          >
            <KobalteSelect.ItemLabel class="text-[var(--text-primary)]">
              {getLabel(itemProps.item.rawValue)}
            </KobalteSelect.ItemLabel>
            <KobalteSelect.ItemIndicator>
              <svg class="w-5 h-5 text-[var(--accent-blue)]" fill="currentColor" viewBox="0 0 256 256">
                <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
              </svg>
            </KobalteSelect.ItemIndicator>
          </KobalteSelect.Item>
        )}
        disabled={props.disabled}
      >
        <KobalteSelect.Trigger
          as="div"
          class={cn(
            'flex items-center justify-between w-full px-4 py-2.5 rounded-full cursor-pointer',
            'bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base',
            'border border-transparent outline-none',
            'hover:bg-[var(--bg-highlight-hover)]',
            'focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20',
            'transition-colors',
            props.disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <KobalteSelect.Value<string> class="text-left flex-1">
            {(state) => state.selectedOptions().length > 0
              ? `${state.selectedOptions().length} selected`
              : props.placeholder || 'Select...'}
          </KobalteSelect.Value>
          <KobalteSelect.Icon class="ml-2">
            <svg class="w-5 h-5 text-[var(--text-secondary)]" fill="currentColor" viewBox="0 0 256 256">
              <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
            </svg>
          </KobalteSelect.Icon>
        </KobalteSelect.Trigger>

        <KobalteSelect.Portal>
          <KobalteSelect.Content class="bg-[var(--bg-surface)] rounded-md border border-[var(--bg-highlight)] shadow-lg max-h-[300px] overflow-y-auto z-50">
            <KobalteSelect.Listbox />
          </KobalteSelect.Content>
        </KobalteSelect.Portal>
      </KobalteSelect>

      {/* Selected chips - below dropdown */}
      <Show when={selectedValues().length > 0}>
        <div class="flex gap-2 flex-wrap">
          <For each={selectedValues()}>
            {(value) => (
              <button
                type="button"
                onClick={(e) => handleRemove(value, e)}
                class="h-11 px-4 rounded-full bg-[var(--accent-blue)]/15 border-2 border-[var(--accent-blue)] text-[var(--accent-blue)] text-sm font-medium flex items-center gap-2 hover:bg-[var(--accent-blue)]/25 transition-colors cursor-pointer"
              >
                <span>{getLabel(value)}</span>
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                </svg>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
