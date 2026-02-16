#!/usr/bin/env bun
/**
 * Test Song Publish v1 Lit Action
 *
 * Verifies the combined action:
 *  - Upload files to Filebase IPFS (audio, cover, instrumental, vocals, canvas, 3 metadata)
 *  - Lyrics alignment via ElevenLabs (using vocals stem)
 *  - Lyrics translation via OpenRouter
 *  - Upload alignment + translation to IPFS
 *  - Returns all CIDs + alignment + translation data
 *
 * Usage:
 *   bun features/music/song-publish.test.ts
 *   bun features/music/song-publish.test.ts /path/to/song-dir
 *
 * Song directory structure:
 *   audio.mp3 or *.mp3 (full mix)        — required
 *   vocals.mp3 or *Vocal*.mp3            — required (for FA alignment)
 *   instrumental.mp3 or *Instrumental*   — required (for karaoke)
 *   cover.png or *.png                   — required
 *   canvas.mp4 or *.mp4                  — optional
 *   lyrics.txt                           — required
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { ethers } from "ethers";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── File discovery helpers ──────────────────────────────────────────

function findFile(dir: string, patterns: RegExp[], required = true): string | null {
  const files = readdirSync(dir);
  for (const pat of patterns) {
    const match = files.find(f => pat.test(f));
    if (match) return join(dir, match);
  }
  if (required) throw new Error(`No file matching ${patterns.map(p => p.source).join(" | ")} in ${dir}`);
  return null;
}

// ── S3 pre-upload (same as before) ──────────────────────────────────

async function preUpload(data: Uint8Array, contentType: string, fileName: string, filebaseKey: string): Promise<string> {
  const decoded = atob(filebaseKey);
  const [accessKey, secretKey, bucket] = decoded.split(":");

  const endpoint = "s3.filebase.com";
  const region = "us-east-1";
  const service = "s3";

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${bucket}/${fileName}`;

  const payloadHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data))
  ).map(b => b.toString(16).padStart(2, "0")).join("");

  const canonicalHeaders =
    [`host:${endpoint}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join("\n") + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const crHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest)))
  ).map(b => b.toString(16).padStart(2, "0")).join("");
  const stringToSign = [algorithm, amzDate, credentialScope, crHash].join("\n");

  const enc = new TextEncoder();
  async function hmac(key: ArrayBuffer | Uint8Array, msg: string) {
    const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", k, enc.encode(msg));
  }
  const kDate = await hmac(enc.encode("AWS4" + secretKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const signingKey = await hmac(kService, "aws4_request");
  const sig = Array.from(
    new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", signingKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), enc.encode(stringToSign)))
  ).map(b => b.toString(16).padStart(2, "0")).join("");

  const authHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${sig}`,
  ].join(", ");

  const resp = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "Content-Type": contentType,
    },
    body: data,
  });

  if (!resp.ok) throw new Error(`Pre-upload failed: ${resp.status} ${await resp.text()}`);
  const cid = resp.headers.get("x-amz-meta-cid");
  if (!cid) throw new Error("No CID from pre-upload");
  return cid;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  // Determine song directory
  const songDir = process.argv[2] || "/media/t42/sx66/heaven-songs/jazzin-baby";
  if (!existsSync(songDir)) throw new Error(`Song directory not found: ${songDir}`);

  console.log("Test Song Publish v1 (with vocals stem)");
  console.log("=".repeat(60));
  console.log(`   Song dir:    ${songDir}`);
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(`   Action CID:  ${Env.cids.songPublish || "(not deployed)"}`);

  if (!Env.cids.songPublish) {
    console.error("\nNo songPublish CID. Run: bun scripts/setup.ts songPublish");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const wallet = new ethers.Wallet(pk);
  const userAddress = wallet.address;
  const userPkpPublicKey = ethers.SigningKey.computePublicKey(pk, false);
  console.log(`   User:        ${userAddress}`);

  // ── Discover files ──────────────────────────────────────────────

  const audioPath = findFile(songDir, [/^.*Jazzin.*\.mp3$/i, /^audio\.mp3$/i, /\.mp3$/i])!;
  const vocalsPath = findFile(songDir, [/Lead\s*Vocal/i, /vocal/i, /^vocals\.mp3$/i])!;
  const instrumentalPath = findFile(songDir, [/Instrumental/i, /^instrumental\.mp3$/i])!;
  const coverPath = findFile(songDir, [/^cover\.(png|jpg|jpeg)$/i, /\.png$/i])!;
  const canvasPath = findFile(songDir, [/\.mp4$/i], false);
  const lyricsPath = findFile(songDir, [/^lyrics\.txt$/i])!;

  const audioBytes = new Uint8Array(readFileSync(audioPath));
  const vocalsBytes = new Uint8Array(readFileSync(vocalsPath));
  const instrumentalBytes = new Uint8Array(readFileSync(instrumentalPath));
  const coverBytes = new Uint8Array(readFileSync(coverPath));
  const canvasBytes = canvasPath ? new Uint8Array(readFileSync(canvasPath)) : null;
  const lyricsText = readFileSync(lyricsPath, "utf-8").trim();

  console.log(`\n   Audio:         ${audioPath.split("/").pop()} (${(audioBytes.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   Vocals:        ${vocalsPath.split("/").pop()} (${(vocalsBytes.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   Instrumental:  ${instrumentalPath.split("/").pop()} (${(instrumentalBytes.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   Cover:         ${coverPath.split("/").pop()} (${(coverBytes.length / 1024).toFixed(0)} KB)`);
  if (canvasPath) console.log(`   Canvas:        ${canvasPath.split("/").pop()} (${(canvasBytes!.length / 1024).toFixed(0)} KB)`);
  console.log(`   Lyrics:        ${lyricsText.split("\n").length} lines`);

  // ── Pre-upload to Filebase ────────────────────────────────────

  const filebaseKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
  if (!filebaseKey) { console.error("FILEBASE_SONGS_BUCKET_API_KEY not set"); process.exit(1); }

  console.log("\nPre-uploading to Filebase...");
  const prefix = `test-${Date.now()}`;
  const audioCid = await preUpload(audioBytes, "audio/mpeg", `${prefix}-audio.mp3`, filebaseKey);
  console.log(`   Audio:         ${audioCid}`);
  const vocalsCid = await preUpload(vocalsBytes, "audio/mpeg", `${prefix}-vocals.mp3`, filebaseKey);
  console.log(`   Vocals:        ${vocalsCid}`);
  const instrumentalCid = await preUpload(instrumentalBytes, "audio/mpeg", `${prefix}-instrumental.mp3`, filebaseKey);
  console.log(`   Instrumental:  ${instrumentalCid}`);
  const coverCid = await preUpload(coverBytes, "image/png", `${prefix}-cover.png`, filebaseKey);
  console.log(`   Cover:         ${coverCid}`);

  let canvasCid: string | null = null;
  if (canvasBytes) {
    canvasCid = await preUpload(canvasBytes, "video/mp4", `${prefix}-canvas.mp4`, filebaseKey);
    console.log(`   Canvas:        ${canvasCid}`);
  }

  const GW = "https://ipfs.filebase.io/ipfs/";
  const audioUrl = `${GW}${audioCid}`;
  const vocalsUrl = `${GW}${vocalsCid}`;
  const instrumentalUrl = `${GW}${instrumentalCid}`;
  const coverUrl = `${GW}${coverCid}`;
  const canvasUrl = canvasCid ? `${GW}${canvasCid}` : undefined;

  // ── Compute hashes ────────────────────────────────────────────

  const sha256Hex = async (data: Uint8Array) => {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const audioHash = await sha256Hex(audioBytes);
  const coverHash = await sha256Hex(coverBytes);
  const instrumentalHash = await sha256Hex(instrumentalBytes);
  const vocalsHash = await sha256Hex(vocalsBytes);
  const canvasHash = canvasBytes ? await sha256Hex(canvasBytes) : "";

  const songMetadata = JSON.stringify({
    title: "Jazzin' Baby Blues",
    artist: "Ethel Waters",
    genre: "Jazz",
    primaryLanguage: "English",
    license: "non-commercial",
    version: "1.0.0",
  });
  const ipaMetadata = JSON.stringify({
    title: "Jazzin' Baby Blues",
    artist: "Ethel Waters",
    genre: "Jazz",
    language: "English",
  });
  const nftMetadata = JSON.stringify({
    name: "Jazzin' Baby Blues",
    description: "Jazzin' Baby Blues by Ethel Waters (1924)",
    external_url: "",
  });

  const songMetadataHash = await sha256Hex(new TextEncoder().encode(songMetadata));
  const ipaMetadataHash = await sha256Hex(new TextEncoder().encode(ipaMetadata));
  const nftMetadataHash = await sha256Hex(new TextEncoder().encode(nftMetadata));
  const lyricsHash = await sha256Hex(new TextEncoder().encode(lyricsText));

  const sourceLanguage = "English";
  const targetLanguage = "ja";  // Japanese translation
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();

  // New signature format with vocalsHash
  const message = `heaven:publish:${audioHash}:${coverHash}:${instrumentalHash}:${vocalsHash}:${canvasHash}:${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguage}:${targetLanguage}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  console.log(`\n   Audio hash:    ${audioHash.slice(0, 16)}...`);
  console.log(`   Vocals hash:   ${vocalsHash.slice(0, 16)}...`);
  console.log(`   Translation:   ${sourceLanguage} → ${targetLanguage}`);

  // ── Connect to Lit ────────────────────────────────────────────

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "song-publish-test",
      networkName: Env.name,
      storagePath: "./output/lit-auth",
    }),
  });

  console.log("Authenticating...");
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

  // ── Build jsParams ────────────────────────────────────────────

  let jsParams: any = {
    userPkpPublicKey,
    audioUrl,
    coverUrl,
    instrumentalUrl,
    vocalsUrl,
    canvasUrl,
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

  // Load encrypted keys (or fall back to plaintext)
  const keysDir = join(Env.paths.keys, "songPublish");
  for (const [name, envVar, param, plaintextParam] of [
    ["filebase_api_key", "FILEBASE_SONGS_BUCKET_API_KEY", "filebaseEncryptedKey", "filebasePlaintextKey"],
    ["elevenlabs_api_key", "ELEVENLABS_API_KEY", "elevenlabsEncryptedKey", "elevenlabsPlaintextKey"],
    ["openrouter_api_key", "OPENROUTER_API_KEY", "openrouterEncryptedKey", "openrouterPlaintextKey"],
  ] as const) {
    const keyPath = join(keysDir, `${name}_songPublish.json`);
    if (existsSync(keyPath)) {
      jsParams[param] = JSON.parse(readFileSync(keyPath, "utf-8"));
      console.log(`   ${name}: encrypted`);
    } else if (process.env[envVar]) {
      jsParams[plaintextParam] = process.env[envVar];
      console.log(`   ${name}: plaintext (env)`);
    } else {
      console.error(`\nNo ${name} found. Run: bun scripts/setup.ts songPublish`);
      process.exit(1);
    }
  }

  // ── Execute ───────────────────────────────────────────────────

  console.log("\nExecuting Lit Action...");
  const t0 = performance.now();

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.songPublish,
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
    console.log(`   Audio CID:       ${response.audioCID}`);
    console.log(`   Cover CID:       ${response.coverCID}`);
    console.log(`   Instrumental:    ${response.instrumentalCID ?? "(none)"}`);
    console.log(`   Vocals CID:      ${response.vocalsCID ?? "(none)"}`);
    console.log(`   Canvas CID:      ${response.canvasCID ?? "(none)"}`);
    console.log(`   Song Meta CID:   ${response.songMetadataCID}`);
    console.log(`   IPA Meta CID:    ${response.ipaMetadataCID}`);
    console.log(`   NFT Meta CID:    ${response.nftMetadataCID}`);
    console.log(`   Alignment CID:   ${response.alignmentCID}`);
    console.log(`   Translation CID: ${response.translationCID}`);

    // Verify alignment
    if (response.alignment?.lines?.length > 0) {
      const totalChars = response.alignment.lines.reduce((n: number, l: any) => n + (l.characters?.length || 0), 0);
      console.log(`\n   Alignment:       ${response.alignment.lines.length} lines, ${totalChars} characters, loss=${response.alignment.loss}`);
    } else {
      console.log("\n   Alignment:       (no lines returned)");
    }

    // Verify translation
    if (response.translation?.text) {
      console.log(`   Translation:     ${response.translation.languageCode} (${response.translation.model})`);
      console.log(`   Translated text: ${response.translation.text.slice(0, 120)}...`);
    }

    // Verify all CIDs are valid
    const cidEntries = [
      ["audioCID", response.audioCID],
      ["coverCID", response.coverCID],
      ["instrumentalCID", response.instrumentalCID],
      ["vocalsCID", response.vocalsCID],
      ["songMetadataCID", response.songMetadataCID],
      ["ipaMetadataCID", response.ipaMetadataCID],
      ["nftMetadataCID", response.nftMetadataCID],
      ["alignmentCID", response.alignmentCID],
      ["translationCID", response.translationCID],
    ];
    if (response.canvasCID) cidEntries.push(["canvasCID", response.canvasCID]);

    for (const [name, cid] of cidEntries) {
      if (!cid || (!cid.startsWith("Qm") && !cid.startsWith("bafy"))) {
        throw new Error(`Invalid ${name}: ${cid}`);
      }
    }
    console.log(`\n   All ${cidEntries.length} CIDs valid`);

    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`User mismatch: expected ${userAddress}, got ${response.user}`);
    }
    console.log("   User address matches");
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
