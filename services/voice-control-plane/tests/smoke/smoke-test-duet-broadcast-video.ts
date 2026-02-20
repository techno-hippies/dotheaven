/**
 * E2E smoke test for Phase 1 video broadcast controls.
 *
 * Validates:
 * 1. Host starts audio (mic) → reaches live state.
 * 2. Host starts camera video → statePill includes "+ Video".
 * 3. Watcher on /watch sees a video element (div#u-{uid}).
 * 4. Audio-only unpublish/re-publish does NOT remove the watcher video element (regression for user-unpublished bugfix).
 * 5. Host stops video → statePill loses "+ Video" suffix, watcher video element is removed.
 *
 * Uses --use-fake-device-for-media-stream so headless Chrome provides a fake camera.
 *
 * Usage:
 *   bun tests/smoke/smoke-test-duet-broadcast-video.ts
 *
 * Env:
 *   - SESSION_VOICE_URL (default http://localhost:3338)
 *   - REQUIRE_AGORA_BROADCAST=1 to fail instead of skip on dummy Agora credentials
 *   - DUET_TEST_JWT_SECRET or .env JWT_SECRET
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { chromium } from 'playwright'

const BASE_URL = (process.env.SESSION_VOICE_URL || 'http://localhost:3338').trim()
if (!/^https?:\/\//.test(BASE_URL)) {
  throw new Error('SESSION_VOICE_URL must be a valid http(s) origin')
}

async function readJwtSecret(): Promise<string> {
  const fromEnv = (process.env.DUET_TEST_JWT_SECRET || '').trim()
  if (fromEnv) return fromEnv
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
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
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

async function main() {
  const jwtSecret = await readJwtSecret()
  const host = privateKeyToAccount(generatePrivateKey())
  const hostWallet = host.address.toLowerCase()
  const hostToken = await mintJWT(jwtSecret, host.address)

  console.log('\n═══ Duet Video Broadcast Smoke Test (Playwright) ═══')
  console.log(`Worker: ${BASE_URL}`)
  console.log(`Host:   ${hostWallet}\n`)

  // ── 1. Create free solo room ──
  console.log('── 1. Create free solo duet room ──')
  const create = await api('POST', '/duet/create', hostToken, {
    split_address: hostWallet,
    network: 'eip155:84532',
    asset_usdc: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
    live_amount: '0',
    replay_amount: '0',
    access_window_minutes: 1440,
    replay_mode: 'worker_gated',
    recording_mode: 'host_local',
  })
  assert(create.status === 200, `POST /duet/create → ${create.status}`)
  const roomId = create.data.room_id as string
  assert(typeof roomId === 'string', `room_id: ${roomId}`)

  // ── 2. Start room ──
  console.log('\n── 2. Start room ──')
  const start = await api('POST', `/duet/${roomId}/start`, hostToken, {})
  assert(start.status === 200, `POST /duet/:id/start → ${start.status}`)
  const bridgeTicket = start.data.bridge_ticket as string
  assert(typeof bridgeTicket === 'string', 'bridge_ticket present')

  const broadcastUrl = `${BASE_URL.replace(/\/$/, '')}/duet/${roomId}/broadcast?bridgeTicket=${encodeURIComponent(bridgeTicket)}`
  const watchUrl = `${BASE_URL.replace(/\/$/, '')}/duet/${roomId}/watch`

  // ── 3. Open broadcast page, start mic audio ──
  console.log('\n── 3. Open /broadcast → start mic audio ──')
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  })

  let skippedDueToDummyAgora = false

  try {
    const hostContext = await browser.newContext({
      permissions: ['microphone', 'camera'],
    })
    const hostPage = await hostContext.newPage()
    hostPage.on('console', (msg) => {
      const text = msg.text()
      if (/AgoraRTCError|Joining channel failed|CAN_NOT_GET_GATEWAY/i.test(text)) {
        console.log(`  [host] ${text}`)
      }
    })

    await hostPage.goto(broadcastUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await hostPage.waitForSelector('#startBtn', { timeout: 30_000 })

    // Check for dummy Agora credentials.
    const html = await hostPage.content()
    const m = html.match(/const\s+appId\s*=\s*"([a-fA-F0-9]{32})"\s*;/)
    const pageAppId = m?.[1]?.toLowerCase() || ''
    const requireAgora = (process.env.REQUIRE_AGORA_BROADCAST || '').trim().toLowerCase()
    const requireAgoraEnabled = requireAgora === '1' || requireAgora === 'true' || requireAgora === 'yes'
    if (pageAppId === '00000000000000000000000000000000' && !requireAgoraEnabled) {
      console.log('  ~ SKIP: dummy AGORA_APP_ID (set REQUIRE_AGORA_BROADCAST=1 to enforce).')
      skippedDueToDummyAgora = true
    }

    if (!skippedDueToDummyAgora) {
      // Start mic broadcast.
      await hostPage.click('#startBtn')
      await hostPage.waitForFunction(() => {
        const pill = document.getElementById('statePill')
        return !!pill && /live/i.test(pill.textContent || '')
      }, { timeout: 60_000 })

      const audioState = await hostPage.evaluate(() => document.getElementById('statePill')?.textContent || '')
      assert(/Live/.test(audioState), `audio live: statePill="${audioState}"`)
      assert(!/\+ Video/.test(audioState), `no video suffix yet: statePill="${audioState}"`)

      // ── 4. Start camera video ──
      console.log('\n── 4. Start camera video ──')
      await hostPage.click('#cameraBtn')
      await hostPage.waitForFunction(() => {
        const pill = document.getElementById('statePill')
        return !!pill && /\+ Video\b/.test(pill.textContent || '')
      }, { timeout: 30_000 })

      const videoState = await hostPage.evaluate(() => document.getElementById('statePill')?.textContent || '')
      assert(/\+ Video\b/.test(videoState), `statePill has "+ Video": "${videoState}"`)

      // ── 5. Open watcher, verify video element appears ──
      console.log('\n── 5. Open /watch → verify video element ──')
      const watchContext = await browser.newContext()
      const watchPage = await watchContext.newPage()
      watchPage.on('console', (msg) => {
        const text = msg.text()
        if (/AgoraRTCError|Joining channel failed|CAN_NOT_GET_GATEWAY/i.test(text)) {
          console.log(`  [watch] ${text}`)
        }
      })

      await watchPage.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })

      // Capture user-unpublished handler so we can synthesize an audio-only unpublish event.
      await watchPage.evaluate(() => {
        const w = window as any
        if (w.__duetUnpublishCaptureInstalled) return
        if (!w.AgoraRTC || typeof w.AgoraRTC.createClient !== 'function') {
          throw new Error('AgoraRTC unavailable on watch page')
        }
        const originalCreateClient = w.AgoraRTC.createClient.bind(w.AgoraRTC)
        w.AgoraRTC.createClient = (...args: any[]) => {
          const client = originalCreateClient(...args)
          const originalOn = client.on.bind(client)
          client.on = (event: string, handler: any) => {
            if (event === 'user-unpublished') {
              w.__duetUserUnpublishedHandler = handler
            }
            return originalOn(event, handler)
          }
          return client
        }
        w.__duetUnpublishCaptureInstalled = true
      })

      // Wait for the room to show as live and auto-enter (free room).
      await watchPage.waitForSelector('#enterBtn', { timeout: 30_000 })

      // Free rooms: public-info polling should enable enterBtn, then we click it.
      await watchPage.waitForFunction(() => {
        const btn = document.getElementById('enterBtn') as HTMLButtonElement | null
        return btn && !btn.disabled
      }, { timeout: 30_000 })
      await watchPage.click('#enterBtn')

      // Wait for a video element to appear (div with id starting with "u-").
      await watchPage.waitForFunction(() => {
        const remote = document.getElementById('remote')
        if (!remote) return false
        return remote.querySelector('[id^="u-"]') !== null
      }, { timeout: 30_000 })

      const videoElementId = await watchPage.evaluate(() => {
        const remote = document.getElementById('remote')
        const el = remote?.querySelector('[id^="u-"]')
        return el?.id || null
      })
      assert(!!videoElementId, `watcher has video element: ${videoElementId}`)

      // ── 6. Regression: audio-only user-unpublished must NOT remove video ──
      console.log('\n── 6. Regression: audio-only user-unpublished must not remove video ──')
      const syntheticAudioUnpublish = await watchPage.evaluate((id: string) => {
        const w = window as any
        const handler = w.__duetUserUnpublishedHandler
        if (typeof handler !== 'function') {
          return { invoked: false, stillPresent: false }
        }
        const uid = id.startsWith('u-') ? id.slice(2) : id
        handler({ uid }, 'audio')
        return {
          invoked: true,
          stillPresent: !!document.getElementById(id),
        }
      }, videoElementId as string)

      assert(
        syntheticAudioUnpublish.invoked,
        'captured watch user-unpublished handler for synthetic audio event',
      )
      assert(
        syntheticAudioUnpublish.stillPresent,
        'video element persists after synthetic audio-only user-unpublished event',
      )

      // Keep a short settle window to catch async DOM regressions.
      await watchPage.waitForTimeout(1500)
      const videoStillExists = await watchPage.evaluate((id) => !!document.getElementById(id), videoElementId)
      assert(videoStillExists, 'video element still present after settle window')

      // ── 7. Stop video → verify statePill and watcher ──
      console.log('\n── 7. Stop video → verify statePill and watcher cleanup ──')
      await hostPage.click('#stopVideoBtn')

      await hostPage.waitForFunction(() => {
        const pill = document.getElementById('statePill')
        return !!pill && /Live/.test(pill.textContent || '') && !/\+ Video/.test(pill.textContent || '')
      }, { timeout: 15_000 })

      const afterStopState = await hostPage.evaluate(() => document.getElementById('statePill')?.textContent || '')
      assert(/Live/.test(afterStopState), `still live after video stop: "${afterStopState}"`)
      assert(!/\+ Video/.test(afterStopState), `"+ Video" removed: "${afterStopState}"`)

      // Watcher should lose the video element.
      await watchPage.waitForFunction((id: string) => {
        return !document.getElementById(id)
      }, videoElementId, { timeout: 15_000 })

      const videoGone = await watchPage.evaluate((id) => !document.getElementById(id), videoElementId)
      assert(videoGone, 'watcher video element removed after host stopped video')

      // Audio should still be connected on watcher side.
      const watcherAudioOk = await watchPage.evaluate(() => {
        const msg = document.getElementById('message')
        if (!msg) return false
        const text = msg.textContent || ''
        return /Live audio connected|Connected\. Waiting for host audio/i.test(text)
      })
      // Note: this is a best-effort check; fake device may not produce audible audio.
      if (watcherAudioOk) {
        console.log('  ✓ watcher audio still connected after video stop')
      } else {
        console.log('  ~ watcher audio status unclear (expected with fake devices)')
      }

      // ── 8. Cleanup ──
      await hostPage.click('#stopBtn').catch(() => {})
      await watchPage.close().catch(() => {})
      await watchContext.close().catch(() => {})
    }
  } finally {
    await browser.close().catch(() => {})
  }

  // ── 9. End room ──
  console.log('\n── 8. End room ──')
  const end = await api('POST', `/duet/${roomId}/end`, hostToken, {})
  assert(end.status === 200, `POST /duet/:id/end → ${end.status}`)
  assert(end.data?.status === 'ended', `status: ${String(end.data?.status)}`)

  if (skippedDueToDummyAgora) {
    console.log('\n═══ Duet video broadcast smoke test skipped (dummy Agora) ═══\n')
    return
  }

  console.log('\n═══ Duet video broadcast smoke test passed ═══\n')
}

await main()
