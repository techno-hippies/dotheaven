/**
 * ScrobbleQueue — batches ReadyScrobble items and flushes them
 * to the submit callback when the batch is full or a timer fires.
 *
 * Persists pending scrobbles in IndexedDB so nothing is lost on page close.
 */

import type { ReadyScrobble } from './engine'
import { idb, settingsStore } from '../storage/idb'

const IDB_KEY = 'pending-scrobbles'
const MAX_BATCH_SIZE = 100
const FLUSH_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours (matches Android)

export type SubmitFn = (tracks: SubmitTrack[]) => Promise<{ cid: string; attestationUid: string | null }>

export interface SubmitTrack {
  artist: string
  title: string
  album: string | null
  duration_ms: number | null
  playedAt: number
  source: string | null
  ipId: string | null
  isrc: string | null
}

export class ScrobbleQueue {
  private pending: ReadyScrobble[] = []
  private submitFn: SubmitFn
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private flushing = false

  constructor(submitFn: SubmitFn) {
    this.submitFn = submitFn
  }

  /**
   * Start the queue — loads pending from IDB and starts flush timer.
   */
  async start(): Promise<void> {
    // Restore pending scrobbles from IDB
    const stored = await idb.get<ReadyScrobble[]>(IDB_KEY, settingsStore)
    if (stored && Array.isArray(stored)) {
      this.pending = stored
    }

    // Periodic flush
    this.flushTimer = setInterval(() => {
      this.flush()
    }, FLUSH_INTERVAL_MS)
  }

  /**
   * Stop the queue — persists pending to IDB and clears timer.
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    await this.persist()
  }

  /**
   * Add a scrobble to the queue.
   */
  async push(scrobble: ReadyScrobble): Promise<void> {
    this.pending.push(scrobble)
    await this.persist()

    // Auto-flush if batch is full
    if (this.pending.length >= MAX_BATCH_SIZE) {
      this.flush()
    }
  }

  /**
   * Flush pending scrobbles to the submit function.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0) return
    this.flushing = true

    try {
      // Take up to MAX_BATCH_SIZE
      const batch = this.pending.slice(0, MAX_BATCH_SIZE)
      const tracks: SubmitTrack[] = batch.map((s) => ({
        artist: s.artist,
        title: s.title,
        album: s.album,
        duration_ms: s.durationMs,
        playedAt: s.playedAtSec,
        source: s.source || null,
        ipId: s.ipId,
        isrc: s.isrc,
      }))

      await this.submitFn(tracks)

      // Remove submitted items
      this.pending = this.pending.slice(batch.length)
      await this.persist()
    } catch (err) {
      // Keep in queue for retry
      console.error('[ScrobbleQueue] Flush failed, will retry:', err)
    } finally {
      this.flushing = false
    }
  }

  /**
   * Number of pending scrobbles.
   */
  get size(): number {
    return this.pending.length
  }

  private async persist(): Promise<void> {
    try {
      await idb.set(IDB_KEY, this.pending, settingsStore)
    } catch (err) {
      console.error('[ScrobbleQueue] Failed to persist:', err)
    }
  }
}
