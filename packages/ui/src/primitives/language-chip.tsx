import type { Component } from 'solid-js'
import { cn } from '../lib/utils'
import { proficiencyLabel } from '../data/languages'

export interface LanguageChipProps {
  class?: string
  /** Language name (e.g. "English") */
  language: string
  /** CEFR proficiency level (1-7) */
  proficiency: number
  /** Size variant */
  size?: 'sm' | 'md'
}

/**
 * LanguageChip - Display a language with proficiency level.
 *
 * Shows: "English · Native" or "Spanish · B1"
 */
export const LanguageChip: Component<LanguageChipProps> = (props) => {
  const label = () => proficiencyLabel(props.proficiency)

  return (
    <div
      class={cn(
        'inline-flex items-center px-2 py-1 rounded-md',
        'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
        props.size === 'sm' ? 'text-xs' : 'text-sm',
        props.class,
      )}
    >
      {/* Language · Level */}
      <span class="font-medium whitespace-nowrap">
        {props.language} · {label()}
      </span>
    </div>
  )
}
