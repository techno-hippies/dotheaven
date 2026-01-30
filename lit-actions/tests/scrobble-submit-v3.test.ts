#!/usr/bin/env bun
/**
 * Test Scrobble Submit v3 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification over tracks digest
 *  - Track registration (kind/payload/trackId computation)
 *  - Sponsor PKP broadcasts registerAndScrobbleBatch on MegaETH
 *  - Returns tx hash + registration/scrobble counts
 *
 * Usage:
 *   bun tests/scrobble-submit-v3.test.ts
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
  console.log("Test Scrobble Submit v3");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const actionCid = Env.cids["scrobbleSubmitV3"];
  console.log(`   Action CID:  ${actionCid || "(not deployed)"}`);

  if (!actionCid) {
    console.error("\nNo scrobbleSubmitV3 action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts scrobbleSubmitV3");
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
      appName: "scrobble-submit-v3-test",
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

  // ── Build test tracks (3 kinds) ──────────────────────────────────

  const now = Math.floor(Date.now() / 1000);
  const tracks = [
    // Kind 1 (MBID) — MusicBrainz recording UUID
    {
      artist: "Mariya Takeuchi",
      title: "Plastic Love",
      album: "Variety",
      playedAt: now - 600,
      mbid: "b1a9c02e-b35c-4f18-9f04-0e4d0e3409c3",
    },
    // Kind 2 (ipId) — Story Protocol IP Account
    {
      artist: "Heaven Original",
      title: "Decentralized Love",
      album: "Web3 Sessions",
      playedAt: now - 300,
      ipId: "0x1234567890abcdef1234567890abcdef12345678",
    },
    // Kind 3 (meta) — unidentified track
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
    if ("mbid" in t) console.log(`       Kind 1 (MBID): ${t.mbid}`);
    else if ("ipId" in t) console.log(`       Kind 2 (ipId): ${t.ipId}`);
    else console.log(`       Kind 3 (meta)`);
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
    console.log(`   Registered:  ${response.registered}`);
    console.log(`   Scrobbled:   ${response.scrobbled}`);
    console.log(`   TX Hash:     ${response.txHash}`);
    console.log(`   Block:       ${response.blockNumber}`);

    // Version
    if (response.version !== "scrobble-submit-v3") {
      throw new Error(`Unexpected version: ${response.version}`);
    }
    console.log("   ✓ Version correct");

    // User
    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${userAddress}, got ${response.user}`);
    }
    console.log("   ✓ User matches");

    // Count
    if (response.count !== tracks.length) {
      throw new Error(`Count mismatch: expected ${tracks.length}, got ${response.count}`);
    }
    console.log("   ✓ Count matches");

    // Scrobbled
    if (response.scrobbled !== tracks.length) {
      throw new Error(`Scrobbled mismatch: expected ${tracks.length}, got ${response.scrobbled}`);
    }
    console.log("   ✓ Scrobble count matches");

    // TX hash exists
    if (!response.txHash || !response.txHash.startsWith("0x")) {
      throw new Error("Missing TX hash");
    }
    console.log("   ✓ TX hash present");

    // Verify on MegaETH
    console.log(`\n   Verifying tx on MegaETH...`);
    const provider = new ethers.JsonRpcProvider("https://carrot.megaeth.com/rpc");
    const receipt = await provider.getTransactionReceipt(response.txHash);
    if (receipt && receipt.status === 1) {
      console.log(`   ✓ Confirmed in block ${receipt.blockNumber} (${receipt.logs.length} log(s))`);
    } else if (receipt && receipt.status === 0) {
      throw new Error(`TX reverted: ${response.txHash}`);
    } else {
      console.warn(`   ⚠ TX not confirmed yet (may need more time)`);
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
