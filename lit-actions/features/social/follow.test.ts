#!/usr/bin/env bun
/**
 * Test Follow v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification
 *  - Sponsor PKP broadcasts followFor()/unfollowFor() on MegaETH
 *  - Returns txHash + action confirmation
 *
 * Usage:
 *   bun features/social/follow.test.ts                  # Full test (broadcast follow)
 *   bun features/social/follow.test.ts --unfollow       # Test unfollow
 *   bun features/social/follow.test.ts --dry-run        # Verify sig only, no broadcast
 *
 * Prerequisites:
 *   - Deploy action: bun scripts/setup.ts followV1
 *   - Deploy FollowV1 contract + update address in follow-v1.js
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
const doUnfollow = args.includes("--unfollow");

async function main() {
  const action = doUnfollow ? "unfollow" : "follow";

  console.log("Test Follow v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  console.log(`   Action:      ${action}`);
  console.log(`   Dry run:     ${dryRun}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(
    `   Action CID:  ${Env.cids.followV1 || "(not deployed)"}`
  );

  if (!Env.cids.followV1) {
    console.error(
      "\nNo followV1 action CID found. Run setup.ts first:"
    );
    console.error("   bun scripts/setup.ts followV1");
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

  // Use a deterministic target address for testing (seed profile "yuki")
  const targetAddress = "0x9456aec64179FE39a1d0a681de7613d5955E75D3";
  console.log(`   Target:      ${targetAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "follow-test",
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
  const checksumTarget = ethers.getAddress(targetAddress);

  const message = `heaven:follow:${checksumTarget}:${action}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  console.log(`\n   Message:     ${message.slice(0, 60)}...`);
  console.log(`   Timestamp:   ${timestamp}`);
  console.log(`   Nonce:       ${nonce}`);

  // ── Execute Lit Action ───────────────────────────────────────────
  const jsParams: any = {
    userPkpPublicKey,
    targetAddress: checksumTarget,
    action,
    signature,
    timestamp,
    nonce,
    dryRun,
  };

  console.log("\nExecuting Lit Action...");
  const t0 = performance.now();

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.followV1,
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
    console.log(`   Target:      ${response.targetAddress}`);
    console.log(`   Action:      ${response.action}`);

    // Verify user address matches
    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(
        `User mismatch: expected ${userAddress}, got ${response.user}`
      );
    }
    console.log("   User addr:   matches");

    // Verify action matches
    if (response.action !== action) {
      throw new Error(
        `Action mismatch: expected ${action}, got ${response.action}`
      );
    }
    console.log("   Action:      matches");

    // Verify target matches
    if (response.targetAddress.toLowerCase() !== checksumTarget.toLowerCase()) {
      throw new Error(
        `Target mismatch: expected ${checksumTarget}, got ${response.targetAddress}`
      );
    }
    console.log("   Target:      matches");

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
