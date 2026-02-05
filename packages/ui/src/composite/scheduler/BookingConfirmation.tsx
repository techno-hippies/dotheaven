import { Show, type Component } from 'solid-js'
import { cn } from '../../lib/utils'
import { Button } from '../../primitives/button'
import type { TimeSlot } from './types'

// =============================================================================
// Types
// =============================================================================

export interface BookingConfirmationProps {
  /** Selected date (YYYY-MM-DD) */
  date: string
  /** Selected time slot */
  slot: TimeSlot
  /** Teacher's timezone display */
  teacherTimezone?: string
  /** Student's timezone display */
  studentTimezone?: string
  /** Loading state for booking action */
  isBooking?: boolean
  /** Callback when booking is confirmed */
  onBook: () => void
  /** Callback when user wants to change selection */
  onCancel: () => void
  /** Optional CSS class */
  class?: string
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format time from HH:mm to 12h format with AM/PM
 */
function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

// =============================================================================
// Component
// =============================================================================

/**
 * BookingConfirmation - Show selected slot details and confirm button
 */
export const BookingConfirmation: Component<BookingConfirmationProps> = (props) => {
  return (
    <div class={cn('space-y-6', props.class)}>
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold text-[var(--text-primary)]">Confirm Booking</h2>
        <Button
          onClick={props.onCancel}
          variant="ghost"
          size="sm"
        >
          Change
        </Button>
      </div>

      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <span class="text-base text-[var(--text-secondary)]">Date</span>
          <span class="text-base text-[var(--text-primary)] text-right">
            {new Date(props.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-base text-[var(--text-secondary)]">Time</span>
          <span class="text-base text-[var(--text-primary)] text-right">
            {formatTime(props.slot.startTime)} - {formatTime(props.slot.endTime)}
          </span>
        </div>

        <Show when={props.teacherTimezone && props.studentTimezone && props.teacherTimezone !== props.studentTimezone}>
          <div class="flex items-center justify-between">
            <span class="text-base text-[var(--text-secondary)]">Teacher timezone</span>
            <span class="text-base text-[var(--text-primary)] text-right">{props.teacherTimezone}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-base text-[var(--text-secondary)]">Your timezone</span>
            <span class="text-base text-[var(--text-primary)] text-right">{props.studentTimezone}</span>
          </div>
        </Show>
      </div>

      <Button
        onClick={props.onBook}
        variant="default"
        size="md"
        loading={props.isBooking}
        class="w-full bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white"
      >
        {props.isBooking ? 'Booking...' : 'Confirm Booking'}
      </Button>
    </div>
  )
}
