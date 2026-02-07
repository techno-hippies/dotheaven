import { For, Show, type Component, createMemo } from 'solid-js'
import Calendar from '@corvu/calendar'
import { cn } from '../../lib/classnames'
import { IconButton } from '../../primitives/icon-button'
import type { DayAvailability } from './types'

// =============================================================================
// Types
// =============================================================================

export interface CalendarProps {
  /** Current month being displayed */
  currentMonth: Date
  /** Teacher's available time slots grouped by day */
  availability: DayAvailability[]
  /** Currently selected date (YYYY-MM-DD) */
  selectedDate: string
  /** Callback when a date is selected */
  onSelect: (date: string) => void
  /** Callback when month changes */
  onMonthChange: (date: Date) => void
  /** Minimum date selectable (defaults to today) */
  minDate?: string
  /** Maximum date selectable (defaults to 30 days from now) */
  maxDate?: string
  /** Optional CSS class */
  class?: string
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a date has available (unbooked) slots
 */
function hasAvailableSlots(date: Date, availability: DayAvailability[]): boolean {
  const dateStr = date.toISOString().split('T')[0]
  return availability.some(a => a.date === dateStr && a.slots.some(s => !s.isBooked))
}

/**
 * Check if a date has any slots (booked or not)
 */
function hasAnySlots(date: Date, availability: DayAvailability[]): boolean {
  const dateStr = date.toISOString().split('T')[0]
  return availability.some(a => a.date === dateStr)
}

/**
 * Check if date is disabled based on min/max constraints
 */
function isDateDisabled(date: Date, minDate?: string, maxDate?: string): boolean {
  const dateStr = date.toISOString().split('T')[0]
  if (minDate && dateStr < minDate) return true
  if (maxDate && dateStr > maxDate) return true
  return false
}


// =============================================================================
// Component
// =============================================================================

/**
 * Calendar - Accessible month view calendar with date selection
 * Built on @corvu/calendar for accessibility and keyboard navigation
 */
export const SchedulerCalendar: Component<CalendarProps> = (props) => {
  // Convert selected date string to Date object
  const selectedDateValue = createMemo(() => {
    return props.selectedDate ? new Date(props.selectedDate + 'T00:00:00') : null
  })

  // Disabled callback for Corvu
  const isDisabled = (date: Date) => {
    const disabled = isDateDisabled(date, props.minDate, props.maxDate)
    const hasSlots = hasAnySlots(date, props.availability)
    return disabled || !hasSlots
  }

  return (
    <div class={cn('space-y-4', props.class)}>
      <Calendar
        mode="single"
        value={selectedDateValue()}
        onValueChange={(date) => {
          if (date) {
            props.onSelect(date.toISOString().split('T')[0])
          }
        }}
        month={props.currentMonth}
        onMonthChange={props.onMonthChange}
        disabled={isDisabled}
        startOfWeek={1} // Monday
      >
        {(calendar) => (
          <>
            {/* Month Header with Navigation */}
            <div class="flex items-center justify-between mb-4">
              <Calendar.Nav action="prev-month" aria-label="Go to previous month">
                <IconButton
                  variant="soft"
                  size="md"
                  aria-label="Go to previous month"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </IconButton>
              </Calendar.Nav>

              <Calendar.Label class="text-lg font-semibold text-[var(--text-primary)]">
                {calendar.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Calendar.Label>

              <Calendar.Nav action="next-month" aria-label="Go to next month">
                <IconButton
                  variant="soft"
                  size="md"
                  aria-label="Go to next month"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </IconButton>
              </Calendar.Nav>
            </div>

            {/* Calendar Table */}
            <Calendar.Table class="w-full border-collapse table-fixed">
              <thead>
                <tr>
                  <For each={calendar.weekdays}>
                    {(weekday) => (
                      <Calendar.HeadCell class="text-center text-xs font-medium text-[var(--text-muted)] py-2 w-[14.28%]">
                        {weekday.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                      </Calendar.HeadCell>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={calendar.weeks}>
                  {(week) => (
                    <tr>
                      <For each={week}>
                        {(day) => {
                          const available = hasAvailableSlots(day, props.availability)
                          const disabled = isDisabled(day)
                          const isSelected = calendar.value?.toDateString() === day.toDateString()

                          return (
                            <Calendar.Cell class="p-1">
                              <Calendar.CellTrigger
                                day={day}
                                class={cn(
                                  'w-full aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-all',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]',
                                  isSelected
                                    ? 'bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]'
                                    : available
                                      ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/20'
                                      : disabled
                                        ? 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
                                        : 'text-[var(--text-muted)] opacity-50'
                                )}
                              >
                                <span>{day.getDate()}</span>
                                <Show when={available && !isSelected}>
                                  <span class="w-1 h-1 rounded-full bg-[var(--accent-blue)] mt-0.5" />
                                </Show>
                              </Calendar.CellTrigger>
                            </Calendar.Cell>
                          )
                        }}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </Calendar.Table>
          </>
        )}
      </Calendar>
    </div>
  )
}
