/**
 * Heaven Set Records v1
 *
 * Sets ENS-compatible text records on RecordsV1 on MegaETH via sponsor PKP (gasless).
 * The user's PKP signs an EIP-191 message authorizing the record update.
 *
 * Flow:
 * 1. User's PKP signs EIP-191 internally (signAndCombineEcdsa)
 * 2. Verify signature matches name owner
 * 3. Sponsor PKP signs + broadcasts setTextFor() or setRecordsFor() to RecordsV1
 * 4. Return txHash
 *
 * Required jsParams:
 * - node: bytes32 namehash of the name
 * - userPkpPublicKey: User's PKP public key for internal signing
 * - nonce: Current nonce for the node (from RecordsV1.nonces(node))
 *
 * For single record:
 * - key: string record key (e.g. "avatar", "cover")
 * - value: string record value (e.g. "ipfs://Qm...")
 *
 * For batch records:
 * - keys: string[] record keys
 * - values: string[] record values
 *
 * Optional jsParams:
 * - dryRun: boolean (default false) — skip broadcast, return signed tx
 *
 * Returns: { success, txHash, node, nonce }
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const CHAIN_ID = 6343;
const RPC_URL = "https://carrot.megaeth.com/rpc";

const RECORDS_V1 = "0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

// MegaETH gas config
const GAS_PRICE = "1000000";
const GAS_LIMIT = "3000000";

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

async function sha256Hex(data) {
  const encoder = new TextEncoder();
  const buf = typeof data === "string" ? encoder.encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// ABI
// ============================================================

const RECORDS_ABI = [
  "function setTextFor(bytes32 node, string key, string value, bytes signature) external",
  "function setRecordsFor(bytes32 node, string[] keys, string[] values, bytes signature) external",
  "function nonces(bytes32 node) external view returns (uint256)",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      node,
      userPkpPublicKey,
      nonce,
      key,
      value,
      keys,
      values,
      dryRun = false,
    } = jsParams || {};

    must(node, "node");
    must(userPkpPublicKey, "userPkpPublicKey");
    must(nonce, "nonce");

    const isBatch = Array.isArray(keys) && Array.isArray(values);
    if (!isBatch) {
      must(key, "key");
      must(value, "value");
    } else {
      if (keys.length !== values.length) throw new Error("keys/values length mismatch");
      if (keys.length === 0) throw new Error("keys/values cannot be empty");
    }

    const iface = new ethers.utils.Interface(RECORDS_ABI);

    // Derive user address from PKP public key
    const userAddress = ethers.utils.computeAddress(`0x${strip0x(userPkpPublicKey)}`);

    // ========================================
    // STEP 1: Internal signing (user's PKP)
    // ========================================

    let message;
    if (isBatch) {
      // heaven:records-batch:{node}:{payloadHash}:{nonce}
      const payloadHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["string[]", "string[]"],
          [keys, values]
        )
      );
      message = `heaven:records-batch:${node.toLowerCase()}:${payloadHash}:${nonce}`;
    } else {
      // heaven:records:{node}:{key}:{valueHash}:{nonce}
      const valueHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(value));
      message = `heaven:records:${node.toLowerCase()}:${key}:${valueHash}:${nonce}`;
    }

    const msgHash = ethers.utils.hashMessage(message);
    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(msgHash)),
      publicKey: userPkpPublicKey,
      sigName: "user_records_sig",
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

    // Verify signature locally
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`Sign mismatch: recovered ${recovered}, expected ${userAddress}`);
    }

    // ========================================
    // STEP 2: Verify nonce on-chain
    // ========================================
    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkNonce" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(RECORDS_V1, RECORDS_ABI, provider);
        const onChainNonce = await contract.nonces(node);
        return JSON.stringify({ nonce: onChainNonce.toString() });
      }
    );

    const nonceData = JSON.parse(nonceJson);
    if (nonceData.nonce !== String(nonce)) {
      throw new Error(`Nonce mismatch: on-chain ${nonceData.nonce}, provided ${nonce}`);
    }

    // ========================================
    // STEP 3: Encode calldata
    // ========================================
    let txData;
    if (isBatch) {
      txData = iface.encodeFunctionData("setRecordsFor", [node, keys, values, signature]);
    } else {
      txData = iface.encodeFunctionData("setTextFor", [node, key, value, signature]);
    }

    // ========================================
    // STEP 4: Build + sign + broadcast
    // ========================================
    const txParamsJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxParams" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const txNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
        return JSON.stringify({ nonce: txNonce.toString() });
      }
    );

    const txParams = JSON.parse(txParamsJson);

    const unsignedTx = {
      type: 0,
      chainId: CHAIN_ID,
      nonce: toBigNumber(txParams.nonce, "nonce"),
      to: RECORDS_V1,
      data: txData,
      gasLimit: toBigNumber(GAS_LIMIT, "gasLimit"),
      gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
      value: 0,
    };

    const txHash = ethers.utils.keccak256(
      ethers.utils.serializeTransaction(unsignedTx)
    );

    const sponsorSigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(txHash)),
      publicKey: SPONSOR_PKP_PUBLIC_KEY,
      sigName: "sponsorRecordsSig",
    });

    if (typeof sponsorSigResult === "string" && sponsorSigResult.startsWith("[ERROR]")) {
      throw new Error(`PKP signing failed: ${sponsorSigResult}`);
    }

    const sponsorSigObj = JSON.parse(sponsorSigResult);
    let sponsorV = Number(sponsorSigObj.recid ?? sponsorSigObj.recoveryId ?? sponsorSigObj.v);
    if (sponsorV === 0 || sponsorV === 1) sponsorV += 27;
    const sig = ethers.utils.joinSignature({
      r: `0x${strip0x(sponsorSigObj.r)}`,
      s: `0x${strip0x(sponsorSigObj.s)}`,
      v: sponsorV,
    });

    const signedTx = ethers.utils.serializeTransaction(unsignedTx, sig);

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "heaven-set-records-v1",
          signedTx,
          txHash,
          node,
          user: userAddress,
          sponsor: SPONSOR_PKP_ADDRESS,
          contract: RECORDS_V1,
          chainId: CHAIN_ID,
        }),
      });
      return;
    }

    // Broadcast
    const broadcastResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "broadcastRecordsTx" },
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
      throw new Error(`Broadcast runOnce failed: ${broadcastResult}`);
    }
    const broadcast = JSON.parse(broadcastResult);
    if (broadcast.broadcastError) {
      throw new Error(`TX broadcast failed: ${broadcast.broadcastError} (code: ${broadcast.code})`);
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "heaven-set-records-v1",
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        node,
        user: userAddress,
        nonce: Number(nonce),
        sponsor: SPONSOR_PKP_ADDRESS,
        contract: RECORDS_V1,
        chainId: CHAIN_ID,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "heaven-set-records-v1",
        error: err?.message || String(err),
      }),
    });
  }
};

main();
