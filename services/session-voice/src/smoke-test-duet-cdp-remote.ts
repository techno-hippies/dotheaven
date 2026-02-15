/**
 * Smoke test: remote duet room + real x402 payment flow (CDP facilitator).
 *
 * This script targets an already-live remote room, so no host auth token is needed.
 *
 * Usage:
 *   bun src/smoke-test-duet-cdp-remote.ts
 *
 * Required env:
 *   - SESSION_VOICE_URL (e.g. https://session-voice....workers.dev)
 *   - DUET_REMOTE_ROOM_ID
 *     OR
 *   - DUET_REMOTE_WATCH_URL (e.g. https://.../duet/<roomId>/watch)
 *   - DUET_TEST_PAYER_PRIVATE_KEY (or X402_EVM_PRIVATE_KEY / EVM_PRIVATE_KEY / PRIVATE_KEY)
 */

import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm'
import { privateKeyToAccount } from 'viem/accounts'

const watchUrlRaw = (process.env.DUET_REMOTE_WATCH_URL || '').trim()
const parsedWatchUrl = parseWatchUrl(watchUrlRaw)

const BASE_URL = (process.env.SESSION_VOICE_URL || parsedWatchUrl?.origin || '').trim()
if (!/^https?:\/\//.test(BASE_URL)) {
  throw new Error('SESSION_VOICE_URL (or DUET_REMOTE_WATCH_URL) must be set to a valid http(s) origin')
}

const ROOM_ID = (process.env.DUET_REMOTE_ROOM_ID || parsedWatchUrl?.roomId || '').trim()
if (!ROOM_ID) {
  throw new Error('DUET_REMOTE_ROOM_ID is required (or provide DUET_REMOTE_WATCH_URL)')
}

const EXPECT_NETWORK = 'eip155:84532'
const requestedNetwork = process.env.DUET_TEST_NETWORK?.trim()
if (requestedNetwork && requestedNetwork !== EXPECT_NETWORK) {
  throw new Error(`Duet tests are locked to Base Sepolia (eip155:84532). Got: ${requestedNetwork}`)
}

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

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`  ✓ ${msg}`)
}

function decodePaymentRequiredHeader(headers: Headers): any {
  const raw = headers.get('PAYMENT-REQUIRED')
  assert(typeof raw === 'string', 'PAYMENT-REQUIRED header present')
  return JSON.parse(atob(raw as string))
}

function decodePaymentResponse(headers: Headers): any {
  const raw = headers.get('PAYMENT-RESPONSE')
  assert(typeof raw === 'string', 'PAYMENT-RESPONSE header present')
  return decodePaymentResponseHeader(raw as string)
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  usePaidFetch = false,
): Promise<{ status: number; data: any; headers: Headers }> {
  const requestFetch = usePaidFetch ? paidFetch : fetch
  const res = await requestFetch(`${BASE_URL}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data, headers: res.headers }
}

function parseWatchUrl(raw: string): { origin: string; roomId: string } | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  const match = url.pathname.match(/^\/duet\/([^/]+)\/watch$/)
  if (!match) return null
  return {
    origin: url.origin,
    roomId: match[1],
  }
}

async function main() {
  console.log('\n═══ Duet Remote CDP x402 Smoke Test ═══')
  console.log(`Worker: ${BASE_URL}`)
  console.log(`Room:   ${ROOM_ID}`)
  console.log(`Payer:  ${payer.address.toLowerCase()}`)
  console.log(`Expect: ${EXPECT_NETWORK}\n`)

  console.log('── 1. Public Info ──')
  const info = await api('GET', `/duet/${ROOM_ID}/public-info`)
  assert(info.status === 200, `GET /duet/:id/public-info → ${info.status}`)
  assert(info.data?.status === 'live', `room status is live (got ${String(info.data?.status)})`)
  assert(info.data?.can_enter === true, 'room can_enter is true')

  console.log('\n── 2. 402 Challenge (No Payment) ──')
  const enter402 = await api('POST', `/duet/${ROOM_ID}/public-enter`, {})
  assert(enter402.status === 402, `POST /duet/:id/public-enter without payment → ${enter402.status}`)
  const required = decodePaymentRequiredHeader(enter402.headers)
  assert(required?.x402Version === 2, 'x402Version is 2')
  assert(typeof required?.resource === 'string' && required.resource.startsWith(`/duet/${ROOM_ID}/public-enter`), 'resource matches public-enter')
  assert(required.resource.includes('segment_id='), 'resource includes segment_id')
  assert(required?.accepts?.[0]?.network === EXPECT_NETWORK, `network is ${EXPECT_NETWORK}`)

  console.log('\n── 3. Paid Public Enter (Real x402) ──')
  // Omit wallet on purpose so the endpoint cannot bypass with existing wallet entitlement.
  const enterPaid = await api('POST', `/duet/${ROOM_ID}/public-enter`, {}, true)
  assert(enterPaid.status === 200, `POST /duet/:id/public-enter with payment → ${enterPaid.status}`)
  assert(typeof enterPaid.data?.agora_viewer_token === 'string', 'agora_viewer_token present')

  const paymentResponse = decodePaymentResponse(enterPaid.headers)
  assert(paymentResponse?.facilitator === 'cdp', 'facilitator is cdp')

  console.log('\n── 4. Entitlement Re-Enter (No Repay) ──')
  const entitledReenter = await api(
    'POST',
    `/duet/${ROOM_ID}/public-enter`,
    { wallet: payer.address.toLowerCase() },
  )
  assert(entitledReenter.status === 200, `POST /duet/:id/public-enter entitled wallet → ${entitledReenter.status}`)

  console.log('\n═══ Duet remote CDP x402 smoke test passed ═══\n')
}

await main()
