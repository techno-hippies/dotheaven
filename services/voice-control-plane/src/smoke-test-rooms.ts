/**
 * Smoke test: full room lifecycle
 *
 * Grants credits via D1 directly, then tests:
 * create room → join → heartbeat → renew → leave
 *
 * Usage: bun src/smoke-test-rooms.ts
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const BASE_URL = process.env.SESSION_VOICE_URL || 'http://localhost:3338'
const D1_DATABASE = process.env.D1_DATABASE || 'session-voice'

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
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
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

async function api(method: string, path: string, token?: string, body?: any) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers, ...(body && { body: JSON.stringify(body) }),
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`  ✗ FAIL: ${msg}`); process.exit(1) }
  console.log(`  ✓ ${msg}`)
}

// ── Setup: grant credits via wrangler D1 ─────────────────────────────

const key = generatePrivateKey()
const account = privateKeyToAccount(key)
const wallet = account.address.toLowerCase()
const token = await mintJWT(wallet)

console.log(`\n═══ Room Lifecycle Smoke Test ═══`)
console.log(`Wallet: ${wallet}\n`)

// Grant 1800s credits directly in local D1
console.log('── 0. Grant Credits via D1 ──')
const { execSync } = require('child_process')
execSync(
  `bunx wrangler d1 execute ${D1_DATABASE} --local --command="INSERT INTO credit_accounts (wallet, base_granted_seconds, bonus_granted_seconds, consumed_seconds, updated_at) VALUES ('${wallet}', 1800, 0, 0, datetime('now'))"`,
  { cwd: process.cwd(), stdio: 'pipe' },
)
console.log('  ✓ Inserted 1800s credits')

// Verify credits
const creds = await api('GET', '/credits', token)
assert(creds.status === 200, `GET /credits → ${creds.status}`)
assert(creds.data?.remaining_seconds === 1800, `remaining: ${creds.data?.remaining_seconds}`)

// ── 1. Create Room ──────────────────────────────────────────────────

console.log('\n── 1. Create Room ──')
const create = await api('POST', '/rooms/create', token, {})
assert(create.status === 200, `POST /rooms/create → ${create.status}`)
assert(typeof create.data?.room_id === 'string', `room_id: ${create.data?.room_id?.slice(0, 8)}...`)
assert(create.data?.channel?.startsWith('heaven-free-'), `channel: ${create.data?.channel}`)

const roomId = create.data.room_id

// ── 2. Can't create second room (single active free room) ────────

console.log('\n── 2. Duplicate Room Check ──')
// We're the host but not yet a participant (create doesn't auto-join).
// Actually, let's join first then try creating another.

// ── 3. Join Room ─────────────────────────────────────────────────

console.log('\n── 3. Join Room ──')
const join = await api('POST', '/rooms/join', token, { room_id: roomId })
assert(join.status === 200, `POST /rooms/join → ${join.status}`)
assert(typeof join.data?.connection_id === 'string', `connection_id: ${join.data?.connection_id?.slice(0, 8)}...`)
assert(typeof join.data?.agora_token === 'string', `agora_token: present (${join.data?.agora_token?.length} chars)`)
assert(join.data?.token_expires_in_seconds === 90, `token_expires: ${join.data?.token_expires_in_seconds}`)
assert(join.data?.renew_after_seconds === 45, `renew_after: ${join.data?.renew_after_seconds}`)
assert(join.data?.heartbeat_interval_seconds === 30, `heartbeat_interval: ${join.data?.heartbeat_interval_seconds}`)
assert(join.data?.remaining_seconds === 1800, `remaining: ${join.data?.remaining_seconds}`)

const connectionId = join.data.connection_id

// ── 4. Can't join another room (single active) ──────────────────

console.log('\n── 4. Single Active Room Enforcement ──')
const dup = await api('POST', '/rooms/create', token, {})
assert(dup.status === 409, `POST /rooms/create while in room → ${dup.status}`)
assert(dup.data?.error === 'already_in_free_room', `error: ${dup.data?.error}`)

// ── 5. Heartbeat ─────────────────────────────────────────────────

console.log('\n── 5. Heartbeat ──')
// Wait 2 seconds so some time elapses for metering
await new Promise(r => setTimeout(r, 2000))

const hb = await api('POST', '/rooms/heartbeat', token, { room_id: roomId, connection_id: connectionId })
assert(hb.status === 200, `POST /rooms/heartbeat → ${hb.status}`)
assert(hb.data?.ok === true, `ok: ${hb.data?.ok}`)
assert(typeof hb.data?.remaining_seconds === 'number', `remaining: ${hb.data?.remaining_seconds}`)
assert(hb.data?.remaining_seconds < 1800, `remaining decreased: ${hb.data?.remaining_seconds} < 1800`)

// ── 6. Heartbeat with wrong wallet (should fail) ─────────────────

console.log('\n── 6. Heartbeat Auth Check ──')
const otherKey = generatePrivateKey()
const otherWallet = privateKeyToAccount(otherKey).address.toLowerCase()
const otherToken = await mintJWT(otherWallet)
const hbBad = await api('POST', '/rooms/heartbeat', otherToken, { room_id: roomId, connection_id: connectionId })
assert(hbBad.status === 403, `POST /rooms/heartbeat wrong wallet → ${hbBad.status}`)
assert(hbBad.data?.error === 'not_your_connection', `error: ${hbBad.data?.error}`)

// ── 7. Token Renew ───────────────────────────────────────────────

console.log('\n── 7. Token Renew ──')
const renew = await api('POST', '/rooms/token/renew', token, { room_id: roomId, connection_id: connectionId })
assert(renew.status === 200, `POST /rooms/token/renew → ${renew.status}`)
assert(typeof renew.data?.agora_token === 'string', `new agora_token: present`)
assert(renew.data?.agora_token !== join.data?.agora_token, `token changed: yes`)

// ── 8. Leave ─────────────────────────────────────────────────────

console.log('\n── 8. Leave Room ──')
const leave = await api('POST', '/rooms/leave', token, { room_id: roomId, connection_id: connectionId })
assert(leave.status === 200, `POST /rooms/leave → ${leave.status}`)
assert(leave.data?.ok === true, `ok: ${leave.data?.ok}`)
assert(leave.data?.debited_seconds > 0, `debited: ${leave.data?.debited_seconds}s`)
assert(leave.data?.closed === true, `room closed (last participant): ${leave.data?.closed}`)

// ── 9. Credits after leave ───────────────────────────────────────

console.log('\n── 9. Credits After Leave ──')
const postCreds = await api('GET', '/credits', token)
assert(postCreds.status === 200, `GET /credits → ${postCreds.status}`)
assert(postCreds.data?.remaining_seconds < 1800, `remaining decreased: ${postCreds.data?.remaining_seconds}`)
assert(postCreds.data?.consumed_seconds > 0, `consumed: ${postCreds.data?.consumed_seconds}s`)

// ── 10. Can create new room after leaving ────────────────────────

console.log('\n── 10. Create New Room After Leave ──')
const create2 = await api('POST', '/rooms/create', token, {})
assert(create2.status === 200, `POST /rooms/create after leave → ${create2.status}`)
assert(create2.data?.room_id !== roomId, `new room_id: ${create2.data?.room_id?.slice(0, 8)}...`)

console.log('\n═══ All room lifecycle tests passed ═══\n')
