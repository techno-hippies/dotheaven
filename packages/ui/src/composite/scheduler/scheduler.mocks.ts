import type { DayAvailability, TimeSlot } from './types'

/**
 * Generate mock availability for the current month.
 * Shared across scheduler story files.
 */
export function generateMockAvailability(): DayAvailability[] {
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
