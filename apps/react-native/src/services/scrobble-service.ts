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

type EnsureAuth = (options?: { forceRefresh?: boolean }) => Promise<void>

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return String(error)
}

function isStaleAuthSessionError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes("can't get auth context") ||
    message.includes('no auth context') ||
    message.includes('invalid blockhash') ||
    message.includes('session key signing') ||
    message.includes('session expired') ||
    message.includes('invalidauthsig') ||
    message.includes('auth_sig passed is invalid')
  )
}

type CreateAuthContext = (options?: { forceRefresh?: boolean }) => Promise<any>

export function createScrobbleService(
  ensureAuth: EnsureAuth,
  getEthAddress: () => string | null,
  getPkpPublicKey: () => string | null,
  getBridge: () => LitBridge | null,
  getAuthContext?: CreateAuthContext,
): ScrobbleService {
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const engine = new ScrobbleEngine((scrobble) => {
    console.log('[Scrobble] Ready:', scrobble.artist, '-', scrobble.title)
    // Fire after a brief delay to avoid competing with audio UI
    setTimeout(() => {
      submitScrobble(scrobble, ensureAuth, getEthAddress, getPkpPublicKey, getBridge, getAuthContext)
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
  ensureAuth: EnsureAuth,
  getEthAddress: () => string | null,
  getPkpPublicKey: () => string | null,
  getBridge: () => LitBridge | null,
  getAuthContext?: CreateAuthContext,
): Promise<void> {
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

  await ensureAuth()

  let ethAddress = getEthAddress()
  let pkpPublicKey = getPkpPublicKey()
  let bridge = getBridge()

  if (!ethAddress || !pkpPublicKey || !bridge) {
    console.warn('[Scrobble] Not authenticated — skipping submit')
    return
  }

  // Ensure auth context is set in WebView (don't need to pass it explicitly)
  if (getAuthContext) {
    try {
      await getAuthContext()
    } catch (err) {
      console.warn('[Scrobble] Failed to ensure auth context:', err)
    }
  }

  try {
    const result = await submitScrobbleViaAA(
      [track],
      ethAddress as Address,
      pkpPublicKey,
      bridge,
    )
    console.log(`[Scrobble] On-chain! userOpHash: ${result.userOpHash} sender: ${result.sender}`)
    return
  } catch (error) {
    if (!isStaleAuthSessionError(error)) {
      throw error
    }

    console.warn('[Scrobble] Auth session stale, refreshing and retrying once...')
    await ensureAuth({ forceRefresh: true })

    ethAddress = getEthAddress()
    pkpPublicKey = getPkpPublicKey()
    bridge = getBridge()
    if (!ethAddress || !pkpPublicKey || !bridge) {
      throw new Error('Unable to refresh auth session for scrobble submit')
    }

    const result = await submitScrobbleViaAA(
      [track],
      ethAddress as Address,
      pkpPublicKey,
      bridge,
    )
    console.log(`[Scrobble] On-chain! userOpHash: ${result.userOpHash} sender: ${result.sender}`)
  }
}
