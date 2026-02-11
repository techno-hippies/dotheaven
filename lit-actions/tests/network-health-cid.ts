#!/usr/bin/env bun
/**
 * Test CID-based Lit Action execution on naga-dev.
 * Uses the heavenClaimName CID with a dry-run to test IPFS fetch + execution.
 *
 * Usage:
 *   LIT_NETWORK=naga-dev bun tests/network-health-cid.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import {
  createAuthManager,
  storagePlugins,
  ViemAccountAuthenticator,
} from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { ethers } from "ethers";
import { Env } from "./shared/env";

async function main() {
  console.log("Lit CID-based Execution Test");
  console.log("=".repeat(60));
  console.log(`   Network:  ${Env.name}`);
  console.log(`   Time:     ${new Date().toISOString()}`);

  const cid = Env.cids.heavenClaimName;
  console.log(`   CID:      ${cid}`);

  if (!cid) {
    console.error("No heavenClaimName CID found in cids file");
    process.exit(1);
  }

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:      ${pkpCreds.ethAddress}`);

  let pk = process.env.PRIVATE_KEY || pkpCreds.pkpPrivateKey;
  if (!pk) throw new Error("PRIVATE_KEY or pkpPrivateKey required");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const wallet = new ethers.Wallet(pk);
  const userAddress = wallet.address;
  const userPkpPublicKey = ethers.SigningKey.computePublicKey(pk, false);

  console.log(`   Auth EOA: ${authEoa.address}`);

  // Connect
  console.log("\n[1/3] Connecting...");
  const t0 = performance.now();
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log(`  Connected in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

  // Authenticate
  console.log("\n[2/3] Authenticating...");
  const t1 = performance.now();
  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "health-cid-test",
      networkName: Env.name,
      storagePath: "./output/lit-auth",
    }),
  });

  const authData = await ViemAccountAuthenticator.authenticate(authEoa);
  const authContext = await authManager.createPkpAuthContext({
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
  console.log(`  Authenticated in ${((performance.now() - t1) / 1000).toFixed(1)}s`);

  // Execute CID-based action with dryRun
  console.log("\n[3/3] Executing CID-based action (heavenClaimName, dryRun)...");
  const t2 = performance.now();

  const label = "healthcheck" + Date.now();
  const recipient = userAddress;
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1_000_000_000);

  // Pre-sign the EIP-191 message
  const message = `heaven:register:${label}:${recipient}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  try {
    const result = await litClient.executeJs({
      ipfsId: cid,
      authContext,
      jsParams: {
        recipient,
        label,
        userPkpPublicKey,
        timestamp,
        nonce,
        signature,
        dryRun: true,
      },
    });

    const elapsed = ((performance.now() - t2) / 1000).toFixed(1);
    console.log(`  Executed in ${elapsed}s`);

    if (result.logs) console.log(`  Logs:\n${result.logs}`);

    const response =
      typeof result.response === "string"
        ? JSON.parse(result.response)
        : result.response;

    console.log(`  Response: ${JSON.stringify(response, null, 2)}`);

    if (response?.success) {
      console.log("\nCID EXECUTION WORKS - IPFS fetch + action execution succeeded!");
    } else {
      console.log("\nAction returned an error (but IPFS fetch worked):");
      console.log(`  Error: ${response?.error}`);
    }
  } catch (err: any) {
    const elapsed = ((performance.now() - t2) / 1000).toFixed(1);
    console.error(`\n  FAILED after ${elapsed}s`);
    console.error(`  Error: ${err.message}`);
    if (err.errorKind) console.error(`  Error kind: ${err.errorKind}`);

    // Check if it's specifically an IPFS fetch error
    const msg = err.message.toLowerCase();
    if (msg.includes("ipfs") || msg.includes("code file")) {
      console.log("\n  DIAGNOSIS: IPFS code fetch failed — nodes can't download the action from IPFS");
    } else if (msg.includes("500") || msg.includes("internal server")) {
      console.log("\n  DIAGNOSIS: 500 Internal Server Error — Lit nodes are failing");
    } else if (msg.includes("timeout")) {
      console.log("\n  DIAGNOSIS: Timeout — nodes are slow or unresponsive");
    }
  }

  const totalElapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\nTotal time: ${totalElapsed}s`);

  await litClient.disconnect();
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
