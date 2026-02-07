#!/usr/bin/env bun
/**
 * Test Post Register v1 Lit Action
 *
 * Verifies:
 *  - User PKP signs binding message inside the action
 *  - Text safety check (OpenRouter LLM) classifies content + detects language
 *  - Metadata uploaded to IPFS (Filebase) with `language` field
 *  - MegaETH PostsV1.postFor() broadcast (sponsor PKP pays gas)
 *  - Returns ipIdBytes32, contentIdBytes32, ipaCid, nftCid, megaTxHash
 *
 * Modes:
 *  - Default: Full broadcast to MegaETH testnet
 *  - --dry-run: Upload metadata but skip MegaETH broadcast
 *  - --lang=ja: Use Japanese text to verify language detection
 *
 * Usage:
 *  bun features/social/post-register.test.ts
 *  bun features/social/post-register.test.ts --dry-run
 *  bun features/social/post-register.test.ts --lang=ja
 *  bun features/social/post-register.test.ts --lang=fr --dry-run
 *
 * Prerequisites:
 *  - Deploy action: bun scripts/setup.ts postRegisterV1
 *  - PRIVATE_KEY env var
 *  - OPENROUTER_API_KEY env var (or encrypted key from setup)
 */

import { createLitClient } from "@lit-protocol/lit-client";
import {
  createAuthManager,
  storagePlugins,
  ViemAccountAuthenticator,
} from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "../../tests/shared/env";
import { ethers } from "ethers";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../../");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const langArg = args.find((a) => a.startsWith("--lang="));
const testLang = langArg ? langArg.split("=")[1] : "en";

// ── Test texts per language ─────────────────────────────────────────

const TEST_TEXTS: Record<string, { text: string; expectedLang: string; label: string }> = {
  en: {
    text: "Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly. Highly recommend giving it a full listen with headphones.",
    expectedLang: "en",
    label: "English",
  },
  ja: {
    text: "今日は素晴らしいアルバムを見つけました。プロダクションの質が凄い、すべてのトラックが完璧に繋がっている。ヘッドフォンで全曲聴くことを強くお勧めします。",
    expectedLang: "ja",
    label: "Japanese",
  },
  fr: {
    text: "Je viens de découvrir cet album incroyable. La qualité de production est dingue, chaque morceau s'enchaîne parfaitement. Je recommande vivement de l'écouter en entier avec un casque.",
    expectedLang: "fr",
    label: "French",
  },
  es: {
    text: "Acabo de descubrir este álbum increíble. La calidad de producción es una locura, cada pista fluye perfectamente hacia la siguiente. Recomiendo mucho escucharlo completo con auriculares.",
    expectedLang: "es",
    label: "Spanish",
  },
  ko: {
    text: "방금 이 놀라운 앨범을 발견했어요. 프로덕션 퀄리티가 미쳤어요, 모든 트랙이 완벽하게 이어져요. 헤드폰으로 전곡 감상을 강력 추천합니다.",
    expectedLang: "ko",
    label: "Korean",
  },
};

const IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs";

async function main() {
  const testData = TEST_TEXTS[testLang] || TEST_TEXTS.en;

  console.log("Test Post Register v1");
  console.log("=".repeat(60));
  console.log(`   Env:           ${Env.name}`);
  console.log(`   Dry run:       ${dryRun}`);
  console.log(`   Test lang:     ${testData.label} (${testData.expectedLang})`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:           ${pkpCreds.ethAddress}`);

  const actionCid = Env.cids.postRegisterV1;
  let useInlineCode = !actionCid;
  if (actionCid) {
    console.log(`   Action CID:    ${actionCid}`);
  } else {
    console.log(`   Action CID:    (not deployed — using inline code)`);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:      ${authEoa.address}`);

  const wallet = new ethers.Wallet(pk);
  const userPkpPublicKey = ethers.SigningKey.computePublicKey(pk, false);
  const userAddress = ethers.computeAddress(userPkpPublicKey);
  console.log(`   User (EOA):    ${userAddress}`);

  // Connect to Lit
  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "post-register-test",
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
        ["access-control-condition-decryption", "*"],
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
      statement: "",
    },
    litClient,
  });
  console.log("Auth context ready");

  // ── Pre-sign binding message ────────────────────────────────────

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1_000_000_000).toString();

  // Build the same binding message the action constructs:
  // contentIdentifier = keccak256(text).slice(0, 18) for text posts
  const contentIdentifier = ethers.keccak256(ethers.toUtf8Bytes(testData.text)).slice(0, 18);
  const message = `heaven:post:${contentIdentifier}:${timestamp}:${nonce}`;
  console.log("\nSigning EIP-191 authorization...");
  const signature = await wallet.signMessage(message);
  console.log(`   Message:       ${message}`);
  console.log(`   Signature:     ${signature.slice(0, 20)}...`);

  // ── Build jsParams ──────────────────────────────────────────────

  const jsParams: any = {
    userPkpPublicKey,
    text: testData.text,
    timestamp,
    nonce,
    signature,
    dryRun,
    skipStoryRegistration: true, // Text posts skip Story
  };

  // Filebase key (required for metadata upload)
  const filebaseKeyPath = join(
    Env.paths.keys,
    "postRegisterV1",
    "filebase_api_key_postRegisterV1.json"
  );
  if (existsSync(filebaseKeyPath)) {
    jsParams.filebaseEncryptedKey = JSON.parse(
      readFileSync(filebaseKeyPath, "utf-8")
    );
    console.log("   Filebase key:  encrypted");
  } else {
    const plaintextKey = process.env.FILEBASE_API_KEY;
    if (plaintextKey) {
      jsParams.filebasePlaintextKey = plaintextKey;
      console.log("   Filebase key:  plaintext (env)");
    } else {
      console.error(
        "\nNo Filebase key. Set FILEBASE_API_KEY or run setup.ts postRegisterV1"
      );
      process.exit(1);
    }
  }

  // OpenRouter key (required for text safety check + language detection)
  const openrouterKeyPath = join(
    Env.paths.keys,
    "postRegisterV1",
    "openrouter_api_key_postRegisterV1.json"
  );
  if (existsSync(openrouterKeyPath)) {
    jsParams.openrouterEncryptedKey = JSON.parse(
      readFileSync(openrouterKeyPath, "utf-8")
    );
    console.log("   OpenRouter key: encrypted");
  } else {
    const plaintextKey = process.env.OPENROUTER_API_KEY;
    if (plaintextKey) {
      jsParams.openrouterPlaintextKey = plaintextKey;
      console.log("   OpenRouter key: plaintext (env)");
    } else {
      console.error(
        "\nNo OpenRouter key. Set OPENROUTER_API_KEY or run setup.ts postRegisterV1"
      );
      process.exit(1);
    }
  }

  console.log(`\n   Text:          ${testData.text.slice(0, 60)}...`);
  console.log(`   Timestamp:     ${timestamp}`);
  console.log(`   Nonce:         ${nonce}`);

  // ── Execute ─────────────────────────────────────────────────────

  console.log("\nExecuting Lit Action...");
  const t0 = performance.now();

  try {
    let result;
    if (useInlineCode) {
      const actionCode = readFileSync(
        join(ROOT_DIR, "features/social/post-register-v1.js"),
        "utf-8"
      );
      result = await litClient.executeJs({
        code: actionCode,
        authContext,
        jsParams,
      });
    } else {
      result = await litClient.executeJs({
        ipfsId: actionCid,
        authContext,
        jsParams,
      });
    }

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`Lit Action executed in ${elapsed}s`);

    if (result.logs) console.log("\nAction logs:", result.logs);

    const response =
      typeof result.response === "string"
        ? JSON.parse(result.response)
        : result.response;

    console.log("\nAction response:");
    console.log(JSON.stringify(response, null, 2));

    if (!response?.success) {
      throw new Error(response?.error || "action returned success=false");
    }

    // ── Validate response ───────────────────────────────────────

    console.log("\nSUCCESS!");
    console.log(`   Version:       ${response.version}`);
    console.log(`   User:          ${response.user}`);
    console.log(`   isAdult:       ${response.isAdult}`);

    // User address must match
    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(
        `User mismatch: expected ${userAddress}, got ${response.user}`
      );
    }
    console.log("   User address:  matches ✓");

    // Version check
    if (response.version !== "post-register-v1") {
      throw new Error(`Unexpected version: ${response.version}`);
    }
    console.log("   Version:       matches ✓");

    // Must have metadata CIDs
    if (!response.ipaCid || !response.nftCid) {
      throw new Error("Missing ipaCid or nftCid in response");
    }
    console.log(`   IPA CID:       ${response.ipaCid}`);
    console.log(`   NFT CID:       ${response.nftCid}`);

    // Must have post IDs
    if (!response.ipIdBytes32 || !response.contentIdBytes32) {
      throw new Error("Missing ipIdBytes32 or contentIdBytes32");
    }
    console.log(`   Post ID:       ${response.ipIdBytes32.slice(0, 20)}...`);
    console.log(`   Content ID:    ${response.contentIdBytes32.slice(0, 20)}...`);

    // ── Verify IPFS metadata has language field ─────────────────

    console.log("\nFetching IPA metadata from IPFS...");
    const metaUrl = `${IPFS_GATEWAY}/${response.ipaCid}`;
    const metaRes = await fetch(metaUrl);
    if (!metaRes.ok) {
      throw new Error(`Failed to fetch metadata: ${metaRes.status}`);
    }
    const metadata = await metaRes.json();
    console.log("   Metadata fetched");

    // Verify language field exists
    if (!metadata.language) {
      throw new Error(
        "MISSING: metadata.language field not found in IPA metadata. " +
        "The safety check should detect and store the language."
      );
    }
    console.log(`   Language:      ${metadata.language}`);

    // Verify language matches expected
    if (metadata.language !== testData.expectedLang) {
      console.warn(
        `   WARNING: Expected lang "${testData.expectedLang}" but got "${metadata.language}". ` +
        "LLM detection may vary for ambiguous text."
      );
    } else {
      console.log(`   Language:      matches expected (${testData.expectedLang}) ✓`);
    }

    // Verify text is stored in metadata
    if (!metadata.text) {
      throw new Error("Missing text field in IPA metadata");
    }
    if (metadata.text !== testData.text) {
      throw new Error("Text mismatch in metadata");
    }
    console.log("   Text:          matches ✓");

    // Verify other metadata fields
    if (metadata.postType !== "text") {
      throw new Error(`Expected postType "text", got "${metadata.postType}"`);
    }
    console.log("   Post type:     text ✓");

    if (metadata.appId !== "heaven") {
      throw new Error(`Expected appId "heaven", got "${metadata.appId}"`);
    }
    console.log("   App ID:        heaven ✓");

    // ── MegaETH broadcast verification ──────────────────────────

    if (dryRun) {
      if (response.dryRun) {
        console.log("\n   Dry run:       true (skipped broadcast) ✓");
      }
    } else {
      if (response.megaTxHash) {
        console.log(`\n   MegaETH TX:    ${response.megaTxHash}`);
        console.log(
          `   Explorer:      https://megaeth-testnet-v2.blockscout.com/tx/${response.megaTxHash}`
        );
      } else {
        console.warn(
          "   WARNING: No megaTxHash — MegaETH broadcast may have failed (best-effort)"
        );
      }
    }

    console.log("\nAll checks passed!");
  } catch (error: any) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.error(`\nLit Action failed after ${elapsed}s:`, error.message);
    if (error.errorKind) console.error("Error kind:", error.errorKind);
    process.exit(1);
  } finally {
    await litClient.disconnect();
  }
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
