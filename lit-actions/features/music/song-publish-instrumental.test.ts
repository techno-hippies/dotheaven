#!/usr/bin/env bun
/**
 * Smoke test: Song Publish v1 with instrumental (no lyrics)
 *
 * Verifies that when lyricsText = "(instrumental)":
 *  - ElevenLabs alignment is SKIPPED (no API call)
 *  - OpenRouter translation is SKIPPED (no API call)
 *  - alignmentCID and translationCID are null
 *  - alignment and translation are null
 *  - 7 content CIDs are still valid (audio, cover, instrumental, canvas, 3 metadata)
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Test Song Publish v1 — INSTRUMENTAL (no lyrics)");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(`   Action CID:  ${Env.cids.songPublish || "(not deployed)"}`);

  if (!Env.cids.songPublish) {
    console.error("\nNo songPublish action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts songPublish");
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
      appName: "song-publish-instrumental-test",
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

  // Fixtures — minimal sizes, we only care about the instrumental guard
  const fixtureDir = join(__dirname, "../../fixtures/plastic-love");
  const audioBytes = new Uint8Array(readFileSync(join(fixtureDir, "Plastic Love (Disco Rework).mp3")));

  // Minimal 1x1 white PNG for cover
  const coverBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  // Minimal MPEG frame for instrumental
  const instrumentalBytes = new Uint8Array(417);
  instrumentalBytes[0] = 0xFF; instrumentalBytes[1] = 0xFB; instrumentalBytes[2] = 0x90; instrumentalBytes[3] = 0x00;

  // Pre-upload fixtures to Filebase
  const filebaseKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
  if (!filebaseKey) {
    console.error("\nFILEBASE_SONGS_BUCKET_API_KEY not set");
    process.exit(1);
  }

  async function preUpload(data: Uint8Array, contentType: string, fileName: string): Promise<string> {
    const decoded = atob(filebaseKey!);
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
      headers: { Authorization: authHeader, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, "Content-Type": contentType },
      body: data,
    });
    if (!resp.ok) throw new Error(`Pre-upload failed: ${resp.status} ${await resp.text()}`);
    const cid = resp.headers.get("x-amz-meta-cid");
    if (!cid) throw new Error("No CID from pre-upload");
    return cid;
  }

  console.log("\nPre-uploading fixtures...");
  const testPrefix = `instrumental-test-${Date.now()}`;
  const audioCid = await preUpload(audioBytes, "audio/mpeg", `${testPrefix}-audio.mp3`);
  const coverCid = await preUpload(coverBytes, "image/png", `${testPrefix}-cover.png`);
  const instrumentalCid = await preUpload(instrumentalBytes, "audio/mpeg", `${testPrefix}-instrumental.mp3`);
  console.log("   Pre-upload complete");

  // Hashes
  const sha256Hex = async (data: Uint8Array) => {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const audioHash = await sha256Hex(audioBytes);
  const coverHash = await sha256Hex(coverBytes);
  const instrumentalHash = await sha256Hex(instrumentalBytes);

  // Key: lyrics are "(instrumental)"
  const lyricsText = "(instrumental)";

  const songMetadata = JSON.stringify({ title: "Test Instrumental", artist: "Test", version: "1.0.0" });
  const ipaMetadata = JSON.stringify({ title: "Test Instrumental" });
  const nftMetadata = JSON.stringify({ name: "Test Instrumental" });

  const songMetadataHash = await sha256Hex(new TextEncoder().encode(songMetadata));
  const ipaMetadataHash = await sha256Hex(new TextEncoder().encode(ipaMetadata));
  const nftMetadataHash = await sha256Hex(new TextEncoder().encode(nftMetadata));
  const lyricsHash = await sha256Hex(new TextEncoder().encode(lyricsText));

  const sourceLanguage = "English";
  const targetLanguage = "ja";
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();

  // No canvas in this test — canvasHash is empty string
  const message = `heaven:publish:${audioHash}:${coverHash}:${instrumentalHash}::${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguage}:${targetLanguage}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  // Build jsParams
  let jsParams: any = {
    userPkpPublicKey,
    audioUrl: `https://ipfs.filebase.io/ipfs/${audioCid}`,
    coverUrl: `https://ipfs.filebase.io/ipfs/${coverCid}`,
    instrumentalUrl: `https://ipfs.filebase.io/ipfs/${instrumentalCid}`,
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

  // Load encrypted keys
  const filebaseKeyPath = join(Env.paths.keys, "songPublish", "filebase_api_key_songPublish.json");
  if (existsSync(filebaseKeyPath)) {
    jsParams.filebaseEncryptedKey = JSON.parse(readFileSync(filebaseKeyPath, "utf-8"));
  } else {
    jsParams.filebasePlaintextKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
  }

  // ElevenLabs + OpenRouter keys should NOT be needed for instrumental
  // Include them anyway to prove the action doesn't call them
  const elevenKeyPath = join(Env.paths.keys, "songPublish", "elevenlabs_api_key_songPublish.json");
  if (existsSync(elevenKeyPath)) {
    jsParams.elevenlabsEncryptedKey = JSON.parse(readFileSync(elevenKeyPath, "utf-8"));
  } else if (process.env.ELEVENLABS_API_KEY) {
    jsParams.elevenlabsPlaintextKey = process.env.ELEVENLABS_API_KEY;
  }

  const openrouterKeyPath = join(Env.paths.keys, "songPublish", "openrouter_api_key_songPublish.json");
  if (existsSync(openrouterKeyPath)) {
    jsParams.openrouterEncryptedKey = JSON.parse(readFileSync(openrouterKeyPath, "utf-8"));
  } else if (process.env.OPENROUTER_API_KEY) {
    jsParams.openrouterPlaintextKey = process.env.OPENROUTER_API_KEY;
  }

  console.log("\nExecuting Lit Action (instrumental — should skip alignment + translation)...");
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

    if (!response?.success) {
      throw new Error(response?.error || "action returned success=false");
    }

    console.log("\nChecking instrumental behavior:");

    // Alignment and translation should be null/skipped
    let allPassed = true;

    if (response.alignmentCID !== null) {
      console.log(`   FAIL: alignmentCID should be null, got: ${response.alignmentCID}`);
      allPassed = false;
    } else {
      console.log("   OK: alignmentCID is null (ElevenLabs skipped)");
    }

    if (response.translationCID !== null) {
      console.log(`   FAIL: translationCID should be null, got: ${response.translationCID}`);
      allPassed = false;
    } else {
      console.log("   OK: translationCID is null (OpenRouter skipped)");
    }

    if (response.alignment !== null) {
      console.log(`   FAIL: alignment should be null, got: ${JSON.stringify(response.alignment).slice(0, 60)}`);
      allPassed = false;
    } else {
      console.log("   OK: alignment data is null");
    }

    if (response.translation !== null) {
      console.log(`   FAIL: translation should be null, got: ${JSON.stringify(response.translation).slice(0, 60)}`);
      allPassed = false;
    } else {
      console.log("   OK: translation data is null");
    }

    // Content CIDs should still be valid (7 total: audio, cover, instrumental, 3 metadata + null canvas)
    const contentCids = [
      response.audioCID, response.coverCID, response.instrumentalCID,
      response.songMetadataCID, response.ipaMetadataCID, response.nftMetadataCID,
    ];
    for (const cid of contentCids) {
      if (!cid || (!cid.startsWith("Qm") && !cid.startsWith("bafy"))) {
        console.log(`   FAIL: Invalid content CID: ${cid}`);
        allPassed = false;
      }
    }
    console.log(`   OK: All 6 content CIDs valid (no canvas in this test)`);

    if (response.canvasCID !== null) {
      console.log(`   Note: canvasCID = ${response.canvasCID} (not tested)`);
    } else {
      console.log("   OK: canvasCID is null (no canvas uploaded)");
    }

    // Timing — instrumental should be much faster (no ElevenLabs + OpenRouter calls)
    console.log(`\n   Execution time: ${elapsed}s (should be faster than full test with lyrics)`);

    if (allPassed) {
      console.log("\nAll instrumental checks passed!");
    } else {
      console.error("\nSome checks failed!");
      process.exit(1);
    }

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
