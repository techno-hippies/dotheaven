/**
 * ScrobbleEngine — adapted from packages/core/src/scrobble/engine.ts for React Native.
 * Uses Date.now() instead of performance.now().
 */

export interface ReadyScrobble {
  artist: string
  title: string
  album: string | null
  durationMs: number | null
  playedAtSec: number
  source: string
  ipId: string | null
  isrc: string | null
}

export interface TrackMetadata {
  artist: string
  title: string
  album?: string | null
  durationMs?: number | null
  ipId?: string | null
  isrc?: string | null
}

const MAX_SCROBBLE_THRESHOLD_MS = 240_000
const MIN_DURATION_FOR_SCROBBLE_MS = 30_000

interface SessionState {
  sessionKey: string
  trackKey: string | null
  artist: string | null
  title: string | null
  album: string | null
  durationMs: number | null
  ipId: string | null
  isrc: string | null
  startedAtEpochSec: number | null
  accumulatedPlayMs: number
  lastUpdateTimeMs: number
  isPlaying: boolean
  alreadyScrobbled: boolean
}

function createSession(sessionKey: string): SessionState {
  return {
    sessionKey,
    trackKey: null,
    artist: null,
    title: null,
    album: null,
    durationMs: null,
    ipId: null,
    isrc: null,
    startedAtEpochSec: null,
    accumulatedPlayMs: 0,
    lastUpdateTimeMs: 0,
    isPlaying: false,
    alreadyScrobbled: false,
  }
}

function buildTrackKey(
  source: string,
  artist: string | null,
  title: string | null,
  album: string | null,
  durationMs: number | null,
): string | null {
  if (!artist || !title) return null
  return `${source}|${artist}|${title}|${album ?? ''}|${durationMs ?? 0}`
}

function computeThreshold(durationMs: number | null): number {
  if (durationMs != null && durationMs >= MIN_DURATION_FOR_SCROBBLE_MS) {
    return Math.min(durationMs / 2, MAX_SCROBBLE_THRESHOLD_MS)
  }
  return MAX_SCROBBLE_THRESHOLD_MS
}

function nowMs(): number {
  return Date.now()
}

function nowEpochSec(): number {
  return Math.floor(Date.now() / 1000)
}

export class ScrobbleEngine {
  private sessions = new Map<string, SessionState>()
  private onScrobbleReady: (scrobble: ReadyScrobble) => void

  constructor(onScrobbleReady: (scrobble: ReadyScrobble) => void) {
    this.onScrobbleReady = onScrobbleReady
  }

  onMetadata(sessionKey: string, metadata: TrackMetadata): void {
    let state = this.sessions.get(sessionKey)
    if (!state) {
      state = createSession(sessionKey)
      this.sessions.set(sessionKey, state)
    }

    const newTrackKey = buildTrackKey(
      sessionKey,
      metadata.artist,
      metadata.title,
      metadata.album ?? null,
      metadata.durationMs ?? null,
    )

    if (newTrackKey !== state.trackKey && state.trackKey != null) {
      this.finalizeTrack(state)
    }

    state.trackKey = newTrackKey
    state.artist = metadata.artist
    state.title = metadata.title
    state.album = metadata.album ?? null
    state.durationMs = metadata.durationMs ?? null
    state.ipId = metadata.ipId ?? null
    state.isrc = metadata.isrc ?? null

    if (newTrackKey != null && state.isPlaying && state.startedAtEpochSec == null) {
      state.startedAtEpochSec = nowEpochSec()
      state.lastUpdateTimeMs = nowMs()
    }
  }

  onPlayback(sessionKey: string, isPlaying: boolean): void {
    let state = this.sessions.get(sessionKey)
    if (!state) {
      state = createSession(sessionKey)
      this.sessions.set(sessionKey, state)
    }

    const wasPlaying = state.isPlaying

    if (wasPlaying && !isPlaying) {
      this.accumulatePlayTime(state)
      state.isPlaying = false
    } else if (!wasPlaying && isPlaying) {
      state.isPlaying = true
      state.lastUpdateTimeMs = nowMs()

      if (state.startedAtEpochSec == null && state.trackKey != null) {
        state.startedAtEpochSec = nowEpochSec()
      }
    }
  }

  onSessionGone(sessionKey: string): void {
    const state = this.sessions.get(sessionKey)
    if (!state) return
    this.sessions.delete(sessionKey)
    this.finalizeTrack(state)
  }

  tick(): void {
    for (const state of this.sessions.values()) {
      if (!state.isPlaying || state.alreadyScrobbled) continue

      this.accumulatePlayTime(state)

      if (!state.artist || !state.title || state.startedAtEpochSec == null) continue

      const threshold = computeThreshold(state.durationMs)
      if (state.accumulatedPlayMs >= threshold) {
        state.alreadyScrobbled = true
        this.onScrobbleReady({
          artist: state.artist,
          title: state.title,
          album: state.album,
          durationMs: state.durationMs,
          playedAtSec: state.startedAtEpochSec,
          source: state.sessionKey,
          ipId: state.ipId,
          isrc: state.isrc,
        })
      }
    }
  }

  get sessionCount(): number {
    return this.sessions.size
  }

  private accumulatePlayTime(state: SessionState): void {
    if (!state.isPlaying) return
    const now = nowMs()
    const elapsed = now - state.lastUpdateTimeMs
    if (elapsed > 0) {
      state.accumulatedPlayMs += elapsed
      state.lastUpdateTimeMs = now
    }
  }

  private finalizeTrack(state: SessionState): void {
    if (state.isPlaying) {
      this.accumulatePlayTime(state)
    }

    const { artist, title, album, durationMs, startedAtEpochSec, accumulatedPlayMs, alreadyScrobbled, ipId, isrc } = state

    state.trackKey = null
    state.artist = null
    state.title = null
    state.album = null
    state.durationMs = null
    state.ipId = null
    state.isrc = null
    state.startedAtEpochSec = null
    state.accumulatedPlayMs = 0
    state.lastUpdateTimeMs = 0
    state.alreadyScrobbled = false

    if (alreadyScrobbled) return
    if (!artist || !title || startedAtEpochSec == null) return

    const threshold = computeThreshold(durationMs)
    if (accumulatedPlayMs >= threshold) {
      this.onScrobbleReady({
        artist,
        title,
        album,
        durationMs,
        playedAtSec: startedAtEpochSec,
        source: state.sessionKey,
        ipId,
        isrc,
      })
    }
  }
}
