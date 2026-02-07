import { Show, For, type Component, createSignal } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Switch, Button, IconButton, TextField, Spinner, Select, type SelectOption } from '../../primitives'
import { EditableInfoCard, EditableInfoCardSection } from '../profile/editable-info-card'

// ── Types ────────────────────────────────────────────────────────

export interface TimeSlot {
  day: number        // 0=Mon, 1=Tue, ... 6=Sun
  startHour: number  // 0-23
  endHour: number    // 1-24
}

export interface SessionSlotData {
  id: number
  startTime: number      // unix seconds
  durationMins: number
  priceEth: string
  status: 'open' | 'booked' | 'cancelled' | 'settled'
  guestName?: string
}

export interface SessionRequestData {
  id: number
  guestAddress: string
  guestName?: string
  windowStart: number
  windowEnd: number
  durationMins: number
  amountEth: string
  expiry: number
  status: 'open' | 'cancelled' | 'accepted'
}

export interface ScheduleTabProps {
  isOwnProfile?: boolean

  // Host pricing
  basePrice?: string         // ETH string (e.g. "0.01")
  acceptingBookings?: boolean
  onSetBasePrice?: (priceEth: string) => void
  onToggleAccepting?: (accepting: boolean) => void

  // Weekly availability (own profile edit)
  availability?: TimeSlot[]
  onAvailabilityChange?: (slots: TimeSlot[]) => void

  // Active slots
  slots?: SessionSlotData[]
  slotsLoading?: boolean
  onCancelSlot?: (slotId: number) => void

  // Incoming requests (own profile)
  requests?: SessionRequestData[]
  requestsLoading?: boolean
  onAcceptRequest?: (requestId: number) => void
  onDeclineRequest?: (requestId: number) => void

  // Public profile: booking
  onBookSlot?: (slotId: number) => void
  onRequestCustomTime?: (params: { windowStart: number; windowEnd: number; durationMins: number; amountEth: string }) => void
}

// ── Constants ────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12am'
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

const HOUR_OPTIONS: SelectOption[] = HOURS.map(h => ({
  value: String(h),
  label: formatHour(h),
}))

const DURATION_OPTIONS: SelectOption[] = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
]

function formatSlotTime(unix: number): string {
  const d = new Date(unix * 1000)
  const month = d.toLocaleDateString('en', { month: 'short' })
  const day = d.getDate()
  const hours = d.getHours()
  const mins = d.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'pm' : 'am'
  const h = hours % 12 || 12
  return `${month} ${day}, ${h}:${mins}${ampm}`
}

function formatTimeUntil(unix: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = unix - now
  if (diff < 0) return 'past'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ── Icons ────────────────────────────────────────────────────────

const CurrencyIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm40-68a28,28,0,0,1-28,28h-4v8a8,8,0,0,1-16,0v-8H104a8,8,0,0,1,0-16h36a12,12,0,0,0,0-24H116a28,28,0,0,1,0-56h4V72a8,8,0,0,1,16,0v8h16a8,8,0,0,1,0,16H116a12,12,0,0,0,0,24h24A28,28,0,0,1,168,148Z" />
  </svg>
)

const CalendarPlusIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V208Zm-48-56a8,8,0,0,1-8,8H136v16a8,8,0,0,1-16,0V160H104a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,160,152Z" />
  </svg>
)

const CheckIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
  </svg>
)

const XIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
  </svg>
)

// ── Availability Grid ────────────────────────────────────────────

interface AvailabilityGridProps {
  slots: TimeSlot[]
  editable?: boolean
  onToggle?: (day: number, hour: number) => void
}

const AvailabilityGrid: Component<AvailabilityGridProps> = (props) => {
  const isActive = (day: number, hour: number) => {
    return props.slots.some(s => s.day === day && hour >= s.startHour && hour < s.endHour)
  }

  // Show compact hours (6am-11pm)
  const displayHours = HOURS.filter(h => h >= 6 && h <= 22)

  return (
    <div class="overflow-x-auto">
      <div class="min-w-[400px]">
        {/* Header */}
        <div class="grid grid-cols-[48px_repeat(7,1fr)] gap-px mb-1">
          <div />
          <For each={[...DAYS]}>
            {(day) => (
              <div class="text-xs text-center text-[var(--text-muted)] font-medium py-1">
                {day}
              </div>
            )}
          </For>
        </div>

        {/* Hours grid */}
        <div class="grid grid-cols-[48px_repeat(7,1fr)] gap-px">
          <For each={displayHours}>
            {(hour) => (
              <>
                <div class="text-xs text-[var(--text-muted)] text-right pr-2 py-0.5 leading-[20px]">
                  {formatHour(hour)}
                </div>
                <For each={Array.from({ length: 7 }, (_, i) => i)}>
                  {(day) => (
                    <div
                      class={cn(
                        'h-5 rounded-sm transition-colors',
                        isActive(day, hour)
                          ? 'bg-[oklch(0.65_0.12_240)] hover:bg-[oklch(0.70_0.14_240)]'
                          : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)]',
                        props.editable && 'cursor-pointer'
                      )}
                      onClick={() => props.editable && props.onToggle?.(day, hour)}
                    />
                  )}
                </For>
              </>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

// ── Slot List Item ───────────────────────────────────────────────

interface SlotItemProps {
  slot: SessionSlotData
  isOwnProfile?: boolean
  onCancel?: () => void
  onBook?: () => void
}

const SlotItem: Component<SlotItemProps> = (props) => {
  const statusColor = () => {
    switch (props.slot.status) {
      case 'open': return 'text-green-400'
      case 'booked': return 'text-[oklch(0.65_0.12_240)]'
      case 'cancelled': return 'text-[var(--text-muted)]'
      case 'settled': return 'text-[var(--text-muted)]'
    }
  }

  const statusLabel = () => {
    switch (props.slot.status) {
      case 'open': return 'Open'
      case 'booked': return props.slot.guestName ? `Booked by ${props.slot.guestName}` : 'Booked'
      case 'cancelled': return 'Cancelled'
      case 'settled': return 'Settled'
    }
  }

  return (
    <div class="flex items-center gap-4 p-3 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)] transition-colors">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-base font-medium text-[var(--text-primary)]">
            {formatSlotTime(props.slot.startTime)}
          </span>
          <span class="text-sm text-[var(--text-muted)]">
            {props.slot.durationMins}min
          </span>
        </div>
        <div class="flex items-center gap-3 mt-0.5">
          <span class={cn('text-sm', statusColor())}>
            {statusLabel()}
          </span>
          <Show when={props.slot.status === 'open'}>
            <span class="text-sm text-[var(--text-secondary)]">
              {props.slot.priceEth} ETH
            </span>
          </Show>
          <span class="text-sm text-[var(--text-muted)]">
            in {formatTimeUntil(props.slot.startTime)}
          </span>
        </div>
      </div>

      <Show when={props.isOwnProfile && props.slot.status === 'open'}>
        <Button onClick={props.onCancel} variant="secondary" size="sm">
          Cancel
        </Button>
      </Show>

      <Show when={!props.isOwnProfile && props.slot.status === 'open'}>
        <Button onClick={props.onBook} size="sm">
          Book · {props.slot.priceEth} ETH
        </Button>
      </Show>
    </div>
  )
}

// ── Request List Item ────────────────────────────────────────────

interface RequestItemProps {
  request: SessionRequestData
  onAccept?: () => void
  onDecline?: () => void
}

const RequestItem: Component<RequestItemProps> = (props) => {
  return (
    <div class="flex items-center gap-4 p-3 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)] transition-colors">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-base font-medium text-[var(--text-primary)]">
            {props.request.guestName || `${props.request.guestAddress.slice(0, 6)}...${props.request.guestAddress.slice(-4)}`}
          </span>
          <span class="text-sm font-medium text-[oklch(0.65_0.18_15)]">
            {props.request.amountEth} ETH
          </span>
        </div>
        <div class="flex items-center gap-3 mt-0.5">
          <span class="text-sm text-[var(--text-secondary)]">
            {formatSlotTime(props.request.windowStart)} – {formatSlotTime(props.request.windowEnd)}
          </span>
          <span class="text-sm text-[var(--text-muted)]">
            {props.request.durationMins}min
          </span>
          <span class="text-sm text-[var(--text-muted)]">
            expires {formatTimeUntil(props.request.expiry)}
          </span>
        </div>
      </div>

      <Show when={props.request.status === 'open'}>
        <div class="flex items-center gap-2">
          <IconButton
            onClick={props.onAccept}
            variant="soft"
            size="sm"
            aria-label="Accept request"
            class="text-green-400 hover:bg-green-500/20"
          >
            <CheckIcon />
          </IconButton>
          <IconButton
            onClick={props.onDecline}
            variant="soft"
            size="sm"
            aria-label="Decline request"
            class="text-red-400 hover:bg-red-500/20"
          >
            <XIcon />
          </IconButton>
        </div>
      </Show>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export const ScheduleTab: Component<ScheduleTabProps> = (props) => {
  const [priceInput, setPriceInput] = createSignal(props.basePrice || '')
  const [showRequestForm, setShowRequestForm] = createSignal(false)

  // Request form state
  const [reqDate, setReqDate] = createSignal('')
  const [reqStartHour, setReqStartHour] = createSignal('14')
  const [reqDuration, setReqDuration] = createSignal('60')
  const [reqAmount, setReqAmount] = createSignal(props.basePrice || '0.01')

  const openSlots = () => (props.slots || []).filter(s => s.status === 'open')
  const bookedSlots = () => (props.slots || []).filter(s => s.status === 'booked')
  const openRequests = () => (props.requests || []).filter(r => r.status === 'open')

  const handleToggleHour = (day: number, hour: number) => {
    const current = props.availability || []
    const existing = current.find(s => s.day === day && hour >= s.startHour && hour < s.endHour)
    if (existing) {
      // Remove this hour block
      const updated = current.filter(s => s !== existing)
      // If slot was multi-hour, split around removed hour
      if (existing.startHour < hour) {
        updated.push({ day, startHour: existing.startHour, endHour: hour })
      }
      if (existing.endHour > hour + 1) {
        updated.push({ day, startHour: hour + 1, endHour: existing.endHour })
      }
      props.onAvailabilityChange?.(updated)
    } else {
      // Add 1-hour block
      const updated = [...current, { day, startHour: hour, endHour: hour + 1 }]
      // Merge adjacent blocks on same day
      const merged = mergeTimeSlots(updated)
      props.onAvailabilityChange?.(merged)
    }
  }

  const handleSubmitRequest = () => {
    if (!reqDate() || !props.onRequestCustomTime) return
    const date = new Date(reqDate())
    const startHour = parseInt(reqStartHour())
    date.setHours(startHour, 0, 0, 0)
    const windowStart = Math.floor(date.getTime() / 1000)
    const windowEnd = windowStart + 3600 // 1-hour window
    props.onRequestCustomTime({
      windowStart,
      windowEnd,
      durationMins: parseInt(reqDuration()),
      amountEth: reqAmount(),
    })
    setShowRequestForm(false)
  }

  return (
    <div class="flex flex-col gap-4 max-w-[600px]">
      {/* Own Profile: Pricing */}
      <Show when={props.isOwnProfile}>
        <EditableInfoCard>
          <EditableInfoCardSection title="Session Pricing" isEditing={false}>
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-3">
                <span class="text-base text-[var(--text-secondary)] min-w-[140px] flex-shrink-0 flex items-center gap-2">
                  <CurrencyIcon />
                  Base Price
                </span>
                <div class="flex items-center gap-2 flex-1">
                  <TextField
                    value={priceInput()}
                    onChange={setPriceInput}
                    placeholder="0.01"
                    inputClass="w-24"
                  />
                  <span class="text-base text-[var(--text-secondary)]">ETH</span>
                  <Button
                    onClick={() => props.onSetBasePrice?.(priceInput())}
                    size="sm"
                  >
                    Set
                  </Button>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-base text-[var(--text-secondary)] min-w-[140px] flex-shrink-0">
                  Status
                </span>
                <Switch
                  checked={props.acceptingBookings}
                  onChange={(checked) => props.onToggleAccepting?.(checked)}
                  label={props.acceptingBookings ? 'Accepting bookings' : 'Not accepting bookings'}
                />
              </div>
              <p class="text-xs text-[var(--text-muted)]">
                3% platform fee is deducted on completed sessions. Late guest cancellations incur a 20% penalty.
              </p>
            </div>
          </EditableInfoCardSection>
        </EditableInfoCard>
      </Show>

      {/* Public Profile: Price Display */}
      <Show when={!props.isOwnProfile && props.basePrice && parseFloat(props.basePrice) > 0}>
        <div class="flex items-center gap-3 p-4 rounded-md bg-[var(--bg-elevated)]">
          <CurrencyIcon />
          <span class="text-base text-[var(--text-primary)] font-medium">
            Sessions from {props.basePrice} ETH
          </span>
        </div>
      </Show>

      {/* Weekly Availability */}
      <Show when={props.isOwnProfile}>
        <EditableInfoCard>
          <EditableInfoCardSection title="Weekly Availability" isEditing={false}>
            <p class="text-sm text-[var(--text-muted)] -mt-2">
              Click cells to toggle your available hours. This helps visitors know when you're free.
            </p>
            <AvailabilityGrid
              slots={props.availability || []}
              editable
              onToggle={handleToggleHour}
            />
          </EditableInfoCardSection>
        </EditableInfoCard>
      </Show>

      {/* Public Profile: Show availability (read-only) */}
      <Show when={!props.isOwnProfile && props.availability && props.availability.length > 0}>
        <EditableInfoCard>
          <EditableInfoCardSection title="Availability" isEditing={false}>
            <AvailabilityGrid
              slots={props.availability || []}
            />
          </EditableInfoCardSection>
        </EditableInfoCard>
      </Show>

      {/* Active Slots */}
      <EditableInfoCard>
        <EditableInfoCardSection title={props.isOwnProfile ? 'Your Sessions' : 'Available Sessions'} isEditing={false}>
          <Show when={props.slotsLoading}>
            <div class="py-8 text-center text-[var(--text-muted)]">
              <Spinner size="sm" class="mx-auto mb-2" />
              Loading sessions...
            </div>
          </Show>

          <Show when={!props.slotsLoading}>
            {/* Open slots */}
            <Show when={openSlots().length > 0}>
              <div class="flex flex-col gap-2">
                <For each={openSlots()}>
                  {(slot) => (
                    <SlotItem
                      slot={slot}
                      isOwnProfile={props.isOwnProfile}
                      onCancel={() => props.onCancelSlot?.(slot.id)}
                      onBook={() => props.onBookSlot?.(slot.id)}
                    />
                  )}
                </For>
              </div>
            </Show>

            {/* Booked slots (own profile only) */}
            <Show when={props.isOwnProfile && bookedSlots().length > 0}>
              <div class="mt-4">
                <h3 class="text-sm font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">Booked</h3>
                <div class="flex flex-col gap-2">
                  <For each={bookedSlots()}>
                    {(slot) => (
                      <SlotItem slot={slot} isOwnProfile />
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Empty state */}
            <Show when={!props.slotsLoading && openSlots().length === 0 && bookedSlots().length === 0}>
              <div class="py-8 text-center">
                <div class="text-[var(--text-muted)] mb-3">
                  <CalendarPlusIcon />
                </div>
                <p class="text-base text-[var(--text-muted)]">
                  {props.isOwnProfile
                    ? 'No sessions scheduled yet. Set your price and availability above to get started.'
                    : 'No sessions available right now.'
                  }
                </p>
              </div>
            </Show>
          </Show>
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Incoming Requests (own profile) */}
      <Show when={props.isOwnProfile}>
        <EditableInfoCard>
          <EditableInfoCardSection title="Incoming Requests" isEditing={false}>
            <Show when={props.requestsLoading}>
              <div class="py-6 text-center text-[var(--text-muted)]">
                Loading requests...
              </div>
            </Show>

            <Show when={!props.requestsLoading && openRequests().length > 0}>
              <div class="flex flex-col gap-2">
                <For each={openRequests()}>
                  {(req) => (
                    <RequestItem
                      request={req}
                      onAccept={() => props.onAcceptRequest?.(req.id)}
                      onDecline={() => props.onDeclineRequest?.(req.id)}
                    />
                  )}
                </For>
              </div>
            </Show>

            <Show when={!props.requestsLoading && openRequests().length === 0}>
              <p class="py-4 text-center text-[var(--text-muted)]">
                No pending requests
              </p>
            </Show>
          </EditableInfoCardSection>
        </EditableInfoCard>
      </Show>

      {/* Request Custom Time (public profile) */}
      <Show when={!props.isOwnProfile && props.onRequestCustomTime}>
        <EditableInfoCard>
          <EditableInfoCardSection title="Request a Time" isEditing={false}>
            <Show when={!showRequestForm()}>
              <Button
                onClick={() => setShowRequestForm(true)}
                variant="outline"
                class="w-full"
              >
                None of these times work? Propose your own
              </Button>
            </Show>

            <Show when={showRequestForm()}>
              <div class="flex flex-col gap-3 p-4 rounded-md bg-[var(--bg-elevated)]">
                <TextField
                  label="Date"
                  value={reqDate()}
                  onChange={setReqDate}
                  inputClass="[color-scheme:dark]"
                />
                <div class="flex flex-col gap-2">
                  <span class="text-sm font-medium text-[var(--text-primary)]">Start</span>
                  <Select
                    options={HOUR_OPTIONS}
                    value={HOUR_OPTIONS.find(o => o.value === reqStartHour())}
                    onChange={(opt) => opt && setReqStartHour(opt.value)}
                    placeholder="Select time..."
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <span class="text-sm font-medium text-[var(--text-primary)]">Duration</span>
                  <Select
                    options={DURATION_OPTIONS}
                    value={DURATION_OPTIONS.find(o => o.value === reqDuration())}
                    onChange={(opt) => opt && setReqDuration(opt.value)}
                    placeholder="Select duration..."
                  />
                </div>
                <div class="flex items-end gap-2">
                  <TextField
                    label="Offer"
                    value={reqAmount()}
                    onChange={setReqAmount}
                    placeholder="0.01"
                    inputClass="w-24"
                  />
                  <span class="text-base text-[var(--text-secondary)] pb-2.5">ETH</span>
                </div>
                <div class="flex items-center gap-2 mt-2">
                  <Button
                    onClick={handleSubmitRequest}
                    class="flex-1"
                    size="sm"
                  >
                    Send Request
                  </Button>
                  <Button
                    onClick={() => setShowRequestForm(false)}
                    variant="secondary"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Show>
          </EditableInfoCardSection>
        </EditableInfoCard>
      </Show>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────

function mergeTimeSlots(slots: TimeSlot[]): TimeSlot[] {
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
