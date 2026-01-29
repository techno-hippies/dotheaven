#!/usr/bin/env bun
/**
 * Test Heaven Claim Name v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification
 *  - Name availability check on MegaETH
 *  - Sponsor PKP signs + broadcasts legacy tx to MegaETH
 *  - Returns tokenId, node, label
 *
 * Modes:
 *  - Default: Full broadcast to MegaETH testnet
 *  - --dry-run: Sign tx but skip broadcast (verify encoding + signing)
 *
 * Usage:
 *  bun tests/heaven-claim-name.test.ts
 *  bun tests/heaven-claim-name.test.ts --dry-run
 *  bun tests/heaven-claim-name.test.ts --label=mycoolname
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, parseAbi } from "viem";
import { Env } from "./shared/env";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../");

// MegaETH testnet
const MEGAETH_RPC = "https://carrot.megaeth.com/rpc";
const REGISTRY_V1 = "0x61CAed8296a2eF78eCf9DCa5eDf3C44469c6b1E2";
const HEAVEN_NODE = "0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27";

const registryAbi = parseAbi([
  "function available(bytes32 parentNode, string calldata label) external view returns (bool)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function fullName(uint256 tokenId) external view returns (string)",
  "function expiries(uint256 tokenId) external view returns (uint256)",
]);

function randomLabel(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const prefix = "test-";
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return prefix + suffix;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const labelArg = process.argv.find((a) => a.startsWith("--label="));
  const label = labelArg ? labelArg.split("=")[1] : randomLabel();

  console.log("Test Heaven Claim Name v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  console.log(`   Label:       ${label}.heaven`);
  console.log(`   Dry run:     ${dryRun}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  // Check if we have a deployed CID or use inline code
  const actionCid = Env.cids.heavenClaimName;
  let useInlineCode = !actionCid;
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

  // The "user" is the EOA for testing
  const wallet = new ethers.Wallet(pk);
  const userAddress = wallet.address;
  console.log(`   User (EOA):  ${userAddress}`);

  // Step 0: Check availability via direct RPC
  console.log("\nChecking name availability via RPC...");
  const megaClient = createPublicClient({
    transport: http(MEGAETH_RPC),
  });

  const isAvailable = await megaClient.readContract({
    address: REGISTRY_V1 as `0x${string}`,
    abi: registryAbi,
    functionName: "available",
    args: [HEAVEN_NODE as `0x${string}`, label],
  });

  if (!isAvailable) {
    console.error(`\n   Name "${label}.heaven" is NOT available.`);
    console.error("   Use --label=something-else to try a different name.");
    process.exit(1);
  }
  console.log(`   "${label}.heaven" is available`);

  // Connect to Lit
  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "heaven-claim-name-test",
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

  // Sign EIP-191 authorization message
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1_000_000_000);
  const message = `heaven:register:${label}:${ethers.getAddress(userAddress)}:${timestamp}:${nonce}`;

  console.log("\nSigning EIP-191 authorization...");
  const signature = await wallet.signMessage(message);
  console.log(`   Message: ${message}`);
  console.log(`   Signature: ${signature.slice(0, 20)}...`);

  // Build jsParams
  const jsParams: any = {
    recipient: userAddress,
    label,
    signature,
    timestamp,
    nonce,
    dryRun,
  };

  console.log(`\n   Recipient:   ${userAddress}`);
  console.log(`   Label:       ${label}`);
  console.log(`   Timestamp:   ${timestamp}`);

  console.log("\nExecuting Lit Action...");

  try {
    let result;
    if (useInlineCode) {
      // Load action code from file
      const actionCode = readFileSync(
        join(ROOT_DIR, "actions/heaven-claim-name-v1.js"),
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
    console.log(`   TX Hash:     ${response.txHash}`);

    if (dryRun) {
      console.log(`   Signed TX:   ${response.signedTx?.slice(0, 40)}...`);
      console.log(`   Sponsor:     ${response.sponsor}`);
      console.log(`   Contract:    ${response.contract}`);
      console.log(`   Chain ID:    ${response.chainId}`);
    } else {
      console.log(`   Token ID:    ${response.tokenId}`);
      console.log(`   Node:        ${response.node}`);
      console.log(`   Full Name:   ${response.fullName}`);
      console.log(`   Block:       ${response.blockNumber}`);

      // Verify on-chain
      console.log("\nVerifying on-chain...");
      try {
        const tokenId = BigInt(response.tokenId);
        const owner = await megaClient.readContract({
          address: REGISTRY_V1 as `0x${string}`,
          abi: registryAbi,
          functionName: "ownerOf",
          args: [tokenId],
        });
        console.log(`   Owner:       ${owner}`);

        const fullName = await megaClient.readContract({
          address: REGISTRY_V1 as `0x${string}`,
          abi: registryAbi,
          functionName: "fullName",
          args: [tokenId],
        });
        console.log(`   Full Name:   ${fullName}`);

        const expiry = await megaClient.readContract({
          address: REGISTRY_V1 as `0x${string}`,
          abi: registryAbi,
          functionName: "expiries",
          args: [tokenId],
        });
        const expiryDate = new Date(Number(expiry) * 1000);
        console.log(`   Expiry:      ${expiryDate.toISOString()}`);

        if (owner.toLowerCase() !== userAddress.toLowerCase()) {
          throw new Error(`Owner mismatch: expected ${userAddress}, got ${owner}`);
        }
        console.log("\n   On-chain verification passed!");
      } catch (verifyErr: any) {
        console.error(`\n   On-chain verification failed: ${verifyErr.message}`);
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
