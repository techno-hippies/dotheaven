/**
 * Content Access v1
 *
 * Grants/revokes access to content entries on ContentRegistry (MegaETH)
 * AND mirrors state to ContentAccessMirror (Base) for Lit access conditions.
 *
 * Dual-broadcast: MegaETH (source of truth) + Base (Lit condition target).
 * Base mirror failure is non-fatal — can be retried/synced later.
 *
 * Operations:
 *   "grant"       → grantAccessFor (MegaETH) + grantAccess (Base)
 *   "revoke"      → revokeAccessFor (MegaETH) + revokeAccess (Base)
 *   "grantBatch"  → grantAccessBatchFor (MegaETH) + grantAccessBatch (Base)
 *   "revokeBatch" → revokeAccessBatchFor (MegaETH) + revokeAccessBatch (Base)
 *   "deactivate"  → deactivateFor (MegaETH) + deactivate (Base)
 *
 * Required jsParams:
 * - operation, timestamp, nonce
 * - userPkpPublicKey OR signature (pre-signed)
 *
 * For grant/revoke: contentId, grantee
 * For grantBatch/revokeBatch: contentIds, grantee
 * For deactivate: contentId
 *
 * Optional: contentRegistry, contentAccessMirror, dryRun
 *
 * Returns: { success, operation, txHash, blockNumber, mirrorTxHash }
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
const CONTENT_ACCESS_MIRROR = "0xd4D3baB38a11D72e36F49a73D50Dbdc3c1Aa4e9A";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "041b762c8813a1d9ad63be588846ae6df642110bec9bc2f42a4f06864cad39266b6eaa615c65ce83d2a4b22d14ce72c7b8de3285011831e54c35fd97a923f75ef6";
const SPONSOR_PKP_ADDRESS = "0x7222c04A7C626261D2255Cc40e6Be8BB4Aa8e171";

// Gas config
const MEGAETH_GAS_PRICE = "1000000";
const MEGAETH_GAS_LIMIT_SINGLE = "2000000";
const MEGAETH_GAS_LIMIT_BATCH = "8000000";
const BASE_GAS_LIMIT_SINGLE = "200000";
const BASE_GAS_LIMIT_BATCH = "500000";

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

function normalizeContentId(id) {
  return ethers.utils.hexZeroPad(id, 32).toLowerCase();
}

// ============================================================
// ABI
// ============================================================

const CONTENT_REGISTRY_ABI = [
  "function getContent(bytes32 contentId) external view returns (address owner, address datasetOwner, bytes pieceCid, uint8 algo, uint64 createdAt, bool active)",
  "function grantAccessFor(address contentOwner, bytes32 contentId, address user) external",
  "function revokeAccessFor(address contentOwner, bytes32 contentId, address user) external",
  "function grantAccessBatchFor(address contentOwner, bytes32[] contentIds, address user) external",
  "function revokeAccessBatchFor(address contentOwner, bytes32[] contentIds, address user) external",
  "function deactivateFor(address contentOwner, bytes32 contentId) external",
];

const MIRROR_ABI = [
  "function grantAccess(bytes32 contentId, address user) external",
  "function grantAccessBatch(bytes32[] contentIds, address user) external",
  "function revokeAccess(bytes32 contentId, address user) external",
  "function revokeAccessBatch(bytes32[] contentIds, address user) external",
  "function deactivate(bytes32 contentId) external",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      operation,
      contentId,
      contentIds,
      grantee,
      timestamp,
      nonce,
      signature: preSignedSig,
      contentRegistry: contentRegistryOverride,
      contentAccessMirror: contentAccessMirrorOverride,
      dryRun = false,
    } = jsParams || {};

    must(operation, "operation");
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

    const op = String(operation);
    const isGrant = op === "grant";
    const isRevoke = op === "revoke";
    const isGrantBatch = op === "grantBatch";
    const isRevokeBatch = op === "revokeBatch";
    const isDeactivate = op === "deactivate";

    if (!isGrant && !isRevoke && !isGrantBatch && !isRevokeBatch && !isDeactivate) {
      throw new Error(`Invalid operation: ${op}`);
    }

    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    let message = "";
    let normalizedContentId = null;
    let normalizedContentIds = null;
    let granteeAddr = null;

    if (isGrant || isRevoke) {
      must(contentId, "contentId");
      must(grantee, "grantee");
      normalizedContentId = normalizeContentId(contentId);
      granteeAddr = ethers.utils.getAddress(grantee);
      message = `heaven:content:${op}:${normalizedContentId}:${granteeAddr.toLowerCase()}:${timestamp}:${nonce}`;
    } else if (isGrantBatch || isRevokeBatch) {
      must(contentIds, "contentIds");
      must(grantee, "grantee");
      if (!Array.isArray(contentIds) || contentIds.length === 0) {
        throw new Error("contentIds must be a non-empty array");
      }
      normalizedContentIds = contentIds.map((id) => normalizeContentId(id));
      granteeAddr = ethers.utils.getAddress(grantee);
      const payloadHash = await sha256Hex(
        JSON.stringify({ contentIds: normalizedContentIds, grantee: granteeAddr.toLowerCase() })
      );
      message = `heaven:content:${op}:${payloadHash}:${timestamp}:${nonce}`;
    } else if (isDeactivate) {
      must(contentId, "contentId");
      normalizedContentId = normalizeContentId(contentId);
      message = `heaven:content:deactivate:${normalizedContentId}:${timestamp}:${nonce}`;
    }

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
        sigName: "user_content_access_sig",
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
    // STEP 2: Verify on-chain ownership
    // ========================================
    const ownerCheckIds = normalizedContentIds || [normalizedContentId];
    const ownerJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getContentOwner" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const registry = new ethers.Contract(registryAddr, CONTENT_REGISTRY_ABI, provider);
        for (const id of ownerCheckIds) {
          const res = await registry.getContent(id);
          const owner = res[0];
          const active = res[5];
          if (!active) {
            return JSON.stringify({ ok: false, reason: `inactive content ${id}` });
          }
          if (owner.toLowerCase() !== userAddress.toLowerCase()) {
            return JSON.stringify({ ok: false, reason: `not owner of ${id}` });
          }
        }
        return JSON.stringify({ ok: true });
      }
    );
    const ownerCheck = JSON.parse(ownerJson);
    if (!ownerCheck.ok) {
      throw new Error(ownerCheck.reason || "ownership check failed");
    }

    // ========================================
    // STEP 3: Build MegaETH + Base txs
    // ========================================
    const iface = new ethers.utils.Interface(CONTENT_REGISTRY_ABI);
    const mirrorIface = new ethers.utils.Interface(MIRROR_ABI);
    let megaFn = "";
    let megaArgs = [];
    let megaGasLimit = MEGAETH_GAS_LIMIT_SINGLE;
    let mirrorFn = "";
    let mirrorArgs = [];
    let baseGasLimit = BASE_GAS_LIMIT_SINGLE;

    if (isGrant) {
      megaFn = "grantAccessFor";
      megaArgs = [userAddress, normalizedContentId, granteeAddr];
      mirrorFn = "grantAccess";
      mirrorArgs = [normalizedContentId, granteeAddr];
    } else if (isRevoke) {
      megaFn = "revokeAccessFor";
      megaArgs = [userAddress, normalizedContentId, granteeAddr];
      mirrorFn = "revokeAccess";
      mirrorArgs = [normalizedContentId, granteeAddr];
    } else if (isGrantBatch) {
      megaFn = "grantAccessBatchFor";
      megaArgs = [userAddress, normalizedContentIds, granteeAddr];
      megaGasLimit = MEGAETH_GAS_LIMIT_BATCH;
      mirrorFn = "grantAccessBatch";
      mirrorArgs = [normalizedContentIds, granteeAddr];
      baseGasLimit = BASE_GAS_LIMIT_BATCH;
    } else if (isRevokeBatch) {
      megaFn = "revokeAccessBatchFor";
      megaArgs = [userAddress, normalizedContentIds, granteeAddr];
      megaGasLimit = MEGAETH_GAS_LIMIT_BATCH;
      mirrorFn = "revokeAccessBatch";
      mirrorArgs = [normalizedContentIds, granteeAddr];
      baseGasLimit = BASE_GAS_LIMIT_BATCH;
    } else if (isDeactivate) {
      megaFn = "deactivateFor";
      megaArgs = [userAddress, normalizedContentId];
      mirrorFn = "deactivate";
      mirrorArgs = [normalizedContentId];
    }

    const megaTxData = iface.encodeFunctionData(megaFn, megaArgs);
    const mirrorTxData = mirrorIface.encodeFunctionData(mirrorFn, mirrorArgs);

    // Get nonces for both chains
    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxNonces" },
      async () => {
        const megaProvider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const baseProvider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);
        const [megaNonce, baseNonce, feeData] = await Promise.all([
          megaProvider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending"),
          baseProvider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending"),
          baseProvider.getFeeData(),
        ]);
        return JSON.stringify({
          megaNonce: megaNonce.toString(),
          baseNonce: baseNonce.toString(),
          maxFeePerGas: feeData.maxFeePerGas?.toString() || "100000000",
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || "1000000",
        });
      }
    );
    const txNonces = JSON.parse(nonceJson);

    const unsignedMegaTx = {
      type: 0,
      chainId: MEGAETH_CHAIN_ID,
      nonce: toBigNumber(txNonces.megaNonce, "megaNonce"),
      to: registryAddr,
      data: megaTxData,
      gasLimit: toBigNumber(megaGasLimit, "gasLimit"),
      gasPrice: toBigNumber(MEGAETH_GAS_PRICE, "gasPrice"),
      value: 0,
    };

    const unsignedBaseTx = {
      type: 2,
      chainId: BASE_CHAIN_ID,
      nonce: toBigNumber(txNonces.baseNonce, "baseNonce"),
      to: mirrorAddr,
      data: mirrorTxData,
      gasLimit: toBigNumber(baseGasLimit, "gasLimit"),
      maxFeePerGas: toBigNumber(txNonces.maxFeePerGas, "maxFeePerGas"),
      maxPriorityFeePerGas: toBigNumber(txNonces.maxPriorityFeePerGas, "maxPriorityFeePerGas"),
      value: 0,
    };

    const megaSigned = await signTx(unsignedMegaTx, "contentAccess_mega");
    const baseSigned = await signTx(unsignedBaseTx, "contentAccess_base");

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "content-access-v1",
          operation: op,
          megaSignedTx: megaSigned.signedTx,
          baseSignedTx: baseSigned.signedTx,
          user: userAddress.toLowerCase(),
        }),
      });
      return;
    }

    // ========================================
    // STEP 4: Broadcast both
    // ========================================
    // Base first — it's the Lit access-condition gate. If it fails we haven't
    // committed to MegaETH yet, so the caller can safely retry.
    const baseBroadcast = await broadcastSignedTx(baseSigned.signedTx, BASE_RPC_URL, "contentAccess_base");

    let megaBroadcast;
    try {
      megaBroadcast = await broadcastSignedTx(megaSigned.signedTx, MEGAETH_RPC_URL, "contentAccess_mega");
    } catch (megaErr) {
      // Base succeeded but MegaETH failed — return error with both tx hashes
      // so client can reconcile. Access grants are idempotent so retry is safe.
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: false,
          error: `MegaETH broadcast failed: ${megaErr.message}`,
          version: "content-access-v1",
          operation: op,
          mirrorTxHash: baseBroadcast.txHash,
          user: userAddress.toLowerCase(),
        }),
      });
      return;
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "content-access-v1",
        operation: op,
        txHash: megaBroadcast.txHash,
        blockNumber: megaBroadcast.blockNumber,
        user: userAddress.toLowerCase(),
        mirrorTxHash: baseBroadcast.txHash,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "content-access-v1",
      }),
    });
  }
};

main();
