type SmokeResult = {
  service: string;
  ok: boolean;
  status: number;
  bodyPreview: string;
  details?: string;
};

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function previewBody(body: string): string {
  return body.replace(/\s+/g, " ").slice(0, 220);
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 25_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHealth(service: string, baseUrl: string): Promise<SmokeResult> {
  const url = `${baseUrl}/health`;
  try {
    const res = await fetchWithTimeout(url);
    const text = await res.text();
    let ok = res.ok;
    let details: string | undefined;
    if (res.ok) {
      const parsed = (() => {
        try {
          return JSON.parse(text) as Record<string, unknown>;
        } catch {
          return null;
        }
      })();
      if (!parsed || parsed.ok !== true) {
        ok = false;
        details = "response does not include { ok: true }";
      }
    }
    return {
      service,
      ok,
      status: res.status,
      bodyPreview: previewBody(text),
      details,
    };
  } catch (error) {
    return {
      service,
      ok: false,
      status: 0,
      bodyPreview: "",
      details: String(error),
    };
  }
}

async function checkVoiceAgentNonce(baseUrl: string): Promise<SmokeResult> {
  const service = "voice-agent";
  const url = `${baseUrl}/auth/nonce`;
  const payload = { wallet: "0x0000000000000000000000000000000000000001" };
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let ok = res.ok;
    let details: string | undefined;
    if (res.ok) {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed.nonce !== "string" || parsed.nonce.length < 8) {
          ok = false;
          details = "response does not include a valid nonce";
        }
      } catch {
        ok = false;
        details = "response is not valid JSON";
      }
    }
    return {
      service,
      ok,
      status: res.status,
      bodyPreview: previewBody(text),
      details,
    };
  } catch (error) {
    return {
      service,
      ok: false,
      status: 0,
      bodyPreview: "",
      details: String(error),
    };
  }
}

function printResult(result: SmokeResult): void {
  const prefix = result.ok ? "PASS" : "FAIL";
  console.log(`[${prefix}] ${result.service}: HTTP ${result.status}`);
  if (result.bodyPreview) {
    console.log(`  body: ${result.bodyPreview}`);
  }
  if (result.details) {
    console.log(`  detail: ${result.details}`);
  }
}

async function main() {
  const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required env: ${name}`);
    return value;
  };

  const apiCore = normalizeBaseUrl(required("API_CORE_URL"));
  const metadataResolver = normalizeBaseUrl(required("METADATA_RESOLVER_URL"));
  const voiceAgent = normalizeBaseUrl(required("VOICE_AGENT_URL"));
  const voiceControlPlane = normalizeBaseUrl(required("VOICE_CONTROL_PLANE_URL"));

  console.log("Running services smoke checks...");
  console.log(`- api-core: ${apiCore}`);
  console.log(`- metadata-resolver: ${metadataResolver}`);
  console.log(`- voice-agent: ${voiceAgent}`);
  console.log(`- voice-control-plane: ${voiceControlPlane}`);

  const results = await Promise.all([
    checkHealth("api-core", apiCore),
    checkHealth("metadata-resolver", metadataResolver),
    checkVoiceAgentNonce(voiceAgent),
    checkHealth("voice-control-plane", voiceControlPlane),
  ]);

  console.log("");
  for (const result of results) printResult(result);

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.log(`\nSmoke checks failed: ${failed.map((x) => x.service).join(", ")}`);
    process.exit(1);
  }

  console.log("\nAll services smoke checks passed.");
}

await main();
