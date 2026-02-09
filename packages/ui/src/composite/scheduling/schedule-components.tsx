import { Show, For, type Component } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Button, IconButton } from '../../primitives'
import { formatHour, formatSlotTime, formatTimeUntil } from './schedule-helpers'
import type { TimeSlot, SessionSlotData, SessionRequestData } from './schedule-tab'

// ── Icons ────────────────────────────────────────────────────────

export const CurrencyIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm40-68a28,28,0,0,1-28,28h-4v8a8,8,0,0,1-16,0v-8H104a8,8,0,0,1,0-16h36a12,12,0,0,0,0-24H116a28,28,0,0,1,0-56h4V72a8,8,0,0,1,16,0v8h16a8,8,0,0,1,0,16H116a12,12,0,0,0,0,24h24A28,28,0,0,1,168,148Z" />
  </svg>
)

export const CalendarPlusIcon = () => (
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

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface AvailabilityGridProps {
  slots: TimeSlot[]
  editable?: boolean
  onToggle?: (day: number, hour: number) => void
}

export const AvailabilityGrid: Component<AvailabilityGridProps> = (props) => {
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

export const SlotItem: Component<SlotItemProps> = (props) => {
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
          <span class="text-base text-[var(--text-muted)]">
            {props.slot.durationMins}min
          </span>
        </div>
        <div class="flex items-center gap-3 mt-0.5">
          <span class={cn('text-base', statusColor())}>
            {statusLabel()}
          </span>
          <Show when={props.slot.status === 'open'}>
            <span class="text-base text-[var(--text-secondary)]">
              {props.slot.priceEth} ETH
            </span>
          </Show>
          <span class="text-base text-[var(--text-muted)]">
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

export const RequestItem: Component<RequestItemProps> = (props) => {
  return (
    <div class="flex items-center gap-4 p-3 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)] transition-colors">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-base font-medium text-[var(--text-primary)]">
            {props.request.guestName || `${props.request.guestAddress.slice(0, 6)}...${props.request.guestAddress.slice(-4)}`}
          </span>
          <span class="text-base font-medium text-[oklch(0.65_0.18_15)]">
            {props.request.amountEth} ETH
          </span>
        </div>
        <div class="flex items-center gap-3 mt-0.5">
          <span class="text-base text-[var(--text-secondary)]">
            {formatSlotTime(props.request.windowStart)} – {formatSlotTime(props.request.windowEnd)}
          </span>
          <span class="text-base text-[var(--text-muted)]">
            {props.request.durationMins}min
          </span>
          <span class="text-base text-[var(--text-muted)]">
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
