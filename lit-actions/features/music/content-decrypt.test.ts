#!/usr/bin/env bun
/**
 * Test Content Decrypt — full encrypt → decrypt round-trip
 *
 * Verifies:
 *  1. Register content on MegaETH (content-register-v2 or v1)
 *  2. Encrypt a test AES key with Lit using :currentActionIpfsId ACC
 *     (bound to content-decrypt-v1 CID)
 *  3. Decrypt via content-decrypt-v1 Lit Action (server-side decryptAndCombine)
 *  4. Verify decrypted key matches original
 *
 * Usage:
 *   bun features/music/content-decrypt.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { randomBytes, hexlify, keccak256, AbiCoder } from "ethers";

const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * Build ACC bound to content-decrypt-v1 CID.
 * Only the decrypt Lit Action can call decryptAndCombine.
 * The action itself enforces canAccess() on MegaETH.
 */
function buildAccessConditions(decryptCid: string) {
  return [
    {
      conditionType: "evmBasic" as const,
      contractAddress: "",
      standardContractType: "",
      chain: "ethereum",
      method: "",
      parameters: [":currentActionIpfsId"],
      returnValueTest: { comparator: "=", value: decryptCid },
    },
  ];
}

async function main() {
  console.log("Test Content Decrypt (encrypt → decrypt round-trip)");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const registerCid = Env.cids["contentRegisterV2"] || Env.cids["contentRegisterV1"];
  const registerVersion = Env.cids["contentRegisterV2"] ? "v2" : "v1";
  const decryptCid = Env.cids["contentDecryptV1"];
  console.log(`   Register CID:  ${registerCid || "(not deployed)"} (${registerVersion})`);
  console.log(`   Decrypt CID:   ${decryptCid || "(not deployed)"}`);

  if (!registerCid) {
    console.error("\nMissing register action CID.");
    process.exit(1);
  }
  if (!decryptCid) {
    console.error("\nMissing content-decrypt-v1 CID. Run setup.ts contentDecryptV1 first.");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const userPkpPublicKey = pkpCreds.publicKey;
  const userAddress = pkpCreds.ethAddress;
  console.log(`   User (PKP):    ${userAddress}`);

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
  const pkpAuthContext = await authManager.createPkpAuthContext({
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
    // STEP 1: Register content (creates canAccess on MegaETH)
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
      authContext: pkpAuthContext,
      jsParams: {
        userPkpPublicKey,
        trackId,
        pieceCid,
        algo: 1,
        ...(registerVersion === "v1" ? { title: "Decrypt Test", artist: "Test Artist" } : {}),
        timestamp: Date.now(),
        nonce: Math.floor(Math.random() * 1e6).toString(),
      },
    });

    const registerResp = JSON.parse(registerResult.response as string);
    if (!registerResp.success) {
      throw new Error(`Register failed: ${registerResp.error}`);
    }
    console.log(`   ✓ Registered on MegaETH (tx: ${registerResp.txHash})`);

    // ══════════════════════════════════════════════════════════════
    // STEP 2: Encrypt a test AES key with :currentActionIpfsId ACC
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 2: Encrypt AES key with Lit ──");

    const testKeyBytes = randomBytes(32);
    const testKeyBase64 = Buffer.from(testKeyBytes).toString("base64");
    console.log(`   Test key:    ${testKeyBase64.slice(0, 20)}...`);

    const payload = JSON.stringify({ contentId, key: testKeyBase64 });
    const acc = buildAccessConditions(decryptCid);

    const encryptedData = await litClient.encrypt({
      accessControlConditions: acc,
      dataToEncrypt: new TextEncoder().encode(payload),
    });

    console.log(`   ✓ Encrypted with Lit (ct: ${encryptedData.ciphertext.slice(0, 30)}...)`);
    console.log(`   dataToEncryptHash: ${encryptedData.dataToEncryptHash}`);

    // ══════════════════════════════════════════════════════════════
    // STEP 3: Decrypt via content-decrypt-v1 Lit Action
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 3: Decrypt via content-decrypt-v1 Lit Action ──");

    const timestamp = Date.now();
    const nonce = Math.floor(Math.random() * 1e6).toString();

    const decryptResult = await litClient.executeJs({
      ipfsId: decryptCid,
      authContext: pkpAuthContext,
      jsParams: {
        userPkpPublicKey,
        contentId,
        ciphertext: encryptedData.ciphertext,
        dataToEncryptHash: encryptedData.dataToEncryptHash,
        decryptCid,
        timestamp,
        nonce,
      },
    });

    const decryptResp = JSON.parse(decryptResult.response as string);
    if (!decryptResp.success) {
      throw new Error(`Decrypt failed: ${decryptResp.error}`);
    }
    console.log(`   ✓ Decrypted payload (${decryptResp.decryptedPayload.length} chars)`);

    // ══════════════════════════════════════════════════════════════
    // STEP 4: Verify decrypted key matches original
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 4: Verify ──");

    const parsed = JSON.parse(decryptResp.decryptedPayload);
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
