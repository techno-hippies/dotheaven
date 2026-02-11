/**
 * Track Cover v4
 *
 * Upload cover art to Filebase (if needed) and set coverCid on ScrobbleV4.
 * Operator-only txs are sponsored by the sponsor PKP.
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - tracks: Array of { trackId, coverCid?, coverImage? }
 * - filebaseEncryptedKey or filebasePlaintextKey (required if coverImage provided)
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const CHAIN_ID = 6343;
const RPC_URL = "https://carrot.megaeth.com/rpc";

// ScrobbleV4 contract (MegaETH Testnet)
const SCROBBLE_V4 = "0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1";

// Sponsor PKP (operator)
const SPONSOR_PKP_PUBLIC_KEY =
  "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const SPONSOR_PKP_ADDRESS = "0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455";

const GAS_PRICE = "1000000";
const GAS_LIMIT = "4000000";

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

async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp"];
const MAX_COVER_BYTES = 5 * 1024 * 1024;

// SHA-256 + FILEBASE S3 (AWS Sig V4)
async function sha256Bytes(data) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256HexFromBuffer(buffer) {
  const hash = await sha256Bytes(buffer);
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

async function uploadToFilebase(apiKey, content, contentType, filename) {
  const decoded = atob(String(apiKey || ""));
  const [accessKey, secretKey, bucket] = decoded.split(":");
  if (!accessKey || !secretKey || !bucket) throw new Error("Invalid Filebase API key format");
  const endpoint = "s3.filebase.com";
  const region = "us-east-1";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256HexFromBuffer(content);
  const canonicalUri = `/${bucket}/${filename}`;
  const canonicalHeaders =
    [`host:${endpoint}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join(
      "\n"
    ) + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

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
  if (!cid) throw new Error("No CID returned from Filebase");

  return cid;
}

function decodeBase64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function normalizeTrackId(trackId) {
  if (!trackId) throw new Error("trackId required");
  const hex = String(trackId);
  if (!hex.startsWith("0x")) throw new Error(`Invalid trackId: ${trackId}`);
  return ethers.utils.hexZeroPad(hex, 32).toLowerCase();
}

// ============================================================
// ABI (ScrobbleV4)
// ============================================================

const SCROBBLE_V4_ABI = [
  "function setTrackCoverBatch(bytes32[] trackIds, string[] coverCids) external",
  "function getTrack(bytes32 trackId) external view returns (string title, string artist, string album, uint8 kind, bytes32 payload, uint64 registeredAt, string coverCid)",
];

// ============================================================
// TX SIGN + BROADCAST
// ============================================================

async function signAndBroadcast(unsignedTx, label) {
  const txHash = ethers.utils.keccak256(
    ethers.utils.serializeTransaction(unsignedTx)
  );

  const sigResult = await Lit.Actions.signAndCombineEcdsa({
    toSign: Array.from(ethers.utils.arrayify(txHash)),
    publicKey: SPONSOR_PKP_PUBLIC_KEY,
    sigName: `sponsor_${label}`,
  });

  if (typeof sigResult === "string" && sigResult.startsWith("[ERROR]")) {
    throw new Error(`PKP signing failed (${label}): ${sigResult}`);
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

  const broadcastResult = await Lit.Actions.runOnce(
    { waitForResponse: true, name: `broadcast_${label}` },
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
    throw new Error(`Broadcast runOnce failed (${label}): ${broadcastResult}`);
  }

  const broadcast = JSON.parse(broadcastResult);
  if (broadcast.broadcastError) {
    throw new Error(`TX broadcast failed (${label}): ${broadcast.broadcastError} (code: ${broadcast.code})`);
  }

  return broadcast;
}

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      tracks,
      timestamp,
      nonce,
      filebaseEncryptedKey,
      filebasePlaintextKey,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(tracks, "tracks");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);

    // ========================================
    // STEP 1: Sign + verify user message
    // ========================================
    const tracksHash = await sha256Hex(JSON.stringify(tracks));
    const message = `heaven:track-cover:${tracksHash}:${timestamp}:${nonce}`;

    const msgHash = ethers.utils.hashMessage(message);
    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(msgHash)),
      publicKey: userPkpPublicKey,
      sigName: "user_track_cover_sig",
    });

    if (typeof sigResult === "string" && sigResult.startsWith("[ERROR]")) {
      throw new Error(`User PKP signing failed: ${sigResult}`);
    }

    const sigObj = JSON.parse(sigResult);
    let userV = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
    if (userV === 0 || userV === 1) userV += 27;
    const signature = ethers.utils.joinSignature({
      r: `0x${strip0x(sigObj.r)}`,
      s: `0x${strip0x(sigObj.s)}`,
      v: userV,
    });

    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(
        `Sign mismatch: recovered ${recovered}, expected ${userAddress}`
      );
    }

    // ========================================
    // STEP 2: Upload covers (if needed)
    // ========================================
    const coverCache = new Map();
    const uploadedCoverCids = {};
    const resolvedCoverCids = {};
    const trackInfos = tracks.map((t) => ({
      trackId: normalizeTrackId(t.trackId),
      coverCid: (t.coverCid || "").slice(0, 128),
      coverImage: t.coverImage || null,
    }));

    // Check if covers already exist on-chain to avoid duplicate uploads
    for (const t of trackInfos) {
      if (t.coverCid) {
        resolvedCoverCids[t.trackId] = t.coverCid;
        continue;
      }
      try {
        const checkCoverJson = await Lit.Actions.runOnce(
          { waitForResponse: true, name: `checkCover_${t.trackId.slice(2, 10)}` },
          async () => {
            const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
            const c = new ethers.Contract(SCROBBLE_V4, SCROBBLE_V4_ABI, provider);
            const track = await c.getTrack(t.trackId);
            return JSON.stringify({ coverCid: track.coverCid || "" });
          }
        );
        const existingCover = JSON.parse(checkCoverJson).coverCid || "";
        if (existingCover) {
          t.coverCid = existingCover;
          resolvedCoverCids[t.trackId] = existingCover;
        }
      } catch {
        // Track might not be registered yet
      }
    }

    const needsCoverUpload = trackInfos.some((t) => !t.coverCid && t.coverImage);
    let filebaseKey = null;
    if (needsCoverUpload) {
      if (filebasePlaintextKey) {
        filebaseKey = filebasePlaintextKey;
      } else if (filebaseEncryptedKey) {
        filebaseKey = await Lit.Actions.decryptAndCombine({
          accessControlConditions: filebaseEncryptedKey.accessControlConditions,
          ciphertext: filebaseEncryptedKey.ciphertext,
          dataToEncryptHash: filebaseEncryptedKey.dataToEncryptHash,
          authSig: null,
          chain: "ethereum",
        });
      } else {
        throw new Error("filebaseEncryptedKey or filebasePlaintextKey is required for cover uploads");
      }
    }

    for (const t of trackInfos) {
      if (t.coverCid || !t.coverImage) continue;

      const base64 = t.coverImage.base64;
      const contentType = (t.coverImage.contentType || "").split(";")[0].trim().toLowerCase();
      if (!base64 || !contentType || !ALLOWED_IMAGE_TYPES.includes(contentType)) continue;

      const bytes = decodeBase64ToBytes(base64);
      if (bytes.byteLength > MAX_COVER_BYTES) continue;

      const hash = await sha256HexFromBuffer(bytes);
      if (coverCache.has(hash)) {
        const cachedCid = coverCache.get(hash);
        t.coverCid = cachedCid;
        uploadedCoverCids[t.trackId] = cachedCid;
        resolvedCoverCids[t.trackId] = cachedCid;
        continue;
      }

      const ext = contentType.split("/")[1] || "jpg";
      const objectKey = `covers/${hash}.${ext}`;
      const cid = await Lit.Actions.runOnce(
        { waitForResponse: true, name: `uploadCover_${hash.slice(0, 8)}` },
        async () => {
          return await uploadToFilebase(filebaseKey, bytes, contentType, objectKey);
        }
      );
      coverCache.set(hash, cid);
      t.coverCid = cid;
      uploadedCoverCids[t.trackId] = cid;
      resolvedCoverCids[t.trackId] = cid;
    }

    // ========================================
    // STEP 3: Set covers on-chain (best-effort)
    // ========================================
    const coverSeen = new Set();
    const coverTrackIds = [];
    const coverCids = [];

    for (const t of trackInfos) {
      if (!t.coverCid || coverSeen.has(t.trackId)) continue;
      coverSeen.add(t.trackId);
      coverTrackIds.push(t.trackId);
      coverCids.push(t.coverCid);
    }

    let coverTxHash = null;
    if (coverTrackIds.length > 0) {
      const iface = new ethers.utils.Interface(SCROBBLE_V4_ABI);
      const coverTxData = iface.encodeFunctionData("setTrackCoverBatch", [
        coverTrackIds,
        coverCids,
      ]);

      const coverNonceJson = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "getCoverTxNonce" },
        async () => {
          const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
          const n = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
          return JSON.stringify({ nonce: n.toString() });
        }
      );
      const coverTxNonce = Number(JSON.parse(coverNonceJson).nonce);

      const coverResult = await signAndBroadcast({
        type: 0,
        chainId: CHAIN_ID,
        nonce: toBigNumber(coverTxNonce, "nonce"),
        to: SCROBBLE_V4,
        data: coverTxData,
        gasLimit: toBigNumber(GAS_LIMIT, "gasLimit"),
        gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
        value: 0,
      }, "setTrackCoverV4");
      coverTxHash = coverResult.txHash;
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "track-cover-v4",
        user: userAddress.toLowerCase(),
        coversSet: coverTrackIds.length,
        coverTxHash,
        coverCids: resolvedCoverCids,
        coverCid: Object.values(resolvedCoverCids)[0] || null,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "track-cover-v4",
      }),
    });
  }
};

main();
