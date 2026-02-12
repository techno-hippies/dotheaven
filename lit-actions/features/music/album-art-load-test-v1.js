/**
 * Album Art Load Test v1
 *
 * Test Lit Action for uploading album art to Load S3 agent (public/private).
 * Intended as a migration spike before replacing Filebase flows.
 *
 * Important: uses Lit.Actions.runOnce() so upload happens exactly once.
 *
 * Required jsParams:
 * - userPkpPublicKey: User PKP public key
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - coverImage OR coverUrl
 *   - coverImage: { base64: string, contentType: string }
 *   - coverUrl: https://... image URL
 * - loadAccEncryptedKey OR loadAccPlaintextKey
 *
 * Optional jsParams:
 * - mode: "private" | "public" (default: "private")
 * - bucketName: required for mode="private"
 * - folderName: optional for mode="private"
 * - dataitemName: optional for mode="private"
 * - signed: "true" | "false" (default: "false", private mode only)
 * - agentUrl: default "https://load-s3-agent.load.network"
 * - gatewayUrl: default "https://gateway.s3-node-1.load.network"
 *
 * Returns:
 * {
 *   success,
 *   version,
 *   user,
 *   mode,
 *   uploadId,
 *   gatewayUrl,
 *   contentType,
 *   byteLength,
 *   coverHash,
 *   payload
 * }
 */

let ethersLib = globalThis.ethers;
if (!ethersLib) ethersLib = require("ethers");
const ethers = ethersLib;

const VERSION = "album-art-load-test-v1";
const DEFAULT_AGENT_URL = "https://load-s3-agent.load.network";
const DEFAULT_GATEWAY_URL = "https://gateway.s3-node-1.load.network";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/gif"];
const MAX_COVER_BYTES = 10 * 1024 * 1024;

const must = (v, label) => {
  if (v === undefined || v === null) throw new Error(`${label} is required`);
  return v;
};

function normalizeContentType(v) {
  const type = String(v || "").split(";")[0].trim().toLowerCase();
  return type;
}

function decodeBase64ToBytes(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

async function sha256HexFromBuffer(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadCoverBytes(coverImage, coverUrl) {
  if (coverImage && coverImage.base64 && coverImage.contentType) {
    const contentType = normalizeContentType(coverImage.contentType);
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      throw new Error(`Invalid content type: ${contentType}`);
    }
    const bytes = decodeBase64ToBytes(coverImage.base64);
    if (bytes.byteLength > MAX_COVER_BYTES) {
      throw new Error(`Cover too large: ${bytes.byteLength} > ${MAX_COVER_BYTES}`);
    }
    return { bytes, contentType };
  }

  if (!coverUrl) throw new Error("coverImage or coverUrl is required");
  if (!String(coverUrl).startsWith("https://")) {
    throw new Error("coverUrl must use https://");
  }

  const resp = await fetch(String(coverUrl));
  if (!resp.ok) {
    throw new Error(`coverUrl fetch failed: ${resp.status}`);
  }
  const contentType = normalizeContentType(resp.headers.get("content-type") || "");
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    throw new Error(`Invalid content type from URL: ${contentType}`);
  }
  const buffer = await resp.arrayBuffer();
  if (buffer.byteLength > MAX_COVER_BYTES) {
    throw new Error(`Cover too large: ${buffer.byteLength} > ${MAX_COVER_BYTES}`);
  }
  return { bytes: new Uint8Array(buffer), contentType };
}

async function decryptLoadAccKey(loadAccEncryptedKey, loadAccPlaintextKey) {
  if (loadAccPlaintextKey) return String(loadAccPlaintextKey).trim();
  if (!loadAccEncryptedKey) return null;
  const decrypted = await Lit.Actions.decryptAndCombine({
    accessControlConditions: loadAccEncryptedKey.accessControlConditions,
    ciphertext: loadAccEncryptedKey.ciphertext,
    dataToEncryptHash: loadAccEncryptedKey.dataToEncryptHash,
    authSig: null,
    chain: "ethereum",
  });
  return String(decrypted || "").trim();
}

function extractUploadId(payload) {
  const candidate =
    payload?.id ||
    payload?.dataitem_id ||
    payload?.dataitemId ||
    payload?.result?.id ||
    payload?.result?.dataitem_id ||
    payload?.result?.dataitemId;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function sanitizeBase(url) {
  return String(url || "").replace(/\/+$/, "");
}

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      coverImage,
      coverUrl,
      mode: modeRaw,
      bucketName,
      folderName,
      dataitemName,
      signed,
      timestamp,
      nonce,
      loadAccEncryptedKey,
      loadAccPlaintextKey,
      agentUrl,
      gatewayUrl,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    const mode = String(modeRaw || "private").toLowerCase();
    if (mode !== "private" && mode !== "public") {
      throw new Error(`Invalid mode: ${mode}`);
    }
    if (mode === "private") must(bucketName, "bucketName");

    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    const cover = await loadCoverBytes(coverImage, coverUrl);
    const coverHash = await sha256HexFromBuffer(cover.bytes);

    const message = `heaven:album-art-load:${mode}:${bucketName || ""}:${folderName || ""}:${dataitemName || ""}:${coverHash}:${timestamp}:${nonce}`;
    const msgHash = ethers.utils.hashMessage(message);
    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(msgHash)),
      publicKey: userPkpPublicKey,
      sigName: "user_album_art_load_sig",
    });

    if (typeof sigResult === "string" && sigResult.startsWith("[ERROR]")) {
      throw new Error(`User PKP signing failed: ${sigResult}`);
    }

    const sigObj = JSON.parse(sigResult);
    let userV = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
    if (userV === 0 || userV === 1) userV += 27;
    const signature = ethers.utils.joinSignature({
      r: `0x${String(sigObj.r).replace(/^0x/, "")}`,
      s: `0x${String(sigObj.s).replace(/^0x/, "")}`,
      v: userV,
    });
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`Sign mismatch: recovered ${recovered}, expected ${userAddress}`);
    }

    const loadAccKey = await decryptLoadAccKey(loadAccEncryptedKey, loadAccPlaintextKey);
    if (!loadAccKey) {
      throw new Error("loadAccEncryptedKey or loadAccPlaintextKey is required");
    }

    const uploadEndpoint = sanitizeBase(agentUrl || DEFAULT_AGENT_URL);
    const viewGateway = sanitizeBase(gatewayUrl || DEFAULT_GATEWAY_URL);

    const resultText = await Lit.Actions.runOnce(
      { name: "albumArtLoadUpload", waitForResponse: true },
      async () => {
        const uploadPath = mode === "private" ? "/upload/private" : "/upload";
        const form = new FormData();
        const extension = cover.contentType.split("/")[1] || "bin";
        const fileName = `${dataitemName || `album-art-${timestamp}`}.${extension}`;
        form.append("file", new Blob([cover.bytes], { type: cover.contentType }), fileName);
        form.append("content_type", cover.contentType);

        const headers = {
          Authorization: `Bearer ${loadAccKey}`,
        };

        if (mode === "private") {
          headers["x-bucket-name"] = String(bucketName);
          if (folderName) headers["x-folder-name"] = String(folderName);
          if (dataitemName) headers["x-dataitem-name"] = String(dataitemName);
          headers["signed"] = String(signed || "false");
        }

        const resp = await fetch(`${uploadEndpoint}${uploadPath}`, {
          method: "POST",
          headers,
          body: form,
        });

        const text = await resp.text();
        if (!resp.ok) {
          return JSON.stringify({
            _error: `Load upload failed: ${resp.status}`,
            status: resp.status,
            body: text,
          });
        }
        return text;
      }
    );

    if (typeof resultText === "string" && resultText.startsWith("[ERROR]")) {
      throw new Error(`runOnce failed: ${resultText}`);
    }

    let payload;
    try {
      payload = JSON.parse(resultText);
    } catch {
      payload = { raw: resultText };
    }

    if (payload?._error) {
      throw new Error(`${payload._error}${payload.body ? ` ${payload.body}` : ""}`);
    }

    const uploadId = extractUploadId(payload);
    const resolvedGatewayUrl = uploadId ? `${viewGateway}/resolve/${uploadId}` : null;

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: VERSION,
        user: userAddress.toLowerCase(),
        mode,
        uploadId,
        gatewayUrl: resolvedGatewayUrl,
        contentType: cover.contentType,
        byteLength: cover.bytes.byteLength,
        coverHash: `0x${coverHash}`,
        payload,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: VERSION,
        error: err?.message || String(err),
      }),
    });
  }
};

main();
