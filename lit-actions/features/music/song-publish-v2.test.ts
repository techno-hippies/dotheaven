#!/usr/bin/env bun
/**
 * Integration test: Song Publish v2 Lit Action (instrumental fast-path)
 *
 * Verifies:
 * - v2 action executes from CID
 * - storage-agnostic params are accepted (storageEncryptedKey/storagePlaintextKey)
 * - ref aliases are accepted (audioRef/coverRef/instrumentalRef/vocalsRef)
 * - instrumental mode skips alignment + translation
 * - content CIDs are returned and valid
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isCid(value: unknown): boolean {
  const v = String(value || "");
  return v.startsWith("Qm") || v.startsWith("bafy");
}

async function main() {
  console.log("Test Song Publish v2 — INSTRUMENTAL");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  const actionCid = (Env.cids as any).songPublishV2 || process.env.SONG_PUBLISH_V2_CID || "";

  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(`   Action CID:  ${actionCid || "(not deployed)"}`);

  if (!actionCid) {
    console.error("\nNo songPublishV2 action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts songPublishV2");
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
      appName: "song-publish-v2-test",
      networkName: Env.name,
      storagePath: "./output/lit-auth",
    }),
  });

  console.log("\nAuthenticating EOA...");
  const authData = await ViemAccountAuthenticator.authenticate(authEoa);
  const authContext = await authManager.createPkpAuthContext({
    authData,
    pkpPublicKey: pkpCreds.publicKey,
    authConfig: {
      resources: [["pkp-signing", "*"], ["lit-action-execution", "*"]],
      expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
      statement: "",
    },
    litClient,
  });
  console.log("Auth context ready");

  // Tiny fixture payloads to keep request size small.
  // Audio bytes are a minimal MPEG-like frame header; sufficient for upload smoke path.
  const audioBytes = new Uint8Array(417);
  audioBytes[0] = 0xff;
  audioBytes[1] = 0xfb;
  audioBytes[2] = 0x90;
  audioBytes[3] = 0x00;

  const coverBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  // Reuse tiny bytes for instrumental + vocals in instrumental fast-path.
  const instrumentalBytes = audioBytes;
  const vocalsBytes = audioBytes;

  const audioHash = await sha256Hex(audioBytes);
  const coverHash = await sha256Hex(coverBytes);
  const instrumentalHash = await sha256Hex(instrumentalBytes);
  const vocalsHash = await sha256Hex(vocalsBytes);

  const lyricsText = "(instrumental)";
  const sourceLanguage = "English";
  const targetLanguage = "ja";

  const songMetadata = JSON.stringify({ title: "Test Instrumental v2", artist: "Test", version: "2.0.0" });
  const ipaMetadata = JSON.stringify({ title: "Test Instrumental v2" });
  const nftMetadata = JSON.stringify({ name: "Test Instrumental v2" });

  const songMetadataHash = await sha256Hex(new TextEncoder().encode(songMetadata));
  const ipaMetadataHash = await sha256Hex(new TextEncoder().encode(ipaMetadata));
  const nftMetadataHash = await sha256Hex(new TextEncoder().encode(nftMetadata));
  const lyricsHash = await sha256Hex(new TextEncoder().encode(lyricsText));

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();

  // No canvas in this smoke test => canvas hash is empty.
  const message = `heaven:publish:${audioHash}:${coverHash}:${instrumentalHash}:${vocalsHash}::${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguage}:${targetLanguage}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  let jsParams: any = {
    userPkpPublicKey,
    // v2 ref aliases
    audioRef: { base64: toBase64(audioBytes), contentType: "audio/mpeg" },
    coverRef: { base64: toBase64(coverBytes), contentType: "image/png" },
    instrumentalRef: { base64: toBase64(instrumentalBytes), contentType: "audio/mpeg" },
    vocalsRef: { base64: toBase64(vocalsBytes), contentType: "audio/mpeg" },
    songMetadataJson: songMetadata,
    ipaMetadataJson: ipaMetadata,
    nftMetadataJson: nftMetadata,
    signature,
    timestamp,
    nonce,
    lyricsText,
    sourceLanguage,
    targetLanguage,
  };

  // Filebase key: prefer v2 encrypted key, fallback to v1 key, then plaintext env.
  const filebaseV2Path = join(Env.paths.keys, "songPublishV2", "filebase_api_key_songPublishV2.json");
  const filebaseV1Path = join(Env.paths.keys, "songPublish", "filebase_api_key_songPublish.json");
  if (existsSync(filebaseV2Path)) {
    const keyJson = JSON.parse(readFileSync(filebaseV2Path, "utf-8"));
    jsParams.storageEncryptedKey = keyJson;
    jsParams.filebaseEncryptedKey = keyJson;
    console.log("\n   Storage key: encrypted (songPublishV2)");
  } else if (existsSync(filebaseV1Path)) {
    const keyJson = JSON.parse(readFileSync(filebaseV1Path, "utf-8"));
    jsParams.storageEncryptedKey = keyJson;
    jsParams.filebaseEncryptedKey = keyJson;
    console.log("\n   Storage key: encrypted (songPublish fallback)");
  } else if (process.env.FILEBASE_SONGS_BUCKET_API_KEY) {
    jsParams.storagePlaintextKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
    jsParams.filebasePlaintextKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
    console.log("\n   Storage key: plaintext (env)");
  } else {
    console.error("\nNo Filebase key found. Run: bun scripts/setup.ts songPublishV2");
    process.exit(1);
  }

  console.log("\nExecuting Lit Action...");
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
    if (response.version !== "song-publish-v2") {
      throw new Error(`Expected version song-publish-v2, got: ${response.version}`);
    }

    if (response.alignmentCID !== null || response.translationCID !== null) {
      throw new Error("Instrumental mode should return null alignmentCID/translationCID");
    }
    if (response.alignment !== null || response.translation !== null) {
      throw new Error("Instrumental mode should return null alignment/translation payloads");
    }

    const cidFields = [
      ["audioCID", response.audioCID],
      ["coverCID", response.coverCID],
      ["instrumentalCID", response.instrumentalCID],
      ["vocalsCID", response.vocalsCID],
      ["songMetadataCID", response.songMetadataCID],
      ["ipaMetadataCID", response.ipaMetadataCID],
      ["nftMetadataCID", response.nftMetadataCID],
    ] as const;

    for (const [label, cid] of cidFields) {
      if (!isCid(cid)) throw new Error(`Invalid ${label}: ${cid}`);
    }

    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${userAddress}, got ${response.user}`);
    }

    console.log("\nAll checks passed!");
  } catch (error: any) {
    console.error("\nExecution failed:", error.message);
    if (error.cause) console.error("   Cause:", error.cause);
    process.exit(1);
  } finally {
    await litClient.disconnect();
  }
}

main().catch((e) => {
  console.error("\nFAIL:", e?.message || e);
  process.exit(1);
});
