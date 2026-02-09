/**
 * Smoke test: room visibility + host-leaves-closes
 *
 * Tests:
 *   1. Open room appears in GET /rooms/active
 *   2. Private room does NOT appear in GET /rooms/active
 *   3. Private room is joinable by direct room_id
 *   4. Host leaving closes room (even with other participants)
 *   5. After host-close, GET /rooms/active no longer shows the room
 *
 * Usage: bun src/smoke-test-visibility.ts
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const BASE_URL = process.env.SESSION_VOICE_URL || 'http://localhost:3338'

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

function d1(sql: string) {
  const { execSync } = require('child_process')
  execSync(
    `npx wrangler d1 execute session-voice --local --command="${sql.replace(/"/g, '\\"')}"`,
    { cwd: '/media/t42/th42/Code/dotheaven/services/session-voice', stdio: 'pipe' },
  )
}

async function makeWallet() {
  const key = generatePrivateKey()
  const account = privateKeyToAccount(key)
  const wallet = account.address.toLowerCase()
  const token = await mintJWT(wallet)
  d1(`INSERT INTO credit_accounts (wallet, base_granted_seconds, bonus_granted_seconds, consumed_seconds, updated_at) VALUES ('${wallet}', 1800, 0, 0, datetime('now'))`)
  return { wallet, token }
}

// ── Setup ────────────────────────────────────────────────────────────

console.log(`\n═══ Visibility + Host-Close Smoke Test ═══\n`)

const host = await makeWallet()
const guest = await makeWallet()
console.log(`Host:  ${host.wallet}`)
console.log(`Guest: ${guest.wallet}\n`)

// ── 1. Create open room → appears in /rooms/active ───────────────────

console.log('── 1. Open Room Discovery ──')
const openCreate = await api('POST', '/rooms/create', host.token, { visibility: 'open' })
assert(openCreate.status === 200, `open room created: ${openCreate.data?.room_id?.slice(0, 8)}...`)
assert(openCreate.data?.visibility === 'open', `visibility: ${openCreate.data?.visibility}`)
const openRoomId = openCreate.data.room_id

// Check /rooms/active (no auth needed)
const active1 = await api('GET', '/rooms/active')
assert(active1.status === 200, `GET /rooms/active → ${active1.status}`)
const found = active1.data?.rooms?.find((r: any) => r.room_id === openRoomId)
assert(found !== undefined, `open room found in /rooms/active`)
assert(found?.host_wallet === host.wallet, `host_wallet correct`)
assert(found?.participant_count === 0, `participant_count: ${found?.participant_count} (no one joined yet)`)

// Host joins to make it a real room
const hostJoin = await api('POST', '/rooms/join', host.token, { room_id: openRoomId })
assert(hostJoin.status === 200, `host joined open room`)
const hostConnectionId = hostJoin.data.connection_id

// Check participant count
const active1b = await api('GET', '/rooms/active')
const found1b = active1b.data?.rooms?.find((r: any) => r.room_id === openRoomId)
assert(found1b?.participant_count === 1, `participant_count after join: ${found1b?.participant_count}`)

// Clean up: host leaves (which closes the room since host leaving = close)
const hostLeave = await api('POST', '/rooms/leave', host.token, { room_id: openRoomId, connection_id: hostConnectionId })
assert(hostLeave.status === 200, `host left → room closed`)
assert(hostLeave.data?.closed === true, `closed: ${hostLeave.data?.closed}`)

// ── 2. Create private room → NOT in /rooms/active ───────────────────

console.log('\n── 2. Private Room Not Discoverable ──')
const privCreate = await api('POST', '/rooms/create', host.token, { visibility: 'private' })
assert(privCreate.status === 200, `private room created: ${privCreate.data?.room_id?.slice(0, 8)}...`)
assert(privCreate.data?.visibility === 'private', `visibility: ${privCreate.data?.visibility}`)
const privRoomId = privCreate.data.room_id

const active2 = await api('GET', '/rooms/active')
const notFound = active2.data?.rooms?.find((r: any) => r.room_id === privRoomId)
assert(notFound === undefined, `private room NOT in /rooms/active`)

// ── 3. Private room joinable by direct room_id ──────────────────────

console.log('\n── 3. Private Room Joinable by room_id ──')
// Host joins first
const privHostJoin = await api('POST', '/rooms/join', host.token, { room_id: privRoomId })
assert(privHostJoin.status === 200, `host joined private room`)
const privHostConnId = privHostJoin.data.connection_id

// Guest joins by room_id (this is the "invite link" — knowing the UUID)
const privGuestJoin = await api('POST', '/rooms/join', guest.token, { room_id: privRoomId })
assert(privGuestJoin.status === 200, `guest joined private room by room_id`)
const privGuestConnId = privGuestJoin.data.connection_id

// Verify both are in
const hb1 = await api('POST', '/rooms/heartbeat', host.token, { room_id: privRoomId, connection_id: privHostConnId })
assert(hb1.status === 200, `host heartbeat ok`)
const hb2 = await api('POST', '/rooms/heartbeat', guest.token, { room_id: privRoomId, connection_id: privGuestConnId })
assert(hb2.status === 200, `guest heartbeat ok`)

// ── 4. Host leaving closes room for everyone ────────────────────────

console.log('\n── 4. Host Leave Closes Room ──')
// Wait a moment so metering has something to debit
await new Promise(r => setTimeout(r, 1000))

const hostClose = await api('POST', '/rooms/leave', host.token, { room_id: privRoomId, connection_id: privHostConnId })
assert(hostClose.status === 200, `host leave → ${hostClose.status}`)
assert(hostClose.data?.ok === true, `ok: ${hostClose.data?.ok}`)
assert(hostClose.data?.closed === true, `room closed: ${hostClose.data?.closed}`)

// Guest's heartbeat should now fail (connection gone from DO)
const guestHb = await api('POST', '/rooms/heartbeat', guest.token, { room_id: privRoomId, connection_id: privGuestConnId })
// After host close, the guest's D1 row has left_at_epoch set, so ownership check fails
assert(guestHb.status === 403 || guestHb.status === 404, `guest heartbeat after host-close: ${guestHb.status}`)

// ── 5. Closed room not in /rooms/active ─────────────────────────────

console.log('\n── 5. Closed Rooms Not Discoverable ──')
const active3 = await api('GET', '/rooms/active')
const closedFound = active3.data?.rooms?.find((r: any) => r.room_id === privRoomId || r.room_id === openRoomId)
assert(closedFound === undefined, `closed rooms not in /rooms/active`)

// ── 6. Default visibility is open ───────────────────────────────────

console.log('\n── 6. Default Visibility ──')
const defaultCreate = await api('POST', '/rooms/create', guest.token, {})
assert(defaultCreate.status === 200, `room created with no visibility param`)
assert(defaultCreate.data?.visibility === 'open', `default visibility: ${defaultCreate.data?.visibility}`)

// Clean up
const defaultJoin = await api('POST', '/rooms/join', guest.token, { room_id: defaultCreate.data.room_id })
const defaultLeave = await api('POST', '/rooms/leave', guest.token, {
  room_id: defaultCreate.data.room_id,
  connection_id: defaultJoin.data.connection_id,
})
assert(defaultLeave.data?.closed === true, `cleanup: room closed`)

// Check it was in active before closing
const active4 = await api('GET', '/rooms/active')
const defaultGone = active4.data?.rooms?.find((r: any) => r.room_id === defaultCreate.data.room_id)
assert(defaultGone === undefined, `closed default room not in /rooms/active`)

console.log('\n═══ All visibility + host-close tests passed ═══\n')
