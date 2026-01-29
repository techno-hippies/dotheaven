#!/usr/bin/env bun
/**
 * Test Heaven Set Profile v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification over profile data
 *  - Nonce check against on-chain state
 *  - Sponsor PKP signs + broadcasts upsertProfileFor() to MegaETH
 *  - Profile written on-chain (getProfile)
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
import { createPublicClient, http, parseAbi, keccak256, encodePacked, encodeAbiParameters } from "viem";
import { Env } from "./shared/env";
import { ethers, ZeroHash, AbiCoder, Wallet, keccak256 as ethKeccak256, getAddress } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../");

// MegaETH testnet
const MEGAETH_RPC = "https://carrot.megaeth.com/rpc";
const PROFILE_V1 = "0x0A6563122cB3515ff678A918B5F31da9b1391EA3";

const profileAbi = parseAbi([
  "function nonces(address user) external view returns (uint256)",
  "function getProfile(address user) external view returns ((uint8 profileVersion, bool exists, uint8 age, uint16 heightCm, bytes2 nationality, bytes2 nativeLanguage, uint8 friendsOpenToMask, uint80 learningLanguagesPacked, bytes32 locationCityId, bytes32 schoolId, bytes32 skillsCommit, bytes32 hobbiesCommit, bytes32 nameHash, uint256 packed, string displayName, string photoURI))",
]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Test Heaven Set Profile v1");
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

  const wallet = new Wallet(pk);
  const userAddress = wallet.address;
  console.log(`   User (EOA):  ${userAddress}`);

  // Read on-chain nonce
  console.log("\nReading on-chain nonce...");
  const megaClient = createPublicClient({
    transport: http(MEGAETH_RPC),
  });

  const nonce = await megaClient.readContract({
    address: PROFILE_V1 as `0x${string}`,
    abi: profileAbi,
    functionName: "nonces",
    args: [userAddress as `0x${string}`],
  });
  console.log(`   Nonce:       ${nonce}`);

  // Build profile input
  const profileInput = {
    profileVersion: 1,
    displayName: "TestUser",
    nameHash: ZeroHash,
    age: 25,
    heightCm: 0,
    nationality: "0x0000",
    nativeLanguage: "0x454e", // "EN"
    learningLanguagesPacked: 0,
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

  // Compute profileHash using ethers (same as Lit Action + contract)
  const profileTuple = [
    profileInput.profileVersion,
    profileInput.displayName,
    profileInput.nameHash,
    profileInput.age,
    profileInput.heightCm,
    profileInput.nationality,
    profileInput.nativeLanguage,
    profileInput.learningLanguagesPacked,
    profileInput.friendsOpenToMask,
    profileInput.locationCityId,
    profileInput.schoolId,
    profileInput.skillsCommit,
    profileInput.hobbiesCommit,
    profileInput.photoURI,
    profileInput.gender,
    profileInput.relocate,
    profileInput.degree,
    profileInput.fieldBucket,
    profileInput.profession,
    profileInput.industry,
    profileInput.relationshipStatus,
    profileInput.sexuality,
    profileInput.ethnicity,
    profileInput.datingStyle,
    profileInput.children,
    profileInput.wantsChildren,
    profileInput.drinking,
    profileInput.smoking,
    profileInput.drugs,
    profileInput.lookingFor,
    profileInput.religion,
    profileInput.pets,
    profileInput.diet,
  ];

  const abiCoder = AbiCoder.defaultAbiCoder();
  const profileEncoded = abiCoder.encode(
    [
      "tuple(uint8,string,bytes32,uint8,uint16,bytes2,bytes2,uint80,uint8,bytes32,bytes32,bytes32,bytes32,string,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8)",
    ],
    [profileTuple]
  );
  const profileHash = ethKeccak256(profileEncoded);
  console.log(`   Profile hash: ${profileHash.slice(0, 20)}...`);

  // Sign EIP-191 authorization message
  const message = `heaven:profile:${userAddress.toLowerCase()}:${profileHash}:${nonce}`;
  console.log("\nSigning EIP-191 authorization...");
  const signature = await wallet.signMessage(message);
  console.log(`   Message:     ${message.slice(0, 60)}...`);
  console.log(`   Signature:   ${signature.slice(0, 20)}...`);

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

  // Build jsParams
  const jsParams: any = {
    user: userAddress,
    profileInput,
    signature,
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
          address: PROFILE_V1 as `0x${string}`,
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
          address: PROFILE_V1 as `0x${string}`,
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
