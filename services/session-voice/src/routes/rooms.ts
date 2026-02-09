/**
 * Room Routes — free voice rooms with credit metering
 *
 * POST /create    → create a free room
 * POST /join      → join a room
 * POST /heartbeat → meter + check events
 * POST /token/renew → meter + renew Agora token
 * POST /leave     → leave a room
 * GET  /active    → list open active rooms
 *
 * All endpoints are strictly free-room-only.
 * Booked sessions use /session/* routes.
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { verifyJWT } from '../auth'
import { addressToUid, getFreeChannel } from '../agora'
import { ensureAccount, getBalance, grantBase } from '../credits'
import { hasPrimaryName } from '../registry'
import {
  JOIN_MIN_SECONDS,
  ROOM_CAPACITY_FREE,
  HEARTBEAT_INTERVAL_SECONDS,
  TOKEN_RENEW_AFTER_SECONDS,
} from '../config'

export const roomRoutes = new Hono<{ Bindings: Env; Variables: { wallet: string } }>()

/** Auth middleware (skip for GET /active — public discovery endpoint) */
roomRoutes.use('*', async (c, next) => {
  // GET /active is public — exact match on method + route path
  if (c.req.method === 'GET' && new URL(c.req.url).pathname.replace(/\/+$/, '').endsWith('/rooms/active')) {
    return next()
  }

  const auth = c.req.header('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const payload = await verifyJWT(auth.slice(7), c.env.JWT_SECRET)
  if (!payload) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  c.set('wallet', payload.sub)
  await next()
})

/** Ensure user has credits, granting base if they have a heaven name */
async function ensureCredits(env: Env, wallet: string): Promise<{ remaining: number; error?: string }> {
  const balance = await getBalance(env.DB, wallet)

  // If they already have credits, just return balance
  if (balance.base_granted_seconds > 0) {
    return { remaining: balance.remaining_seconds }
  }

  // No credits yet — check if they have a heaven name
  const hasName = await hasPrimaryName(env.RPC_URL, env.REGISTRY_ADDRESS, wallet)
  if (!hasName) {
    return { remaining: 0, error: 'heaven_name_required' }
  }

  // Grant base credits
  const result = await grantBase(env.DB, wallet)
  return { remaining: result.remaining_seconds }
}

/**
 * Verify that (wallet, connection_id, room_id) match in D1
 * AND the room is a free room. Prevents:
 * - One user controlling another user's connection
 * - Booked session participants using free room endpoints
 */
async function verifyFreeConnectionOwnership(
  db: D1Database,
  wallet: string,
  connectionId: string,
  roomId: string,
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 FROM room_participants rp
     JOIN rooms r ON rp.room_id = r.room_id
     WHERE rp.connection_id = ? AND rp.room_id = ? AND rp.wallet = ?
       AND rp.left_at_epoch IS NULL AND r.room_type = 'free'`,
  ).bind(connectionId, roomId, wallet).first()
  return row !== null
}

/** POST /create — create a free room */
roomRoutes.post('/create', async (c) => {
  const wallet = c.get('wallet')
  const body = await c.req.json<{ visibility?: string; ai_enabled?: boolean }>().catch(() => ({} as { visibility?: string; ai_enabled?: boolean }))

  // Validate visibility
  const visibility = body.visibility === 'private' ? 'private' : 'open'
  const aiEnabled = body.ai_enabled === true

  // Ensure credits
  const credits = await ensureCredits(c.env, wallet)
  if (credits.error) {
    return c.json({ error: credits.error }, 403)
  }
  if (credits.remaining < JOIN_MIN_SECONDS) {
    return c.json({ error: 'insufficient_credits', remaining_seconds: credits.remaining }, 403)
  }

  // Check single active free room per wallet (as participant)
  const activeParticipant = await c.env.DB.prepare(
    `SELECT rp.connection_id FROM room_participants rp
     JOIN rooms r ON rp.room_id = r.room_id
     WHERE rp.wallet = ? AND rp.left_at_epoch IS NULL AND r.room_type = 'free'`,
  ).bind(wallet).first()
  if (activeParticipant) {
    return c.json({ error: 'already_in_free_room' }, 409)
  }

  // Prevent creating multiple rooms — check rooms table for active hosted rooms
  const activeHosted = await c.env.DB.prepare(
    `SELECT room_id FROM rooms WHERE host_wallet = ? AND status = 'active' AND room_type = 'free'`,
  ).bind(wallet).first()
  if (activeHosted) {
    return c.json({ error: 'already_hosting_free_room' }, 409)
  }

  const roomId = crypto.randomUUID()
  const channel = getFreeChannel(roomId)
  const now = new Date().toISOString()
  const metadata = JSON.stringify({ visibility, ai_enabled: aiEnabled })

  // Initialize DO first — if this fails, no stale D1 row is created
  const doId = c.env.ROOM_DO.idFromName(roomId)
  const stub = c.env.ROOM_DO.get(doId)
  const initResp = await stub.fetch(new Request('http://do/init', {
    method: 'POST',
    body: JSON.stringify({
      roomId,
      roomType: 'free',
      hostWallet: wallet,
      capacity: ROOM_CAPACITY_FREE,
      channel,
      chainId: c.env.CHAIN_ID,
    }),
  }))

  if (!initResp.ok) {
    const err = await initResp.json<any>().catch(() => ({ error: 'do_init_failed' }))
    return c.json({ error: err.error || 'do_init_failed' }, 500)
  }

  // Insert room in D1 after DO confirms.
  // Unique index idx_rooms_active_free_host enforces max 1 active free room per host.
  try {
    await c.env.DB.prepare(
      `INSERT INTO rooms (room_id, room_type, host_wallet, capacity, status, metadata_json, created_at)
       VALUES (?, 'free', ?, ?, 'active', ?, ?)`,
    ).bind(roomId, wallet, ROOM_CAPACITY_FREE, metadata, now).run()
  } catch (e: any) {
    // Roll back initialized DO state if room row insert fails.
    await stub.fetch(new Request('http://do/destroy', {
      method: 'POST',
    })).catch(() => {})

    if (e?.message?.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'already_hosting_free_room' }, 409)
    }
    throw e
  }

  return c.json({ room_id: roomId, channel, visibility })
})

/** POST /join — join a free room */
roomRoutes.post('/join', async (c) => {
  const wallet = c.get('wallet')
  const body = await c.req.json<{ room_id: string }>()

  if (!body.room_id) {
    return c.json({ error: 'missing room_id' }, 400)
  }

  // Ensure credits
  const credits = await ensureCredits(c.env, wallet)
  if (credits.error) {
    return c.json({ error: credits.error }, 403)
  }
  if (credits.remaining < JOIN_MIN_SECONDS) {
    return c.json({ error: 'insufficient_credits', remaining_seconds: credits.remaining }, 403)
  }

  // Check single active free room per wallet
  const active = await c.env.DB.prepare(
    `SELECT rp.connection_id FROM room_participants rp
     JOIN rooms r ON rp.room_id = r.room_id
     WHERE rp.wallet = ? AND rp.left_at_epoch IS NULL AND r.room_type = 'free'`,
  ).bind(wallet).first()
  if (active) {
    return c.json({ error: 'already_in_free_room' }, 409)
  }

  // Check room exists and is active
  const room = await c.env.DB.prepare(
    "SELECT room_id, room_type, capacity, status, host_wallet FROM rooms WHERE room_id = ? AND status = 'active'",
  ).bind(body.room_id).first<{ room_id: string; room_type: string; capacity: number; status: string; host_wallet: string }>()
  if (!room) {
    return c.json({ error: 'room_not_found' }, 404)
  }

  // Only allow joining free rooms via this endpoint
  if (room.room_type !== 'free') {
    return c.json({ error: 'room_type_mismatch' }, 400)
  }

  // Check capacity
  const participantCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM room_participants WHERE room_id = ? AND left_at_epoch IS NULL',
  ).bind(body.room_id).first<{ cnt: number }>()
  if (participantCount && participantCount.cnt >= room.capacity) {
    return c.json({ error: 'room_full' }, 409)
  }

  const connectionId = crypto.randomUUID()
  const agoraUid = addressToUid(wallet)
  const now = Math.floor(Date.now() / 1000)

  // Join DO first, then insert participant in D1
  const doId = c.env.ROOM_DO.idFromName(body.room_id)
  const stub = c.env.ROOM_DO.get(doId)
  const doResp = await stub.fetch(new Request('http://do/join', {
    method: 'POST',
    body: JSON.stringify({ connectionId, wallet, agoraUid }),
  }))

  if (!doResp.ok) {
    const doResult = await doResp.json<any>()
    return c.json(doResult, doResp.status as any)
  }

  const doResult = await doResp.json<any>()

  // Insert participant in D1 only after DO confirms; compensate on failure
  try {
    await c.env.DB.prepare(
      `INSERT INTO room_participants (connection_id, room_id, wallet, agora_uid, joined_at_epoch, last_metered_at_epoch)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(connectionId, body.room_id, wallet, agoraUid, now, now).run()
  } catch (e) {
    // Compensate: remove from DO since D1 insert failed
    await stub.fetch(new Request('http://do/leave', {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    })).catch(() => {})
    throw e
  }

  const channel = getFreeChannel(body.room_id)

  return c.json({
    room_id: body.room_id,
    channel,
    connection_id: connectionId,
    agora_uid: agoraUid,
    host_wallet: room.host_wallet,
    is_host: room.host_wallet === wallet,
    agora_token: doResult.agora_token,
    token_expires_in_seconds: doResult.token_expires_in_seconds,
    renew_after_seconds: doResult.renew_after_seconds,
    heartbeat_interval_seconds: doResult.heartbeat_interval_seconds,
    remaining_seconds: doResult.remaining_seconds,
  })
})

/** POST /heartbeat — meter + check events */
roomRoutes.post('/heartbeat', async (c) => {
  const wallet = c.get('wallet')
  const body = await c.req.json<{ room_id: string; connection_id: string }>()
  if (!body.room_id || !body.connection_id) {
    return c.json({ error: 'missing room_id or connection_id' }, 400)
  }

  // Verify wallet owns this connection in a free room
  const owns = await verifyFreeConnectionOwnership(c.env.DB, wallet, body.connection_id, body.room_id)
  if (!owns) {
    return c.json({ error: 'not_your_connection' }, 403)
  }

  const doId = c.env.ROOM_DO.idFromName(body.room_id)
  const stub = c.env.ROOM_DO.get(doId)
  const doResp = await stub.fetch(new Request('http://do/heartbeat', {
    method: 'POST',
    body: JSON.stringify({ connectionId: body.connection_id }),
  }))

  const doResult = await doResp.json<any>()
  return c.json(doResult, doResp.status as any)
})

/** POST /token/renew — meter + renew Agora token */
roomRoutes.post('/token/renew', async (c) => {
  const wallet = c.get('wallet')
  const body = await c.req.json<{ room_id: string; connection_id: string }>()
  if (!body.room_id || !body.connection_id) {
    return c.json({ error: 'missing room_id or connection_id' }, 400)
  }

  // Verify wallet owns this connection in a free room
  const owns = await verifyFreeConnectionOwnership(c.env.DB, wallet, body.connection_id, body.room_id)
  if (!owns) {
    return c.json({ error: 'not_your_connection' }, 403)
  }

  const doId = c.env.ROOM_DO.idFromName(body.room_id)
  const stub = c.env.ROOM_DO.get(doId)
  const doResp = await stub.fetch(new Request('http://do/renew', {
    method: 'POST',
    body: JSON.stringify({ connectionId: body.connection_id }),
  }))

  const doResult = await doResp.json<any>()
  return c.json(doResult, doResp.status as any)
})

/** GET /active — list open active rooms (no auth required for discovery) */
roomRoutes.get('/active', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.room_id, r.host_wallet, r.created_at, r.metadata_json, rc.participant_count
     FROM rooms r
     JOIN (
       SELECT room_id, COUNT(*) as participant_count
       FROM room_participants
       WHERE left_at_epoch IS NULL
       GROUP BY room_id
     ) rc ON rc.room_id = r.room_id
     WHERE r.status = 'active'
       AND r.room_type = 'free'
       AND (json_extract(r.metadata_json, '$.visibility') = 'open' OR r.metadata_json IS NULL)
     ORDER BY r.created_at DESC
     LIMIT 50`,
  ).all<{
    room_id: string
    host_wallet: string
    created_at: string
    metadata_json: string
    participant_count: number
  }>()

  return c.json({
    rooms: (rows.results ?? []).map(r => ({
      room_id: r.room_id,
      host_wallet: r.host_wallet,
      participant_count: r.participant_count,
      created_at: r.created_at,
    })),
  })
})

/** POST /leave — leave a room. Host leaving closes the room for everyone. */
roomRoutes.post('/leave', async (c) => {
  const wallet = c.get('wallet')
  const body = await c.req.json<{ room_id: string; connection_id: string }>()
  if (!body.room_id || !body.connection_id) {
    return c.json({ error: 'missing room_id or connection_id' }, 400)
  }

  // Verify wallet owns this connection in a free room
  const owns = await verifyFreeConnectionOwnership(c.env.DB, wallet, body.connection_id, body.room_id)
  if (!owns) {
    return c.json({ error: 'not_your_connection' }, 403)
  }

  // Check if this is the host leaving a free room
  const room = await c.env.DB.prepare(
    "SELECT host_wallet, room_type FROM rooms WHERE room_id = ? AND room_type = 'free'",
  ).bind(body.room_id).first<{ host_wallet: string; room_type: string }>()
  const isHost = room?.host_wallet === wallet

  const doId = c.env.ROOM_DO.idFromName(body.room_id)
  const stub = c.env.ROOM_DO.get(doId)

  if (isHost) {
    // Host leaving: close the entire room via DO
    const doResp = await stub.fetch(new Request('http://do/close', {
      method: 'POST',
      body: JSON.stringify({ connectionId: body.connection_id }),
    }))
    const doResult = await doResp.json<any>()
    return c.json(doResult, doResp.status as any)
  }

  // Non-host: normal leave
  const doResp = await stub.fetch(new Request('http://do/leave', {
    method: 'POST',
    body: JSON.stringify({ connectionId: body.connection_id }),
  }))

  const doResult = await doResp.json<any>()
  return c.json(doResult, doResp.status as any)
})
