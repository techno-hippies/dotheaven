import { createPublicClient, http, parseAbi, formatEther, parseEther, encodeFunctionData, type Address, type Hex } from 'viem'
import { megaTestnetV2 } from '../chains'

// SessionEscrowV1 — deployed on MegaETH Testnet (chainId 6343)
export const SESSION_ESCROW_V1 = '0x132212B78C4a7A3F19DE1BF63f119848c765c1d2' as const

// Chain ID for channel naming
const CHAIN_ID = 6343

// ── Enums (mirror Solidity) ────────────────────────────────────────

export enum SlotStatus { Open, Booked, Cancelled, Settled }
export enum BookingStatus { None, Booked, Cancelled, Attested, Disputed, Resolved, Finalized }
export enum RequestStatus { None, Open, Cancelled, Accepted }
export enum Outcome { None, Completed, NoShowHost, NoShowGuest, CancelledByHost, CancelledByGuest }

// ── Types ──────────────────────────────────────────────────────────

export interface SessionSlot {
  id: number
  host: Address
  startTime: number
  durationMins: number
  priceEth: string
  graceMins: number
  minOverlapMins: number
  cancelCutoffMins: number
  status: SlotStatus
}

export interface SessionBooking {
  id: number
  slotId: number
  guest: Address
  amountEth: string
  status: BookingStatus
  oracleOutcome: Outcome
  attestedAt: number
  finalizableAt: number
}

export interface SessionRequest {
  id: number
  hostTarget: Address
  guest: Address
  windowStart: number
  windowEnd: number
  durationMins: number
  amountEth: string
  expiry: number
  status: RequestStatus
  slotId: number
  bookingId: number
  host: Address
}

// ── ABI ────────────────────────────────────────────────────────────

const escrowAbi = parseAbi([
  'function hostBasePrice(address host) external view returns (uint256)',
  'function feeBps() external view returns (uint16)',
  'function nextSlotId() external view returns (uint256)',
  'struct SessionSlot { address host; uint48 startTime; uint32 durationMins; uint256 price; uint32 graceMins; uint32 minOverlapMins; uint32 cancelCutoffMins; uint8 status; }',
  'function slots(uint256 slotId) external view returns (SessionSlot)',
  'struct SessionBooking { uint256 slotId; address guest; uint256 amount; uint8 status; uint8 oracleOutcome; bytes32 metricsHash; uint48 attestedAt; uint48 finalizableAt; address challenger; uint256 bondAmount; uint48 disputedAt; }',
  'function bookings(uint256 bookingId) external view returns (SessionBooking)',
  'struct SessionRequest { address hostTarget; address guest; uint48 windowStart; uint48 windowEnd; uint32 durationMins; uint256 amount; uint48 expiry; uint8 status; uint256 slotId; uint256 bookingId; address host; }',
  'function requests(uint256 requestId) external view returns (SessionRequest)',
])

// ── Client ─────────────────────────────────────────────────────────

function getClient() {
  return createPublicClient({
    chain: megaTestnetV2,
    transport: http(megaTestnetV2.rpcUrls.default.http[0]),
  })
}

// ── Read Functions ─────────────────────────────────────────────────

export async function getHostBasePrice(host: Address): Promise<string> {
  const client = getClient()
  const price = await client.readContract({
    address: SESSION_ESCROW_V1,
    abi: escrowAbi,
    functionName: 'hostBasePrice',
    args: [host],
  })
  return formatEther(price)
}

export async function getHostOpenSlots(host: Address): Promise<SessionSlot[]> {
  // TODO: When contract is deployed, iterate slots or use subgraph
  // For now return empty array
  void host
  return []
}

export async function getSlot(slotId: number): Promise<SessionSlot> {
  const client = getClient()
  const raw = await client.readContract({
    address: SESSION_ESCROW_V1,
    abi: escrowAbi,
    functionName: 'slots',
    args: [BigInt(slotId)],
  })
  return {
    id: slotId,
    host: raw.host,
    startTime: Number(raw.startTime),
    durationMins: Number(raw.durationMins),
    priceEth: formatEther(raw.price),
    graceMins: Number(raw.graceMins),
    minOverlapMins: Number(raw.minOverlapMins),
    cancelCutoffMins: Number(raw.cancelCutoffMins),
    status: Number(raw.status) as SlotStatus,
  }
}

export async function getBooking(bookingId: number): Promise<SessionBooking> {
  const client = getClient()
  const raw = await client.readContract({
    address: SESSION_ESCROW_V1,
    abi: escrowAbi,
    functionName: 'bookings',
    args: [BigInt(bookingId)],
  })
  return {
    id: bookingId,
    slotId: Number(raw.slotId),
    guest: raw.guest,
    amountEth: formatEther(raw.amount),
    status: Number(raw.status) as BookingStatus,
    oracleOutcome: Number(raw.oracleOutcome) as Outcome,
    attestedAt: Number(raw.attestedAt),
    finalizableAt: Number(raw.finalizableAt),
  }
}

export async function getRequest(requestId: number): Promise<SessionRequest> {
  const client = getClient()
  const raw = await client.readContract({
    address: SESSION_ESCROW_V1,
    abi: escrowAbi,
    functionName: 'requests',
    args: [BigInt(requestId)],
  })
  return {
    id: requestId,
    hostTarget: raw.hostTarget,
    guest: raw.guest,
    windowStart: Number(raw.windowStart),
    windowEnd: Number(raw.windowEnd),
    durationMins: Number(raw.durationMins),
    amountEth: formatEther(raw.amount),
    expiry: Number(raw.expiry),
    status: Number(raw.status) as RequestStatus,
    slotId: Number(raw.slotId),
    bookingId: Number(raw.bookingId),
    host: raw.host,
  }
}

export async function getFeeBps(): Promise<number> {
  const client = getClient()
  const bps = await client.readContract({
    address: SESSION_ESCROW_V1,
    abi: escrowAbi,
    functionName: 'feeBps',
  })
  return Number(bps)
}

export async function getNextSlotId(): Promise<number> {
  const client = getClient()
  const id = await client.readContract({
    address: SESSION_ESCROW_V1,
    abi: escrowAbi,
    functionName: 'nextSlotId',
  })
  return Number(id)
}

export async function getNextBookingId(): Promise<number> {
  const client = getClient()
  const abi = parseAbi(['function nextBookingId() external view returns (uint256)'])
  const id = await client.readContract({
    address: SESSION_ESCROW_V1,
    abi,
    functionName: 'nextBookingId',
  })
  return Number(id)
}

/**
 * Get bookings where user is host or guest
 * Fetches all existing bookings in parallel for speed.
 * For production with many bookings, use a subgraph.
 */
export async function getUserBookings(
  userAddress: Address,
  options?: { limit?: number; includeFinalized?: boolean }
): Promise<{ booking: SessionBooking; slot: SessionSlot; isHost: boolean }[]> {
  const limit = options?.limit ?? 20
  const includeFinalized = options?.includeFinalized ?? false
  const userLower = userAddress.toLowerCase()

  // Get total booking count first
  const nextId = await getNextBookingId()
  if (nextId <= 1) return []

  // Fetch all bookings in parallel
  const bookingIds = Array.from({ length: nextId - 1 }, (_, i) => i + 1)
  const bookings = await Promise.all(
    bookingIds.map(id => getBooking(id).catch(() => null))
  )

  // Filter to user's bookings and get slots
  const userBookings = bookings
    .filter((b): b is SessionBooking =>
      b !== null &&
      b.status !== BookingStatus.None &&
      (includeFinalized || b.status !== BookingStatus.Finalized)
    )

  // Fetch slots in parallel
  const slotIds = [...new Set(userBookings.map(b => b.slotId))]
  const slotsMap = new Map<number, SessionSlot>()
  const slots = await Promise.all(
    slotIds.map(id => getSlot(id).catch(() => null))
  )
  slots.forEach((slot, i) => {
    if (slot) slotsMap.set(slotIds[i], slot)
  })

  // Build results
  const results: { booking: SessionBooking; slot: SessionSlot; isHost: boolean }[] = []
  for (const booking of userBookings) {
    const slot = slotsMap.get(booking.slotId)
    if (!slot) continue

    const isHost = slot.host.toLowerCase() === userLower
    const isGuest = booking.guest.toLowerCase() === userLower

    if (isHost || isGuest) {
      results.push({ booking, slot, isHost })
    }
  }

  // Sort by start time, upcoming first
  results.sort((a, b) => a.slot.startTime - b.slot.startTime)

  return results.slice(0, limit)
}

// ── Write Function Encoders ───────────────────────────────────────
// For use with wallet sendTransaction or AA UserOps

const writeAbi = parseAbi([
  'function setHostBasePrice(uint256 priceWei) external',
  'function createSlot(uint48 startTime, uint32 durationMins, uint32 graceMins, uint32 minOverlapMins, uint32 cancelCutoffMins) external returns (uint256)',
  'function cancelSlot(uint256 slotId) external',
  'function book(uint256 slotId) external payable returns (uint256)',
  'function cancelBookingAsGuest(uint256 bookingId) external',
  'function cancelBookingAsHost(uint256 bookingId) external',
  'function challenge(uint256 bookingId) external payable',
  'function finalize(uint256 bookingId) external',
])

export interface SlotInput {
  startTime: number
  durationMins: number
  graceMins?: number
  minOverlapMins?: number
  cancelCutoffMins?: number
}

export function encodeSetBasePrice(priceEth: string): Hex {
  return encodeFunctionData({
    abi: writeAbi,
    functionName: 'setHostBasePrice',
    args: [parseEther(priceEth)],
  })
}

export function encodeCreateSlot(input: SlotInput): Hex {
  return encodeFunctionData({
    abi: writeAbi,
    functionName: 'createSlot',
    args: [
      BigInt(input.startTime) as unknown as number, // uint48
      input.durationMins,
      input.graceMins ?? 5,
      input.minOverlapMins ?? Math.floor(input.durationMins / 2),
      input.cancelCutoffMins ?? 60,
    ],
  })
}

export function encodeCancelSlot(slotId: number): Hex {
  return encodeFunctionData({
    abi: writeAbi,
    functionName: 'cancelSlot',
    args: [BigInt(slotId)],
  })
}

export function encodeBook(slotId: number): Hex {
  return encodeFunctionData({
    abi: writeAbi,
    functionName: 'book',
    args: [BigInt(slotId)],
  })
}

export function encodeCancelBookingAsGuest(bookingId: number): Hex {
  return encodeFunctionData({
    abi: writeAbi,
    functionName: 'cancelBookingAsGuest',
    args: [BigInt(bookingId)],
  })
}

export function encodeCancelBookingAsHost(bookingId: number): Hex {
  return encodeFunctionData({
    abi: writeAbi,
    functionName: 'cancelBookingAsHost',
    args: [BigInt(bookingId)],
  })
}

export function encodeChallenge(bookingId: number): Hex {
  return encodeFunctionData({
    abi: writeAbi,
    functionName: 'challenge',
    args: [BigInt(bookingId)],
  })
}

export function encodeFinalize(bookingId: number): Hex {
  return encodeFunctionData({
    abi: writeAbi,
    functionName: 'finalize',
    args: [BigInt(bookingId)],
  })
}

// ── Channel Helpers ───────────────────────────────────────────────

/**
 * Generate a booking channel ID for Agora
 * Format: heaven-{chainId}-{bookingId}
 * Both parties use the same channel to join the call
 */
export function getBookingChannel(bookingId: number | string): string {
  return `heaven-${CHAIN_ID}-${bookingId}`
}

/**
 * Parse booking ID from channel name
 */
export function parseBookingChannel(channel: string): number | null {
  const match = channel.match(/^heaven-\d+-(\d+)$/)
  return match ? parseInt(match[1], 10) : null
}
