/**
 * ScrobbleQueue — batches ReadyScrobble items and flushes them.
 * Adapted for React Native: uses AsyncStorage instead of IndexedDB.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReadyScrobble } from './scrobble-engine';

const STORAGE_KEY = 'heaven:pending-scrobbles';
const MAX_BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

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

export type SubmitFn = (tracks: SubmitTrack[]) => Promise<void>;

export class ScrobbleQueue {
  private pending: ReadyScrobble[] = [];
  private submitFn: SubmitFn;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(submitFn: SubmitFn) {
    this.submitFn = submitFn;
  }

  async start(): Promise<void> {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) this.pending = parsed;
      } catch {}
    }
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.persist();
  }

  async push(scrobble: ReadyScrobble): Promise<void> {
    this.pending.push(scrobble);
    await this.persist();
    if (this.pending.length >= MAX_BATCH_SIZE) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0) return;
    this.flushing = true;

    try {
      const batch = this.pending.slice(0, MAX_BATCH_SIZE);
      const tracks: SubmitTrack[] = batch.map((s) => ({
        artist: s.artist,
        title: s.title,
        album: s.album,
        duration_ms: s.durationMs,
        playedAt: s.playedAtSec,
        source: s.source || null,
        ipId: s.ipId,
        isrc: s.isrc,
      }));

      await this.submitFn(tracks);
      this.pending = this.pending.slice(batch.length);
      await this.persist();
    } catch (err) {
      console.error('[ScrobbleQueue] Flush failed, will retry:', err);
    } finally {
      this.flushing = false;
    }
  }

  get size(): number {
    return this.pending.length;
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.pending));
    } catch (err) {
      console.error('[ScrobbleQueue] Failed to persist:', err);
    }
  }
}
