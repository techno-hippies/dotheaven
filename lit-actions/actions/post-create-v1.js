/**
 * Post Create v1
 *
 * Creates a photo post: content safety gate → optional AI anime conversion →
 * encrypted original upload → public result upload → Story IP registration.
 *
 * Auth model: Lit session authorization = user intent. The action runs under the
 * user's authenticated Lit session (PKP ownership verified by Lit Protocol).
 * The user PKP signs a binding message (image hash + timestamp + nonce)
 * inside the action to produce an on-chain-verifiable proof of intent.
 *
 * Flow:
 * 1. Validate params + request freshness
 * 2. Fetch image + compute hash, sign binding message with user PKP
 * 3. Decrypt API keys (Filebase, OpenRouter, fal.ai)
 * 4. LLM vision safety check (~2-3s) — reject nudity/CSAM/violence/PII BEFORE any spend
 *    - Also classifies: isAnime (already anime/illustration?) + hasFace
 *    - Auto-detect mode: real photo with face → "ai" (anime conversion)
 *    - Already anime or no face → "direct" (upload as-is)
 * 5. If auto-detected AI mode: call fal.ai Klein 9B (~4s) → anime conversion
 * 6. Strip EXIF metadata from images
 * 7. Encrypt original photo (AES-256-GCM) + upload ciphertext to Filebase
 * 8. Upload anime result (or direct photo) to Filebase (public)
 * 9. Build + upload IPA metadata + NFT metadata to Filebase
 * 10. Sponsor PKP mints NFT + registers IP Asset on Story Protocol
 * 11. Return { sourceCid, resultCid, ipId, tokenId, txHash, sourceDecryptionKey }
 *     Client must seal sourceDecryptionKey with Lit access conditions (LitNodeClient.encrypt)
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - imageUrl: Temporary URL or inline { base64, contentType }
 * - title: Post title / caption
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - filebaseEncryptedKey: Lit-encrypted Filebase credentials
 * - openrouterEncryptedKey: Lit-encrypted OpenRouter API key (for safety check)
 * - falEncryptedKey: Lit-encrypted fal.ai API key (for anime conversion)
 *
 * Optional jsParams:
 * - description: Post description / longer caption
 * - rightsMode: 0=Original, 1=Licensed, 2=Derivative, 3=PublicDomain (default: 0)
 * - parentIpId: bytes32 parent IP Asset ID (required if rightsMode=2)
 * - licenseEnabled: boolean (default false) — attach PIL Commercial Remix terms
 * - commercialRevShare: uint32 revenue share % 0-100 (default: 10, only if licenseEnabled)
 * - filebasePlaintextKey: Dev override
 * - openrouterPlaintextKey: Dev override
 * - falPlaintextKey: Dev override
 * - skipSafetyCheck: boolean (default false) — dev only
 * - dryRun: boolean (default false) — skip Story broadcast
 *
 * Returns: { success, sourceCid, resultCid, ipId, tokenId, txHash }
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

// Safety check
const SAFETY_CHECK_MODEL = "google/gemini-3-flash-preview";

// fal.ai Klein 9B
const FAL_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/9b/edit";
const FAL_ANIME_PROMPT =
  "Convert this photo into a high-quality anime illustration style. " +
  "Maintain the composition, pose, and scene but render everything in anime art style. " +
  "All faces must be fully anonymized into anime characters — no photorealistic features.";

// Filebase IPFS gateway
const IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs";

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
// AES-256-GCM ENCRYPTION (for original photo)
// ============================================================

async function encryptAesGcm(data) {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  const rawKey = await crypto.subtle.exportKey("raw", key);
  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
    rawKey: new Uint8Array(rawKey),
  };
}

// ============================================================
// IMAGE FETCH + VALIDATE
// ============================================================

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB (photos can be larger than avatars)

// URL domain allowlist (only accept signed upload URLs from our own infra)
const ALLOWED_URL_DOMAINS = [
  "heaven.myfilebase.com",
  "s3.filebase.com",
  "storage.googleapis.com",
  "localhost",
];

function isAllowedUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return ALLOWED_URL_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

async function fetchAndValidate(urlOrInline) {
  if (typeof urlOrInline === "object" && urlOrInline.base64 && urlOrInline.contentType) {
    const binaryStr = atob(urlOrInline.base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    if (bytes.byteLength > MAX_IMAGE_BYTES)
      throw new Error(`File too large: ${bytes.byteLength} bytes (max: ${MAX_IMAGE_BYTES})`);

    const mimeBase = urlOrInline.contentType.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.includes(mimeBase))
      throw new Error(`Invalid content type: ${mimeBase}`);

    return { data: bytes, contentType: mimeBase, byteLength: bytes.byteLength };
  }

  const url = urlOrInline;
  if (!url.startsWith("https://"))
    throw new Error(`Disallowed URL scheme: ${String(url).slice(0, 30)}...`);
  if (!isAllowedUrl(url))
    throw new Error(`URL domain not in allowlist: ${new URL(url).hostname}`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  const mimeBase = contentType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mimeBase))
    throw new Error(`Invalid content type: ${mimeBase}`);

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES)
    throw new Error(`File too large: ${buffer.byteLength} bytes`);

  return { data: new Uint8Array(buffer), contentType: mimeBase, byteLength: buffer.byteLength };
}

function uint8ToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ============================================================
// CONTENT SAFETY CHECK (OpenRouter Vision)
// ============================================================

/**
 * Analyzes image and/or text for content safety.
 * @param openRouterKey - OpenRouter API key
 * @param imageBase64 - Base64 image (optional for text-only posts)
 * @param contentType - MIME type of image (optional)
 * @param caption - Post caption/text (optional)
 * @returns { safe: boolean, hasFace: boolean, isAnime: boolean, isAdult: boolean, reason?: string }
 */
async function contentSafetyCheck(openRouterKey, imageBase64, contentType, caption) {
  const hasImage = !!imageBase64;
  const hasText = !!caption && caption.trim().length > 0;

  if (!hasImage && !hasText) {
    return { safe: true, hasFace: false, isAnime: false, isAdult: false };
  }

  // Build prompt based on what content we have
  const contentParts = [];

  let promptText = `Analyze this ${hasImage && hasText ? "image AND caption" : hasImage ? "image" : "text"} for content safety. ` +
    "Respond with ONLY a JSON object, no markdown, no explanation.\n\n" +
    "RULES:\n" +
    "- safe=false: CSAM, graphic violence, gore, personal documents, hate symbols, illegal content\n" +
    "- hasFace=true: realistic human face/body visible (for images only)\n" +
    "- isAnime=true: anime/cartoon/illustration style (for images only)\n" +
    "- isAdult=true: ANY of these in image OR text:\n" +
    "  • Sexual/suggestive content, nudity, lingerie, provocative poses\n" +
    "  • Heavy profanity, vulgar language, explicit descriptions\n" +
    "  • Drug use references, graphic violence descriptions\n" +
    "  • Sexually charged comments, innuendo, flirting\n" +
    "- reason: brief explanation (required if safe=false)\n\n" +
    "EXAMPLES:\n" +
    'Photo of person at beach: {"safe":true,"hasFace":true,"isAnime":false,"isAdult":false}\n' +
    'Bikini selfie: {"safe":true,"hasFace":true,"isAnime":false,"isAdult":true}\n' +
    'Anime drawing: {"safe":true,"hasFace":false,"isAnime":true,"isAdult":false}\n' +
    'Text "damn this party is wild af 🔥": {"safe":true,"hasFace":false,"isAnime":false,"isAdult":true}\n' +
    'Text "beautiful sunset today": {"safe":true,"hasFace":false,"isAnime":false,"isAdult":false}\n' +
    'Landscape photo + suggestive caption: {"safe":true,"hasFace":false,"isAnime":false,"isAdult":true}\n';

  if (hasText) {
    promptText += `\nCAPTION TO ANALYZE: "${caption}"`;
  }

  contentParts.push({ type: "text", text: promptText });

  if (hasImage) {
    contentParts.push({
      type: "image_url",
      image_url: { url: `data:${contentType};base64,${imageBase64}` },
    });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SAFETY_CHECK_MODEL,
      messages: [{ role: "user", content: contentParts }],
      temperature: 0,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Safety check failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  const answer = (result.choices?.[0]?.message?.content || "").trim();

  try {
    // Extract JSON from response (may have markdown code fences)
    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: if we can't parse, reject to be safe
    return { safe: false, hasFace: false, reason: `Unparseable safety response: ${answer.slice(0, 100)}` };
  }
}

// ============================================================
// FAL.AI KLEIN 9B — ANIME CONVERSION
// ============================================================

async function convertToAnime(falApiKey, imageBase64, contentType) {
  const response = await fetch(FAL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${falApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_urls: [`data:${contentType};base64,${imageBase64}`],
      prompt: FAL_ANIME_PROMPT,
      guidance_scale: 7.5,
      num_inference_steps: 8,
      strength: 0.75,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`fal.ai Klein 9B failed: ${response.status} ${text}`);
  }

  const result = await response.json();

  // fal.ai returns { images: [{ url, content_type }] }
  const outputUrl = result.images?.[0]?.url;
  if (!outputUrl) throw new Error("No output image from fal.ai");

  // Download the result image
  const imgResponse = await fetch(outputUrl);
  if (!imgResponse.ok) throw new Error(`Failed to download fal.ai result: ${imgResponse.status}`);

  const buffer = await imgResponse.arrayBuffer();
  const outputContentType = result.images[0].content_type || "image/jpeg";

  return {
    data: new Uint8Array(buffer),
    contentType: outputContentType,
    byteLength: buffer.byteLength,
  };
}

// ============================================================
// EXIF STRIPPING (minimal — zero out EXIF/XMP/IPTC markers in JPEG)
// ============================================================

function stripExifJpeg(data) {
  // JPEG: starts with FF D8. APP1 (EXIF) = FF E1, APP13 (IPTC) = FF ED, XMP in APP1.
  // Simple approach: copy SOI, skip all APPn markers (FF E0-EF), keep rest.
  if (data[0] !== 0xff || data[1] !== 0xd8) return data; // not JPEG

  const out = [0xff, 0xd8];
  let i = 2;
  while (i < data.length - 1) {
    if (data[i] !== 0xff) {
      // Copy remaining (image data)
      out.push(...data.slice(i));
      break;
    }
    const marker = data[i + 1];
    // APPn markers: 0xE0 - 0xEF (includes EXIF, XMP, IPTC, ICC)
    // We keep APP0 (JFIF, 0xE0) for basic compatibility but strip the rest
    if (marker >= 0xe1 && marker <= 0xef) {
      // Skip this marker segment
      const segLen = (data[i + 2] << 8) | data[i + 3];
      i += 2 + segLen;
    } else if (marker === 0xe0) {
      // Keep APP0 (JFIF)
      const segLen = (data[i + 2] << 8) | data[i + 3];
      out.push(...data.slice(i, i + 2 + segLen));
      i += 2 + segLen;
    } else {
      // Non-APPn marker — copy rest of file
      out.push(...data.slice(i));
      break;
    }
  }
  return new Uint8Array(out);
}

function stripExif(data, contentType) {
  if (contentType === "image/jpeg") return stripExifJpeg(data);
  // PNG/WebP: no standard EXIF stripping needed for v1
  // (PNG tEXt chunks and WebP EXIF are rare in user photos)
  return data;
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
      imageUrl,
      title,
      timestamp,
      nonce,
      filebaseEncryptedKey,
      filebasePlaintextKey,
      openrouterEncryptedKey,
      openrouterPlaintextKey,
      falEncryptedKey,
      falPlaintextKey,
      description = "",
      rightsMode = 0,
      parentIpId,
      licenseEnabled = false,
      commercialRevShare = 10,
      skipSafetyCheck = false,
      dryRun = false,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(imageUrl, "imageUrl");
    must(title, "title");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

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
    // STEP 2: Fetch image + compute hash
    // ========================================
    const image = await fetchAndValidate(imageUrl);
    const imageHash = await sha256HexFromBuffer(image.data);

    // ========================================
    // STEP 3: Sign binding message with user PKP
    // Auth: Lit session proves PKP ownership. This signature creates
    // an on-chain-verifiable proof binding user to this specific post.
    // ========================================
    const message = `heaven:post:${imageHash}:${timestamp}:${nonce}`;
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
    const signature = ethers.utils.joinSignature({
      r: `0x${strip0x(sigObj.r)}`,
      s: `0x${strip0x(sigObj.s)}`,
      v: userV,
    });

    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase())
      throw new Error("Signature mismatch");

    // ========================================
    // STEP 4: Decrypt API keys
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
    const openRouterKey = skipSafetyCheck
      ? null
      : await decryptKey(openrouterEncryptedKey, openrouterPlaintextKey, "openrouterKey");

    // Always decrypt fal.ai key — mode is auto-detected after safety check
    let falApiKey = null;
    if (falEncryptedKey || falPlaintextKey) {
      falApiKey = await decryptKey(falEncryptedKey, falPlaintextKey, "falKey");
    }

    // ========================================
    // STEP 5: Content safety check (~2-3s)
    // ========================================
    let imageBase64;
    if (typeof imageUrl === "object" && imageUrl.base64) {
      imageBase64 = imageUrl.base64;
    } else {
      imageBase64 = uint8ToBase64(image.data);
    }

    // Auto-detect mode based on safety check classification
    let mode = "direct"; // default
    let isAdult = false;

    if (!skipSafetyCheck) {
      // Combine title + description as caption for safety check
      const caption = description ? `${title}\n${description}` : title;

      const safetyResult = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "safetyCheck" },
        async () => {
          const result = await contentSafetyCheck(openRouterKey, imageBase64, image.contentType, caption);
          return JSON.stringify(result);
        }
      );

      const safety = parseRunOnce(safetyResult, "Safety check");

      if (!safety.safe) {
        throw new Error(
          `Content rejected: ${safety.reason || "violates content policy"}. ` +
          "Images with nudity, violence, CSAM, or personal documents are not allowed."
        );
      }

      // Auto-detect mode:
      // - Already anime/illustration → direct (no conversion needed)
      // - Real photo with face → ai (anime conversion to anonymize)
      // - Real photo without face → direct (safe as-is)
      if (!safety.isAnime && safety.hasFace) {
        mode = "ai";
        if (!falApiKey) {
          throw new Error(
            "Photo contains a recognizable face and requires anime conversion, " +
            "but no fal.ai API key was provided."
          );
        }
      }

      // Capture 18+ classification
      isAdult = !!safety.isAdult;
    }

    // ========================================
    // STEP 6: AI anime conversion (if mode=ai, ~4s)
    // ========================================
    let resultImage;
    if (mode === "ai") {
      resultImage = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "animeConvert" },
        async () => {
          const result = await convertToAnime(falApiKey, imageBase64, image.contentType);
          // Return as base64 since runOnce must return string
          return JSON.stringify({
            base64: uint8ToBase64(result.data),
            contentType: result.contentType,
            byteLength: result.byteLength,
          });
        }
      );

      const parsed = parseRunOnce(resultImage, "Anime conversion");
      const binaryStr = atob(parsed.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      resultImage = { data: bytes, contentType: parsed.contentType, byteLength: parsed.byteLength };

      // Sanity check: result must differ from source
      const resultHash = await sha256HexFromBuffer(resultImage.data);
      if (resultHash === imageHash) {
        throw new Error("AI conversion produced identical output — fal.ai may have passed through the original");
      }
    } else {
      // Direct mode: the photo IS the result (already passed face check)
      resultImage = image;
    }

    // ========================================
    // STEP 7: Strip EXIF metadata
    // ========================================
    const strippedOriginal = stripExif(image.data, image.contentType);
    const strippedResult = stripExif(resultImage.data, resultImage.contentType);

    // ========================================
    // STEP 8: Encrypt original + upload to Filebase
    // ========================================
    const prefix = `${userAddress.slice(2, 10)}-${timestamp}`;
    const ext = image.contentType.split("/")[1] || "jpg";
    const resultExt = resultImage.contentType.split("/")[1] || "jpg";

    // Encrypt original photo (AES-256-GCM) — only ciphertext goes to IPFS
    const encrypted = await encryptAesGcm(strippedOriginal);

    // Prepend IV (12 bytes) to ciphertext for self-contained decryption
    const encryptedBlob = new Uint8Array(encrypted.iv.length + encrypted.ciphertext.length);
    encryptedBlob.set(encrypted.iv, 0);
    encryptedBlob.set(encrypted.ciphertext, encrypted.iv.length);

    const uploadResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "uploadFiles" },
      async () => {
        // Upload encrypted original (ciphertext, not raw bytes)
        const sourceCid = await uploadToFilebase(
          filebaseKey,
          encryptedBlob,
          "application/octet-stream",
          `post-source-${prefix}.enc`
        );

        // Upload public result (anime output or direct photo)
        const resultCid = await uploadToFilebase(
          filebaseKey,
          strippedResult,
          resultImage.contentType,
          `post-result-${prefix}.${resultExt}`
        );

        return JSON.stringify({ sourceCid, resultCid });
      }
    );

    const { sourceCid, resultCid } = parseRunOnce(uploadResult, "File upload");

    // Return the AES key hex — client must seal it with Lit access conditions
    // via LitNodeClient.encrypt() (cannot encrypt inside Lit Action).
    // The key is only returned to the authenticated user's client.
    const sourceDecryptionKey = bytesToHex(encrypted.rawKey);

    // ========================================
    // STEP 9: Build + upload metadata
    // ========================================
    const ipaMetadata = {
      title,
      description,
      createdAt: new Date(Number(timestamp)).toISOString(),
      creator: userAddress,
      mediaUrl: `${IPFS_GATEWAY}/${resultCid}`,
      mediaType: resultImage.contentType,
      sourceCid: mode === "ai" ? sourceCid : undefined,
      sourceContentType: mode === "ai" ? image.contentType : undefined,
      sourceEncrypted: mode === "ai" ? true : undefined,
      mode,
      isAdult,
      rightsMode: rm,
      parentIpId: parentIpId || undefined,
      appId: "heaven",
    };

    const nftMetadata = {
      name: title,
      description: description || `Photo post by ${userAddress.slice(0, 10)}...`,
      image: `${IPFS_GATEWAY}/${resultCid}`,
      external_url: `https://heaven.love`,
      attributes: [
        { trait_type: "Mode", value: mode },
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

    // ========================================
    // STEP 10: Register on Story Protocol
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
          version: "post-create-v1",
          sourceCid,
          resultCid,
          ipaCid,
          nftCid,
          sourceDecryptionKey: mode === "ai" ? sourceDecryptionKey : undefined,
          signedTx,
          user: userAddress,
          mode,
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

    // Normalize ipId (address) to bytes32 for EngagementV1 compatibility
    // bytes32(uint256(uint160(address)))
    const ipIdAddress = postQuery.ipId;
    const ipIdBytes32 = ethers.utils.hexZeroPad(ipIdAddress, 32);

    // ========================================
    // STEP 11: Mirror post on MegaETH (PostsV1)
    // ========================================
    let megaTxHash = null;
    try {
      const postsIface = new ethers.utils.Interface(POSTS_V1_ABI);
      const megaCalldata = postsIface.encodeFunctionData("postFor", [
        ethers.utils.getAddress(userAddress),
        ipIdBytes32,
        1, // TYPE_PHOTO
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
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "post-create-v1",
        txHash: broadcast.txHash,
        blockNumber: broadcast.blockNumber,
        ipId: ipIdAddress,
        ipIdBytes32,
        tokenId,
        sourceCid,
        resultCid,
        ipaCid,
        nftCid,
        sourceDecryptionKey: mode === "ai" ? sourceDecryptionKey : undefined,
        user: userAddress,
        mode,
        isAdult,
        rightsMode: rm,
        licenseEnabled,
        megaTxHash,
      }),
    });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "post-create-v1",
        error: e?.message || String(e),
      }),
    });
  }
};

main();
