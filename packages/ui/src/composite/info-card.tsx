import type { Component, JSX } from 'solid-js'
import { cn } from '../lib/utils'

export interface InfoCardSectionProps {
  class?: string
  title: string
  children: JSX.Element
}

/**
 * Section container for InfoCard with title and content
 */
export const InfoCardSection: Component<InfoCardSectionProps> = (props) => {
  return (
    <div class={cn('flex flex-col gap-4', props.class)}>
      <h2 class="text-xl font-semibold text-[var(--text-primary)]">
        {props.title}
      </h2>
      <div class="flex flex-col gap-3">
        {props.children}
      </div>
    </div>
  )
}

export interface InfoCardRowProps {
  class?: string
  label: string
  value: string | JSX.Element
}

/**
 * Label-value row for displaying key-value information
 */
export const InfoCardRow: Component<InfoCardRowProps> = (props) => {
  return (
    <div class={cn('flex items-center justify-between', props.class)}>
      <span class="text-base text-[var(--text-secondary)]">
        {props.label}
      </span>
      <span class="text-base text-[var(--text-primary)] text-right">
        {props.value}
      </span>
    </div>
  )
}

export interface InfoCardProps {
  class?: string
  children: JSX.Element
}

/**
 * General-purpose card container for displaying structured information
 * Can be used for profiles, settings, details, etc.
 * Matches the dark card design with rounded corners
 */
export const InfoCard: Component<InfoCardProps> = (props) => {
  return (
    <div class={cn(
      'bg-[var(--bg-surface)] rounded-lg p-6 flex flex-col gap-6',
      props.class
    )}>
      {props.children}
    </div>
  )
}
