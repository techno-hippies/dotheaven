/**
 * Post Translate v1
 *
 * Translate a post's text into a target language via LLM, then write the
 * translation on-chain via EngagementV2.translateFor() on MegaETH.
 *
 * The translation is stored as an event (TranslationAdded) — no storage cost,
 * indexed by the subgraph so all users see it once created.
 *
 * Flow:
 * 1. Verify EIP-191 signature over post text hash + target language
 * 2. Decrypt OpenRouter API key
 * 3. Translate text via LLM (runOnce)
 * 4. Sponsor PKP signs + broadcasts EngagementV2.translateFor() on MegaETH
 * 5. Return translated text + txHash
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - postId: bytes32 hex string (EngagementV2 post key)
 * - originalText: The post text to translate
 * - sourceLang: Source language name, e.g. "English", "Japanese"
 * - targetLang: Target ISO 639-1 code, e.g. "ja", "es", "fr"
 * - targetLangName: Target language name, e.g. "Japanese", "Spanish"
 * - signature: EIP-191 signature over content digest
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - openrouterEncryptedKey: Lit-encrypted OpenRouter API key
 *
 * Optional jsParams:
 * - openrouterPlaintextKey: Dev override
 * - translationModel: Override LLM model (default: google/gemini-2.5-flash-lite-preview-09-2025)
 * - dryRun: boolean (default false) — skip broadcast
 *
 * Returns: { success, version, user, postId, langCode, translatedText, txHash }
 */

// ── Constants ──────────────────────────────────────────────────────────

const MEGA_CHAIN_ID = 6343;
const MEGA_RPC_URL = "https://carrot.megaeth.com/rpc";
const MEGA_GAS_PRICE = "1000000";
const MEGA_GAS_LIMIT = "2000000";
const ENGAGEMENT_V2 = "0xAF769d204e51b64D282083Eb0493F6f37cd93138";

const SPONSOR_PKP_PUBLIC_KEY =
  "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const SPONSOR_PKP_ADDRESS = "0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455";

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite-preview-09-2025";

let ethersLib = globalThis.ethers;
if (!ethersLib) ethersLib = require("ethers");
const ethers = ethersLib;

// ── Helpers ────────────────────────────────────────────────────────────

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

const parseRunOnce = (result, stepName) => {
  const s = String(result || "").trim();
  if (s.startsWith("[ERROR]") || s.includes("[ERROR]"))
    throw new Error(`${stepName} failed: ${s.slice(0, 300)}`);
  return JSON.parse(s);
};

async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Decrypt Helper ─────────────────────────────────────────────────────

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

// ── Translate Helper ───────────────────────────────────────────────────

async function translateText(openRouterKey, model, text, sourceLang, targetLangName) {
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
          content:
            `Translate the following social media post from ${sourceLang} to ${targetLangName}.\n` +
            `Preserve tone, emojis, and formatting. Output only the translation, nothing else.\n\n` +
            text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${errText}`);
  }

  const result = await response.json();
  const translated = result.choices?.[0]?.message?.content;
  if (!translated) {
    throw new Error("No translation returned from LLM");
  }

  return translated.trim();
}

// ── ABI ────────────────────────────────────────────────────────────────

const ENGAGEMENT_V2_ABI = [
  "function translateFor(address translator, bytes32 postId, bytes2 langCode, string text) external",
];

// ── Main ───────────────────────────────────────────────────────────────

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      postId,
      originalText,
      sourceLang,
      targetLang,
      targetLangName,
      signature,
      timestamp,
      nonce,
      openrouterEncryptedKey,
      openrouterPlaintextKey,
      translationModel,
      dryRun = false,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(postId, "postId");
    must(originalText, "originalText");
    must(sourceLang, "sourceLang");
    must(targetLang, "targetLang");
    must(targetLangName, "targetLangName");
    must(signature, "signature");
    must(timestamp, "timestamp");
    must(nonce, "nonce");

    if (typeof targetLang !== "string" || targetLang.length !== 2) {
      throw new Error("targetLang must be a 2-character ISO 639-1 code");
    }

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    const model = translationModel || DEFAULT_MODEL;

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
    const textHash = await sha256Hex(originalText);
    const message = `heaven:translate-post:${postId}:${textHash}:${targetLang}:${timestamp}:${nonce}`;
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Invalid signature: recovered address does not match user PKP");
    }

    // ========================================
    // STEP 3: Decrypt OpenRouter key
    // ========================================
    const openRouterKey = await decryptKey(openrouterEncryptedKey, openrouterPlaintextKey);
    if (!openRouterKey) throw new Error("openrouterEncryptedKey or openrouterPlaintextKey is required");

    // ========================================
    // STEP 4: Translate (runOnce)
    // ========================================
    const translationResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "postTranslate" },
      async () => {
        const text = await translateText(openRouterKey, model, originalText, sourceLang, targetLangName);
        return JSON.stringify({ text });
      }
    );

    const { text: translatedText } = parseRunOnce(translationResult, "Translation");

    if (!translatedText || translatedText.length === 0) {
      throw new Error("Translation produced empty result");
    }
    if (new TextEncoder().encode(translatedText).length > 5000) {
      throw new Error("Translation exceeds 5000 byte limit");
    }

    // ========================================
    // STEP 5: Build + broadcast EngagementV2.translateFor() on MegaETH
    // ========================================
    const iface = new ethers.utils.Interface(ENGAGEMENT_V2_ABI);

    // bytes2 langCode: encode 2-char ISO code as bytes2
    const langCodeHex = "0x" + targetLang.charCodeAt(0).toString(16).padStart(2, "0") + targetLang.charCodeAt(1).toString(16).padStart(2, "0");

    const calldata = iface.encodeFunctionData("translateFor", [
      ethers.utils.getAddress(userAddress),
      postId,
      langCodeHex,
      translatedText,
    ]);

    if (dryRun) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          success: true,
          dryRun: true,
          version: "post-translate-v1",
          user: userAddress,
          postId,
          langCode: targetLang,
          translatedText,
        }),
      });
      return;
    }

    // Get nonce for sponsor PKP
    const txParamsJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "getTxParams" },
      async () => {
        const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
        const txNonce = await provider.getTransactionCount(SPONSOR_PKP_ADDRESS, "pending");
        return JSON.stringify({ nonce: txNonce.toString() });
      }
    );

    const txParams = parseRunOnce(txParamsJson, "TX params");

    const unsignedTx = {
      type: 0,
      chainId: MEGA_CHAIN_ID,
      nonce: toBigNumber(txParams.nonce, "nonce"),
      to: ENGAGEMENT_V2,
      data: calldata,
      gasLimit: toBigNumber(MEGA_GAS_LIMIT, "gasLimit"),
      gasPrice: toBigNumber(MEGA_GAS_PRICE, "gasPrice"),
      value: 0,
    };

    const txHashToSign = ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTx));

    let sigResult;
    try {
      sigResult = await Lit.Actions.signAndCombineEcdsa({
        toSign: Array.from(ethers.utils.arrayify(txHashToSign)),
        publicKey: SPONSOR_PKP_PUBLIC_KEY,
        sigName: "sponsorTranslateSig",
      });
    } catch (sigErr) {
      throw new Error(`Sponsor PKP signing failed: ${sigErr?.message || sigErr}`);
    }

    const sigStr = String(sigResult || "").trim();
    if (sigStr.startsWith("[ERROR]")) throw new Error(`Sponsor PKP signing failed: ${sigStr}`);

    const sigObj = JSON.parse(sigStr);
    let v = Number(sigObj.recid ?? sigObj.recoveryId ?? sigObj.v);
    if (v === 0 || v === 1) v += 27;
    const sig = ethers.utils.joinSignature({
      r: `0x${strip0x(sigObj.r)}`,
      s: `0x${strip0x(sigObj.s)}`,
      v,
    });

    const signedTx = ethers.utils.serializeTransaction(unsignedTx, sig);

    // Broadcast
    const broadcastResult = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "broadcastTx" },
      async () => {
        try {
          const provider = new ethers.providers.JsonRpcProvider(MEGA_RPC_URL);
          const txResp = await provider.sendTransaction(signedTx);
          const receipt = await txResp.wait(1);
          return JSON.stringify({
            txHash: receipt.transactionHash,
            status: receipt.status,
          });
        } catch (err) {
          return JSON.stringify({
            broadcastError: err?.reason || err?.message || String(err),
          });
        }
      }
    );

    const broadcast = parseRunOnce(broadcastResult, "TX broadcast");
    if (broadcast.broadcastError) {
      throw new Error(`TX broadcast failed: ${broadcast.broadcastError}`);
    }

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "post-translate-v1",
        user: userAddress,
        postId,
        langCode: targetLang,
        translatedText,
        txHash: broadcast.txHash,
      }),
    });
  } catch (err) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "post-translate-v1",
        error: err?.message || String(err),
      }),
    });
  }
};

main();
