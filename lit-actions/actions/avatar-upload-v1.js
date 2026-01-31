/**
 * Avatar Upload v1
 *
 * Uploads a profile avatar image to Filebase IPFS.
 * Validates user signature to prevent unauthorized uploads.
 *
 * Flow:
 * 1. Receive image content (base64 or URL) from client
 * 2. Fetch content, compute SHA-256 hash
 * 3. Verify user signature over content hash (prevents replay)
 * 4. Decrypt Filebase API key (runOnce - only one node does external IO)
 * 5. Upload image to Filebase IPFS
 * 6. Return CID
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - imageUrl: Temporary URL or inline { base64, contentType } for the avatar image
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - filebaseEncryptedKey: Lit-encrypted Filebase credentials
 * - openrouterEncryptedKey: Lit-encrypted OpenRouter API key (for image style check)
 * Action signs the message internally using the user's PKP (single executeJs).
 *
 * Optional jsParams:
 * - filebasePlaintextKey: Dev override for Filebase key (skip decryption)
 * - openrouterPlaintextKey: Dev override for OpenRouter key (skip decryption)
 * - skipStyleCheck: boolean (default false) — skip anime/stylized enforcement
 *
 * Returns: { success: true, avatarCID, imageHash }
 */

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
  if (!accessKey || !secretKey || !bucket) {
    throw new Error("Invalid Filebase API key format");
  }

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
    [`host:${endpoint}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join("\n") + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");

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
  if (!cid) {
    throw new Error("No CID returned from Filebase");
  }

  return cid;
}

// ============================================================
// IMAGE STYLE CHECK (OpenRouter Vision)
// ============================================================

const STYLE_CHECK_MODEL = "google/gemini-3-flash-preview";

/**
 * Returns true if the image is a realistic human photo (should be rejected).
 */
async function isRealisticPhoto(openRouterKey, imageBase64, contentType) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: STYLE_CHECK_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Is this a realistic photo of a human or their face that could be used for facial recognition? Respond with nothing else other than "yes" or "no".',
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${contentType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 10,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter style check failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  const answer = (result.choices?.[0]?.message?.content || "").trim().toLowerCase();
  return answer.startsWith("yes");
}

// ============================================================
// FETCH + VALIDATE
// ============================================================

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

async function fetchAndValidate(urlOrInline) {
  // Inline base64 content (for testing / Lit node compatibility)
  if (typeof urlOrInline === "object" && urlOrInline.base64 && urlOrInline.contentType) {
    const binaryStr = atob(urlOrInline.base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`File too large: ${bytes.byteLength} bytes (max: ${MAX_IMAGE_BYTES})`);
    }

    const mimeBase = urlOrInline.contentType.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.includes(mimeBase)) {
      throw new Error(`Invalid content type: ${mimeBase} (expected: ${ALLOWED_IMAGE_TYPES.join(", ")})`);
    }

    return { data: bytes, contentType: mimeBase, byteLength: bytes.byteLength };
  }

  const url = urlOrInline;

  if (!url.startsWith("https://")) {
    throw new Error(`Disallowed URL scheme (use https:// or inline base64): ${String(url).slice(0, 30)}...`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${url.slice(0, 60)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const mimeBase = contentType.split(";")[0].trim().toLowerCase();

  if (!ALLOWED_IMAGE_TYPES.includes(mimeBase)) {
    throw new Error(`Invalid content type: ${mimeBase} (expected: ${ALLOWED_IMAGE_TYPES.join(", ")})`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`File too large: ${buffer.byteLength} bytes (max: ${MAX_IMAGE_BYTES})`);
  }

  return { data: new Uint8Array(buffer), contentType: mimeBase, byteLength: buffer.byteLength };
}

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      imageUrl,
      timestamp,
      nonce,
      filebaseEncryptedKey,
      filebasePlaintextKey, // dev override
      openrouterEncryptedKey,
      openrouterPlaintextKey, // dev override
      skipStyleCheck = false,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(imageUrl, "imageUrl");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);

    // ========================================
    // STEP 1: Validate request freshness
    // ========================================
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    // ========================================
    // STEP 2: Fetch image + compute hash
    // ========================================
    const image = await fetchAndValidate(imageUrl);
    const imageHash = await sha256HexFromBuffer(image.data);

    // ========================================
    // STEP 3: Sign or verify signature over content hash
    // ========================================
    const message = `heaven:avatar:${imageHash}:${timestamp}:${nonce}`;

    const msgHash = ethers.utils.hashMessage(message);
    const sigResult = await Lit.Actions.signAndCombineEcdsa({
      toSign: Array.from(ethers.utils.arrayify(msgHash)),
      publicKey: userPkpPublicKey,
      sigName: "user_avatar_sig",
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
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Invalid signature: recovered address does not match user PKP");
    }

    // ========================================
    // STEP 4: Style check — reject realistic photos
    // ========================================
    if (!skipStyleCheck) {
      let openRouterKey;
      if (openrouterPlaintextKey) {
        openRouterKey = openrouterPlaintextKey;
      } else if (openrouterEncryptedKey) {
        openRouterKey = await Lit.Actions.decryptAndCombine({
          accessControlConditions: openrouterEncryptedKey.accessControlConditions,
          ciphertext: openrouterEncryptedKey.ciphertext,
          dataToEncryptHash: openrouterEncryptedKey.dataToEncryptHash,
          authSig: null,
          chain: "ethereum",
        });
      } else {
        throw new Error("openrouterEncryptedKey or openrouterPlaintextKey is required for style check");
      }

      // Convert image bytes to base64 for vision API
      let imageBase64;
      if (typeof imageUrl === "object" && imageUrl.base64) {
        imageBase64 = imageUrl.base64;
      } else {
        // Convert Uint8Array to base64
        let binary = "";
        for (let i = 0; i < image.data.length; i++) {
          binary += String.fromCharCode(image.data[i]);
        }
        imageBase64 = btoa(binary);
      }

      const styleResult = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "checkStyle" },
        async () => {
          const rejected = await isRealisticPhoto(openRouterKey, imageBase64, image.contentType);
          return JSON.stringify({ rejected });
        }
      );

      const { rejected } = JSON.parse(styleResult);
      if (rejected) {
        throw new Error(
          "Image rejected: realistic photos of humans are not allowed. " +
          "Please use an anime, cartoon, or illustrated avatar."
        );
      }
    }

    // ========================================
    // STEP 5: Decrypt Filebase key
    // ========================================
    let filebaseKey;
    if (filebasePlaintextKey) {
      filebaseKey = filebasePlaintextKey;
    } else if (filebaseEncryptedKey) {
      filebaseKey = await Lit.Actions.decryptAndCombine({
        accessControlConditions: filebaseEncryptedKey.accessControlConditions,
        ciphertext: filebaseEncryptedKey.ciphertext,
        dataToEncryptHash: filebaseEncryptedKey.dataToEncryptHash,
        authSig: null,
        chain: "ethereum",
      });
    } else {
      throw new Error("filebaseEncryptedKey or filebasePlaintextKey is required");
    }

    // ========================================
    // STEP 6: Upload image (runOnce)
    // ========================================
    const prefix = `${userAddress.slice(2, 10)}-${timestamp}`;
    const ext = image.contentType.split("/")[1] || "jpg";

    const avatarCID = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "uploadAvatar" },
      async () => {
        return await uploadToFilebase(
          filebaseKey,
          image.data,
          image.contentType,
          `avatar-${prefix}.${ext}`
        );
      }
    );

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "avatar-upload-v1",
        user: userAddress,
        avatarCID,
        imageHash: `0x${imageHash}`,
      }),
    });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "avatar-upload-v1",
        error: e?.message || String(e),
      }),
    });
  }
};

main();
