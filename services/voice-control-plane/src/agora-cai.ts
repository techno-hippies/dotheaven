/**
 * Agora Conversational AI Agent — start/stop
 *
 * Ported from heaven/workers/voice/src/agora.ts.
 * Used by RoomDO to spawn an AI agent into a room when ai_enabled=true.
 */

import type { Env } from './types'
import { generateToken } from './agora'

const AGORA_CAI_BASE = 'https://api.agora.io/api/conversational-ai-agent/v2/projects'

function getBasicAuthHeader(env: Env): string {
  const credentials = env.AGORA_REST_AUTH || ''
  return `Basic ${btoa(credentials)}`
}

export interface CaiStartResult {
  agentId: string
  agentUid: number
}

/**
 * Start an Agora Conversational AI agent in the given channel.
 * The agent joins as UID 0, listens to all remote UIDs, and speaks via ElevenLabs TTS.
 */
export async function startCaiAgent(env: Env, channel: string): Promise<CaiStartResult> {
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
    throw new Error('AGORA_APP_ID and AGORA_APP_CERTIFICATE required')
  }
  if (!env.AGORA_REST_AUTH) {
    throw new Error('AGORA_REST_AUTH required for CAI agent')
  }

  const agentUid = 0
  const agentToken = generateToken(env.AGORA_APP_ID, env.AGORA_APP_CERTIFICATE, channel, agentUid, 3600)

  const llmUrl = env.LLM_BASE_URL || 'https://openrouter.ai/api/v1'

  const requestBody = {
    name: `heaven_room_${Date.now()}`,
    properties: {
      channel,
      token: agentToken.token,
      agent_rtc_uid: String(agentUid),
      remote_rtc_uids: ['*'],
      enable_string_uid: false,
      idle_timeout: 300,

      llm: {
        url: `${llmUrl}/chat/completions`,
        api_key: env.LLM_API_KEY || '',
        system_messages: [
          {
            role: 'system',
            content:
              'You are Scarlett, a warm and fun AI host on Heaven voice rooms.\n\nCRITICAL: Keep responses SHORT. This is voice conversation — 1-2 sentences max. Be conversational, not clinical.\n\nYour role:\n- Welcome people to the room\n- Keep conversation flowing naturally\n- Be witty, warm, and encouraging\n- If the room is about music, comment on songs being played\n\nNever:\n- Give long explanations or lists\n- Be judgmental\n- Dominate the conversation — let humans talk',
          },
        ],
        greeting_message: "Hey! I'm Scarlett. Welcome to the room!",
        failure_message: 'Hmm... Something went wrong.',
        max_history: 10,
      },

      asr: { language: 'en-US' },

      tts: {
        vendor: 'elevenlabs',
        params: {
          base_url: 'wss://api.elevenlabs.io/v1',
          key: env.ELEVENLABS_API_KEY || '',
          model_id: 'eleven_flash_v2_5',
          voice_id: env.ELEVENLABS_VOICE_ID || 'rf0RyZGEDtFGS4U6yghI',
          sample_rate: 24000,
        },
      },

      vad: {
        silence_duration_ms: 800,
        speech_duration_ms: 10000,
        threshold: 0.5,
        interrupt_duration_ms: 200,
        prefix_padding_ms: 500,
      },
    },
  }

  const url = `${AGORA_CAI_BASE}/${env.AGORA_APP_ID}/join`
  console.log(`[CAI] Starting agent on channel: ${channel}`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(env),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  const data = (await response.json()) as { agent_id?: string; message?: string; error?: string }
  console.log(`[CAI] Response: ${response.status}`, JSON.stringify(data))

  if (!response.ok) {
    throw new Error(data.message || data.error || `Agora CAI error: ${response.status}`)
  }

  if (!data.agent_id) {
    throw new Error('No agent_id in Agora CAI response')
  }

  console.log(`[CAI] Agent started: ${data.agent_id}`)
  return { agentId: data.agent_id, agentUid }
}

/**
 * Stop an Agora Conversational AI agent. Best-effort — logs but doesn't throw on failure.
 */
export async function stopCaiAgent(env: Env, agentId: string): Promise<void> {
  if (!env.AGORA_APP_ID) return

  const url = `${AGORA_CAI_BASE}/${env.AGORA_APP_ID}/agents/${agentId}/leave`
  console.log(`[CAI] Stopping agent: ${agentId}`)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(env),
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string }
      console.warn(`[CAI] Stop returned ${response.status}: ${data.message || 'unknown'}`)
      return
    }

    console.log(`[CAI] Agent stopped: ${agentId}`)
  } catch (e) {
    console.warn(`[CAI] Stop failed for ${agentId}:`, e)
  }
}
