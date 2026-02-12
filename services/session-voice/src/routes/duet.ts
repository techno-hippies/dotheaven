/**
 * Duet Routes — paid duet control plane (x402-ready).
 *
 * Endpoints:
 * - POST /create
 * - POST /:id/guest/accept
 * - POST /:id/start
 * - POST /:id/bridge/token
 * - POST /:id/enter
 * - POST /:id/end
 * - POST /:id/recording/complete
 * - GET  /:id/replay
 * - GET  /:id/replay/source?token=...
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { verifyJWT } from '../auth'

type NetworkId = 'eip155:8453' | 'eip155:84532'
type ReplayMode = 'load_gated' | 'worker_gated'
type RecordingMode = 'host_local' | 'agora_cloud'

const DEFAULT_NETWORK: NetworkId = 'eip155:84532'
const DEFAULT_ACCESS_WINDOW_MINUTES = 1440
const DEFAULT_LIVE_AMOUNT = '100000' // $0.10 USDC (6 decimals)
const DEFAULT_REPLAY_AMOUNT = '100000' // $0.10 USDC (6 decimals)
const BASE_MAINNET_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const BASE_SEPOLIA_USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'

export const duetRoutes = new Hono<{ Bindings: Env }>()

duetRoutes.post('/create', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{
    split_address?: string
    guest_wallet?: string
    network?: NetworkId
    asset_usdc?: string
    live_amount?: string | number
    replay_amount?: string | number
    access_window_minutes?: number
    replay_mode?: ReplayMode
    recording_mode?: RecordingMode
  }>().catch(() => ({}))

  if (!body.split_address || !isAddress(body.split_address)) {
    return c.json({ error: 'invalid_split_address' }, 400)
  }
  if (body.guest_wallet && !isAddress(body.guest_wallet)) {
    return c.json({ error: 'invalid_guest_wallet' }, 400)
  }

  const network = body.network ?? DEFAULT_NETWORK
  if (!isNetworkId(network)) return c.json({ error: 'invalid_network' }, 400)

  const assetUsdc = (body.asset_usdc ?? defaultUsdcForNetwork(network)).toLowerCase()
  if (!isAddress(assetUsdc)) return c.json({ error: 'invalid_asset_usdc' }, 400)

  const liveAmount = parseUsdcAmountToBaseUnits(body.live_amount, DEFAULT_LIVE_AMOUNT)
  if (!liveAmount) return c.json({ error: 'invalid_live_amount' }, 400)

  const replayAmount = parseUsdcAmountToBaseUnits(body.replay_amount, DEFAULT_REPLAY_AMOUNT)
  if (!replayAmount) return c.json({ error: 'invalid_replay_amount' }, 400)

  const accessWindowMinutes = body.access_window_minutes ?? DEFAULT_ACCESS_WINDOW_MINUTES
  if (!Number.isFinite(accessWindowMinutes) || accessWindowMinutes <= 0) {
    return c.json({ error: 'invalid_access_window' }, 400)
  }

  const replayMode: ReplayMode = body.replay_mode ?? 'worker_gated'
  if (!isReplayMode(replayMode)) return c.json({ error: 'invalid_replay_mode' }, 400)

  const recordingMode: RecordingMode = body.recording_mode ?? 'host_local'
  if (!isRecordingMode(recordingMode)) return c.json({ error: 'invalid_recording_mode' }, 400)

  const roomId = crypto.randomUUID()
  const agoraChannel = `heaven-duet-${roomId}`

  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/init', {
    method: 'POST',
    body: JSON.stringify({
      roomId,
      hostWallet: wallet,
      guestWallet: body.guest_wallet?.toLowerCase(),
      splitAddress: body.split_address.toLowerCase(),
      network,
      assetUsdc,
      liveAmount,
      replayAmount,
      accessWindowMinutes: Math.floor(accessWindowMinutes),
      replayMode,
      recordingMode,
      agoraChannel,
    }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.post('/:id/guest/accept', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/guest-accept', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.post('/:id/start', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/start', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.post('/:id/bridge/token', async (c) => {
  const bridgeTicket = getBearerToken(c.req.header('authorization'))
  if (!bridgeTicket) return c.json({ error: 'bridge_ticket_required' }, 401)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/bridge-token', {
    method: 'POST',
    body: JSON.stringify({ bridgeTicket }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.post('/:id/enter', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const paymentSignature = c.req.header('payment-signature') || undefined
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/enter', {
    method: 'POST',
    body: JSON.stringify({
      wallet,
      paymentSignature,
      resource: `/duet/${roomId}/enter`,
    }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.post('/:id/end', async (c) => {
  const wallet = await requireWallet(c, c.env)
  if (!wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/end', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.post('/:id/recording/complete', async (c) => {
  const bridgeTicket = getBearerToken(c.req.header('authorization'))
  if (!bridgeTicket) return c.json({ error: 'bridge_ticket_required' }, 401)

  const body = await c.req.json<{
    load_dataitem_id?: string
    replay_url?: string
    replay_x402_url?: string
    created_at?: number
  }>().catch(() => ({}))

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/recording-complete', {
    method: 'POST',
    body: JSON.stringify({
      bridgeTicket,
      load_dataitem_id: body.load_dataitem_id,
      replay_url: body.replay_url,
      replay_x402_url: body.replay_x402_url,
      created_at: body.created_at,
    }),
  }))

  return forwardDoResponse(doResp)
})

duetRoutes.get('/:id/replay/source', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'missing_replay_access_token' }, 400)

  const roomId = c.req.param('id')
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/replay-source', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }))

  if (!doResp.ok) {
    return forwardDoResponse(doResp)
  }

  const payload = await doResp.json<{ replay_url?: string }>()
  if (!payload.replay_url) {
    return c.json({ error: 'invalid_replay_source' }, 500)
  }

  const upstream = await fetch(payload.replay_url)
  if (!upstream.ok) {
    return c.json({ error: 'replay_fetch_failed', status: upstream.status }, 502)
  }

  const headers = new Headers({
    'Cache-Control': 'no-store',
  })
  const contentType = upstream.headers.get('Content-Type')
  if (contentType) headers.set('Content-Type', contentType)
  const contentLength = upstream.headers.get('Content-Length')
  if (contentLength) headers.set('Content-Length', contentLength)
  const contentRange = upstream.headers.get('Content-Range')
  if (contentRange) headers.set('Content-Range', contentRange)
  const acceptRanges = upstream.headers.get('Accept-Ranges')
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges)

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
})

duetRoutes.get('/:id/replay', async (c) => {
  const auth = c.req.header('authorization')
  const wallet = await resolveOptionalWallet(auth, c.env)
  if (auth && !wallet) return c.json({ error: 'unauthorized' }, 401)

  const roomId = c.req.param('id')
  const paymentSignature = c.req.header('payment-signature') || undefined
  const stub = getDuetRoomStub(c.env, roomId)
  const doResp = await stub.fetch(new Request('http://do/replay-access', {
    method: 'POST',
    body: JSON.stringify({
      wallet: wallet ?? undefined,
      paymentSignature,
      resource: `/duet/${roomId}/replay`,
    }),
  }))

  return forwardDoResponse(doResp)
})

function getDuetRoomStub(env: Env, roomId: string): DurableObjectStub {
  const id = env.DUET_ROOM_DO.idFromName(roomId)
  return env.DUET_ROOM_DO.get(id)
}

async function requireWallet(c: any, env: Env): Promise<string | null> {
  const auth = c.req.header('authorization')
  return resolveOptionalWallet(auth, env)
}

async function resolveOptionalWallet(authHeader: string | undefined, env: Env): Promise<string | null> {
  if (!authHeader) return null
  if (!authHeader.startsWith('Bearer ')) return null
  const payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET)
  return payload?.sub ?? null
}

function getBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  return token.length > 0 ? token : null
}

async function forwardDoResponse(doResp: Response): Promise<Response> {
  const text = await doResp.text()
  const headers = new Headers({
    'Content-Type': doResp.headers.get('Content-Type') || 'application/json',
    'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE',
  })

  const paymentRequired = doResp.headers.get('PAYMENT-REQUIRED')
  if (paymentRequired) headers.set('PAYMENT-REQUIRED', paymentRequired)

  const paymentResponse = doResp.headers.get('PAYMENT-RESPONSE')
  if (paymentResponse) headers.set('PAYMENT-RESPONSE', paymentResponse)

  return new Response(text, {
    status: doResp.status,
    headers,
  })
}

function defaultUsdcForNetwork(network: NetworkId): string {
  return network === 'eip155:8453' ? BASE_MAINNET_USDC : BASE_SEPOLIA_USDC
}

/**
 * Accepts:
 * - undefined -> fallback
 * - number (USDC, e.g. 0.1) -> base units
 * - decimal string (USDC, e.g. "0.1") -> base units
 * - integer string (already base units, e.g. "100000")
 */
function parseUsdcAmountToBaseUnits(value: string | number | undefined, fallback: string): string | null {
  if (value === undefined || value === null) return fallback

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null
    if (value === 0) return '0'
    return Math.round(value * 1_000_000).toString()
  }

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    return trimmed
  }

  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null

  const [whole, fracRaw] = trimmed.split('.')
  const frac = (fracRaw ?? '').padEnd(6, '0')
  const baseUnits = `${whole}${frac}`.replace(/^0+/, '') || '0'
  return baseUnits
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
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
