/**
 * Follow v1
 *
 * Follow or unfollow a user on-chain via FollowV1 on MegaETH.
 * Sponsor PKP pays gas — user is gasless.
 *
 * Flow:
 * 1. Verify EIP-191 signature over target address + action
 * 2. Sponsor PKP signs + broadcasts followFor()/unfollowFor() on MegaETH
 * 3. Return txHash
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - targetAddress: Address to follow/unfollow
 * - action: "follow" or "unfollow"
 * - signature: EIP-191 signature over content digest
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 *
 * Optional jsParams:
 * - dryRun: boolean (default false) — skip broadcast
 *
 * Returns: { success, version, user, targetAddress, action, txHash }
 */

// ── Constants ──────────────────────────────────────────────────────────

const MEGA_CHAIN_ID = 6343;
const MEGA_RPC_URL = "https://carrot.megaeth.com/rpc";
const MEGA_GAS_PRICE = "1000000";
const MEGA_GAS_LIMIT = "2000000";
const FOLLOW_V1 = "0x3F32cF9e70EF69DFFed74Dfe07034cb03cF726cb";

const SPONSOR_PKP_PUBLIC_KEY =
  "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const SPONSOR_PKP_ADDRESS = "0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455";

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

const FOLLOW_V1_ABI = [
  "function followFor(address follower, address followee) external",
  "function unfollowFor(address follower, address followee) external",
];

// ── Main ───────────────────────────────────────────────────────────────

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      targetAddress,
      action,
      signature,
      timestamp,
      nonce,
      dryRun = false,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(targetAddress, "targetAddress");
    must(action, "action");
    must(signature, "signature");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    if (action !== "follow" && action !== "unfollow") {
      throw new Error('action must be "follow" or "unfollow"');
    }

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    const checksumTarget = ethers.utils.getAddress(targetAddress);

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
    const message = `heaven:follow:${checksumTarget}:${action}:${timestamp}:${nonce}`;
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Invalid signature: recovered address does not match user PKP");
    }

    // ========================================
    // STEP 3: Build calldata
    // ========================================
    const iface = new ethers.utils.Interface(FOLLOW_V1_ABI);
    const funcName = action === "follow" ? "followFor" : "unfollowFor";
    const calldata = iface.encodeFunctionData(funcName, [
      ethers.utils.getAddress(userAddress),
      checksumTarget,
    ]);

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "follow-v1",
          user: userAddress,
          targetAddress: checksumTarget,
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
      to: FOLLOW_V1,
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
        sigName: "sponsorFollowSig",
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
        version: "follow-v1",
        user: userAddress,
        targetAddress: checksumTarget,
        action,
        txHash: broadcast.txHash,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "follow-v1",
        error: err?.message || String(err),
      }),
    });
  }
};

main();
