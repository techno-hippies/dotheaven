import { For, type Component } from 'solid-js'
import { cn } from '../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../shared/dropdown-menu'

// =============================================================================
// Types
// =============================================================================

export interface TimezoneSelectorProps {
  /** Current timezone */
  timezone: string
  /** Available timezones for selection */
  availableTimezones?: string[]
  /** Callback when timezone is changed */
  onChange?: (timezone: string) => void
  /** Optional CSS class */
  class?: string
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TIMEZONES = [
  'UTC',
  'America/New_York (EST)',
  'America/Los_Angeles (PST)',
  'Europe/London (GMT)',
  'Europe/Paris (CET)',
  'Asia/Tokyo (JST)',
  'Asia/Shanghai (CST)',
  'Asia/Dubai (GST)',
  'Australia/Sydney (AEDT)',
  'India Standard Time (IST)',
]

// =============================================================================
// Component
// =============================================================================

/**
 * TimezoneSelector - Display and select timezone using DropdownMenu
 */
export const TimezoneSelector: Component<TimezoneSelectorProps> = (props) => {
  const timezones = () => props.availableTimezones || DEFAULT_TIMEZONES

  return (
    <div class={cn('space-y-6', props.class)}>
      <h2 class="text-xl font-semibold text-[var(--text-primary)]">Timezone</h2>
      <div class="flex items-center justify-between">
        <span class="text-base text-[var(--text-secondary)]">Your timezone</span>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button class="flex items-center gap-2 text-base text-[var(--text-primary)] hover:text-[var(--accent-blue)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:ring-offset-2 rounded-lg">
              <span>{props.timezone}</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <For each={timezones()}>
              {(tz) => (
                <DropdownMenuItem onSelect={() => props.onChange?.(tz)}>
                  {tz}
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
