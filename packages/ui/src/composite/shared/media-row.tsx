import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { cn } from '../../lib/utils'

export interface MediaRowProps {
  title: string
  subtitle?: string
  cover?: JSX.Element
  trailing?: JSX.Element
  onClick?: () => void
  active?: boolean
  class?: string
}

/**
 * Reusable media row for content lists — playlists, scrobbles, sessions, etc.
 * Renders as <button> when clickable, <div> when not.
 */
export const MediaRow: Component<MediaRowProps> = (props) => {
  const Tag = () => props.onClick ? 'button' : 'div'

  return (
    <Dynamic
      component={Tag()}
      type={props.onClick ? 'button' : undefined}
      class={cn(
        'flex items-center gap-3 px-4 py-3 rounded-md text-left w-full',
        props.onClick && 'cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors',
        props.active && 'bg-[var(--bg-highlight)]',
        props.class
      )}
      onClick={props.onClick}
    >
      <Show when={props.cover}>
        <div class="flex-shrink-0">{props.cover}</div>
      </Show>

      <div class="flex flex-col gap-0.5 flex-1 min-w-0">
        <span class="text-base font-medium text-[var(--text-primary)] truncate">
          {props.title}
        </span>
        <Show when={props.subtitle}>
          <span class="text-base text-[var(--text-secondary)] truncate">
            {props.subtitle}
          </span>
        </Show>
      </div>

      <Show when={props.trailing}>
        <div class="flex-shrink-0">{props.trailing}</div>
      </Show>
    </Dynamic>
  )
}
