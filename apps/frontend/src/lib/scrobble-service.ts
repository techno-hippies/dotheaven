/**
 * ScrobbleService — wires ScrobbleEngine directly to Lit Action V2.
 *
 * Each scrobble fires the Lit Action immediately (no batching/queue).
 */

import { ScrobbleEngine } from '@heaven/core'
import type { TrackMetadata, ReadyScrobble } from '@heaven/core'
import type { PKPAuthContext } from './lit'
import { getLitClient } from './lit/client'

const SESSION_KEY = 'local'
const TICK_INTERVAL_MS = 15_000
const SCROBBLE_SUBMIT_V2_CID = 'QmTcovqfx6fW5d3AKhSqSDSnC5L56DouVbNhNcqmotaHQK'

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
    console.log('[Scrobble] Ready:', scrobble.artist, '-', scrobble.title, scrobble.mbid ? `(MBID: ${scrobble.mbid})` : '(no MBID)')
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

// ── Lit Action V2 submit (single scrobble) ────────────────────────────

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
  }

  const litTracks = [track]

  // Compute signature: heaven:scrobble:{sha256(tracks)}:{timestamp}:{nonce}
  const tracksJson = JSON.stringify(litTracks)
  const tracksHash = await sha256Hex(tracksJson)
  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000).toString()

  const message = `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`

  console.log('[Scrobble] Signing + submitting via Lit Action...')

  const litClient = await getLitClient()
  const authContext = await getAuthContext()

  // Sign with user's PKP
  const signResult = await litClient.executeJs({
    code: `(async () => {
      const sigShare = await Lit.Actions.ethPersonalSignMessageEcdsa({
        message: jsParams.message,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`,
    authContext,
    jsParams: {
      message,
      publicKey: pkpPublicKey,
    },
  })

  if (!signResult.signatures?.sig) {
    throw new Error('Failed to sign scrobble message')
  }

  const sig = signResult.signatures.sig
  const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
  const v = (sig.recoveryId + 27).toString(16).padStart(2, '0')
  const signature = `0x${sigHex}${v}`

  // Execute the scrobble-submit-v2 Lit Action
  const result = await litClient.executeJs({
    ipfsId: SCROBBLE_SUBMIT_V2_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      tracks: litTracks,
      signature,
      timestamp,
      nonce,
    },
  })

  const response = typeof result.response === 'string' ? JSON.parse(result.response) : result.response
  console.log('[Scrobble] Lit Action response:', response)

  if (!response.success) {
    throw new Error(`Scrobble submit failed: ${response.error || 'unknown'}`)
  }

  console.log('[Scrobble] On-chain! txHashes:', response.txHashes)
}

async function sha256Hex(message: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
