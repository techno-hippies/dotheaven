import { Show, For, type Component, createMemo } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Avatar } from '../../primitives'

// ── Types ────────────────────────────────────────────────────────

export interface BookingData {
  id: string
  startTime: number // unix seconds
  durationMins: number
  guestAddress: string
  guestName?: string
  /** Heaven name (e.g. "alice.heaven") */
  guestHeavenName?: string
  guestAvatar?: string
  /** ISO 3166-1 alpha-2 country code (e.g. "US") */
  guestNationalityCode?: string
  status: 'upcoming' | 'live' | 'completed' | 'cancelled'
}

export interface UpcomingSessionsProps {
  bookings: BookingData[]
  onBookingClick?: (booking: BookingData) => void
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
      <Avatar
        src={props.booking.guestAvatar}
        alt={displayName()}
        size="lg"
        nationalityCode={props.booking.guestNationalityCode}
      />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-base font-semibold text-[var(--text-primary)] truncate">
            {displayName()}
          </span>
          <Show when={props.booking.guestHeavenName}>
            <span class="text-base text-[var(--text-muted)] truncate">
              {props.booking.guestHeavenName}
            </span>
          </Show>
          <Show when={isLive()}>
            <span class="px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 flex-shrink-0">
              LIVE
            </span>
          </Show>
        </div>
        <div class="text-base text-[var(--text-muted)]">
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
                <h3 class="text-base font-medium text-[var(--text-muted)] uppercase tracking-wider">
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
