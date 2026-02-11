/**
 * Content Register v2 (decoupled)
 *
 * Registers a Filecoin content entry on ContentRegistry (MegaETH)
 * and mirrors ownership to ContentAccessMirror (Base) for Lit access conditions.
 *
 * This version intentionally does NOT register tracks in ScrobbleV3 and does
 * NOT upload/set cover art. Track registration and cover handling are separate flows.
 *
 * Flow:
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
 *
 * Optional jsParams:
 * - datasetOwner: Beam dataset owner address (defaults to user)
 * - signature: Pre-signed EIP-191 signature
 * - contentRegistry: Override ContentRegistry address
 * - contentAccessMirror: Override ContentAccessMirror address
 * - dryRun: boolean (default false) — skip broadcast, return signed tx
 * - title, artist, album: accepted for backward compatibility, ignored in v2
 *
 * Returns: { success, contentId, txHash, blockNumber, mirrorTxHash }
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
const CONTENT_ACCESS_MIRROR = "0x4dD375b09160d09d4C33312406dFFAFb3f8A5035";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const SPONSOR_PKP_ADDRESS = "0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455";

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

async function signTx(unsignedTx, label, sponsorPublicKey) {
  const txHash = ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTx));

  const sigResult = await Lit.Actions.signAndCombineEcdsa({
    toSign: Array.from(ethers.utils.arrayify(txHash)),
    publicKey: sponsorPublicKey,
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
    if (!preSignedSig) must(userPkpPublicKey, "userPkpPublicKey");

    let userAddress;
    if (userPkpPublicKey) {
      userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    }

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
    const msgDatasetOwner = datasetOwner
      ? ethers.utils.getAddress(datasetOwner).toLowerCase()
      : userAddress
        ? userAddress.toLowerCase()
        : (() => {
            throw new Error("datasetOwner required in pre-signed mode without userPkpPublicKey");
          })();
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

    const datasetOwnerAddr = ethers.utils.getAddress(datasetOwner || userAddress);

    // Compute contentId (matches contract logic)
    const computedContentId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [trackId32, userAddress])
    );

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
    const mirrorData = mirrorIface.encodeFunctionData("registerContent", [userAddress, computedContentId]);

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

    const megaSigned = await signTx(unsignedMegaTx, "registerContent_mega", SPONSOR_PKP_PUBLIC_KEY);
    const baseSigned = await signTx(unsignedBaseTx, "registerContent_base", SPONSOR_PKP_PUBLIC_KEY);

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "content-register-v2",
          user: userAddress.toLowerCase(),
          contentId: computedContentId,
          megaSignedTx: megaSigned.signedTx,
          baseSignedTx: baseSigned.signedTx,
          sponsor: SPONSOR_PKP_ADDRESS,
          contract: registryAddr,
          mirror: mirrorAddr,
        }),
      });
      return;
    }

    // ========================================
    // STEP 4: Broadcast both txs
    // ========================================
    const baseBroadcast = await broadcastSignedTx(baseSigned.signedTx, BASE_RPC_URL, "registerContent_base");

    let megaBroadcast;
    try {
      megaBroadcast = await broadcastSignedTx(megaSigned.signedTx, MEGAETH_RPC_URL, "registerContent_mega");
    } catch (megaErr) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: false,
          error: `MegaETH broadcast failed: ${megaErr.message}`,
          version: "content-register-v2",
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
        version: "content-register-v2",
        user: userAddress.toLowerCase(),
        contentId: computedContentId,
        txHash: megaBroadcast.txHash,
        blockNumber: megaBroadcast.blockNumber,
        mirrorTxHash: baseBroadcast.txHash,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "content-register-v2",
      }),
    });
  }
};

main();
