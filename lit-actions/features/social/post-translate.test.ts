#!/usr/bin/env bun
/**
 * Test Post Translate v1 Lit Action
 *
 * Verifies:
 *  - EIP-191 signature verification
 *  - LLM translation via OpenRouter
 *  - EngagementV2.translateFor() broadcast on MegaETH
 *  - Returns translatedText + txHash
 *
 * Usage:
 *   bun tests/post-translate.test.ts                # Full test (broadcast)
 *   bun tests/post-translate.test.ts --dry-run      # Translate only, no broadcast
 *
 * Prerequisites:
 *   - Deploy action: bun scripts/setup.ts postTranslateV1
 *   - PRIVATE_KEY or PKP_PRIVATE_KEY env var
 *   - OPENROUTER_API_KEY env var (or encrypted key from setup)
 *   - A valid postId (bytes32) — uses a dummy one for testing
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

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main() {
  console.log("Test Post Translate v1");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);
  console.log(`   Dry run:     ${dryRun}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);
  console.log(
    `   Action CID:  ${Env.cids.postTranslateV1 || "(not deployed)"}`
  );

  if (!Env.cids.postTranslateV1) {
    console.error(
      "\nNo postTranslateV1 action CID found. Run setup.ts first:"
    );
    console.error("   bun scripts/setup.ts postTranslateV1");
    process.exit(1);
  }

  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  console.log(`   Auth EOA:    ${authEoa.address}`);

  // For this test, use the EOA directly for signing (no in-action PKP signing)
  const wallet = new ethers.Wallet(pk);
  const userAddress = wallet.address;
  const userPkpPublicKey = ethers.SigningKey.computePublicKey(pk, false);
  console.log(`   User (EOA):  ${userAddress}`);

  console.log("\nConnecting to Lit Protocol...");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "post-translate-test",
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

  // ── Test data ──────────────────────────────────────────────────────
  // Use a dummy postId (bytes32). In production, this would come from PostsV1.
  // We use the deployer address padded to bytes32 as a test postId.
  const postId =
    "0x0000000000000000000000009456aec64179fe39a1d0a681de7613d5955e75d3";
  const originalText =
    "今日は素晴らしいアルバムを見つけました。プロダクションの質が凄い、すべてのトラックが完璧に繋がっている。ヘッドフォンで全曲聴くことを強くお勧めします。";
  const sourceLang = "Japanese";
  const targetLang = "en";
  const targetLangName = "English";

  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000).toString();

  // Build signature
  const textHash = await sha256Hex(originalText);
  const message = `heaven:translate-post:${postId}:${textHash}:${targetLang}:${timestamp}:${nonce}`;
  const signature = await wallet.signMessage(message);

  console.log(`\n   Post ID:       ${postId.slice(0, 20)}...`);
  console.log(
    `   Original:      ${originalText.slice(0, 50)}...`
  );
  console.log(`   Source:        ${sourceLang}`);
  console.log(`   Target:        ${targetLang} (${targetLangName})`);
  console.log(`   Timestamp:     ${timestamp}`);
  console.log(`   Nonce:         ${nonce}`);

  // Build jsParams
  let jsParams: any = {
    userPkpPublicKey,
    postId,
    originalText,
    sourceLang,
    targetLang,
    targetLangName,
    signature,
    timestamp,
    nonce,
    dryRun,
  };

  // OpenRouter key
  const openrouterKeyPath = join(
    Env.paths.keys,
    "postTranslateV1",
    "openrouter_api_key_postTranslateV1.json"
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
        "\nNo OpenRouter key. Set OPENROUTER_API_KEY or run setup.ts postTranslateV1"
      );
      process.exit(1);
    }
  }

  console.log("\nExecuting Lit Action...");
  const t0 = performance.now();

  try {
    const result = await litClient.executeJs({
      ipfsId: Env.cids.postTranslateV1,
      authContext,
      jsParams,
    });

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`Lit Action executed in ${elapsed}s`);

    // Show logs from Lit Action (if any)
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

    console.log("\nSUCCESS!");
    console.log(`   Version:        ${response.version}`);
    console.log(`   User:           ${response.user}`);
    console.log(`   Post ID:        ${response.postId}`);
    console.log(`   Lang:           ${response.langCode}`);
    console.log(
      `   Translation:    ${response.translatedText.slice(0, 80)}...`
    );

    // Verify user address matches
    if (response.user.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(
        `User mismatch: expected ${userAddress}, got ${response.user}`
      );
    }
    console.log("   User address:   matches");

    // Verify translation is non-empty
    if (!response.translatedText || response.translatedText.length < 10) {
      throw new Error(
        `Translation too short: "${response.translatedText}"`
      );
    }
    console.log("   Translation:    non-empty, valid");

    // Verify lang code
    if (response.langCode !== targetLang) {
      throw new Error(
        `Lang code mismatch: expected ${targetLang}, got ${response.langCode}`
      );
    }
    console.log("   Lang code:      matches");

    if (dryRun) {
      console.log("   Dry run:        true (no broadcast)");
    } else {
      if (response.txHash) {
        console.log(`   TX Hash:        ${response.txHash}`);
        console.log(
          `   Explorer:       https://megaeth-testnet-v2.blockscout.com/tx/${response.txHash}`
        );
      } else {
        throw new Error("Missing txHash in response");
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
