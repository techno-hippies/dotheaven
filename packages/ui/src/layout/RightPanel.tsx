import type { Component, JSX } from 'solid-js'
import { cn } from '../lib/utils'

export interface RightPanelProps {
  class?: string
  children: JSX.Element
}

/**
 * Right sidebar panel - typically used for "Now Playing" or contextual info.
 */
export const RightPanel: Component<RightPanelProps> = (props) => {
  return (
    <aside
      class={cn(
        'w-[380px] h-full border-l border-[var(--border-subtle)] flex flex-col overflow-hidden',
        props.class
      )}
    >
      {props.children}
    </aside>
  )
}
