import type { Component, JSX } from 'solid-js'
import { cn } from '../lib/classnames'

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
        'w-[380px] h-full bg-[var(--bg-surface)] flex flex-col overflow-hidden',
        props.class
      )}
    >
      {props.children}
    </aside>
  )
}
