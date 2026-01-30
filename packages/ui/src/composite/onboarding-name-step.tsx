import type { Component } from 'solid-js'
import { createSignal, createEffect, Show } from 'solid-js'
import { cn } from '../lib/utils'
import { Button, Spinner } from '../primitives'

export interface OnboardingNameStepProps {
  class?: string
  /** Called when user claims a name. Return false to prevent advancing. */
  onClaim?: (name: string) => Promise<boolean | void> | boolean | void
  /** Called to check availability (simulated in storybook) */
  onCheckAvailability?: (name: string) => Promise<boolean>
  /** Whether the claim is in progress */
  claiming?: boolean
  /** Error message to display (e.g. registration failed) */
  error?: string | null
}

/**
 * OnboardingNameStep - Choose your .heaven name
 *
 * Single unified input field: https:// [name] .heaven
 * Designed to be used inside a dialog/modal (no own header).
 */
export const OnboardingNameStep: Component<OnboardingNameStepProps> = (props) => {
  const [name, setName] = createSignal('')
  const [status, setStatus] = createSignal<'idle' | 'checking' | 'available' | 'taken'>('idle')
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const sanitized = () => name().toLowerCase().replace(/[^a-z0-9-]/g, '')

  const pricingHint = () => {
    const len = sanitized().length
    if (len < 2 || len >= 5) return null
    if (len === 2) return '0.05 ETH/year'
    if (len === 3) return '0.025 ETH/year'
    if (len === 4) return '0.01 ETH/year'
    return null
  }

  createEffect(() => {
    const s = sanitized()
    if (s.length < 2) {
      setStatus('idle')
      return
    }

    setStatus('checking')
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      if (props.onCheckAvailability) {
        const available = await props.onCheckAvailability(s)
        setStatus(available ? 'available' : 'taken')
      } else {
        const taken = ['admin', 'heaven', 'test', 'root'].includes(s)
        setStatus(taken ? 'taken' : 'available')
      }
    }, 400)
  })

  return (
    <div class={cn('flex flex-col gap-6 w-full', props.class)}>
      {/* Name input + status */}
      <div class="flex flex-col gap-3">
        {/* Single unified input container */}
        <div
          class={cn(
            'flex items-center rounded-lg bg-[var(--bg-highlight)]',
            'border-2 transition-all',
            'focus-within:ring-2 focus-within:ring-[var(--accent-blue)]/20',
            status() === 'available' && 'border-green-500/50',
            status() === 'taken' && 'border-[var(--accent-coral)]',
            status() !== 'available' && status() !== 'taken' && 'border-transparent focus-within:border-[var(--accent-blue)]/50',
          )}
        >
          <span class="pl-4 text-lg text-[var(--text-muted)] whitespace-nowrap select-none">
            https://
          </span>
          <input
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="yourname"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            maxLength={32}
            class="flex-1 min-w-0 bg-transparent py-3 text-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <span class="pr-4 text-lg text-[var(--text-muted)] whitespace-nowrap select-none">
            .heaven
          </span>
        </div>

        {/* Status line — fixed height so nothing shifts */}
        <div class="h-6 flex items-center gap-2">
          <Show when={status() === 'checking'}>
            <Spinner size="sm" class="text-[var(--text-muted)]" />
            <span class="text-base text-[var(--text-muted)]">Checking...</span>
          </Show>
          <Show when={status() === 'available'}>
            <svg class="w-3.5 h-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span class="text-base text-green-500">Available</span>
            <Show when={pricingHint()}>
              <span class="text-base text-[var(--text-muted)]">· {pricingHint()}</span>
            </Show>
          </Show>
          <Show when={status() === 'taken'}>
            <svg class="w-3.5 h-3.5 text-[var(--accent-coral)]" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            <span class="text-base text-[var(--accent-coral)]">Taken</span>
          </Show>
        </div>
      </div>

      {/* Error message */}
      <Show when={props.error}>
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent-coral)]/10 text-[var(--accent-coral)] text-sm">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
          </svg>
          <span>{props.error}</span>
        </div>
      </Show>

      {/* Claim button */}
      <Button
        class="w-full h-12 text-lg"
        disabled={status() !== 'available' || props.claiming}
        onClick={() => props.onClaim?.(sanitized())}
        loading={props.claiming}
      >
        {props.claiming ? 'Claiming...' : 'Claim Name'}
      </Button>
    </div>
  )
}
