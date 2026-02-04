import type { Component } from 'solid-js'
import { cn } from '../lib/utils'

export interface FlagIconProps {
  /** ISO 3166-1 alpha-2 country code (e.g. "US", "GB", "JP") */
  code: string
  class?: string
}

/**
 * FlagIcon - Renders a circular country flag from the circle-flags set.
 * Flags are 512x512 circular SVGs served from /flags/{CODE}.svg.
 *
 * Set dimensions via class (e.g. `class="w-5 h-5"`).
 */
export const FlagIcon: Component<FlagIconProps> = (props) => {
  return (
    <img
      src={`/flags/${props.code.toUpperCase()}.svg`}
      alt={props.code.toUpperCase()}
      class={cn('inline-block rounded-full', props.class)}
      loading="lazy"
    />
  )
}
