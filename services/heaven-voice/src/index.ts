import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { createNonce, issueJwt, normalizeWallet, verifyJwt, verifySignatureForNonce } from "./auth";
import { sha256Hex } from "./crypto";
import { getSessionBySecretHash, storeSessionContext } from "./db";
import { nanoid } from "nanoid";
import { agoraStartAgent, agoraStopAgent } from "./agora";
import { forwardToLlm } from "./llm";
import { getUserMemory, initVoiceSession, addMessage, pseudonymize } from "./honcho";
import { getActivityContext } from "./activity";

// =============================================================================
// SSE Think-Tag Filter
// =============================================================================

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

function isPrefixOf(str: string, tag: string): boolean {
  return tag.startsWith(str) && str.length < tag.length;
}

function suffixPrefixLength(str: string, tag: string): number {
  const maxLen = Math.min(str.length, tag.length - 1);
  for (let len = maxLen; len > 0; len--) {
    if (str.slice(-len) === tag.slice(0, len)) {
      return len;
    }
  }
  return 0;
}

interface FilterState {
  insideThink: boolean;
  pendingTag: string;
}

function filterThinkContent(content: string, state: FilterState): { filtered: string; state: FilterState } {
  let { insideThink, pendingTag } = state;
  const input = pendingTag + content;
  pendingTag = "";

  let filtered = "";
  let i = 0;

  while (i < input.length) {
    if (insideThink) {
      if (input.slice(i).startsWith(CLOSE_TAG)) {
        insideThink = false;
        i += CLOSE_TAG.length;
      } else {
        const remaining = input.slice(i);
        if (i > input.length - CLOSE_TAG.length && isPrefixOf(remaining, CLOSE_TAG)) {
          pendingTag = remaining;
          break;
        }
        i++;
      }
    } else {
      if (input.slice(i).startsWith(OPEN_TAG)) {
        insideThink = true;
        i += OPEN_TAG.length;
      } else {
        const remaining = input.slice(i);
        const prefixLen = suffixPrefixLength(remaining, OPEN_TAG);
        if (prefixLen > 0 && i + remaining.length === input.length) {
          filtered += remaining.slice(0, -prefixLen);
          pendingTag = remaining.slice(-prefixLen);
          break;
        }
        filtered += input[i];
        i++;
      }
    }
  }

  return { filtered, state: { insideThink, pendingTag } };
}

function hasMeaningfulFields(delta: any, choice: any): boolean {
  if (!delta) return false;
  if (delta.role) return true;
  if (delta.tool_calls) return true;
  if (delta.function_call) return true;
  if (choice?.finish_reason) return true;
  return false;
}

function filterThinkingFromStream(
  body: ReadableStream<Uint8Array> | null,
  onComplete?: (accumulatedContent: string) => void
): ReadableStream<Uint8Array> | null {
  if (!body) return null;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let lineBuffer = "";
  let filterState: FilterState = { insideThink: false, pendingTag: "" };
  let accumulatedContent = "";

  function processLine(line: string): Uint8Array | null {
    if (!line.startsWith("data: ")) {
      return encoder.encode(line + "\n");
    }

    const jsonStr = line.slice(6);

    if (jsonStr === "[DONE]") {
      return encoder.encode(line + "\n");
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const choice = parsed?.choices?.[0];
      const delta = choice?.delta;
      const content = delta?.content;

      if (typeof content === "string" && content.length > 0) {
        const result = filterThinkContent(content, filterState);
        filterState = result.state;

        if (result.filtered) {
          delta.content = result.filtered;
          accumulatedContent += result.filtered;
        } else {
          delete delta.content;
        }
      }

      const hasContent = delta?.content && delta.content.length > 0;
      const hasMeaningful = hasMeaningfulFields(delta, choice);

      if (hasContent || hasMeaningful) {
        return encoder.encode("data: " + JSON.stringify(parsed) + "\n");
      }

      return null;
    } catch {
      return encoder.encode(line + "\n");
    }
  }

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });

          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || "";

          for (const line of lines) {
            const encoded = processLine(line);
            if (encoded) {
              controller.enqueue(encoded);
            }
          }
        }

        lineBuffer += decoder.decode();

        if (lineBuffer) {
          const lines = lineBuffer.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              const encoded = processLine(line);
              if (encoded) {
                controller.enqueue(encoded);
              }
            }
          }
        }

        if (filterState.pendingTag) {
          console.log(`[SSE Filter] Dropping partial tag at stream end: "${filterState.pendingTag}"`);
        }

        if (onComplete) {
          onComplete(accumulatedContent);
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    }
  });
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowHeaders: ["content-type", "authorization"], allowMethods: ["GET", "POST", "OPTIONS"] }));

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json" } });
}

async function requireJwt(c: any): Promise<string | Response> {
  const auth = c.req.header("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return jsonError("Missing Authorization: Bearer <jwt>", 401);
  try {
    const wallet = await verifyJwt(c.env, m[1]);
    return wallet;
  } catch {
    return jsonError("Invalid token", 401);
  }
}

// =============================================================================
// AUTH
// =============================================================================

app.post("/auth/nonce", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.wallet) return jsonError("wallet required");
  const wallet = normalizeWallet(String(body.wallet));
  const { nonce, expiresAt } = await createNonce(c.env, wallet);
  return c.json({ wallet, nonce, expiresAt });
});

app.post("/auth/verify", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.wallet || !body?.signature || !body?.nonce) return jsonError("wallet, signature, nonce required");
  const wallet = normalizeWallet(String(body.wallet));
  const ok = await verifySignatureForNonce(c.env, wallet, String(body.signature), String(body.nonce));
  if (!ok) return jsonError("signature verification failed", 401);
  const token = await issueJwt(c.env, wallet);
  return c.json({ token, wallet });
});

// =============================================================================
// VOICE AGENT
// =============================================================================

app.post("/agent/start", async (c) => {
  const walletOrRes = await requireJwt(c);
  if (walletOrRes instanceof Response) return walletOrRes;
  const wallet = walletOrRes;

  const body = await c.req.json().catch(() => ({}));
  const activityWallet = (typeof body.activityWallet === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.activityWallet))
    ? body.activityWallet : wallet;

  const sessionId = crypto.randomUUID();
  const channel = `neo_${sessionId.replace(/-/g, "").slice(0, 20)}`;
  const llmSecret = (c.env.AGORA_CUSTOM_LLM_BEARER_PREFIX || "neo_") + nanoid(32);
  const llmSecretHash = await sha256Hex(llmSecret);

  await c.env.DB.prepare(
    "INSERT INTO sessions(id,wallet,channel,llm_secret_hash,started_at,status) VALUES(?,?,?,?,?,?)"
  )
    .bind(sessionId, wallet, channel, llmSecretHash, Date.now(), "active")
    .run();

  const llmUrl = new URL("/v1/chat/completions", c.req.url).toString();
  console.log(`[agent/start] LLM URL: ${llmUrl}`);

  const { agentId, rtcToken, userUid } = await agoraStartAgent(c.env, { channel, llmUrl, llmApiKey: llmSecret });

  await c.env.DB.prepare("UPDATE sessions SET agora_agent_id=? WHERE id=?").bind(agentId, sessionId).run();

  // Build context
  try {
    const parts: string[] = [];

    const [memory, activity] = await Promise.all([
      getUserMemory(c.env, wallet).catch((e) => { console.warn("[agent/start] Honcho memory failed:", e); return null; }),
      getActivityContext(c.env, activityWallet).catch((e) => { console.warn("[agent/start] Activity fetch failed:", e); return null; }),
    ]);

    if (memory) {
      parts.push(`=== Personal Memory ===\n${memory}`);
      console.log(`[agent/start] Honcho memory: ${memory.length} chars`);
    }
    if (activity) {
      parts.push(`=== Recent Activity ===\n${activity}`);
      console.log(`[agent/start] Activity context: ${activity.length} chars`);
    }

    const contextBlob = parts.length > 0 ? parts.join("\n\n") : "(No context provided)";
    await storeSessionContext(c.env, sessionId, contextBlob);
  } catch (e) {
    console.log("context build failed", String(e));
  }

  // Initialize Honcho session
  initVoiceSession(c.env, wallet, sessionId).then((honchoSession) => {
    if (honchoSession) {
      console.log(`[agent/start] Honcho session initialized: ${honchoSession.honchoSessionId}`);
    }
  }).catch((e) => {
    console.log("[agent/start] Honcho session init failed:", String(e));
  });

  return c.json({
    session_id: sessionId,
    channel,
    agora_token: rtcToken,
    agora_agent_id: agentId,
    user_uid: userUid,
    llm_secret: llmSecret
  });
});

app.post("/agent/:id/stop", async (c) => {
  const walletOrRes = await requireJwt(c);
  if (walletOrRes instanceof Response) return walletOrRes;
  const wallet = walletOrRes;

  const sessionId = c.req.param("id");
  const sess = await c.env.DB.prepare("SELECT wallet, agora_agent_id, started_at, status FROM sessions WHERE id=?")
    .bind(sessionId)
    .first<{ wallet: string; agora_agent_id: string | null; started_at: number; status: string }>();

  if (!sess) return jsonError("session not found", 404);
  if (sess.wallet !== wallet) return jsonError("forbidden", 403);
  if (sess.status !== "active") return c.json({ ok: true });

  if (sess.agora_agent_id) await agoraStopAgent(c.env, sess.agora_agent_id);

  const endedAt = Date.now();
  const durationMs = Math.max(0, endedAt - sess.started_at);

  await c.env.DB.prepare("UPDATE sessions SET ended_at=?, duration_ms=?, status='ended' WHERE id=?")
    .bind(endedAt, durationMs, sessionId)
    .run();

  return c.json({ ok: true, session_id: sessionId, duration_ms: durationMs });
});

// =============================================================================
// TEXT CHAT
// =============================================================================

const CHAT_SYSTEM_PROMPT = `You are Scarlett, a warm and insightful AI lifecoach on Heaven.

Your role:
- Help users improve their dating profiles and approach
- Give honest, constructive feedback
- Coach on conversation skills and first date ideas
- Be supportive but direct - users want real advice, not flattery
- Keep responses concise (2-4 sentences) unless they ask for more detail
- If the user's Recent Activity is provided, reference it naturally when relevant (e.g. noticing sleep patterns, commenting on their music taste, acknowledging their runs or meals)
- Use activity data as conversation starters or to give personalized advice, but don't dump raw stats unless asked
- When music context is present, prioritize one concrete recent listen and (if useful) the user's top artist; keep it natural, not stat-heavy

Remember: Dating is about being authentic. Help users present their best genuine self.`;

app.post("/chat/send", async (c) => {
  const walletOrRes = await requireJwt(c);
  if (walletOrRes instanceof Response) return walletOrRes;
  const wallet = walletOrRes;

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return jsonError("message required", 400);
  }

  const userMessage = body.message.trim();
  const conversationHistory = Array.isArray(body.history) ? body.history : [];
  // Client can provide the wallet used for attestations (may differ from JWT wallet)
  const activityWallet = (typeof body.activityWallet === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.activityWallet))
    ? body.activityWallet : wallet;

  console.log(`[chat/send] wallet=${wallet.slice(0, 10)}..., activityWallet=${activityWallet.slice(0, 10)}..., message=${userMessage.slice(0, 50)}...`);

  const contextParts: string[] = [];

  try {
    const [memory, activity] = await Promise.all([
      getUserMemory(c.env, wallet).catch((e) => { console.warn("[chat/send] Honcho memory fetch failed:", e); return null; }),
      getActivityContext(c.env, activityWallet).catch((e) => { console.warn("[chat/send] Activity fetch failed:", e); return null; }),
    ]);
    if (memory) {
      contextParts.push(`=== Personal Memory ===\n${memory}`);
      console.log(`[chat/send] Honcho memory: ${memory.length} chars`);
    }
    if (activity) {
      contextParts.push(`=== Recent Activity ===\n${activity}`);
      console.log(`[chat/send] Activity context: ${activity.length} chars`);
    }
  } catch (e) {
    console.warn("[chat/send] Context fetch failed:", e);
  }

  const contextBlob = contextParts.length > 0 ? contextParts.join("\n\n") : "";
  const systemContent = contextBlob
    ? `${CHAT_SYSTEM_PROMPT}\n\n=== User Context ===\n${contextBlob}`
    : CHAT_SYSTEM_PROMPT;

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemContent },
  ];

  const MAX_HISTORY = 10;
  const recentHistory = conversationHistory.slice(-MAX_HISTORY);
  for (const msg of recentHistory) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: userMessage });

  const llmBody = {
    model: c.env.LLM_MODEL || "anthropic/claude-sonnet-4",
    messages,
    stream: false,
    max_tokens: 500,
  };

  const llmRes = await forwardToLlm(c.env, llmBody);
  if (!llmRes.ok) {
    const errText = await llmRes.text().catch(() => "LLM error");
    console.error("[chat/send] LLM error:", errText);
    return jsonError("AI temporarily unavailable", 503);
  }

  const llmData = await llmRes.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const assistantMessage = llmData.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

  // Store in Honcho (fire-and-forget)
  (async () => {
    try {
      const peerId = await pseudonymize(c.env, wallet);
      const sessionId = `chat_${wallet.slice(0, 10)}_${Date.now()}`;
      await addMessage(c.env, sessionId, peerId, userMessage, true);
      await addMessage(c.env, sessionId, peerId, assistantMessage, false);
    } catch (e) {
      console.warn("[chat/send] Honcho storage failed:", e);
    }
  })();

  return c.json({
    ok: true,
    message: assistantMessage,
  });
});

app.post("/chat/stream", async (c) => {
  const walletOrRes = await requireJwt(c);
  if (walletOrRes instanceof Response) return walletOrRes;
  const wallet = walletOrRes;

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return jsonError("message required", 400);
  }

  const userMessage = body.message.trim();
  const conversationHistory = Array.isArray(body.history) ? body.history : [];
  const activityWallet = (typeof body.activityWallet === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.activityWallet))
    ? body.activityWallet : wallet;

  console.log(`[chat/stream] wallet=${wallet.slice(0, 10)}..., activityWallet=${activityWallet.slice(0, 10)}..., message=${userMessage.slice(0, 50)}...`);

  const contextParts: string[] = [];

  try {
    const [memory, activity] = await Promise.all([
      getUserMemory(c.env, wallet).catch((e) => { console.warn("[chat/stream] Honcho memory fetch failed:", e); return null; }),
      getActivityContext(c.env, activityWallet).catch((e) => { console.warn("[chat/stream] Activity fetch failed:", e); return null; }),
    ]);
    if (memory) {
      contextParts.push(`=== Personal Memory ===\n${memory}`);
    }
    if (activity) {
      contextParts.push(`=== Recent Activity ===\n${activity}`);
    }
  } catch (e) {
    console.warn("[chat/stream] Context fetch failed:", e);
  }

  const contextBlob = contextParts.length > 0 ? contextParts.join("\n\n") : "";
  const systemContent = contextBlob
    ? `${CHAT_SYSTEM_PROMPT}\n\n=== User Context ===\n${contextBlob}`
    : CHAT_SYSTEM_PROMPT;

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemContent },
  ];

  const MAX_HISTORY = 10;
  const recentHistory = conversationHistory.slice(-MAX_HISTORY);
  for (const msg of recentHistory) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  const llmBody = {
    model: c.env.LLM_MODEL || "anthropic/claude-sonnet-4",
    messages,
    stream: true,
    max_tokens: 1000,
  };

  const llmRes = await forwardToLlm(c.env, llmBody);
  if (!llmRes.ok) {
    const errText = await llmRes.text().catch(() => "LLM error");
    console.error("[chat/stream] LLM error:", errText);
    return jsonError("AI temporarily unavailable", 503);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let fullMessage = "";
  let filterState: FilterState = { insideThink: false, pendingTag: "" };
  let lineBuffer = "";

  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      const combined = lineBuffer + text;
      const lines = combined.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          if (filterState.pendingTag && !filterState.insideThink) {
            fullMessage += filterState.pendingTag;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: filterState.pendingTag })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, message: fullMessage })}\n\n`));
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || "";
          if (delta) {
            const { filtered, state } = filterThinkContent(delta, filterState);
            filterState = state;
            if (filtered) {
              fullMessage += filtered;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: filtered })}\n\n`));
            }
          }
        } catch {
          // Skip malformed JSON
        }
      }
    },
    flush(controller) {
      if (lineBuffer.startsWith("data: ")) {
        const data = lineBuffer.slice(6).trim();
        if (data === "[DONE]") {
          if (filterState.pendingTag && !filterState.insideThink) {
            fullMessage += filterState.pendingTag;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: filterState.pendingTag })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, message: fullMessage })}\n\n`));
        }
      }
    },
  });

  const readableStream = llmRes.body?.pipeThrough(transformStream);

  const storeToHoncho = async () => {
    try {
      const peerId = await pseudonymize(c.env, wallet);
      const sessionId = `chat_${wallet.slice(0, 10)}_${Date.now()}`;
      await addMessage(c.env, sessionId, peerId, userMessage, true);
      await addMessage(c.env, sessionId, peerId, fullMessage, false);
    } catch (e) {
      console.warn("[chat/stream] Honcho storage failed:", e);
    }
  };

  setTimeout(storeToHoncho, 30000);

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// =============================================================================
// LLM PROXY (for Agora CAI)
// =============================================================================

app.post("/v1/chat/completions", async (c) => {
  const auth = c.req.header("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return jsonError("Missing Authorization: Bearer <llm_secret>", 401);

  const llmSecret = m[1];
  const secretHash = await sha256Hex(llmSecret);
  const session = await getSessionBySecretHash(c.env, secretHash);
  if (!session) return jsonError("Invalid or inactive session", 401);

  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) return jsonError("Invalid OpenAI request");

  console.log(`[LLM] Incoming messages (${body.messages.length}):`, JSON.stringify(body.messages.map((m: any) => ({ role: m.role, content: m.content?.slice(0, 100) }))));

  let messages = body.messages;
  if (session.context_blob) {
    messages = messages.map((m: any, i: number) => {
      if (i === 0 && m.role === "system") {
        return {
          ...m,
          content: `${m.content}\n\n=== User Context ===\n${session.context_blob}`
        };
      }
      return m;
    });
    console.log(`[LLM] Injected context (${session.context_blob.length} chars)`);
  }

  const outBody = {
    ...body,
    messages,
    model: body.model ?? c.env.LLM_MODEL,
    stream: body.stream ?? true
  };

  const upstream = await forwardToLlm(c.env, outBody);

  const headers = new Headers(upstream.headers);
  headers.set("access-control-allow-origin", "*");

  const lastUserMessage = body.messages.filter((m: any) => m.role === "user").pop();
  const userContent = lastUserMessage?.content || "";

  const isStreaming = outBody.stream === true;
  const isSSE = upstream.headers.get("content-type")?.includes("text/event-stream");

  if (isStreaming && isSSE) {
    const filteredBody = filterThinkingFromStream(upstream.body, (assistantContent) => {
      if (c.env.HONCHO_API_KEY && c.env.PSEUDONYM_SECRET && userContent && assistantContent) {
        const storeTranscript = async () => {
          try {
            const peerId = await pseudonymize(c.env, session.wallet);
            const honchoSessionId = `voice_${session.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
            const agentPeerId = "agent_scarlett";

            await addMessage(c.env, honchoSessionId, peerId, userContent, true);
            await addMessage(c.env, honchoSessionId, agentPeerId, assistantContent, false);

            console.log(`[LLM] Stored transcript to Honcho (user: ${userContent.length} chars, assistant: ${assistantContent.length} chars)`);
          } catch (e) {
            console.warn("[LLM] Failed to store transcript:", e);
          }
        };
        c.executionCtx.waitUntil(storeTranscript());
      }
    });
    return new Response(filteredBody, { status: upstream.status, headers });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
});

app.post("/webhook/agora", async (c) => {
  const secret = c.env.WEBHOOK_SECRET;
  if (secret) {
    const auth = c.req.header("authorization") || "";
    if (auth !== `Bearer ${secret}`) return jsonError("unauthorized", 401);
  }
  const body = await c.req.json().catch(() => ({}));
  return c.json({ ok: true });
});

export default app;
