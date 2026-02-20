/**
 * Smoke test: duet room control plane + real x402 payment flow (facilitator settlement).
 *
 * Usage:
 *   bun src/smoke-test-duet-self.ts
 *
 * Required env:
 *   - DUET_TEST_PAYER_PRIVATE_KEY (or X402_EVM_PRIVATE_KEY / EVM_PRIVATE_KEY / PRIVATE_KEY)
 *
 * Server-side prerequisites:
 *   - X402_FACILITATOR_MODE=self
 *   - X402_FACILITATOR_BASE_URL is configured on the worker (local or remote)
 *   - X402_FACILITATOR_AUTH_TOKEN is configured on the worker
 */

import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const BASE_URL = process.env.SESSION_VOICE_URL || 'http://localhost:3338'
const TEST_NETWORK = process.env.DUET_TEST_NETWORK || 'eip155:84532'
if (TEST_NETWORK !== 'eip155:84532') {
  throw new Error(`Duet tests are locked to Base Sepolia (eip155:84532). Got: ${TEST_NETWORK}`)
}
const TEST_ASSET_USDC = process.env.DUET_TEST_ASSET_USDC || '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const TEST_LIVE_AMOUNT = process.env.DUET_TEST_LIVE_AMOUNT || '100000'
const TEST_REPLAY_AMOUNT = process.env.DUET_TEST_REPLAY_AMOUNT || '100000'

const splitAddressOverrideRaw = (process.env.DUET_TEST_SPLIT_ADDRESS || '').trim()
if (splitAddressOverrideRaw && !/^0x[a-fA-F0-9]{40}$/.test(splitAddressOverrideRaw)) {
  throw new Error('Invalid DUET_TEST_SPLIT_ADDRESS (expected 0x + 40 hex chars)')
}
const splitAddressOverride = splitAddressOverrideRaw ? splitAddressOverrideRaw.toLowerCase() : undefined

const payerPrivateKeyRaw =
  process.env.DUET_TEST_PAYER_PRIVATE_KEY
  || process.env.X402_EVM_PRIVATE_KEY
  || process.env.EVM_PRIVATE_KEY
  || process.env.PRIVATE_KEY
  || ''
const payerPrivateKey = payerPrivateKeyRaw.trim()
if (!/^0x[a-fA-F0-9]{64}$/.test(payerPrivateKey)) {
  throw new Error('Missing or invalid payer private key. Set DUET_TEST_PAYER_PRIVATE_KEY.')
}

const payer = privateKeyToAccount(payerPrivateKey as `0x${string}`)
const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      // Safety: never auto-pay on mainnet or other chains from this harness.
      network: 'eip155:84532',
      client: new ExactEvmScheme(payer),
    },
  ],
})

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
  options: {
    usePaidFetch?: boolean
    headersExtra?: Record<string, string>
  } = {},
): Promise<{ status: number; data: any; headers: Headers }> {
  const headers: Record<string, string> = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headersExtra || {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const requestFetch = options.usePaidFetch ? paidFetch : fetch
  const res = await requestFetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const data = await res.json().catch(() => null)
  return { status: res.status, data, headers: res.headers }
}

function readPaymentResponse(headers: Headers, label: string): any {
  const raw = headers.get('PAYMENT-RESPONSE')
  assert(typeof raw === 'string', `${label}: PAYMENT-RESPONSE header present`)
  const decoded = decodePaymentResponseHeader(raw as string) as any
  assert(decoded?.facilitator === 'self', `${label}: facilitator is self`)
  return decoded
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`  ✓ ${msg}`)
}

async function main() {
  const replaySourceUrl = 'data:text/plain;base64,ZHVldC1yZXBsYXktc2VsZi1zYW1wbGU='
  const host = privateKeyToAccount(generatePrivateKey())
  const guest = privateKeyToAccount(generatePrivateKey())
  const viewer = payer
  const splitAddress = splitAddressOverride || host.address.toLowerCase()

  const hostToken = await mintJWT(host.address)
  const guestToken = await mintJWT(guest.address)
  const viewerToken = await mintJWT(viewer.address)

  console.log('\n═══ Duet Self x402 Smoke Test ═══')
  console.log(`Host:   ${host.address.toLowerCase()}`)
  console.log(`Guest:  ${guest.address.toLowerCase()}`)
  console.log(`Viewer: ${viewer.address.toLowerCase()}`)
  console.log(`PayTo:  ${splitAddress}`)
  console.log(`Network: ${TEST_NETWORK}`)
  console.log(`USDC:    ${TEST_ASSET_USDC}\n`)

  console.log('── 1. Create Duet Room ──')
  const create = await api('POST', '/duet/create', hostToken, {
    split_address: splitAddress,
    guest_wallet: guest.address.toLowerCase(),
    network: TEST_NETWORK,
    asset_usdc: TEST_ASSET_USDC,
    live_amount: TEST_LIVE_AMOUNT,
    replay_amount: TEST_REPLAY_AMOUNT,
    access_window_minutes: 1440,
    replay_mode: 'worker_gated',
    recording_mode: 'host_local',
  })
  assert(create.status === 200, `POST /duet/create → ${create.status}`)
  assert(typeof create.data?.room_id === 'string', 'room_id present')
  const roomId = create.data.room_id as string

  console.log('\n── 2. Start Room + Guest Accept ──')
  const start = await api('POST', `/duet/${roomId}/start`, hostToken, {})
  assert(start.status === 200, `POST /duet/:id/start → ${start.status}`)
  assert(typeof start.data?.bridge_ticket === 'string', 'bridge_ticket present')
  const bridgeTicket = start.data.bridge_ticket as string

  const accept = await api('POST', `/duet/${roomId}/guest/accept`, guestToken, {})
  assert(accept.status === 200, `POST /duet/:id/guest/accept → ${accept.status}`)

  console.log('\n── 3. Live Enter 402 Then Real Payment ──')
  const enter402 = await api('POST', `/duet/${roomId}/enter`, viewerToken, {})
  assert(enter402.status === 402, `POST /duet/:id/enter without payment → ${enter402.status}`)

  const enterPaid = await api(
    'POST',
    `/duet/${roomId}/enter`,
    viewerToken,
    {},
    { usePaidFetch: true },
  )
  if (enterPaid.status !== 200) {
    console.error('  paid enter failed:', enterPaid.data)
  }
  assert(enterPaid.status === 200, `POST /duet/:id/enter with real x402 payment → ${enterPaid.status}`)
  assert(typeof enterPaid.data?.agora_viewer_token === 'string', 'agora_viewer_token present')
  const enterPayment = readPaymentResponse(enterPaid.headers, 'live enter')
  assert(typeof enterPayment?.entitlement === 'string', 'live enter payment response decoded')

  const enterAgain = await api('POST', `/duet/${roomId}/enter`, viewerToken, {})
  assert(enterAgain.status === 200, `POST /duet/:id/enter entitled wallet → ${enterAgain.status}`)

  console.log('\n── 4. Complete Recording ──')
  const recordingComplete = await api(
    'POST',
    `/duet/${roomId}/recording/complete`,
    undefined,
    {
      load_dataitem_id: 'demo-dataitem-self-123',
      replay_url: replaySourceUrl,
      created_at: Math.floor(Date.now() / 1000),
    },
    { headersExtra: { Authorization: `Bearer ${bridgeTicket}` } },
  )
  assert(recordingComplete.status === 200, `POST /duet/:id/recording/complete → ${recordingComplete.status}`)

  console.log('\n── 5. Replay 402 Then Real Payment ──')
  const replay402 = await api('GET', `/duet/${roomId}/replay`, viewerToken)
  assert(replay402.status === 402, `GET /duet/:id/replay without payment → ${replay402.status}`)

  const replayPaid = await api(
    'GET',
    `/duet/${roomId}/replay`,
    viewerToken,
    undefined,
    { usePaidFetch: true },
  )
  if (replayPaid.status !== 200) {
    console.error('  paid replay failed:', replayPaid.data)
  }
  assert(replayPaid.status === 200, `GET /duet/:id/replay with real x402 payment → ${replayPaid.status}`)
  assert(typeof replayPaid.data?.replay_access_token === 'string', 'replay_access_token returned')
  const replayPayment = readPaymentResponse(replayPaid.headers, 'replay')
  assert(typeof replayPayment?.entitlement === 'string', 'replay payment response decoded')

  console.log('\n── 6. End Room ──')
  const end = await api('POST', `/duet/${roomId}/end`, hostToken, {})
  assert(end.status === 200, `POST /duet/:id/end → ${end.status}`)

  console.log('\n═══ Duet self x402 smoke test passed ═══\n')
}

await main()

