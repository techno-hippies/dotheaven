/**
 * Local end-to-end runner for voice-control-plane without GPUI.
 *
 * Starts a local Worker, applies migrations, then runs smoke tests.
 *
 * Usage:
 *   bun src/e2e-local.ts
 *   bun src/e2e-local.ts --full
 *   bun src/e2e-local.ts --duet-onchain
 *   bun src/e2e-local.ts --duet-onchain --serve
 *
 * Onchain/self mode:
 * - If X402_FACILITATOR_BASE_URL points at http://127.0.0.1:<LOCAL_FACILITATOR_PORT>,
 *   this runner will start `services/x402-facilitator-rs` automatically.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.SESSION_VOICE_URL || "http://localhost:3338";
const FULL = process.argv.includes("--full");
const WITH_BROADCAST = process.argv.includes("--with-broadcast");
const SERVE = process.argv.includes("--serve");
const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const SERVICE_DIR = resolve(SCRIPT_DIR, "..");
const D1_DATABASE = (process.env.D1_DATABASE || "session-voice").trim();

function loadDotEnv(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  let text = "";
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return env;
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!key) continue;
    env[key] = value;
  }

  return env;
}

const LOCAL_ENV = loadDotEnv(resolve(SERVICE_DIR, ".env"));
const CHILD_ENV = {
  ...process.env,
  ...LOCAL_ENV,
  // Prevent wrangler from trying to write under ~/.config in constrained environments.
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || "/tmp/voice-control-plane-xdg",
  SESSION_VOICE_URL: BASE_URL,
};

const ENV_FACILITATOR_MODE =
  (LOCAL_ENV.X402_FACILITATOR_MODE || process.env.X402_FACILITATOR_MODE || "mock").trim();

if (ENV_FACILITATOR_MODE !== "mock" && ENV_FACILITATOR_MODE !== "self") {
  throw new Error(`Unsupported X402_FACILITATOR_MODE: ${ENV_FACILITATOR_MODE}`);
}

// If you're explicitly running in "self" facilitator mode (our own settlement service),
// default to an on-chain (real settlement) duet test run.
const AUTO_ONCHAIN =
  ENV_FACILITATOR_MODE === "self"
  && !process.argv.includes("--duet-onchain");
const DUET_ONCHAIN = process.argv.includes("--duet-onchain") || AUTO_ONCHAIN;
const DUET_REAL_ONLY = DUET_ONCHAIN;
const facilitatorMode: "mock" | "self" = DUET_ONCHAIN
  ? "self"
  : (ENV_FACILITATOR_MODE === "self" ? "self" : "mock");

const CORE_TESTS = [
  "src/smoke-test.ts",
  "src/smoke-test-rooms.ts",
  "src/smoke-test-visibility.ts",
  "src/smoke-test-duet.ts",
];

const BROADCAST_TESTS = [
  "src/smoke-test-duet-broadcast.ts",
];

const FULL_TESTS = [
  ...CORE_TESTS,
  "src/smoke-test-compensate.ts",
  "src/smoke-test-concurrent.ts",
];

const DUET_SELF_TESTS = [
  "src/smoke-test-duet-self.ts",
];

const selectedBase = DUET_REAL_ONLY
  ? DUET_SELF_TESTS
  : (FULL ? FULL_TESTS : CORE_TESTS);

const TESTS = WITH_BROADCAST
  ? [...selectedBase, ...BROADCAST_TESTS]
  : selectedBase;

const WRANGLER_LOCAL_VARS: Record<string, string> = {
  JWT_SECRET: LOCAL_ENV.JWT_SECRET || "dev-secret-for-testing-only",
  AGORA_APP_ID: LOCAL_ENV.AGORA_APP_ID || "00000000000000000000000000000000",
  AGORA_APP_CERTIFICATE: LOCAL_ENV.AGORA_APP_CERTIFICATE || "00000000000000000000000000000000",
  SONG_REGISTRY_ADMIN_TOKEN: LOCAL_ENV.SONG_REGISTRY_ADMIN_TOKEN
    || process.env.SONG_REGISTRY_ADMIN_TOKEN
    || "local-song-admin",
  X402_FACILITATOR_MODE: facilitatorMode,
  X402_FACILITATOR_BASE_URL: "",
};

const localFacilitatorPort = Number((process.env.LOCAL_FACILITATOR_PORT || "3340").trim());
const localFacilitatorBaseUrl = `http://127.0.0.1:${localFacilitatorPort}`;
const localRustFacilitatorDir = resolve(SERVICE_DIR, "..", "x402-facilitator-rs");

const envFacilitatorBaseUrl =
  LOCAL_ENV.X402_FACILITATOR_BASE_URL
  || process.env.X402_FACILITATOR_BASE_URL
  || "";

const requestedFacilitatorBaseUrl =
  DUET_ONCHAIN
    ? (envFacilitatorBaseUrl || localFacilitatorBaseUrl)
    : envFacilitatorBaseUrl;

WRANGLER_LOCAL_VARS.X402_FACILITATOR_BASE_URL = requestedFacilitatorBaseUrl;

const facilitatorAuthToken =
  LOCAL_ENV.X402_FACILITATOR_AUTH_TOKEN
  || process.env.X402_FACILITATOR_AUTH_TOKEN
  || (DUET_ONCHAIN ? (process.env.LOCAL_FACILITATOR_AUTH_TOKEN || "local") : undefined);

if (facilitatorAuthToken) WRANGLER_LOCAL_VARS.X402_FACILITATOR_AUTH_TOKEN = facilitatorAuthToken;
if (DUET_ONCHAIN && facilitatorAuthToken) {
  // The local facilitator process reads FACILITATOR_AUTH_TOKEN (or X402_FACILITATOR_AUTH_TOKEN).
  CHILD_ENV.LOCAL_FACILITATOR_AUTH_TOKEN = facilitatorAuthToken;
}

function buildWranglerVarArgs(vars: Record<string, string>): string[] {
  return Object.entries(vars).flatMap(([key, value]) => ["--var", `${key}:${value}`]);
}

function runChecked(command: string[], label: string): void {
  console.log(`\n[e2e] ${label}`);
  const result = Bun.spawnSync(command, {
    cwd: SERVICE_DIR,
    env: CHILD_ENV,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (exit ${result.exitCode})`);
  }
}

async function waitForHealth(worker: Bun.Subprocess, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (worker.exitCode !== null) {
      throw new Error(`wrangler dev exited early with code ${worker.exitCode}`);
    }

    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        console.log("[e2e] Worker is healthy");
        return;
      }
    } catch {
      // keep polling
    }

    await Bun.sleep(500);
  }

  throw new Error(`Timed out waiting for health at ${BASE_URL}/health`);
}

async function waitForUrl(proc: Bun.Subprocess, url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode !== null) {
      throw new Error(`process exited early with code ${proc.exitCode}`);
    }

    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // keep polling
    }

    await Bun.sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function stopWorker(worker: Bun.Subprocess): Promise<void> {
  if (worker.exitCode !== null) return;

  worker.kill();
  await Promise.race([worker.exited, Bun.sleep(2000)]);

  if (worker.exitCode === null) {
    worker.kill("SIGKILL");
    await worker.exited;
  }
}

async function main() {
  console.log("[e2e] Starting local e2e run");
  console.log(`[e2e] Base URL: ${BASE_URL}`);
  console.log(`[e2e] Mode: ${DUET_ONCHAIN ? "duet-onchain" : (FULL ? "full" : "core")}`);
  if (AUTO_ONCHAIN) console.log("[e2e] Auto: duet-onchain enabled because X402_FACILITATOR_MODE=self");
  if (DUET_REAL_ONLY) console.log(`[e2e] Facilitator mode: ${facilitatorMode}`);
  if (SERVE) console.log("[e2e] Serve: enabled (no tests will run; press Ctrl+C to stop)");

  if (DUET_REAL_ONLY) {
    if (!requestedFacilitatorBaseUrl) {
      throw new Error("X402_FACILITATOR_BASE_URL is required for duet payment tests with X402_FACILITATOR_MODE=self");
    }
    if (!facilitatorAuthToken) {
      throw new Error("X402_FACILITATOR_AUTH_TOKEN is required for duet payment tests with X402_FACILITATOR_MODE=self");
    }

    if (!SERVE) {
      const payerPrivateKey =
        CHILD_ENV.DUET_TEST_PAYER_PRIVATE_KEY
        || CHILD_ENV.X402_EVM_PRIVATE_KEY
        || CHILD_ENV.EVM_PRIVATE_KEY
        || CHILD_ENV.PRIVATE_KEY;
      if (payerPrivateKey) {
        // Ensure the smoke-test subprocesses can see the payer key even if runChecked
        // uses a trimmed env.
        CHILD_ENV.DUET_TEST_PAYER_PRIVATE_KEY = payerPrivateKey;
      } else {
        throw new Error("DUET_TEST_PAYER_PRIVATE_KEY (or X402_EVM_PRIVATE_KEY / EVM_PRIVATE_KEY / PRIVATE_KEY) is required for duet payment smoke tests");
      }
    }
  }

  runChecked(
    ["bunx", "wrangler", "d1", "execute", D1_DATABASE, "--local", "--file=migrations/0001_credits_rooms.sql"],
    "Applying local migration (0001)",
  );
  runChecked(
    ["bunx", "wrangler", "d1", "execute", D1_DATABASE, "--local", "--file=migrations/0002_song_registry.sql"],
    "Applying local migration (0002)",
  );
  runChecked(
    ["bunx", "wrangler", "d1", "execute", D1_DATABASE, "--local", "--file=migrations/0003_duet_discovery.sql"],
    "Applying local migration (0003)",
  );

  let localFacilitator: Bun.Subprocess | null = null;
  const normalizedRequestedBaseUrl = requestedFacilitatorBaseUrl.replace(/\/+$/, "");
  const normalizedLocalBaseUrl = localFacilitatorBaseUrl.replace(/\/+$/, "");
  const shouldStartLocalFacilitator = DUET_ONCHAIN && normalizedRequestedBaseUrl === normalizedLocalBaseUrl;
  if (shouldStartLocalFacilitator) {
    console.log("\n[e2e] Starting local facilitator (rust)...");

    const facilitatorPrivateKey =
      CHILD_ENV.DUET_TEST_FACILITATOR_PRIVATE_KEY
      || CHILD_ENV.DUET_TEST_PAYER_PRIVATE_KEY
      || CHILD_ENV.X402_EVM_PRIVATE_KEY
      || CHILD_ENV.EVM_PRIVATE_KEY
      || CHILD_ENV.PRIVATE_KEY;

    if (!facilitatorPrivateKey) {
      throw new Error("DUET_TEST_FACILITATOR_PRIVATE_KEY (or DUET_TEST_PAYER_PRIVATE_KEY / EVM_PRIVATE_KEY) is required to start the local rust facilitator");
    }

    const rpcUrlBaseSepolia =
      CHILD_ENV.DUET_TEST_RPC_URL
      || CHILD_ENV.HEAVEN_BASE_SEPOLIA_RPC_URL
      || "https://base-sepolia-rpc.publicnode.com";

    localFacilitator = Bun.spawn(
      ["bash", "start.sh"],
      {
        cwd: localRustFacilitatorDir,
        env: {
          ...CHILD_ENV,
          FACILITATOR_HOST: "127.0.0.1",
          FACILITATOR_PORT: String(localFacilitatorPort),
          FACILITATOR_AUTH_TOKEN: facilitatorAuthToken || "",
          X402_FACILITATOR_AUTH_TOKEN: facilitatorAuthToken || "",
          SIGNER_TYPE: "private-key",
          EVM_PRIVATE_KEY: String(facilitatorPrivateKey),
          RPC_URL_BASE_SEPOLIA: String(rpcUrlBaseSepolia),
        },
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    // The Rust facilitator may need a first-time `cargo build --release` (cold cache),
    // which can take longer than 30s. Give it a bigger window so local onchain smoke tests
    // are reliable without manual prebuild steps.
    await waitForUrl(localFacilitator, `${localFacilitatorBaseUrl}/health`, 180_000);
    console.log("[e2e] Local facilitator is healthy");
  }

  console.log("\n[e2e] Starting wrangler dev...");
  const worker = Bun.spawn(
    [
      "bunx",
      "wrangler",
      "dev",
      "--local",
      "--port",
      "3338",
      ...buildWranglerVarArgs(WRANGLER_LOCAL_VARS),
    ],
    {
      cwd: SERVICE_DIR,
      env: CHILD_ENV,
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  let shutdownInFlight = false;
  async function shutdown(signal: string) {
    if (shutdownInFlight) return;
    shutdownInFlight = true;
    console.log(`\n[e2e] ${signal} received, shutting down...`);
    try {
      await stopWorker(worker);
    } finally {
      if (localFacilitator) {
        await stopWorker(localFacilitator);
      }
      process.exit(0);
    }
  }

  process.on("SIGINT", () => { shutdown("SIGINT"); });
  process.on("SIGTERM", () => { shutdown("SIGTERM"); });

  try {
    await waitForHealth(worker, 60_000);

    if (SERVE) {
      // Keep serving until the user stops the process.
      await worker.exited;
      return;
    }

    for (const testFile of TESTS) {
      runChecked(["bun", testFile], `Running ${testFile}`);
    }

    console.log("\n[e2e] All tests passed");
  } finally {
    console.log("\n[e2e] Stopping wrangler dev...");
    await stopWorker(worker);

    if (localFacilitator) {
      console.log("\n[e2e] Stopping local facilitator...");
      await stopWorker(localFacilitator);
    }
  }
}

main().catch((error) => {
  console.error(`\n[e2e] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
