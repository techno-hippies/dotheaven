/**
 * ScrobbleService — wires ScrobbleEngine to AA client (ScrobbleV4).
 *
 * Each scrobble submits a UserOp via the AA gateway immediately (no batching/queue).
 * V4 registers tracks on-chain (title/artist/album) + scrobbles as cheap event refs,
 * using ERC-4337 Account Abstraction instead of Lit Action V3.
 */

import { ScrobbleEngine } from '@heaven/core'
import type { TrackMetadata, ReadyScrobble } from '@heaven/core'
import type { PKPInfo, PKPAuthContext } from './lit'
import { submitScrobbleViaAA, type ScrobbleTrack } from './aa-client'
import { submitTrackCoverViaLit } from './track-cover-service'

const SESSION_KEY = 'local'
const TICK_INTERVAL_MS = 15_000

export interface ScrobbleService {
  start(): void
  stop(): void
  onTrackStart(meta: TrackMetadata): void
  onPlaybackChange(isPlaying: boolean): void
  tick(): void
}

export function createScrobbleService(
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpInfo: () => PKPInfo | null,
): ScrobbleService {
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const engine = new ScrobbleEngine((scrobble) => {
    console.log('[Scrobble] Ready:', scrobble.artist, '-', scrobble.title)
    // Fire after a brief delay to avoid competing with audio/UI in WebKitGTK
    setTimeout(() => {
      submitScrobble(scrobble, getAuthContext, getPkpInfo)
        .catch((err) => {
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

// ── AA (Account Abstraction) submit ─────────────────────────────────

async function submitScrobble(
  scrobble: ReadyScrobble,
  getAuthContext: () => Promise<PKPAuthContext>,
  getPkpInfo: () => PKPInfo | null,
): Promise<void> {
  const pkpInfo = getPkpInfo()
  if (!pkpInfo) {
    console.warn('[Scrobble] Not authenticated — skipping submit')
    return
  }

  // Convert ReadyScrobble → ScrobbleTrack for AA client
  const track: ScrobbleTrack = {
    artist: scrobble.artist,
    title: scrobble.title,
    album: scrobble.album,
    mbid: scrobble.mbid,
    ipId: scrobble.ipId,
    playedAtSec: scrobble.playedAtSec,
    duration: scrobble.trackMeta?.duration ?? 0,
  }

  console.log('[Scrobble] Submitting via AA (ScrobbleV4)...')

  const authContext = await getAuthContext()

  const result = await submitScrobbleViaAA(
    [track],
    pkpInfo.ethAddress,
    pkpInfo,
    authContext,
  )

  console.log(`[Scrobble] On-chain! userOpHash: ${result.userOpHash} sender: ${result.sender}`)

  // Best-effort: set track cover (operator-only) via Lit Action
  submitTrackCoverViaLit(scrobble, pkpInfo, authContext)
    .catch((err) => {
      console.warn('[Cover] Submit failed:', err)
    })

  // Invalidate scrobbles query so profile page shows the scrobble
  try {
    const { queryClient } = await import('../main')
    queryClient.invalidateQueries({ queryKey: ['scrobbles'] })
  } catch {
    // Not fatal — user can refresh manually
  }
}
