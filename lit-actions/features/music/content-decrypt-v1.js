/**
 * Content Decrypt v1
 *
 * Server-side decryption of Lit-encrypted AES keys for content playback.
 *
 * This Lit Action performs:
 *   1. Verify the caller (user PKP) has access via canAccess() on MegaETH ContentRegistry
 *   2. Decrypt the AES key using Lit.Actions.decryptAndCombine() (server-side BLS threshold decrypt)
 *   3. Return the decrypted key payload to the caller
 *
 * The encrypted AES key is bound to THIS action's CID via :currentActionIpfsId ACC.
 * This means only this action can call decryptAndCombine to recover the key.
 * Access control is enforced by this action's code (canAccess() check on MegaETH),
 * not by the ACC itself.
 *
 * This replaces client-side litClient.decrypt() which fails with Lit Action ACC
 * conditions because Lit SDK v8 session signatures (BLSNetworkSig for PKP,
 * session keys for EOA) are not accepted during Lit Action ACC evaluation.
 *
 * jsParams:
 *   - userPkpPublicKey: string  — user's PKP public key (for auth via signAndCombineEcdsa)
 *   - contentId: string          — bytes32 hex content ID
 *   - ciphertext: string         — Lit ciphertext (from encrypted AES key)
 *   - dataToEncryptHash: string  — Lit data-to-encrypt hash
 *   - timestamp: number          — freshness check (within 5 min)
 *   - nonce: string              — replay protection
 *
 * Returns (JSON string):
 *   { success: true, decryptedPayload: string }  — JSON payload containing { contentId, key }
 *   { success: false, error: string }
 */

// ── Constants ────────────────────────────────────────────────────────────

const MEGAETH_RPC_URL = "https://carrot.megaeth.com/rpc";
const CONTENT_REGISTRY = "0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2";

// Freshness: 5 minutes
const MAX_AGE_MS = 5 * 60 * 1000;

// ── Ethers setup ─────────────────────────────────────────────────────────

let ethersLib = globalThis.ethers;
if (!ethersLib) ethersLib = require("ethers");
const ethers = ethersLib;

const CONTENT_REGISTRY_ABI = [
  "function canAccess(address user, bytes32 contentId) external view returns (bool)",
];

// ── Helpers ──────────────────────────────────────────────────────────────

function fail(msg) {
  Lit.Actions.setResponse({ response: JSON.stringify({ success: false, error: msg }) });
}

function pkpToAddress(publicKey) {
  const raw = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
  return ethers.utils.computeAddress("0x" + raw).toLowerCase();
}

// ── Main ─────────────────────────────────────────────────────────────────

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      contentId,
      ciphertext,
      dataToEncryptHash,
      timestamp,
      nonce,
    } = jsParams;

    // ── Validate params ───────────────────────────────────────────────
    if (!userPkpPublicKey || !contentId || !ciphertext || !dataToEncryptHash) {
      return fail("Missing required params");
    }
    if (!timestamp || !nonce) {
      return fail("Missing timestamp or nonce");
    }

    const userAddress = pkpToAddress(userPkpPublicKey);

    // ── Timestamp freshness ───────────────────────────────────────────
    const age = Date.now() - Number(timestamp);
    if (age > MAX_AGE_MS || age < -60_000) {
      return fail(`Timestamp too old or in future (age: ${age}ms)`);
    }

    // ── Verify caller owns PKP (signAndCombineEcdsa = auth) ──────────
    const message = `heaven:decrypt:${contentId.toLowerCase()}:${timestamp}:${nonce}`;

    await Lit.Actions.signAndCombineEcdsa({
      toSign: ethers.utils.arrayify(ethers.utils.hashMessage(message)),
      publicKey: userPkpPublicKey,
      sigName: "decrypt-sig",
    });

    // ── Check canAccess() on MegaETH ─────────────────────────────────
    const accessResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkAccess" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const registry = new ethers.Contract(
          CONTENT_REGISTRY,
          CONTENT_REGISTRY_ABI,
          provider
        );
        const hasAccess = await registry.canAccess(userAddress, contentId);
        return JSON.stringify({ hasAccess });
      }
    );

    const { hasAccess } = JSON.parse(accessResult);
    if (!hasAccess) {
      return fail(`Access denied: ${userAddress} cannot access ${contentId}`);
    }

    // ── Decrypt via Lit.Actions.decryptAndCombine ─────────────────────
    // The AES key was encrypted with ACC: :currentActionIpfsId == this action's CID.
    // Since we ARE this action, the Lit nodes will see the match and allow decrypt.
    // The decryptCid jsParam tells us our own CID (used to reconstruct the ACC).
    const decryptCid = jsParams.decryptCid;
    if (!decryptCid) {
      return fail("Missing decryptCid param (this action's own CID)");
    }

    const accessControlConditions = [
      {
        conditionType: "evmBasic",
        contractAddress: "",
        standardContractType: "",
        chain: "ethereum",
        method: "",
        parameters: [":currentActionIpfsId"],
        returnValueTest: { comparator: "=", value: decryptCid },
      },
    ];

    const decryptedPayload = await Lit.Actions.decryptAndCombine({
      accessControlConditions,
      ciphertext,
      dataToEncryptHash,
      authSig: null,
      chain: "ethereum",
    });

    Lit.Actions.setResponse({
      response: JSON.stringify({ success: true, decryptedPayload }),
    });
  } catch (err) {
    fail(err.message || String(err));
  }
};

main();
