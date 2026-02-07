import { createSignal } from 'solid-js'
import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Scheduler } from './scheduler'
import type { DayAvailability, TimeSlot } from './types'

const meta: Meta = {
  title: 'Scheduling/Scheduler',
  component: Scheduler,
  parameters: {
    layout: 'padded',
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

/**
 * Generate fully booked day
 */
function generateFullyBookedDay(): DayAvailability[] {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]

  return [{
    date: dateStr,
    slots: [
      { startTime: '09:00', endTime: '09:30', isBooked: true, bookedBy: 'Alice' },
      { startTime: '09:30', endTime: '10:00', isBooked: true, bookedBy: 'Bob' },
      { startTime: '10:00', endTime: '10:30', isBooked: true, bookedBy: 'Charlie' },
      { startTime: '10:30', endTime: '11:00', isBooked: true, bookedBy: 'Diana' },
    ],
  }]
}

/**
 * Generate sparse availability
 */
function generateSparseAvailability(): DayAvailability[] {
  const availability: DayAvailability[] = []
  const today = new Date()

  // Only 2 days with limited slots
  for (const dayOffset of [0, 3]) {
    const date = new Date(today)
    date.setDate(date.getDate() + dayOffset)

    availability.push({
      date: date.toISOString().split('T')[0],
      slots: [
        { startTime: '10:00', endTime: '10:30', isBooked: false },
        { startTime: '14:00', endTime: '14:30', isBooked: false },
        { startTime: '16:00', endTime: '16:30', isBooked: false },
      ],
    })
  }

  return availability
}

// =============================================================================
// Stories
// =============================================================================

export const Default: Story = {
  render: () => {
    const [selectedDate, setSelectedDate] = createSignal<string>('')
    const [selectedSlot, setSelectedSlot] = createSignal<TimeSlot | null>(null)
    const [isBooking, setIsBooking] = createSignal(false)

    const availability = generateMockAvailability()

    return (
      <Scheduler
        availability={availability}
        selectedDate={selectedDate() || availability[0]?.date}
        selectedSlot={selectedSlot()}
        onDateSelect={setSelectedDate}
        onSlotSelect={setSelectedSlot}
        onBook={(date, slot) => {
          setIsBooking(true)
          // Simulate API call
          setTimeout(() => {
            setIsBooking(false)
            setSelectedSlot(null)
            alert(`Booked: ${date} at ${slot.startTime}`)
          }, 1500)
        }}
        isBooking={isBooking()}
        teacherTimezone="America/New_York (EST)"
        studentTimezone="Europe/London (GMT)"
      />
    )
  },
}

export const NoAvailability: Story = {
  render: () => {
    const [selectedDate, setSelectedDate] = createSignal<string>('')

    return (
      <Scheduler
        availability={[]}
        selectedDate={selectedDate() || new Date().toISOString().split('T')[0]}
        onDateSelect={setSelectedDate}
        teacherTimezone="America/New_York (EST)"
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the empty state when no availability is set.',
      },
    },
  },
}

export const FullyBooked: Story = {
  render: () => {
    const [selectedDate, setSelectedDate] = createSignal<string>('')

    return (
      <Scheduler
        availability={generateFullyBookedDay()}
        selectedDate={selectedDate() || generateFullyBookedDay()[0].date}
        onDateSelect={setSelectedDate}
        teacherTimezone="America/New_York (EST)"
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the state when all slots for a day are booked.',
      },
    },
  },
}

export const SparseAvailability: Story = {
  render: () => {
    const [selectedDate, setSelectedDate] = createSignal<string>('')
    const [selectedSlot, setSelectedSlot] = createSignal<TimeSlot | null>(null)

    const availability = generateSparseAvailability()

    return (
      <Scheduler
        availability={availability}
        selectedDate={selectedDate() || availability[0]?.date}
        selectedSlot={selectedSlot()}
        onDateSelect={setSelectedDate}
        onSlotSelect={setSelectedSlot}
        onBook={(date, slot) => {
          alert(`Booked: ${date} at ${slot.startTime}`)
        }}
        teacherTimezone="America/Los_Angeles (PST)"
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows limited availability across different days.',
      },
    },
  },
}

export const SameTimezone: Story = {
  render: () => {
    const [selectedDate, setSelectedDate] = createSignal<string>('')
    const [selectedSlot, setSelectedSlot] = createSignal<TimeSlot | null>(null)

    const availability = generateMockAvailability()

    return (
      <Scheduler
        availability={availability}
        selectedDate={selectedDate() || availability[0]?.date}
        selectedSlot={selectedSlot()}
        onDateSelect={setSelectedDate}
        onSlotSelect={setSelectedSlot}
        onBook={(date, slot) => {
          alert(`Booked: ${date} at ${slot.startTime}`)
        }}
        teacherTimezone="America/New_York (EST)"
        studentTimezone="America/New_York (EST)"
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'When teacher and student are in the same timezone, only one timezone is shown.',
      },
    },
  },
}

export const Interactive: Story = {
  render: () => {
    const [selectedDate, setSelectedDate] = createSignal<string>('')
    const [selectedSlot, setSelectedSlot] = createSignal<TimeSlot | null>(null)
    const [isBooking, setIsBooking] = createSignal(false)
    const [bookedSlots, setBookedSlots] = createSignal<Set<string>>(new Set())

    const baseAvailability = generateMockAvailability()

    // Merge booked slots into availability
    const availability = () => baseAvailability.map(day => ({
      ...day,
      slots: day.slots.map(slot => {
        const slotKey = `${day.date}-${slot.startTime}`
        return {
          ...slot,
          isBooked: slot.isBooked || bookedSlots().has(slotKey),
        }
      }),
    }))

    return (
      <Scheduler
        availability={availability()}
        selectedDate={selectedDate() || availability()[0]?.date}
        selectedSlot={selectedSlot()}
        onDateSelect={setSelectedDate}
        onSlotSelect={setSelectedSlot}
        onBook={(date, slot) => {
          setIsBooking(true)
          setTimeout(() => {
            const slotKey = `${date}-${slot.startTime}`
            setBookedSlots(prev => new Set([...prev, slotKey]))
            setIsBooking(false)
            setSelectedSlot(null)
          }, 1000)
        }}
        isBooking={isBooking()}
        teacherTimezone="America/New_York (EST)"
        studentTimezone="Asia/Tokyo (JST)"
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Fully interactive story where bookings persist during the session.',
      },
    },
  },
}

export const CustomDateRange: Story = {
  render: () => {
    const [selectedDate, setSelectedDate] = createSignal<string>('')
    const [selectedSlot, setSelectedSlot] = createSignal<TimeSlot | null>(null)

    const today = new Date()
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const availability = generateMockAvailability()

    return (
      <Scheduler
        availability={availability}
        selectedDate={selectedDate() || availability[0]?.date}
        selectedSlot={selectedSlot()}
        onDateSelect={setSelectedDate}
        onSlotSelect={setSelectedSlot}
        onBook={(date, slot) => {
          alert(`Booked: ${date} at ${slot.startTime}`)
        }}
        teacherTimezone="America/New_York (EST)"
        minDate={today.toISOString().split('T')[0]}
        maxDate={nextWeek.toISOString().split('T')[0]}
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows scheduler with a custom date range (today to next week).',
      },
    },
  },
}

export const WithTimezoneSelector: Story = {
  render: () => {
    const [selectedDate, setSelectedDate] = createSignal<string>('')
    const [selectedSlot, setSelectedSlot] = createSignal<TimeSlot | null>(null)
    const [timezone, setTimezone] = createSignal('America/New_York (EST)')

    const availability = generateMockAvailability()

    return (
      <Scheduler
        availability={availability}
        selectedDate={selectedDate() || availability[0]?.date}
        selectedSlot={selectedSlot()}
        onDateSelect={setSelectedDate}
        onSlotSelect={setSelectedSlot}
        onBook={(date, slot) => {
          alert(`Booked: ${date} at ${slot.startTime} (${timezone()})`)
        }}
        teacherTimezone="America/New_York (EST)"
        studentTimezone={timezone()}
        availableTimezones={[
          'America/New_York (EST)',
          'America/Los_Angeles (PST)',
          'Europe/London (GMT)',
          'Asia/Tokyo (JST)',
        ]}
        onTimezoneChange={setTimezone}
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows scheduler with timezone selector enabled.',
      },
    },
  },
}
