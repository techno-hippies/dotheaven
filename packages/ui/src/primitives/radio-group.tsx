import type { Component } from 'solid-js'
import { For, splitProps } from 'solid-js'
import { RadioGroup as KRadioGroup } from '@kobalte/core/radio-group'
import { cn } from '../lib/classnames'

export interface RadioGroupOption {
  value: string
  label: string
  description?: string
}

export interface RadioGroupProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  class?: string
  label?: string
  description?: string
  orientation?: 'horizontal' | 'vertical'
  options: RadioGroupOption[]
}

export const RadioGroup: Component<RadioGroupProps> = (props) => {
  const [local, rest] = splitProps(props, [
    'value', 'defaultValue', 'onChange', 'disabled', 'class',
    'label', 'description', 'orientation', 'options',
  ])

  return (
    <KRadioGroup
      value={local.value}
      defaultValue={local.defaultValue}
      onChange={local.onChange}
      disabled={local.disabled}
      orientation={local.orientation ?? 'vertical'}
      class={cn('flex flex-col gap-3', local.class)}
      {...rest}
    >
      {local.label && (
        <KRadioGroup.Label class="text-base font-medium text-[var(--text-primary)]">
          {local.label}
        </KRadioGroup.Label>
      )}
      <div
        role="presentation"
        class={cn(
          'flex gap-3',
          (local.orientation ?? 'vertical') === 'vertical' ? 'flex-col' : 'flex-row',
        )}
      >
        <For each={local.options}>
          {(option) => (
            <KRadioGroup.Item
              value={option.value}
              class="group flex items-center gap-3 cursor-pointer select-none rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-[var(--bg-highlight)]"
            >
              <KRadioGroup.ItemInput class="sr-only" />
              <KRadioGroup.ItemControl
                class={cn(
                  'flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors',
                  'border-[var(--border-default)] bg-transparent',
                  'group-data-[checked]:border-[var(--accent-blue)]',
                  'group-data-[disabled]:opacity-50 group-data-[disabled]:cursor-not-allowed',
                )}
              >
                <KRadioGroup.ItemIndicator
                  class={cn(
                    'w-2.5 h-2.5 rounded-full',
                    'bg-[var(--accent-blue)]',
                  )}
                />
              </KRadioGroup.ItemControl>
              <div class="flex flex-col gap-0.5">
                <KRadioGroup.ItemLabel class="text-base text-[var(--text-primary)] leading-tight">
                  {option.label}
                </KRadioGroup.ItemLabel>
                {option.description && (
                  <KRadioGroup.ItemDescription class="text-sm text-[var(--text-muted)]">
                    {option.description}
                  </KRadioGroup.ItemDescription>
                )}
              </div>
            </KRadioGroup.Item>
          )}
        </For>
      </div>
      {local.description && (
        <KRadioGroup.Description class="text-sm text-[var(--text-muted)]">
          {local.description}
        </KRadioGroup.Description>
      )}
    </KRadioGroup>
  )
}
