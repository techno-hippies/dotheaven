#!/usr/bin/env bun
/**
 * Test Content Decrypt — full encrypt → decrypt round-trip
 *
 * Verifies:
 *  1. Register content on both chains (content-register-v1)
 *  2. Encrypt a test AES key with Lit using contract-gated ACC on Base
 *  3. Decrypt via litClient.decrypt() (client-side, Lit BLS enforces condition)
 *  4. Verify decrypted key matches original
 *
 * Note: Decryption uses the SDK's client-side decrypt (not a Lit Action).
 * The Lit nodes still enforce the access condition (canAccess on Base) during
 * BLS threshold decryption. No Lit Action is needed for decrypt because
 * decryptAndCombine in Lit Actions only supports accessControlConditions
 * (evmBasic), not evmContractConditions.
 *
 * Usage:
 *   bun tests/content-decrypt.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { randomBytes, hexlify, keccak256, AbiCoder } from "ethers";

const abiCoder = AbiCoder.defaultAbiCoder();

const CONTENT_ACCESS_MIRROR = "0xd4D3baB38a11D72e36F49a73D50Dbdc3c1Aa4e9A";

function buildAccessConditions(contentId: string) {
  // Unified access control conditions with conditionType: "evmContract"
  // This format is required for both encrypt and decrypt (SDK + Lit Action)
  return [
    {
      conditionType: "evmContract" as const,
      contractAddress: CONTENT_ACCESS_MIRROR,
      chain: "baseSepolia",
      functionName: "canAccess",
      functionParams: [":userAddress", contentId],
      functionAbi: {
        type: "function" as const,
        name: "canAccess",
        stateMutability: "view" as const,
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
}

async function main() {
  console.log("Test Content Decrypt (encrypt → decrypt round-trip)");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const registerCid = Env.cids["contentRegisterV1"];
  console.log(`   Register CID: ${registerCid || "(not deployed)"}`);

  if (!registerCid) {
    console.error("\nMissing register action CID. Run setup.ts first.");
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
        ["access-control-condition-decryption", "*"],
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
    // STEP 2: Encrypt a test AES key with Lit (unified ACC)
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 2: Encrypt AES key with Lit ──");

    const testKeyBytes = randomBytes(32);
    const testKeyBase64 = Buffer.from(testKeyBytes).toString("base64");
    console.log(`   Test key:    ${testKeyBase64.slice(0, 20)}...`);

    const payload = JSON.stringify({ contentId, key: testKeyBase64 });

    // Use unifiedAccessControlConditions — required for both SDK decrypt
    // and Lit Action decryptAndCombine with evmContract conditions
    const unifiedAcc = buildAccessConditions(contentId);

    const encryptedData = await litClient.encrypt({
      unifiedAccessControlConditions: unifiedAcc,
      dataToEncrypt: new TextEncoder().encode(payload),
    });

    console.log(`   ✓ Encrypted with Lit (ct: ${encryptedData.ciphertext.slice(0, 30)}...)`);
    console.log(`   dataToEncryptHash: ${encryptedData.dataToEncryptHash}`);

    // ══════════════════════════════════════════════════════════════
    // STEP 3: Decrypt via litClient.decrypt() (client-side)
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 3: Decrypt via SDK ──");

    // Client-side decrypt — Lit nodes verify canAccess() on Base during BLS
    const decryptResult = await litClient.decrypt({
      unifiedAccessControlConditions: unifiedAcc,
      ciphertext: encryptedData.ciphertext,
      dataToEncryptHash: encryptedData.dataToEncryptHash,
      authContext,
      chain: "baseSepolia",
    });

    const decryptedPayload = new TextDecoder().decode(decryptResult.decryptedData);
    console.log(`   ✓ Decrypted payload (${decryptedPayload.length} chars)`);

    // ══════════════════════════════════════════════════════════════
    // STEP 4: Verify decrypted key matches original
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 4: Verify ──");

    const parsed = JSON.parse(decryptedPayload);
    console.log(`   contentId:   ${parsed.contentId}`);

    if (parsed.contentId?.toLowerCase() !== contentId) {
      throw new Error(`Content ID mismatch: expected ${contentId}, got ${parsed.contentId}`);
    }
    console.log("   ✓ Content ID matches");

    if (parsed.key !== testKeyBase64) {
      throw new Error(`Key mismatch!\n  Expected: ${testKeyBase64}\n  Got:      ${parsed.key}`);
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
