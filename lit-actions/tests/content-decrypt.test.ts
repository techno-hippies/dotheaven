#!/usr/bin/env bun
/**
 * Test Content Decrypt v1 — full encrypt → decrypt round-trip
 *
 * Verifies:
 *  1. Register content on both chains (content-register-v1)
 *  2. Encrypt a test AES key with Lit using contract-gated ACC on Base
 *  3. Decrypt via content-decrypt-v1 Lit Action
 *  4. Verify decrypted key matches original
 *
 * Usage:
 *   bun tests/content-decrypt.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { randomBytes, hexlify, keccak256, AbiCoder } from "ethers";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const abiCoder = AbiCoder.defaultAbiCoder();

const CONTENT_ACCESS_MIRROR = "0x872E8E7E4a4088F41CeB0ccc14a7081D36aF5aa4";

async function main() {
  console.log("Test Content Decrypt v1 (encrypt → decrypt round-trip)");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const registerCid = Env.cids["contentRegisterV1"];
  const decryptCid = Env.cids["contentDecryptV1"];
  console.log(`   Register CID: ${registerCid || "(not deployed)"}`);
  console.log(`   Decrypt CID:  ${decryptCid || "(not deployed)"}`);

  if (!registerCid || !decryptCid) {
    console.error("\nMissing action CIDs. Run setup.ts first.");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const userPkpPublicKey = pkpCreds.publicKey;
  const userAddress = pkpCreds.ethAddress;
  console.log(`   User (PKP):   ${userAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "content-decrypt-test",
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

  const t0 = performance.now();

  try {
    // ══════════════════════════════════════════════════════════════
    // STEP 1: Register content (creates canAccess on both chains)
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 1: Register content ──");

    const trackId = hexlify(randomBytes(32));
    const pieceCid = "baga6ea4seaqtest" + Date.now().toString(36);
    const contentId = keccak256(
      abiCoder.encode(["bytes32", "address"], [trackId, userAddress])
    ).toLowerCase();

    console.log(`   trackId:     ${trackId}`);
    console.log(`   contentId:   ${contentId}`);

    const registerResult = await litClient.executeJs({
      ipfsId: registerCid,
      authContext,
      jsParams: {
        userPkpPublicKey,
        trackId,
        pieceCid,
        algo: 1,
        timestamp: Date.now(),
        nonce: Math.floor(Math.random() * 1e6).toString(),
      },
    });

    const registerResp = JSON.parse(registerResult.response as string);
    if (!registerResp.success) {
      throw new Error(`Register failed: ${registerResp.error}`);
    }
    console.log(`   ✓ Registered on both chains`);

    // ══════════════════════════════════════════════════════════════
    // STEP 2: Encrypt a test AES key with Lit (contract-gated ACC)
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 2: Encrypt AES key with Lit ──");

    // Generate a random 32-byte AES key and encode as base64
    const testKeyBytes = randomBytes(32);
    const testKeyBase64 = Buffer.from(testKeyBytes).toString("base64");
    console.log(`   Test key:    ${testKeyBase64.slice(0, 20)}...`);

    // Build the payload (must match what content-decrypt-v1 expects)
    const payload = JSON.stringify({ contentId, key: testKeyBase64 });

    // Contract-gated ACC matching the production encrypt path
    const accessControlConditions = [
      {
        conditionType: "evmContract",
        contractAddress: CONTENT_ACCESS_MIRROR,
        chain: "baseSepolia",
        functionName: "canAccess",
        functionParams: [":userAddress", contentId],
        functionAbi: {
          type: "function",
          name: "canAccess",
          stateMutability: "view",
          inputs: [
            { type: "address", name: "user", internalType: "address" },
            { type: "bytes32", name: "contentId", internalType: "bytes32" },
          ],
          outputs: [
            { type: "bool", name: "", internalType: "bool" },
          ],
        },
        returnValueTest: { key: "", comparator: "=", value: "true" },
      },
    ];

    const { ciphertext, dataToEncryptHash } = await litClient.encrypt({
      unifiedAccessControlConditions: accessControlConditions,
      dataToEncrypt: new TextEncoder().encode(payload),
      authContext,
    });

    console.log(`   ✓ Encrypted with Lit (ct: ${ciphertext.slice(0, 30)}...)`);

    // ══════════════════════════════════════════════════════════════
    // STEP 3: Decrypt via content-decrypt-v1 Lit Action
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 3: Decrypt via Lit Action ──");

    const decryptResult = await litClient.executeJs({
      ipfsId: decryptCid,
      authContext,
      jsParams: {
        userPkpPublicKey,
        contentId,
        timestamp: Date.now(),
        nonce: Math.floor(Math.random() * 1e6).toString(),
        ciphertext,
        dataToEncryptHash,
        unifiedAccessControlConditions: accessControlConditions,
      },
    });

    const decryptResp = JSON.parse(decryptResult.response as string);
    console.log("\nDecrypt response:");
    console.log(JSON.stringify(decryptResp, null, 2));

    if (!decryptResp.success) {
      throw new Error(`Decrypt failed: ${decryptResp.error}`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 4: Verify decrypted key matches original
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 4: Verify ──");

    console.log(`   Version:      ${decryptResp.version}`);
    console.log(`   User:         ${decryptResp.user}`);

    if (decryptResp.version !== "content-decrypt-v1") {
      throw new Error(`Unexpected version: ${decryptResp.version}`);
    }
    console.log("   ✓ Version correct");

    if (decryptResp.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${userAddress}, got ${decryptResp.user}`);
    }
    console.log("   ✓ User matches");

    if (decryptResp.key !== testKeyBase64) {
      throw new Error(`Key mismatch!\n  Expected: ${testKeyBase64}\n  Got:      ${decryptResp.key}`);
    }
    console.log("   ✓ Decrypted key matches original AES key");

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`\n${"=".repeat(60)}`);
    console.log(`ALL CHECKS PASSED (${elapsed}s)`);
    console.log("=".repeat(60));
  } catch (err: any) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.error(`\nFAILED after ${elapsed}s:`);
    console.error(err.message || err);
    process.exit(1);
  } finally {
    litClient.disconnect();
  }
}

main();
