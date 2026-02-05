import { Show, For, type Component, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { cn } from '../lib/utils'
import { Switch, Button, IconButton, TextField } from '../primitives'
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

const SLOT_STEP = 0.5
const SLOT_HEIGHT_DESKTOP = 28
const SLOT_HEIGHT_MOBILE = 44
const SESSION_MINS = 20
const BUFFER_MINS = 10
const START_HOUR = 6
const END_HOUR = 23
const TOTAL_HOURS = END_HOUR - START_HOUR

function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function formatHourCompact(h: number): string {
  if (h === 0 || h === 24) return '12a'
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

function slotStarts(): number[] {
  const arr: number[] = []
  for (let t = START_HOUR; t < END_HOUR; t += SLOT_STEP) arr.push(t)
  return arr
}

function formatSlotTime(unix: number): string {
  const d = new Date(unix * 1000)
  const hours = d.getHours()
  const mins = d.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'pm' : 'am'
  const h = hours % 12 || 12
  return `${h}:${mins}${ampm}`
}

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

function dateToStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DAY_LABELS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

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

const EyeIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,123.97,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.29A169.47,169.47,0,0,1,24.57,128,169.47,169.47,0,0,1,48.07,97.29C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.29A169.47,169.47,0,0,1,231.43,128C223.72,141.25,188.58,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z" />
  </svg>
)


// ── Session block ───────────────────────────────────────────────

interface SessionBlockProps {
  slot: SessionSlotData
  slotHeight: number
  hourHeight: number
  onClick: () => void
}

const SessionBlock: Component<SessionBlockProps> = (props) => {
  const d = () => new Date(props.slot.startTime * 1000)
  const startHour = () => d().getHours() + d().getMinutes() / 60
  const durationHours = () => props.slot.durationMins / 60
  const top = () => (startHour() - START_HOUR) * props.hourHeight
  const height = () => Math.max(durationHours() * props.hourHeight - 2, props.slotHeight * 0.7)

  const isBooked = () => props.slot.status === 'booked'
  const isOpen = () => props.slot.status === 'open'

  return (
    <div
      class={cn(
        'absolute left-0.5 right-0.5 z-[3] rounded-md px-2 py-1 cursor-pointer transition-all text-xs leading-tight overflow-hidden border',
        'active:scale-[0.97]',
        isBooked() && 'bg-[oklch(0.45_0.15_260)] border-[oklch(0.55_0.12_260)] text-white',
        isOpen() && 'bg-green-600/80 border-green-500 text-white',
        !isBooked() && !isOpen() && 'bg-[var(--bg-highlight)] border-[var(--bg-highlight)] text-[var(--text-muted)]'
      )}
      style={{ top: `${top()}px`, height: `${height()}px` }}
      onClick={(e) => { e.stopPropagation(); props.onClick() }}
    >
      <div class="font-medium truncate">
        {isBooked() ? (props.slot.guestName || 'Booked') : 'Open'}
      </div>
      <Show when={height() >= 30}>
        <div class="truncate opacity-80">
          {formatSlotTime(props.slot.startTime)}
        </div>
      </Show>
    </div>
  )
}

// ── Edit cell (single clickable 30-min cell) ────────────────────

interface EditCellProps {
  slotStart: number
  slotHeight: number
  date: Date
  allSlots: () => SessionSlotData[]
  onCreateSlot?: (startTime: number, durationMins: number) => void
  onRemoveSlot?: (slotId: number) => void
}

const EditCell: Component<EditCellProps> = (props) => {
  const topPx = ((props.slotStart - START_HOUR) / SLOT_STEP) * props.slotHeight

  const toUnix = () => {
    const d = new Date(props.date)
    d.setHours(Math.floor(props.slotStart), (props.slotStart % 1) * 60, 0, 0)
    return Math.floor(d.getTime() / 1000)
  }

  const existing = () => {
    const unix = toUnix()
    return props.allSlots().find(s =>
      s.startTime === unix && (s.status === 'open' || s.status === 'booked')
    )
  }

  const isOpen = () => existing()?.status === 'open'
  const isBooked = () => existing()?.status === 'booked'
  const isEmpty = () => !existing()

  const handleClick = () => {
    const ex = existing()
    if (ex && ex.status === 'open') {
      props.onRemoveSlot?.(ex.id)
    } else if (!ex) {
      props.onCreateSlot?.(toUnix(), SESSION_MINS)
    }
  }

  return (
    <div
      class={cn(
        'absolute left-0 right-0 z-[1] flex items-center justify-center cursor-pointer transition-colors',
        isEmpty() && 'hover:bg-green-500/15',
        isOpen() && 'bg-green-500/20 border-l-2 border-l-green-500 hover:bg-red-500/15',
        isBooked() && 'bg-[oklch(0.45_0.15_260)]/15 border-l-2 border-l-[oklch(0.55_0.12_260)] cursor-not-allowed'
      )}
      style={{ top: `${topPx}px`, height: `${props.slotHeight}px` }}
      onClick={handleClick}
      title={isBooked() ? 'Cannot remove booked sessions' : isOpen() ? 'Click to remove' : 'Click to add open slot'}
    >
      <Show when={isOpen()}>
        <span class="text-base font-medium text-green-400">Open</span>
      </Show>
      <Show when={isBooked()}>
        <span class="text-base font-medium text-[oklch(0.75_0.12_260)]">{existing()!.guestName || 'Booked'}</span>
      </Show>
    </div>
  )
}

// ── Current time indicator ──────────────────────────────────────

const NowLine: Component<{ weekDates: Date[]; hourHeight: number }> = (props) => {
  const [now, setNow] = createSignal(new Date())

  onMount(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    onCleanup(() => clearInterval(interval))
  })

  const top = () => {
    const h = now().getHours() + now().getMinutes() / 60
    return (h - START_HOUR) * props.hourHeight
  }

  const visible = () => {
    const t = top()
    return props.weekDates.some(d => isToday(d)) && t >= 0 && t <= TOTAL_HOURS * props.hourHeight
  }

  return (
    <Show when={visible()}>
      <div
        class="absolute left-0 right-0 z-20 pointer-events-none"
        style={{ top: `${top()}px` }}
      >
        <div class="h-0.5 bg-[oklch(0.65_0.18_15)]" />
      </div>
    </Show>
  )
}

// ── Legend ───────────────────────────────────────────────────────

const Legend: Component = () => (
  <div class="flex items-center gap-4 flex-wrap text-base text-[var(--text-muted)]">
    <div class="flex items-center gap-1.5">
      <div class="w-3 h-3 rounded-sm bg-green-600/80 border border-green-500" />
      <span>Open</span>
    </div>
    <div class="flex items-center gap-1.5">
      <div class="w-3 h-3 rounded-sm bg-[oklch(0.45_0.15_260)] border border-[oklch(0.55_0.12_260)]" />
      <span>Booked</span>
    </div>
    <div class="flex items-center gap-1.5 ml-auto opacity-60">
      <span>{SESSION_MINS}min + {BUFFER_MINS}min buffer</span>
    </div>
  </div>
)

// ── Main Dashboard Component ─────────────────────────────────────

export const ScheduleDashboard: Component<ScheduleDashboardProps> = (props) => {
  const [priceInput, setPriceInput] = createSignal(props.basePrice || '')
  const [weekOffset, setWeekOffset] = createSignal(0)
  const [isMobile, setIsMobile] = createSignal(false)
  const [mobileDay, setMobileDay] = createSignal(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)
  const [mode, setMode] = createSignal<GridMode>('view')

  onMount(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    onCleanup(() => window.removeEventListener('resize', check))
  })

  const editing = () => mode() === 'edit'
  const paused = () => !props.acceptingBookings

  const slotHeight = () => isMobile() ? SLOT_HEIGHT_MOBILE : SLOT_HEIGHT_DESKTOP
  const hourHeight = () => slotHeight() * 2

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

  const allSlots = () => props.slots || []
  const openSlots = () => allSlots().filter(s => s.status === 'open')
  const bookedSlots = () => allSlots().filter(s => s.status === 'booked')
  const openRequests = () => (props.requests || []).filter(r => r.status === 'open')

  const slotsByDate = createMemo(() => {
    const map = new Map<string, SessionSlotData[]>()
    for (const slot of allSlots()) {
      if (slot.status === 'cancelled' || slot.status === 'settled') continue
      const d = new Date(slot.startTime * 1000)
      const key = dateToStr(d)
      const arr = map.get(key) || []
      arr.push(slot)
      map.set(key, arr)
    }
    return map
  })

  const getSlotsForDate = (date: Date) => slotsByDate().get(dateToStr(date)) || []
  const getSlotCountForDate = (date: Date) => getSlotsForDate(date).length

  const goToday = () => {
    setWeekOffset(0)
    setMobileDay(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)
  }

  const visibleDayIndices = createMemo(() => isMobile() ? [mobileDay()] : [0, 1, 2, 3, 4, 5, 6])

  return (
    <div class={cn('flex flex-col gap-4', props.class)}>
      {/* Header */}
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-xl font-semibold text-[var(--text-primary)]">My Schedule</h1>
        <div class="flex items-center gap-3">
          <Switch
            checked={props.acceptingBookings}
            onChange={(checked) => props.onToggleAccepting?.(checked)}
            label={props.acceptingBookings ? 'Accepting' : 'Paused'}
          />
        </div>
      </div>

      {/* Paused banner */}
      <Show when={paused()}>
        <div class="px-4 py-2.5 rounded-md bg-[oklch(0.65_0.18_15)]/10 border border-[oklch(0.65_0.18_15)]/20 text-base text-[oklch(0.75_0.18_15)]">
          Bookings paused — your schedule is not visible to others.
        </div>
      </Show>

      {/* Pricing (moved to top for visibility) */}
      <div class="flex items-center gap-3 bg-[var(--bg-surface)] rounded-md px-4 py-3">
        <span class="text-base font-medium text-[var(--text-secondary)]">Base price</span>
        <TextField value={priceInput()} onChange={setPriceInput} placeholder="0.01" inputClass="w-20" />
        <span class="text-base text-[var(--text-muted)]">ETH</span>
        <Button onClick={() => props.onSetBasePrice?.(priceInput())} size="sm">Set</Button>
        <span class="text-base text-[var(--text-muted)] ml-auto hidden sm:inline">3% fee</span>
      </div>

      {/* Stats row - simplified inline display */}
      <div class="flex items-center gap-4 flex-wrap text-base">
        <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--bg-surface)]">
          <span class="text-[var(--text-muted)]">Open</span>
          <span class="font-semibold text-green-400">{openSlots().length}</span>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--bg-surface)]">
          <span class="text-[var(--text-muted)]">Booked</span>
          <span class="font-semibold text-[oklch(0.75_0.12_240)]">{bookedSlots().length}</span>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--bg-surface)]">
          <span class="text-[var(--text-muted)]">Requests</span>
          <span class="font-semibold text-[var(--text-primary)]">{openRequests().length}</span>
        </div>
      </div>

      {/* Mode bar + week nav */}
      <div class="flex items-center justify-between bg-[var(--bg-surface)] rounded-md px-3 py-2 gap-2 flex-wrap">
        <div class="flex items-center gap-1 bg-[var(--bg-elevated)] rounded-md p-0.5">
          <button
            class={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors',
              !editing() ? 'bg-[var(--bg-highlight)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
            onClick={() => setMode('view')}
          >
            <EyeIcon />
            View
          </button>
          <button
            class={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors',
              editing() ? 'bg-green-600/20 text-green-400' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
            onClick={() => setMode('edit')}
          >
            <PencilIcon />
            Edit
          </button>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-base font-medium text-[var(--text-primary)] hidden sm:inline">{weekLabel()}</span>
          <div class="flex items-center gap-1">
            <IconButton onClick={() => setWeekOffset(w => w - 1)} variant="soft" size="sm" aria-label="Previous week">
              <ChevronLeftIcon />
            </IconButton>
            <IconButton onClick={() => setWeekOffset(w => w + 1)} variant="soft" size="sm" aria-label="Next week">
              <ChevronRightIcon />
            </IconButton>
          </div>
          <Button onClick={goToday} variant="secondary" size="sm">Today</Button>
        </div>
      </div>

      {/* Edit mode instruction */}
      <Show when={editing()}>
        <div class="px-4 py-2.5 rounded-md bg-green-500/10 border border-green-500/20 text-base text-green-400">
          Tap slots to add or remove open sessions. Each = {SESSION_MINS}min + {BUFFER_MINS}min buffer.
        </div>
      </Show>

      {/* Legend */}
      <Legend />

      {/* Mobile day selector */}
      <Show when={isMobile()}>
        <div class="flex gap-1">
          <For each={weekDates()}>
            {(date, idx) => (
              <button
                class={cn(
                  'flex-1 flex flex-col items-center py-2 rounded-md transition-colors',
                  idx() === mobileDay()
                    ? 'bg-[oklch(0.65_0.12_240)]/20 text-[oklch(0.75_0.12_240)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-highlight)]',
                  isToday(date) && idx() !== mobileDay() && 'text-[oklch(0.65_0.18_15)]'
                )}
                onClick={() => setMobileDay(idx())}
              >
                <span class="text-base font-medium uppercase">{DAY_LABELS_SHORT[idx()]}</span>
                <span class="text-lg font-semibold">{date.getDate()}</span>
                <Show when={getSlotCountForDate(date) > 0}>
                  <div class="w-1 h-1 rounded-full bg-current mt-0.5" />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Week grid — full width, no sidebar */}
      <div class={cn(
        'bg-[var(--bg-surface)] rounded-md overflow-hidden',
        paused() && 'opacity-50',
        editing() && 'ring-1 ring-green-500/30'
      )}>
        {/* Day headers (desktop) */}
        <Show when={!isMobile()}>
          <div class="grid border-b border-[var(--bg-highlight)]" style={`grid-template-columns: 48px repeat(${visibleDayIndices().length}, 1fr)`}>
            <div />
            <For each={visibleDayIndices()}>
              {(dayIdx) => {
                const date = () => weekDates()[dayIdx]
                return (
                  <div class={cn(
                    'text-center py-2 border-l border-[var(--bg-highlight)]',
                    isToday(date()) && 'bg-[oklch(0.65_0.12_240)]/10'
                  )}>
                    <div class="text-base font-medium uppercase text-[var(--text-muted)]">
                      {DAY_LABELS[dayIdx]}
                    </div>
                    <div class={cn(
                      'text-lg font-semibold',
                      isToday(date()) ? 'text-[oklch(0.65_0.12_240)]' : 'text-[var(--text-primary)]'
                    )}>
                      {date().getDate()}
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>

        {/* Time grid */}
        <div class="overflow-y-auto max-h-[600px] relative">
          <div
            class="grid relative"
            style={`grid-template-columns: 48px repeat(${visibleDayIndices().length}, 1fr)`}
          >
            {/* Hour labels */}
            <div class="relative" style={`height: ${TOTAL_HOURS * hourHeight()}px`}>
              <For each={Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR)}>
                {(hour) => (
                  <div
                    class="absolute right-2 text-base text-[var(--text-muted)] leading-none -translate-y-1/2"
                    style={{ top: `${(hour - START_HOUR) * hourHeight()}px` }}
                  >
                    {isMobile() ? formatHourCompact(hour) : formatHour(hour)}
                  </div>
                )}
              </For>
            </div>

            {/* Day columns */}
            <For each={visibleDayIndices()}>
              {(dayIdx) => {
                const date = () => weekDates()[dayIdx]
                const daySessions = () => getSlotsForDate(date())
                return (
                  <div
                    class={cn(
                      'relative border-l border-[var(--bg-highlight)]',
                      isToday(date()) && !editing() && 'bg-[oklch(0.65_0.12_240)]/5'
                    )}
                    style={`height: ${TOTAL_HOURS * hourHeight()}px`}
                  >
                    {/* Grid lines */}
                    <For each={slotStarts()}>
                      {(t) => (
                        <div
                          class={cn(
                            'absolute left-0 right-0 border-t',
                            t % 1 === 0
                              ? 'border-[var(--bg-highlight)]/50'
                              : 'border-[var(--bg-highlight)]/25 border-dashed'
                          )}
                          style={{ top: `${((t - START_HOUR) / SLOT_STEP) * slotHeight()}px` }}
                        />
                      )}
                    </For>

                    {/* Edit mode: clickable cells */}
                    <Show when={editing()}>
                      <For each={slotStarts()}>
                        {(slotStart) => (
                          <EditCell
                            slotStart={slotStart}
                            slotHeight={slotHeight()}
                            date={date()}
                            allSlots={allSlots}
                            onCreateSlot={props.onCreateSlot}
                            onRemoveSlot={props.onRemoveSlot}
                          />
                        )}
                      </For>
                    </Show>

                    {/* View mode: session blocks — click navigates to detail page */}
                    <Show when={!editing()}>
                      <For each={daySessions()}>
                        {(slot) => (
                          <SessionBlock
                            slot={slot}
                            slotHeight={slotHeight()}
                            hourHeight={hourHeight()}
                            onClick={() => props.onSlotClick?.(slot)}
                          />
                        )}
                      </For>
                    </Show>
                  </div>
                )
              }}
            </For>

            {/* Now line */}
            <Show when={weekDates().some(d => isToday(d))}>
              <div
                class="absolute pointer-events-none z-20"
                style={`left: 48px; right: 0; top: 0; height: ${TOTAL_HOURS * hourHeight()}px`}
              >
                <NowLine weekDates={weekDates()} hourHeight={hourHeight()} />
              </div>
            </Show>
          </div>
        </div>
      </div>

    </div>
  )
}
