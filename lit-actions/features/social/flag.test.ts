#!/usr/bin/env bun
/**
 * Test Flag v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification
 *  - Sponsor PKP broadcasts flagFor() on MegaETH
 *  - Returns txHash + reason confirmation
 *
 * Usage:
 *   bun features/social/flag.test.ts                  # Full test (broadcast flag, reason=0 spam)
 *   bun features/social/flag.test.ts --reason=1       # Flag as abuse
 *   bun features/social/flag.test.ts --reason=2       # Flag as nsfw
 *   bun features/social/flag.test.ts --dry-run        # Verify sig only, no broadcast
 *
 * Prerequisites:
 *   - Deploy action: bun scripts/setup.ts flagV1
 *   - PRIVATE_KEY env var
 */

import { createLitClient } from "@lit-protocol/lit-client";
import {
  createAuthManager,
  storagePlugins,
  ViemAccountAuthenticator,
} from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { ethers } from "ethers";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const reasonArg = args.find((a) => a.startsWith("--reason="));
const reason = reasonArg ? parseInt(reasonArg.split("=")[1], 10) : 0; // 0=spam by default

const REASON_LABELS: Record<number, string> = {
  0: "spam",
  1: "abuse",
  2: "nsfw",
  3: "other",
};

async function main() {
  console.log("Test Flag v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  console.log(`   Reason:      ${reason} (${REASON_LABELS[reason] ?? "unknown"})`);
  console.log(`   Dry run:     ${dryRun}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(
    `   Action CID:  ${Env.cids.flagV1 || "(not deployed)"}`
  );

  if (!Env.cids.flagV1) {
    console.error(
      "\nNo flagV1 action CID found. Run setup.ts first:"
    );
    console.error("   bun scripts/setup.ts flagV1");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:    ${authEoa.address}`);

  const wallet = new ethers.Wallet(pk);
  const userAddress = wallet.address;
  const userPkpPublicKey = ethers.SigningKey.computePublicKey(pk, false);
  console.log(`   User (EOA):  ${userAddress}`);

  // Use a known postId from seeded data
  const postId = "0x" + ethers.keccak256(ethers.toUtf8Bytes("heaven:test-flag-post")).slice(2);
  console.log(`   Post ID:     ${postId}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "flag-test",
      networkName: Env.name,
      storagePath: "./output/lit-auth",
    }),
  });

  console.log("\nAuthenticating EOA...");
  const authData = await ViemAccountAuthenticator.authenticate(authEoa);
  console.log("Auth data created");

  console.log("\nCreating PKP auth context...");
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

  // ── Build signature ──────────────────────────────────────────────
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).slice(2);

  const message = `heaven:flag:${postId}:${reason}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  console.log(`\n   Message:     ${message.slice(0, 60)}...`);
  console.log(`   Timestamp:   ${timestamp}`);
  console.log(`   Nonce:       ${nonce}`);

  // ── Execute Lit Action ───────────────────────────────────────────
  const jsParams: any = {
    userPkpPublicKey,
    postId,
    reason,
    signature,
    timestamp,
    nonce,
    dryRun,
  };

  console.log("\nExecuting Lit Action...");
  const t0 = performance.now();

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.flagV1,
      authContext,
      jsParams,
    });

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`Lit Action executed in ${elapsed}s`);

    if (result.logs) console.log("\nAction logs:", result.logs);

    const response =
      typeof result.response === "string"
        ? JSON.parse(result.response)
        : result.response;

    console.log("\nAction response:");
    console.log(JSON.stringify(response, null, 2));

    if (!response?.success) {
      throw new Error(response?.error || "action returned success=false");
    }

    console.log("\nSUCCESS!");
    console.log(`   Version:     ${response.version}`);
    console.log(`   User:        ${response.user}`);
    console.log(`   Post ID:     ${response.postId}`);
    console.log(`   Reason:      ${response.reason} (${REASON_LABELS[response.reason] ?? "unknown"})`);

    // Verify user address matches
    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(
        `User mismatch: expected ${userAddress}, got ${response.user}`
      );
    }
    console.log("   User addr:   matches");

    // Verify postId matches
    if (response.postId !== postId) {
      throw new Error(
        `PostId mismatch: expected ${postId}, got ${response.postId}`
      );
    }
    console.log("   Post ID:     matches");

    // Verify reason matches
    if (response.reason !== reason) {
      throw new Error(
        `Reason mismatch: expected ${reason}, got ${response.reason}`
      );
    }
    console.log("   Reason:      matches");

    if (dryRun) {
      console.log("   Dry run:     true (no broadcast)");
    } else {
      if (response.txHash) {
        console.log(`   TX Hash:     ${response.txHash}`);
        console.log(
          `   Explorer:    https://megaeth-testnet-v2.blockscout.com/tx/${response.txHash}`
        );
      } else {
        throw new Error("Missing txHash in response");
      }
    }

    console.log("\nAll checks passed!");
  } catch (error: any) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.error(`\nLit Action failed after ${elapsed}s:`, error.message);
    if (error.errorKind) console.error("Error kind:", error.errorKind);
    process.exit(1);
  } finally {
    await litClient.disconnect();
  }
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
