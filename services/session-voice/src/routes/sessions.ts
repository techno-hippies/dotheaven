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

export type AttestationOutcomeStr = 'completed' | 'no-show-host' | 'no-show-guest'

interface AttestationWindows {
  noShowEarliest: number
  noShowLatest: number
  completedEarliest: number
  completedLatest: number
}

type AttestParticipantRow = {
  joined_at_epoch: number
  left_at_epoch: number | null
}

export type SessionAttestNoopReason =
  | 'booking_not_found'
  | 'already_settled'
  | 'not_due_yet'
  | 'window_missed'

type SessionAttestMode = 'http' | 'scheduler'

interface RunAttestationOptions {
  mode: SessionAttestMode
  forceOutcome?: string | null
  now?: number
}

export type SessionAttestationResult =
  | {
      kind: 'submitted'
      outcome: AttestationOutcomeStr
      txHash: `0x${string}`
      metricsHash: `0x${string}`
    }
  | {
      kind: 'noop'
      reason: SessionAttestNoopReason
      detail?: string
    }
  | {
      kind: 'error'
      status: number
      error: string
    }

export interface SessionAttestationSweepSummary {
  scanned: number
  submitted: number
  noop: number
  failed: number
  noopReasons: Record<string, number>
  failures: Array<{ bookingId: string; error: string }>
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

function parseBookingId(bookingIdStr: string): bigint | null {
  if (!/^\d+$/.test(bookingIdStr)) return null
  try {
    return BigInt(bookingIdStr)
  } catch {
    return null
  }
}

function isAttestationOutcomeStr(value: string): value is AttestationOutcomeStr {
  return value === 'completed' || value === 'no-show-host' || value === 'no-show-guest'
}

function mapOutcomeToEnum(outcome: AttestationOutcomeStr): Outcome {
  switch (outcome) {
    case 'completed':
      return Outcome.Completed
    case 'no-show-host':
      return Outcome.NoShowHost
    case 'no-show-guest':
      return Outcome.NoShowGuest
  }
}

function bookingStatusLabel(status: BookingStatus): string {
  return BookingStatus[status] ?? `Unknown(${status})`
}

export function classifyAttestationTimingForScheduler(
  error: string,
): 'not_due_yet' | 'window_missed' | null {
  if (error === 'grace_not_over' || error === 'overlap_not_met') return 'not_due_yet'
  if (error === 'no_show_too_late' || error === 'completed_too_late') return 'window_missed'
  return null
}

export function isIdempotentAttestationError(error: string): boolean {
  const normalized = error.toLowerCase()
  return (
    normalized.includes('expected booked') ||
    normalized.includes('status is not booked') ||
    normalized.includes('booking status') ||
    normalized.includes('already attested')
  )
}

function deriveOutcomeFromPresence(
  slot: {
    startTime: number
    durationMins: number
    minOverlapMins: number
  },
  hostP: AttestParticipantRow | null,
  guestP: AttestParticipantRow | null,
  now: number,
): AttestationOutcomeStr {
  const endTime = slot.startTime + slot.durationMins * 60
  if (hostP && guestP) {
    const hostEnd = hostP.left_at_epoch ?? now
    const guestEnd = guestP.left_at_epoch ?? now
    const overlapStart = Math.max(hostP.joined_at_epoch, guestP.joined_at_epoch)
    const overlapEnd = Math.min(hostEnd, guestEnd)
    const overlapSeconds = Math.max(0, overlapEnd - overlapStart)
    const minOverlapSeconds = slot.minOverlapMins * 60

    if (overlapSeconds >= minOverlapSeconds) return 'completed'
    if (hostEnd < guestEnd && hostEnd < endTime) return 'no-show-host'
    return 'no-show-guest'
  }
  if (!hostP) return 'no-show-host'
  return 'no-show-guest'
}

async function getParticipant(
  env: Env,
  roomId: string,
  wallet: string,
): Promise<AttestParticipantRow | null> {
  return env.DB.prepare(
    'SELECT joined_at_epoch, left_at_epoch FROM room_participants WHERE room_id = ? AND wallet = ?',
  ).bind(roomId, wallet).first<AttestParticipantRow>()
}

function isSessionEscrowMock(env: Env): boolean {
  return (env.ESCROW_MODE ?? env.SESSION_ESCROW_MODE ?? 'live') === 'mock'
}

/** Auth middleware for session endpoints (skip attest) */
async function requireAuth(c: any, env: Env): Promise<string | null> {
  const auth = c.req.header('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET)
  return payload?.sub ?? null
}

export async function runSessionAttestation(
  env: Env,
  bookingIdStrRaw: string,
  options: RunAttestationOptions,
): Promise<SessionAttestationResult> {
  const bookingIdStr = bookingIdStrRaw.trim()
  const bookingId = parseBookingId(bookingIdStr)
  if (bookingId === null) {
    return { kind: 'error', status: 400, error: 'invalid booking_id' }
  }
  if (!env.ORACLE_PRIVATE_KEY) {
    return { kind: 'error', status: 503, error: 'oracle key not configured' }
  }

  const isMock = isSessionEscrowMock(env)
  const booking = await getBooking(env.RPC_URL, env.ESCROW_ADDRESS, bookingId, isMock)
  if (!booking) {
    if (options.mode === 'scheduler') {
      return { kind: 'noop', reason: 'booking_not_found' }
    }
    return { kind: 'error', status: 404, error: 'booking not found' }
  }

  if (booking.status !== BookingStatus.Booked) {
    if (options.mode === 'scheduler') {
      return {
        kind: 'noop',
        reason: 'already_settled',
        detail: `booking status is ${bookingStatusLabel(booking.status)}`,
      }
    }
    return {
      kind: 'error',
      status: 400,
      error: `booking status is ${bookingStatusLabel(booking.status)}, expected Booked`,
    }
  }

  const slot = await getSlot(env.RPC_URL, env.ESCROW_ADDRESS, booking.slotId, isMock)
  if (!slot) {
    return { kind: 'error', status: 404, error: 'slot not found' }
  }

  if (options.forceOutcome && !isAttestationOutcomeStr(options.forceOutcome)) {
    return { kind: 'error', status: 400, error: 'invalid force_outcome' }
  }

  if (options.forceOutcome && options.mode === 'http' && env.ENVIRONMENT !== 'development') {
    return { kind: 'error', status: 400, error: 'force_outcome not allowed in production' }
  }

  const now = options.now ?? Math.floor(Date.now() / 1000)
  const roomId = `booked-${bookingIdStr}`
  const hostP = await getParticipant(env, roomId, slot.host.toLowerCase())
  const guestP = await getParticipant(env, roomId, booking.guest.toLowerCase())

  const outcomeStr =
    options.forceOutcome && isAttestationOutcomeStr(options.forceOutcome)
      ? options.forceOutcome
      : deriveOutcomeFromPresence(slot, hostP, guestP, now)

  if (!options.forceOutcome) {
    const windows = getAttestationWindows(slot)
    const timing = validateAttestationWindow(outcomeStr, now, windows)
    if (!timing.ok) {
      if (options.mode === 'scheduler') {
        const classification = classifyAttestationTimingForScheduler(timing.error)
        if (classification === 'not_due_yet') {
          return { kind: 'noop', reason: 'not_due_yet', detail: timing.error }
        }
        if (classification === 'window_missed') {
          return { kind: 'noop', reason: 'window_missed', detail: timing.error }
        }
      }
      return { kind: 'error', status: 400, error: timing.error }
    }
  }

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

  const result = await attestOutcome(
    env.RPC_URL,
    env.ESCROW_ADDRESS,
    Number(env.CHAIN_ID),
    env.ORACLE_PRIVATE_KEY,
    bookingId,
    mapOutcomeToEnum(outcomeStr),
    metricsHash,
    isMock,
  )

  if ('error' in result) {
    if (options.mode === 'scheduler' && isIdempotentAttestationError(result.error)) {
      return { kind: 'noop', reason: 'already_settled', detail: result.error }
    }
    return { kind: 'error', status: 500, error: result.error }
  }

  return {
    kind: 'submitted',
    outcome: outcomeStr,
    txHash: result.txHash,
    metricsHash,
  }
}

function bumpCounter(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

export async function runSessionAttestationSweep(
  env: Env,
  opts: { limit?: number; lookbackSeconds?: number; now?: number } = {},
): Promise<SessionAttestationSweepSummary> {
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 1000))
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const lookbackSeconds = Math.max(60, opts.lookbackSeconds ?? 7 * 24 * 60 * 60)
  const cutoffEpoch = now - lookbackSeconds
  const summary: SessionAttestationSweepSummary = {
    scanned: 0,
    submitted: 0,
    noop: 0,
    failed: 0,
    noopReasons: {},
    failures: [],
  }

  const rows = await env.DB.prepare(
    `SELECT DISTINCT CAST(r.booking_id AS TEXT) AS booking_id
     FROM rooms r
     JOIN room_participants p ON p.room_id = r.room_id
     WHERE r.room_type = 'booked'
       AND r.booking_id IS NOT NULL
       AND p.joined_at_epoch >= ?
     ORDER BY r.booking_id DESC
     LIMIT ?`,
  ).bind(cutoffEpoch, limit).all<{ booking_id: string }>()

  for (const row of rows.results ?? []) {
    const bookingIdStr = row.booking_id
    summary.scanned += 1

    const attempt = await runSessionAttestation(env, bookingIdStr, {
      mode: 'scheduler',
      now,
    })

    if (attempt.kind === 'submitted') {
      summary.submitted += 1
      continue
    }

    if (attempt.kind === 'noop') {
      summary.noop += 1
      bumpCounter(summary.noopReasons, attempt.reason)
      continue
    }

    summary.failed += 1
    if (summary.failures.length < 20) {
      summary.failures.push({ bookingId: bookingIdStr, error: attempt.error })
    }
  }

  return summary
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

  const bookingIdStr = c.req.param('id')
  const forceOutcome = c.req.query('force_outcome')
  const attestation = await runSessionAttestation(c.env, bookingIdStr, {
    mode: 'http',
    forceOutcome,
  })

  if (attestation.kind === 'submitted') {
    console.log(
      `[session/attest] booking=${bookingIdStr.trim()} outcome=${attestation.outcome} metricsHash=${attestation.metricsHash}`,
    )
    console.log(`[session/attest] success tx=${attestation.txHash}`)
    return c.json({ outcome: attestation.outcome, tx_hash: attestation.txHash })
  }

  if (attestation.kind === 'noop') {
    return c.json({ error: attestation.reason, detail: attestation.detail }, 409)
  }

  console.error(`[session/attest] failed: ${attestation.error}`)
  return c.json({ error: attestation.error }, attestation.status as any)
})
