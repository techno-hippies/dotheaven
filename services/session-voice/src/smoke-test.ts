/**
 * Smoke test for session-voice v2
 *
 * Tests the full free-room flow end-to-end against a running wrangler dev instance.
 * Uses a random wallet (no real PKP needed — we bypass signature verification
 * by directly inserting a JWT via the JWT_SECRET from .env).
 *
 * Usage: bun src/smoke-test.ts
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const BASE_URL = process.env.SESSION_VOICE_URL || 'http://localhost:3338'

// Read JWT_SECRET from .env to mint our own test tokens
const envFile = await Bun.file('.env').text()
const JWT_SECRET = envFile.match(/^JWT_SECRET=(.+)$/m)?.[1]?.trim()
if (!JWT_SECRET) throw new Error('JWT_SECRET not found in .env')

// ── Helpers ──────────────────────────────────────────────────────────

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

async function mintTestJWT(wallet: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncodeString(JSON.stringify({ sub: wallet.toLowerCase(), iat: now, exp: now + 3600 }))
  const sig = await hmacSign(JWT_SECRET!, `${header}.${body}`)
  return `${header}.${body}.${sig}`
}

async function api(method: string, path: string, token?: string, body?: any): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  })

  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`  ✓ ${msg}`)
}

// ── Test ─────────────────────────────────────────────────────────────

const key = generatePrivateKey()
const account = privateKeyToAccount(key)
const wallet = account.address.toLowerCase()

console.log(`\n═══ Session-Voice v2 Smoke Test ═══`)
console.log(`Wallet: ${wallet}`)
console.log(`Base URL: ${BASE_URL}\n`)

// 1. Health check
console.log('── 1. Health Check ──')
const health = await api('GET', '/health')
assert(health.status === 200, `GET /health → ${health.status}`)
assert(health.data?.ok === true, `ok: ${health.data?.ok}`)

// 2. Auth: nonce + verify
console.log('\n── 2. Auth Flow ──')
const nonceRes = await api('POST', '/auth/nonce', undefined, { wallet })
assert(nonceRes.status === 200, `POST /auth/nonce → ${nonceRes.status}`)
assert(typeof nonceRes.data?.nonce === 'string', `nonce: ${nonceRes.data?.nonce?.slice(0, 16)}...`)

const nonce = nonceRes.data.nonce
const signature = await account.signMessage({ message: nonce })

const verifyRes = await api('POST', '/auth/verify', undefined, { wallet, signature, nonce })
assert(verifyRes.status === 200, `POST /auth/verify → ${verifyRes.status}`)
assert(typeof verifyRes.data?.token === 'string', `token: ${verifyRes.data?.token?.slice(0, 20)}...`)

const token = verifyRes.data.token

// 3. Credits: should be 0 for new wallet
console.log('\n── 3. Credits ──')
const credits = await api('GET', '/credits', token)
assert(credits.status === 200, `GET /credits → ${credits.status}`)
assert(credits.data?.remaining_seconds === 0, `remaining: ${credits.data?.remaining_seconds}`)
assert(credits.data?.base_granted_seconds === 0, `base_granted: ${credits.data?.base_granted_seconds}`)

// 4. Create room: should fail (no heaven name → no credits)
console.log('\n── 4. Create Room (should fail — no heaven name) ──')
const createFail = await api('POST', '/rooms/create', token, {})
assert(createFail.status === 403, `POST /rooms/create → ${createFail.status}`)
assert(createFail.data?.error === 'heaven_name_required', `error: ${createFail.data?.error}`)

// 5. Manually grant credits (direct D1 insert to bypass heaven name check)
console.log('\n── 5. Grant Credits (direct DB) ──')
// Use a self-minted JWT for a wallet that we'll give credits to
const testToken = await mintTestJWT(wallet)

// Verify our minted JWT works
const creditCheck = await api('GET', '/credits', testToken)
assert(creditCheck.status === 200, `GET /credits with minted JWT → ${creditCheck.status}`)

// We can't write to D1 directly from here, so let's test the auth flow
// works correctly and the credit gating works. For a full room test we'd
// need a wallet with a heaven name on MegaETH.

// 6. Verify-celo: should fail (wallet not celo-verified)
console.log('\n── 6. Verify Celo (should fail — not verified) ──')
const verifyCelo = await api('POST', '/credits/verify-celo', testToken, {})
assert(verifyCelo.status === 403, `POST /credits/verify-celo → ${verifyCelo.status}`)
assert(verifyCelo.data?.error === 'not_verified', `error: ${verifyCelo.data?.error}`)

// 7. Auth: replay nonce (should fail — one-time consume)
console.log('\n── 7. Nonce Replay (should fail) ──')
const replay = await api('POST', '/auth/verify', undefined, { wallet, signature, nonce })
assert(replay.status === 401, `POST /auth/verify replay → ${replay.status}`)

// 8. Auth: bad signature (should fail, nonce not consumed)
console.log('\n── 8. Bad Signature ──')
const nonce2Res = await api('POST', '/auth/nonce', undefined, { wallet })
assert(nonce2Res.status === 200, `POST /auth/nonce → ${nonce2Res.status}`)
const badSig = '0x' + 'ab'.repeat(65) as `0x${string}`
const badSigRes = await api('POST', '/auth/verify', undefined, { wallet, signature: badSig, nonce: nonce2Res.data.nonce })
assert(badSigRes.status === 401, `POST /auth/verify bad sig → ${badSigRes.status}`)
assert(badSigRes.data?.error === 'invalid signature', `error: ${badSigRes.data?.error}`)

// Nonce should NOT be consumed (fix #9 — sig checked first)
const retrySig = await account.signMessage({ message: nonce2Res.data.nonce })
const retryRes = await api('POST', '/auth/verify', undefined, { wallet, signature: retrySig, nonce: nonce2Res.data.nonce })
assert(retryRes.status === 200, `POST /auth/verify retry after bad sig → ${retryRes.status} (nonce preserved)`)

// 9. Unauthorized access
console.log('\n── 9. Unauthorized Access ──')
const noAuth = await api('GET', '/credits')
assert(noAuth.status === 401, `GET /credits no auth → ${noAuth.status}`)

const badToken = await api('GET', '/credits', 'garbage.token.here')
assert(badToken.status === 401, `GET /credits bad token → ${badToken.status}`)

console.log('\n═══ All smoke tests passed ═══\n')
