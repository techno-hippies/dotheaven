#!/usr/bin/env bun
/**
 * Test Scrobble Submit v2 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification over tracks digest
 *  - Track bucketing (MBID / ipId / metadata)
 *  - Sponsor PKP broadcasts ScrobbleV2 txs on MegaETH
 *  - Returns tx hashes + bucket counts
 *
 * Usage:
 *   bun tests/scrobble-submit-v2.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { ethers } from "ethers";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Test Scrobble Submit v2");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const cidKey = "scrobbleSubmitV2" in Env.cids ? "scrobbleSubmitV2" : "scrobbleSubmit";
  const actionCid = Env.cids[cidKey];
  console.log(`   Action CID:  ${actionCid || "(not deployed)"}`);

  if (!actionCid) {
    console.error("\nNo scrobbleSubmitV2 action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts scrobbleSubmitV2");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const wallet = new ethers.Wallet(pk);
  const userAddress = wallet.address;
  const userPkpPublicKey = ethers.SigningKey.computePublicKey(pk, false);
  console.log(`   User (EOA):  ${userAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "scrobble-submit-v2-test",
      networkName: Env.name,
      storagePath: "./output/lit-auth",
    }),
  });

  console.log("\nAuthenticating EOA...");
  const authData = await ViemAccountAuthenticator.authenticate(authEoa);

  console.log("Creating PKP auth context...");
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
  console.log("Auth context ready");

  // ── Build test tracks (3 buckets) ──────────────────────────────────

  const now = Math.floor(Date.now() / 1000);
  const tracks = [
    // MBID bucket — MusicBrainz recording UUID
    {
      artist: "Mariya Takeuchi",
      title: "Plastic Love",
      playedAt: now - 600,
      mbid: "b1a9c02e-b35c-4f18-9f04-0e4d0e3409c3", // real MBID
    },
    // ipId bucket — Story Protocol IP Account
    {
      artist: "Heaven Original",
      title: "Decentralized Love",
      playedAt: now - 300,
      ipId: "0x1234567890abcdef1234567890abcdef12345678",
    },
    // Metadata bucket — unidentified track
    {
      artist: "Unknown Artist",
      title: "Mystery Track",
      album: "Lost Tapes",
      playedAt: now,
    },
  ];

  console.log(`\n   Tracks:      ${tracks.length}`);
  for (const t of tracks) {
    console.log(`     ${t.artist} - ${t.title}`);
    if ("mbid" in t) console.log(`       MBID: ${t.mbid}`);
    if ("ipId" in t) console.log(`       ipId: ${t.ipId}`);
    if (!("mbid" in t) && !("ipId" in t)) console.log(`       (metadata only)`);
  }

  // ── Compute signature ──────────────────────────────────────────────

  async function sha256Hex(message: string): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  const tracksHash = await sha256Hex(JSON.stringify(tracks));
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();

  const message = `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  console.log(`\n   Tracks hash: ${tracksHash.slice(0, 16)}...`);
  console.log(`   Timestamp:   ${timestamp}`);
  console.log(`   Nonce:       ${nonce}`);

  // ── Execute Lit Action ─────────────────────────────────────────────

  const jsParams = {
    userPkpPublicKey,
    tracks,
    signature,
    timestamp,
    nonce,
  };

  console.log("\nExecuting Lit Action...");
  const t0 = performance.now();

  try {
    const result = await litClient.executeJs({
      ipfsId: actionCid,
      authContext,
      jsParams,
    });

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`Lit Action executed in ${elapsed}s`);

    const response =
      typeof result.response === "string" ? JSON.parse(result.response) : result.response;

    console.log("\nAction response:");
    console.log(JSON.stringify(response, null, 2));

    if (!response?.success) {
      throw new Error(response?.error || "action returned success=false");
    }

    // ── Verify response ────────────────────────────────────────────

    console.log("\nSUCCESS!");
    console.log(`   Version:     ${response.version}`);
    console.log(`   User:        ${response.user}`);
    console.log(`   Count:       ${response.count}`);
    console.log(`   Buckets:     mbid=${response.buckets?.mbid} ipId=${response.buckets?.ipId} meta=${response.buckets?.meta}`);

    // Version
    if (response.version !== "scrobble-submit-v2") {
      throw new Error(`Unexpected version: ${response.version}`);
    }
    console.log("   Version correct");

    // User
    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${userAddress}, got ${response.user}`);
    }
    console.log("   User matches");

    // Count
    if (response.count !== tracks.length) {
      throw new Error(`Count mismatch: expected ${tracks.length}, got ${response.count}`);
    }
    console.log("   Count matches");

    // Bucket counts
    if (response.buckets?.mbid !== 1 || response.buckets?.ipId !== 1 || response.buckets?.meta !== 1) {
      throw new Error(`Bucket mismatch: expected {1,1,1}, got ${JSON.stringify(response.buckets)}`);
    }
    console.log("   Bucket counts correct");

    // TX hashes
    const txHashes = response.txHashes || {};
    console.log(`\n   TX Hashes:`);
    for (const [bucket, hash] of Object.entries(txHashes)) {
      console.log(`     ${bucket}: ${hash}`);
    }

    // Verify on MegaETH
    const provider = new ethers.JsonRpcProvider("https://carrot.megaeth.com/rpc");
    for (const [bucket, hash] of Object.entries(txHashes) as [string, string][]) {
      console.log(`\n   Verifying ${bucket} tx on MegaETH...`);
      const receipt = await provider.getTransactionReceipt(hash);
      if (receipt && receipt.status === 1) {
        console.log(`     Confirmed in block ${receipt.blockNumber} (${receipt.logs.length} log(s))`);
      } else if (receipt && receipt.status === 0) {
        throw new Error(`TX reverted: ${hash}`);
      } else {
        console.warn(`     TX not confirmed yet (may need more time)`);
      }
    }

    console.log("\nAll checks passed!");

  } catch (error: any) {
    console.error("\nExecution failed:", error.message);
    if (error.cause) console.error("   Cause:", error.cause);
    process.exit(1);
  }

  await litClient.disconnect();
}

main().catch((e) => {
  console.error("\nFAIL:", e?.message || e);
  process.exit(1);
});
