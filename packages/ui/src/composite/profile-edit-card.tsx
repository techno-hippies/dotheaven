import type { Component, JSX } from 'solid-js'
import { cn } from '../lib/utils'

export interface ProfileEditCardProps {
  class?: string
  title: string
  children: JSX.Element
}

/**
 * ProfileEditCard - Editable version of InfoCard for profile editing
 *
 * Features:
 * - Same visual styling as InfoCard
 * - Contains ProfileEditField components
 * - Used in edit mode to replace InfoCard sections
 */
export const ProfileEditCard: Component<ProfileEditCardProps> = (props) => {
  return (
    <div
      class={cn(
        'bg-[var(--bg-surface)] rounded-lg p-6 flex flex-col gap-6',
        props.class
      )}
    >
      <h2 class="text-xl font-semibold text-[var(--text-primary)]">
        {props.title}
      </h2>
      <div class="flex flex-col gap-4">
        {props.children}
      </div>
    </div>
  )
}
