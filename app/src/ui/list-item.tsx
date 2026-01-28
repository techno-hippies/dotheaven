import type { Component, JSX } from 'solid-js'
import { cn } from '@/lib/utils'

export interface ListItemProps {
  class?: string
  title: string
  subtitle?: string
  cover?: JSX.Element
  onClick?: () => void
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
        'flex items-center gap-3 w-full p-2.5 px-3 rounded-sm text-left cursor-pointer',
        'hover:bg-[var(--bg-highlight)] transition-colors',
        props.active && 'bg-[var(--bg-highlight)]',
        props.class
      )}
      onClick={props.onClick}
    >
      {/* Cover / Icon slot */}
      {props.cover}

      {/* Text info */}
      <div class="flex flex-col gap-0.5 flex-1 min-w-0">
        <span class="text-base font-medium text-[var(--text-primary)] truncate">
          {props.title}
        </span>
        {props.subtitle && (
          <span class="text-base text-[var(--text-secondary)] truncate">
            {props.subtitle}
          </span>
        )}
      </div>
    </button>
  )
}
