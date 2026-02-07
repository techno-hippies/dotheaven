#!/usr/bin/env bun
/**
 * Test Story Register Sponsor v1 Lit Action
 *
 * Verifies:
 *  - EIP-712 signature verification
 *  - Sponsor PKP signs + broadcasts tx to Story Aeneid
 *  - Returns ipId, tokenId, licenseTermsIds
 *
 * Modes:
 *  - Default: Full broadcast to Story Aeneid testnet
 *  - --dry-run: Sign tx but skip broadcast (verify encoding + signing)
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { ethers } from "ethers";

const CHAIN_ID = 1315;

const EIP712_DOMAIN = {
  name: "Heaven Song Registration",
  version: "1",
  chainId: CHAIN_ID,
};

const EIP712_TYPES = {
  RegisterSong: [
    { name: "recipient", type: "address" },
    { name: "ipMetadataHash", type: "bytes32" },
    { name: "nftMetadataHash", type: "bytes32" },
    { name: "commercialRevShare", type: "uint32" },
    { name: "defaultMintingFee", type: "uint256" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Test Story Register Sponsor v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(`   Action CID:  ${Env.cids.storyRegisterSponsor || "(not deployed)"}`);

  if (!Env.cids.storyRegisterSponsor) {
    console.error("\nNo storyRegisterSponsor action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts storyRegisterSponsor");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:    ${authEoa.address}`);

  // The "user" is the EOA for testing (in production, this is the user's PKP address)
  const wallet = new ethers.Wallet(pk);
  const userAddress = wallet.address;
  console.log(`   User (EOA):  ${userAddress}`);
  console.log(`   Dry run:     ${dryRun}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "story-register-test",
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

  // Build test metadata
  const ipaMetadata = JSON.stringify({
    title: "Test Song Registration",
    description: "Testing Story Protocol IP registration via Lit Action",
    createdAt: new Date().toISOString(),
  });
  const nftMetadata = JSON.stringify({
    name: "Test Song Registration",
    description: "Testing Story Protocol NFT minting",
    image: "https://via.placeholder.com/500",
  });

  // Compute metadata hashes (bytes32, 0x-prefixed)
  const sha256Hex = async (data: string) => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return "0x" + Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const ipMetadataHash = await sha256Hex(ipaMetadata);
  const nftMetadataHash = await sha256Hex(nftMetadata);

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000);

  const commercialRevShare = 10; // 10%
  const defaultMintingFee = "0";

  // Sign EIP-712 typed data
  const typedValue = {
    recipient: ethers.getAddress(userAddress),
    ipMetadataHash,
    nftMetadataHash,
    commercialRevShare,
    defaultMintingFee,
    timestamp: String(timestamp),
    nonce: String(nonce),
  };

  console.log("\nSigning EIP-712...");
  // ethers v6 uses wallet.signTypedData
  const signature = await wallet.signTypedData(
    EIP712_DOMAIN,
    EIP712_TYPES,
    typedValue
  );
  console.log(`   Signature: ${signature.slice(0, 20)}...`);

  // Use placeholder metadata URIs (these would be real IPFS gateway URLs in production)
  const ipMetadataURI = "https://ipfs.io/ipfs/QmPlaceholderIPAMetadata";
  const nftMetadataURI = "https://ipfs.io/ipfs/QmPlaceholderNFTMetadata";

  const jsParams: any = {
    recipient: userAddress,
    ipMetadataURI,
    ipMetadataHash,
    nftMetadataURI,
    nftMetadataHash,
    commercialRevShare,
    defaultMintingFee,
    signature,
    timestamp,
    nonce,
    dryRun,
  };

  console.log(`\n   Recipient:        ${userAddress}`);
  console.log(`   IP Meta Hash:     ${ipMetadataHash.slice(0, 20)}...`);
  console.log(`   NFT Meta Hash:    ${nftMetadataHash.slice(0, 20)}...`);
  console.log(`   Rev Share:        ${commercialRevShare}%`);
  console.log(`   Minting Fee:      ${defaultMintingFee}`);

  console.log("\nExecuting Lit Action...");

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.storyRegisterSponsor,
      authContext,
      jsParams,
    });

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
      console.log(`   IP ID:       ${response.ipId}`);
      console.log(`   Token ID:    ${response.tokenId}`);
      console.log(`   License IDs: ${JSON.stringify(response.licenseTermsIds)}`);
      console.log(`   Block:       ${response.blockNumber}`);
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
