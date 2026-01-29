/**
 * Heaven Register Sponsor v1
 *
 * Sponsor PKP registers a .heaven name on MegaETH on behalf of a new user.
 * The user signs an EIP-191 message authorizing the registration.
 * The sponsor PKP pays gas (MegaETH gas is ~free).
 *
 * Flow:
 * 1. Verify user's EIP-191 signature (binds label + recipient + timestamp + nonce)
 * 2. Check name availability via registry.available()
 * 3. Encode registerFor(parentNode, label, recipient, 365 days) calldata
 * 4. Sponsor PKP signs + broadcasts legacy tx to MegaETH
 * 5. Return tokenId and node
 *
 * Required jsParams:
 * - recipient: Address to receive the name NFT (user's PKP address)
 * - label: The name to register (e.g. "alice" for alice.heaven)
 * - signature: User's EIP-191 signature over authorization message
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 *
 * Optional jsParams:
 * - dryRun: boolean (default false) — skip broadcast, return signed tx
 *
 * Returns: { success, tokenId, node, label, txHash }
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const CHAIN_ID = 6343;
const RPC_URL = "https://carrot.megaeth.com/rpc";

// Deployed contracts (MegaETH Testnet)
const REGISTRY_V1 = "0x61CAed8296a2eF78eCf9DCa5eDf3C44469c6b1E2";
const RECORDS_V1 = "0x351ba82bAfDA1070bba8158852624653e3654929";

// Heaven parent node: namehash("heaven.hnsbridge.eth")
const HEAVEN_NODE = "0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27";

// Duration: 1 year (365 days in seconds)
const DURATION = 365 * 24 * 60 * 60;

// Sponsor PKP — fund this address with MegaETH testnet ETH
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

// MegaETH gas config (legacy type 0 txs, ~0.001 gwei)
const GAS_PRICE = "1000000"; // 1M wei = ~0.001 gwei
const GAS_LIMIT = "2000000"; // generous for MegaEVM

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

// ============================================================
// ABI FRAGMENTS
// ============================================================

const REGISTRY_ABI = [
  "function registerFor(bytes32 parentNode, string calldata label, address to, uint256 duration) external payable returns (uint256 tokenId)",
  "function available(bytes32 parentNode, string calldata label) external view returns (bool)",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      recipient,
      label,
      signature,
      timestamp,
      nonce,
      dryRun = false,
    } = jsParams || {};

    must(recipient, "recipient");
    must(label, "label");
    must(signature, "signature");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    const recipientAddr = ethers.utils.getAddress(recipient);

    // ========================================
    // STEP 1: Verify EIP-191 signature
    // ========================================
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    const message = `heaven:register:${label}:${recipientAddr}:${timestamp}:${nonce}`;
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== recipientAddr.toLowerCase()) {
      throw new Error(
        `Signature mismatch: recovered ${recovered}, expected ${recipientAddr}`
      );
    }

    // ========================================
    // STEP 2: Check availability (runOnce)
    // ========================================
    const availableJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkAvailability" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const registry = new ethers.Contract(REGISTRY_V1, REGISTRY_ABI, provider);
        const isAvailable = await registry.available(HEAVEN_NODE, label);
        return JSON.stringify({ available: isAvailable });
      }
    );

    const availability = JSON.parse(availableJson);
    if (!availability.available) {
      throw new Error(`Name "${label}.heaven" is not available`);
    }

    // ========================================
    // STEP 3: Encode registerFor calldata
    // ========================================
    const iface = new ethers.utils.Interface(REGISTRY_ABI);
    const txData = iface.encodeFunctionData("registerFor", [
      HEAVEN_NODE,
      label,
      recipientAddr,
      DURATION,
    ]);

    // ========================================
    // STEP 4: Build + sign + broadcast legacy tx with sponsor PKP
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

    // MegaETH requires legacy (type 0) transactions
    const unsignedTx = {
      type: 0,
      chainId: CHAIN_ID,
      nonce: toBigNumber(txParams.nonce, "nonce"),
      to: REGISTRY_V1,
      data: txData,
      gasLimit: toBigNumber(GAS_LIMIT, "gasLimit"),
      gasPrice: toBigNumber(GAS_PRICE, "gasPrice"),
      value: 0, // free registration (testnet)
    };

    const txHash = ethers.utils.keccak256(
      ethers.utils.serializeTransaction(unsignedTx)
    );

    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(txHash)),
      publicKey: SPONSOR_PKP_PUBLIC_KEY,
      sigName: "sponsorRegisterSig",
    });

    if (typeof sigResult === "string" && sigResult.startsWith("[ERROR]")) {
      throw new Error(`PKP signing failed: ${sigResult}`);
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

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "heaven-register-sponsor-v1",
          signedTx,
          txHash,
          label,
          recipient: recipientAddr,
          sponsor: SPONSOR_PKP_ADDRESS,
          contract: REGISTRY_V1,
          chainId: CHAIN_ID,
        }),
      });
      return;
    }

    // Broadcast
    const broadcastResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "broadcastRegisterTx" },
      async () => {
        try {
          const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
          const txResponse = await provider.sendTransaction(signedTx);
          const receipt = await txResponse.wait(1);
          return JSON.stringify({
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status,
            logs: receipt.logs.map((l) => ({
              address: l.address,
              topics: l.topics,
              data: l.data,
            })),
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

    // ========================================
    // STEP 5: Extract tokenId from logs
    // ========================================
    const SUBNAME_REGISTERED_TOPIC = ethers.utils.id(
      "SubnameRegistered(bytes32,uint256,string,address,uint256)"
    );

    let tokenId = null;
    let node = null;
    for (const log of broadcast.logs) {
      if (log.address.toLowerCase() !== REGISTRY_V1.toLowerCase()) continue;
      if (log.topics?.[0] !== SUBNAME_REGISTERED_TOPIC) continue;
      // topics[1] = parentNode (indexed), topics[2] = tokenId (indexed)
      tokenId = ethers.BigNumber.from(log.topics[2]).toHexString();
      // node = bytes32(tokenId)
      node = log.topics[2];
      break;
    }

    if (!tokenId) {
      // Fallback: compute deterministically
      const labelHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(label));
      node = ethers.utils.keccak256(
        ethers.utils.solidityPack(["bytes32", "bytes32"], [HEAVEN_NODE, labelHash])
      );
      tokenId = node;
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "heaven-register-sponsor-v1",
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        tokenId,
        node,
        label,
        fullName: `${label}.heaven`,
        recipient: recipientAddr,
        sponsor: SPONSOR_PKP_ADDRESS,
        contract: REGISTRY_V1,
        chainId: CHAIN_ID,
      }),
    });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "heaven-register-sponsor-v1",
        error: e?.message || String(e),
      }),
    });
  }
};

main();
