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
 * - tracks: Array of { playedAt, mbid?, ipId?, artist?, title?, album? }
 * - signature: EIP-191 signature over `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 *
 * Returns: { success, version, user, count, txHash, registered, scrobbled }
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const CHAIN_ID = 6343;
const RPC_URL = "https://carrot.megaeth.com/rpc";

// ScrobbleV3 contract (MegaETH Testnet)
const SCROBBLE_V3 = "0x3117A73b265b38ad9cD3b37a5F8E1D312Ad29196";

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

// ============================================================
// ABI (ScrobbleV3)
// ============================================================

const SCROBBLE_V3_ABI = [
  "function registerAndScrobbleBatch(address user, uint8[] regKinds, bytes32[] regPayloads, string[] titles, string[] artists, string[] albums, bytes32[] trackIds, uint64[] timestamps) external",
  "function isRegistered(bytes32 trackId) external view returns (bool)",
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
      signature,
      timestamp,
      nonce,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(tracks, "tracks");
    must(signature, "signature");
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
        playedAt: t.playedAt,
      };
    });

    // ========================================
    // STEP 3: Verify signature
    // ========================================
    const tracksHash = await sha256Hex(JSON.stringify(tracks));
    const message = `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`;
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(
        `Invalid signature: recovered ${recovered}, expected ${userAddress}`
      );
    }

    // ========================================
    // STEP 4: Check which tracks need registration
    // ========================================
    const registrationCheck = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkRegistered" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(SCROBBLE_V3, SCROBBLE_V3_ABI, provider);

        // Deduplicate trackIds
        const uniqueIds = [...new Set(trackInfos.map((t) => t.trackId))];
        const results = {};
        for (const id of uniqueIds) {
          try {
            results[id] = await contract.isRegistered(id);
          } catch {
            results[id] = false;
          }
        }
        return JSON.stringify(results);
      }
    );

    const registered = JSON.parse(registrationCheck);

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
    // STEP 5: Build + broadcast registerAndScrobbleBatch
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
