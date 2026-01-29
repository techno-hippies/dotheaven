import { createSignal } from 'solid-js'
import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { SchedulerCalendar } from './Calendar'
import type { DayAvailability, TimeSlot } from './types'

const meta: Meta = {
  title: 'Composite/Scheduler/Calendar',
  component: SchedulerCalendar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj

// =============================================================================
// Mock Data Generators
// =============================================================================

/**
 * Generate mock availability for the current month
 */
function generateMockAvailability(): DayAvailability[] {
  const availability: DayAvailability[] = []
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  // Generate for current month
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentYear, currentMonth, day)
    const dateStr = date.toISOString().split('T')[0]

    // Skip some days to show "no availability" state
    if (day % 7 === 0 || day % 7 === 6) continue // Skip weekends

    const slots: TimeSlot[] = []

    // Morning slots (9 AM - 12 PM)
    for (let hour = 9; hour < 12; hour++) {
      slots.push({
        startTime: `${hour.toString().padStart(2, '0')}:00`,
        endTime: `${hour.toString().padStart(2, '0')}:30`,
        isBooked: day === 16 && hour === 10, // Book one slot on day 16
      })
      slots.push({
        startTime: `${hour.toString().padStart(2, '0')}:30`,
        endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
        isBooked: false,
      })
    }

    // Afternoon slots (2 PM - 6 PM)
    for (let hour = 14; hour < 18; hour++) {
      slots.push({
        startTime: `${hour.toString().padStart(2, '0')}:00`,
        endTime: `${hour.toString().padStart(2, '0')}:30`,
        isBooked: day === 20 && hour === 15, // Book one slot on day 20
      })
      slots.push({
        startTime: `${hour.toString().padStart(2, '0')}:30`,
        endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
        isBooked: false,
      })
    }

    availability.push({
      date: dateStr,
      slots,
    })
  }

  return availability
}

// =============================================================================
// Stories
// =============================================================================

export const Default: Story = {
  render: () => {
    const [currentMonth, setCurrentMonth] = createSignal(new Date())
    const availability = generateMockAvailability()
    const [selectedDate, setSelectedDate] = createSignal<string>(availability[0]?.date || '')

    return (
      <div class="space-y-4">
        <div class="w-[400px] bg-[var(--bg-surface)] rounded-lg p-6">
          <SchedulerCalendar
            currentMonth={currentMonth()}
            availability={availability}
            selectedDate={selectedDate()}
            onSelect={setSelectedDate}
            onMonthChange={setCurrentMonth}
          />
        </div>
        <div class="w-[400px] p-4 bg-[var(--bg-elevated)] rounded-lg">
          <p class="text-sm text-[var(--text-secondary)]">
            Selected date: <span class="font-semibold text-[var(--text-primary)]">{selectedDate() || 'None'}</span>
          </p>
        </div>
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Standalone calendar component with date selection and availability indicators.',
      },
    },
  },
}

export const WithDateRange: Story = {
  render: () => {
    const [currentMonth, setCurrentMonth] = createSignal(new Date())
    const today = new Date()
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const availability = generateMockAvailability()
    const [selectedDate, setSelectedDate] = createSignal<string>(today.toISOString().split('T')[0])

    return (
      <div class="space-y-4">
        <div class="w-[400px] bg-[var(--bg-surface)] rounded-lg p-6">
          <SchedulerCalendar
            currentMonth={currentMonth()}
            availability={availability}
            selectedDate={selectedDate()}
            onSelect={setSelectedDate}
            onMonthChange={setCurrentMonth}
            minDate={today.toISOString().split('T')[0]}
            maxDate={nextWeek.toISOString().split('T')[0]}
          />
        </div>
        <div class="w-[400px] p-4 bg-[var(--bg-elevated)] rounded-lg">
          <p class="text-sm text-[var(--text-secondary)]">
            Selected date: <span class="font-semibold text-[var(--text-primary)]">{selectedDate()}</span>
          </p>
          <p class="text-xs text-[var(--text-muted)] mt-2">
            Date range: {today.toLocaleDateString()} - {nextWeek.toLocaleDateString()}
          </p>
        </div>
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Calendar with date range constraints (today to next week). Dates outside the range are disabled.',
      },
    },
  },
}

export const NoAvailability: Story = {
  render: () => {
    const [currentMonth, setCurrentMonth] = createSignal(new Date())
    const [selectedDate, setSelectedDate] = createSignal<string>('')

    return (
      <div class="w-[400px] bg-[var(--bg-surface)] rounded-lg p-6">
        <SchedulerCalendar
          currentMonth={currentMonth()}
          availability={[]}
          selectedDate={selectedDate()}
          onSelect={setSelectedDate}
          onMonthChange={setCurrentMonth}
        />
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Calendar with no available dates. All dates are disabled.',
      },
    },
  },
}

export const KeyboardNavigation: Story = {
  render: () => {
    const [currentMonth, setCurrentMonth] = createSignal(new Date())
    const availability = generateMockAvailability()
    const [selectedDate, setSelectedDate] = createSignal<string>(availability[0]?.date || '')

    return (
      <div class="space-y-4">
        <div class="w-[400px] bg-[var(--bg-surface)] rounded-lg p-6">
          <SchedulerCalendar
            currentMonth={currentMonth()}
            availability={availability}
            selectedDate={selectedDate()}
            onSelect={setSelectedDate}
            onMonthChange={setCurrentMonth}
          />
        </div>
        <div class="w-[400px] p-4 bg-[var(--bg-elevated)] rounded-lg">
          <p class="text-sm text-[var(--text-secondary)] mb-3">
            Selected date: <span class="font-semibold text-[var(--text-primary)]">{selectedDate() || 'None'}</span>
          </p>
          <h3 class="text-sm font-semibold text-[var(--text-primary)] mb-2">Keyboard Navigation</h3>
          <ul class="text-xs text-[var(--text-secondary)] space-y-1">
            <li><kbd class="px-1 py-0.5 bg-[var(--bg-highlight)] rounded text-[var(--text-primary)]">Arrow Keys</kbd> - Navigate dates</li>
            <li><kbd class="px-1 py-0.5 bg-[var(--bg-highlight)] rounded text-[var(--text-primary)]">Space</kbd> / <kbd class="px-1 py-0.5 bg-[var(--bg-highlight)] rounded text-[var(--text-primary)]">Enter</kbd> - Select date</li>
            <li><kbd class="px-1 py-0.5 bg-[var(--bg-highlight)] rounded text-[var(--text-primary)]">Home</kbd> / <kbd class="px-1 py-0.5 bg-[var(--bg-highlight)] rounded text-[var(--text-primary)]">End</kbd> - First/last day of week</li>
            <li><kbd class="px-1 py-0.5 bg-[var(--bg-highlight)] rounded text-[var(--text-primary)]">Page Up</kbd> / <kbd class="px-1 py-0.5 bg-[var(--bg-highlight)] rounded text-[var(--text-primary)]">Page Down</kbd> - Previous/next month</li>
            <li><kbd class="px-1 py-0.5 bg-[var(--bg-highlight)] rounded text-[var(--text-primary)]">Shift + Page Up/Down</kbd> - Previous/next year</li>
          </ul>
        </div>
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Calendar with full keyboard navigation support via @corvu/calendar. Try using keyboard shortcuts to navigate!',
      },
    },
  },
}
