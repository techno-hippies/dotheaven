import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { duetRoutes } from './routes/duet'
import type { Env } from './types'

const HOST_WALLET = '0x1111111111111111111111111111111111111111'
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
})
