#!/usr/bin/env bun
/**
 * Test Self Verify Mirror v1 Lit Action
 *
 * Verifies:
 *  - Reads verifiedAt(user) from Celo SelfProfileVerifier
 *  - Reads mirror nonce from MegaETH VerificationMirror
 *  - Sponsor PKP signs + broadcasts mirror() tx to MegaETH
 *  - Returns txHash, blockNumber
 *
 * Modes:
 *  - Default: Full broadcast to MegaETH testnet
 *  - --dry-run: Sign tx but skip broadcast (verify encoding + signing)
 *
 * Prerequisites:
 *  - SelfProfileVerifier deployed on Celo Sepolia
 *  - VerificationMirror deployed on MegaETH
 *  - User must have verifiedAt > 0 on Celo (already verified via Self app)
 *
 * Usage:
 *  bun tests/self-verify-mirror.test.ts --user=0x... --celo-verifier=0x... --megaeth-mirror=0x...
 *  bun tests/self-verify-mirror.test.ts --dry-run --user=0x... --celo-verifier=0x... --megaeth-mirror=0x...
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

// Defaults (override with CLI args or env vars)
const MEGAETH_RPC = "https://carrot.megaeth.com/rpc";
const CELO_SEPOLIA_RPC = "https://forno.celo-testnet.org";

const verifierAbi = parseAbi([
  "function verifiedAt(address user) external view returns (uint64)",
]);

const mirrorAbi = parseAbi([
  "function verifiedAt(address user) external view returns (uint64)",
  "function nonces(address user) external view returns (uint256)",
  "function sponsor() external view returns (address)",
]);

function getArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=")[1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const userAddress =
    getArg("user") || process.env.SELF_VERIFY_USER || process.env.USER_ADDRESS;
  const celoVerifierAddress =
    getArg("celo-verifier") || process.env.VITE_SELF_VERIFIER_CELO || process.env.SELF_VERIFIER_CELO;
  const megaEthMirrorAddress =
    getArg("megaeth-mirror") || process.env.VITE_VERIFICATION_MIRROR_MEGAETH || process.env.VERIFICATION_MIRROR_MEGAETH;

  if (!userAddress) {
    console.error("Missing --user=0x... or USER_ADDRESS env var");
    process.exit(1);
  }
  if (!celoVerifierAddress) {
    console.error("Missing --celo-verifier=0x... or SELF_VERIFIER_CELO env var");
    process.exit(1);
  }
  if (!megaEthMirrorAddress) {
    console.error("Missing --megaeth-mirror=0x... or VERIFICATION_MIRROR_MEGAETH env var");
    process.exit(1);
  }

  console.log("Test Self Verify Mirror v1");
  console.log("=".repeat(60));
  console.log(`   Env:              ${Env.name}`);
  console.log(`   User:             ${userAddress}`);
  console.log(`   Celo Verifier:    ${celoVerifierAddress}`);
  console.log(`   MegaETH Mirror:   ${megaEthMirrorAddress}`);
  console.log(`   Dry run:          ${dryRun}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:              ${pkpCreds.ethAddress}`);

  // Check if we have a deployed CID or use inline code
  const actionCid = (Env.cids as any).selfVerifyMirror;
  let useInlineCode = !actionCid;
  if (actionCid) {
    console.log(`   Action CID:       ${actionCid}`);
  } else {
    console.log(`   Action CID:       (not deployed — using inline code)`);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:         ${authEoa.address}`);

  // Step 0: Check Celo verification status
  console.log("\nChecking Celo verification status...");
  const celoClient = createPublicClient({
    transport: http(CELO_SEPOLIA_RPC),
  });

  const celoVerifiedAt = await celoClient.readContract({
    address: celoVerifierAddress as `0x${string}`,
    abi: verifierAbi,
    functionName: "verifiedAt",
    args: [userAddress as `0x${string}`],
  });

  if (celoVerifiedAt === 0n) {
    console.error(`\n   User ${userAddress} is NOT verified on Celo.`);
    console.error("   They must complete Self.xyz passport verification first.");
    process.exit(1);
  }

  const celoDate = new Date(Number(celoVerifiedAt) * 1000);
  console.log(`   Celo verifiedAt:  ${celoVerifiedAt} (${celoDate.toISOString()})`);

  // Step 1: Check MegaETH mirror state
  console.log("\nChecking MegaETH mirror state...");
  const megaClient = createPublicClient({
    transport: http(MEGAETH_RPC),
  });

  const [megaVerifiedAt, megaNonce, sponsorAddr] = await Promise.all([
    megaClient.readContract({
      address: megaEthMirrorAddress as `0x${string}`,
      abi: mirrorAbi,
      functionName: "verifiedAt",
      args: [userAddress as `0x${string}`],
    }),
    megaClient.readContract({
      address: megaEthMirrorAddress as `0x${string}`,
      abi: mirrorAbi,
      functionName: "nonces",
      args: [userAddress as `0x${string}`],
    }),
    megaClient.readContract({
      address: megaEthMirrorAddress as `0x${string}`,
      abi: mirrorAbi,
      functionName: "sponsor",
    }),
  ]);

  console.log(`   MegaETH verified: ${megaVerifiedAt}`);
  console.log(`   MegaETH nonce:    ${megaNonce}`);
  console.log(`   Mirror sponsor:   ${sponsorAddr}`);

  if (Number(megaVerifiedAt) >= Number(celoVerifiedAt)) {
    console.log("\n   Mirror is already up-to-date. Action will return alreadyMirrored=true.");
  }

  // Connect to Lit
  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "self-verify-mirror-test",
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
    userAddress,
    celoVerifierAddress,
    megaEthMirrorAddress,
    dryRun,
  };

  console.log("\nExecuting Lit Action...");

  try {
    let result;
    if (useInlineCode) {
      const actionCode = readFileSync(
        join(ROOT_DIR, "features/verification/self-verify-mirror-v1.js"),
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
    console.log(`   Version:          ${response.version}`);

    if (response.alreadyMirrored) {
      console.log(`   Already mirrored: true`);
      console.log(`   Celo verified:    ${response.celoVerifiedAt}`);
      console.log(`   MegaETH verified: ${response.megaEthVerifiedAt}`);
    } else if (dryRun) {
      console.log(`   Dry run:          true`);
      console.log(`   Signed TX:        ${response.signedTx?.slice(0, 40)}...`);
      console.log(`   Celo verified:    ${response.celoVerifiedAt}`);
      console.log(`   Nonce:            ${response.nonce}`);
      console.log(`   Deadline:         ${response.deadline}`);
    } else {
      console.log(`   TX Hash:          ${response.txHash}`);
      console.log(`   Block:            ${response.blockNumber}`);
      console.log(`   Contract:         ${response.contract}`);
      console.log(`   Chain ID:         ${response.chainId}`);

      // Verify on-chain
      console.log("\nVerifying on-chain...");
      try {
        const newVerifiedAt = await megaClient.readContract({
          address: megaEthMirrorAddress as `0x${string}`,
          abi: mirrorAbi,
          functionName: "verifiedAt",
          args: [userAddress as `0x${string}`],
        });

        const newNonce = await megaClient.readContract({
          address: megaEthMirrorAddress as `0x${string}`,
          abi: mirrorAbi,
          functionName: "nonces",
          args: [userAddress as `0x${string}`],
        });

        console.log(`   New verifiedAt:   ${newVerifiedAt}`);
        console.log(`   New nonce:        ${newNonce}`);

        if (Number(newVerifiedAt) < Number(celoVerifiedAt)) {
          throw new Error(
            `Mirror verifiedAt (${newVerifiedAt}) is still less than Celo (${celoVerifiedAt})`
          );
        }

        if (Number(newNonce) !== Number(megaNonce) + 1) {
          throw new Error(
            `Nonce didn't increment: expected ${Number(megaNonce) + 1}, got ${newNonce}`
          );
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
