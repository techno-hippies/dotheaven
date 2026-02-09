/**
 * Playlist v1
 *
 * Create, update tracks, update metadata, and delete playlists on MegaETH via PlaylistV1.
 * Orchestrates track registration in ScrobbleV3 (global catalog) before playlist operations.
 *
 * Operations:
 *   "create"     → register missing tracks in ScrobbleV3, then createPlaylistFor(owner, name, coverCid, visibility, trackIds[])
 *   "setTracks"  → register missing tracks in ScrobbleV3, then setTracks(playlistId, trackIds[])
 *   "updateMeta" → updateMeta(playlistId, name, coverCid, visibility)
 *   "delete"     → deletePlaylist(playlistId)
 *
 * Signature scheme (EIP-191):
 *   create:     heaven:playlist:create:${payloadHash}:${timestamp}:${nonce}
 *   setTracks:  heaven:playlist:setTracks:${playlistId}:${payloadHash}:${timestamp}:${nonce}
 *   updateMeta: heaven:playlist:updateMeta:${playlistId}:${payloadHash}:${timestamp}:${nonce}
 *   delete:     heaven:playlist:delete:${playlistId}:${timestamp}:${nonce}
 *
 * payloadHash = SHA-256 of JSON.stringify(payload) where payload varies by op.
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - operation: "create" | "setTracks" | "updateMeta" | "delete"
 * - timestamp: Request timestamp (ms)
 * - nonce: On-chain user nonce from PlaylistV1.userNonces(user) — replay protection
 * - filebaseEncryptedKey or filebasePlaintextKey (required if coverImage provided)
 * Action signs the message internally using the user's PKP (single executeJs).
 *
 * For "create":
 * - name: Playlist name (max 64 bytes)
 * - coverCid: IPFS CID for cover image ("" for deterministic cover)
 * - visibility: 0 (public), 1 (unlisted), 2 (private)
 * - tracks: Array of { mbid?, ipId?, artist, title, album?, coverCid?, coverImage? } — track descriptors
 *
 * For "setTracks":
 * - playlistId: bytes32 playlist ID
 * - tracks: Array of track descriptors (same as create)
 * - existingTrackIds: (optional) Array of bytes32 trackIds already on-chain — prepended to trackIds from tracks[]
 *   This avoids needing to resolve metadata for tracks already in the playlist.
 *
 * For "updateMeta":
 * - playlistId: bytes32 playlist ID
 * - name: New name
 * - coverCid: New cover CID ("" to clear)
 * - visibility: New visibility
 *
 * For "delete":
 * - playlistId: bytes32 playlist ID
 *
 * Returns: { success, version, user, operation, txHash, blockNumber, playlistId?, registered? }
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const CHAIN_ID = 6343;
const RPC_URL = "https://carrot.megaeth.com/rpc";

// PlaylistV1 contract (MegaETH Testnet)
const PLAYLIST_V1 = "0xF0337C4A335cbB3B31c981945d3bE5B914F7B329";

// ScrobbleV3 contract (MegaETH Testnet) — global track catalog
const SCROBBLE_V3 = "0x144c450cd5B641404EEB5D5eD523399dD94049E0";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "041b762c8813a1d9ad63be588846ae6df642110bec9bc2f42a4f06864cad39266b6eaa615c65ce83d2a4b22d14ce72c7b8de3285011831e54c35fd97a923f75ef6";
const SPONSOR_PKP_ADDRESS = "0x7222c04A7C626261D2255Cc40e6Be8BB4Aa8e171";

// MegaETH gas config (legacy type 0 txs, ~0.001 gwei)
const GAS_PRICE = "1000000";
const GAS_LIMIT_REGISTER = "12000000";
const GAS_LIMIT_PLAYLIST = "8000000";

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
// ABI
// ============================================================

const PLAYLIST_V1_ABI = [
  "function createPlaylistFor(address playlistOwner, string name, string coverCid, uint8 visibility, bytes32[] trackIds) external returns (bytes32 playlistId)",
  "function setTracks(bytes32 playlistId, bytes32[] trackIds) external",
  "function updateMeta(bytes32 playlistId, string name, string coverCid, uint8 visibility) external",
  "function deletePlaylist(bytes32 playlistId) external",
  "function consumeNonce(address user, uint256 expectedNonce) external",
  "function userNonces(address user) external view returns (uint256)",
];

const SCROBBLE_V3_ABI = [
  "function registerTracksBatch(uint8[] kinds, bytes32[] payloads, string[] titles, string[] artists, string[] albums) external",
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
          logs: receipt.logs.map((l) => ({
            topics: l.topics,
            data: l.data,
          })),
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
  if (broadcast.status !== 1) {
    throw new Error(`TX reverted (${label}): ${broadcast.txHash}`);
  }

  return broadcast;
}

// ============================================================
// TRACK ID COMPUTATION (same as scrobble-submit-v3)
// ============================================================

/**
 * Compute (kind, payload, trackId) for a track descriptor.
 *
 * kind 1 (MBID): payload = bytes32(bytes16(mbid)), left-aligned
 * kind 2 (ipId): payload = bytes32(uint256(uint160(ipId))), right-aligned
 * kind 3 (meta): payload = keccak256(abi.encode(titleNorm, artistNorm, albumNorm))
 *
 * trackId = keccak256(abi.encode(uint8(kind), bytes32(payload)))
 */
function computeTrackInfo(track) {
  const coder = ethers.utils.defaultAbiCoder;

  // All tracks require title + artist for display metadata
  if (!track.artist || !track.title) {
    throw new Error("All tracks must have artist + title");
  }

  if (track.mbid) {
    const kind = 1;
    const hex = track.mbid.replace(/-/g, "").toLowerCase();
    if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error(`Invalid MBID: ${track.mbid}`);
    }
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
    const payload = ethers.utils.hexZeroPad(track.ipId.toLowerCase(), 32);
    const trackId = ethers.utils.keccak256(
      coder.encode(["uint8", "bytes32"], [kind, payload])
    );
    return { kind, payload, trackId };
  }

  const kind = 3;
  const titleNorm = normalize(track.title);
  const artistNorm = normalize(track.artist);
  const albumNorm = normalize(track.album || "");

  const payload = ethers.utils.keccak256(
    coder.encode(["string", "string", "string"], [titleNorm, artistNorm, albumNorm])
  );
  const trackId = ethers.utils.keccak256(
    coder.encode(["uint8", "bytes32"], [kind, payload])
  );
  return { kind, payload, trackId };
}

// ============================================================
// TRACK REGISTRATION (register missing tracks in ScrobbleV3)
// ============================================================

async function checkRegistrationAndCovers(trackInfos) {
  const registrationCheck = await Lit.Actions.runOnce(
    { waitForResponse: true, name: "checkRegistered" },
    async () => {
      const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(SCROBBLE_V3, SCROBBLE_V3_ABI, provider);

      const uniqueIds = [...new Set(trackInfos.map((t) => t.trackId))];
      const results = {};
      const covers = {};
      for (const id of uniqueIds) {
        try {
          results[id] = await contract.isRegistered(id);
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

  if (typeof registrationCheck === "string" && registrationCheck.startsWith("[ERROR]")) {
    throw new Error(`checkRegistered runOnce failed: ${registrationCheck}`);
  }

  return JSON.parse(registrationCheck);
}

async function ensureTracksRegistered(trackInfos, registered, currentNonce) {
  if (!registered) registered = {};

  // Collect unregistered tracks (deduplicated)
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

  if (regKinds.length === 0) {
    return { registered: 0, nonce: currentNonce };
  }

  // Register missing tracks
  const iface = new ethers.utils.Interface(SCROBBLE_V3_ABI);
  const txData = iface.encodeFunctionData("registerTracksBatch", [
    regKinds,
    regPayloads,
    regTitles,
    regArtists,
    regAlbums,
  ]);

  await signAndBroadcast({
    type: 0,
    chainId: CHAIN_ID,
    nonce: toBigNumber(currentNonce, "nonce"),
    to: SCROBBLE_V3,
    data: txData,
    gasLimit: toBigNumber(GAS_LIMIT_REGISTER, "gasLimit"),
    gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
    value: 0,
  }, "registerTracks");

  return { registered: regKinds.length, nonce: currentNonce + 1 };
}

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      operation,
      timestamp,
      nonce,
      // create / updateMeta
      name,
      coverCid,
      visibility,
      // create / setTracks
      tracks,
      // setTracks (optional): pre-computed trackIds for existing tracks (skip resolve)
      existingTrackIds,
      // setTracks / updateMeta / delete
      playlistId,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(operation, "operation");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    const validOps = ["create", "setTracks", "updateMeta", "delete"];
    if (!validOps.includes(operation)) {
      throw new Error(`Invalid operation: ${operation}. Must be one of: ${validOps.join(", ")}`);
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
    // STEP 1b: Read on-chain user nonce for replay protection
    // ========================================
    const userNonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getUserNonce" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(PLAYLIST_V1, PLAYLIST_V1_ABI, provider);
        const n = await contract.userNonces(userAddress);
        return JSON.stringify({ userNonce: n.toString() });
      }
    );
    if (typeof userNonceJson === "string" && userNonceJson.startsWith("[ERROR]")) {
      throw new Error(`getUserNonce runOnce failed: ${userNonceJson}`);
    }
    const userNonce = JSON.parse(userNonceJson).userNonce;

    // Verify the client-provided nonce matches the on-chain nonce
    if (String(nonce) !== String(userNonce)) {
      throw new Error(`Nonce mismatch: client sent ${nonce}, on-chain expects ${userNonce}`);
    }

    // ========================================
    // STEP 2: Build message + verify signature
    // ========================================
    let message;
    let trackInfos = null;
    let trackIds = null;

    if (operation === "create" || operation === "setTracks") {
      const rawTracks = must(tracks, "tracks");
      if (!Array.isArray(rawTracks)) throw new Error("tracks must be an array");

      // existingTrackIds: pre-computed bytes32 IDs for tracks already on-chain (skip metadata resolve)
      const prefixIds = Array.isArray(existingTrackIds) ? existingTrackIds : [];
      if (rawTracks.length + prefixIds.length > 500) throw new Error("Maximum 500 tracks per playlist");

      trackInfos = rawTracks.map((t) => {
        const info = computeTrackInfo(t);
        return {
          ...info,
          title: (t.title || "").slice(0, 128),
          artist: (t.artist || "").slice(0, 128),
          album: (t.album || "").slice(0, 128),
          coverCid: (t.coverCid || "").slice(0, 128),
          coverImage: t.coverImage || null,
        };
      });
      trackIds = [...prefixIds, ...trackInfos.map((t) => t.trackId)];
    }

    if (operation === "create") {
      must(name, "name");
      const cid = coverCid || "";
      const vis = visibility !== undefined ? Number(visibility) : 0;

      const payload = { name, coverCid: cid, visibility: vis, trackIds };
      const payloadHash = await sha256Hex(JSON.stringify(payload));
      message = `heaven:playlist:create:${payloadHash}:${timestamp}:${nonce}`;
    } else if (operation === "setTracks") {
      must(playlistId, "playlistId");

      const payload = { trackIds };
      const payloadHash = await sha256Hex(JSON.stringify(payload));
      message = `heaven:playlist:setTracks:${playlistId}:${payloadHash}:${timestamp}:${nonce}`;
    } else if (operation === "updateMeta") {
      must(playlistId, "playlistId");
      must(name, "name");
      const cid = coverCid || "";
      const vis = visibility !== undefined ? Number(visibility) : 0;

      const payload = { name, coverCid: cid, visibility: vis };
      const payloadHash = await sha256Hex(JSON.stringify(payload));
      message = `heaven:playlist:updateMeta:${playlistId}:${payloadHash}:${timestamp}:${nonce}`;
    } else if (operation === "delete") {
      must(playlistId, "playlistId");
      message = `heaven:playlist:delete:${playlistId}:${timestamp}:${nonce}`;
    }

    const msgHash = ethers.utils.hashMessage(message);
    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(msgHash)),
      publicKey: userPkpPublicKey,
      sigName: "user_playlist_sig",
    });
    if (typeof sigResult === "string" && sigResult.startsWith("[ERROR]")) {
      throw new Error(`User PKP signing failed: ${sigResult}`);
    }
    const sigObj = JSON.parse(sigResult);
    let userV = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
    if (userV === 0 || userV === 1) userV += 27;
    const finalSignature = ethers.utils.joinSignature({
      r: `0x${strip0x(sigObj.r)}`,
      s: `0x${strip0x(sigObj.s)}`,
      v: userV,
    });

    const recovered = ethers.utils.verifyMessage(message, finalSignature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(
        `Invalid signature: recovered ${recovered}, expected ${userAddress}`
      );
    }

    // ========================================
    // STEP 2b: Check registration + existing covers
    // ========================================
    let registeredMap = {};
    let covers = {};
    if (trackInfos) {
      const check = await checkRegistrationAndCovers(trackInfos);
      registeredMap = check.registered || {};
      covers = check.covers || {};
    }

    // ========================================
    // STEP 3: Get sponsor nonce
    // ========================================
    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxNonce" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const txNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
        return JSON.stringify({ nonce: txNonce.toString() });
      }
    );
    if (typeof nonceJson === "string" && nonceJson.startsWith("[ERROR]")) {
      throw new Error(`getTxNonce runOnce failed: ${nonceJson}`);
    }
    let txNonce = Number(JSON.parse(nonceJson).nonce);

    // ========================================
    // STEP 4: Register missing tracks (create/setTracks only)
    // ========================================
    let registeredCount = 0;
    if (trackInfos) {
      const regResult = await ensureTracksRegistered(trackInfos, registeredMap, txNonce);
      registeredCount = regResult.registered;
      txNonce = regResult.nonce;
    }

    // ========================================
    // STEP 4a: Upload missing covers to Filebase (best-effort)
    // ========================================
    const uploadedCoverCids = {};
    if (trackInfos && trackInfos.length > 0) {
      const needsCoverUpload = trackInfos.some((t) =>
        !t.coverCid && t.coverImage && !(covers[t.trackId] && covers[t.trackId].length > 0)
      );

      let filebaseKey = null;
      if (needsCoverUpload) {
        const { filebaseEncryptedKey, filebasePlaintextKey } = jsParams || {};
        if (filebasePlaintextKey) {
          filebaseKey = filebasePlaintextKey;
        } else if (filebaseEncryptedKey) {
          try {
            filebaseKey = await Lit.Actions.decryptAndCombine({
              accessControlConditions: filebaseEncryptedKey.accessControlConditions,
              ciphertext: filebaseEncryptedKey.ciphertext,
              dataToEncryptHash: filebaseEncryptedKey.dataToEncryptHash,
              authSig: null,
              chain: "ethereum",
            });
          } catch {
            filebaseKey = null;
          }
        }
      }

      const coverCache = new Map();
      for (const t of trackInfos) {
        if (t.coverCid || !t.coverImage) continue;
        const existingCover = covers[t.trackId];
        if (existingCover && existingCover.length > 0) continue;
        if (!filebaseKey) continue;

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
    }

    // ========================================
    // STEP 4b: Consume user nonce (replay protection)
    // ========================================
    const nonceIface = new ethers.utils.Interface(PLAYLIST_V1_ABI);
    const consumeNonceData = nonceIface.encodeFunctionData("consumeNonce", [
      userAddress,
      toBigNumber(userNonce, "userNonce"),
    ]);

    await signAndBroadcast({
      type: 0,
      chainId: CHAIN_ID,
      nonce: toBigNumber(txNonce, "nonce"),
      to: PLAYLIST_V1,
      data: consumeNonceData,
      gasLimit: toBigNumber("500000", "gasLimit"),
      gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
      value: 0,
    }, "consumeNonce");
    txNonce++;

    // ========================================
    // STEP 5: Execute playlist operation
    // ========================================
    const iface = new ethers.utils.Interface(PLAYLIST_V1_ABI);
    let txData;

    if (operation === "create") {
      const cid = coverCid || "";
      const vis = visibility !== undefined ? Number(visibility) : 0;
      txData = iface.encodeFunctionData("createPlaylistFor", [
        userAddress, name, cid, vis, trackIds,
      ]);
    } else if (operation === "setTracks") {
      txData = iface.encodeFunctionData("setTracks", [playlistId, trackIds]);
    } else if (operation === "updateMeta") {
      const cid = coverCid || "";
      const vis = visibility !== undefined ? Number(visibility) : 0;
      txData = iface.encodeFunctionData("updateMeta", [playlistId, name, cid, vis]);
    } else if (operation === "delete") {
      txData = iface.encodeFunctionData("deletePlaylist", [playlistId]);
    }

    const result = await signAndBroadcast({
      type: 0,
      chainId: CHAIN_ID,
      nonce: toBigNumber(txNonce, "nonce"),
      to: PLAYLIST_V1,
      data: txData,
      gasLimit: toBigNumber(GAS_LIMIT_PLAYLIST, "gasLimit"),
      gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
      value: 0,
    }, `playlist_${operation}`);

    // ========================================
    // STEP 6: Extract playlistId from create logs
    // ========================================
    let resultPlaylistId = playlistId || null;
    if (operation === "create" && result.logs) {
      const createdTopic = ethers.utils.id(
        "PlaylistCreated(bytes32,address,uint32,uint8,uint32,bytes32,uint64,string,string)"
      );
      const createdLog = result.logs.find(
        (l) => l.topics && l.topics[0] === createdTopic
      );
      if (createdLog && createdLog.topics[1]) {
        resultPlaylistId = createdLog.topics[1];
      }
    }

    // ========================================
    // STEP 7: Set covers for tracks that need them (best-effort)
    // ========================================
    let coverTxHash = null;
    let coversSet = 0;
    if (trackInfos && trackInfos.length > 0) {
      const coverSeen = new Set();
      const coverTrackIds = [];
      const coverCids = [];

      for (const t of trackInfos) {
        if (!t.coverCid || coverSeen.has(t.trackId)) continue;
        coverSeen.add(t.trackId);
        const existingCover = covers[t.trackId];
        if (existingCover && existingCover.length > 0) continue;
        coverTrackIds.push(t.trackId);
        coverCids.push(t.coverCid);
      }

      coversSet = coverTrackIds.length;

      if (coverTrackIds.length > 0) {
        const coverIface = new ethers.utils.Interface(SCROBBLE_V3_ABI);
        const coverTxData = coverIface.encodeFunctionData("setTrackCoverBatch", [
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
        } catch {
          // best-effort: ignore cover failures
        }
      }
    }

    // ========================================
    // DONE
    // ========================================
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "playlist-v1",
        user: userAddress.toLowerCase(),
        operation,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        ...(resultPlaylistId ? { playlistId: resultPlaylistId } : {}),
        ...(registeredCount > 0 ? { registered: registeredCount } : {}),
        ...(coversSet > 0 ? { coversSet } : {}),
        ...(coverTxHash ? { coverTxHash } : {}),
        ...(Object.keys(uploadedCoverCids).length > 0 ? { coverCids: uploadedCoverCids } : {}),
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "playlist-v1",
      }),
    });
  }
};

main();
