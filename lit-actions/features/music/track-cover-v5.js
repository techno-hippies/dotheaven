/**
 * Track Cover v5 (Arweave/URI-safe)
 *
 * Sets `coverCid` on ScrobbleV4 for tracks. Unlike v4, this action does not upload bytes to Filebase.
 * The client must provide a ready-to-store cover ref (recommended: `ar://<dataitem_id>`).
 *
 * Required jsParams:
 * - userPkpPublicKey: User PKP public key (used for request signing)
 * - tracks: Array<{ trackId, coverCid | coverRef }>
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

async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeTrackId(trackId) {
  if (!trackId) throw new Error("trackId required");
  const hex = String(trackId);
  if (!hex.startsWith("0x")) throw new Error(`Invalid trackId: ${trackId}`);
  return ethers.utils.hexZeroPad(hex, 32).toLowerCase();
}

function isIpfsCid(value) {
  const v = String(value || "").trim();
  return v.startsWith("Qm") || v.startsWith("bafy");
}

function isCoverRef(value) {
  const v = String(value || "").trim();
  return (
    isIpfsCid(v) ||
    v.startsWith("ar://") ||
    v.startsWith("ls3://") ||
    v.startsWith("load-s3://")
  );
}

function normalizeCoverRef(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.startsWith("ipfs://")) {
    const cid = v.slice("ipfs://".length).trim();
    return isIpfsCid(cid) ? cid.slice(0, 128) : "";
  }
  if (isCoverRef(v)) return v.slice(0, 128);
  return "";
}

// ============================================================
// ABI (ScrobbleV4)
// ============================================================

const SCROBBLE_V4_ABI = [
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

  if (typeof broadcastResult !== "string" || broadcastResult.startsWith("[ERROR]")) {
    throw new Error(`Broadcast failed (${label}): ${broadcastResult}`);
  }

  const parsed = JSON.parse(broadcastResult);
  if (parsed.broadcastError) {
    throw new Error(`Broadcast error (${label}): ${parsed.broadcastError}`);
  }
  return parsed;
}

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const { userPkpPublicKey, tracks, timestamp, nonce } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(tracks, "tracks");
    must(timestamp, "timestamp");
    must(nonce, "nonce");
    if (!Array.isArray(tracks) || tracks.length === 0) throw new Error("tracks must be a non-empty array");

    // ========================================
    // STEP 1: Sign + verify user message
    // ========================================
    const tracksHash = await sha256Hex(JSON.stringify(tracks));
    const message = `heaven:track-cover-v5:${tracksHash}:${timestamp}:${nonce}`;

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    const msgHash = ethers.utils.hashMessage(message);
    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(msgHash)),
      publicKey: userPkpPublicKey,
      sigName: "user_track_cover_v5_sig",
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
      throw new Error(`Sign mismatch: recovered ${recovered}, expected ${userAddress}`);
    }

    // ========================================
    // STEP 2: Normalize inputs
    // ========================================
    const trackInfos = tracks.map((t) => ({
      trackId: normalizeTrackId(t.trackId),
      coverCid: normalizeCoverRef(t.coverCid ?? t.coverRef ?? ""),
    })).filter((t) => t.coverCid && t.coverCid.length > 0);

    if (trackInfos.length === 0) {
      Lit.Actions.setResponse({
        response: JSON.stringify({ success: true, version: "track-cover-v5", txHash: null, coverCids: {} }),
      });
      return;
    }

    // ========================================
    // STEP 3: Build + send operator tx
    // ========================================
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const sponsorNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS);

    const iface = new ethers.utils.Interface(SCROBBLE_V4_ABI);
    const trackIds = trackInfos.map((t) => t.trackId);
    const coverCids = trackInfos.map((t) => t.coverCid);
    const data = iface.encodeFunctionData("setTrackCoverBatch", [trackIds, coverCids]);

    const unsignedTx = {
      to: SCROBBLE_V4,
      nonce: sponsorNonce,
      gasLimit: ethers.BigNumber.from(GAS_LIMIT),
      gasPrice: ethers.BigNumber.from(GAS_PRICE),
      data,
      chainId: CHAIN_ID,
      value: 0,
    };

    const receipt = await signAndBroadcast(unsignedTx, "setTrackCoverBatch_v5");

    const coverMap = {};
    for (const t of trackInfos) {
      coverMap[t.trackId] = t.coverCid;
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "track-cover-v5",
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        coverCids: coverMap,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "track-cover-v5",
        error: err?.message || String(err),
      }),
    });
  }
};

main();

