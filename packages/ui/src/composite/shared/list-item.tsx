import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../../lib/utils'

export interface ListItemProps {
  class?: string
  title: string
  subtitle?: string
  cover?: JSX.Element
  trailing?: JSX.Element
  onClick?: () => void
  onTitleClick?: () => void
  onCoverClick?: () => void
  active?: boolean
}

/**
 * Reusable list item for sidebar - playlists, chat items, etc.
 * Matches Component/Sidebar Item from Pencil design.
 */
export const ListItem: Component<ListItemProps> = (props) => {
  return (
    <button
      type="button"
      class={cn(
        'flex items-center gap-3 py-2.5 -mx-3 text-left cursor-pointer rounded-md',
        'hover:bg-[var(--bg-highlight-hover)] transition-colors',
        props.active && 'bg-[var(--bg-highlight)]',
        props.class
      )}
      onClick={props.onClick}
    >
      {/* Cover / Icon slot */}
      <Show
        when={props.onCoverClick}
        fallback={<div class="ml-3">{props.cover}</div>}
      >
        <div
          class="cursor-pointer ml-3"
          onClick={(e) => {
            e.stopPropagation()
            props.onCoverClick?.()
          }}
        >
          {props.cover}
        </div>
      </Show>

      {/* Text info */}
      <div class={cn(
        'flex flex-col gap-0.5 flex-1 min-w-0 overflow-hidden',
        !props.trailing && 'mr-3'
      )}>
        <Show
          when={props.onTitleClick}
          fallback={
            <span class="text-base font-medium text-[var(--text-primary)] truncate">
              {props.title}
            </span>
          }
        >
          <span
            class="text-base font-medium text-[var(--text-primary)] truncate hover:underline cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              props.onTitleClick?.()
            }}
          >
            {props.title}
          </span>
        </Show>
        <Show when={props.subtitle}>
          <span class="text-base text-[var(--text-secondary)] truncate">
            {props.subtitle}
          </span>
        </Show>
      </div>

      {/* Trailing slot */}
      <Show when={props.trailing}>
        <div class="mr-3">{props.trailing}</div>
      </Show>
    </button>
  )
}
