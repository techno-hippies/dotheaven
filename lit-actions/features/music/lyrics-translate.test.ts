#!/usr/bin/env bun
/**
 * Test Lyrics Translate v1 Lit Action
 *
 * Verifies batch translation of lyrics into multiple languages,
 * with each translation uploaded to IPFS.
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

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main() {
  console.log("Test Lyrics Translate v1 (batch translation)");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(`   Action CID:  ${Env.cids.lyricsTranslate || "(not deployed)"}`);

  if (!Env.cids.lyricsTranslate) {
    console.error("\nNo lyricsTranslate action CID found. Run setup.ts first:");
    console.error("   bun scripts/setup.ts lyricsTranslate");
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
      appName: "lyrics-translate-test",
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

  // Load lyrics fixture
  const fixtureDir = join(__dirname, "../../fixtures/plastic-love");
  const lyricsText = readFileSync(join(fixtureDir, "lyrics.txt"), "utf-8").trim();

  const sourceLanguage = "Japanese";
  const targetLanguages = ["zh", "es", "ko"];

  console.log(`\n   Lyrics:        ${lyricsText.split("\n").length} lines`);
  console.log(`   Source:        ${sourceLanguage}`);
  console.log(`   Targets:       ${targetLanguages.join(", ")}`);

  // Build signature
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();
  const lyricsHash = await sha256Hex(new TextEncoder().encode(lyricsText));
  const langsStr = [...targetLanguages].sort().join(",");
  const message = `heaven:translate:${lyricsHash}:${sourceLanguage}:${langsStr}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  // Build jsParams
  let jsParams: any = {
    userPkpPublicKey,
    lyricsText,
    sourceLanguage,
    targetLanguages,
    signature,
    timestamp,
    nonce,
  };

  // Filebase key
  const filebaseKeyPath = join(Env.paths.keys, "lyricsTranslate", "filebase_api_key_lyricsTranslate.json");
  if (existsSync(filebaseKeyPath)) {
    jsParams.filebaseEncryptedKey = JSON.parse(readFileSync(filebaseKeyPath, "utf-8"));
    console.log("\n   Filebase key:  encrypted");
  } else {
    const plaintextKey = process.env.FILEBASE_SONGS_BUCKET_API_KEY;
    if (plaintextKey) {
      jsParams.filebasePlaintextKey = plaintextKey;
      console.log("\n   Filebase key:  plaintext (env)");
    } else {
      console.error("\nNo Filebase key found. Run: bun scripts/setup.ts lyricsTranslate");
      process.exit(1);
    }
  }

  // OpenRouter key
  const openrouterKeyPath = join(Env.paths.keys, "lyricsTranslate", "openrouter_api_key_lyricsTranslate.json");
  if (existsSync(openrouterKeyPath)) {
    jsParams.openrouterEncryptedKey = JSON.parse(readFileSync(openrouterKeyPath, "utf-8"));
    console.log("   OpenRouter key: encrypted");
  } else {
    const plaintextKey = process.env.OPENROUTER_API_KEY;
    if (plaintextKey) {
      jsParams.openrouterPlaintextKey = plaintextKey;
      console.log("   OpenRouter key: plaintext (env)");
    } else {
      console.error("\nNo OpenRouter key. Set OPENROUTER_API_KEY or run setup.ts lyricsTranslate");
      process.exit(1);
    }
  }

  console.log("\nExecuting Lit Action...");
  const t0 = performance.now();

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.lyricsTranslate,
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
      console.error("\nAction returned error:", response?.error);
      process.exit(1);
    }

    // Validate translations
    const translations = response.translations || {};
    const errors = response.errors || {};

    console.log("\n--- Translation Summary ---");
    for (const lang of targetLanguages) {
      if (translations[lang]) {
        const preview = translations[lang].text.split("\n").slice(0, 3).join(" | ");
        console.log(`   ${lang}: ${translations[lang].cid}`);
        console.log(`         ${preview.slice(0, 80)}...`);
      } else {
        console.log(`   ${lang}: FAILED - ${errors[lang] || "unknown error"}`);
      }
    }

    const successCount = Object.keys(translations).length;
    const errorCount = Object.keys(errors).length;
    console.log(`\n   ${successCount}/${targetLanguages.length} translations succeeded`);
    if (errorCount > 0) {
      console.log(`   ${errorCount} errors`);
    }

    console.log("\nTest passed");
  } catch (err: any) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.error(`\nLit Action failed after ${elapsed}s:`, err.message);
    if (err.errorKind) console.error("Error kind:", err.errorKind);
    process.exit(1);
  } finally {
    await litClient.disconnect();
  }
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
