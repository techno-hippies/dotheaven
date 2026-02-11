/**
 * Self Verify Mirror v1
 *
 * Mirrors Self.xyz verification state from Celo onto MegaETH via sponsor PKP.
 * Reads verifiedAt(user) from Celo SelfProfileVerifier, then writes to
 * VerificationMirror on MegaETH.
 *
 * Flow:
 * 1. Lit Action reads Celo verifier: verifiedAt(user)
 * 2. If nonzero, reads MegaETH mirror nonce
 * 3. Sponsor PKP signs + broadcasts mirror() to MegaETH VerificationMirror
 * 4. Returns txHash
 *
 * Required jsParams:
 * - userAddress: address of the user to mirror
 * - celoVerifierAddress: address of SelfProfileVerifier on Celo
 * - megaEthMirrorAddress: address of VerificationMirror on MegaETH
 *
 * Optional jsParams:
 * - celoRpcUrl: Celo RPC (default: Alfajores)
 * - dryRun: boolean (default false) — skip broadcast
 */

// ============================================================
// CONSTANTS
// ============================================================

const MEGAETH_CHAIN_ID = 6343;
const MEGAETH_RPC_URL = "https://carrot.megaeth.com/rpc";
const CELO_SEPOLIA_RPC_URL = "https://forno.celo-sepolia.celo-testnet.org";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const SPONSOR_PKP_ADDRESS = "0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455";

// MegaETH gas config
const GAS_PRICE = "1000000";
const GAS_LIMIT = "2000000";

// Mirror deadline: 10 minutes from now
const DEADLINE_OFFSET_SECONDS = 600;

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
// ABI
// ============================================================

const CELO_VERIFIER_ABI = [
  "function verifiedAt(address user) external view returns (uint64)",
  "function nationality(address user) external view returns (string)",
];

const MIRROR_ABI = [
  "function mirror(address user, uint64 celoVerifiedAt, string calldata celoNationality, uint256 nonce, uint256 deadline) external",
  "function nonces(address user) external view returns (uint256)",
  "function verifiedAt(address user) external view returns (uint64)",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userAddress,
      celoVerifierAddress,
      megaEthMirrorAddress,
      celoRpcUrl = CELO_SEPOLIA_RPC_URL,
      dryRun = false,
    } = jsParams || {};

    must(userAddress, "userAddress");
    must(celoVerifierAddress, "celoVerifierAddress");
    must(megaEthMirrorAddress, "megaEthMirrorAddress");

    // ========================================
    // STEP 1: Read Celo verifiedAt
    // ========================================

    const celoDataJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "readCelo" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(celoRpcUrl);
        const verifier = new ethers.Contract(celoVerifierAddress, CELO_VERIFIER_ABI, provider);
        const [ts, nat] = await Promise.all([
          verifier.verifiedAt(userAddress),
          verifier.nationality(userAddress),
        ]);
        return JSON.stringify({ verifiedAt: ts.toString(), nationality: nat });
      }
    );

    const celoData = JSON.parse(celoDataJson);
    const celoVerifiedAt = Number(celoData.verifiedAt);
    const celoNationality = celoData.nationality || "";

    if (celoVerifiedAt === 0) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: false,
          version: "self-verify-mirror-v1",
          error: "User not verified on Celo",
          userAddress,
        }),
      });
      return;
    }

    // ========================================
    // STEP 2: Read MegaETH mirror nonce + current state
    // ========================================

    const megaDataJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "readMegaEth" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
        const mirror = new ethers.Contract(megaEthMirrorAddress, MIRROR_ABI, provider);
        const [nonce, currentVerifiedAt, sponsorNonce, block] = await Promise.all([
          mirror.nonces(userAddress),
          mirror.verifiedAt(userAddress),
          provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending"),
          provider.getBlock("latest"),
        ]);
        return JSON.stringify({
          nonce: nonce.toString(),
          currentVerifiedAt: currentVerifiedAt.toString(),
          sponsorNonce: sponsorNonce.toString(),
          blockTimestamp: block.timestamp,
        });
      }
    );

    const megaData = JSON.parse(megaDataJson);

    // Skip if already mirrored at same or newer timestamp
    if (Number(megaData.currentVerifiedAt) >= celoVerifiedAt) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          version: "self-verify-mirror-v1",
          alreadyMirrored: true,
          userAddress,
          celoVerifiedAt,
          megaEthVerifiedAt: Number(megaData.currentVerifiedAt),
        }),
      });
      return;
    }

    // ========================================
    // STEP 3: Build + sign + broadcast mirror tx
    // ========================================

    const deadline = megaData.blockTimestamp + DEADLINE_OFFSET_SECONDS;

    const iface = new ethers.utils.Interface(MIRROR_ABI);
    const txData = iface.encodeFunctionData("mirror", [
      userAddress,
      celoVerifiedAt,
      celoNationality,
      toBigNumber(megaData.nonce, "nonce"),
      toBigNumber(deadline, "deadline"),
    ]);

    const unsignedTx = {
      type: 0,
      chainId: MEGAETH_CHAIN_ID,
      nonce: toBigNumber(megaData.sponsorNonce, "sponsorNonce"),
      to: megaEthMirrorAddress,
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
      sigName: "sponsorMirrorSig",
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
          version: "self-verify-mirror-v1",
          signedTx,
          userAddress,
          celoVerifiedAt,
          nonce: Number(megaData.nonce),
          deadline,
        }),
      });
      return;
    }

    // Broadcast
    const broadcastResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "broadcastMirrorTx" },
      async () => {
        try {
          const provider = new ethers.providers.JsonRpcProvider(MEGAETH_RPC_URL);
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
        version: "self-verify-mirror-v1",
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        userAddress,
        celoVerifiedAt,
        nonce: Number(megaData.nonce),
        contract: megaEthMirrorAddress,
        chainId: MEGAETH_CHAIN_ID,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "self-verify-mirror-v1",
        error: err?.message || String(err),
      }),
    });
  }
};

main();
