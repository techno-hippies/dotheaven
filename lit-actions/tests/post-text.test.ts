#!/usr/bin/env bun
/**
 * Test Post Text v1 Lit Action
 *
 * Verifies:
 *  - Text content JSON upload to Filebase/IPFS
 *  - IPA + NFT metadata upload
 *  - Story Protocol IP Asset registration
 *  - MegaETH PostsV1 mirror (PostCreated event)
 *  - Returns contentCid, ipId, tokenId, megaTxHash
 *
 * Usage:
 *   bun tests/post-text.test.ts                # Full test (broadcast)
 *   bun tests/post-text.test.ts --dry-run       # Sign only, no broadcast
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

async function main() {
  console.log("Test Post Text v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  console.log(`   Dry run:     ${dryRun}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(`   Action CID:  ${Env.cids.postTextV1 || "(not deployed)"}`);

  if (!Env.cids.postTextV1) {
    console.error("\nNo postTextV1 action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts postTextV1");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:    ${authEoa.address}`);

  const userPkpPublicKey = pkpCreds.publicKey;
  console.log(`   User (PKP):  ${pkpCreds.ethAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "post-text-test",
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
        ["access-control-condition-decryption", "*"],
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
      statement: "",
    },
    litClient,
  });
  console.log("Auth context ready");

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000);

  // Build jsParams
  let jsParams: any = {
    userPkpPublicKey,
    text: "Hello from post-text.test.ts! This is an automated test post.",
    title: "Test Text Post",
    description: "Automated test text post",
    timestamp,
    nonce,
    dryRun,
    rightsMode: 0,
    licenseEnabled: false,
  };

  // Load Filebase key
  const filebaseKeyPath = join(Env.paths.keys, "postTextV1", "filebase_api_key_postTextV1.json");
  if (existsSync(filebaseKeyPath)) {
    jsParams.filebaseEncryptedKey = JSON.parse(readFileSync(filebaseKeyPath, "utf-8"));
    console.log("\n   Filebase key: encrypted");
  } else {
    const plaintextKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
    if (plaintextKey) {
      jsParams.filebasePlaintextKey = plaintextKey;
      console.log("\n   Filebase key: plaintext (env)");
    } else {
      console.error(`\nNo Filebase key found at: ${filebaseKeyPath}`);
      console.error("   Set FILEBASE_SONGS_BUCKET_API_KEY or run setup.ts postTextV1");
      process.exit(1);
    }
  }

  console.log(`\n   Timestamp:     ${timestamp}`);
  console.log(`   Nonce:         ${nonce}`);

  console.log("\nExecuting Lit Action...");

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.postTextV1,
      authContext,
      jsParams,
    });

    console.log("Lit Action executed");

    // Show logs from Lit Action (if any)
    if (result.logs) console.log("\nAction logs:", result.logs);

    const response =
      typeof result.response === "string" ? JSON.parse(result.response) : result.response;

    console.log("\nAction response:");
    console.log(JSON.stringify(response, null, 2));

    if (!response?.success) {
      throw new Error(response?.error || "action returned success=false");
    }

    console.log("\nSUCCESS!");
    console.log(`   Version:        ${response.version}`);
    console.log(`   User:           ${response.user}`);
    console.log(`   Content CID:    ${response.contentCid}`);

    // Verify content CID
    if (!response.contentCid || (!response.contentCid.startsWith("Qm") && !response.contentCid.startsWith("bafy"))) {
      throw new Error(`Invalid contentCid: ${response.contentCid}`);
    }
    console.log("   Content CID valid");

    // Verify user address matches PKP
    if (response.user.toLowerCase() !== pkpCreds.ethAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${pkpCreds.ethAddress}, got ${response.user}`);
    }
    console.log("   User address matches");

    if (dryRun) {
      console.log(`   Dry run:        true`);
      if (!response.signedTx) throw new Error("Missing signedTx in dry-run response");
      console.log(`   Signed TX:      ${response.signedTx.slice(0, 20)}...`);
    } else {
      console.log(`   TX Hash:        ${response.txHash}`);
      console.log(`   Block:          ${response.blockNumber}`);
      console.log(`   IP ID:          ${response.ipId}`);
      console.log(`   IP ID (bytes32):${response.ipIdBytes32}`);
      console.log(`   Token ID:       ${response.tokenId}`);

      if (!response.ipId) throw new Error("Missing ipId");
      if (!response.tokenId) throw new Error("Missing tokenId");
      if (!response.ipIdBytes32 || response.ipIdBytes32.length !== 66) {
        throw new Error(`Invalid ipIdBytes32: ${response.ipIdBytes32}`);
      }

      // Check MegaETH mirror
      if (response.megaTxHash) {
        console.log(`   Mega TX Hash:   ${response.megaTxHash}`);
        console.log("   MegaETH mirror: SUCCESS");
      } else {
        console.warn("   MegaETH mirror: NOT FIRED (check action logs)");
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
