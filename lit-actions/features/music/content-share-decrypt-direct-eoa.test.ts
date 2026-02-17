#!/usr/bin/env bun
/**
 * Direct Lit EOA Content Share/Decrypt Test (No Lit Action, No User PKP)
 *
 * This test validates the user-paid Lit path:
 *  1. Users authenticate to Lit as EOAs (no PKP).
 *  2. Encryption/decryption is done directly with litClient.encrypt/decrypt.
 *  3. Sharing/revocation is reflected by rotating encrypted key policy (ACC).
 *
 * Optional Tempo on-chain checks:
 *  - If RUN_TEMPO_ONCHAIN=1 and sponsor key matches ContentRegistry.sponsor(),
 *    the test also executes register/grant/revoke on Tempo ContentRegistry and
 *    asserts canAccess() transitions.
 *
 * Notes:
 * - This test intentionally does not use executeJs or any Lit Action CIDs.
 * - Tempo chain ACCs are not yet accepted by this Lit SDK version, so this test
 *   uses EOA-address ACC policy rotation for direct Lit validation.
 *
 * Usage:
 *   bun features/music/content-share-decrypt-direct-eoa.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { tempoModerato } from "viem/chains";
import { Env } from "../../tests/shared/env";
import { Wallet, hexlify, randomBytes } from "ethers";

const TEMPO_RPC_URL = process.env.TEMPO_RPC_URL || "https://rpc.moderato.tempo.xyz";
const TEMPO_FEE_TOKEN =
  process.env.TEMPO_FEE_TOKEN || "0x20c0000000000000000000000000000000000001";
const TEMPO_CONTENT_REGISTRY =
  process.env.TEMPO_CONTENT_REGISTRY || "0x2A3beA895AE5bb4415c436155cbA15a97ACc2C77";

const CONTENT_REGISTRY_ABI = parseAbi([
  "function sponsor() view returns (address)",
  "function canAccess(address user, bytes32 contentId) view returns (bool)",
  "function registerContentFor(address contentOwner, bytes32 trackId, address datasetOwner, bytes pieceCid, uint8 algo) returns (bytes32 contentId)",
  "function grantAccessFor(address contentOwner, bytes32 contentId, address user)",
  "function revokeAccessFor(address contentOwner, bytes32 contentId, address user)",
]);

type TempoOnchainContext =
  | {
      enabled: false;
      reason: string;
    }
  | {
      enabled: true;
      publicClient: ReturnType<typeof createPublicClient>;
      walletClient: ReturnType<typeof createWalletClient>;
      sponsorAddress: `0x${string}`;
      registryAddress: `0x${string}`;
    };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function createLitClientWithRetry(attempts = 3) {
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await createLitClient({ network: Env.litNetwork });
    } catch (err) {
      lastError = err;
      const msg = (err as any)?.message || (err as any)?.shortMessage || String(err);
      console.log(`   Lit connect attempt ${i}/${attempts} failed: ${msg.split("\n")[0]}`);
      if (i < attempts) await sleep(500 * i);
    }
  }

  throw lastError;
}

function buildAddressOnlyAcc(allowedAddresses: string[]) {
  const conditions: any[] = [];
  for (let i = 0; i < allowedAddresses.length; i++) {
    conditions.push({
      conditionType: "evmBasic" as const,
      contractAddress: "" as const,
      standardContractType: "" as const,
      chain: "ethereum",
      method: "" as const,
      parameters: [":userAddress"],
      returnValueTest: {
        comparator: "=",
        value: allowedAddresses[i].toLowerCase(),
      },
    });

    if (i < allowedAddresses.length - 1) {
      conditions.push({ operator: "or" as const });
    }
  }

  // Lit unified ACC format expects an array of condition groups.
  return [conditions];
}

async function createEoaAuthContext(params: {
  authManager: ReturnType<typeof createAuthManager>;
  litClient: Awaited<ReturnType<typeof createLitClient>>;
  wallet: Wallet;
  appName: string;
}) {
  const account = privateKeyToAccount(params.wallet.privateKey as `0x${string}`);
  return params.authManager.createEoaAuthContext({
    config: { account },
    authConfig: {
      resources: [["access-control-condition-decryption", "*"]],
      expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
      statement: "",
    },
    litClient: params.litClient,
  });
}

async function initTempoOnchainContext(): Promise<TempoOnchainContext> {
  if (process.env.RUN_TEMPO_ONCHAIN !== "1") {
    return {
      enabled: false,
      reason: "RUN_TEMPO_ONCHAIN != 1 (skipping sponsored Tempo write path)",
    };
  }

  let sponsorPrivateKey = process.env.TEMPO_SPONSOR_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!sponsorPrivateKey) {
    return {
      enabled: false,
      reason: "TEMPO_SPONSOR_PRIVATE_KEY/PRIVATE_KEY missing",
    };
  }
  if (!sponsorPrivateKey.startsWith("0x")) sponsorPrivateKey = "0x" + sponsorPrivateKey;

  const sponsorAccount = privateKeyToAccount(sponsorPrivateKey as `0x${string}`);
  const registryAddress = TEMPO_CONTENT_REGISTRY as `0x${string}`;

  const publicClient = createPublicClient({
    chain: tempoModerato,
    transport: http(TEMPO_RPC_URL),
  });

  const sponsorOnChain = await publicClient.readContract({
    address: registryAddress,
    abi: CONTENT_REGISTRY_ABI,
    functionName: "sponsor",
  });

  if (String(sponsorOnChain).toLowerCase() !== sponsorAccount.address.toLowerCase()) {
    return {
      enabled: false,
      reason:
        `Sponsor key mismatch. ContentRegistry.sponsor=${sponsorOnChain}, ` +
        `provided=${sponsorAccount.address}`,
    };
  }

  const walletClient = createWalletClient({
    account: sponsorAccount,
    chain: tempoModerato.extend({ feeToken: TEMPO_FEE_TOKEN as `0x${string}` }),
    transport: http(TEMPO_RPC_URL),
  });

  return {
    enabled: true,
    publicClient,
    walletClient,
    sponsorAddress: sponsorAccount.address,
    registryAddress,
  };
}

async function sendAndWait(params: {
  tempo: Extract<TempoOnchainContext, { enabled: true }>;
  label: string;
  args: readonly unknown[];
  functionName: "registerContentFor" | "grantAccessFor" | "revokeAccessFor";
}) {
  const hash = await params.tempo.walletClient.writeContract({
    address: params.tempo.registryAddress,
    abi: CONTENT_REGISTRY_ABI,
    functionName: params.functionName,
    args: params.args as any,
  });

  const receipt = await params.tempo.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${params.label} reverted (tx: ${hash})`);
  }
  console.log(`   ✓ ${params.label}: ${hash}`);
}

async function expectDecryptFailure(params: {
  litClient: Awaited<ReturnType<typeof createLitClient>>;
  acc: ReturnType<typeof buildAddressOnlyAcc>;
  ciphertext: string;
  dataToEncryptHash: string;
  authContext: any;
  label: string;
}) {
  try {
    await params.litClient.decrypt({
      unifiedAccessControlConditions: params.acc,
      ciphertext: params.ciphertext,
      dataToEncryptHash: params.dataToEncryptHash,
      authContext: params.authContext,
      chain: "ethereum",
    });
    throw new Error(`${params.label}: expected decrypt failure but succeeded`);
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || String(err);
    console.log(`   ✓ ${params.label}: denied (${msg.split("\n")[0]})`);
  }
}

async function main() {
  console.log("Direct Lit EOA Share/Decrypt Test (No Action, No PKP)");
  console.log("=".repeat(72));
  console.log(`   Lit Env: ${Env.name}`);
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const authStoragePath = `./output/lit-auth/content-share-decrypt-direct-eoa-${runId}`;
  console.log(`   Auth storage: ${authStoragePath}`);

  const tempo = await initTempoOnchainContext();
  if (tempo.enabled) {
    console.log(`   Tempo on-chain path: enabled (${tempo.registryAddress})`);
    console.log(`   Sponsor: ${tempo.sponsorAddress}`);
  } else {
    console.log(`   Tempo on-chain path: skipped (${tempo.reason})`);
  }

  const alice = Wallet.createRandom();
  const bob = Wallet.createRandom();
  console.log(`   Alice: ${alice.address}`);
  console.log(`   Bob:   ${bob.address}`);

  console.log("\n-- Init: Lit client + auth contexts --");
  console.log("   Connecting Lit client...");
  const litClient = await createLitClientWithRetry();
  console.log("   ✓ Lit client connected");
  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "content-share-decrypt-direct-eoa-test",
      networkName: Env.name,
      // Isolate each run to avoid stale auth/session collisions in local cache.
      storagePath: authStoragePath,
    }),
  });

  console.log("   Creating Alice auth context...");
  const aliceAuth = await createEoaAuthContext({
    authManager,
    litClient,
    wallet: alice,
    appName: "alice",
  });
  console.log("   ✓ Alice auth context");
  console.log("   Creating Bob auth context...");
  const bobAuth = await createEoaAuthContext({
    authManager,
    litClient,
    wallet: bob,
    appName: "bob",
  });
  console.log("   ✓ Bob auth context");

  const trackId = hexlify(randomBytes(32)) as `0x${string}`;
  const contentId = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
      ],
      [trackId, alice.address as `0x${string}`]
    )
  ).toLowerCase();

  console.log(`   trackId:   ${trackId}`);
  console.log(`   contentId: ${contentId}`);

  const keyBase64 = Buffer.from(randomBytes(32)).toString("base64");
  const payload = JSON.stringify({ contentId, key: keyBase64 });

  try {
    if (tempo.enabled) {
      console.log("\n-- Step 1: Tempo register/grant/revoke setup --");
      const pieceCid = `baga6ea4seaqtempo${Date.now().toString(36)}`;
      const pieceCidBytes = toHex(new TextEncoder().encode(pieceCid));

      await sendAndWait({
        tempo,
        label: "registerContentFor",
        functionName: "registerContentFor",
        args: [
          alice.address as `0x${string}`,
          trackId,
          alice.address as `0x${string}`,
          pieceCidBytes,
          1,
        ],
      });

      const ownerCanAccess = await tempo.publicClient.readContract({
        address: tempo.registryAddress,
        abi: CONTENT_REGISTRY_ABI,
        functionName: "canAccess",
        args: [alice.address as `0x${string}`, contentId as `0x${string}`],
      });
      if (!ownerCanAccess) throw new Error("Owner should have access after register");
      console.log("   ✓ on-chain owner access true");
    }

    console.log("\n-- Step 2: Encrypt with Alice-only ACC (direct Lit) --");
    const aliceOnlyAcc = buildAddressOnlyAcc([alice.address]);
    const encryptedAliceOnly = await litClient.encrypt({
      unifiedAccessControlConditions: aliceOnlyAcc,
      dataToEncrypt: new TextEncoder().encode(payload),
    });
    console.log("   ✓ Encrypted (Alice-only policy)");

    console.log("\n-- Step 3: Bob decrypt should fail before share --");
    await expectDecryptFailure({
      litClient,
      acc: aliceOnlyAcc,
      ciphertext: encryptedAliceOnly.ciphertext,
      dataToEncryptHash: encryptedAliceOnly.dataToEncryptHash,
      authContext: bobAuth,
      label: "Bob pre-share decrypt",
    });

    if (tempo.enabled) {
      console.log("\n-- Step 4: Tempo grantAccessFor(Bob) --");
      await sendAndWait({
        tempo,
        label: "grantAccessFor",
        functionName: "grantAccessFor",
        args: [
          alice.address as `0x${string}`,
          contentId as `0x${string}`,
          bob.address as `0x${string}`,
        ],
      });

      const bobCanAccess = await tempo.publicClient.readContract({
        address: tempo.registryAddress,
        abi: CONTENT_REGISTRY_ABI,
        functionName: "canAccess",
        args: [bob.address as `0x${string}`, contentId as `0x${string}`],
      });
      if (!bobCanAccess) throw new Error("Bob should have access after on-chain grant");
      console.log("   ✓ on-chain Bob access true");
    }

    console.log("\n-- Step 5: Re-encrypt with Alice OR Bob ACC --");
    const sharedAcc = buildAddressOnlyAcc([alice.address, bob.address]);
    const encryptedShared = await litClient.encrypt({
      unifiedAccessControlConditions: sharedAcc,
      dataToEncrypt: new TextEncoder().encode(payload),
    });
    console.log("   ✓ Encrypted (shared policy)");

    const bobDecrypted = await litClient.decrypt({
      unifiedAccessControlConditions: sharedAcc,
      ciphertext: encryptedShared.ciphertext,
      dataToEncryptHash: encryptedShared.dataToEncryptHash,
      authContext: bobAuth,
      chain: "ethereum",
    });
    const parsedBobPayload = JSON.parse(new TextDecoder().decode(bobDecrypted.decryptedData));
    if (parsedBobPayload.contentId?.toLowerCase() !== contentId) {
      throw new Error("Bob decrypted payload contentId mismatch");
    }
    if (parsedBobPayload.key !== keyBase64) {
      throw new Error("Bob decrypted key mismatch");
    }
    console.log("   ✓ Bob decrypted after share");

    if (tempo.enabled) {
      console.log("\n-- Step 6: Tempo revokeAccessFor(Bob) --");
      await sendAndWait({
        tempo,
        label: "revokeAccessFor",
        functionName: "revokeAccessFor",
        args: [
          alice.address as `0x${string}`,
          contentId as `0x${string}`,
          bob.address as `0x${string}`,
        ],
      });

      const bobCanAccessAfterRevoke = await tempo.publicClient.readContract({
        address: tempo.registryAddress,
        abi: CONTENT_REGISTRY_ABI,
        functionName: "canAccess",
        args: [bob.address as `0x${string}`, contentId as `0x${string}`],
      });
      if (bobCanAccessAfterRevoke) {
        throw new Error("Bob should not have access after on-chain revoke");
      }
      console.log("   ✓ on-chain Bob access false");
    }

    console.log("\n-- Step 7: Re-encrypt with Alice-only ACC (post-revoke) --");
    const postRevokeAcc = buildAddressOnlyAcc([alice.address]);
    const encryptedPostRevoke = await litClient.encrypt({
      unifiedAccessControlConditions: postRevokeAcc,
      dataToEncrypt: new TextEncoder().encode(payload),
    });
    await expectDecryptFailure({
      litClient,
      acc: postRevokeAcc,
      ciphertext: encryptedPostRevoke.ciphertext,
      dataToEncryptHash: encryptedPostRevoke.dataToEncryptHash,
      authContext: bobAuth,
      label: "Bob post-revoke decrypt",
    });

    console.log(`\n${"=".repeat(72)}`);
    console.log("ALL CHECKS PASSED");
    console.log("No Lit Actions used. No user PKP used.");
    console.log(
      "Note: direct Tempo ACCs are not yet accepted by this Lit SDK; policy rotation is used for direct path testing."
    );
    console.log("=".repeat(72));
  } finally {
    litClient.disconnect();
  }
}

main().catch((err: any) => {
  console.error("\nFAILED");
  const msg = err?.message || err?.shortMessage || String(err);
  const cause = err?.cause?.message ? `\nCause: ${err.cause.message}` : "";
  console.error(`${msg}${cause}`);
  process.exit(1);
});
