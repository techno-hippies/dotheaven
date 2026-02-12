/**
 * Local end-to-end runner for session-voice without GPUI.
 *
 * Starts a local Worker, applies migrations, then runs smoke tests.
 *
 * Usage:
 *   bun src/e2e-local.ts
 *   bun src/e2e-local.ts --full
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.SESSION_VOICE_URL || "http://localhost:3338";
const FULL = process.argv.includes("--full");
const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const SERVICE_DIR = resolve(SCRIPT_DIR, "..");

const CORE_TESTS = [
  "src/smoke-test.ts",
  "src/smoke-test-rooms.ts",
  "src/smoke-test-visibility.ts",
  "src/smoke-test-duet.ts",
];

const FULL_TESTS = [
  ...CORE_TESTS,
  "src/smoke-test-compensate.ts",
  "src/smoke-test-concurrent.ts",
];

const TESTS = FULL ? FULL_TESTS : CORE_TESTS;

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
  SESSION_VOICE_URL: BASE_URL,
};

const WRANGLER_LOCAL_VARS: Record<string, string> = {
  JWT_SECRET: LOCAL_ENV.JWT_SECRET || "dev-secret-for-testing-only",
  AGORA_APP_ID: LOCAL_ENV.AGORA_APP_ID || "00000000000000000000000000000000",
  AGORA_APP_CERTIFICATE: LOCAL_ENV.AGORA_APP_CERTIFICATE || "00000000000000000000000000000000",
  X402_FACILITATOR_MODE: LOCAL_ENV.X402_FACILITATOR_MODE || "mock",
  X402_FACILITATOR_BASE_URL:
    LOCAL_ENV.X402_FACILITATOR_BASE_URL || "https://api.cdp.coinbase.com/platform/v2/x402",
};

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
  console.log(`[e2e] Mode: ${FULL ? "full" : "core"}`);

  runChecked(
    ["npx", "wrangler", "d1", "execute", "session-voice", "--local", "--file=migrations/0001_credits_rooms.sql"],
    "Applying local migration",
  );

  console.log("\n[e2e] Starting wrangler dev...");
  const worker = Bun.spawn(
    [
      "npx",
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

  try {
    await waitForHealth(worker, 60_000);

    for (const testFile of TESTS) {
      runChecked(["bun", testFile], `Running ${testFile}`);
    }

    console.log("\n[e2e] All tests passed");
  } finally {
    console.log("\n[e2e] Stopping wrangler dev...");
    await stopWorker(worker);
  }
}

main().catch((error) => {
  console.error(`\n[e2e] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
