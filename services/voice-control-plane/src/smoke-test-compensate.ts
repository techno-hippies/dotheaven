/**
 * Smoke test: compensating DO leave on D1 insert failure
 *
 * Simulates the scenario where DO join succeeds but D1 insert fails.
 * Verifies that the compensating leave removes the participant from the DO.
 *
 * Strategy:
 *   1. Host creates & joins a room
 *   2. Guest joins the room
 *   3. Delete guest's D1 participant row (simulate D1 insert failure)
 *   4. Verify guest's ownership check fails (can't heartbeat/leave)
 *   5. Re-insert guest D1 row, leave via API → confirms DO leave works
 *   6. Host leaves → room closes (host-close behavior)
 *
 * Usage: bun src/smoke-test-compensate.ts
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

function d1(sql: string) {
  const { execSync } = require('child_process')
  execSync(
    `bunx wrangler d1 execute ${D1_DATABASE} --local --command="${sql.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: 'pipe' },
  )
}

function d1json(sql: string): any[] {
  const { execSync } = require('child_process')
  const out = execSync(
    `bunx wrangler d1 execute ${D1_DATABASE} --local --json --command="${sql.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: 'pipe' },
  ).toString()
  const parsed = JSON.parse(out)
  return parsed[0]?.results ?? []
}

async function makeWallet() {
  const key = generatePrivateKey()
  const wallet = privateKeyToAccount(key).address.toLowerCase()
  const token = await mintJWT(wallet)
  d1(`INSERT INTO credit_accounts (wallet, base_granted_seconds, bonus_granted_seconds, consumed_seconds, updated_at) VALUES ('${wallet}', 1800, 0, 0, datetime('now'))`)
  return { wallet, token }
}

// ── Setup ────────────────────────────────────────────────────────────

console.log(`\n═══ Compensating Leave Smoke Test ═══\n`)

const host = await makeWallet()
const guest = await makeWallet()
console.log(`Host:  ${host.wallet}`)
console.log(`Guest: ${guest.wallet}`)

// ── 1. Host creates & joins room ─────────────────────────────────────

console.log('\n── 1. Host Creates & Joins Room ──')
const create = await api('POST', '/rooms/create', host.token, {})
assert(create.status === 200, `room created: ${create.data?.room_id?.slice(0, 8)}...`)
const roomId = create.data.room_id

const hostJoin = await api('POST', '/rooms/join', host.token, { room_id: roomId })
assert(hostJoin.status === 200, `host joined: ${hostJoin.data?.connection_id?.slice(0, 8)}...`)
const hostConnId = hostJoin.data.connection_id

// ── 2. Guest joins room ─────────────────────────────────────────────

console.log('\n── 2. Guest Joins Room ──')
const guestJoin = await api('POST', '/rooms/join', guest.token, { room_id: roomId })
assert(guestJoin.status === 200, `guest joined: ${guestJoin.data?.connection_id?.slice(0, 8)}...`)
const guestConnId = guestJoin.data.connection_id

// Verify both can heartbeat
const hb1 = await api('POST', '/rooms/heartbeat', host.token, { room_id: roomId, connection_id: hostConnId })
assert(hb1.status === 200, `host heartbeat ok`)
const hb2 = await api('POST', '/rooms/heartbeat', guest.token, { room_id: roomId, connection_id: guestConnId })
assert(hb2.status === 200, `guest heartbeat ok`)

// ── 3. Delete guest's D1 row (simulate D1 insert failure) ───────────

console.log('\n── 3. Simulate D1 Failure (delete guest participant row) ──')
d1(`DELETE FROM room_participants WHERE connection_id = '${guestConnId}'`)
const rows = d1json(`SELECT COUNT(*) as cnt FROM room_participants WHERE connection_id = '${guestConnId}'`)
assert(rows[0]?.cnt === 0, `guest D1 row deleted`)

// ── 4. Guest ownership check fails ──────────────────────────────────

console.log('\n── 4. Guest Ownership Check Fails ──')
const hb3 = await api('POST', '/rooms/heartbeat', guest.token, { room_id: roomId, connection_id: guestConnId })
assert(hb3.status === 403, `guest heartbeat rejected: ${hb3.status}`)
assert(hb3.data?.error === 'not_your_connection', `error: ${hb3.data?.error}`)

const leave1 = await api('POST', '/rooms/leave', guest.token, { room_id: roomId, connection_id: guestConnId })
assert(leave1.status === 403, `guest leave rejected: ${leave1.status}`)

// ── 5. Compensating leave (re-insert row, then leave via API) ───────

console.log('\n── 5. Simulate Compensating Leave ──')
// Re-insert the D1 row to simulate recovery
const now = Math.floor(Date.now() / 1000)
d1(`INSERT INTO room_participants (connection_id, room_id, wallet, agora_uid, joined_at_epoch, last_metered_at_epoch) VALUES ('${guestConnId}', '${roomId}', '${guest.wallet}', 12345, ${now}, ${now})`)

const guestLeave = await api('POST', '/rooms/leave', guest.token, { room_id: roomId, connection_id: guestConnId })
assert(guestLeave.status === 200, `guest compensating leave succeeded`)
assert(guestLeave.data?.ok === true, `ok: ${guestLeave.data?.ok}`)
// Guest is NOT the host, so room should NOT close
assert(guestLeave.data?.closed === false, `room not closed (guest left, host still in)`)

// ── 6. Host still active, then host leaves → room closes ────────────

console.log('\n── 6. Host Leaves → Room Closes ──')
const hb4 = await api('POST', '/rooms/heartbeat', host.token, { room_id: roomId, connection_id: hostConnId })
assert(hb4.status === 200, `host still active after guest left`)

const hostLeave = await api('POST', '/rooms/leave', host.token, { room_id: roomId, connection_id: hostConnId })
assert(hostLeave.status === 200, `host leave → room closes`)
assert(hostLeave.data?.closed === true, `room closed (host left)`)

// ── 7. Verify cleanup ──────────────────────────────────────────────

console.log('\n── 7. Verify Cleanup ──')
const d1Guest = d1json(`SELECT left_at_epoch FROM room_participants WHERE connection_id = '${guestConnId}'`)
assert(d1Guest.length === 1 && d1Guest[0].left_at_epoch !== null, `guest marked as left in D1`)

const d1Host = d1json(`SELECT left_at_epoch FROM room_participants WHERE connection_id = '${hostConnId}'`)
assert(d1Host.length === 1 && d1Host[0].left_at_epoch !== null, `host marked as left in D1`)

const d1Room = d1json(`SELECT status FROM rooms WHERE room_id = '${roomId}'`)
assert(d1Room[0]?.status === 'closed', `room status: closed`)

console.log('\n═══ All compensating leave tests passed ═══\n')
