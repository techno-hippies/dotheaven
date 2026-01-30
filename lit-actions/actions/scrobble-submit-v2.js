/**
 * Scrobble Submit v2
 *
 * Fully on-chain scrobble pipeline on MegaETH via ScrobbleV2.
 * No IPFS — all data stored on-chain. Read side resolves MBIDs via MusicBrainz.
 *
 * Flow:
 * 1. Verify EIP-191 signature over tracks digest
 * 2. Split tracks into MBID / ipId / metadata buckets
 * 3. Sponsor PKP signs + broadcasts ScrobbleV2 calls on MegaETH
 * 4. Return tx hashes + bucket counts
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - tracks: Array of { playedAt, mbid?, ipId?, artist?, title?, album? }
 *     Each track must have at least one of: mbid, ipId, or (artist + title)
 * - signature: EIP-191 signature over `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 *
 * Returns: { success, version, user, count, txHashes, buckets }
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const CHAIN_ID = 6343;
const RPC_URL = "https://carrot.megaeth.com/rpc";

// ScrobbleV2 contract (MegaETH Testnet) — TODO: update after deploy
const SCROBBLE_V2 = "0xf42b285EEb9280860808fd3bC7b0D6c531EF53bd";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

// MegaETH gas config (legacy type 0 txs, ~0.001 gwei)
const GAS_PRICE = "1000000";
const GAS_LIMIT_ID = "4000000";
const GAS_LIMIT_META = "8000000";

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

// ============================================================
// ABI (ScrobbleV2)
// ============================================================

const SCROBBLE_V2_ABI = [
  "function submitBatchMBID(address user, bytes16[] mbids, uint64[] timestamps) external",
  "function submitBatchIPId(address user, address[] ipIds, uint64[] timestamps) external",
  "function submitBatchMeta(address user, string[] titles, string[] artists, string[] albums, uint64[] timestamps) external",
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
    // STEP 2: Validate tracks + split into buckets
    // ========================================
    const mbidBucket = [];   // { mbid: uuid string, timestamp }
    const ipIdBucket = [];   // { ipId: address, timestamp }
    const metaBucket = [];   // { title, artist, album, timestamp }

    for (const t of tracks) {
      if (!t.playedAt || typeof t.playedAt !== "number") {
        throw new Error("Each track must have playedAt (unix timestamp)");
      }

      if (t.mbid) {
        // Validate UUID format (with or without dashes)
        const hex = String(t.mbid).replace(/-/g, "");
        if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) {
          throw new Error(`Invalid MBID: ${t.mbid}`);
        }
        mbidBucket.push({ mbid: t.mbid, timestamp: t.playedAt });
      } else if (t.ipId) {
        if (!t.ipId.startsWith("0x") || t.ipId.length !== 42) {
          throw new Error(`Invalid ipId: ${t.ipId}`);
        }
        ipIdBucket.push({ ipId: t.ipId, timestamp: t.playedAt });
      } else {
        if (!t.artist || typeof t.artist !== "string") {
          throw new Error("Tracks without mbid/ipId must have artist (string)");
        }
        if (!t.title || typeof t.title !== "string") {
          throw new Error("Tracks without mbid/ipId must have title (string)");
        }
        metaBucket.push({
          title: t.title.slice(0, 128),
          artist: t.artist.slice(0, 128),
          album: t.album ? t.album.slice(0, 128) : "",
          timestamp: t.playedAt,
        });
      }
    }

    const count = tracks.length;

    // ========================================
    // STEP 3: Compute digest + verify signature
    // ========================================
    // Deterministic digest of the tracks array (sorted JSON)
    const tracksHash = await sha256Hex(JSON.stringify(tracks));
    const message = `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`;
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(
        `Invalid signature: recovered ${recovered}, expected ${userAddress}`
      );
    }

    // ========================================
    // STEP 4: Build + broadcast ScrobbleV2 txs
    // ========================================
    const iface = new ethers.utils.Interface(SCROBBLE_V2_ABI);
    const txHashes = {};

    // Get starting nonce
    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxNonce" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const txNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
        return JSON.stringify({ nonce: txNonce.toString() });
      }
    );
    let txNonce = Number(JSON.parse(nonceJson).nonce);

    // MBID batch
    if (mbidBucket.length > 0) {
      const mbids = mbidBucket.map((b) => {
        const hex = b.mbid.replace(/-/g, "").toLowerCase();
        return "0x" + hex;
      });
      const timestamps = mbidBucket.map((b) => b.timestamp);

      const txData = iface.encodeFunctionData("submitBatchMBID", [
        userAddress, mbids, timestamps,
      ]);

      const result = await signAndBroadcast({
        type: 0, chainId: CHAIN_ID,
        nonce: toBigNumber(txNonce, "nonce"),
        to: SCROBBLE_V2, data: txData,
        gasLimit: toBigNumber(GAS_LIMIT_ID, "gasLimit"),
        gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
        value: 0,
      }, "mbid");

      txHashes.mbid = result.txHash;
      txNonce++;
    }

    // ipId batch
    if (ipIdBucket.length > 0) {
      const ipIds = ipIdBucket.map((b) => b.ipId);
      const timestamps = ipIdBucket.map((b) => b.timestamp);

      const txData = iface.encodeFunctionData("submitBatchIPId", [
        userAddress, ipIds, timestamps,
      ]);

      const result = await signAndBroadcast({
        type: 0, chainId: CHAIN_ID,
        nonce: toBigNumber(txNonce, "nonce"),
        to: SCROBBLE_V2, data: txData,
        gasLimit: toBigNumber(GAS_LIMIT_ID, "gasLimit"),
        gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
        value: 0,
      }, "ipid");

      txHashes.ipId = result.txHash;
      txNonce++;
    }

    // Metadata batch
    if (metaBucket.length > 0) {
      const titles = metaBucket.map((b) => b.title);
      const artists = metaBucket.map((b) => b.artist);
      const albums = metaBucket.map((b) => b.album);
      const timestamps = metaBucket.map((b) => b.timestamp);

      const txData = iface.encodeFunctionData("submitBatchMeta", [
        userAddress, titles, artists, albums, timestamps,
      ]);

      const result = await signAndBroadcast({
        type: 0, chainId: CHAIN_ID,
        nonce: toBigNumber(txNonce, "nonce"),
        to: SCROBBLE_V2, data: txData,
        gasLimit: toBigNumber(GAS_LIMIT_META, "gasLimit"),
        gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
        value: 0,
      }, "meta");

      txHashes.meta = result.txHash;
    }

    // ========================================
    // DONE
    // ========================================
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "scrobble-submit-v2",
        user: userAddress.toLowerCase(),
        count,
        txHashes,
        buckets: {
          mbid: mbidBucket.length,
          ipId: ipIdBucket.length,
          meta: metaBucket.length,
        },
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "scrobble-submit-v2",
      }),
    });
  }
};

main();
