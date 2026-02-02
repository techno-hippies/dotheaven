/**
 * Content Register v1
 *
 * Registers a Filecoin content entry on ContentRegistry (MegaETH)
 * AND mirrors ownership to ContentAccessMirror (Base) for Lit access conditions.
 *
 * Dual-broadcast flow:
 * 1. Verify EIP-191 signature (trackId + pieceCid hash + datasetOwner + algo + timestamp + nonce)
 * 2. Sponsor PKP broadcasts registerContentFor() on MegaETH
 * 3. Sponsor PKP broadcasts registerContent() on Base mirror
 * 4. Return contentId + tx hashes
 *
 * Required jsParams:
 * - userPkpPublicKey: User PKP public key
 * - trackId: bytes32 hex string
 * - pieceCid: bytes (0x...) or utf8 string (stored as bytes)
 * - algo: uint8 (encryption algorithm enum)
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - title: Track title (for ScrobbleV3 registration)
 * - artist: Track artist (for ScrobbleV3 registration)
 *
 * Optional jsParams:
 * - album: Track album (defaults to "")
 * - datasetOwner: Beam dataset owner address (defaults to user)
 * - signature: Pre-signed EIP-191 signature
 * - contentRegistry: Override ContentRegistry address
 * - contentAccessMirror: Override ContentAccessMirror address
 * - dryRun: boolean (default false) — skip broadcast, return signed tx
 *
 * Returns: { success, contentId, txHash, blockNumber, mirrorTxHash, trackRegistered }
 */

// ============================================================
// CONSTANTS
// ============================================================

// MegaETH Testnet
const MEGAETH_CHAIN_ID = 6343;
const MEGAETH_RPC_URL = "https://carrot.megaeth.com/rpc";
const CONTENT_REGISTRY = "0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2";

// Base Sepolia
const BASE_CHAIN_ID = 84532;
const BASE_RPC_URL = "https://sepolia.base.org";
const CONTENT_ACCESS_MIRROR = "0x872E8E7E4a4088F41CeB0ccc14a7081D36aF5aa4";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

// MegaETH gas config (legacy type 0 txs, ~0.001 gwei)
const MEGAETH_GAS_PRICE = "1000000";
const MEGAETH_GAS_LIMIT = "2000000";

// Base gas config (EIP-1559)
const BASE_GAS_LIMIT = "200000";

const MAX_CID = 128;

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

function toBytes(input, label) {
  if (input === undefined || input === null) throw new Error(`${label} is required`);
  if (input instanceof Uint8Array) return input;
  if (typeof input !== "string") throw new Error(`${label} must be bytes or string`);
  if (input.startsWith("0x")) return ethers.utils.arrayify(input);
  return new TextEncoder().encode(input);
}

async function sha256HexFromBytes(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signTx(unsignedTx, label) {
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
    throw new Error(`TX broadcast failed (${label}): ${broadcast.broadcastError} (code: ${broadcast.code})`);
  }

  return broadcast;
}

// ============================================================
// ABI
// ============================================================

const SCROBBLE_V3 = "0x144c450cd5B641404EEB5D5eD523399dD94049E0";

const SCROBBLE_V3_ABI = [
  "function isRegistered(bytes32 trackId) external view returns (bool)",
  "function registerTracksBatch(uint8[] kinds, bytes32[] payloads, string[] titles, string[] artists, string[] albums) external",
];

const CONTENT_REGISTRY_ABI = [
  "function registerContentFor(address contentOwner, bytes32 trackId, address datasetOwner, bytes pieceCid, uint8 algo) external",
];

const CONTENT_ACCESS_MIRROR_ABI = [
  "function registerContent(address _owner, bytes32 contentId) external",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      trackId,
      pieceCid,
      datasetOwner,
      algo,
      timestamp,
      nonce,
      title,
      artist,
      album = "",
      signature: preSignedSig,
      contentRegistry: contentRegistryOverride,
      contentAccessMirror: contentAccessMirrorOverride,
      dryRun = false,
    } = jsParams || {};

    must(trackId, "trackId");
    must(pieceCid, "pieceCid");
    must(algo, "algo");
    must(timestamp, "timestamp");
    must(nonce, "nonce");
    must(title, "title");
    must(artist, "artist");
    if (!preSignedSig) must(userPkpPublicKey, "userPkpPublicKey");

    let userAddress;
    if (userPkpPublicKey) {
      userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    }
    let datasetOwnerAddr;

    const registryAddr = ethers.utils.getAddress(contentRegistryOverride || CONTENT_REGISTRY);
    if (registryAddr === "0x0000000000000000000000000000000000000000") {
      throw new Error("ContentRegistry address not set");
    }

    const mirrorAddr = ethers.utils.getAddress(contentAccessMirrorOverride || CONTENT_ACCESS_MIRROR);
    if (mirrorAddr === "0x0000000000000000000000000000000000000000") {
      throw new Error("ContentAccessMirror address not set");
    }

    // Validate timestamp freshness
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    const trackId32 = ethers.utils.hexZeroPad(trackId, 32).toLowerCase();
    const pieceBytes = toBytes(pieceCid, "pieceCid");
    if (pieceBytes.length === 0) throw new Error("pieceCid is empty");
    if (pieceBytes.length > MAX_CID) throw new Error("pieceCid too long");

    const pieceCidHash = await sha256HexFromBytes(pieceBytes);
    const algoNum = Number(algo);

    // ========================================
    // STEP 1: Verify EIP-191 signature
    // ========================================
    // For message construction, use datasetOwner param or userAddress (if known)
    const msgDatasetOwner = datasetOwner
      ? ethers.utils.getAddress(datasetOwner).toLowerCase()
      : userAddress
        ? userAddress.toLowerCase()
        : (() => { throw new Error("datasetOwner required in pre-signed mode without userPkpPublicKey"); })();
    const message = `heaven:content:register:${trackId32}:${pieceCidHash}:${msgDatasetOwner}:${algoNum}:${timestamp}:${nonce}`;

    let signature;
    if (preSignedSig) {
      signature = preSignedSig;
    } else {
      const msgHash = ethers.utils.hashMessage(message);
      const sigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(msgHash)),
        publicKey: userPkpPublicKey,
        sigName: "user_content_register_sig",
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
    datasetOwnerAddr = ethers.utils.getAddress(datasetOwner || userAddress);

    // Compute contentId (matches contract logic)
    const computedContentId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [trackId32, userAddress])
    );

    // ========================================
    // STEP 1b: Register track in ScrobbleV3 (if not already registered)
    // ========================================
    // ScrobbleV3 is the canonical track registry. Every uploaded track should
    // have its metadata (title/artist/album) registered on-chain so subgraphs
    // and other consumers can resolve human-readable names from trackId.
    let trackRegistered = false;
    const scrobbleContract = new ethers.Contract(SCROBBLE_V3, SCROBBLE_V3_ABI);

    const isRegJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkTrackRegistered" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const c = scrobbleContract.connect(provider);
        const registered = await c.isRegistered(trackId32);
        return JSON.stringify({ registered });
      }
    );
    const isRegResult = JSON.parse(isRegJson);

    if (!isRegResult.registered) {
      // Derive kind + payload for the track (kind 3 = metadata hash)
      const titleNorm = (title || "").toLowerCase().trim().replace(/\s+/g, " ");
      const artistNorm = (artist || "").toLowerCase().trim().replace(/\s+/g, " ");
      const albumNorm = (album || "").toLowerCase().trim().replace(/\s+/g, " ");

      const metaPayload = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["string", "string", "string"],
          [titleNorm, artistNorm, albumNorm]
        )
      );
      const kind = 3; // metadata hash

      const regIface = new ethers.utils.Interface(SCROBBLE_V3_ABI);
      const regData = regIface.encodeFunctionData("registerTracksBatch", [
        [kind],
        [metaPayload],
        [title],
        [artist],
        [album],
      ]);

      // Get nonce for track registration tx
      const regNonceJson = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "getRegNonce" },
        async () => {
          const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
          const n = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
          return JSON.stringify({ nonce: n.toString() });
        }
      );
      const regNonceResult = JSON.parse(regNonceJson);

      const unsignedRegTx = {
        type: 0,
        chainId: MEGAETH_CHAIN_ID,
        nonce: toBigNumber(regNonceResult.nonce, "regNonce"),
        to: SCROBBLE_V3,
        data: regData,
        gasLimit: toBigNumber("2000000", "gasLimit"),
        gasPrice: toBigNumber(MEGAETH_GAS_PRICE, "gasPrice"),
        value: 0,
      };

      const regSigned = await signTx(unsignedRegTx, "registerTrack_mega");
      if (!dryRun) {
        await broadcastSignedTx(regSigned.signedTx, MEGAETH_RPC_URL, "registerTrack_mega");
        trackRegistered = true;
      }
    }

    // ========================================
    // STEP 2: Build + sign MegaETH tx
    // ========================================
    const iface = new ethers.utils.Interface(CONTENT_REGISTRY_ABI);
    const txData = iface.encodeFunctionData("registerContentFor", [
      userAddress,
      trackId32,
      datasetOwnerAddr,
      ethers.utils.hexlify(pieceBytes),
      algoNum,
    ]);

    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxNonces" },
      async () => {
        const megaProvider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const baseProvider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);
        const [megaNonce, baseNonce] = await Promise.all([
          megaProvider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending"),
          baseProvider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending"),
        ]);
        return JSON.stringify({
          megaNonce: megaNonce.toString(),
          baseNonce: baseNonce.toString(),
        });
      }
    );
    const nonces = JSON.parse(nonceJson);
    const megaTxNonce = Number(nonces.megaNonce);
    const baseTxNonce = Number(nonces.baseNonce);

    const unsignedMegaTx = {
      type: 0,
      chainId: MEGAETH_CHAIN_ID,
      nonce: toBigNumber(megaTxNonce, "megaNonce"),
      to: registryAddr,
      data: txData,
      gasLimit: toBigNumber(MEGAETH_GAS_LIMIT, "gasLimit"),
      gasPrice: toBigNumber(MEGAETH_GAS_PRICE, "gasPrice"),
      value: 0,
    };

    // ========================================
    // STEP 3: Build + sign Base mirror tx
    // ========================================
    const mirrorIface = new ethers.utils.Interface(CONTENT_ACCESS_MIRROR_ABI);
    const mirrorData = mirrorIface.encodeFunctionData("registerContent", [
      userAddress,
      computedContentId,
    ]);

    // Get Base gas price
    const baseFeeJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getBaseFee" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);
        const feeData = await provider.getFeeData();
        return JSON.stringify({
          maxFeePerGas: feeData.maxFeePerGas?.toString() || "100000000",
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || "1000000",
        });
      }
    );
    const baseFee = JSON.parse(baseFeeJson);

    const unsignedBaseTx = {
      type: 2,
      chainId: BASE_CHAIN_ID,
      nonce: toBigNumber(baseTxNonce, "baseNonce"),
      to: mirrorAddr,
      data: mirrorData,
      gasLimit: toBigNumber(BASE_GAS_LIMIT, "gasLimit"),
      maxFeePerGas: toBigNumber(baseFee.maxFeePerGas, "maxFeePerGas"),
      maxPriorityFeePerGas: toBigNumber(baseFee.maxPriorityFeePerGas, "maxPriorityFeePerGas"),
      value: 0,
    };

    // Sign both txs
    const megaSigned = await signTx(unsignedMegaTx, "registerContent_mega");
    const baseSigned = await signTx(unsignedBaseTx, "registerContent_base");

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "content-register-v1",
          user: userAddress.toLowerCase(),
          contentId: computedContentId,
          megaSignedTx: megaSigned.signedTx,
          baseSignedTx: baseSigned.signedTx,
          contract: registryAddr,
          mirror: mirrorAddr,
        }),
      });
      return;
    }

    // ========================================
    // STEP 4: Broadcast both txs
    // ========================================
    // Base first — it's the Lit access-condition gate. If it fails we haven't
    // committed to MegaETH yet, so the caller can safely retry.
    const baseBroadcast = await broadcastSignedTx(baseSigned.signedTx, BASE_RPC_URL, "registerContent_base");

    let megaBroadcast;
    try {
      megaBroadcast = await broadcastSignedTx(megaSigned.signedTx, MEGAETH_RPC_URL, "registerContent_mega");
    } catch (megaErr) {
      // Base succeeded but MegaETH failed — return partial success so client
      // knows the mirror is live and can retry the MegaETH registration.
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: false,
          error: `MegaETH broadcast failed: ${megaErr.message}`,
          version: "content-register-v1",
          mirrorTxHash: baseBroadcast.txHash,
          contentId: computedContentId,
          user: userAddress.toLowerCase(),
        }),
      });
      return;
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "content-register-v1",
        user: userAddress.toLowerCase(),
        contentId: computedContentId,
        txHash: megaBroadcast.txHash,
        blockNumber: megaBroadcast.blockNumber,
        mirrorTxHash: baseBroadcast.txHash,
        trackRegistered,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "content-register-v1",
      }),
    });
  }
};

main();
