/**
 * Story Register Sponsor v1
 *
 * Sponsor PKP mints an SPG NFT, registers it as an IP Asset, and attaches
 * PIL Commercial Remix terms on Story Aeneid — paying gas on behalf of the user.
 *
 * The user signs an EIP-712 typed message authorizing the registration.
 * The Lit Action verifies the signature, then the sponsor PKP broadcasts.
 *
 * Flow:
 * 1. Verify user's EIP-712 signature (binds metadata hashes + recipient)
 * 2. Encode mintAndRegisterIpAndAttachPILTerms calldata
 * 3. Sponsor PKP signs + broadcasts tx to Story Aeneid
 * 4. Return ipId, tokenId, licenseTermsIds
 *
 * Required jsParams:
 * - recipient: Address to receive the NFT (user's wallet/PKP address)
 * - ipMetadataURI: HTTPS gateway URL to IPA metadata JSON
 * - ipMetadataHash: bytes32 SHA-256 of IPA metadata JSON (0x-prefixed)
 * - nftMetadataURI: HTTPS gateway URL to NFT metadata JSON
 * - nftMetadataHash: bytes32 SHA-256 of NFT metadata JSON (0x-prefixed)
 * - commercialRevShare: uint32 revenue share % (e.g. 10 for 10%)
 * - defaultMintingFee: uint256 minting fee in WIP (e.g. "0" for free)
 * - signature: User's EIP-712 signature authorizing this registration
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 *
 * Optional jsParams:
 * - dryRun: boolean (default false) — skip broadcast, return signed tx
 * - mintLicenseToken: boolean (default true) — mint 1 license token to force vault deployment
 *
 * Returns: { success, ipId, tokenId, licenseTermsIds[], txHash }
 */

// ============================================================
// CONSTANTS (Story Aeneid Testnet)
// ============================================================

const CHAIN_ID = 1315;
const RPC_URL = "https://aeneid.storyrpc.io";

// Deployed contracts (Aeneid)
const LICENSE_ATTACHMENT_WORKFLOWS = "0xcC2E862bCee5B6036Db0de6E06Ae87e524a79fd8";
const LICENSING_MODULE = "0x04fbd8a2e56dd85CFD5500A4A4DfA955B9f1dE6f";
const PIL_LICENSE_TEMPLATE = "0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316";
const ROYALTY_POLICY_LAP = "0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E";
const WIP_TOKEN = "0x1514000000000000000000000000000000000000";
const IP_ASSET_REGISTRY = "0x77319B4031e6eF1250907aa00018B8B1c67a244b";
const LICENSE_REGISTRY = "0x529a750E02d8E2f15649c13D69a465286a780e24";

// Heaven's SPG NFT collection (set after creation on Aeneid)
// TODO: Replace with actual deployed SPG NFT contract
// Heaven's SPG NFT collection (isPublicMinting: true)
const SPG_NFT_CONTRACT = "0xb1764abf89e6a151ea27824612145ef89ed70a73";

// Sponsor PKP — fund this address with Story Aeneid IP tokens
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

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
// EIP-712 DOMAIN & TYPES
// ============================================================

const EIP712_DOMAIN = {
  name: "Heaven Song Registration",
  version: "1",
  chainId: CHAIN_ID,
};

const EIP712_TYPES = {
  RegisterSong: [
    { name: "recipient", type: "address" },
    { name: "ipMetadataHash", type: "bytes32" },
    { name: "nftMetadataHash", type: "bytes32" },
    { name: "commercialRevShare", type: "uint32" },
    { name: "defaultMintingFee", type: "uint256" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};

// ============================================================
// ABI FRAGMENTS
// ============================================================

const LICENSE_ATTACHMENT_ABI = [
  `function mintAndRegisterIpAndAttachPILTerms(
    address spgNftContract,
    address recipient,
    (string ipMetadataURI, bytes32 ipMetadataHash, string nftMetadataURI, bytes32 nftMetadataHash) ipMetadata,
    ((bool transferable, address royaltyPolicy, uint256 defaultMintingFee, uint256 expiration, bool commercialUse, bool commercialAttribution, address commercializerChecker, bytes commercializerCheckerData, uint32 commercialRevShare, uint256 commercialRevCeiling, bool derivativesAllowed, bool derivativesAttribution, bool derivativesApproval, bool derivativesReciprocal, uint256 derivativeRevCeiling, address currency, string uri) terms, (bool isSet, uint256 mintingFee, address licensingHook, bytes hookData, uint32 commercialRevShare, bool disabled, uint32 expectMinimumGroupRewardShare, address expectGroupRewardPool) licensingConfig)[] licenseTermsData,
    bool allowDuplicates
  ) external returns (address ipId, uint256 tokenId, uint256[] licenseTermsIds)`,
];

const LICENSING_MODULE_ABI = [
  "function mintLicenseTokens(address licensorIpId, address licenseTemplate, uint256 licenseTermsId, uint256 amount, address receiver, bytes royaltyContext, uint256 maxMintingFee, uint32 maxRevenueShare) returns (uint256)",
  "function predictMintingLicenseFee(address licensorIpId, address licenseTemplate, uint256 licenseTermsId, uint256 amount, address receiver, bytes royaltyContext) view returns (address currencyToken, uint256 tokenAmount)",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      recipient,
      ipMetadataURI,
      ipMetadataHash,
      nftMetadataURI,
      nftMetadataHash,
      commercialRevShare,
      defaultMintingFee,
      signature,
      timestamp,
      nonce,
      dryRun = false,
      mintLicenseToken = true,
    } = jsParams || {};

    must(recipient, "recipient");
    must(ipMetadataURI, "ipMetadataURI");
    must(ipMetadataHash, "ipMetadataHash");
    must(nftMetadataURI, "nftMetadataURI");
    must(nftMetadataHash, "nftMetadataHash");
    must(signature, "signature");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    const revShare = Number(commercialRevShare ?? 10);
    const mintFee = String(defaultMintingFee ?? "0");

    if (SPG_NFT_CONTRACT === "0x0000000000000000000000000000000000000000") {
      throw new Error("SPG_NFT_CONTRACT not set — deploy an SPG NFT collection first");
    }

    // ========================================
    // STEP 1: Verify EIP-712 signature
    // ========================================
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    const typedValue = {
      recipient: ethers.utils.getAddress(recipient),
      ipMetadataHash,
      nftMetadataHash,
      commercialRevShare: revShare,
      defaultMintingFee: mintFee,
      timestamp: String(timestamp),
      nonce: String(nonce),
    };

    // ethers v5 verifyTypedData
    const recovered = ethers.utils.verifyTypedData(
      EIP712_DOMAIN,
      EIP712_TYPES,
      typedValue,
      signature
    );

    if (recovered.toLowerCase() !== recipient.toLowerCase()) {
      throw new Error(
        `EIP-712 signature mismatch: recovered ${recovered}, expected ${recipient}`
      );
    }

    // ========================================
    // STEP 2: Encode mintAndRegisterIpAndAttachPILTerms
    // ========================================
    const iface = new ethers.utils.Interface(LICENSE_ATTACHMENT_ABI);

    // PIL Commercial Remix terms
    const pilTerms = {
      transferable: true,
      royaltyPolicy: ROYALTY_POLICY_LAP,
      defaultMintingFee: toBigNumber(mintFee, "defaultMintingFee"),
      expiration: toBigNumber("0", "expiration"), // no expiration
      commercialUse: true,
      commercialAttribution: true,
      commercializerChecker: ethers.constants.AddressZero,
      commercializerCheckerData: "0x",
      commercialRevShare: revShare * 1000000, // Story uses 10^6 scale (10% = 10_000_000)
      commercialRevCeiling: toBigNumber("0", "commercialRevCeiling"), // no ceiling
      derivativesAllowed: true,
      derivativesAttribution: true,
      derivativesApproval: false,
      derivativesReciprocal: true,
      derivativeRevCeiling: toBigNumber("0", "derivativeRevCeiling"),
      currency: WIP_TOKEN,
      uri: "",
    };

    // Default licensing config (all zeros = use defaults)
    const licensingConfig = {
      isSet: false,
      mintingFee: toBigNumber("0", "mintingFee"),
      licensingHook: ethers.constants.AddressZero,
      hookData: "0x",
      commercialRevShare: 0,
      disabled: false,
      expectMinimumGroupRewardShare: 0,
      expectGroupRewardPool: ethers.constants.AddressZero,
    };

    const txData = iface.encodeFunctionData("mintAndRegisterIpAndAttachPILTerms", [
      SPG_NFT_CONTRACT,
      ethers.utils.getAddress(recipient),
      {
        ipMetadataURI,
        ipMetadataHash,
        nftMetadataURI,
        nftMetadataHash,
      },
      [{ terms: pilTerms, licensingConfig }],
      true, // allowDuplicates
    ]);

    // ========================================
    // STEP 3: Build + sign + broadcast tx with sponsor PKP
    // ========================================
    const txParamsJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxParams" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const [txNonce, feeData] = await Promise.all([
          provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending"),
          provider.getFeeData(),
        ]);

        // Skip estimateGas (can revert if SPG NFT perms not set) — use fixed limit
        // mintAndRegisterIpAndAttachPILTerms is complex (~500k-1M gas)
        const gasLimit = ethers.BigNumber.from("1500000");
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || feeData.gasPrice;
        const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice;

        return JSON.stringify({
          nonce: txNonce.toString(),
          gasLimit: gasLimit.toString(),
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        });
      }
    );

    const txParams = JSON.parse(txParamsJson);

    const unsignedTx = {
      type: 2,
      chainId: CHAIN_ID,
      nonce: toBigNumber(txParams.nonce, "nonce"),
      to: LICENSE_ATTACHMENT_WORKFLOWS,
      data: txData,
      gasLimit: toBigNumber(txParams.gasLimit, "gasLimit"),
      maxFeePerGas: toBigNumber(txParams.maxFeePerGas, "maxFeePerGas"),
      maxPriorityFeePerGas: toBigNumber(txParams.maxPriorityFeePerGas, "maxPriorityFeePerGas"),
      value: 0,
    };

    const txHash = ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTx));

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
          version: "story-register-sponsor-v1",
          signedTx,
          txHash,
          recipient,
          sponsor: SPONSOR_PKP_ADDRESS,
          contract: LICENSE_ATTACHMENT_WORKFLOWS,
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
    // STEP 4: Deterministic result extraction
    // ========================================

    // 4a. tokenId: parse mint Transfer from SPG NFT contract
    const ERC721_TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");
    const topicToAddress = (t) => ethers.utils.getAddress("0x" + t.slice(26));

    let tokenId = null;
    for (const log of broadcast.logs) {
      if (log.address.toLowerCase() !== SPG_NFT_CONTRACT.toLowerCase()) continue;
      if (log.topics?.[0] !== ERC721_TRANSFER_TOPIC) continue;
      const from = topicToAddress(log.topics[1]);
      if (from !== ethers.constants.AddressZero) continue;
      tokenId = ethers.BigNumber.from(log.topics[3]).toString();
      break;
    }
    if (!tokenId) throw new Error("Mint Transfer not found in receipt logs");

    // 4b. ipId: compute deterministically from (chainId, tokenContract, tokenId)
    const postBroadcastJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "queryRegistries" },
      async () => {
        try {
          const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

          const ipAssetRegistry = new ethers.Contract(
            IP_ASSET_REGISTRY,
            ["function ipId(uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)"],
            provider
          );
          const resolvedIpId = await ipAssetRegistry.ipId(CHAIN_ID, SPG_NFT_CONTRACT, tokenId);

          // 4c. licenseTermsIds: query LicenseRegistry
          const licenseRegistry = new ethers.Contract(
            LICENSE_REGISTRY,
            [
              "function getAttachedLicenseTermsCount(address ipId) view returns (uint256)",
              "function getAttachedLicenseTerms(address ipId, uint256 index) view returns (address, uint256)",
            ],
            provider
          );

          const count = (await licenseRegistry.getAttachedLicenseTermsCount(resolvedIpId)).toNumber();
          const terms = [];
          for (let i = 0; i < count; i++) {
            const [, termsId] = await licenseRegistry.getAttachedLicenseTerms(resolvedIpId, i);
            terms.push(termsId.toString());
          }

          return JSON.stringify({ ipId: resolvedIpId, licenseTermsIds: terms });
        } catch (err) {
          return JSON.stringify({ queryError: err?.message || String(err) });
        }
      }
    );

    const postBroadcast = JSON.parse(postBroadcastJson);
    if (postBroadcast.queryError) {
      throw new Error(`Registry query failed: ${postBroadcast.queryError}`);
    }

    const ipId = postBroadcast.ipId;
    const licenseTermsIds = postBroadcast.licenseTermsIds;

    // ========================================
    // STEP 5: Mint 1 license token (Tx #2) to force royalty vault deployment
    // ========================================
    // Tx #1 used this nonce; Tx #2 needs nonce + 1
    const tx1Nonce = Number(txParams.nonce);

    let licenseMintTxHash = null;
    if (mintLicenseToken && licenseTermsIds.length > 0) {
      const mintIface = new ethers.utils.Interface(LICENSING_MODULE_ABI);
      const mintData = mintIface.encodeFunctionData("mintLicenseTokens", [
        ipId,                          // licensorIpId
        PIL_LICENSE_TEMPLATE,          // licenseTemplate
        toBigNumber(licenseTermsIds[0], "licenseTermsId"), // first attached terms
        toBigNumber("1", "amount"),    // mint 1 token
        ethers.utils.getAddress(recipient), // receiver = user
        "0x",                          // royaltyContext (empty for PIL)
        toBigNumber("0", "maxMintingFee"), // 0 = no limit
        0,                             // maxRevenueShare (uint32, 0 = no cap)
      ]);

      // Use Tx #1 fee data (already fetched) and nonce + 1
      const mintUnsignedTx = {
        type: 2,
        chainId: CHAIN_ID,
        nonce: toBigNumber(String(tx1Nonce + 1), "nonce"),
        to: LICENSING_MODULE,
        data: mintData,
        gasLimit: toBigNumber("1500000", "gasLimit"), // first mint deploys royalty vault — needs ~1M gas
        maxFeePerGas: toBigNumber(txParams.maxFeePerGas, "maxFeePerGas"),
        maxPriorityFeePerGas: toBigNumber(txParams.maxPriorityFeePerGas, "maxPriorityFeePerGas"),
        value: 0,
      };

      const mintTxHash = ethers.utils.keccak256(ethers.utils.serializeTransaction(mintUnsignedTx));

      const mintSigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(mintTxHash)),
        publicKey: SPONSOR_PKP_PUBLIC_KEY,
        sigName: "sponsorMintLicenseSig",
      });

      if (typeof mintSigResult === "string" && mintSigResult.startsWith("[ERROR]")) {
        throw new Error(`License mint PKP signing failed: ${mintSigResult}`);
      }

      const mintSigObj = JSON.parse(mintSigResult);
      let mintV = Number(mintSigObj.recid ?? mintSigObj.recoveryId ?? mintSigObj.v);
      if (mintV === 0 || mintV === 1) mintV += 27;
      const mintSig = ethers.utils.joinSignature({
        r: `0x${strip0x(mintSigObj.r)}`,
        s: `0x${strip0x(mintSigObj.s)}`,
        v: mintV,
      });

      const signedMintTx = ethers.utils.serializeTransaction(mintUnsignedTx, mintSig);

      if (!dryRun) {
        const mintBroadcastJson = await Lit.Actions.runOnce(
          { waitForResponse: true, name: "broadcastMintLicenseTx" },
          async () => {
            try {
              const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
              const txResponse = await provider.sendTransaction(signedMintTx);
              const receipt = await txResponse.wait(1);
              return JSON.stringify({
                txHash: receipt.transactionHash,
                status: receipt.status,
              });
            } catch (err) {
              // Capture tx hash if available (tx was sent but reverted)
              const txHash = err?.transactionHash || err?.receipt?.transactionHash || null;
              return JSON.stringify({
                error: err?.reason || err?.message || String(err),
                code: err?.code,
                txHash,
              });
            }
          }
        );

        const mintBroadcast = JSON.parse(mintBroadcastJson);
        if (mintBroadcast.error) {
          throw new Error(`License mint broadcast failed: ${mintBroadcast.error} (tx: ${mintBroadcast.txHash || "unknown"})`);
        }
        licenseMintTxHash = mintBroadcast.txHash;
      }
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "story-register-sponsor-v1",
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        ipId,
        tokenId,
        licenseTermsIds,
        licenseMintTxHash,
        recipient,
        sponsor: SPONSOR_PKP_ADDRESS,
        contract: LICENSE_ATTACHMENT_WORKFLOWS,
        chainId: CHAIN_ID,
      }),
    });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "story-register-sponsor-v1",
        error: e?.message || String(e),
      }),
    });
  }
};

main();
