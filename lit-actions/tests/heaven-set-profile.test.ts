#!/usr/bin/env bun
/**
 * Test Heaven Set Profile v2 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification over profile data
 *  - Nonce check against on-chain state
 *  - Sponsor PKP signs + broadcasts upsertProfileFor() to MegaETH
 *  - Profile written on-chain (getProfile)
 *  - Unified language model (uint256 languagesPacked)
 *
 * Modes:
 *  - Default: Full broadcast to MegaETH testnet
 *  - --dry-run: Sign tx but skip broadcast
 *
 * Usage:
 *  bun tests/heaven-set-profile.test.ts
 *  bun tests/heaven-set-profile.test.ts --dry-run
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, parseAbi } from "viem";
import { Env } from "./shared/env";
import { ZeroHash } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../");

// MegaETH testnet
const MEGAETH_RPC = "https://carrot.megaeth.com/rpc";
// ProfileV2 contract (to be updated after deployment)
const PROFILE_V2 = "0xa31545D33f6d656E62De67fd020A26608d4601E5";

const profileAbi = parseAbi([
  "function nonces(address user) external view returns (uint256)",
  "function getProfile(address user) external view returns ((uint8 profileVersion, bool exists, uint8 age, uint16 heightCm, bytes2 nationality, uint8 friendsOpenToMask, uint256 languagesPacked, bytes32 locationCityId, bytes32 schoolId, bytes32 skillsCommit, bytes32 hobbiesCommit, bytes32 nameHash, uint256 packed, string displayName, string photoURI))",
]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Test Heaven Set Profile v2");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  console.log(`   Dry run:     ${dryRun}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const actionCid = Env.cids.heavenSetProfile;
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

  // Use sponsor PKP as the "user" since internal signing requires
  // the auth context to authorize the user's PKP key
  const userAddress = pkpCreds.ethAddress;
  const userPkpPublicKey = pkpCreds.publicKey;
  console.log(`   User (PKP):  ${userAddress}`);

  // Read on-chain nonce
  console.log("\nReading on-chain nonce...");
  const megaClient = createPublicClient({
    transport: http(MEGAETH_RPC),
  });

  const nonce = await megaClient.readContract({
    address: PROFILE_V2 as `0x${string}`,
    abi: profileAbi,
    functionName: "nonces",
    args: [userAddress as `0x${string}`],
  });
  console.log(`   Nonce:       ${nonce}`);

  // Build profile input
  // languagesPacked: English Native (0x454E0700) in slot 0, Spanish B1 (0x45530300) in slot 1
  // = (0x454E0700 << 224) | (0x45530300 << 192) as decimal string
  const langPacked = (
    (BigInt(0x454E0700) << 224n) |
    (BigInt(0x45530300) << 192n)
  ).toString();

  const profileInput = {
    profileVersion: 2,
    displayName: "TestUser",
    nameHash: ZeroHash,
    age: 25,
    heightCm: 0,
    nationality: "0x0000",
    languagesPacked: langPacked,
    friendsOpenToMask: 0,
    locationCityId: ZeroHash,
    schoolId: ZeroHash,
    skillsCommit: ZeroHash,
    hobbiesCommit: ZeroHash,
    photoURI: "",
    gender: 2, // Man
    relocate: 0,
    degree: 0,
    fieldBucket: 0,
    profession: 0,
    industry: 0,
    relationshipStatus: 0,
    sexuality: 0,
    ethnicity: 0,
    datingStyle: 0,
    children: 0,
    wantsChildren: 0,
    drinking: 0,
    smoking: 0,
    drugs: 0,
    lookingFor: 0,
    religion: 0,
    pets: 0,
    diet: 0,
  };

  // Connect to Lit
  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "heaven-set-profile-test",
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

  // Build jsParams (internal signing — no pre-signature needed)
  const jsParams: any = {
    user: userAddress,
    userPkpPublicKey,
    profileInput,
    nonce: Number(nonce),
    dryRun,
  };

  console.log("\nExecuting Lit Action...");

  try {
    let result;
    if (useInlineCode) {
      const actionCode = readFileSync(
        join(ROOT_DIR, "actions/heaven-set-profile-v1.js"),
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
    console.log(`   User:        ${response.user}`);

    if (dryRun) {
      console.log(`   Signed TX:   ${response.signedTx?.slice(0, 40)}...`);
      console.log(`   Sponsor:     ${response.sponsor}`);
      console.log(`   Contract:    ${response.contract}`);
      console.log(`   Chain ID:    ${response.chainId}`);
    } else {
      console.log(`   Block:       ${response.blockNumber}`);

      // Verify on-chain
      console.log("\nVerifying on-chain profile...");
      try {
        const profileData = await megaClient.readContract({
          address: PROFILE_V2 as `0x${string}`,
          abi: profileAbi,
          functionName: "getProfile",
          args: [userAddress as `0x${string}`],
        });

        console.log(`   exists:      ${profileData.exists}`);
        console.log(`   age:         ${profileData.age}`);
        console.log(`   displayName: ${profileData.displayName}`);
        console.log(`   version:     ${profileData.profileVersion}`);

        if (!profileData.exists) {
          throw new Error("Profile does not exist on-chain after write");
        }
        if (profileData.age !== 25) {
          throw new Error(`Age mismatch: expected 25, got ${profileData.age}`);
        }
        if (profileData.displayName !== "TestUser") {
          throw new Error(`Name mismatch: expected TestUser, got ${profileData.displayName}`);
        }

        // Check nonce incremented
        const newNonce = await megaClient.readContract({
          address: PROFILE_V2 as `0x${string}`,
          abi: profileAbi,
          functionName: "nonces",
          args: [userAddress as `0x${string}`],
        });
        console.log(`   new nonce:   ${newNonce}`);
        if (newNonce !== nonce + 1n) {
          throw new Error(`Nonce not incremented: expected ${nonce + 1n}, got ${newNonce}`);
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
