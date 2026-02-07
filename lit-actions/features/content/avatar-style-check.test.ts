#!/usr/bin/env bun
/**
 * Test Avatar Upload v1 — Style Check
 *
 * Verifies the style check rejects realistic photos and allows anime/stylized images.
 * Uses fixture images from fixtures/ directory.
 *
 * Expected results:
 *  - anime-photo.png → ALLOWED (uploaded successfully)
 *  - real-photo.png  → REJECTED (realistic photo of human)
 *
 * Usage:
 *   bun tests/avatar-style-check.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../../");

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface TestCase {
  name: string;
  file: string;
  expectAllowed: boolean;
}

const TESTS: TestCase[] = [
  { name: "anime avatar", file: "fixtures/anime-photo-small.png", expectAllowed: true },
  { name: "real photo", file: "fixtures/real-photo-small.png", expectAllowed: false },
];

async function main() {
  console.log("Test Avatar Upload v1 — Style Check");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const wallet = new ethers.Wallet(pk);
  const userPkpPublicKey = ethers.SigningKey.computePublicKey(pk, false);
  console.log(`   Auth EOA:    ${authEoa.address}`);
  console.log(`   User (EOA):  ${wallet.address}`);

  // Get Filebase + OpenRouter keys
  const filebaseKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
  if (!filebaseKey) throw new Error("FILEBASE_SONGS_BUCKET_API_KEY not set");
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not set");

  // Load action code (inline — haven't redeployed to IPFS yet)
  const actionCode = readFileSync(join(ROOT_DIR, "features/content/avatar-upload-v1.js"), "utf-8");
  console.log(`   Action:      inline (${actionCode.length} bytes)`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "avatar-style-test",
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

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`TEST: ${test.name} (${test.file})`);
    console.log(`   Expect: ${test.expectAllowed ? "ALLOWED" : "REJECTED"}`);

    const imagePath = join(ROOT_DIR, test.file);
    const imageBytes = new Uint8Array(readFileSync(imagePath));
    const imageBase64 = toBase64(imageBytes);
    const imageHash = await sha256Hex(imageBytes);

    console.log(`   Size:   ${imageBytes.length} bytes`);
    console.log(`   Hash:   ${imageHash.slice(0, 16)}...`);

    const timestamp = Date.now();
    const nonce = Math.floor(Math.random() * 1_000_000_000).toString();
    const message = `heaven:avatar:${imageHash}:${timestamp}:${nonce}`;
    const signature = await wallet.signMessage(message);

    const jsParams: any = {
      userPkpPublicKey,
      imageUrl: { base64: imageBase64, contentType: "image/png" },
      signature,
      timestamp,
      nonce,
      filebasePlaintextKey: filebaseKey,
      openrouterPlaintextKey: openrouterKey,
    };

    console.log("   Executing Lit Action...");

    try {
      const result = await litClient.executeJs({
        code: actionCode,
        authContext,
        jsParams,
      });

      const response =
        typeof result.response === "string"
          ? JSON.parse(result.response)
          : result.response;

      if (test.expectAllowed) {
        if (response.success) {
          console.log(`   PASS: Allowed as expected`);
          console.log(`   Avatar CID: ${response.avatarCID}`);
          passed++;
        } else {
          console.error(`   FAIL: Expected allowed but got rejected: ${response.error}`);
          failed++;
        }
      } else {
        if (!response.success && response.error?.includes("realistic photos")) {
          console.log(`   PASS: Rejected as expected`);
          console.log(`   Error: ${response.error}`);
          passed++;
        } else if (response.success) {
          console.error(`   FAIL: Expected rejection but upload succeeded (CID: ${response.avatarCID})`);
          failed++;
        } else {
          console.error(`   FAIL: Rejected but wrong error: ${response.error}`);
          failed++;
        }
      }
    } catch (error: any) {
      console.error(`   ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  await litClient.disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\nFAIL:", e?.message || e);
  process.exit(1);
});
