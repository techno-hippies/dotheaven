import type { Component } from 'solid-js'
import { For } from 'solid-js'
import { cn } from '../lib/utils'

export interface StepperProps {
  /** Current step index (0-based) */
  currentStep: number
  /** Total number of steps */
  steps: number
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
    <div class={cn('flex items-center gap-2', props.class)}>
      <For each={stepArray()}>
        {(stepIndex) => (
          <>
            <StepDot
              active={stepIndex === props.currentStep}
              completed={stepIndex < props.currentStep}
              label={(stepIndex + 1).toString()}
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
const StepDot: Component<{ active: boolean; completed: boolean; label: string }> = (props) => (
  <div
    class={cn(
      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
      props.completed || props.active
        ? 'bg-[var(--accent-blue)] text-white'
        : 'bg-[var(--bg-highlight)] text-[var(--text-muted)]'
    )}
  >
    {props.completed ? (
      <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
        <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
      </svg>
    ) : (
      props.label
    )}
  </div>
)

/** Connector line between step dots */
const StepLine: Component<{ active: boolean }> = (props) => (
  <div class={cn('w-8 h-0.5', props.active ? 'bg-[var(--accent-blue)]' : 'bg-[var(--bg-highlight)]')} />
)
