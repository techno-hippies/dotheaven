/**
 * Heaven Set Profile v2
 *
 * Sets a user's on-chain profile on MegaETH via sponsor PKP (gasless).
 * The user signs an EIP-191 message authorizing the profile update.
 *
 * V2 changes:
 * - Unified language model: uint256 languagesPacked (8 x 32-bit slots)
 *   replacing separate nativeLanguage + learningLanguagesPacked
 * - Each slot: [langCode:16][proficiency:8][reserved:8]
 * - proficiency 7 = Native, 1-6 = CEFR A1-C2
 *
 * Flow:
 * 1. Verify user's EIP-191 signature (binds user + profileHash + nonce)
 * 2. Encode upsertProfileFor(user, profileInput, signature) calldata
 * 3. Sponsor PKP signs + broadcasts legacy tx to MegaETH
 * 4. Return txHash
 *
 * Required jsParams:
 * - user: Address of the user whose profile is being set
 * - profileInput: ProfileInput struct fields as object
 * - nonce: Current nonce for the user (from contract)
 * - userPkpPublicKey: User's PKP public key for internal signing
 *
 * Optional jsParams:
 * - dryRun: boolean (default false) — skip broadcast, return signed tx
 *
 * Returns: { success, txHash }
 */

// ============================================================
// CONSTANTS (MegaETH Testnet)
// ============================================================

const CHAIN_ID = 6343;
const RPC_URL = "https://carrot.megaeth.com/rpc";

// ProfileV2 contract (to be updated after deployment)
const PROFILE_V2 = "0xa31545D33f6d656E62De67fd020A26608d4601E5";

// Sponsor PKP — same as claim-name
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

// ============================================================
// ABI
// ============================================================

const PROFILE_ABI = [
  "function upsertProfileFor(address user, tuple(uint8 profileVersion, string displayName, bytes32 nameHash, uint8 age, uint16 heightCm, bytes2 nationality, uint256 languagesPacked, uint8 friendsOpenToMask, bytes32 locationCityId, bytes32 schoolId, bytes32 skillsCommit, bytes32 hobbiesCommit, string photoURI, uint8 gender, uint8 relocate, uint8 degree, uint8 fieldBucket, uint8 profession, uint8 industry, uint8 relationshipStatus, uint8 sexuality, uint8 ethnicity, uint8 datingStyle, uint8 children, uint8 wantsChildren, uint8 drinking, uint8 smoking, uint8 drugs, uint8 lookingFor, uint8 religion, uint8 pets, uint8 diet) in_, bytes signature) external",
  "function nonces(address user) external view returns (uint256)",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      user,
      profileInput,
      userPkpPublicKey,
      nonce,
      dryRun = false,
    } = jsParams || {};

    must(user, "user");
    must(profileInput, "profileInput");
    must(userPkpPublicKey, "userPkpPublicKey");
    must(nonce !== undefined ? nonce : null, "nonce");

    const userAddr = ethers.utils.getAddress(user);

    // ========================================
    // STEP 1: Verify EIP-191 signature
    // ========================================
    // Reconstruct the profileHash the same way the contract does:
    // keccak256(abi.encode(profileInput))
    const iface = new ethers.utils.Interface(PROFILE_ABI);

    // Build the profile tuple for abi.encode
    const profileTuple = [
      profileInput.profileVersion || 2,
      profileInput.displayName || "",
      profileInput.nameHash || ethers.constants.HashZero,
      profileInput.age || 0,
      profileInput.heightCm || 0,
      profileInput.nationality || "0x0000",
      toBigNumber(profileInput.languagesPacked || "0", "languagesPacked"),
      profileInput.friendsOpenToMask || 0,
      profileInput.locationCityId || ethers.constants.HashZero,
      profileInput.schoolId || ethers.constants.HashZero,
      profileInput.skillsCommit || ethers.constants.HashZero,
      profileInput.hobbiesCommit || ethers.constants.HashZero,
      profileInput.photoURI || "",
      profileInput.gender || 0,
      profileInput.relocate || 0,
      profileInput.degree || 0,
      profileInput.fieldBucket || 0,
      profileInput.profession || 0,
      profileInput.industry || 0,
      profileInput.relationshipStatus || 0,
      profileInput.sexuality || 0,
      profileInput.ethnicity || 0,
      profileInput.datingStyle || 0,
      profileInput.children || 0,
      profileInput.wantsChildren || 0,
      profileInput.drinking || 0,
      profileInput.smoking || 0,
      profileInput.drugs || 0,
      profileInput.lookingFor || 0,
      profileInput.religion || 0,
      profileInput.pets || 0,
      profileInput.diet || 0,
    ];

    // Compute profileHash = keccak256(abi.encode(profileInput))
    const profileEncoded = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(uint8,string,bytes32,uint8,uint16,bytes2,uint256,uint8,bytes32,bytes32,bytes32,bytes32,string,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8)",
      ],
      [profileTuple]
    );
    const profileHash = ethers.utils.keccak256(profileEncoded);

    // Sign or verify: message = "heaven:profile:{user}:{profileHash}:{nonce}"
    const message = `heaven:profile:${userAddr.toLowerCase()}:${profileHash}:${nonce}`;

    const msgHash = ethers.utils.hashMessage(message);
    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(msgHash)),
      publicKey: userPkpPublicKey,
      sigName: "user_profile_sig",
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
    if (recovered.toLowerCase() !== userAddr.toLowerCase()) {
      throw new Error(
        `Signature mismatch: recovered ${recovered}, expected ${userAddr}`
      );
    }

    // ========================================
    // STEP 2: Verify nonce on-chain
    // ========================================
    const nonceJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkNonce" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(PROFILE_V2, PROFILE_ABI, provider);
        const onChainNonce = await contract.nonces(userAddr);
        return JSON.stringify({ nonce: onChainNonce.toString() });
      }
    );

    const nonceData = JSON.parse(nonceJson);
    if (nonceData.nonce !== String(nonce)) {
      throw new Error(
        `Nonce mismatch: on-chain ${nonceData.nonce}, provided ${nonce}`
      );
    }

    // ========================================
    // STEP 3: Encode upsertProfileFor calldata
    // ========================================
    const txData = iface.encodeFunctionData("upsertProfileFor", [
      userAddr,
      profileTuple,
      signature,
    ]);

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
      to: PROFILE_V2,
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
      sigName: "sponsorProfileSig",
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
          version: "heaven-set-profile-v2",
          signedTx,
          txHash,
          user: userAddr,
          profileHash,
          sponsor: SPONSOR_PKP_ADDRESS,
          contract: PROFILE_V2,
          chainId: CHAIN_ID,
        }),
      });
      return;
    }

    // Broadcast
    const broadcastResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "broadcastProfileTx" },
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
        version: "heaven-set-profile-v2",
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        user: userAddr,
        profileHash,
        sponsor: SPONSOR_PKP_ADDRESS,
        contract: PROFILE_V2,
        chainId: CHAIN_ID,
      }),
    });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "heaven-set-profile-v2",
        error: e?.message || String(e),
      }),
    });
  }
};

main();
