#!/usr/bin/env bun
/**
 * Test Link EOA v1 Lit Action
 *
 * Verifies:
 *  - Pre-signed EIP-191 signature verification
 *  - Already-linked check on ContentAccessMirror (Base Sepolia)
 *  - Sponsor PKP signs + broadcasts type 2 tx to Base Sepolia
 *  - Returns pkpAddress, eoaAddress, txHash
 *
 * Modes:
 *  - Default: Full broadcast to Base Sepolia
 *  - --dry-run: Sign tx but skip broadcast
 *
 * Usage:
 *  LIT_NETWORK=naga-test bun features/profile/link-eoa.test.ts
 *  LIT_NETWORK=naga-test bun features/profile/link-eoa.test.ts --dry-run
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, parseAbi } from "viem";
import { Env } from "../../tests/shared/env";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../../");

// Base Sepolia
const BASE_RPC = "https://sepolia.base.org";
const CONTENT_ACCESS_MIRROR = "0xd4D3baB38a11D72e36F49a73D50Dbdc3c1Aa4e9A";

const mirrorAbi = parseAbi([
  "function linkedEoa(address pkp) external view returns (address)",
]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Test Link EOA v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  console.log(`   Dry run:     ${dryRun}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   Sponsor PKP: ${pkpCreds.ethAddress}`);

  const actionCid = Env.cids.linkEoaV1;
  const useInlineCode = !actionCid;
  if (actionCid) {
    console.log(`   Action CID:  ${actionCid}`);
  } else {
    console.log(`   Action CID:  (not deployed — using inline code)`);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:    ${authEoa.address}`);

  // For testing, the "user" is a deterministic wallet derived from the deployer
  // We use the deployer EOA as the user's PKP stand-in
  const wallet = new ethers.Wallet(pk);
  const userPkpPublicKey = wallet.signingKey.publicKey;
  const userPkpAddress = wallet.address;
  const eoaAddress = wallet.address; // link to self for testing

  console.log(`   User PKP:    ${userPkpAddress}`);
  console.log(`   EOA:         ${eoaAddress}`);

  // Connect to Lit
  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "heaven-link-eoa-test",
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
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
      statement: "",
    },
    litClient,
  });
  console.log("Auth context ready");

  // Pre-sign EIP-191 authorization message
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1_000_000_000);
  const message = `heaven:linkEoa:${userPkpAddress.toLowerCase()}:${ethers.getAddress(eoaAddress).toLowerCase()}:${timestamp}:${nonce}`;

  console.log("\nSigning EIP-191 authorization...");
  const signature = await wallet.signMessage(message);
  console.log(`   Message: ${message}`);
  console.log(`   Signature: ${signature.slice(0, 20)}...`);

  // Build jsParams
  const jsParams: any = {
    userPkpPublicKey,
    eoaAddress,
    signature,
    timestamp,
    nonce,
    dryRun,
  };

  console.log("\nExecuting Lit Action...");

  try {
    let result;
    if (useInlineCode) {
      const actionCode = readFileSync(
        join(ROOT_DIR, "features/profile/link-eoa-v1.js"),
        "utf-8"
      );
      result = await litClient.executeJs({
        code: actionCode,
        authContext,
        jsParams,
      });
    } else {
      result = await litClient.executeJs({
        ipfsId: actionCid,
        authContext,
        jsParams,
      });
    }

    console.log("Lit Action executed");

    const response =
      typeof result.response === "string" ? JSON.parse(result.response) : result.response;

    console.log("\nAction response:");
    console.log(JSON.stringify(response, null, 2));

    if (!response?.success) {
      throw new Error(response?.error || "action returned success=false");
    }

    console.log("\nSUCCESS!");
    console.log(`   Version:     ${response.version}`);

    if (response.alreadyLinked) {
      console.log(`   Already linked — no tx needed`);
    } else if (dryRun) {
      console.log(`   Signed TX:   ${response.signedTx?.slice(0, 40)}...`);
    } else {
      console.log(`   TX Hash:     ${response.txHash}`);
      console.log(`   Block:       ${response.blockNumber}`);

      // Verify on-chain
      console.log("\nVerifying on-chain...");
      const baseClient = createPublicClient({
        transport: http(BASE_RPC),
      });

      const linked = await baseClient.readContract({
        address: CONTENT_ACCESS_MIRROR as `0x${string}`,
        abi: mirrorAbi,
        functionName: "linkedEoa",
        args: [userPkpAddress as `0x${string}`],
      });
      console.log(`   Linked EOA:  ${linked}`);

      if (linked.toLowerCase() !== eoaAddress.toLowerCase()) {
        throw new Error(`Link mismatch: expected ${eoaAddress}, got ${linked}`);
      }
      console.log("\n   On-chain verification passed!");
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
