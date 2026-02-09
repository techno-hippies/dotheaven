import { splitProps } from 'solid-js'
import { Select as KobalteSelect } from '@kobalte/core/select'
import { cn } from '../lib/classnames'

const ChevronDownIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
  </svg>
)

const CheckIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
  </svg>
)

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps<T = SelectOption> {
  options: T[]
  placeholder?: string
  error?: string | null
  class?: string
  value?: T
  defaultValue?: T
  onChange?: (value: T | null) => void
  disabled?: boolean
  name?: string
  required?: boolean
  optionValue?: keyof T
  optionTextValue?: keyof T
  optionDisabled?: keyof T
}

/**
 * Select - Styled select dropdown using Kobalte Select
 *
 * Features:
 * - Single selection from a list of options
 * - Keyboard navigation (Arrow keys, Home, End, typing to search)
 * - Accessible (ARIA compliant)
 * - Custom styling matching Heaven design system
 * - Error state support
 * - Disabled state support
 *
 * Usage:
 * ```tsx
 * const [value, setValue] = createSignal('')
 * <Select
 *   options={[
 *     { value: 'en', label: 'English' },
 *     { value: 'es', label: 'Spanish' }
 *   ]}
 *   value={value()}
 *   onChange={setValue}
 *   placeholder="Select language..."
 * />
 * ```
 */
export function Select<T extends SelectOption = SelectOption>(props: SelectProps<T>) {
  const [local, others] = splitProps(props, ['placeholder', 'error', 'class', 'disabled', 'options', 'optionValue', 'optionTextValue', 'optionDisabled'])

  return (
    <KobalteSelect<T>
      multiple={false}
      options={local.options}
      optionValue={local.optionValue ?? 'value'}
      optionTextValue={local.optionTextValue ?? 'label'}
      optionDisabled={local.optionDisabled ?? 'disabled'}
      placeholder={local.placeholder}
      disabled={local.disabled}
      {...others}
      itemComponent={(itemProps) => (
        <KobalteSelect.Item
          item={itemProps.item}
          class={cn(
            'flex items-center justify-between gap-2 px-3 py-2.5 text-base cursor-pointer outline-none',
            'text-[var(--text-primary)]',
            'data-[highlighted]:bg-[var(--bg-highlight-hover)]',
            'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
          )}
        >
          <KobalteSelect.ItemLabel class="truncate">
            {itemProps.item.rawValue.label}
          </KobalteSelect.ItemLabel>
          <KobalteSelect.ItemIndicator class="text-[var(--accent-blue)]">
            <CheckIcon />
          </KobalteSelect.ItemIndicator>
        </KobalteSelect.Item>
      )}
      {...others}
    >
      <div class={cn('relative', local.class)}>
        <KobalteSelect.Trigger
          class={cn(
            'flex items-center justify-between gap-2 w-full h-12 px-4 rounded-full',
            'bg-[var(--bg-highlight)] text-base',
            'border border-[var(--border-default)] transition-colors',
            'focus:outline-none',
            local.error
              ? 'border-[var(--accent-coral)]'
              : 'focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20',
            local.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            'data-[placeholder-shown]:text-[var(--text-muted)]'
          )}
        >
          <KobalteSelect.Value<T> class="truncate text-left flex-1">
            {(state) => state.selectedOption()?.label}
          </KobalteSelect.Value>
          <KobalteSelect.Icon class="text-[var(--text-muted)] transition-transform data-[expanded]:rotate-180">
            <ChevronDownIcon />
          </KobalteSelect.Icon>
        </KobalteSelect.Trigger>

        {local.error && (
          <span class="text-xs text-[var(--accent-coral)] mt-1 block">{local.error}</span>
        )}
      </div>

      <KobalteSelect.Portal>
        <KobalteSelect.Content
          class={cn(
            'z-50 min-w-[var(--kb-popper-anchor-width)] mt-1',
            'bg-[var(--bg-surface)] rounded-md border border-[var(--border-subtle)]',
            'shadow-xl overflow-hidden',
            'animate-in fade-in-0 zoom-in-95',
            'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95'
          )}
        >
          <KobalteSelect.Listbox class="max-h-64 overflow-y-auto" />
        </KobalteSelect.Content>
      </KobalteSelect.Portal>
    </KobalteSelect>
  )
}
