#!/usr/bin/env bun
/**
 * Test Content Upload — full deposit → encrypt → upload → register → retrieve → decrypt
 *
 * End-to-end test of the encrypted Filecoin content pipeline:
 *  1. Check/deposit USDFC into Synapse storage account
 *  2. Encrypt a test audio payload (AES-GCM + Lit key encryption)
 *  3. Upload encrypted blob to Filecoin via Synapse
 *  4. Register content on ContentRegistry (MegaETH + Base mirror)
 *  5. Retrieve from Beam CDN
 *  6. Decrypt and verify round-trip
 *
 * Uses the deployer EOA as the Filecoin signer (has tFIL + USDFC on Calibration).
 * Uses the test PKP for Lit operations (encrypt, register, decrypt).
 *
 * Prerequisites:
 *   - Deployer EOA funded with tFIL + USDFC on Filecoin Calibration (chain 314159)
 *   - Test PKP set up with content-register-v1 Lit Action deployed
 *
 * Usage:
 *   bun tests/content-upload.test.ts
 */

import { Synapse } from "@filoz/synapse-sdk";
import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { ethers } from "ethers";

// ── Constants ──────────────────────────────────────────────────────────

const FIL_RPC = "https://api.calibration.node.glif.io/rpc/v1";
const FIL_CHAIN_ID = 314159;
const USDFC_ADDRESS = "0xb3042734b608a1b16e9e86b374a3f3e389b4cdf0";
const USDFC_DECIMALS = 18;
const DEPOSIT_AMOUNT = ethers.parseUnits("1", USDFC_DECIMALS); // 1 USDFC

const CONTENT_ACCESS_MIRROR = "0xd4D3baB38a11D72e36F49a73D50Dbdc3c1Aa4e9A";

// Min upload size for Filecoin
const MIN_PIECE_SIZE = 127;

// ── Helpers ────────────────────────────────────────────────────────────

function buildAccessConditions(contentId: string) {
  return [
    {
      conditionType: "evmContract" as const,
      contractAddress: CONTENT_ACCESS_MIRROR,
      chain: "baseSepolia",
      functionName: "canAccess",
      functionParams: [":userAddress", contentId],
      functionAbi: {
        type: "function" as const,
        name: "canAccess",
        stateMutability: "view" as const,
        inputs: [
          { type: "address", name: "user", internalType: "address" },
          { type: "bytes32", name: "contentId", internalType: "bytes32" },
        ],
        outputs: [{ type: "bool", name: "", internalType: "bool" }],
      },
      returnValueTest: { key: "", comparator: "=", value: "true" },
    },
  ];
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("Test Content Upload (full pipeline)");
  console.log("=".repeat(60));
  console.log(`   Env:         ${Env.name}`);

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP:         ${pkpCreds.ethAddress}`);

  const registerCid = Env.cids["contentRegisterV1"];
  console.log(`   Register CID: ${registerCid || "(not deployed)"}`);
  if (!registerCid) {
    console.error("\nMissing register action CID. Run setup.ts first.");
    process.exit(1);
  }

  // Deployer EOA for Filecoin transactions
  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const filProvider = new ethers.JsonRpcProvider(FIL_RPC);
  const filSigner = new ethers.Wallet(pk, filProvider);
  console.log(`   FIL Signer:  ${filSigner.address}`);

  // Lit auth (for encrypt/decrypt/register)
  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const userPkpPublicKey = pkpCreds.publicKey;
  const userAddress = pkpCreds.ethAddress;

  const t0 = performance.now();

  // ══════════════════════════════════════════════════════════════
  // STEP 0: Check balances
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 0: Check Filecoin balances ──");

  const tfilBal = await filProvider.getBalance(filSigner.address);
  console.log(`   tFIL:  ${ethers.formatEther(tfilBal)}`);
  if (tfilBal === 0n) throw new Error("No tFIL for gas");

  const usdfc = new ethers.Contract(
    USDFC_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    filProvider,
  );
  const usdfcBal = await usdfc.balanceOf(filSigner.address);
  console.log(`   USDFC: ${ethers.formatUnits(usdfcBal, USDFC_DECIMALS)}`);

  // ══════════════════════════════════════════════════════════════
  // STEP 1: Initialize Synapse + deposit
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 1: Initialize Synapse + check storage ──");

  const syn = await Synapse.create({
    signer: filSigner as any,
    withCDN: true,
    disableNonceManager: false,
  });
  console.log("   Synapse initialized");

  const payments = (syn as any)._payments;
  const accountInfo = await payments.accountInfo();
  const available = accountInfo.availableFunds;
  console.log(`   Storage available: ${ethers.formatUnits(available, USDFC_DECIMALS)} USDFC`);

  if (available < DEPOSIT_AMOUNT) {
    console.log("   Depositing 1 USDFC...");
    const warmStorageAddr = (syn as any)._warmStorageAddress;
    const tx = await payments.depositWithPermitAndApproveOperator(
      DEPOSIT_AMOUNT,
      warmStorageAddr,
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      2880 * 30,
    );
    console.log(`   Deposit tx: ${tx.hash}`);
    await tx.wait();
    console.log("   ✓ Deposited 1 USDFC");
  } else {
    console.log("   ✓ Sufficient storage balance");
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 2: Connect Lit + create auth context
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 2: Connect Lit Protocol ──");

  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("   Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "content-upload-test",
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
        ["access-control-condition-decryption", "*"],
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
      statement: "",
    },
    litClient,
  });
  console.log("   Auth context ready");

  // ══════════════════════════════════════════════════════════════
  // STEP 3: Generate test audio + compute contentId
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 3: Prepare content ──");

  // Simulate a small audio file (random bytes)
  const testAudio = crypto.getRandomValues(new Uint8Array(256));
  console.log(`   Test audio: ${testAudio.length} bytes`);

  // Track ID (random bytes32)
  const trackId = ethers.hexlify(ethers.randomBytes(32));
  // Content ID = keccak256(abi.encode(trackId, owner))
  const contentId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address"],
      [trackId, userAddress],
    ),
  ).toLowerCase();
  console.log(`   trackId:   ${trackId}`);
  console.log(`   contentId: ${contentId}`);

  // ══════════════════════════════════════════════════════════════
  // STEP 4: Encrypt with Lit (AES key encrypted with contract-gated ACC)
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 4: Encrypt with Lit ──");

  // Generate AES-256 key
  const aesKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const aesKeyBase64 = Buffer.from(aesKeyBytes).toString("base64");

  // Encrypt the AES key payload with Lit
  const keyPayload = JSON.stringify({ contentId, key: aesKeyBase64 });
  const unifiedAcc = buildAccessConditions(contentId);

  const encryptedKey = await litClient.encrypt({
    unifiedAccessControlConditions: unifiedAcc,
    dataToEncrypt: new TextEncoder().encode(keyPayload),
  });
  console.log(`   ✓ Key encrypted (ct: ${encryptedKey.ciphertext.slice(0, 30)}...)`);

  // Encrypt audio with AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    aesKeyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const encryptedAudio = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, testAudio),
  );
  console.log(`   ✓ Audio encrypted (${encryptedAudio.length} bytes)`);

  // Build blob: header + encrypted audio (+ padding for min piece size)
  const ctBytes = new TextEncoder().encode(encryptedKey.ciphertext);
  const hashBytes = new TextEncoder().encode(encryptedKey.dataToEncryptHash);
  // Header: 4 + ctLen + 4 + hashLen + 1 (algo) + 1 (ivLen) + ivLen + 4 (audioLen)
  const headerSize = 4 + ctBytes.length + 4 + hashBytes.length + 1 + 1 + iv.length + 4;
  const totalSize = headerSize + encryptedAudio.length;

  // Pad to MIN_PIECE_SIZE — this exercises the audioLen field (decrypt must ignore padding)
  let blob = new Uint8Array(Math.max(totalSize, MIN_PIECE_SIZE));
  const view = new DataView(blob.buffer);
  let offset = 0;

  // litCiphertext
  view.setUint32(offset, ctBytes.length);
  offset += 4;
  blob.set(ctBytes, offset);
  offset += ctBytes.length;

  // dataToEncryptHash
  view.setUint32(offset, hashBytes.length);
  offset += 4;
  blob.set(hashBytes, offset);
  offset += hashBytes.length;

  // algo (1 = AES_GCM_256)
  blob[offset] = 1;
  offset += 1;

  // IV
  blob[offset] = iv.length;
  offset += 1;
  blob.set(iv, offset);
  offset += iv.length;

  // audioLen
  view.setUint32(offset, encryptedAudio.length);
  offset += 4;

  // Encrypted audio
  blob.set(encryptedAudio, offset);

  const paddingBytes = blob.length - totalSize;
  console.log(`   ✓ Blob: ${blob.length} bytes (header: ${headerSize}, audio: ${encryptedAudio.length}, padding: ${paddingBytes})`);

  // ══════════════════════════════════════════════════════════════
  // STEP 5: Upload to Filecoin via Synapse
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 5: Upload to Filecoin ──");

  const storageManager = syn._storageManager;
  const context = await storageManager.createContext({
    withCDN: true,
    forceCreateDataSet: false,
    callbacks: {
      onDataSetResolved: ({ isExisting, dataSetId }: any) => {
        console.log(`   DataSet: existing=${isExisting}, id=${dataSetId}`);
      },
    },
  });

  const uploadStart = Date.now();
  const uploadResult = await context.upload(blob);
  const uploadTime = Date.now() - uploadStart;

  const pieceCid = uploadResult.pieceCid || uploadResult.commP || uploadResult.cid || String(uploadResult);
  console.log(`   ✓ Uploaded in ${uploadTime}ms`);
  console.log(`   pieceCid: ${pieceCid}`);

  const beamUrl = `https://${filSigner.address}.calibration.filbeam.io/${pieceCid}`;
  console.log(`   Beam URL: ${beamUrl}`);

  // ══════════════════════════════════════════════════════════════
  // STEP 6: Register on ContentRegistry (MegaETH + Base)
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 6: Register on-chain ──");

  const registerResult = await litClient.executeJs({
    ipfsId: registerCid,
    authContext,
    jsParams: {
      userPkpPublicKey,
      trackId,
      pieceCid: String(pieceCid),
      algo: 1,
      timestamp: Date.now(),
      nonce: Math.floor(Math.random() * 1e6).toString(),
    },
  });

  const registerResp = JSON.parse(registerResult.response as string);
  if (!registerResp.success) {
    throw new Error(`Register failed: ${registerResp.error}`);
  }
  console.log(`   ✓ Registered on both chains`);

  // ══════════════════════════════════════════════════════════════
  // STEP 7: Retrieve from Beam CDN
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 7: Retrieve from Beam CDN ──");

  // Wait a moment for CDN propagation
  console.log("   Waiting 5s for CDN propagation...");
  await new Promise((r) => setTimeout(r, 5000));

  const fetchStart = Date.now();
  const response = await fetch(beamUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`Beam CDN fetch failed: ${response.status} ${response.statusText}`);
  }
  const fetchedBlob = new Uint8Array(await response.arrayBuffer());
  const fetchTime = Date.now() - fetchStart;
  console.log(`   ✓ Retrieved ${fetchedBlob.length} bytes in ${fetchTime}ms`);

  // ══════════════════════════════════════════════════════════════
  // STEP 8: Decrypt and verify
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 8: Decrypt and verify ──");

  // Parse header from fetched blob
  const hView = new DataView(fetchedBlob.buffer, fetchedBlob.byteOffset, fetchedBlob.byteLength);
  let hOff = 0;

  const ctLen = hView.getUint32(hOff);
  hOff += 4;
  const litCt = new TextDecoder().decode(fetchedBlob.subarray(hOff, hOff + ctLen));
  hOff += ctLen;

  const hashLen = hView.getUint32(hOff);
  hOff += 4;
  const litHash = new TextDecoder().decode(fetchedBlob.subarray(hOff, hOff + hashLen));
  hOff += hashLen;

  const algo = fetchedBlob[hOff];
  hOff += 1;
  if (algo !== 1) throw new Error(`Unsupported algo: ${algo}`);

  const ivLen = fetchedBlob[hOff];
  hOff += 1;
  const fetchedIv = fetchedBlob.subarray(hOff, hOff + ivLen);
  hOff += ivLen;

  const audioLen = hView.getUint32(hOff);
  hOff += 4;

  const fetchedEncryptedAudio = fetchedBlob.subarray(hOff, hOff + audioLen);
  console.log(`   Header parsed: ct=${ctLen}B, hash=${hashLen}B, algo=${algo}, iv=${ivLen}B, audioLen=${audioLen}B`);
  console.log(`   Blob has ${fetchedBlob.length - hOff - audioLen} trailing padding bytes`);

  // Decrypt AES key via Lit
  const decryptResult = await litClient.decrypt({
    unifiedAccessControlConditions: unifiedAcc,
    ciphertext: litCt,
    dataToEncryptHash: litHash,
    authContext,
    chain: "baseSepolia",
  });

  const decryptedPayload = JSON.parse(new TextDecoder().decode(decryptResult.decryptedData));
  if (decryptedPayload.contentId?.toLowerCase() !== contentId) {
    throw new Error(`Content ID mismatch in decrypted payload`);
  }
  console.log(`   ✓ AES key decrypted`);

  // Decrypt audio
  const rawKey = Uint8Array.from(atob(decryptedPayload.key), (c) => c.charCodeAt(0));
  const decKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const decryptedAudio = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: fetchedIv }, decKey, fetchedEncryptedAudio),
  );

  // Verify
  if (decryptedAudio.length !== testAudio.length) {
    throw new Error(`Audio length mismatch: ${decryptedAudio.length} vs ${testAudio.length}`);
  }
  for (let i = 0; i < testAudio.length; i++) {
    if (decryptedAudio[i] !== testAudio[i]) {
      throw new Error(`Audio byte mismatch at offset ${i}`);
    }
  }
  console.log(`   ✓ Decrypted audio matches original (${decryptedAudio.length} bytes)`);

  // ══════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`ALL CHECKS PASSED (${elapsed}s)`);
  console.log(`   pieceCid: ${pieceCid}`);
  console.log(`   Beam URL: ${beamUrl}`);
  console.log("=".repeat(60));

  litClient.disconnect();
}

main().catch((err) => {
  console.error(`\nFAILED:`, err.message || err);
  process.exit(1);
});
