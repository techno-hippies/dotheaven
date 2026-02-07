import { For, Show, type Component, createMemo } from 'solid-js'
import { cn } from '../../lib/classnames'
import type { TimeSlot } from './types'

// =============================================================================
// Types
// =============================================================================

export interface TimeSlotListProps {
  /** Available time slots for the selected day */
  slots: TimeSlot[]
  /** Currently selected time slot */
  selectedSlot: TimeSlot | null
  /** Callback when a time slot is selected */
  onSelect: (slot: TimeSlot | null) => void
  /** Selected date for display */
  selectedDate: string
  /** Optional CSS class */
  class?: string
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format time from HH:mm to 12h format without AM/PM (for time slots)
 */
function formatTimeShort(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const period = hours >= 12 ? 'pm' : 'am'
  const displayHours = hours % 12 || 12
  const mins = minutes.toString().padStart(2, '0')
  return `${displayHours}:${mins}${period}`
}

// =============================================================================
// Component
// =============================================================================

/**
 * TimeSlotList - Display available time slots for selected day as a vertical list
 */
export const TimeSlotList: Component<TimeSlotListProps> = (props) => {
  const availableSlots = createMemo(() => {
    return props.slots.filter(s => !s.isBooked)
  })

  return (
    <div class={cn('space-y-6', props.class)}>
      <h2 class="text-xl font-semibold text-[var(--text-primary)]">
        {new Date(props.selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        })}
      </h2>

      <Show
        when={availableSlots().length > 0}
        fallback={
          <div class="text-center py-8">
            <p class="text-base text-[var(--text-muted)]">No available times</p>
          </div>
        }
      >
        <div class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          <For each={availableSlots()}>
            {(slot) => {
              const isSelected = props.selectedSlot?.startTime === slot.startTime &&
                               props.selectedSlot?.endTime === slot.endTime

              return (
                <button
                  type="button"
                  onClick={() => props.onSelect(slot)}
                  class={cn(
                    'w-full py-3 px-4 rounded-lg text-base font-medium transition-all text-center border cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]',
                    isSelected
                      ? 'bg-[var(--accent-blue)] border-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]'
                      : 'bg-[var(--bg-elevated)] border-[var(--bg-highlight)] text-[var(--text-primary)] hover:border-[var(--accent-blue)] hover:bg-[var(--bg-highlight)]'
                  )}
                >
                  {formatTimeShort(slot.startTime)}
                </button>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
