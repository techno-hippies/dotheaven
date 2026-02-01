#!/usr/bin/env bun
/**
 * Test Content Access v1 Lit Action
 *
 * Verifies:
 *  - Register content (prerequisite — creates contentId on both chains)
 *  - Grant access to a second address via content-access-v1
 *  - Dual-broadcast: Base mirror first, then MegaETH
 *  - canAccess() returns true for grantee on both chains
 *  - Revoke access, verify canAccess() returns false on both chains
 *
 * Usage:
 *   bun tests/content-access.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { randomBytes, hexlify, keccak256, AbiCoder, Contract, JsonRpcProvider, Wallet } from "ethers";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const abiCoder = AbiCoder.defaultAbiCoder();

// Contract addresses
const MEGAETH_RPC = "https://carrot.megaeth.com/rpc";
const BASE_RPC = "https://sepolia.base.org";
const CONTENT_REGISTRY = "0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2";
const CONTENT_ACCESS_MIRROR = "0x872E8E7E4a4088F41CeB0ccc14a7081D36aF5aa4";

const canAccessAbi = ["function canAccess(address user, bytes32 contentId) view returns (bool)"];

async function checkAccess(address: string, contentId: string): Promise<{ mega: boolean; base: boolean }> {
  const megaProvider = new JsonRpcProvider(MEGAETH_RPC);
  const baseProvider = new JsonRpcProvider(BASE_RPC);
  const megaRegistry = new Contract(CONTENT_REGISTRY, canAccessAbi, megaProvider);
  const baseMirror = new Contract(CONTENT_ACCESS_MIRROR, canAccessAbi, baseProvider);
  const [mega, base] = await Promise.all([
    megaRegistry.canAccess(address, contentId),
    baseMirror.canAccess(address, contentId),
  ]);
  return { mega, base };
}

async function main() {
  console.log("Test Content Access v1 (grant + revoke)");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const registerCid = Env.cids["contentRegisterV1"];
  const accessCid = Env.cids["contentAccessV1"];
  console.log(`   Register CID: ${registerCid || "(not deployed)"}`);
  console.log(`   Access CID:   ${accessCid || "(not deployed)"}`);

  if (!registerCid || !accessCid) {
    console.error("\nMissing action CIDs. Run setup.ts first.");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const userPkpPublicKey = pkpCreds.publicKey;
  const userAddress = pkpCreds.ethAddress;

  // Generate a random "grantee" address for testing
  const granteeWallet = Wallet.createRandom();
  const granteeAddress = granteeWallet.address;
  console.log(`   User (PKP):   ${userAddress}`);
  console.log(`   Grantee:      ${granteeAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "content-access-test",
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
    // STEP 1: Register content (creates contentId on both chains)
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 1: Register content ──");

    const trackId = hexlify(randomBytes(32));
    const pieceCid = "baga6ea4seaqtest" + Date.now().toString(36);
    const expectedContentId = keccak256(
      abiCoder.encode(["bytes32", "address"], [trackId, userAddress])
    ).toLowerCase();

    console.log(`   trackId:     ${trackId}`);
    console.log(`   contentId:   ${expectedContentId}`);

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
    console.log(`   ✓ Registered (mega: ${registerResp.txHash.slice(0, 14)}..., base: ${registerResp.mirrorTxHash.slice(0, 14)}...)`);

    // Verify owner has access
    const ownerAccess = await checkAccess(userAddress, expectedContentId);
    if (!ownerAccess.mega || !ownerAccess.base) {
      throw new Error(`Owner access check failed: mega=${ownerAccess.mega}, base=${ownerAccess.base}`);
    }
    console.log("   ✓ Owner canAccess on both chains");

    // Verify grantee does NOT have access yet
    const preGrantAccess = await checkAccess(granteeAddress, expectedContentId);
    if (preGrantAccess.mega || preGrantAccess.base) {
      throw new Error(`Grantee should not have access yet: mega=${preGrantAccess.mega}, base=${preGrantAccess.base}`);
    }
    console.log("   ✓ Grantee has no access (as expected)");

    // ══════════════════════════════════════════════════════════════
    // STEP 2: Grant access to grantee
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 2: Grant access ──");

    const grantResult = await litClient.executeJs({
      ipfsId: accessCid,
      authContext,
      jsParams: {
        userPkpPublicKey,
        operation: "grant",
        contentId: expectedContentId,
        grantee: granteeAddress,
        timestamp: Date.now(),
        nonce: Math.floor(Math.random() * 1e6).toString(),
      },
    });

    const grantResp = JSON.parse(grantResult.response as string);
    if (!grantResp.success) {
      throw new Error(`Grant failed: ${grantResp.error}`);
    }
    console.log(`   ✓ Granted (mega: ${grantResp.txHash.slice(0, 14)}..., base: ${grantResp.mirrorTxHash.slice(0, 14)}...)`);

    // Verify grantee now has access on both chains
    const postGrantAccess = await checkAccess(granteeAddress, expectedContentId);
    if (!postGrantAccess.mega || !postGrantAccess.base) {
      throw new Error(`Grantee access check failed after grant: mega=${postGrantAccess.mega}, base=${postGrantAccess.base}`);
    }
    console.log("   ✓ Grantee canAccess on MegaETH");
    console.log("   ✓ Grantee canAccess on Base");

    // ══════════════════════════════════════════════════════════════
    // STEP 3: Revoke access from grantee
    // ══════════════════════════════════════════════════════════════
    console.log("\n── Step 3: Revoke access ──");

    const revokeResult = await litClient.executeJs({
      ipfsId: accessCid,
      authContext,
      jsParams: {
        userPkpPublicKey,
        operation: "revoke",
        contentId: expectedContentId,
        grantee: granteeAddress,
        timestamp: Date.now(),
        nonce: Math.floor(Math.random() * 1e6).toString(),
      },
    });

    const revokeResp = JSON.parse(revokeResult.response as string);
    if (!revokeResp.success) {
      throw new Error(`Revoke failed: ${revokeResp.error}`);
    }
    console.log(`   ✓ Revoked (mega: ${revokeResp.txHash.slice(0, 14)}..., base: ${revokeResp.mirrorTxHash.slice(0, 14)}...)`);

    // Verify grantee no longer has access
    const postRevokeAccess = await checkAccess(granteeAddress, expectedContentId);
    if (postRevokeAccess.mega || postRevokeAccess.base) {
      throw new Error(`Grantee still has access after revoke: mega=${postRevokeAccess.mega}, base=${postRevokeAccess.base}`);
    }
    console.log("   ✓ Grantee canAccess = false on MegaETH");
    console.log("   ✓ Grantee canAccess = false on Base");

    // Owner should still have access
    const ownerStillOk = await checkAccess(userAddress, expectedContentId);
    if (!ownerStillOk.mega || !ownerStillOk.base) {
      throw new Error(`Owner lost access after revoking grantee`);
    }
    console.log("   ✓ Owner still has access");

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
