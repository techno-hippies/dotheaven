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

type NetworkId = 'eip155:8453' | 'eip155:84532'
type RoomStatus = 'created' | 'live' | 'ended'
type ReplayMode = 'load_gated' | 'worker_gated'
type RecordingMode = 'host_local' | 'agora_cloud'
type EntitlementType = 'live' | 'replay'

interface WalletEntitlement {
  live_expires_at?: number
  replay_expires_at?: number
}

interface RecordingMetadata {
  load_dataitem_id: string
  replay_url?: string
  replay_x402_url?: string
  created_at: number
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
  agora_channel: string
  bridge_ticket?: string
  bridge_ticket_hash?: string
  bridge_ticket_valid_until?: number
  bridge_agora_uid?: number
  live_started_at?: number
  ended_at?: number
  recording?: RecordingMetadata
  created_at: number
}

interface SettleMarker {
  processed_at: number
  wallet: string
  entitlement: EntitlementType
  expires_at: number
  facilitator?: 'mock' | 'cdp'
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
      if (request.method === 'POST' && url.pathname === '/start') return this.handleStart(request)
      if (request.method === 'POST' && url.pathname === '/bridge-token') return this.handleBridgeToken(request)
      if (request.method === 'POST' && url.pathname === '/end') return this.handleEnd(request)
      if (request.method === 'POST' && url.pathname === '/enter') return this.handleEnter(request)
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
      agora_channel: body.agoraChannel,
      created_at: now,
    }

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
        bridge_ticket: meta.bridge_ticket,
        agora_channel: meta.agora_channel,
        agora_broadcaster_uid: uid,
        agora_broadcaster_token: broadcaster.token,
        token_expires_in_seconds: broadcaster.expiresInSeconds,
        recording_mode: meta.recording_mode,
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
      bridge_ticket: bridgeTicket,
      agora_channel: meta.agora_channel,
      agora_broadcaster_uid: bridgeUid,
      agora_broadcaster_token: broadcaster.token,
      token_expires_in_seconds: broadcaster.expiresInSeconds,
      recording_mode: meta.recording_mode,
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
    const resource = body.resource || `/duet/${meta.room_id}/enter`
    const now = nowSeconds()

    const ent = await this.getEntitlement(wallet)
    if ((ent.live_expires_at ?? 0) > now) {
      return this.successEnterResponse(meta, wallet, ent.live_expires_at!)
    }

    if (meta.live_amount === '0') {
      const nextExpiry = extendExpiry(ent.live_expires_at, now, meta.access_window_minutes)
      ent.live_expires_at = nextExpiry
      await this.setEntitlement(wallet, ent)
      return this.successEnterResponse(meta, wallet, nextExpiry)
    }

    if (body.paymentSignature) {
      const requirement: X402PaymentRequirement = {
        scheme: 'exact',
        network: meta.network,
        asset: meta.asset_usdc,
        amount: meta.live_amount,
        payTo: meta.split_address,
        resource,
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
        return paymentInvalidResponse({
          amount: meta.live_amount,
          network: meta.network,
          asset: meta.asset_usdc,
          payTo: meta.split_address,
          resource,
          reason: settle.reason,
        })
      }

      if (settle.payer && settle.payer !== wallet) {
        return paymentInvalidResponse({
          amount: meta.live_amount,
          network: meta.network,
          asset: meta.asset_usdc,
          payTo: meta.split_address,
          resource,
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
        facilitator: settle.facilitator,
        transaction_hash: settle.transactionHash,
      }

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

    return paymentRequiredResponse({
      amount: meta.live_amount,
      network: meta.network,
      asset: meta.asset_usdc,
      payTo: meta.split_address,
      resource,
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
    const verify = await this.verifyBridgeTicket(meta, body.bridgeTicket, { allowAfterEnd: true })
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

  private async verifyBridgeTicket(
    meta: DuetRoomMeta,
    bridgeTicket: string,
    opts: { allowAfterEnd: boolean },
  ): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    if (!meta.bridge_ticket_hash) return { ok: false, error: 'bridge_not_started', status: 400 }

    const providedHash = await sha256Hex(bridgeTicket)
    if (providedHash !== meta.bridge_ticket_hash) {
      return { ok: false, error: 'forbidden', status: 403 }
    }

    if (meta.status === 'ended') {
      if (!opts.allowAfterEnd) return { ok: false, error: 'room_not_live', status: 400 }
      const validUntil = meta.bridge_ticket_valid_until ?? 0
      if (nowSeconds() > validUntil) {
        return { ok: false, error: 'bridge_ticket_expired', status: 401 }
      }
    }

    return { ok: true }
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
      agora_channel: meta.agora_channel,
      agora_uid: uid,
      agora_viewer_token: viewer.token,
      token_expires_in_seconds: viewer.expiresInSeconds,
      live_expires_at: liveExpiresAt,
    })
  }

  private async getMeta(): Promise<DuetRoomMeta | null> {
    return (await this.state.storage.get<DuetRoomMeta>('meta')) ?? null
  }

  private async putMeta(meta: DuetRoomMeta): Promise<void> {
    await this.state.storage.put('meta', meta)
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

interface PaymentRequirement {
  amount: string
  network: NetworkId
  asset: string
  payTo: string
  resource: string
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
      },
    ],
    resource: req.resource,
  }
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

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}
