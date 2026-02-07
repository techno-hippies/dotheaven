import type { Component, JSX } from 'solid-js'
import { splitProps } from 'solid-js'
import { Checkbox as KCheckbox } from '@kobalte/core/checkbox'
import { cn } from '../lib/classnames'

export interface CheckboxProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  class?: string
  label?: string
  description?: string
  children?: JSX.Element
}

const CheckIcon: Component = () => (
  <svg class="w-3 h-3" viewBox="0 0 256 256" fill="currentColor">
    <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
  </svg>
)

export const Checkbox: Component<CheckboxProps> = (props) => {
  const [local, rest] = splitProps(props, ['checked', 'defaultChecked', 'onChange', 'disabled', 'class', 'label', 'description', 'children'])

  return (
    <KCheckbox
      checked={local.checked}
      defaultChecked={local.defaultChecked}
      onChange={local.onChange}
      disabled={local.disabled}
      class={cn('group flex items-center gap-3 cursor-pointer select-none', local.class)}
      {...rest}
    >
      <KCheckbox.Input class="sr-only" />
      <KCheckbox.Control
        class={cn(
          'flex items-center justify-center w-5 h-5 rounded-sm border-2 transition-colors',
          'border-[var(--bg-highlight)] bg-[var(--bg-elevated)]',
          'group-data-[checked]:bg-[var(--accent-blue)] group-data-[checked]:border-[var(--accent-blue)]',
          'group-data-[disabled]:opacity-50 group-data-[disabled]:cursor-not-allowed',
        )}
      >
        <KCheckbox.Indicator class="text-white">
          <CheckIcon />
        </KCheckbox.Indicator>
      </KCheckbox.Control>
      <div class="flex flex-col gap-0.5">
        {local.label && (
          <KCheckbox.Label class="text-sm text-[var(--text-primary)] leading-tight">
            {local.label}
          </KCheckbox.Label>
        )}
        {local.description && (
          <KCheckbox.Description class="text-xs text-[var(--text-muted)]">
            {local.description}
          </KCheckbox.Description>
        )}
        {local.children}
      </div>
    </KCheckbox>
  )
}
