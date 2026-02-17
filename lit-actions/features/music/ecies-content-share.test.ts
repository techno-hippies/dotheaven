#!/usr/bin/env bun
/**
 * ECIES P256 Content Encrypt/Decrypt/Share Test
 *
 * Proves the full content encryption flow with P256 keypairs:
 *  1. Alice encrypts a file (AES-256-GCM) and wraps the AES key via ECIES to her own P256 pubkey.
 *  2. Alice decrypts her own wrapped key and recovers the file.
 *  3. Alice shares with Bob by re-encrypting the AES key to Bob's P256 pubkey.
 *  4. Bob decrypts his key copy and recovers the file.
 *  5. Eve (unauthorized) cannot decrypt Bob's wrapped key.
 *
 * No Lit Protocol. No chain. No passkeys. Pure crypto primitives.
 *
 * Usage:
 *   bun features/music/ecies-content-share.test.ts
 */

import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";

// --- ECIES primitives (P256 + AES-256-GCM) ---

interface EciesEnvelope {
  ephemeralPub: Uint8Array; // uncompressed 65-byte P256 public key
  iv: Uint8Array; // 12-byte AES-GCM nonce
  ciphertext: Uint8Array; // AES-GCM ciphertext (includes 16-byte auth tag)
}

function deriveAesKey(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  const shared = p256.getSharedSecret(privateKey, publicKey, false); // uncompressed
  // KDF: SHA-256 of the raw shared point (skip the 0x04 prefix byte)
  return sha256(shared.slice(1));
}

async function eciesEncrypt(
  recipientPub: Uint8Array,
  plaintext: Uint8Array
): Promise<EciesEnvelope> {
  const ephPriv = p256.utils.randomPrivateKey();
  const ephPub = p256.getPublicKey(ephPriv, false);
  const aesKey = deriveAesKey(ephPriv, recipientPub);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", aesKey, "AES-GCM", false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    ephemeralPub: ephPub,
    iv,
    ciphertext: new Uint8Array(ct),
  };
}

async function eciesDecrypt(
  recipientPriv: Uint8Array,
  envelope: EciesEnvelope
): Promise<Uint8Array> {
  const aesKey = deriveAesKey(recipientPriv, envelope.ephemeralPub);
  const key = await crypto.subtle.importKey("raw", aesKey, "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: envelope.iv },
    key,
    envelope.ciphertext
  );
  return new Uint8Array(pt);
}

// --- AES-256-GCM file encryption (same approach as content-crypto.ts) ---

interface EncryptedFile {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  rawKey: Uint8Array; // 32-byte AES key (plaintext, caller wraps via ECIES)
}

async function encryptFile(data: Uint8Array): Promise<EncryptedFile> {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv, ciphertext: new Uint8Array(ct), rawKey };
}

async function decryptFile(
  rawKey: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Uint8Array(pt);
}

// --- Helpers ---

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Main test ---

async function main() {
  console.log("ECIES P256 Content Encrypt/Decrypt/Share Test");
  console.log("=".repeat(60));
  console.log("No Lit. No chain. No passkeys. Pure crypto.\n");

  // Step 1: Generate keypairs
  console.log("-- Step 1: Generate Alice, Bob, Eve P256 keypairs --");
  const alicePriv = p256.utils.randomPrivateKey();
  const alicePub = p256.getPublicKey(alicePriv, false);
  const bobPriv = p256.utils.randomPrivateKey();
  const bobPub = p256.getPublicKey(bobPriv, false);
  const evePriv = p256.utils.randomPrivateKey();

  console.log(`   Alice pub: ${hex(alicePub).slice(0, 20)}...`);
  console.log(`   Bob pub:   ${hex(bobPub).slice(0, 20)}...`);
  console.log(`   Eve pub:   ${hex(p256.getPublicKey(evePriv, false)).slice(0, 20)}...`);

  // Step 2: Alice encrypts a fake audio file
  console.log("\n-- Step 2: Encrypt fake audio file (AES-256-GCM) --");
  const fakeAudio = crypto.getRandomValues(new Uint8Array(1024 * 100)); // 100KB
  const encrypted = await encryptFile(fakeAudio);
  console.log(`   File size: ${fakeAudio.length} bytes`);
  console.log(`   AES key:   ${hex(encrypted.rawKey).slice(0, 16)}...`);
  console.log(`   IV:        ${hex(encrypted.iv)}`);

  // Step 3: Alice wraps AES key to her own pubkey via ECIES
  console.log("\n-- Step 3: ECIES-encrypt AES key to Alice's pubkey --");
  const aliceEnvelope = await eciesEncrypt(alicePub, encrypted.rawKey);
  console.log(`   Envelope: ephPub=${hex(aliceEnvelope.ephemeralPub).slice(0, 16)}... ct=${aliceEnvelope.ciphertext.length}B`);

  // Step 4: Alice decrypts her own key and recovers file
  console.log("\n-- Step 4: Alice decrypts her own wrapped key --");
  const aliceRecoveredKey = await eciesDecrypt(alicePriv, aliceEnvelope);
  if (!bytesEqual(aliceRecoveredKey, encrypted.rawKey)) {
    throw new Error("Alice recovered key does not match original");
  }
  const aliceRecoveredFile = await decryptFile(aliceRecoveredKey, encrypted.iv, encrypted.ciphertext);
  if (!bytesEqual(aliceRecoveredFile, fakeAudio)) {
    throw new Error("Alice recovered file does not match original");
  }
  console.log("   ✓ Alice recovered key matches");
  console.log("   ✓ Alice decrypted file matches original");

  // Step 5: Alice shares with Bob — re-encrypt AES key to Bob's pubkey
  console.log("\n-- Step 5: Alice shares → ECIES re-encrypt AES key to Bob --");
  const bobEnvelope = await eciesEncrypt(bobPub, aliceRecoveredKey);
  console.log(`   Bob envelope: ephPub=${hex(bobEnvelope.ephemeralPub).slice(0, 16)}... ct=${bobEnvelope.ciphertext.length}B`);

  // Step 6: Bob decrypts and recovers file
  console.log("\n-- Step 6: Bob decrypts his key copy → decrypts file --");
  const bobRecoveredKey = await eciesDecrypt(bobPriv, bobEnvelope);
  if (!bytesEqual(bobRecoveredKey, encrypted.rawKey)) {
    throw new Error("Bob recovered key does not match original");
  }
  const bobRecoveredFile = await decryptFile(bobRecoveredKey, encrypted.iv, encrypted.ciphertext);
  if (!bytesEqual(bobRecoveredFile, fakeAudio)) {
    throw new Error("Bob recovered file does not match original");
  }
  console.log("   ✓ Bob recovered key matches");
  console.log("   ✓ Bob decrypted file matches original");

  // Step 7: Eve tries to decrypt Bob's envelope — should fail
  console.log("\n-- Step 7: Eve tries to decrypt Bob's envelope --");
  try {
    await eciesDecrypt(evePriv, bobEnvelope);
    throw new Error("Eve should not be able to decrypt Bob's envelope");
  } catch (err: any) {
    if (err.message.includes("Eve should not")) throw err;
    console.log(`   ✓ Eve denied: ${err.message.split("\n")[0]}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("ALL CHECKS PASSED");
  console.log("ECIES P256 + AES-256-GCM content sharing works.");
  console.log("=".repeat(60));
}

main().catch((err: any) => {
  console.error("\nFAILED");
  console.error(err?.message || err);
  process.exit(1);
});
