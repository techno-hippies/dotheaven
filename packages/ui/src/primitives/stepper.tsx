import type { Component } from 'solid-js'
import { For } from 'solid-js'
import { cn } from '../lib/utils'

export interface StepperProps {
  /** Current step index (0-based) */
  currentStep: number
  /** Total number of steps */
  steps: number
  /** Show step numbers inside dots (default true) */
  showLabels?: boolean
  /** Custom class */
  class?: string
}

/**
 * Stepper - Step indicator pills with connecting lines
 *
 * Shows progress through a multi-step process with numbered dots and connecting lines.
 * Active/completed steps are highlighted in accent blue.
 */
export const Stepper: Component<StepperProps> = (props) => {
  const stepArray = () => Array.from({ length: props.steps }, (_, i) => i)

  return (
    <div class={cn('flex items-center w-full', props.class)}>
      <For each={stepArray()}>
        {(stepIndex) => (
          <>
            <StepDot
              active={stepIndex === props.currentStep}
              completed={stepIndex < props.currentStep}
              label={(stepIndex + 1).toString()}
              showLabel={props.showLabels !== false}
            />
            {/* Don't show line after the last step */}
            {stepIndex < props.steps - 1 && (
              <StepLine active={stepIndex < props.currentStep} />
            )}
          </>
        )}
      </For>
    </div>
  )
}

/** Step indicator dot */
const StepDot: Component<{ active: boolean; completed: boolean; label: string; showLabel?: boolean }> = (props) => {
  const compact = () => props.showLabel === false

  return (
    <div
      class={cn(
        'rounded-full flex items-center justify-center transition-colors',
        compact() ? 'w-2.5 h-2.5' : 'w-6 h-6 text-xs font-medium',
        props.completed || props.active
          ? 'bg-[var(--accent-blue)] text-white'
          : 'bg-[var(--bg-highlight)] text-[var(--text-muted)]',
        props.active && compact() && 'ring-2 ring-[var(--accent-blue)]/30',
      )}
    >
      {!compact() && (
        props.completed ? (
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
            <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
          </svg>
        ) : (
          props.label
        )
      )}
    </div>
  )
}

/** Connector line between step dots */
const StepLine: Component<{ active: boolean }> = (props) => (
  <div class={cn('flex-1 h-0.5 mx-2', props.active ? 'bg-[var(--accent-blue)]' : 'bg-[var(--bg-highlight)]')} />
)
