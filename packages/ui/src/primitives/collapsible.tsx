import { type Component, type JSX, splitProps } from 'solid-js'
import { Collapsible as KCollapsible } from '@kobalte/core/collapsible'
import { cn } from '../lib/classnames'

export interface CollapsibleProps {
  /** Controlled open state */
  open?: boolean
  /** Default open state (uncontrolled) */
  defaultOpen?: boolean
  /** Called when open state changes */
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  class?: string
  children: JSX.Element
}

export const Collapsible: Component<CollapsibleProps> = (props) => {
  const [local] = splitProps(props, [
    'open',
    'defaultOpen',
    'onOpenChange',
    'disabled',
    'class',
    'children',
  ])

  return (
    <KCollapsible
      open={local.open}
      defaultOpen={local.defaultOpen}
      onOpenChange={local.onOpenChange}
      disabled={local.disabled}
      class={cn('bg-[var(--bg-surface)] rounded-md overflow-hidden', local.class)}
    >
      {local.children}
    </KCollapsible>
  )
}

export interface CollapsibleTriggerProps {
  class?: string
  children: JSX.Element
}

export const CollapsibleTrigger: Component<CollapsibleTriggerProps> = (props) => {
  return (
    <KCollapsible.Trigger class={cn('cursor-pointer group bg-[var(--bg-elevated)]', props.class)}>
      {props.children}
    </KCollapsible.Trigger>
  )
}

export interface CollapsibleContentProps {
  class?: string
  children: JSX.Element
}

export const CollapsibleContent: Component<CollapsibleContentProps> = (props) => {
  return (
    <KCollapsible.Content
      class={cn(
        'overflow-hidden data-[expanded]:animate-slideDown data-[closed]:animate-slideUp',
        props.class,
      )}
    >
      {props.children}
    </KCollapsible.Content>
  )
}
