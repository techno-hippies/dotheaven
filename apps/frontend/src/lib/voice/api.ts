/**
 * Voice Worker API Client
 *
 * Handles authentication and agent lifecycle for Agora CAI voice calls.
 */

import { clearWorkerAuthCache, getWorkerToken } from '../worker-auth'

// PKPInfo type definition
export interface PKPInfo {
  tokenId: string
  publicKey: string
  ethAddress: string
}

const IS_DEV = import.meta.env.DEV

// Worker base URL - production deployed worker
const VOICE_WORKER_URL = import.meta.env.VITE_VOICE_WORKER_URL || 'https://neodate-voice.deletion-backup782.workers.dev'

// Agora App ID - must match worker config
export const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || 'df4fd87bd1bf4dc9891dbb8626b5b1c5'

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

/**
 * Clear cached auth token (call on logout)
 */
export function clearVoiceAuthCache(): void {
  clearWorkerAuthCache()
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
    const token = await getWorkerToken({
      workerUrl: VOICE_WORKER_URL,
      wallet: pkpInfo.ethAddress,
      signMessage,
      logPrefix: 'VoiceAPI',
    })

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
    const token = await getWorkerToken({
      workerUrl: VOICE_WORKER_URL,
      wallet: pkpInfo.ethAddress,
      signMessage,
      logPrefix: 'VoiceAPI',
    })

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
