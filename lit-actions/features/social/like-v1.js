/**
 * Like v1
 *
 * Like or unlike a post on-chain via EngagementV2 on MegaETH.
 * Sponsor PKP pays gas — user is gasless.
 *
 * Flow:
 * 1. Verify EIP-191 signature over postId + action
 * 2. Sponsor PKP signs + broadcasts likeFor()/unlikeFor() on MegaETH
 * 3. Return txHash
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - postId: bytes32 post identifier
 * - action: "like" or "unlike"
 * - signature: EIP-191 signature over content digest
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 *
 * Optional jsParams:
 * - dryRun: boolean (default false) — skip broadcast
 *
 * Returns: { success, version, user, postId, action, txHash }
 */

// ── Constants ──────────────────────────────────────────────────────────

const MEGA_CHAIN_ID = 6343;
const MEGA_RPC_URL = "https://carrot.megaeth.com/rpc";
const MEGA_GAS_PRICE = "1000000";
const MEGA_GAS_LIMIT = "2000000";
const ENGAGEMENT_V2 = "0xAF769d204e51b64D282083Eb0493F6f37cd93138";

const SPONSOR_PKP_PUBLIC_KEY =
  "041b762c8813a1d9ad63be588846ae6df642110bec9bc2f42a4f06864cad39266b6eaa615c65ce83d2a4b22d14ce72c7b8de3285011831e54c35fd97a923f75ef6";
const SPONSOR_PKP_ADDRESS = "0x7222c04A7C626261D2255Cc40e6Be8BB4Aa8e171";

let ethersLib = globalThis.ethers;
if (!ethersLib) ethersLib = require("ethers");
const ethers = ethersLib;

// ── Helpers ────────────────────────────────────────────────────────────

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

const parseRunOnce = (result, stepName) => {
  const s = String(result || "").trim();
  if (s.startsWith("[ERROR]") || s.includes("[ERROR]"))
    throw new Error(`${stepName} failed: ${s.slice(0, 300)}`);
  return JSON.parse(s);
};

// ── ABI ────────────────────────────────────────────────────────────────

const ENGAGEMENT_V2_ABI = [
  "function likeFor(address liker, bytes32 postId) external",
  "function unlikeFor(address unliker, bytes32 postId) external",
];

// ── Main ───────────────────────────────────────────────────────────────

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      postId,
      action,
      signature,
      timestamp,
      nonce,
      dryRun = false,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(postId, "postId");
    must(action, "action");
    must(signature, "signature");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    if (action !== "like" && action !== "unlike") {
      throw new Error('action must be "like" or "unlike"');
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
    // STEP 2: Verify signature
    // ========================================
    const message = `heaven:like:${postId}:${action}:${timestamp}:${nonce}`;
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Invalid signature: recovered address does not match user PKP");
    }

    // ========================================
    // STEP 3: Build calldata
    // ========================================
    const iface = new ethers.utils.Interface(ENGAGEMENT_V2_ABI);
    const funcName = action === "like" ? "likeFor" : "unlikeFor";
    const calldata = iface.encodeFunctionData(funcName, [
      ethers.utils.getAddress(userAddress),
      postId,
    ]);

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "like-v1",
          user: userAddress,
          postId,
          action,
        }),
      });
      return;
    }

    // ========================================
    // STEP 4: Get nonce + sign + broadcast
    // ========================================
    const txParamsJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxParams" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
        const txNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
        return JSON.stringify({ nonce: txNonce.toString() });
      }
    );

    const txParams = parseRunOnce(txParamsJson, "TX params");

    const unsignedTx = {
      type: 0,
      chainId: MEGA_CHAIN_ID,
      nonce: toBigNumber(txParams.nonce, "nonce"),
      to: ENGAGEMENT_V2,
      data: calldata,
      gasLimit: toBigNumber(MEGA_GAS_LIMIT, "gasLimit"),
      gasPrice: toBigNumber(MEGA_GAS_PRICE, "gasPrice"),
      value: 0,
    };

    const txHashToSign = ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTx));

    let sigResult;
    try {
      sigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(txHashToSign)),
        publicKey: SPONSOR_PKP_PUBLIC_KEY,
        sigName: "sponsorLikeSig",
      });
    } catch (sigErr) {
      throw new Error(`Sponsor PKP signing failed: ${sigErr?.message || sigErr}`);
    }

    const sigStr = String(sigResult || "").trim();
    if (sigStr.startsWith("[ERROR]")) throw new Error(`Sponsor PKP signing failed: ${sigStr}`);

    const sigObj = JSON.parse(sigStr);
    let v = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
    if (v === 0 || v === 1) v += 27;
    const sig = ethers.utils.joinSignature({
      r: `0x${strip0x(sigObj.r)}`,
      s: `0x${strip0x(sigObj.s)}`,
      v,
    });

    const signedTx = ethers.utils.serializeTransaction(unsignedTx, sig);

    // Broadcast
    const broadcastResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "broadcastTx" },
      async () => {
        try {
          const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
          const txResp = await provider.sendTransaction(signedTx);
          const receipt = await txResp.wait(1);
          return JSON.stringify({
            txHash: receipt.transactionHash,
            status: receipt.status,
          });
        } catch (err) {
          return JSON.stringify({
            broadcastError: err?.reason || err?.message || String(err),
          });
        }
      }
    );

    const broadcast = parseRunOnce(broadcastResult, "TX broadcast");
    if (broadcast.broadcastError) {
      throw new Error(`TX broadcast failed: ${broadcast.broadcastError}`);
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "like-v1",
        user: userAddress,
        postId,
        action,
        txHash: broadcast.txHash,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "like-v1",
        error: err?.message || String(err),
      }),
    });
  }
};

main();
