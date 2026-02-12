#!/usr/bin/env bun
/**
 * Test Album Art Load Test v1 Lit Action
 *
 * Supports:
 * - local code execution (default, no deploy required)
 * - CID execution (set ALBUM_ART_LOAD_TEST_CID or store in cids map)
 *
 * Required env:
 * - PRIVATE_KEY
 *
 * Optional env:
 * - LOAD_S3_AGENT_API_KEY (or LOAD_ACC_API_KEY) fallback if encrypted key file is not present
 * - LOAD_UPLOAD_MODE=private|public (default: private)
 * - LOAD_BUCKET_NAME (required when mode=private)
 * - LOAD_FOLDER_NAME
 * - LOAD_DATAITEM_NAME
 * - ALBUM_ART_LOAD_TEST_CID
 * - LOAD_S3_AGENT_URL (default: https://load-s3-agent.load.network)
 * - LOAD_GATEWAY_URL (default: https://gateway.s3-node-1.load.network)
 */

import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function main() {
  console.log("Test Album Art Load Test v1");
  console.log("=".repeat(60));
  console.log(`   Env:            ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:            ${pkpCreds.ethAddress}`);

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:       ${authEoa.address}`);

  const encryptedKeyPath = join(
    Env.paths.keys,
    "albumArtLoadTestV1",
    "load_acc_api_key_albumArtLoadTestV1.json",
  );
  const encryptedLoadKey = existsSync(encryptedKeyPath)
    ? JSON.parse(readFileSync(encryptedKeyPath, "utf-8"))
    : null;
  const plaintextLoadKey = process.env.LOAD_S3_AGENT_API_KEY || process.env.LOAD_ACC_API_KEY || "";
  if (!encryptedLoadKey && !plaintextLoadKey) {
    throw new Error(
      "Provide encrypted key via setup.ts or set LOAD_S3_AGENT_API_KEY / LOAD_ACC_API_KEY",
    );
  }

  const mode = (process.env.LOAD_UPLOAD_MODE || "private").toLowerCase();
  if (mode !== "private" && mode !== "public") {
    throw new Error(`Invalid LOAD_UPLOAD_MODE: ${mode}`);
  }
  const bucketName = process.env.LOAD_BUCKET_NAME || "";
  if (mode === "private" && !bucketName) {
    throw new Error("LOAD_BUCKET_NAME is required when LOAD_UPLOAD_MODE=private");
  }

  const folderName = process.env.LOAD_FOLDER_NAME || "heaven-test";
  const dataitemName =
    process.env.LOAD_DATAITEM_NAME || `album-art-${Date.now()}.png`;

  const localActionPath = join(__dirname, "album-art-load-test-v1.js");
  if (!existsSync(localActionPath)) {
    throw new Error(`Action code not found: ${localActionPath}`);
  }
  const actionCode = readFileSync(localActionPath, "utf-8");

  const cidFromMap = Env.cids["albumArtLoadTestV1"];
  const actionCid = process.env.ALBUM_ART_LOAD_TEST_CID || cidFromMap || "";
  const executionMode = actionCid ? "cid" : "local-code";

  console.log(`   Execute mode:   ${executionMode}`);
  if (actionCid) console.log(`   Action CID:      ${actionCid}`);
  console.log(`   Upload mode:    ${mode}`);
  if (mode === "private") {
    console.log(`   Bucket:         ${bucketName}`);
    console.log(`   Folder:         ${folderName}`);
  }

  const fixturePath = join(__dirname, "../../fixtures/anime-photo-small.png");
  const coverBytes = new Uint8Array(readFileSync(fixturePath));
  const coverImage = {
    base64: toBase64(coverBytes),
    contentType: "image/png",
  };
  console.log(`   Cover bytes:    ${coverBytes.length}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "album-art-load-test",
      networkName: Env.name,
      storagePath: "./output/lit-auth",
    }),
  });

  const authData = await ViemAccountAuthenticator.authenticate(authEoa);
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

  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();

  const jsParams: Record<string, unknown> = {
    userPkpPublicKey: pkpCreds.publicKey,
    coverImage,
    mode,
    timestamp,
    nonce,
    agentUrl: process.env.LOAD_S3_AGENT_URL || "https://load-s3-agent.load.network",
    gatewayUrl: process.env.LOAD_GATEWAY_URL || "https://gateway.s3-node-1.load.network",
  };

  if (encryptedLoadKey) {
    jsParams.loadAccEncryptedKey = encryptedLoadKey;
    console.log("   load_acc key:   encrypted");
  } else {
    jsParams.loadAccPlaintextKey = plaintextLoadKey;
    console.log("   load_acc key:   plaintext env");
  }

  if (mode === "private") {
    jsParams.bucketName = bucketName;
    jsParams.folderName = folderName;
    jsParams.dataitemName = dataitemName;
    jsParams.signed = "false";
  }

  console.log("\nExecuting Lit Action...");
  const t0 = performance.now();
  try {
    const result = actionCid
      ? await litClient.executeJs({
          ipfsId: actionCid,
          authContext,
          jsParams,
        })
      : await litClient.executeJs({
          code: actionCode,
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
      throw new Error(response?.error || "Action failed");
    }

    console.log("\nSummary");
    console.log(`   uploadId:       ${response.uploadId || "(none returned)"}`);
    console.log(`   gatewayUrl:     ${response.gatewayUrl || "(none returned)"}`);
    console.log(`   contentType:    ${response.contentType}`);
    console.log(`   byteLength:     ${response.byteLength}`);
    console.log("\nTest passed");
  } finally {
    await litClient.disconnect();
  }
}

main().catch((err) => {
  console.error("\nTest failed:", err?.message || String(err));
  process.exit(1);
});
