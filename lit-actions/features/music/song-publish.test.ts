#!/usr/bin/env bun
/**
 * Test Song Publish v1 Lit Action
 *
 * Verifies the combined action:
 *  - Upload 6 files to Filebase IPFS
 *  - Lyrics alignment via ElevenLabs
 *  - Lyrics translation via OpenRouter
 *  - Upload alignment + translation to IPFS
 *  - Returns all 8 CIDs + alignment + translation data
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
  console.log("Test Song Publish v1 (combined action)");
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
  console.log(`   Auth EOA:    ${authEoa.address}`);

  const wallet = new ethers.Wallet(pk);
  const userAddress = wallet.address;
  const userPkpPublicKey = ethers.SigningKey.computePublicKey(pk, false);
  console.log(`   User (EOA):  ${userAddress}`);

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

  // Load real fixture files
  const fixtureDir = join(__dirname, "../../fixtures/plastic-love");
  const audioBytes = new Uint8Array(readFileSync(join(fixtureDir, "Plastic Love (Disco Rework).mp3")));
  const lyricsText = readFileSync(join(fixtureDir, "lyrics.txt"), "utf-8").trim();

  // Minimal 1x1 white PNG for cover
  const coverBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  // Pre-upload fixtures to Filebase so Lit nodes can fetch via HTTPS
  // (jsParams has size limits; can't pass 6MB inline)
  const filebaseKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
  if (!filebaseKey) {
    console.error("\nFILEBASE_SONGS_BUCKET_API_KEY not set");
    process.exit(1);
  }

  console.log("\nPre-uploading fixtures to Filebase...");

  async function preUpload(data: Uint8Array, contentType: string, fileName: string): Promise<string> {
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

  const testPrefix = `test-${Date.now()}`;
  // Create a tiny valid MP3 frame for preview (too small for real audio but passes type check)
  // Minimal MPEG frame: sync word 0xFFE0, MPEG1 Layer3
  const previewBytes = new Uint8Array(417);
  previewBytes[0] = 0xFF; previewBytes[1] = 0xFB; previewBytes[2] = 0x90; previewBytes[3] = 0x00;

  // Reuse preview bytes as a stand-in for instrumental in tests
  const instrumentalBytes = new Uint8Array(417);
  instrumentalBytes[0] = 0xFF; instrumentalBytes[1] = 0xFB; instrumentalBytes[2] = 0x90; instrumentalBytes[3] = 0x00;

  const audioCid = await preUpload(audioBytes, "audio/mpeg", `${testPrefix}-audio.mp3`);
  console.log(`   Audio CID:     ${audioCid}`);
  const previewCid = await preUpload(previewBytes, "audio/mpeg", `${testPrefix}-preview.mp3`);
  console.log(`   Preview CID:   ${previewCid}`);
  const coverCid = await preUpload(coverBytes, "image/png", `${testPrefix}-cover.png`);
  console.log(`   Cover CID:     ${coverCid}`);
  const instrumentalCid = await preUpload(instrumentalBytes, "audio/mpeg", `${testPrefix}-instrumental.mp3`);
  console.log(`   Instrumental:  ${instrumentalCid}`);

  const audioUrl = `https://ipfs.filebase.io/ipfs/${audioCid}`;
  const previewUrl = `https://ipfs.filebase.io/ipfs/${previewCid}`;
  const coverUrl = `https://ipfs.filebase.io/ipfs/${coverCid}`;
  const instrumentalUrl = `https://ipfs.filebase.io/ipfs/${instrumentalCid}`;

  console.log("   Pre-upload complete");

  const sha256Hex = async (data: Uint8Array) => {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const audioHash = await sha256Hex(audioBytes);
  const previewHash = await sha256Hex(previewBytes);
  const coverHash = await sha256Hex(coverBytes);
  const instrumentalHash = await sha256Hex(instrumentalBytes);

  const songMetadata = JSON.stringify({
    audio: { hash: `0x${audioHash}`, mimeType: "audio/mpeg", uri: "ipfs://placeholder" },
    title: "Plastic Love (Disco Rework)",
    artist: "Mariya Takeuchi",
    version: "1.0.0",
  });
  const ipaMetadata = JSON.stringify({ title: "Plastic Love (Disco Rework)" });
  const nftMetadata = JSON.stringify({ name: "Plastic Love (Disco Rework)" });

  const songMetadataHash = await sha256Hex(new TextEncoder().encode(songMetadata));
  const ipaMetadataHash = await sha256Hex(new TextEncoder().encode(ipaMetadata));
  const nftMetadataHash = await sha256Hex(new TextEncoder().encode(nftMetadata));
  const lyricsHash = await sha256Hex(new TextEncoder().encode(lyricsText));

  const sourceLanguage = "Japanese";
  const targetLanguage = "en";

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();

  const message = `heaven:publish:${audioHash}:${previewHash}:${coverHash}:${instrumentalHash}:${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguage}:${targetLanguage}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  console.log(`\n   Audio size:    ${(audioBytes.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Audio hash:    ${audioHash.slice(0, 16)}...`);
  console.log(`   Cover hash:    ${coverHash.slice(0, 16)}...`);
  console.log(`   Instrumental:  ${instrumentalHash.slice(0, 16)}...`);
  console.log(`   Lyrics:        ${lyricsText.split("\n").length} lines`);
  console.log(`   Translation:   ${sourceLanguage} → ${targetLanguage}`);

  // Build jsParams with encrypted or plaintext keys
  let jsParams: any = {
    userPkpPublicKey,
    audioUrl,
    previewUrl,
    coverUrl,
    instrumentalUrl,
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

  // Filebase key
  const filebaseKeyPath = join(Env.paths.keys, "songPublish", "filebase_api_key_songPublish.json");
  if (existsSync(filebaseKeyPath)) {
    jsParams.filebaseEncryptedKey = JSON.parse(readFileSync(filebaseKeyPath, "utf-8"));
    console.log("\n   Filebase key:  encrypted");
  } else {
    const plaintextKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
    if (plaintextKey) {
      jsParams.filebasePlaintextKey = plaintextKey;
      console.log("\n   Filebase key:  plaintext (env)");
    } else {
      console.error("\nNo Filebase key found. Run: bun scripts/setup.ts songPublish");
      process.exit(1);
    }
  }

  // ElevenLabs key
  const elevenKeyPath = join(Env.paths.keys, "songPublish", "elevenlabs_api_key_songPublish.json");
  if (existsSync(elevenKeyPath)) {
    jsParams.elevenlabsEncryptedKey = JSON.parse(readFileSync(elevenKeyPath, "utf-8"));
    console.log("   ElevenLabs key: encrypted");
  } else {
    const plaintextKey = process.env.ELEVENLABS_API_KEY;
    if (plaintextKey) {
      jsParams.elevenlabsPlaintextKey = plaintextKey;
      console.log("   ElevenLabs key: plaintext (env)");
    } else {
      console.error("\nNo ElevenLabs key. Set ELEVENLABS_API_KEY or run setup.ts songPublish");
      process.exit(1);
    }
  }

  // OpenRouter key
  const openrouterKeyPath = join(Env.paths.keys, "songPublish", "openrouter_api_key_songPublish.json");
  if (existsSync(openrouterKeyPath)) {
    jsParams.openrouterEncryptedKey = JSON.parse(readFileSync(openrouterKeyPath, "utf-8"));
    console.log("   OpenRouter key: encrypted");
  } else {
    const plaintextKey = process.env.OPENROUTER_API_KEY;
    if (plaintextKey) {
      jsParams.openrouterPlaintextKey = plaintextKey;
      console.log("   OpenRouter key: plaintext (env)");
    } else {
      console.error("\nNo OpenRouter key. Set OPENROUTER_API_KEY or run setup.ts songPublish");
      process.exit(1);
    }
  }

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
    console.log(`   Preview CID:     ${response.previewCID}`);
    console.log(`   Cover CID:       ${response.coverCID}`);
    console.log(`   Instrumental:    ${response.instrumentalCID ?? "(none)"}`);
    console.log(`   Song Meta CID:   ${response.songMetadataCID}`);
    console.log(`   IPA Meta CID:    ${response.ipaMetadataCID}`);
    console.log(`   NFT Meta CID:    ${response.nftMetadataCID}`);
    console.log(`   Alignment CID:   ${response.alignmentCID}`);
    console.log(`   Translation CID: ${response.translationCID}`);

    // Verify alignment
    if (response.alignment?.lines?.length > 0) {
      const totalWords = response.alignment.lines.reduce((n: number, l: any) => n + (l.words?.length || 0), 0);
      console.log(`   Alignment:       ${response.alignment.lines.length} lines, ${totalWords} words, loss=${response.alignment.loss}`);
    } else {
      console.log("   Alignment:       (no lines returned)");
    }

    // Verify translation
    if (response.translation?.text) {
      console.log(`   Translation:     ${response.translation.languageCode} (${response.translation.model})`);
      console.log(`   Translated text: ${response.translation.text.slice(0, 80)}...`);
    }

    // Verify all 9 CIDs (instrumental included in this test)
    const cids = [
      response.audioCID, response.previewCID, response.coverCID,
      response.instrumentalCID,
      response.songMetadataCID, response.ipaMetadataCID, response.nftMetadataCID,
      response.alignmentCID, response.translationCID,
    ];
    for (const cid of cids) {
      if (!cid || (!cid.startsWith("Qm") && !cid.startsWith("bafy"))) {
        throw new Error(`Invalid CID: ${cid}`);
      }
    }
    console.log("\n   All 9 CIDs valid");

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
