import { type Component, createSignal, createResource, Show, onMount } from 'solid-js'
import {
  ScheduleDashboard,
  BookingDetail,
  UpcomingSessions,
  Button,
  IconButton,
  Switch,
  ChevronLeft,
  CalendarBlank,
  type BookingDetailData,
  type BookingData,
  type SessionSlotData,
} from '@heaven/ui'
import { createQuery } from '@tanstack/solid-query'
import { useNavigate } from '@solidjs/router'
import { SCHEDULE_AVAILABILITY } from '@heaven/core'
import { useAuth } from '../providers/AuthContext'
import { useI18n } from '@heaven/i18n/solid'
import {
  getUserBookings,
  getHostBasePrice,
  getHostOpenSlots,
  SlotStatus,
  BookingStatus,
  Outcome,
  type SessionSlot,
  type SessionBooking,
} from '../lib/heaven/escrow'
import {
  initSessionService,
  setBasePrice,
  createSlot,
  cancelSlot,
  cancelBooking,
} from '../lib/session-service'
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
  const { t } = useI18n()
  const navigate = useNavigate()

  // Initialize session service for direct PKP transactions
  onMount(() => {
    initSessionService({
      getAuthContext: () => auth.getAuthContext(),
      getPkp: () => auth.pkpInfo(),
    })
  })

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

  const [view, setView] = createSignal<'upcoming' | 'detail'>('upcoming')
  const [selectedBookingId, setSelectedBookingId] = createSignal<number | null>(null)
  const [_isLoading, setIsLoading] = createSignal(false)
  const [txError, setTxError] = createSignal<string | null>(null)

  // Fetch user's bookings
  const [bookingsData, { refetch: refetchBookings }] = createResource(
    () => auth.pkpAddress(),
    async (addr) => {
      if (!addr) return []
      const results = await getUserBookings(addr as Address, { limit: 20 })

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

  // ── Upcoming bookings for the UpcomingSessions view ──────────
  const upcomingBookings = (): BookingData[] => {
    const items = bookingsData() || []
    const now = Math.floor(Date.now() / 1000)
    return items
      .filter(item => {
        const status = item.booking.status
        return status === BookingStatus.Booked
      })
      .map(item => {
        const isLive = item.slot.startTime <= now && now < item.slot.startTime + item.slot.durationMins * 60
        const counterparty = item.counterpartyName
        const counterpartyAddr = item.isHost ? item.booking.guest : item.slot.host
        return {
          id: String(item.booking.id),
          startTime: item.slot.startTime,
          durationMins: item.slot.durationMins,
          guestAddress: counterpartyAddr,
          guestName: counterparty,
          guestAvatar: item.counterpartyAvatar,
          status: isLive ? 'live' as const : 'upcoming' as const,
        }
      })
      .sort((a, b) => a.startTime - b.startTime)
  }

  const handleBookingClick = (booking: BookingData) => {
    setSelectedBookingId(Number(booking.id))
    setView('detail')
  }

  // ── Booking detail handlers ───────────────────────────────────

  const selectedBookingDetail = () => {
    const id = selectedBookingId()
    if (!id) return null
    const data = bookingsData() || []
    return data.find(item => item.booking.id === id)
  }

  const toDetailData = (item: BookingWithMeta): BookingDetailData => ({
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
  })

  const handleBack = () => {
    setSelectedBookingId(null)
    setView('upcoming')
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
    if (!item || !auth.pkpAddress()) return

    setIsLoading(true)
    setTxError(null)
    try {
      await cancelBooking(item.booking.id, item.isHost)
      setSelectedBookingId(null)
      refetchBookings()
    } catch (err: any) {
      console.error('Failed to cancel booking:', err)
      setTxError(err?.message || 'Failed to cancel booking')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLeaveSession = async () => {
    await p2pVoice.leaveCall()
  }

  const loading = () => bookingsData.loading

  return (
    <div class="h-full overflow-y-auto">
      <Show when={view() === 'upcoming'}>
        <div class="flex justify-end px-4 pt-3">
          <Button
            variant="secondary"
            icon={<CalendarBlank />}
            onClick={() => navigate(SCHEDULE_AVAILABILITY)}
            class="h-12"
          >
            {t('schedule.availability')}
          </Button>
        </div>
      </Show>

      <div class="w-full max-w-4xl mx-auto px-4 py-6">
        {/* Error toast */}
        <Show when={txError()}>
          <div class="mb-4 px-4 py-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-base flex items-center justify-between">
            <span>{txError()}</span>
            <button onClick={() => setTxError(null)} class="text-red-300 hover:text-red-200 ml-4">
              {t('schedule.dismiss')}
            </button>
          </div>
        </Show>

        {/* View: Upcoming Sessions (default) */}
        <Show when={view() === 'upcoming'}>
          <Show
            when={!loading()}
            fallback={
              <div class="flex items-center justify-center py-12">
                <div class="text-[--text-muted]">{t('schedule.loadingSchedule')}</div>
              </div>
            }
          >
            <UpcomingSessions
              bookings={upcomingBookings()}
              onBookingClick={handleBookingClick}
            />
          </Show>
        </Show>

        {/* View: Booking Detail */}
        <Show when={view() === 'detail' && selectedBookingDetail()}>
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
                      <span class="text-[--text-primary]">{t('schedule.inCall')}</span>
                      <Show when={p2pVoice.peerConnected()}>
                        <span class="text-[--text-secondary]">• {t('schedule.peerConnected')}</span>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        onClick={() => p2pVoice.toggleMute()}
                        class="px-3 py-1.5 text-base bg-[--bg-highlight] hover:bg-[--bg-highlight-hover] rounded-md transition-colors"
                      >
                        {p2pVoice.isMuted() ? t('schedule.unmute') : t('schedule.mute')}
                      </button>
                      <button
                        onClick={handleLeaveSession}
                        class="px-3 py-1.5 text-base bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                      >
                        {t('schedule.leave')}
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

// ── Availability Page (separate route with header) ────────────────

export const ScheduleAvailabilityPage: Component = () => {
  const auth = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  onMount(() => {
    initSessionService({
      getAuthContext: () => auth.getAuthContext(),
      getPkp: () => auth.pkpInfo(),
    })
  })

  const [_isLoading, setIsLoading] = createSignal(false)
  const [txError, setTxError] = createSignal<string | null>(null)

  const address = () => auth.pkpAddress()

  const basePriceQuery = createQuery(() => ({
    queryKey: ['hostBasePrice', address()],
    queryFn: () => getHostBasePrice(address()! as Address),
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 5,
  }))

  const slotsQuery = createQuery(() => ({
    queryKey: ['hostSlots', address()],
    queryFn: async () => {
      const slots = await getHostOpenSlots(address()! as Address)
      return slots.map((s): SessionSlotData => ({
        id: s.id,
        startTime: s.startTime,
        durationMins: s.durationMins,
        priceEth: s.priceEth,
        status: s.status === SlotStatus.Open ? 'open' : s.status === SlotStatus.Booked ? 'booked' : s.status === SlotStatus.Cancelled ? 'cancelled' : 'settled',
      }))
    },
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 2,
  }))

  // Fetch bookings to enrich slots with guest names
  const [bookingsData] = createResource(
    () => auth.pkpAddress(),
    async (addr) => {
      if (!addr) return []
      const results = await getUserBookings(addr as Address, { limit: 20 })

      const enriched: BookingWithMeta[] = await Promise.all(
        results.map(async ({ booking, slot, isHost }) => {
          const counterparty = isHost ? booking.guest : slot.host
          let counterpartyName: string | undefined

          try {
            const primaryName = await getPrimaryName(counterparty)
            if (primaryName?.label) {
              counterpartyName = `${primaryName.label}.heaven`
            }
          } catch {
            // Name resolution failed
          }

          return { booking, slot, isHost, counterpartyName }
        })
      )

      return enriched
    }
  )

  const [scheduleAccepting, setScheduleAccepting] = createSignal(
    localStorage.getItem('heaven:schedule:accepting') === 'true'
  )
  const handleToggleAccepting = (accepting: boolean) => {
    setScheduleAccepting(accepting)
    localStorage.setItem('heaven:schedule:accepting', String(accepting))
  }

  const dashboardSlots = (): SessionSlotData[] => {
    const contractSlots = slotsQuery.data || []
    const bookingItems = bookingsData() || []

    return contractSlots.map(slot => {
      const bookingItem = bookingItems.find(
        b => b.slot.id === slot.id && b.isHost && b.booking.status === BookingStatus.Booked
      )
      if (bookingItem) {
        return { ...slot, guestName: bookingItem.counterpartyName }
      }
      return slot
    })
  }

  const handleSetBasePrice = async (priceEth: string) => {
    setTxError(null)
    setIsLoading(true)
    try {
      await setBasePrice(priceEth)
      basePriceQuery.refetch()
    } catch (err: any) {
      console.error('[ScheduleAvailability] setBasePrice failed:', err)
      setTxError(err?.message || 'Failed to set base price')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateSlot = async (startTime: number, durationMins: number) => {
    setTxError(null)
    try {
      await createSlot({ startTime, durationMins })
      slotsQuery.refetch()
    } catch (err: any) {
      console.error('[ScheduleAvailability] createSlot failed:', err)
      setTxError(err?.message || 'Failed to create slot')
    }
  }

  const handleRemoveSlot = async (slotId: number) => {
    setTxError(null)
    try {
      await cancelSlot(slotId)
      slotsQuery.refetch()
    } catch (err: any) {
      console.error('[ScheduleAvailability] cancelSlot failed:', err)
      setTxError(err?.message || 'Failed to cancel slot')
    }
  }

  return (
    <div class="flex flex-col h-full">
      {/* Header with back chevron + accepting toggle */}
      <div class="flex items-center gap-3 px-4 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-shrink-0">
        <IconButton
          variant="soft"
          size="md"
          aria-label="Back"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft class="w-5 h-5" />
        </IconButton>
        <span class="flex-1 text-base font-semibold text-[var(--text-primary)]">
          {t('schedule.availability')}
          <Show when={!scheduleAccepting()}>
            <span class="text-base font-normal text-[var(--text-muted)] ml-2">{t('schedule.paused')}</span>
          </Show>
        </span>
        <span class="text-base text-[var(--text-muted)] mr-1 hidden sm:inline">{t('schedule.accepting')}</span>
        <Switch
          checked={scheduleAccepting()}
          onChange={handleToggleAccepting}
        />
      </div>

      <div class={`flex-1 overflow-y-auto transition-opacity ${!scheduleAccepting() ? 'opacity-60' : ''}`}>
        <div class="w-full max-w-4xl mx-auto px-4 py-6">
          <Show when={!scheduleAccepting()}>
            <div class="mb-4 px-4 py-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-base">
              {t('schedule.bookingsPaused')}
            </div>
          </Show>
          <ScheduleDashboard
            basePrice={basePriceQuery.data}
            acceptingBookings={scheduleAccepting()}
            onSetBasePrice={handleSetBasePrice}
            onToggleAccepting={handleToggleAccepting}
            slots={dashboardSlots()}
            slotsLoading={slotsQuery.isLoading}
            onCreateSlot={handleCreateSlot}
            onRemoveSlot={handleRemoveSlot}
          />
        </div>
      </div>

      {/* Bottom-right error toast */}
      <Show when={txError()}>
        <div class="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-base flex items-center gap-3 shadow-lg backdrop-blur-sm max-w-sm">
          <span class="flex-1">{txError()}</span>
          <button onClick={() => setTxError(null)} class="text-red-300 hover:text-red-200 flex-shrink-0">
            {t('schedule.dismiss')}
          </button>
        </div>
      </Show>
    </div>
  )
}
