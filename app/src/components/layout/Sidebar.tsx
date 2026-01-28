import type { Component, JSX } from 'solid-js'
import { cn } from '@/lib/utils'

export interface SidebarProps {
  class?: string
  children: JSX.Element
}

/**
 * Left sidebar container with dark surface background.
 * Contains navigation, chat sections, and playlists.
 */
export const Sidebar: Component<SidebarProps> = (props) => {
  return (
    <aside
      class={cn(
        'w-[340px] h-full bg-[var(--bg-surface)] rounded-tr-xl rounded-br-xl flex flex-col p-3',
        props.class
      )}
    >
      {props.children}
    </aside>
  )
}

export interface SidebarSectionProps {
  class?: string
  children: JSX.Element
  title?: string
  icon?: JSX.Element
  action?: JSX.Element
}

/**
 * A section within the sidebar with optional icon, title and action buttons.
 * Headers are non-interactive labels, not clickable buttons.
 */
export const SidebarSection: Component<SidebarSectionProps> = (props) => {
  return (
    <div class={cn('flex flex-col', props.class)}>
      {(props.title || props.action) && (
        <div class="flex items-center justify-between px-3 py-3">
          <span class="text-[var(--text-secondary)] text-sm font-semibold flex items-center gap-2">
            {props.icon && (
              <span class="w-6 h-6 flex items-center justify-center">
                {props.icon}
              </span>
            )}
            {props.title}
          </span>
          {props.action}
        </div>
      )}
      {props.children}
    </div>
  )
}
