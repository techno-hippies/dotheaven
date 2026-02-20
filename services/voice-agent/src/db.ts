import type { Env } from "./env";

export async function getSessionBySecretHash(env: Env, secretHash: string) {
  return env.DB.prepare(
    "SELECT id,wallet,channel,agora_agent_id,context_blob,status FROM sessions WHERE llm_secret_hash=? AND status='active'"
  )
    .bind(secretHash)
    .first<{
      id: string;
      wallet: string;
      channel: string;
      agora_agent_id: string | null;
      context_blob: string | null;
      status: string;
    }>();
}

export async function storeSessionContext(env: Env, sessionId: string, contextBlob: string): Promise<void> {
  await env.DB.prepare("UPDATE sessions SET context_blob=? WHERE id=?").bind(contextBlob, sessionId).run();
}
