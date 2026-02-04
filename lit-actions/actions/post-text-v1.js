/**
 * Post Text v1
 *
 * Creates a text-only post: hash text → sign binding message → upload JSON to
 * Filebase IPFS → register IP Asset on Story Protocol.
 *
 * No image pipeline, no safety check, no fal.ai. Much simpler than post-create-v1.
 *
 * Auth model: Lit session = user intent. User PKP signs a binding message
 * (text hash + timestamp + nonce) inside the action for on-chain-verifiable proof.
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - text: Post text content
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - filebaseEncryptedKey: Lit-encrypted Filebase credentials
 *
 * Optional jsParams:
 * - title: Short title (defaults to first 80 chars of text)
 * - rightsMode: 0=Original, 1=Licensed, 2=Derivative, 3=PublicDomain (default: 0)
 * - parentIpId: bytes32 parent IP Asset ID (required if rightsMode=2)
 * - licenseEnabled: boolean (default false)
 * - commercialRevShare: uint32 revenue share % 0-100 (default: 10, only if licenseEnabled)
 * - filebasePlaintextKey: Dev override
 * - dryRun: boolean (default false) — skip Story broadcast
 *
 * Returns: { success, contentCid, ipId, tokenId, txHash }
 */

// ============================================================
// CONSTANTS
// ============================================================

// Story Protocol (Aeneid Testnet)
const STORY_CHAIN_ID = 1315;
const STORY_RPC_URL = "https://aeneid.storyrpc.io";

// MegaETH (PostsV1 — cross-chain mirror)
const MEGA_CHAIN_ID = 6343;
const MEGA_RPC_URL = "https://carrot.megaeth.com/rpc";
const MEGA_GAS_PRICE = "1000000";
const MEGA_GAS_LIMIT = "2000000";
const POSTS_V1 = "0xFe674F421c2bBB6D664c7F5bc0D5A0204EE0bFA6";
const LICENSE_ATTACHMENT_WORKFLOWS = "0xcC2E862bCee5B6036Db0de6E06Ae87e524a79fd8";
const REGISTRATION_WORKFLOWS = "0xbe39E1C756e921BD25DF86e7AAa31106d1eb0424";
const PIL_LICENSE_TEMPLATE = "0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316";
const ROYALTY_POLICY_LAP = "0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E";
const WIP_TOKEN = "0x1514000000000000000000000000000000000000";
const IP_ASSET_REGISTRY = "0x77319B4031e6eF1250907aa00018B8B1c67a244b";
const SPG_NFT_CONTRACT = "0xb1764abf89e6a151ea27824612145ef89ed70a73";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

// Filebase IPFS gateway
const IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs";

const MAX_TEXT_LENGTH = 5000;

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

const parseRunOnce = (result, stepName) => {
  const s = String(result || "").trim();
  if (s.startsWith("[ERROR]") || s.includes("[ERROR]"))
    throw new Error(`${stepName} failed: ${s.slice(0, 300)}`);
  return JSON.parse(s);
};

const strip0x = (v) => (String(v || "").startsWith("0x") ? String(v).slice(2) : String(v));

const toBigNumber = (value, label) => {
  if (typeof value === "bigint") return ethers.BigNumber.from(value.toString());
  if (typeof value === "number") return ethers.BigNumber.from(value);
  if (typeof value === "string") return ethers.BigNumber.from(value);
  throw new Error(`Invalid ${label}`);
};

// ============================================================
// SHA-256 + FILEBASE S3 (AWS Sig V4)
// ============================================================

async function sha256Bytes(data) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const hash = await sha256Bytes(encoder.encode(message));
  return bytesToHex(hash);
}

async function hmacSha256(key, message) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function hmacHex(key, message) {
  const sig = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(secretKey, dateStamp, region, service) {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(encoder.encode("AWS4" + secretKey), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function uploadToFilebase(filebaseApiKey, content, contentType, fileName) {
  const decoded = atob(filebaseApiKey);
  const [accessKey, secretKey, bucket] = decoded.split(":");
  if (!accessKey || !secretKey || !bucket)
    throw new Error("Invalid Filebase API key format");

  const endpoint = "s3.filebase.com";
  const region = "us-east-1";
  const service = "s3";

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${bucket}/${fileName}`;

  const payloadHash = await sha256Hex(content);

  const canonicalHeaders =
    [`host:${endpoint}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join(
      "\n"
    ) + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(secretKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const response = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "Content-Type": contentType,
    },
    body: content,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Filebase upload failed: ${response.status} ${text}`);
  }

  const cid = response.headers.get("x-amz-meta-cid");
  if (!cid) throw new Error("No CID returned from Filebase");

  return cid;
}

// ============================================================
// STORY PROTOCOL ABI
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

const REGISTRATION_ABI = [
  `function mintAndRegisterIp(
    address spgNftContract,
    address recipient,
    (string ipMetadataURI, bytes32 ipMetadataHash, string nftMetadataURI, bytes32 nftMetadataHash) ipMetadata,
    bool allowDuplicates
  ) external returns (address ipId, uint256 tokenId)`,
];

const POSTS_V1_ABI = [
  "function postFor(address creator, bytes32 ipId, uint8 contentType, string metadataUri, bool isAdult) external",
];

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      text,
      timestamp,
      nonce,
      filebaseEncryptedKey,
      filebasePlaintextKey,
      title: titleParam,
      description,
      rightsMode = 0,
      parentIpId,
      licenseEnabled = false,
      commercialRevShare = 10,
      dryRun = false,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(text, "text");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    if (typeof text !== "string" || text.trim().length === 0)
      throw new Error("text must be a non-empty string");
    if (text.length > MAX_TEXT_LENGTH)
      throw new Error(`text exceeds max length (${text.length} > ${MAX_TEXT_LENGTH})`);

    const title = titleParam || text.slice(0, 80).trim();

    // Validate rightsMode
    const rm = Number(rightsMode);
    if (![0, 1, 2, 3].includes(rm))
      throw new Error(`Invalid rightsMode: ${rightsMode} (expected 0-3)`);
    if (rm === 2 && !parentIpId)
      throw new Error("parentIpId is required for derivative posts (rightsMode=2)");

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);

    const revShare = Number(commercialRevShare);
    if (licenseEnabled && (revShare < 0 || revShare > 100))
      throw new Error(`commercialRevShare must be 0-100, got ${revShare}`);

    // ========================================
    // STEP 1: Validate request freshness
    // ========================================
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000)
      throw new Error("Request expired (timestamp older than 5 minutes)");

    // ========================================
    // STEP 2: Hash text + sign binding message
    // ========================================
    const textHash = await sha256Hex(text);
    const message = `heaven:post-text:${textHash}:${timestamp}:${nonce}`;
    const msgHash = ethers.utils.hashMessage(message);

    let sigResult;
    try {
      sigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(msgHash)),
        publicKey: userPkpPublicKey,
        sigName: "user_post_text_sig",
      });
    } catch (sigErr) {
      throw new Error(`User PKP signing failed: ${sigErr?.message || sigErr}`);
    }
    const sigStr = String(sigResult || "").trim();
    if (sigStr.startsWith("[ERROR]") || sigStr.includes("[ERROR]"))
      throw new Error(`User PKP signing failed: ${sigStr.slice(0, 200)}`);

    const sigObj = JSON.parse(sigStr);
    let userV = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
    if (userV === 0 || userV === 1) userV += 27;
    const signature = ethers.utils.joinSignature({
      r: `0x${strip0x(sigObj.r)}`,
      s: `0x${strip0x(sigObj.s)}`,
      v: userV,
    });

    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase())
      throw new Error("Signature mismatch");

    // ========================================
    // STEP 3: Decrypt Filebase key
    // ========================================
    const decryptKey = async (encrypted, plaintext, label) => {
      if (plaintext) return plaintext;
      if (!encrypted) throw new Error(`${label} is required`);
      return Lit.Actions.decryptAndCombine({
        accessControlConditions: encrypted.accessControlConditions,
        ciphertext: encrypted.ciphertext,
        dataToEncryptHash: encrypted.dataToEncryptHash,
        authSig: null,
        chain: "ethereum",
      });
    };

    const filebaseKey = await decryptKey(filebaseEncryptedKey, filebasePlaintextKey, "filebaseKey");

    // ========================================
    // STEP 4: Upload content + metadata to Filebase
    // ========================================
    const prefix = `${userAddress.slice(2, 10)}-${timestamp}`;

    const contentJson = JSON.stringify({
      type: "text",
      text,
      title,
      description: description || "",
      creator: userAddress,
      createdAt: new Date(Number(timestamp)).toISOString(),
      rightsMode: rm,
      parentIpId: parentIpId || undefined,
      appId: "heaven",
    });

    const ipaMetadata = {
      title,
      description: description || text.slice(0, 200),
      createdAt: new Date(Number(timestamp)).toISOString(),
      creator: userAddress,
      contentType: "text",
      rightsMode: rm,
      parentIpId: parentIpId || undefined,
      appId: "heaven",
    };

    const nftMetadata = {
      name: title,
      description: description || text.slice(0, 200),
      external_url: "https://heaven.love",
      attributes: [
        { trait_type: "Type", value: "text" },
        { trait_type: "Rights", value: ["Original", "Licensed", "Derivative", "PublicDomain"][rm] || "Original" },
        { trait_type: "Creator", value: userAddress },
      ],
    };

    const uploadResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "uploadFiles" },
      async () => {
        const ipaJson = JSON.stringify(ipaMetadata);
        const nftJson = JSON.stringify(nftMetadata);

        const contentCid = await uploadToFilebase(
          filebaseKey,
          contentJson,
          "application/json",
          `post-text-${prefix}.json`
        );
        const ipaCid = await uploadToFilebase(
          filebaseKey,
          ipaJson,
          "application/json",
          `post-text-ipa-${prefix}.json`
        );
        const nftCid = await uploadToFilebase(
          filebaseKey,
          nftJson,
          "application/json",
          `post-text-nft-${prefix}.json`
        );

        const encoder = new TextEncoder();
        const ipaHashBytes = await sha256Bytes(encoder.encode(ipaJson));
        const nftHashBytes = await sha256Bytes(encoder.encode(nftJson));

        return JSON.stringify({
          contentCid,
          ipaCid,
          nftCid,
          ipaHash: "0x" + bytesToHex(ipaHashBytes),
          nftHash: "0x" + bytesToHex(nftHashBytes),
        });
      }
    );

    const { contentCid, ipaCid, nftCid, ipaHash, nftHash } = parseRunOnce(uploadResult, "File upload");

    const ipMetadataURI = `${IPFS_GATEWAY}/${ipaCid}`;
    const nftMetadataURI = `${IPFS_GATEWAY}/${nftCid}`;

    // ========================================
    // STEP 5: Register on Story Protocol
    // ========================================
    const ipMetadata = {
      ipMetadataURI,
      ipMetadataHash: ipaHash,
      nftMetadataURI,
      nftMetadataHash: nftHash,
    };

    let txData;
    let txTarget;

    if (licenseEnabled) {
      const iface = new ethers.utils.Interface(LICENSE_ATTACHMENT_ABI);
      const pilTerms = {
        transferable: true,
        royaltyPolicy: ROYALTY_POLICY_LAP,
        defaultMintingFee: toBigNumber("0", "defaultMintingFee"),
        expiration: toBigNumber("0", "expiration"),
        commercialUse: true,
        commercialAttribution: true,
        commercializerChecker: ethers.constants.AddressZero,
        commercializerCheckerData: "0x",
        commercialRevShare: revShare * 1000000,
        commercialRevCeiling: toBigNumber("0", "commercialRevCeiling"),
        derivativesAllowed: true,
        derivativesAttribution: true,
        derivativesApproval: false,
        derivativesReciprocal: true,
        derivativeRevCeiling: toBigNumber("0", "derivativeRevCeiling"),
        currency: WIP_TOKEN,
        uri: "",
      };
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
      txData = iface.encodeFunctionData("mintAndRegisterIpAndAttachPILTerms", [
        SPG_NFT_CONTRACT,
        ethers.utils.getAddress(userAddress),
        ipMetadata,
        [{ terms: pilTerms, licensingConfig }],
        true,
      ]);
      txTarget = LICENSE_ATTACHMENT_WORKFLOWS;
    } else {
      const iface = new ethers.utils.Interface(REGISTRATION_ABI);
      txData = iface.encodeFunctionData("mintAndRegisterIp", [
        SPG_NFT_CONTRACT,
        ethers.utils.getAddress(userAddress),
        ipMetadata,
        true,
      ]);
      txTarget = REGISTRATION_WORKFLOWS;
    }

    // Get tx params
    const txParamsJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxParams" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(STORY_RPC_URL);
        const [txNonce, feeData] = await Promise.all([
          provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending"),
          provider.getFeeData(),
        ]);
        return JSON.stringify({
          nonce: txNonce.toString(),
          gasLimit: "1500000",
          maxFeePerGas: (feeData.maxFeePerGas || feeData.gasPrice).toString(),
          maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas || feeData.gasPrice).toString(),
        });
      }
    );

    const txParams = parseRunOnce(txParamsJson, "TX params fetch");

    const unsignedTx = {
      type: 2,
      chainId: STORY_CHAIN_ID,
      nonce: toBigNumber(txParams.nonce, "nonce"),
      to: txTarget,
      data: txData,
      gasLimit: toBigNumber(txParams.gasLimit, "gasLimit"),
      maxFeePerGas: toBigNumber(txParams.maxFeePerGas, "maxFeePerGas"),
      maxPriorityFeePerGas: toBigNumber(txParams.maxPriorityFeePerGas, "maxPriorityFeePerGas"),
      value: 0,
    };

    const txHashToSign = ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTx));

    let sponsorSigResult;
    try {
      sponsorSigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(txHashToSign)),
        publicKey: SPONSOR_PKP_PUBLIC_KEY,
        sigName: "sponsorPostTextSig",
      });
    } catch (sigErr) {
      throw new Error(`Sponsor PKP signing failed: ${sigErr?.message || sigErr}`);
    }
    const sponsorSigStr = String(sponsorSigResult || "").trim();
    if (sponsorSigStr.startsWith("[ERROR]"))
      throw new Error(`Sponsor PKP signing failed: ${sponsorSigStr}`);

    const sponsorSig = JSON.parse(sponsorSigStr);
    let v = Number(sponsorSig.recid ?? sponsorSig.recoveryId ?? sponsorSig.v);
    if (v === 0 || v === 1) v += 27;
    const sig = ethers.utils.joinSignature({
      r: `0x${strip0x(sponsorSig.r)}`,
      s: `0x${strip0x(sponsorSig.s)}`,
      v,
    });

    const signedTx = ethers.utils.serializeTransaction(unsignedTx, sig);

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "post-text-v1",
          contentCid,
          ipaCid,
          nftCid,
          signedTx,
          user: userAddress,
          rightsMode: rm,
          licenseEnabled,
        }),
      });
      return;
    }

    // Broadcast
    const broadcastResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "broadcastTx" },
      async () => {
        try {
          const provider = new ethers.providers.JsonRpcProvider(STORY_RPC_URL);
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

    const broadcast = parseRunOnce(broadcastResult, "TX broadcast");
    if (broadcast.broadcastError)
      throw new Error(`TX broadcast failed: ${broadcast.broadcastError}`);

    // Extract tokenId + ipId
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

    // Query ipId
    const postQueryJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "queryIpId" },
      async () => {
        try {
          const provider = new ethers.providers.JsonRpcProvider(STORY_RPC_URL);
          const registry = new ethers.Contract(
            IP_ASSET_REGISTRY,
            ["function ipId(uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)"],
            provider
          );
          const resolvedIpId = await registry.ipId(STORY_CHAIN_ID, SPG_NFT_CONTRACT, tokenId);
          return JSON.stringify({ ipId: resolvedIpId });
        } catch (err) {
          return JSON.stringify({ queryError: err?.message || String(err) });
        }
      }
    );

    const postQuery = parseRunOnce(postQueryJson, "ipId query");
    if (postQuery.queryError) throw new Error(`ipId query failed: ${postQuery.queryError}`);

    const ipIdAddress = postQuery.ipId;
    const ipIdBytes32 = ethers.utils.hexZeroPad(ipIdAddress, 32);

    // ========================================
    // STEP 6: Mirror post on MegaETH (PostsV1)
    // ========================================
    let megaTxHash = null;
    try {
      const postsIface = new ethers.utils.Interface(POSTS_V1_ABI);
      const megaCalldata = postsIface.encodeFunctionData("postFor", [
        ethers.utils.getAddress(userAddress),
        ipIdBytes32,
        0, // TYPE_TEXT
        ipMetadataURI,
        false, // text posts are never adult
      ]);

      const megaParamsJson = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "getMegaParams" },
        async () => {
          const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
          const nonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
          return JSON.stringify({ nonce: nonce.toString() });
        }
      );
      const megaParams = parseRunOnce(megaParamsJson, "MegaETH params");

      const megaUnsigned = {
        type: 0,
        chainId: MEGA_CHAIN_ID,
        nonce: toBigNumber(megaParams.nonce, "megaNonce"),
        to: POSTS_V1,
        data: megaCalldata,
        gasLimit: toBigNumber(MEGA_GAS_LIMIT, "megaGasLimit"),
        gasPrice: toBigNumber(MEGA_GAS_PRICE, "megaGasPrice"),
        value: 0,
      };

      const megaTxHashToSign = ethers.utils.keccak256(ethers.utils.serializeTransaction(megaUnsigned));
      const megaSigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(megaTxHashToSign)),
        publicKey: SPONSOR_PKP_PUBLIC_KEY,
        sigName: "sponsorMegaPostTextSig",
      });
      const megaSigStr = String(megaSigResult || "").trim();
      if (megaSigStr.startsWith("[ERROR]")) throw new Error(megaSigStr);

      const megaSigObj = JSON.parse(megaSigStr);
      let megaV = Number(megaSigObj.recid ?? megaSigObj.recoveryId ?? megaSigObj.v);
      if (megaV === 0 || megaV === 1) megaV += 27;
      const megaSig = ethers.utils.joinSignature({
        r: `0x${strip0x(megaSigObj.r)}`,
        s: `0x${strip0x(megaSigObj.s)}`,
        v: megaV,
      });

      const megaSignedTx = ethers.utils.serializeTransaction(megaUnsigned, megaSig);

      const megaBroadcastResult = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "broadcastMegaTx" },
        async () => {
          try {
            const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
            const txResp = await provider.sendTransaction(megaSignedTx);
            const receipt = await txResp.wait(1);
            return JSON.stringify({ txHash: receipt.transactionHash, status: receipt.status });
          } catch (err) {
            return JSON.stringify({ broadcastError: err?.reason || err?.message || String(err) });
          }
        }
      );

      const megaBroadcast = parseRunOnce(megaBroadcastResult, "MegaETH broadcast");
      if (!megaBroadcast.broadcastError) {
        megaTxHash = megaBroadcast.txHash;
      }
    } catch (megaErr) {
      // MegaETH mirror is best-effort — Story registration already succeeded
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "post-text-v1",
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        ipId: ipIdAddress,
        ipIdBytes32,
        tokenId,
        contentCid,
        ipaCid,
        nftCid,
        user: userAddress,
        rightsMode: rm,
        licenseEnabled,
        megaTxHash,
      }),
    });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "post-text-v1",
        error: e?.message || String(e),
      }),
    });
  }
};

main();
