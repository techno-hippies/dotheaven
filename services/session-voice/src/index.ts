/**
 * Session Voice Service
 *
 * Handles P2P voice sessions:
 * - Token generation for Agora calls
 * - Participation tracking
 * - Oracle attestation
 *
 * Endpoints:
 * - POST /auth - Get JWT from wallet signature
 * - POST /session/join - Join a session, get Agora token
 * - POST /session/:id/leave - Leave a session
 * - GET /session/:id/stats - Get participation stats
 * - POST /session/:id/attest - Oracle attests session outcome
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Address } from 'viem'
import { config } from './config.js'
import { createJWT, verifyJWT, verifyAuthSignature } from './auth.js'
import { generateToken } from './agora.js'
import { getBooking, getSlot, BookingStatus, Outcome, attestOutcome, computeMetricsHash, isOracleConfigured } from './escrow.js'
import { initSession, recordJoin, recordLeave, getParticipationStats, calculateOutcome } from './sessions.js'

const app = new Hono()

// CORS
app.use('*', cors())

// Health check
app.get('/health', (c) => {
  return c.json({
    ok: true,
    chainId: config.chainId,
    escrow: config.escrowAddress,
    oracleConfigured: isOracleConfigured(),
  })
})

// ── Auth ────────────────────────────────────────────────────────────

/**
 * POST /auth
 * Body: { wallet: Address, message: string, signature: Hex }
 * Returns: { token: string }
 */
app.post('/auth', async (c) => {
  const body = await c.req.json<{
    wallet: Address
    message: string
    signature: `0x${string}`
  }>()

  if (!body.wallet || !body.message || !body.signature) {
    return c.json({ error: 'missing wallet, message, or signature' }, 400)
  }

  const valid = await verifyAuthSignature(body.wallet, body.message, body.signature)
  if (!valid) {
    return c.json({ error: 'invalid signature' }, 401)
  }

  const token = createJWT(body.wallet)
  return c.json({ token })
})

// ── Auth middleware ─────────────────────────────────────────────────

function getWalletFromToken(c: any): Address | null {
  const auth = c.req.header('authorization')
  if (!auth?.startsWith('Bearer ')) return null

  const token = auth.slice(7)
  const payload = verifyJWT(token)
  return payload?.sub as Address || null
}

// ── Session Join ────────────────────────────────────────────────────

/**
 * POST /session/join
 * Body: { booking_id: string }
 * Returns: { channel: string, agora_token: string, user_uid: number }
 */
app.post('/session/join', async (c) => {
  const wallet = getWalletFromToken(c)
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

  // Get booking from contract
  const booking = await getBooking(bookingId)
  if (!booking) {
    return c.json({ error: 'booking not found' }, 404)
  }

  // Check booking is active
  if (booking.status !== BookingStatus.Booked) {
    return c.json({ error: 'booking not active' }, 400)
  }

  // Get slot details
  const slot = await getSlot(booking.slotId)
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

  // Check join window (can join 5 mins before start, until end)
  const now = Math.floor(Date.now() / 1000)
  const joinStart = slot.startTime - config.joinWindowBeforeMinutes * 60
  const joinEnd = slot.startTime + slot.durationMins * 60

  if (now < joinStart) {
    return c.json({ error: 'too early to join' }, 400)
  }
  if (now > joinEnd) {
    return c.json({ error: 'session has ended' }, 400)
  }

  // Initialize session tracking
  initSession(
    bookingIdStr,
    slot.host,
    booking.guest,
    slot.startTime,
    slot.durationMins
  )

  // Record join
  recordJoin(bookingIdStr, wallet)

  // Generate Agora token
  const { channel, token, uid } = generateToken(bookingIdStr, wallet)

  console.log(`[session/join] booking=${bookingIdStr} wallet=${wallet} uid=${uid}`)

  return c.json({
    channel,
    agora_token: token,
    user_uid: uid,
  })
})

// ── Session Leave ───────────────────────────────────────────────────

/**
 * POST /session/:id/leave
 * Returns: { ok: true, duration_ms: number }
 */
app.post('/session/:id/leave', async (c) => {
  const wallet = getWalletFromToken(c)
  if (!wallet) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const bookingId = c.req.param('id')
  const durationMs = recordLeave(bookingId, wallet)

  console.log(`[session/leave] booking=${bookingId} wallet=${wallet} duration=${durationMs}ms`)

  return c.json({
    ok: true,
    duration_ms: durationMs ?? 0,
  })
})

// ── Session Stats (Debug) ───────────────────────────────────────────

/**
 * GET /session/:id/stats
 * Returns participation stats for debugging
 */
app.get('/session/:id/stats', async (c) => {
  const wallet = getWalletFromToken(c)
  if (!wallet) {
    return c.json({ error: 'unauthorized' }, 401)
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

  const booking = await getBooking(bookingId)
  if (!booking) {
    return c.json({ error: 'booking not found' }, 404)
  }

  const slot = await getSlot(booking.slotId)
  if (!slot) {
    return c.json({ error: 'slot not found' }, 404)
  }

  const walletLower = wallet.toLowerCase()
  const isHost = slot.host.toLowerCase() === walletLower
  const isGuest = booking.guest.toLowerCase() === walletLower
  if (!isHost && !isGuest) {
    return c.json({ error: 'not a participant' }, 403)
  }

  const stats = getParticipationStats(bookingIdStr)
  if (!stats) {
    return c.json({ error: 'session not found' }, 404)
  }

  return c.json(stats)
})

// ── Oracle Attestation ──────────────────────────────────────────────

/**
 * POST /session/:id/attest
 * Attests session outcome based on participation tracking.
 * Only callable by oracle service (internal endpoint).
 *
 * Query params:
 *   - force_outcome: 'completed' | 'no-show-host' | 'no-show-guest' (optional, for manual override)
 *
 * Returns: { outcome: string, tx_hash: string } or { error: string }
 */
app.post('/session/:id/attest', async (c) => {
  // This endpoint is internal - no JWT auth, but check oracle is configured
  if (!isOracleConfigured()) {
    return c.json({ error: 'oracle not configured' }, 503)
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

  // Get booking from contract
  const booking = await getBooking(bookingId)
  if (!booking) {
    return c.json({ error: 'booking not found' }, 404)
  }

  // Check booking is in correct state
  if (booking.status !== BookingStatus.Booked) {
    return c.json({ error: `booking status is ${BookingStatus[booking.status]}, expected Booked` }, 400)
  }

  // Get slot for timing info
  const slot = await getSlot(booking.slotId)
  if (!slot) {
    return c.json({ error: 'slot not found' }, 404)
  }

  // Determine outcome from participation tracking or force param
  const forceOutcome = c.req.query('force_outcome')
  let outcomeStr: string | null

  if (forceOutcome) {
    if (!['completed', 'no-show-host', 'no-show-guest'].includes(forceOutcome)) {
      return c.json({ error: 'invalid force_outcome' }, 400)
    }
    outcomeStr = forceOutcome
  } else {
    outcomeStr = calculateOutcome(bookingIdStr)
    if (!outcomeStr) {
      return c.json({ error: 'cannot determine outcome yet (session may still be in progress)' }, 400)
    }
  }

  // Map string outcome to enum
  let outcome: Outcome
  switch (outcomeStr) {
    case 'completed':
      outcome = Outcome.Completed
      break
    case 'no-show-host':
      outcome = Outcome.NoShowHost
      break
    case 'no-show-guest':
      outcome = Outcome.NoShowGuest
      break
    default:
      return c.json({ error: 'invalid outcome' }, 400)
  }

  // Get participation stats for metrics hash
  const stats = getParticipationStats(bookingIdStr)
  const metricsHash = stats
    ? computeMetricsHash(bookingIdStr, {
        hostJoinedAt: stats.hostJoinedAt ?? 0,
        hostLeftAt: stats.hostLeftAt ?? 0,
        guestJoinedAt: stats.guestJoinedAt ?? 0,
        guestLeftAt: stats.guestLeftAt ?? 0,
        overlapSeconds: stats.overlapSeconds,
      })
    : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

  console.log(`[session/attest] booking=${bookingIdStr} outcome=${outcomeStr} metricsHash=${metricsHash}`)

  // Submit attestation to contract
  const result = await attestOutcome(bookingId, outcome, metricsHash)

  if ('error' in result) {
    console.error(`[session/attest] failed: ${result.error}`)
    return c.json({ error: result.error }, 500)
  }

  console.log(`[session/attest] success tx=${result.txHash}`)

  return c.json({
    outcome: outcomeStr,
    tx_hash: result.txHash,
  })
})

// ── Start server ────────────────────────────────────────────────────

console.log(`Session Voice Service starting on port ${config.port}`)
console.log(`  Chain ID: ${config.chainId}`)
console.log(`  Escrow: ${config.escrowAddress}`)
console.log(`  Agora App ID: ${config.agoraAppId.slice(0, 8)}...`)

export default {
  port: config.port,
  fetch: app.fetch,
}
