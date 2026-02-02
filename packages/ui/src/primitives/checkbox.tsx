import { type Component, splitProps } from 'solid-js'
import { Checkbox as KobalteCheckbox } from '@kobalte/core/checkbox'
import { cn } from '../lib/utils'

const CheckIcon = () => (
  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
  </svg>
)

export interface CheckboxProps {
  /** Controlled checked state */
  checked?: boolean
  /** Default checked state (uncontrolled) */
  defaultChecked?: boolean
  /** Change handler */
  onChange?: (checked: boolean) => void
  /** Indeterminate state */
  indeterminate?: boolean
  /** Name for form submission */
  name?: string
  /** Value for form submission */
  value?: string
  /** Validation state */
  validationState?: 'valid' | 'invalid'
  /** Required field */
  required?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Read-only state */
  readOnly?: boolean
  /** Label text */
  label?: string
  /** Description text */
  description?: string
  /** Error message */
  errorMessage?: string
  /** Additional class for root */
  class?: string
}

/**
 * Checkbox - Styled checkbox component built with Kobalte
 *
 * Features:
 * - Built with native <input> element
 * - Syncs with form reset events
 * - ARIA labeling and description support
 * - Can be controlled or uncontrolled
 * - Matches Heaven design system (rounded-md, accent colors)
 */
export const Checkbox: Component<CheckboxProps> = (props) => {
  const [local, others] = splitProps(props, [
    'class',
    'label',
    'description',
    'errorMessage',
    'validationState',
  ])

  return (
    <KobalteCheckbox
      class={cn('flex items-start gap-3', local.class)}
      validationState={local.validationState}
      {...others}
    >
      <KobalteCheckbox.Input class="peer" />
      <KobalteCheckbox.Control
        class={cn(
          'flex items-center justify-center w-5 h-5 rounded-md border-2 transition-all',
          'bg-[var(--bg-highlight)] border-[var(--bg-highlight)]',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-blue)]/20',
          'peer-data-[checked]:bg-[var(--accent-blue)] peer-data-[checked]:border-[var(--accent-blue)]',
          'peer-data-[indeterminate]:bg-[var(--accent-blue)] peer-data-[indeterminate]:border-[var(--accent-blue)]',
          'peer-data-[invalid]:border-[var(--accent-coral)]',
          'peer-data-[disabled]:opacity-50 peer-data-[disabled]:cursor-not-allowed',
          'hover:border-[var(--accent-blue)] peer-data-[checked]:hover:bg-[var(--accent-blue-hover)]'
        )}
      >
        <KobalteCheckbox.Indicator class="text-white">
          <CheckIcon />
        </KobalteCheckbox.Indicator>
      </KobalteCheckbox.Control>

      <div class="flex-1 flex flex-col gap-1">
        {local.label && (
          <KobalteCheckbox.Label class="text-sm font-medium text-[var(--text-primary)] cursor-pointer select-none">
            {local.label}
          </KobalteCheckbox.Label>
        )}
        {local.description && (
          <KobalteCheckbox.Description class="text-sm text-[var(--text-secondary)]">
            {local.description}
          </KobalteCheckbox.Description>
        )}
        {local.errorMessage && (
          <KobalteCheckbox.ErrorMessage class="text-sm text-[var(--accent-coral)]">
            {local.errorMessage}
          </KobalteCheckbox.ErrorMessage>
        )}
      </div>
    </KobalteCheckbox>
  )
}
