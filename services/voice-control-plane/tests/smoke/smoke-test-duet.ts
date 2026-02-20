/**
 * Smoke test: duet room control plane + x402-style gating flow.
 *
 * Usage: bun tests/smoke/smoke-test-duet.ts
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const BASE_URL = process.env.SESSION_VOICE_URL || 'http://localhost:3338'
const TEST_NETWORK = process.env.DUET_TEST_NETWORK || 'eip155:84532'
if (TEST_NETWORK !== 'eip155:84532') {
  throw new Error(`Duet tests are locked to Base Sepolia (eip155:84532). Got: ${TEST_NETWORK}`)
}
const TEST_ASSET_USDC = process.env.DUET_TEST_ASSET_USDC || '0x036cbd53842c5426634e7929541ec2318f3dcf7e'

const envFile = await Bun.file('.env').text()
const JWT_SECRET = envFile.match(/^JWT_SECRET=(.+)$/m)?.[1]?.trim()
if (!JWT_SECRET) throw new Error('JWT_SECRET not found in .env')

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

async function mintJWT(wallet: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const h = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const b = base64UrlEncodeString(JSON.stringify({ sub: wallet.toLowerCase(), iat: now, exp: now + 3600 }))
  const s = await hmacSign(JWT_SECRET!, `${h}.${b}`)
  return `${h}.${b}.${s}`
}

async function api(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  headersExtra: Record<string, string> = {},
): Promise<{ status: number; data: any; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headersExtra,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const data = await res.json().catch(() => null)
  return { status: res.status, data, headers: res.headers }
}

function base64EncodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function decodeBase64Json(base64: string): unknown {
  return JSON.parse(atob(base64))
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`  ✓ ${msg}`)
}

async function main() {
  const replaySourceUrl = 'data:text/plain;base64,ZHVldC1yZXBsYXktc2FtcGxl'

  const host = privateKeyToAccount(generatePrivateKey())
  const guest = privateKeyToAccount(generatePrivateKey())
  const viewer = privateKeyToAccount(generatePrivateKey())
  const publicViewer = privateKeyToAccount(generatePrivateKey())

  const hostToken = await mintJWT(host.address)
  const guestToken = await mintJWT(guest.address)
  const viewerToken = await mintJWT(viewer.address)
  const attacker = privateKeyToAccount(generatePrivateKey())
  const attackerToken = await mintJWT(attacker.address)

  console.log('\n═══ Duet Control-Plane Smoke Test ═══')
  console.log(`Host:   ${host.address.toLowerCase()}`)
  console.log(`Guest:  ${guest.address.toLowerCase()}`)
  console.log(`Viewer: ${viewer.address.toLowerCase()}\n`)
  console.log(`Network: ${TEST_NETWORK}`)
  console.log(`USDC:    ${TEST_ASSET_USDC}\n`)

  console.log('── 1. Create Duet Room ──')
  const create = await api('POST', '/duet/create', hostToken, {
    split_address: host.address.toLowerCase(),
    guest_wallet: guest.address.toLowerCase(),
    network: TEST_NETWORK,
    asset_usdc: TEST_ASSET_USDC,
    live_amount: '100000',
    replay_amount: '100000',
    access_window_minutes: 1440,
    replay_mode: 'worker_gated',
    recording_mode: 'host_local',
  })
  assert(create.status === 200, `POST /duet/create → ${create.status}`)
  assert(typeof create.data?.room_id === 'string', `room_id present`)
  assert(typeof create.data?.agora_channel === 'string', `agora_channel present`)
  const roomId = create.data.room_id as string

  console.log('\n── 2. Host Start Before Guest Accept ──')
  const start = await api('POST', `/duet/${roomId}/start`, hostToken, {})
  assert(start.status === 200, `POST /duet/:id/start → ${start.status}`)
  assert(typeof start.data?.bridge_ticket === 'string', 'bridge_ticket present')
  assert(typeof start.data?.agora_broadcaster_token === 'string', 'agora_broadcaster_token present')
  const bridgeTicket = start.data.bridge_ticket as string

  console.log('\n── 2.1 Start Is Idempotent While Live ──')
  const startAgain = await api('POST', `/duet/${roomId}/start`, hostToken, {})
  assert(startAgain.status === 200, `POST /duet/:id/start again → ${startAgain.status}`)
  assert(startAgain.data?.already_live === true, 'already_live returned on repeated start')
  assert(startAgain.data?.bridge_ticket === bridgeTicket, 'bridge_ticket unchanged on repeated start')

  console.log('\n── 2.2 Guest Accept After Start ──')
  const accept = await api('POST', `/duet/${roomId}/guest/accept`, guestToken, {})
  assert(accept.status === 200, `POST /duet/:id/guest/accept → ${accept.status}`)
  assert(accept.data?.guest_wallet === guest.address.toLowerCase(), `guest wallet locked`)

  console.log('\n── 2.3 Bridge Token Refresh ──')
  const bridgeRefresh = await api(
    'POST',
    `/duet/${roomId}/bridge/token`,
    undefined,
    {},
    { Authorization: `Bearer ${bridgeTicket}` },
  )
  assert(bridgeRefresh.status === 200, `POST /duet/:id/bridge/token → ${bridgeRefresh.status}`)
  assert(typeof bridgeRefresh.data?.agora_broadcaster_token === 'string', 'refreshed bridge token present')

  console.log('\n── 2.4 Broadcast Heartbeat + Public Info ──')
  const heartbeat = await api(
    'POST',
    `/duet/${roomId}/broadcast/heartbeat`,
    undefined,
    { status: 'live', mode: 'mic' },
    { Authorization: `Bearer ${bridgeTicket}` },
  )
  assert(heartbeat.status === 200, `POST /duet/:id/broadcast/heartbeat → ${heartbeat.status}`)
  assert(heartbeat.data?.broadcaster_online === true, 'heartbeat marks broadcaster online')
  const publicInfo = await api('GET', `/duet/${roomId}/public-info`)
  assert(publicInfo.status === 200, `GET /duet/:id/public-info → ${publicInfo.status}`)
  assert(publicInfo.data?.broadcaster_online === true, 'public-info reports broadcaster online')

  console.log('\n── 4. Public Enter Requires Payment (402) ──')
  const publicEnter402 = await api('POST', `/duet/${roomId}/public-enter`, undefined, {})
  assert(publicEnter402.status === 402, `POST /duet/:id/public-enter without payment → ${publicEnter402.status}`)
  assert(typeof publicEnter402.headers.get('PAYMENT-REQUIRED') === 'string', 'PAYMENT-REQUIRED header present')
  const publicRequired = decodeBase64Json(publicEnter402.headers.get('PAYMENT-REQUIRED')!) as any
  assert(typeof publicRequired?.resource === 'string' && publicRequired.resource.includes('segment_id='), 'public-enter resource includes segment_id')

  const publicLivePaymentSig = base64EncodeJson({
    network: TEST_NETWORK,
    asset: TEST_ASSET_USDC,
    amount: '100000',
    payTo: host.address.toLowerCase(),
    wallet: publicViewer.address.toLowerCase(),
    resource: publicRequired.resource,
    ...(publicRequired.extensions ? { extensions: publicRequired.extensions } : {}),
  })

  console.log('\n── 4.1 Public Enter With Payment Signature ──')
  const publicEnterPaid = await api(
    'POST',
    `/duet/${roomId}/public-enter`,
    undefined,
    { wallet: publicViewer.address.toLowerCase() },
    { 'PAYMENT-SIGNATURE': publicLivePaymentSig },
  )
  assert(publicEnterPaid.status === 200, `POST /duet/:id/public-enter with payment signature → ${publicEnterPaid.status}`)
  assert(typeof publicEnterPaid.data?.agora_viewer_token === 'string', 'public-enter agora_viewer_token present')
  assert(typeof publicEnterPaid.headers.get('PAYMENT-RESPONSE') === 'string', 'PAYMENT-RESPONSE header present')

  console.log('\n── 4.2 Public Re-Enter Without Repay ──')
  const publicEnterAgain = await api(
    'POST',
    `/duet/${roomId}/public-enter`,
    undefined,
    { wallet: publicViewer.address.toLowerCase() },
  )
  assert(publicEnterAgain.status === 200, `POST /duet/:id/public-enter entitled wallet → ${publicEnterAgain.status}`)

  console.log('\n── 5. Live Enter Requires Payment (402) ──')
  const enter402 = await api('POST', `/duet/${roomId}/enter`, viewerToken, {})
  assert(enter402.status === 402, `POST /duet/:id/enter without payment → ${enter402.status}`)
  assert(typeof enter402.headers.get('PAYMENT-REQUIRED') === 'string', 'PAYMENT-REQUIRED header present')
  const liveRequired = decodeBase64Json(enter402.headers.get('PAYMENT-REQUIRED')!) as any
  assert(typeof liveRequired?.resource === 'string' && liveRequired.resource.includes('segment_id='), 'live-enter resource includes segment_id')

  const livePaymentSig = base64EncodeJson({
    network: TEST_NETWORK,
    asset: TEST_ASSET_USDC,
    amount: '100000',
    payTo: host.address.toLowerCase(),
    wallet: viewer.address.toLowerCase(),
    resource: liveRequired.resource,
    ...(liveRequired.extensions ? { extensions: liveRequired.extensions } : {}),
  })

  console.log('\n── 6. Live Enter With Payment Signature ──')
  const enterPaid = await api(
    'POST',
    `/duet/${roomId}/enter`,
    viewerToken,
    {},
    { 'PAYMENT-SIGNATURE': livePaymentSig },
  )
  assert(enterPaid.status === 200, `POST /duet/:id/enter with payment signature → ${enterPaid.status}`)
  assert(typeof enterPaid.data?.agora_viewer_token === 'string', 'agora_viewer_token present')
  assert(typeof enterPaid.headers.get('PAYMENT-RESPONSE') === 'string', 'PAYMENT-RESPONSE header present')

  console.log('\n── 6.1 Payment Signature Replay Attack Blocked ──')
  const replayedByAttacker = await api(
    'POST',
    `/duet/${roomId}/enter`,
    attackerToken,
    {},
    { 'PAYMENT-SIGNATURE': livePaymentSig },
  )
  assert(
    replayedByAttacker.status === 402 || replayedByAttacker.status === 409,
    `reused signature by other wallet blocked → ${replayedByAttacker.status}`,
  )

  console.log('\n── 7. Live Re-Enter Without Repay ──')
  const enterAgain = await api('POST', `/duet/${roomId}/enter`, viewerToken, {})
  assert(enterAgain.status === 200, `POST /duet/:id/enter entitled wallet → ${enterAgain.status}`)

  console.log('\n── 8. Recording Complete (Bridge Auth) ──')
  const recordingComplete = await api(
    'POST',
    `/duet/${roomId}/recording/complete`,
    undefined,
    {
      load_dataitem_id: 'demo-dataitem-123',
      replay_url: replaySourceUrl,
      created_at: Math.floor(Date.now() / 1000),
    },
    { Authorization: `Bearer ${bridgeTicket}` },
  )
  assert(recordingComplete.status === 200, `POST /duet/:id/recording/complete → ${recordingComplete.status}`)

  console.log('\n── 9. Replay Requires Payment (402) ──')
  const replay402 = await api('GET', `/duet/${roomId}/replay`, viewerToken)
  assert(replay402.status === 402, `GET /duet/:id/replay without payment → ${replay402.status}`)
  assert(typeof replay402.headers.get('PAYMENT-REQUIRED') === 'string', 'PAYMENT-REQUIRED header present')

  console.log('\n── 10. Replay With Payment Signature ──')
  const replayPaymentSig = base64EncodeJson({
    network: TEST_NETWORK,
    asset: TEST_ASSET_USDC,
    amount: '100000',
    payTo: host.address.toLowerCase(),
    wallet: viewer.address.toLowerCase(),
    resource: `/duet/${roomId}/replay`,
  })
  const replayPaid = await api(
    'GET',
    `/duet/${roomId}/replay`,
    viewerToken,
    undefined,
    { 'PAYMENT-SIGNATURE': replayPaymentSig },
  )
  assert(replayPaid.status === 200, `GET /duet/:id/replay with payment signature → ${replayPaid.status}`)
  assert(typeof replayPaid.data?.replay_access_token === 'string', 'replay_access_token returned')

  console.log('\n── 11. Replay Re-Access Without Repay ──')
  const replayAgain = await api('GET', `/duet/${roomId}/replay`, viewerToken)
  assert(replayAgain.status === 200, `GET /duet/:id/replay entitled wallet → ${replayAgain.status}`)
  assert(typeof replayAgain.data?.replay_access_token === 'string', 'new replay_access_token returned')

  console.log('\n── 12. End Room ──')
  const end = await api('POST', `/duet/${roomId}/end`, hostToken, {})
  assert(end.status === 200, `POST /duet/:id/end → ${end.status}`)
  assert(end.data?.status === 'ended', `status: ${end.data?.status}`)

  console.log('\n── 13. Enter After End Fails ──')
  const enterAfterEnd = await api('POST', `/duet/${roomId}/enter`, viewerToken, {})
  assert(enterAfterEnd.status === 400, `POST /duet/:id/enter after end → ${enterAfterEnd.status}`)
  assert(enterAfterEnd.data?.error === 'room_not_live', `error: ${enterAfterEnd.data?.error}`)

  console.log('\n═══ Duet smoke test passed ═══\n')
}

await main()
