import { Show, For, type Component, createSignal } from 'solid-js'
import { Switch, Button, TextField, Spinner, Select } from '../../primitives'
import { EditableInfoCard, EditableInfoCardSection } from '../profile/editable-info-card'
import { HOUR_OPTIONS, DURATION_OPTIONS, mergeTimeSlots } from './schedule-helpers'
import {
  CurrencyIcon,
  CalendarPlusIcon,
  AvailabilityGrid,
  SlotItem,
  RequestItem,
} from './schedule-components'

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
            <p class="text-base text-[var(--text-muted)] -mt-2">
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
                <h3 class="text-base font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">Booked</h3>
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
                  <span class="text-base font-medium text-[var(--text-primary)]">Start</span>
                  <Select
                    options={HOUR_OPTIONS}
                    value={HOUR_OPTIONS.find(o => o.value === reqStartHour())}
                    onChange={(opt) => opt && setReqStartHour(opt.value)}
                    placeholder="Select time..."
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <span class="text-base font-medium text-[var(--text-primary)]">Duration</span>
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
