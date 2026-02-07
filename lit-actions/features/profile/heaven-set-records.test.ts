#!/usr/bin/env bun
/**
 * Test Heaven Set Records v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification over record data
 *  - Nonce check against on-chain state
 *  - Sponsor PKP signs + broadcasts setTextFor() to RecordsV1 on MegaETH
 *  - Record readable on-chain via text(node, key)
 *
 * This test first claims a name (so we have a node to set records on),
 * then sets a text record on that name.
 *
 * Usage:
 *  bun tests/heaven-set-records.test.ts
 *  bun tests/heaven-set-records.test.ts --dry-run
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, parseAbi } from "viem";
import { Env } from "../../tests/shared/env";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../../");

const MEGAETH_RPC = "https://carrot.megaeth.com/rpc";
const RECORDS_V1 = "0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3";
const HEAVEN_NODE = "0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27";

const recordsAbi = parseAbi([
  "function text(bytes32 node, string key) external view returns (string)",
  "function nonces(bytes32 node) external view returns (uint256)",
]);

function randomLabel(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return "rtest-" + suffix;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Test Heaven Set Records v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  console.log(`   Dry run:     ${dryRun}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const recordsCid = Env.cids.heavenSetRecords;
  const claimCid = Env.cids.heavenClaimName;
  const useInlineRecords = !recordsCid;
  const useInlineClaim = !claimCid;

  console.log(`   Records CID: ${recordsCid || "(inline)"}`);
  console.log(`   Claim CID:   ${claimCid || "(inline)"}`);

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:    ${authEoa.address}`);

  const userAddress = pkpCreds.ethAddress;
  const userPkpPublicKey = pkpCreds.publicKey;
  console.log(`   User (PKP):  ${userAddress}`);

  const megaClient = createPublicClient({ transport: http(MEGAETH_RPC) });

  // Connect to Lit
  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "heaven-set-records-test",
      networkName: Env.name,
      storagePath: "./output/lit-auth",
    }),
  });

  console.log("\nAuthenticating EOA...");
  const authData = await ViemAccountAuthenticator.authenticate(authEoa);

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

  // ================================================================
  // STEP 1: Claim a name so we have a node to set records on
  // ================================================================
  const label = randomLabel();
  console.log(`\nStep 1: Claiming name "${label}"...`);

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1_000_000_000);

  const claimParams: any = {
    label,
    userPkpPublicKey,
    recipient: userAddress,
    parentNode: HEAVEN_NODE,
    duration: 365 * 24 * 60 * 60, // 1 year
    timestamp,
    nonce,
    dryRun: false, // always broadcast the claim
  };

  let claimResult;
  if (useInlineClaim) {
    const code = readFileSync(join(ROOT_DIR, "features/profile/heaven-claim-name-v1.js"), "utf-8");
    claimResult = await litClient.executeJs({ code, authContext, jsParams: claimParams });
  } else {
    claimResult = await litClient.executeJs({ ipfsId: claimCid, authContext, jsParams: claimParams });
  }

  const claimResponse = typeof claimResult.response === "string"
    ? JSON.parse(claimResult.response)
    : claimResult.response;

  if (!claimResponse?.success) {
    throw new Error(`Name claim failed: ${claimResponse?.error || "unknown"}`);
  }

  const node = claimResponse.node;
  console.log(`   Name claimed: ${label}`);
  console.log(`   Node:         ${node}`);
  console.log(`   TX Hash:      ${claimResponse.txHash}`);

  // ================================================================
  // STEP 2: Set a text record on the name
  // ================================================================
  console.log("\nStep 2: Setting text record...");

  // Read on-chain nonce for the node
  const recordNonce = await megaClient.readContract({
    address: RECORDS_V1 as `0x${string}`,
    abi: recordsAbi,
    functionName: "nonces",
    args: [node as `0x${string}`],
  });
  console.log(`   Record nonce: ${recordNonce}`);

  const testKey = "avatar";
  const testValue = "ipfs://QmTest1234567890abcdef";

  const recordsParams: any = {
    node,
    userPkpPublicKey,
    nonce: Number(recordNonce),
    key: testKey,
    value: testValue,
    dryRun,
  };

  let recordsResult;
  if (useInlineRecords) {
    const code = readFileSync(join(ROOT_DIR, "features/profile/heaven-set-records-v1.js"), "utf-8");
    recordsResult = await litClient.executeJs({ code, authContext, jsParams: recordsParams });
  } else {
    recordsResult = await litClient.executeJs({ ipfsId: recordsCid, authContext, jsParams: recordsParams });
  }

  const response = typeof recordsResult.response === "string"
    ? JSON.parse(recordsResult.response)
    : recordsResult.response;

  console.log("\nAction response:");
  console.log(JSON.stringify(response, null, 2));

  if (!response?.success) {
    throw new Error(response?.error || "action returned success=false");
  }

  console.log("\nSUCCESS!");
  console.log(`   Version:     ${response.version}`);
  console.log(`   TX Hash:     ${response.txHash}`);
  console.log(`   Node:        ${response.node}`);

  if (dryRun) {
    console.log(`   Signed TX:   ${response.signedTx?.slice(0, 40)}...`);
  } else {
    // Verify on-chain
    console.log("\nVerifying on-chain record...");
    const onChainValue = await megaClient.readContract({
      address: RECORDS_V1 as `0x${string}`,
      abi: recordsAbi,
      functionName: "text",
      args: [node as `0x${string}`, testKey],
    });

    console.log(`   text("${testKey}"): ${onChainValue}`);

    if (onChainValue !== testValue) {
      throw new Error(`Record mismatch: expected "${testValue}", got "${onChainValue}"`);
    }

    // Check nonce incremented
    const newNonce = await megaClient.readContract({
      address: RECORDS_V1 as `0x${string}`,
      abi: recordsAbi,
      functionName: "nonces",
      args: [node as `0x${string}`],
    });
    console.log(`   New nonce:   ${newNonce}`);

    if (newNonce !== recordNonce + 1n) {
      throw new Error(`Nonce not incremented: expected ${recordNonce + 1n}, got ${newNonce}`);
    }

    console.log("\n   On-chain verification passed!");
  }

  console.log("\nAll checks passed!");
  await litClient.disconnect();
}

main().catch((e) => {
  console.error("\nFAIL:", e?.message || e);
  process.exit(1);
});
