/**
 * E2E-ish smoke test: exercises the actual /duet/:id/broadcast browser page and Agora join/publish.
 *
 * Goal: catch regressions where bridge credentials mint fine but Agora Web SDK join fails
 * (e.g. invalid AGORA secrets / disabled app / network blocking).
 *
 * This uses "Start Test Tone" to avoid depending on host mic/screen-share devices.
 *
 * Two modes:
 * 1) Full flow (default): create/start a new solo duet room then open its /broadcast page.
 *    Requires a JWT secret to mint host auth.
 * 2) Remote URL flow: provide DUET_REMOTE_BROADCAST_URL (already includes bridgeTicket),
 *    then just open + join + verify broadcaster_online flips. Does not require JWT.
 *
 * Usage:
 *   npm run test:duet:broadcast
 *
 * Env:
 *   - SESSION_VOICE_URL (default http://localhost:3338)
 *   - DUET_REMOTE_BROADCAST_URL (optional; enables remote URL flow)
 *
 * Auth env for full flow (one of):
 *   - DUET_TEST_JWT_SECRET (preferred; works for local or remote worker if it matches JWT_SECRET)
 *   - local .env containing JWT_SECRET (fallback; convenient for local dev)
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { chromium } from 'playwright'

const BASE_URL = (process.env.SESSION_VOICE_URL || 'http://localhost:3338').trim()
if (!/^https?:\/\//.test(BASE_URL)) {
  throw new Error('SESSION_VOICE_URL must be a valid http(s) origin')
}
const TEST_NETWORK = (process.env.DUET_TEST_NETWORK || 'eip155:84532').trim()
if (TEST_NETWORK !== 'eip155:84532') {
  throw new Error(`Duet tests are locked to Base Sepolia (eip155:84532). Got: ${TEST_NETWORK}`)
}
const TEST_ASSET_USDC = (process.env.DUET_TEST_ASSET_USDC || '0x036cbd53842c5426634e7929541ec2318f3dcf7e').trim()
const REMOTE_BROADCAST_URL_RAW = (process.env.DUET_REMOTE_BROADCAST_URL || '').trim()

async function readJwtSecret(): Promise<string> {
  const fromEnv = (process.env.DUET_TEST_JWT_SECRET || '').trim()
  if (fromEnv) return fromEnv
  // Local-only fallback (matches existing smoke tests).
  const envFile = await Bun.file('.env').text().catch(() => '')
  const found = envFile.match(/^JWT_SECRET=(.+)$/m)?.[1]?.trim()
  if (!found) {
    throw new Error('Missing JWT secret. Set DUET_TEST_JWT_SECRET (or add JWT_SECRET to services/voice-control-plane/.env).')
  }
  return found
}

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

async function mintJWT(jwtSecret: string, wallet: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const h = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const b = base64UrlEncodeString(JSON.stringify({ sub: wallet.toLowerCase(), iat: now, exp: now + 3600 }))
  const s = await hmacSign(jwtSecret, `${h}.${b}`)
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
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
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

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`  ✓ ${msg}`)
}

async function waitFor(
  label: string,
  timeoutMs: number,
  check: () => Promise<boolean>,
): Promise<void> {
  const start = Date.now()
  let lastError: unknown = null
  while (Date.now() - start < timeoutMs) {
    try {
      if (await check()) return
    } catch (e) {
      lastError = e
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  const suffix = lastError ? ` (last error: ${String((lastError as any)?.message || lastError)})` : ''
  throw new Error(`${label} timed out after ${timeoutMs}ms${suffix}`)
}

function parseRoomIdFromBroadcastUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('DUET_REMOTE_BROADCAST_URL must be a valid URL')
  }
  const match = url.pathname.match(/^\/duet\/([^/]+)\/broadcast$/)
  if (!match) {
    throw new Error('DUET_REMOTE_BROADCAST_URL path must look like /duet/<roomId>/broadcast')
  }
  return match[1]
}

async function main() {
  const isRemoteUrlFlow = REMOTE_BROADCAST_URL_RAW.length > 0
  const roomId = isRemoteUrlFlow ? parseRoomIdFromBroadcastUrl(REMOTE_BROADCAST_URL_RAW) : ''
  const broadcastUrl = isRemoteUrlFlow
    ? REMOTE_BROADCAST_URL_RAW
    : ''

  let hostToken: string | null = null
  let hostWallet: string | null = null

  console.log('\n═══ Duet Broadcast Page Smoke Test (Playwright) ═══')
  console.log(`Worker: ${BASE_URL}`)
  console.log(`Mode:   ${isRemoteUrlFlow ? 'remote-url' : 'full-flow'}`)
  console.log(`Expect: ${TEST_NETWORK}\n`)

  let createdRoomId: string | null = null
  if (!isRemoteUrlFlow) {
    const jwtSecret = await readJwtSecret()
    const host = privateKeyToAccount(generatePrivateKey())
    hostWallet = host.address.toLowerCase()
    hostToken = await mintJWT(jwtSecret, host.address)

    console.log(`Host:   ${hostWallet}`)

    console.log('\n── 1. Create Solo Duet Room (no guest) ──')
    const create = await api('POST', '/duet/create', hostToken, {
      split_address: hostWallet,
      network: TEST_NETWORK,
      asset_usdc: TEST_ASSET_USDC,
      live_amount: '100000',
      replay_amount: '100000',
      access_window_minutes: 1440,
      replay_mode: 'worker_gated',
      recording_mode: 'host_local',
    })
    assert(create.status === 200, `POST /duet/create → ${create.status}`)
    assert(typeof create.data?.room_id === 'string', 'room_id present')
    createdRoomId = create.data.room_id as string

    console.log('\n── 2. Start Room (bridge ticket) ──')
    const start = await api('POST', `/duet/${createdRoomId}/start`, hostToken, {})
    assert(start.status === 200, `POST /duet/:id/start → ${start.status}`)
    assert(typeof start.data?.bridge_ticket === 'string', 'bridge_ticket present')
    const bridgeTicket = start.data.bridge_ticket as string

    const url = `${BASE_URL.replace(/\/$/, '')}/duet/${createdRoomId}/broadcast?bridgeTicket=${encodeURIComponent(bridgeTicket)}`
    console.log(`\nBroadcast URL: ${url}`)
    ;(globalThis as any).__broadcastUrl = url
  }

  const effectiveRoomId = isRemoteUrlFlow ? roomId : (createdRoomId as string)
  const effectiveBroadcastUrl = isRemoteUrlFlow ? broadcastUrl : String((globalThis as any).__broadcastUrl)

  console.log('\n── 3. Open /broadcast and Start Test Tone ──')
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      // Make mic capture deterministic in headless.
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  })

  try {
    const context = await browser.newContext({
      permissions: ['microphone'],
    })
    const page = await context.newPage()
    page.on('console', (msg) => {
      const text = msg.text()
      if (/CAN_NOT_GET_GATEWAY_SERVER|AgoraRTCError|Joining channel failed/i.test(text)) {
        console.log(`  [browser] ${text}`)
      }
    })

    await page.goto(effectiveBroadcastUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('#toneBtn', { timeout: 30_000 })

    // If the worker is running with dummy Agora credentials, joining RTC will fail.
    // Treat this as a skip unless the caller explicitly requires it.
    const html = await page.content()
    const m = html.match(/const\\s+appId\\s*=\\s*\"([a-fA-F0-9]{32})\"\\s*;/)
    const pageAppId = m?.[1]?.toLowerCase() || ''
    const requireAgora = (process.env.REQUIRE_AGORA_BROADCAST || '').trim().toLowerCase()
    const requireAgoraEnabled = requireAgora === '1' || requireAgora === 'true' || requireAgora === 'yes'
    if (pageAppId === '00000000000000000000000000000000' && !requireAgoraEnabled) {
      console.log('  ~ SKIP: worker broadcast page is configured with dummy AGORA_APP_ID (set REQUIRE_AGORA_BROADCAST=1 to enforce).')
      return
    }

    // Fail fast if the page is blocked (missing bridge ticket or worker misconfigured).
    const preflight = await page.evaluate(() => {
      const toneBtn = document.getElementById('toneBtn') as HTMLButtonElement | null
      const shareBtn = document.getElementById('shareBtn') as HTMLButtonElement | null
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement | null
      const message = document.getElementById('message')
      const error = document.getElementById('error')
      const state = document.getElementById('statePill')
      return {
        toneDisabled: !!toneBtn?.disabled,
        shareDisabled: !!shareBtn?.disabled,
        startDisabled: !!startBtn?.disabled,
        state: state?.textContent || '',
        message: message?.textContent || '',
        error: error?.textContent || '',
      }
    })
    if (preflight.toneDisabled) {
      throw new Error(
        `broadcast page is blocked (tone disabled). state=${JSON.stringify(preflight.state)} message=${JSON.stringify(preflight.message)} error=${JSON.stringify(preflight.error)}`,
      )
    }

    // Prefer mic path in headless because WebAudio is often restricted.
    await page.click('#startBtn')

    // Wait for either Live state, or an error message to appear.
    await Promise.race([
      page.waitForFunction(() => {
        const pill = document.getElementById('statePill')
        return !!pill && /live/i.test(pill.textContent || '')
      }, { timeout: 60_000 }),
      page.waitForFunction(() => {
        const err = document.getElementById('error')
        if (!err) return false
        const style = window.getComputedStyle(err)
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
        return visible && (err.textContent || '').trim().length > 0
      }, { timeout: 60_000 }),
    ])

    const stateAfter = await page.evaluate(() => {
      const pill = document.getElementById('statePill')
      const message = document.getElementById('message')
      const error = document.getElementById('error')
      return {
        state: pill?.textContent || '',
        message: message?.textContent || '',
        error: error?.textContent || '',
      }
    })
    if (!/live/i.test(stateAfter.state || '')) {
      throw new Error(`broadcast did not reach live. state=${JSON.stringify(stateAfter.state)} message=${JSON.stringify(stateAfter.message)} error=${JSON.stringify(stateAfter.error)}`)
    }

    // Confirm server-side state (heartbeat) flips online.
    await waitFor('public-info broadcaster_online', 30_000, async () => {
      const info = await api('GET', `/duet/${effectiveRoomId}/public-info`)
      return info.status === 200 && info.data?.broadcaster_online === true
    })
    console.log('  ✓ broadcaster_online observed via public-info')

    // Stop to avoid leaking sessions.
    await page.click('#stopBtn').catch(() => {})
  } finally {
    await browser.close().catch(() => {})
  }

  if (!isRemoteUrlFlow) {
    console.log('\n── 4. End Room ──')
    const end = await api('POST', `/duet/${createdRoomId}/end`, hostToken as string, {})
    assert(end.status === 200, `POST /duet/:id/end → ${end.status}`)
    assert(end.data?.status === 'ended', `status: ${String(end.data?.status)}`)
  }

  console.log('\n═══ Duet broadcast smoke test passed ═══\n')
}

await main()
