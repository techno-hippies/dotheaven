import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../lib/utils'

export interface PageHeaderProps {
  /** Page title */
  title: string
  /** Optional left slot (e.g., avatar, back button) */
  leftSlot?: JSX.Element
  /** Optional right slot (e.g., action buttons, icons) */
  rightSlot?: JSX.Element
  /** Additional class names */
  class?: string
}

/**
 * PageHeader - Consistent page header component with title and optional slots
 *
 * Usage:
 * - Community: title="Community", leftSlot=avatar, rightSlot=search
 * - Messages: title="Messages", rightSlot=new chat button
 * - Wallet: title="Wallet", rightSlot=settings icon
 *
 * Design:
 * - Border bottom for visual separation
 * - Responsive title scaling (xl on mobile, 2xl on desktop)
 * - Flexible slot-based layout
 */
export const PageHeader: Component<PageHeaderProps> = (props) => {
  return (
    <header
      class={cn(
        'flex items-center justify-between px-4 md:px-6 py-4 border-b border-[var(--bg-highlight)]',
        props.class
      )}
    >
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <Show when={props.leftSlot}>
          <div class="flex-shrink-0">{props.leftSlot}</div>
        </Show>
        <h1 class="text-xl md:text-2xl font-bold text-[var(--text-primary)] truncate">
          {props.title}
        </h1>
      </div>
      <Show when={props.rightSlot}>
        <div class="flex items-center gap-2 flex-shrink-0">
          {props.rightSlot}
        </div>
      </Show>
    </header>
  )
}
