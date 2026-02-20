import type { Env } from "./env";
import { RtcTokenBuilder, RtcRole } from "agora-token";

/**
 * Agora Conversational AI REST API integration
 */

const AGORA_API_BASE = "https://api.agora.io/api/conversational-ai-agent/v2/projects";

function getBasicAuthHeader(env: Env): string {
  const credentials = env.AGORA_REST_AUTH || "";
  const encoded = btoa(credentials);
  return `Basic ${encoded}`;
}

function generateRtcToken(
  appId: string,
  appCert: string,
  channelName: string,
  uid: number,
  expireSeconds: number = 3600
): string {
  const currentTime = Math.floor(Date.now() / 1000);
  const privilegeExpireTime = currentTime + expireSeconds;

  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCert,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    privilegeExpireTime,
    privilegeExpireTime
  );
}

export interface AgoraStartArgs {
  channel: string;
  llmUrl: string;
  llmApiKey: string;
  userUid?: number;
  systemMessages?: Array<{ role: string; content: string }>;
}

export interface AgoraStartResult {
  agentId: string;
  rtcToken: string;
  agentUid: number;
  userUid: number;
}

/**
 * Start an Agora Conversational AI agent
 */
export async function agoraStartAgent(env: Env, args: AgoraStartArgs): Promise<AgoraStartResult> {
  const appId = env.AGORA_APP_ID;
  const appCert = env.AGORA_APP_CERT;

  if (!appId || !appCert) {
    throw new Error("AGORA_APP_ID and AGORA_APP_CERT required");
  }

  const agentUid = 0;
  const userUid = args.userUid || Math.floor(Math.random() * 10000) + 1000;

  const rtcToken = await generateRtcToken(appId, appCert, args.channel, agentUid);

  const requestBody = {
    name: `neo_agent_${Date.now()}`,
    properties: {
      channel: args.channel,
      token: rtcToken,
      agent_rtc_uid: String(agentUid),
      remote_rtc_uids: [String(userUid)],
      enable_string_uid: false,
      idle_timeout: 300,

      llm: {
        url: args.llmUrl,
        api_key: args.llmApiKey,
        system_messages: args.systemMessages || [
          {
            role: "system",
            content:
              "You are Scarlett, a warm and insightful AI lifecoach on Heaven.\n\nCRITICAL: Keep responses SHORT. This is voice conversation - 1-2 sentences max. Be conversational, not clinical.\n\nYour role:\n- Help users improve their dating profiles and approach\n- Give honest, constructive feedback on their photos and bio\n- Coach them on conversation skills and first date ideas\n- Be supportive but direct - users want real advice, not flattery\n- If their Recent Activity shows music, sleep, runs, or meals, weave it in naturally (e.g. \"I see you were up late\" or \"nice run today\")\n\nNever:\n- Use emojis or special characters (this is spoken aloud via TTS)\n- Give long explanations or lists\n- Be judgmental about their dating history\n- Make assumptions about gender or orientation\n\nYou have context about the user in the User Context section. Reference it naturally when relevant."
          }
        ],
        greeting_message: "Hey! I'm Scarlett, your dating coach. What's on your mind?",
        failure_message: "Hmm... Something went wrong.",
        max_history: 10
      },

      asr: {
        language: "en-US"
      },

      tts: {
        vendor: "elevenlabs",
        params: {
          base_url: "wss://api.elevenlabs.io/v1",
          key: env.ELEVENLABS_API_KEY || "",
          model_id: "eleven_flash_v2_5",
          voice_id: env.ELEVENLABS_VOICE_ID || "rf0RyZGEDtFGS4U6yghI",
          sample_rate: 24000
        }
      },

      vad: {
        silence_duration_ms: 800,
        speech_duration_ms: 10000,
        threshold: 0.5,
        interrupt_duration_ms: 600,
        prefix_padding_ms: 500
      }
    }
  };

  const url = `${AGORA_API_BASE}/${appId}/join`;

  console.log(`[Agora] Starting agent on channel: ${args.channel}, userUid: ${userUid}, agentUid: ${agentUid}`);
  console.log(`[Agora] TTS key present: ${!!env.ELEVENLABS_API_KEY}, length: ${env.ELEVENLABS_API_KEY?.length || 0}`);
  console.log(`[Agora] Full request:`, JSON.stringify(requestBody, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": getBasicAuthHeader(env),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json() as { agent_id?: string; status?: string; error?: string; message?: string };
  console.log(`[Agora] Response status: ${response.status}, body:`, JSON.stringify(data));

  if (!response.ok) {
    console.error("[Agora] Start failed:", data);
    throw new Error(data.message || data.error || `Agora API error: ${response.status}`);
  }

  if (!data.agent_id) {
    throw new Error("No agent_id in Agora response");
  }

  console.log(`[Agora] Agent started: ${data.agent_id}`);

  const userToken = await generateRtcToken(appId, appCert, args.channel, userUid);

  return {
    agentId: data.agent_id,
    rtcToken: userToken,
    agentUid,
    userUid
  };
}

/**
 * Stop an Agora Conversational AI agent
 */
export async function agoraStopAgent(env: Env, agentId: string): Promise<void> {
  const appId = env.AGORA_APP_ID;

  if (!appId) {
    throw new Error("AGORA_APP_ID required");
  }

  const url = `${AGORA_API_BASE}/${appId}/agents/${agentId}/leave`;

  console.log(`[Agora] Stopping agent: ${agentId}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": getBasicAuthHeader(env),
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string; error?: string };
    console.warn(`[Agora] Stop returned ${response.status}: ${data.message || data.error || "unknown"}`);
    return;
  }

  console.log(`[Agora] Agent stopped: ${agentId}`);
}
