import type { Env } from "./env";

/**
 * Proxy an OpenAI-compatible chat completion request to your LLM provider.
 * Assumes `body` is already OpenAI-shaped. Returns the upstream fetch Response.
 */
export async function forwardToLlm(env: Env, body: any): Promise<Response> {
  // normalize common bases: if base ends with /v1, keep; else append /v1
  const base = env.LLM_BASE_URL.replace(/\/+$/, "");
  const endpoint = base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

  console.log(`[LLM] Forwarding to ${endpoint}, model: ${body.model}, stream: ${body.stream}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${env.LLM_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  console.log(`[LLM] Response status: ${res.status}`);

  if (!res.ok) {
    const text = await res.text();
    console.error(`[LLM] Error response: ${text}`);
    return new Response(text, { status: res.status, headers: res.headers });
  }

  return res;
}
