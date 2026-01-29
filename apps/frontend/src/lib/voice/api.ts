/**
 * Voice Worker API Client
 *
 * Handles authentication and agent lifecycle for Agora CAI voice calls.
 */

// PKPInfo type definition
export interface PKPInfo {
  tokenId: string
  publicKey: string
  ethAddress: string
}

const IS_DEV = import.meta.env.DEV

// Worker base URL - production deployed worker
const VOICE_WORKER_URL = import.meta.env.VITE_VOICE_WORKER_URL || 'https://neodate-voice.deletion-backup782.workers.dev'

if (IS_DEV) {
  console.log('[VoiceAPI] Worker URL:', VOICE_WORKER_URL)
}

// Agora App ID - must match worker config
export const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || '3260ad15ace147c88a8bf32da798a114'

// =============================================================================
// Types
// =============================================================================

export interface StartAgentResult {
  ok: true
  sessionId: string
  channel: string
  agoraToken: string
  agoraAgentId: string
  userUid: number
}

export interface StartAgentError {
  ok: false
  error: string
}

export type StartAgentResponse = StartAgentResult | StartAgentError

export interface StopAgentResult {
  ok: boolean
  durationMs?: number
  error?: string
}

// =============================================================================
// Auth Token Management
// =============================================================================

interface CachedToken {
  token: string
  wallet: string
  expiresAt: number
}

let cachedToken: CachedToken | null = null

/**
 * Get or refresh JWT token for worker API calls
 */
async function getWorkerToken(
  pkpInfo: PKPInfo,
  signMessage: (message: string) => Promise<string>
): Promise<string> {
  const wallet = pkpInfo.ethAddress.toLowerCase()
  const now = Date.now()

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.wallet === wallet && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token
  }

  if (IS_DEV) console.log('[VoiceAPI] Authenticating with worker...')

  // Step 1: Get nonce
  const nonceRes = await fetch(`${VOICE_WORKER_URL}/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })

  if (!nonceRes.ok) {
    const err = (await nonceRes.json().catch(() => ({}))) as { error?: string }
    throw new Error(`Failed to get nonce: ${err.error || nonceRes.statusText}`)
  }

  const { nonce } = (await nonceRes.json()) as { nonce: string }

  // Step 2: Sign nonce with PKP
  const signature = await signMessage(nonce)

  // Step 3: Verify signature and get JWT
  const verifyRes = await fetch(`${VOICE_WORKER_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature, nonce }),
  })

  if (!verifyRes.ok) {
    const err = (await verifyRes.json().catch(() => ({}))) as { error?: string }
    throw new Error(`Auth verification failed: ${err.error || verifyRes.statusText}`)
  }

  const { token } = (await verifyRes.json()) as { token: string }

  // Cache token (JWT typically valid for 1 hour)
  cachedToken = {
    token,
    wallet,
    expiresAt: now + 55 * 60 * 1000, // 55 minutes
  }

  if (IS_DEV) console.log('[VoiceAPI] Authenticated successfully')

  return token
}

/**
 * Clear cached auth token (call on logout)
 */
export function clearVoiceAuthCache(): void {
  cachedToken = null
}

// =============================================================================
// Agent Lifecycle
// =============================================================================

/**
 * Start an Agora CAI agent for voice conversation
 */
export async function startAgent(
  pkpInfo: PKPInfo,
  signMessage: (message: string) => Promise<string>
): Promise<StartAgentResponse> {
  try {
    const token = await getWorkerToken(pkpInfo, signMessage)

    if (IS_DEV) console.log('[VoiceAPI] Starting agent...')

    const res = await fetch(`${VOICE_WORKER_URL}/agent/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    })

    const data = (await res.json()) as {
      session_id?: string
      channel?: string
      agora_token?: string
      agora_agent_id?: string
      user_uid?: number
      error?: string
    }

    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` }
    }

    if (!data.session_id || !data.channel || !data.agora_token || !data.user_uid) {
      return { ok: false, error: 'Invalid response from worker' }
    }

    if (IS_DEV) {
      console.log('[VoiceAPI] Agent started:', {
        sessionId: data.session_id,
        channel: data.channel,
        agentId: data.agora_agent_id,
      })
    }

    return {
      ok: true,
      sessionId: data.session_id,
      channel: data.channel,
      agoraToken: data.agora_token,
      agoraAgentId: data.agora_agent_id || '',
      userUid: data.user_uid,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[VoiceAPI] Failed to start agent:', error)
    return { ok: false, error: message }
  }
}

/**
 * Stop an Agora CAI agent
 */
export async function stopAgent(
  pkpInfo: PKPInfo,
  signMessage: (message: string) => Promise<string>,
  sessionId: string
): Promise<StopAgentResult> {
  try {
    const token = await getWorkerToken(pkpInfo, signMessage)

    if (IS_DEV) console.log(`[VoiceAPI] Stopping agent: ${sessionId}`)

    const res = await fetch(`${VOICE_WORKER_URL}/agent/${sessionId}/stop`, {
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

    if (IS_DEV) console.log(`[VoiceAPI] Agent stopped, duration: ${data.duration_ms}ms`)

    return { ok: true, durationMs: data.duration_ms }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[VoiceAPI] Failed to stop agent:', error)
    return { ok: false, error: message }
  }
}
