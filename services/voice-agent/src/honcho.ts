/**
 * Honcho Client for Voice Worker
 *
 * Cross-session memory for AI conversations.
 * Uses PSEUDONYM_SECRET for HMAC-based wallet pseudonymization.
 */

import type { Env } from "./env";

const HONCHO_BASE_URL = "https://api.honcho.dev";
const WORKSPACE_ID = "HEAVEN1";

/**
 * Pseudonymize wallet address using HMAC-SHA256
 */
export async function pseudonymize(env: Env, wallet: string): Promise<string> {
  const secret = env.PSEUDONYM_SECRET;
  if (!secret) {
    throw new Error("PSEUDONYM_SECRET not set");
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(wallet.toLowerCase());

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  const bytes = new Uint8Array(signature);

  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return base64.slice(0, 22);
}

/**
 * Make authenticated request to Honcho API
 */
async function honchoFetch(
  env: Env,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiKey = env.HONCHO_API_KEY;
  if (!apiKey) {
    throw new Error("HONCHO_API_KEY not set");
  }

  return fetch(`${HONCHO_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });
}

/**
 * Ensure peer exists in Honcho
 */
async function ensurePeer(env: Env, peerId: string): Promise<void> {
  const res = await honchoFetch(env, `/v2/workspaces/${WORKSPACE_ID}/peers`, {
    method: "POST",
    body: JSON.stringify({ id: peerId }),
  });

  if (!res.ok && res.status !== 409) {
    console.warn(`[Honcho] Failed to create peer: ${res.status}`);
  }
}

/**
 * Query peer representation (extracted facts)
 */
export async function queryRepresentation(
  env: Env,
  peerId: string,
  query: string
): Promise<string | null> {
  if (!env.HONCHO_API_KEY) {
    return null;
  }

  try {
    await ensurePeer(env, peerId);

    const res = await honchoFetch(
      env,
      `/v2/workspaces/${WORKSPACE_ID}/peers/${peerId}/chat`,
      {
        method: "POST",
        body: JSON.stringify({ query }),
      }
    );

    if (!res.ok) {
      console.warn(`[Honcho] Failed to query representation: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { content?: string };
    return data.content || null;
  } catch (error) {
    console.warn("[Honcho] Query failed:", error);
    return null;
  }
}

/**
 * Get or create a session
 */
async function getOrCreateSession(env: Env, sessionId: string): Promise<string> {
  const sanitized = `voice_${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  const res = await honchoFetch(env, `/v2/workspaces/${WORKSPACE_ID}/sessions`, {
    method: "POST",
    body: JSON.stringify({ id: sanitized }),
  });

  if (res.ok) {
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  if (res.status === 409) {
    return sanitized;
  }

  throw new Error(`Failed to get/create session: ${res.status}`);
}

/**
 * Ensure peer is added to session
 */
async function addPeerToSession(
  env: Env,
  sessionId: string,
  peerId: string,
  isAgent: boolean
): Promise<void> {
  const res = await honchoFetch(
    env,
    `/v2/workspaces/${WORKSPACE_ID}/sessions/${sessionId}/peers`,
    {
      method: "POST",
      body: JSON.stringify({
        peers: {
          [peerId]: { observeMe: !isAgent },
        },
      }),
    }
  );

  if (!res.ok && res.status !== 409) {
    console.warn(`[Honcho] Failed to add peer to session: ${res.status}`);
  }
}

/**
 * Add a message to a session
 */
export async function addMessage(
  env: Env,
  sessionId: string,
  peerId: string,
  content: string,
  isUser: boolean
): Promise<void> {
  if (!env.HONCHO_API_KEY) return;

  try {
    const res = await honchoFetch(
      env,
      `/v2/workspaces/${WORKSPACE_ID}/sessions/${sessionId}/messages/`,
      {
        method: "POST",
        body: JSON.stringify({
          messages: [{ content, peer_id: peerId, is_user: isUser }],
        }),
      }
    );

    if (!res.ok) {
      console.warn(`[Honcho] Failed to add message: ${res.status}`);
    }
  } catch (error) {
    console.warn("[Honcho] addMessage failed:", error);
  }
}

const AGENT_PEER_ID = "agent_scarlett";

/**
 * Initialize Honcho session for a voice call
 */
export async function initVoiceSession(
  env: Env,
  wallet: string,
  voiceSessionId: string
): Promise<{
  honchoSessionId: string;
  userPeerId: string;
  agentPeerId: string;
} | null> {
  if (!env.HONCHO_API_KEY) {
    return null;
  }

  try {
    const userPeerId = await pseudonymize(env, wallet);
    const honchoSessionId = await getOrCreateSession(env, voiceSessionId);

    await ensurePeer(env, userPeerId);
    await ensurePeer(env, AGENT_PEER_ID);
    await addPeerToSession(env, honchoSessionId, userPeerId, false);
    await addPeerToSession(env, honchoSessionId, AGENT_PEER_ID, true);

    return {
      honchoSessionId,
      userPeerId,
      agentPeerId: AGENT_PEER_ID,
    };
  } catch (error) {
    console.warn("[Honcho] initVoiceSession failed:", error);
    return null;
  }
}

/**
 * Get user memory for context
 */
export async function getUserMemory(env: Env, wallet: string): Promise<string | null> {
  if (!env.HONCHO_API_KEY) {
    return null;
  }

  try {
    const peerId = await pseudonymize(env, wallet);
    const memory = await queryRepresentation(
      env,
      peerId,
      "What do you know about this person? Include their dating preferences, relationship goals, past conversations, and any personal context they've shared."
    );
    return memory;
  } catch (error) {
    console.warn("[Honcho] getUserMemory failed:", error);
    return null;
  }
}
