import type { Component, JSX } from 'solid-js'
import { cn } from '../../lib/classnames'

export interface PageHeroProps {
  /** Hero title (large text, bottom-left) */
  title: string
  /** Background content — image, gradient div, or solid color */
  background?: JSX.Element
  /** Background CSS (inline style shorthand for simple gradients/colors) */
  backgroundStyle?: JSX.CSSProperties
  /** Subtitle content (bottom-left, below title) */
  subtitle?: JSX.Element
  /** Action buttons (bottom-right) */
  actions?: JSX.Element
  class?: string
}

/**
 * Full-width hero banner — used on Library, Artist, Album pages.
 * Renders a background layer, gradient overlay, and bottom-aligned content.
 */
export const PageHero: Component<PageHeroProps> = (props) => {
  return (
    <div
      class={cn('relative overflow-hidden h-[280px] md:h-[420px]', props.class)}
      style={props.backgroundStyle}
    >
      {props.background}
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
      <div class="absolute inset-x-0 bottom-0 p-4 md:p-8">
        <h1 class="text-4xl md:text-7xl font-black text-white leading-none tracking-tight">
          {props.title}
        </h1>
        <div class="mt-3 md:mt-4 flex items-end justify-between gap-3 flex-wrap">
          <div class="text-base text-white/95">
            {props.subtitle}
          </div>
          {props.actions}
        </div>
      </div>
    </div>
  )
}
