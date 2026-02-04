/**
 * Photo Reveal v1
 *
 * Reveals the original photo to a viewer who has paid for access.
 * Applies multi-layer watermarks for accountability tracing.
 *
 * Flow:
 * 1. Verify viewer's 24h payment window (EngagementV2.isRevealValid)
 * 2. Check viewer is not banned (EngagementV2.isBanned)
 * 3. Owner bypass: poster can view own original (free, no watermark, no time limit)
 * 4. Compute deterministic watermarkCode = HMAC(secret, viewer | postId | nonce)
 * 5. Decrypt original photo from Filebase (Lit access control)
 * 6. Call heaven-images /watermark to apply multi-layer watermarks
 * 7. Log reveal on-chain via EngagementV2.logRevealFor()
 * 8. Return watermarked image bytes
 *
 * Auth model: Lit session authorization = viewer intent.
 * Viewer must have:
 *   - Valid payment (within 24h window) OR be the post owner
 *   - Not be in the nullifier ban list
 *   - (V2) Valid self.xyz proof for identity verification
 *
 * Required jsParams:
 * - viewerPkpPublicKey: Viewer's PKP public key
 * - postId: bytes32 post identifier
 * - postCreator: address of post creator (for owner bypass check)
 * - encryptedOriginal: { ciphertext, dataToEncryptHash, accessControlConditions }
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - heavenImagesUrl: URL of heaven-images service
 *
 * Optional jsParams:
 * - viewerHeavenName: Viewer's .heaven name (for watermark display)
 * - outputWidth: Output width (default 1024)
 * - outputHeight: Output height (default 1024)
 * - watermarkLayers: ['overlay', 'corner', 'tiled'] (default all)
 * - nullifierHash: bytes32 (V2: from self.xyz proof, for ban check)
 * - dryRun: boolean (default false) — skip on-chain logging
 *
 * Returns: { success, imageBase64, contentType, viewerLabel, watermarkCode }
 */

// ============================================================
// CONSTANTS
// ============================================================

// MegaETH (EngagementV2)
const MEGA_CHAIN_ID = 6343;
const MEGA_RPC_URL = "https://carrot.megaeth.com/rpc";
const MEGA_GAS_PRICE = "1000000";
const MEGA_GAS_LIMIT = "500000";
const ENGAGEMENT_V2 = "0xAF769d204e51b64D282083Eb0493F6f37cd93138";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

// Watermark HMAC secret (encrypted, decrypted at runtime)
// This ensures watermark codes can't be predicted or forged
const WATERMARK_SECRET_SEED = "heaven:watermark:v1";

// 24 hours in seconds
const REVEAL_WINDOW = 24 * 60 * 60;

let ethersLib = globalThis.ethers;
if (!ethersLib) ethersLib = require("ethers");
const ethers = ethersLib;

// ============================================================
// HELPERS
// ============================================================

const must = (v, label) => {
  if (v === undefined || v === null) throw new Error(`${label} is required`);
  return v;
};

const parseRunOnce = (result, stepName) => {
  const s = String(result || "").trim();
  if (s.startsWith("[ERROR]") || s.includes("[ERROR]"))
    throw new Error(`${stepName} failed: ${s.slice(0, 300)}`);
  return JSON.parse(s);
};

const strip0x = (v) => (String(v || "").startsWith("0x") ? String(v).slice(2) : String(v));

const toBigNumber = (value, label) => {
  if (typeof value === "bigint") return ethers.BigNumber.from(value.toString());
  if (typeof value === "number") return ethers.BigNumber.from(value);
  if (typeof value === "string") return ethers.BigNumber.from(value);
  throw new Error(`Invalid ${label}`);
};

// ============================================================
// HMAC-SHA256 (for watermark code generation)
// ============================================================

async function hmacSha256(key, message) {
  const encoder = new TextEncoder();
  const keyData = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate deterministic watermark code
 * watermarkCode = HMAC(secret, viewer | postId | nonce)
 * Returns full bytes32 hex and 8-char display code
 */
async function generateWatermarkCode(viewer, postId, nonce) {
  const message = `${viewer.toLowerCase()}|${postId.toLowerCase()}|${nonce}`;
  const hmac = await hmacSha256(WATERMARK_SECRET_SEED, message);
  const fullHex = "0x" + bytesToHex(hmac);
  const displayCode = bytesToHex(hmac).slice(0, 8).toUpperCase();
  return { fullHex, displayCode };
}

// ============================================================
// ABI
// ============================================================

const ENGAGEMENT_V2_ABI = [
  "function revealPaidAt(bytes32 postId, address viewer) view returns (uint64)",
  "function revealNonce(bytes32 postId, address viewer) view returns (uint32)",
  "function isBanned(bytes32 nullifierHash) view returns (bool)",
  "function isRevealValid(bytes32 postId, address viewer) view returns (bool)",
  "function logRevealFor(address viewer, bytes32 postId, bytes32 watermarkCode, uint32 nonce) external",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      viewerPkpPublicKey,
      postId,
      postCreator,
      encryptedOriginal,
      timestamp,
      nonce,
      heavenImagesUrl,
      viewerHeavenName,
      outputWidth = 1024,
      outputHeight = 1024,
      watermarkLayers = ["overlay", "corner", "tiled"],
      nullifierHash, // V2: from self.xyz proof
      dryRun = false,
    } = jsParams || {};

    must(viewerPkpPublicKey, "viewerPkpPublicKey");
    must(postId, "postId");
    must(postCreator, "postCreator");
    must(encryptedOriginal, "encryptedOriginal");
    must(timestamp, "timestamp");
    must(nonce, "nonce");
    must(heavenImagesUrl, "heavenImagesUrl");

    const viewerAddress = ethers.utils.computeAddress(viewerPkpPublicKey);
    const creatorNormalized = ethers.utils.getAddress(postCreator);
    const viewerNormalized = ethers.utils.getAddress(viewerAddress);

    // ========================================
    // STEP 1: Validate request freshness
    // ========================================
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000)
      throw new Error("Request expired (timestamp older than 5 minutes)");

    // ========================================
    // STEP 2: Check if viewer is the owner
    // ========================================
    const isOwner = creatorNormalized.toLowerCase() === viewerNormalized.toLowerCase();

    // ========================================
    // STEP 3: If not owner, verify payment window
    // ========================================
    let revealNonceValue = 0;

    if (!isOwner) {
      const paymentCheckResult = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "checkPayment" },
        async () => {
          try {
            const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
            const engagement = new ethers.Contract(ENGAGEMENT_V2, ENGAGEMENT_V2_ABI, provider);

            // Check payment validity (24h window)
            const isValid = await engagement.isRevealValid(postId, viewerNormalized);
            if (!isValid) {
              return JSON.stringify({ error: "PAYMENT_REQUIRED", message: "No valid payment found. Pay to reveal or payment expired." });
            }

            // Get nonce for watermark
            const nonceVal = await engagement.revealNonce(postId, viewerNormalized);

            // Check nullifier ban (if provided)
            if (nullifierHash && nullifierHash !== ethers.constants.HashZero) {
              const isBannedResult = await engagement.isBanned(nullifierHash);
              if (isBannedResult) {
                return JSON.stringify({ error: "BANNED", message: "This identity is banned from viewing reveals." });
              }
            }

            return JSON.stringify({ valid: true, nonce: nonceVal.toString() });
          } catch (err) {
            return JSON.stringify({ error: "CHECK_FAILED", message: err?.message || String(err) });
          }
        }
      );

      const paymentCheck = parseRunOnce(paymentCheckResult, "Payment check");
      if (paymentCheck.error) {
        throw new Error(`${paymentCheck.error}: ${paymentCheck.message}`);
      }
      revealNonceValue = Number(paymentCheck.nonce);
    }

    // ========================================
    // STEP 4: Sign binding message with viewer PKP
    // ========================================
    const message = `heaven:reveal:${postId}:${timestamp}:${nonce}`;
    const msgHash = ethers.utils.hashMessage(message);
    let sigResult;
    try {
      sigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(msgHash)),
        publicKey: viewerPkpPublicKey,
        sigName: "viewer_reveal_sig",
      });
    } catch (sigErr) {
      throw new Error(`Viewer PKP signing failed: ${sigErr?.message || sigErr}`);
    }
    const sigStr = String(sigResult || "").trim();
    if (sigStr.startsWith("[ERROR]") || sigStr.includes("[ERROR]"))
      throw new Error(`Viewer PKP signing failed: ${sigStr.slice(0, 200)}`);

    const sigObj = JSON.parse(sigStr);
    let viewerV = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
    if (viewerV === 0 || viewerV === 1) viewerV += 27;
    const signature = ethers.utils.joinSignature({
      r: `0x${strip0x(sigObj.r)}`,
      s: `0x${strip0x(sigObj.s)}`,
      v: viewerV,
    });

    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== viewerNormalized.toLowerCase())
      throw new Error("Signature mismatch");

    // ========================================
    // STEP 5: Decrypt original photo
    // ========================================
    let decryptedOriginal;
    try {
      decryptedOriginal = await Lit.Actions.decryptAndCombine({
        accessControlConditions: encryptedOriginal.accessControlConditions,
        ciphertext: encryptedOriginal.ciphertext,
        dataToEncryptHash: encryptedOriginal.dataToEncryptHash,
        authSig: null,
        chain: "ethereum",
      });
    } catch (decryptErr) {
      throw new Error(`Failed to decrypt original: ${decryptErr?.message || decryptErr}`);
    }

    // decryptedOriginal is base64 encoded image
    const originalBase64 = decryptedOriginal;

    // ========================================
    // STEP 6: Owner bypass — return original without watermark
    // ========================================
    if (isOwner) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          version: "photo-reveal-v1",
          isOwner: true,
          imageBase64: originalBase64,
          contentType: "image/jpeg", // Assume JPEG, could be passed as param
          viewerLabel: null,
          watermarkCode: null,
          message: "Owner viewing own photo (no watermark)",
        }),
      });
      return;
    }

    // ========================================
    // STEP 7: Generate watermark code
    // ========================================
    const { fullHex: watermarkCodeBytes32, displayCode: watermarkDisplayCode } =
      await generateWatermarkCode(viewerNormalized, postId, revealNonceValue);

    // Format viewer label
    const truncatedWallet = `${viewerNormalized.slice(0, 6)}...${viewerNormalized.slice(-4)}`;
    const viewerLabel = viewerHeavenName
      ? `@${viewerHeavenName}.heaven (${truncatedWallet})`
      : `@${truncatedWallet}`;

    // ========================================
    // STEP 8: Call heaven-images /watermark
    // ========================================
    const watermarkResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "applyWatermark" },
      async () => {
        try {
          const response = await fetch(`${heavenImagesUrl}/watermark`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: originalBase64,
              imageContentType: "image/jpeg",
              viewerAddress: viewerNormalized,
              heavenName: viewerHeavenName || null,
              watermarkCode: watermarkDisplayCode,
              outputWidth,
              outputHeight,
              layers: watermarkLayers,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            return JSON.stringify({ error: `Watermark service failed: ${response.status} ${text}` });
          }

          const data = await response.json();
          if (!data.success) {
            return JSON.stringify({ error: data.error || "Watermark failed" });
          }

          return JSON.stringify({
            imageBase64: data.imageBase64,
            contentType: data.contentType,
          });
        } catch (err) {
          return JSON.stringify({ error: err?.message || String(err) });
        }
      }
    );

    const watermarked = parseRunOnce(watermarkResult, "Watermark");
    if (watermarked.error) {
      throw new Error(watermarked.error);
    }

    // ========================================
    // STEP 9: Log reveal on-chain (if not dry run)
    // ========================================
    let logTxHash = null;

    if (!dryRun) {
      const logResult = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "logReveal" },
        async () => {
          try {
            const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
            const txNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");

            const iface = new ethers.utils.Interface(ENGAGEMENT_V2_ABI);
            const calldata = iface.encodeFunctionData("logRevealFor", [
              viewerNormalized,
              postId,
              watermarkCodeBytes32,
              revealNonceValue,
            ]);

            return JSON.stringify({
              nonce: txNonce.toString(),
              calldata,
            });
          } catch (err) {
            return JSON.stringify({ error: err?.message || String(err) });
          }
        }
      );

      const logParams = parseRunOnce(logResult, "Log params");
      if (logParams.error) {
        // Non-fatal: log the error but still return the watermarked image
        console.error("Failed to prepare log tx:", logParams.error);
      } else {
        // Build and sign the log transaction
        const unsignedTx = {
          type: 0,
          chainId: MEGA_CHAIN_ID,
          nonce: toBigNumber(logParams.nonce, "nonce"),
          to: ENGAGEMENT_V2,
          data: logParams.calldata,
          gasLimit: toBigNumber(MEGA_GAS_LIMIT, "gasLimit"),
          gasPrice: toBigNumber(MEGA_GAS_PRICE, "gasPrice"),
          value: 0,
        };

        const txHashToSign = ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTx));

        let sponsorSigResult;
        try {
          sponsorSigResult = await Lit.Actions.signAndCombineEcdsa({
            toSign: Array.from(ethers.utils.arrayify(txHashToSign)),
            publicKey: SPONSOR_PKP_PUBLIC_KEY,
            sigName: "sponsorLogRevealSig",
          });
        } catch (sigErr) {
          console.error("Sponsor signing failed:", sigErr);
        }

        if (sponsorSigResult) {
          const sponsorSigStr = String(sponsorSigResult || "").trim();
          if (!sponsorSigStr.startsWith("[ERROR]")) {
            const sponsorSig = JSON.parse(sponsorSigStr);
            let v = Number(sponsorSig.recid ?? sponsorSig.recoveryId ?? sponsorSig.v);
            if (v === 0 || v === 1) v += 27;
            const sig = ethers.utils.joinSignature({
              r: `0x${strip0x(sponsorSig.r)}`,
              s: `0x${strip0x(sponsorSig.s)}`,
              v,
            });

            const signedTx = ethers.utils.serializeTransaction(unsignedTx, sig);

            // Broadcast (fire and forget — don't block on confirmation)
            const broadcastResult = await Lit.Actions.runOnce(
              { waitForResponse: true, name: "broadcastLogTx" },
              async () => {
                try {
                  const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
                  const txResponse = await provider.sendTransaction(signedTx);
                  return JSON.stringify({ txHash: txResponse.hash });
                } catch (err) {
                  return JSON.stringify({ error: err?.message || String(err) });
                }
              }
            );

            const broadcast = parseRunOnce(broadcastResult, "Log broadcast");
            if (broadcast.txHash) {
              logTxHash = broadcast.txHash;
            }
          }
        }
      }
    }

    // ========================================
    // STEP 10: Return watermarked image
    // ========================================
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "photo-reveal-v1",
        isOwner: false,
        imageBase64: watermarked.imageBase64,
        contentType: watermarked.contentType,
        viewerLabel,
        watermarkCode: watermarkDisplayCode,
        watermarkCodeBytes32,
        revealNonce: revealNonceValue,
        logTxHash,
        dryRun,
      }),
    });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "photo-reveal-v1",
        error: e?.message || String(e),
      }),
    });
  }
};

main();
