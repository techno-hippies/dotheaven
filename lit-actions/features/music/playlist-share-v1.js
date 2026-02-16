/**
 * Playlist Share v1
 *
 * Records playlist share/unshare events on MegaETH via PlaylistShareV1.
 *
 * This does NOT grant/revoke per-track decrypt access. Track access is still
 * handled via ContentRegistry (see content-access-v1.js).
 *
 * Operations:
 *   "share"   -> PlaylistShareV1.sharePlaylistFor(owner, playlistId, grantee)
 *   "unshare" -> PlaylistShareV1.unsharePlaylistFor(owner, playlistId, grantee)
 *
 * Signature scheme (EIP-191):
 *   share:   heaven:playlist:share:${playlistId}:${grantee}:${timestamp}:${nonce}
 *   unshare: heaven:playlist:unshare:${playlistId}:${grantee}:${timestamp}:${nonce}
 *
 * Required jsParams:
 * - operation, playlistId, grantee, timestamp, nonce
 * - userPkpPublicKey OR signature (pre-signed)
 *
 * Optional:
 * - playlistV1 (override)
 * - playlistShare (override)
 * - dryRun
 *
 * Returns: { success, version, operation, txHash, blockNumber, user, playlistId, grantee, playlistVersion, trackCount, tracksHash }
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const MEGAETH_CHAIN_ID = 6343;
const MEGAETH_RPC_URL = "https://carrot.megaeth.com/rpc";

// PlaylistV1 contract (MegaETH Testnet)
const PLAYLIST_V1 = "0xF0337C4A335cbB3B31c981945d3bE5B914F7B329";

// PlaylistShareV1 contract (MegaETH Testnet)
const PLAYLIST_SHARE_V1 = "0xb1E233221FB25c65090A75cc60Df5164A2eA4B98";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const SPONSOR_PKP_ADDRESS = "0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455";

// Gas config (legacy type 0 txs)
const MEGAETH_GAS_PRICE = "1000000";
const MEGAETH_GAS_LIMIT = "2000000";

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

async function signTx(unsignedTx, label) {
  const txHash = ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTx));
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
  return { signedTx, txHash };
}

async function broadcastSignedTx(signedTx, rpcUrl, label) {
  const broadcastResult = await Lit.Actions.runOnce(
    { waitForResponse: true, name: `broadcast_${label}` },
    async () => {
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
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
    throw new Error(
      `TX broadcast failed (${label}): ${broadcast.broadcastError} (code: ${broadcast.code})`
    );
  }
  if (broadcast.status !== 1) {
    throw new Error(`TX reverted (${label}): ${broadcast.txHash}`);
  }
  return broadcast;
}

function normalizeBytes32(id, label) {
  try {
    return ethers.utils.hexZeroPad(id, 32).toLowerCase();
  } catch (e) {
    throw new Error(`Invalid ${label}: ${e?.message || String(e)}`);
  }
}

// ============================================================
// ABI
// ============================================================

const PLAYLIST_V1_ABI = [
  "function getPlaylist(bytes32 playlistId) external view returns (address playlistOwner, uint8 visibility, bool exists, uint32 version, uint32 trackCount, uint64 createdAt, uint64 updatedAt, bytes32 tracksHash)",
];

const PLAYLIST_SHARE_ABI = [
  "function sharePlaylistFor(address playlistOwner, bytes32 playlistId, address grantee) external",
  "function unsharePlaylistFor(address playlistOwner, bytes32 playlistId, address grantee) external",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      operation,
      playlistId,
      grantee,
      timestamp,
      nonce,
      signature: preSignedSig,
      playlistV1: playlistV1Override,
      playlistShare: playlistShareOverride,
      dryRun = false,
    } = jsParams || {};

    must(operation, "operation");
    must(playlistId, "playlistId");
    must(grantee, "grantee");
    must(timestamp, "timestamp");
    must(nonce, "nonce");
    if (!preSignedSig) must(userPkpPublicKey, "userPkpPublicKey");

    const op = String(operation);
    const isShare = op === "share";
    const isUnshare = op === "unshare";
    if (!isShare && !isUnshare) throw new Error(`Invalid operation: ${op}`);

    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    const playlistIdNorm = normalizeBytes32(playlistId, "playlistId");
    const granteeAddr = ethers.utils.getAddress(grantee);

    let userAddress;
    if (userPkpPublicKey) {
      userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    }

    const message = `heaven:playlist:${op}:${playlistIdNorm}:${granteeAddr.toLowerCase()}:${timestamp}:${nonce}`;

    // ========================================
    // STEP 1: Verify EIP-191 signature
    // ========================================
    let signature;
    if (preSignedSig) {
      signature = preSignedSig;
    } else {
      const msgHash = ethers.utils.hashMessage(message);
      const sigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(msgHash)),
        publicKey: userPkpPublicKey,
        sigName: "user_playlist_share_sig",
      });
      if (typeof sigResult === "string" && sigResult.startsWith("[ERROR]")) {
        throw new Error(`User PKP signing failed: ${sigResult}`);
      }
      const sigObj = JSON.parse(sigResult);
      let userV = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
      if (userV === 0 || userV === 1) userV += 27;
      signature = ethers.utils.joinSignature({
        r: `0x${strip0x(sigObj.r)}`,
        s: `0x${strip0x(sigObj.s)}`,
        v: userV,
      });
    }

    const recovered = ethers.utils.verifyMessage(message, signature);
    if (userAddress) {
      if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
        throw new Error(`Signature mismatch: recovered ${recovered}, expected ${userAddress}`);
      }
    } else {
      userAddress = recovered;
    }

    // ========================================
    // STEP 2: Verify on-chain playlist ownership + capture snapshot
    // ========================================
    const playlistV1Addr = ethers.utils.getAddress(playlistV1Override || PLAYLIST_V1);
    const playlistInfoJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getPlaylistInfo" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const playlist = new ethers.Contract(playlistV1Addr, PLAYLIST_V1_ABI, provider);
        const res = await playlist.getPlaylist(playlistIdNorm);
        const owner = res[0];
        const exists = res[2];
        const version = res[3];
        const trackCount = res[4];
        const tracksHash = res[7];
        return JSON.stringify({
          owner,
          exists,
          version: version.toString(),
          trackCount: trackCount.toString(),
          tracksHash,
        });
      }
    );
    const playlistInfo = JSON.parse(playlistInfoJson);
    if (!playlistInfo.exists) throw new Error("Playlist not found");
    if (String(playlistInfo.owner || "").toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Not playlist owner");
    }

    // ========================================
    // STEP 3: Build + sign MegaETH tx
    // ========================================
    const shareAddr = ethers.utils.getAddress(playlistShareOverride || PLAYLIST_SHARE_V1);
    if (shareAddr === "0x0000000000000000000000000000000000000000") {
      throw new Error("PlaylistShareV1 address not set");
    }

    const iface = new ethers.utils.Interface(PLAYLIST_SHARE_ABI);
    const fn = isShare ? "sharePlaylistFor" : "unsharePlaylistFor";
    const txData = iface.encodeFunctionData(fn, [userAddress, playlistIdNorm, granteeAddr]);

    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxNonce" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const megaNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
        return JSON.stringify({ megaNonce: megaNonce.toString() });
      }
    );
    const txNonces = JSON.parse(nonceJson);

    const unsignedTx = {
      type: 0,
      chainId: MEGAETH_CHAIN_ID,
      nonce: toBigNumber(txNonces.megaNonce, "megaNonce"),
      to: shareAddr,
      data: txData,
      gasLimit: toBigNumber(MEGAETH_GAS_LIMIT, "gasLimit"),
      gasPrice: toBigNumber(MEGAETH_GAS_PRICE, "gasPrice"),
      value: 0,
    };

    const signed = await signTx(unsignedTx, "playlistShare_mega");

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "playlist-share-v1",
          operation: op,
          megaSignedTx: signed.signedTx,
          user: userAddress.toLowerCase(),
          playlistId: playlistIdNorm,
          grantee: granteeAddr.toLowerCase(),
          playlistVersion: Number(playlistInfo.version || "0"),
          trackCount: Number(playlistInfo.trackCount || "0"),
          tracksHash: playlistInfo.tracksHash || ethers.constants.HashZero,
        }),
      });
      return;
    }

    // ========================================
    // STEP 4: Broadcast MegaETH tx
    // ========================================
    const broadcast = await broadcastSignedTx(signed.signedTx, MEGAETH_RPC_URL, "playlistShare_mega");

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "playlist-share-v1",
        operation: op,
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        user: userAddress.toLowerCase(),
        playlistId: playlistIdNorm,
        grantee: granteeAddr.toLowerCase(),
        playlistVersion: Number(playlistInfo.version || "0"),
        trackCount: Number(playlistInfo.trackCount || "0"),
        tracksHash: playlistInfo.tracksHash || ethers.constants.HashZero,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err?.message || String(err),
        version: "playlist-share-v1",
      }),
    });
  }
};

main();

