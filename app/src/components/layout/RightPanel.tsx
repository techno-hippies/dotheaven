import type { Component, JSX } from 'solid-js'
import { cn } from '@/lib/utils'

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
        'w-[320px] h-full bg-[var(--bg-surface)] rounded-tl-xl rounded-bl-xl flex flex-col overflow-hidden',
        props.class
      )}
    >
      {props.children}
    </aside>
  )
}
