/**
 * Smoke test: concurrent heartbeat/alarm debit stress test
 *
 * Verifies no double-charge edge cases when multiple heartbeats
 * fire concurrently against the same wallet.
 *
 * Strategy:
 *   1. Grant exactly 100s credits
 *   2. Join a room
 *   3. Wait 5s, then fire 10 concurrent heartbeats
 *   4. Verify total debited ≈ elapsed time (not 10× elapsed)
 *   5. Wait 3s more, fire another 10 concurrent heartbeats
 *   6. Verify cumulative debit ≈ total elapsed (no over-charge)
 *   7. Verify remaining = granted - consumed (consistency check)
 *   8. Leave and verify final credits match
 *
 * Usage: bun src/smoke-test-concurrent.ts
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const BASE_URL = process.env.SESSION_VOICE_URL || 'http://localhost:3338'
const D1_DATABASE = process.env.VOICE_CONTROL_PLANE_D1_DATABASE || process.env.D1_DATABASE || 'session-voice'

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

// ── Setup ────────────────────────────────────────────────────────────

const key = generatePrivateKey()
const account = privateKeyToAccount(key)
const wallet = account.address.toLowerCase()
const token = await mintJWT(wallet)

const GRANTED = 100

console.log(`\n═══ Concurrent Debit Stress Test ═══`)
console.log(`Wallet: ${wallet}`)
console.log(`Granted: ${GRANTED}s\n`)

// Grant exactly 100s credits
d1(`INSERT INTO credit_accounts (wallet, base_granted_seconds, bonus_granted_seconds, consumed_seconds, updated_at) VALUES ('${wallet}', ${GRANTED}, 0, 0, datetime('now'))`)
console.log('  ✓ Granted credits')

// ── 1. Create & Join ──────────────────────────────────────────────────

console.log('\n── 1. Create & Join Room ──')
const create = await api('POST', '/rooms/create', token, {})
assert(create.status === 200, `room created`)
const roomId = create.data.room_id

const join = await api('POST', '/rooms/join', token, { room_id: roomId })
assert(join.status === 200, `joined`)
assert(join.data.remaining_seconds === GRANTED, `remaining: ${join.data.remaining_seconds}`)
const connectionId = join.data.connection_id

// ── 2. Wait 5s, then fire 10 concurrent heartbeats ──────────────────

console.log('\n── 2. Concurrent Heartbeats (batch 1: after 5s) ──')
await new Promise(r => setTimeout(r, 5000))

const batch1Start = Date.now()
const batch1 = await Promise.all(
  Array.from({ length: 10 }, () =>
    api('POST', '/rooms/heartbeat', token, { room_id: roomId, connection_id: connectionId })
  )
)
const batch1Ms = Date.now() - batch1Start

// All should succeed
const batch1Statuses = batch1.map(r => r.status)
assert(batch1Statuses.every(s => s === 200), `all 10 heartbeats returned 200`)

// Collect remaining values — they should be close to each other
const batch1Remaining = batch1.map(r => r.data?.remaining_seconds).filter(r => r !== undefined)
const batch1Min = Math.min(...batch1Remaining)
const batch1Max = Math.max(...batch1Remaining)
console.log(`  remaining range: ${batch1Min}–${batch1Max} (spread: ${batch1Max - batch1Min})`)

// The first heartbeat debits ~5s. Subsequent ones in the same second debit 0.
// Max debit should be roughly 5-6s (elapsed time), not 50s (10 × 5s)
const consumed1 = GRANTED - batch1Min
assert(consumed1 >= 4 && consumed1 <= 8, `total debited ≈ 5s (actual: ${consumed1}s) — no double-charge`)
console.log(`  batch completed in ${batch1Ms}ms`)

// ── 3. Wait 3s, fire another 10 concurrent heartbeats ───────────────

console.log('\n── 3. Concurrent Heartbeats (batch 2: after +3s) ──')
await new Promise(r => setTimeout(r, 3000))

const batch2 = await Promise.all(
  Array.from({ length: 10 }, () =>
    api('POST', '/rooms/heartbeat', token, { room_id: roomId, connection_id: connectionId })
  )
)

assert(batch2.every(r => r.status === 200), `all 10 heartbeats returned 200`)

const batch2Remaining = batch2.map(r => r.data?.remaining_seconds).filter(r => r !== undefined)
const batch2Min = Math.min(...batch2Remaining)
const totalConsumed = GRANTED - batch2Min
console.log(`  remaining: ${batch2Min}, total consumed: ${totalConsumed}s`)

// Total elapsed is ~8s. Allow generous bound for DO request queuing overhead.
// If double-charging, it would be ~80s. Under 30s confirms no major double-charge.
assert(totalConsumed >= 6 && totalConsumed <= 30, `cumulative debit ≈ 8s (actual: ${totalConsumed}s) — no double-charge`)

// ── 4. D1 consistency check ──────────────────────────────────────────

console.log('\n── 4. D1 Consistency Check ──')
const d1Account = d1json(`SELECT base_granted_seconds, bonus_granted_seconds, consumed_seconds FROM credit_accounts WHERE wallet = '${wallet}'`)
assert(d1Account.length === 1, `credit account exists`)

const { base_granted_seconds, bonus_granted_seconds, consumed_seconds } = d1Account[0]
const d1Remaining = base_granted_seconds + bonus_granted_seconds - consumed_seconds
console.log(`  D1: granted=${base_granted_seconds}+${bonus_granted_seconds}, consumed=${consumed_seconds}, remaining=${d1Remaining}`)
assert(d1Remaining === batch2Min, `D1 remaining (${d1Remaining}) matches last heartbeat remaining (${batch2Min})`)
assert(consumed_seconds === totalConsumed, `D1 consumed (${consumed_seconds}) matches total debited (${totalConsumed})`)

// Check credit_events — each debit should be logged exactly once
const events = d1json(`SELECT delta_seconds, balance_after_seconds FROM credit_events WHERE wallet = '${wallet}' AND event_type = 'debit_usage' ORDER BY rowid`)
console.log(`  credit events: ${events.length} debit entries`)

// Sum of all debits should equal total consumed
const totalDebited = events.reduce((sum: number, e: any) => sum + Math.abs(e.delta_seconds), 0)
assert(totalDebited === totalConsumed, `sum of debit events (${totalDebited}) = total consumed (${totalConsumed})`)

// ── 5. Leave and final verification ─────────────────────────────────

console.log('\n── 5. Leave & Final Verification ──')
// Wait 1s so leave meters another second
await new Promise(r => setTimeout(r, 1000))

const leave = await api('POST', '/rooms/leave', token, { room_id: roomId, connection_id: connectionId })
assert(leave.status === 200, `left room`)
assert(leave.data?.closed === true, `room closed`)

// Final credit check via API
const finalCredits = await api('GET', '/credits', token)
assert(finalCredits.status === 200, `GET /credits → 200`)

const finalRemaining = finalCredits.data?.remaining_seconds
const finalConsumed = finalCredits.data?.consumed_seconds
console.log(`  final: remaining=${finalRemaining}, consumed=${finalConsumed}`)
assert(finalRemaining + finalConsumed === GRANTED, `remaining + consumed = granted (${finalRemaining} + ${finalConsumed} = ${GRANTED})`)

// Total elapsed is ~9s. Final consumed should be in that range.
assert(finalConsumed >= 7 && finalConsumed <= 14, `final consumed ≈ 9s (actual: ${finalConsumed}s)`)

// ── 6. Over-drain guard: create room with low credits ────────────────

console.log('\n── 6. Over-Drain Guard ──')
// Update credits to exactly 10s remaining
d1(`UPDATE credit_accounts SET consumed_seconds = ${GRANTED - 10} WHERE wallet = '${wallet}'`)

const create2 = await api('POST', '/rooms/create', token, {})
// 10s < JOIN_MIN_SECONDS (90s) → should be denied
assert(create2.status === 403, `room create denied with 10s remaining: ${create2.status}`)
assert(create2.data?.error === 'insufficient_credits', `error: ${create2.data?.error}`)

console.log('\n═══ All concurrent debit tests passed ═══\n')
