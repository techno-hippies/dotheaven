/**
 * Scrobble Submit v3
 *
 * Track Registry + Scrobble Events on MegaETH via ScrobbleV3.
 * Tracks are registered once (title/artist/album stored on-chain).
 * Scrobbles are cheap event-only references to a trackId.
 *
 * trackId = keccak256(abi.encode(uint8(kind), bytes32(payload)))
 *   kind 1 (MBID):  payload = bytes32(bytes16(mbid))
 *   kind 2 (ipId):  payload = bytes32(uint256(uint160(ipId)))
 *   kind 3 (meta):  payload = keccak256(abi.encode(titleNorm, artistNorm, albumNorm))
 *
 * Flow:
 * 1. Verify EIP-191 signature over tracks digest
 * 2. Compute (kind, payload, trackId) for each track
 * 3. Check which tracks need registration via isRegistered()
 * 4. Sponsor PKP broadcasts registerAndScrobbleBatch() on MegaETH
 * 5. Return tx hash + registration/scrobble counts
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - tracks: Array of { playedAt, mbid?, ipId?, artist?, title?, album?, coverCid?, coverImage? }
 * - filebaseEncryptedKey or filebasePlaintextKey (required if coverImage provided)
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * Action signs the message internally using the user's PKP (single executeJs).
 *
 * Returns: { success, version, user, count, txHash, registered, scrobbled, coversSet, coverTxHash }
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const CHAIN_ID = 6343;
const RPC_URL = "https://carrot.megaeth.com/rpc";

// ScrobbleV3 contract (MegaETH Testnet)
const SCROBBLE_V3 = "0x144c450cd5B641404EEB5D5eD523399dD94049E0";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

// MegaETH gas config (legacy type 0 txs, ~0.001 gwei)
const GAS_PRICE = "1000000";
const GAS_LIMIT = "12000000"; // register + scrobble in one tx

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

/** Normalize string for trackId derivation: lowercase, trim, collapse whitespace */
function normalize(s) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
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

  const payloadHash = await sha256HexFromBuffer(content);

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

function decodeBase64ToBytes(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

// ============================================================
// ABI (ScrobbleV3)
// ============================================================

const SCROBBLE_V3_ABI = [
  "function registerAndScrobbleBatch(address user, uint8[] regKinds, bytes32[] regPayloads, string[] titles, string[] artists, string[] albums, bytes32[] trackIds, uint64[] timestamps) external",
  "function isRegistered(bytes32 trackId) external view returns (bool)",
  "function getTrack(bytes32 trackId) external view returns (string title, string artist, string album, uint8 kind, bytes32 payload, uint64 registeredAt, string coverCid)",
  "function setTrackCoverBatch(bytes32[] trackIds, string[] coverCids) external",
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
// TRACK ID COMPUTATION
// ============================================================

/**
 * Compute (kind, payload, trackId) for a track.
 *
 * kind 1 (MBID): payload = bytes32(bytes16(mbid)), left-aligned
 * kind 2 (ipId): payload = bytes32(uint256(uint160(ipId))), right-aligned
 * kind 3 (meta): payload = keccak256(abi.encode(titleNorm, artistNorm, albumNorm))
 *
 * trackId = keccak256(abi.encode(uint8(kind), bytes32(payload)))
 */
function computeTrackInfo(track) {
  const coder = ethers.utils.defaultAbiCoder;

  if (track.mbid) {
    const kind = 1;
    // Convert UUID to bytes16 left-aligned in bytes32
    const hex = track.mbid.replace(/-/g, "").toLowerCase();
    if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error(`Invalid MBID: ${track.mbid}`);
    }
    // bytes16 left-aligned = hex + 32 zero chars (16 zero bytes)
    const payload = "0x" + hex + "0".repeat(32);
    const trackId = ethers.utils.keccak256(
      coder.encode(["uint8", "bytes32"], [kind, payload])
    );
    return { kind, payload, trackId };
  }

  if (track.ipId) {
    const kind = 2;
    if (!track.ipId.startsWith("0x") || track.ipId.length !== 42) {
      throw new Error(`Invalid ipId: ${track.ipId}`);
    }
    // address right-aligned = bytes32(uint256(uint160(address)))
    const payload = ethers.utils.hexZeroPad(track.ipId.toLowerCase(), 32);
    const trackId = ethers.utils.keccak256(
      coder.encode(["uint8", "bytes32"], [kind, payload])
    );
    return { kind, payload, trackId };
  }

  // Meta kind
  const kind = 3;
  if (!track.artist || !track.title) {
    throw new Error("Tracks without mbid/ipId must have artist + title");
  }
  const titleNorm = normalize(track.title);
  const artistNorm = normalize(track.artist);
  const albumNorm = normalize(track.album || "");

  // payload = keccak256(abi.encode(titleNorm, artistNorm, albumNorm))
  const payload = ethers.utils.keccak256(
    coder.encode(["string", "string", "string"], [titleNorm, artistNorm, albumNorm])
  );
  const trackId = ethers.utils.keccak256(
    coder.encode(["uint8", "bytes32"], [kind, payload])
  );
  return { kind, payload, trackId };
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
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(tracks, "tracks");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    if (!Array.isArray(tracks) || tracks.length === 0) {
      throw new Error("tracks must be a non-empty array");
    }
    if (tracks.length > 200) {
      throw new Error("Maximum 200 tracks per batch");
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
    // STEP 2: Compute trackId for each track
    // ========================================
    const trackInfos = tracks.map((t) => {
      if (!t.playedAt || typeof t.playedAt !== "number") {
        throw new Error("Each track must have playedAt (unix timestamp)");
      }
      const info = computeTrackInfo(t);
      return {
        ...info,
        // Pretty display strings (original casing)
        title: (t.title || "").slice(0, 128),
        artist: (t.artist || "").slice(0, 128),
        album: (t.album || "").slice(0, 128),
        coverCid: (t.coverCid || "").slice(0, 128),
        coverImage: t.coverImage || null,
        playedAt: t.playedAt,
      };
    });

    // ========================================
    // STEP 3: Sign (or verify) user message
    // ========================================
    const tracksHash = await sha256Hex(JSON.stringify(tracks));
    const message = `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`;

    const msgHash = ethers.utils.hashMessage(message);
    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(msgHash)),
      publicKey: userPkpPublicKey,
      sigName: "user_scrobble_sig",
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
    // STEP 4: Check which tracks need registration
    // ========================================
    // Check registration status + existing covers for tracks that have a coverCid
    const registrationCheck = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkRegistered" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(SCROBBLE_V3, SCROBBLE_V3_ABI, provider);

        // Deduplicate trackIds
        const uniqueIds = [...new Set(trackInfos.map((t) => t.trackId))];
        const results = {};
        const covers = {}; // trackId -> existing coverCid (empty string if none)
        for (const id of uniqueIds) {
          try {
            results[id] = await contract.isRegistered(id);
            // For registered tracks, check if cover already set
            if (results[id]) {
              const track = await contract.getTrack(id);
              covers[id] = track.coverCid || "";
            }
          } catch {
            results[id] = false;
          }
        }
        return JSON.stringify({ registered: results, covers });
      }
    );

    const { registered, covers } = JSON.parse(registrationCheck);

    // ========================================
    // STEP 5: Upload covers (if needed)
    // ========================================
    const uploadedCoverCids = {};
    const coverCache = new Map();
    const needsCoverUpload = trackInfos.some((t) => !t.coverCid && t.coverImage && !(covers[t.trackId] && covers[t.trackId].length > 0));

    let filebaseKey = null;
    if (needsCoverUpload) {
      const { filebaseEncryptedKey, filebasePlaintextKey } = jsParams || {};
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
      const existingCover = covers[t.trackId];
      if (existingCover && existingCover.length > 0) continue;

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
        continue;
      }

      try {
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
      } catch {
        // best-effort: skip cover on upload failure
      }
    }

    // Split into: tracks needing registration vs already registered
    const seen = new Set();
    const regKinds = [];
    const regPayloads = [];
    const regTitles = [];
    const regArtists = [];
    const regAlbums = [];

    for (const t of trackInfos) {
      if (!registered[t.trackId] && !seen.has(t.trackId)) {
        seen.add(t.trackId);
        regKinds.push(t.kind);
        regPayloads.push(t.payload);
        regTitles.push(t.title);
        regArtists.push(t.artist);
        regAlbums.push(t.album);
      }
    }

    // All tracks get scrobbled (even if already registered)
    const scrobbleIds = trackInfos.map((t) => t.trackId);
    const scrobbleTimestamps = trackInfos.map((t) => t.playedAt);

    // ========================================
    // STEP 6: Build + broadcast registerAndScrobbleBatch
    // ========================================
    const iface = new ethers.utils.Interface(SCROBBLE_V3_ABI);

    const txData = iface.encodeFunctionData("registerAndScrobbleBatch", [
      userAddress,
      regKinds,
      regPayloads,
      regTitles,
      regArtists,
      regAlbums,
      scrobbleIds,
      scrobbleTimestamps,
    ]);

    // Get nonce
    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxNonce" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const txNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
        return JSON.stringify({ nonce: txNonce.toString() });
      }
    );
    const txNonce = Number(JSON.parse(nonceJson).nonce);

    const result = await signAndBroadcast({
      type: 0,
      chainId: CHAIN_ID,
      nonce: toBigNumber(txNonce, "nonce"),
      to: SCROBBLE_V3,
      data: txData,
      gasLimit: toBigNumber(GAS_LIMIT, "gasLimit"),
      gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
      value: 0,
    }, "registerAndScrobble");

    // ========================================
    // STEP 7: Set covers for tracks that need them
    // ========================================
    // Collect tracks that have a coverCid and whose on-chain cover is empty.
    // Newly registered tracks (no entry in covers{}) also need covers.
    const coverSeen = new Set();
    const coverTrackIds = [];
    const coverCids = [];

    for (const t of trackInfos) {
      if (!t.coverCid || coverSeen.has(t.trackId)) continue;
      coverSeen.add(t.trackId);
      // If track was already registered and already has a cover, skip
      const existingCover = covers[t.trackId];
      if (existingCover && existingCover.length > 0) continue;
      coverTrackIds.push(t.trackId);
      coverCids.push(t.coverCid);
    }

    let coverTxHash = null;
    if (coverTrackIds.length > 0) {
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

      try {
        const coverResult = await signAndBroadcast({
          type: 0,
          chainId: CHAIN_ID,
          nonce: toBigNumber(coverTxNonce, "nonce"),
          to: SCROBBLE_V3,
          data: coverTxData,
          gasLimit: toBigNumber("4000000", "gasLimit"),
          gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
          value: 0,
        }, "setTrackCover");
        coverTxHash = coverResult.txHash;
      } catch (err) {
        // Cover setting is best-effort; don't fail the whole scrobble
      }
    }

    // ========================================
    // DONE
    // ========================================
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "scrobble-submit-v3",
        user: userAddress.toLowerCase(),
        count: tracks.length,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        registered: regKinds.length,
        scrobbled: scrobbleIds.length,
        coversSet: coverTrackIds.length,
        coverTxHash,
        coverCids: uploadedCoverCids,
        coverCid: Object.values(uploadedCoverCids)[0] || null,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "scrobble-submit-v3",
      }),
    });
  }
};

main();
