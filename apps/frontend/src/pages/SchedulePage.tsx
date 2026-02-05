import { type Component, createSignal, createResource, Show } from 'solid-js'
import {
  UpcomingSessions,
  BookingDetail,
  type BookingData,
  type BookingDetailData,
} from '@heaven/ui'
import { useAuth } from '../providers/AuthContext'
import {
  getUserBookings,
  SlotStatus,
  BookingStatus,
  Outcome,
  type SessionSlot,
  type SessionBooking,
  encodeCancelBookingAsGuest,
  encodeCancelBookingAsHost,
  SESSION_ESCROW_V1,
} from '../lib/heaven/escrow'
import { getPrimaryName, getTextRecord } from '../lib/heaven/registry'
import { useP2PVoice } from '../lib/voice/useP2PVoice'
import type { Address } from 'viem'

// Resolve IPFS/HTTP avatar URI to a URL
function resolveAvatarUrl(uri: string | undefined): string | undefined {
  if (!uri) return undefined
  if (uri.startsWith('ipfs://')) {
    return `https://heaven.myfilebase.com/ipfs/${uri.slice(7)}`
  }
  return uri
}

// Map contract status to UI status
function mapBookingStatus(
  slot: SessionSlot,
  booking: SessionBooking
): 'upcoming' | 'live' | 'completed' | 'cancelled' {
  const now = Math.floor(Date.now() / 1000)
  const startTime = slot.startTime
  const endTime = startTime + slot.durationMins * 60

  if (booking.status === BookingStatus.Cancelled) return 'cancelled'
  if (booking.status === BookingStatus.Finalized) return 'completed'

  // Within 5 minutes of start or during session = live
  if (now >= startTime - 300 && now <= endTime) return 'live'

  // Past end time
  if (now > endTime) return 'completed'

  return 'upcoming'
}

// Map outcome enum to string
function mapOutcome(outcome: Outcome): 'none' | 'completed' | 'no-show-host' | 'no-show-guest' {
  switch (outcome) {
    case Outcome.Completed: return 'completed'
    case Outcome.NoShowHost: return 'no-show-host'
    case Outcome.NoShowGuest: return 'no-show-guest'
    default: return 'none'
  }
}

// Map slot status to string
function mapSlotStatus(status: SlotStatus): 'open' | 'booked' | 'cancelled' | 'settled' {
  switch (status) {
    case SlotStatus.Open: return 'open'
    case SlotStatus.Booked: return 'booked'
    case SlotStatus.Cancelled: return 'cancelled'
    case SlotStatus.Settled: return 'settled'
    default: return 'open'
  }
}

// Map booking status to string
function mapBookingStatusStr(status: BookingStatus): 'booked' | 'cancelled' | 'attested' | 'disputed' | 'resolved' | 'finalized' {
  switch (status) {
    case BookingStatus.Booked: return 'booked'
    case BookingStatus.Cancelled: return 'cancelled'
    case BookingStatus.Attested: return 'attested'
    case BookingStatus.Disputed: return 'disputed'
    case BookingStatus.Resolved: return 'resolved'
    case BookingStatus.Finalized: return 'finalized'
    default: return 'booked'
  }
}

interface BookingWithMeta {
  booking: SessionBooking
  slot: SessionSlot
  isHost: boolean
  counterpartyName?: string
  counterpartyAvatar?: string
}

export const SchedulePage: Component = () => {
  const auth = useAuth()

  // Create P2P voice hook with auth context
  const pkpInfo = () => auth.pkpInfo()
  const p2pVoice = useP2PVoice({
    pkpInfo: {
      tokenId: pkpInfo()?.tokenId || '',
      publicKey: pkpInfo()?.publicKey || '',
      ethAddress: pkpInfo()?.ethAddress || '',
    },
    signMessage: async (message: string) => {
      const sig = await auth.signMessage(message)
      return sig || ''
    },
    onPeerJoined: (uid) => console.log('[SchedulePage] Peer joined:', uid),
    onPeerLeft: (uid) => console.log('[SchedulePage] Peer left:', uid),
    onError: (error) => console.error('[SchedulePage] Voice error:', error),
  })

  const [selectedBookingId, setSelectedBookingId] = createSignal<number | null>(null)
  const [requestCount] = createSignal(0) // TODO: fetch pending requests
  const [_isLoading, setIsLoading] = createSignal(false)

  // Fetch user's bookings
  const [bookingsData, { refetch }] = createResource(
    () => auth.pkpAddress(),
    async (address) => {
      if (!address) return []
      const results = await getUserBookings(address as Address, { limit: 20 })

      // Resolve names and avatars for counterparties
      const enriched: BookingWithMeta[] = await Promise.all(
        results.map(async ({ booking, slot, isHost }) => {
          const counterparty = isHost ? booking.guest : slot.host
          let counterpartyName: string | undefined
          let counterpartyAvatar: string | undefined

          try {
            const primaryName = await getPrimaryName(counterparty)
            if (primaryName?.label) {
              counterpartyName = `${primaryName.label}.heaven`
              const avatar = await getTextRecord(counterparty, 'avatar')
              if (avatar) {
                counterpartyAvatar = resolveAvatarUrl(avatar)
              }
            }
          } catch {
            // Name resolution failed, use address
          }

          return { booking, slot, isHost, counterpartyName, counterpartyAvatar }
        })
      )

      return enriched
    }
  )

  // Convert to UI format
  const bookings = () => {
    const data = bookingsData() || []
    return data.map((item): BookingData => ({
      id: String(item.booking.id),
      startTime: item.slot.startTime,
      durationMins: item.slot.durationMins,
      guestAddress: item.isHost ? item.booking.guest : item.slot.host,
      guestName: item.counterpartyName,
      guestAvatar: item.counterpartyAvatar,
      status: mapBookingStatus(item.slot, item.booking),
    }))
  }

  // Get selected booking detail
  const selectedBookingDetail = () => {
    const id = selectedBookingId()
    if (!id) return null
    const data = bookingsData() || []
    return data.find(item => item.booking.id === id)
  }

  // Convert to detail format
  const toDetailData = (item: BookingWithMeta): BookingDetailData => {
    return {
      txHash: `0x${item.booking.id.toString().padStart(64, '0')}`,
      host: item.slot.host,
      hostName: item.isHost ? 'You' : item.counterpartyName,
      startTime: item.slot.startTime,
      durationMins: item.slot.durationMins,
      priceEth: item.slot.priceEth,
      cancelCutoffMins: item.slot.cancelCutoffMins,
      slotStatus: mapSlotStatus(item.slot.status),
      guest: item.booking.guest,
      guestName: item.isHost ? item.counterpartyName : 'You',
      guestAvatar: item.counterpartyAvatar,
      amountEth: item.booking.amountEth,
      bookingStatus: mapBookingStatusStr(item.booking.status),
      outcome: mapOutcome(item.booking.oracleOutcome),
      isHost: item.isHost,
      explorerUrl: 'https://megaeth-testnet-v2.blockscout.com',
    }
  }

  const handleBookingClick = (booking: BookingData) => {
    setSelectedBookingId(parseInt(booking.id, 10))
  }

  const handleBack = () => {
    setSelectedBookingId(null)
  }

  const handleSetAvailability = () => {
    // TODO: Navigate to availability settings or open modal
    console.log('Set availability clicked')
  }

  const handleViewRequests = () => {
    // TODO: Navigate to requests view or open modal
    console.log('View requests clicked')
  }

  const handleJoinSession = async () => {
    const item = selectedBookingDetail()
    if (!item) return

    setIsLoading(true)
    try {
      await p2pVoice.joinCall(String(item.booking.id))
    } catch (error) {
      console.error('Failed to join session:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelBooking = async () => {
    const item = selectedBookingDetail()
    if (!item) return

    if (!auth.pkpAddress()) return

    setIsLoading(true)
    try {
      // Encode the cancel transaction
      const data = item.isHost
        ? encodeCancelBookingAsHost(item.booking.id)
        : encodeCancelBookingAsGuest(item.booking.id)

      // Send transaction via wallet
      // For now, log - in production would use sendTransaction
      console.log('Cancel booking:', {
        to: SESSION_ESCROW_V1,
        data,
        bookingId: item.booking.id,
        isHost: item.isHost,
      })

      // TODO: Actually send the transaction via AA gateway or direct wallet

      setSelectedBookingId(null)
      refetch()
    } catch (error) {
      console.error('Failed to cancel booking:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLeaveSession = async () => {
    await p2pVoice.leaveCall()
  }

  return (
    <div class="h-full overflow-y-auto">
      <div class="w-full max-w-xl mx-auto px-4 py-6">
        <Show
          when={selectedBookingDetail()}
          fallback={
            <Show
              when={!bookingsData.loading}
              fallback={
                <div class="flex items-center justify-center py-12">
                  <div class="text-[--text-muted]">Loading sessions...</div>
                </div>
              }
            >
              <UpcomingSessions
                bookings={bookings()}
                onBookingClick={handleBookingClick}
                onSetAvailability={handleSetAvailability}
                onViewRequests={handleViewRequests}
                requestCount={requestCount()}
              />
            </Show>
          }
        >
          {(item) => (
            <div>
              <BookingDetail
                booking={toDetailData(item())}
                onBack={handleBack}
                onJoinSession={handleJoinSession}
                onCancelBooking={handleCancelBooking}
              />
              <Show when={p2pVoice.state() === 'connected'}>
                <div class="mt-4 p-4 bg-[--bg-surface] rounded-md">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div class="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                      <span class="text-[--text-primary]">In call</span>
                      <Show when={p2pVoice.peerConnected()}>
                        <span class="text-[--text-secondary]">• Peer connected</span>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        onClick={() => p2pVoice.toggleMute()}
                        class="px-3 py-1.5 text-sm bg-[--bg-highlight] hover:bg-[--bg-highlight-hover] rounded-md transition-colors"
                      >
                        {p2pVoice.isMuted() ? 'Unmute' : 'Mute'}
                      </button>
                      <button
                        onClick={handleLeaveSession}
                        class="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                      >
                        Leave
                      </button>
                    </div>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}
