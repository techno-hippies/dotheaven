import { type Component, type JSX, splitProps, Show } from 'solid-js'
import { TextField as KobalteTextField } from '@kobalte/core/text-field'
import { cn } from '../lib/classnames'

export interface TextFieldProps {
  /** Input name for form submission */
  name?: string
  /** Input value (controlled) */
  value?: string
  /** Default value (uncontrolled) */
  defaultValue?: string
  /** Change handler for controlled mode */
  onChange?: (value: string) => void
  /** Label text */
  label?: string
  /** Placeholder text */
  placeholder?: string
  /** Description text below input */
  description?: string
  /** Error message text */
  errorMessage?: string
  /** Validation state */
  validationState?: 'valid' | 'invalid'
  /** Required field */
  required?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Readonly state */
  readOnly?: boolean
  /** Additional class for root container */
  class?: string
  /** Additional class for input element */
  inputClass?: string
  /** Leading icon element */
  icon?: JSX.Element
  /** KeyDown event handler */
  onKeyDown?: (e: KeyboardEvent) => void
}

/**
 * TextField - Text input component built with Kobalte
 *
 * Features:
 * - Built with native <input> element
 * - Visual and ARIA labeling support
 * - Required and invalid states
 * - Description and error message help text
 * - Can be controlled or uncontrolled
 */
export const TextField: Component<TextFieldProps> = (props) => {
  const [local, others] = splitProps(props, [
    'class',
    'inputClass',
    'label',
    'description',
    'errorMessage',
    'validationState',
    'icon',
    'onKeyDown',
    'placeholder',
  ])

  return (
    <KobalteTextField
      class={cn('flex flex-col gap-2', local.class)}
      validationState={local.validationState}
      {...others}
    >
      {local.label && (
        <KobalteTextField.Label class="text-base font-medium text-[var(--text-primary)]">
          {local.label}
        </KobalteTextField.Label>
      )}

      <Show
        when={local.icon}
        fallback={
          <KobalteTextField.Input
            placeholder={local.placeholder}
            onKeyDown={local.onKeyDown}
            class={cn(
              'h-12 px-4 rounded-full bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base',
              'placeholder:text-[var(--text-muted)] outline-none',
              'border border-[var(--border-default)]',
              'focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20',
              'transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'data-[invalid]:border-[var(--accent-coral)] data-[invalid]:focus:ring-[var(--accent-coral)]/20',
              local.inputClass
            )}
          />
        }
      >
        <div
          class={cn(
            'flex items-center gap-2 h-12 px-4 rounded-full bg-[var(--bg-highlight)]',
            'border border-[var(--border-default)] transition-colors',
            'focus-within:border-[var(--accent-blue)] focus-within:ring-2 focus-within:ring-[var(--accent-blue)]/20',
          )}
        >
          <span class="flex-shrink-0 text-[var(--text-muted)]">{local.icon}</span>
          <KobalteTextField.Input
            placeholder={local.placeholder}
            onKeyDown={local.onKeyDown}
            class={cn(
              'flex-1 bg-transparent text-[var(--text-primary)] text-base',
              'placeholder:text-[var(--text-muted)] outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              local.inputClass
            )}
          />
        </div>
      </Show>

      {local.description && (
        <KobalteTextField.Description class="text-base text-[var(--text-secondary)]">
          {local.description}
        </KobalteTextField.Description>
      )}

      {local.errorMessage && (
        <KobalteTextField.ErrorMessage class="text-base text-[var(--accent-coral)]">
          {local.errorMessage}
        </KobalteTextField.ErrorMessage>
      )}
    </KobalteTextField>
  )
}

export interface TextAreaProps extends Omit<TextFieldProps, 'inputClass'> {
  /** Additional class for textarea element */
  textAreaClass?: string
  /** Auto-resize textarea to fit content */
  autoResize?: boolean
  /** Submit form on Enter key */
  submitOnEnter?: boolean
  /** KeyDown event handler */
  onKeyDown?: (e: KeyboardEvent) => void
}

/**
 * TextArea - Multiline text input component
 */
export const TextArea: Component<TextAreaProps> = (props) => {
  const [local, others] = splitProps(props, [
    'class',
    'textAreaClass',
    'label',
    'description',
    'errorMessage',
    'validationState',
    'autoResize',
    'submitOnEnter',
    'onKeyDown',
    'placeholder',
  ])

  return (
    <KobalteTextField
      class={cn('flex flex-col gap-2', local.class)}
      validationState={local.validationState}
      {...others}
    >
      {local.label && (
        <KobalteTextField.Label class="text-base font-medium text-[var(--text-primary)]">
          {local.label}
        </KobalteTextField.Label>
      )}

      <KobalteTextField.TextArea
        placeholder={local.placeholder}
        autoResize={local.autoResize}
        submitOnEnter={local.submitOnEnter}
        onKeyDown={local.onKeyDown}
        class={cn(
          'px-4 py-2.5 rounded-2xl bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base',
          'placeholder:text-[var(--text-muted)] outline-none',
          'border border-transparent',
          'focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20',
          'transition-colors resize-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'data-[invalid]:border-[var(--accent-coral)] data-[invalid]:focus:ring-[var(--accent-coral)]/20',
          local.textAreaClass
        )}
      />

      {local.description && (
        <KobalteTextField.Description class="text-base text-[var(--text-secondary)]">
          {local.description}
        </KobalteTextField.Description>
      )}

      {local.errorMessage && (
        <KobalteTextField.ErrorMessage class="text-base text-[var(--accent-coral)]">
          {local.errorMessage}
        </KobalteTextField.ErrorMessage>
      )}
    </KobalteTextField>
  )
}
