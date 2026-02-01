/**
 * Content Decrypt v1
 *
 * Decrypts an AES key (Lit-encrypted) after verifying access on ContentRegistry.
 *
 * Two layers of access control:
 *   1. This action checks canAccess(user, contentId) on MegaETH ContentRegistry (defense-in-depth)
 *   2. Lit nodes evaluate the contract-gated condition on Base ContentAccessMirror (enforced by Lit BLS)
 *
 * The access condition is contract-gated (evmContract on Base), NOT action-bound.
 * This means action CIDs can rotate freely without affecting decryption of existing content.
 *
 * Required jsParams:
 * - contentId: bytes32
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - ciphertext, dataToEncryptHash, unifiedAccessControlConditions (encrypted key payload)
 *
 * Either:
 * - userPkpPublicKey: User PKP public key (action signs on behalf)
 * OR:
 * - signature: Pre-signed EIP-191 signature (address recovered from sig)
 *
 * Returns: { success, key }  (key is the decrypted AES key, base64)
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const RPC_URL = "https://carrot.megaeth.com/rpc";

// ContentRegistry (MegaETH Testnet)
const CONTENT_REGISTRY = "0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2";

// ContentAccessMirror (Base Sepolia) — the Lit access-condition target
const CONTENT_ACCESS_MIRROR = "0x872E8E7E4a4088F41CeB0ccc14a7081D36aF5aa4";
const EXPECTED_CHAIN = "baseSepolia";

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

function normalizeContentId(id) {
  return ethers.utils.hexZeroPad(id, 32).toLowerCase();
}

/**
 * Validate that the access control conditions are contract-gated (evmContract)
 * pointing at a canAccess function. Rejects action-bound or other condition types.
 */
function assertContractGatedAccs(accs, contentId) {
  if (!Array.isArray(accs) || accs.length !== 1) {
    throw new Error("accessControlConditions must be a single condition");
  }
  const cond = accs[0] || {};
  if (cond.conditionType !== "evmContract") {
    throw new Error(`Expected evmContract condition, got ${cond.conditionType}`);
  }
  if (cond.functionName !== "canAccess") {
    throw new Error(`Expected canAccess function, got ${cond.functionName}`);
  }
  if (cond.contractAddress?.toLowerCase() !== CONTENT_ACCESS_MIRROR.toLowerCase()) {
    throw new Error(`ACC contractAddress mismatch: got ${cond.contractAddress}, expected ${CONTENT_ACCESS_MIRROR}`);
  }
  if (cond.chain !== EXPECTED_CHAIN) {
    throw new Error(`ACC chain mismatch: got ${cond.chain}, expected ${EXPECTED_CHAIN}`);
  }
  // Verify functionParams shape: [":userAddress", contentId]
  const params = cond.functionParams || [];
  if (params.length !== 2) {
    throw new Error(`ACC functionParams must have exactly 2 entries, got ${params.length}`);
  }
  if (params[0] !== ":userAddress") {
    throw new Error(`ACC functionParams[0] must be ":userAddress", got ${params[0]}`);
  }
  if (params[1]?.toLowerCase() !== contentId.toLowerCase()) {
    throw new Error(`ACC contentId mismatch: got ${params[1]}, expected ${contentId}`);
  }
}

// ============================================================
// ABI (ContentRegistry on MegaETH)
// ============================================================

const CONTENT_REGISTRY_ABI = [
  "function canAccess(address user, bytes32 contentId) external view returns (bool)",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      contentId,
      timestamp,
      nonce,
      encryptedKey,
      ciphertext,
      dataToEncryptHash,
      accessControlConditions,
      unifiedAccessControlConditions,
      evmContractConditions,
      signature: preSignedSig,
    } = jsParams || {};

    must(contentId, "contentId");
    must(timestamp, "timestamp");
    must(nonce, "nonce");
    if (!preSignedSig) must(userPkpPublicKey, "userPkpPublicKey");

    // When pre-signed, derive address from signature recovery instead
    let userAddress;
    if (userPkpPublicKey) {
      userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    }
    const registryAddr = CONTENT_REGISTRY;

    const cid = normalizeContentId(contentId);

    // Validate timestamp freshness
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    // ========================================
    // STEP 1: Verify EIP-191 signature
    // ========================================
    const message = `heaven:content:decrypt:${cid}:${timestamp}:${nonce}`;

    let signature;
    if (preSignedSig) {
      signature = preSignedSig;
    } else {
      const msgHash = ethers.utils.hashMessage(message);
      const sigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(msgHash)),
        publicKey: userPkpPublicKey,
        sigName: "user_content_decrypt_sig",
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
    // STEP 2: Check canAccess() on MegaETH (defense-in-depth)
    // ========================================
    // This is redundant with the Lit access condition on Base,
    // but provides a second check against the source-of-truth contract.
    const accessJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "canAccess" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const registry = new ethers.Contract(registryAddr, CONTENT_REGISTRY_ABI, provider);
        const allowed = await registry.canAccess(userAddress, cid);
        return JSON.stringify({ allowed });
      }
    );
    const { allowed } = JSON.parse(accessJson);
    if (!allowed) {
      throw new Error("Access denied");
    }

    // ========================================
    // STEP 3: Decrypt AES key via Lit
    // ========================================
    const enc = encryptedKey || {};
    const accs = enc.evmContractConditions || evmContractConditions
      || enc.unifiedAccessControlConditions || unifiedAccessControlConditions
      || enc.accessControlConditions || accessControlConditions;
    const ct = enc.ciphertext || ciphertext;
    const hash = enc.dataToEncryptHash || dataToEncryptHash;

    if (!accs || !ct || !hash) {
      throw new Error(`Missing encrypted key payload: accs=${!!accs} ct=${!!ct} hash=${!!hash}`);
    }

    // Validate: must be contract-gated (evmContract), not action-bound
    assertContractGatedAccs(accs, cid);

    // Lit nodes independently evaluate canAccess() on Base ContentAccessMirror
    // decryptAndCombine expects unifiedAccessControlConditions (evmContract included)
    const decryptedPayload = await Lit.Actions.decryptAndCombine({
      unifiedAccessControlConditions: accs,
      ciphertext: ct,
      dataToEncryptHash: hash,
      authSig: null,
      chain: "baseSepolia",
    });

    // Parse JSON payload and verify contentId binding
    let parsed;
    try {
      parsed = JSON.parse(decryptedPayload);
    } catch (_) {
      throw new Error("Decrypted payload is not valid JSON — legacy raw key format rejected");
    }
    if (!parsed.contentId || !parsed.key) {
      throw new Error("Decrypted payload missing contentId or key");
    }
    if (parsed.contentId.toLowerCase() !== cid) {
      throw new Error(
        `Content ID mismatch: payload bound to ${parsed.contentId}, requested ${cid}`
      );
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "content-decrypt-v1",
        user: userAddress.toLowerCase(),
        key: parsed.key,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "content-decrypt-v1",
      }),
    });
  }
};

main();
