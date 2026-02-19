/**
 * Session Routes — backward-compatible booked session endpoints
 *
 * POST /join       → join booked session, get Agora token
 * POST /:id/leave  → leave booked session
 * POST /:id/attest → oracle attestation (service-token gated)
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { verifyJWT } from '../auth'
import { addressToUid, getBookedChannel } from '../agora'
import {
  getBooking,
  getSlot,
  BookingStatus,
  Outcome,
  attestOutcome,
  computeMetricsHash,
} from '../escrow'
import { JOIN_WINDOW_BEFORE_MINUTES, ROOM_CAPACITY_BOOKED } from '../config'

export const sessionRoutes = new Hono<{ Bindings: Env }>()

type AttestationOutcomeStr = 'completed' | 'no-show-host' | 'no-show-guest'

interface AttestationWindows {
  noShowEarliest: number
  noShowLatest: number
  completedEarliest: number
  completedLatest: number
}

export function getAttestationWindows(slot: {
  startTime: number
  durationMins: number
  graceMins: number
  minOverlapMins: number
}): AttestationWindows {
  const start = slot.startTime
  const durationSeconds = slot.durationMins * 60
  const end = start + durationSeconds
  const graceEnd = start + slot.graceMins * 60

  return {
    // Matches SessionEscrowV1.sol:
    // no-show attest in [start+grace, start+grace+duration]
    noShowEarliest: graceEnd,
    noShowLatest: graceEnd + durationSeconds,
    // completed attest in [start+minOverlap, end+2h]
    completedEarliest: start + slot.minOverlapMins * 60,
    completedLatest: end + 2 * 60 * 60,
  }
}

export function validateAttestationWindow(
  outcome: AttestationOutcomeStr,
  now: number,
  windows: AttestationWindows,
): { ok: true } | { ok: false; error: string } {
  if (outcome === 'completed') {
    if (now < windows.completedEarliest) return { ok: false, error: 'overlap_not_met' }
    if (now > windows.completedLatest) return { ok: false, error: 'completed_too_late' }
    return { ok: true }
  }

  if (now < windows.noShowEarliest) return { ok: false, error: 'grace_not_over' }
  if (now > windows.noShowLatest) return { ok: false, error: 'no_show_too_late' }
  return { ok: true }
}

function isSessionEscrowMock(env: Env): boolean {
  return (env.SESSION_ESCROW_MODE ?? 'live') === 'mock'
}

/** Auth middleware for session endpoints (skip attest) */
async function requireAuth(c: any, env: Env): Promise<string | null> {
  const auth = c.req.header('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET)
  return payload?.sub ?? null
}

/**
 * POST /join
 * Body: { booking_id: string }
 * Response: { channel, agora_token, user_uid }
 */
sessionRoutes.post('/join', async (c) => {
  const wallet = await requireAuth(c, c.env)
  if (!wallet) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const body = await c.req.json<{ booking_id: string }>()
  if (!body.booking_id) {
    return c.json({ error: 'missing booking_id' }, 400)
  }

  const bookingIdStr = body.booking_id.trim()
  if (!/^\d+$/.test(bookingIdStr)) {
    return c.json({ error: 'invalid booking_id' }, 400)
  }

  let bookingId: bigint
  try {
    bookingId = BigInt(bookingIdStr)
  } catch {
    return c.json({ error: 'invalid booking_id' }, 400)
  }

  const isMock = isSessionEscrowMock(c.env)

  // Get booking from contract
  const booking = await getBooking(c.env.RPC_URL, c.env.ESCROW_ADDRESS, bookingId, isMock)
  if (!booking) {
    return c.json({ error: 'booking not found' }, 404)
  }

  if (booking.status !== BookingStatus.Booked) {
    return c.json({ error: 'booking not active' }, 400)
  }

  // Get slot details
  const slot = await getSlot(c.env.RPC_URL, c.env.ESCROW_ADDRESS, booking.slotId, isMock)
  if (!slot) {
    return c.json({ error: 'slot not found' }, 404)
  }

  // Check caller is host or guest
  const walletLower = wallet.toLowerCase()
  const isHost = slot.host.toLowerCase() === walletLower
  const isGuest = booking.guest.toLowerCase() === walletLower
  if (!isHost && !isGuest) {
    return c.json({ error: 'not a participant' }, 403)
  }

  // Check join window
  const now = Math.floor(Date.now() / 1000)
  const joinStart = slot.startTime - JOIN_WINDOW_BEFORE_MINUTES * 60
  const joinEnd = slot.startTime + slot.durationMins * 60
  if (now < joinStart) {
    return c.json({ error: 'too early to join' }, 400)
  }
  if (now > joinEnd) {
    return c.json({ error: 'session has ended' }, 400)
  }

  const channel = getBookedChannel(c.env.CHAIN_ID, bookingIdStr)
  const agoraUid = addressToUid(wallet)
  const roomId = `booked-${bookingIdStr}`
  const connectionId = crypto.randomUUID()

  // Auto-create room row if first joiner
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO rooms (room_id, room_type, booking_id, host_wallet, capacity, status, created_at)
     VALUES (?, 'booked', ?, ?, ?, 'active', ?)`,
  ).bind(roomId, Number(bookingIdStr), slot.host.toLowerCase(), ROOM_CAPACITY_BOOKED, new Date().toISOString()).run()

  // Initialize DO + join (DO first, then D1 participant insert — Fix #5)
  const doId = c.env.ROOM_DO.idFromName(roomId)
  const stub = c.env.ROOM_DO.get(doId)

  // Init (idempotent — DO ignores if already initialized)
  const initResp = await stub.fetch(new Request('http://do/init', {
    method: 'POST',
    body: JSON.stringify({
      roomId,
      roomType: 'booked',
      hostWallet: slot.host.toLowerCase(),
      capacity: ROOM_CAPACITY_BOOKED,
      channel,
      chainId: c.env.CHAIN_ID,
      bookingId: bookingIdStr,
    }),
  }))

  if (!initResp.ok) {
    const err = await initResp.json<any>().catch(() => ({ error: 'do_init_failed' }))
    return c.json({ error: err.error || 'do_init_failed' }, 500)
  }

  // Join DO first — if this fails, no stale D1 row
  const doResp = await stub.fetch(new Request('http://do/join', {
    method: 'POST',
    body: JSON.stringify({ connectionId, wallet, agoraUid }),
  }))

  if (!doResp.ok) {
    const doErr = await doResp.json<any>()
    return c.json(doErr, doResp.status as any)
  }

  const doResult = await doResp.json<any>()

  // Insert participant in D1 only after DO confirms; compensate on failure
  try {
    await c.env.DB.prepare(
      `INSERT INTO room_participants (connection_id, room_id, wallet, agora_uid, joined_at_epoch, last_metered_at_epoch)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(connectionId, roomId, wallet, agoraUid, now, now).run()
  } catch (e) {
    await stub.fetch(new Request('http://do/leave', {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    })).catch(() => {})
    throw e
  }

  console.log(`[session/join] booking=${bookingIdStr} wallet=${wallet} uid=${agoraUid}`)

  // Backward-compatible response shape
  return c.json({
    channel,
    agora_token: doResult.agora_token,
    user_uid: agoraUid,
  })
})

/**
 * POST /:id/leave
 * Response: { ok, duration_ms }
 */
sessionRoutes.post('/:id/leave', async (c) => {
  const wallet = await requireAuth(c, c.env)
  if (!wallet) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const bookingIdStr = c.req.param('id')
  const roomId = `booked-${bookingIdStr}`
  const now = Math.floor(Date.now() / 1000)

  // Find active connection for this wallet in this room
  const participant = await c.env.DB.prepare(
    'SELECT connection_id, joined_at_epoch FROM room_participants WHERE room_id = ? AND wallet = ? AND left_at_epoch IS NULL',
  ).bind(roomId, wallet).first<{ connection_id: string; joined_at_epoch: number }>()

  if (!participant) {
    return c.json({ ok: true, duration_ms: 0 })
  }

  // Leave via DO
  const doId = c.env.ROOM_DO.idFromName(roomId)
  const stub = c.env.ROOM_DO.get(doId)
  const doResp = await stub.fetch(new Request('http://do/leave', {
    method: 'POST',
    body: JSON.stringify({ connectionId: participant.connection_id }),
  }))

  if (!doResp.ok) {
    const doErr = await doResp.json<any>().catch(() => ({ error: 'do_leave_failed' }))
    console.error(`[session/leave] DO leave failed: ${JSON.stringify(doErr)}`)
    return c.json({ error: doErr.error || 'leave_failed' }, 500)
  }

  const durationMs = (now - participant.joined_at_epoch) * 1000

  console.log(`[session/leave] booking=${bookingIdStr} wallet=${wallet} duration=${durationMs}ms`)

  return c.json({ ok: true, duration_ms: durationMs })
})

/**
 * POST /:id/attest
 * Oracle attestation for booked sessions.
 *
 * Fix #1: Requires ORACLE_SERVICE_TOKEN header for authentication.
 * Fix #7: Enforces minOverlapMins from slot parameters for 'completed' outcome.
 */
sessionRoutes.post('/:id/attest', async (c) => {
  // Fix #1: Require service token (not publicly callable)
  if (!c.env.ORACLE_SERVICE_TOKEN) {
    return c.json({ error: 'oracle not configured' }, 503)
  }

  const serviceToken = c.req.header('x-service-token')
  if (!serviceToken || serviceToken !== c.env.ORACLE_SERVICE_TOKEN) {
    return c.json({ error: 'forbidden' }, 403)
  }

  if (!c.env.ORACLE_PRIVATE_KEY) {
    return c.json({ error: 'oracle key not configured' }, 503)
  }

  const bookingIdStr = c.req.param('id').trim()
  if (!/^\d+$/.test(bookingIdStr)) {
    return c.json({ error: 'invalid booking_id' }, 400)
  }

  let bookingId: bigint
  try {
    bookingId = BigInt(bookingIdStr)
  } catch {
    return c.json({ error: 'invalid booking_id' }, 400)
  }

  const isMock = isSessionEscrowMock(c.env)

  const booking = await getBooking(c.env.RPC_URL, c.env.ESCROW_ADDRESS, bookingId, isMock)
  if (!booking) {
    return c.json({ error: 'booking not found' }, 404)
  }

  if (booking.status !== BookingStatus.Booked) {
    return c.json({ error: `booking status is ${BookingStatus[booking.status]}, expected Booked` }, 400)
  }

  const slot = await getSlot(c.env.RPC_URL, c.env.ESCROW_ADDRESS, booking.slotId, isMock)
  if (!slot) {
    return c.json({ error: 'slot not found' }, 404)
  }

  // Fix #1: force_outcome only in development
  const forceOutcome = c.req.query('force_outcome')
  if (forceOutcome && c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'force_outcome not allowed in production' }, 400)
  }

  // Get participation records
  const roomId = `booked-${bookingIdStr}`
  const hostP = await c.env.DB.prepare(
    'SELECT joined_at_epoch, left_at_epoch FROM room_participants WHERE room_id = ? AND wallet = ?',
  ).bind(roomId, slot.host.toLowerCase()).first<{ joined_at_epoch: number; left_at_epoch: number | null }>()

  const guestP = await c.env.DB.prepare(
    'SELECT joined_at_epoch, left_at_epoch FROM room_participants WHERE room_id = ? AND wallet = ?',
  ).bind(roomId, booking.guest.toLowerCase()).first<{ joined_at_epoch: number; left_at_epoch: number | null }>()

  let outcomeStr: AttestationOutcomeStr | null = null

  if (forceOutcome) {
    if (!['completed', 'no-show-host', 'no-show-guest'].includes(forceOutcome)) {
      return c.json({ error: 'invalid force_outcome' }, 400)
    }
    outcomeStr = forceOutcome as AttestationOutcomeStr
  } else {
    const now = Math.floor(Date.now() / 1000)
    const windows = getAttestationWindows(slot)
    const endTime = slot.startTime + slot.durationMins * 60

    if (hostP && guestP) {
      // Fix #7: Check minimum overlap threshold from slot
      const hostEnd = hostP.left_at_epoch ?? now
      const guestEnd = guestP.left_at_epoch ?? now
      const overlapStart = Math.max(hostP.joined_at_epoch, guestP.joined_at_epoch)
      const overlapEnd = Math.min(hostEnd, guestEnd)
      const overlapSeconds = Math.max(0, overlapEnd - overlapStart)
      const minOverlapSeconds = slot.minOverlapMins * 60

      if (overlapSeconds >= minOverlapSeconds) {
        outcomeStr = 'completed'
      } else {
        // Both joined but insufficient overlap — determine who caused it
        // If host left early (before guest left and before end time), blame host
        if (hostEnd < guestEnd && hostEnd < endTime) {
          outcomeStr = 'no-show-host'
        } else {
          outcomeStr = 'no-show-guest'
        }
      }
    } else if (!hostP) {
      outcomeStr = 'no-show-host'
    } else {
      outcomeStr = 'no-show-guest'
    }

    const timing = validateAttestationWindow(outcomeStr, now, windows)
    if (!timing.ok) {
      return c.json({ error: timing.error }, 400)
    }
  }

  let outcome: Outcome
  switch (outcomeStr) {
    case 'completed': outcome = Outcome.Completed; break
    case 'no-show-host': outcome = Outcome.NoShowHost; break
    case 'no-show-guest': outcome = Outcome.NoShowGuest; break
    default: return c.json({ error: 'invalid outcome' }, 400)
  }

  // Compute metrics hash
  const now = Math.floor(Date.now() / 1000)
  const hostJoinedAt = hostP?.joined_at_epoch ?? 0
  const hostLeftAt = hostP?.left_at_epoch ?? now
  const guestJoinedAt = guestP?.joined_at_epoch ?? 0
  const guestLeftAt = guestP?.left_at_epoch ?? now

  let overlapSeconds = 0
  if (hostP && guestP) {
    const overlapStart = Math.max(hostJoinedAt, guestJoinedAt)
    const overlapEnd = Math.min(hostLeftAt, guestLeftAt)
    overlapSeconds = Math.max(0, overlapEnd - overlapStart)
  }

  const metricsHash = computeMetricsHash(bookingIdStr, {
    hostJoinedAt,
    hostLeftAt,
    guestJoinedAt,
    guestLeftAt,
    overlapSeconds,
  })

  console.log(`[session/attest] booking=${bookingIdStr} outcome=${outcomeStr} metricsHash=${metricsHash}`)

  const result = await attestOutcome(
    c.env.RPC_URL,
    c.env.ESCROW_ADDRESS,
    Number(c.env.CHAIN_ID),
    c.env.ORACLE_PRIVATE_KEY,
    bookingId,
    outcome,
    metricsHash,
    isMock,
  )

  if ('error' in result) {
    console.error(`[session/attest] failed: ${result.error}`)
    return c.json({ error: result.error }, 500)
  }

  console.log(`[session/attest] success tx=${result.txHash}`)
  return c.json({ outcome: outcomeStr, tx_hash: result.txHash })
})
