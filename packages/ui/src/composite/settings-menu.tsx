import { type Component, type JSX, For, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { cn } from '../lib/classnames'
import { ChevronRight } from '../icons'

export interface SettingsMenuItem {
  /** Unique key for the item */
  key: string
  /** Icon component rendered on the left */
  icon?: Component<{ class?: string }>
  /** Primary label */
  label: string
  /** Optional secondary description below the label */
  description?: string
  /** Optional value/badge shown on the right (before chevron) */
  value?: string
  /** Custom right-side element (overrides value + chevron) */
  right?: JSX.Element
  /** Click handler — if absent, item is non-interactive */
  onClick?: () => void
  /** Apply destructive (red) styling */
  destructive?: boolean
}

export interface SettingsMenuProps {
  class?: string
  /** Section title shown above the list */
  title?: string
  /** Menu items */
  items: SettingsMenuItem[]
}

const SettingsMenuRow: Component<{ item: SettingsMenuItem }> = (props) => {
  const item = props.item
  const isClickable = !!item.onClick

  return (
    <Dynamic
      component={isClickable ? 'button' : 'div'}
      type={isClickable ? 'button' : undefined}
      class={cn(
        'flex items-center gap-3 w-full px-4 py-3 text-left transition-colors',
        isClickable && 'cursor-pointer hover:bg-[var(--bg-highlight-hover)]',
        !isClickable && 'cursor-default',
      )}
      onClick={() => item.onClick?.()}
    >
      {/* Left icon */}
      <Show when={item.icon}>
        <span class={cn(
          'flex-shrink-0',
          item.destructive ? 'text-red-400' : 'text-[var(--text-muted)]',
        )}>
          <Dynamic component={item.icon!} class="w-5 h-5" />
        </span>
      </Show>

      {/* Label + description */}
      <div class="flex-1 min-w-0">
        <div class={cn(
          'text-base font-medium truncate',
          item.destructive ? 'text-red-400' : 'text-[var(--text-primary)]',
        )}>
          {item.label}
        </div>
        <Show when={item.description}>
          <div class="text-sm text-[var(--text-muted)] truncate mt-0.5">
            {item.description}
          </div>
        </Show>
      </div>

      {/* Right side */}
      <Show when={item.right}>
        {item.right}
      </Show>
      <Show when={!item.right && isClickable}>
        <div class="flex items-center gap-2 flex-shrink-0">
          <Show when={item.value}>
            <span class="text-sm text-[var(--text-muted)]">{item.value}</span>
          </Show>
          <ChevronRight class="w-4 h-4 text-[var(--text-muted)]" />
        </div>
      </Show>
    </Dynamic>
  )
}

export const SettingsMenu: Component<SettingsMenuProps> = (props) => {
  return (
    <div class={cn('', props.class)}>
      <Show when={props.title}>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] px-4 mb-2">
          {props.title}
        </h3>
      </Show>
      <div class="rounded-md bg-[var(--bg-surface)] overflow-hidden divide-y divide-[var(--bg-highlight)]">
        <For each={props.items}>
          {(item) => <SettingsMenuRow item={item} />}
        </For>
      </div>
    </div>
  )
}
