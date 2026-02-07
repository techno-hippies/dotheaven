#!/usr/bin/env bun
/**
 * Test Post Create v1 Lit Action
 *
 * Verifies:
 *  - Content safety gate (vision check)
 *  - AI anime conversion (fal.ai Klein 9B)
 *  - Encrypted original upload + public result upload to Filebase
 *  - Story Protocol IP Asset registration
 *  - Returns CIDs, ipId, tokenId, sourceDecryptionKey
 *
 * Usage:
 *   bun tests/post-create.test.ts                    # Full test (auto-detect mode, broadcast)
 *   bun tests/post-create.test.ts --dry-run           # Sign only, no broadcast
 *   bun tests/post-create.test.ts --anime             # Use anime fixture (expects direct mode)
 *   bun tests/post-create.test.ts --anime --dry-run   # Anime fixture + dry run
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const useAnimeFixture = args.includes("--anime");
const skipSafety = args.includes("--skip-safety");

async function main() {
  console.log("Test Post Create v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  console.log(`   Fixture:     ${useAnimeFixture ? "anime" : "real photo"} (mode auto-detected)`);
  console.log(`   Dry run:     ${dryRun}`);
  console.log(`   Skip safety: ${skipSafety}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(`   Action CID:  ${Env.cids.postCreateV1 || "(not deployed)"}`);

  if (!Env.cids.postCreateV1) {
    console.error("\nNo postCreateV1 action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts postCreateV1");
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
      appName: "post-create-test",
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

  // Load test fixture — real photo triggers AI conversion, anime triggers direct
  const fixtureName = useAnimeFixture ? "anime-photo-small.png" : "real-photo-small.png";
  const fixturePath = join(ROOT_DIR, "fixtures", fixtureName);
  if (!existsSync(fixturePath)) {
    console.error(`\nFixture not found: ${fixturePath}`);
    process.exit(1);
  }
  const testImage = readFileSync(fixturePath);
  console.log(`   Fixture:     ${fixtureName} (${(testImage.length / 1024).toFixed(1)} KB)`);

  const toBase64 = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString("base64");
  const imageUrl = { base64: toBase64(testImage), contentType: "image/png" };

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000);

  // Build jsParams
  let jsParams: any = {
    userPkpPublicKey,
    imageUrl,
    title: "Test Post",
    description: "Automated test post from post-create.test.ts",
    timestamp,
    nonce,
    dryRun,
    skipSafetyCheck: skipSafety,
    rightsMode: 0,
    licenseEnabled: false,
  };

  // Load Filebase key
  const filebaseKeyPath = join(Env.paths.keys, "postCreateV1", "filebase_api_key_postCreateV1.json");
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
      console.error("   Set FILEBASE_SONGS_BUCKET_API_KEY or run setup.ts postCreateV1");
      process.exit(1);
    }
  }

  // Load OpenRouter key (for safety check)
  if (!skipSafety) {
    const orKeyPath = join(Env.paths.keys, "postCreateV1", "openrouter_api_key_postCreateV1.json");
    if (existsSync(orKeyPath)) {
      jsParams.openrouterEncryptedKey = JSON.parse(readFileSync(orKeyPath, "utf-8"));
      console.log("   OpenRouter key: encrypted");
    } else {
      const plaintextKey = process.env.OPENROUTER_API_KEY;
      if (plaintextKey) {
        jsParams.openrouterPlaintextKey = plaintextKey;
        console.log("   OpenRouter key: plaintext (env)");
      } else {
        console.error("\nNo OpenRouter key. Set OPENROUTER_API_KEY or run setup.ts, or use --skip-safety");
        process.exit(1);
      }
    }
  }

  // Load fal.ai key (always — mode is auto-detected, may need conversion)
  const falKeyPath = join(Env.paths.keys, "postCreateV1", "fal_api_key_postCreateV1.json");
  if (existsSync(falKeyPath)) {
    jsParams.falEncryptedKey = JSON.parse(readFileSync(falKeyPath, "utf-8"));
    console.log("   fal.ai key:    encrypted");
  } else {
    const plaintextKey = process.env.FAL_KEY;
    if (plaintextKey) {
      jsParams.falPlaintextKey = plaintextKey;
      console.log("   fal.ai key:    plaintext (env)");
    } else {
      console.warn("   fal.ai key:    NOT FOUND (anime conversion will fail if needed)");
    }
  }

  console.log(`\n   Timestamp:     ${timestamp}`);
  console.log(`   Nonce:         ${nonce}`);

  console.log("\nExecuting Lit Action...");

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.postCreateV1,
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
    console.log(`   Mode:           ${response.mode}`);
    console.log(`   Rights Mode:    ${response.rightsMode}`);
    console.log(`   License:        ${response.licenseEnabled}`);
    console.log(`   Source CID:     ${response.sourceCid}`);
    console.log(`   Result CID:     ${response.resultCid}`);

    // Verify CIDs
    for (const [label, cid] of [
      ["sourceCid", response.sourceCid],
      ["resultCid", response.resultCid],
    ] as const) {
      if (!cid || (!cid.startsWith("Qm") && !cid.startsWith("bafy"))) {
        throw new Error(`Invalid ${label}: ${cid}`);
      }
    }
    console.log("   CIDs valid");

    // Verify user address matches PKP
    if (response.user.toLowerCase() !== pkpCreds.ethAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${pkpCreds.ethAddress}, got ${response.user}`);
    }
    console.log("   User address matches");

    // AI mode: verify decryption key returned
    if (response.mode === "ai") {
      if (!response.sourceDecryptionKey || response.sourceDecryptionKey.length !== 64) {
        throw new Error(`Invalid sourceDecryptionKey: ${response.sourceDecryptionKey?.slice(0, 20)}...`);
      }
      console.log(`   Decrypt key:    ${response.sourceDecryptionKey.slice(0, 8)}...`);
    }

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
