#!/usr/bin/env bun
/**
 * Test: Encrypted content sharing with EOA user signatures (no user PKP).
 *
 * What this validates:
 * 1. Alice registers encrypted content using `signature` + `userAddress` (no userPkpPublicKey).
 * 2. Bob cannot decrypt before access is granted.
 * 3. Alice grants Bob access via content-access-v1 (signature path).
 * 4. Bob can decrypt after grant.
 * 5. Alice revokes Bob access.
 * 6. Bob cannot decrypt after revoke.
 *
 * Notes:
 * - Lit action execution still uses the app's existing auth context.
 * - User identity/authorization is EOA-signature based.
 *
 * Usage:
 *   bun features/music/content-share-decrypt-eoa.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { randomBytes, hexlify, keccak256, AbiCoder, Wallet } from "ethers";

const abiCoder = AbiCoder.defaultAbiCoder();

async function sha256HexFromBytes(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildDecryptAccessConditions(decryptCid: string) {
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

function normalizeBytes32(v: string): string {
  const raw = v.startsWith("0x") ? v.slice(2) : v;
  return `0x${raw.padStart(64, "0")}`.toLowerCase();
}

async function buildRegisterSignature(params: {
  signer: Wallet;
  trackId: string;
  pieceCid: string;
  datasetOwner: string;
  algo: number;
  timestamp: number;
  nonce: string;
}) {
  const trackId32 = normalizeBytes32(params.trackId);
  const pieceCidHash = await sha256HexFromBytes(new TextEncoder().encode(params.pieceCid));
  const msgDatasetOwner = params.datasetOwner.toLowerCase();
  const message =
    `heaven:content:register:${trackId32}:${pieceCidHash}:${msgDatasetOwner}:${params.algo}:${params.timestamp}:${params.nonce}`;
  return params.signer.signMessage(message);
}

async function buildAccessSignature(params: {
  signer: Wallet;
  operation: "grant" | "revoke";
  contentId: string;
  grantee: string;
  timestamp: number;
  nonce: string;
}) {
  const contentId32 = normalizeBytes32(params.contentId);
  const message =
    `heaven:content:${params.operation}:${contentId32}:${params.grantee.toLowerCase()}:${params.timestamp}:${params.nonce}`;
  return params.signer.signMessage(message);
}

async function buildDecryptSignature(params: {
  signer: Wallet;
  contentId: string;
  timestamp: number;
  nonce: string;
}) {
  const message = `heaven:decrypt:${params.contentId.toLowerCase()}:${params.timestamp}:${params.nonce}`;
  return params.signer.signMessage(message);
}

async function main() {
  console.log("EOA Signature Content Share/Decrypt Test");
  console.log("=".repeat(72));
  console.log(`   Env: ${Env.name}`);

  const registerCid = Env.cids["contentRegisterV2"] || Env.cids["contentRegisterV1"];
  const accessCid = Env.cids["contentAccessV1"];
  const decryptCid = Env.cids["contentDecryptV1"];

  console.log(`   Register CID: ${registerCid || "(missing)"}`);
  console.log(`   Access CID:   ${accessCid || "(missing)"}`);
  console.log(`   Decrypt CID:  ${decryptCid || "(missing)"}`);

  if (!registerCid || !accessCid || !decryptCid) {
    console.error("\nMissing required CIDs. Run lit-actions setup/deploy first.");
    process.exit(1);
  }

  let sponsorPk = process.env.PRIVATE_KEY;
  if (!sponsorPk) throw new Error("PRIVATE_KEY not found in environment");
  if (!sponsorPk.startsWith("0x")) sponsorPk = "0x" + sponsorPk;

  const sponsorEoa = privateKeyToAccount(sponsorPk as `0x${string}`);
  const pkpCreds = Env.loadPkpCreds();

  const alice = Wallet.createRandom();
  const bob = Wallet.createRandom();

  console.log(`   Alice (EOA): ${alice.address}`);
  console.log(`   Bob   (EOA): ${bob.address}`);

  console.log("\nConnecting to Lit...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "content-share-decrypt-eoa-test",
      networkName: Env.name,
      storagePath: "./output/lit-auth",
    }),
  });

  const authData = await ViemAccountAuthenticator.authenticate(sponsorEoa);
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

  const startedAt = performance.now();

  try {
    // Step 1: Alice registers content via EOA signature
    console.log("\n-- Step 1: Register content (Alice signature path) --");
    const trackId = hexlify(randomBytes(32));
    const pieceCid = "baga6ea4seaqshare" + Date.now().toString(36);
    const contentId = keccak256(
      abiCoder.encode(["bytes32", "address"], [trackId, alice.address])
    ).toLowerCase();

    const registerTimestamp = Date.now();
    const registerNonce = Math.floor(Math.random() * 1e9).toString();
    const registerSig = await buildRegisterSignature({
      signer: alice,
      trackId,
      pieceCid,
      datasetOwner: alice.address,
      algo: 1,
      timestamp: registerTimestamp,
      nonce: registerNonce,
    });

    const registerParams: Record<string, unknown> = {
      trackId,
      pieceCid,
      algo: 1,
      datasetOwner: alice.address,
      signature: registerSig,
      timestamp: registerTimestamp,
      nonce: registerNonce,
    };

    // Backwards-compatible support for v1 register action if needed.
    if (registerCid === Env.cids["contentRegisterV1"]) {
      registerParams.title = "EOA Share Test";
      registerParams.artist = "Heaven";
      registerParams.album = "Tempo";
    }

    const registerResult = await litClient.executeJs({
      ipfsId: registerCid,
      authContext,
      jsParams: registerParams,
    });
    const registerResp = JSON.parse(registerResult.response as string);
    if (!registerResp.success) {
      throw new Error(`Register failed: ${registerResp.error}`);
    }
    console.log(`   ✓ Registered contentId ${contentId}`);
    console.log(`   tx: ${registerResp.txHash}`);

    // Step 2: Encrypt key payload bound to decrypt action CID
    console.log("\n-- Step 2: Encrypt payload with Lit --");
    const testKeyBytes = randomBytes(32);
    const testKeyBase64 = Buffer.from(testKeyBytes).toString("base64");
    const payload = JSON.stringify({ contentId, key: testKeyBase64 });
    const encryptedData = await litClient.encrypt({
      accessControlConditions: buildDecryptAccessConditions(decryptCid),
      dataToEncrypt: new TextEncoder().encode(payload),
    });
    console.log(`   ✓ Encrypted payload (ciphertext prefix: ${encryptedData.ciphertext.slice(0, 26)}...)`);

    // Step 3: Bob cannot decrypt before grant
    console.log("\n-- Step 3: Bob decrypt should fail before grant --");
    const bobBeforeTs = Date.now();
    const bobBeforeNonce = Math.floor(Math.random() * 1e9).toString();
    const bobBeforeSig = await buildDecryptSignature({
      signer: bob,
      contentId,
      timestamp: bobBeforeTs,
      nonce: bobBeforeNonce,
    });

    const bobBefore = await litClient.executeJs({
      ipfsId: decryptCid,
      authContext,
      jsParams: {
        userAddress: bob.address,
        signature: bobBeforeSig,
        contentId,
        ciphertext: encryptedData.ciphertext,
        dataToEncryptHash: encryptedData.dataToEncryptHash,
        decryptCid,
        timestamp: bobBeforeTs,
        nonce: bobBeforeNonce,
      },
    });
    const bobBeforeResp = JSON.parse(bobBefore.response as string);
    if (bobBeforeResp.success) {
      throw new Error("Expected Bob decrypt to fail before grant");
    }
    if (!String(bobBeforeResp.error || "").includes("Access denied")) {
      throw new Error(`Unexpected pre-grant error: ${bobBeforeResp.error}`);
    }
    console.log("   ✓ Bob denied before grant");

    // Step 4: Alice grants Bob
    console.log("\n-- Step 4: Grant Bob access (Alice signature path) --");
    const grantTs = Date.now();
    const grantNonce = Math.floor(Math.random() * 1e9).toString();
    const grantSig = await buildAccessSignature({
      signer: alice,
      operation: "grant",
      contentId,
      grantee: bob.address,
      timestamp: grantTs,
      nonce: grantNonce,
    });

    const grantResult = await litClient.executeJs({
      ipfsId: accessCid,
      authContext,
      jsParams: {
        operation: "grant",
        contentId,
        grantee: bob.address,
        signature: grantSig,
        timestamp: grantTs,
        nonce: grantNonce,
      },
    });
    const grantResp = JSON.parse(grantResult.response as string);
    if (!grantResp.success) {
      throw new Error(`Grant failed: ${grantResp.error}`);
    }
    console.log("   ✓ Grant successful");

    // Step 5: Bob decrypt succeeds
    console.log("\n-- Step 5: Bob decrypt should succeed after grant --");
    const bobAfterTs = Date.now();
    const bobAfterNonce = Math.floor(Math.random() * 1e9).toString();
    const bobAfterSig = await buildDecryptSignature({
      signer: bob,
      contentId,
      timestamp: bobAfterTs,
      nonce: bobAfterNonce,
    });

    const bobAfter = await litClient.executeJs({
      ipfsId: decryptCid,
      authContext,
      jsParams: {
        userAddress: bob.address,
        signature: bobAfterSig,
        contentId,
        ciphertext: encryptedData.ciphertext,
        dataToEncryptHash: encryptedData.dataToEncryptHash,
        decryptCid,
        timestamp: bobAfterTs,
        nonce: bobAfterNonce,
      },
    });
    const bobAfterResp = JSON.parse(bobAfter.response as string);
    if (!bobAfterResp.success) {
      throw new Error(`Expected Bob decrypt success after grant: ${bobAfterResp.error}`);
    }
    const parsedPayload = JSON.parse(bobAfterResp.decryptedPayload);
    if (parsedPayload.contentId?.toLowerCase() !== contentId) {
      throw new Error("Decrypted payload contentId mismatch");
    }
    if (parsedPayload.key !== testKeyBase64) {
      throw new Error("Decrypted key mismatch");
    }
    console.log("   ✓ Bob decrypt succeeded after grant");

    // Step 6: Alice revokes Bob
    console.log("\n-- Step 6: Revoke Bob access (Alice signature path) --");
    const revokeTs = Date.now();
    const revokeNonce = Math.floor(Math.random() * 1e9).toString();
    const revokeSig = await buildAccessSignature({
      signer: alice,
      operation: "revoke",
      contentId,
      grantee: bob.address,
      timestamp: revokeTs,
      nonce: revokeNonce,
    });
    const revokeResult = await litClient.executeJs({
      ipfsId: accessCid,
      authContext,
      jsParams: {
        operation: "revoke",
        contentId,
        grantee: bob.address,
        signature: revokeSig,
        timestamp: revokeTs,
        nonce: revokeNonce,
      },
    });
    const revokeResp = JSON.parse(revokeResult.response as string);
    if (!revokeResp.success) {
      throw new Error(`Revoke failed: ${revokeResp.error}`);
    }
    console.log("   ✓ Revoke successful");

    // Step 7: Bob cannot decrypt after revoke
    console.log("\n-- Step 7: Bob decrypt should fail after revoke --");
    const bobPostRevokeTs = Date.now();
    const bobPostRevokeNonce = Math.floor(Math.random() * 1e9).toString();
    const bobPostRevokeSig = await buildDecryptSignature({
      signer: bob,
      contentId,
      timestamp: bobPostRevokeTs,
      nonce: bobPostRevokeNonce,
    });
    const bobPostRevoke = await litClient.executeJs({
      ipfsId: decryptCid,
      authContext,
      jsParams: {
        userAddress: bob.address,
        signature: bobPostRevokeSig,
        contentId,
        ciphertext: encryptedData.ciphertext,
        dataToEncryptHash: encryptedData.dataToEncryptHash,
        decryptCid,
        timestamp: bobPostRevokeTs,
        nonce: bobPostRevokeNonce,
      },
    });
    const bobPostRevokeResp = JSON.parse(bobPostRevoke.response as string);
    if (bobPostRevokeResp.success) {
      throw new Error("Expected Bob decrypt to fail after revoke");
    }
    if (!String(bobPostRevokeResp.error || "").includes("Access denied")) {
      throw new Error(`Unexpected post-revoke error: ${bobPostRevokeResp.error}`);
    }
    console.log("   ✓ Bob denied after revoke");

    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
    console.log(`\n${"=".repeat(72)}`);
    console.log(`ALL CHECKS PASSED (${elapsed}s)`);
    console.log("=".repeat(72));
  } catch (err: any) {
    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
    console.error(`\nFAILED after ${elapsed}s`);
    console.error(err?.message || err);
    process.exit(1);
  } finally {
    litClient.disconnect();
  }
}

main();

