import { Show, type Component, createSignal, createMemo } from 'solid-js'
import { cn } from '../../lib/utils'
import { SchedulerCalendar } from './Calendar'
import { TimeSlotList } from './TimeSlotList'
import { TimezoneSelector } from './TimezoneSelector'
import { BookingConfirmation } from './BookingConfirmation'
import type { SchedulerProps } from './types'

// =============================================================================
// Main Scheduler Component
// =============================================================================

/**
 * Scheduler - Complete scheduling interface with calendar, time slots, and booking
 *
 * Features:
 * - Accessible calendar with keyboard navigation (via @corvu/calendar)
 * - Time slot selection
 * - Timezone handling
 * - Booking confirmation flow
 */
export const Scheduler: Component<SchedulerProps> = (props) => {
  const [currentMonth, setCurrentMonth] = createSignal(new Date())
  const [selectedTimezone, setSelectedTimezone] = createSignal(
    props.studentTimezone || props.teacherTimezone || 'UTC'
  )

  // Set initial selected date if not provided
  const selectedDate = () => props.selectedDate || ''

  // Get availability for selected date
  const selectedDayAvailability = createMemo(() => {
    return props.availability.find(a => a.date === selectedDate())
  })

  return (
    <div class={cn('w-full max-w-[900px] flex-shrink-0 space-y-4', props.class)}>
      {/* Calendar + Time Slots Side by Side */}
      <div class="flex gap-4">
        {/* Calendar Panel */}
        <div class="bg-[var(--bg-surface)] rounded-md p-6 flex-1">
          <SchedulerCalendar
            currentMonth={currentMonth()}
            availability={props.availability}
            selectedDate={selectedDate()}
            onSelect={(date) => {
              props.onDateSelect?.(date)
              props.onSlotSelect?.(null) // Reset slot selection when changing date
            }}
            onMonthChange={setCurrentMonth}
            minDate={props.minDate}
            maxDate={props.maxDate}
          />
        </div>

        {/* Time Slots Panel */}
        <div class="bg-[var(--bg-surface)] rounded-md p-6 flex-1">
          <Show
            when={selectedDate() && selectedDayAvailability()}
            fallback={
              <div class="text-center text-[var(--text-muted)] py-8">
                <p class="text-base">
                  Select a date to view available times
                </p>
              </div>
            }
          >
            {(dayAvailability) => {
              const day = dayAvailability()
              if (!day) return null
              return (
                <TimeSlotList
                  slots={day.slots}
                  selectedSlot={props.selectedSlot || null}
                  onSelect={(slot) => props.onSlotSelect?.(slot)}
                  selectedDate={selectedDate()}
                />
              )
            }}
          </Show>
        </div>
      </div>

      {/* Timezone Panel (if needed) */}
      <Show when={props.availableTimezones && props.onTimezoneChange}>
        <div class="bg-[var(--bg-surface)] rounded-md p-6">
          <TimezoneSelector
            timezone={selectedTimezone()}
            availableTimezones={props.availableTimezones}
            onChange={(tz) => {
              setSelectedTimezone(tz)
              props.onTimezoneChange?.(tz)
            }}
          />
        </div>
      </Show>

      {/* Booking Confirmation Panel */}
      <Show when={props.selectedSlot && selectedDate() && props.selectedSlot}>
        <div class="bg-[var(--bg-surface)] rounded-md p-6">
          <BookingConfirmation
            date={selectedDate()}
            slot={props.selectedSlot!}
            teacherTimezone={props.teacherTimezone}
            studentTimezone={selectedTimezone()}
            isBooking={props.isBooking}
            onBook={() => props.onBook?.(selectedDate(), props.selectedSlot!)}
            onCancel={() => props.onSlotSelect?.(null)}
          />
        </div>
      </Show>
    </div>
  )
}
