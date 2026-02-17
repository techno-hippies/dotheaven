/**
 * ScrobbleService — wires ScrobbleEngine to on-chain scrobble submission.
 *
 * NOTE: AA (ERC-4337) submission has been removed. Scrobble submission is
 * stubbed out until Tempo native transactions are wired (ScrobbleV5 + session keys).
 */

import { ScrobbleEngine } from '@heaven/core'
import type { TrackMetadata } from '@heaven/core'

const SESSION_KEY = 'local'
const TICK_INTERVAL_MS = 15_000

export interface ScrobbleService {
  start(): void
  stop(): void
  onTrackStart(meta: TrackMetadata): void
  onPlaybackChange(isPlaying: boolean): void
  tick(): void
}

export function createScrobbleService(): ScrobbleService {
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const engine = new ScrobbleEngine((scrobble) => {
    console.log('[Scrobble] Ready:', scrobble.artist, '-', scrobble.title)
    // TODO: Wire Tempo native transaction submission (ScrobbleV5 + session keys)
    console.warn('[Scrobble] Submission disabled — awaiting Tempo integration')
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
