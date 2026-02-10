/**
 * useSchedule — schedule/escrow state for profile pages.
 *
 * Works for both own profile (host operations) and public profile (guest operations).
 * Queries base price and open slots from SessionEscrowV1.
 */

import { createSignal, createEffect } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import type { TimeSlot } from '@heaven/ui'
import type { Address } from 'viem'
import { parseEther } from 'viem'
import { getHostBasePrice, getHostOpenSlots, getSlot } from '../lib/heaven/escrow'
import {
  setBasePrice as setBasePriceTx,
  cancelSlot as cancelSlotTx,
  bookSlot as bookSlotTx,
  createRequest as createRequestTx,
} from '../lib/session-service'
import { mapSlotData } from '../pages/profile-utils'

export function useSchedule(
  address: () => string | null | undefined,
  opts?: { isOwner?: boolean },
) {
  const isOwner = opts?.isOwner ?? false

  // Owner-only localStorage-backed state
  const [availability, setAvailability] = createSignal<TimeSlot[]>(
    isOwner ? JSON.parse(localStorage.getItem('heaven:schedule:availability') || '[]') : []
  )
  const [accepting, setAccepting] = createSignal(
    isOwner ? localStorage.getItem('heaven:schedule:accepting') === 'true' : false
  )

  if (isOwner) {
    createEffect(() => {
      localStorage.setItem('heaven:schedule:availability', JSON.stringify(availability()))
    })
    createEffect(() => {
      localStorage.setItem('heaven:schedule:accepting', String(accepting()))
    })
  }

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
      return mapSlotData(slots)
    },
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 2,
  }))

  // Owner handlers
  const handleSetBasePrice = async (priceEth: string) => {
    try {
      await setBasePriceTx(priceEth)
      basePriceQuery.refetch()
    } catch (err) {
      console.error('[Schedule] setBasePrice failed:', err)
    }
  }

  const handleCancelSlot = async (slotId: number) => {
    try {
      await cancelSlotTx(slotId)
      slotsQuery.refetch()
    } catch (err) {
      console.error('[Schedule] cancelSlot failed:', err)
    }
  }

  // Guest handlers
  const handleBookSlot = async (slotId: number) => {
    try {
      const slot = await getSlot(slotId)
      const priceWei = parseEther(slot.priceEth)
      await bookSlotTx(slotId, priceWei)
      slotsQuery.refetch()
    } catch (err) {
      console.error('[Schedule] bookSlot failed:', err)
    }
  }

  const handleRequestCustomTime = async (params: { windowStart: number; windowEnd: number; durationMins: number; amountEth: string }) => {
    const hostAddr = address()
    if (!hostAddr) return
    try {
      await createRequestTx({
        hostTarget: hostAddr as `0x${string}`,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        durationMins: params.durationMins,
        expiry: Math.floor(Date.now() / 1000) + 86400 * 7,
        amountWei: parseEther(params.amountEth),
      })
      slotsQuery.refetch()
    } catch (err) {
      console.error('[Schedule] createRequest failed:', err)
    }
  }

  return {
    basePriceQuery,
    slotsQuery,
    availability,
    setAvailability,
    accepting,
    setAccepting,
    handleSetBasePrice,
    handleCancelSlot,
    handleBookSlot,
    handleRequestCustomTime,
  }
}
