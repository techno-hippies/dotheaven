#!/usr/bin/env bun
/**
 * Test Avatar Upload v1 Lit Action
 *
 * Verifies:
 *  - Internal PKP signing (no pre-signature)
 *  - Image uploaded to Filebase IPFS
 *  - Returns valid CID
 *
 * Usage:
 *   bun tests/avatar-upload.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

async function main() {
  console.log("Test Avatar Upload v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(`   Action CID:  ${Env.cids.avatarUpload || "(not deployed)"}`);

  if (!Env.cids.avatarUpload) {
    console.error("\nNo avatarUpload action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts avatarUpload");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:    ${authEoa.address}`);

  // Use sponsor PKP as the "user" since internal signing requires
  // the auth context to authorize the user's PKP key
  const userPkpPublicKey = pkpCreds.publicKey;
  console.log(`   User (PKP):  ${pkpCreds.ethAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "avatar-upload-test",
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

  // Build test data: tiny PNG as inline base64
  // Minimal valid 1x1 red PNG
  const testPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, // compressed pixel
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, // ...
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const imageUrl = { base64: toBase64(testPng), contentType: "image/png" };

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000);

  // Build jsParams (internal signing — no pre-signature needed)
  let jsParams: any = {
    userPkpPublicKey,
    imageUrl,
    timestamp,
    nonce,
    skipStyleCheck: true,
  };

  const keyPath = join(Env.paths.keys, "avatarUpload", "filebase_api_key_avatarUpload.json");
  if (existsSync(keyPath)) {
    jsParams.filebaseEncryptedKey = JSON.parse(readFileSync(keyPath, "utf-8"));
    console.log("\n   Mode: Real upload (encrypted Filebase key)");
  } else {
    const plaintextKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
    if (plaintextKey) {
      jsParams.filebasePlaintextKey = plaintextKey;
      console.log("\n   Mode: Real upload (plaintext Filebase key from env)");
    } else {
      console.error(`\nNo Filebase key found at: ${keyPath}`);
      console.error("   Set FILEBASE_SONGS_BUCKET_API_KEY or run setup.ts avatarUpload");
      process.exit(1);
    }
  }

  console.log(`\n   Timestamp:     ${timestamp}`);
  console.log(`   Nonce:         ${nonce}`);

  console.log("\nExecuting Lit Action...");

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.avatarUpload,
      authContext,
      jsParams,
    });

    console.log("Lit Action executed");

    const response =
      typeof result.response === "string" ? JSON.parse(result.response) : result.response;

    console.log("\nAction response:");
    console.log(JSON.stringify(response, null, 2));

    if (!response?.success) {
      throw new Error(response?.error || "action returned success=false");
    }

    console.log("\nSUCCESS!");
    console.log(`   Version:      ${response.version}`);
    console.log(`   User:         ${response.user}`);
    console.log(`   Avatar CID:   ${response.avatarCID}`);
    console.log(`   Image Hash:   ${response.imageHash}`);

    // Verify CID is valid
    if (!response.avatarCID || (!response.avatarCID.startsWith("Qm") && !response.avatarCID.startsWith("bafy"))) {
      throw new Error(`Invalid CID: ${response.avatarCID}`);
    }
    console.log("\n   CID valid");

    // Verify user address matches sponsor PKP
    if (response.user.toLowerCase() !== pkpCreds.ethAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${pkpCreds.ethAddress}, got ${response.user}`);
    }
    console.log("   User address matches");

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
