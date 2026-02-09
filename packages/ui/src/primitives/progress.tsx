import { type Component, splitProps } from 'solid-js'
import { Progress as KProgress } from '@kobalte/core/progress'
import { cn } from '../lib/classnames'

export interface ProgressBarProps {
  /** Current value (0–100 by default) */
  value?: number
  minValue?: number
  maxValue?: number
  /** Indeterminate (animated) mode */
  indeterminate?: boolean
  /** Color variant */
  variant?: 'default' | 'success' | 'error'
  /** Custom value label function */
  getValueLabel?: (params: { value: number; min: number; max: number }) => string
  class?: string
  /** Optional label shown above the bar */
  label?: string
  /** Show percentage label */
  showValue?: boolean
}

const trackClass = 'h-1 w-full rounded-full overflow-hidden bg-[var(--bg-highlight)]'

const fillVariants: Record<string, string> = {
  default: 'bg-[oklch(0.65_0.12_240)]',
  success: 'bg-green-500',
  error: 'bg-red-500',
}

export const ProgressBar: Component<ProgressBarProps> = (props) => {
  const [local] = splitProps(props, [
    'value',
    'minValue',
    'maxValue',
    'indeterminate',
    'variant',
    'getValueLabel',
    'class',
    'label',
    'showValue',
  ])

  const variant = () => local.variant ?? 'default'

  return (
    <KProgress
      value={local.value}
      minValue={local.minValue}
      maxValue={local.maxValue}
      indeterminate={local.indeterminate}
      getValueLabel={local.getValueLabel}
      class={cn('w-full', local.class)}
    >
      {(local.label || local.showValue) && (
        <div class="flex items-center justify-between mb-1">
          {local.label && (
            <KProgress.Label class="text-base text-[var(--text-secondary)]">
              {local.label}
            </KProgress.Label>
          )}
          {local.showValue && (
            <KProgress.ValueLabel class="text-base text-[var(--text-muted)] tabular-nums" />
          )}
        </div>
      )}
      <KProgress.Track class={trackClass}>
        <KProgress.Fill
          class={cn(
            'h-full transition-all duration-500',
            fillVariants[variant()],
          )}
          style={{ width: 'var(--kb-progress-fill-width)' }}
        />
      </KProgress.Track>
    </KProgress>
  )
}
