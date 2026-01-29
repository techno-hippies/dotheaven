// =============================================================================
// Types
// =============================================================================

export interface TimeSlot {
  /** Start time in HH:mm format (24h) */
  startTime: string
  /** End time in HH:mm format (24h) */
  endTime: string
  /** Whether this slot is already booked */
  isBooked: boolean
  /** Optional booking info (student name, etc) */
  bookedBy?: string
}

export interface DayAvailability {
  /** Date in YYYY-MM-DD format */
  date: string
  /** Available time slots for this day */
  slots: TimeSlot[]
}

export interface SchedulerProps {
  /** Teacher's available time slots grouped by day */
  availability: DayAvailability[]
  /** Currently selected date (YYYY-MM-DD) */
  selectedDate?: string
  /** Currently selected time slot */
  selectedSlot?: TimeSlot | null
  /** Callback when a date is selected */
  onDateSelect?: (date: string) => void
  /** Callback when a time slot is selected */
  onSlotSelect?: (slot: TimeSlot | null) => void
  /** Callback when booking is confirmed */
  onBook?: (date: string, slot: TimeSlot) => void
  /** Optional CSS class */
  class?: string
  /** Loading state for booking action */
  isBooking?: boolean
  /** Teacher's timezone display */
  teacherTimezone?: string
  /** Student's timezone display */
  studentTimezone?: string
  /** Minimum date selectable (defaults to today) */
  minDate?: string
  /** Maximum date selectable (defaults to 30 days from now) */
  maxDate?: string
  /** Available timezones for selection */
  availableTimezones?: string[]
  /** Callback when timezone is changed */
  onTimezoneChange?: (timezone: string) => void
}
