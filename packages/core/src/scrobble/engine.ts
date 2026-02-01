/**
 * ScrobbleEngine — TypeScript port of the Kotlin state machine.
 *
 * Tracks play time per session without relying on media position (handles seek correctly).
 * Threshold: min(duration × 50%, 240s). Minimum track duration for scrobble: 30s.
 *
 * Usage:
 *   const engine = new ScrobbleEngine((scrobble) => pendingQueue.push(scrobble))
 *   engine.onMetadata('local', { artist: 'X', title: 'Y', album: 'Z', durationMs: 200000 })
 *   engine.onPlayback('local', true)
 *   // call engine.tick() every 10-30 seconds
 *   engine.onPlayback('local', false) // pause → may emit scrobble
 */

export interface ReadyScrobble {
  artist: string
  title: string
  album: string | null
  durationMs: number | null
  playedAtSec: number
  source: string
  /** Optional Story Protocol IP Asset ID (for Heaven-published songs) */
  ipId: string | null
  /** Optional MusicBrainz Recording ID from ID3 tags */
  mbid: string | null
  /** Optional IPFS CID for album cover art */
  coverCid: string | null
}

export interface TrackMetadata {
  artist: string
  title: string
  album?: string | null
  durationMs?: number | null
  /** Story Protocol ipId if known */
  ipId?: string | null
  /** MusicBrainz Recording ID if available */
  mbid?: string | null
  /** IPFS CID for album cover art (if already uploaded) */
  coverCid?: string | null
  /** Local file path for the track (Tauri only) */
  filePath?: string | null
  /** Local cover image path (Tauri only) */
  coverPath?: string | null
}

// Scrobble thresholds (TEST: low for quick iteration — revert for production)
// Production: MAX=240_000, MIN=30_000, divisor=2
const MAX_SCROBBLE_THRESHOLD_MS = 10_000   // 10s
const MIN_DURATION_FOR_SCROBBLE_MS = 3_000 // 3s

interface SessionState {
  sessionKey: string
  trackKey: string | null
  artist: string | null
  title: string | null
  album: string | null
  durationMs: number | null
  ipId: string | null
  mbid: string | null
  coverCid: string | null
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
    mbid: null,
    coverCid: null,
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
    return Math.min(durationMs / 100, MAX_SCROBBLE_THRESHOLD_MS) // TEST: 1% — revert to /2
  }
  // Unknown duration → require 4 minutes
  return MAX_SCROBBLE_THRESHOLD_MS
}

function nowMs(): number {
  return performance.now()
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

  /**
   * Called when metadata changes for a session (e.g. track changed).
   */
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

    // Track changed → finalize previous
    if (newTrackKey !== state.trackKey && state.trackKey != null) {
      this.finalizeTrack(state)
    }

    state.trackKey = newTrackKey
    state.artist = metadata.artist
    state.title = metadata.title
    state.album = metadata.album ?? null
    state.durationMs = metadata.durationMs ?? null
    state.ipId = metadata.ipId ?? null
    state.mbid = metadata.mbid ?? null
    state.coverCid = metadata.coverCid ?? null

    // If playing and no start time, mark start
    if (newTrackKey != null && state.isPlaying && state.startedAtEpochSec == null) {
      state.startedAtEpochSec = nowEpochSec()
      state.lastUpdateTimeMs = nowMs()
    }
  }

  /**
   * Called when playback state changes.
   */
  onPlayback(sessionKey: string, isPlaying: boolean): void {
    let state = this.sessions.get(sessionKey)
    if (!state) {
      state = createSession(sessionKey)
      this.sessions.set(sessionKey, state)
    }

    const wasPlaying = state.isPlaying

    if (wasPlaying && !isPlaying) {
      // Paused/stopped → accumulate
      this.accumulatePlayTime(state)
      state.isPlaying = false
    } else if (!wasPlaying && isPlaying) {
      // Started playing
      state.isPlaying = true
      state.lastUpdateTimeMs = nowMs()

      if (state.startedAtEpochSec == null && state.trackKey != null) {
        state.startedAtEpochSec = nowEpochSec()
      }
    }
  }

  /**
   * Called when a session is destroyed.
   */
  onSessionGone(sessionKey: string): void {
    const state = this.sessions.get(sessionKey)
    if (!state) return
    this.sessions.delete(sessionKey)
    this.finalizeTrack(state)
  }

  /**
   * Call periodically (every 10-30s) to check if playing tracks have met threshold.
   */
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
          mbid: state.mbid,
          coverCid: state.coverCid,
        })
      }
    }
  }

  /**
   * Get number of active sessions (for debugging).
   */
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

    const { artist, title, album, durationMs, startedAtEpochSec, accumulatedPlayMs, alreadyScrobbled, ipId, mbid, coverCid } = state

    // Reset for next track
    state.trackKey = null
    state.artist = null
    state.title = null
    state.album = null
    state.durationMs = null
    state.ipId = null
    state.mbid = null
    state.coverCid = null
    state.startedAtEpochSec = null
    state.accumulatedPlayMs = 0
    state.lastUpdateTimeMs = 0
    state.alreadyScrobbled = false

    // Already scrobbled via tick → no double-scrobble
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
        mbid,
        coverCid,
      })
    }
  }
}
