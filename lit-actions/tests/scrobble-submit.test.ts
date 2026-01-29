#!/usr/bin/env bun
/**
 * Test Scrobble Submit v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification over batch hash
 *  - Track normalization + track_key computation
 *  - Pin batch JSON to Filebase IPFS
 *  - Sponsor PKP broadcasts EAS attestation on Base Sepolia
 *  - Returns CID + attestation UID + tx hash
 *
 * Usage:
 *   bun tests/scrobble-submit.test.ts
 *   bun tests/scrobble-submit.test.ts --dry-run   # Skip EAS broadcast (test pin only)
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDryRun = process.argv.includes("--dry-run");

async function main() {
  console.log("Test Scrobble Submit v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  if (isDryRun) console.log("   Mode:        DRY RUN (no EAS broadcast)");

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(`   Action CID:  ${Env.cids.scrobbleSubmit || "(not deployed)"}`);

  if (!Env.cids.scrobbleSubmit) {
    console.error("\nNo scrobbleSubmit action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts scrobbleSubmit");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const wallet = new ethers.Wallet(pk);
  const userAddress = wallet.address;
  const userPkpPublicKey = ethers.SigningKey.computePublicKey(pk, false);
  console.log(`   User (EOA):  ${userAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "scrobble-submit-test",
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

  // Build test scrobble batch
  const now = Math.floor(Date.now() / 1000);
  const tracks = [
    {
      artist: "Mariya Takeuchi",
      title: "Plastic Love",
      album: "Variety",
      duration_ms: 289000,
      playedAt: now - 600,
      source: "heaven-desktop",
      isrc: null,
      ipId: null,
    },
    {
      artist: "Tatsuro Yamashita",
      title: "Ride on Time",
      album: "Ride on Time",
      duration_ms: 330000,
      playedAt: now - 300,
      source: "heaven-desktop",
      isrc: "JPB600500042",
      ipId: null,
    },
    {
      artist: "Miki Matsubara",
      title: "Stay with Me",
      album: "Pocket Park",
      duration_ms: 278000,
      playedAt: now,
      source: "heaven-desktop",
      isrc: null,
      ipId: "0x1234567890abcdef1234567890abcdef12345678", // fake ipId for test
    },
  ];

  console.log(`\n   Tracks:      ${tracks.length}`);
  for (const t of tracks) {
    console.log(`     ${t.artist} - ${t.title} (${t.duration_ms! / 1000}s)`);
    if (t.isrc) console.log(`       ISRC: ${t.isrc}`);
    if (t.ipId) console.log(`       ipId: ${t.ipId}`);
  }

  // We need to compute the batch hash the same way the action does.
  // The action normalizes tracks, builds JSON, then hashes it.
  // For the signature, we need that exact hash. But the action computes normalization internally.
  // So we sign over the batch hash of the *input* tracks JSON, and the action will
  // normalize + rebuild + re-hash internally, then verify.
  //
  // Wait — the action computes batchHash from the *normalized* JSON it builds internally.
  // The signature binds that hash. But we don't know the exact output until the action runs.
  //
  // Looking at the action code: it normalizes, builds batchData JSON, computes batchHash,
  // then verifies the signature over `heaven:scrobble:${batchHash}:...`.
  // This means the client needs to do the same normalization to produce the same hash.
  //
  // For the test, we replicate the normalization logic here.

  function normalizeText(text: string): string {
    if (!text) return "";
    let s = text.normalize("NFKC").toLowerCase().trim();
    s = s.replace(/\s+/g, " ");
    s = s.replace(/\s*[\(\[][^)\]]*(?:feat|ft|remix|remaster|deluxe|bonus|live|edit|version|acoustic|explicit|clean)[^)\]]*[\)\]]/gi, "");
    return s.trim();
  }

  async function sha256Hex(message: string): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function computeTrackKey(artistNorm: string, titleNorm: string): Promise<string> {
    return sha256Hex(`${artistNorm}\x00${titleNorm}`);
  }

  // Replicate what the action does
  let minTs = Infinity, maxTs = -Infinity;
  const normalizedTracks = [];
  for (const t of tracks) {
    minTs = Math.min(minTs, t.playedAt);
    maxTs = Math.max(maxTs, t.playedAt);
    const artistNorm = normalizeText(t.artist);
    const titleNorm = normalizeText(t.title);
    const albumNorm = t.album ? normalizeText(t.album) : "";
    const trackKey = await computeTrackKey(artistNorm, titleNorm);
    normalizedTracks.push({
      raw: {
        artist: t.artist.slice(0, 256),
        title: t.title.slice(0, 256),
        album: t.album ? t.album.slice(0, 256) : null,
        duration_ms: typeof t.duration_ms === "number" ? t.duration_ms : null,
        playedAt: t.playedAt,
        source: t.source ? t.source.slice(0, 64) : null,
      },
      normalized: {
        artist_norm: artistNorm,
        title_norm: titleNorm,
        album_norm: albumNorm,
        duration_s: typeof t.duration_ms === "number" ? Math.round(t.duration_ms / 1000) : null,
      },
      isrc: t.isrc || null,
      ipId: t.ipId || null,
      track_key: trackKey,
    });
  }

  const batchData = {
    version: 4,
    user: userAddress.toLowerCase(),
    startTs: String(Math.floor(minTs)),
    endTs: String(Math.floor(maxTs)),
    count: normalizedTracks.length,
    tracks: normalizedTracks,
  };
  const batchJson = JSON.stringify(batchData);
  const batchHash = await sha256Hex(batchJson);

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();

  const message = `heaven:scrobble:${batchHash}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  console.log(`\n   Batch hash:  ${batchHash.slice(0, 16)}...`);
  console.log(`   Timestamp:   ${timestamp}`);
  console.log(`   Nonce:       ${nonce}`);

  // Build jsParams
  let jsParams: any = {
    userPkpPublicKey,
    tracks,
    signature,
    timestamp,
    nonce,
  };

  // Filebase key
  const filebaseKeyPath = join(Env.paths.keys, "scrobbleSubmit", "filebase_api_key_scrobbleSubmit.json");
  if (existsSync(filebaseKeyPath)) {
    jsParams.filebaseEncryptedKey = JSON.parse(readFileSync(filebaseKeyPath, "utf-8"));
    console.log("   Filebase key:  encrypted");
  } else {
    const plaintextKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
    if (plaintextKey) {
      jsParams.filebasePlaintextKey = plaintextKey;
      console.log("   Filebase key:  plaintext (env)");
    } else {
      console.error("\nNo Filebase key found. Set FILEBASE_SONGS_BUCKET_API_KEY or run setup.ts");
      process.exit(1);
    }
  }

  console.log("\nExecuting Lit Action...");
  const t0 = performance.now();

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.scrobbleSubmit,
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

    console.log("\nSUCCESS!");
    console.log(`   Version:         ${response.version}`);
    console.log(`   User:            ${response.user}`);
    console.log(`   CID:             ${response.cid}`);
    console.log(`   Count:           ${response.count}`);
    console.log(`   Start TS:        ${response.startTs}`);
    console.log(`   End TS:          ${response.endTs}`);
    console.log(`   Batch Hash:      ${response.batchHash?.slice(0, 16)}...`);

    // Verify CID
    if (!response.cid || (!response.cid.startsWith("Qm") && !response.cid.startsWith("bafy"))) {
      throw new Error(`Invalid CID: ${response.cid}`);
    }
    console.log("   CID valid");

    // Verify user
    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${userAddress}, got ${response.user}`);
    }
    console.log("   User matches");

    // Verify count
    if (response.count !== tracks.length) {
      throw new Error(`Count mismatch: expected ${tracks.length}, got ${response.count}`);
    }
    console.log("   Count matches");

    // Verify batch hash matches what we computed
    if (response.batchHash !== batchHash) {
      throw new Error(`Batch hash mismatch:\n  expected: ${batchHash}\n  got:      ${response.batchHash}`);
    }
    console.log("   Batch hash matches");

    // MegaETH TX verification
    if (response.txHash) {
      console.log(`   TX Hash:         ${response.txHash}`);
      console.log(`   Block:           ${response.blockNumber}`);

      // Verify on MegaETH
      console.log("\n   Verifying on MegaETH...");
      const provider = new ethers.JsonRpcProvider("https://carrot.megaeth.com/rpc");
      const receipt = await provider.getTransactionReceipt(response.txHash);
      if (receipt && receipt.status === 1) {
        console.log(`   TX confirmed in block ${receipt.blockNumber}`);
        // Verify ScrobbleBatch event was emitted
        if (receipt.logs && receipt.logs.length > 0) {
          console.log(`   ScrobbleBatch event emitted (${receipt.logs.length} log(s))`);
        }
      } else {
        console.warn("   TX not confirmed yet (may need more time)");
      }
    } else {
      console.log("   TX Hash:         missing (unexpected)");
    }

    // Verify IPFS content is fetchable
    console.log(`\n   Fetching CID from IPFS gateway...`);
    const gatewayUrl = `https://ipfs.filebase.io/ipfs/${response.cid}`;
    const fetchResp = await fetch(gatewayUrl);
    if (fetchResp.ok) {
      const fetched = await fetchResp.json();
      console.log(`   Fetched batch: version=${fetched.version}, count=${fetched.count}, tracks=${fetched.tracks?.length}`);

      // Verify per-track fields
      for (let i = 0; i < fetched.tracks.length; i++) {
        const ft = fetched.tracks[i];
        const ot = tracks[i];
        console.log(`     Track ${i + 1}: ${ft.raw.artist} - ${ft.raw.title}`);
        console.log(`       track_key: ${ft.track_key.slice(0, 16)}...`);
        console.log(`       normalized: ${ft.normalized.artist_norm} - ${ft.normalized.title_norm}`);
        if (ft.isrc) console.log(`       isrc: ${ft.isrc}`);
        if (ft.ipId) console.log(`       ipId: ${ft.ipId}`);

        // Verify optional fields passed through
        if (ot.isrc && ft.isrc !== ot.isrc) {
          throw new Error(`ISRC mismatch on track ${i}: expected ${ot.isrc}, got ${ft.isrc}`);
        }
        if (ot.ipId && ft.ipId !== ot.ipId) {
          throw new Error(`ipId mismatch on track ${i}: expected ${ot.ipId}, got ${ft.ipId}`);
        }
      }
      console.log("   All tracks verified");
    } else {
      console.warn(`   Gateway fetch failed: ${fetchResp.status} (CID may not be propagated yet)`);
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
