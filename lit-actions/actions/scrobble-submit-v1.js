/**
 * Scrobble Submit v1
 *
 * Decentralized scrobble pipeline: pin batch to IPFS + on-chain event on MegaETH.
 * Sponsor PKP calls ScrobbleV1.submitBatch() — emits event for subgraph indexing.
 *
 * Flow:
 * 1. Verify EIP-191 signature over batch hash
 * 2. Decrypt Filebase API key
 * 3. Normalize tracks + compute track_keys
 * 4. Pin enriched batch JSON to Filebase IPFS → CID
 * 5. Sponsor PKP signs + broadcasts ScrobbleV1.submitBatch() on MegaETH
 * 6. Return CID + tx hash
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - tracks: Array of { artist, title, album?, duration_ms?, playedAt, source?, isrc?, ipId? }
 * - signature: EIP-191 signature over `heaven:scrobble:${batchHash}:${timestamp}:${nonce}`
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - filebaseEncryptedKey: Lit-encrypted Filebase credentials
 *
 * Optional jsParams:
 * - filebasePlaintextKey: Dev override for Filebase key
 *
 * Returns: { success, version, user, cid, count, startTs, endTs, txHash, blockNumber, batchHash }
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const CHAIN_ID = 6343;
const RPC_URL = "https://carrot.megaeth.com/rpc";

// ScrobbleV1 contract (MegaETH Testnet)
const SCROBBLE_V1 = "0x8fF05D1Ba81542d7bE2B79d6912C1D65F339dE0e";

// Sponsor PKP — same one used by heaven-register-sponsor
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

// MegaETH gas config (legacy type 0 txs, ~0.001 gwei)
const GAS_PRICE = "1000000"; // 1M wei = ~0.001 gwei
const GAS_LIMIT = "2000000"; // generous for MegaEVM

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

const strip0x = (v) => (String(v || "").startsWith("0x") ? String(v).slice(2) : String(v));

const toBigNumber = (value, label) => {
  if (typeof value === "bigint") return ethers.BigNumber.from(value.toString());
  if (typeof value === "number") return ethers.BigNumber.from(value);
  if (typeof value === "string") return ethers.BigNumber.from(value);
  throw new Error(`Invalid ${label}`);
};

// ============================================================
// SHA-256 + FILEBASE S3 (AWS Sig V4)
// ============================================================

async function sha256Bytes(data) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const hash = await sha256Bytes(encoder.encode(message));
  return bytesToHex(hash);
}

async function hmacSha256(key, message) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function hmacHex(key, message) {
  const sig = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(secretKey, dateStamp, region, service) {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(encoder.encode("AWS4" + secretKey), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function uploadToFilebase(filebaseApiKey, content, contentType, fileName) {
  const decoded = atob(filebaseApiKey);
  const [accessKey, secretKey, bucket] = decoded.split(":");
  if (!accessKey || !secretKey || !bucket) {
    throw new Error("Invalid Filebase API key format");
  }

  const endpoint = "s3.filebase.com";
  const region = "us-east-1";
  const service = "s3";

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${bucket}/${fileName}`;

  const payloadHash = await sha256Hex(content);

  const canonicalHeaders =
    [`host:${endpoint}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join("\n") + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");

  const signingKey = await getSigningKey(secretKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const response = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "Content-Type": contentType,
    },
    body: content,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Filebase upload failed: ${response.status} ${text}`);
  }

  const cid = response.headers.get("x-amz-meta-cid");
  if (!cid) {
    throw new Error("No CID returned from Filebase");
  }

  return cid;
}

// ============================================================
// TRACK NORMALIZATION
// ============================================================

function normalizeText(text) {
  if (!text) return "";
  let s = text.normalize("NFKC").toLowerCase().trim();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s*[\(\[][^)\]]*(?:feat|ft|remix|remaster|deluxe|bonus|live|edit|version|acoustic|explicit|clean)[^)\]]*[\)\]]/gi, "");
  return s.trim();
}

async function computeTrackKey(artistNorm, titleNorm) {
  const material = `${artistNorm}\x00${titleNorm}`;
  return await sha256Hex(material);
}

// ============================================================
// ABI
// ============================================================

const SCROBBLE_ABI = [
  "function submitBatch(address user, uint64 startTs, uint64 endTs, uint32 count, string cid, bytes32 batchHash) external",
];

// ============================================================
// DECRYPT KEY HELPER
// ============================================================

async function decryptKey(encryptedKey, plaintextKey) {
  if (plaintextKey) return plaintextKey;
  if (!encryptedKey) return null;

  const { ciphertext, dataToEncryptHash, accessControlConditions } = encryptedKey;
  const result = await Lit.Actions.decryptAndCombine({
    accessControlConditions,
    ciphertext,
    dataToEncryptHash,
    authSig: null,
  });
  return result;
}

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      tracks,
      signature,
      timestamp,
      nonce,
      filebaseEncryptedKey,
      filebasePlaintextKey,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(tracks, "tracks");
    must(signature, "signature");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    if (!Array.isArray(tracks) || tracks.length === 0) {
      throw new Error("tracks must be a non-empty array");
    }
    if (tracks.length > 500) {
      throw new Error("Maximum 500 tracks per batch");
    }

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);

    // ========================================
    // STEP 1: Validate request freshness
    // ========================================
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    // ========================================
    // STEP 2: Validate + normalize tracks, compute batch hash
    // ========================================
    let minTs = Infinity;
    let maxTs = -Infinity;

    const normalizedTracks = [];
    for (const t of tracks) {
      if (!t.artist || typeof t.artist !== "string") throw new Error("Each track must have artist (string)");
      if (!t.title || typeof t.title !== "string") throw new Error("Each track must have title (string)");
      if (!t.playedAt || typeof t.playedAt !== "number") throw new Error("Each track must have playedAt (unix timestamp)");

      minTs = Math.min(minTs, t.playedAt);
      maxTs = Math.max(maxTs, t.playedAt);

      const artistNorm = normalizeText(t.artist);
      const titleNorm = normalizeText(t.title);
      const albumNorm = t.album ? normalizeText(t.album) : "";
      const trackKey = await computeTrackKey(artistNorm, titleNorm);

      normalizedTracks.push({
        raw: {
          artist: t.artist.slice(0, 256),
          title: t.title.slice(0, 256),
          album: t.album ? t.album.slice(0, 256) : null,
          duration_ms: typeof t.duration_ms === "number" ? t.duration_ms : null,
          playedAt: t.playedAt,
          source: t.source ? t.source.slice(0, 64) : null,
        },
        normalized: {
          artist_norm: artistNorm,
          title_norm: titleNorm,
          album_norm: albumNorm,
          duration_s: typeof t.duration_ms === "number" ? Math.round(t.duration_ms / 1000) : null,
        },
        isrc: t.isrc || null,
        ipId: t.ipId || null,
        track_key: trackKey,
      });
    }

    const startTs = Math.floor(minTs);
    const endTs = Math.floor(maxTs);
    const count = normalizedTracks.length;

    const batchData = {
      version: 4,
      user: userAddress.toLowerCase(),
      startTs: String(startTs),
      endTs: String(endTs),
      count,
      tracks: normalizedTracks,
    };
    const batchJson = JSON.stringify(batchData);
    const batchHash = await sha256Hex(batchJson);

    // ========================================
    // STEP 3: Verify signature binds batch
    // ========================================
    const message = `heaven:scrobble:${batchHash}:${timestamp}:${nonce}`;
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(
        `Invalid signature: recovered ${recovered}, expected ${userAddress}`
      );
    }

    // ========================================
    // STEP 4: Decrypt Filebase key + pin batch
    // ========================================
    const filebaseKey = await decryptKey(filebaseEncryptedKey, filebasePlaintextKey);
    if (!filebaseKey) throw new Error("filebaseEncryptedKey or filebasePlaintextKey is required");

    const userPrefix = userAddress.slice(2, 10).toLowerCase();
    const fileName = `scrobble-${userPrefix}-${startTs}-${batchHash.slice(0, 16)}.json`;

    const cid = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "pinToFilebase" },
      async () => {
        try {
          const result = await uploadToFilebase(filebaseKey, batchJson, "application/json", fileName);
          return result;
        } catch (err) {
          return `[ERROR] ${err.message || String(err)}`;
        }
      }
    );

    if (typeof cid === "string" && cid.startsWith("[ERROR]")) {
      throw new Error(`Filebase upload failed: ${cid}`);
    }

    // ========================================
    // STEP 5: Build + sign + broadcast ScrobbleV1.submitBatch() via sponsor PKP
    // ========================================
    const iface = new ethers.utils.Interface(SCROBBLE_ABI);
    const txData = iface.encodeFunctionData("submitBatch", [
      userAddress,
      startTs,
      endTs,
      count,
      cid,
      "0x" + batchHash,
    ]);

    const txParamsJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxParams" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const txNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
        return JSON.stringify({ nonce: txNonce.toString() });
      }
    );

    const txParams = JSON.parse(txParamsJson);

    // MegaETH requires legacy (type 0) transactions
    const unsignedTx = {
      type: 0,
      chainId: CHAIN_ID,
      nonce: toBigNumber(txParams.nonce, "nonce"),
      to: SCROBBLE_V1,
      data: txData,
      gasLimit: toBigNumber(GAS_LIMIT, "gasLimit"),
      gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
      value: 0,
    };

    const txHash = ethers.utils.keccak256(
      ethers.utils.serializeTransaction(unsignedTx)
    );

    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(txHash)),
      publicKey: SPONSOR_PKP_PUBLIC_KEY,
      sigName: "sponsorScrobbleSig",
    });

    if (typeof sigResult === "string" && sigResult.startsWith("[ERROR]")) {
      throw new Error(`PKP signing failed: ${sigResult}`);
    }

    const sigObj = JSON.parse(sigResult);
    let v = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
    if (v === 0 || v === 1) v += 27;
    const sig = ethers.utils.joinSignature({
      r: `0x${strip0x(sigObj.r)}`,
      s: `0x${strip0x(sigObj.s)}`,
      v,
    });

    const signedTx = ethers.utils.serializeTransaction(unsignedTx, sig);

    // Broadcast
    const broadcastResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "broadcastScrobbleTx" },
      async () => {
        try {
          const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
          const txResponse = await provider.sendTransaction(signedTx);
          const receipt = await txResponse.wait(1);
          return JSON.stringify({
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status,
          });
        } catch (err) {
          return JSON.stringify({
            broadcastError: err?.reason || err?.message || String(err),
            code: err?.code,
          });
        }
      }
    );

    if (typeof broadcastResult === "string" && broadcastResult.startsWith("[ERROR]")) {
      throw new Error(`Broadcast runOnce failed: ${broadcastResult}`);
    }

    const broadcast = JSON.parse(broadcastResult);
    if (broadcast.broadcastError) {
      throw new Error(`TX broadcast failed: ${broadcast.broadcastError} (code: ${broadcast.code})`);
    }

    // ========================================
    // DONE
    // ========================================
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "scrobble-submit-v1",
        user: userAddress.toLowerCase(),
        cid,
        count,
        startTs,
        endTs,
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        batchHash,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "scrobble-submit-v1",
      }),
    });
  }
};

main();
