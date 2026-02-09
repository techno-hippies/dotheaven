import { Show, For, type Component, createSignal, createMemo } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Button, IconButton, TextField } from '../../primitives'
import type { SessionSlotData, SessionRequestData } from './schedule-tab'

// ── Types ────────────────────────────────────────────────────────

export type GridMode = 'view' | 'edit'

export interface ScheduleDashboardProps {
  basePrice?: string
  acceptingBookings?: boolean
  onSetBasePrice?: (priceEth: string) => void
  onToggleAccepting?: (accepting: boolean) => void

  slots?: SessionSlotData[]
  slotsLoading?: boolean
  onCreateSlot?: (startTime: number, durationMins: number) => void
  onRemoveSlot?: (slotId: number) => void

  /** Navigate to slot/booking detail page */
  onSlotClick?: (slot: SessionSlotData) => void

  requests?: SessionRequestData[]
  requestsLoading?: boolean
  onRequestClick?: (request: SessionRequestData) => void

  class?: string
}

// ── Constants ────────────────────────────────────────────────────

const SESSION_MINS = 20

const DAY_LABELS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

// ── Helpers ──────────────────────────────────────────────────────

function getWeekDates(baseDate: Date): Date[] {
  const dates: Date[] = []
  const d = new Date(baseDate)
  const dayOfWeek = d.getDay()
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7; i++) {
    dates.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date())
}

/** Format time as "12:00 AM", "9:30 PM", etc. */
function formatTime12h(hour: number, min: number): string {
  const period = hour >= 12 ? 'PM' : 'AM'
  const h = hour % 12 || 12
  const m = min.toString().padStart(2, '0')
  return `${h}:${m} ${period}`
}

/** Generate all 48 half-hour time slots for a day */
function allHalfHourSlots(): Array<{ hour: number; min: number; label: string }> {
  const slots: Array<{ hour: number; min: number; label: string }> = []
  for (let h = 0; h < 24; h++) {
    slots.push({ hour: h, min: 0, label: formatTime12h(h, 0) })
    slots.push({ hour: h, min: 30, label: formatTime12h(h, 30) })
  }
  return slots
}

// ── Icons ────────────────────────────────────────────────────────

const ChevronLeftIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

const PencilIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" />
  </svg>
)

const CheckIcon = () => (
  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

// ── Main Component ───────────────────────────────────────────────

export const ScheduleDashboard: Component<ScheduleDashboardProps> = (props) => {
  const [priceInput, setPriceInput] = createSignal(props.basePrice || '')
  const [editingPrice, setEditingPrice] = createSignal(false)
  const [weekOffset, setWeekOffset] = createSignal(0)
  const [selectedDayIdx, setSelectedDayIdx] = createSignal(
    new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
  )

  const paused = () => !props.acceptingBookings

  const baseDate = createMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + weekOffset() * 7)
    return d
  })

  const weekDates = createMemo(() => getWeekDates(baseDate()))

  const weekLabel = createMemo(() => {
    const dates = weekDates()
    const start = dates[0]
    const end = dates[6]
    const sm = start.toLocaleDateString('en', { month: 'short' })
    const em = end.toLocaleDateString('en', { month: 'short' })
    if (sm === em) return `${sm} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`
    return `${sm} ${start.getDate()} - ${em} ${end.getDate()}, ${end.getFullYear()}`
  })

  const selectedDate = createMemo(() => weekDates()[selectedDayIdx()])

  const selectedDateLabel = createMemo(() => {
    const d = selectedDate()
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  })

  const allSlots = () => props.slots || []

  // Build a lookup: unix timestamp -> slot data for the selected day
  const slotsByTimestamp = createMemo(() => {
    const map = new Map<number, SessionSlotData>()
    const sel = selectedDate()
    for (const slot of allSlots()) {
      if (slot.status === 'cancelled' || slot.status === 'settled') continue
      const d = new Date(slot.startTime * 1000)
      if (isSameDay(d, sel)) {
        map.set(slot.startTime, slot)
      }
    }
    return map
  })

  const getSlotCountForDate = (date: Date) => {
    let count = 0
    for (const slot of allSlots()) {
      if (slot.status === 'cancelled' || slot.status === 'settled') continue
      const d = new Date(slot.startTime * 1000)
      if (isSameDay(d, date)) count++
    }
    return count
  }

  const goToday = () => {
    setWeekOffset(0)
    setSelectedDayIdx(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)
  }

  const displayPrice = () => props.basePrice || '0.00'

  const halfHourSlots = allHalfHourSlots()

  /** Convert a half-hour slot (hour, min) on selectedDate to unix timestamp */
  const toUnix = (hour: number, min: number) => {
    const d = new Date(selectedDate())
    d.setHours(hour, min, 0, 0)
    return Math.floor(d.getTime() / 1000)
  }

  const handleSlotClick = (hour: number, min: number) => {
    const unix = toUnix(hour, min)
    const existing = slotsByTimestamp().get(unix)
    if (existing) {
      if (existing.status === 'open') {
        props.onRemoveSlot?.(existing.id)
      }
      // booked slots: do nothing (or navigate)
    } else {
      props.onCreateSlot?.(unix, SESSION_MINS)
    }
  }

  return (
    <div class={cn('flex flex-col gap-5', props.class)}>
      {/* ── Price Card ──────────────────────────────────────── */}
      <div class="bg-[var(--bg-surface)] rounded-md px-5 py-4">
        <Show
          when={editingPrice()}
          fallback={
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs text-[var(--text-muted)] mb-1">Base Price</div>
                <div class="flex items-baseline gap-1.5">
                  <span class="text-2xl font-bold text-[var(--text-primary)]">{displayPrice()}</span>
                  <span class="text-base font-medium text-[var(--text-muted)]">ETH</span>
                </div>
              </div>
              <IconButton
                variant="soft"
                size="md"
                aria-label="Edit price"
                onClick={() => {
                  setPriceInput(props.basePrice || '')
                  setEditingPrice(true)
                }}
              >
                <PencilIcon />
              </IconButton>
            </div>
          }
        >
          <div class="text-xs text-[var(--text-muted)] mb-2">Base Price</div>
          <div class="flex items-center gap-3">
            <TextField value={priceInput()} onChange={setPriceInput} placeholder="0.01" inputClass="w-24" />
            <span class="text-base text-[var(--text-muted)]">ETH</span>
            <div class="flex items-center gap-2 ml-auto">
              <Button onClick={() => setEditingPrice(false)} variant="ghost" size="sm">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  props.onSetBasePrice?.(priceInput())
                  setEditingPrice(false)
                }}
                size="sm"
              >
                Save
              </Button>
            </div>
          </div>
        </Show>
      </div>

      {/* ── Week Navigation ─────────────────────────────────── */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <IconButton onClick={() => setWeekOffset(w => w - 1)} variant="soft" size="sm" aria-label="Previous week">
            <ChevronLeftIcon />
          </IconButton>
          <span class="text-base font-semibold text-[var(--text-primary)]">{weekLabel()}</span>
          <IconButton onClick={() => setWeekOffset(w => w + 1)} variant="soft" size="sm" aria-label="Next week">
            <ChevronRightIcon />
          </IconButton>
        </div>
        <Button onClick={goToday} variant="secondary" size="sm">Today</Button>
      </div>

      {/* ── Day Selector Strip ──────────────────────────────── */}
      <div class="grid grid-cols-7 gap-1.5">
        <For each={weekDates()}>
          {(date, idx) => {
            const isActive = () => idx() === selectedDayIdx()
            const isTodayDate = isToday(date)
            const hasSlots = () => getSlotCountForDate(date) > 0
            return (
              <button
                type="button"
                class={cn(
                  'flex flex-col items-center py-2 rounded-md transition-colors cursor-pointer',
                  isActive()
                    ? 'bg-[var(--accent-blue)] text-white'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-highlight)]',
                  isTodayDate && !isActive() && 'ring-1 ring-[var(--accent-coral)]/40'
                )}
                onClick={() => setSelectedDayIdx(idx())}
              >
                <span class="text-xs font-medium uppercase">{DAY_LABELS_SHORT[idx()]}</span>
                <span class={cn(
                  'text-lg font-semibold leading-tight',
                  isActive() && 'text-white',
                  !isActive() && isTodayDate && 'text-[var(--accent-coral)]',
                  !isActive() && !isTodayDate && 'text-[var(--text-primary)]'
                )}>
                  {date.getDate()}
                </span>
                <div class={cn(
                  'w-1 h-1 rounded-full mt-0.5',
                  hasSlots()
                    ? isActive() ? 'bg-white/60' : 'bg-[var(--text-muted)]'
                    : 'bg-transparent'
                )} />
              </button>
            )
          }}
        </For>
      </div>

      {/* ── Day Label ───────────────────────────────────────── */}
      <div class="text-base font-semibold text-[var(--text-primary)]">
        {selectedDateLabel()}
      </div>

      {/* ── Two-Column Time Slot Grid ───────────────────────── */}
      <div class={cn(
        'rounded-md overflow-hidden',
        paused() && 'opacity-50'
      )}>
        <div class="grid grid-cols-2 gap-2">
          <For each={halfHourSlots}>
            {(slot) => {
              const unix = () => toUnix(slot.hour, slot.min)
              const existing = () => slotsByTimestamp().get(unix())
              const isOpen = () => existing()?.status === 'open'
              const isBooked = () => existing()?.status === 'booked'
              const isSelected = () => isOpen()

              return (
                <button
                  type="button"
                  onClick={() => handleSlotClick(slot.hour, slot.min)}
                  disabled={isBooked()}
                  class={cn(
                    'flex items-center justify-between px-4 py-3 rounded-lg text-base font-medium transition-all border',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]',
                    isSelected() && 'bg-[var(--accent-blue)] border-[var(--accent-blue)] text-white',
                    isBooked() && 'bg-[var(--bg-highlight)] border-[var(--border-subtle)] text-[var(--text-secondary)] cursor-not-allowed',
                    !isSelected() && !isBooked() && 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-blue)]/50 hover:bg-[var(--bg-elevated)] cursor-pointer'
                  )}
                >
                  <span>{slot.label}</span>
                  <Show when={isSelected()}>
                    <div class="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                      <CheckIcon />
                    </div>
                  </Show>
                  <Show when={isBooked()}>
                    <span class="text-base text-[var(--text-muted)]">Booked</span>
                  </Show>
                  <Show when={!isSelected() && !isBooked()}>
                    <div class="w-5 h-5 rounded-full border-2 border-[var(--bg-highlight-hover)]" />
                  </Show>
                </button>
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}
