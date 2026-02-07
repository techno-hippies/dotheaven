/**
 * Post Register v1
 *
 * Unified post registration for text AND photo posts. Handles:
 * 1. Text posts: AI safety check, metadata upload, MegaETH mirror (no Story)
 * 2. Photo posts: Metadata upload, Story IP registration, MegaETH mirror
 *
 * For photo posts, the heavy lifting (image safety check, AI conversion, upload)
 * is handled by the Media Worker. This action builds metadata and registers.
 *
 * Auth model: Lit session authorization = user intent. The action runs under the
 * user's authenticated Lit session (PKP ownership verified by Lit Protocol).
 * The user PKP signs a binding message (contentId + timestamp + nonce)
 * inside the action to produce an on-chain-verifiable proof of intent.
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - filebaseEncryptedKey: Lit-encrypted Filebase credentials (for metadata upload)
 * - ONE OF:
 *   - text: Text content for text posts (max 5000 chars)
 *   - imageCid: IPFS CID of the uploaded image (from Media Worker) for photo posts
 *
 * Optional jsParams:
 * - title: Post title (auto-generated for text posts if not provided)
 * - description: Post description / longer caption
 * - isAdult: boolean (default false) — 18+ flag (from Media Worker or text safety check)
 * - contentType: MIME type of image (default 'image/jpeg', only for photo posts)
 * - rightsMode: 0=Original, 1=Licensed, 2=Derivative, 3=PublicDomain (default: 0)
 * - parentIpId: bytes32 parent IP Asset ID (required if rightsMode=2)
 * - licenseEnabled: boolean (default false) — attach PIL Commercial Remix terms
 * - commercialRevShare: uint32 revenue share % 0-100 (default: 10, only if licenseEnabled)
 * - filebasePlaintextKey: Dev override
 * - openrouterEncryptedKey: Lit-encrypted OpenRouter key (for text safety check)
 * - openrouterPlaintextKey: Dev override for OpenRouter key
 * - signature: Pre-signed EIP-191 signature (skips in-action PKP signing if provided)
 * - dryRun: boolean (default false) — skip Story broadcast
 * - skipStoryRegistration: boolean — skip Story Protocol (auto-true for text posts)
 * - attribution: { ownership, sourceUrl, sourcePlatform, sourceHandle } — for shared content
 *
 * Returns: { success, ipIdBytes32, contentIdBytes32, ipId?, tokenId?, txHash?, megaTxHash }
 */

// ============================================================
// CONSTANTS
// ============================================================

// Story Protocol (Aeneid Testnet — update for mainnet)
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
const LICENSE_REGISTRY = "0x529a750E02d8E2f15649c13D69a465286a780e24";
const SPG_NFT_CONTRACT = "0xb1764abf89e6a151ea27824612145ef89ed70a73";

// Sponsor PKP
const SPONSOR_PKP_PUBLIC_KEY =
  "044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08";
const SPONSOR_PKP_ADDRESS = "0x089fc7801D8f7D487765343a7946b1b97A7d29D4";

// Filebase IPFS gateway
const IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs";

// Safety check model (for text-only posts)
const SAFETY_CHECK_MODEL = "google/gemini-2.0-flash-001";

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

async function sha256HexFromBuffer(buffer) {
  const hash = await sha256Bytes(buffer);
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

  let payloadHash;
  if (typeof content === "string") {
    payloadHash = await sha256Hex(content);
  } else {
    payloadHash = await sha256HexFromBuffer(content);
  }

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
// TEXT CONTENT SAFETY CHECK (OpenRouter)
// ============================================================

/**
 * Classifies text content for 18+ status and detects language.
 * @param openRouterKey - OpenRouter API key
 * @param text - Text content to classify
 * @returns { safe: boolean, isAdult: boolean, lang: string, reason?: string }
 */
async function textSafetyCheck(openRouterKey, text) {
  if (!text || text.trim().length === 0) {
    return { safe: true, isAdult: false, lang: "en" };
  }

  const promptText = `Classify this text for content safety and detect its language. Respond with ONLY a JSON object, no markdown.

RULES:
- safe=false: illegal content, CSAM references, graphic violence instructions, hate speech inciting violence
- isAdult=true: ANY of these:
  • Explicit sexual content, graphic descriptions
  • Heavy profanity, vulgar language (fuck, shit, etc.)
  • Drug use references or glorification
  • Sexually charged comments, innuendo, flirting
  • Graphic violence descriptions
- lang: ISO 639-1 language code of the text (e.g. "en", "ja", "es", "fr", "de", "zh", "ko")
- reason: brief explanation (required if safe=false)

EXAMPLES:
"beautiful sunset today" → {"safe":true,"isAdult":false,"lang":"en"}
"damn this party is wild af 🔥" → {"safe":true,"isAdult":true,"lang":"en"}
"今日はいい天気ですね" → {"safe":true,"isAdult":false,"lang":"ja"}
"putain c'est génial" → {"safe":true,"isAdult":true,"lang":"fr"}
"great job on the project" → {"safe":true,"isAdult":false,"lang":"en"}

TEXT TO CLASSIFY: "${text.slice(0, 2000)}"`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SAFETY_CHECK_MODEL,
      messages: [{ role: "user", content: promptText }],
      temperature: 0,
      max_tokens: 100,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Text safety check failed: ${response.status} ${errText}`);
  }

  const result = await response.json();
  const answer = (result.choices?.[0]?.message?.content || "").trim();

  try {
    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);
    // Ensure lang is a valid 2-char code, default to "en"
    if (!parsed.lang || typeof parsed.lang !== "string" || parsed.lang.length !== 2) {
      parsed.lang = "en";
    }
    return parsed;
  } catch {
    // Conservative fallback: mark as adult if we can't parse
    return { safe: true, isAdult: true, lang: "en", reason: "Could not classify" };
  }
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
      imageCid,
      text,                              // Text content for text posts
      title,
      timestamp,
      nonce,
      filebaseEncryptedKey,
      filebasePlaintextKey,
      openrouterEncryptedKey,            // For text safety check
      openrouterPlaintextKey,            // Dev override
      description = "",
      isAdult: isAdultOverride,          // Caller can override (e.g., from Media Worker)
      contentType = "image/jpeg",
      rightsMode = 0,
      parentIpId,
      licenseEnabled = false,
      commercialRevShare = 10,
      dryRun = false,
      skipStoryRegistration,             // Now undefined by default (auto-detected)
      attribution,
      signature: preSignedSig,           // Pre-signed EIP-191 (skips in-action PKP signing)
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    // Detect post type: text vs photo
    const isTextPost = !!text && !imageCid;
    const isPhotoPost = !!imageCid;
    if (!isTextPost && !isPhotoPost) {
      throw new Error("Either 'text' or 'imageCid' is required");
    }
    if (isTextPost && text.length > 5000) {
      throw new Error("Text exceeds 5000 character limit");
    }

    // For text posts, title defaults to first 80 chars
    const postTitle = title || (isTextPost ? text.slice(0, 80) + (text.length > 80 ? "..." : "") : "");
    if (!postTitle) throw new Error("title is required for photo posts");

    // Auto-detect skipStoryRegistration: default true for text, false for photos
    const shouldSkipStory = skipStoryRegistration !== undefined
      ? skipStoryRegistration
      : isTextPost;

    // Validate rightsMode
    const rm = Number(rightsMode);
    if (![0, 1, 2, 3].includes(rm))
      throw new Error(`Invalid rightsMode: ${rightsMode} (expected 0-3)`);
    if (rm === 2 && !parentIpId)
      throw new Error("parentIpId is required for derivative posts (rightsMode=2)");

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);

    // Validate + scale rev share (Story uses 10^6 scale: 100% = 100_000_000, 1% = 1_000_000)
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
    // STEP 2: Sign binding message with user PKP
    // ========================================
    // For text posts, hash the text content for binding
    const contentIdentifier = isTextPost
      ? ethers.utils.keccak256(ethers.utils.toUtf8Bytes(text)).slice(0, 18) // first 8 bytes as hex
      : imageCid;
    const message = `heaven:post:${contentIdentifier}:${timestamp}:${nonce}`;

    let signature;

    if (preSignedSig) {
      // Use pre-signed signature (e.g. from frontend PKP signing or test harness)
      signature = preSignedSig;
    } else {
      // Sign within Lit Action using user's PKP
      const msgHash = ethers.utils.hashMessage(message);
      let sigResult;
      try {
        sigResult = await Lit.Actions.signAndCombineEcdsa({
          toSign: Array.from(ethers.utils.arrayify(msgHash)),
          publicKey: userPkpPublicKey,
          sigName: "user_post_sig",
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
      signature = ethers.utils.joinSignature({
        r: `0x${strip0x(sigObj.r)}`,
        s: `0x${strip0x(sigObj.s)}`,
        v: userV,
      });
    }

    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase())
      throw new Error("Signature mismatch");

    // ========================================
    // STEP 3: Decrypt Filebase API key
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
    // STEP 3.5: Text safety check (text posts only)
    // ========================================
    let isAdult = isAdultOverride || false;
    let detectedLang = null; // ISO 639-1 code from safety check

    if (isTextPost && !isAdultOverride) {
      // Decrypt OpenRouter key and run safety check
      const openRouterKey = await decryptKey(openrouterEncryptedKey, openrouterPlaintextKey, "openrouterKey");

      const safetyResult = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "textSafetyCheck" },
        async () => {
          const result = await textSafetyCheck(openRouterKey, text);
          return JSON.stringify(result);
        }
      );

      const safety = parseRunOnce(safetyResult, "Text safety check");

      if (!safety.safe) {
        throw new Error(
          `Content rejected: ${safety.reason || "violates content policy"}. ` +
          "Illegal or harmful content is not allowed."
        );
      }

      isAdult = !!safety.isAdult;
      detectedLang = safety.lang || null;
    }

    // ========================================
    // STEP 4: Build + upload metadata
    // ========================================
    const prefix = `${userAddress.slice(2, 10)}-${timestamp}`;

    // Compute IDs upfront so they can be included in metadata
    // Compute content hash for IDs
    const contentHash = isTextPost
      ? ethers.utils.keccak256(ethers.utils.toUtf8Bytes(text))
      : imageCid;

    // postId = unique per post (author + timestamp + content)
    const postIdBytes32 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`heaven:post:${userAddress}:${timestamp}:${contentHash}`));
    // contentId = same for identical content (for clustering/deduplication)
    const contentIdBytes32 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`heaven:content:${contentHash}`));

    const ipaMetadata = {
      title: postTitle,
      description,
      createdAt: new Date(Number(timestamp)).toISOString(),
      creator: userAddress,
      // For text posts, store text directly; for photos, store media URL
      ...(isTextPost
        ? { text, contentType: "text/plain" }
        : { mediaUrl: `${IPFS_GATEWAY}/${imageCid}`, mediaType: contentType }
      ),
      isAdult,
      // Language detected by AI safety check (ISO 639-1, text posts only)
      ...(detectedLang ? { language: detectedLang } : {}),
      rightsMode: rm,
      parentIpId: parentIpId || undefined,
      appId: "heaven",
      postType: isTextPost ? "text" : "photo",
      // Post identifiers (for indexers)
      postId: postIdBytes32,
      contentId: contentIdBytes32,
      // Attribution for shared content
      ...(attribution ? {
        attribution: {
          ownership: attribution.ownership,
          sourceUrl: attribution.sourceUrl,
          sourcePlatform: attribution.sourcePlatform,
          sourceHandle: attribution.sourceHandle,
        },
      } : {}),
    };

    const nftMetadata = {
      name: postTitle,
      description: isTextPost
        ? text.slice(0, 200) + (text.length > 200 ? "..." : "")
        : (description || `Photo post by ${userAddress.slice(0, 10)}...`),
      ...(isPhotoPost ? { image: `${IPFS_GATEWAY}/${imageCid}` } : {}),
      external_url: `https://heaven.love`,
      attributes: [
        { trait_type: "Type", value: isTextPost ? "Text" : "Photo" },
        { trait_type: "Rights", value: ["Original", "Licensed", "Derivative", "PublicDomain"][rm] || "Original" },
        { trait_type: "Adult", value: isAdult ? "Yes" : "No" },
        { trait_type: "Creator", value: userAddress },
      ],
    };

    const metaUploadResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "uploadMetadata" },
      async () => {
        const ipaJson = JSON.stringify(ipaMetadata);
        const nftJson = JSON.stringify(nftMetadata);

        const ipaCid = await uploadToFilebase(
          filebaseKey,
          ipaJson,
          "application/json",
          `post-ipa-${prefix}.json`
        );
        const nftCid = await uploadToFilebase(
          filebaseKey,
          nftJson,
          "application/json",
          `post-nft-${prefix}.json`
        );

        // Compute hashes for Story registration
        const encoder = new TextEncoder();
        const ipaHashBytes = await sha256Bytes(encoder.encode(ipaJson));
        const nftHashBytes = await sha256Bytes(encoder.encode(nftJson));

        return JSON.stringify({
          ipaCid,
          nftCid,
          ipaHash: "0x" + bytesToHex(ipaHashBytes),
          nftHash: "0x" + bytesToHex(nftHashBytes),
        });
      }
    );

    const { ipaCid, nftCid, ipaHash, nftHash } = parseRunOnce(metaUploadResult, "Metadata upload");

    const ipMetadataURI = `${IPFS_GATEWAY}/${ipaCid}`;
    const nftMetadataURI = `${IPFS_GATEWAY}/${nftCid}`;

    // Variables for Story registration results (or fallback for shared content)
    let ipIdAddress = null;
    let ipIdBytes32 = null;
    let tokenId = null;
    let storyTxHash = null;
    let blockNumber = null;

    if (skipStoryRegistration) {
      // ========================================
      // STEP 5a: Skip Story — use pre-computed post ID for MegaETH
      // ========================================
      // For shared content, use the pre-computed postIdBytes32
      // This ensures each post gets a unique identifier even if multiple users post the same image
      ipIdBytes32 = postIdBytes32;
      // ipIdAddress remains null (no Story registration)
      // tokenId remains null (no NFT minted)
    } else {
      // ========================================
      // STEP 5b: Register on Story Protocol
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
      // Use LicenseAttachmentWorkflows — mint + register + attach PIL terms
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
        commercialRevShare: revShare * 1000000, // Story 10^6 scale: 1% = 1_000_000, 10% = 10_000_000
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
        true, // allowDuplicates
      ]);
      txTarget = LICENSE_ATTACHMENT_WORKFLOWS;
    } else {
      // Use RegistrationWorkflows — mint + register only (no license)
      const iface = new ethers.utils.Interface(REGISTRATION_ABI);
      txData = iface.encodeFunctionData("mintAndRegisterIp", [
        SPG_NFT_CONTRACT,
        ethers.utils.getAddress(userAddress),
        ipMetadata,
        true, // allowDuplicates
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
        sigName: "sponsorPostSig",
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
          version: "post-register-v1",
          cid: imageCid,
          ipaCid,
          nftCid,
          signedTx,
          user: userAddress,
          isAdult,
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

      // Normalize ipId (address) to bytes32 for PostsV1 compatibility
      // bytes32(uint256(uint160(address)))
      ipIdAddress = postQuery.ipId;
      ipIdBytes32 = ethers.utils.hexZeroPad(ipIdAddress, 32);
      storyTxHash = broadcast.txHash;
      blockNumber = broadcast.blockNumber;
    } // End of Story Protocol registration block

    // ========================================
    // STEP 6: Mirror post on MegaETH (PostsV1)
    // ========================================
    let megaTxHash = null;
    try {
      const postsIface = new ethers.utils.Interface(POSTS_V1_ABI);
      const megaCalldata = postsIface.encodeFunctionData("postFor", [
        ethers.utils.getAddress(userAddress),
        ipIdBytes32,
        isTextPost ? 0 : 1, // TYPE_TEXT = 0, TYPE_PHOTO = 1
        ipMetadataURI,
        isAdult,
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
        sigName: "sponsorMegaPostSig",
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
      // MegaETH mirror is best-effort — don't fail the whole post
      // Story registration already succeeded
      console.log("MegaETH mirror error (best-effort):", megaErr?.message || String(megaErr));
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "post-register-v1",
        txHash: storyTxHash,
        blockNumber,
        ipId: ipIdAddress,
        ipIdBytes32,          // Unique per post (author + timestamp + content)
        contentIdBytes32,     // Same for identical content (for clustering/deduplication)
        tokenId,
        cid: imageCid,
        ipaCid,
        nftCid,
        user: userAddress,
        isAdult,
        rightsMode: rm,
        licenseEnabled,
        megaTxHash,
        // Attribution info
        skipStoryRegistration,
        attribution: attribution || null,
      }),
    });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "post-register-v1",
        error: e?.message || String(e),
      }),
    });
  }
};

main();
