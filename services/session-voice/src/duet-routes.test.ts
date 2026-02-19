import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { duetRoutes } from './routes/duet'
import type { Env } from './types'

const HOST_WALLET = '0x1111111111111111111111111111111111111111'
const GUEST_WALLET = '0x2222222222222222222222222222222222222222'
const OTHER_WALLET = '0x3333333333333333333333333333333333333333'
const BASE_MAINNET_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const BASE_SEPOLIA_USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'

function base64UrlEncode(data: Uint8Array): string {
  let binary = ''
  for (const b of data) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str))
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return base64UrlEncode(new Uint8Array(sig))
}

async function mintJWT(wallet: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const h = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const b = base64UrlEncodeString(JSON.stringify({ sub: wallet.toLowerCase(), iat: now, exp: now + 3600 }))
  const s = await hmacSign(secret, `${h}.${b}`)
  return `${h}.${b}.${s}`
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ROOM_DO: {} as DurableObjectNamespace,
    DUET_ROOM_DO: {} as DurableObjectNamespace,
    ENVIRONMENT: 'test',
    AGORA_APP_ID: '00000000000000000000000000000000',
    AGORA_APP_CERTIFICATE: '00000000000000000000000000000000',
    JWT_SECRET: 'test-jwt-secret',
    RPC_URL: 'http://localhost:8545',
    ESCROW_ADDRESS: HOST_WALLET,
    CHAIN_ID: '84532',
    REGISTRY_ADDRESS: HOST_WALLET,
    VERIFICATION_MIRROR_ADDRESS: HOST_WALLET,
    X402_FACILITATOR_MODE: 'mock',
    ...overrides,
  }
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>()
  app.route('/duet', duetRoutes)
  return app
}

type DiscoverDbRow = {
  room_id: string
  host_wallet: string
  guest_wallet: string | null
  status: 'created' | 'live' | 'ended'
  live_amount: string
  replay_amount: string
  audience_mode: 'free' | 'ticketed'
  visibility: 'public' | 'unlisted'
  title: string | null
  room_kind: string | null
  listener_count: number
  live_started_at: number | null
  ended_at: number | null
  created_at: number
  updated_at: number
}

function makeDiscoverDb(rows: DiscoverDbRow[]): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (walletA: string, walletB: string) => ({
        all: async () => ({
          results: rows
            .filter((row) => {
              if (row.status !== 'created' && row.status !== 'live') return false
              if (row.visibility === 'public') return true
              return row.host_wallet === walletA || row.guest_wallet === walletB
            })
            .sort((a, b) => {
              const aLiveRank = a.status === 'live' ? 0 : 1
              const bLiveRank = b.status === 'live' ? 0 : 1
              if (aLiveRank !== bLiveRank) return aLiveRank - bLiveRank
              const aStarted = a.live_started_at ?? a.created_at
              const bStarted = b.live_started_at ?? b.created_at
              return bStarted - aStarted
            }),
        }),
      }),
    }),
  } as unknown as D1Database
}

describe('duet routes', () => {
  test('POST /duet/create rejects Base mainnet network', async () => {
    const env = makeEnv()
    const token = await mintJWT(HOST_WALLET, env.JWT_SECRET)

    const app = makeApp()
    const res = await app.request(
      '/duet/create',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          split_address: HOST_WALLET,
          network: 'eip155:8453',
        }),
      },
      env,
    )

    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body?.error).toBe('network_not_allowed')
    expect(body?.allowed?.[0]).toBe('eip155:84532')
  })

  test('POST /duet/create rejects non-sepolia USDC address', async () => {
    const env = makeEnv()
    const token = await mintJWT(HOST_WALLET, env.JWT_SECRET)

    const app = makeApp()
    const res = await app.request(
      '/duet/create',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          split_address: HOST_WALLET,
          network: 'eip155:84532',
          asset_usdc: BASE_MAINNET_USDC,
        }),
      },
      env,
    )

    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body?.error).toBe('asset_not_allowed')
    expect(body?.allowed?.[0]).toBe(BASE_SEPOLIA_USDC)
  })

  test('POST /duet/create defaults to Base Sepolia + Base Sepolia USDC', async () => {
    let initBody: any = null
    const env = makeEnv({
      DUET_ROOM_DO: {
        idFromName: (name: string) => name as any,
        get: (_id: any) => ({
          fetch: async (req: Request) => {
            const url = new URL(req.url)
            if (url.pathname !== '/init') return Response.json({ error: 'not_found' }, { status: 404 })
            initBody = await req.json()
            return Response.json({
              ok: true,
              room_id: initBody.roomId,
              agora_channel: initBody.agoraChannel,
              status: 'created',
            })
          },
        }),
      } as any,
    })
    const token = await mintJWT(HOST_WALLET, env.JWT_SECRET)

    const app = makeApp()
    const res = await app.request(
      '/duet/create',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          split_address: HOST_WALLET,
          // network and asset_usdc omitted on purpose
          live_amount: '100000',
          replay_amount: '100000',
          access_window_minutes: 1440,
          replay_mode: 'worker_gated',
          recording_mode: 'host_local',
        }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(typeof body?.room_id).toBe('string')
    expect(typeof body?.agora_channel).toBe('string')

    expect(initBody?.network).toBe('eip155:84532')
    expect(initBody?.assetUsdc).toBe(BASE_SEPOLIA_USDC)
    expect(typeof initBody?.roomId).toBe('string')
    expect(initBody?.agoraChannel).toMatch(/^heaven-duet-/)
  })

  test('GET /duet/discover returns empty list when DB binding is unavailable', async () => {
    const env = makeEnv({ DB: {} as D1Database })
    const app = makeApp()
    const res = await app.request('/duet/discover', { method: 'GET' }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(Array.isArray(body?.rooms)).toBe(true)
    expect(body.rooms).toEqual([])
  })

  test('GET /duet/discover returns public + viewer-related unlisted rooms', async () => {
    const now = Math.floor(Date.now() / 1000)
    const env = makeEnv({
      DB: makeDiscoverDb([
        {
          room_id: 'public-live',
          host_wallet: HOST_WALLET,
          guest_wallet: null,
          status: 'live',
          live_amount: '100000',
          replay_amount: '100000',
          audience_mode: 'ticketed',
          visibility: 'public',
          title: 'Public Live Room',
          room_kind: 'duet',
          listener_count: 12,
          live_started_at: now - 60,
          ended_at: null,
          created_at: now - 120,
          updated_at: now - 30,
        },
        {
          room_id: 'unlisted-guest',
          host_wallet: HOST_WALLET,
          guest_wallet: GUEST_WALLET,
          status: 'created',
          live_amount: '0',
          replay_amount: '0',
          audience_mode: 'free',
          visibility: 'unlisted',
          title: 'Guest Invite',
          room_kind: 'duet',
          listener_count: 0,
          live_started_at: null,
          ended_at: null,
          created_at: now - 90,
          updated_at: now - 45,
        },
        {
          room_id: 'unlisted-other',
          host_wallet: OTHER_WALLET,
          guest_wallet: null,
          status: 'live',
          live_amount: '100000',
          replay_amount: '100000',
          audience_mode: 'ticketed',
          visibility: 'unlisted',
          title: 'Private Other',
          room_kind: 'dj_set',
          listener_count: 4,
          live_started_at: now - 30,
          ended_at: null,
          created_at: now - 150,
          updated_at: now - 20,
        },
        {
          room_id: 'public-ended',
          host_wallet: HOST_WALLET,
          guest_wallet: null,
          status: 'ended',
          live_amount: '100000',
          replay_amount: '100000',
          audience_mode: 'ticketed',
          visibility: 'public',
          title: 'Ended Public',
          room_kind: 'duet',
          listener_count: 20,
          live_started_at: now - 400,
          ended_at: now - 100,
          created_at: now - 600,
          updated_at: now - 80,
        },
      ]),
    })
    const token = await mintJWT(GUEST_WALLET, env.JWT_SECRET)
    const app = makeApp()
    const res = await app.request(
      '/duet/discover',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as any
    const rooms = Array.isArray(body?.rooms) ? body.rooms : []
    const roomIds = rooms.map((r: any) => r.room_id)
    expect(roomIds).toEqual(['public-live', 'unlisted-guest'])

    const guestRoom = rooms.find((r: any) => r.room_id === 'unlisted-guest')
    expect(guestRoom?.started_at).toBe(guestRoom?.created_at)
    expect(guestRoom?.audience_mode).toBe('free')
  })

  test('POST /duet/:id/guest/start forwards wallet to DO guest-start', async () => {
    const roomId = 'room-guest-start'
    let forwardedBody: any = null
    let forwardedPath = ''
    const env = makeEnv({
      DUET_ROOM_DO: {
        idFromName: (name: string) => name as any,
        get: (_id: any) => ({
          fetch: async (req: Request) => {
            const url = new URL(req.url)
            forwardedPath = url.pathname
            forwardedBody = await req.json()
            return Response.json({ ok: true, seat: 'guest' })
          },
        }),
      } as any,
    })
    const token = await mintJWT(GUEST_WALLET, env.JWT_SECRET)

    const app = makeApp()
    const res = await app.request(
      `/duet/${roomId}/guest/start`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      env,
    )

    expect(res.status).toBe(200)
    expect(forwardedPath).toBe('/guest-start')
    expect(forwardedBody?.wallet).toBe(GUEST_WALLET.toLowerCase())
  })

  test('POST /duet/:id/guest/remove forwards wallet to DO guest-remove', async () => {
    const roomId = 'room-guest-remove'
    let forwardedBody: any = null
    let forwardedPath = ''
    const env = makeEnv({
      DUET_ROOM_DO: {
        idFromName: (name: string) => name as any,
        get: (_id: any) => ({
          fetch: async (req: Request) => {
            const url = new URL(req.url)
            forwardedPath = url.pathname
            forwardedBody = await req.json()
            return Response.json({ ok: true, revoked: true })
          },
        }),
      } as any,
    })
    const token = await mintJWT(HOST_WALLET, env.JWT_SECRET)

    const app = makeApp()
    const res = await app.request(
      `/duet/${roomId}/guest/remove`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      env,
    )

    expect(res.status).toBe(200)
    expect(forwardedPath).toBe('/guest-remove')
    expect(forwardedBody?.wallet).toBe(HOST_WALLET.toLowerCase())
  })

  test('POST /duet/:id/broadcast/heartbeat forwards media payload and bridge token', async () => {
    const roomId = 'room-heartbeat-media'
    let forwardedBody: any = null
    let forwardedPath = ''
    const env = makeEnv({
      DUET_ROOM_DO: {
        idFromName: (name: string) => name as any,
        get: (_id: any) => ({
          fetch: async (req: Request) => {
            const url = new URL(req.url)
            forwardedPath = url.pathname
            forwardedBody = await req.json()
            return Response.json({ ok: true })
          },
        }),
      } as any,
    })

    const app = makeApp()
    const res = await app.request(
      `/duet/${roomId}/broadcast/heartbeat`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer bridge-ticket-test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'live',
          mode: 'mic',
          media: { audio: true, video: true },
        }),
      },
      env,
    )

    expect(res.status).toBe(200)
    expect(forwardedPath).toBe('/broadcast-heartbeat')
    expect(forwardedBody?.bridgeTicket).toBe('bridge-ticket-test')
    expect(forwardedBody?.status).toBe('live')
    expect(forwardedBody?.mode).toBe('mic')
    expect(forwardedBody?.media).toEqual({ audio: true, video: true })
  })

  test('GET /duet/:id/guest/broadcast redirects to /duet/:id/broadcast with query', async () => {
    const env = makeEnv()
    const app = makeApp()
    const res = await app.request(
      '/duet/room-guest-broadcast/guest/broadcast?bridgeTicket=abc123&role=guest',
      { method: 'GET', redirect: 'manual' as RequestRedirect },
      env,
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/duet/room-guest-broadcast/broadcast?bridgeTicket=abc123&role=guest')
  })
})
