import type { SelectOption } from '../../primitives'
import type { TimeSlot } from './schedule-tab'

// ── Constants ────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i)

export function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12am'
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

export const HOUR_OPTIONS: SelectOption[] = HOURS.map(h => ({
  value: String(h),
  label: formatHour(h),
}))

export const DURATION_OPTIONS: SelectOption[] = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
]

// ── Formatting ──────────────────────────────────────────────────

export function formatSlotTime(unix: number): string {
  const d = new Date(unix * 1000)
  const month = d.toLocaleDateString('en', { month: 'short' })
  const day = d.getDate()
  const hours = d.getHours()
  const mins = d.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'pm' : 'am'
  const h = hours % 12 || 12
  return `${month} ${day}, ${h}:${mins}${ampm}`
}

export function formatTimeUntil(unix: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = unix - now
  if (diff < 0) return 'past'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ── Slot merging ────────────────────────────────────────────────

export function mergeTimeSlots(slots: TimeSlot[]): TimeSlot[] {
  // Group by day
  const byDay = new Map<number, TimeSlot[]>()
  for (const s of slots) {
    const arr = byDay.get(s.day) || []
    arr.push(s)
    byDay.set(s.day, arr)
  }

  const merged: TimeSlot[] = []
  for (const [, daySlots] of byDay) {
    // Sort by start
    daySlots.sort((a, b) => a.startHour - b.startHour)
    let current = { ...daySlots[0] }
    for (let i = 1; i < daySlots.length; i++) {
      if (daySlots[i].startHour <= current.endHour) {
        current.endHour = Math.max(current.endHour, daySlots[i].endHour)
      } else {
        merged.push(current)
        current = { ...daySlots[i] }
      }
    }
    merged.push(current)
  }
  return merged
}
