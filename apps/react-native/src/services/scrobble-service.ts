/**
 * ScrobbleService — wires ScrobbleEngine to AA client (ScrobbleV4).
 *
 * React Native port of apps/frontend/src/lib/scrobble-service.ts.
 * Each scrobble submits a UserOp via the AA gateway immediately (no batching).
 */

import { ScrobbleEngine } from './scrobble-engine'
import type { TrackMetadata, ReadyScrobble } from './scrobble-engine'
import { submitScrobbleViaAA, type ScrobbleTrack } from '../lib/aa-client'
import type { LitBridge } from './LitBridge'
import type { Address } from 'viem'

const SESSION_KEY = 'local'
const TICK_INTERVAL_MS = 15_000

export type { TrackMetadata }

export interface ScrobbleService {
  start(): void
  stop(): void
  onTrackStart(meta: TrackMetadata): void
  onPlaybackChange(isPlaying: boolean): void
}

export function createScrobbleService(
  ensureAuth: () => Promise<void>,
  getEthAddress: () => string | null,
  getPkpPublicKey: () => string | null,
  getBridge: () => LitBridge | null,
): ScrobbleService {
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const engine = new ScrobbleEngine((scrobble) => {
    console.log('[Scrobble] Ready:', scrobble.artist, '-', scrobble.title)
    // Fire after a brief delay to avoid competing with audio UI
    setTimeout(() => {
      submitScrobble(scrobble, ensureAuth, getEthAddress, getPkpPublicKey, getBridge)
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
  }
}

async function submitScrobble(
  scrobble: ReadyScrobble,
  ensureAuth: () => Promise<void>,
  getEthAddress: () => string | null,
  getPkpPublicKey: () => string | null,
  getBridge: () => LitBridge | null,
): Promise<void> {
  const ethAddress = getEthAddress()
  const pkpPublicKey = getPkpPublicKey()
  const bridge = getBridge()

  if (!ethAddress || !pkpPublicKey || !bridge) {
    console.warn('[Scrobble] Not authenticated — skipping submit')
    return
  }

  const track: ScrobbleTrack = {
    artist: scrobble.artist,
    title: scrobble.title,
    album: scrobble.album,
    mbid: scrobble.mbid,
    ipId: scrobble.ipId,
    playedAtSec: scrobble.playedAtSec,
    duration: scrobble.durationMs ? Math.round(scrobble.durationMs / 1000) : 0,
  }

  console.log('[Scrobble] Submitting via AA (ScrobbleV4)...')

  // Ensure auth context is created before signing
  await ensureAuth()

  const result = await submitScrobbleViaAA(
    [track],
    ethAddress as Address,
    pkpPublicKey,
    bridge,
  )

  console.log(`[Scrobble] On-chain! userOpHash: ${result.userOpHash} sender: ${result.sender}`)
}
