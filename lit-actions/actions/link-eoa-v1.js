/**
 * Link EOA v1
 *
 * Links a PKP address to its originating EOA on ContentAccessMirror (Base).
 * This allows content grants made to the EOA to also apply when the user
 * authenticates via their PKP (canAccess checks linkedEoa fallback).
 *
 * Called once per user during EOA signup, after the PKP is minted.
 *
 * Required jsParams:
 * - userPkpPublicKey: PKP public key (derives pkpAddress)
 * - eoaAddress: The EOA wallet address to link
 * - timestamp: Unix ms timestamp
 * - nonce: Unique nonce
 *
 * Optional: contentAccessMirror (override), dryRun
 *
 * Returns: { success, pkpAddress, eoaAddress, txHash, blockNumber }
 */

// Base Sepolia
const BASE_CHAIN_ID = 84532;
const BASE_RPC_URL = "https://sepolia.base.org";
const CONTENT_ACCESS_MIRROR = "0xd4D3baB38a11D72e36F49a73D50Dbdc3c1Aa4e9A";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

const BASE_GAS_LIMIT = "200000";

let ethersLib = globalThis.ethers;
if (!ethersLib) ethersLib = require("ethers");
const ethers = ethersLib;

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

const MIRROR_ABI = [
  "function linkEoa(address pkp, address eoa) external",
  "function linkedEoa(address pkp) external view returns (address)",
];

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      eoaAddress,
      timestamp,
      nonce,
      contentAccessMirror: mirrorOverride,
      dryRun = false,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(eoaAddress, "eoaAddress");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    const pkpAddress = ethers.utils.computeAddress(userPkpPublicKey);
    const eoa = ethers.utils.getAddress(eoaAddress);
    const mirrorAddr = ethers.utils.getAddress(mirrorOverride || CONTENT_ACCESS_MIRROR);

    // Validate timestamp (5 min window)
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    // Verify EIP-191 signature: user's PKP signs to prove they own the PKP
    const message = `heaven:linkEoa:${pkpAddress.toLowerCase()}:${eoa.toLowerCase()}:${timestamp}:${nonce}`;
    const msgHash = ethers.utils.hashMessage(message);
    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(msgHash)),
      publicKey: userPkpPublicKey,
      sigName: "user_link_eoa_sig",
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

    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== pkpAddress.toLowerCase()) {
      throw new Error(`Signature mismatch: recovered ${recovered}, expected ${pkpAddress}`);
    }

    // Check if already linked
    const existingJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkExistingLink" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);
        const mirror = new ethers.Contract(mirrorAddr, MIRROR_ABI, provider);
        const existing = await mirror.linkedEoa(pkpAddress);
        return JSON.stringify({ existing });
      }
    );
    const { existing } = JSON.parse(existingJson);
    if (existing.toLowerCase() === eoa.toLowerCase()) {
      // Already linked — return success without broadcasting
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          version: "link-eoa-v1",
          alreadyLinked: true,
          pkpAddress: pkpAddress.toLowerCase(),
          eoaAddress: eoa.toLowerCase(),
        }),
      });
      return;
    }

    // Build linkEoa tx
    const mirrorIface = new ethers.utils.Interface(MIRROR_ABI);
    const txData = mirrorIface.encodeFunctionData("linkEoa", [pkpAddress, eoa]);

    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxNonce" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);
        const [nonce, feeData] = await Promise.all([
          provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending"),
          provider.getFeeData(),
        ]);
        return JSON.stringify({
          nonce: nonce.toString(),
          maxFeePerGas: feeData.maxFeePerGas?.toString() || "100000000",
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || "1000000",
        });
      }
    );
    const txNonces = JSON.parse(nonceJson);

    const unsignedTx = {
      type: 2,
      chainId: BASE_CHAIN_ID,
      nonce: toBigNumber(txNonces.nonce, "nonce"),
      to: mirrorAddr,
      data: txData,
      gasLimit: toBigNumber(BASE_GAS_LIMIT, "gasLimit"),
      maxFeePerGas: toBigNumber(txNonces.maxFeePerGas, "maxFeePerGas"),
      maxPriorityFeePerGas: toBigNumber(txNonces.maxPriorityFeePerGas, "maxPriorityFeePerGas"),
      value: 0,
    };

    const signed = await signTx(unsignedTx, "linkEoa");

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "link-eoa-v1",
          pkpAddress: pkpAddress.toLowerCase(),
          eoaAddress: eoa.toLowerCase(),
          signedTx: signed.signedTx,
        }),
      });
      return;
    }

    const broadcast = await broadcastSignedTx(signed.signedTx, BASE_RPC_URL, "linkEoa");

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "link-eoa-v1",
        pkpAddress: pkpAddress.toLowerCase(),
        eoaAddress: eoa.toLowerCase(),
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: err.message || String(err),
        version: "link-eoa-v1",
      }),
    });
  }
};

main();
