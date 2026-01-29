/**
 * Lyrics Translate v1
 *
 * Batch-translate lyrics into multiple target languages in parallel.
 * Each translation is uploaded to IPFS as a JSON file.
 *
 * Designed to be called after song-publish (or anytime later) to add
 * additional language translations for a song's lyrics.
 *
 * Flow:
 * 1. Verify EIP-191 signature over lyrics hash + languages
 * 2. Decrypt 2 API keys (Filebase, OpenRouter)
 * 3. Translate lyrics into all target languages (parallel)
 * 4. Upload each translation JSON to Filebase IPFS
 * 5. Return map of { languageCode: CID }
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - lyricsText: Plain text lyrics (\n separated lines)
 * - sourceLanguage: e.g. "Japanese", "English"
 * - targetLanguages: Array of language codes, e.g. ["zh", "es", "ko"]
 * - signature: EIP-191 signature over content digest
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - filebaseEncryptedKey: Lit-encrypted Filebase credentials
 * - openrouterEncryptedKey: Lit-encrypted OpenRouter API key
 *
 * Optional jsParams:
 * - filebasePlaintextKey: Dev override
 * - openrouterPlaintextKey: Dev override
 * - translationModel: Override LLM model (default: google/gemini-2.5-flash-lite-preview-09-2025)
 *
 * Returns: { success, version, user, translations: { [langCode]: { cid, text } }, errors: { [langCode]: string } }
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

  const payloadHash = await sha256Hex(content);

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
// DECRYPT HELPER
// ============================================================

async function decryptKey(encryptedKey, plaintextKey) {
  if (plaintextKey) return plaintextKey;
  if (!encryptedKey) return null;
  return Lit.Actions.decryptAndCombine({
    accessControlConditions: encryptedKey.accessControlConditions,
    ciphertext: encryptedKey.ciphertext,
    dataToEncryptHash: encryptedKey.dataToEncryptHash,
    authSig: null,
    chain: "ethereum",
  });
}

// ============================================================
// TRANSLATE HELPER
// ============================================================

async function translateLyrics(openRouterKey, model, lyricsText, sourceLanguage, targetLanguage) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: `Translate these song lyrics from ${sourceLanguage} to ${targetLanguage}.\nMaintain line breaks. Output only the translation, nothing else.\n\n${lyricsText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${errText}`);
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("No translation returned from LLM");
  }

  return text;
}

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      lyricsText,
      sourceLanguage,
      targetLanguages,
      signature,
      timestamp,
      nonce,
      filebaseEncryptedKey,
      filebasePlaintextKey,
      openrouterEncryptedKey,
      openrouterPlaintextKey,
      translationModel,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(lyricsText, "lyricsText");
    must(sourceLanguage, "sourceLanguage");
    must(targetLanguages, "targetLanguages");
    must(signature, "signature");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      throw new Error("targetLanguages must be a non-empty array");
    }
    if (targetLanguages.length > 10) {
      throw new Error("Maximum 10 target languages per call");
    }

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    const model = translationModel || "google/gemini-2.5-flash-lite-preview-09-2025";

    // ========================================
    // STEP 1: Validate request freshness
    // ========================================
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    // ========================================
    // STEP 2: Verify signature
    // ========================================
    const lyricsHash = await sha256Hex(lyricsText);
    const langsStr = targetLanguages.sort().join(",");
    const message = `heaven:translate:${lyricsHash}:${sourceLanguage}:${langsStr}:${timestamp}:${nonce}`;
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Invalid signature: recovered address does not match user PKP");
    }

    // ========================================
    // STEP 3: Decrypt keys
    // ========================================
    const filebaseKey = await decryptKey(filebaseEncryptedKey, filebasePlaintextKey);
    if (!filebaseKey) throw new Error("filebaseEncryptedKey or filebasePlaintextKey is required");

    const openRouterKey = await decryptKey(openrouterEncryptedKey, openrouterPlaintextKey);
    if (!openRouterKey) throw new Error("openrouterEncryptedKey or openrouterPlaintextKey is required");

    // ========================================
    // STEP 4: Translate + upload (all in runOnce)
    // ========================================
    const prefix = `${userAddress.slice(2, 10)}-${timestamp}`;

    const resultJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "lyricsTranslate" },
      async () => {
        const translations = {};
        const errors = {};

        // Translate all languages in parallel
        const results = await Promise.allSettled(
          targetLanguages.map(async (lang) => {
            const text = await translateLyrics(openRouterKey, model, lyricsText, sourceLanguage, lang);
            const translation = { languageCode: lang, sourceLanguage, text, model };
            const cid = await uploadToFilebase(
              filebaseKey,
              JSON.stringify(translation),
              "application/json",
              `translation-${lang}-${prefix}.json`
            );
            return { lang, cid, text };
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled") {
            translations[r.value.lang] = { cid: r.value.cid, text: r.value.text };
          } else {
            const lang = targetLanguages[results.indexOf(r)];
            errors[lang] = r.reason?.message || String(r.reason);
          }
        }

        return JSON.stringify({ translations, errors });
      }
    );

    const parsed = JSON.parse(resultJson);

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "lyrics-translate-v1",
        user: userAddress,
        translations: parsed.translations,
        errors: parsed.errors,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "lyrics-translate-v1",
        error: err?.message || String(err),
      }),
    });
  }
};

main();
