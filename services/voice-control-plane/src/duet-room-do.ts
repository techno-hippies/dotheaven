/**
 * DuetRoomDO — Durable Object for duet room control state.
 *
 * Stores:
 * - Room metadata (`meta`)
 * - Per-wallet entitlements (`ent:<wallet>`)
 * - x402 idempotency markers (`settle:<paymentSigHash>`)
 * - Short-lived replay access grants (`replaytok:<tokenHash>`)
 */

import type { Env } from './types'
import { addressToUid, generateToken, generateViewerToken } from './agora'
import {
  settlePaymentWithFacilitator,
  type PaymentRequirement as X402PaymentRequirement,
} from './x402-facilitator'
import { tryParseJson, tryParseBase64Json } from './parse-utils'

type NetworkId = 'eip155:8453' | 'eip155:84532'
type RoomStatus = 'created' | 'live' | 'ended'
type ReplayMode = 'load_gated' | 'worker_gated'
type RecordingMode = 'host_local' | 'agora_cloud'
type EntitlementType = 'live' | 'replay'
type BroadcastState = 'idle' | 'live' | 'stopped'
type AudienceMediaMode = 'bridge' | 'direct'
type BroadcastSeat = 'host' | 'guest'
type SegmentRightsKind = 'original' | 'derivative'

interface WalletEntitlement {
  live_expires_at?: number
  replay_expires_at?: number
}

interface SegmentRightsAttestation {
  source_ip_id: string
  payout: string
  sig: string
}

interface SegmentRights {
  kind: SegmentRightsKind
  source_story_ip_ids?: string[]
  upstream_bps?: number
  upstream_payout?: string
  attestations?: SegmentRightsAttestation[]
}

interface SegmentPricing {
  live_amount: string
  replay_amount?: string
}

interface DuetRoomSegment {
  id: string
  started_at: number
  pay_to: string
  pricing: SegmentPricing
  rights?: SegmentRights
}

interface SegmentLock {
  locked_at: number
  first_settlement_tx_hash?: string
}

interface RecordingMetadata {
  load_dataitem_id: string
  replay_url?: string
  replay_x402_url?: string
  created_at: number
}

interface BroadcastMediaState {
  audio: boolean
  video: boolean
}

interface DuetRoomMeta {
  room_id: string
  status: RoomStatus
  host_wallet: string
  guest_wallet?: string
  guest_accepted_at?: number
  split_address: string
  network: NetworkId
  asset_usdc: string
  live_amount: string
  replay_amount: string
  access_window_minutes: number
  replay_mode: ReplayMode
  recording_mode: RecordingMode
  audience_media_mode?: AudienceMediaMode
  agora_channel: string
  bridge_ticket?: string
  bridge_ticket_hash?: string
  bridge_ticket_valid_until?: number
  bridge_agora_uid?: number
  guest_bridge_ticket?: string
  guest_bridge_ticket_hash?: string
  guest_bridge_ticket_revoked_hash?: string
  guest_bridge_agora_uid?: number
  host_broadcast_state?: BroadcastState
  host_broadcast_mode?: string
  host_broadcast_heartbeat_at?: number
  host_broadcast_started_at?: number
  guest_broadcast_state?: BroadcastState
  guest_broadcast_mode?: string
  guest_broadcast_heartbeat_at?: number
  guest_broadcast_started_at?: number
  host_broadcast_media?: BroadcastMediaState
  guest_broadcast_media?: BroadcastMediaState
  broadcast_state?: BroadcastState
  broadcast_mode?: string
  broadcast_heartbeat_at?: number
  broadcast_started_at?: number
  live_started_at?: number
  ended_at?: number
  recording?: RecordingMetadata
  segments?: DuetRoomSegment[]
  current_segment_id?: string
  segment_locks?: Record<string, SegmentLock>
  created_at: number
}

interface SettleMarker {
  processed_at: number
  wallet: string
  entitlement: EntitlementType
  expires_at: number
  segment_id?: string
  pay_to?: string
  amount?: string
  facilitator?: 'mock' | 'self'
  transaction_hash?: string
}

interface ReplayAccessGrant {
  wallet: string
  replay_url: string
  created_at: number
  expires_at: number
}

const SETTLEMENT_TTL_SECONDS = 48 * 60 * 60
const SETTLEMENT_PRUNE_INTERVAL_SECONDS = 60 * 60
const SETTLEMENT_LAST_PRUNE_KEY = 'meta:settle_last_prune'
const BRIDGE_TOKEN_TTL_SECONDS = 2 * 60 * 60
const BRIDGE_TICKET_GRACE_AFTER_END_SECONDS = 30 * 60
const REPLAY_ACCESS_TOKEN_TTL_SECONDS = 60
const BROADCAST_HEARTBEAT_TIMEOUT_SECONDS = 20
const MAX_SEGMENTS_PER_ROOM = 500

// Safety: we are not ready for mainnet funds. Lock duet rooms to Base Sepolia USDC for now.
const ALLOWED_NETWORK: NetworkId = 'eip155:84532'
const BASE_SEPOLIA_USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const X402_MAX_TIMEOUT_SECONDS = 60 * 60
const BASE_SEPOLIA_USDC_EIP712 = { name: 'USDC', version: '2' } as const

export class DuetRoomDO implements DurableObject {
  private state: DurableObjectState
  private env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    try {
      if (request.method === 'POST' && url.pathname === '/init') return this.handleInit(request)
      if (request.method === 'POST' && url.pathname === '/guest-accept') return this.handleGuestAccept(request)
      if (request.method === 'POST' && url.pathname === '/guest-start') return this.handleGuestStart(request)
      if (request.method === 'POST' && url.pathname === '/guest-remove') return this.handleGuestRemove(request)
      if (request.method === 'POST' && url.pathname === '/start') return this.handleStart(request)
      if (request.method === 'POST' && url.pathname === '/segments/start') return this.handleSegmentsStart(request)
      if (request.method === 'POST' && url.pathname === '/bridge-token') return this.handleBridgeToken(request)
      if (request.method === 'POST' && url.pathname === '/broadcast-heartbeat') return this.handleBroadcastHeartbeat(request)
      if (request.method === 'POST' && url.pathname === '/end') return this.handleEnd(request)
      if (request.method === 'POST' && url.pathname === '/enter') return this.handleEnter(request)
      if (request.method === 'GET' && url.pathname === '/public-info') return this.handlePublicInfo()
      if (request.method === 'POST' && url.pathname === '/public-enter') return this.handlePublicEnter(request)
      if (request.method === 'POST' && url.pathname === '/recording-complete') return this.handleRecordingComplete(request)
      if (request.method === 'POST' && url.pathname === '/replay-access') return this.handleReplayAccess(request)
      if (request.method === 'POST' && url.pathname === '/replay-source') return this.handleReplaySource(request)
      if (request.method === 'GET' && url.pathname === '/state') return this.handleState()

      return json({ error: 'not_found' }, 404)
    } catch (e: any) {
      return json({ error: e?.message || 'internal_error' }, 500)
    }
  }

  private async handleInit(request: Request): Promise<Response> {
    const existing = await this.getMeta()
    if (existing) {
      return json({
        ok: true,
        already_initialized: true,
        room_id: existing.room_id,
        agora_channel: existing.agora_channel,
      })
    }

    const body = await request.json<{
      roomId: string
      hostWallet: string
      guestWallet?: string
      splitAddress: string
      network: NetworkId
      assetUsdc: string
      liveAmount: string
      replayAmount: string
      accessWindowMinutes: number
      replayMode: ReplayMode
      recordingMode: RecordingMode
      agoraChannel: string
    }>()

    if (!isAddress(body.hostWallet)) return json({ error: 'invalid_host_wallet' }, 400)
    if (body.guestWallet && !isAddress(body.guestWallet)) return json({ error: 'invalid_guest_wallet' }, 400)
    if (!isAddress(body.splitAddress)) return json({ error: 'invalid_split_address' }, 400)
    if (!isAddress(body.assetUsdc)) return json({ error: 'invalid_asset_usdc' }, 400)
    if (!isNetworkId(body.network)) return json({ error: 'invalid_network' }, 400)
    if (body.network !== ALLOWED_NETWORK) return json({ error: 'network_not_allowed' }, 400)
    if (body.assetUsdc.toLowerCase() !== BASE_SEPOLIA_USDC) return json({ error: 'asset_not_allowed' }, 400)
    if (!isAmount(body.liveAmount) || !isAmount(body.replayAmount)) return json({ error: 'invalid_amount' }, 400)
    if (!Number.isFinite(body.accessWindowMinutes) || body.accessWindowMinutes <= 0) {
      return json({ error: 'invalid_access_window' }, 400)
    }
    if (!isReplayMode(body.replayMode)) return json({ error: 'invalid_replay_mode' }, 400)
    if (!isRecordingMode(body.recordingMode)) return json({ error: 'invalid_recording_mode' }, 400)

    const now = nowSeconds()
    const meta: DuetRoomMeta = {
      room_id: body.roomId,
      status: 'created',
      host_wallet: body.hostWallet.toLowerCase(),
      guest_wallet: body.guestWallet?.toLowerCase(),
      split_address: body.splitAddress.toLowerCase(),
      network: body.network,
      asset_usdc: body.assetUsdc.toLowerCase(),
      live_amount: body.liveAmount,
      replay_amount: body.replayAmount,
      access_window_minutes: Math.floor(body.accessWindowMinutes),
      replay_mode: body.replayMode,
      recording_mode: body.recordingMode,
      audience_media_mode: 'bridge',
      agora_channel: body.agoraChannel,
      created_at: now,
    }

    const initialSegmentId = 'seg-1'
    meta.segments = [
      {
        id: initialSegmentId,
        started_at: now,
        pay_to: meta.split_address,
        pricing: {
          live_amount: meta.live_amount,
          replay_amount: meta.replay_amount,
        },
        rights: { kind: 'original' },
      },
    ]
    meta.current_segment_id = initialSegmentId
    meta.segment_locks = {}

    await this.putMeta(meta)

    return json({
      ok: true,
      room_id: meta.room_id,
      agora_channel: meta.agora_channel,
      status: meta.status,
    })
  }

  private async handleGuestAccept(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)

    const body = await request.json<{ wallet?: string }>()
    if (!body.wallet || !isAddress(body.wallet)) return json({ error: 'invalid_wallet' }, 400)

    const wallet = body.wallet.toLowerCase()

    if (meta.guest_wallet && meta.guest_wallet !== wallet) {
      return json({ error: 'guest_wallet_locked' }, 403)
    }

    if (meta.guest_accepted_at) {
      return json({
        ok: true,
        already_accepted: true,
        guest_wallet: meta.guest_wallet,
      })
    }

    meta.guest_wallet = wallet
    meta.guest_accepted_at = nowSeconds()
    await this.putMeta(meta)

    return json({
      ok: true,
      guest_wallet: meta.guest_wallet,
      guest_accepted_at: meta.guest_accepted_at,
    })
  }

  private async handleGuestStart(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)

    const body = await request.json<{ wallet?: string }>()
    if (!body.wallet || !isAddress(body.wallet)) return json({ error: 'invalid_wallet' }, 400)
    if (meta.status !== 'live') return json({ error: 'room_not_live', status: meta.status }, 400)
    if (!meta.guest_wallet || !meta.guest_accepted_at) return json({ error: 'guest_not_accepted' }, 403)

    const wallet = body.wallet.toLowerCase()
    if (wallet !== meta.guest_wallet) return json({ error: 'forbidden' }, 403)

    const guestBridgeTicket = randomTicket()
    const guestUid = meta.guest_bridge_agora_uid ?? randomAgoraUid()

    meta.guest_bridge_ticket = guestBridgeTicket
    meta.guest_bridge_ticket_hash = await sha256Hex(guestBridgeTicket)
    meta.guest_bridge_ticket_revoked_hash = undefined
    meta.guest_bridge_agora_uid = guestUid
    meta.guest_broadcast_state = 'idle'
    meta.guest_broadcast_mode = undefined
    meta.guest_broadcast_heartbeat_at = undefined
    meta.guest_broadcast_started_at = undefined
    meta.guest_broadcast_media = { audio: false, video: false }
    this.recomputeAggregateBroadcast(meta)
    await this.putMeta(meta)

    const broadcaster = generateToken(
      this.env.AGORA_APP_ID,
      this.env.AGORA_APP_CERTIFICATE,
      meta.agora_channel,
      guestUid,
      BRIDGE_TOKEN_TTL_SECONDS,
    )

    return json({
      ok: true,
      seat: 'guest',
      room_id: meta.room_id,
      guest_wallet: meta.guest_wallet,
      guest_bridge_ticket: guestBridgeTicket,
      agora_app_id: this.env.AGORA_APP_ID,
      agora_channel: meta.agora_channel,
      agora_broadcaster_uid: guestUid,
      agora_broadcaster_token: broadcaster.token,
      token_expires_in_seconds: broadcaster.expiresInSeconds,
      audience_media_mode: meta.audience_media_mode ?? 'bridge',
    })
  }

  private async handleGuestRemove(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)

    const body = await request.json<{ wallet?: string }>()
    if (!body.wallet || !isAddress(body.wallet)) return json({ error: 'invalid_wallet' }, 400)
    if (body.wallet.toLowerCase() !== meta.host_wallet) return json({ error: 'forbidden' }, 403)

    const hadActiveTicket = !!meta.guest_bridge_ticket_hash
    if (meta.guest_bridge_ticket_hash) {
      meta.guest_bridge_ticket_revoked_hash = meta.guest_bridge_ticket_hash
    }
    meta.guest_bridge_ticket = undefined
    meta.guest_bridge_ticket_hash = undefined
    meta.guest_broadcast_state = 'stopped'
    meta.guest_broadcast_mode = undefined
    meta.guest_broadcast_heartbeat_at = nowSeconds()
    meta.guest_broadcast_media = { audio: false, video: false }

    const hostVideoLive = !!meta.host_broadcast_media?.video
    if (!hostVideoLive) {
      meta.audience_media_mode = 'bridge'
    }
    this.recomputeAggregateBroadcast(meta)
    await this.putMeta(meta)

    return json({
      ok: true,
      revoked: hadActiveTicket,
      already_revoked: !hadActiveTicket,
      audience_media_mode: meta.audience_media_mode ?? 'bridge',
    })
  }

  private async handleStart(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)

    const body = await request.json<{ wallet?: string }>()
    if (!body.wallet || !isAddress(body.wallet)) return json({ error: 'invalid_wallet' }, 400)
    if (body.wallet.toLowerCase() !== meta.host_wallet) return json({ error: 'forbidden' }, 403)
    if (meta.status === 'ended') return json({ error: 'room_already_ended' }, 400)

    // Idempotent start: when already live, do not rotate bridge credentials.
    if (meta.status === 'live') {
      if (!meta.bridge_ticket || !meta.bridge_ticket_hash) {
        const fallbackTicket = randomTicket()
        meta.bridge_ticket = fallbackTicket
        meta.bridge_ticket_hash = await sha256Hex(fallbackTicket)
        await this.putMeta(meta)
      }

      const uid = meta.bridge_agora_uid ?? randomAgoraUid()
      if (!meta.bridge_agora_uid) {
        meta.bridge_agora_uid = uid
        await this.putMeta(meta)
      }

      const broadcaster = generateToken(
        this.env.AGORA_APP_ID,
        this.env.AGORA_APP_CERTIFICATE,
        meta.agora_channel,
        uid,
        BRIDGE_TOKEN_TTL_SECONDS,
      )

      return json({
        ok: true,
        already_live: true,
        status: meta.status,
        live_started_at: meta.live_started_at,
        agora_app_id: this.env.AGORA_APP_ID,
        bridge_ticket: meta.bridge_ticket,
        agora_channel: meta.agora_channel,
        agora_broadcaster_uid: uid,
        agora_broadcaster_token: broadcaster.token,
        token_expires_in_seconds: broadcaster.expiresInSeconds,
        recording_mode: meta.recording_mode,
        audience_media_mode: meta.audience_media_mode ?? 'bridge',
      })
    }

    const bridgeTicket = randomTicket()
    const now = nowSeconds()
    const bridgeUid = meta.bridge_agora_uid ?? randomAgoraUid()

    meta.status = 'live'
    meta.live_started_at = now
    meta.bridge_ticket = bridgeTicket
    meta.bridge_ticket_hash = await sha256Hex(bridgeTicket)
    meta.bridge_ticket_valid_until = undefined
    meta.bridge_agora_uid = bridgeUid
    meta.host_broadcast_state = 'idle'
    meta.host_broadcast_mode = undefined
    meta.host_broadcast_heartbeat_at = undefined
    meta.host_broadcast_started_at = undefined
    meta.host_broadcast_media = { audio: false, video: false }
    meta.guest_broadcast_state = 'idle'
    meta.guest_broadcast_mode = undefined
    meta.guest_broadcast_heartbeat_at = undefined
    meta.guest_broadcast_started_at = undefined
    meta.guest_broadcast_media = { audio: false, video: false }
    meta.broadcast_state = 'idle'
    meta.broadcast_mode = undefined
    meta.broadcast_heartbeat_at = undefined
    meta.broadcast_started_at = undefined
    if (!meta.audience_media_mode) {
      meta.audience_media_mode = 'bridge'
    }
    this.recomputeAggregateBroadcast(meta)
    await this.putMeta(meta)

    const broadcaster = generateToken(
      this.env.AGORA_APP_ID,
      this.env.AGORA_APP_CERTIFICATE,
      meta.agora_channel,
      bridgeUid,
      BRIDGE_TOKEN_TTL_SECONDS,
    )

    return json({
      ok: true,
      status: meta.status,
      agora_app_id: this.env.AGORA_APP_ID,
      bridge_ticket: bridgeTicket,
      agora_channel: meta.agora_channel,
      agora_broadcaster_uid: bridgeUid,
      agora_broadcaster_token: broadcaster.token,
      token_expires_in_seconds: broadcaster.expiresInSeconds,
      recording_mode: meta.recording_mode,
      audience_media_mode: meta.audience_media_mode ?? 'bridge',
    })
  }

  private async handleBridgeToken(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)

    const body = await request.json<{ bridgeTicket?: string }>()
    if (!body.bridgeTicket) return json({ error: 'bridge_ticket_required' }, 401)

    const verify = await this.verifyBridgeTicket(meta, body.bridgeTicket, { allowAfterEnd: false })
    if (!verify.ok) return json({ error: verify.error }, verify.status)
    if (meta.status !== 'live') return json({ error: 'room_not_live' }, 400)

    const seat: BroadcastSeat = verify.seat
    const uid = seat === 'guest'
      ? (meta.guest_bridge_agora_uid ?? randomAgoraUid())
      : (meta.bridge_agora_uid ?? randomAgoraUid())
    if (seat === 'guest') {
      if (!meta.guest_bridge_agora_uid) {
        meta.guest_bridge_agora_uid = uid
        await this.putMeta(meta)
      }
    } else if (!meta.bridge_agora_uid) {
      meta.bridge_agora_uid = uid
      await this.putMeta(meta)
    }

    const broadcaster = generateToken(
      this.env.AGORA_APP_ID,
      this.env.AGORA_APP_CERTIFICATE,
      meta.agora_channel,
      uid,
      BRIDGE_TOKEN_TTL_SECONDS,
    )

    return json({
      ok: true,
      seat,
      agora_app_id: this.env.AGORA_APP_ID,
      agora_channel: meta.agora_channel,
      agora_broadcaster_uid: uid,
      agora_broadcaster_token: broadcaster.token,
      token_expires_in_seconds: broadcaster.expiresInSeconds,
    })
  }

  private async handleEnd(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)

    const body = await request.json<{ wallet?: string }>()
    if (!body.wallet || !isAddress(body.wallet)) return json({ error: 'invalid_wallet' }, 400)
    if (body.wallet.toLowerCase() !== meta.host_wallet) return json({ error: 'forbidden' }, 403)

    if (meta.status === 'ended') {
      return json({ ok: true, already_ended: true, ended_at: meta.ended_at })
    }

    const now = nowSeconds()
    meta.status = 'ended'
    meta.ended_at = now
    meta.host_broadcast_state = 'stopped'
    meta.host_broadcast_mode = meta.host_broadcast_mode ?? meta.broadcast_mode
    meta.host_broadcast_heartbeat_at = now
    meta.host_broadcast_media = { audio: false, video: false }
    meta.guest_broadcast_state = 'stopped'
    meta.guest_broadcast_mode = undefined
    meta.guest_broadcast_heartbeat_at = now
    meta.guest_broadcast_media = { audio: false, video: false }
    meta.audience_media_mode = 'bridge'
    this.recomputeAggregateBroadcast(meta)
    if (meta.bridge_ticket_hash) {
      meta.bridge_ticket_valid_until = now + BRIDGE_TICKET_GRACE_AFTER_END_SECONDS
    }
    await this.putMeta(meta)

    return json({
      ok: true,
      status: meta.status,
      ended_at: meta.ended_at,
      bridge_ticket_valid_until: meta.bridge_ticket_valid_until,
    })
  }

  private async handleBroadcastHeartbeat(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)

    const body = await request.json<{
      bridgeTicket?: string
      status?: BroadcastState
      mode?: string
      media?: {
        audio?: boolean
        video?: boolean
      }
    }>()

    if (!body.bridgeTicket) return json({ error: 'missing_bridge_ticket' }, 401)
    const verify = await this.verifyBridgeTicket(meta, body.bridgeTicket, { allowAfterEnd: false, allowGuest: true })
    if (!verify.ok) return json({ error: verify.error }, verify.status)
    if (meta.status !== 'live') return json({ error: 'room_not_live', status: meta.status }, 400)

    const seat = verify.seat
    const now = nowSeconds()
    const nextState: BroadcastState = body.status === 'stopped' ? 'stopped' : 'live'
    const nextMode = body.mode ? body.mode.slice(0, 24) : this.getSeatBroadcastMode(meta, seat)
    const currentMedia = this.getSeatBroadcastMedia(meta, seat)
    const nextMedia: BroadcastMediaState = nextState === 'stopped'
      ? { audio: false, video: false }
      : body.media
        ? { audio: !!body.media.audio, video: !!body.media.video }
        : currentMedia

    if (seat === 'host') {
      meta.host_broadcast_state = nextState
      meta.host_broadcast_mode = nextMode
      meta.host_broadcast_heartbeat_at = now
      if (nextState === 'live' && !meta.host_broadcast_started_at) {
        meta.host_broadcast_started_at = now
      }
      meta.host_broadcast_media = nextMedia
    } else {
      meta.guest_broadcast_state = nextState
      meta.guest_broadcast_mode = nextMode
      meta.guest_broadcast_heartbeat_at = now
      if (nextState === 'live' && !meta.guest_broadcast_started_at) {
        meta.guest_broadcast_started_at = now
      }
      meta.guest_broadcast_media = nextMedia
    }

    const anyLiveVideo =
      (meta.host_broadcast_state === 'live' && !!meta.host_broadcast_media?.video) ||
      (meta.guest_broadcast_state === 'live' && !!meta.guest_broadcast_media?.video)
    meta.audience_media_mode = anyLiveVideo ? 'direct' : 'bridge'
    this.recomputeAggregateBroadcast(meta)
    await this.putMeta(meta)

    return json({
      ok: true,
      seat,
      room_id: meta.room_id,
      broadcast_state: meta.broadcast_state,
      broadcast_mode: meta.broadcast_mode ?? null,
      broadcast_heartbeat_at: meta.broadcast_heartbeat_at,
      broadcaster_online: isBroadcastOnline(meta, now),
      audience_media_mode: meta.audience_media_mode ?? 'bridge',
      host_broadcaster_online: this.isSeatBroadcastOnline(meta, 'host', now),
      guest_broadcaster_online: this.isSeatBroadcastOnline(meta, 'guest', now),
    })
  }

  private async handleSegmentsStart(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)
    if (meta.status !== 'live') return json({ error: 'room_not_live', status: meta.status }, 400)

    const body = await request.json<{
      wallet?: string
      payTo?: string
      songId?: string
      rights?: SegmentRights
    }>().catch(() => ({} as {
      wallet?: string
      payTo?: string
      songId?: string
      rights?: SegmentRights
    }))

    if (!body.wallet || !isAddress(body.wallet)) return json({ error: 'invalid_wallet' }, 400)
    if (body.wallet.toLowerCase() !== meta.host_wallet) return json({ error: 'forbidden' }, 403)

    if (!body.payTo || !isAddress(body.payTo)) return json({ error: 'invalid_pay_to' }, 400)
    const payTo = body.payTo.toLowerCase()

    const existingSegments = meta.segments ?? []
    if (existingSegments.length >= MAX_SEGMENTS_PER_ROOM) {
      return json({ error: 'max_segments_reached', max: MAX_SEGMENTS_PER_ROOM }, 400)
    }

    const now = nowSeconds()
    let rightsInput: unknown = body.rights
    if (typeof body.songId === 'string' && body.songId.trim().length > 0) {
      const song = await this.env.DB.prepare(`
        SELECT
          story_ip_id,
          payout_chain_id,
          payout_address,
          default_upstream_bps,
          payout_attestation_sig
        FROM song_registry
        WHERE song_id = ?1
      `).bind(body.songId.trim()).first<{
        story_ip_id: string
        payout_chain_id: number
        payout_address: string
        default_upstream_bps: number
        payout_attestation_sig: string
      }>()

      if (!song) return json({ error: 'song_not_found' }, 400)
      if (song.payout_chain_id !== 84532) return json({ error: 'song_payout_chain_not_allowed' }, 400)

      rightsInput = {
        kind: 'derivative',
        source_story_ip_ids: [song.story_ip_id],
        upstream_bps: song.default_upstream_bps,
        upstream_payout: song.payout_address,
        attestations: [
          {
            source_ip_id: song.story_ip_id,
            payout: song.payout_address,
            sig: song.payout_attestation_sig,
          },
        ],
      }
    }
    const segment: DuetRoomSegment = {
      id: crypto.randomUUID(),
      started_at: now,
      pay_to: payTo,
      pricing: {
        live_amount: meta.live_amount,
        replay_amount: meta.replay_amount,
      },
      rights: normalizeSegmentRights(rightsInput),
    }

    meta.segments = [...existingSegments, segment]
    meta.current_segment_id = segment.id
    await this.putMeta(meta)

    return json({
      ok: true,
      current_segment_id: meta.current_segment_id,
      segment,
    })
  }

  private async handleEnter(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)
    if (meta.status !== 'live') return json({ error: 'room_not_live', status: meta.status }, 400)

    const body = await request.json<{
      wallet?: string
      paymentSignature?: string
      resource?: string
    }>()

    if (!body.wallet || !isAddress(body.wallet)) return json({ error: 'wallet_required' }, 401)
    const wallet = body.wallet.toLowerCase()
    const baseResource = body.resource || `/duet/${meta.room_id}/enter`
    const now = nowSeconds()
    const currentSegment = this.getCurrentSegment(meta)
    const currentLiveAmount = currentSegment.pricing?.live_amount ?? meta.live_amount
    const currentLivePayTo = currentSegment.pay_to

    const ent = await this.getEntitlement(wallet)
    if ((ent.live_expires_at ?? 0) > now) {
      return this.successEnterResponse(meta, wallet, ent.live_expires_at!)
    }

    if (currentLiveAmount === '0') {
      const nextExpiry = extendExpiry(ent.live_expires_at, now, meta.access_window_minutes)
      ent.live_expires_at = nextExpiry
      await this.setEntitlement(wallet, ent)
      return this.successEnterResponse(meta, wallet, nextExpiry)
    }

    if (body.paymentSignature) {
      const { settleSegment, settleAmount, settlePayTo, settleResource, rejectResponse } =
        await this.resolveSettleSegment(meta, body.paymentSignature, baseResource, currentSegment, currentLiveAmount, currentLivePayTo, now)
      if (rejectResponse) return rejectResponse

      const requirement: X402PaymentRequirement = {
        scheme: 'exact',
        network: meta.network,
        asset: meta.asset_usdc,
        amount: settleAmount,
        payTo: settlePayTo,
        resource: settleResource,
      }

      const paymentSigHash = await sha256Hex(body.paymentSignature)
      const markerKey = this.settleKey(paymentSigHash)
      const marker = await this.state.storage.get<SettleMarker>(markerKey)

      if (marker) {
        if (marker.entitlement !== 'live' || marker.wallet !== wallet) {
          return json({ error: 'payment_signature_reused' }, 409)
        }

        if (marker.expires_at <= now) {
          return json({ error: 'payment_signature_already_consumed' }, 409)
        }

        if ((ent.live_expires_at ?? 0) < marker.expires_at) {
          ent.live_expires_at = marker.expires_at
          await this.setEntitlement(wallet, ent)
        }

        const response = this.successEnterResponse(meta, wallet, marker.expires_at)
        response.headers.set('PAYMENT-RESPONSE', toBase64Json({
          settled: true,
          idempotent: true,
          entitlement: 'live',
          expires_at: marker.expires_at,
          facilitator: marker.facilitator,
          transaction_hash: marker.transaction_hash,
        }))
        return response
      }

      const settle = await settlePaymentWithFacilitator(this.env, body.paymentSignature, requirement)
      if (!settle.ok) {
        const checkout = await buildSegmentCheckoutExtension(this.env.JWT_SECRET, meta.room_id, currentSegment.id, now)
        return paymentInvalidResponse({
          amount: currentLiveAmount,
          network: meta.network,
          asset: meta.asset_usdc,
          payTo: currentLivePayTo,
          resource: withSegmentId(baseResource, currentSegment.id),
          extensions: checkout,
          reason: settle.reason,
        })
      }

      if (settle.payer && settle.payer !== wallet) {
        const checkout = await buildSegmentCheckoutExtension(this.env.JWT_SECRET, meta.room_id, currentSegment.id, now)
        return paymentInvalidResponse({
          amount: currentLiveAmount,
          network: meta.network,
          asset: meta.asset_usdc,
          payTo: currentLivePayTo,
          resource: withSegmentId(baseResource, currentSegment.id),
          extensions: checkout,
          reason: 'payment_wallet_mismatch',
        })
      }

      const nextExpiry = extendExpiry(ent.live_expires_at, now, meta.access_window_minutes)
      ent.live_expires_at = nextExpiry

      const newMarker: SettleMarker = {
        processed_at: now,
        wallet,
        entitlement: 'live',
        expires_at: nextExpiry,
        segment_id: settleSegment.id,
        pay_to: settlePayTo,
        amount: settleAmount,
        facilitator: settle.facilitator,
        transaction_hash: settle.transactionHash,
      }

      await this.lockSegment(meta, settleSegment.id, now, settle.transactionHash)
      await this.state.storage.put(markerKey, newMarker)
      await this.setEntitlement(wallet, ent)
      await this.pruneSettlementMarkers(now)

      const response = this.successEnterResponse(meta, wallet, nextExpiry)
      response.headers.set('PAYMENT-RESPONSE', toBase64Json({
        settled: true,
        idempotent: false,
        entitlement: 'live',
        expires_at: nextExpiry,
        facilitator: settle.facilitator,
        transaction_hash: settle.transactionHash,
      }))
      return response
    }

    const checkout = await buildSegmentCheckoutExtension(this.env.JWT_SECRET, meta.room_id, currentSegment.id, now)
    return paymentRequiredResponse({
      amount: currentLiveAmount,
      network: meta.network,
      asset: meta.asset_usdc,
      payTo: currentLivePayTo,
      resource: withSegmentId(baseResource, currentSegment.id),
      extensions: checkout,
    })
  }

  private async handlePublicInfo(): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)
    const now = nowSeconds()

    return json({
      room_id: meta.room_id,
      status: meta.status,
      audience_mode: meta.live_amount === '0' ? 'free' : 'ticketed',
      can_enter: meta.status === 'live',
      broadcast_state: meta.broadcast_state ?? 'idle',
      broadcast_mode: meta.broadcast_mode ?? null,
      broadcast_heartbeat_at: meta.broadcast_heartbeat_at ?? null,
      broadcaster_online: isBroadcastOnline(meta, now),
      audience_media_mode: meta.audience_media_mode ?? 'bridge',
      broadcaster_uids: {
        host: meta.bridge_agora_uid ?? null,
        guest: meta.guest_bridge_agora_uid ?? null,
      },
      host_broadcast: {
        state: meta.host_broadcast_state ?? 'idle',
        mode: meta.host_broadcast_mode ?? null,
        heartbeat_at: meta.host_broadcast_heartbeat_at ?? null,
        media: meta.host_broadcast_media ?? { audio: false, video: false },
        online: this.isSeatBroadcastOnline(meta, 'host', now),
      },
      guest_broadcast: {
        state: meta.guest_broadcast_state ?? 'idle',
        mode: meta.guest_broadcast_mode ?? null,
        heartbeat_at: meta.guest_broadcast_heartbeat_at ?? null,
        media: meta.guest_broadcast_media ?? { audio: false, video: false },
        online: this.isSeatBroadcastOnline(meta, 'guest', now),
      },
    })
  }

  private async handlePublicEnter(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)
    if (meta.status !== 'live') return json({ error: 'room_not_live', status: meta.status }, 400)

    const body = await request.json<{
      wallet?: string
      paymentSignature?: string
      resource?: string
    }>().catch(() => ({} as {
      wallet?: string
      paymentSignature?: string
      resource?: string
    }))
    const baseResource = body.resource || `/duet/${meta.room_id}/public-enter`
    const now = nowSeconds()
    const currentSegment = this.getCurrentSegment(meta)
    const currentLiveAmount = currentSegment.pricing?.live_amount ?? meta.live_amount
    const currentLivePayTo = currentSegment.pay_to

    const walletFromBody = body.wallet ? body.wallet.toLowerCase() : undefined
    if (walletFromBody && !isAddress(walletFromBody)) return json({ error: 'invalid_wallet' }, 400)

    if (walletFromBody) {
      const ent = await this.getEntitlement(walletFromBody)
      if ((ent.live_expires_at ?? 0) > now) {
        return this.successEnterResponse(meta, walletFromBody, ent.live_expires_at!)
      }
    }

    if (currentLiveAmount !== '0') {
      if (body.paymentSignature) {
        const { settleSegment, settleAmount, settlePayTo, settleResource, rejectResponse } =
          await this.resolveSettleSegment(meta, body.paymentSignature, baseResource, currentSegment, currentLiveAmount, currentLivePayTo, now)
        if (rejectResponse) return rejectResponse

        const requirement: X402PaymentRequirement = {
          scheme: 'exact',
          network: meta.network,
          asset: meta.asset_usdc,
          amount: settleAmount,
          payTo: settlePayTo,
          resource: settleResource,
        }

        const paymentSigHash = await sha256Hex(body.paymentSignature)
        const markerKey = this.settleKey(paymentSigHash)
        const marker = await this.state.storage.get<SettleMarker>(markerKey)

        if (marker) {
          if (marker.entitlement !== 'live') return json({ error: 'payment_signature_reused' }, 409)
          if (walletFromBody && marker.wallet !== walletFromBody) {
            return json({ error: 'payment_signature_reused' }, 409)
          }
          if (marker.expires_at <= now) return json({ error: 'payment_signature_already_consumed' }, 409)

          const markerEnt = await this.getEntitlement(marker.wallet)
          if ((markerEnt.live_expires_at ?? 0) < marker.expires_at) {
            markerEnt.live_expires_at = marker.expires_at
            await this.setEntitlement(marker.wallet, markerEnt)
          }

          const response = this.successEnterResponse(meta, marker.wallet, marker.expires_at)
          response.headers.set('PAYMENT-RESPONSE', toBase64Json({
            settled: true,
            idempotent: true,
            entitlement: 'live',
            expires_at: marker.expires_at,
            facilitator: marker.facilitator,
            transaction_hash: marker.transaction_hash,
          }))
          return response
        }

        const settle = await settlePaymentWithFacilitator(this.env, body.paymentSignature, requirement)
        if (!settle.ok) {
          const checkout = await buildSegmentCheckoutExtension(this.env.JWT_SECRET, meta.room_id, currentSegment.id, now)
          return paymentInvalidResponse({
            amount: currentLiveAmount,
            network: meta.network,
            asset: meta.asset_usdc,
            payTo: currentLivePayTo,
            resource: withSegmentId(baseResource, currentSegment.id),
            extensions: checkout,
            reason: settle.reason,
          })
        }

        const settleWallet = settle.payer?.toLowerCase()
        if (walletFromBody && settleWallet && walletFromBody !== settleWallet) {
          const checkout = await buildSegmentCheckoutExtension(this.env.JWT_SECRET, meta.room_id, currentSegment.id, now)
          return paymentInvalidResponse({
            amount: currentLiveAmount,
            network: meta.network,
            asset: meta.asset_usdc,
            payTo: currentLivePayTo,
            resource: withSegmentId(baseResource, currentSegment.id),
            extensions: checkout,
            reason: 'payment_wallet_mismatch',
          })
        }

        const effectiveWallet = walletFromBody ?? settleWallet
        if (!effectiveWallet || !isAddress(effectiveWallet)) {
          const uid = randomAgoraUid()
          const viewer = generateViewerToken(
            this.env.AGORA_APP_ID,
            this.env.AGORA_APP_CERTIFICATE,
            meta.agora_channel,
            uid,
          )
          const response = json({
            ok: true,
            room_id: meta.room_id,
            agora_app_id: this.env.AGORA_APP_ID,
            agora_channel: meta.agora_channel,
            agora_uid: uid,
            agora_viewer_token: viewer.token,
            token_expires_in_seconds: viewer.expiresInSeconds,
          })
          response.headers.set('PAYMENT-RESPONSE', toBase64Json({
            settled: true,
            idempotent: false,
            entitlement: 'live',
            expires_at: null,
            facilitator: settle.facilitator,
            transaction_hash: settle.transactionHash,
          }))
          await this.lockSegment(meta, settleSegment.id, now, settle.transactionHash)
          return response
        }

        const ent = await this.getEntitlement(effectiveWallet)
        const nextExpiry = extendExpiry(ent.live_expires_at, now, meta.access_window_minutes)
        ent.live_expires_at = nextExpiry

        const newMarker: SettleMarker = {
          processed_at: now,
          wallet: effectiveWallet,
          entitlement: 'live',
          expires_at: nextExpiry,
          segment_id: settleSegment.id,
          pay_to: settlePayTo,
          amount: settleAmount,
          facilitator: settle.facilitator,
          transaction_hash: settle.transactionHash,
        }

        await this.lockSegment(meta, settleSegment.id, now, settle.transactionHash)
        await this.state.storage.put(markerKey, newMarker)
        await this.setEntitlement(effectiveWallet, ent)
        await this.pruneSettlementMarkers(now)

        const response = this.successEnterResponse(meta, effectiveWallet, nextExpiry)
        response.headers.set('PAYMENT-RESPONSE', toBase64Json({
          settled: true,
          idempotent: false,
          entitlement: 'live',
          expires_at: nextExpiry,
          facilitator: settle.facilitator,
          transaction_hash: settle.transactionHash,
        }))
        return response
      }

      const checkout = await buildSegmentCheckoutExtension(this.env.JWT_SECRET, meta.room_id, currentSegment.id, now)
      return paymentRequiredResponse({
        amount: currentLiveAmount,
        network: meta.network,
        asset: meta.asset_usdc,
        payTo: currentLivePayTo,
        resource: withSegmentId(baseResource, currentSegment.id),
        extensions: checkout,
      })
    }

    const uid = randomAgoraUid()
    const viewer = generateViewerToken(
      this.env.AGORA_APP_ID,
      this.env.AGORA_APP_CERTIFICATE,
      meta.agora_channel,
      uid,
    )

    return json({
      ok: true,
      room_id: meta.room_id,
      agora_app_id: this.env.AGORA_APP_ID,
      agora_channel: meta.agora_channel,
      agora_uid: uid,
      agora_viewer_token: viewer.token,
      token_expires_in_seconds: viewer.expiresInSeconds,
      audience_mode: 'free',
    })
  }

  private async handleRecordingComplete(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)

    const body = await request.json<{
      bridgeTicket?: string
      load_dataitem_id?: string
      replay_url?: string
      replay_x402_url?: string
      created_at?: number
    }>()

    if (!body.bridgeTicket) return json({ error: 'missing_bridge_ticket' }, 401)
    const verify = await this.verifyBridgeTicket(meta, body.bridgeTicket, { allowAfterEnd: true, allowGuest: false })
    if (!verify.ok) return json({ error: verify.error }, verify.status)

    if (!body.load_dataitem_id) return json({ error: 'missing_load_dataitem_id' }, 400)
    if (meta.replay_mode === 'load_gated' && !body.replay_x402_url) {
      return json({ error: 'missing_replay_x402_url' }, 400)
    }
    if (meta.replay_mode === 'worker_gated' && !body.replay_url) {
      return json({ error: 'missing_replay_url' }, 400)
    }

    meta.recording = {
      load_dataitem_id: body.load_dataitem_id,
      replay_url: body.replay_url,
      replay_x402_url: body.replay_x402_url,
      created_at: body.created_at || nowSeconds(),
    }

    // Recording finalized; bridge ticket no longer needed.
    meta.bridge_ticket = undefined
    meta.bridge_ticket_hash = undefined
    meta.bridge_ticket_valid_until = undefined
    meta.guest_bridge_ticket = undefined
    meta.guest_bridge_ticket_hash = undefined
    meta.guest_broadcast_state = 'stopped'
    meta.guest_broadcast_mode = undefined
    meta.guest_broadcast_media = { audio: false, video: false }
    this.recomputeAggregateBroadcast(meta)
    await this.putMeta(meta)

    return json({
      ok: true,
      replay_mode: meta.replay_mode,
      recording: meta.recording,
    })
  }

  private async handleReplayAccess(request: Request): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)
    if (!meta.recording) return json({ error: 'recording_not_ready' }, 404)

    if (meta.replay_mode === 'load_gated') {
      if (!meta.recording.replay_x402_url) return json({ error: 'recording_not_ready' }, 404)
      return json({
        mode: 'load_gated',
        replay_x402_url: meta.recording.replay_x402_url,
      })
    }

    const body = await request.json<{
      wallet?: string
      paymentSignature?: string
      resource?: string
    }>()

    if (!body.wallet || !isAddress(body.wallet)) return json({ error: 'wallet_required' }, 401)
    if (!meta.recording.replay_url) return json({ error: 'recording_not_ready' }, 404)

    const wallet = body.wallet.toLowerCase()
    const resource = body.resource || `/duet/${meta.room_id}/replay`
    const now = nowSeconds()
    const ent = await this.getEntitlement(wallet)

    if ((ent.replay_expires_at ?? 0) > now) {
      const grant = await this.issueReplayAccessGrant(wallet, meta.recording.replay_url)
      return json({
        mode: 'worker_gated',
        replay_access_token: grant.token,
        replay_access_expires_at: grant.expires_at,
        replay_expires_at: ent.replay_expires_at,
      })
    }

    if (meta.replay_amount === '0') {
      const nextExpiry = extendExpiry(ent.replay_expires_at, now, meta.access_window_minutes)
      ent.replay_expires_at = nextExpiry
      await this.setEntitlement(wallet, ent)

      const grant = await this.issueReplayAccessGrant(wallet, meta.recording.replay_url)
      return json({
        mode: 'worker_gated',
        replay_access_token: grant.token,
        replay_access_expires_at: grant.expires_at,
        replay_expires_at: nextExpiry,
      })
    }

    if (body.paymentSignature) {
      const requirement: X402PaymentRequirement = {
        scheme: 'exact',
        network: meta.network,
        asset: meta.asset_usdc,
        amount: meta.replay_amount,
        payTo: meta.split_address,
        resource,
      }

      const paymentSigHash = await sha256Hex(body.paymentSignature)
      const markerKey = this.settleKey(paymentSigHash)
      const marker = await this.state.storage.get<SettleMarker>(markerKey)

      if (marker) {
        if (marker.entitlement !== 'replay' || marker.wallet !== wallet) {
          return json({ error: 'payment_signature_reused' }, 409)
        }

        if (marker.expires_at <= now) {
          return json({ error: 'payment_signature_already_consumed' }, 409)
        }

        if ((ent.replay_expires_at ?? 0) < marker.expires_at) {
          ent.replay_expires_at = marker.expires_at
          await this.setEntitlement(wallet, ent)
        }

        const grant = await this.issueReplayAccessGrant(wallet, meta.recording.replay_url)
        const response = json({
          mode: 'worker_gated',
          replay_access_token: grant.token,
          replay_access_expires_at: grant.expires_at,
          replay_expires_at: marker.expires_at,
        })
        response.headers.set('PAYMENT-RESPONSE', toBase64Json({
          settled: true,
          idempotent: true,
          entitlement: 'replay',
          expires_at: marker.expires_at,
          facilitator: marker.facilitator,
          transaction_hash: marker.transaction_hash,
        }))
        return response
      }

      const settle = await settlePaymentWithFacilitator(this.env, body.paymentSignature, requirement)
      if (!settle.ok) {
        return paymentInvalidResponse({
          amount: meta.replay_amount,
          network: meta.network,
          asset: meta.asset_usdc,
          payTo: meta.split_address,
          resource,
          reason: settle.reason,
        })
      }

      if (settle.payer && settle.payer !== wallet) {
        return paymentInvalidResponse({
          amount: meta.replay_amount,
          network: meta.network,
          asset: meta.asset_usdc,
          payTo: meta.split_address,
          resource,
          reason: 'payment_wallet_mismatch',
        })
      }

      const nextExpiry = extendExpiry(ent.replay_expires_at, now, meta.access_window_minutes)
      ent.replay_expires_at = nextExpiry

      const newMarker: SettleMarker = {
        processed_at: now,
        wallet,
        entitlement: 'replay',
        expires_at: nextExpiry,
        facilitator: settle.facilitator,
        transaction_hash: settle.transactionHash,
      }

      await this.state.storage.put(markerKey, newMarker)
      await this.setEntitlement(wallet, ent)
      await this.pruneSettlementMarkers(now)

      const grant = await this.issueReplayAccessGrant(wallet, meta.recording.replay_url)
      const response = json({
        mode: 'worker_gated',
        replay_access_token: grant.token,
        replay_access_expires_at: grant.expires_at,
        replay_expires_at: nextExpiry,
      })
      response.headers.set('PAYMENT-RESPONSE', toBase64Json({
        settled: true,
        idempotent: false,
        entitlement: 'replay',
        expires_at: nextExpiry,
        facilitator: settle.facilitator,
        transaction_hash: settle.transactionHash,
      }))
      return response
    }

    return paymentRequiredResponse({
      amount: meta.replay_amount,
      network: meta.network,
      asset: meta.asset_usdc,
      payTo: meta.split_address,
      resource,
    })
  }

  private async handleReplaySource(request: Request): Promise<Response> {
    const body = await request.json<{ token?: string }>()
    if (!body.token) return json({ error: 'missing_replay_access_token' }, 400)

    const tokenHash = await sha256Hex(body.token)
    const key = this.replayAccessKey(tokenHash)
    const grant = await this.state.storage.get<ReplayAccessGrant>(key)
    if (!grant) return json({ error: 'invalid_or_expired_replay_token' }, 401)

    const now = nowSeconds()
    if (grant.expires_at <= now) {
      await this.state.storage.delete(key)
      return json({ error: 'invalid_or_expired_replay_token' }, 401)
    }

    // One-time token to reduce sharing/replay.
    await this.state.storage.delete(key)
    return json({
      ok: true,
      replay_url: grant.replay_url,
      wallet: grant.wallet,
    })
  }

  private async handleState(): Promise<Response> {
    const meta = await this.getMeta()
    if (!meta) return json({ error: 'room_not_found' }, 404)
    return json({ meta })
  }

  // -- Segment checkout token resolution (shared by handleEnter and handlePublicEnter) --

  private async resolveSettleSegment(
    meta: DuetRoomMeta,
    paymentSignature: string,
    baseResource: string,
    currentSegment: DuetRoomSegment,
    currentLiveAmount: string,
    currentLivePayTo: string,
    now: number,
  ): Promise<{
    settleSegment: DuetRoomSegment
    settleAmount: string
    settlePayTo: string
    settleResource: string
    rejectResponse: Response | null
  }> {
    const paymentMeta = tryParseBase64Json(paymentSignature) ?? tryParseJson(paymentSignature)
    const sigResource = paymentMeta && typeof paymentMeta === 'object' && typeof (paymentMeta as any).resource === 'string'
      ? String((paymentMeta as any).resource)
      : undefined
    const sigSegmentId = sigResource ? extractSegmentIdFromResource(sigResource) : null
    const sigToken = paymentMeta && typeof paymentMeta === 'object'
      ? readSegmentCheckoutToken((paymentMeta as any).extensions)
      : null
    const verified = sigToken
      ? await verifySegmentCheckoutToken(this.env.JWT_SECRET, sigToken, meta.room_id, now)
      : { ok: false as const, reason: 'missing_segment_checkout' as const }

    if (verified.ok) {
      if (sigSegmentId && sigSegmentId !== verified.claims.segment_id) {
        const checkout = await buildSegmentCheckoutExtension(this.env.JWT_SECRET, meta.room_id, currentSegment.id, now)
        return {
          settleSegment: currentSegment,
          settleAmount: currentLiveAmount,
          settlePayTo: currentLivePayTo,
          settleResource: withSegmentId(baseResource, currentSegment.id),
          rejectResponse: paymentInvalidResponse({
            amount: currentLiveAmount,
            network: meta.network,
            asset: meta.asset_usdc,
            payTo: currentLivePayTo,
            resource: withSegmentId(baseResource, currentSegment.id),
            extensions: checkout,
            reason: 'segment_checkout_mismatch',
          }),
        }
      }
    } else {
      // Prevent paying a stale segment without a valid checkout token.
      if (sigSegmentId && sigSegmentId !== currentSegment.id) {
        const checkout = await buildSegmentCheckoutExtension(this.env.JWT_SECRET, meta.room_id, currentSegment.id, now)
        return {
          settleSegment: currentSegment,
          settleAmount: currentLiveAmount,
          settlePayTo: currentLivePayTo,
          settleResource: withSegmentId(baseResource, currentSegment.id),
          rejectResponse: paymentInvalidResponse({
            amount: currentLiveAmount,
            network: meta.network,
            asset: meta.asset_usdc,
            payTo: currentLivePayTo,
            resource: withSegmentId(baseResource, currentSegment.id),
            extensions: checkout,
            reason: 'segment_checkout_required',
          }),
        }
      }
    }

    const settleSegmentId = verified.ok ? verified.claims.segment_id : currentSegment.id
    const settleSegment = (meta.segments ?? []).find((s) => s.id === settleSegmentId) ?? currentSegment
    const settleAmount = settleSegment.pricing?.live_amount ?? meta.live_amount
    const settlePayTo = settleSegment.pay_to
    const settleResource = sigResource || withSegmentId(baseResource, settleSegment.id)

    return { settleSegment, settleAmount, settlePayTo, settleResource, rejectResponse: null }
  }

  // -- Internal helpers --

  private getSeatBroadcastState(meta: DuetRoomMeta, seat: BroadcastSeat): BroadcastState {
    if (seat === 'guest') return meta.guest_broadcast_state ?? 'idle'
    return meta.host_broadcast_state ?? 'idle'
  }

  private getSeatBroadcastMode(meta: DuetRoomMeta, seat: BroadcastSeat): string | undefined {
    if (seat === 'guest') return meta.guest_broadcast_mode
    return meta.host_broadcast_mode
  }

  private getSeatBroadcastHeartbeat(meta: DuetRoomMeta, seat: BroadcastSeat): number | undefined {
    if (seat === 'guest') return meta.guest_broadcast_heartbeat_at
    return meta.host_broadcast_heartbeat_at
  }

  private getSeatBroadcastStarted(meta: DuetRoomMeta, seat: BroadcastSeat): number | undefined {
    if (seat === 'guest') return meta.guest_broadcast_started_at
    return meta.host_broadcast_started_at
  }

  private getSeatBroadcastMedia(meta: DuetRoomMeta, seat: BroadcastSeat): BroadcastMediaState {
    const media = seat === 'guest' ? meta.guest_broadcast_media : meta.host_broadcast_media
    if (media) {
      return { audio: !!media.audio, video: !!media.video }
    }
    return {
      audio: this.getSeatBroadcastState(meta, seat) === 'live',
      video: false,
    }
  }

  private isSeatBroadcastOnline(meta: DuetRoomMeta, seat: BroadcastSeat, now: number): boolean {
    if (meta.status !== 'live') return false
    if (this.getSeatBroadcastState(meta, seat) !== 'live') return false
    const heartbeatAt = this.getSeatBroadcastHeartbeat(meta, seat) ?? 0
    if (heartbeatAt <= 0) return false
    return now - heartbeatAt <= BROADCAST_HEARTBEAT_TIMEOUT_SECONDS
  }

  private recomputeAggregateBroadcast(meta: DuetRoomMeta): boolean {
    const prevState = meta.broadcast_state
    const prevMode = meta.broadcast_mode
    const prevHeartbeat = meta.broadcast_heartbeat_at
    const prevStarted = meta.broadcast_started_at

    const hostState = this.getSeatBroadcastState(meta, 'host')
    const guestState = this.getSeatBroadcastState(meta, 'guest')
    const hostMode = this.getSeatBroadcastMode(meta, 'host')
    const guestMode = this.getSeatBroadcastMode(meta, 'guest')
    const hostHeartbeat = this.getSeatBroadcastHeartbeat(meta, 'host') ?? 0
    const guestHeartbeat = this.getSeatBroadcastHeartbeat(meta, 'guest') ?? 0
    const hostStarted = this.getSeatBroadcastStarted(meta, 'host') ?? 0
    const guestStarted = this.getSeatBroadcastStarted(meta, 'guest') ?? 0

    const hasLive = hostState === 'live' || guestState === 'live'
    const hasStopped = hostState === 'stopped' || guestState === 'stopped' || meta.status === 'ended'

    const nextState: BroadcastState = hasLive ? 'live' : (hasStopped ? 'stopped' : 'idle')
    let nextMode: string | undefined
    if (hostState === 'live' && guestState === 'live') {
      if (hostMode && guestMode) {
        nextMode = hostMode === guestMode ? hostMode : 'multi'
      } else {
        nextMode = hostMode ?? guestMode
      }
    } else if (hostState === 'live') {
      nextMode = hostMode
    } else if (guestState === 'live') {
      nextMode = guestMode
    } else if (hostState === 'stopped') {
      nextMode = hostMode
    } else if (guestState === 'stopped') {
      nextMode = guestMode
    } else {
      nextMode = undefined
    }

    const nextHeartbeat = Math.max(hostHeartbeat, guestHeartbeat, 0) || undefined
    let nextStarted: number | undefined
    const liveStarted = [hostState === 'live' ? hostStarted : 0, guestState === 'live' ? guestStarted : 0].filter((v) => v > 0)
    if (liveStarted.length > 0) {
      nextStarted = Math.min(...liveStarted)
    } else if ((meta.broadcast_started_at ?? 0) > 0) {
      nextStarted = meta.broadcast_started_at
    } else {
      const anyStarted = [hostStarted, guestStarted].filter((v) => v > 0)
      nextStarted = anyStarted.length > 0 ? Math.min(...anyStarted) : undefined
    }

    meta.broadcast_state = nextState
    meta.broadcast_mode = nextMode
    meta.broadcast_heartbeat_at = nextHeartbeat
    meta.broadcast_started_at = nextStarted

    return (
      prevState !== meta.broadcast_state ||
      prevMode !== meta.broadcast_mode ||
      prevHeartbeat !== meta.broadcast_heartbeat_at ||
      prevStarted !== meta.broadcast_started_at
    )
  }

  private async verifyBridgeTicket(
    meta: DuetRoomMeta,
    bridgeTicket: string,
    opts: { allowAfterEnd: boolean; allowGuest?: boolean },
  ): Promise<{ ok: true; seat: BroadcastSeat } | { ok: false; error: string; status: number }> {
    const hasHostTicket = !!meta.bridge_ticket_hash
    const hasGuestTicket = !!meta.guest_bridge_ticket_hash
    if (!hasHostTicket && !hasGuestTicket) return { ok: false, error: 'bridge_not_started', status: 400 }

    const providedHash = await sha256Hex(bridgeTicket)
    if (meta.guest_bridge_ticket_revoked_hash && providedHash === meta.guest_bridge_ticket_revoked_hash) {
      return { ok: false, error: 'guest_revoked', status: 403 }
    }

    let seat: BroadcastSeat | null = null
    if (meta.bridge_ticket_hash && providedHash === meta.bridge_ticket_hash) {
      seat = 'host'
    } else if (meta.guest_bridge_ticket_hash && providedHash === meta.guest_bridge_ticket_hash) {
      seat = 'guest'
    }
    if (!seat) {
      return { ok: false, error: 'forbidden', status: 403 }
    }

    if (seat === 'guest' && opts.allowGuest === false) {
      return { ok: false, error: 'forbidden', status: 403 }
    }

    if (meta.status === 'ended') {
      if (!opts.allowAfterEnd) return { ok: false, error: 'room_not_live', status: 400 }
      if (seat === 'guest') return { ok: false, error: 'bridge_ticket_expired', status: 401 }
      const validUntil = meta.bridge_ticket_valid_until ?? 0
      if (nowSeconds() > validUntil) {
        return { ok: false, error: 'bridge_ticket_expired', status: 401 }
      }
    }

    return { ok: true, seat }
  }

  private async issueReplayAccessGrant(wallet: string, replayUrl: string): Promise<{ token: string; expires_at: number }> {
    const token = randomTicket()
    const tokenHash = await sha256Hex(token)
    const now = nowSeconds()
    const expiresAt = now + REPLAY_ACCESS_TOKEN_TTL_SECONDS

    const grant: ReplayAccessGrant = {
      wallet,
      replay_url: replayUrl,
      created_at: now,
      expires_at: expiresAt,
    }

    await this.state.storage.put(this.replayAccessKey(tokenHash), grant)
    return { token, expires_at: expiresAt }
  }

  private successEnterResponse(meta: DuetRoomMeta, wallet: string, liveExpiresAt: number): Response {
    const uid = addressToUid(wallet)
    const viewer = generateViewerToken(
      this.env.AGORA_APP_ID,
      this.env.AGORA_APP_CERTIFICATE,
      meta.agora_channel,
      uid,
    )

    return json({
      ok: true,
      room_id: meta.room_id,
      agora_app_id: this.env.AGORA_APP_ID,
      agora_channel: meta.agora_channel,
      agora_uid: uid,
      agora_viewer_token: viewer.token,
      token_expires_in_seconds: viewer.expiresInSeconds,
      live_expires_at: liveExpiresAt,
    })
  }

  private async getMeta(): Promise<DuetRoomMeta | null> {
    const meta = (await this.state.storage.get<DuetRoomMeta>('meta')) ?? null
    if (!meta) return null

    let changed = false

    // Lazy migration for rooms created before segment support shipped.
    if (!meta.segments || meta.segments.length === 0) {
      const startedAt = meta.live_started_at ?? meta.created_at ?? nowSeconds()
      meta.segments = [
        {
          id: 'seg-1',
          started_at: startedAt,
          pay_to: meta.split_address,
          pricing: {
            live_amount: meta.live_amount,
            replay_amount: meta.replay_amount,
          },
          rights: { kind: 'original' },
        },
      ]
      meta.current_segment_id = 'seg-1'
      changed = true
    }

    if (!meta.current_segment_id) {
      meta.current_segment_id = meta.segments[meta.segments.length - 1].id
      changed = true
    } else if (!meta.segments.find((s) => s.id === meta.current_segment_id)) {
      meta.current_segment_id = meta.segments[meta.segments.length - 1].id
      changed = true
    }

    if (!meta.segment_locks) {
      meta.segment_locks = {}
      changed = true
    }

    if (!meta.audience_media_mode) {
      meta.audience_media_mode = 'bridge'
      changed = true
    }

    if (!meta.host_broadcast_state) {
      meta.host_broadcast_state = meta.broadcast_state ?? 'idle'
      changed = true
    }
    if (meta.host_broadcast_mode === undefined && meta.broadcast_mode !== undefined) {
      meta.host_broadcast_mode = meta.broadcast_mode
      changed = true
    }
    if (meta.host_broadcast_heartbeat_at === undefined && meta.broadcast_heartbeat_at !== undefined) {
      meta.host_broadcast_heartbeat_at = meta.broadcast_heartbeat_at
      changed = true
    }
    if (meta.host_broadcast_started_at === undefined && meta.broadcast_started_at !== undefined) {
      meta.host_broadcast_started_at = meta.broadcast_started_at
      changed = true
    }
    if (!meta.host_broadcast_media) {
      meta.host_broadcast_media = {
        audio: (meta.host_broadcast_state ?? 'idle') === 'live',
        video: false,
      }
      changed = true
    }

    if (!meta.guest_broadcast_state) {
      meta.guest_broadcast_state = 'idle'
      changed = true
    }
    if (!meta.guest_broadcast_media) {
      meta.guest_broadcast_media = { audio: false, video: false }
      changed = true
    }

    if (this.recomputeAggregateBroadcast(meta)) {
      changed = true
    }

    if (changed) {
      await this.putMeta(meta)
    }
    return meta
  }

  private async putMeta(meta: DuetRoomMeta): Promise<void> {
    await this.state.storage.put('meta', meta)
  }

  private getCurrentSegment(meta: DuetRoomMeta): DuetRoomSegment {
    const segments = meta.segments ?? []
    const currentId = meta.current_segment_id
    const found = currentId ? segments.find((s) => s.id === currentId) : undefined
    if (found) return found
    if (segments.length > 0) return segments[segments.length - 1]
    return {
      id: 'seg-legacy',
      started_at: meta.live_started_at ?? meta.created_at ?? nowSeconds(),
      pay_to: meta.split_address,
      pricing: {
        live_amount: meta.live_amount,
        replay_amount: meta.replay_amount,
      },
      rights: { kind: 'original' },
    }
  }

  private async lockSegment(
    meta: DuetRoomMeta,
    segmentId: string,
    now: number,
    transactionHash?: string,
  ): Promise<void> {
    if (!segmentId) return
    const locks = meta.segment_locks ?? {}
    if (locks[segmentId]) return
    locks[segmentId] = { locked_at: now, first_settlement_tx_hash: transactionHash }
    meta.segment_locks = locks
    await this.putMeta(meta)
  }

  private entitlementKey(wallet: string): string {
    return `ent:${wallet.toLowerCase()}`
  }

  private settleKey(paymentSigHash: string): string {
    return `settle:${paymentSigHash}`
  }

  private replayAccessKey(tokenHash: string): string {
    return `replaytok:${tokenHash}`
  }

  private async getEntitlement(wallet: string): Promise<WalletEntitlement> {
    return (await this.state.storage.get<WalletEntitlement>(this.entitlementKey(wallet))) ?? {}
  }

  private async setEntitlement(wallet: string, entitlement: WalletEntitlement): Promise<void> {
    await this.state.storage.put(this.entitlementKey(wallet), entitlement)
  }

  private async pruneSettlementMarkers(now: number): Promise<void> {
    const lastPrune = (await this.state.storage.get<number>(SETTLEMENT_LAST_PRUNE_KEY)) ?? 0
    if (now - lastPrune < SETTLEMENT_PRUNE_INTERVAL_SECONDS) return
    await this.state.storage.put(SETTLEMENT_LAST_PRUNE_KEY, now)

    const cutoff = now - SETTLEMENT_TTL_SECONDS
    const markers = await this.state.storage.list<SettleMarker>({ prefix: 'settle:' })
    const deletions: Promise<boolean>[] = []

    for (const [key, marker] of markers) {
      if (!marker || typeof marker.processed_at !== 'number' || marker.processed_at < cutoff) {
        deletions.push(this.state.storage.delete(key))
      }
    }

    if (deletions.length > 0) {
      await Promise.all(deletions)
    }
  }
}

// -- Payment response helpers --

interface PaymentRequirement {
  amount: string
  network: NetworkId
  asset: string
  payTo: string
  resource: string
  extensions?: unknown
}

function paymentRequiredResponse(req: PaymentRequirement): Response {
  const payload = buildPaymentRequiredPayload(req)
  return json(
    { error: 'payment_required' },
    402,
    { 'PAYMENT-REQUIRED': toBase64Json(payload) },
  )
}

function paymentInvalidResponse(req: PaymentRequirement & { reason: string }): Response {
  const payload = buildPaymentRequiredPayload(req)
  return json(
    { error: req.reason },
    402,
    { 'PAYMENT-REQUIRED': toBase64Json(payload) },
  )
}

function buildPaymentRequiredPayload(req: PaymentRequirement): unknown {
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: 'exact',
        network: req.network,
        asset: req.asset,
        amount: req.amount,
        payTo: req.payTo,
        // Required by @x402/evm Exact scheme to build a valid EIP-3009 authorization payload.
        maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS,
        extra: {
          assetTransferMethod: 'eip3009',
          name: BASE_SEPOLIA_USDC_EIP712.name,
          version: BASE_SEPOLIA_USDC_EIP712.version,
        },
      },
    ],
    resource: req.resource,
    ...(req.extensions ? { extensions: req.extensions } : {}),
  }
}

// -- Segment checkout token --

const SEGMENT_CHECKOUT_TTL_SECONDS = 5 * 60

interface SegmentCheckoutClaims {
  room_id: string
  segment_id: string
  exp: number
}

function withSegmentId(resource: string, segmentId: string): string {
  try {
    const u = resource.includes('://') ? new URL(resource) : new URL(resource, 'https://heaven.invalid')
    u.searchParams.set('segment_id', segmentId)
    return `${u.pathname}${u.search}`
  } catch {
    const sep = resource.includes('?') ? '&' : '?'
    return `${resource}${sep}segment_id=${encodeURIComponent(segmentId)}`
  }
}

function extractSegmentIdFromResource(resource: string): string | null {
  try {
    const u = resource.includes('://') ? new URL(resource) : new URL(resource, 'https://heaven.invalid')
    const seg = u.searchParams.get('segment_id')
    return seg && seg.length > 0 ? seg : null
  } catch {
    const m = resource.match(/[?&]segment_id=([^&]+)/)
    if (!m) return null
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }
}

function readSegmentCheckoutToken(extensions: unknown): string | null {
  if (!extensions || typeof extensions !== 'object') return null
  const segmentCheckout = (extensions as any).segment_checkout
  if (!segmentCheckout || typeof segmentCheckout !== 'object') return null
  const token = (segmentCheckout as any).token
  if (typeof token !== 'string' || token.length < 10) return null
  return token
}

async function buildSegmentCheckoutExtension(
  secret: string,
  roomId: string,
  segmentId: string,
  now: number,
): Promise<unknown> {
  const exp = now + SEGMENT_CHECKOUT_TTL_SECONDS
  const claims: SegmentCheckoutClaims = { room_id: roomId, segment_id: segmentId, exp }
  const token = await signSegmentCheckoutToken(secret, claims)
  return {
    segment_checkout: {
      token,
      segment_id: segmentId,
      expires_at: exp,
    },
  }
}

async function verifySegmentCheckoutToken(
  secret: string,
  token: string,
  roomId: string,
  now: number,
): Promise<
  | { ok: true; claims: SegmentCheckoutClaims }
  | { ok: false; reason: 'invalid_token_format' | 'invalid_token_sig' | 'token_room_mismatch' | 'token_expired' | 'invalid_token_claims' }
> {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'invalid_token_format' }
  const [claimsB64, sigHex] = parts
  if (!/^[a-fA-F0-9]{64}$/.test(sigHex)) return { ok: false, reason: 'invalid_token_format' }

  const expected = await hmacSha256Hex(secret, claimsB64)
  if (expected.toLowerCase() !== sigHex.toLowerCase()) return { ok: false, reason: 'invalid_token_sig' }

  const claims = tryParseBase64Json(claimsB64)
  if (!claims || typeof claims !== 'object') return { ok: false, reason: 'invalid_token_claims' }
  const room_id = (claims as any).room_id
  const segment_id = (claims as any).segment_id
  const exp = (claims as any).exp
  if (typeof room_id !== 'string' || typeof segment_id !== 'string' || typeof exp !== 'number') {
    return { ok: false, reason: 'invalid_token_claims' }
  }
  if (room_id !== roomId) return { ok: false, reason: 'token_room_mismatch' }
  if (!Number.isFinite(exp) || exp < now) return { ok: false, reason: 'token_expired' }

  return { ok: true, claims: { room_id, segment_id, exp } }
}

async function signSegmentCheckoutToken(secret: string, claims: SegmentCheckoutClaims): Promise<string> {
  const claimsB64 = toBase64Json(claims)
  const sigHex = await hmacSha256Hex(secret, claimsB64)
  return `${claimsB64}.${sigHex}`
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// -- General utilities --

function isBroadcastOnline(meta: DuetRoomMeta, now: number): boolean {
  if (meta.status !== 'live') return false
  if (meta.broadcast_state !== 'live') return false
  const heartbeatAt = meta.broadcast_heartbeat_at ?? 0
  if (heartbeatAt <= 0) return false
  return now - heartbeatAt <= BROADCAST_HEARTBEAT_TIMEOUT_SECONDS
}

function extendExpiry(currentExpiry: number | undefined, now: number, windowMinutes: number): number {
  const base = Math.max(currentExpiry ?? 0, now)
  return base + windowMinutes * 60
}

function randomAgoraUid(): number {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return arr[0] % 0xffffffff
}

function randomTicket(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toBase64Json(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function isAmount(value: string): boolean {
  return /^\d+$/.test(value)
}

function isNetworkId(value: string): value is NetworkId {
  return value === 'eip155:8453' || value === 'eip155:84532'
}

function isReplayMode(value: string): value is ReplayMode {
  return value === 'load_gated' || value === 'worker_gated'
}

function isRecordingMode(value: string): value is RecordingMode {
  return value === 'host_local' || value === 'agora_cloud'
}

function normalizeSegmentRights(input: unknown): SegmentRights | undefined {
  if (!input || typeof input !== 'object') return undefined
  const kind = (input as any).kind
  if (kind !== 'original' && kind !== 'derivative') return undefined
  const rights: SegmentRights = { kind }

  const sourceIds = (input as any).source_story_ip_ids
  if (Array.isArray(sourceIds) && sourceIds.every((v) => typeof v === 'string')) {
    rights.source_story_ip_ids = sourceIds.map((s) => s.slice(0, 256))
  }

  const upstreamBps = (input as any).upstream_bps
  if (Number.isFinite(upstreamBps)) {
    rights.upstream_bps = Math.max(0, Math.min(10_000, Math.floor(upstreamBps)))
  }

  const upstreamPayout = (input as any).upstream_payout
  if (typeof upstreamPayout === 'string' && isAddress(upstreamPayout)) {
    rights.upstream_payout = upstreamPayout.toLowerCase()
  }

  const atts = (input as any).attestations
  if (Array.isArray(atts)) {
    const out: SegmentRightsAttestation[] = []
    for (const a of atts) {
      if (!a || typeof a !== 'object') continue
      const source_ip_id = (a as any).source_ip_id
      const payout = (a as any).payout
      const sig = (a as any).sig
      if (typeof source_ip_id !== 'string' || typeof payout !== 'string' || typeof sig !== 'string') continue
      if (!isAddress(payout)) continue
      out.push({
        source_ip_id: source_ip_id.slice(0, 256),
        payout: payout.toLowerCase(),
        sig: sig.slice(0, 2048),
      })
    }
    if (out.length > 0) rights.attestations = out
  }

  return rights
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}
