#!/usr/bin/env bun
/**
 * Test Content Register v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification
 *  - Dual-broadcast: Base mirror first, then MegaETH ContentRegistry
 *  - ContentAccessMirror.canAccess() returns true for owner on Base
 *  - ContentRegistry.canAccess() returns true for owner on MegaETH
 *  - Returns contentId, txHash, mirrorTxHash
 *
 * Usage:
 *   bun tests/content-register.test.ts
 *   bun tests/content-register.test.ts --dry-run
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { randomBytes, hexlify, keccak256, AbiCoder, Contract, JsonRpcProvider } from "ethers";
import { dirname } from "path";
import { fileURLToPath } from "url";

const abiCoder = AbiCoder.defaultAbiCoder();

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

// Contract addresses
const MEGAETH_RPC = "https://carrot.megaeth.com/rpc";
const BASE_RPC = "https://sepolia.base.org";
const CONTENT_REGISTRY = "0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2";
const CONTENT_ACCESS_MIRROR = "0x872E8E7E4a4088F41CeB0ccc14a7081D36aF5aa4";

async function main() {
  console.log("Test Content Register v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  if (dryRun) console.log("   Mode:        DRY RUN (sign only, no broadcast)");

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const actionCid = Env.cids["contentRegisterV1"];
  console.log(`   Action CID:  ${actionCid || "(not deployed)"}`);

  if (!actionCid) {
    console.error("\nNo contentRegisterV1 action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts contentRegisterV1");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const userPkpPublicKey = pkpCreds.publicKey;
  const userAddress = pkpCreds.ethAddress;
  console.log(`   User (PKP):  ${userAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "content-register-test",
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

  // ── Build test params ──────────────────────────────────────────────

  // Generate a random trackId (bytes32)
  const trackId = hexlify(randomBytes(32));

  // Use a test pieceCid (Filecoin piece CID placeholder)
  const pieceCid = "baga6ea4seaqtest" + Date.now().toString(36);

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();

  console.log(`\n   trackId:     ${trackId}`);
  console.log(`   pieceCid:    ${pieceCid}`);
  console.log(`   algo:        1 (AES_GCM_256)`);
  console.log(`   Timestamp:   ${timestamp}`);
  console.log(`   Nonce:       ${nonce}`);

  // Compute expected contentId = keccak256(abi.encode(trackId, userAddress))
  const expectedContentId = keccak256(
    abiCoder.encode(["bytes32", "address"], [trackId, userAddress])
  ).toLowerCase();
  console.log(`   Expected ID: ${expectedContentId}`);

  // ── Execute Lit Action ─────────────────────────────────────────────

  const jsParams: Record<string, any> = {
    userPkpPublicKey,
    trackId,
    pieceCid,
    algo: 1,
    timestamp,
    nonce,
    dryRun,
  };

  console.log("\nExecuting Lit Action (internal signing)...");
  const t0 = performance.now();

  try {
    const result = await litClient.executeJs({
      ipfsId: actionCid,
      authContext,
      jsParams,
    });

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`Lit Action executed in ${elapsed}s`);

    const response =
      typeof result.response === "string" ? JSON.parse(result.response) : result.response;

    console.log("\nAction response:");
    console.log(JSON.stringify(response, null, 2));

    if (!response?.success) {
      throw new Error(response?.error || "action returned success=false");
    }

    // ── Verify response ────────────────────────────────────────────

    console.log("\nSUCCESS!");
    console.log(`   Version:      ${response.version}`);
    console.log(`   User:         ${response.user}`);
    console.log(`   Content ID:   ${response.contentId}`);
    console.log(`   TX Hash:      ${response.txHash || "(dry run)"}`);
    console.log(`   Mirror TX:    ${response.mirrorTxHash || "(dry run)"}`);
    console.log(`   Block:        ${response.blockNumber || "(dry run)"}`);

    // Version
    if (response.version !== "content-register-v1") {
      throw new Error(`Unexpected version: ${response.version}`);
    }
    console.log("   ✓ Version correct");

    // User
    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${userAddress}, got ${response.user}`);
    }
    console.log("   ✓ User matches");

    // Content ID
    if (response.contentId.toLowerCase() !== expectedContentId) {
      throw new Error(`Content ID mismatch: expected ${expectedContentId}, got ${response.contentId}`);
    }
    console.log("   ✓ Content ID matches expected keccak256(trackId, user)");

    if (dryRun) {
      console.log("\n   Dry run complete — skipping on-chain verification");
      if (response.megaSignedTx) console.log("   ✓ MegaETH signed tx present");
      if (response.baseSignedTx) console.log("   ✓ Base signed tx present");
    } else {
      // TX hashes present
      if (!response.txHash?.startsWith("0x")) {
        throw new Error("Missing MegaETH TX hash");
      }
      console.log("   ✓ MegaETH TX hash present");

      if (!response.mirrorTxHash?.startsWith("0x")) {
        throw new Error("Missing Base mirror TX hash");
      }
      console.log("   ✓ Base mirror TX hash present");

      // ── On-chain verification ──────────────────────────────────

      console.log("\nVerifying on-chain state...");

      const canAccessAbi = ["function canAccess(address user, bytes32 contentId) view returns (bool)"];

      // Check MegaETH ContentRegistry
      const megaProvider = new JsonRpcProvider(MEGAETH_RPC);
      const megaRegistry = new Contract(CONTENT_REGISTRY, canAccessAbi, megaProvider);
      const megaAccess = await megaRegistry.canAccess(userAddress, expectedContentId);
      if (!megaAccess) {
        throw new Error("MegaETH canAccess returned false for owner");
      }
      console.log("   ✓ MegaETH ContentRegistry.canAccess() = true");

      // Check Base ContentAccessMirror
      const baseProvider = new JsonRpcProvider(BASE_RPC);
      const baseMirror = new Contract(CONTENT_ACCESS_MIRROR, canAccessAbi, baseProvider);
      const baseAccess = await baseMirror.canAccess(userAddress, expectedContentId);
      if (!baseAccess) {
        throw new Error("Base mirror canAccess returned false for owner");
      }
      console.log("   ✓ Base ContentAccessMirror.canAccess() = true");
    }

    console.log("\n" + "=".repeat(60));
    console.log("ALL CHECKS PASSED");
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
