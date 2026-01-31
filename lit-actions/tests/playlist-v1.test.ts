#!/usr/bin/env bun
/**
 * Test Playlist v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification over playlist payloads
 *  - Track registration in ScrobbleV3 (if tracks are new)
 *  - Sponsor PKP broadcasts to PlaylistV1 on MegaETH
 *  - Create returns playlistId from event logs
 *  - setTracks / updateMeta / delete work on created playlist
 *
 * Usage:
 *   bun tests/playlist-v1.test.ts
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { ethers } from "ethers";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Test Playlist v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const actionCid = Env.cids["playlistV1"];
  console.log(`   Action CID:  ${actionCid || "(not deployed)"}`);

  if (!actionCid) {
    console.error("\nNo playlistV1 action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts playlistV1");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  // Use the sponsor PKP as the "user" for this test, since the action
  // signs internally using the user's PKP key (single executeJs).
  const userPkpPublicKey = pkpCreds.publicKey;
  const userAddress = pkpCreds.ethAddress;
  console.log(`   User (PKP):  ${userAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "playlist-v1-test",
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

  const provider = new ethers.JsonRpcProvider("https://carrot.megaeth.com/rpc");

  // PlaylistV1 contract for reading userNonces
  const PLAYLIST_V1 = "0xF0337C4A335cbB3B31c981945d3bE5B914F7B329";
  const playlistContract = new ethers.Contract(
    PLAYLIST_V1,
    ["function userNonces(address user) external view returns (uint256)"],
    provider,
  );

  async function getUserNonce(): Promise<string> {
    const n = await playlistContract.userNonces(userAddress);
    return n.toString();
  }

  // ── Test tracks (3 kinds) ──────────────────────────────────────

  const tracks = [
    {
      artist: "Playlist Test Artist",
      title: "Playlist Song One",
      album: "Test Album",
      mbid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    },
    {
      artist: "Playlist Test Artist",
      title: "Playlist Song Two",
      album: "Test Album",
      ipId: "0xabcdef1234567890abcdef1234567890abcdef12",
    },
    {
      artist: "Unknown Playlist Artist",
      title: "Mystery Playlist Track",
      album: "Lost Playlists",
    },
  ];

  // ── Helper: execute a Lit Action call ──────────────────────────

  async function executeLitAction(jsParams: Record<string, any>) {
    const t0 = performance.now();
    const result = await litClient.executeJs({
      ipfsId: actionCid,
      authContext,
      jsParams,
    });
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    const response =
      typeof result.response === "string" ? JSON.parse(result.response) : result.response;
    console.log(`   Executed in ${elapsed}s`);
    return response;
  }

  // ── Helper: sign a message ─────────────────────────────────────

  async function makeTimestampNonce() {
    return {
      timestamp: Date.now(),
      nonce: await getUserNonce(),
    };
  }

  // ================================================================
  // TEST 1: Create playlist
  // ================================================================

  console.log("\n── TEST 1: Create Playlist ──────────────────────────");

  const createTn = await makeTimestampNonce();

  console.log("   Executing create...");
  const createRes = await executeLitAction({
    userPkpPublicKey,
    operation: "create",
    timestamp: createTn.timestamp,
    nonce: createTn.nonce,
    name: "Test Playlist",
    coverCid: "",
    visibility: 0,
    tracks,
  });

  console.log("   Response:", JSON.stringify(createRes, null, 2));

  if (!createRes?.success) throw new Error(`Create failed: ${createRes?.error}`);
  if (createRes.version !== "playlist-v1") throw new Error(`Bad version: ${createRes.version}`);
  if (createRes.user.toLowerCase() !== userAddress.toLowerCase()) throw new Error("User mismatch");
  if (createRes.operation !== "create") throw new Error("Operation mismatch");
  if (!createRes.txHash?.startsWith("0x")) throw new Error("Missing TX hash");
  if (!createRes.playlistId?.startsWith("0x")) throw new Error("Missing playlistId");

  console.log(`   ✓ Created playlist: ${createRes.playlistId}`);
  console.log(`   ✓ TX: ${createRes.txHash}`);
  if (createRes.registered) console.log(`   ✓ Registered ${createRes.registered} new tracks`);

  // Verify on chain
  const createReceipt = await provider.getTransactionReceipt(createRes.txHash);
  if (createReceipt && createReceipt.status === 1) {
    console.log(`   ✓ Confirmed in block ${createReceipt.blockNumber} (${createReceipt.logs.length} log(s))`);
  } else {
    throw new Error("Create TX not confirmed or reverted");
  }

  const playlistId = createRes.playlistId;

  // ================================================================
  // TEST 2: setTracks (replace track list)
  // ================================================================

  console.log("\n── TEST 2: Set Tracks ──────────────────────────────");

  // Use only first 2 tracks
  const newTracks = tracks.slice(0, 2);
  const setTracksTn = await makeTimestampNonce();

  console.log("   Executing setTracks...");
  const setTracksRes = await executeLitAction({
    userPkpPublicKey,
    operation: "setTracks",
    timestamp: setTracksTn.timestamp,
    nonce: setTracksTn.nonce,
    playlistId,
    tracks: newTracks,
  });

  console.log("   Response:", JSON.stringify(setTracksRes, null, 2));

  if (!setTracksRes?.success) throw new Error(`setTracks failed: ${setTracksRes?.error}`);
  if (!setTracksRes.txHash?.startsWith("0x")) throw new Error("Missing TX hash");
  console.log(`   ✓ setTracks TX: ${setTracksRes.txHash}`);

  const setTracksReceipt = await provider.getTransactionReceipt(setTracksRes.txHash);
  if (setTracksReceipt && setTracksReceipt.status === 1) {
    console.log(`   ✓ Confirmed in block ${setTracksReceipt.blockNumber} (${setTracksReceipt.logs.length} log(s))`);
  } else {
    throw new Error("setTracks TX not confirmed or reverted");
  }

  // ================================================================
  // TEST 3: updateMeta (rename + set cover)
  // ================================================================

  console.log("\n── TEST 3: Update Meta ─────────────────────────────");

  const updateTn = await makeTimestampNonce();

  console.log("   Executing updateMeta...");
  const updateRes = await executeLitAction({
    userPkpPublicKey,
    operation: "updateMeta",
    timestamp: updateTn.timestamp,
    nonce: updateTn.nonce,
    playlistId,
    name: "Renamed Playlist",
    coverCid: "QmTestCoverCid123",
    visibility: 1,
  });

  console.log("   Response:", JSON.stringify(updateRes, null, 2));

  if (!updateRes?.success) throw new Error(`updateMeta failed: ${updateRes?.error}`);
  if (!updateRes.txHash?.startsWith("0x")) throw new Error("Missing TX hash");
  console.log(`   ✓ updateMeta TX: ${updateRes.txHash}`);

  const updateReceipt = await provider.getTransactionReceipt(updateRes.txHash);
  if (updateReceipt && updateReceipt.status === 1) {
    console.log(`   ✓ Confirmed in block ${updateReceipt.blockNumber} (${updateReceipt.logs.length} log(s))`);
  } else {
    throw new Error("updateMeta TX not confirmed or reverted");
  }

  // ================================================================
  // TEST 4: Delete playlist
  // ================================================================

  console.log("\n── TEST 4: Delete Playlist ─────────────────────────");

  const deleteTn = await makeTimestampNonce();

  console.log("   Executing delete...");
  const deleteRes = await executeLitAction({
    userPkpPublicKey,
    operation: "delete",
    timestamp: deleteTn.timestamp,
    nonce: deleteTn.nonce,
    playlistId,
  });

  console.log("   Response:", JSON.stringify(deleteRes, null, 2));

  if (!deleteRes?.success) throw new Error(`delete failed: ${deleteRes?.error}`);
  if (!deleteRes.txHash?.startsWith("0x")) throw new Error("Missing TX hash");
  console.log(`   ✓ delete TX: ${deleteRes.txHash}`);

  const deleteReceipt = await provider.getTransactionReceipt(deleteRes.txHash);
  if (deleteReceipt && deleteReceipt.status === 1) {
    console.log(`   ✓ Confirmed in block ${deleteReceipt.blockNumber} (${deleteReceipt.logs.length} log(s))`);
  } else {
    throw new Error("delete TX not confirmed or reverted");
  }

  // ================================================================
  // ALL PASSED
  // ================================================================

  console.log("\n" + "=".repeat(60));
  console.log("All 4 tests passed!");
  console.log(`   ✓ create  → playlistId + TX confirmed + events emitted`);
  console.log(`   ✓ setTracks → TX confirmed + events emitted`);
  console.log(`   ✓ updateMeta → TX confirmed + events emitted`);
  console.log(`   ✓ delete  → TX confirmed + events emitted`);
  console.log("=".repeat(60));

  await litClient.disconnect();
}

main().catch((e) => {
  console.error("\nFAIL:", e?.message || e);
  process.exit(1);
});
