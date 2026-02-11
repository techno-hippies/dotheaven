/**
 * P2P Voice Call API
 *
 * Handles peer-to-peer voice calls for scheduled sessions.
 * Uses booking ID as the Agora channel name so both parties join the same room.
 *
 * REQUIRED: Voice Worker needs these endpoints added:
 *
 * POST /session/join
 * - Auth: Bearer token (same as existing /agent/start auth)
 * - Body: { booking_id: string }
 * - Response: { channel: string, agora_token: string, user_uid: number }
 *
 * POST /session/:bookingId/leave
 * - Auth: Bearer token
 * - Response: { ok: true, duration_ms: number }
 *
 * The worker should:
 * 1. Validate booking exists and is in 'booked' status (query MegaETH RPC)
 * 2. Verify caller is host or guest of the booking
 * 3. Check session time is within join window (startTime - 5min to endTime)
 * 4. Generate Agora RTC token for channel = `heaven-6343-{bookingId}`
 * 5. Use deterministic UID based on caller address (e.g. last 4 bytes as uint32)
 * 6. Track participation for oracle attestation
 */

import { clearWorkerAuthCache, getWorkerToken } from '../worker-auth'
import { getBookingChannel } from '../heaven/escrow'

export interface PKPInfo {
  tokenId: string
  publicKey: string
  ethAddress: string
}

const IS_DEV = import.meta.env.DEV

// Session voice service URL
const SESSION_VOICE_URL = import.meta.env.VITE_SESSION_VOICE_URL || 'https://session-voice.deletion-backup782.workers.dev'

// Agora App ID - must match worker config
export const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || 'df4fd87bd1bf4dc9891dbb8626b5b1c5'

// =============================================================================
// Types
// =============================================================================

export interface JoinSessionResult {
  ok: true
  channel: string         // heaven-6343-{bookingId}
  agoraToken: string
  userUid: number
}

export interface JoinSessionError {
  ok: false
  error: string
}

export type JoinSessionResponse = JoinSessionResult | JoinSessionError

export interface LeaveSessionResult {
  ok: boolean
  durationMs?: number
  error?: string
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Join a P2P session call
 *
 * @param bookingId - The on-chain booking ID (used as channel name)
 * @param pkpInfo - PKP wallet info
 * @param signMessage - Sign message function from auth context
 */
export async function joinSession(
  bookingId: string,
  pkpInfo: PKPInfo,
  signMessage: (message: string) => Promise<string>
): Promise<JoinSessionResponse> {
  try {
    const token = await getWorkerToken({
      workerUrl: SESSION_VOICE_URL,
      wallet: pkpInfo.ethAddress,
      signMessage,
      logPrefix: 'P2PVoice',
    })

    if (IS_DEV) console.log('[P2PVoice] Joining session:', bookingId)

    const res = await fetch(`${SESSION_VOICE_URL}/session/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        booking_id: bookingId,
      }),
    })

    const data = (await res.json()) as {
      channel?: string
      agora_token?: string
      user_uid?: number
      error?: string
    }

    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` }
    }

    if (!data.channel || !data.agora_token || !data.user_uid) {
      return { ok: false, error: 'Invalid response from worker' }
    }

    if (IS_DEV) {
      console.log('[P2PVoice] Joined session:', {
        channel: data.channel,
        uid: data.user_uid,
      })
    }

    return {
      ok: true,
      channel: data.channel,
      agoraToken: data.agora_token,
      userUid: data.user_uid,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[P2PVoice] Failed to join session:', error)
    return { ok: false, error: message }
  }
}

/**
 * Leave a P2P session call
 *
 * @param bookingId - The booking ID
 * @param pkpInfo - PKP wallet info
 * @param signMessage - Sign message function
 */
export async function leaveSession(
  bookingId: string,
  pkpInfo: PKPInfo,
  signMessage: (message: string) => Promise<string>
): Promise<LeaveSessionResult> {
  try {
    const token = await getWorkerToken({
      workerUrl: SESSION_VOICE_URL,
      wallet: pkpInfo.ethAddress,
      signMessage,
      logPrefix: 'P2PVoice',
    })

    if (IS_DEV) console.log('[P2PVoice] Leaving session:', bookingId)

    const res = await fetch(`${SESSION_VOICE_URL}/session/${bookingId}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    const data = (await res.json()) as {
      ok?: boolean
      duration_ms?: number
      error?: string
    }

    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` }
    }

    if (IS_DEV) console.log(`[P2PVoice] Left session, duration: ${data.duration_ms}ms`)

    return { ok: true, durationMs: data.duration_ms }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[P2PVoice] Failed to leave session:', error)
    return { ok: false, error: message }
  }
}

/**
 * Clear cached auth token (call on logout)
 */
export function clearP2PAuthCache(): void {
  clearWorkerAuthCache()
}

// =============================================================================
// Local Testing Mode (when worker endpoint not available)
// =============================================================================

/**
 * Generate a local-only session for testing (NO REAL TOKEN)
 * Only for development when worker endpoints aren't deployed yet
 */
export function joinSessionLocal(
  bookingId: string,
  userAddress: string
): JoinSessionResult {
  const channel = getBookingChannel(parseInt(bookingId, 10))
  // Generate deterministic UID from address (last 4 bytes as uint32)
  const uid = parseInt(userAddress.slice(-8), 16) % 0xFFFFFFFF

  console.warn('[P2PVoice] Using LOCAL mode - no real Agora token!')
  console.warn('[P2PVoice] Both users must be on same network with local testing')

  return {
    ok: true,
    channel,
    agoraToken: '', // Empty token works for local testing without token auth
    userUid: uid,
  }
}
