import { Show, For, type Component, createMemo } from 'solid-js'
import { cn } from '../../lib/utils'
import { Avatar, IconButton } from '../../primitives'

// ── Types ────────────────────────────────────────────────────────

export interface BookingData {
  id: string
  startTime: number // unix seconds
  durationMins: number
  guestAddress: string
  guestName?: string
  guestAvatar?: string
  status: 'upcoming' | 'live' | 'completed' | 'cancelled'
}

export interface UpcomingSessionsProps {
  bookings: BookingData[]
  onBookingClick?: (booking: BookingData) => void
  onSetAvailability?: () => void
  onViewRequests?: () => void
  requestCount?: number
  class?: string
}

// ── Helpers ──────────────────────────────────────────────────────

function formatTime(unix: number): string {
  const d = new Date(unix * 1000)
  const hours = d.getHours()
  const mins = d.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const h = hours % 12 || 12
  return `${h}:${mins}${ampm}`
}

function getDayKey(unix: number): string {
  return new Date(unix * 1000).toDateString()
}

function getDayLabel(unix: number): string {
  const d = new Date(unix * 1000)
  const now = new Date()

  if (d.toDateString() === now.toDateString()) return 'Today'

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'

  return d.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })
}

interface DayGroup {
  label: string
  bookings: BookingData[]
}

// ── Icons ────────────────────────────────────────────────────────

const ChevronRightIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

const GearIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.48l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187,173.11a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.48a73.93,73.93,0,0,1-8.68,0,8,8,0,0,0-5.48,1.74L100.45,215.8a91.57,91.57,0,0,1-15-6.23L82.89,187a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64L46.43,170.6a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.48,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.48L40.2,100.45a91.57,91.57,0,0,1,6.23-15L69,82.89a8,8,0,0,0,5.1-2.64,74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,82.89,69L85.4,46.43a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.48,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.48-1.74L155.55,40.2a91.57,91.57,0,0,1,15,6.23L173.11,69a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z" />
  </svg>
)

const InboxIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48ZM32,64H224V152H179.31a8,8,0,0,0-5.66,2.34L152.69,175.3a8,8,0,0,1-5.66,2.34H109a8,8,0,0,1-5.66-2.34L82.34,154.34A8,8,0,0,0,76.68,152H32ZM224,192H32V168H74.06l18.63,18.63A24,24,0,0,0,109.6,193.6h36.77a24,24,0,0,0,16.93-7L182,168h42Z" />
  </svg>
)

// ── Session Card ─────────────────────────────────────────────────

interface SessionCardProps {
  booking: BookingData
  onClick?: () => void
}

const SessionCard: Component<SessionCardProps> = (props) => {
  const isLive = () => props.booking.status === 'live'
  const displayName = () => props.booking.guestName || `${props.booking.guestAddress.slice(0, 6)}...${props.booking.guestAddress.slice(-4)}`

  return (
    <div
      class={cn(
        'flex items-center gap-3 p-3 rounded-md bg-[var(--bg-surface)] cursor-pointer transition-colors',
        'hover:bg-[var(--bg-highlight)] active:scale-[0.99]',
        isLive() && 'ring-2 ring-green-500/50 bg-green-500/10'
      )}
      onClick={props.onClick}
    >
      {/* Color bar */}
      <div class={cn(
        'w-1 h-10 rounded-full flex-shrink-0',
        isLive() ? 'bg-green-500' : 'bg-[oklch(0.65_0.12_240)]'
      )} />

      {/* Avatar + name */}
      <Avatar
        src={props.booking.guestAvatar}
        alt={displayName()}
        size="sm"
      />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-base font-medium text-[var(--text-primary)] truncate">
            {displayName()}
          </span>
          <Show when={isLive()}>
            <span class="px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
              LIVE
            </span>
          </Show>
        </div>
        <div class="text-sm text-[var(--text-muted)]">
          {formatTime(props.booking.startTime)}
        </div>
      </div>

      {/* Chevron */}
      <div class="text-[var(--text-muted)] flex-shrink-0">
        <ChevronRightIcon />
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export const UpcomingSessions: Component<UpcomingSessionsProps> = (props) => {
  const groupedByDay = createMemo((): DayGroup[] => {
    const filtered = [...props.bookings]
      .filter(b => b.status === 'upcoming' || b.status === 'live')
      .sort((a, b) => a.startTime - b.startTime)

    const groups: DayGroup[] = []
    let currentKey = ''
    let currentGroup: DayGroup | null = null

    for (const booking of filtered) {
      const key = getDayKey(booking.startTime)
      if (key !== currentKey) {
        currentKey = key
        currentGroup = { label: getDayLabel(booking.startTime), bookings: [] }
        groups.push(currentGroup)
      }
      currentGroup!.bookings.push(booking)
    }

    return groups
  })

  return (
    <div class={cn('flex flex-col gap-4', props.class)}>
      {/* Header with icons */}
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">My Schedule</h2>
        <div class="flex items-center gap-1">
          <Show when={props.onViewRequests}>
            <div class="relative">
              <IconButton onClick={props.onViewRequests} aria-label="View requests" variant="ghost">
                <InboxIcon />
              </IconButton>
              <Show when={(props.requestCount ?? 0) > 0}>
                <div class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[oklch(0.65_0.18_15)] text-white text-xs font-medium flex items-center justify-center">
                  {(props.requestCount ?? 0) > 9 ? '9+' : props.requestCount}
                </div>
              </Show>
            </div>
          </Show>
          <Show when={props.onSetAvailability}>
            <IconButton onClick={props.onSetAvailability} aria-label="Settings" variant="ghost">
              <GearIcon />
            </IconButton>
          </Show>
        </div>
      </div>

      {/* Sessions grouped by day */}
      <Show when={groupedByDay().length > 0} fallback={
        <div class="py-8 text-center text-[var(--text-muted)]">
          No upcoming sessions
        </div>
      }>
        <div class="flex flex-col gap-4">
          <For each={groupedByDay()}>
            {(group) => (
              <div class="flex flex-col gap-2">
                <h3 class="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  {group.label}
                </h3>
                <For each={group.bookings}>
                  {(booking) => (
                    <SessionCard
                      booking={booking}
                      onClick={() => props.onBookingClick?.(booking)}
                    />
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
