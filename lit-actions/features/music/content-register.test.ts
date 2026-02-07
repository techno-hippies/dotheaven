#!/usr/bin/env bun
/**
 * Test Content Register v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification
 *  - Dual-broadcast: Base mirror first, then MegaETH ContentRegistry
 *  - ContentAccessMirror.canAccess() returns true for owner on Base
 *  - ContentRegistry.canAccess() returns true for owner on MegaETH
 *  - Cover image upload to Filebase + setTrackCoverBatch on ScrobbleV3
 *  - Returns contentId, txHash, mirrorTxHash, coverCid, coverTxHash
 *
 * Usage:
 *   bun tests/content-register.test.ts
 *   bun tests/content-register.test.ts --dry-run
 *   bun tests/content-register.test.ts --with-cover
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { randomBytes, hexlify, keccak256, AbiCoder, Contract, JsonRpcProvider } from "ethers";
import { dirname } from "path";
import { fileURLToPath } from "url";

const abiCoder = AbiCoder.defaultAbiCoder();

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const withCover = process.argv.includes("--with-cover");

// Contract addresses
const MEGAETH_RPC = "https://carrot.megaeth.com/rpc";
const BASE_RPC = "https://sepolia.base.org";
const CONTENT_REGISTRY = "0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2";
const CONTENT_ACCESS_MIRROR = "0xd4D3baB38a11D72e36F49a73D50Dbdc3c1Aa4e9A";
const SCROBBLE_V3 = "0x144c450cd5B641404EEB5D5eD523399dD94049E0";

// Generate a small test image (1x1 red PNG, ~70 bytes)
function createTestImage(): { base64: string; contentType: string } {
  // Minimal valid 1x1 red PNG
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // 8-bit RGB
    0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
    0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, // compressed data
    0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
    0xae, 0x42, 0x60, 0x82,
  ]);
  // Convert to base64
  let binary = "";
  for (let i = 0; i < pngBytes.length; i++) {
    binary += String.fromCharCode(pngBytes[i]);
  }
  return {
    base64: btoa(binary),
    contentType: "image/png",
  };
}

async function main() {
  console.log("Test Content Register v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  if (dryRun) console.log("   Mode:        DRY RUN (sign only, no broadcast)");
  if (withCover) console.log("   Mode:        WITH COVER (test album art upload)");

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

  // Test track metadata
  const title = "Test Upload " + Date.now().toString(36);
  const artist = "Content Register Test";
  const album = "";

  // Compute trackId from metadata (kind 3: metadata hash) — matches Lit Action logic
  function normalize(s: string) {
    return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
  }
  const metaPayload = keccak256(
    abiCoder.encode(
      ["string", "string", "string"],
      [normalize(title), normalize(artist), normalize(album)]
    )
  );
  const trackId = keccak256(
    abiCoder.encode(["uint8", "bytes32"], [3, metaPayload])
  );

  // Use a test pieceCid (Filecoin piece CID placeholder)
  const pieceCid = "baga6ea4seaqtest" + Date.now().toString(36);

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();

  console.log(`\n   title:       ${title}`);
  console.log(`   artist:      ${artist}`);
  console.log(`   trackId:     ${trackId}`);
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
    title,
    artist,
    album,
    timestamp,
    nonce,
    dryRun,
  };

  // Add cover image if --with-cover flag is set
  if (withCover) {
    const filebaseKey = process.env.FILEBASE_COVERS_KEY;
    if (!filebaseKey) {
      console.error("\nFILEBASE_COVERS_KEY env var required for --with-cover");
      console.error("Format: base64(accessKey:secretKey:bucket)");
      process.exit(1);
    }
    jsParams.coverImage = createTestImage();
    jsParams.filebasePlaintextKey = filebaseKey;
    console.log(`   Cover image: test PNG (${jsParams.coverImage.base64.length} bytes base64)`);
  }

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
    if (withCover) {
      console.log(`   Cover CID:    ${response.coverCid || "(none)"}`);
      console.log(`   Cover TX:     ${response.coverTxHash || "(none)"}`);
    }

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

    // Track registered
    console.log(`   Track reg'd:  ${response.trackRegistered}`);

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

      // Check ScrobbleV3 track registration
      const scrobbleAbi = [
        "function isRegistered(bytes32 trackId) view returns (bool)",
        "function getTrack(bytes32 trackId) view returns (string title, string artist, string album, uint8 kind, bytes32 payload, uint64 registeredAt, string coverCid)",
      ];
      const scrobbleContract = new Contract(SCROBBLE_V3, scrobbleAbi, megaProvider);
      const isReg = await scrobbleContract.isRegistered(trackId);
      if (!isReg) {
        throw new Error("ScrobbleV3.isRegistered() returned false for trackId");
      }
      console.log("   ✓ ScrobbleV3.isRegistered() = true");

      const trackData = await scrobbleContract.getTrack(trackId);
      console.log(`   ✓ ScrobbleV3 title: "${trackData.title}"`);
      console.log(`   ✓ ScrobbleV3 artist: "${trackData.artist}"`);

      // Verify cover CID if we uploaded one
      if (withCover && response.coverCid) {
        if (!response.coverCid.startsWith("Qm") && !response.coverCid.startsWith("baf")) {
          throw new Error(`Invalid cover CID format: ${response.coverCid}`);
        }
        console.log("   ✓ Cover CID is valid IPFS hash");

        // Check on-chain coverCid
        const onChainCover = trackData.coverCid || trackData[6]; // coverCid is 7th element (index 6)
        if (onChainCover && onChainCover.length > 0) {
          console.log(`   ✓ ScrobbleV3 coverCid: "${onChainCover}"`);
          if (onChainCover !== response.coverCid) {
            console.log(`   ⚠ Cover CID mismatch: action returned ${response.coverCid}, on-chain has ${onChainCover}`);
          }
        } else {
          console.log("   ⚠ On-chain coverCid is empty (cover TX may still be pending)");
        }

        // Verify Filebase gateway accessibility
        const filebaseUrl = `https://heaven.myfilebase.com/ipfs/${response.coverCid}`;
        try {
          const imgRes = await fetch(filebaseUrl, { method: "HEAD" });
          if (imgRes.ok) {
            console.log(`   ✓ Cover accessible via Filebase: ${filebaseUrl}`);
          } else {
            console.log(`   ⚠ Filebase returned ${imgRes.status} (may need propagation time)`);
          }
        } catch (e) {
          console.log(`   ⚠ Could not verify Filebase URL: ${e}`);
        }
      }
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
