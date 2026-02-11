/**
 * RoomDO — Durable Object for live room state
 *
 * One instance per active room. Manages:
 * - Participant map + metering
 * - Heartbeat alarm (30s)
 * - Agora token issuance (90s/3600s TTL)
 * - Credit enforcement via D1
 */

import type { Env } from './types'
import { debitUsage, getBalance } from './credits'
import { generateShortToken, generateBookedToken, getFreeChannel, getBookedChannel } from './agora'
import { startCaiAgent, stopCaiAgent } from './agora-cai'
import {
  HEARTBEAT_INTERVAL_SECONDS,
  TOKEN_TTL_SECONDS,
  TOKEN_RENEW_AFTER_SECONDS,
  RENEW_MIN_SECONDS,
  CREDITS_LOW_THRESHOLD,
} from './config'

interface Participant {
  connectionId: string
  wallet: string
  agoraUid: number
  joinedAtEpoch: number
  lastMeteredAtEpoch: number
  warnedLow: boolean
  exhausted: boolean
  debitedSeconds: number
}

interface RoomState {
  roomId: string
  roomType: 'free' | 'booked'
  hostWallet: string
  capacity: number
  channel: string
  chainId: string
  bookingId?: string
  aiEnabled?: boolean
  agentId?: string
}

interface MeterEvent {
  type: 'credits_low' | 'credits_exhausted'
  wallet: string
  remaining_seconds: number
  at_epoch: number
}

interface MeterResult {
  debited: number
  remaining: number
  events: MeterEvent[]
}

export class RoomDO implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private room: RoomState | null = null
  private participants: Map<string, Participant> = new Map()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    // Restore in-memory state from DO storage on wake
    this.state.blockConcurrencyWhile(async () => {
      this.room = await this.state.storage.get<RoomState>('room') ?? null
      const parts = await this.state.storage.get<[string, Participant][]>('participants')
      if (parts) {
        this.participants = new Map(parts)
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      if (request.method === 'POST' && path === '/init') return this.handleInit(request)
      if (request.method === 'POST' && path === '/join') return this.handleJoin(request)
      if (request.method === 'POST' && path === '/heartbeat') return this.handleHeartbeat(request)
      if (request.method === 'POST' && path === '/renew') return this.handleRenew(request)
      if (request.method === 'POST' && path === '/leave') return this.handleLeave(request)
      if (request.method === 'POST' && path === '/close') return this.handleClose(request)
      if (request.method === 'POST' && path === '/destroy') return this.handleDestroy()
      if (request.method === 'GET' && path === '/state') return this.handleState()

      return json({ error: 'not_found' }, 404)
    } catch (e: any) {
      return json({ error: e.message || 'internal_error' }, 500)
    }
  }

  /** Initialize room metadata (idempotent — skips if already initialized) */
  private async handleInit(request: Request): Promise<Response> {
    if (this.room) return json({ ok: true, already_initialized: true })

    const body = await request.json<{
      roomId: string
      roomType: 'free' | 'booked'
      hostWallet: string
      capacity: number
      channel: string
      chainId: string
      bookingId?: string
      aiEnabled?: boolean
    }>()

    this.room = {
      roomId: body.roomId,
      roomType: body.roomType,
      hostWallet: body.hostWallet.toLowerCase(),
      capacity: body.capacity,
      channel: body.channel,
      chainId: body.chainId,
      bookingId: body.bookingId,
      aiEnabled: body.aiEnabled,
    }

    await this.state.storage.put('room', this.room)
    return json({ ok: true })
  }

  /** Add participant, issue Agora token, start alarm */
  private async handleJoin(request: Request): Promise<Response> {
    if (!this.room) return json({ error: 'room_not_initialized' }, 400)

    const body = await request.json<{
      connectionId: string
      wallet: string
      agoraUid: number
    }>()

    if (this.participants.size >= this.room.capacity) {
      return json({ error: 'room_full' }, 409)
    }

    const now = Math.floor(Date.now() / 1000)
    const participant: Participant = {
      connectionId: body.connectionId,
      wallet: body.wallet.toLowerCase(),
      agoraUid: body.agoraUid,
      joinedAtEpoch: now,
      lastMeteredAtEpoch: now,
      warnedLow: false,
      exhausted: false,
      debitedSeconds: 0,
    }

    this.participants.set(body.connectionId, participant)
    await this.persistParticipants()

    // Generate token based on room type
    const tokenResult = this.room.roomType === 'free'
      ? generateShortToken(this.env.AGORA_APP_ID, this.env.AGORA_APP_CERTIFICATE, this.room.channel, body.agoraUid)
      : generateBookedToken(this.env.AGORA_APP_ID, this.env.AGORA_APP_CERTIFICATE, this.room.channel, body.agoraUid)

    // Start AI agent when first participant joins an AI-enabled room
    if (this.room.aiEnabled && !this.room.agentId && this.participants.size === 1) {
      try {
        const result = await startCaiAgent(this.env, this.room.channel)
        this.room.agentId = result.agentId
        await this.state.storage.put('room', this.room)
      } catch (e) {
        console.warn('[RoomDO] AI agent start failed (non-blocking):', e)
        // Don't fail the join — room still works without AI
      }
    }

    // Start/continue alarm for metering (free rooms only)
    if (this.room.roomType === 'free') {
      await this.state.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_SECONDS * 1000)
    }

    // Get remaining credits
    let remaining_seconds = 0
    if (this.room.roomType === 'free') {
      const balance = await getBalance(this.env.DB, body.wallet)
      remaining_seconds = balance.remaining_seconds
    }

    return json({
      agora_token: tokenResult.token,
      token_expires_in_seconds: tokenResult.expiresInSeconds,
      renew_after_seconds: this.room.roomType === 'free' ? TOKEN_RENEW_AFTER_SECONDS : null,
      heartbeat_interval_seconds: this.room.roomType === 'free' ? HEARTBEAT_INTERVAL_SECONDS : null,
      remaining_seconds,
    })
  }

  /** Meter elapsed time, debit credits, return events */
  private async handleHeartbeat(request: Request): Promise<Response> {
    if (!this.room) return json({ error: 'room_not_initialized' }, 400)

    const body = await request.json<{ connectionId: string }>()
    const p = this.participants.get(body.connectionId)
    if (!p) return json({ error: 'participant_not_found' }, 404)

    const result = await this.meterParticipant(p)
    await this.persistParticipants()

    return json({
      ok: true,
      remaining_seconds: result.remaining,
      events: result.events,
    })
  }

  /** Meter + issue new Agora token (or deny if credits exhausted) */
  private async handleRenew(request: Request): Promise<Response> {
    if (!this.room) return json({ error: 'room_not_initialized' }, 400)

    const body = await request.json<{ connectionId: string }>()
    const p = this.participants.get(body.connectionId)
    if (!p) return json({ error: 'participant_not_found' }, 404)

    // Meter first
    const meterResult = await this.meterParticipant(p)

    // For free rooms, check if enough credits remain for renewal
    if (this.room.roomType === 'free') {
      if (meterResult.remaining < RENEW_MIN_SECONDS) {
        await this.persistParticipants()
        return json({
          denied: true,
          reason: 'credits_exhausted',
          remaining_seconds: meterResult.remaining,
          events: meterResult.events,
        })
      }
    }

    // Issue new token
    const tokenResult = this.room.roomType === 'free'
      ? generateShortToken(this.env.AGORA_APP_ID, this.env.AGORA_APP_CERTIFICATE, this.room.channel, p.agoraUid)
      : generateBookedToken(this.env.AGORA_APP_ID, this.env.AGORA_APP_CERTIFICATE, this.room.channel, p.agoraUid)

    await this.persistParticipants()

    return json({
      agora_token: tokenResult.token,
      token_expires_in_seconds: tokenResult.expiresInSeconds,
      remaining_seconds: meterResult.remaining,
      events: meterResult.events,
    })
  }

  /** Final meter, remove participant, close if empty */
  private async handleLeave(request: Request): Promise<Response> {
    if (!this.room) return json({ error: 'room_not_initialized' }, 400)

    const body = await request.json<{ connectionId: string }>()
    const p = this.participants.get(body.connectionId)
    if (!p) return json({ error: 'participant_not_found' }, 404)

    // Final meter
    const meterResult = await this.meterParticipant(p)

    // Remove participant
    this.participants.delete(body.connectionId)
    await this.persistParticipants()

    // Update D1: set left_at_epoch, final debited_seconds
    const now = Math.floor(Date.now() / 1000)
    await this.env.DB.prepare(
      'UPDATE room_participants SET left_at_epoch = ?, debited_seconds = ? WHERE connection_id = ?',
    ).bind(now, p.debitedSeconds, body.connectionId).run()

    // If room empty, close
    const closed = this.participants.size === 0
    if (closed) {
      // Stop AI agent if active
      await this.stopAgentIfActive()

      await this.env.DB.prepare(
        "UPDATE rooms SET status = 'closed', closed_at = ? WHERE room_id = ?",
      ).bind(new Date().toISOString(), this.room.roomId).run()

      // Cancel alarm
      await this.state.storage.deleteAlarm()
    }

    return json({
      ok: true,
      debited_seconds: p.debitedSeconds,
      remaining_seconds: meterResult.remaining,
      closed,
    })
  }

  /** Host close: meter all participants, remove all, close room */
  private async handleClose(request: Request): Promise<Response> {
    if (!this.room) return json({ error: 'room_not_initialized' }, 400)

    const body = await request.json<{ connectionId: string }>()
    const hostP = this.participants.get(body.connectionId)
    if (!hostP) return json({ error: 'participant_not_found' }, 404)

    // Final meter for the host
    const hostMeter = await this.meterParticipant(hostP)

    // Meter and mark all other participants as left
    const now = Math.floor(Date.now() / 1000)
    const leaveStmts: D1PreparedStatement[] = []

    for (const [connId, p] of this.participants) {
      if (connId !== body.connectionId) {
        await this.meterParticipant(p)
      }
      leaveStmts.push(
        this.env.DB.prepare(
          'UPDATE room_participants SET left_at_epoch = ?, debited_seconds = ? WHERE connection_id = ?',
        ).bind(now, p.debitedSeconds, connId),
      )
    }

    // Close room in D1
    leaveStmts.push(
      this.env.DB.prepare(
        "UPDATE rooms SET status = 'closed', closed_at = ? WHERE room_id = ?",
      ).bind(new Date().toISOString(), this.room.roomId),
    )

    if (leaveStmts.length > 0) {
      await this.env.DB.batch(leaveStmts)
    }

    // Stop AI agent if active
    await this.stopAgentIfActive()

    // Clear all participants
    this.participants.clear()
    await this.persistParticipants()
    await this.state.storage.deleteAlarm()

    return json({
      ok: true,
      debited_seconds: hostP.debitedSeconds,
      remaining_seconds: hostMeter.remaining,
      closed: true,
    })
  }

  /** Hard cleanup for create rollback paths (idempotent). */
  private async handleDestroy(): Promise<Response> {
    await this.stopAgentIfActive()
    this.participants.clear()
    this.room = null
    await this.state.storage.delete('participants')
    await this.state.storage.delete('room')
    await this.state.storage.deleteAlarm()
    return json({ ok: true, destroyed: true })
  }

  /** Debug: return current room state */
  private handleState(): Response {
    return json({
      room: this.room,
      participants: this.room ? Array.from(this.participants.values()) : [],
    })
  }

  /** Alarm handler — runs every 30s to meter all participants */
  async alarm(): Promise<void> {
    if (!this.room) return

    // Close room if empty (handles disconnects without /leave)
    if (this.participants.size === 0) {
      await this.stopAgentIfActive()
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE rooms SET status = 'closed', closed_at = ? WHERE room_id = ? AND status = 'active'",
        ).bind(new Date().toISOString(), this.room.roomId),
        // Also mark any phantom D1 participants as left
        this.env.DB.prepare(
          'UPDATE room_participants SET left_at_epoch = ? WHERE room_id = ? AND left_at_epoch IS NULL',
        ).bind(Math.floor(Date.now() / 1000), this.room.roomId),
      ])
      await this.state.storage.deleteAlarm()
      return
    }

    // Evict stale participants (no heartbeat for 3+ intervals = 90s)
    const now = Math.floor(Date.now() / 1000)
    const staleThreshold = HEARTBEAT_INTERVAL_SECONDS * 3
    for (const [connId, p] of this.participants) {
      if (now - p.lastMeteredAtEpoch > staleThreshold) {
        this.participants.delete(connId)
        await this.env.DB.prepare(
          'UPDATE room_participants SET left_at_epoch = ?, debited_seconds = ? WHERE connection_id = ?',
        ).bind(now, p.debitedSeconds, connId).run()
      }
    }

    // If eviction emptied the room, close it
    if (this.participants.size === 0) {
      await this.stopAgentIfActive()
      await this.env.DB.prepare(
        "UPDATE rooms SET status = 'closed', closed_at = ? WHERE room_id = ? AND status = 'active'",
      ).bind(new Date().toISOString(), this.room.roomId).run()
      await this.persistParticipants()
      await this.state.storage.deleteAlarm()
      return
    }

    for (const p of this.participants.values()) {
      await this.meterParticipant(p)
    }

    // Persist metering state to DO storage + D1
    await this.persistParticipants()
    await this.syncParticipantsToD1()

    // Re-schedule if anyone remains
    if (this.participants.size > 0) {
      await this.state.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_SECONDS * 1000)
    }
  }

  /** Meter a single participant: debit elapsed time, check thresholds */
  private async meterParticipant(p: Participant): Promise<MeterResult> {
    // Booked rooms don't meter credits
    if (!this.room || this.room.roomType === 'booked') {
      return { debited: 0, remaining: 0, events: [] }
    }

    const now = Math.floor(Date.now() / 1000)
    const elapsed = now - p.lastMeteredAtEpoch
    if (elapsed <= 0) {
      const balance = await getBalance(this.env.DB, p.wallet)
      return { debited: 0, remaining: balance.remaining_seconds, events: [] }
    }

    const result = await debitUsage(this.env.DB, p.wallet, elapsed, p.connectionId)
    const events: MeterEvent[] = []

    p.lastMeteredAtEpoch = now
    p.debitedSeconds += result.debited

    // Check thresholds
    if (result.remaining_seconds <= CREDITS_LOW_THRESHOLD && !p.warnedLow) {
      p.warnedLow = true
      events.push({
        type: 'credits_low',
        wallet: p.wallet,
        remaining_seconds: result.remaining_seconds,
        at_epoch: now,
      })
    }

    if (result.remaining_seconds <= 0 && !p.exhausted) {
      p.exhausted = true
      events.push({
        type: 'credits_exhausted',
        wallet: p.wallet,
        remaining_seconds: 0,
        at_epoch: now,
      })
    }

    return {
      debited: result.debited,
      remaining: result.remaining_seconds,
      events,
    }
  }

  /** Stop AI agent if one is active (idempotent) */
  private async stopAgentIfActive(): Promise<void> {
    if (!this.room?.agentId) return
    await stopCaiAgent(this.env, this.room.agentId)
    this.room.agentId = undefined
    await this.state.storage.put('room', this.room)
  }

  /** Persist participants to DO storage (fast, survives hibernation) */
  private async persistParticipants(): Promise<void> {
    await this.state.storage.put('participants', Array.from(this.participants.entries()))
  }

  /** Sync participant metering state to D1 (for durability) */
  private async syncParticipantsToD1(): Promise<void> {
    const stmts = Array.from(this.participants.values()).map(p =>
      this.env.DB.prepare(
        'UPDATE room_participants SET last_metered_at_epoch = ?, warned_low = ?, exhausted = ?, debited_seconds = ? WHERE connection_id = ?',
      ).bind(p.lastMeteredAtEpoch, p.warnedLow ? 1 : 0, p.exhausted ? 1 : 0, p.debitedSeconds, p.connectionId),
    )
    if (stmts.length > 0) {
      await this.env.DB.batch(stmts)
    }
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
