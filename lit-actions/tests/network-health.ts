#!/usr/bin/env bun
/**
 * Minimal vanilla network health check for Lit Protocol naga-dev.
 *
 * Tests:
 *  1. Can we connect (createLitClient)?
 *  2. Can we authenticate (createPkpAuthContext)?
 *  3. Can we execute the simplest possible inline Lit Action?
 *
 * Usage:
 *   LIT_NETWORK=naga-dev bun tests/network-health.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import {
  createAuthManager,
  storagePlugins,
  ViemAccountAuthenticator,
} from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";

async function main() {
  console.log("Lit Network Health Check");
  console.log("=".repeat(60));
  console.log(`   Network:  ${Env.name}`);
  console.log(`   Time:     ${new Date().toISOString()}`);

  // ── 1. Load credentials ──────────────────────────────────────
  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:      ${pkpCreds.ethAddress}`);

  let pk = process.env.PRIVATE_KEY || pkpCreds.pkpPrivateKey;
  if (!pk) throw new Error("PRIVATE_KEY or pkpPrivateKey required");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA: ${authEoa.address}`);

  // ── 2. Connect ────────────────────────────────────────────────
  console.log("\n[1/3] Connecting to Lit Protocol...");
  const t0 = performance.now();

  let litClient: any;
  try {
    litClient = await createLitClient({ network: Env.litNetwork });
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`  Connected in ${elapsed}s`);
  } catch (err: any) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.error(`  FAILED to connect after ${elapsed}s`);
    console.error(`  Error: ${err.message}`);
    process.exit(1);
  }

  // ── 3. Authenticate ──────────────────────────────────────────
  console.log("\n[2/3] Authenticating...");
  const t1 = performance.now();

  let authContext: any;
  try {
    const authManager = createAuthManager({
      storage: storagePlugins.localStorageNode({
        appName: "health-check",
        networkName: Env.name,
        storagePath: "./output/lit-auth",
      }),
    });

    const authData = await ViemAccountAuthenticator.authenticate(authEoa);

    authContext = await authManager.createPkpAuthContext({
      authData,
      pkpPublicKey: pkpCreds.publicKey,
      authConfig: {
        resources: [
          ["pkp-signing", "*"],
          ["lit-action-execution", "*"],
        ],
        expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
        statement: "",
      },
      litClient,
    });

    const elapsed = ((performance.now() - t1) / 1000).toFixed(1);
    console.log(`  Authenticated in ${elapsed}s`);
  } catch (err: any) {
    const elapsed = ((performance.now() - t1) / 1000).toFixed(1);
    console.error(`  FAILED to authenticate after ${elapsed}s`);
    console.error(`  Error: ${err.message}`);
    await litClient.disconnect();
    process.exit(1);
  }

  // ── 4. Execute simplest possible Lit Action ──────────────────
  console.log("\n[3/3] Executing vanilla inline Lit Action...");
  const t2 = performance.now();

  // The absolute simplest Lit Action: just return a string
  const litActionCode = `(async () => {
    LitActions.setResponse({ response: JSON.stringify({
      success: true,
      message: "hello from lit node",
      timestamp: Date.now()
    })});
  })();`;

  try {
    const result = await litClient.executeJs({
      code: litActionCode,
      authContext,
      jsParams: {},
    });

    const elapsed = ((performance.now() - t2) / 1000).toFixed(1);
    console.log(`  Executed in ${elapsed}s`);

    if (result.logs) console.log(`  Logs: ${result.logs}`);

    const response =
      typeof result.response === "string"
        ? JSON.parse(result.response)
        : result.response;

    console.log(`  Response: ${JSON.stringify(response)}`);

    if (response?.success) {
      console.log("\nNETWORK IS UP - All 3 steps passed!");
    } else {
      console.error("\nAction executed but returned unexpected response");
      process.exit(1);
    }
  } catch (err: any) {
    const elapsed = ((performance.now() - t2) / 1000).toFixed(1);
    console.error(`  FAILED to execute after ${elapsed}s`);
    console.error(`  Error: ${err.message}`);
    if (err.errorKind) console.error(`  Error kind: ${err.errorKind}`);
    if (err.cause) console.error(`  Cause: ${err.cause}`);

    console.log("\nNETWORK IS DOWN or not responding.");
    await litClient.disconnect();
    process.exit(1);
  }

  const totalElapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\nTotal time: ${totalElapsed}s`);

  await litClient.disconnect();
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
