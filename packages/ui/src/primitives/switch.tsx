import type { Component, JSX } from 'solid-js'
import { splitProps } from 'solid-js'
import { Switch as KSwitch } from '@kobalte/core/switch'
import { cn } from '../lib/classnames'

export interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  class?: string
  label?: string
  description?: string
  children?: JSX.Element
}

export const Switch: Component<SwitchProps> = (props) => {
  const [local, rest] = splitProps(props, ['checked', 'defaultChecked', 'onChange', 'disabled', 'class', 'label', 'description', 'children'])

  return (
    <KSwitch
      checked={local.checked}
      defaultChecked={local.defaultChecked}
      onChange={local.onChange}
      disabled={local.disabled}
      class={cn('group flex items-center gap-3 cursor-pointer select-none', local.class)}
      {...rest}
    >
      <KSwitch.Input class="sr-only" />
      <KSwitch.Control
        class={cn(
          'relative w-10 h-6 rounded-full transition-colors',
          'bg-[var(--bg-highlight)]',
          'group-data-[checked]:bg-[var(--accent-blue)]',
          'group-data-[disabled]:opacity-50 group-data-[disabled]:cursor-not-allowed',
        )}
      >
        <KSwitch.Thumb
          class={cn(
            'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
            'group-data-[checked]:translate-x-4',
          )}
        />
      </KSwitch.Control>
      <div class="flex flex-col gap-0.5">
        {local.label && (
          <KSwitch.Label class="text-sm text-[var(--text-primary)] leading-tight">
            {local.label}
          </KSwitch.Label>
        )}
        {local.description && (
          <KSwitch.Description class="text-xs text-[var(--text-muted)]">
            {local.description}
          </KSwitch.Description>
        )}
        {local.children}
      </div>
    </KSwitch>
  )
}
