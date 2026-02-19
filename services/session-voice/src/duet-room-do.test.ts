import { describe, expect, test } from 'bun:test'
import { DuetRoomDO } from './duet-room-do'
import type { Env } from './types'

const HOST_WALLET = '0x1111111111111111111111111111111111111111'
const GUEST_WALLET = '0x2222222222222222222222222222222222222222'
const VIEWER_WALLET = '0x3333333333333333333333333333333333333333'
const OTHER_WALLET = '0x4444444444444444444444444444444444444444'
const SPLIT_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const ASSET_USDC_SEPOLIA = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

class InMemoryStorage {
  private records = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.records.get(key)
    if (value === undefined) return undefined
    return structuredClone(value) as T
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, structuredClone(value))
  }

  async delete(key: string): Promise<boolean> {
    return this.records.delete(key)
  }

  async list<T>(opts: { prefix?: string } = {}): Promise<Map<string, T>> {
    const out = new Map<string, T>()
    for (const [key, value] of this.records.entries()) {
      if (opts.prefix && !key.startsWith(opts.prefix)) continue
      out.set(key, structuredClone(value) as T)
    }
    return out
  }
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

function makeRoom(overrides: Partial<Env> = {}): DuetRoomDO {
  const state = {
    storage: new InMemoryStorage(),
  } as unknown as DurableObjectState
  return new DuetRoomDO(state, makeEnv(overrides))
}

function decodeBase64Json(raw: string): JsonValue {
  return JSON.parse(atob(raw)) as JsonValue
}

function readPaymentRequiredHeader(response: Response): JsonValue {
  const header = response.headers.get('PAYMENT-REQUIRED')
  expect(typeof header).toBe('string')
  return decodeBase64Json(header as string)
}

function buildMockPaymentSignature(args: {
  network: string
  asset: string
  amount: string
  payTo: string
  resource: string
  wallet?: string
  extensions?: Record<string, unknown>
}): string {
  const payload: Record<string, unknown> = {
    network: args.network,
    asset: args.asset,
    amount: args.amount,
    payTo: args.payTo,
    resource: args.resource,
  }
  if (args.wallet) payload.wallet = args.wallet
  if (args.extensions) payload.extensions = args.extensions
  return btoa(JSON.stringify(payload))
}

async function request(room: DuetRoomDO, method: string, path: string, body?: unknown): Promise<Response> {
  const hasBody = body !== undefined
  return room.fetch(new Request(`http://do${path}`, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  }))
}

async function initAndStartLiveRoom(room: DuetRoomDO, opts: {
  roomId: string
  splitAddress?: string
  liveAmount?: string
  replayAmount?: string
  replayMode?: 'load_gated' | 'worker_gated'
  network?: 'eip155:8453' | 'eip155:84532'
  assetUsdc?: string
}): Promise<{ roomId: string; bridgeTicket: string }> {
  const initRes = await request(room, 'POST', '/init', {
    roomId: opts.roomId,
    hostWallet: HOST_WALLET,
    guestWallet: GUEST_WALLET,
    splitAddress: (opts.splitAddress ?? SPLIT_ADDRESS).toLowerCase(),
    network: opts.network ?? 'eip155:84532',
    assetUsdc: opts.assetUsdc ?? ASSET_USDC_SEPOLIA,
    liveAmount: opts.liveAmount ?? '100000',
    replayAmount: opts.replayAmount ?? '100000',
    accessWindowMinutes: 1440,
    replayMode: opts.replayMode ?? 'worker_gated',
    recordingMode: 'host_local',
    agoraChannel: `heaven-duet-${opts.roomId}`,
  })
  expect(initRes.status).toBe(200)

  const startRes = await request(room, 'POST', '/start', { wallet: HOST_WALLET })
  expect(startRes.status).toBe(200)
  const startBody = await startRes.json() as { bridge_ticket?: string }
  expect(typeof startBody.bridge_ticket).toBe('string')

  return {
    roomId: opts.roomId,
    bridgeTicket: startBody.bridge_ticket as string,
  }
}

describe('DuetRoomDO x402 flow', () => {
  test('POST /enter returns dynamic PAYMENT-REQUIRED for the room split address', async () => {
    const room = makeRoom()
    const splitAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const { roomId } = await initAndStartLiveRoom(room, {
      roomId: 'duet-test-enter-402',
      splitAddress,
    })

    const enterRes = await request(room, 'POST', '/enter', {
      wallet: VIEWER_WALLET,
      resource: `/duet/${roomId}/enter`,
    })

    expect(enterRes.status).toBe(402)
    const required = readPaymentRequiredHeader(enterRes) as any
    expect(required?.x402Version).toBe(2)
    expect(required?.resource).toBe(`/duet/${roomId}/enter?segment_id=seg-1`)
    expect(required?.accepts?.[0]?.scheme).toBe('exact')
    expect(required?.accepts?.[0]?.network).toBe('eip155:84532')
    expect(required?.accepts?.[0]?.asset).toBe(ASSET_USDC_SEPOLIA)
    expect(required?.accepts?.[0]?.amount).toBe('100000')
    expect(required?.accepts?.[0]?.payTo).toBe(splitAddress)
    expect(typeof required?.accepts?.[0]?.maxTimeoutSeconds).toBe('number')
    expect(required?.accepts?.[0]?.extra?.name).toBe('USDC')
    expect(required?.accepts?.[0]?.extra?.version).toBe('2')
  })

  test('POST /init rejects Base mainnet network', async () => {
    const room = makeRoom()
    const initRes = await request(room, 'POST', '/init', {
      roomId: 'duet-test-init-mainnet-disabled',
      hostWallet: HOST_WALLET,
      guestWallet: GUEST_WALLET,
      splitAddress: SPLIT_ADDRESS,
      network: 'eip155:8453',
      assetUsdc: ASSET_USDC_SEPOLIA,
      liveAmount: '100000',
      replayAmount: '100000',
      accessWindowMinutes: 1440,
      replayMode: 'worker_gated',
      recordingMode: 'host_local',
      agoraChannel: 'heaven-duet-test',
    })
    expect(initRes.status).toBe(400)
    const body = await initRes.json() as { error?: string }
    expect(body.error).toBe('network_not_allowed')
  })

  test('POST /init rejects non-sepolia USDC address', async () => {
    const room = makeRoom()
    const initRes = await request(room, 'POST', '/init', {
      roomId: 'duet-test-init-asset-disabled',
      hostWallet: HOST_WALLET,
      guestWallet: GUEST_WALLET,
      splitAddress: SPLIT_ADDRESS,
      network: 'eip155:84532',
      assetUsdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      liveAmount: '100000',
      replayAmount: '100000',
      accessWindowMinutes: 1440,
      replayMode: 'worker_gated',
      recordingMode: 'host_local',
      agoraChannel: 'heaven-duet-test',
    })
    expect(initRes.status).toBe(400)
    const body = await initRes.json() as { error?: string }
    expect(body.error).toBe('asset_not_allowed')
  })

  test('POST /enter blocks payment signature replay from another wallet', async () => {
    const room = makeRoom()
    const { roomId } = await initAndStartLiveRoom(room, {
      roomId: 'duet-test-enter-replay-guard',
    })

    const enter402 = await request(room, 'POST', '/enter', {
      wallet: VIEWER_WALLET,
      resource: `/duet/${roomId}/enter`,
    })
    expect(enter402.status).toBe(402)
    const required = readPaymentRequiredHeader(enter402) as any

    const paymentSignature = buildMockPaymentSignature({
      network: required.accepts[0].network,
      asset: required.accepts[0].asset,
      amount: required.accepts[0].amount,
      payTo: required.accepts[0].payTo,
      resource: required.resource,
      wallet: VIEWER_WALLET,
    })

    const paid = await request(room, 'POST', '/enter', {
      wallet: VIEWER_WALLET,
      resource: `/duet/${roomId}/enter`,
      paymentSignature,
    })
    expect(paid.status).toBe(200)

    const replayedByOtherWallet = await request(room, 'POST', '/enter', {
      wallet: OTHER_WALLET,
      resource: `/duet/${roomId}/enter`,
      paymentSignature,
    })
    expect(replayedByOtherWallet.status).toBe(409)
    const replayBody = await replayedByOtherWallet.json() as { error?: string }
    expect(replayBody.error).toBe('payment_signature_reused')
  })

  test('POST /public-enter without wallet can settle, but does not persist entitlement', async () => {
    const room = makeRoom()
    const { roomId } = await initAndStartLiveRoom(room, {
      roomId: 'duet-test-public-anon',
    })

    const public402 = await request(room, 'POST', '/public-enter', {})
    expect(public402.status).toBe(402)
    const required = readPaymentRequiredHeader(public402) as any

    const anonymousPaymentSignature = buildMockPaymentSignature({
      network: required.accepts[0].network,
      asset: required.accepts[0].asset,
      amount: required.accepts[0].amount,
      payTo: required.accepts[0].payTo,
      resource: required.resource,
    })

    const anonymousPaid = await request(room, 'POST', '/public-enter', {
      paymentSignature: anonymousPaymentSignature,
      resource: `/duet/${roomId}/public-enter`,
    })
    expect(anonymousPaid.status).toBe(200)
    const anonymousBody = await anonymousPaid.json() as { live_expires_at?: number; agora_viewer_token?: string }
    expect(typeof anonymousBody.agora_viewer_token).toBe('string')
    expect(anonymousBody.live_expires_at).toBeUndefined()

    const anonymousAgain = await request(room, 'POST', '/public-enter', {})
    expect(anonymousAgain.status).toBe(402)
  })

  test('worker-gated replay requires payment and issues one-time replay access token', async () => {
    const room = makeRoom()
    const replayUrl = 'https://example.com/replay-audio.mp3'
    const { roomId, bridgeTicket } = await initAndStartLiveRoom(room, {
      roomId: 'duet-test-replay-worker-gated',
      replayMode: 'worker_gated',
    })

    const recordingComplete = await request(room, 'POST', '/recording-complete', {
      bridgeTicket,
      load_dataitem_id: 'demo-data-item',
      replay_url: replayUrl,
      created_at: Math.floor(Date.now() / 1000),
    })
    expect(recordingComplete.status).toBe(200)

    const replay402 = await request(room, 'POST', '/replay-access', {
      wallet: VIEWER_WALLET,
      resource: `/duet/${roomId}/replay`,
    })
    expect(replay402.status).toBe(402)
    const replayRequired = readPaymentRequiredHeader(replay402) as any
    expect(replayRequired?.accepts?.[0]?.payTo).toBe(SPLIT_ADDRESS)

    const replayPaymentSignature = buildMockPaymentSignature({
      network: replayRequired.accepts[0].network,
      asset: replayRequired.accepts[0].asset,
      amount: replayRequired.accepts[0].amount,
      payTo: replayRequired.accepts[0].payTo,
      resource: replayRequired.resource,
      wallet: VIEWER_WALLET,
    })

    const replayPaid = await request(room, 'POST', '/replay-access', {
      wallet: VIEWER_WALLET,
      resource: `/duet/${roomId}/replay`,
      paymentSignature: replayPaymentSignature,
    })
    expect(replayPaid.status).toBe(200)
    const replayPaidBody = await replayPaid.json() as { replay_access_token?: string }
    expect(typeof replayPaidBody.replay_access_token).toBe('string')

    const sourceOk = await request(room, 'POST', '/replay-source', {
      token: replayPaidBody.replay_access_token,
    })
    expect(sourceOk.status).toBe(200)
    const sourceBody = await sourceOk.json() as { replay_url?: string }
    expect(sourceBody.replay_url).toBe(replayUrl)

    const sourceReplay = await request(room, 'POST', '/replay-source', {
      token: replayPaidBody.replay_access_token,
    })
    expect(sourceReplay.status).toBe(401)
  })

  test('guest seat start + bridge token are seat-aware', async () => {
    const room = makeRoom()
    const { bridgeTicket } = await initAndStartLiveRoom(room, {
      roomId: 'duet-test-guest-seat-start',
    })

    const guestStartBeforeAccept = await request(room, 'POST', '/guest-start', { wallet: GUEST_WALLET })
    expect(guestStartBeforeAccept.status).toBe(403)

    const guestAccept = await request(room, 'POST', '/guest-accept', { wallet: GUEST_WALLET })
    expect(guestAccept.status).toBe(200)

    const guestStart = await request(room, 'POST', '/guest-start', { wallet: GUEST_WALLET })
    expect(guestStart.status).toBe(200)
    const guestStartBody = await guestStart.json() as {
      seat?: string
      guest_bridge_ticket?: string
      agora_broadcaster_uid?: number
      audience_media_mode?: string
    }
    expect(guestStartBody.seat).toBe('guest')
    expect(typeof guestStartBody.guest_bridge_ticket).toBe('string')
    expect(typeof guestStartBody.agora_broadcaster_uid).toBe('number')
    expect(guestStartBody.audience_media_mode).toBe('bridge')

    const hostBridgeToken = await request(room, 'POST', '/bridge-token', {
      bridgeTicket,
    })
    expect(hostBridgeToken.status).toBe(200)
    const hostBridgeTokenBody = await hostBridgeToken.json() as { seat?: string }
    expect(hostBridgeTokenBody.seat).toBe('host')

    const guestBridgeToken = await request(room, 'POST', '/bridge-token', {
      bridgeTicket: guestStartBody.guest_bridge_ticket as string,
    })
    expect(guestBridgeToken.status).toBe(200)
    const guestBridgeTokenBody = await guestBridgeToken.json() as { seat?: string }
    expect(guestBridgeTokenBody.seat).toBe('guest')
  })

  test('guest remove revokes active guest ticket for token refresh and heartbeat', async () => {
    const room = makeRoom()
    const { bridgeTicket } = await initAndStartLiveRoom(room, {
      roomId: 'duet-test-guest-seat-revoke',
    })

    const guestAccept = await request(room, 'POST', '/guest-accept', { wallet: GUEST_WALLET })
    expect(guestAccept.status).toBe(200)

    const guestStart = await request(room, 'POST', '/guest-start', { wallet: GUEST_WALLET })
    expect(guestStart.status).toBe(200)
    const guestStartBody = await guestStart.json() as { guest_bridge_ticket?: string }
    expect(typeof guestStartBody.guest_bridge_ticket).toBe('string')

    const guestRemove = await request(room, 'POST', '/guest-remove', { wallet: HOST_WALLET })
    expect(guestRemove.status).toBe(200)
    const guestRemoveBody = await guestRemove.json() as { revoked?: boolean; audience_media_mode?: string }
    expect(guestRemoveBody.revoked).toBe(true)
    expect(guestRemoveBody.audience_media_mode).toBe('bridge')

    const guestTokenAfterRevoke = await request(room, 'POST', '/bridge-token', {
      bridgeTicket: guestStartBody.guest_bridge_ticket as string,
    })
    expect(guestTokenAfterRevoke.status).toBe(403)
    const guestTokenAfterRevokeBody = await guestTokenAfterRevoke.json() as { error?: string }
    expect(guestTokenAfterRevokeBody.error).toBe('guest_revoked')

    const guestHeartbeatAfterRevoke = await request(room, 'POST', '/broadcast-heartbeat', {
      bridgeTicket: guestStartBody.guest_bridge_ticket,
      status: 'live',
      mode: 'mic',
      media: { audio: true, video: true },
    })
    expect(guestHeartbeatAfterRevoke.status).toBe(403)
    const guestHeartbeatAfterRevokeBody = await guestHeartbeatAfterRevoke.json() as { error?: string }
    expect(guestHeartbeatAfterRevokeBody.error).toBe('guest_revoked')

    const hostHeartbeat = await request(room, 'POST', '/broadcast-heartbeat', {
      bridgeTicket,
      status: 'live',
      mode: 'mic',
      media: { audio: true, video: false },
    })
    expect(hostHeartbeat.status).toBe(200)
  })

  test('heartbeat media updates audience_media_mode and public-info seat state', async () => {
    const room = makeRoom()
    const { bridgeTicket } = await initAndStartLiveRoom(room, {
      roomId: 'duet-test-audience-media-mode',
    })

    const audioOnlyHeartbeat = await request(room, 'POST', '/broadcast-heartbeat', {
      bridgeTicket,
      status: 'live',
      mode: 'mic',
      media: { audio: true, video: false },
    })
    expect(audioOnlyHeartbeat.status).toBe(200)
    const audioOnlyBody = await audioOnlyHeartbeat.json() as { audience_media_mode?: string }
    expect(audioOnlyBody.audience_media_mode).toBe('bridge')

    const videoHeartbeat = await request(room, 'POST', '/broadcast-heartbeat', {
      bridgeTicket,
      status: 'live',
      mode: 'mic',
      media: { audio: true, video: true },
    })
    expect(videoHeartbeat.status).toBe(200)
    const videoBody = await videoHeartbeat.json() as { audience_media_mode?: string; host_broadcaster_online?: boolean }
    expect(videoBody.audience_media_mode).toBe('direct')
    expect(videoBody.host_broadcaster_online).toBe(true)

    const publicInfo = await request(room, 'GET', '/public-info')
    expect(publicInfo.status).toBe(200)
    const publicBody = await publicInfo.json() as {
      audience_media_mode?: string
      host_broadcast?: { media?: { video?: boolean } }
      broadcaster_uids?: { host?: number | null }
    }
    expect(publicBody.audience_media_mode).toBe('direct')
    expect(publicBody.host_broadcast?.media?.video).toBe(true)
    expect(typeof publicBody.broadcaster_uids?.host).toBe('number')

    const stopHeartbeat = await request(room, 'POST', '/broadcast-heartbeat', {
      bridgeTicket,
      status: 'stopped',
      mode: 'mic',
    })
    expect(stopHeartbeat.status).toBe(200)
    const stopBody = await stopHeartbeat.json() as { audience_media_mode?: string }
    expect(stopBody.audience_media_mode).toBe('bridge')
  })

  test('recording-complete accepts host bridge ticket and rejects guest bridge ticket', async () => {
    const room = makeRoom()
    const { bridgeTicket } = await initAndStartLiveRoom(room, {
      roomId: 'duet-test-recording-seat-auth',
    })

    const guestAccept = await request(room, 'POST', '/guest-accept', { wallet: GUEST_WALLET })
    expect(guestAccept.status).toBe(200)
    const guestStart = await request(room, 'POST', '/guest-start', { wallet: GUEST_WALLET })
    expect(guestStart.status).toBe(200)
    const guestStartBody = await guestStart.json() as { guest_bridge_ticket?: string }
    expect(typeof guestStartBody.guest_bridge_ticket).toBe('string')

    const guestRecordingComplete = await request(room, 'POST', '/recording-complete', {
      bridgeTicket: guestStartBody.guest_bridge_ticket,
      load_dataitem_id: 'guest-should-fail',
      replay_url: 'https://example.com/guest.mp3',
    })
    expect(guestRecordingComplete.status).toBe(403)
    const guestRecordingBody = await guestRecordingComplete.json() as { error?: string }
    expect(guestRecordingBody.error).toBe('forbidden')

    const hostRecordingComplete = await request(room, 'POST', '/recording-complete', {
      bridgeTicket,
      load_dataitem_id: 'host-ok',
      replay_url: 'https://example.com/host.mp3',
    })
    expect(hostRecordingComplete.status).toBe(200)
  })
})
