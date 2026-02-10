import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../../lib/classnames'

export interface PageHeaderProps {
  /** Page title */
  title: string | JSX.Element
  /** Optional left slot (e.g., avatar, back button) */
  leftSlot?: JSX.Element
  /** Optional right slot (e.g., action buttons, icons) */
  rightSlot?: JSX.Element
  /** Compact sub-page style: h-14, smaller title, bg-surface */
  compact?: boolean
  /** Additional class names */
  class?: string
}

/**
 * PageHeader - Consistent page header component with title and optional slots.
 *
 * Two variants:
 * - **Default**: Top-level pages (Messages, Settings, Music). Larger title, py-4.
 * - **Compact** (`compact`): Sub-pages (Post, Library, FollowList). Fixed h-14, smaller title, bg-surface.
 */
export const PageHeader: Component<PageHeaderProps> = (props) => {
  return (
    <header
      class={cn(
        'flex items-center border-b border-[var(--border-subtle)] flex-shrink-0',
        props.compact
          ? 'gap-3 px-4 h-14 bg-[var(--bg-surface)]'
          : 'justify-between px-4 h-16',
        props.class
      )}
    >
      <Show when={props.leftSlot}>
        <div class="flex-shrink-0">{props.leftSlot}</div>
      </Show>
      <Show when={props.compact}>
        <span class="text-base font-semibold text-[var(--text-primary)] truncate flex-1 min-w-0">
          {props.title}
        </span>
      </Show>
      <Show when={!props.compact}>
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <h1 class="text-xl md:text-2xl font-bold text-[var(--text-primary)] truncate">
            {props.title}
          </h1>
        </div>
      </Show>
      <Show when={props.rightSlot}>
        <div class="flex items-center gap-2 flex-shrink-0">
          {props.rightSlot}
        </div>
      </Show>
    </header>
  )
}
