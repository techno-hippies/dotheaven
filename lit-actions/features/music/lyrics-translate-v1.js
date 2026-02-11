/**
 * Lyrics Translate v1
 *
 * Batch-translate lyrics into multiple target languages in parallel.
 * Each translation is uploaded to IPFS as a JSON file, then persisted
 * on-chain via LyricsEngagementV1.translateLyricsFor() on MegaETH.
 *
 * Designed to be called after song-publish (or anytime later) to add
 * additional language translations for a song's lyrics.
 *
 * Flow:
 * 1. Verify EIP-191 signature over ipId + lyrics hash + languages
 * 2. Decrypt 2 API keys (Filebase, OpenRouter)
 * 3. Translate lyrics into all target languages (parallel)
 * 4. Upload each translation JSON to Filebase IPFS
 * 5. Broadcast translateLyricsFor() for each translation via sponsor PKP
 * 6. Return map of { languageCode: { cid, text, txHash } }
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - ipId: Story Protocol IP Asset address (the song being translated)
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
 * Returns: { success, version, user, translations: { [langCode]: { cid, text, txHash } }, errors: { [langCode]: string } }
 */

let ethersLib = globalThis.ethers;
if (!ethersLib) ethersLib = require("ethers");
const ethers = ethersLib;

// ============================================================
// CONSTANTS
// ============================================================

const MEGA_RPC_URL = "https://carrot.megaeth.com/rpc";
const MEGA_CHAIN_ID = 6343;
const MEGA_GAS_PRICE = "1000000";
const MEGA_GAS_LIMIT = "500000";

const LYRICS_ENGAGEMENT_V1 = "0x6C832a6Cb9F360f81D697Bed66250Dc361386EB4";

const SPONSOR_PKP_PUBLIC_KEY =
  "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const SPONSOR_PKP_ADDRESS = "0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455";

const LYRICS_ENGAGEMENT_ABI = [
  "function translateLyricsFor(address translator, address ipId, bytes2 langCode, string cid, bytes32 textHash, uint32 byteLen)",
];

// ============================================================
// HELPERS
// ============================================================

const must = (v, label) => {
  if (v === undefined || v === null) throw new Error(`${label} is required`);
  return v;
};

const strip0x = (v) => (String(v || "").startsWith("0x") ? String(v).slice(2) : String(v));

const toBigNumber = (value, label) => {
  try {
    return ethers.BigNumber.from(value);
  } catch (e) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
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

async function sha256HexBytes(data) {
  const hash = await sha256Bytes(data);
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
// LANG CODE HELPER
// ============================================================

/**
 * Convert ISO 639-1 string to bytes2, e.g. "zh" -> "0x7a68"
 */
function langToBytes2(lang) {
  if (!lang || lang.length !== 2) throw new Error(`Invalid lang code: ${lang}`);
  const a = lang.charCodeAt(0);
  const b = lang.charCodeAt(1);
  return "0x" + a.toString(16).padStart(2, "0") + b.toString(16).padStart(2, "0");
}

// ============================================================
// ON-CHAIN BROADCAST HELPER
// ============================================================

const parseRunOnce = (result, stepName) => {
  if (!result) throw new Error(`${stepName}: runOnce returned null`);
  const parsed = typeof result === "string" ? JSON.parse(result) : result;
  if (parsed?.error) throw new Error(`${stepName}: ${parsed.error}`);
  return parsed;
};

/**
 * Broadcast a single translateLyricsFor() call via sponsor PKP.
 * Returns { txHash } or { broadcastError }.
 */
async function broadcastTranslation(translator, ipId, langCode, cid, textHash, byteLen, sigName) {
  const iface = new ethers.utils.Interface(LYRICS_ENGAGEMENT_ABI);
  const calldata = iface.encodeFunctionData("translateLyricsFor", [
    ethers.utils.getAddress(translator),
    ethers.utils.getAddress(ipId),
    langToBytes2(langCode),
    cid,
    textHash,
    byteLen,
  ]);

  // Get nonce
  const paramsJson = await Lit.Actions.runOnce(
    { waitForResponse: true, name: `getNonce_${langCode}` },
    async () => {
      const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
      const nonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
      return JSON.stringify({ nonce: nonce.toString() });
    }
  );
  const params = parseRunOnce(paramsJson, `nonce_${langCode}`);

  const unsignedTx = {
    type: 0,
    chainId: MEGA_CHAIN_ID,
    nonce: toBigNumber(params.nonce, "nonce"),
    to: LYRICS_ENGAGEMENT_V1,
    data: calldata,
    gasLimit: toBigNumber(MEGA_GAS_LIMIT, "gasLimit"),
    gasPrice: toBigNumber(MEGA_GAS_PRICE, "gasPrice"),
    value: 0,
  };

  const txHashToSign = ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTx));
  const sigResult = await Lit.Actions.signAndCombineEcdsa({
    toSign: Array.from(ethers.utils.arrayify(txHashToSign)),
    publicKey: SPONSOR_PKP_PUBLIC_KEY,
    sigName,
  });
  const sigStr = String(sigResult || "").trim();
  if (sigStr.startsWith("[ERROR]")) throw new Error(`Sponsor signing failed: ${sigStr}`);

  const sigObj = JSON.parse(sigStr);
  let v = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
  if (v === 0 || v === 1) v += 27;
  const sig = ethers.utils.joinSignature({
    r: `0x${strip0x(sigObj.r)}`,
    s: `0x${strip0x(sigObj.s)}`,
    v,
  });

  const signedTx = ethers.utils.serializeTransaction(unsignedTx, sig);

  const broadcastResult = await Lit.Actions.runOnce(
    { waitForResponse: true, name: `broadcast_${langCode}` },
    async () => {
      try {
        const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
        const txResp = await provider.sendTransaction(signedTx);
        const receipt = await txResp.wait(1);
        return JSON.stringify({ txHash: receipt.transactionHash, status: receipt.status });
      } catch (err) {
        return JSON.stringify({ broadcastError: err?.reason || err?.message || String(err) });
      }
    }
  );

  return parseRunOnce(broadcastResult, `broadcast_${langCode}`);
}

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      ipId,
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
    must(ipId, "ipId");
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

    // Validate ipId is a valid address
    const ipIdAddress = ethers.utils.getAddress(ipId);

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
    const message = `heaven:translate:${ipIdAddress}:${lyricsHash}:${sourceLanguage}:${langsStr}:${timestamp}:${nonce}`;
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
            // Compute textHash (SHA-256 of translated text bytes)
            const textBytes = new TextEncoder().encode(text);
            const textHash = "0x" + await sha256HexBytes(textBytes);
            const byteLen = textBytes.length;
            return { lang, cid, text, textHash, byteLen };
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled") {
            translations[r.value.lang] = {
              cid: r.value.cid,
              text: r.value.text,
              textHash: r.value.textHash,
              byteLen: r.value.byteLen,
            };
          } else {
            const lang = targetLanguages[results.indexOf(r)];
            errors[lang] = r.reason?.message || String(r.reason);
          }
        }

        return JSON.stringify({ translations, errors });
      }
    );

    const parsed = JSON.parse(resultJson);

    // ========================================
    // STEP 5: Broadcast on-chain (sequentially to avoid nonce conflicts)
    // ========================================
    const onchainResults = {};
    const langs = Object.keys(parsed.translations);

    for (let i = 0; i < langs.length; i++) {
      const lang = langs[i];
      const t = parsed.translations[lang];
      try {
        const result = await broadcastTranslation(
          userAddress,
          ipIdAddress,
          lang,
          t.cid,
          t.textHash,
          t.byteLen,
          `sponsorLyricsSig_${lang}`
        );
        if (result.broadcastError) {
          onchainResults[lang] = { error: result.broadcastError };
        } else {
          onchainResults[lang] = { txHash: result.txHash };
        }
      } catch (err) {
        onchainResults[lang] = { error: err?.message || String(err) };
      }
    }

    // Merge txHash into translations
    const finalTranslations = {};
    for (const lang of langs) {
      finalTranslations[lang] = {
        cid: parsed.translations[lang].cid,
        text: parsed.translations[lang].text,
        txHash: onchainResults[lang]?.txHash || null,
        onchainError: onchainResults[lang]?.error || null,
      };
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "lyrics-translate-v1",
        user: userAddress,
        ipId: ipIdAddress,
        translations: finalTranslations,
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
