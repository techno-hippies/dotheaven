import { Show, type Component, createSignal } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Button, Avatar, IconButton } from '../../primitives'

// ── Types (mirrors SessionEscrowV1 contract) ─────────────────────

export type BookingStatus = 'pending' | 'booked' | 'cancelled' | 'attested' | 'disputed' | 'resolved' | 'finalized'
export type SlotStatus = 'open' | 'booked' | 'cancelled' | 'settled'
export type Outcome = 'none' | 'completed' | 'no-show-host' | 'no-show-guest' | 'cancelled-by-host' | 'cancelled-by-guest'

// User-friendly state (what users actually understand)
export type UserFriendlyStatus = 'pending' | 'confirmed' | 'live' | 'completed' | 'issue' | 'cancelled' | 'settled'

export interface BookingDetailData {
  txHash: string            // booking tx hash — the single identifier
  finalizeTxHash?: string   // finalize tx hash (separate tx for fund release)

  // Slot info
  host: string
  hostName?: string         // e.g. "alice.heaven", "bob.eth"
  hostAvatar?: string
  /** ISO 3166-1 alpha-2 country code */
  hostNationalityCode?: string
  startTime: number         // unix seconds
  durationMins: number
  priceEth: string
  cancelCutoffMins: number
  slotStatus: SlotStatus

  // Booking info
  guest: string
  guestName?: string
  guestAvatar?: string
  /** ISO 3166-1 alpha-2 country code */
  guestNationalityCode?: string
  amountEth: string
  bookingStatus: BookingStatus
  outcome: Outcome
  attestedAt?: number
  finalizableAt?: number

  // Context
  isHost: boolean
  explorerUrl?: string      // block explorer base URL
}

export interface BookingDetailProps {
  booking: BookingDetailData
  loading?: boolean

  onJoinSession?: () => void
  onAcceptRequest?: () => void
  onDeclineRequest?: () => void
  onCancelBooking?: () => void
  onReportProblem?: () => void  // Replaces onChallenge - user-friendly
  onBack?: () => void

  class?: string
}

// ── Helpers ──────────────────────────────────────────────────────

function formatTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isPast(unix: number): boolean {
  return unix < Math.floor(Date.now() / 1000)
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return ''
  }
}

// ── User-friendly status mapping ─────────────────────────────────
// Maps contract states to what users understand

interface StatusConfig {
  label: string
  color: string
  bgColor: string
}

// User-friendly status labels (hide contract complexity)
const FRIENDLY_STATUS_MAP: Record<UserFriendlyStatus, StatusConfig> = {
  pending:   { label: 'Awaiting Response', color: 'text-yellow-400',              bgColor: 'bg-yellow-500/20' },
  confirmed: { label: 'Confirmed',         color: 'text-[oklch(0.75_0.12_240)]', bgColor: 'bg-[oklch(0.45_0.15_260)]/20' },
  live:      { label: 'Live Now',          color: 'text-green-400',               bgColor: 'bg-green-500/20' },
  completed: { label: 'Completed',         color: 'text-green-400',               bgColor: 'bg-green-500/20' },
  issue:     { label: 'Under Review',      color: 'text-yellow-400',              bgColor: 'bg-yellow-500/20' },
  cancelled: { label: 'Cancelled',         color: 'text-[var(--text-muted)]',     bgColor: 'bg-[var(--bg-elevated)]' },
  settled:   { label: 'Payment Complete',  color: 'text-green-400',               bgColor: 'bg-green-500/20' },
}

// Map contract status + context to user-friendly status
function getUserFriendlyStatus(booking: BookingDetailData): UserFriendlyStatus {
  const now = Math.floor(Date.now() / 1000)
  const endTime = booking.startTime + booking.durationMins * 60
  const isLive = now >= booking.startTime - 5 * 60 && now <= endTime

  switch (booking.bookingStatus) {
    case 'pending':
      return 'pending'
    case 'booked':
      return isLive ? 'live' : 'confirmed'
    case 'cancelled':
      return 'cancelled'
    case 'attested':
      // If completed outcome and past session, show as completed (will auto-finalize)
      if (booking.outcome === 'completed') return 'completed'
      // No-show or other issues
      return 'issue'
    case 'disputed':
    case 'resolved':
      return 'issue'
    case 'finalized':
      return 'settled'
    default:
      return 'confirmed'
  }
}

// User-friendly outcome descriptions
function getOutcomeDescription(outcome: Outcome, isHost: boolean): string | null {
  switch (outcome) {
    case 'none':
      return null
    case 'completed':
      return 'Session completed successfully'
    case 'no-show-host':
      return isHost ? 'You were marked as a no-show' : 'Host did not join'
    case 'no-show-guest':
      return isHost ? 'Guest did not join' : 'You were marked as a no-show'
    case 'cancelled-by-host':
      return isHost ? 'You cancelled this session' : 'Host cancelled this session'
    case 'cancelled-by-guest':
      return isHost ? 'Guest cancelled this session' : 'You cancelled this session'
  }
}

// ── Icons ────────────────────────────────────────────────────────

const BackIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)

const ExternalLinkIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z" />
  </svg>
)

// ── Component ───────────────────────────────────────────────────

export const BookingDetail: Component<BookingDetailProps> = (props) => {
  const [showProblemOptions, setShowProblemOptions] = createSignal(false)

  const b = () => props.booking
  const friendlyStatus = () => getUserFriendlyStatus(b())
  const status = () => FRIENDLY_STATUS_MAP[friendlyStatus()]
  const endTime = () => b().startTime + b().durationMins * 60
  const counterparty = () => b().isHost
    ? { name: b().guestName, address: b().guest, avatar: b().guestAvatar, nationalityCode: b().guestNationalityCode }
    : { name: b().hostName, address: b().host, avatar: b().hostAvatar, nationalityCode: b().hostNationalityCode }
  const counterpartyDisplay = () => counterparty().name || truncateAddress(counterparty().address)
  const outcomeDesc = () => getOutcomeDescription(b().outcome, b().isHost)

  const displayTxHash = (): string => {
    const hash = b().bookingStatus === 'finalized' && b().finalizeTxHash ? b().finalizeTxHash : b().txHash
    return hash ?? ''
  }

  const explorerTxUrl = () => {
    const base = b().explorerUrl
    if (!base) return undefined
    return `${base.replace(/\/$/, '')}/tx/${displayTxHash()}`
  }

  const canJoin = () => {
    if (b().bookingStatus !== 'booked') return false
    const now = Math.floor(Date.now() / 1000)
    const startBuffer = 5 * 60 // 5 mins before
    const end = b().startTime + b().durationMins * 60
    return now >= b().startTime - startBuffer && now <= end
  }

  const canCancel = () => {
    if (b().bookingStatus !== 'booked') return false
    if (isPast(b().startTime)) return false
    return true
  }

  // Can report a problem during challenge window (attested but not finalized)
  const canReportProblem = () => {
    if (b().bookingStatus !== 'attested') return false
    if (!b().finalizableAt) return false
    return !isPast(b().finalizableAt!)
  }

  // Payment info for completed sessions
  const paymentInfo = () => {
    if (b().bookingStatus !== 'finalized') return null

    let text: string | null = null
    if (b().outcome === 'completed' || b().outcome === 'no-show-guest') {
      text = b().isHost
        ? `You received ${b().amountEth} ETH`
        : `${b().amountEth} ETH paid to host`
    } else if (b().outcome === 'no-show-host' || b().outcome === 'cancelled-by-host') {
      text = b().isHost
        ? `${b().amountEth} ETH refunded to guest`
        : `${b().amountEth} ETH refunded to you`
    }

    return text
  }

  const paymentTxUrl = () => {
    if (b().bookingStatus !== 'finalized' || !b().finalizeTxHash) return undefined
    const base = b().explorerUrl
    if (!base) return undefined
    return `${base.replace(/\/$/, '')}/tx/${b().finalizeTxHash}`
  }

  return (
    <div class={cn('flex flex-col gap-6 max-w-xl mx-auto w-full', props.class)}>
      {/* Back + status */}
      <div class="flex items-center gap-3">
        <Show when={props.onBack}>
          <IconButton aria-label="Go back" onClick={props.onBack}>
            <BackIcon />
          </IconButton>
        </Show>
        <div class="flex-1" />
        <span class={cn('font-medium px-2.5 py-1 rounded-md', status().color, status().bgColor)}>
          {status().label}
        </span>
      </div>

      {/* Session info card */}
      <div class="rounded-md bg-[var(--bg-surface)] p-5 flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <Avatar alt={counterpartyDisplay()} src={counterparty().avatar} size="md" nationalityCode={counterparty().nationalityCode} />
          <div class="flex-1 min-w-0">
            <div class="font-medium text-[var(--text-primary)] truncate">
              {counterpartyDisplay()}
            </div>
          </div>
          <div class="text-right">
            <div class="text-lg font-semibold text-[var(--text-primary)]">{b().amountEth} ETH</div>
            <div class="text-sm text-[var(--text-muted)]">
              {b().bookingStatus === 'finalized' ? 'settled' : 'held in escrow'}
            </div>
          </div>
        </div>

        <div class="h-px bg-[var(--bg-highlight)]" />

        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-[var(--text-muted)] text-sm mb-0.5">Date</div>
            <div class="text-[var(--text-primary)] font-medium">
              {new Date(b().startTime * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
          <div>
            <div class="text-[var(--text-muted)] text-sm mb-0.5">
              Time{getTimezone() ? ` (${getTimezone()})` : ''}
            </div>
            <div class="text-[var(--text-primary)] font-medium">
              {formatTime(b().startTime)} – {formatTime(endTime())}
            </div>
          </div>
          <div>
            <div class="text-[var(--text-muted)] text-sm mb-0.5">Duration</div>
            <div class="text-[var(--text-primary)]">{b().durationMins} min</div>
          </div>
          <Show
            when={b().bookingStatus === 'booked' && !isPast(b().startTime)}
            fallback={
              <div>
                <div class="text-[var(--text-muted)] text-sm mb-0.5">ID</div>
                <Show when={explorerTxUrl()} fallback={
                  <div class="text-[var(--text-primary)] font-mono text-sm">{truncateHash(displayTxHash())}</div>
                }>
                  <a
                    href={explorerTxUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-[var(--text-primary)] hover:text-[oklch(0.65_0.12_240)] transition-colors font-mono text-sm"
                  >
                    {truncateHash(displayTxHash())}
                    <ExternalLinkIcon />
                  </a>
                </Show>
              </div>
            }
          >
            <div>
              <div class="text-[var(--text-muted)] text-sm mb-0.5">Free cancel until</div>
              <div class="text-[var(--text-primary)]">
                {formatTime(b().startTime - b().cancelCutoffMins * 60)}
              </div>
            </div>
          </Show>
          <Show when={b().bookingStatus === 'booked' && !isPast(b().startTime)}>
            <div>
              <div class="text-[var(--text-muted)] text-sm mb-0.5">ID</div>
              <Show when={explorerTxUrl()} fallback={
                <div class="text-[var(--text-primary)] font-mono text-sm">{truncateHash(displayTxHash())}</div>
              }>
                <a
                  href={explorerTxUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-[var(--text-primary)] hover:text-[oklch(0.65_0.12_240)] transition-colors font-mono text-sm"
                >
                  {truncateHash(displayTxHash())}
                  <ExternalLinkIcon />
                </a>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      {/* Primary action area */}
      <Show when={b().bookingStatus === 'booked'}>
        <div class="flex gap-2">
          <Show when={canCancel() && props.onCancelBooking}>
            <Button
              onClick={props.onCancelBooking}
              variant="secondary"
              class="flex-1"
            >
              Cancel
            </Button>
          </Show>
          <Show when={props.onJoinSession}>
            <Button
              onClick={props.onJoinSession}
              disabled={!canJoin()}
              class="flex-1"
            >
              Join
            </Button>
          </Show>
        </div>
      </Show>

      {/* Pending request actions */}
      <Show when={b().bookingStatus === 'pending'}>
        <Show when={b().isHost}>
          <div class="flex gap-2">
            <Show when={props.onDeclineRequest}>
              <Button onClick={props.onDeclineRequest} variant="secondary" class="flex-1">
                Decline
              </Button>
            </Show>
            <Show when={props.onAcceptRequest}>
              <Button onClick={props.onAcceptRequest} class="flex-1">
                Accept
              </Button>
            </Show>
          </div>
        </Show>
        <Show when={!b().isHost && props.onCancelBooking}>
          <Button onClick={props.onCancelBooking} variant="secondary" class="w-full">
            Withdraw Request
          </Button>
        </Show>
      </Show>

      {/* Outcome info (only show for non-completed outcomes or if there's payment info) */}
      <Show when={outcomeDesc() && (b().outcome !== 'completed' || paymentInfo())}>
        <div class={cn(
          'rounded-md p-4 text-base',
          b().outcome === 'completed' && 'bg-green-500/10 border border-green-500/20',
          (b().outcome === 'no-show-host' || b().outcome === 'no-show-guest') && 'bg-yellow-500/10 border border-yellow-500/20',
          (b().outcome === 'cancelled-by-host' || b().outcome === 'cancelled-by-guest') && 'bg-[var(--bg-elevated)] border border-[var(--bg-highlight)]'
        )}>
          <Show when={b().outcome !== 'completed'}>
            <div class="text-[var(--text-primary)]">{outcomeDesc()}</div>
          </Show>
          <Show when={paymentInfo()}>
            <div class={cn(
              'flex items-center justify-between',
              b().outcome === 'completed' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] mt-1'
            )}>
              <span>{paymentInfo()}</span>
              <Show when={paymentTxUrl()}>
                <a
                  href={paymentTxUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                  aria-label="View transaction"
                >
                  <ExternalLinkIcon />
                </a>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

      {/* Report problem (hidden by default, expands on click) */}
      <Show when={canReportProblem() && props.onReportProblem}>
        <Show when={!showProblemOptions()} fallback={
          <div class="rounded-md bg-[var(--bg-elevated)] p-4 flex flex-col gap-3">
            <div class="text-sm text-[var(--text-secondary)]">
              If something went wrong with this session, you can dispute the recorded outcome.
              This requires a small bond that will be returned if your dispute is valid.
            </div>
            <div class="flex gap-2">
              <Button
                onClick={() => setShowProblemOptions(false)}
                variant="secondary"
                class="flex-1"
              >
                Never mind
              </Button>
              <Button
                onClick={props.onReportProblem}
                variant="secondary"
                class="flex-1 text-[oklch(0.65_0.18_15)]"
              >
                Dispute Result
              </Button>
            </div>
          </div>
        }>
          <button
            onClick={() => setShowProblemOptions(true)}
            class="text-base text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors text-center py-2"
          >
            Something wrong?
          </button>
        </Show>
      </Show>

    </div>
  )
}
