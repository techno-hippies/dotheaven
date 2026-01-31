/**
 * ScrobbleService — wires ScrobbleEngine to Lit Action V3 (ScrobbleV3).
 *
 * Each scrobble fires the Lit Action immediately (no batching/queue).
 * V3 registers tracks on-chain (title/artist/album) + scrobbles as cheap event refs.
 */

import { ScrobbleEngine } from '@heaven/core'
import type { TrackMetadata, ReadyScrobble } from '@heaven/core'
import type { PKPAuthContext } from './lit'
import { getLitClient } from './lit/client'

const SESSION_KEY = 'local'
const TICK_INTERVAL_MS = 15_000
const SCROBBLE_SUBMIT_V3_CID = 'QmbAT5L1RuKhvgPGpEScRiwYzK32qkDSJDR9gK8R588oB9'

export interface ScrobbleService {
  start(): void
  stop(): void
  onTrackStart(meta: TrackMetadata): void
  onPlaybackChange(isPlaying: boolean): void
  tick(): void
}

export function createScrobbleService(
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
): ScrobbleService {
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const engine = new ScrobbleEngine((scrobble) => {
    console.log('[Scrobble] Ready:', scrobble.artist, '-', scrobble.title)
    // Fire after a brief delay to avoid competing with audio/UI in WebKitGTK
    setTimeout(() => {
      submitScrobble(scrobble, getAuthContext, getPkpPublicKey).catch((err) => {
        console.error('[Scrobble] Submit failed:', err)
      })
    }, 2000)
  })

  return {
    start() {
      tickTimer = setInterval(() => engine.tick(), TICK_INTERVAL_MS)
    },

    stop() {
      if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = null
      }
      engine.onSessionGone(SESSION_KEY)
    },

    onTrackStart(meta: TrackMetadata) {
      engine.onMetadata(SESSION_KEY, meta)
    },

    onPlaybackChange(isPlaying: boolean) {
      engine.onPlayback(SESSION_KEY, isPlaying)
    },

    tick() {
      engine.tick()
    },
  }
}

// ── Lit Action V3 submit ────────────────────────────────────────────

async function submitScrobble(
  scrobble: ReadyScrobble,
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpPublicKey: () => string | null,
): Promise<void> {
  const pkpPublicKey = getPkpPublicKey()
  if (!pkpPublicKey) {
    console.warn('[Scrobble] Not authenticated — skipping submit')
    return
  }

  const track = {
    artist: scrobble.artist,
    title: scrobble.title,
    ...(scrobble.album ? { album: scrobble.album } : {}),
    playedAt: scrobble.playedAtSec,
    ...(scrobble.mbid ? { mbid: scrobble.mbid } : {}),
    ...(scrobble.ipId ? { ipId: scrobble.ipId } : {}),
    ...(scrobble.coverCid ? { coverCid: scrobble.coverCid } : {}),
  }

  const litTracks = [track]

  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000).toString()

  console.log('[Scrobble] Submitting via Lit Action V3 (internal signing)...')

  const litClient = await getLitClient()
  const authContext = await getAuthContext()

  // Single executeJs: action signs with user's PKP + sponsor PKP broadcasts
  const result = await litClient.executeJs({
    ipfsId: SCROBBLE_SUBMIT_V3_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      tracks: litTracks,
      timestamp,
      nonce,
    },
  })

  const response = typeof result.response === 'string' ? JSON.parse(result.response) : result.response

  if (!response.success) {
    throw new Error(`Scrobble submit failed: ${response.error || 'unknown'}`)
  }

  console.log(`[Scrobble] On-chain! tx: ${response.txHash} (registered: ${response.registered}, scrobbled: ${response.scrobbled}, covers: ${response.coversSet ?? 0})`)
}

